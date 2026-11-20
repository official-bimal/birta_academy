# Test matrix for the 20 required checks

Legend: **Unit** = automated by `npm test` (Vitest, no network). **Smoke** = checked manually against the local build. **Not tested** = needs real Firebase / emulator / signed-in browser session.

| # | Check | Status | Evidence |
|---|---|---|---|
| 1 | Student Google signup | Not tested | Logic in `decideStudentSignIn`; real Google popup needs staging |
| 2 | New account gets STUDENT only | Unit (policy) | `src/lib/roles.test.ts`; server assigns claim in `/api/auth/student-init` (not run) |
| 3 | Student cannot become Instructor/Admin | Unit (policy) | Staff claims/profiles are rejected; rules block client role writes (rules not run) |
| 4 | Admin-provisioned instructor login | Not tested | `/api/admin/instructors` + `/staff/login` written, not run |
| 5 | Secure Super Admin login | Not tested | Bootstrap script + MFA code written, not run |
| 6 | Role-based redirects | Unit (mapping) | `homeRouteForRole`; Smoke: `/admin` unauthenticated -> `/staff/login` |
| 7 | Unauthorized route rejection | Smoke | `ProtectedRoute` redirect observed unauthenticated; role mismatch not exercised |
| 8 | Unauthorized backend rejection | Smoke | Unauthenticated calls to all new endpoints return 401; role checks not exercised |
| 9 | Instructor cannot access another's batch | Not tested | `loadManagedBatch` enforces it server-side; no test |
| 10 | Admin creates/publishes courses | Not tested | Original AI Studio client code, unchanged and untested |
| 11 | Student can enroll | Unit (validation) | `enrollmentPolicy.test.ts`; transaction not run |
| 12 | Payment approval activates access | Unit (policy) | Transitions, idempotency, capacity in `enrollmentPolicy.test.ts`; transaction not run |
| 13 | Instructor schedules Meet session | Unit (validation) | `sessions.test.ts` (Meet URL, NPT->UTC); endpoint not run |
| 14 | Student sees only authorized classes | Not tested | Rules + `/api/sessions/access` written, not run |
| 15 | Join button obeys timing | Unit | `sessionPhase`/`canJoin` in `sessions.test.ts`; server re-checks |
| 16 | Lesson completion persists after reload | Not tested | Original client code, untested |
| 17 | Assignment submissions work | Unit (rules logic) | `certificates.test.ts` (late, resubmit, grade); endpoint not run |
| 18 | Certificate eligibility verified | Unit | `evaluateCertificateEligibility`; issuing endpoint not run |
| 19 | Mobile and desktop layouts | Smoke | Home, courses, login, staff login viewed at desktop and 375px (dark). Light mode, dashboards not reviewed |
| 20 | Application builds | Verified | `tsc --noEmit` (strict) and `vite build` pass; production server serves SPA + API |

Gaps that matter most before launch: Firestore rules emulator tests, an end-to-end run with real Firebase credentials, and an accessibility pass (keyboard navigation, contrast in light mode).
