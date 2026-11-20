import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { adminApp, adminDb } from './firebaseAdmin.ts';
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

const port = Number(process.env.PORT || 8787);
app.listen(port, () => console.log(`Birta API listening on :${port} (admin MFA required: ${REQUIRE_ADMIN_MFA})`));
