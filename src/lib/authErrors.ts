import { ApiError } from './api';

/** Maps a failed student sign-in finalisation to a safe, user-facing message (no technical details). */
export function describeStudentSignInFailure(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'USE_STAFF_LOGIN':
        return 'This account is not a student account. Please use the staff login.';
      case 'NETWORK':
      case 'SERVICE_UNAVAILABLE':
      case 'SERVICE_NOT_CONFIGURED':
        return 'Sign-in is temporarily unavailable. Please try again in a few minutes, or contact the academy.';
      case 'NOT_ALLOWED':
        return 'Please sign in with a verified Google account.';
      default:
        break;
    }
  }
  return 'We could not complete sign-in. Please try again.';
}
