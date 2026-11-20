/**
 * Shows (and, only with --apply, changes) the Firebase Authentication settings this app needs:
 *   - Email/Password sign-in provider enabled (students + staff)
 *   - Server-enforced password policy matching the app's policy (min 10, upper, lower, number, symbol)
 * Nothing is changed without --apply. Email-enumeration protection and the Google provider are left untouched.
 *   npm run configure:auth            (read-only report)
 *   npm run configure:auth -- --apply
 */
import 'dotenv/config';
import fs from 'node:fs';
import { adminApp } from '../server/firebaseAdmin.ts';

const cfg = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf-8'));
const tok = await (adminApp.options.credential as any).getAccessToken();
const base = `https://identitytoolkit.googleapis.com/admin/v2/projects/${cfg.projectId}/config`;
const headers = { Authorization: `Bearer ${tok.access_token}`, 'Content-Type': 'application/json' };
const current = (await fetch(base, { headers }).then((r) => r.json())) as any;

const wantPolicy = {
  passwordPolicyEnforcementState: 'ENFORCE',
  forceUpgradeOnSignin: false,
  passwordPolicyVersions: [{ customStrengthOptions: { minPasswordLength: 10, maxPasswordLength: 128, containsLowercaseCharacter: true, containsUppercaseCharacter: true, containsNumericCharacter: true, containsNonAlphanumericCharacter: true } }],
};
console.log('Email/Password provider enabled:', Boolean(current.signIn?.email?.enabled));
console.log('Password policy enforced       :', current.passwordPolicyConfig?.passwordPolicyEnforcementState === 'ENFORCE');
console.log('Email enumeration protection   :', Boolean(current.emailPrivacyConfig?.enableImprovedEmailPrivacy));
console.log('MFA                            :', current.mfa?.state ?? 'unknown');

if (!process.argv.includes('--apply')) {
  console.log('\nRead-only. Re-run with --apply to enable Email/Password sign-in and enforce the password policy.');
  process.exit(0);
}
const body = { signIn: { email: { enabled: true, passwordRequired: true } }, passwordPolicyConfig: wantPolicy };
const res = await fetch(`${base}?updateMask=signIn.email,passwordPolicyConfig`, { method: 'PATCH', headers, body: JSON.stringify(body) }).then((r) => r.json());
console.log(res.error ? `FAILED: ${String(res.error.message).slice(0, 200)}` : 'Applied. Email/Password enabled; password policy enforced.');
process.exit(res.error ? 1 : 0);
