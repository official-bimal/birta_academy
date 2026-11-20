/**
 * Authentication end-to-end checks against the REAL Firebase dev project and the LOCAL API.
 *   npm run dev:all   (RATE_LIMIT_SENSITIVE / RATE_LIMIT_INIT raised for the run)
 *   npm run test:auth
 *
 * Creates/deletes ONLY test users whose email ends in @birta-e2e.test. Never touches real users.
 * Email links are simulated by generating the one-time link with the Admin SDK and applying its oobCode through the
 * same Identity Toolkit endpoints the hosted Firebase pages call. Nothing sensitive is printed.
 * Google popups cannot be automated; the Google-provider cases are covered by linking an Admin-created Google identity.
 */
import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp } from 'firebase/app';
import {
  EmailAuthProvider,
  createUserWithEmailAndPassword,
  getAuth as getClientAuth,
  linkWithCredential,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { adminApp, adminDb } from '../server/firebaseAdmin.ts';

for (const ev of ['uncaughtException', 'unhandledRejection'] as const) {
  process.on(ev, (e) => {
    console.error('FATAL:', String((e as Error)?.message ?? e).split('\n')[0].slice(0, 200));
    process.exit(2);
  });
}
const API = process.env.E2E_API || 'http://localhost:8787';
const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf-8'));
const adminAuth = getAuth(adminApp);
const DOM = 'birta-e2e.test';
const OWNER = 'official.bimalb@gmail.com';
const strong = () => `Zx-${crypto.randomBytes(9).toString('base64url')}-7q!`;

type Result = { id: string; title: string; status: 'PASS' | 'FAIL' | 'BLOCKED'; note?: string };
const results: Result[] = [];
class Blocked extends Error {}
const expect: (c: unknown, m: string) => asserts c = (c, m) => {
  if (!c) throw new Error(m);
};
async function check(id: string, title: string, fn: () => Promise<string | void>) {
  try {
    const note = await fn();
    results.push({ id, title, status: 'PASS', note: note || undefined });
  } catch (e) {
    results.push({ id, title, status: e instanceof Blocked ? 'BLOCKED' : 'FAIL', note: (e as Error).message.split('\n')[0].slice(0, 220) });
  }
}

// ---- infrastructure -------------------------------------------------------
async function identityConfig() {
  const tok = await (adminApp.options.credential as any).getAccessToken();
  return fetch(`https://identitytoolkit.googleapis.com/admin/v2/projects/${config.projectId}/config`, { headers: { Authorization: `Bearer ${tok.access_token}` } }).then((r) => r.json()) as Promise<any>;
}
const providerEnabled = Boolean((await identityConfig()).signIn?.email?.enabled);
const needEmail = () => {
  if (!providerEnabled) throw new Blocked('Email/Password sign-in provider is DISABLED in Firebase (Authentication > Sign-in method). Enable it, then rerun.');
};
const device = (name: string) => getClientAuth(initializeApp(config, name));
const code = (e: unknown) => (e as { code?: string }).code ?? 'unknown';
async function rest(endpoint: string, body: unknown) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/${endpoint}?key=${config.apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { ok: r.ok, data: (await r.json()) as any };
}
const oob = (link: string) => new URL(link).searchParams.get('oobCode')!;
async function api(method: string, p: string, token: string | null, body?: unknown) {
  const res = await fetch(API + p, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body && method !== 'GET' ? { 'Content-Type': 'application/json' } : {}) }, body: body && method !== 'GET' ? JSON.stringify(body) : undefined });
  return { status: res.status, data: (await res.json().catch(() => ({}))) as any };
}
async function viaCustom(uid: string, name: string) {
  const a = device(name);
  await signInWithCustomToken(a, await adminAuth.createCustomToken(uid));
  return { user: a.currentUser!, token: await a.currentUser!.getIdToken(true) };
}
const userDocs = async (uid: string) => (await adminDb.collection('users').doc(uid).get()).data() as any;

async function deleteTestUser(email: string) {
  try {
    const u = await adminAuth.getUserByEmail(email);
    await adminDb.collection('users').doc(u.uid).delete();
    await adminAuth.deleteUser(u.uid);
  } catch { /* not present */ }
}
async function makeStaff(uid: string, role: 'INSTRUCTOR' | 'SUPER_ADMIN', pw: string) {
  const email = `${uid.replace(/_/g, '-')}@${DOM}`;
  await deleteTestUser(email);
  await adminAuth.createUser({ uid, email, password: pw, emailVerified: true, displayName: `[TEST] ${uid}` });
  await adminAuth.setCustomUserClaims(uid, { role });
  await adminDb.collection('users').doc(uid).set({ uid, displayName: `[TEST] ${uid}`, email, role: role === 'SUPER_ADMIN' ? 'admin' : 'instructor', createdAt: new Date(), updatedAt: new Date() });
  return email;
}

