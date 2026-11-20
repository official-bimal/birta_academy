import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, AuthCard, AuthLayout, PrimaryButton, TextField } from '../../components/auth/AuthParts';
import { useAuth } from '../../context/AuthContext';
import { isValidEmail } from '../../lib/passwordPolicy';

/** Always shows the same confirmation, so the page cannot be used to discover which emails have accounts. */
export function ForgotPasswordPage() {
  const { sendReset } = useAuth();
  const [params] = useSearchParams();
  const forStaff = params.get('for') === 'staff';
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isValidEmail(email)) return setError('Enter a valid email address.');
    setError(null);
    setBusy(true);
    await sendReset(email, forStaff ? '/staff/login' : '/student/login');
    setBusy(false);
    setSent(true);
  };

  return (
    <AuthLayout>
      <AuthCard eyebrow="Account recovery" title="Reset your password" subtitle="Enter the email you use for Birta Academy and we will send a reset link.">
        {sent ? (
          <Alert kind="success">
            If an account exists for that email, a reset link is on its way. Check your inbox and spam folder. The link works once.
          </Alert>
        ) : (
          <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
            <TextField label="Email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} error={error} />
            <PrimaryButton type="submit" busy={busy}>{busy ? 'Sending…' : 'Send reset link'}</PrimaryButton>
          </form>
        )}
        <p className="text-sm text-slate-600 dark:text-slate-400">
          <Link to={forStaff ? '/staff/login' : '/student/login'} className="font-semibold text-brand-700 dark:text-brand-400 hover:underline">
            Back to sign in
          </Link>
        </p>
        <p className="text-xs text-slate-500">
          Signed up with Google? You do not need a password: use “Continue with Google”.
        </p>
      </AuthCard>
    </AuthLayout>
  );
}
