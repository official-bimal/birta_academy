import { useState, type FormEvent } from 'react';
import { Copy, KeyRound } from 'lucide-react';
import { apiFetch, ApiError } from '../lib/api';

/** Super Admin creates an instructor account. The instructor sets their own password via a one-time link. */
export function InviteInstructorPanel() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<{ email: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setLink(null);
    try {
      const res = await apiFetch<{ activationLink: string }>('/admin/instructors', {
        method: 'POST',
        body: { name, email },
      });
      setLink({ email, url: res.activationLink });
      setName('');
      setEmail('');
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'MFA_REQUIRED'
          ? 'Enrol an authenticator app at /staff/security and sign in again to manage staff.'
          : err instanceof ApiError
          ? err.message
          : 'Could not create the instructor account.'
      );
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const field =
    'px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950';

  return (
    <form
      onSubmit={submit}
      className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4"
    >
      <div>
        <h2 className="font-display text-base font-semibold text-slate-950 dark:text-white">
          Invite an instructor
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Creates a staff account. You get a one-time activation link to send to the instructor, who
          then sets their own password. Email delivery is not configured yet.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <input className={field} required minLength={2} maxLength={100} placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className={field} required type="email" maxLength={200} placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <button
        type="submit"
        disabled={busy}
        className="px-5 py-2 text-xs font-semibold rounded-lg bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-50"
      >
        {busy ? 'Creating…' : 'Create instructor account'}
      </button>
      {error && (
        <p role="alert" className="text-xs text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      {link && (
        <div className="p-4 rounded-lg bg-brand-50 dark:bg-brand-950/40 border border-brand-200 dark:border-brand-800 space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-white">
            <KeyRound className="w-4 h-4 text-brand-600" /> Activation link for {link.email}
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Shown once. Share it privately; it is single-use and lets them choose a password.
          </p>
          <div className="flex gap-2">
            <input readOnly value={link.url} className={`${field} flex-1 font-mono text-xs`} onFocus={(e) => e.currentTarget.select()} />
            <button type="button" onClick={() => void copy()} className="inline-flex items-center gap-1.5 px-3 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700">
              <Copy className="w-3.5 h-3.5" /> {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
