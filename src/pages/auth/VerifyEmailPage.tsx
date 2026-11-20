import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { Alert, AuthCard, AuthLayout, PrimaryButton } from '../../components/auth/AuthParts';
import { useAuth } from '../../context/AuthContext';

const COOLDOWN_SECONDS = 60;

export function VerifyEmailPage() {
  const { firebaseUser, profile, loading, emailVerified, resendVerification, reloadUser, logout } = useAuth();
  const navigate = useNavigate();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // Pick up verification done in another tab/device without the student having to do anything.
  useEffect(() => {
    if (emailVerified) return;
    const t = setInterval(() => void reloadUser(), 8000);
    return () => clearInterval(t);
  }, [emailVerified, reloadUser]);

  useEffect(() => {
    if (emailVerified && profile?.role === 'student') navigate('/student', { replace: true });
  }, [emailVerified, profile, navigate]);

  if (loading) return null;
  if (!firebaseUser) return <Navigate to="/student/login" replace />;
  if (profile && profile.role !== 'student') return <Navigate to="/login" replace />;

  const resend = async () => {
    const r = await resendVerification();
    setMessage(r.ok ? { ok: true, text: 'Verification email sent. It can take a minute to arrive.' } : { ok: false, text: r.message });
    if (r.ok) setCooldown(COOLDOWN_SECONDS);
  };

  const check = async () => {
    setChecking(true);
    await reloadUser();
    setChecking(false);
    if (!firebaseUser.emailVerified) setMessage({ ok: false, text: 'Not verified yet. Open the link in the email we sent, then try again.' });
  };

  return (
    <AuthLayout>
      <AuthCard eyebrow="One more step" title="Verify your email" subtitle="Your account is created. Confirm your email address to unlock enrolment and learning.">
        <div className="flex items-start gap-3 p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
          <MailCheck className="w-5 h-5 mt-0.5 text-brand-700 dark:text-brand-400 shrink-0" aria-hidden="true" />
          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
            We sent a link to <strong className="font-semibold break-all">{firebaseUser.email}</strong>. Open it on any device, then come back here.
          </p>
        </div>
        {message && <Alert kind={message.ok ? 'success' : 'error'}>{message.text}</Alert>}
        <div className="space-y-3">
          <PrimaryButton type="button" busy={checking} onClick={() => void check()}>I have verified my email</PrimaryButton>
          <button
            type="button"
            onClick={() => void resend()}
            disabled={cooldown > 0}
            className="w-full py-2.5 px-4 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-semibold text-slate-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60"
          >
            {cooldown > 0 ? `Resend email (${cooldown}s)` : 'Resend email'}
          </button>
        </div>
        <p className="text-xs text-slate-500">
          Wrong address?{' '}
          <button type="button" onClick={() => void logout().then(() => navigate('/student/register'))} className="underline">
            Sign out and start again
          </button>
          . Questions? <Link to="/contact" className="underline">Contact the academy</Link>.
        </p>
      </AuthCard>
    </AuthLayout>
  );
}
