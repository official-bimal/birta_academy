import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { multiFactor, TotpMultiFactorGenerator, type TotpSecret } from 'firebase/auth';
import { PublicLayout } from '../../components/PublicLayout';
import { useAuth } from '../../context/AuthContext';

/** Authenticator-app (TOTP) enrolment for staff. Requires MFA to be enabled on the Firebase project. */
export function StaffSecurityPage() {
  const { firebaseUser, profile } = useAuth();
  const [secret, setSecret] = useState<TotpSecret | null>(null);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const enrolled = firebaseUser ? multiFactor(firebaseUser).enrolledFactors.length > 0 : false;

  const start = async () => {
    if (!firebaseUser) return;
    setBusy(true);
    setMessage(null);
    try {
      const session = await multiFactor(firebaseUser).getSession();
      setSecret(await TotpMultiFactorGenerator.generateSecret(session));
    } catch (error) {
      const c = (error as { code?: string }).code;
      setMessage({
        ok: false,
        text:
          c === 'auth/requires-recent-login'
            ? 'Please sign out and sign in again, then retry.'
            : 'Could not start enrolment. Multi-factor authentication may not be enabled for this project yet.',
      });
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (e: FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !secret) return;
    setBusy(true);
    try {
      const assertion = TotpMultiFactorGenerator.assertionForEnrollment(secret, code.trim());
      await multiFactor(firebaseUser).enroll(assertion, 'Authenticator app');
      setMessage({ ok: true, text: 'Authenticator enrolled. Sign out and sign in again to use it.' });
      setSecret(null);
    } catch {
      setMessage({ ok: false, text: 'That code was not accepted. Try again with the current code.' });
    } finally {
      setBusy(false);
    }
  };

  if (!profile || profile.role === 'student') {
    return (
      <PublicLayout>
        <div className="max-w-md mx-auto px-6 py-24 text-sm">
          Staff sign-in required. <Link className="text-brand-700 underline" to="/staff/login">Go to staff login</Link>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div className="max-w-md mx-auto px-6 py-16 space-y-5">
        <h1 className="font-display text-2xl font-bold text-slate-950 dark:text-white">Two-factor authentication</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {enrolled ? 'An authenticator app is enrolled on this account.' : 'Add an authenticator app (Google Authenticator, Authy, 1Password…). Super Admin actions require it.'}
        </p>
        {!secret && !enrolled && (
          <button disabled={busy} onClick={() => void start()} className="px-5 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold disabled:opacity-50">
            Set up authenticator
          </button>
        )}
        {secret && (
          <form onSubmit={(e) => void confirm(e)} className="space-y-4">
            <div className="p-4 bg-white rounded-lg inline-block">
              <QRCodeSVG value={secret.generateQrCodeUrl(profile.email, 'Birta Academy')} size={168} />
            </div>
            <p className="text-xs text-slate-500 break-all">
              Or enter this key manually: <span className="font-mono">{secret.secretKey}</span>
            </p>
            <input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value)} placeholder="6-digit code" className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono" />
            <button disabled={busy} className="px-5 py-2.5 rounded-lg bg-brand-600 text-white text-sm font-semibold disabled:opacity-50">Confirm</button>
          </form>
        )}
        {message && (
          <p role="status" className={`text-sm ${message.ok ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-300'}`}>
            {message.text}
          </p>
        )}
      </div>
    </PublicLayout>
  );
}