// ---- snapshot the real owner (T24) ----------------------------------------
const ownerBefore = await (async () => {
  const u = await adminAuth.getUserByEmail(OWNER);
  const d = await userDocs(u.uid);
  return { uid: u.uid, claim: u.customClaims?.role, providers: u.providerData.map((p) => p.providerId).sort().join(','), role: d?.role, createdAt: String(d?.createdAt?.toMillis?.() ?? '') };
})();

// ---- cleanup of previous runs ----------------------------------------------
for (const n of ['reg', 'gl', 'dup', 'invited']) await deleteTestUser(`e2e-auth-${n}@${DOM}`);
const pwInstr = strong();
const pwAdmin = strong();
const emailInstr = await makeStaff('e2e_auth_instr', 'INSTRUCTOR', pwInstr);
const emailAdmin = await makeStaff('e2e_auth_admin', 'SUPER_ADMIN', pwAdmin);

const regEmail = `e2e-auth-reg@${DOM}`;
const regPw = strong();
let regUid = '';
const d1 = device('device1');

// T02 ------------------------------------------------------------------------
await check('T02', 'Student email/password signup: Firebase account + server-assigned STUDENT claim + one profile', async () => {
  needEmail();
  const cred = await createUserWithEmailAndPassword(d1, regEmail, regPw);
  regUid = cred.user.uid;
  await updateProfile(cred.user, { displayName: 'E2E Reg User' });
  const tok = await cred.user.getIdToken();
  // hostile body: a browser tries to choose its role
  const r = await api('POST', '/api/auth/student-init', tok, { phone: '+977 9800000000', role: 'SUPER_ADMIN', claim: 'INSTRUCTOR', displayName: 'x' });
  expect(r.status === 200 && r.data.role === 'STUDENT', `student-init ${r.status}`);
  const u = await adminAuth.getUser(regUid);
  expect(u.customClaims?.role === 'STUDENT', 'claim is not STUDENT');
  const d = await userDocs(regUid);
  expect(d.role === 'student' && d.displayName === 'E2E Reg User' && d.phone === '+977 9800000000', 'profile wrong');
  expect(u.emailVerified === false, 'email should start unverified');
});

// T03 ------------------------------------------------------------------------
await check('T03', 'Email verification: unverified student is limited; verifying unlocks it', async () => {
  needEmail();
  const tok = await d1.currentUser!.getIdToken(true);
  const before = await api('POST', '/api/enrollments', tok, { batchId: 'e2e_batch_test', paymentMethod: 'bank_transfer', paymentReference: 'E2E-AUTH-TEST' });
  expect(before.status === 403 && before.data.error === 'EMAIL_NOT_VERIFIED', `unverified enrollment not blocked (${before.status})`);
  const link = await adminAuth.generateEmailVerificationLink(regEmail);
  const v = await rest('accounts:update', { oobCode: oob(link) });
  expect(v.ok, 'verification code was not accepted');
  const tok2 = await d1.currentUser!.getIdToken(true);
  const after = await api('POST', '/api/enrollments', tok2, { batchId: 'e2e_batch_test', paymentMethod: 'bank_transfer', paymentReference: 'E2E-AUTH-TEST' });
  expect(after.data.error !== 'EMAIL_NOT_VERIFIED' && after.status !== 403, `verified student still blocked (${after.status})`);
  expect((await adminAuth.getUser(regUid)).emailVerified === true, 'not verified in Firebase');
});

