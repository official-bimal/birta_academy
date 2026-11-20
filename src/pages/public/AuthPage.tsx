import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PublicLayout } from '../../components/PublicLayout';
import { homeRouteForRole } from '../../lib/roles';
import { useAuth } from '../../context/AuthContext';

interface AuthPageProps {
  mode: 'login' | 'register';
}

export function AuthPage({ mode }: AuthPageProps) {
  const { profile, loading, authError, signInWithGoogle } = useAuth();
  const [signingIn, setSigningIn] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && profile) navigate(homeRouteForRole(profile.role === 'student' ? 'student' : profile.role === 'admin' ? 'admin' : 'instructor'), { replace: true });
  }, [loading, profile, navigate]);

  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    try {
      const synced = await signInWithGoogle();
      if (synced) navigate(homeRouteForRole(synced.role), { replace: true });
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <PublicLayout>
      <div className="max-w-md mx-auto px-6 py-16 lg:py-24">
        <div className="p-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-6">
          <div>
            <p className="text-xs font-medium text-brand-700 dark:text-brand-400">
              Birta Academy Account
            </p>
            <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
              {'Student sign-in'}
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {mode === 'login'
                ? 'Access your enrolled cohorts, live class schedules, assignments, and certificates.'
                : 'Register with Google to apply for upcoming live batches and track enrollment approval.'}
            </p>
          </div>

          {authError && (
            <div
              role="alert"
              className="p-3.5 rounded-lg border border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300"
            >
              {authError}
            </div>
          )}

          <button
            type="button"
            disabled={signingIn || loading}
            onClick={() => void handleGoogleSignIn()}
            className="w-full py-3 px-4 rounded-lg bg-slate-950 dark:bg-brand-600 text-white text-sm font-semibold hover:bg-slate-800 dark:hover:bg-brand-500 disabled:opacity-50 transition-colors"
          >
            {signingIn ? 'Connecting with Google...' : 'Continue with Google'}
          </button>

          <p className="pt-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
            Student access is by Google sign-in only. Instructors and staff are invited by the academy.
          </p>
        </div>
      </div>
    </PublicLayout>
  );
}
