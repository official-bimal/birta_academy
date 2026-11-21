import { safeHttpUrl } from './sessions';

export interface NoteInput {
  title: string;
  description: string;
  /** YYYY-MM-DD, the day of the class */
  date: string;
  sessionId?: string;
  moduleTitle: string;
  /** plain text with light formatting (see NoteContent); never raw HTML */
  content: string;
  attachmentIds: string[];
  links: { label: string; url: string }[];
  status: 'draft' | 'published';
}

const ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

export function validateNoteInput(body: unknown): { ok: true; value: NoteInput } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid request.' };
  const b = body as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(CONTROL, '').trim().slice(0, max) : '');
  const title = str(b.title, 140);
  if (title.length < 3) return { ok: false, error: 'Title must be at least 3 characters.' };
  const date = str(b.date, 10);
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: 'Enter a valid date.' };
  const content = typeof b.content === 'string' ? b.content.replace(CONTROL, '').slice(0, 20000) : '';
  const status = b.status === 'published' ? 'published' : 'draft';
  if (status === 'published' && content.trim().length === 0 && !(Array.isArray(b.attachmentIds) && b.attachmentIds.length) && !(Array.isArray(b.links) && b.links.length)) {
    return { ok: false, error: 'Add some content, a file or a link before publishing.' };
  }
  const sessionId = typeof b.sessionId === 'string' && b.sessionId ? b.sessionId : undefined;
  if (sessionId && !ID_RE.test(sessionId)) return { ok: false, error: 'Invalid class.' };
  const attachmentIds = Array.isArray(b.attachmentIds) ? b.attachmentIds.filter((x): x is string => typeof x === 'string' && ID_RE.test(x)).slice(0, 10) : [];
  const links: { label: string; url: string }[] = [];
  if (Array.isArray(b.links)) {
    for (const l of b.links.slice(0, 10)) {
      const url = safeHttpUrl((l as { url?: unknown })?.url);
      if (!url) return { ok: false, error: 'Each link must be a valid http(s) address.' };
      links.push({ label: str((l as { label?: unknown })?.label, 80) || url, url });
    }
  }
  return { ok: true, value: { title, description: str(b.description, 300), date, sessionId, moduleTitle: str(b.moduleTitle, 100), content, attachmentIds, links, status } };
}
