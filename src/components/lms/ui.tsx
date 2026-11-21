import { Fragment, type ReactNode } from 'react';
import { safeHttpUrl } from '../../lib/sessions';

export const fieldClass =
  'w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-950 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 disabled:opacity-60';

export const btnPrimary =
  'inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-sm font-semibold rounded-lg bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-50 transition-colors';
export const btnGhost =
  'inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-sm font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
      <div className="min-w-0">
        <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-slate-950 dark:text-white">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-8">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 ${className}`}>{children}</div>;
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 px-6 py-10 text-center">
      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</p>
      {text && <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">{text}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

const PILL: Record<string, string> = {
  neutral: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  good: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
  warn: 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  bad: 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300',
  brand: 'bg-brand-50 text-brand-800 dark:bg-brand-950/60 dark:text-brand-300',
};
export function Pill({ tone = 'neutral', children }: { tone?: keyof typeof PILL; children: ReactNode }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${PILL[tone]}`}>{children}</span>;
}

export function Tabs<T extends string>({ tabs, active, onChange }: { tabs: { id: T; label: string; count?: number }[]; active: T; onChange: (id: T) => void }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-slate-200 dark:border-slate-800 mb-6 -mx-1 px-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={active === t.id}
          onClick={() => onChange(t.id)}
          className={`shrink-0 px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            active === t.id ? 'border-brand-600 text-brand-700 dark:text-brand-300 dark:border-brand-400' : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
          }`}
        >
          {t.label}
          {t.count !== undefined && t.count > 0 && <span className="ml-1.5 text-xs text-slate-500">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Notice({ kind, children }: { kind: 'ok' | 'error' | 'info'; children: ReactNode }) {
  const c = kind === 'ok' ? PILL.good : kind === 'error' ? PILL.bad : PILL.brand;
  return (
    <p role={kind === 'error' ? 'alert' : 'status'} className={`text-sm px-3 py-2 rounded-lg ${c}`}>
      {children}
    </p>
  );
}

export function Progress({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

/** Light formatting without raw HTML: paragraphs, "- " bullets, **bold**, and http(s) links. */
export function NoteContent({ text }: { text: string }) {
  const inline = (line: string) =>
    line.split(/(\*\*[^*]+\*\*|https?:\/\/[^\s)]+)/g).map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
      const url = /^https?:\/\//.test(part) ? safeHttpUrl(part) : null;
      if (url) return <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="text-brand-700 dark:text-brand-400 underline break-all">{part}</a>;
      return <Fragment key={i}>{part}</Fragment>;
    });
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) {
      blocks.push(<ul key={`u${blocks.length}`} className="list-disc pl-5 space-y-1">{bullets.map((b, i) => <li key={i}>{inline(b)}</li>)}</ul>);
      bullets = [];
    }
  };
  text.split('\n').forEach((raw) => {
    const line = raw.trimEnd();
    if (/^\s*[-*]\s+/.test(line)) bullets.push(line.replace(/^\s*[-*]\s+/, ''));
    else {
      flush();
      if (line.trim()) blocks.push(<p key={`p${blocks.length}`}>{inline(line)}</p>);
    }
  });
  flush();
  return <div className="space-y-2 text-sm leading-relaxed text-slate-800 dark:text-slate-200">{blocks}</div>;
}
