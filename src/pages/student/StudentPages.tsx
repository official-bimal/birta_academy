import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Award, BookOpen, CalendarDays } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCatalog } from '../../context/CatalogContext';
import { StudentLiveClassCard } from '../../components/StudentLiveClassCard';
import { btnGhost, btnPrimary, EmptyState, fieldClass, Notice, PageHeader, Panel, Pill, Progress, Section } from '../../components/lms/ui';
import { batchData, useStudentData } from './StudentData';
import { parseFirestoreErrorMessage } from '../../lib/firebase';
import { submitAssignmentWork, updateOwnProfile } from '../../lib/firestoreService';
import { errorMessage } from '../../lib/lmsApi';
import { formatNpr } from '../../lib/validation';
import { formatNptDateTime, safeHttpUrl, sessionPhase } from '../../lib/sessions';
import type { Assignment, Enrollment, LiveSession } from '../../types';

/** Upcoming (not cancelled/ended) classes across the student's active batches, soonest first. */
export function useUpcomingClasses() {
  const { active, byBatch } = useStudentData();
  return useMemo(() => {
    const now = new Date();
    return active
      .flatMap((e) => batchData(byBatch, e.batchId).sessions.map((s) => ({ session: s, enrollment: e })))
      .filter(({ session }) => {
        const phase = sessionPhase({ now, scheduledStart: session.scheduledStart, durationMinutes: session.durationMinutes, status: session.status });
        return phase === 'upcoming' || phase === 'joinable' || phase === 'live';
      })
      .sort((a, b) => a.session.scheduledStart.localeCompare(b.session.scheduledStart));
  }, [active, byBatch]);
}

const statusTone = { pending: 'warn', approved: 'good', completed: 'brand', rejected: 'bad' } as const;

function CourseRow({ e }: { e: Enrollment }) {
  const { percentFor, byBatch } = useStudentData();
  const pct = percentFor(e);
  const lessons = batchData(byBatch, e.batchId).lessons.length;
  return (
    <Link to={`/student/learn/${e.id}`} className="flex items-center gap-4 p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-950 dark:text-white truncate">{e.courseTitle}</p>
        <p className="text-xs text-slate-500 truncate">{e.batchName}</p>
        {lessons > 0 && <div className="mt-2 max-w-xs"><Progress value={pct} /></div>}
      </div>
      {lessons > 0 && <span className="text-xs tabular-nums text-slate-500">{pct}%</span>}
      <ArrowRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
    </Link>
  );
}

export function StudentHome() {
  const { profile } = useAuth();
  const { settings } = useCatalog();
  const { loading, error, active, pending, enrollments } = useStudentData();
  const upcoming = useUpcomingClasses();
  const next = upcoming[0];
  const first = (profile?.displayName ?? '').split(' ')[0] || 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  // "continue learning": the active course with the most recent lesson activity, else the first one
  const cont = active[0];

  if (loading) return <p className="text-sm text-slate-500" role="status">Loading your dashboard…</p>;
  return (
    <>
      <PageHeader title={`${greeting}, ${first}`} subtitle={next ? undefined : 'Your next class and courses will appear here.'} />
      {error && <Notice kind="error">{error}</Notice>}

      {enrollments.length === 0 ? (
        <EmptyState
          title="You are not enrolled in a course yet"
          text="Browse the catalogue, pick a batch and submit your enrolment request. Your courses appear here once approved."
          action={<Link to="/courses" className={btnPrimary}>Browse courses</Link>}
        />
      ) : (
        <>
          <Section title="Next live class">
            {next ? (
              <StudentLiveClassCard session={{ ...next.session, courseTitle: next.enrollment.courseTitle }} studentId={profile?.uid ?? ''} joinWindowMinutes={settings.joinWindowMinutes ?? 15} />
            ) : (
              <Panel className="px-5 py-4 text-sm text-slate-600 dark:text-slate-400">No upcoming classes scheduled yet. Your instructor will publish them here.</Panel>
            )}
          </Section>

          {cont && (
            <Section title="Continue learning">
              <Panel className="divide-y divide-slate-100 dark:divide-slate-800"><CourseRow e={cont} /></Panel>
            </Section>
          )}

          {active.length > 1 && (
            <Section title="My courses" action={<Link to="/student/learning" className="text-xs font-semibold text-brand-700 dark:text-brand-400">View all</Link>}>
              <Panel className="divide-y divide-slate-100 dark:divide-slate-800">{active.slice(0, 4).map((e) => <CourseRow key={e.id} e={e} />)}</Panel>
            </Section>
          )}

          {pending.length > 0 && (
            <Section title="Pending enrolment requests">
              <Panel className="divide-y divide-slate-100 dark:divide-slate-800">
                {pending.map((e) => (
                  <div key={e.id} className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{e.courseTitle}</p>
                      <p className="text-xs text-slate-500 truncate">{e.batchName} · {formatNpr(e.amountNpr)} · ref {e.paymentReference}</p>
                    </div>
                    <Pill tone="warn">Awaiting payment verification</Pill>
                  </div>
                ))}
              </Panel>
            </Section>
          )}
        </>
      )}
    </>
  );
}

