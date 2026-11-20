import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { adminApp, adminDb } from './firebaseAdmin.ts';
import {
  canResubmit,
  evaluateCertificateEligibility,
  isLateSubmission,
  resolveCriteria,
  validateGrade,
} from '../src/lib/certificates.ts';
import {
  canJoin,
  DEFAULT_JOIN_WINDOW_MINUTES,
  safeHttpUrl,
  sessionPhase,
  validateAttendance,
  validateSessionInput,
  type StoredSessionStatus,
} from '../src/lib/sessions.ts';
import {
  isReviewDecision,
  planEnrollmentReview,
  validateEnrollmentSubmission,
} from '../src/lib/enrollmentPolicy.ts';
import {
  decideStudentSignIn,
  validateInstructorInvite,
  type ClaimRole,
} from '../src/lib/roles.ts';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '16kb' }));

const auth = getAuth(adminApp);
const REQUIRE_ADMIN_MFA = process.env.REQUIRE_ADMIN_MFA !== 'false';
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

type AuthedRequest = Request & { user: DecodedIdToken };

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'UNAUTHENTICATED' });
  try {
    // checkRevoked=true so disabled/revoked accounts lose access immediately.
    (req as AuthedRequest).user = await auth.verifyIdToken(token, true);
    next();
  } catch {
    res.status(401).json({ error: 'UNAUTHENTICATED' });
  }
}

function requireRole(role: ClaimRole) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as AuthedRequest).user;
    if (user.role !== role) return res.status(403).json({ error: 'FORBIDDEN' });
    if (role === 'SUPER_ADMIN' && REQUIRE_ADMIN_MFA && !user.firebase.sign_in_second_factor) {
      return res.status(403).json({ error: 'MFA_REQUIRED' });
    }
    next();
  };
}

const sensitiveLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
const initLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });

async function audit(actor: DecodedIdToken, action: string, targetId: string, summary: string) {
  await adminDb.collection('auditLogs').add({
    actorId: actor.uid,
    actorEmail: actor.email ?? '',
    action,
    targetCollection: 'users',
    targetId,
    summary,
    createdAt: FieldValue.serverTimestamp(),
  });
}

app.get('/api/health', (_req, res) => res.json({ ok: true }));

/**
 * Student sign-in finalisation. The browser has just signed in with Google; this trusted endpoint
 * decides whether the account may be a STUDENT, assigns the claim and creates the profile.
 * It can never create or upgrade INSTRUCTOR / SUPER_ADMIN accounts.
 */
