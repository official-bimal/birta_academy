import { useEffect, useState } from 'react';
import { useServerClock } from '../lib/lmsApi';
import { ExternalLink } from 'lucide-react';
import { ApiError } from '../lib/api';
import { getOwnAttendance, requestSessionLink, type AttendanceRecord } from '../lib/firestoreService';
import { canJoin, countdownLabel, formatNptDateTime, sessionPhase } from '../lib/sessions';
import type { LiveSession } from '../types';

interface Props {
  session: LiveSession & { courseTitle?: string };
  studentId: string;
  joinWindowMinutes: number;
}

const PHASE_LABEL = {
  upcoming: 'Upcoming',
  joinable: 'Joining open',
  live: 'In progress',
  ended: 'Ended',
  completed: 'Completed',
  cancelled: 'Cancelled',
} as const;

/** One live class for an enrolled student. The Meet link is fetched from the API only when joining. */
export function StudentLiveClassCard({ session, studentId, joinWindowMinutes }: Props) {
  const [now, setNow] = useState(() => new Date());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attendance, setAttendance] = useState<AttendanceRecord | null>(null);

  // Server-corrected clock: a wrong device clock cannot show "Join" early (the server re-checks anyway).
  useServerClock(setNow);

  useEffect(() => {
    getOwnAttendance(session.batchId, session.id, studentId).then(setAttendance).catch(() => setAttendance(null));
  }, [session.batchId, session.id, studentId]);

  const phase = sessionPhase({
    now,
    scheduledStart: session.scheduledStart,
    durationMinutes: session.durationMinutes,
    status: session.status,
    joinWindowMinutes: Math.min(session.joinWindowMinutes ?? joinWindowMinutes, joinWindowMinutes),
  });
  const countdown = phase === 'upcoming' || phase === 'joinable' ? countdownLabel(now, session.scheduledStart) : '';

  const open = async (kind: 'join' | 'recording') => {
    setBusy(true);
    setError(null);
    try {
      const url = await requestSessionLink(session.batchId, session.id, kind);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not open the link. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          {session.courseTitle && <span className="font-medium text-brand-700 dark:text-brand-400">{session.courseTitle}</span>}
          <span aria-hidden="true">·</span>
          <span>{PHASE_LABEL[phase]}</span>
          {countdown && (<><span aria-hidden="true">·</span><span>{countdown}</span></>)}
          {attendance && (<><span aria-hidden="true">·</span><span className="capitalize">Attendance: {attendance.status}</span></>)}
        </div>
        <h3 className="mt-1.5 font-display text-base font-semibold text-slate-950 dark:text-white">{session.title}</h3>
        {session.description && <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{session.description}</p>}
        <p className="mt-1 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400">
          {formatNptDateTime(session.scheduledStart)} · {session.durationMinutes} min · Google Meet
        </p>
        {error && <p role="alert" className="mt-2 text-xs text-red-700 dark:text-red-300">{error}</p>}
      </div>
      <div className="flex flex-col items-stretch gap-2 shrink-0">
        {canJoin(phase) ? (
          <button type="button" disabled={busy} onClick={() => void open('join')} className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-50">
            <span>Join Live Class</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        ) : phase === 'upcoming' ? (
          <span className="text-xs text-slate-500">Link opens {Math.min(session.joinWindowMinutes ?? joinWindowMinutes, joinWindowMinutes)} min before start</span>
        ) : null}
        {session.hasRecording && (
          <button type="button" disabled={busy} onClick={() => void open('recording')} className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 disabled:opacity-50">
            Watch recording
          </button>
        )}
      </div>
    </div>
  );
}
