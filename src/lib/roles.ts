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
  | { allow: false; reason: 'NOT_GOOGLE' | 'EMAIL_UNVERIFIED' | 'STAFF_ACCOUNT' };

/**
 * Decides whether a Google sign-in may become / continue as a STUDENT.
 * Google sign-in can never create or upgrade a staff account, and never downgrades one.
 */
export function decideStudentSignIn(input: {
  signInProvider: string | undefined;
  emailVerified: boolean;
  existingClaim: unknown;
  existingProfileRole: string | undefined;
}): StudentSignInDecision {
  if (input.signInProvider !== 'google.com') return { allow: false, reason: 'NOT_GOOGLE' };
  if (!input.emailVerified) return { allow: false, reason: 'EMAIL_UNVERIFIED' };
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
