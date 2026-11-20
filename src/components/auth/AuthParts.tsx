import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Check, CheckCircle2, Eye, EyeOff, Loader2, Moon, Sun } from 'lucide-react';
import { PublicLayout } from '../PublicLayout';
import { BrandLogo } from '../BrandLogo';
import { useTheme } from '../../context/ThemeContext';
import { checkPassword } from '../../lib/passwordPolicy';

export const inputClass =
  'w-full px-3.5 py-2.5 rounded-lg border bg-white dark:bg-slate-950 text-sm text-slate-950 dark:text-white placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 disabled:opacity-60';

const PANEL_POINTS = [
  'Live, instructor-led classes in Nepal time',
  'Recorded lessons, resources and assignments',
  'Certificates with public verification',
];

/**
 * Premium split layout used by every sign-in / sign-up page.
 * Desktop: branded panel (left) + form (right). Mobile: single column with a compact top bar.
 * It has its own header, so nothing can be clipped behind the site navbar.
 */
export function AuthLayout({ children }: { children: ReactNode; wide?: boolean }) {
  const { theme, toggleTheme } = useTheme();
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="hidden lg:flex flex-col justify-between bg-brand-600 text-white px-12 xl:px-16 py-12">
        <Link to="/" aria-label="Birta Academy home" className="self-start rounded-md focus-visible:outline-white">
          <img src="/brand/birta-logo-source.jpg" alt="Birta Academy" width={240} height={240} className="w-52 xl:w-60 h-auto -ml-6 xl:-ml-8 -mt-4 select-none" draggable={false} />
        </Link>
        <div className="max-w-md">
          <h2 className="font-display text-3xl xl:text-4xl font-bold tracking-tight leading-[1.15]">Learn skills. Build your future.</h2>
          <p className="mt-4 text-sm xl:text-base text-white/80 leading-relaxed">
            Hybrid training for ambitious learners in Nepal and beyond: live classes with real instructors, plus everything you need to study at your own pace.
          </p>
          <ul className="mt-8 space-y-3">
            {PANEL_POINTS.map((t) => (
              <li key={t} className="flex items-start gap-3 text-sm text-white/90">
                <Check className="w-4 h-4 mt-0.5 shrink-0 text-white" aria-hidden="true" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-white/70">© {new Date().getFullYear()} Birta Academy · Kathmandu, Nepal</p>
      </aside>

      <div className="flex min-h-screen flex-col">
        <header className="flex items-center justify-between gap-4 px-5 sm:px-8 h-16 shrink-0">
          <Link to="/" className="lg:hidden rounded-md" aria-label="Birta Academy home">
            <BrandLogo size={32} withWordmark />
          </Link>
          <Link to="/" className="hidden lg:inline-flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white">
            <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Back to website
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/" className="lg:hidden text-sm text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white">Website</Link>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </header>

        <main className="flex-1 flex items-start sm:items-center justify-center px-5 sm:px-8 py-6 sm:py-10">
          <div className="w-full max-w-[26rem]">{children}</div>
        </main>

        <footer className="px-5 sm:px-8 py-5 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <span className="inline-flex gap-4">
            <Link to="/terms" className="hover:text-slate-900 dark:hover:text-white">Terms</Link>
            <Link to="/privacy" className="hover:text-slate-900 dark:hover:text-white">Privacy</Link>
          </span>
          <Link to="/staff/login" className="hover:text-slate-900 dark:hover:text-white underline-offset-2 hover:underline">Instructor / Staff login</Link>
        </footer>
      </div>
    </div>
  );
}

/** Regular site-chrome layout for signed-in account pages (e.g. security settings). */
export function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <PublicLayout>
      <div className="max-w-md mx-auto px-5 sm:px-6 py-12 lg:py-16">{children}</div>
    </PublicLayout>
  );
}

/** Flat form block (no boxed card): heading, optional subtitle, then the form. */
export function AuthCard({ eyebrow, title, subtitle, children }: { eyebrow?: string; title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="space-y-6">
      <header>
        {eyebrow && <p className="text-xs font-medium text-brand-700 dark:text-brand-400">{eyebrow}</p>}
        <h1 className="mt-1.5 font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-950 dark:text-white">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{subtitle}</p>}
      </header>
      {children}
    </section>
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
