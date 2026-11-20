# Local end-to-end report (real Firebase dev project, local API)

Run with `npm run dev:all` then `npm run test:e2e` (`scripts/e2e-local.ts`). Uses only records whose ids start with `e2e_` (labelled `[TEST]`, `isDemo: true`) and fake payment references; no real payments. Client paths use the app's own code under the **live** Firestore rules.

Last run (after deploying the repo `firestore.rules` to the live project on 2026-11-21): **32 PASS, 0 FAIL, 2 BLOCKED**, plus a manual browser check.

Rules deployment note: the first deployment regressed reads of not-yet-existing documents (the live AI Studio rules contained `resource == null` guards that were missing from the repo copy). The e2e run caught it (lesson progress writes denied); the guards were ported into `firestore.rules` and redeployed. The previous live rules are backed up locally (git-ignored `backups/`).

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
| T09e | Student reads own attendance | PASS (new rules live) |
| T10a-c | Lesson progress persists across sign-out/in; cannot write another student's; assignment submit/grade/re-grade/resubmit rules | PASS |
| T10d | Certificate: refused until eligible, issued once, revoked; public `/verify` read | PASS (new rules live) |
| R01 | Pre-deploy test via Rules test API | BLOCKED (permission); superseded by the live checks above |
| UI | `/admin` and `/instructor` show "Access Restricted" for a signed-in student; `/student` shows approved course, verified payment, both live classes | PASS (manual, in browser) |

## Findings and fixes made during testing
- API returned an opaque error for rate limiting; now `RATE_LIMITED` (JSON) with a friendly message. Limits are configurable via `RATE_LIMIT_SENSITIVE` / `RATE_LIMIT_INIT`.
- Admin SDK now loads the key file explicitly so it can sign locally (no IAM `signBlob` API needed).
- Student dashboard "Next live sessions" now shows Nepal time, consistent with the Live Classes tab.

## Blocked: actions only the project owner can take
1. **Enable Email/Password sign-in** (Firebase Console -> Authentication -> Sign-in method -> Email/Password -> Enable -> Save). Verified still OFF via the Identity Toolkit config on 2026-11-21 (`signIn.email` absent). Without it nobody can use `/staff/login`.
2. ~~Deploy `firestore.rules`~~ Done on 2026-11-21 (owner-approved). Side effect: the owner's legacy `admin` profile no longer grants admin in the browser; run `npm run bootstrap:admin -- --email <owner email> --force` to get a real SUPER_ADMIN.
3. Optional: enable MFA (TOTP) so Super Admin actions work with `REQUIRE_ADMIN_MFA=true`.