export function MyLearning() {
  const { loading, active, pending, rejected } = useStudentData();
  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;
  return (
    <>
      <PageHeader title="My Learning" subtitle="Open a course to see its roadmap, classes, notes and files." actions={<Link to="/courses" className={btnGhost}>Browse courses</Link>} />
      {active.length === 0 ? (
        <EmptyState title="No approved courses yet" text="Once the academy verifies your payment, the course appears here." action={<Link to="/courses" className={btnPrimary}>Browse courses</Link>} />
      ) : (
        <Panel className="divide-y divide-slate-100 dark:divide-slate-800">{active.map((e) => <CourseRow key={e.id} e={e} />)}</Panel>
      )}
      {(pending.length > 0 || rejected.length > 0) && (
        <Section title="Enrolment requests">
          <Panel className="divide-y divide-slate-100 dark:divide-slate-800">
            {[...pending, ...rejected].map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{e.courseTitle}</p>
                  <p className="text-xs text-slate-500 truncate">{e.batchName}{e.reviewNote && e.enrollmentStatus === 'rejected' ? ` · ${e.reviewNote}` : ''}</p>
                </div>
                <Pill tone={statusTone[e.enrollmentStatus]}>{e.enrollmentStatus === 'pending' ? 'Pending verification' : 'Rejected'}</Pill>
              </div>
            ))}
          </Panel>
        </Section>
      )}
    </>
  );
}

export function StudentLive() {
  const { profile } = useAuth();
  const { settings } = useCatalog();
  const { loading, active, byBatch } = useStudentData();
  const all = useMemo(
    () => active.flatMap((e) => batchData(byBatch, e.batchId).sessions.map((s) => ({ ...s, courseTitle: e.courseTitle }))).sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart)),
    [active, byBatch]
  );
  const now = new Date();
  const isPast = (s: LiveSession) => ['ended', 'completed', 'cancelled'].includes(sessionPhase({ now, scheduledStart: s.scheduledStart, durationMinutes: s.durationMinutes, status: s.status }));
  const upcoming = all.filter((s) => !isPast(s));
  const past = all.filter(isPast).reverse();
  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;
  return (
    <>
      <PageHeader title="Live Classes" subtitle="Times are shown in Nepal time. The join button opens shortly before each class." />
      {all.length === 0 ? (
        <EmptyState title="No classes scheduled yet" text="Classes from your approved courses appear here." />
      ) : (
        <>
          <Section title="Upcoming">
            <div className="space-y-3">
              {upcoming.length === 0 ? <p className="text-sm text-slate-500">Nothing upcoming.</p> : upcoming.map((s) => <StudentLiveClassCard key={s.id} session={s} studentId={profile?.uid ?? ''} joinWindowMinutes={settings.joinWindowMinutes ?? 15} />)}
            </div>
          </Section>
          {past.length > 0 && (
            <Section title="Past classes">
              <div className="space-y-3">{past.map((s) => <StudentLiveClassCard key={s.id} session={s} studentId={profile?.uid ?? ''} joinWindowMinutes={settings.joinWindowMinutes ?? 15} />)}</div>
            </Section>
          )}
        </>
      )}
    </>
  );
}

