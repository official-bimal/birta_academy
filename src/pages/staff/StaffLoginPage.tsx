import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { MultiFactorResolver } from 'firebase/auth';
import { Presentation, ShieldCheck } from 'lucide-react';
import { Alert, AuthCard, AuthLayout, PasswordField, PrimaryButton, TextField } from '../../components/auth/AuthParts';
import { useAuth } from '../../context/AuthContext';
import { homeRouteForRole } from '../../lib/roles';
import { isValidEmail } from '../../lib/passwordPolicy';

type Expected = 'instructor' | 'admin';

/**
 * Staff sign-in (email + password only; no Google, no public registration).
 * The tab only states which role the person EXPECTS to be: the server-set role claim decides, and a mismatch is refused.
 */
export function StaffLoginPage() {
  const { profile, loading, authError, clearAuthError, staffSignIn, completeStaffMfa } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const expected: Expected = params.get('as') === 'admin' ? 'admin' : 'instructor';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [code, setCode] = useState('');
  const [resolver, setResolver] = useState<MultiFactorResolver | null>(null);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    clearAuthError();
    setResolver(null);
  }, [expected, clearAuthError]);

  useEffect(() => {
    if (!loading && profile && profile.role !== 'student') navigate(homeRouteForRole(profile.role), { replace: true });
  }, [loading, profile, navigate]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!resolver && (!isValidEmail(email) || !password)) return;
    setBusy(true);
    try {
      const result = resolver ? await completeStaffMfa(resolver, code, expected) : await staffSignIn(email, password, expected, remember);
      if (result.status === 'mfa') setResolver(result.resolver);
      if (result.status === 'ok') navigate(homeRouteForRole(result.role), { replace: true });
    } finally {
      setBusy(false);
    }
  };

  const tab = (value: Expected, label: string, Icon: typeof Presentation) => (
    <button
      type="button"
      role="tab"
      aria-selected={expected === value}
      onClick={() => setParams({ as: value }, { replace: true })}
      className={`flex-1 inline-flex items-center justify-center gap-2 py-2 rounded-md text-sm font-semibold transition-colors ${
        expected === value ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
      }`}
    >
      <Icon className="w-4 h-4" aria-hidden="true" /> {label}
    </button>
  );

  return (
    <AuthLayout>
      <AuthCard
        eyebrow="Staff access"
        title={expected === 'admin' ? 'Super Admin sign-in' : 'Instructor sign-in'}
        subtitle={expected === 'admin' ? 'Academy administration. Extra verification is required.' : 'Use the email and password you set from your invitation.'}
      >
        <div role="tablist" aria-label="Account type" className="flex p-1 rounded-lg bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
          {tab('instructor', 'Instructor', Presentation)}
          {tab('admin', 'Super Admin', ShieldCheck)}
        </div>

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
                  Keep me signed in on this device
                </label>
                <Link to="/forgot-password?for=staff" className="font-semibold text-brand-700 dark:text-brand-400 hover:underline">Forgot password?</Link>
              </div>
            </>
          )}
          <PrimaryButton type="submit" busy={busy || loading}>{busy ? 'Signing in…' : resolver ? 'Verify code' : 'Sign in'}</PrimaryButton>
        </form>

        <p className="text-xs text-slate-500 leading-relaxed">
          Staff accounts are created by the academy; there is no public staff registration. First time? Open the activation link
          from your invitation to set your password. Student?{' '}
          <Link to="/student/login" className="underline">Go to student sign-in</Link>.
        </p>
      </AuthCard>
    </AuthLayout>
  );
}
