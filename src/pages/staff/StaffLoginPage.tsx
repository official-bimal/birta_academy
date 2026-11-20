import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { MultiFactorResolver } from 'firebase/auth';
import { PublicLayout } from '../../components/PublicLayout';
import { useAuth } from '../../context/AuthContext';
import { homeRouteForRole } from '../../lib/roles';

export function StaffLoginPage() {
  const { profile, loading, authError, staffSignIn, completeStaffMfa } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [resolver, setResolver] = useState<MultiFactorResolver | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && profile && profile.role !== 'student') {
      navigate(homeRouteForRole(profile.role), { replace: true });
    }
  }, [loading, profile, navigate]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const result = resolver
        ? await completeStaffMfa(resolver, code)
        : await staffSignIn(email, password);
      if (result.status === 'mfa') setResolver(result.resolver);
      if (result.status === 'ok') navigate(homeRouteForRole(result.role), { replace: true });
    } finally {
      setBusy(false);
    }
  };

  const input =
    'w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm';

  return (
    <PublicLayout>
      <div className="max-w-md mx-auto px-6 py-16 lg:py-24">
        <form
          onSubmit={(e) => void submit(e)}
          className="p-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5"
        >
          <div>
            <p className="text-xs font-medium text-brand-700 dark:text-brand-400">Staff access</p>
            <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
              Instructor &amp; admin sign-in
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Accounts are created by the academy. There is no public staff registration.
            </p>
          </div>

          {authError && (
            <div role="alert" className="p-3 rounded-lg border border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300">
              {authError}
            </div>
          )}

          {resolver ? (
            <div>
              <label htmlFor="mfa" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Authenticator code
              </label>
              <input id="mfa" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus value={code} onChange={(e) => setCode(e.target.value)} className={`${input} mt-1 font-mono tracking-widest`} />
            </div>
          ) : (
            <>
              <div>
                <label htmlFor="email" className="text-xs font-medium text-slate-700 dark:text-slate-300">Email</label>
                <input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className={`${input} mt-1`} />
              </div>
              <div>
                <label htmlFor="password" className="text-xs font-medium text-slate-700 dark:text-slate-300">Password</label>
                <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={`${input} mt-1`} />
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={busy || loading}
            className="w-full py-3 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
          >
            {busy ? 'Signing in…' : resolver ? 'Verify code' : 'Sign in'}
          </button>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Student? <Link to="/login" className="font-semibold text-brand-700 dark:text-brand-400 hover:underline">Continue with Google</Link>
          </p>
        </form>
      </div>
    </PublicLayout>
  );
}
