import {
  EmailAuthProvider,
  linkWithCredential,
  linkWithPopup,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  unlink,
  updatePassword,
} from 'firebase/auth';
import { auth, googleProvider } from './firebase';
import { describeFirebaseAuthError } from './authErrors';

export type LinkResult = { ok: true } | { ok: false; message: string };

const fail = (error: unknown, kind: 'link' | 'reauth' | 'password'): LinkResult => {
  const code = (error as { code?: string }).code;
  console.error('[auth] account linking step failed', { code });
  if (code === 'auth/user-mismatch') {
    return { ok: false, message: 'That is a different Google account from the one you signed in with. Nothing was changed.' };
  }
  return { ok: false, message: describeFirebaseAuthError(code, kind) || 'Cancelled.' };
};

/**
 * Google-created account -> add an email+password sign-in to the SAME Firebase identity (same UID).
 * Recent authentication is required: the student re-confirms with Google first. The password is attached to the
 * account's own email address only; the browser cannot choose a different email, so no other identity can be merged.
 */
export async function addPasswordToAccount(newPassword: string): Promise<LinkResult> {
  const user = auth.currentUser;
  if (!user || !user.email) return { ok: false, message: 'Please sign in first.' };
  if (user.providerData.some((p) => p.providerId === 'password')) return { ok: false, message: 'A password is already set for this account.' };
  if (!user.providerData.some((p) => p.providerId === 'google.com')) return { ok: false, message: 'Sign in with Google to add a password.' };
  try {
    await reauthenticateWithPopup(user, googleProvider);
  } catch (error) {
    return fail(error, 'reauth');
  }
  try {
    await linkWithCredential(user, EmailAuthProvider.credential(user.email, newPassword));
    await user.reload();
    await user.getIdToken(true);
    return { ok: true };
  } catch (error) {
    return fail(error, 'link');
  }
}

/**
 * Password-created account -> connect Google. Requires the current password (recent authentication). If the Google
 * account already belongs to another Birta identity Firebase refuses (credential-already-in-use) and we do NOT merge.
 */
export async function linkGoogleToAccount(currentPassword: string): Promise<LinkResult> {
  const user = auth.currentUser;
  if (!user || !user.email) return { ok: false, message: 'Please sign in first.' };
  if (user.providerData.some((p) => p.providerId === 'google.com')) return { ok: false, message: 'Google is already connected.' };
  try {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
  } catch (error) {
    return fail(error, 'password');
  }
  try {
    await linkWithPopup(user, googleProvider);
    await user.reload();
    await user.getIdToken(true);
    return { ok: true };
  } catch (error) {
    return fail(error, 'link');
  }
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<LinkResult> {
  const user = auth.currentUser;
  if (!user || !user.email) return { ok: false, message: 'Please sign in first.' };
  try {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
  } catch (error) {
    return fail(error, 'password');
  }
  try {
    await updatePassword(user, newPassword);
    return { ok: true };
  } catch (error) {
    return fail(error, 'link');
  }
}

/** Remove a sign-in method, but never the last one. */
export async function unlinkProvider(providerId: 'google.com' | 'password'): Promise<LinkResult> {
  const user = auth.currentUser;
  if (!user) return { ok: false, message: 'Please sign in first.' };
  if (user.providerData.length < 2) return { ok: false, message: 'You need at least one way to sign in.' };
  try {
    await unlink(user, providerId);
    await user.reload();
    return { ok: true };
  } catch (error) {
    return fail(error, 'link');
  }
}
