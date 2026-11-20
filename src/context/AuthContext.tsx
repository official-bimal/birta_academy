import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  getMultiFactorResolver,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  TotpMultiFactorGenerator,
  updateProfile,
  type MultiFactorResolver,
  type User,
} from 'firebase/auth';
import { auth, googleProvider, parseFirestoreErrorMessage } from '../lib/firebase';
import { getUserProfile } from '../lib/firestoreService';
import { apiFetch, ApiError } from '../lib/api';
import { describeFirebaseAuthError, describeStudentSignInFailure } from '../lib/authErrors';
import { claimToAppRole, isStaffClaim, type AppRole } from '../lib/roles';
import type { UserProfile } from '../types';

export type StaffSignInResult =
  | { status: 'ok'; role: AppRole }
  | { status: 'mfa'; resolver: MultiFactorResolver }
  | { status: 'error' };

export type ActionResult = { ok: true } | { ok: false; message: string };

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  phone?: string;
}

interface AuthContextValue {
  firebaseUser: User | null;
  profile: UserProfile | null;
  loading: boolean;
  authError: string | null;
  clearAuthError: () => void;
  /** Sign-in providers connected to the current account, e.g. ['google.com', 'password'] */
  providers: string[];
  emailVerified: boolean;
  /** Student: Google popup. */
  signInWithGoogle: () => Promise<UserProfile | null>;
  /** Student: email + password. */
  studentEmailSignIn: (email: string, password: string, remember: boolean) => Promise<UserProfile | null>;
  /** Student: manual registration (role is assigned by the server, never by this form). */
  registerStudent: (input: RegisterInput) => Promise<ActionResult>;
  sendReset: (email: string, continuePath: string) => Promise<void>;
  resendVerification: () => Promise<ActionResult>;
  /** Re-reads the user from Firebase (after verifying email, linking a provider, ...). */
  reloadUser: () => Promise<void>;
  /** Staff: one form for instructors and admins. The server-set role claim decides who they are and where they go. */
  staffSignIn: (email: string, password: string, remember: boolean) => Promise<StaffSignInResult>;
  completeStaffMfa: (resolver: MultiFactorResolver, code: string) => Promise<StaffSignInResult>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  isAdmin: boolean;
  isInstructor: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STAFF_LOGIN_ERROR = 'Sign-in failed. Check your email and password, or contact the academy administrator.';
const STUDENT_STAFF_MESSAGE = 'This account is not a student account. Please use the staff login.';

async function buildProfile(user: User, role: AppRole): Promise<UserProfile> {
  let stored: UserProfile | null = null;
  try {
    stored = await getUserProfile(user.uid);
  } catch {
    stored = null;
  }
  return {
    uid: user.uid,
    displayName: stored?.displayName || user.displayName || user.email?.split('@')[0] || 'Birta Learner',
    email: stored?.email || user.email || '',
    phone: stored?.phone,
    city: stored?.city,
    bio: stored?.bio,
    role,
    createdAt: stored?.createdAt,
    updatedAt: stored?.updatedAt,
  };
}

const hasProvider = (u: User, id: string) => u.providerData.some((p) => p.providerId === id);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [, setVersion] = useState(0);
  /** true while an explicit sign-in/registration flow is finalising, so the auth listener does not repeat it */
  const flow = useRef(false);

