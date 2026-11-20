import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, AuthCard, AuthLayout, GoogleButton, OrDivider, PasswordField, PrimaryButton, TextField } from '../../components/auth/AuthParts';
import { useAuth } from '../../context/AuthContext';
import { homeRouteForRole } from '../../lib/roles';
import { isValidEmail } from '../../lib/passwordPolicy';

export function StudentLoginPage() {
  const { profile, loading, authError, clearAuthError, signInWithGoogle, studentEmailSignIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState<'email' | 'google' | null>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    clearAuthError();
  }, [clearAuthError]);

  useEffect(() => {
    if (!loading && profile) navigate(homeRouteForRole(profile.role), { replace: true });
  }, [loading, profile, navigate]);

  const emailError = touched && !isValidEmail(email) ? 'Enter a valid email address.' : null;
  const passwordError = touched && password.length === 0 ? 'Enter your password.' : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!isValidEmail(email) || !password) return;
    setBusy('email');
    const p = await studentEmailSignIn(email, password, remember);
    setBusy(null);
    if (p) navigate('/student', { replace: true });
  };

  const google = async () => {
    setBusy('google');
    const p = await signInWithGoogle();
    setBusy(null);
    if (p) navigate('/student', { replace: true });
  };

  return (
    <AuthLayout>
      <AuthCard eyebrow="Student" title="Sign in" subtitle="Welcome back. Pick up where you left off.">
        {authError && <Alert>{authError}</Alert>}

        <GoogleButton onClick={() => void google()} busy={busy === 'google'} />
        <OrDivider>or use email</OrDivider>

        <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
          <TextField label="Email" type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} error={emailError} />
          <PasswordField label="Password" autoComplete="current-password" value={password} onChange={setPassword} error={passwordError} />
          <div className="flex items-center justify-between gap-3 text-xs">
            <label className="inline-flex items-center gap-2 text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="rounded border-slate-300" />
              Keep me signed in
            </label>
            <Link to="/forgot-password" className="font-semibold text-brand-700 dark:text-brand-400 hover:underline">
              Forgot password?
            </Link>
          </div>
          <PrimaryButton type="submit" busy={busy === 'email'}>
            {busy === 'email' ? 'Signing in…' : 'Sign in'}
          </PrimaryButton>
        </form>

        <p className="text-sm text-slate-600 dark:text-slate-400">
          New to Birta Academy?{' '}
          <Link to="/student/register" className="font-semibold text-brand-700 dark:text-brand-400 hover:underline">
            Create an account
          </Link>
        </p>
        <p className="text-xs text-slate-500">
          Instructor or admin? <Link to="/login" className="underline">Choose your sign-in</Link>
        </p>
      </AuthCard>
    </AuthLayout>
  );
}