// T05/T06/T10/T21-ish ---------------------------------------------------------
await check('T05', 'Student login with email + password; wrong password rejected without detail', async () => {
  needEmail();
  await signOut(d1);
  const cred = await signInWithEmailAndPassword(d1, regEmail, regPw);
  expect(cred.user.uid === regUid, 'different uid');
  const claim = (await cred.user.getIdTokenResult(true)).claims.role;
  expect(claim === 'STUDENT', 'claim missing');
  const bad = [code(await signInWithEmailAndPassword(device('bad1'), regEmail, 'Wrong-Pass-1!').catch((e) => e)), code(await signInWithEmailAndPassword(device('bad2'), `nobody-${Date.now()}@${DOM}`, 'Wrong-Pass-1!').catch((e) => e))];
  expect(bad[0] === bad[1], `wrong-password and unknown-email differ (${bad.join(' / ')}): account enumeration`);
});
await check('T06', 'Logout, then login from a second, independent device session: same UID and profile', async () => {
  needEmail();
  await signOut(d1);
  const d2 = device('device2');
  const cred = await signInWithEmailAndPassword(d2, regEmail, regPw);
  expect(cred.user.uid === regUid, 'uid differs between devices');
  const all = await adminDb.collection('users').where('email', '==', regEmail).get();
  expect(all.size === 1, `expected 1 profile, found ${all.size}`);
});
await check('T10', 'Repeated sign-in / init (even concurrent) never duplicates or rewrites the profile', async () => {
  needEmail();
  const before = await userDocs(regUid);
  const tok = await device('device3');
  const cred = await signInWithEmailAndPassword(tok, regEmail, regPw);
  const t = await cred.user.getIdToken();
  const rs = await Promise.all([1, 2, 3, 4, 5].map(() => api('POST', '/api/auth/student-init', t, {})));
  expect(rs.every((r) => r.status === 200), 'an init call failed');
  const all = await adminDb.collection('users').where('email', '==', regEmail).get();
  const after = await userDocs(regUid);
  expect(all.size === 1 && after.createdAt.toMillis() === before.createdAt.toMillis() && after.displayName === before.displayName, 'profile duplicated or rewritten');
});

// T19 ------------------------------------------------------------------------
await check('T19', 'Duplicate signup is refused without revealing the account, and creates no second profile', async () => {
  needEmail();
  const err = await createUserWithEmailAndPassword(device('dup1'), regEmail, strong()).then(() => null, (e) => e);
  expect(code(err) === 'auth/email-already-in-use', `duplicate not refused (${code(err)})`);
  const all = await adminDb.collection('users').where('email', '==', regEmail).get();
  expect(all.size === 1, 'second profile created');
  const { describeFirebaseAuthError } = await import('../src/lib/authErrors.ts');
  expect(!/(already (registered|exists|in use)|is registered|exists)/i.test(describeFirebaseAuthError('auth/email-already-in-use', 'register')), 'message confirms the account exists');
  return 'note: Firebase still returns email-already-in-use to the client; the UI message is non-revealing, but a server-side signup would be needed to hide it from direct API callers';
});

// T07 ------------------------------------------------------------------------
const glEmail = `e2e-auth-gl@${DOM}`;
const glPw = strong();
let glUid = '';
await check('T07', 'Google-created student adds a password to the SAME identity (same UID, no duplicate profile)', async () => {
  needEmail();
  // an Admin-created identity that has the Google provider (stand-in for a Google popup, which cannot be automated)
  const u = await adminAuth.createUser({ email: glEmail, emailVerified: true, displayName: 'E2E Google User' });
  glUid = u.uid;
  await adminAuth.updateUser(glUid, { providerToLink: { providerId: 'google.com', uid: `e2e-g-${Date.now()}`, email: glEmail, displayName: 'E2E Google User' } });
  await adminAuth.setCustomUserClaims(glUid, { role: 'STUDENT' });
  await adminDb.collection('users').doc(glUid).set({ uid: glUid, displayName: 'E2E Google User', email: glEmail, role: 'student', createdAt: new Date(), updatedAt: new Date() });
  const ca = device('gl1');
  await signInWithCustomToken(ca, await adminAuth.createCustomToken(glUid));
  await linkWithCredential(ca.currentUser!, EmailAuthProvider.credential(glEmail, glPw));
  const rec = await adminAuth.getUser(glUid);
  expect(rec.providerData.some((p) => p.providerId === 'google.com') && rec.providerData.some((p) => p.providerId === 'password'), 'providers not both present');
  const login = await signInWithEmailAndPassword(device('gl2'), glEmail, glPw);
  expect(login.user.uid === glUid, 'password login resolved to a different uid');
  const docs = await adminDb.collection('users').where('email', '==', glEmail).get();
  expect(docs.size === 1, 'duplicate profile');
  return 'reauth-by-Google popup step itself not automatable';
});

// T08 ------------------------------------------------------------------------
await check('T08', 'Password student links Google (popup + conflict handling)', async () => {
  throw new Blocked('Needs a real Google popup. Run manually from /student/settings/security. Conflict wording is unit-tested; Firebase refuses credential-already-in-use and nothing is merged.');
});