/** Compact assignment list + submission form, reused by the course workspace and the global Assignments page. */
export function AssignmentList({ assignments, enrollmentCourse }: { assignments: Assignment[]; enrollmentCourse?: (a: Assignment) => string }) {
  const { profile } = useAuth();
  const { submissions, reload } = useStudentData();
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (e: FormEvent, a: Assignment) => {
    e.preventDefault();
    const url = safeHttpUrl(urls[a.id] ?? '');
    if (!url || !profile) return setMsg({ ok: false, text: 'Enter a valid https link to your work.' });
    setBusy(a.id);
    setMsg(null);
    try {
      await submitAssignmentWork({ assignment: a, student: profile, submissionUrl: url });
      await reload();
      setMsg({ ok: true, text: 'Submitted.' });
    } catch (err) {
      setMsg({ ok: false, text: errorMessage(err, parseFirestoreErrorMessage(err)) });
    } finally {
      setBusy(null);
    }
  };

  if (assignments.length === 0) return <EmptyState title="No assignments yet" />;
  return (
    <div className="space-y-3">
      {msg && <Notice kind={msg.ok ? 'ok' : 'error'}>{msg.text}</Notice>}
      {assignments.map((a) => {
        const sub = submissions.find((s) => s.assignmentId === a.id);
        const canSubmit = !sub || sub.status !== 'graded';
        return (
          <Panel key={a.id} className="p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{a.title}</p>
                <p className="text-xs text-slate-500">{enrollmentCourse ? `${enrollmentCourse(a)} · ` : ''}Due {a.dueDate} · {a.maxScore} points</p>
              </div>
              {sub ? <Pill tone={sub.status === 'graded' ? 'good' : sub.status === 'needs_revision' ? 'warn' : 'brand'}>{sub.status === 'graded' ? `Graded ${sub.score}/${a.maxScore}` : sub.status === 'needs_revision' ? 'Needs revision' : 'Submitted'}</Pill> : <Pill>Not submitted</Pill>}
            </div>
            {a.instructions && <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-line">{a.instructions}</p>}
            {sub?.feedback && <p className="text-sm rounded-lg bg-slate-50 dark:bg-slate-950 px-3 py-2"><span className="font-semibold">Feedback: </span>{sub.feedback}</p>}
            {canSubmit && (
              <form onSubmit={(e) => void submit(e, a)} className="flex gap-2">
                <input className={fieldClass} type="url" placeholder="https://link-to-your-work" value={urls[a.id] ?? sub?.submissionUrl ?? ''} onChange={(e) => setUrls((u) => ({ ...u, [a.id]: e.target.value }))} aria-label={`Link to your work for ${a.title}`} />
                <button className={btnPrimary} disabled={busy === a.id}>{sub ? 'Resubmit' : 'Submit'}</button>
              </form>
            )}
          </Panel>
        );
      })}
    </div>
  );
}

export function StudentAssignments() {
  const { loading, active, byBatch } = useStudentData();
  const all = active.flatMap((e) => batchData(byBatch, e.batchId).assignments.map((a) => ({ a, course: e.courseTitle })));
  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;
  return (
    <>
      <PageHeader title="Assignments" subtitle="Submit a link to your work. Your instructor grades it and leaves feedback." />
      <AssignmentList assignments={all.map((x) => x.a)} enrollmentCourse={(a) => all.find((x) => x.a.id === a.id)?.course ?? ''} />
    </>
  );
}

export function StudentCertificates() {
  const { loading, certificates } = useStudentData();
  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;
  return (
    <>
      <PageHeader title="Certificates" subtitle="Issued by the academy after you complete a course." />
      {certificates.length === 0 ? (
        <EmptyState title="No certificates yet" text="When you meet the completion requirements, your certificate appears here with a public verification link." />
      ) : (
        <Panel className="divide-y divide-slate-100 dark:divide-slate-800">
          {certificates.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold flex items-center gap-2"><Award className="w-4 h-4 text-brand-600" aria-hidden="true" />{c.courseTitle}</p>
                <p className="text-xs text-slate-500 font-mono">{c.certificateCode}</p>
              </div>
              <div className="flex items-center gap-3">
                <Pill tone={c.status === 'issued' ? 'good' : 'bad'}>{c.status === 'issued' ? 'Valid' : 'Revoked'}</Pill>
                <Link to={`/verify/${c.certificateCode}`} className="text-xs font-semibold text-brand-700 dark:text-brand-400">Verify</Link>
              </div>
            </div>
          ))}
        </Panel>
      )}
    </>
  );
}

