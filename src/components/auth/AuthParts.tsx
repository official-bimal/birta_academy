import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react';
import { PublicLayout } from '../PublicLayout';
import { checkPassword } from '../../lib/passwordPolicy';

export const inputClass =
  'w-full px-3.5 py-2.5 rounded-lg border bg-white dark:bg-slate-950 text-sm text-slate-950 dark:text-white placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 disabled:opacity-60';

export function AuthLayout({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <PublicLayout>
      <div className={`${wide ? 'max-w-4xl' : 'max-w-md'} mx-auto px-5 sm:px-6 py-12 lg:py-20`}>{children}</div>
    </PublicLayout>
  );
}

export function AuthCard({ eyebrow, title, subtitle, children }: { eyebrow?: string; title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="p-6 sm:p-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-6">
      <header>
        {eyebrow && <p className="text-xs font-medium text-brand-700 dark:text-brand-400">{eyebrow}</p>}
        <h1 className="mt-1.5 font-display text-2xl font-bold tracking-tight text-slate-950 dark:text-white">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{subtitle}</p>}
      </header>
      {children}
    </div>
  );
}

export function Alert({ kind = 'error', children }: { kind?: 'error' | 'success' | 'info'; children: ReactNode }) {
  const styles = {
    error: 'border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-300',
    success: 'border-emerald-300 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300',
    info: 'border-brand-200 dark:border-brand-800 bg-brand-50 dark:bg-brand-950/40 text-slate-800 dark:text-slate-200',
  }[kind];
  const Icon = kind === 'success' ? CheckCircle2 : AlertCircle;
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={`flex gap-2.5 p-3.5 rounded-lg border text-sm ${styles}`}>
      <Icon className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
      <div className="leading-relaxed">{children}</div>
    </div>
  );
}

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  error?: string | null;
  hint?: string;
}

export function TextField({ label, error, hint, className = '', ...props }: FieldProps) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        className={`${inputClass} ${error ? 'border-red-400 dark:border-red-700' : 'border-slate-300 dark:border-slate-700'} ${className}`}
        {...props}
      />
      {error ? (
        <p id={`${id}-err`} className="mt-1.5 text-xs text-red-700 dark:text-red-400">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
      ) : null}
    </div>
  );
}

interface PasswordFieldProps extends Omit<FieldProps, 'type' | 'value' | 'onChange'> {
  value: string;
  onChange: (v: string) => void;
  /** show the live strength meter and rule checklist */
  meter?: { email?: string; name?: string };
}

export function PasswordField({ label, value, onChange, error, hint, meter, ...props }: PasswordFieldProps) {
  const id = useId();
  const [show, setShow] = useState(false);
  const check = meter ? checkPassword(value, meter) : null;
  const bars = ['bg-red-500', 'bg-red-500', 'bg-amber-500', 'bg-brand-500', 'bg-emerald-500'];
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-err` : undefined}
          className={`${inputClass} pr-11 ${error ? 'border-red-400 dark:border-red-700' : 'border-slate-300 dark:border-slate-700'}`}
          {...props}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? 'Hide password' : 'Show password'}
          aria-pressed={show}
          className="absolute inset-y-0 right-0 w-11 inline-flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white"
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {check && value.length > 0 && (
        <div className="mt-2 space-y-1.5" aria-live="polite">
          <div className="flex gap-1" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={`h-1 flex-1 rounded-full ${i < check.score ? bars[check.score] : 'bg-slate-200 dark:bg-slate-800'}`} />
            ))}
          </div>
          {check.issues.length > 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">{check.issues[0]}</p>
          ) : (
            <p className="text-xs text-emerald-700 dark:text-emerald-400">Strong password.</p>
          )}
        </div>
      )}
      {error ? (
        <p id={`${id}-err`} className="mt-1.5 text-xs text-red-700 dark:text-red-400">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
      ) : null}
    </div>
  );
}

export function PrimaryButton({ busy, children, ...props }: { busy?: boolean; children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      disabled={busy || props.disabled}
      className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold disabled:opacity-60 transition-colors"
    >
      {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
      <span>{children}</span>
    </button>
  );
}

export function GoogleButton({ onClick, busy, label = 'Continue with Google' }: { onClick: () => void; busy?: boolean; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="w-full inline-flex items-center justify-center gap-3 py-2.5 px-4 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 transition-colors"
    >
      {busy ? (
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
      ) : (
        <svg className="w-[18px] h-[18px]" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.5 17.7 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z" />
          <path fill="#FBBC05" d="M10.5 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z" />
          <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
        </svg>
      )}
      <span>{label}</span>
    </button>
  );
}

export function OrDivider({ children = 'or' }: { children?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-xs text-slate-500" role="separator">
      <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
      <span>{children}</span>
      <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
    </div>
  );
}
