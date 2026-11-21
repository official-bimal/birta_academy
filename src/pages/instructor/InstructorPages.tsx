import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { EmptyState, Notice, PageHeader, Panel, Pill, Section } from '../../components/lms/ui';
import { formatNptDateTime, sessionPhase } from '../../lib/sessions';
import { useInstructorData } from './InstructorData';
import { GradeRow } from './AssignmentsPanel';
import type { Batch, LiveSession } from '../../types';

const ws = (b: Batch) => `/instructor/courses/${b.courseId}/batches/${b.id}`;

function useUpcoming() {
  const { batches, sessionsByBatch } = useInstructorData();
  return useMemo(() => {
    const now = new Date();
    return batches
      .flatMap((b) => (sessionsByBatch[b.id] ?? []).map((s) => ({ s, b })))
      .filter(({ s }) => ['upcoming', 'joinable', 'live'].includes(sessionPhase({ now, scheduledStart: s.scheduledStart, durationMinutes: s.durationMinutes, status: s.status })))
      .sort((a, c) => a.s.scheduledStart.localeCompare(c.s.scheduledStart));
  }, [batches, sessionsByBatch]);
}

function ClassRow({ s, b }: { s: LiveSession; b: Batch }) {
  return (
    <Link to={ws(b)} className="flex items-center justify-between gap-3 p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50">
      <div className="min-w-0">
        <p className="text-sm font-semibold truncate">{s.title}</p>
        <p className="text-xs text-slate-500 truncate">{b.courseTitle} · {b.name} · <span className="font-mono">{formatNptDateTime(s.scheduledStart)}</span></p>
      </div>
      {s.published === false ? <Pill tone="warn">Draft</Pill> : <ArrowRight className="w-4 h-4 text-slate-400" aria-hidden="true" />}
    </Link>
  );
}

export function InstructorOverview() {
  const { profile } = useAuth();
  const { loading, error, batches, students, submissions } = useInstructorData();
  const upcoming = useUpcoming();
  const pending = submissions.filter((s) => s.status === 'submitted');
  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;
  const next = upcoming[0];
  return (
    <>
      <PageHeader title={`Welcome, ${(profile?.displayName ?? '').split(' ')[0] || 'instructor'}`} />
      {error && <Notice kind="error">{error}</Notice>}
      <dl className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {[
          ['Assigned courses', batches.length],
          ['Upcoming classes', upcoming.length],
          ['Students', students.length],
          ['To review', pending.length],
        ].map(([k, v]) => (
          <Panel key={String(k)} className="px-4 py-3"><dt className="text-xs text-slate-500">{k}</dt><dd className="text-2xl font-display font-bold tabular-nums">{v}</dd></Panel>
        ))}
      </dl>

      {batches.length === 0 ? (
        <EmptyState title="No courses assigned yet" text="The academy administrator assigns courses and batches to you. They will appear here." />
      ) : (
        <>
          <Section title="Next live class">
            {next ? <Panel><ClassRow s={next.s} b={next.b} /></Panel> : <Panel className="p-4 text-sm text-slate-600 dark:text-slate-400">No upcoming classes. Open a course to schedule one.</Panel>}
          </Section>
          <Section title="My courses" action={<Link to="/instructor/courses" className="text-xs font-semibold text-brand-700 dark:text-brand-400">View all</Link>}>
            <CourseList batches={batches.slice(0, 4)} />
          </Section>
          <Section title="Recent submissions">
            {pending.length === 0 ? <p className="text-sm text-slate-500">Nothing waiting for review.</p> : (
              <Panel className="divide-y divide-slate-100 dark:divide-slate-800">
                {pending.slice(0, 4).map((s) => {
                  const b = batches.find((x) => x.id === s.batchId);
                  return b ? <Link key={s.id} to={`${ws(b)}`} className="flex items-center justify-between gap-3 p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50"><span className="text-sm truncate">{s.studentName} · {b.courseTitle}</span><Pill tone="brand">To review</Pill></Link> : null;
                })}
              </Panel>
            )}
          </Section>
        </>
      )}
    </>
  );
}

