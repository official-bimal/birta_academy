import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  getMultiFactorResolver,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  TotpMultiFactorGenerator,
  type MultiFactorResolver,
  type User,
} from 'firebase/auth';
import { auth, googleProvider, parseFirestoreErrorMessage } from '../lib/firebase';
import { getUserProfile } from '../lib/firestoreService';
import { apiFetch, ApiError } from '../lib/api';
import { claimToAppRole, isStaffClaim, type AppRole } from '../lib/roles';
import type { UserProfile } from '../types';

export type StaffSignInResult =
  | { status: 'ok'; role: AppRole }
  | { status: 'mfa'; resolver: MultiFactorResolver }
  | { status: 'error' };

interface AuthContextValue {
  firebaseUser: User | null;
  profile: UserProfile | null;
  loading: boolean;
  authError: string | null;
  /** Student flow only. */
  signInWithGoogle: () => Promise<UserProfile | null>;
  /** Staff flow only (SUPER_ADMIN / INSTRUCTOR). */
  staffSignIn: (email: string, password: string) => Promise<StaffSignInResult>;
  completeStaffMfa: (resolver: MultiFactorResolver, code: string) => Promise<StaffSignInResult>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  isAdmin: boolean;
  isInstructor: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STAFF_LOGIN_ERROR = 'Sign-in failed. Check your email and password, or contact the academy administrator.';
const STUDENT_STAFF_MESSAGE = 'This account is not a student account. Please use the staff login.';

/** Builds the profile for a signed-in user. The role always comes from the verified token claim. */
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const resolveSession = useCallback(async (user: User): Promise<UserProfile | null> => {
    let tokenResult = await user.getIdTokenResult();
    // A returning Google student whose claim is not set yet is finalised by the trusted server.
    if (!tokenResult.claims.role && user.providerData.some((p) => p.providerId === 'google.com')) {
      await apiFetch('/auth/student-init', { method: 'POST' });
      tokenResult = await user.getIdTokenResult(true);
    }
    const role = claimToAppRole(tokenResult.claims.role);
    if (!role) return null;
    return buildProfile(user, role);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      if (!user) {
        setProfile(null);
        setLoading(false);
        return;
      }
      resolveSession(user)
        .then((p) => setProfile(p))
        .catch((error) => {
          setProfile(null);
          setAuthError(error instanceof ApiError ? 'Could not verify your account. Please try again.' : parseFirestoreErrorMessage(error));
        })
        .finally(() => setLoading(false));
    });
    return () => unsub();
  }, [resolveSession]);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    try {
      const credential = await signInWithPopup(auth, googleProvider);
      try {
        await apiFetch('/auth/student-init', { method: 'POST' });
      } catch (error) {
        await signOut(auth);
        setProfile(null);
        setAuthError(
          error instanceof ApiError && error.code === 'USE_STAFF_LOGIN'
            ? STUDENT_STAFF_MESSAGE
            : 'We could not complete sign-in. Please try again.'
        );
        return null;
      }
      const tokenResult = await credential.user.getIdTokenResult(true);
      const role = claimToAppRole(tokenResult.claims.role);
      if (role !== 'student') {
        await signOut(auth);
        setAuthError(STUDENT_STAFF_MESSAGE);
        return null;
      }
      const synced = await buildProfile(credential.user, role);
      setProfile(synced);
      return synced;
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        setAuthError(parseFirestoreErrorMessage(error));
      }
      return null;
    }
  }, []);

  const finishStaff = useCallback(async (user: User): Promise<StaffSignInResult> => {
    const tokenResult = await user.getIdTokenResult(true);
    if (!isStaffClaim(tokenResult.claims.role)) {
      // Students (or unknown accounts) can never use the staff door.
      await signOut(auth);
      setAuthError(STAFF_LOGIN_ERROR);
      return { status: 'error' };
    }
    const role = claimToAppRole(tokenResult.claims.role) as AppRole;
    setProfile(await buildProfile(user, role));
    return { status: 'ok', role };
  }, []);

  const staffSignIn = useCallback(
    async (email: string, password: string): Promise<StaffSignInResult> => {
      setAuthError(null);
      try {
        const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
        return await finishStaff(cred.user);
      } catch (error) {
        if ((error as { code?: string }).code === 'auth/multi-factor-auth-required') {
          return { status: 'mfa', resolver: getMultiFactorResolver(auth, error as never) };
        }
        setAuthError(STAFF_LOGIN_ERROR);
        return { status: 'error' };
      }
    },
    [finishStaff]
  );

  const completeStaffMfa = useCallback(
    async (resolver: MultiFactorResolver, code: string): Promise<StaffSignInResult> => {
      setAuthError(null);
      try {
        const hint = resolver.hints.find((h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID);
        if (!hint) throw new Error('No authenticator enrolled');
        const assertion = TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code.trim());
        const cred = await resolver.resolveSignIn(assertion);
        return await finishStaff(cred.user);
      } catch {
        setAuthError('That code was not accepted. Try the current code from your authenticator app.');
        return { status: 'error' };
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

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        loading,
        authError,
        signInWithGoogle,
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
