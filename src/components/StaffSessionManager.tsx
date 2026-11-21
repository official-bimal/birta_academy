import { useEffect, useState, type FormEvent } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
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
import { btnGhost, btnPrimary, EmptyState, fieldClass, Notice, Panel, Pill } from './lms/ui';
import type { Batch, Enrollment, LiveSession } from '../types';

interface Props {
  batch: Batch;
  sessions: LiveSession[];
  /** approved/completed enrollments of this batch */
  students: Enrollment[];
  /** academy-wide maximum for the joining window (minutes) */
  maxJoinWindow: number;
  onChanged: () => Promise<void> | void;
  /** open the schedule form immediately (from the workspace header) */
  openForm?: boolean;
}

const STATUSES: AttendanceRecord['status'][] = ['present', 'late', 'absent', 'excused'];
const blank = { title: '', description: '', moduleTitle: '', date: '', time: '19:00', durationMinutes: 90, meetingUrl: '', joinWindowMinutes: '', published: true };

function errText(err: unknown): string {
  if (err instanceof ApiError) return err.code === 'MFA_REQUIRED' ? 'Enrol an authenticator app at /staff/security and sign in again.' : err.message;
  return 'Something went wrong. Please try again.';
}

const nptDateTime = (iso: string) => {
  const npt = new Date(new Date(iso).getTime() + (5 * 60 + 45) * 60_000);
  return { date: npt.toISOString().slice(0, 10), time: npt.toISOString().slice(11, 16) };
};

