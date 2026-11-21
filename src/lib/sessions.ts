/**
 * Live-class helpers shared by the server and the UI.
 * Times are stored as UTC ISO strings and displayed in Asia/Kathmandu (UTC+5:45, no DST).
 */
export const ACADEMY_TIMEZONE = 'Asia/Kathmandu';
export const NPT_OFFSET_MINUTES = 5 * 60 + 45;
export const DEFAULT_JOIN_WINDOW_MINUTES = 15;

/** Converts a Kathmandu wall-clock date + time to a UTC ISO string. */
export function nptToUtcIso(date: string, time: string): string | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) return null;
  const [y, mo, da] = [Number(d[1]), Number(d[2]), Number(d[3])];
  const [h, mi] = [Number(t[1]), Number(t[2])];
  if (mo < 1 || mo > 12 || da < 1 || da > 31 || h > 23 || mi > 59) return null;
  const ms = Date.UTC(y, mo - 1, da, h, mi) - NPT_OFFSET_MINUTES * 60_000;
  const out = new Date(ms);
  // reject rolled-over dates such as 2026-02-31
  const back = new Date(ms + NPT_OFFSET_MINUTES * 60_000);
  if (back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== da) return null;
  return out.toISOString();
}

export function formatNptDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return (
    new Intl.DateTimeFormat('en-US', {
      timeZone: ACADEMY_TIMEZONE,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(d) + ' NPT'
  );
}

/** Accepts only genuine Google Meet meeting URLs and returns a normalised link (query/hash dropped). */
export function parseMeetUrl(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.hostname !== 'meet.google.com' || url.username || url.password || url.port) {
    return null;
  }
  const path = url.pathname.replace(/\/+$/, '');
  if (/^\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(path) || /^\/lookup\/[a-zA-Z0-9_-]{4,64}$/.test(path)) {
    return `https://meet.google.com${path}`;
  }
  return null;
}

/** http(s) only: blocks javascript:, data: and similar schemes in user-supplied links. */
export function safeHttpUrl(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  try {
    const url = new URL(input.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export type StoredSessionStatus = 'scheduled' | 'live' | 'completed' | 'cancelled';
export type SessionPhase = 'cancelled' | 'completed' | 'upcoming' | 'joinable' | 'live' | 'ended';

export function sessionPhase(input: {
  now: Date;
  scheduledStart: string;
  durationMinutes: number;
  status: StoredSessionStatus;
  joinWindowMinutes?: number;
}): SessionPhase {
  if (input.status === 'cancelled') return 'cancelled';
  if (input.status === 'completed') return 'completed';
  const start = new Date(input.scheduledStart).getTime();
  if (Number.isNaN(start)) return 'upcoming';
  const now = input.now.getTime();
  const end = start + input.durationMinutes * 60_000;
  const opens = start - (input.joinWindowMinutes ?? DEFAULT_JOIN_WINDOW_MINUTES) * 60_000;
  if (now >= end) return 'ended';
  if (now >= start) return 'live';
  if (now >= opens) return 'joinable';
  return 'upcoming';
}

export const canJoin = (phase: SessionPhase) => phase === 'joinable' || phase === 'live';

export function countdownLabel(now: Date, scheduledStart: string): string {
  const diff = new Date(scheduledStart).getTime() - now.getTime();
  if (Number.isNaN(diff) || diff <= 0) return '';
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `Starts in ${Math.max(mins, 1)} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `Starts in ${hours} h ${mins % 60} min`;
  return `Starts in ${Math.floor(hours / 24)} days`;
}

export function validateSessionInput(body: unknown):
  | {
      ok: true;
      batchId: string;
      sessionId?: string;
      title: string;
      scheduledStart: string;
      durationMinutes: number;
      meetingUrl: string;
      status: StoredSessionStatus;
      description: string;
      moduleTitle: string;
      /** minutes before start that students may join; undefined = academy default */
      joinWindowMinutes?: number;
      published: boolean;
    }
  | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid request.' };
  const b = body as Record<string, unknown>;
  const idRe = /^[a-zA-Z0-9_-]{1,128}$/;
  if (typeof b.batchId !== 'string' || !idRe.test(b.batchId)) return { ok: false, error: 'Choose a batch.' };
  if (b.sessionId !== undefined && (typeof b.sessionId !== 'string' || !idRe.test(b.sessionId))) {
    return { ok: false, error: 'Invalid session.' };
  }
  const title = typeof b.title === 'string' ? b.title.trim() : '';
  if (title.length < 3 || title.length > 140) return { ok: false, error: 'Title must be 3–140 characters.' };
  const start = nptToUtcIso(String(b.date ?? ''), String(b.time ?? ''));
  if (!start) return { ok: false, error: 'Enter a valid date and start time.' };
  const duration = Number(b.durationMinutes);
  if (!Number.isInteger(duration) || duration < 10 || duration > 480) {
    return { ok: false, error: 'Duration must be 10–480 minutes.' };
  }
  const meetingUrl = parseMeetUrl(b.meetingUrl);
  if (!meetingUrl) return { ok: false, error: 'Paste a valid Google Meet link (https://meet.google.com/abc-defg-hij).' };
  const status = (b.status ?? 'scheduled') as StoredSessionStatus;
  if (!['scheduled', 'completed', 'cancelled'].includes(status)) return { ok: false, error: 'Invalid status.' };
  const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n) : '');
  let joinWindowMinutes: number | undefined;
  if (b.joinWindowMinutes !== undefined && b.joinWindowMinutes !== null && b.joinWindowMinutes !== '') {
    joinWindowMinutes = Number(b.joinWindowMinutes);
    if (!Number.isInteger(joinWindowMinutes) || joinWindowMinutes < 0 || joinWindowMinutes > 240) {
      return { ok: false, error: 'The joining window must be 0–240 minutes.' };
    }
  }
  return {
    ok: true,
    batchId: b.batchId,
    sessionId: b.sessionId as string | undefined,
    title,
    scheduledStart: start,
    durationMinutes: duration,
    meetingUrl,
    status,
    description: clip(b.description, 500),
    moduleTitle: clip(b.moduleTitle, 100),
    joinWindowMinutes,
    published: b.published !== false,
  };
}

export type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused';
export const ATTENDANCE_STATUSES: AttendanceStatus[] = ['present', 'late', 'absent', 'excused'];

export function validateAttendance(body: unknown):
  | { ok: true; records: { studentId: string; status: AttendanceStatus }[] }
  | { ok: false; error: string } {
  const records = (body as { records?: unknown } | null)?.records;
  if (!Array.isArray(records) || records.length === 0 || records.length > 500) {
    return { ok: false, error: 'Provide attendance records.' };
  }
  const seen = new Set<string>();
  const out: { studentId: string; status: AttendanceStatus }[] = [];
  for (const r of records) {
    const studentId = (r as { studentId?: unknown })?.studentId;
    const status = (r as { status?: unknown })?.status;
    if (typeof studentId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(studentId) || seen.has(studentId)) {
      return { ok: false, error: 'Invalid student in attendance list.' };
    }
    if (!ATTENDANCE_STATUSES.includes(status as AttendanceStatus)) return { ok: false, error: 'Invalid attendance status.' };
    seen.add(studentId);
    out.push({ studentId, status: status as AttendanceStatus });
  }
  return { ok: true, records: out };
}
