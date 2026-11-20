import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { MultiFactorResolver } from 'firebase/auth';
import { Alert, AuthCard, AuthLayout, PasswordField, PrimaryButton, TextField } from '../../components/auth/AuthParts';
import { useAuth } from '../../context/AuthContext';
import { homeRouteForRole } from '../../lib/roles';
import { isValidEmail } from '../../lib/passwordPolicy';

/**
 * Staff sign-in for instructors and super admins (email + password only; no Google, no public registration).
 * There is no role picker: the server-set role claim decides who the person is and where they land.
 */
export function StaffLoginPage() {
  const { profile, loading, authError, clearAuthError, staffSignIn, completeStaffMfa } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [code, setCode] = useState('');
  const [resolver, setResolver] = useState<MultiFactorResolver | null>(null);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    clearAuthError();
  }, [clearAuthError]);

  useEffect(() => {
    if (!loading && profile && profile.role !== 'student') navigate(homeRouteForRole(profile.role), { replace: true });
  }, [loading, profile, navigate]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!resolver && (!isValidEmail(email) || !password)) return;
    setBusy(true);
    try {
      const result = resolver ? await completeStaffMfa(resolver, code) : await staffSignIn(email, password, remember);
      if (result.status === 'mfa') setResolver(result.resolver);
      if (result.status === 'ok') navigate(homeRouteForRole(result.role), { replace: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <AuthCard title="Staff sign-in" subtitle="For instructors and administrators of Birta Academy.">
        {authError && <Alert>{authError}</Alert>}

        <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
          {resolver ? (
            <TextField label="Authenticator code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus value={code} onChange={(e) => setCode(e.target.value)} className="font-mono tracking-widest" hint="Enter the 6-digit code from your authenticator app." />
          ) : (
            <>
              <TextField label="Email" type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} error={touched && !isValidEmail(email) ? 'Enter a valid email address.' : null} />
              <PasswordField label="Password" autoComplete="current-password" value={password} onChange={setPassword} error={touched && !password ? 'Enter your password.' : null} />
              <div className="flex items-center justify-between gap-3 text-xs">
                <label className="inline-flex items-center gap-2 text-slate-700 dark:text-slate-300">
                  <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="rounded border-slate-300" />
                  Keep me signed in
                </label>
                <Link to="/forgot-password?for=staff" className="font-semibold text-brand-700 dark:text-brand-400 hover:underline">Forgot password?</Link>
              </div>
            </>
          )}
          <PrimaryButton type="submit" busy={busy || loading}>{busy ? 'Signing in…' : resolver ? 'Verify code' : 'Sign in'}</PrimaryButton>
        </form>

        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          Staff accounts are created by the academy; there is no public staff registration. First time? Use the activation link from your invitation to set your password.
        </p>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Student?{' '}
          <Link to="/login" className="font-semibold text-brand-700 dark:text-brand-400 hover:underline">Go to student sign-in</Link>
        </p>
      </AuthCard>
    </AuthLayout>
  );
}
