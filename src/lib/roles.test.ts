import { describe, expect, it } from 'vitest';
import {
  claimToAppRole,
  decideStudentSignIn,
  homeRouteForRole,
  isStaffClaim,
  validateInstructorInvite,
} from './roles';

const google = { signInProvider: 'google.com', emailVerified: true };

describe('student Google sign-in policy', () => {
  it('creates a profile for a brand-new verified Google user', () => {
    expect(decideStudentSignIn({ ...google, existingClaim: undefined, existingProfileRole: undefined })).toEqual({
      allow: true,
      createProfile: true,
    });
  });

  it('lets an existing student sign in again without recreating the profile', () => {
    expect(decideStudentSignIn({ ...google, existingClaim: 'STUDENT', existingProfileRole: 'student' })).toEqual({
      allow: true,
      createProfile: false,
    });
  });

  it.each(['SUPER_ADMIN', 'INSTRUCTOR'])('never downgrades or reuses a %s account', (claim) => {
    expect(decideStudentSignIn({ ...google, existingClaim: claim, existingProfileRole: undefined })).toEqual({
      allow: false,
      reason: 'STAFF_ACCOUNT',
    });
  });

  it.each(['admin', 'instructor'])('rejects when the stored profile role is %s', (role) => {
    expect(decideStudentSignIn({ ...google, existingClaim: undefined, existingProfileRole: role })).toEqual({
      allow: false,
      reason: 'STAFF_ACCOUNT',
    });
  });

  it('rejects non-Google providers and unverified emails', () => {
    expect(decideStudentSignIn({ signInProvider: 'password', emailVerified: true, existingClaim: undefined, existingProfileRole: undefined }).allow).toBe(false);
    expect(decideStudentSignIn({ signInProvider: 'google.com', emailVerified: false, existingClaim: undefined, existingProfileRole: undefined }).allow).toBe(false);
  });
});

describe('role routing', () => {
  it('maps claims to app roles and destinations', () => {
    expect(claimToAppRole('SUPER_ADMIN')).toBe('admin');
    expect(claimToAppRole('INSTRUCTOR')).toBe('instructor');
    expect(claimToAppRole('STUDENT')).toBe('student');
    expect(claimToAppRole('ROOT')).toBeNull();
    expect(homeRouteForRole('admin')).toBe('/admin');
    expect(homeRouteForRole('instructor')).toBe('/instructor');
    expect(homeRouteForRole('student')).toBe('/student');
    expect(homeRouteForRole(null)).toBe('/login');
  });

  it('only treats SUPER_ADMIN and INSTRUCTOR as staff', () => {
    expect(isStaffClaim('STUDENT')).toBe(false);
    expect(isStaffClaim(undefined)).toBe(false);
    expect(isStaffClaim('SUPER_ADMIN')).toBe(true);
  });
});

describe('instructor invite validation', () => {
  it('normalises valid input', () => {
    expect(validateInstructorInvite({ name: '  Asha Rai ', email: ' Asha@Example.com ' })).toEqual({
      ok: true,
      name: 'Asha Rai',
      email: 'asha@example.com',
    });
  });

  it('rejects bad names, emails and non-objects', () => {
    expect(validateInstructorInvite({ name: 'A', email: 'a@b.co' }).ok).toBe(false);
    expect(validateInstructorInvite({ name: 'Asha', email: 'not-an-email' }).ok).toBe(false);
    expect(validateInstructorInvite(null).ok).toBe(false);
    expect(validateInstructorInvite({ name: 'Asha', email: 'a@b.co', role: 'SUPER_ADMIN' })).toMatchObject({ ok: true });
  });
});
