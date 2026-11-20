import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import { describeStudentSignInFailure } from './authErrors';

describe('describeStudentSignInFailure', () => {
  it('tells staff accounts to use the staff login', () => {
    expect(describeStudentSignInFailure(new ApiError(403, 'USE_STAFF_LOGIN'))).toMatch(/staff login/);
  });
  it.each(['NETWORK', 'SERVICE_UNAVAILABLE', 'SERVICE_NOT_CONFIGURED'])('reports %s as temporarily unavailable', (code) => {
    expect(describeStudentSignInFailure(new ApiError(503, code))).toMatch(/temporarily unavailable/);
  });
  it('never leaks technical details for unknown errors', () => {
    const msg = describeStudentSignInFailure(new Error('Could not load the default credentials at /secret/path'));
    expect(msg).toBe('We could not complete sign-in. Please try again.');
  });
});
