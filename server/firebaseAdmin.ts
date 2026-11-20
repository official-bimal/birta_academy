import { cert, getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'node:fs';
import path from 'node:path';

const config = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'firebase-applet-config.json'), 'utf-8')
) as { projectId: string; firestoreDatabaseId: string };

/**
 * Credentials come from the environment only (never committed):
 *  - GOOGLE_APPLICATION_CREDENTIALS=path\to\service-account.json, or
 *  - FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
 */
function credential() {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  return json ? cert(JSON.parse(json)) : applicationDefault();
}

/** True when Admin SDK credentials are configured (without ever reading their contents). */
export const credentialsConfigured: boolean = (() => {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return true;
  const file = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  return Boolean(file && fs.existsSync(file));
})();

export const adminApp =
  getApps()[0] ?? initializeApp({ credential: credential(), projectId: config.projectId });

export const adminDb = getFirestore(adminApp, config.firestoreDatabaseId);
