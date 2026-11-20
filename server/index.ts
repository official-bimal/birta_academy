import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { adminApp, adminDb } from './firebaseAdmin.ts';
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

const port = Number(process.env.PORT || 8787);
app.listen(port, () => console.log(`Birta API listening on :${port} (admin MFA required: ${REQUIRE_ADMIN_MFA})`));
