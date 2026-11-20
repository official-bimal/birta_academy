import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Calendar,
  FileCheck,
  Megaphone,
  PlayCircle,
  Trash2,
  Users,
  Video,
} from 'lucide-react';
import { DashboardShell, type DashboardNavItem } from '../../components/DashboardShell';
import { useAuth } from '../../context/AuthContext';
import { useCatalog } from '../../context/CatalogContext';
import {
  createBatchAnnouncement,
  deleteBatchLesson,
  gradeSubmission,
  listAllEnrollments,
  listBatchAnnouncements,
  listBatchAssignments,
  listBatchLessons,
  listBatchLiveSessions,
  listInstructorEnrollments,
  listInstructorSubmissions,
  saveBatchAssignment,
  saveBatchLesson,
  saveBatchLiveSession,
} from '../../lib/firestoreService';
import { parseFirestoreErrorMessage } from '../../lib/firebase';
import { formatDateTimeValue, formatDateValue } from '../../lib/validation';
import type {
  Announcement,
  Assignment,
  Batch,
  Enrollment,
  Lesson,
  LiveSession,
  LiveSessionStatus,
  Submission,
  SubmissionStatus,
} from '../../types';

export function InstructorDashboard() {
  const { profile, isAdmin } = useAuth();
  const { batches, courses } = useCatalog();
  const [activeTab, setActiveTab] = useState('batches');
  const [selectedBatchId, setSelectedBatchId] = useState('');

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  // Forms
  const [lessonForm, setLessonForm] = useState({
    title: '',
    moduleTitle: 'Module 1',
    orderIndex: 1,
    contentSummary: '',
    videoUrl: '',
    resourceUrl: '',
    durationMinutes: 45,
  });

  const [sessionForm, setSessionForm] = useState({
    title: '',
    scheduledStart: '2026-12-10T19:30',
    durationMinutes: 90,
    meetingPlatform: 'Google Meet',
    meetingUrl: '',
    status: 'scheduled' as LiveSessionStatus,
  });

  const [asgnForm, setAsgnForm] = useState({
    title: '',
    instructions: '',
    dueDate: '2026-12-20',
    maxScore: 100,
  });

  const [annForm, setAnnForm] = useState({ title: '', body: '' });

  // Grading state per submission
  const [gradeInputs, setGradeInputs] = useState<
    Record<string, { score: string; feedback: string; status: SubmissionStatus }>
  >({});

  const assignedBatches: Batch[] = useMemo(() => {
    if (!profile) return [];
    if (isAdmin) return batches;
    return batches.filter((b) => b.instructorId === profile.uid);
  }, [batches, profile, isAdmin]);

  useEffect(() => {
    if (assignedBatches.length > 0 && !selectedBatchId) {
      setSelectedBatchId(assignedBatches[0].id);
    }
  }, [assignedBatches, selectedBatchId]);

  const activeBatch = assignedBatches.find((b) => b.id === selectedBatchId) || null;

  const loadInstructorData = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const [enr, subs] = await Promise.all([
        isAdmin ? listAllEnrollments() : listInstructorEnrollments(profile.uid),
        listInstructorSubmissions(profile.uid, isAdmin),
      ]);
      setEnrollments(enr);
      setSubmissions(subs);

      if (selectedBatchId) {
        const [l, s, a, ann] = await Promise.all([
          listBatchLessons(selectedBatchId),
          listBatchLiveSessions(selectedBatchId),
          listBatchAssignments(selectedBatchId),
          listBatchAnnouncements(selectedBatchId),
        ]);
        setLessons(l);
        setSessions(s);
        setAssignments(a);
        setAnnouncements(ann);
      } else {
        setLessons([]);
        setSessions([]);
        setAssignments([]);
        setAnnouncements([]);
      }
    } catch (err) {
      setErrorMsg(parseFirestoreErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [profile, isAdmin, selectedBatchId]);

  useEffect(() => {
    void loadInstructorData();
  }, [loadInstructorData]);

  const batchEnrollments = useMemo(
    () =>
      enrollments.filter(
        (e) =>
          e.batchId === selectedBatchId &&
          (e.enrollmentStatus === 'approved' || e.enrollmentStatus === 'completed')
      ),
    [enrollments, selectedBatchId]
  );

  const batchSubmissions = useMemo(
    () => submissions.filter((s) => s.batchId === selectedBatchId),
    [submissions, selectedBatchId]
  );

  const handleAddLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBatch) return;
    setErrorMsg(null);
    setNotice(null);
    try {
      await saveBatchLesson({
        courseId: activeBatch.courseId,
        batchId: activeBatch.id,
        instructorId: activeBatch.instructorId,
        ...lessonForm,
      });
      setLessonForm({
        title: '',
        moduleTitle: 'Module 1',
        orderIndex: lessons.length + 2,
        contentSummary: '',
        videoUrl: '',
        resourceUrl: '',
        durationMinutes: 45,
      });
      setNotice('Lesson published to batch.');
      await loadInstructorData();
    } catch (err) {
      setErrorMsg(parseFirestoreErrorMessage(err));
    }
  };

  const handleDeleteLesson = async (lessonId: string) => {
    if (!activeBatch) return;
    setErrorMsg(null);
    try {
      await deleteBatchLesson(activeBatch.id, lessonId);
      setNotice('Lesson removed.');
      await loadInstructorData();
    } catch (err) {
      setErrorMsg(parseFirestoreErrorMessage(err));
    }
  };

  const handleAddSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBatch) return;
    setErrorMsg(null);
    setNotice(null);
    try {
      await saveBatchLiveSession({
        courseId: activeBatch.courseId,
        batchId: activeBatch.id,
        instructorId: activeBatch.instructorId,
        ...sessionForm,
      });
      setSessionForm((prev) => ({ ...prev, title: '', meetingUrl: '' }));
      setNotice('Live session scheduled.');
      await loadInstructorData();
    } catch (err) {
      setErrorMsg(parseFirestoreErrorMessage(err));
    }
  };

  const handleAddAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBatch) return;
    setErrorMsg(null);
    setNotice(null);
    try {
      await saveBatchAssignment({
        courseId: activeBatch.courseId,
        batchId: activeBatch.id,
        instructorId: activeBatch.instructorId,
        ...asgnForm,
      });
      setAsgnForm({ title: '', instructions: '', dueDate: '2026-12-20', maxScore: 100 });
      setNotice('Assignment created.');
      await loadInstructorData();
    } catch (err) {
      setErrorMsg(parseFirestoreErrorMessage(err));
    }
  };

  const handleGrade = async (sub: Submission) => {
    const draft = gradeInputs[sub.id] || {
      score: String(sub.score ?? 85),
      feedback: sub.feedback ?? '',
      status: 'graded' as SubmissionStatus,
    };
    setErrorMsg(null);
    setNotice(null);
    try {
      await gradeSubmission({
        submissionId: sub.id,
        status: draft.status,
        score: Number(draft.score) || 0,
        feedback: draft.feedback || 'Reviewed by instructor.',
      });
      setNotice(`Saved review for ${sub.studentName}.`);
      await loadInstructorData();
    } catch (err) {
      setErrorMsg(parseFirestoreErrorMessage(err));
    }
  };

  const handlePostAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBatch || !profile) return;
    setErrorMsg(null);
    setNotice(null);
    try {
      await createBatchAnnouncement({
        courseId: activeBatch.courseId,
        batchId: activeBatch.id,
        instructorId: activeBatch.instructorId,
        authorName: profile.displayName,
        title: annForm.title,
        body: annForm.body,
      });
      setAnnForm({ title: '', body: '' });
      setNotice('Announcement posted to enrolled students.');
      await loadInstructorData();
    } catch (err) {
      setErrorMsg(parseFirestoreErrorMessage(err));
    }
  };

  const navItems: DashboardNavItem[] = [
    { id: 'batches', label: 'Assigned Batches', icon: BookOpen, count: assignedBatches.length },
    { id: 'live', label: 'Live Sessions', icon: Video, count: sessions.length },
    { id: 'lessons', label: 'Lessons & Resources', icon: PlayCircle, count: lessons.length },
    { id: 'assignments', label: 'Assignments & Review', icon: FileCheck, count: batchSubmissions.length },
    { id: 'roster', label: 'Student Roster', icon: Users, count: batchEnrollments.length },
    { id: 'announcements', label: 'Announcements', icon: Megaphone, count: announcements.length },
  ];

  return (
    <DashboardShell
      portalTitle="Instructor Portal"
      roleLabel={isAdmin ? 'Admin / Instructor Access' : 'Instructor Account'}
      navItems={navItems}
      activeTab={activeTab}
      onSelectTab={(id) => {
        setActiveTab(id);
        setNotice(null);
      }}
      headerAction={
        assignedBatches.length > 0 ? (
          <select
            aria-label="Select active batch"
            value={selectedBatchId}
            onChange={(e) => setSelectedBatchId(e.target.value)}
            className="max-w-xs px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
          >
            {assignedBatches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.courseTitle} — {b.name}
              </option>
            ))}
          </select>
        ) : undefined
      }
    >
      {errorMsg && (
        <div
          role="alert"
          className="mb-6 p-4 rounded-lg border border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-sm text-red-700 dark:text-red-300"
        >
          {errorMsg}
        </div>
      )}

      {notice && (
        <div className="mb-6 p-4 rounded-lg border border-emerald-300 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 text-sm text-emerald-800 dark:text-emerald-300">
          {notice}
        </div>
      )}

      {assignedBatches.length === 0 ? (
        <div className="p-10 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-2">
          <h2 className="font-display text-lg font-semibold text-slate-950 dark:text-white">
            No batches assigned yet
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Ask an Academy Admin to assign your Instructor ID (<span className="font-mono">{profile?.uid}</span>) to a course batch.
          </p>
        </div>
      ) : loading ? (
        <div className="h-40 rounded-xl bg-slate-200/60 dark:bg-slate-900 animate-pulse" />
      ) : (
        <>
          {/* ASSIGNED BATCHES */}
          {activeTab === 'batches' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {assignedBatches.map((batch) => {
                  const course = courses.find((c) => c.id === batch.courseId);
                  const active = batch.id === selectedBatchId;
                  return (
                    <div
                      key={batch.id}
                      className={`p-6 rounded-xl bg-white dark:bg-slate-900 border transition-colors ${
                        active
                          ? 'border-violet-600'
                          : 'border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                        <span className="capitalize font-medium text-violet-700 dark:text-violet-400">
                          {batch.status}
                        </span>
                        <span className="font-mono tabular-nums">
                          {formatDateValue(batch.startDate)} – {formatDateValue(batch.endDate)}
                        </span>
                      </div>
                      <h2 className="mt-2 font-display text-lg font-semibold text-slate-950 dark:text-white">
                        {batch.courseTitle}
                      </h2>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                        {batch.name} · {batch.scheduleText} ({batch.timezone})
                      </p>
                      {course && (
                        <p className="text-xs text-slate-500 mt-2">
                          Category: {course.categoryName} · Level: {course.level}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => setSelectedBatchId(batch.id)}
                        className="mt-4 px-3.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        {active ? 'Selected Active Batch' : 'Manage This Batch'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* LIVE SESSIONS */}
          {activeTab === 'live' && activeBatch && (
            <div className="space-y-6">
              <form
                onSubmit={handleAddSession}
                className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4"
              >
                <h2 className="font-display text-base font-semibold text-slate-950 dark:text-white">
                  Schedule Live Session — {activeBatch.name}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input
                    type="text"
                    required
                    placeholder="Session title (e.g. Week 2 Live Q&A)"
                    value={sessionForm.title}
                    onChange={(e) => setSessionForm((p) => ({ ...p, title: e.target.value }))}
                    className="px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                  <input
                    type="datetime-local"
                    required
                    value={sessionForm.scheduledStart}
                    onChange={(e) =>
                      setSessionForm((p) => ({ ...p, scheduledStart: e.target.value }))
                    }
                    className="px-3.5 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                  <input
                    type="text"
                    required
                    placeholder="Platform (Google Meet / Zoom)"
                    value={sessionForm.meetingPlatform}
                    onChange={(e) =>
                      setSessionForm((p) => ({ ...p, meetingPlatform: e.target.value }))
                    }
                    className="px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                  <input
                    type="url"
                    placeholder="Meeting URL (gated to approved students)"
                    value={sessionForm.meetingUrl}
                    onChange={(e) => setSessionForm((p) => ({ ...p, meetingUrl: e.target.value }))}
                    className="px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold rounded-lg bg-slate-950 dark:bg-violet-600 text-white hover:opacity-90"
                >
                  Add Live Session
                </button>
              </form>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-200 dark:divide-slate-800">
                {sessions.map((s) => (
                  <div key={s.id} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sm text-slate-950 dark:text-white">{s.title}</p>
                      <p className="text-xs text-slate-500 font-mono">
                        {formatDateTimeValue(s.scheduledStart)} · {s.meetingPlatform} · {s.durationMinutes} min
                      </p>
                    </div>
                    <span className="text-xs font-mono text-slate-500 truncate max-w-xs">
                      {s.meetingUrl || 'No meeting link yet'}
                    </span>
                  </div>
                ))}
                {sessions.length === 0 && (
                  <p className="p-6 text-sm text-slate-500 text-center">No live sessions scheduled yet.</p>
                )}
              </div>
            </div>
          )}

          {/* LESSONS & RESOURCES */}
          {activeTab === 'lessons' && activeBatch && (
            <div className="space-y-6">
              <form
                onSubmit={handleAddLesson}
                className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4"
              >
                <h2 className="font-display text-base font-semibold text-slate-950 dark:text-white">
                  Upload Recorded Lesson / Resource — {activeBatch.name}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <input
                    type="text"
                    required
                    placeholder="Lesson title"
                    value={lessonForm.title}
                    onChange={(e) => setLessonForm((p) => ({ ...p, title: e.target.value }))}
                    className="md:col-span-2 px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                  <input
                    type="text"
                    required
                    placeholder="Module title"
                    value={lessonForm.moduleTitle}
                    onChange={(e) => setLessonForm((p) => ({ ...p, moduleTitle: e.target.value }))}
                    className="px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                  <input
                    type="url"
                    placeholder="Recording URL (YouTube unlisted / Vimeo / Drive)"
                    value={lessonForm.videoUrl}
                    onChange={(e) => setLessonForm((p) => ({ ...p, videoUrl: e.target.value }))}
                    className="px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                  <input
                    type="url"
                    placeholder="Resource / Slides URL (optional)"
                    value={lessonForm.resourceUrl}
                    onChange={(e) => setLessonForm((p) => ({ ...p, resourceUrl: e.target.value }))}
                    className="px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                  <input
                    type="number"
                    min={1}
                    max={600}
                    placeholder="Duration (min)"
                    value={lessonForm.durationMinutes}
                    onChange={(e) =>
                      setLessonForm((p) => ({ ...p, durationMinutes: Number(e.target.value) }))
                    }
                    className="px-3.5 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <textarea
                  required
                  rows={3}
                  placeholder="Lesson summary and key takeaways"
                  value={lessonForm.contentSummary}
                  onChange={(e) =>
                    setLessonForm((p) => ({ ...p, contentSummary: e.target.value }))
                  }
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold rounded-lg bg-slate-950 dark:bg-violet-600 text-white hover:opacity-90"
                >
                  Publish Lesson
                </button>
              </form>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-200 dark:divide-slate-800">
                {lessons.map((l) => (
                  <div key={l.id} className="p-5 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs text-slate-500">
                        #{l.orderIndex} · {l.moduleTitle} · {l.durationMinutes} min
                      </p>
                      <p className="font-semibold text-sm text-slate-950 dark:text-white mt-0.5">
                        {l.title}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleDeleteLesson(l.id)}
                      aria-label={`Delete ${l.title}`}
                      className="p-2 text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {lessons.length === 0 && (
                  <p className="p-6 text-sm text-slate-500 text-center">No lessons added yet.</p>
                )}
              </div>
            </div>
          )}

          {/* ASSIGNMENTS & SUBMISSION GRADING */}
          {activeTab === 'assignments' && activeBatch && (
            <div className="space-y-6">
              <form
                onSubmit={handleAddAssignment}
                className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4"
              >
                <h2 className="font-display text-base font-semibold text-slate-950 dark:text-white">
                  Create Practical Assignment
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <input
                    type="text"
                    required
                    placeholder="Assignment title"
                    value={asgnForm.title}
                    onChange={(e) => setAsgnForm((p) => ({ ...p, title: e.target.value }))}
                    className="px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                  <input
                    type="date"
                    required
                    value={asgnForm.dueDate}
                    onChange={(e) => setAsgnForm((p) => ({ ...p, dueDate: e.target.value }))}
                    className="px-3.5 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={asgnForm.maxScore}
                    onChange={(e) =>
                      setAsgnForm((p) => ({ ...p, maxScore: Number(e.target.value) }))
                    }
                    className="px-3.5 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <textarea
                  required
                  rows={3}
                  placeholder="Assignment requirements and grading rubric..."
                  value={asgnForm.instructions}
                  onChange={(e) => setAsgnForm((p) => ({ ...p, instructions: e.target.value }))}
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold rounded-lg bg-slate-950 dark:bg-violet-600 text-white hover:opacity-90"
                >
                  Publish Assignment
                </button>
              </form>

              <div className="space-y-4">
                <h3 className="font-display text-base font-semibold text-slate-950 dark:text-white">
                  Student Submissions ({batchSubmissions.length})
                </h3>
                {batchSubmissions.length === 0 ? (
                  <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm text-slate-500">
                    No student submissions for this batch yet.
                  </div>
                ) : (
                  batchSubmissions.map((sub) => {
                    const asgn = assignments.find((a) => a.id === sub.assignmentId);
                    const draft = gradeInputs[sub.id] || {
                      score: String(sub.score ?? ''),
                      feedback: sub.feedback ?? '',
                      status: sub.status === 'submitted' ? 'graded' : sub.status,
                    };
                    return (
                      <div
                        key={sub.id}
                        className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="font-semibold text-slate-950 dark:text-white">
                            {sub.studentName} · {asgn?.title || sub.assignmentId}
                          </span>
                          <span className="capitalize font-mono text-slate-500">{sub.status}</span>
                        </div>
                        <p className="text-xs break-all">
                          Link:{' '}
                          <a
                            href={sub.submissionUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-violet-700 dark:text-violet-400 underline"
                          >
                            {sub.submissionUrl}
                          </a>
                        </p>
                        {sub.notes && <p className="text-xs text-slate-600 dark:text-slate-400">{sub.notes}</p>}

                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-2">
                          <input
                            type="number"
                            placeholder="Score"
                            value={draft.score}
                            onChange={(e) =>
                              setGradeInputs((p) => ({
                                ...p,
                                [sub.id]: { ...draft, score: e.target.value },
                              }))
                            }
                            className="md:col-span-2 px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          />
                          <select
                            value={draft.status}
                            onChange={(e) =>
                              setGradeInputs((p) => ({
                                ...p,
                                [sub.id]: {
                                  ...draft,
                                  status: e.target.value as SubmissionStatus,
                                },
                              }))
                            }
                            className="md:col-span-3 px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          >
                            <option value="graded">Graded</option>
                            <option value="needs_revision">Needs Revision</option>
                          </select>
                          <input
                            type="text"
                            placeholder="Written feedback for student"
                            value={draft.feedback}
                            onChange={(e) =>
                              setGradeInputs((p) => ({
                                ...p,
                                [sub.id]: { ...draft, feedback: e.target.value },
                              }))
                            }
                            className="md:col-span-5 px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          />
                          <button
                            type="button"
                            onClick={() => void handleGrade(sub)}
                            className="md:col-span-2 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-950 dark:bg-violet-600 text-white"
                          >
                            Save Review
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* STUDENT ROSTER */}
          {activeTab === 'roster' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <h2 className="font-display text-base font-semibold text-slate-950 dark:text-white">
                  Approved Students ({batchEnrollments.length})
                </h2>
                <span className="text-xs text-slate-500 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{activeBatch?.name}</span>
                </span>
              </div>
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {batchEnrollments.map((enr) => (
                  <div key={enr.id} className="px-5 py-3.5 flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium text-slate-950 dark:text-white">{enr.studentName}</p>
                      <p className="text-xs text-slate-500">{enr.studentEmail}</p>
                    </div>
                    <span className="text-xs font-semibold capitalize text-emerald-700 dark:text-emerald-400">
                      {enr.enrollmentStatus}
                    </span>
                  </div>
                ))}
                {batchEnrollments.length === 0 && (
                  <p className="p-8 text-center text-sm text-slate-500">
                    No approved students in this batch yet.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ANNOUNCEMENTS */}
          {activeTab === 'announcements' && activeBatch && (
            <div className="space-y-6">
              <form
                onSubmit={handlePostAnnouncement}
                className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4"
              >
                <h2 className="font-display text-base font-semibold text-slate-950 dark:text-white">
                  Post Batch Announcement
                </h2>
                <input
                  type="text"
                  required
                  placeholder="Announcement headline"
                  value={annForm.title}
                  onChange={(e) => setAnnForm((p) => ({ ...p, title: e.target.value }))}
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <textarea
                  required
                  rows={3}
                  placeholder="Message visible to all approved students in this cohort..."
                  value={annForm.body}
                  onChange={(e) => setAnnForm((p) => ({ ...p, body: e.target.value }))}
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold rounded-lg bg-slate-950 dark:bg-violet-600 text-white"
                >
                  Send Announcement
                </button>
              </form>

              <div className="space-y-3">
                {announcements.map((a) => (
                  <div
                    key={a.id}
                    className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                  >
                    <p className="text-xs text-slate-500">
                      {a.authorName} · {formatDateValue(a.createdAt)}
                    </p>
                    <h3 className="font-semibold text-sm text-slate-950 dark:text-white mt-1">
                      {a.title}
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">{a.body}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </DashboardShell>
  );
}