export function StudentProfile() {
  const { profile, refreshProfile } = useAuth();
  const [name, setName] = useState(profile?.displayName ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [city, setCity] = useState(profile?.city ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  if (!profile) return null;
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await updateOwnProfile(profile.uid, { displayName: name, phone, city, bio });
      await refreshProfile();
      setMsg({ ok: true, text: 'Profile saved.' });
    } catch (err) {
      setMsg({ ok: false, text: parseFirestoreErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader title="Profile & settings" />
      <form onSubmit={(e) => void save(e)} className="max-w-xl space-y-4">
        {msg && <Notice kind={msg.ok ? 'ok' : 'error'}>{msg.text}</Notice>}
        <label className="block text-xs font-medium">Email<input className={`${fieldClass} mt-1`} value={profile.email} readOnly disabled /></label>
        <label className="block text-xs font-medium">Full name<input className={`${fieldClass} mt-1`} value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} /></label>
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block text-xs font-medium">Phone<input className={`${fieldClass} mt-1`} value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} /></label>
          <label className="block text-xs font-medium">City<input className={`${fieldClass} mt-1`} value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} /></label>
        </div>
        <label className="block text-xs font-medium">About you<textarea className={`${fieldClass} mt-1`} rows={3} value={bio} onChange={(e) => setBio(e.target.value)} maxLength={500} /></label>
        <div className="flex items-center gap-3">
          <button className={btnPrimary} disabled={busy}>Save profile</button>
          <Link to="/student/settings/security" className="text-sm font-semibold text-brand-700 dark:text-brand-400">Security and login methods</Link>
        </div>
      </form>
    </>
  );
}

export function StudentNotifications() {
  const { loading, active, byBatch } = useStudentData();
  const items = active
    .flatMap((e) => batchData(byBatch, e.batchId).announcements.map((a) => ({ ...a, course: e.courseTitle })))
    .sort((a, b) => String(b.createdAt && typeof b.createdAt === 'object' && 'toMillis' in b.createdAt ? b.createdAt.toMillis() : 0).localeCompare(String(a.createdAt && typeof a.createdAt === 'object' && 'toMillis' in a.createdAt ? a.createdAt.toMillis() : 0)));
  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;
  return (
    <>
      <PageHeader title="Notifications" subtitle="Announcements from your instructors." />
      {items.length === 0 ? <EmptyState title="No announcements" /> : (
        <Panel className="divide-y divide-slate-100 dark:divide-slate-800">
          {items.map((a) => (
            <div key={a.id} className="p-4">
              <p className="text-xs text-slate-500">{a.course} · {a.authorName}</p>
              <p className="text-sm font-semibold mt-0.5">{a.title}</p>
              <p className="text-sm text-slate-700 dark:text-slate-300 mt-1 whitespace-pre-line">{a.body}</p>
            </div>
          ))}
        </Panel>
      )}
    </>
  );
}

export { BookOpen, CalendarDays, formatNptDateTime };