  const resolveSession = useCallback(async (user: User): Promise<UserProfile | null> => {
    let tokenResult = await user.getIdTokenResult();
    // A returning student whose claim is not set yet is finalised by the trusted server.
    if (!tokenResult.claims.role && (hasProvider(user, 'google.com') || hasProvider(user, 'password'))) {
      await apiFetch('/auth/student-init', { method: 'POST', body: {} });
      tokenResult = await user.getIdTokenResult(true);
    }
    const role = claimToAppRole(tokenResult.claims.role);
    if (!role) return null;
    return buildProfile(user, role);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      if (flow.current) return;
      if (!user) {
        setProfile(null);
        setLoading(false);
        return;
      }
      resolveSession(user)
        .then((p) => setProfile(p))
        .catch((error) => {
          setProfile(null);
          setAuthError(error instanceof ApiError ? describeStudentSignInFailure(error) : parseFirestoreErrorMessage(error));
        })
        .finally(() => setLoading(false));
    });
    return () => unsub();
  }, [resolveSession]);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  const applyPersistence = useCallback(async (remember: boolean) => {
    await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
  }, []);

  /** After any student sign-in: let the server finalise the account, then require a STUDENT claim. */
  const finishStudent = useCallback(async (user: User): Promise<UserProfile | null> => {
    try {
      await apiFetch('/auth/student-init', { method: 'POST', body: {} });
    } catch (error) {
      console.error('[auth] student sign-in finalisation failed', {
        status: error instanceof ApiError ? error.status : undefined,
        code: error instanceof ApiError ? error.code : 'UNKNOWN',
      });
      await signOut(auth);
      setProfile(null);
      setAuthError(describeStudentSignInFailure(error));
      return null;
    }
    const tokenResult = await user.getIdTokenResult(true);
    const role = claimToAppRole(tokenResult.claims.role);
    if (role !== 'student') {
      await signOut(auth);
      setAuthError(STUDENT_STAFF_MESSAGE);
      return null;
    }
    const synced = await buildProfile(user, role);
    setFirebaseUser(user);
    setProfile(synced);
    return synced;
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    flow.current = true;
    try {
      await applyPersistence(true);
      const credential = await signInWithPopup(auth, googleProvider);
      return await finishStudent(credential.user);
    } catch (error) {
      const code = (error as { code?: string }).code;
      console.error('[auth] Google popup failed', { code });
      const message = describeFirebaseAuthError(code, 'login');
      if (message) setAuthError(message);
      return null;
    } finally {
      flow.current = false;
      setLoading(false);
    }
  }, [applyPersistence, finishStudent]);

  const studentEmailSignIn = useCallback(
    async (email: string, password: string, remember: boolean) => {
      setAuthError(null);
      flow.current = true;
      try {
        await applyPersistence(remember);
        const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
        return await finishStudent(cred.user);
      } catch (error) {
        const code = (error as { code?: string }).code;
        console.error('[auth] email sign-in failed', { code });
        setAuthError(describeFirebaseAuthError(code, 'login'));
        return null;
      } finally {
        flow.current = false;
        setLoading(false);
      }
    },
    [applyPersistence, finishStudent]
  );

  const registerStudent = useCallback(
    async (input: RegisterInput): Promise<ActionResult> => {
      setAuthError(null);
      flow.current = true;
      try {
        await applyPersistence(true);
        const cred = await createUserWithEmailAndPassword(auth, input.email.trim(), input.password);
        await updateProfile(cred.user, { displayName: input.name.trim().slice(0, 100) });
        // The server creates the profile and assigns STUDENT; the browser sends no role.
        try {
          await apiFetch('/auth/student-init', { method: 'POST', body: { phone: input.phone?.trim() || undefined } });
        } catch (error) {
          console.error('[auth] registration finalisation failed', { code: error instanceof ApiError ? error.code : 'UNKNOWN' });
          return { ok: false, message: describeStudentSignInFailure(error) };
        }
        await cred.user.getIdToken(true);
        try {
          await sendEmailVerification(cred.user, { url: `${window.location.origin}/student` });
        } catch (error) {
          console.error('[auth] verification email failed', { code: (error as { code?: string }).code });
        }
        setFirebaseUser(cred.user);
        setProfile(await buildProfile(cred.user, 'student'));
        return { ok: true };
      } catch (error) {
        const code = (error as { code?: string }).code;
        console.error('[auth] registration failed', { code });
        return { ok: false, message: describeFirebaseAuthError(code, 'register') };
      } finally {
        flow.current = false;
        setLoading(false);
      }
    },
    [applyPersistence]
  );

  const sendReset = useCallback(async (email: string, continuePath: string) => {
    try {
      await sendPasswordResetEmail(auth, email.trim(), { url: `${window.location.origin}${continuePath}` });
    } catch (error) {
      // Never reveal whether the account exists; only log for developers.
      console.error('[auth] password reset request failed', { code: (error as { code?: string }).code });
    }
  }, []);

  const resendVerification = useCallback(async (): Promise<ActionResult> => {
    const user = auth.currentUser;
    if (!user) return { ok: false, message: 'Please sign in first.' };
    try {
      await sendEmailVerification(user, { url: `${window.location.origin}/student` });
      return { ok: true };
    } catch (error) {
      const code = (error as { code?: string }).code;
      return { ok: false, message: code === 'auth/too-many-requests' ? 'Please wait a minute before requesting another email.' : 'We could not send the email right now. Please try again later.' };
    }
  }, []);

  const reloadUser = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) return;
    await reload(user);
    await user.getIdToken(true);
    setFirebaseUser(user);
    setVersion((v) => v + 1);
  }, []);

  const finishStaff = useCallback(async (user: User): Promise<StaffSignInResult> => {
    const tokenResult = await user.getIdTokenResult(true);
    const role = claimToAppRole(tokenResult.claims.role);
    // Only a server-set staff claim is accepted here. Students and unknown accounts are refused with a generic message.
    if (!isStaffClaim(tokenResult.claims.role)) {
      await signOut(auth);
      setAuthError(STAFF_LOGIN_ERROR);
      return { status: 'error' };
    }
    setProfile(await buildProfile(user, role as AppRole));
    return { status: 'ok', role: role as AppRole };
  }, []);

  const staffSignIn = useCallback(
    async (email: string, password: string, remember: boolean): Promise<StaffSignInResult> => {
      setAuthError(null);
      flow.current = true;
      try {
        await applyPersistence(remember);
        const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
        return await finishStaff(cred.user);
      } catch (error) {
        if ((error as { code?: string }).code === 'auth/multi-factor-auth-required') {
          return { status: 'mfa', resolver: getMultiFactorResolver(auth, error as never) };
        }
        console.error('[auth] staff sign-in failed', { code: (error as { code?: string }).code });
        setAuthError(STAFF_LOGIN_ERROR);
        return { status: 'error' };
      } finally {
        flow.current = false;
        setLoading(false);
      }
    },
    [applyPersistence, finishStaff]
  );

  const completeStaffMfa = useCallback(
    async (resolver: MultiFactorResolver, code: string): Promise<StaffSignInResult> => {
      setAuthError(null);
      flow.current = true;
      try {
        const hint = resolver.hints.find((h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID);
        if (!hint) throw new Error('No authenticator enrolled');
        const assertion = TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code.trim());
        const cred = await resolver.resolveSignIn(assertion);
        return await finishStaff(cred.user);
      } catch {
        setAuthError('That code was not accepted. Try the current code from your authenticator app.');
        return { status: 'error' };
      } finally {
        flow.current = false;
        setLoading(false);
      }
    },
    [finishStaff]
  );

  const logout = useCallback(async () => {
    await signOut(auth);
    setProfile(null);
    setFirebaseUser(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (auth.currentUser) {
      setProfile(await resolveSession(auth.currentUser));
    }
  }, [resolveSession]);

  const isAdmin = profile?.role === 'admin';
  const isInstructor = profile?.role === 'instructor' || profile?.role === 'admin';
  const providers = firebaseUser ? firebaseUser.providerData.map((p) => p.providerId) : [];

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        loading,
        authError,
        clearAuthError,
        providers,
        emailVerified: firebaseUser?.emailVerified ?? false,
        signInWithGoogle,
        studentEmailSignIn,
        registerStudent,
        sendReset,
        resendVerification,
        reloadUser,
        staffSignIn,
        completeStaffMfa,
        logout,
        refreshProfile,
        isAdmin,
        isInstructor,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