function CourseList({ batches }: { batches: Batch[] }) {
  const { students, sessionsByBatch } = useInstructorData();
  const now = new Date();
  return (
    <Panel className="divide-y divide-slate-100 dark:divide-slate-800">
      {batches.map((b) => {
        const next = (sessionsByBatch[b.id] ?? [])
          .filter((s) => s.published !== false && ['upcoming', 'joinable', 'live'].includes(sessionPhase({ now, scheduledStart: s.scheduledStart, durationMinutes: s.durationMinutes, status: s.status })))
          .sort((a, c) => a.scheduledStart.localeCompare(c.scheduledStart))[0];
        const count = students.filter((s) => s.batchId === b.id).length;
        return (
          <Link key={b.id} to={ws(b)} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50">
            <div className="min-w-0 flex-1 basis-56">
              <p className="text-sm font-semibold truncate">{b.courseTitle}</p>
              <p className="text-xs text-slate-500 truncate">{b.name} · {count} student{count === 1 ? '' : 's'}</p>
            </div>
            <p className="text-xs text-slate-500 font-mono basis-44">{next ? formatNptDateTime(next.scheduledStart) : 'No class scheduled'}</p>
            <Pill tone={b.status === 'ongoing' ? 'good' : b.status === 'upcoming' ? 'brand' : 'neutral'}>{b.status}</Pill>
            <span className="text-xs font-semibold text-brand-700 dark:text-brand-400 inline-flex items-center gap-1">Manage course <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" /></span>
          </Link>
        );
      })}
    </Panel>
  );
}

export function MyCourses() {
  const { loading, batches } = useInstructorData();
  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;
  return (
    <>
      <PageHeader title="My Courses" subtitle="Courses and batches the academy has assigned to you." />
      {batches.length === 0 ? <EmptyState title="No courses assigned yet" text="Your administrator assigns you to a batch; it will show up here." /> : <CourseList batches={batches} />}
    </>
  );
}

export function InstructorClasses() {
  const { loading, batches, sessionsByBatch } = useInstructorData();
  const upcoming = useUpcoming();
  const past = useMemo(() => {
    const now = new Date();
    return batches
      .flatMap((b) => (sessionsByBatch[b.id] ?? []).map((s) => ({ s, b })))
      .filter(({ s }) => ['ended', 'completed', 'cancelled'].includes(sessionPhase({ now, scheduledStart: s.scheduledStart, durationMinutes: s.durationMinutes, status: s.status })))
      .sort((a, c) => c.s.scheduledStart.localeCompare(a.s.scheduledStart));
  }, [batches, sessionsByBatch]);
  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;
  return (
    <>
      <PageHeader title="Live Classes" subtitle="Schedule and manage classes inside each course workspace." />
      <Section title="Upcoming">{upcoming.length === 0 ? <p className="text-sm text-slate-500">No upcoming classes.</p> : <Panel className="divide-y divide-slate-100 dark:divide-slate-800">{upcoming.map(({ s, b }) => <ClassRow key={s.id} s={s} b={b} />)}</Panel>}</Section>
      {past.length > 0 && <Section title="Past"><Panel className="divide-y divide-slate-100 dark:divide-slate-800">{past.slice(0, 15).map(({ s, b }) => <ClassRow key={s.id} s={s} b={b} />)}</Panel></Section>}
    </>
  );
}

export function InstructorStudents() {
  const { loading, batches, students } = useInstructorData();
  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;
  return (
    <>
      <PageHeader title="Students" subtitle="Approved students in your batches." />
      {students.length === 0 ? <EmptyState title="No enrolled students yet" /> : batches.map((b) => {
        const rows = students.filter((s) => s.batchId === b.id);
        if (rows.length === 0) return null;
        return (
          <Section key={b.id} title={`${b.courseTitle} · ${b.name}`}>
            <Panel className="divide-y divide-slate-100 dark:divide-slate-800">{rows.map((s) => <div key={s.id} className="p-3.5"><p className="text-sm font-medium">{s.studentName}</p><p className="text-xs text-slate-500">{s.studentEmail}</p></div>)}</Panel>
          </Section>
        );
      })}
    </>
  );
}

export function InstructorAssignments() {
  const { loading, batches, submissions, assignmentsByBatch, reload } = useInstructorData();
  const pending = submissions.filter((s) => s.status === 'submitted');
  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;
  return (
    <>
      <PageHeader title="Assignments" subtitle="Submissions waiting for your review. Create assignments inside each course workspace." />
      {pending.length === 0 ? <EmptyState title="Nothing to review" text="New submissions from your students appear here." /> : (
        <Panel className="divide-y divide-slate-100 dark:divide-slate-800">
          {pending.map((s) => {
            const b = batches.find((x) => x.id === s.batchId);
            const a = (assignmentsByBatch[s.batchId] ?? []).find((x) => x.id === s.assignmentId);
            return (
              <div key={s.id}>
                <p className="px-3.5 pt-3 text-xs text-slate-500">{b?.courseTitle} · {a?.title}</p>
                <GradeRow s={s} maxScore={a?.maxScore ?? 100} onDone={() => void reload()} />
              </div>
            );
          })}
        </Panel>
      )}
    </>
  );
}