// T09 ------------------------------------------------------------------------
await check('T09', 'Forgot password: generic response, one-time link sets a new password, old one stops working', async () => {
  needEmail();
  const { describeFirebaseAuthError } = await import('../src/lib/authErrors.ts');
  expect(describeFirebaseAuthError('auth/user-not-found', 'reset').length > 0, 'message missing');
  const newPw = strong();
  const link = await adminAuth.generatePasswordResetLink(regEmail);
  const r = await rest('accounts:resetPassword', { oobCode: oob(link), newPassword: newPw });
  expect(r.ok, 'reset code rejected');
  const again = await rest('accounts:resetPassword', { oobCode: oob(link), newPassword: strong() });
  expect(!again.ok, 'reset link could be used twice');
  const e = await signInWithEmailAndPassword(device('r1'), regEmail, regPw).then(() => null, (x) => x);
  expect(e, 'old password still works');
  const ok = await signInWithEmailAndPassword(device('r2'), regEmail, newPw);
  expect(ok.user.uid === regUid, 'new password login failed');
});

// T11 / T17 / T18 / T20 ------------------------------------------------------
await check('T11', 'Super Admin signs in with staff credentials and holds the SUPER_ADMIN claim', async () => {
  needEmail();
  const cred = await signInWithEmailAndPassword(device('adm1'), emailAdmin, pwAdmin);
  expect((await cred.user.getIdTokenResult(true)).claims.role === 'SUPER_ADMIN', 'claim missing');
});
await check('T12', 'Admin invites an instructor: account + INSTRUCTOR claim + one-time activation link, no password in response', async () => {
  const adm = await viaCustom('e2e_auth_admin', 'adm2');
  const r = await api('POST', '/api/admin/instructors', adm.token, { name: '[TEST] Auth Invited', email: `e2e-auth-invited@${DOM}` });
  expect(r.status === 201 && String(r.data.activationLink).includes('oobCode'), `invite failed (${r.status} ${r.data.error ?? ''})`);
  expect(Object.keys(r.data).every((k) => !/password/i.test(k)), 'password field present');
  expect((await adminAuth.getUserByEmail(`e2e-auth-invited@${DOM}`)).customClaims?.role === 'INSTRUCTOR', 'claim wrong');
  (globalThis as any).__invite = r.data.activationLink;
});
await check('T13', 'Instructor activates via the one-time link (sets own password) and logs in as INSTRUCTOR', async () => {
  needEmail();
  const link = (globalThis as any).__invite as string;
  expect(link, 'no invitation from T12');
  const mine = strong();
  const r = await rest('accounts:resetPassword', { oobCode: oob(link), newPassword: mine });
  expect(r.ok, 'activation code rejected');
  expect((await rest('accounts:resetPassword', { oobCode: oob(link), newPassword: strong() })).ok === false, 'activation link reusable');
  const cred = await signInWithEmailAndPassword(device('inv1'), `e2e-auth-invited@${DOM}`, mine);
  const tr = await cred.user.getIdTokenResult(true);
  expect(tr.claims.role === 'INSTRUCTOR', 'claim not INSTRUCTOR');
  const adm = await api('POST', '/api/admin/instructors', await cred.user.getIdToken(), { name: 'x y', email: 'x@y.co' });
  expect(adm.status === 403, 'instructor reached an admin API');
});
await check('T14', 'No public instructor/admin registration: hostile student signups cannot yield staff, and a staff email cannot be re-registered', async () => {
  needEmail();
  const dupStaff = await createUserWithEmailAndPassword(device('hs1'), emailInstr, strong()).then(() => null, (e) => e);
  expect(code(dupStaff) === 'auth/email-already-in-use', 'staff email could be re-registered');
  const u = await adminAuth.getUser(regUid);
  expect(u.customClaims?.role === 'STUDENT', 'registered student is not plain STUDENT');
  const t = await signInWithEmailAndPassword(device('hs2'), regEmail, strong()).then(() => null, (e) => e).catch(() => null);
  void t;
});
await check('T17', 'Instructor token is rejected by every Super Admin API', async () => {
  const tok = (await viaCustom('e2e_auth_instr', 'in1')).token;
  for (const [m, p] of [['POST', '/api/admin/instructors'], ['POST', '/api/admin/certificates'], ['POST', '/api/admin/enrollments/x/review'], ['GET', '/api/admin/enrollments/x/eligibility']]) {
    expect((await api(m, p, tok, { a: 1 })).status === 403, `${p} not 403`);
  }
});
await check('T18', 'Account-type choice never changes real permissions: a staff login for the wrong role is refused, and staff cannot be turned into students', async () => {
  const { isExpectedStaffRole } = await import('../src/lib/roles.ts');
  const instr = await viaCustom('e2e_auth_instr', 'c1');
  const claim = (await instr.user.getIdTokenResult(true)).claims.role;
  expect(isExpectedStaffRole(claim, 'instructor') && !isExpectedStaffRole(claim, 'admin'), 'form expectation not enforced');
  // staff signs in by password and calls the STUDENT initialiser: must be refused and must not change the role
  const r = await api('POST', '/api/auth/student-init', instr.token, { role: 'STUDENT' });
  expect(r.status === 403, `staff student-init not refused (${r.status})`);
  expect((await adminAuth.getUser('e2e_auth_instr')).customClaims?.role === 'INSTRUCTOR', 'staff claim was altered');
  expect((await userDocs('e2e_auth_instr')).role === 'instructor', 'staff profile altered');
});
await check('T20', 'Linking conflicts cannot take over a staff account', async () => {
  needEmail();
  // A Google-only student identity tries to attach a password credential for a STAFF email.
  const g2 = `e2e-auth-g2@${DOM}`;
  await deleteTestUser(g2);
  const u = await adminAuth.createUser({ email: g2, emailVerified: true });
  await adminAuth.updateUser(u.uid, { providerToLink: { providerId: 'google.com', uid: `e2e-g2-${Date.now()}`, email: g2 } });
  await adminAuth.setCustomUserClaims(u.uid, { role: 'STUDENT' });
  const a = device('lk1');
  await signInWithCustomToken(a, await adminAuth.createCustomToken(u.uid));
  const outcome = await linkWithCredential(a.currentUser!, EmailAuthProvider.credential(emailInstr, strong())).then(() => 'linked', (e) => code(e));
  const staff = await adminAuth.getUserByEmail(emailInstr);
  const after = await adminAuth.getUser(u.uid);
  await deleteTestUser(g2);
  expect(staff.customClaims?.role === 'INSTRUCTOR' && staff.uid === 'e2e_auth_instr', 'staff identity changed');
  expect(!after.providerData.some((p) => p.providerId === 'password' && p.email === emailInstr) || outcome !== 'linked', 'student now holds the staff email credential');
  expect(outcome !== 'linked', 'a student linked a staff email credential');
  return `refused (${outcome}); Google-credential conflicts rely on Firebase refusing credential-already-in-use (popup, manual)`;
});

