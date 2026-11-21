/**
 * Local end-to-end checks against the REAL Firebase dev project and the LOCAL API (http://localhost:8787).
 *   npm run dev:all     (in another terminal)
 *   npm run test:e2e
 *
 * Safety:
 *  - Creates/updates only records whose ids start with "e2e_" (clearly labelled [TEST], isDemo=true).
 *  - Never touches real users. No payments of any kind; "payment references" are fake strings.
 *  - Never prints tokens, links or passwords. Staff test passwords go to a git-ignored local file.
 *  - Uses the app's own client code (src/lib/*) for the client paths, so live Firestore rules apply.
 */
import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { signInWithCustomToken, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { adminApp, adminDb } from '../server/firebaseAdmin.ts';

// Never dump raw error objects (they can contain request headers).
for (const ev of ['uncaughtException', 'unhandledRejection'] as const) {
  process.on(ev, (e) => {
    console.error('FATAL:', String((e as Error)?.message ?? e).split('\n')[0].slice(0, 200));
    process.exit(2);
  });
}
const API = process.env.E2E_API || 'http://localhost:8787';
const realFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = ((input: any, init?: any) =>
  typeof input === 'string' && input.startsWith('/api') ? realFetch(API + input, init) : realFetch(input, init)) as typeof fetch;

// client-side app code (same functions the UI calls)
const { auth } = await import('../src/lib/firebase.ts');
const svc = await import('../src/lib/firestoreService.ts');
const { ApiError } = await import('../src/lib/api.ts');
const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf-8'));

const adminAuth = getAuth(adminApp);
const DOM = 'birta-e2e.test';
const COURSE = 'e2e_course_test';
const BATCH = 'e2e_batch_test';
const BATCH_OTHER = 'e2e_batch_other';
const IDS = {
  A: 'e2e_student_a', B: 'e2e_student_b', C: 'e2e_student_c',
  I1: 'e2e_instructor_1', I2: 'e2e_instructor_2', ADMIN: 'e2e_admin',
};

type Result = { id: string; title: string; status: 'PASS' | 'FAIL' | 'BLOCKED'; note?: string };
const results: Result[] = [];
async function check(id: string, title: string, fn: () => Promise<string | void>) {
  try {
    const note = await fn();
    results.push({ id, title, status: 'PASS', note: note || undefined });
  } catch (e) {
    const msg = e instanceof Blocked ? e.message : (e as Error).message.split('\n')[0].slice(0, 220);
    results.push({ id, title, status: e instanceof Blocked ? 'BLOCKED' : 'FAIL', note: msg });
  }
}
class Blocked extends Error {}
function expect(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
async function expectRejected(fn: () => Promise<unknown>, test: (e: any) => boolean, what: string) {
  try {
    await fn();
  } catch (e) {
    if (test(e)) return;
    throw new Error(`${what}: rejected with unexpected error (${(e as Error).message.split('\n')[0].slice(0, 120)})`);
  }
  throw new Error(`${what}: was allowed but should have been rejected`);
}
const isPerm = (e: any) => /permission|insufficient/i.test(String(e?.message ?? '')) || e?.code === 'permission-denied';
const apiCode = (status: number) => (e: any) => e instanceof ApiError && e.status === status;

// ---------------------------------------------------------------------------
// Test accounts (stable ids, labelled)
// ---------------------------------------------------------------------------
const passwords: Record<string, string> = {};
async function ensureUser(uid: string, role: 'STUDENT' | 'INSTRUCTOR' | 'SUPER_ADMIN', name: string, withPassword: boolean) {
  const email = `${uid.replace(/_/g, '-')}@${DOM}`;
  const password = crypto.randomBytes(18).toString('base64url') + '-Aa1!';
  try {
    await adminAuth.getUser(uid);
    await adminAuth.updateUser(uid, { email, displayName: `[TEST] ${name}`, emailVerified: true, disabled: false, ...(withPassword ? { password } : {}) });
  } catch {
    await adminAuth.createUser({ uid, email, displayName: `[TEST] ${name}`, emailVerified: true, ...(withPassword ? { password } : {}) });
  }
  await adminAuth.setCustomUserClaims(uid, { role });
  await adminDb.collection('users').doc(uid).set(
    { uid, displayName: `[TEST] ${name}`, email, role: role === 'SUPER_ADMIN' ? 'admin' : role.toLowerCase(), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  if (withPassword) passwords[email] = password;
  return email;
}

async function signInAs(uid: string) {
  const token = await adminAuth.createCustomToken(uid);
  await signInWithCustomToken(auth, token);
  await auth.currentUser!.getIdToken(true); // fresh claims
  return auth.currentUser!;
}
async function idTokenFor(uid: string) {
  const user = await signInAs(uid);
  return user.getIdToken();
}
async function raw(method: string, urlPath: string, token: string | null, body?: unknown) {
  const res = await realFetch(API + urlPath, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body && method !== 'GET' ? { 'Content-Type': 'application/json' } : {}) },
    body: body && method !== 'GET' ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: (await res.json().catch(() => ({}))) as any };
}
const profileOf = async (uid: string) => (await adminDb.collection('users').doc(uid).get()).data() as any;

// ---------------------------------------------------------------------------
// Reset + seed (only e2e_ records)
// ---------------------------------------------------------------------------
async function resetAndSeed() {
  for (const b of [BATCH, BATCH_OTHER]) {
    await adminDb.recursiveDelete(adminDb.collection('batches').doc(b));
    for (const col of ['enrollments', 'submissions', 'lessonProgress']) {
      const snap = await adminDb.collection(col).where('batchId', '==', b).get();
      await Promise.all(snap.docs.map((d) => d.ref.delete()));
    }
  }
  const certs = await adminDb.collection('certificates').where('batchId', '==', BATCH).get();
  for (const c of certs.docs) {
    await adminDb.collection('certificateVerifications').doc(String(c.data().certificateCode)).delete();
    await c.ref.delete();
  }
  // invited-instructor test user from a previous run
  try {
    const u = await adminAuth.getUserByEmail(`e2e-invited@${DOM}`);
    await adminDb.collection('users').doc(u.uid).delete();
    await adminAuth.deleteUser(u.uid);
  } catch { /* none */ }

  await ensureUser(IDS.A, 'STUDENT', 'Student A', false);
  await ensureUser(IDS.B, 'STUDENT', 'Student B', false);
  await ensureUser(IDS.C, 'STUDENT', 'Student C', false);
  await ensureUser(IDS.I1, 'INSTRUCTOR', 'Instructor One', true);
  await ensureUser(IDS.I2, 'INSTRUCTOR', 'Instructor Two', true);

  const now = FieldValue.serverTimestamp();
  await adminDb.collection('courses').doc(COURSE).set({
    id: COURSE, slug: 'e2e-test-course', title: '[TEST] E2E Sample Course (not a real course)', subtitle: 'Automated test record', categoryId: 'e2e', categoryName: 'E2E',
    instructorId: IDS.I1, instructorName: '[TEST] Instructor One', level: 'Beginner', durationWeeks: 2, priceNpr: 1000, currency: 'NPR',
    description: 'Created by scripts/e2e-local.ts for development testing only. Safe to delete.', outcomes: ['Test'], syllabus: ['Test module'],
    published: true, featured: false, isDemo: true, createdAt: now, updatedAt: now,
  });
  const batchBase = { courseId: COURSE, courseTitle: '[TEST] E2E Sample Course (not a real course)', courseSlug: 'e2e-test-course', startDate: '2027-01-10', endDate: '2027-02-10', scheduleText: 'Test schedule', timezone: 'NPT (UTC+5:45)', priceNpr: 1000, status: 'upcoming', isDemo: true, createdAt: now, updatedAt: now };
  await adminDb.collection('batches').doc(BATCH).set({ id: BATCH, ...batchBase, name: '[TEST] Batch 1', instructorId: IDS.I1, instructorName: '[TEST] Instructor One', seatLimit: 2 });
  await adminDb.collection('batches').doc(BATCH_OTHER).set({ id: BATCH_OTHER, ...batchBase, name: '[TEST] Batch of Instructor 2', instructorId: IDS.I2, instructorName: '[TEST] Instructor Two', seatLimit: 5 });
  for (const [i, title] of ['Lesson 1', 'Lesson 2'].entries()) {
    await adminDb.collection('batches').doc(BATCH).collection('lessons').doc(`e2e_lesson_${i + 1}`).set({
      id: `e2e_lesson_${i + 1}`, courseId: COURSE, batchId: BATCH, instructorId: IDS.I1, title: `[TEST] ${title}`, moduleTitle: 'Module 1', orderIndex: i + 1,
      contentSummary: 'Test lesson', videoUrl: 'https://example.com/test-video', resourceUrl: 'https://example.com/test-resource', durationMinutes: 30, createdAt: now, updatedAt: now,
    });
  }
  await adminDb.collection('batches').doc(BATCH).collection('assignments').doc('e2e_asgn_1').set({
    id: 'e2e_asgn_1', courseId: COURSE, batchId: BATCH, instructorId: IDS.I1, title: '[TEST] Assignment', instructions: 'Test', dueDate: '2027-12-31', maxScore: 100, createdAt: now, updatedAt: now,
  });
}

const nptParts = (d: Date) => {
  const npt = new Date(d.getTime() + (5 * 60 + 45) * 60_000);
  return { date: npt.toISOString().slice(0, 10), time: npt.toISOString().slice(11, 16) };
};
const MEET = 'https://meet.google.com/abc-defg-hij';

// ---------------------------------------------------------------------------
await resetAndSeed();
const health = await raw('GET', '/api/health', null);
if (!health.data.adminCredentials) throw new Error('API not running with credentials. Start `npm run dev:all` first.');

// 1. persisted student (the real Google test account, if any)
await check('T01', 'Real Google student has STUDENT claim + Firestore profile', async () => {
  const list = await adminAuth.listUsers(100);
  const real = list.users.filter((u) => !u.uid.startsWith('e2e_') && u.providerData.some((p) => p.providerId === 'google.com') && u.customClaims?.role === 'STUDENT');
  expect(real.length > 0, 'no real Google student account found (sign in once at /login with a non-staff account)');
  for (const u of real) {
    const p = await profileOf(u.uid);
    expect(p?.role === 'student' && p.displayName && p.createdAt, 'profile missing/incorrect for a STUDENT claim account');
  }
  return `${real.length} account(s) verified`;
});

// 2. role enforcement on protected API operations
const tokA = await idTokenFor(IDS.A);
await check('T02a', 'Unauthenticated API calls are rejected (401)', async () => {
  for (const p of ['/api/enrollments', '/api/admin/instructors', '/api/staff/sessions', '/api/submissions', '/api/sessions/access']) {
    expect((await raw('POST', p, null, {})).status === 401, `${p} not 401`);
  }
});
await check('T02b', 'STUDENT is denied every admin/staff API operation (403)', async () => {
  const calls: [string, string][] = [
    ['/api/admin/instructors', 'POST'], ['/api/admin/enrollments/x/review', 'POST'], ['/api/admin/certificates', 'POST'],
    ['/api/admin/certificates/x/status', 'POST'], ['/api/admin/enrollments/x/eligibility', 'GET'], ['/api/staff/sessions', 'POST'],
    [`/api/staff/sessions/${BATCH}/s/attendance`, 'PUT'], ['/api/staff/submissions/x/grade', 'POST'],
  ];
  for (const [p, m] of calls) expect((await raw(m, p, tokA, { instructor: 1 })).status === 403, `${m} ${p} not 403`);
});
const tokI1 = await idTokenFor(IDS.I1);
await check('T02c', 'INSTRUCTOR is denied admin-only operations (403)', async () => {
  for (const p of ['/api/admin/instructors', '/api/admin/enrollments/x/review', '/api/admin/certificates']) {
    expect((await raw('POST', p, tokI1, {})).status === 403, `${p} not 403 for instructor`);
  }
});
await check('T02d', 'INSTRUCTOR cannot enroll as a student (403)', async () => {
  expect((await raw('POST', '/api/enrollments', tokI1, { batchId: BATCH, paymentMethod: 'bank_transfer', paymentReference: 'E2E-TEST' })).status === 403, 'not 403');
});

// 4. staff / bootstrap workflow
await check('T04a', 'Bootstrap script creates a SUPER_ADMIN (claim + profile) and prints a link only', async () => {
  const out = execFileSync('npx.cmd', ['tsx', 'scripts/bootstrap-super-admin.ts', '--email', `e2e-admin@${DOM}`, '--name', '[TEST] E2E Admin', '--force'], { encoding: 'utf-8', shell: true });
  expect(out.includes('SUPER_ADMIN ready'), 'bootstrap did not report success');
  const u = await adminAuth.getUserByEmail(`e2e-admin@${DOM}`);
  expect(u.customClaims?.role === 'SUPER_ADMIN', 'claim not set');
  const p = await profileOf(u.uid);
  expect(p?.role === 'admin', 'profile role not admin');
  // give it a known password + stable uid mapping for the remaining tests
  const pw = crypto.randomBytes(18).toString('base64url');
  await adminAuth.updateUser(u.uid, { password: pw, emailVerified: true });
  passwords[`e2e-admin@${DOM}`] = pw;
  (IDS as any).ADMIN = u.uid;
  return 'one-time link printed to the console only; not logged here';
});
await check('T04b', 'Bootstrap refuses to run again when a SUPER_ADMIN already exists', async () => {
  let failed = false;
  try {
    execFileSync('npx.cmd', ['tsx', 'scripts/bootstrap-super-admin.ts', '--email', `e2e-admin2@${DOM}`], { encoding: 'utf-8', shell: true, stdio: 'pipe' });
  } catch { failed = true; }
  expect(failed, 'second bootstrap without --force succeeded');
  try { await adminAuth.deleteUser((await adminAuth.getUserByEmail(`e2e-admin2@${DOM}`)).uid); } catch { /* not created */ }
});
await check('T04c', 'Staff password login works for instructor and admin and yields the right claim', async () => {
  for (const [email, role] of [[`e2e-instructor-1@${DOM}`, 'INSTRUCTOR'], [`e2e-admin@${DOM}`, 'SUPER_ADMIN']] as const) {
    await signOut(auth);
    let cred;
    try {
      cred = await signInWithEmailAndPassword(auth, email, passwords[email]);
    } catch (e) {
      if ((e as { code?: string }).code === 'auth/operation-not-allowed') throw new Blocked('Email/Password sign-in provider is DISABLED in the Firebase project (Authentication > Sign-in method). Staff login cannot work until it is enabled.');
      throw e;
    }
    const tr = await cred.user.getIdTokenResult(true);
    expect(tr.claims.role === role, `${email} claim is ${String(tr.claims.role)}`);
  }
});
await check('T04d', 'Student test account cannot use the staff (password) login', async () => {
  await signOut(auth);
  await expectRejected(() => signInWithEmailAndPassword(auth, `e2e-student-a@${DOM}`, 'not-a-real-password-123'), (e) => /auth\//.test(String(e?.code)), 'student password login');
});
await check('T04e', 'Admin invites an instructor: account + INSTRUCTOR claim + one-time link (no password exposed)', async () => {
  const tokAdmin = await idTokenFor(IDS.ADMIN);
  const r = await raw('POST', '/api/admin/instructors', tokAdmin, { name: '[TEST] Invited Instructor', email: `e2e-invited@${DOM}` });
  expect(r.status === 201 && typeof r.data.activationLink === 'string' && r.data.activationLink.includes('oobCode'), `invite failed (${r.status})`);
  expect(Object.keys(r.data).every((k) => !/password/i.test(k)), 'response contains a password field');
  const u = await adminAuth.getUserByEmail(`e2e-invited@${DOM}`);
  expect(u.customClaims?.role === 'INSTRUCTOR', 'claim not INSTRUCTOR');
  const dup = await raw('POST', '/api/admin/instructors', tokAdmin, { name: 'Dup', email: `e2e-invited@${DOM}` });
  expect(dup.status === 409, 'duplicate invite not 409');
  return 'activation link not followed (needs email); hosted Firebase password-reset page untested';
});

// 6. enrollment + manual payment verification
const course = (await adminDb.collection('courses').doc(COURSE).get()).data() as any;
const batch = { ...((await adminDb.collection('batches').doc(BATCH).get()).data() as any), priceNpr: 1 }; // tampered on purpose
const studentProfile = async (uid: string) => (await profileOf(uid)) as any;
await check('T06a', 'Student A enrolls; server ignores tampered price/instructor and creates PENDING enrollment', async () => {
  await signInAs(IDS.A);
  const id = await svc.submitEnrollmentApplication({ student: await studentProfile(IDS.A), course, batch: { ...batch, instructorId: 'attacker' }, paymentMethod: 'bank_transfer', paymentReference: 'E2E-TEST-REF-A' });
  const e = (await adminDb.collection('enrollments').doc(id).get()).data() as any;
  expect(e.amountNpr === 1000, `amount trusted from client (${e.amountNpr})`);
  expect(e.instructorId === IDS.I1, 'instructorId trusted from client');
  expect(e.enrollmentStatus === 'pending' && e.paymentStatus === 'pending_verification', 'not pending');
  const id2 = await svc.submitEnrollmentApplication({ student: await studentProfile(IDS.A), course, batch, paymentMethod: 'bank_transfer', paymentReference: 'E2E-TEST-REF-A2' });
  expect(id2 === id, 'duplicate submission created a second record');
});
await check('T06b', 'Unapproved student A cannot read lessons or sessions (access locked before approval)', async () => {
  await signInAs(IDS.A);
  await expectRejected(() => svc.listBatchLessons(BATCH), isPerm, 'lessons before approval');
  await expectRejected(() => svc.listBatchLiveSessions(BATCH, true), isPerm, 'sessions before approval');
});
await check('T06c', 'Pending enrollment cannot be completed; unknown enrollment 404', async () => {
  await signInAs(IDS.ADMIN);
  await expectRejected(() => svc.adminReviewEnrollment({ enrollment: { id: `${IDS.A}_${BATCH}` } as any, decision: 'complete', reviewNote: '' }), apiCode(409), 'complete pending');
});
await check('T06d', 'Admin verifies payment: enrollment approved, verifiedBy/At recorded; repeat is idempotent', async () => {
  await signInAs(IDS.ADMIN);
  const enr = { id: `${IDS.A}_${BATCH}` } as any;
  const auditsBefore = (await adminDb.collection('auditLogs').where('targetId', '==', enr.id).get()).size;
  await svc.adminReviewEnrollment({ enrollment: enr, decision: 'approve', reviewNote: 'E2E test verification' });
  const e = (await adminDb.collection('enrollments').doc(enr.id).get()).data() as any;
  expect(e.enrollmentStatus === 'approved' && e.paymentStatus === 'verified' && e.verifiedBy && e.verifiedAt, 'not approved/verified');
  const again = await raw('POST', `/api/admin/enrollments/${enr.id}/review`, await auth.currentUser!.getIdToken(), { decision: 'approve' });
  expect(again.status === 200 && again.data.changed === false, 'repeat approval not a no-op');
  const audits = await adminDb.collection('auditLogs').where('targetId', '==', enr.id).get();
  expect(audits.size === auditsBefore + 1, `expected exactly 1 new audit entry, found ${audits.size - auditsBefore}`);
});
await check('T06e', 'Capacity: batch of 2 seats rejects a third approved student', async () => {
  for (const uid of [IDS.B]) {
    await signInAs(uid);
    await svc.submitEnrollmentApplication({ student: await studentProfile(uid), course, batch, paymentMethod: 'esewa_manual', paymentReference: 'E2E-TEST-REF-B' });
  }
  await signInAs(IDS.ADMIN);
  await svc.adminReviewEnrollment({ enrollment: { id: `${IDS.B}_${BATCH}` } as any, decision: 'waive', reviewNote: 'E2E scholarship test' });
  const b = (await adminDb.collection('enrollments').doc(`${IDS.B}_${BATCH}`).get()).data() as any;
  expect(b.paymentStatus === 'waived' && b.enrollmentStatus === 'approved', 'waiver not applied');
  await signInAs(IDS.C);
  await expectRejected(() => svc.submitEnrollmentApplication({ student: { uid: IDS.C } as any, course, batch, paymentMethod: 'khalti_manual', paymentReference: 'E2E-TEST-REF-C' }), (e) => e instanceof ApiError && e.status === 409, 'third student');
});

// 7. unlock
await check('T07a', 'Approved student A can now read the course lessons and learning resources', async () => {
  await signInAs(IDS.A);
  const lessons = await svc.listBatchLessons(BATCH);
  expect(lessons.length === 2 && lessons.every((l) => l.resourceUrl), 'lessons/resources missing');
});
await check('T07b', 'Non-enrolled student C is still locked out of lessons', async () => {
  await signInAs(IDS.C);
  await expectRejected(() => svc.listBatchLessons(BATCH), isPerm, 'lessons for C');
});

// 3. data isolation
await check('T03a', 'Student B cannot read student A’s enrollment, progress or profile', async () => {
  await signInAs(IDS.B);
  const { doc, getDoc, getDocs, collection, query, where } = await import('firebase/firestore');
  const { db } = await import('../src/lib/firebase.ts');
  await expectRejected(() => getDoc(doc(db, 'enrollments', `${IDS.A}_${BATCH}`)), isPerm, 'A enrollment');
  await expectRejected(() => getDocs(query(collection(db, 'lessonProgress'), where('studentId', '==', IDS.A))), isPerm, 'A progress');
  await expectRejected(() => getDoc(doc(db, 'users', IDS.A)), isPerm, 'A profile');
  const own = await svc.listStudentEnrollments(IDS.B);
  expect(own.length === 1 && own[0].studentId === IDS.B, 'B should see only own enrollment');
});
await check('T03b', 'Student cannot grant themselves staff: client role write to own profile is denied', async () => {
  await signInAs(IDS.B);
  const { doc, updateDoc } = await import('firebase/firestore');
  const { db } = await import('../src/lib/firebase.ts');
  await expectRejected(() => updateDoc(doc(db, 'users', IDS.B), { role: 'admin' }), isPerm, 'self role escalation');
});
await check('T03c', 'Student cannot create enrollments/submissions/certificates directly from the browser', async () => {
  await signInAs(IDS.C);
  const { doc, setDoc } = await import('firebase/firestore');
  const { db } = await import('../src/lib/firebase.ts');
  await expectRejected(() => setDoc(doc(db, 'enrollments', `${IDS.C}_${BATCH}`), { id: `${IDS.C}_${BATCH}`, studentId: IDS.C, batchId: BATCH, enrollmentStatus: 'approved', paymentStatus: 'verified' }), isPerm, 'direct enrollment');
});

// 8. sessions
const soon = nptParts(new Date(Date.now() + 5 * 60_000));
const later = nptParts(new Date(Date.now() + 26 * 3600_000));
let soonId = '';
let laterId = '';
await check('T08a', 'Instructor 1 schedules a Google Meet class for their batch (valid link)', async () => {
  await signInAs(IDS.I1);
  soonId = await svc.saveBatchLiveSession({ batchId: BATCH, title: '[TEST] Live class starting soon', ...soon, durationMinutes: 60, meetingUrl: MEET });
  laterId = await svc.saveBatchLiveSession({ batchId: BATCH, title: '[TEST] Live class tomorrow', ...later, durationMinutes: 60, meetingUrl: 'https://meet.google.com/xyz-abcd-efg' });
  const s = (await adminDb.collection('batches').doc(BATCH).collection('liveSessions').doc(soonId).get()).data() as any;
  expect(!('meetingUrl' in s) && s.hasMeetingLink === true, 'Meet URL leaked into the client-readable session document');
  expect(typeof s.scheduledStart === 'string' && s.scheduledStart.endsWith('Z'), 'start time not stored as UTC ISO');
});
await check('T08b', 'Non-Meet / look-alike links are rejected (400)', async () => {
  await signInAs(IDS.I1);
  for (const url of ['https://zoom.us/j/123', 'https://meet.google.com.evil.com/abc-defg-hij', 'javascript:alert(1)']) {
    await expectRejected(() => svc.saveBatchLiveSession({ batchId: BATCH, title: '[TEST] bad link', ...later, durationMinutes: 60, meetingUrl: url }), apiCode(400), url);
  }
});
await check('T08c', 'Instructor 2 cannot schedule in / read instructor 1’s batch (403); instructor 1 cannot use batch 2', async () => {
  await signInAs(IDS.I2);
  await expectRejected(() => svc.saveBatchLiveSession({ batchId: BATCH, title: '[TEST] intrusion', ...later, durationMinutes: 60, meetingUrl: MEET }), apiCode(403), 'I2 -> batch 1');
  const t = await auth.currentUser!.getIdToken();
  expect((await raw('POST', '/api/sessions/access', t, { batchId: BATCH, sessionId: soonId, kind: 'join' })).status === 403, 'I2 got a join link for batch 1');
  await signInAs(IDS.I1);
  await expectRejected(() => svc.saveBatchLiveSession({ batchId: BATCH_OTHER, title: '[TEST] intrusion', ...later, durationMinutes: 60, meetingUrl: MEET }), apiCode(403), 'I1 -> batch 2');
});

// 9. students see sessions
await check('T09a', 'Enrolled student A sees both upcoming sessions (without Meet URLs)', async () => {
  await signInAs(IDS.A);
  const list = await svc.listBatchLiveSessions(BATCH, true);
  expect(list.length === 2, `expected 2 sessions, got ${list.length}`);
  expect(list.every((s: any) => !('meetingUrl' in s)), 'meetingUrl present in student-readable data');
});
await check('T09b', 'Join link is released inside the join window and withheld outside it', async () => {
  await signInAs(IDS.A);
  const url = await svc.requestSessionLink(BATCH, soonId, 'join');
  expect(url === MEET, 'wrong link for session starting in 5 min');
  await expectRejected(() => svc.requestSessionLink(BATCH, laterId, 'join'), apiCode(403), 'class tomorrow');
});
await check('T09c', 'Non-enrolled student C cannot read sessions or get a join link', async () => {
  await signInAs(IDS.C);
  await expectRejected(() => svc.listBatchLiveSessions(BATCH, true), isPerm, 'sessions for C');
  await expectRejected(() => svc.requestSessionLink(BATCH, soonId, 'join'), apiCode(403), 'join for C');
});
await check('T09d', 'Attendance: instructor marks enrolled students; non-enrolled student rejected', async () => {
  await signInAs(IDS.I1);
  await svc.saveAttendance(BATCH, soonId, [{ studentId: IDS.A, status: 'present' }, { studentId: IDS.B, status: 'late' }]);
  await expectRejected(() => svc.saveAttendance(BATCH, soonId, [{ studentId: IDS.C, status: 'present' }]), apiCode(400), 'attendance for non-enrolled');
  const a = (await adminDb.collection('batches').doc(BATCH).collection('liveSessions').doc(soonId).collection('attendance').doc(IDS.A).get()).data() as any;
  expect(a?.status === 'present', 'attendance not stored');
});
await check('T09e', 'Student A can read their own attendance (needs the NEW rules deployed)', async () => {
  await signInAs(IDS.A);
  try {
    const own = await svc.getOwnAttendance(BATCH, soonId, IDS.A);
    expect(own?.status === 'present', 'own attendance not readable');
  } catch (e) {
    if (isPerm(e)) throw new Blocked('Denied by the LIVE (old) Firestore rules: the attendance rule is only in the repo’s firestore.rules, which is not deployed');
    throw e;
  }
});
await check('T09f', 'Recording link is released to the enrolled student only after the instructor attaches it', async () => {
  await signInAs(IDS.A);
  await expectRejected(() => svc.requestSessionLink(BATCH, soonId, 'recording'), apiCode(404), 'recording before attach');
  await signInAs(IDS.I1);
  await svc.setSessionRecording(BATCH, soonId, 'https://example.com/e2e-test-recording');
  await signInAs(IDS.A);
  expect((await svc.requestSessionLink(BATCH, soonId, 'recording')).includes('e2e-test-recording'), 'recording link wrong');
  await signInAs(IDS.C);
  await expectRejected(() => svc.requestSessionLink(BATCH, soonId, 'recording'), apiCode(403), 'recording for C');
});

// 10. progress, resources, assignments, certificates
await check('T10a', 'Lesson completion persists across sign-out / sign-in', async () => {
  await signInAs(IDS.A);
  await svc.toggleLessonProgress({ studentId: IDS.A, courseId: COURSE, batchId: BATCH, lessonId: 'e2e_lesson_1', completed: true });
  await signOut(auth);
  await signInAs(IDS.A);
  const p = await svc.listStudentProgress(IDS.A);
  expect(p.some((x) => x.lessonId === 'e2e_lesson_1' && x.completed), 'progress not persisted');
});
await check('T10b', 'Student cannot mark progress for another student', async () => {
  await signInAs(IDS.B);
  await expectRejected(() => svc.toggleLessonProgress({ studentId: IDS.A, courseId: COURSE, batchId: BATCH, lessonId: 'e2e_lesson_2', completed: true }), isPerm, 'progress as A');
});
await check('T10c', 'Assignment: submit (https only) → grade → regrade blocked → resubmit after grading blocked', async () => {
  await signInAs(IDS.A);
  const asgn = (await svc.listBatchAssignments(BATCH))[0];
  await expectRejected(() => svc.submitAssignmentWork({ assignment: asgn, student: { uid: IDS.A } as any, submissionUrl: 'javascript:alert(1)' }), apiCode(400), 'js url');
  const sid = await svc.submitAssignmentWork({ assignment: asgn, student: { uid: IDS.A } as any, submissionUrl: 'https://example.com/e2e-work', notes: 'E2E' });
  await signInAs(IDS.I2);
  await expectRejected(() => svc.gradeSubmission({ submissionId: sid, status: 'graded', score: 90, feedback: '' }), apiCode(403), 'other instructor grading');
  await signInAs(IDS.I1);
  await expectRejected(() => svc.gradeSubmission({ submissionId: sid, status: 'graded', score: 101, feedback: '' }), apiCode(400), 'score above max');
  await svc.gradeSubmission({ submissionId: sid, status: 'graded', score: 85, feedback: 'E2E feedback' });
  await signInAs(IDS.A);
  const mine = (await svc.listStudentSubmissions(IDS.A))[0];
  expect(mine.status === 'graded' && mine.score === 85 && mine.feedback === 'E2E feedback', 'student cannot see grade/feedback');
  await expectRejected(() => svc.submitAssignmentWork({ assignment: asgn, student: { uid: IDS.A } as any, submissionUrl: 'https://example.com/again' }), apiCode(409), 'resubmit after grade');
});
await check('T10d', 'Certificate: not issued while lessons < 80%; issued once eligible; revocable; public verification', async () => {
  await signInAs(IDS.ADMIN);
  const enr = { id: `${IDS.A}_${BATCH}` } as any;
  const first = await raw('POST', '/api/admin/certificates', await auth.currentUser!.getIdToken(), { enrollmentId: enr.id });
  expect(first.status === 409 && first.data.reasons?.includes('LESSONS_INCOMPLETE'), `expected NOT_ELIGIBLE (lessons), got ${first.status}`);
  await signInAs(IDS.A);
  await svc.toggleLessonProgress({ studentId: IDS.A, courseId: COURSE, batchId: BATCH, lessonId: 'e2e_lesson_2', completed: true });
  await signInAs(IDS.ADMIN);
  const code = await svc.adminIssueCertificate({ enrollment: enr, actor: { uid: IDS.ADMIN } as any });
  expect(/^BA-\d{4}-[A-Z2-9]{10}$/.test(code), 'unexpected code format');
  const again = await raw('POST', '/api/admin/certificates', await auth.currentUser!.getIdToken(), { enrollmentId: enr.id });
  expect(again.data.code === code, 'second issue created a different certificate');
  await svc.adminToggleCertificateStatus({ certificate: { id: enr.id } as any, nextStatus: 'revoked', actor: { uid: IDS.ADMIN } as any });
  const v = (await adminDb.collection('certificateVerifications').doc(code).get()).data() as any;
  expect(v.status === 'revoked' && !('studentId' in v), 'verification record not revoked / leaks fields');
  await signOut(auth);
  try {
    const pub = await svc.verifyCertificateCode(code);
    expect(pub?.status === 'revoked', 'public verification wrong');
  } catch (e) {
    if (isPerm(e)) throw new Blocked('Public /verify read is denied by the LIVE rules; certificateVerifications rule exists only in the repo (not deployed). Server-side issue/revoke passed.');
    throw e;
  }
});

// ---------------------------------------------------------------------------
// New rules, tested WITHOUT deploying them, using the Firebase Rules test API
// ---------------------------------------------------------------------------
const DB = config.firestoreDatabaseId as string;
const P = (p: string) => `/databases/${DB}/documents/${p}`;
const rulesSrc = fs.readFileSync('firestore.rules', 'utf-8');
const tokenAdmin = await (adminApp.options.credential as any).getAccessToken();
async function ruleCases(cases: any[]) {
  const res = await realFetch(`https://firebaserules.googleapis.com/v1/projects/${config.projectId}:test`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenAdmin.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: { files: [{ name: 'firestore.rules', content: rulesSrc }] }, testSuite: { testCases: cases } }),
  }).then((r) => r.json());
  if (res.error) throw new Blocked(`Rules test API unavailable: ${String(res.error.message).slice(0, 120)}`);
  if (res.issues?.length) throw new Error(`Rules failed to compile: ${res.issues[0].description}`);
  return (res.testResults ?? []) as { state: string; debugMessages?: string[] }[];
}
const as = (uid: string, role: string) => ({ uid, token: { role, email_verified: true, email: `${uid}@x.test` } });
const mockGet = (p: string, data: any) => ({ function: 'get', args: [{ exactValue: P(p) }], result: { value: { data } } });
const mockExists = (p: string, v: boolean) => ({ function: 'exists', args: [{ exactValue: P(p) }], result: { value: v } });
const approvedEnr = (uid: string) => [mockExists(`enrollments/${uid}_b1`, true), mockGet(`enrollments/${uid}_b1`, { enrollmentStatus: 'approved' })];
const rc = (expectation: 'ALLOW' | 'DENY', uid: string, role: string, p: string, method: string, mocks: any[] = [], data?: any) => ({
  expectation, request: { auth: as(uid, role), path: P(p), method, ...(data ? { resource: { data } } : {}) }, resource: { data: data ?? {} }, functionMocks: mocks,
});
await check('R01', 'NEW rules (not deployed): isolation, role claims, server-only writes, private session data', async () => {
  const cases = [
    rc('DENY', 'sB', 'STUDENT', 'enrollments/sA_b1', 'get', [], { studentId: 'sA', instructorId: 'i1' }),
    rc('ALLOW', 'sA', 'STUDENT', 'enrollments/sA_b1', 'get', [], { studentId: 'sA', instructorId: 'i1' }),
    rc('ALLOW', 'ad', 'SUPER_ADMIN', 'enrollments/sA_b1', 'get', [], { studentId: 'sA', instructorId: 'i1' }),
    rc('DENY', 'sA', 'STUDENT', 'enrollments/sA_b1', 'create', [], { studentId: 'sA', enrollmentStatus: 'approved' }),
    rc('DENY', 'ad', 'SUPER_ADMIN', 'enrollments/sA_b1', 'update', [], { enrollmentStatus: 'approved' }),
    rc('DENY', 'sA', 'STUDENT', 'users/sA', 'create', [], { uid: 'sA', role: 'admin' }),
    rc('DENY', 'sA', 'STUDENT', 'batches/b1/sessionSecrets/s1', 'get', approvedEnr('sA')),
    rc('DENY', 'sA', 'STUDENT', 'batches/b1/liveSessions/s1', 'create', approvedEnr('sA'), { id: 's1' }),
    rc('ALLOW', 'sA', 'STUDENT', 'batches/b1/liveSessions/s1', 'get', approvedEnr('sA')),
    rc('DENY', 'sC', 'STUDENT', 'batches/b1/liveSessions/s1', 'get', [mockExists('enrollments/sC_b1', false)]),
    rc('ALLOW', 'i1', 'INSTRUCTOR', 'batches/b1/sessionSecrets/s1', 'get', [mockExists('batches/b1', true), mockGet('batches/b1', { instructorId: 'i1' })]),
    rc('DENY', 'i2', 'INSTRUCTOR', 'batches/b1/sessionSecrets/s1', 'get', [mockExists('batches/b1', true), mockGet('batches/b1', { instructorId: 'i1' })]),
    rc('DENY', 'sB', 'STUDENT', 'batches/b1/liveSessions/s1/attendance/sA', 'get', approvedEnr('sB')),
    rc('ALLOW', 'sA', 'STUDENT', 'batches/b1/liveSessions/s1/attendance/sA', 'get', approvedEnr('sA')),
    rc('DENY', 'sA', 'STUDENT', 'submissions/sA_a1', 'create', [], { studentId: 'sA' }),
    rc('DENY', 'ad', 'SUPER_ADMIN', 'certificates/sA_b1', 'create', [], { studentId: 'sA' }),
    rc('ALLOW', 'anon', 'STUDENT', 'certificateVerifications/BA-2026-ABCDE12345', 'get'),
    rc('DENY', 'sA', 'STUDENT', 'certificateVerifications/BA-2026-ABCDE12345', 'list'),
    rc('DENY', 'x', 'STUDENT', 'admins/x', 'get'),
  ];
  const out = await ruleCases(cases);
  const bad = out.map((r, i) => ({ i, r })).filter((x) => x.r.state !== 'SUCCESS');
  expect(bad.length === 0, `rule cases failed: ${bad.map((b) => `#${b.i + 1}`).join(', ')}`);
  return `${out.length} cases`;
});

// ---------------------------------------------------------------------------
fs.writeFileSync(
  '.dev-test-accounts.local.txt',
  `Birta Academy DEV test accounts (created by scripts/e2e-local.ts; safe to delete).\n` +
    `Staff login: http://localhost:3001/staff/login  (REQUIRE_ADMIN_MFA=false in .env for local dev)\n\n` +
    Object.entries(passwords).map(([e, p]) => `${e}\t${p}`).join('\n') + '\n'
);
await signOut(auth).catch(() => {});

const pad = (s: string, n: number) => s.padEnd(n);
console.log('\nRESULTS');
for (const r of results) console.log(`${r.status === 'PASS' ? 'PASS   ' : r.status === 'FAIL' ? 'FAIL   ' : 'BLOCKED'} ${pad(r.id, 5)} ${r.title}${r.note ? `\n         -> ${r.note}` : ''}`);
const n = (s: string) => results.filter((r) => r.status === s).length;
console.log(`\nPASS ${n('PASS')}  FAIL ${n('FAIL')}  BLOCKED ${n('BLOCKED')}`);
fs.writeFileSync(path.join(process.env.TEMP || '.', 'birta-e2e-results.json'), JSON.stringify(results, null, 2));
process.exit(n('FAIL') > 0 ? 1 : 0);
