# Birta Academy: staging and production deployment guide

Nothing here has been run against live infrastructure. Do each step deliberately; several have cost implications.

## Architecture

- **Browser app**: Vite + React, built to `dist/`.
- **Trusted API + static server**: `server/index.ts` (Express + `firebase-admin`). Serves `dist/` and `/api/*` on one origin, so no CORS.
- **Data/Auth**: Firebase Authentication + Firestore (database id in `firebase-applet-config.json`).
- **Roles**: Firebase custom claims `SUPER_ADMIN` / `INSTRUCTOR` / `STUDENT`, set only by the server. Firestore rules read the claim.
- **All privileged writes** (enrollment, payment approval, sessions, attendance, submissions, grading, certificates, instructor invites) go through the API.

## One-time Firebase setup (you do this; I have not)

1. **Service account**: Firebase Console -> Project settings -> Service accounts -> generate key. Store outside the repo. Set `GOOGLE_APPLICATION_CREDENTIALS` (path) or `FIREBASE_SERVICE_ACCOUNT_JSON` on the server only.
2. **Authentication**: enable Google (students) and Email/Password (staff). Add your domains under Authorized domains (`www.birtaacademy.com`, staging host).
3. **MFA**: enable multi-factor authentication with TOTP (authenticator app). This may require upgrading to Identity Platform. Until enabled, Super Admin actions return `MFA_REQUIRED`. Only for local development: `REQUIRE_ADMIN_MFA=false`.
4. **Deploy rules**: `firebase deploy --only firestore:rules` (review `firestore.rules` first). The rules no longer allow browser writes to users, enrollments, sessions, submissions or certificates.
5. **Indexes**: the server uses equality filters plus an `in` filter on `enrollments` (batchId + enrollmentStatus). If Firestore reports a missing index, follow the link in the server log.
6. **Bootstrap the first Super Admin** (locally, with credentials set):
   ```
   npm run bootstrap:admin -- --email owner@example.com --name "Owner Name"
   ```
   Open the printed one-time link, set a password, sign in at `/staff/login`, then enrol an authenticator at `/staff/security` and sign in again.
7. **Legacy data**: remove any old `meetingUrl` fields from existing `liveSessions` documents; the `admins` collection is retired.

## Environment variables (server)

| Variable | Purpose |
|---|---|
| `GOOGLE_APPLICATION_CREDENTIALS` or `FIREBASE_SERVICE_ACCOUNT_JSON` | Admin SDK credentials (secret) |
| `APP_URL` | Public site URL used in activation links, e.g. `https://www.birtaacademy.com` |
| `PORT` | Listen port (Dockerfile uses 8080) |
| `REQUIRE_ADMIN_MFA` | Keep `true` outside local development |

Never put these in the browser bundle or commit them. `.env*` and `*service-account*.json` are git-ignored.

## Build and run

```
npm install --legacy-peer-deps
npm run build          # -> dist/
npm run server         # serves dist/ and /api on $PORT
```

or build the container: `docker build -t birta-academy .`

Host the container on any HTTPS platform (Cloud Run, Render, Fly, a VPS behind a TLS proxy). **Hosting may cost money; choose and approve it yourself.** Terminate TLS at the platform; the server sets HSTS.

## Domain (www.birtaacademy.com)

DNS is not configured by this project. At your registrar, point `www` (CNAME) to the host's target, redirect the apex to `www`, wait for the platform's managed certificate, then add the domain to Firebase Authorized domains and set `APP_URL`.

## Security headers

`helmet` plus a `Content-Security-Policy-Report-Only` header are enabled. Load the staging site, watch the browser console for violations (Google sign-in popup, fonts), adjust `server/index.ts`, then switch the header to enforcing `Content-Security-Policy`.

## Backups and recovery

- Enable Firestore scheduled backups (Firebase Console -> Firestore -> Disaster recovery) and/or run `gcloud firestore export gs://<bucket>` on a schedule.
- Test a restore into a separate project before relying on it.
- Keep the service-account key and bootstrap details in a password manager.

## Monitoring

- Server logs go to stdout (platform log viewer). Failed operations log with a label (`student-init failed`, `review failed`, ...).
- Add an uptime check on `GET /api/health` and alerting on 5xx rates.
- Audit trail: the `auditLogs` collection is visible in the admin console.

## Before launch checklist

- [ ] Rules deployed and exercised in the Firebase Emulator Suite (needs Java + `firebase-tools`; not done here).
- [ ] Real Google sign-in, instructor invite, MFA enrolment and role redirects tested on staging.
- [ ] Real courses, batches, payment instructions and academy contact details entered (replace demo data and placeholders).
- [ ] Refund policy, privacy policy and terms reviewed by the academy (drafts only).
- [ ] Logo replaced by vector / high-resolution export.
- [ ] Protected video/file hosting decided (recordings and lesson videos are currently pasted links).