/** Schedule, reschedule, publish, cancel Google Meet classes; mark attendance; attach recordings. */
export function StaffSessionManager({ batch, sessions, students, maxJoinWindow, onChanged, openForm }: Props) {
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(Boolean(openForm));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [marks, setMarks] = useState<Record<string, AttendanceRecord['status']>>({});
  const [recordingUrl, setRecordingUrl] = useState('');

  useEffect(() => {
    if (openForm) setShowForm(true);
  }, [openForm]);

  const meetValid = form.meetingUrl === '' || parseMeetUrl(form.meetingUrl) !== null;

  const edit = async (s: LiveSession) => {
    const { date, time } = nptDateTime(s.scheduledStart);
    let meetingUrl = '';
    try {
      // staff may read the private link of their own class
      meetingUrl = ((await getDoc(doc(db, 'batches', batch.id, 'sessionSecrets', s.id))).data()?.meetingUrl as string) ?? '';
    } catch {
      /* leave blank: it must be pasted again */
    }
    setForm({ title: s.title, description: s.description ?? '', moduleTitle: s.moduleTitle ?? '', date, time, durationMinutes: s.durationMinutes, meetingUrl, joinWindowMinutes: s.joinWindowMinutes === undefined ? '' : String(s.joinWindowMinutes), published: s.published !== false });
    setEditingId(s.id);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const reset = () => {
    setForm(blank);
    setEditingId(null);
    setShowForm(false);
  };

  const schedule = async (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (!parseMeetUrl(form.meetingUrl)) return setMessage({ ok: false, text: 'Paste a valid Google Meet link, e.g. https://meet.google.com/abc-defg-hij' });
    setBusy(true);
    try {
      await saveBatchLiveSession({
        id: editingId ?? undefined,
        batchId: batch.id,
        title: form.title,
        description: form.description,
        moduleTitle: form.moduleTitle,
        date: form.date,
        time: form.time,
        durationMinutes: form.durationMinutes,
        meetingUrl: form.meetingUrl,
        joinWindowMinutes: form.joinWindowMinutes === '' ? undefined : Number(form.joinWindowMinutes),
        published: form.published,
      });
      setMessage({ ok: true, text: editingId ? 'Class updated.' : form.published ? 'Class scheduled and visible to students.' : 'Class saved as a draft.' });
      reset();
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
      setMarks(Object.fromEntries((await listAttendance(batch.id, s.id)).map((r) => [r.studentId, r.status])));
    } catch {
      setMarks({});
    }
  };

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      setMessage({ ok: true, text: ok });
      await onChanged();
    } catch (err) {
      setMessage({ ok: false, text: errText(err) });
    } finally {
      setBusy(false);
    }
  };

  const submitAttendance = (s: LiveSession) => {
    const records = students.filter((st) => marks[st.studentId]).map((st) => ({ studentId: st.studentId, status: marks[st.studentId] }));
    if (records.length === 0) return setMessage({ ok: false, text: 'Mark at least one student.' });
    void run(() => saveAttendance(batch.id, s.id, records), 'Attendance saved.');
  };

  return (
    <div className="space-y-6">
      {message && <Notice kind={message.ok ? 'ok' : 'error'}>{message.text}</Notice>}

      {!showForm ? (
        <div><button type="button" className={btnPrimary} onClick={() => setShowForm(true)}>Schedule class</button></div>
      ) : (
        <Panel className="p-5">
          <form onSubmit={(e) => void schedule(e)} className="space-y-4">
            <h2 className="text-sm font-semibold">{editingId ? 'Edit or reschedule class' : 'Schedule class'}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-xs font-medium sm:col-span-2">Class title<input className={`${fieldClass} mt-1`} required minLength={3} maxLength={140} placeholder="Meta Ads Fundamentals" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} /></label>
              <label className="text-xs font-medium sm:col-span-2">Description (optional)<input className={`${fieldClass} mt-1`} maxLength={500} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></label>
              <label className="text-xs font-medium">Module (optional)<input className={`${fieldClass} mt-1`} maxLength={100} value={form.moduleTitle} onChange={(e) => setForm((f) => ({ ...f, moduleTitle: e.target.value }))} /></label>
              <label className="text-xs font-medium">Google Meet link<input className={`${fieldClass} mt-1`} required type="url" placeholder="https://meet.google.com/abc-defg-hij" value={form.meetingUrl} onChange={(e) => setForm((f) => ({ ...f, meetingUrl: e.target.value }))} aria-invalid={!meetValid} /></label>
              <label className="text-xs font-medium">Date (Nepal time)<input className={`${fieldClass} mt-1 font-mono`} required type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} /></label>
              <label className="text-xs font-medium">Start time (Nepal time)<input className={`${fieldClass} mt-1 font-mono`} required type="time" value={form.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} /></label>
              <label className="text-xs font-medium">Duration
                <select className={`${fieldClass} mt-1`} value={form.durationMinutes} onChange={(e) => setForm((f) => ({ ...f, durationMinutes: Number(e.target.value) }))}>
                  {[45, 60, 90, 120, 150, 180].map((m) => <option key={m} value={m}>{m} minutes</option>)}
                </select>
              </label>
              <label className="text-xs font-medium">Joining window (minutes before start)
                <input className={`${fieldClass} mt-1`} type="number" min={0} max={maxJoinWindow} placeholder={`Academy default (max ${maxJoinWindow})`} value={form.joinWindowMinutes} onChange={(e) => setForm((f) => ({ ...f, joinWindowMinutes: e.target.value }))} />
              </label>
            </div>
            {!meetValid && <p className="text-xs text-red-700 dark:text-red-300">That is not a Google Meet link.</p>}
            <label className="inline-flex items-center gap-2 text-xs"><input type="checkbox" checked={form.published} onChange={(e) => setForm((f) => ({ ...f, published: e.target.checked }))} /> Visible to students (uncheck to keep as a draft)</label>
            <p className="text-xs text-slate-500">The link is stored privately and shown to enrolled students only inside the joining window. Also set host controls in Google Meet (for example, require host approval): a student could still share the link.</p>
            <div className="flex gap-2">
              <button className={btnPrimary} disabled={busy}>{editingId ? 'Save changes' : 'Save class'}</button>
              <button type="button" className={btnGhost} onClick={reset}>Cancel</button>
            </div>
          </form>
        </Panel>
      )}

      {sessions.length === 0 ? (
        <EmptyState title="No classes scheduled yet" text="Use “Schedule class” to add the first one." />
      ) : (
        <Panel className="divide-y divide-slate-100 dark:divide-slate-800">
          {[...sessions].sort((a, b) => b.scheduledStart.localeCompare(a.scheduledStart)).map((s) => {
            const phase = sessionPhase({ now: new Date(), scheduledStart: s.scheduledStart, durationMinutes: s.durationMinutes, status: s.status });
            const ended = phase === 'ended' || phase === 'completed';
            return (
              <div key={s.id} className="p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{s.title}</p>
                    <p className="text-xs text-slate-500 font-mono">{formatNptDateTime(s.scheduledStart)} · {s.durationMinutes} min{s.moduleTitle ? ` · ${s.moduleTitle}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {s.published === false && <Pill tone="warn">Draft</Pill>}
                    <Pill tone={phase === 'cancelled' ? 'bad' : ended ? 'neutral' : phase === 'live' || phase === 'joinable' ? 'good' : 'brand'}>{phase === 'joinable' ? 'Joining open' : phase === 'live' ? 'In progress' : phase}</Pill>
                    {s.hasRecording && <Pill tone="good">Recording</Pill>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  {phase !== 'cancelled' && <button type="button" className="font-semibold text-brand-700 dark:text-brand-400" onClick={() => void edit(s)}>Edit / reschedule</button>}
                  <button type="button" className="font-semibold text-brand-700 dark:text-brand-400" onClick={() => void openSession(s)}>{openId === s.id ? 'Close' : 'Attendance & recording'}</button>
                  {s.published === false ? (
                    <button type="button" className="text-slate-700 dark:text-slate-300" disabled={busy} onClick={() => void edit(s)}>Publish…</button>
                  ) : null}
                  {phase !== 'cancelled' && !ended && <button type="button" disabled={busy} className="text-red-700 dark:text-red-400" onClick={() => { if (window.confirm('Cancel this class? Students will see it as cancelled.')) void run(() => setSessionStatus(batch.id, s.id, 'cancelled'), 'Class cancelled.'); }}>Cancel class</button>}
                  {!ended && phase !== 'cancelled' && <button type="button" disabled={busy} className="text-slate-700 dark:text-slate-300" onClick={() => void run(() => setSessionStatus(batch.id, s.id, 'completed'), 'Marked completed.')}>Mark completed</button>}
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
                            <select aria-label={`Attendance for ${st.studentName}`} className={`${fieldClass} !w-auto`} value={marks[st.studentId] ?? ''} onChange={(e) => setMarks((m) => ({ ...m, [st.studentId]: e.target.value as AttendanceRecord['status'] }))}>
                              <option value="">Not marked</option>
                              {STATUSES.map((v) => <option key={v} value={v}>{v}</option>)}
                            </select>
                          </li>
                        ))}
                      </ul>
                    )}
                    <button type="button" disabled={busy} onClick={() => submitAttendance(s)} className={btnGhost}>Save attendance</button>
                    <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                      <label className="text-xs font-medium">Recording link (https)</label>
                      <div className="flex gap-2">
                        <input className={fieldClass} type="url" placeholder="https://…" value={recordingUrl} onChange={(e) => setRecordingUrl(e.target.value)} />
                        <button type="button" disabled={busy || !recordingUrl} onClick={() => void run(async () => { await setSessionRecording(batch.id, s.id, recordingUrl); setRecordingUrl(''); }, 'Recording attached. Enrolled students can now watch it.')} className={btnGhost}>Attach</button>
                      </div>
                      <p className="text-xs text-slate-500">Use a restricted or unlisted link. Students get it only through their course page, not from a public page.</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </Panel>
      )}
    </div>
  );
}
