import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarPlus, Upload } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCatalog } from '../../context/CatalogContext';
import { StaffSessionManager } from '../../components/StaffSessionManager';
import { btnGhost, EmptyState, Panel, Pill, Section, Tabs } from '../../components/lms/ui';
import { formatNptDateTime, sessionPhase } from '../../lib/sessions';
import { formatNpr } from '../../lib/validation';
import { useInstructorData } from './InstructorData';
import { ContentPanel } from './ContentPanel';
import { AnnouncementComposer, AssignmentsPanel } from './AssignmentsPanel';

type Tab = 'overview' | 'content' | 'classes' | 'students' | 'assignments';

/** Central teaching workspace for one assigned course batch. */
export function CourseWorkspace() {
  const { batchId } = useParams();
  const { profile } = useAuth();
  const { settings } = useCatalog();
  const { loading, batches, students, sessionsByBatch, assignmentsByBatch, submissions, reload } = useInstructorData();
  const [tab, setTab] = useState<Tab>('overview');
  const [startContent, setStartContent] = useState<'resource' | null>(null);
  const [startClass, setStartClass] = useState(false);

  const batch = batches.find((b) => b.id === batchId);
  const sessions = sessionsByBatch[batchId ?? ''] ?? [];
  const roster = useMemo(() => students.filter((s) => s.batchId === batchId), [students, batchId]);
  const next = useMemo(() => {
    const now = new Date();
    return sessions
      .filter((s) => s.published !== false && ['upcoming', 'joinable', 'live'].includes(sessionPhase({ now, scheduledStart: s.scheduledStart, durationMinutes: s.durationMinutes, status: s.status })))
      .sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart))[0];
  }, [sessions]);

  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;
  // A course that is not assigned to this instructor is simply not found (the server enforces the same rule).
  if (!batch) return <EmptyState title="Course not found" text="This course is not assigned to you." action={<Link to="/instructor/courses" className={btnGhost}>My Courses</Link>} />;
  const toReview = submissions.filter((s) => s.batchId === batch.id && s.status === 'submitted').length;
  const maxWindow = settings.joinWindowMinutes ?? 15;

  return (
    <>
      <Link to="/instructor/courses" className="inline-flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white mb-4">
        <ArrowLeft className="w-4 h-4" aria-hidden="true" /> My Courses
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div className="min-w-0">
          <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight">{batch.courseTitle}</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 flex flex-wrap items-center gap-2">{batch.name}<Pill tone={batch.status === 'ongoing' ? 'good' : 'brand'}>{batch.status}</Pill></p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnGhost} onClick={() => { setStartContent('resource'); setTab('content'); }}><Upload className="w-4 h-4" aria-hidden="true" />Upload resource</button>
          <button type="button" className={btnGhost} onClick={() => { setStartClass(true); setTab('classes'); }}><CalendarPlus className="w-4 h-4" aria-hidden="true" />Schedule class</button>
        </div>
      </div>

      <Tabs<Tab>
        active={tab}
        onChange={(t) => { setTab(t); if (t !== 'content') setStartContent(null); if (t !== 'classes') setStartClass(false); }}
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'content', label: 'Course Content' },
          { id: 'classes', label: 'Live Classes', count: sessions.length },
          { id: 'students', label: 'Students', count: roster.length },
          { id: 'assignments', label: 'Assignments', count: toReview },
        ]}
      />

      {tab === 'overview' && (
        <>
          <Section title="Next live class">
            {next ? (
              <Panel className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div><p className="text-sm font-semibold">{next.title}</p><p className="text-xs text-slate-500 font-mono">{formatNptDateTime(next.scheduledStart)} · {next.durationMinutes} min</p></div>
                <button type="button" className={btnGhost} onClick={() => setTab('classes')}>Manage</button>
              </Panel>
            ) : (
              <Panel className="p-4 text-sm text-slate-600 dark:text-slate-400">No upcoming class. Use “Schedule class” above.</Panel>
            )}
          </Section>
          <Section title="Batch">
            <Panel className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              {[
                ['Dates', `${batch.startDate} → ${batch.endDate}`],
                ['Schedule', batch.scheduleText || '—'],
                ['Students', `${roster.length} of ${batch.seatLimit} seats`],
                ['Fee', formatNpr(batch.priceNpr)],
                ['Pending reviews', String(toReview)],
              ].map(([k, v]) => <div key={k} className="flex justify-between gap-4 px-4 py-2.5"><span className="text-slate-500">{k}</span><span className="font-medium text-right">{v}</span></div>)}
            </Panel>
          </Section>
          {profile && <Section title="Announcement"><AnnouncementComposer batch={batch} authorName={profile.displayName} /></Section>}
        </>
      )}

      {tab === 'content' && <ContentPanel batch={batch} startWith={startContent} />}
      {tab === 'classes' && <StaffSessionManager batch={batch} sessions={sessions} students={roster} maxJoinWindow={maxWindow} onChanged={reload} openForm={startClass} />}
      {tab === 'students' && (
        roster.length === 0 ? <EmptyState title="No enrolled students yet" text="Students appear here once the academy approves their enrolment." /> : (
          <Panel className="divide-y divide-slate-100 dark:divide-slate-800">
            {roster.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 p-3.5">
                <div className="min-w-0"><p className="text-sm font-medium truncate">{s.studentName}</p><p className="text-xs text-slate-500 truncate">{s.studentEmail}</p></div>
                <Pill tone={s.enrollmentStatus === 'completed' ? 'brand' : 'good'}>{s.enrollmentStatus === 'completed' ? 'Completed' : 'Active'}</Pill>
              </div>
            ))}
          </Panel>
        )
      )}
      {tab === 'assignments' && <AssignmentsPanel batch={batch} />}
      <span className="sr-only">{(assignmentsByBatch[batch.id] ?? []).length} assignments</span>
    </>
  );
}
