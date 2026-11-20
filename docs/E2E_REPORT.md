# Local end-to-end report (real Firebase dev project, local API)

Run with `npm run dev:all` then `npm run test:e2e` (`scripts/e2e-local.ts`). Uses only records whose ids start with `e2e_` (labelled `[TEST]`, `isDemo: true`) and fake payment references; no real payments. Client paths use the app's own code under the **live** Firestore rules.

Last run: **30 PASS, 0 FAIL, 4 BLOCKED**, plus a manual browser check.

| ID | Check | Result |
|---|---|---|
| T01 | Real Google student has `STUDENT` claim + Firestore profile (name, createdAt) | PASS |
| T02a-d | Unauthenticated -> 401; STUDENT and INSTRUCTOR denied admin/staff endpoints (403); instructor cannot enroll | PASS |
| T03a-c | Student B cannot read A's enrollment/progress/profile; cannot escalate own role; cannot create enrollments directly | PASS (under live rules) |
| T04a-b | Bootstrap creates SUPER_ADMIN (claim + profile); refuses a second one without `--force` | PASS |
| T04c | Staff email/password login | **BLOCKED**: Email/Password provider is disabled in the Firebase project |
| T04d | Student account cannot use staff password login | PASS |
| T04e | Admin invites instructor: account + `INSTRUCTOR` claim + one-time link, no password exposed, duplicates 409 | PASS (link not followed; needs email) |
| T06a-e | Enrollment ignores tampered price/instructor; locked before approval; pending cannot be completed; verified approval + audit, idempotent; scholarship waiver; 3rd student rejected at capacity | PASS |
| T07a-b | Approved student reads lessons/resources; non-enrolled student denied | PASS |
| T08a-c | Instructor schedules Meet class (UTC stored, URL not in readable doc); non-Meet/look-alike links rejected; other instructor denied both ways | PASS |
| T09a-d,f | Enrolled student lists sessions (no URL); join link only inside window; non-enrolled denied; attendance marked for enrolled only; recording released only after attach | PASS |
| T09e | Student reads own attendance | **BLOCKED**: needs the new rules deployed |
| T10a-c | Lesson progress persists across sign-out/in; cannot write another student's; assignment submit/grade/re-grade/resubmit rules | PASS |
| T10d | Certificate: refused until eligible, issued once, revoked; public `/verify` read | server side PASS; public read **BLOCKED** (new rules not deployed) |
| R01 | New `firestore.rules` tested without deploying | **BLOCKED**: service account lacks Rules test permission (no Java for the emulator either) |
| UI | `/admin` and `/instructor` show "Access Restricted" for a signed-in student; `/student` shows approved course, verified payment, both live classes | PASS (manual, in browser) |

## Findings and fixes made during testing
- API returned an opaque error for rate limiting; now `RATE_LIMITED` (JSON) with a friendly message. Limits are configurable via `RATE_LIMIT_SENSITIVE` / `RATE_LIMIT_INIT`.
- Admin SDK now loads the key file explicitly so it can sign locally (no IAM `signBlob` API needed).
- Student dashboard "Next live sessions" now shows Nepal time, consistent with the Live Classes tab.

## Blocked: actions only the project owner can take
1. **Enable Email/Password sign-in** (Firebase Console -> Authentication -> Sign-in method). Without it nobody can use `/staff/login`.
2. **Review and deploy `firestore.rules`.** The live rules are still the original AI Studio ones (hard-coded owner email as admin, browser-writable enrollments/submissions/certificates, none of the new collections). Until deployed, the hardening in this repo does not protect the live database.
3. Optional: enable MFA (TOTP) so Super Admin actions work with `REQUIRE_ADMIN_MFA=true`.
