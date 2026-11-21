import { useState, type FormEvent } from 'react';
import { btnGhost, btnPrimary, EmptyState, fieldClass, Notice, Panel, Pill } from '../../components/lms/ui';
import { createBatchAnnouncement, gradeSubmission, saveBatchAssignment } from '../../lib/firestoreService';
import { errorMessage } from '../../lib/lmsApi';
import { parseFirestoreErrorMessage } from '../../lib/firebase';
import { safeHttpUrl } from '../../lib/sessions';
import { useInstructorData } from './InstructorData';
import type { Batch, Submission } from '../../types';

export function GradeRow({ s, maxScore, onDone }: { s: Submission; maxScore: number; onDone: () => void }) {
  const [score, setScore] = useState(String(s.score ?? ''));
  const [feedback, setFeedback] = useState(s.feedback ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const link = safeHttpUrl(s.submissionUrl);
  const grade = async (status: 'graded' | 'needs_revision') => {
    setBusy(true);
    setErr(null);
    try {
      await gradeSubmission({ submissionId: s.id, status, score: Number(score || 0), feedback });
      onDone();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="p-3.5 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{s.studentName}</p>
          {link ? <a href={link} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-700 dark:text-brand-400 underline break-all">{s.submissionUrl}</a> : <span className="text-xs text-slate-500">Invalid link</span>}
        </div>
        <Pill tone={s.status === 'graded' ? 'good' : s.status === 'needs_revision' ? 'warn' : 'brand'}>{s.status === 'graded' ? `Graded ${s.score}/${maxScore}` : s.status === 'needs_revision' ? 'Needs revision' : 'To review'}</Pill>
      </div>
      {err && <Notice kind="error">{err}</Notice>}
      <div className="flex flex-wrap gap-2">
        <input className={`${fieldClass} !w-24`} type="number" min={0} max={maxScore} placeholder={`/${maxScore}`} value={score} onChange={(e) => setScore(e.target.value)} aria-label="Score" />
        <input className={`${fieldClass} flex-1 min-w-[10rem]`} placeholder="Feedback" value={feedback} onChange={(e) => setFeedback(e.target.value)} maxLength={1000} aria-label="Feedback" />
        <button className={btnPrimary} disabled={busy || score === ''} onClick={() => void grade('graded')}>Grade</button>
        <button className={btnGhost} disabled={busy} onClick={() => void grade('needs_revision')}>Request revision</button>
      </div>
    </div>
  );
}

export function AssignmentsPanel({ batch }: { batch: Batch }) {
  const { assignmentsByBatch, submissions, reload } = useInstructorData();
  const assignments = assignmentsByBatch[batch.id] ?? [];
  const [f, setF] = useState({ title: '', instructions: '', dueDate: '', maxScore: 100 });
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await saveBatchAssignment({ courseId: batch.courseId, batchId: batch.id, instructorId: batch.instructorId, ...f });
      setF({ title: '', instructions: '', dueDate: '', maxScore: 100 });
      setShow(false);
      await reload();
      setMsg({ ok: true, text: 'Assignment created.' });
    } catch (err) {
      setMsg({ ok: false, text: parseFirestoreErrorMessage(err) });
    }
  };

  return (
    <div className="space-y-5">
      {msg && <Notice kind={msg.ok ? 'ok' : 'error'}>{msg.text}</Notice>}
      {show ? (
        <Panel className="p-4">
          <form onSubmit={(e) => void create(e)} className="grid sm:grid-cols-2 gap-3">
            <label className="text-xs font-medium sm:col-span-2">Title<input className={`${fieldClass} mt-1`} required maxLength={140} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
            <label className="text-xs font-medium sm:col-span-2">Instructions<textarea className={`${fieldClass} mt-1`} rows={3} required maxLength={2000} value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} /></label>
            <label className="text-xs font-medium">Due date<input className={`${fieldClass} mt-1`} type="date" required value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></label>
            <label className="text-xs font-medium">Max score<input className={`${fieldClass} mt-1`} type="number" min={1} max={1000} value={f.maxScore} onChange={(e) => setF({ ...f, maxScore: Number(e.target.value) })} /></label>
            <div className="sm:col-span-2 flex gap-2"><button className={btnPrimary}>Create assignment</button><button type="button" className={btnGhost} onClick={() => setShow(false)}>Cancel</button></div>
          </form>
        </Panel>
      ) : (
        <button type="button" className={btnGhost} onClick={() => setShow(true)}>New assignment</button>
      )}

      {assignments.length === 0 ? <EmptyState title="No assignments yet" /> : assignments.map((a) => {
        const subs = submissions.filter((s) => s.assignmentId === a.id && s.batchId === batch.id);
        return (
          <Panel key={a.id}>
            <div className="p-4 border-b border-slate-100 dark:border-slate-800">
              <p className="text-sm font-semibold">{a.title}</p>
              <p className="text-xs text-slate-500">Due {a.dueDate} · {a.maxScore} points · {subs.length} submission{subs.length === 1 ? '' : 's'}</p>
            </div>
            {subs.length === 0 ? <p className="p-4 text-sm text-slate-500">No submissions yet.</p> : <div className="divide-y divide-slate-100 dark:divide-slate-800">{subs.map((s) => <GradeRow key={s.id} s={s} maxScore={a.maxScore} onDone={() => void reload()} />)}</div>}
          </Panel>
        );
      })}
    </div>
  );
}

export function AnnouncementComposer({ batch, authorName }: { batch: Batch; authorName: string }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const send = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await createBatchAnnouncement({ courseId: batch.courseId, batchId: batch.id, instructorId: batch.instructorId, authorName, title, body });
      setTitle('');
      setBody('');
      setMsg({ ok: true, text: 'Announcement published to enrolled students.' });
    } catch (err) {
      setMsg({ ok: false, text: parseFirestoreErrorMessage(err) });
    }
  };
  return (
    <Panel className="p-4">
      <form onSubmit={(e) => void send(e)} className="space-y-3">
        <p className="text-sm font-semibold">Publish an announcement</p>
        {msg && <Notice kind={msg.ok ? 'ok' : 'error'}>{msg.text}</Notice>}
        <input className={fieldClass} required maxLength={140} placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea className={fieldClass} required rows={3} maxLength={1500} placeholder="Message to enrolled students" value={body} onChange={(e) => setBody(e.target.value)} />
        <button className={btnGhost}>Publish announcement</button>
      </form>
    </Panel>
  );
}
