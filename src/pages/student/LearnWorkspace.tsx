import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download, ExternalLink, FileText, PlayCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCatalog } from '../../context/CatalogContext';
import { StudentLiveClassCard } from '../../components/StudentLiveClassCard';
import { btnGhost, btnPrimary, EmptyState, NoteContent, Notice, Panel, Pill, Progress, Section, Tabs } from '../../components/lms/ui';
import { batchData, useStudentData } from './StudentData';
import { AssignmentList } from './StudentPages';
import { errorMessage, listNotes, listResources, openResource } from '../../lib/lmsApi';
import { requestSessionLink, toggleLessonProgress } from '../../lib/firestoreService';
import { formatBytes, KIND_LABEL } from '../../lib/files';
import { formatNptDateTime, safeHttpUrl, sessionPhase } from '../../lib/sessions';
import type { ClassNote, Resource } from '../../types';

type Tab = 'overview' | 'content' | 'notes' | 'recordings' | 'assignments';

function ResourceRow({ r, batchId, onError }: { r: Resource; batchId: string; onError: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  const act = async (download: boolean) => {
    setBusy(true);
    try {
      await openResource(batchId, r.id, download);
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const isLink = r.kind === 'link';
  return (
    <div className="flex items-center gap-3 p-3.5">
      <FileText className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{r.title}</p>
        <p className="text-xs text-slate-500 truncate">{KIND_LABEL[r.kind]}{r.size ? ` · ${formatBytes(r.size)}` : ''}{r.description ? ` · ${r.description}` : ''}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button type="button" className={btnGhost} disabled={busy} onClick={() => void act(false)}>{isLink ? 'Open link' : 'View'}<ExternalLink className="w-3.5 h-3.5" aria-hidden="true" /></button>
        {!isLink && r.allowDownload !== false && <button type="button" className={btnGhost} disabled={busy} onClick={() => void act(true)} aria-label={`Download ${r.title}`}><Download className="w-3.5 h-3.5" aria-hidden="true" /></button>}
      </div>
    </div>
  );
}

export function LearnWorkspace() {
  const { enrollmentId } = useParams();
  const { profile } = useAuth();
  const { batches, settings } = useCatalog();
  const { loading, active, byBatch, progress, setProgress, percentFor } = useStudentData();
  const e = active.find((x) => x.id === enrollmentId);
  const [tab, setTab] = useState<Tab>('overview');
  const [resources, setResources] = useState<Resource[] | null>(null);
  const [notes, setNotes] = useState<ClassNote[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openNote, setOpenNote] = useState<string | null>(null);

  useEffect(() => {
    if (!e) return;
    let alive = true;
    Promise.all([listResources(e.batchId, true), listNotes(e.batchId, true)])
      .then(([r, n]) => {
        if (!alive) return;
        setResources(r);
        setNotes(n);
        if (n[0]) setOpenNote(n[0].id);
      })
      .catch(() => alive && setError('Could not load course material. Please refresh.'));
    return () => {
      alive = false;
    };
  }, [e]);

  const data = e ? batchData(byBatch, e.batchId) : null;
  const batch = batches.find((b) => b.id === e?.batchId);
  const roadmap = useMemo(() => (resources ?? []).filter((r) => r.kind === 'roadmap' && !r.archived).sort((a, b) => (b.version ?? 0) - (a.version ?? 0))[0], [resources]);
  const upcoming = useMemo(() => {
    const now = new Date();
    return (data?.sessions ?? [])
      .filter((s) => ['upcoming', 'joinable', 'live'].includes(sessionPhase({ now, scheduledStart: s.scheduledStart, durationMinutes: s.durationMinutes, status: s.status })))
      .sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart));
  }, [data]);

  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (!e || !data) {
    return <EmptyState title="Course not available" text="This course is not part of your approved enrolments." action={<Link to="/student/learning" className={btnPrimary}>My Learning</Link>} />;
  }

  const pct = percentFor(e);
  const recordings = data.sessions.filter((s) => s.hasRecording).sort((a, b) => b.scheduledStart.localeCompare(a.scheduledStart));
  const modules = Array.from(new Set(data.lessons.map((l) => l.moduleTitle || 'Lessons')));
  const files = (resources ?? []).filter((r) => r.kind !== 'roadmap');

  const toggle = async (lessonId: string, completed: boolean) => {
    if (!profile) return;
    try {
      await toggleLessonProgress({ studentId: profile.uid, courseId: e.courseId, batchId: e.batchId, lessonId, completed });
      const next = progress.filter((p) => p.lessonId !== lessonId);
      next.push({ id: `${profile.uid}_${lessonId}`, studentId: profile.uid, courseId: e.courseId, batchId: e.batchId, lessonId, completed });
      setProgress(next);
    } catch {
      setError('Could not save your progress. Please try again.');
    }
  };

  const watch = async (sessionId: string) => {
    try {
      window.open(await requestSessionLink(e.batchId, sessionId, 'recording'), '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <>
      <Link to="/student/learning" className="inline-flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white mb-4">
        <ArrowLeft className="w-4 h-4" aria-hidden="true" /> My Learning
      </Link>
      <div className="mb-6">
        <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight">{e.courseTitle}</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>{e.batchName}</span>
          {batch?.instructorName && <><span aria-hidden="true">·</span><span>Instructor: {batch.instructorName}</span></>}
          <Pill tone={e.enrollmentStatus === 'completed' ? 'brand' : 'good'}>{e.enrollmentStatus === 'completed' ? 'Completed' : 'Active'}</Pill>
        </p>
        {data.lessons.length > 0 && (
          <div className="mt-3 max-w-sm flex items-center gap-3"><Progress value={pct} /><span className="text-xs tabular-nums text-slate-500">{pct}%</span></div>
        )}
      </div>

      {error && <div className="mb-4"><Notice kind="error">{error}</Notice></div>}

      <Tabs<Tab>
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'content', label: 'Content', count: files.length + data.lessons.length },
          { id: 'notes', label: 'Daily notes', count: notes?.length },
          { id: 'recordings', label: 'Recordings', count: recordings.length },
          { id: 'assignments', label: 'Assignments', count: data.assignments.length },
        ]}
      />

      {tab === 'overview' && (
        <>
          <Section title="Next live class">
            {upcoming[0] ? (
              <StudentLiveClassCard session={{ ...upcoming[0], courseTitle: e.courseTitle }} studentId={profile?.uid ?? ''} joinWindowMinutes={settings.joinWindowMinutes ?? 15} />
            ) : (
              <Panel className="px-5 py-4 text-sm text-slate-600 dark:text-slate-400">No upcoming class yet. Your instructor will schedule the next one here.</Panel>
            )}
          </Section>
          <Section title="Course roadmap">
            {resources === null ? <p className="text-sm text-slate-500">Loading…</p> : roadmap ? (
              <Panel className="divide-y divide-slate-100 dark:divide-slate-800"><ResourceRow r={roadmap} batchId={e.batchId} onError={setError} /></Panel>
            ) : (
              <Panel className="px-5 py-4 text-sm text-slate-600 dark:text-slate-400">The roadmap has not been published yet.</Panel>
            )}
          </Section>
          {data.announcements.length > 0 && (
            <Section title="Announcements">
              <Panel className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.announcements.slice(0, 3).map((a) => (
                  <div key={a.id} className="p-4"><p className="text-sm font-semibold">{a.title}</p><p className="text-sm text-slate-700 dark:text-slate-300 mt-1 whitespace-pre-line">{a.body}</p></div>
                ))}
              </Panel>
            </Section>
          )}
        </>
      )}

      {tab === 'content' && (
        <>
          {roadmap && <Section title="Course roadmap"><Panel><ResourceRow r={roadmap} batchId={e.batchId} onError={setError} /></Panel></Section>}
          {modules.length > 0 && (
            <Section title="Learning modules">
              <div className="space-y-4">
                {modules.map((m) => (
                  <Panel key={m} className="divide-y divide-slate-100 dark:divide-slate-800">
                    <p className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{m}</p>
                    {data.lessons.filter((l) => (l.moduleTitle || 'Lessons') === m).sort((a, b) => a.orderIndex - b.orderIndex).map((l) => {
                      const done = progress.some((p) => p.lessonId === l.id && p.completed);
                      const video = safeHttpUrl(l.videoUrl);
                      return (
                        <div key={l.id} className="flex items-center gap-3 px-4 py-3">
                          <input type="checkbox" checked={done} onChange={(ev) => void toggle(l.id, ev.target.checked)} aria-label={`Mark "${l.title}" complete`} className="rounded border-slate-300" />
                          <div className="min-w-0 flex-1">
                            <p className={`text-sm font-medium ${done ? 'text-slate-500 line-through' : ''}`}>{l.title}</p>
                            {l.contentSummary && <p className="text-xs text-slate-500 truncate">{l.contentSummary}</p>}
                          </div>
                          {video && <a href={video} target="_blank" rel="noopener noreferrer" className={btnGhost}><PlayCircle className="w-4 h-4" aria-hidden="true" />Watch</a>}
                        </div>
                      );
                    })}
                  </Panel>
                ))}
              </div>
            </Section>
          )}
          <Section title="Files and links">
            {resources === null ? <p className="text-sm text-slate-500">Loading…</p> : files.length === 0 ? (
              <EmptyState title="No files yet" text="Lecture PDFs, slides and worksheets published by your instructor appear here." />
            ) : (
              <Panel className="divide-y divide-slate-100 dark:divide-slate-800">{files.map((r) => <ResourceRow key={r.id} r={r} batchId={e.batchId} onError={setError} />)}</Panel>
            )}
          </Section>
        </>
      )}

      {tab === 'notes' && (
        notes === null ? <p className="text-sm text-slate-500">Loading…</p> : notes.length === 0 ? (
          <EmptyState title="No class notes yet" text="Your instructor publishes notes after each class." />
        ) : (
          <ol className="relative border-l border-slate-200 dark:border-slate-800 ml-2 space-y-5">
            {notes.map((n) => {
              const expanded = openNote === n.id;
              return (
                <li key={n.id} className="ml-5">
                  <span className="absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full bg-brand-600" aria-hidden="true" />
                  <button type="button" onClick={() => setOpenNote(expanded ? null : n.id)} className="text-left w-full" aria-expanded={expanded}>
                    <p className="text-xs text-slate-500">{n.date || 'Undated'}{n.moduleTitle ? ` · ${n.moduleTitle}` : ''}{(n.revision ?? 1) > 2 ? ' · updated' : ''}</p>
                    <p className="text-sm font-semibold">{n.title}</p>
                    {n.description && !expanded && <p className="text-sm text-slate-600 dark:text-slate-400">{n.description}</p>}
                  </button>
                  {expanded && (
                    <Panel className="mt-2 p-4 space-y-3">
                      {n.description && <p className="text-sm text-slate-600 dark:text-slate-400">{n.description}</p>}
                      {n.content && <NoteContent text={n.content} />}
                      {n.attachmentIds.length > 0 && (
                        <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800">
                          {n.attachmentIds.map((id) => {
                            const r = (resources ?? []).find((x) => x.id === id);
                            return r ? <ResourceRow key={id} r={r} batchId={e.batchId} onError={setError} /> : null;
                          })}
                        </div>
                      )}
                      {n.links.length > 0 && (
                        <ul className="text-sm space-y-1">{n.links.map((l) => <li key={l.url}><a href={safeHttpUrl(l.url) ?? '#'} target="_blank" rel="noopener noreferrer" className="text-brand-700 dark:text-brand-400 underline">{l.label}</a></li>)}</ul>
                      )}
                    </Panel>
                  )}
                </li>
              );
            })}
          </ol>
        )
      )}

      {tab === 'recordings' && (
        recordings.length === 0 ? <EmptyState title="No recordings yet" text="Class recordings appear here after your instructor adds them." /> : (
          <Panel className="divide-y divide-slate-100 dark:divide-slate-800">
            {recordings.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0"><p className="text-sm font-semibold truncate">{s.title}</p><p className="text-xs text-slate-500">{formatNptDateTime(s.scheduledStart)}</p></div>
                <button type="button" className={btnPrimary} onClick={() => void watch(s.id)}><PlayCircle className="w-4 h-4" aria-hidden="true" />Watch</button>
              </div>
            ))}
          </Panel>
        )
      )}

      {tab === 'assignments' && <AssignmentList assignments={data.assignments} />}
    </>
  );
}
