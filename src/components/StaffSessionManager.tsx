import { useState, type FormEvent } from 'react';
import { ApiError } from '../lib/api';
import {
  listAttendance,
  saveAttendance,
  saveBatchLiveSession,
  setSessionRecording,
  setSessionStatus,
  type AttendanceRecord,
} from '../lib/firestoreService';
import { formatNptDateTime, parseMeetUrl, sessionPhase } from '../lib/sessions';
import type { Batch, Enrollment, LiveSession } from '../types';

interface Props {
  batch: Batch;
  sessions: LiveSession[];
  /** approved/completed enrollments of this batch */
  students: Enrollment[];
  onChanged: () => Promise<void> | void;
}

const input =
  'px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950';
const STATUSES: AttendanceRecord['status'][] = ['present', 'late', 'absent', 'excused'];

function errText(err: unknown): string {
  if (err instanceof ApiError) {
    return err.code === 'MFA_REQUIRED' ? 'Enrol an authenticator app at /staff/security and sign in again.' : err.message;
  }
  return 'Something went wrong. Please try again.';
}

/** Schedule Google Meet classes, mark attendance and attach recordings for one batch. */
export function StaffSessionManager({ batch, sessions, students, onChanged }: Props) {
  const [form, setForm] = useState({ title: '', date: '', time: '19:30', durationMinutes: 90, meetingUrl: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [marks, setMarks] = useState<Record<string, AttendanceRecord['status']>>({});
  const [recordingUrl, setRecordingUrl] = useState('');

  const meetValid = form.meetingUrl === '' || parseMeetUrl(form.meetingUrl) !== null;

  const schedule = async (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (!parseMeetUrl(form.meetingUrl)) {
      setMessage({ ok: false, text: 'Paste a valid Google Meet link, e.g. https://meet.google.com/abc-defg-hij' });
      return;
    }
    setBusy(true);
    try {
      await saveBatchLiveSession({ batchId: batch.id, ...form });
      setForm((f) => ({ ...f, title: '', meetingUrl: '' }));
      setMessage({ ok: true, text: 'Live class scheduled.' });
      await onChanged();
    } catch (err) {
      setMessage({ ok: false, text: errText(err) });
    } finally {
      setBusy(false);
    }
  };

  const openSession = async (s: LiveSession) => {
    if (openId === s.id) return setOpenId(null);
    setOpenId(s.id);
    setRecordingUrl('');
    try {
      const existing = await listAttendance(batch.id, s.id);
      setMarks(Object.fromEntries(existing.map((r) => [r.studentId, r.status])));
    } catch {
      setMarks({});
    }
  };

  const submitAttendance = async (s: LiveSession) => {
    const records = students
      .filter((st) => marks[st.studentId])
      .map((st) => ({ studentId: st.studentId, status: marks[st.studentId] }));
    if (records.length === 0) return setMessage({ ok: false, text: 'Mark at least one student.' });
    setBusy(true);
    try {
      await saveAttendance(batch.id, s.id, records);
      setMessage({ ok: true, text: 'Attendance saved.' });
    } catch (err) {
      setMessage({ ok: false, text: errText(err) });
    } finally {
      setBusy(false);
    }
  };

  const submitRecording = async (s: LiveSession) => {
    setBusy(true);
    try {
      await setSessionRecording(batch.id, s.id, recordingUrl);
      setMessage({ ok: true, text: 'Recording attached. Enrolled students can now watch it.' });
      setRecordingUrl('');
      await onChanged();
    } catch (err) {
      setMessage({ ok: false, text: errText(err) });
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (s: LiveSession, status: 'completed' | 'cancelled') => {
    setBusy(true);
    try {
      await setSessionStatus(batch.id, s.id, status);
      await onChanged();
    } catch (err) {
      setMessage({ ok: false, text: errText(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={(e) => void schedule(e)} className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
        <h2 className="font-display text-base font-semibold text-slate-950 dark:text-white">Schedule live class — {batch.name}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input className={input} required minLength={3} maxLength={140} placeholder="Class title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          <input className={input} required type="url" placeholder="https://meet.google.com/abc-defg-hij" value={form.meetingUrl} onChange={(e) => setForm((f) => ({ ...f, meetingUrl: e.target.value }))} aria-invalid={!meetValid} />
          <label className="text-xs text-slate-500 space-y-1">
            Date (Nepal time)
            <input className={`${input} w-full font-mono`} required type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          </label>
          <label className="text-xs text-slate-500 space-y-1">
            Start time (Nepal time)
            <input className={`${input} w-full font-mono`} required type="time" value={form.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} />
          </label>
          <label className="text-xs text-slate-500 space-y-1">
            Expected duration
            <select className={`${input} w-full`} value={form.durationMinutes} onChange={(e) => setForm((f) => ({ ...f, durationMinutes: Number(e.target.value) }))}>
              {[45, 60, 90, 120, 150, 180].map((m) => (
                <option key={m} value={m}>{m} minutes</option>
              ))}
            </select>
          </label>
        </div>
        {!meetValid && <p className="text-xs text-red-700 dark:text-red-300">That is not a Google Meet link.</p>}
        <p className="text-xs text-slate-500">
          The link is stored privately and shown to enrolled students only shortly before the class. Also set the
          meeting's host controls in Google Meet (e.g. require host approval), since a student could still share the link.
        </p>
        <button disabled={busy} className="px-5 py-2 text-xs font-semibold rounded-lg bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-50">
          Save live class
        </button>
        {message && <p role="status" className={`text-xs ${message.ok ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-300'}`}>{message.text}</p>}
      </form>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-200 dark:divide-slate-800">
        {sessions.length === 0 && <p className="p-6 text-sm text-slate-500 text-center">No live classes scheduled yet.</p>}
        {sessions.map((s) => {
          const phase = sessionPhase({ now: new Date(), scheduledStart: s.scheduledStart, durationMinutes: s.durationMinutes, status: s.status });
          return (
            <div key={s.id} className="p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-sm text-slate-950 dark:text-white">{s.title}</p>
                  <p className="text-xs text-slate-500 font-mono">{formatNptDateTime(s.scheduledStart)} · {s.durationMinutes} min</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs capitalize px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800">{phase}</span>
                  {s.hasRecording && <span className="text-xs text-brand-700 dark:text-brand-400">Recording attached</span>}
                  <button type="button" onClick={() => void openSession(s)} className="text-xs font-semibold text-brand-700 dark:text-brand-400 hover:underline">
                    {openId === s.id ? 'Close' : 'Attendance & recording'}
                  </button>
                </div>
              </div>

              {openId === s.id && (
                <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 space-y-4">
                  {students.length === 0 ? (
                    <p className="text-xs text-slate-500">No approved students in this batch yet.</p>
                  ) : (
                    <ul className="space-y-2">
                      {students.map((st) => (
                        <li key={st.studentId} className="flex items-center justify-between gap-3 text-sm">
                          <span>{st.studentName}</span>
                          <select aria-label={`Attendance for ${st.studentName}`} className={input} value={marks[st.studentId] ?? ''} onChange={(e) => setMarks((m) => ({ ...m, [st.studentId]: e.target.value as AttendanceRecord['status'] }))}>
                            <option value="">Not marked</option>
                            {STATUSES.map((v) => <option key={v} value={v} className="capitalize">{v}</option>)}
                          </select>
                        </li>
                      ))}
                    </ul>
                  )}
                  <button type="button" disabled={busy} onClick={() => void submitAttendance(s)} className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-brand-600 text-white disabled:opacity-50">Save attendance</button>

                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Recording link (https)</label>
                    <div className="flex gap-2">
                      <input className={`${input} flex-1`} type="url" placeholder="https://…" value={recordingUrl} onChange={(e) => setRecordingUrl(e.target.value)} />
                      <button type="button" disabled={busy || !recordingUrl} onClick={() => void submitRecording(s)} className="px-4 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 disabled:opacity-50">Attach</button>
                    </div>
                    <p className="text-xs text-slate-500">Use a restricted/unlisted link. Students get it only through their dashboard; it is not stored in a public document.</p>
                  </div>

                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex gap-3 text-xs">
                    <button type="button" disabled={busy} onClick={() => void setStatus(s, 'completed')} className="text-slate-600 hover:underline">Mark completed</button>
                    <button type="button" disabled={busy} onClick={() => void setStatus(s, 'cancelled')} className="text-red-700 hover:underline">Cancel class</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
