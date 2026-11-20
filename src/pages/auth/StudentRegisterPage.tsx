import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, AuthCard, AuthLayout, GoogleButton, OrDivider, PasswordField, PrimaryButton, TextField } from '../../components/auth/AuthParts';
import { useAuth } from '../../context/AuthContext';
import { checkPassword, isValidEmail, isValidPhone } from '../../lib/passwordPolicy';

/** Public student registration: the only public sign-up path. The browser never sends a role. */
export function StudentRegisterPage() {
  const { profile, loading, authError, clearAuthError, signInWithGoogle, registerStudent } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState<'email' | 'google' | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const submitted = useRef(false);

  useEffect(() => {
    clearAuthError();
  }, [clearAuthError]);

  // An already-signed-in student does not need to register again.
  useEffect(() => {
    if (!loading && profile && !busy && !submitted.current) navigate(profile.role === 'student' ? '/student' : '/login', { replace: true });
  }, [loading, profile, busy, navigate]);

  const errors = {
    name: name.trim().length < 2 ? 'Enter your full name.' : null,
    email: !isValidEmail(email) ? 'Enter a valid email address.' : null,
    phone: !isValidPhone(phone) ? 'Enter a valid phone number, or leave it blank.' : null,
    password: checkPassword(password, { email, name }).ok ? null : (checkPassword(password, { email, name }).issues[0] ?? 'Choose a stronger password.'),
    confirm: confirm !== password ? 'Passwords do not match.' : null,
    terms: accepted ? null : 'Please accept the Terms and Privacy Policy to continue.',
  };
  const valid = Object.values(errors).every((e) => e === null);
  const show = (k: keyof typeof errors) => (touched ? errors[k] : null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setFormError(null);
    if (!valid) return;
    submitted.current = true;
    setBusy('email');
    const r = await registerStudent({ name, email, password, phone });
    setBusy(null);
    if (r.ok) navigate('/verify-email', { replace: true });
    else {
      submitted.current = false;
      setFormError(r.message);
    }
  };

  const google = async () => {
    submitted.current = true;
    setBusy('google');
    const p = await signInWithGoogle();
    setBusy(null);
    if (p) navigate('/student', { replace: true });
    else submitted.current = false;
  };

  return (
    <AuthLayout>
      <AuthCard eyebrow="Student" title="Create your account" subtitle="Join live cohorts, track your progress and earn verified certificates.">
        {(formError || authError) && <Alert>{formError ?? authError}</Alert>}

        <GoogleButton onClick={() => void google()} busy={busy === 'google'} label="Sign up with Google" />
        <OrDivider>or sign up with email</OrDivider>

        <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
          <TextField label="Full name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={show('name')} maxLength={100} />
          <TextField label="Email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} error={show('email')} maxLength={200} />
          <TextField label="Phone (optional)" type="tel" autoComplete="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} error={show('phone')} maxLength={20} hint="Used only by the academy to reach you about classes." />
          <PasswordField label="Password" autoComplete="new-password" value={password} onChange={setPassword} error={touched && errors.password && password.length === 0 ? errors.password : null} meter={{ email, name }} />
          <PasswordField label="Confirm password" autoComplete="new-password" value={confirm} onChange={setConfirm} error={show('confirm')} />
          <div>
            <label className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
              <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5 rounded border-slate-300" />
              <span>
                I accept the{' '}
                <Link to="/terms" target="_blank" className="font-semibold text-brand-700 dark:text-brand-400 underline">Terms</Link> and{' '}
                <Link to="/privacy" target="_blank" className="font-semibold text-brand-700 dark:text-brand-400 underline">Privacy Policy</Link>.
              </span>
            </label>
            {show('terms') && <p className="mt-1.5 text-xs text-red-700 dark:text-red-400">{errors.terms}</p>}
          </div>
          <PrimaryButton type="submit" busy={busy === 'email'}>
            {busy === 'email' ? 'Creating account…' : 'Create account'}
          </PrimaryButton>
        </form>

        <p className="text-sm text-slate-600 dark:text-slate-400">
          Already have an account?{' '}
          <Link to="/student/login" className="font-semibold text-brand-700 dark:text-brand-400 hover:underline">Sign in</Link>
        </p>
      </AuthCard>
    </AuthLayout>
  );
}
