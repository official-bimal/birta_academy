import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, GraduationCap, Presentation, ShieldCheck } from 'lucide-react';
import { AuthLayout } from '../../components/auth/AuthParts';
import { useAuth } from '../../context/AuthContext';
import { homeRouteForRole } from '../../lib/roles';

const CHOICES = [
  {
    to: '/student/login',
    icon: GraduationCap,
    title: 'Continue as Student',
    text: 'Sign in with Google or your email and password. New here? You can create an account in a minute.',
  },
  {
    to: '/staff/login?as=instructor',
    icon: Presentation,
    title: 'Login as Instructor',
    text: 'For instructors invited by the academy. Use the email and password you set from your invitation.',
  },
  {
    to: '/staff/login?as=admin',
    icon: ShieldCheck,
    title: 'Login as Super Admin',
    text: 'Academy administration. Accounts are provisioned by the academy and protected by extra verification.',
  },
];

/** Entry point. Choosing a card only selects which sign-in form is shown; it never grants or claims a role. */
export function LoginChooserPage() {
  const { profile, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && profile) navigate(homeRouteForRole(profile.role), { replace: true });
  }, [loading, profile, navigate]);

  return (
    <AuthLayout wide>
      <header className="text-center max-w-xl mx-auto">
        <p className="text-xs font-medium text-brand-700 dark:text-brand-400">Birta Academy</p>
        <h1 className="mt-2 font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-950 dark:text-white">
          Welcome back
        </h1>
        <p className="mt-3 text-sm sm:text-base text-slate-600 dark:text-slate-400">Choose how you sign in.</p>
      </header>

      <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-4">
        {CHOICES.map(({ to, icon: Icon, title, text }) => (
          <Link
            key={to}
            to={to}
            className="group flex flex-col p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-brand-500 dark:hover:border-brand-500 transition-colors"
          >
            <span className="inline-flex w-11 h-11 items-center justify-center rounded-lg bg-brand-50 dark:bg-brand-950/60 text-brand-700 dark:text-brand-300">
              <Icon className="w-5 h-5" aria-hidden="true" />
            </span>
            <h2 className="mt-5 font-display text-lg font-semibold text-slate-950 dark:text-white">{title}</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed flex-1">{text}</p>
            <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 dark:text-brand-400">
              Continue
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </span>
          </Link>
        ))}
      </div>

      <p className="mt-8 text-center text-sm text-slate-600 dark:text-slate-400">
        New student?{' '}
        <Link to="/student/register" className="font-semibold text-brand-700 dark:text-brand-400 hover:underline">
          Create an account
        </Link>
      </p>
      <p className="mt-2 text-center text-xs text-slate-500">
        Instructor and admin accounts cannot be created here. They are provisioned by the academy.
      </p>
    </AuthLayout>
  );
}