// T14b / T23 -----------------------------------------------------------------
await check('T23', 'Protected APIs reject missing, malformed and wrong-role tokens', async () => {
  for (const p of ['/api/enrollments', '/api/submissions', '/api/sessions/access', '/api/staff/sessions', '/api/admin/instructors', '/api/admin/certificates']) {
    expect((await api('POST', p, null, {})).status === 401, `${p} not 401 without token`);
    expect((await api('POST', p, 'not.a.token', {})).status === 401, `${p} not 401 with junk token`);
  }
});

// T24 ------------------------------------------------------------------------
await check('T24', 'Existing owner SUPER_ADMIN unchanged by all of the above', async () => {
  const u = await adminAuth.getUserByEmail(OWNER);
  const d = await userDocs(u.uid);
  const now = { uid: u.uid, claim: u.customClaims?.role, providers: u.providerData.map((p) => p.providerId).sort().join(','), role: d?.role, createdAt: String(d?.createdAt?.toMillis?.() ?? '') };
  expect(JSON.stringify(now) === JSON.stringify(ownerBefore), 'owner identity changed');
  expect(now.claim === 'SUPER_ADMIN' && now.role === 'admin', 'owner no longer SUPER_ADMIN');
});

// cleanup of the temporary student ids (keeps staff test users for manual testing)
for (const n of ['reg', 'gl', 'dup']) await deleteTestUser(`e2e-auth-${n}@${DOM}`);
await deleteTestUser(`e2e-auth-invited@${DOM}`);
fs.writeFileSync(
  '.dev-test-accounts.local.txt',
  (fs.existsSync('.dev-test-accounts.local.txt') ? fs.readFileSync('.dev-test-accounts.local.txt', 'utf-8') + '\n' : '') +
    `# from test:auth (staff, password sign-in at /staff/login)\n${emailInstr}\t${pwInstr}\n${emailAdmin}\t${pwAdmin}\n`
);

console.log('\nRESULTS (email/password provider enabled: ' + providerEnabled + ')');
for (const r of results) console.log(`${r.status === 'PASS' ? 'PASS   ' : r.status === 'FAIL' ? 'FAIL   ' : 'BLOCKED'} ${r.id.padEnd(4)} ${r.title}${r.note ? `\n         -> ${r.note}` : ''}`);
const n = (s: string) => results.filter((r) => r.status === s).length;
console.log(`\nPASS ${n('PASS')}  FAIL ${n('FAIL')}  BLOCKED ${n('BLOCKED')}`);
process.exit(n('FAIL') > 0 ? 1 : 0);
