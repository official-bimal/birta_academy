/**
 * Role model shared by the browser app and the trusted server.
 * Canonical roles live in Firebase custom claims (`role`), which only the server can set.
 * The app keeps its internal lower-case role names; map with the helpers below.
 */
export const CLAIM_ROLES = ['SUPER_ADMIN', 'INSTRUCTOR', 'STUDENT'] as const;
export type ClaimRole = (typeof CLAIM_ROLES)[number];
export type AppRole = 'admin' | 'instructor' | 'student';

export function isClaimRole(value: unknown): value is ClaimRole {
  return typeof value === 'string' && (CLAIM_ROLES as readonly string[]).includes(value);
}

export function claimToAppRole(claim: unknown): AppRole | null {
  switch (claim) {
    case 'SUPER_ADMIN':
      return 'admin';
    case 'INSTRUCTOR':
      return 'instructor';
    case 'STUDENT':
      return 'student';
    default:
      return null;
  }
}

export function isStaffClaim(claim: unknown): boolean {
  return claim === 'SUPER_ADMIN' || claim === 'INSTRUCTOR';
}

/** The destination is decided only by the authenticated role, never by user input. */
export function homeRouteForRole(role: AppRole | null): string {
  switch (role) {
    case 'admin':
      return '/admin';
    case 'instructor':
      return '/instructor';
    case 'student':
      return '/student';
    default:
      return '/login';
  }
}

export type StudentSignInDecision =
  | { allow: true; createProfile: boolean }
  | { allow: false; reason: 'PROVIDER_NOT_ALLOWED' | 'EMAIL_UNVERIFIED' | 'STAFF_ACCOUNT' };

/**
 * Decides whether a sign-in may become / continue as a STUDENT.
 *  - Google: the email must be verified by Google.
 *  - Email/password: allowed even when unverified (the account then has limited access until the email is
 *    verified; privileged student operations require a verified email).
 * Neither path can create or upgrade a staff account, and neither ever downgrades one.
 */
export function decideStudentSignIn(input: {
  signInProvider: string | undefined;
  emailVerified: boolean;
  existingClaim: unknown;
  existingProfileRole: string | undefined;
}): StudentSignInDecision {
  const provider = input.signInProvider;
  if (provider !== 'google.com' && provider !== 'password') return { allow: false, reason: 'PROVIDER_NOT_ALLOWED' };
  if (provider === 'google.com' && !input.emailVerified) return { allow: false, reason: 'EMAIL_UNVERIFIED' };
  if (isStaffClaim(input.existingClaim)) return { allow: false, reason: 'STAFF_ACCOUNT' };
  if (input.existingProfileRole === 'admin' || input.existingProfileRole === 'instructor') {
    return { allow: false, reason: 'STAFF_ACCOUNT' };
  }
  return { allow: true, createProfile: input.existingProfileRole === undefined };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateInstructorInvite(body: unknown):
  | { ok: true; name: string; email: string }
  | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid request.' };
  const { name, email } = body as Record<string, unknown>;
  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) {
    return { ok: false, error: 'Name must be 2–100 characters.' };
  }
  if (typeof email !== 'string' || email.length > 200 || !EMAIL_RE.test(email.trim())) {
    return { ok: false, error: 'Enter a valid email address.' };
  }
  return { ok: true, name: name.trim(), email: email.trim().toLowerCase() };
}

/** Optional phone number captured at registration (profile data only; never used for authorisation). */
export function sanitizePhone(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const v = value.trim();
  return /^\+?[0-9 ()-]{7,20}$/.test(v) ? v : undefined;
}

/** The staff form only states which role is expected; the server-set claim must match it exactly. */
export function isExpectedStaffRole(claim: unknown, expected: 'admin' | 'instructor'): boolean {
  return isStaffClaim(claim) && claimToAppRole(claim) === expected;
}
