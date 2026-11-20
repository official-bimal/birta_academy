import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, KeyRound, ShieldCheck } from 'lucide-react';
import { Alert, AuthLayout, PasswordField, PrimaryButton } from '../../components/auth/AuthParts';
import { useAuth } from '../../context/AuthContext';
import { addPasswordToAccount, changePassword, linkGoogleToAccount, unlinkProvider } from '../../lib/accountLinking';
import { checkPassword } from '../../lib/passwordPolicy';

type Msg = { ok: boolean; text: string } | null;

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
    <h2 className="font-display text-base font-semibold text-slate-950 dark:text-white">{title}</h2>
    {children}
  </section>
);

/** Student → Security → Login methods. Linking happens on the SAME Firebase identity (same UID); nothing is merged. */
export function StudentSecurityPage() {
  const { firebaseUser, profile, providers, emailVerified, reloadUser, logout } = useAuth();
  const navigate = useNavigate();
  const hasGoogle = providers.includes('google.com');
  const hasPassword = providers.includes('password');
  const email = firebaseUser?.email ?? profile?.email ?? '';

  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [currentPw, setCurrentPw] = useState('');

  const policy = checkPassword(newPw, { email, name: profile?.displayName });
  const mismatch = confirmPw.length > 0 && confirmPw !== newPw;

  const run = async (key: string, fn: () => Promise<{ ok: boolean; message?: string }>, success: string) => {
    setBusy(key);
    setMsg(null);
    const r = await fn();
    setBusy(null);
    if (r.ok) {
      setMsg({ ok: true, text: success });
      setNewPw('');
      setConfirmPw('');
      setCurrentPw('');
      await reloadUser();
    } else if (r.message) {
      setMsg({ ok: false, text: r.message });
    }
  };

  const addPassword = (e: FormEvent) => {
    e.preventDefault();
    if (!policy.ok || mismatch || !confirmPw) return setMsg({ ok: false, text: policy.issues[0] ?? 'Passwords do not match.' });
    void run('add', () => addPasswordToAccount(newPw), 'Password added. You can now sign in with your email and password on any device.');
  };

  const change = (e: FormEvent) => {
    e.preventDefault();
    if (!policy.ok || mismatch || !confirmPw || !currentPw) return setMsg({ ok: false, text: policy.issues[0] ?? 'Check the fields and try again.' });
    void run('change', () => changePassword(currentPw, newPw), 'Password changed.');
  };

  const linkGoogle = (e: FormEvent) => {
    e.preventDefault();
    if (!currentPw) return setMsg({ ok: false, text: 'Enter your current password to continue.' });
    void run('google', () => linkGoogleToAccount(currentPw), 'Google connected. You can now sign in with Google too.');
  };

  return (
    <AuthLayout>
      <div className="space-y-5">
        <Link to="/student" className="inline-flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white">
          <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Back to dashboard
        </Link>
        <header>
          <p className="text-xs font-medium text-brand-700 dark:text-brand-400">Account settings</p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-950 dark:text-white">Security and login methods</h1>
        </header>

        {msg && <Alert kind={msg.ok ? 'success' : 'error'}>{msg.text}</Alert>}

        <Section title="Connected sign-in methods">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
            <li className="py-3 flex items-center justify-between gap-3">
              <span>
                <span className="font-medium text-slate-950 dark:text-white">Google</span>
                <span className="block text-xs text-slate-500">{hasGoogle ? 'Connected' : 'Not connected'}</span>
              </span>
              {hasGoogle && <CheckCircle2 className="w-4 h-4 text-emerald-600" aria-label="Connected" />}
            </li>
            <li className="py-3 flex items-center justify-between gap-3">
              <span>
                <span className="font-medium text-slate-950 dark:text-white">Email and password</span>
                <span className="block text-xs text-slate-500">{hasPassword ? `Connected (${email})` : 'Not set'}</span>
              </span>
              {hasPassword && <CheckCircle2 className="w-4 h-4 text-emerald-600" aria-label="Connected" />}
            </li>
          </ul>
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="w-4 h-4" aria-hidden="true" />
            Email {emailVerified ? 'verified' : 'not verified yet'} · Account email: <span className="font-mono">{email}</span>
          </p>
          {hasGoogle && hasPassword && (
            <div className="flex flex-wrap gap-4 text-xs">
              <button type="button" className="text-slate-600 dark:text-slate-400 underline" onClick={() => void run('unlink-google', () => unlinkProvider('google.com'), 'Google disconnected.')}>Disconnect Google</button>
              <button type="button" className="text-slate-600 dark:text-slate-400 underline" onClick={() => void run('unlink-pw', () => unlinkProvider('password'), 'Password removed.')}>Remove password</button>
            </div>
          )}
        </Section>

        {hasGoogle && !hasPassword && (
          <Section title="Set a password">
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Add an email and password to this same account so you can sign in from any device without Google. For your
              security we will ask you to confirm with Google first. The password is attached to <strong>{email}</strong>.
            </p>
            <form onSubmit={addPassword} className="space-y-4" noValidate>
              <PasswordField label="New password" autoComplete="new-password" value={newPw} onChange={setNewPw} meter={{ email, name: profile?.displayName }} />
              <PasswordField label="Confirm new password" autoComplete="new-password" value={confirmPw} onChange={setConfirmPw} error={mismatch ? 'Passwords do not match.' : null} />
              <PrimaryButton type="submit" busy={busy === 'add'}><KeyRound className="w-4 h-4" aria-hidden="true" /> Confirm with Google and set password</PrimaryButton>
            </form>
          </Section>
        )}

        {hasPassword && (
          <Section title="Change password">
            <form onSubmit={change} className="space-y-4" noValidate>
              <PasswordField label="Current password" autoComplete="current-password" value={currentPw} onChange={setCurrentPw} />
              <PasswordField label="New password" autoComplete="new-password" value={newPw} onChange={setNewPw} meter={{ email, name: profile?.displayName }} />
              <PasswordField label="Confirm new password" autoComplete="new-password" value={confirmPw} onChange={setConfirmPw} error={mismatch ? 'Passwords do not match.' : null} />
              <PrimaryButton type="submit" busy={busy === 'change'}>Change password</PrimaryButton>
            </form>
            <p className="text-xs text-slate-500">Forgot your current password? <Link to="/forgot-password" className="underline">Reset it by email</Link>.</p>
          </Section>
        )}

        {hasPassword && !hasGoogle && (
          <Section title="Connect Google">
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Add Google as another way to sign in to this account. If that Google account already belongs to a different
              Birta Academy account, it will be refused and nothing is merged.
            </p>
            <form onSubmit={linkGoogle} className="space-y-4" noValidate>
              <PasswordField label="Current password" autoComplete="current-password" value={currentPw} onChange={setCurrentPw} />
              <PrimaryButton type="submit" busy={busy === 'google'}>Confirm password and connect Google</PrimaryButton>
            </form>
          </Section>
        )}

        <Section title="Session">
          <button
            type="button"
            onClick={() => void logout().then(() => navigate('/login', { replace: true }))}
            className="px-4 py-2 text-sm font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Sign out
          </button>
        </Section>
      </div>
    </AuthLayout>
  );
}
