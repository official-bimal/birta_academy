import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BadgeCheck, ShieldAlert } from 'lucide-react';
import { PublicLayout } from '../../components/PublicLayout';
import { verifyCertificateCode, type CertificateVerification } from '../../lib/firestoreService';
import { formatDateValue } from '../../lib/validation';

type State = 'idle' | 'loading' | 'found' | 'missing' | 'error';

export function VerifyCertificatePage() {
  const { code: routeCode } = useParams();
  const navigate = useNavigate();
  const [input, setInput] = useState(routeCode ?? '');
  const [state, setState] = useState<State>('idle');
  const [result, setResult] = useState<CertificateVerification | null>(null);

  useEffect(() => {
    if (!routeCode) return;
    let active = true;
    setState('loading');
    verifyCertificateCode(routeCode)
      .then((r) => {
        if (!active) return;
        setResult(r);
        setState(r ? 'found' : 'missing');
      })
      .catch(() => {
        if (active) setState('error');
      });
    return () => {
      active = false;
    };
  }, [routeCode]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const code = input.trim();
    if (code) navigate(`/verify/${encodeURIComponent(code.toUpperCase())}`);
  };

  const valid = state === 'found' && result?.status === 'issued';

  return (
    <PublicLayout>
      <div className="max-w-xl mx-auto px-6 py-16 lg:py-24 space-y-6">
        <header>
          <p className="text-xs font-medium text-brand-700 dark:text-brand-400">Certificate Verification</p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-slate-950 dark:text-white">
            Verify a Birta Academy certificate
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Enter the unique code printed on the certificate.
          </p>
        </header>

        <form onSubmit={submit} className="flex gap-2">
          <label htmlFor="cert-code" className="sr-only">
            Certificate code
          </label>
          <input
            id="cert-code"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="BA-2026-XXXXXX"
            maxLength={64}
            className="flex-1 px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono uppercase"
          />
          <button
            type="submit"
            className="px-5 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold transition-colors"
          >
            Verify
          </button>
        </form>

        <div aria-live="polite">
          {state === 'loading' && <p className="text-sm text-slate-500">Checking…</p>}
          {state === 'error' && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-300">
              Verification is unavailable right now. Please try again later.
            </p>
          )}
          {state === 'missing' && (
            <div className="p-5 rounded-xl border border-amber-300 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/20 flex gap-3">
              <ShieldAlert className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0" />
              <p className="text-sm text-slate-700 dark:text-slate-300">
                No certificate was found for this code. Check for typos or contact admissions.
              </p>
            </div>
          )}
          {state === 'found' && result && (
            <div
              className={`p-6 rounded-xl border ${
                valid
                  ? 'border-brand-200 dark:border-brand-800 bg-brand-50 dark:bg-brand-950/40'
                  : 'border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/20'
              }`}
            >
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-950 dark:text-white">
                <BadgeCheck className={`w-5 h-5 ${valid ? 'text-brand-600' : 'text-red-600'}`} />
                {valid ? 'Valid certificate' : 'This certificate has been revoked'}
              </p>
              <dl className="mt-4 grid grid-cols-3 gap-y-2 text-sm">
                <dt className="text-slate-500">Name</dt>
                <dd className="col-span-2 font-medium text-slate-950 dark:text-white">{result.studentName}</dd>
                <dt className="text-slate-500">Course</dt>
                <dd className="col-span-2 text-slate-800 dark:text-slate-200">{result.courseTitle}</dd>
                <dt className="text-slate-500">Issued</dt>
                <dd className="col-span-2 text-slate-800 dark:text-slate-200">{formatDateValue(result.issuedAt)}</dd>
                <dt className="text-slate-500">Code</dt>
                <dd className="col-span-2 font-mono text-slate-800 dark:text-slate-200">{result.certificateCode}</dd>
              </dl>
            </div>
          )}
        </div>
      </div>
    </PublicLayout>
  );
}
