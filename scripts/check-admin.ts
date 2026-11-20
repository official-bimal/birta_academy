/**
 * Verifies the trusted server can reach Firebase with the configured Admin credentials.
 *   npm run check:admin
 * Prints only pass/fail and the project id; never secrets.
 */
import 'dotenv/config';
import { getAuth } from 'firebase-admin/auth';
import { adminApp, adminDb, credentialsConfigured } from '../server/firebaseAdmin.ts';

if (!credentialsConfigured) {
  console.error('FAIL: no Admin credentials. Set GOOGLE_APPLICATION_CREDENTIALS (path to an existing service-account JSON) or FIREBASE_SERVICE_ACCOUNT_JSON in .env');
  process.exit(1);
}
try {
  await getAuth(adminApp).listUsers(1);
  console.log('PASS: Firebase Authentication reachable');
  await adminDb.collection('users').limit(1).get();
  console.log('PASS: Firestore reachable (database id from firebase-applet-config.json)');
} catch (e) {
  console.error('FAIL:', (e as Error).message.split('\n')[0]);
  process.exit(1);
}
process.exit(0);
