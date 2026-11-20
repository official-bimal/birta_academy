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
      case 'RATE_LIMITED':
        return 'Too many attempts. Please wait a few minutes and try again.';
      case 'NOT_ALLOWED':
        return 'Please sign in with Google or with a registered email and password.';
      default:
        break;
    }
  }
  return 'We could not complete sign-in. Please try again.';
}

export type AuthContextKind = 'register' | 'login' | 'reset' | 'link' | 'reauth' | 'password';

/**
 * Safe messages for Firebase Auth errors. Deliberately vague where specifics would reveal whether an
 * account exists (account enumeration), and never exposes provider details.
 */
export function describeFirebaseAuthError(code: string | undefined, kind: AuthContextKind): string {
  switch (code) {
    case 'auth/email-already-in-use':
      return kind === 'register'
        ? 'We could not create an account with these details. If you already have an account, sign in or reset your password.'
        : 'That sign-in method is already connected to a different account, so it cannot be linked. Nothing was changed.';
    case 'auth/credential-already-in-use':
    case 'auth/account-exists-with-different-credential':
      return 'That sign-in method is already connected to a different account, so it cannot be linked. Nothing was changed.';
    case 'auth/provider-already-linked':
      return 'That sign-in method is already connected to your account.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
    case 'auth/missing-password':
      return kind === 'reauth' || kind === 'password'
        ? 'The password you entered is incorrect.'
        : 'Incorrect email or password.';
    case 'auth/weak-password':
      return 'Please choose a stronger password.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a few minutes, or reset your password.';
    case 'auth/user-disabled':
      return 'This account is unavailable. Please contact the academy.';
    case 'auth/operation-not-allowed':
      return 'Email and password sign-in is not available yet. Please use Google, or contact the academy.';
    case 'auth/requires-recent-login':
      return 'For your security, please confirm it is you and try again.';
    case 'auth/network-request-failed':
      return 'Network problem. Check your connection and try again.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.';
    case 'auth/unauthorized-domain':
      return 'This site is not yet authorised for Google sign-in. Please contact the academy.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return '';
    default:
      return kind === 'reset'
        ? 'We could not send the reset email right now. Please try again later.'
        : 'Something went wrong. Please try again.';
  }
}
