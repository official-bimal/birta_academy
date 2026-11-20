# Authentication v2

## Account types and entry points

| Type | How it is created | Sign-in | Lands on |
|---|---|---|---|
| STUDENT | Public: Google, or email + password at `/student/register` | `/student/login` (Google or email/password) | `/student` |
| INSTRUCTOR | Super Admin invites (name + email). Server creates the identity with an unusable random password and returns a one-time activation link; the instructor sets their own password | `/staff/login?as=instructor` (email + password only) | `/instructor` |
| SUPER_ADMIN | `npm run bootstrap:admin` (trusted, local, refuses if one exists) | `/staff/login?as=admin` (email + password, MFA) | `/admin` |

`/login` is only a chooser. Choosing a card (or a staff tab) selects which form is shown. The destination and permissions come from the role claim the **server** set; the staff form only states which role is *expected* and a mismatch is refused (`isExpectedStaffRole`).

Routes: `/login`, `/register` (-> `/student/register`), `/student/login`, `/student/register`, `/staff/login`, `/forgot-password[?for=staff]`, `/verify-email`, `/student/settings/security`, `/staff/security` (TOTP enrolment).

## How roles are assigned

- Roles are Firebase custom claims set only by the Admin SDK (`server/index.ts`, `scripts/bootstrap-super-admin.ts`). Firestore rules read `request.auth.token.role`.
- `POST /api/auth/student-init` (the only way a STUDENT claim/profile is created) accepts Google or password sign-ins, ignores any role in the body, runs in a transaction (no duplicate profile under concurrency), and refuses accounts that are staff by claim or by stored profile.
- Email/password students may exist unverified, but `POST /api/enrollments` and `/api/submissions` return `EMAIL_NOT_VERIFIED`, and the student area redirects them to `/verify-email`.

## Account linking (Student -> Security)

- Google account -> **Set password**: re-authenticates with Google, then `linkWithCredential(EmailAuthProvider.credential(user.email, pw))`. The email is the account's own; the browser cannot supply another.
- Password account -> **Connect Google**: re-authenticates with the current password, then `linkWithPopup`. If that Google account belongs to another Firebase user, Firebase returns `credential-already-in-use`; the app reports it and **never merges**.
- Same Firebase UID throughout, so enrolments and profile stay attached. Unlinking never removes the last method.
- Staff are never linked/merged with students: the student initialiser refuses staff, and a staff email cannot be registered through the student form.

## Abuse controls

- Login errors are identical for wrong password and unknown email; signup duplicate wording does not confirm an account; password reset always shows the same message. Firebase email-enumeration protection is ON for this project.
- API rate limits (`express-rate-limit`), Firebase's own throttling (`auth/too-many-requests`), revoked tokens checked on every API call.
- Production fails closed: the server refuses to start with `NODE_ENV=production` and `REQUIRE_ADMIN_MFA=false`. `REQUIRE_ADMIN_MFA=false` is **development only**.
- Password policy (UI): >=10 chars, upper, lower, number, symbol, no email/name/common words. For server-side enforcement run `npm run configure:auth -- --apply` (project-level Firebase password policy).

## Known residual risks / manual steps

- Firebase "link accounts that use the same email" behaviour (Console -> Authentication -> Settings) decides what happens when a Google sign-in meets a pre-existing *unverified* password account with the same email. Keep the default, which replaces the unverified password credential.
- MFA must be enabled in Firebase (TOTP) before production admin use.
- Google popups cannot be automated; Google link/reauth paths are verified manually.
- Add `www.birtaacademy.com` to Authentication -> Authorized domains before launch, and set `APP_URL`.

## Test status (2026-11-21, real Firebase dev project)

`npm run test:auth`: **17 PASS, 0 FAIL, 1 BLOCKED** (T08, needs a real Google popup). Email/Password sign-in and the server password policy were enabled with `npm run configure:auth -- --apply` (owner-approved). Also verified by hand in the browser: register page -> `/verify-email` -> verification detected -> `/student`; session survives a full reload; sign out -> `/student/login`; email/password sign-in -> `/student`; security page lists connected providers.

Residual: Firebase still returns `auth/email-already-in-use` to a direct API caller on duplicate signup (the UI message is non-revealing); hiding it fully needs a server-side signup endpoint.