app.post('/api/auth/student-init', initLimiter, requireAuth, async (req, res) => {
  const user = (req as AuthedRequest).user;
  try {
    const profileRef = adminDb.collection('users').doc(user.uid);
    const snap = await profileRef.get();
    const decision = decideStudentSignIn({
      signInProvider: user.firebase.sign_in_provider,
      emailVerified: user.email_verified === true,
      existingClaim: user.role,
      existingProfileRole: snap.exists ? (snap.data()?.role as string | undefined) : undefined,
    });
    if (!decision.allow) {
      // Deliberately generic: do not reveal which accounts are staff.
      return res.status(403).json({ error: decision.reason === 'STAFF_ACCOUNT' ? 'USE_STAFF_LOGIN' : 'NOT_ALLOWED' });
    }
    if (decision.createProfile) {
      const record = await auth.getUser(user.uid);
      await profileRef.set({
        uid: user.uid,
        displayName: (record.displayName || user.email?.split('@')[0] || 'Birta Learner').slice(0, 100),
        email: (user.email || '').slice(0, 200),
        role: 'student',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    if (user.role !== 'STUDENT') {
      await auth.setCustomUserClaims(user.uid, { role: 'STUDENT' });
    }
    res.json({ ok: true, role: 'STUDENT' });
  } catch (error) {
    console.error('student-init failed', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

/**
 * Super Admin creates an instructor. No password is ever shown: the account is created with a random
 * unusable password and the admin receives a one-time Firebase activation link where the instructor
 * sets their own password. (Email delivery is not configured; the admin passes the link on.)
 */
app.post('/api/admin/instructors', sensitiveLimiter, requireAuth, requireRole('SUPER_ADMIN'), async (req, res) => {
  const actor = (req as AuthedRequest).user;
  const parsed = validateInstructorInvite(req.body);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });
  try {
    try {
      await auth.getUserByEmail(parsed.email);
      return res.status(409).json({ error: 'An account with this email already exists.' });
    } catch (e) {
      if ((e as { code?: string }).code !== 'auth/user-not-found') throw e;
    }
    const record = await auth.createUser({
      email: parsed.email,
      displayName: parsed.name,
      password: crypto.randomBytes(32).toString('base64url'),
      emailVerified: false,
    });
    await auth.setCustomUserClaims(record.uid, { role: 'INSTRUCTOR' });
    await adminDb.collection('users').doc(record.uid).set({
      uid: record.uid,
      displayName: parsed.name,
      email: parsed.email,
      role: 'instructor',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    const activationLink = await auth.generatePasswordResetLink(parsed.email, {
      url: `${APP_URL}/staff/login`,
    });
    await audit(actor, 'INVITE_INSTRUCTOR', record.uid, `Invited instructor ${parsed.email}`);
    res.status(201).json({ uid: record.uid, activationLink });
  } catch (error) {
    console.error('invite failed', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

/** Regenerates an activation / password-reset link for an instructor (admin-controlled). */
app.post('/api/admin/instructors/:uid/link', sensitiveLimiter, requireAuth, requireRole('SUPER_ADMIN'), async (req, res) => {
  const actor = (req as AuthedRequest).user;
  try {
    const record = await auth.getUser(String(req.params.uid));
    if (record.customClaims?.role !== 'INSTRUCTOR' || !record.email) {
      return res.status(404).json({ error: 'Instructor not found.' });
    }
    const activationLink = await auth.generatePasswordResetLink(record.email, { url: `${APP_URL}/staff/login` });
    await audit(actor, 'INSTRUCTOR_LINK', record.uid, `Generated access link for ${record.email}`);
    res.json({ activationLink });
  } catch {
    res.status(404).json({ error: 'Instructor not found.' });
  }
});

/** Disable / re-enable an instructor and revoke their sessions. */
app.post('/api/admin/instructors/:uid/disabled', sensitiveLimiter, requireAuth, requireRole('SUPER_ADMIN'), async (req, res) => {
  const actor = (req as AuthedRequest).user;
  const disabled = Boolean((req.body as { disabled?: unknown })?.disabled);
  try {
    const record = await auth.getUser(String(req.params.uid));
    if (record.customClaims?.role !== 'INSTRUCTOR') return res.status(404).json({ error: 'Instructor not found.' });
    await auth.updateUser(record.uid, { disabled });
    if (disabled) await auth.revokeRefreshTokens(record.uid);
    await audit(actor, disabled ? 'DISABLE_INSTRUCTOR' : 'ENABLE_INSTRUCTOR', record.uid, `${disabled ? 'Disabled' : 'Enabled'} ${record.email}`);
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: 'Instructor not found.' });
  }
});


class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const OCCUPYING = ['approved', 'completed'];

/**
 * Student applies for a batch. Price, instructor, names and course are read from the database,
 * never trusted from the browser. Idempotent per (student, batch).
 */
app.post('/api/enrollments', initLimiter, requireAuth, requireRole('STUDENT'), async (req, res) => {
  const user = (req as AuthedRequest).user;
  const parsed = validateEnrollmentSubmission(req.body);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });
  try {
    const id = await adminDb.runTransaction(async (tx) => {
      const batchSnap = await tx.get(adminDb.collection('batches').doc(parsed.batchId));
      if (!batchSnap.exists) throw new HttpError(404, 'Batch not found.');
      const batch = batchSnap.data() as Record<string, any>;
      if (!['upcoming', 'ongoing'].includes(batch.status)) throw new HttpError(409, 'This batch is not open for enrollment.');
      const courseSnap = await tx.get(adminDb.collection('courses').doc(String(batch.courseId)));
      if (!courseSnap.exists || courseSnap.data()?.published !== true) throw new HttpError(404, 'Course not available.');
      const profileSnap = await tx.get(adminDb.collection('users').doc(user.uid));
      if (!profileSnap.exists) throw new HttpError(409, 'Complete sign-in first.');
      const profile = profileSnap.data() as Record<string, any>;

      const enrollmentId = `${user.uid}_${parsed.batchId}`;
      const ref = adminDb.collection('enrollments').doc(enrollmentId);
      const existing = await tx.get(ref);

      if (existing.exists) {
        const prev = existing.data() as Record<string, any>;
        if (OCCUPYING.includes(prev.enrollmentStatus)) throw new HttpError(409, 'You are already enrolled in this batch.');
        // pending (update reference) or rejected (reapply): back to pending verification
        tx.update(ref, {
          paymentMethod: parsed.paymentMethod,
          paymentReference: parsed.paymentReference,
          paymentNotes: parsed.paymentNotes,
          paymentStatus: 'pending_verification',
          enrollmentStatus: 'pending',
          reviewedBy: FieldValue.delete(),
          reviewNote: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        return enrollmentId;
      }

      const occupied = await tx.get(
        adminDb.collection('enrollments').where('batchId', '==', parsed.batchId).where('enrollmentStatus', 'in', OCCUPYING)
      );
      if (occupied.size >= Number(batch.seatLimit)) throw new HttpError(409, 'This batch is full.');

      tx.create(ref, {
        id: enrollmentId,
        studentId: user.uid,
        studentName: String(profile.displayName).slice(0, 100),
        studentEmail: String(profile.email).slice(0, 200),
        courseId: batch.courseId,
        courseTitle: batch.courseTitle,
        batchId: parsed.batchId,
        batchName: batch.name,
        instructorId: batch.instructorId,
        amountNpr: batch.priceNpr,
        currency: 'NPR',
        paymentMethod: parsed.paymentMethod,
        paymentReference: parsed.paymentReference,
        paymentNotes: parsed.paymentNotes,
        paymentStatus: 'pending_verification',
        enrollmentStatus: 'pending',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return enrollmentId;
    });
    res.status(201).json({ id });
  } catch (error) {
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    console.error('enrollment failed', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

/**
 * Super Admin verifies payment / waives / rejects / completes. Runs in a transaction so concurrent
 * approvals cannot exceed the batch's seat limit, and repeated clicks are idempotent.
 */
app.post('/api/admin/enrollments/:id/review', sensitiveLimiter, requireAuth, requireRole('SUPER_ADMIN'), async (req, res) => {
  const actor = (req as AuthedRequest).user;
  const body = (req.body ?? {}) as { decision?: unknown; note?: unknown };
  if (!isReviewDecision(body.decision)) return res.status(400).json({ error: 'Invalid decision.' });
  const decision = body.decision;
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 400) : '';
  const enrollmentId = String(req.params.id);
  if (!/^[a-zA-Z0-9_-]{1,260}$/.test(enrollmentId)) return res.status(400).json({ error: 'Invalid enrollment.' });
  try {
    const outcome = await adminDb.runTransaction(async (tx) => {
      const ref = adminDb.collection('enrollments').doc(enrollmentId);
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpError(404, 'Enrollment not found.');
      const enr = snap.data() as Record<string, any>;
      const batchSnap = await tx.get(adminDb.collection('batches').doc(String(enr.batchId)));
      const seatLimit = Number(batchSnap.data()?.seatLimit ?? 0);
      const occupiedSnap = await tx.get(
        adminDb.collection('enrollments').where('batchId', '==', enr.batchId).where('enrollmentStatus', 'in', OCCUPYING)
      );
      const occupiedSeats = occupiedSnap.docs.filter((d) => d.id !== enrollmentId).length;

      const plan = planEnrollmentReview({
        enrollmentStatus: enr.enrollmentStatus,
        paymentStatus: enr.paymentStatus,
        decision,
        occupiedSeats,
        seatLimit,
      });
      if (plan.kind === 'error') {
        throw new HttpError(409, plan.code === 'BATCH_FULL' ? 'This batch is full.' : 'That action is not valid for this enrollment.');
      }
      if (plan.kind === 'noop') return { changed: false, enr };

      const granted = plan.paymentStatus === 'verified' || plan.paymentStatus === 'waived';
      tx.update(ref, {
        paymentStatus: plan.paymentStatus,
        enrollmentStatus: plan.enrollmentStatus,
        reviewedBy: actor.uid,
        reviewNote: note || (decision === 'reject' ? 'Rejected by admin.' : decision === 'waive' ? 'Scholarship / waived.' : 'Payment verified by admin.'),
        ...(granted && enr.enrollmentStatus === 'pending' ? { verifiedAt: FieldValue.serverTimestamp(), verifiedBy: actor.uid } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { changed: true, enr, plan };
    });
    if (outcome.changed) {
      await adminDb.collection('auditLogs').add({
        actorId: actor.uid,
        actorEmail: actor.email ?? '',
        action: 'REVIEW_ENROLLMENT',
        targetCollection: 'enrollments',
        targetId: enrollmentId,
        summary: `${decision} ${outcome.enr.studentEmail} (${outcome.enr.batchName})`,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    res.json({ ok: true, changed: outcome.changed });
  } catch (error) {
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    console.error('review failed', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});


// ---------------------------------------------------------------------------
// Live classes (Google Meet links are stored privately and released only inside the join window)
// ---------------------------------------------------------------------------
const sessionsCol = (batchId: string) => adminDb.collection('batches').doc(batchId).collection('liveSessions');
const secretsCol = (batchId: string) => adminDb.collection('batches').doc(batchId).collection('sessionSecrets');

/** Instructor of this batch, or Super Admin (who must have used MFA). */
function requireBatchStaff(req: Request, res: Response, next: NextFunction) {
  const user = (req as AuthedRequest).user;
  if (user.role === 'SUPER_ADMIN') return requireRole('SUPER_ADMIN')(req, res, next);
  if (user.role === 'INSTRUCTOR') return next();
  res.status(403).json({ error: 'FORBIDDEN' });
}

async function loadManagedBatch(user: DecodedIdToken, batchId: string) {
  const snap = await adminDb.collection('batches').doc(batchId).get();
  if (!snap.exists) throw new HttpError(404, 'Batch not found.');
  const batch = snap.data() as Record<string, any>;
  if (user.role !== 'SUPER_ADMIN' && batch.instructorId !== user.uid) {
    // An instructor must never touch another instructor's batch.
    throw new HttpError(403, 'You are not assigned to this batch.');
  }
  return batch;
}

async function joinWindowMinutes(): Promise<number> {
  const snap = await adminDb.collection('settings').doc('academy').get();
  const v = Number(snap.data()?.joinWindowMinutes);
  return Number.isFinite(v) && v >= 0 && v <= 240 ? v : DEFAULT_JOIN_WINDOW_MINUTES;
}

function handleError(res: Response, error: unknown, label: string) {
  if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
  console.error(label, error);
  res.status(500).json({ error: 'SERVER_ERROR' });
}

app.post('/api/staff/sessions', sensitiveLimiter, requireAuth, requireBatchStaff, async (req, res) => {
  const user = (req as AuthedRequest).user;
  const parsed = validateSessionInput(req.body);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });
  try {
    const batch = await loadManagedBatch(user, parsed.batchId);
    const ref = parsed.sessionId ? sessionsCol(parsed.batchId).doc(parsed.sessionId) : sessionsCol(parsed.batchId).doc();
    const existing = await ref.get();
    if (parsed.sessionId && !existing.exists) throw new HttpError(404, 'Session not found.');
    const batchWrite = adminDb.batch();
    batchWrite.set(
      ref,
      {
        id: ref.id,
        courseId: batch.courseId,
        batchId: parsed.batchId,
        instructorId: batch.instructorId,
        title: parsed.title,
        scheduledStart: parsed.scheduledStart,
        durationMinutes: parsed.durationMinutes,
        meetingPlatform: 'Google Meet',
        hasMeetingLink: true,
        status: parsed.status,
        updatedAt: FieldValue.serverTimestamp(),
        ...(existing.exists ? {} : { createdAt: FieldValue.serverTimestamp(), hasRecording: false }),
      },
      { merge: true }
    );
    batchWrite.set(secretsCol(parsed.batchId).doc(ref.id), { meetingUrl: parsed.meetingUrl, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await batchWrite.commit();
    res.status(existing.exists ? 200 : 201).json({ id: ref.id });
  } catch (error) {
    handleError(res, error, 'session save failed');
  }
});

app.post('/api/staff/sessions/:batchId/:sessionId/recording', sensitiveLimiter, requireAuth, requireBatchStaff, async (req, res) => {
  const user = (req as AuthedRequest).user;
  const { batchId, sessionId } = req.params as Record<string, string>;
  const url = safeHttpUrl((req.body as { recordingUrl?: unknown })?.recordingUrl);
  if (!url) return res.status(400).json({ error: 'Enter a valid https link to the recording.' });
  try {
    await loadManagedBatch(user, batchId);
    const ref = sessionsCol(batchId).doc(sessionId);
    if (!(await ref.get()).exists) throw new HttpError(404, 'Session not found.');
    await secretsCol(batchId).doc(sessionId).set({ recordingUrl: url, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await ref.update({ hasRecording: true, status: 'completed', updatedAt: FieldValue.serverTimestamp() });
    res.json({ ok: true });
  } catch (error) {
    handleError(res, error, 'recording save failed');
  }
});


app.post('/api/staff/sessions/:batchId/:sessionId/status', sensitiveLimiter, requireAuth, requireBatchStaff, async (req, res) => {
  const user = (req as AuthedRequest).user;
  const { batchId, sessionId } = req.params as Record<string, string>;
  const status = (req.body as { status?: unknown })?.status;
  if (status !== 'completed' && status !== 'cancelled' && status !== 'scheduled') return res.status(400).json({ error: 'Invalid status.' });
  try {
    await loadManagedBatch(user, batchId);
    const ref = sessionsCol(batchId).doc(sessionId);
    if (!(await ref.get()).exists) throw new HttpError(404, 'Session not found.');
    await ref.update({ status, updatedAt: FieldValue.serverTimestamp() });
    res.json({ ok: true });
  } catch (error) {
    handleError(res, error, 'status failed');
  }
});

app.put('/api/staff/sessions/:batchId/:sessionId/attendance', sensitiveLimiter, requireAuth, requireBatchStaff, async (req, res) => {
  const user = (req as AuthedRequest).user;
  const { batchId, sessionId } = req.params as Record<string, string>;
  const parsed = validateAttendance(req.body);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });
  try {
    await loadManagedBatch(user, batchId);
    if (!(await sessionsCol(batchId).doc(sessionId).get()).exists) throw new HttpError(404, 'Session not found.');
    // Only enrolled (approved/completed) students can have attendance recorded.
    const enrolled = await adminDb
      .collection('enrollments')
      .where('batchId', '==', batchId)
      .where('enrollmentStatus', 'in', OCCUPYING)
      .get();
    const roster = new Map(enrolled.docs.map((d) => [d.data().studentId as string, d.data().studentName as string]));
    const write = adminDb.batch();
    for (const r of parsed.records) {
      if (!roster.has(r.studentId)) throw new HttpError(400, 'Attendance includes a student who is not enrolled in this batch.');
      write.set(sessionsCol(batchId).doc(sessionId).collection('attendance').doc(r.studentId), {
        studentId: r.studentId,
        studentName: roster.get(r.studentId),
        status: r.status,
        markedBy: user.uid,
        markedAt: FieldValue.serverTimestamp(),
      });
    }
    await write.commit();
    res.json({ ok: true, count: parsed.records.length });
  } catch (error) {
    handleError(res, error, 'attendance failed');
  }
});

/**
 * Releases the Meet link (kind=join, only inside the join window) or the recording link (kind=recording)
 * to an enrolled student, or to the batch's instructor / admin. The URL is never in a client-readable document.
 */
app.post('/api/sessions/access', initLimiter, requireAuth, async (req, res) => {
  const user = (req as AuthedRequest).user;
  const { batchId, sessionId, kind } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof batchId !== 'string' || typeof sessionId !== 'string' || (kind !== 'join' && kind !== 'recording')) {
    return res.status(400).json({ error: 'Invalid request.' });
  }
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(batchId) || !/^[a-zA-Z0-9_-]{1,128}$/.test(sessionId)) {
    return res.status(400).json({ error: 'Invalid request.' });
  }
  try {
    let staff = false;
    if (user.role === 'SUPER_ADMIN' || user.role === 'INSTRUCTOR') {
      await loadManagedBatch(user, batchId);
      staff = true;
    } else {
      const enr = await adminDb.collection('enrollments').doc(`${user.uid}_${batchId}`).get();
      if (!enr.exists || !OCCUPYING.includes(enr.data()?.enrollmentStatus)) {
        return res.status(403).json({ error: 'You are not enrolled in this batch.' });
      }
    }
    const sessionSnap = await sessionsCol(batchId).doc(sessionId).get();
    if (!sessionSnap.exists) return res.status(404).json({ error: 'Session not found.' });
    const session = sessionSnap.data() as Record<string, any>;
    const secrets = (await secretsCol(batchId).doc(sessionId).get()).data() ?? {};

    if (kind === 'recording') {
      if (!secrets.recordingUrl) return res.status(404).json({ error: 'No recording available yet.' });
      return res.json({ url: secrets.recordingUrl });
    }
    if (!staff) {
      const phase = sessionPhase({
        now: new Date(),
        scheduledStart: session.scheduledStart,
        durationMinutes: session.durationMinutes,
        status: session.status as StoredSessionStatus,
        joinWindowMinutes: await joinWindowMinutes(),
      });
      if (!canJoin(phase)) {
        return res.status(403).json({ error: phase === 'upcoming' ? 'The class link opens shortly before the start time.' : 'This class is not open for joining.' });
      }
    }
    if (!secrets.meetingUrl) return res.status(404).json({ error: 'The instructor has not added a Meet link yet.' });
    res.json({ url: secrets.meetingUrl });
  } catch (error) {
    handleError(res, error, 'session access failed');
  }
});


// ---------------------------------------------------------------------------
// Assignments: submissions and grading
// ---------------------------------------------------------------------------
app.post('/api/submissions', initLimiter, requireAuth, requireRole('STUDENT'), async (req, res) => {
  const user = (req as AuthedRequest).user;
  const b = (req.body ?? {}) as Record<string, unknown>;
  const idRe = /^[a-zA-Z0-9_-]{1,128}$/;
  const url = safeHttpUrl(b.submissionUrl);
  const notes = typeof b.notes === 'string' ? b.notes.trim().slice(0, 1000) : '';
  if (typeof b.batchId !== 'string' || !idRe.test(b.batchId) || typeof b.assignmentId !== 'string' || !idRe.test(b.assignmentId)) {
    return res.status(400).json({ error: 'Invalid assignment.' });
  }
  if (!url) return res.status(400).json({ error: 'Enter a valid https link to your work.' });
  try {
    const enr = await adminDb.collection('enrollments').doc(`${user.uid}_${b.batchId}`).get();
    if (!enr.exists || !OCCUPYING.includes(enr.data()?.enrollmentStatus)) {
      return res.status(403).json({ error: 'You are not enrolled in this batch.' });
    }
    const asgnSnap = await adminDb.collection('batches').doc(b.batchId).collection('assignments').doc(b.assignmentId).get();
    if (!asgnSnap.exists) return res.status(404).json({ error: 'Assignment not found.' });
    const asgn = asgnSnap.data() as Record<string, any>;
    const profile = (await adminDb.collection('users').doc(user.uid).get()).data() ?? {};
    const id = `${user.uid}_${b.assignmentId}`;
    const ref = adminDb.collection('submissions').doc(id);
    await adminDb.runTransaction(async (tx) => {
      const existing = await tx.get(ref);
      const prev = existing.exists ? (existing.data() as Record<string, any>) : null;
      if (prev && !canResubmit(prev.status)) throw new HttpError(409, 'This submission has already been graded.');
      const late = isLateSubmission(String(asgn.dueDate), new Date());
      const fields = {
        submissionUrl: url,
        notes,
        status: 'submitted',
        late,
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (prev) {
        // keep earlier feedback visible, clear the old score until re-graded
        tx.update(ref, { ...fields, score: FieldValue.delete(), resubmissions: FieldValue.increment(1) });
      } else {
        tx.create(ref, {
          id,
          assignmentId: b.assignmentId,
          courseId: asgn.courseId,
          batchId: b.batchId,
          studentId: user.uid,
          studentName: String(profile.displayName ?? '').slice(0, 100),
          instructorId: asgn.instructorId,
          ...fields,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
    });
    res.status(201).json({ id });
  } catch (error) {
    handleError(res, error, 'submission failed');
  }
});

app.post('/api/staff/submissions/:id/grade', sensitiveLimiter, requireAuth, requireBatchStaff, async (req, res) => {
  const user = (req as AuthedRequest).user;
  try {
    const ref = adminDb.collection('submissions').doc(String(req.params.id));
    const snap = await ref.get();
    if (!snap.exists) throw new HttpError(404, 'Submission not found.');
    const sub = snap.data() as Record<string, any>;
    await loadManagedBatch(user, sub.batchId);
    const asgn = (await adminDb.collection('batches').doc(sub.batchId).collection('assignments').doc(sub.assignmentId).get()).data();
    const parsed = validateGrade(req.body, Number(asgn?.maxScore ?? 100));
    if (!parsed.ok) throw new HttpError(400, parsed.error);
    await ref.update({
      status: parsed.status,
      score: parsed.score,
      feedback: parsed.feedback,
      gradedBy: user.uid,
      gradedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    res.json({ ok: true });
  } catch (error) {
    handleError(res, error, 'grading failed');
  }
});

// ---------------------------------------------------------------------------
// Certificates: issued only after server-side eligibility checks
// ---------------------------------------------------------------------------
async function evaluateEnrollment(enrollmentId: string) {
  const enrSnap = await adminDb.collection('enrollments').doc(enrollmentId).get();
  if (!enrSnap.exists) throw new HttpError(404, 'Enrollment not found.');
  const enr = enrSnap.data() as Record<string, any>;
  const batchRef = adminDb.collection('batches').doc(String(enr.batchId));
  const [lessons, assignments, progress, subs, settings] = await Promise.all([
    batchRef.collection('lessons').get(),
    batchRef.collection('assignments').get(),
    adminDb.collection('lessonProgress').where('studentId', '==', enr.studentId).where('batchId', '==', enr.batchId).get(),
    adminDb.collection('submissions').where('studentId', '==', enr.studentId).where('batchId', '==', enr.batchId).get(),
    adminDb.collection('settings').doc('academy').get(),
  ]);
  const lessonIds = new Set(lessons.docs.map((d) => d.id));
  const completed = progress.docs.filter((d) => d.data().completed === true && lessonIds.has(String(d.data().lessonId))).length;
  const criteria = resolveCriteria(settings.data()?.certificateCriteria);
  const result = evaluateCertificateEligibility({
    enrollmentStatus: enr.enrollmentStatus,
    paymentStatus: enr.paymentStatus,
    totalLessons: lessons.size,
    completedLessons: completed,
    assignments: assignments.docs.map((d) => ({ id: d.id, maxScore: Number(d.data().maxScore ?? 100) })),
    submissions: subs.docs.map((d) => ({ assignmentId: d.data().assignmentId, status: d.data().status, score: d.data().score })),
    criteria,
  });
  return { enr, result };
}

app.get('/api/admin/enrollments/:id/eligibility', sensitiveLimiter, requireAuth, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const { result } = await evaluateEnrollment(String(req.params.id));
    res.json(result);
  } catch (error) {
    handleError(res, error, 'eligibility failed');
  }
});

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCertificateCode(): string {
  let tail = '';
  for (let i = 0; i < 10; i++) tail += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return `BA-${new Date().getUTCFullYear()}-${tail}`;
}

app.post('/api/admin/certificates', sensitiveLimiter, requireAuth, requireRole('SUPER_ADMIN'), async (req, res) => {
  const actor = (req as AuthedRequest).user;
  const enrollmentId = (req.body as { enrollmentId?: unknown })?.enrollmentId;
  if (typeof enrollmentId !== 'string' || !/^[a-zA-Z0-9_-]{1,260}$/.test(enrollmentId)) {
    return res.status(400).json({ error: 'Invalid enrollment.' });
  }
  try {
    const { enr, result } = await evaluateEnrollment(enrollmentId);
    if (!result.eligible) return res.status(409).json({ error: 'NOT_ELIGIBLE', reasons: result.reasons });

    const certRef = adminDb.collection('certificates').doc(enrollmentId);
    const existing = await certRef.get();
    if (existing.exists) return res.json({ code: existing.data()?.certificateCode, existing: true });

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = newCertificateCode();
      const verifyRef = adminDb.collection('certificateVerifications').doc(code);
      try {
        await adminDb.runTransaction(async (tx) => {
          if ((await tx.get(certRef)).exists) throw new HttpError(409, 'Already issued.');
          if ((await tx.get(verifyRef)).exists) throw new Error('CODE_COLLISION');
          tx.create(certRef, {
            id: enrollmentId,
            certificateCode: code,
            studentId: enr.studentId,
            studentName: enr.studentName,
            courseId: enr.courseId,
            courseTitle: enr.courseTitle,
            batchId: enr.batchId,
            batchName: enr.batchName,
            issuedBy: actor.uid,
            status: 'issued',
            issuedAt: FieldValue.serverTimestamp(),
          });
          tx.create(verifyRef, {
            certificateCode: code,
            studentName: enr.studentName,
            courseTitle: enr.courseTitle,
            status: 'issued',
            issuedAt: FieldValue.serverTimestamp(),
          });
        });
        await audit(actor, 'ISSUE_CERTIFICATE', enrollmentId, `Issued ${code} to ${enr.studentEmail} for ${enr.courseTitle}`);
        return res.status(201).json({ code });
      } catch (e) {
        if (e instanceof Error && e.message === 'CODE_COLLISION') continue;
        throw e;
      }
    }
    throw new Error('Could not allocate a unique certificate code');
  } catch (error) {
    handleError(res, error, 'certificate failed');
  }
});

app.post('/api/admin/certificates/:id/status', sensitiveLimiter, requireAuth, requireRole('SUPER_ADMIN'), async (req, res) => {
  const actor = (req as AuthedRequest).user;
  const status = (req.body as { status?: unknown })?.status;
  if (status !== 'issued' && status !== 'revoked') return res.status(400).json({ error: 'Invalid status.' });
  try {
    const ref = adminDb.collection('certificates').doc(String(req.params.id));
    const snap = await ref.get();
    if (!snap.exists) throw new HttpError(404, 'Certificate not found.');
    const code = String(snap.data()?.certificateCode);
    const write = adminDb.batch();
    write.update(ref, { status });
    write.update(adminDb.collection('certificateVerifications').doc(code), { status });
    await write.commit();
    await audit(actor, status === 'revoked' ? 'REVOKE_CERTIFICATE' : 'REINSTATE_CERTIFICATE', ref.id, `${status} ${code}`);
    res.json({ ok: true });
  } catch (error) {
    handleError(res, error, 'certificate status failed');
  }
});

const port = Number(process.env.PORT || 8787);
app.listen(port, () => console.log(`Birta API listening on :${port} (admin MFA required: ${REQUIRE_ADMIN_MFA})`));
