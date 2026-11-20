/**
 * Protected bootstrap of the first SUPER_ADMIN. Run locally by the academy owner with service-account
 * credentials in the environment. Nothing is hardcoded and no password is typed or printed: the script
 * creates the account with an unusable random password and prints a one-time link where the owner sets
 * their own password. Refuses to run if a SUPER_ADMIN already exists (unless --force).
 *
 *   npm run bootstrap:admin -- --email owner@example.com --name "Owner Name"
 */
import 'dotenv/config';
import crypto from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { adminApp, adminDb } from '../server/firebaseAdmin.ts';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const email = arg('email')?.trim().toLowerCase();
const name = arg('name')?.trim() || 'Super Admin';
const force = process.argv.includes('--force');
if (!email) {
  console.error('Usage: npm run bootstrap:admin -- --email <email> [--name "<name>"] [--force]');
  process.exit(1);
}

const auth = getAuth(adminApp);

const existing = await adminDb.collection('users').where('role', '==', 'admin').limit(1).get();
if (!existing.empty && !force) {
  console.error('A SUPER_ADMIN already exists. Use the admin console, or pass --force to add another.');
  process.exit(1);
}

let uid: string;
try {
  uid = (await auth.getUserByEmail(email)).uid;
  console.log('Existing auth user found; promoting to SUPER_ADMIN.');
} catch {
  uid = (
    await auth.createUser({
      email,
      displayName: name,
      password: crypto.randomBytes(32).toString('base64url'),
    })
  ).uid;
}

await auth.setCustomUserClaims(uid, { role: 'SUPER_ADMIN' });
await auth.revokeRefreshTokens(uid);
await adminDb.collection('users').doc(uid).set(
  { uid, displayName: name, email, role: 'admin', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() },
  { merge: true }
);
await adminDb.collection('auditLogs').add({
  actorId: 'bootstrap',
  actorEmail: '',
  action: 'BOOTSTRAP_SUPER_ADMIN',
  targetCollection: 'users',
  targetId: uid,
  summary: `Bootstrapped super admin ${email}`,
  createdAt: FieldValue.serverTimestamp(),
});

const link = await auth.generatePasswordResetLink(email);
console.log('\nSUPER_ADMIN ready. Open this one-time link to set your password, then enrol an authenticator app');
console.log('at /staff/security before using the admin console:\n');
console.log(link, '\n');
process.exit(0);
