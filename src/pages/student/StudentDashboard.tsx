import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Award,
  Bell,
  BookOpen,
  Calendar,
  CheckCircle2,
  ExternalLink,
  FileText,
  FolderOpen,
  LayoutDashboard,
  PlayCircle,
  Settings,
  TrendingUp,
  Video,
} from 'lucide-react';
import { StudentLiveClassCard } from '../../components/StudentLiveClassCard';
import { DashboardShell, type DashboardNavItem } from '../../components/DashboardShell';
import { useAuth } from '../../context/AuthContext';
import { useCatalog } from '../../context/CatalogContext';
import { safeHttpUrl } from '../../lib/sessions';
import {
  listBatchAnnouncements,
  listBatchAssignments,
  listBatchLessons,
  listBatchLiveSessions,
  listStudentCertificates,
  listStudentEnrollments,
  listStudentProgress,
  listStudentSubmissions,
  submitAssignmentWork,
  toggleLessonProgress,
  updateOwnProfile,
} from '../../lib/firestoreService';
import { parseFirestoreErrorMessage } from '../../lib/firebase';
import {
  formatDateTimeValue,
  formatDateValue,
  formatNpr,
  paymentMethodLabel,
} from '../../lib/validation';
import type {
  Announcement,
  Assignment,
  Certificate,
  Enrollment,
  Lesson,
  LessonProgress,
  LiveSession,
  Submission,
} from '../../types';

export function StudentDashboard() {
  const { profile, refreshProfile } = useAuth();
  const { settings } = useCatalog();
  const [activeTab, setActiveTab] = useState('overview');

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [lessonsByBatch, setLessonsByBatch] = useState<Record<string, Lesson[]>>({});
  const [sessionsByBatch, setSessionsByBatch] = useState<Record<string, LiveSession[]>>({});
  const [assignmentsByBatch, setAssignmentsByBatch] = useState<Record<string, Assignment[]>>({});
  const [announcementsByBatch, setAnnouncementsByBatch] = useState<Record<string, Announcement[]>>({});
  const [progressList, setProgressList] = useState<LessonProgress[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);

  // Lesson player state
  const [selectedBatchId, setSelectedBatchId] = useState<string>('');
  const [selectedLessonId, setSelectedLessonId] = useState<string>('');
  const [togglingLessonId, setTogglingLessonId] = useState<string | null>(null);

  // Assignment submission form state
  const [submittingAssignmentId, setSubmittingAssignmentId] = useState<string | null>(null);
  const [submissionUrls, setSubmissionUrls] = useState<Record<string, string>>({});
  const [submissionNotes, setSubmissionNotes] = useState<Record<string, string>>({});

  // Profile form state
  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [city, setCity] = useState(profile?.city || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [savingProfile, setSavingProfile] = useState(false);

  const loadStudentData = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const [enr, prog, subs, certs] = await Promise.all([
        listStudentEnrollments(profile.uid),
        listStudentProgress(profile.uid),
        listStudentSubmissions(profile.uid),
        listStudentCertificates(profile.uid),
      ]);
      setEnrollments(enr);
      setProgressList(prog);
      setSubmissions(subs);
      setCertificates(certs);

      // Fetch gated batch content ONLY for approved or completed enrollments
      const approved = enr.filter(
        (e) => e.enrollmentStatus === 'approved' || e.enrollmentStatus === 'completed'
      );

      const nextLessons: Record<string, Lesson[]> = {};
      const nextSessions: Record<string, LiveSession[]> = {};
      const nextAssignments: Record<string, Assignment[]> = {};
      const nextAnnouncements: Record<string, Announcement[]> = {};

      await Promise.all(
        approved.map(async (e) => {
          const [l, s, a, ann] = await Promise.all([
            listBatchLessons(e.batchId),
            listBatchLiveSessions(e.batchId),
            listBatchAssignments(e.batchId),
            listBatchAnnouncements(e.batchId),
          ]);
          nextLessons[e.batchId] = l;
          nextSessions[e.batchId] = s;
          nextAssignments[e.batchId] = a;
          nextAnnouncements[e.batchId] = ann;
        })
      );

      setLessonsByBatch(nextLessons);
      setSessionsByBatch(nextSessions);
      setAssignmentsByBatch(nextAssignments);
      setAnnouncementsByBatch(nextAnnouncements);

      if (approved.length > 0 && !selectedBatchId) {
        const firstBatchId = approved[0].batchId;
        setSelectedBatchId(firstBatchId);
        if (nextLessons[firstBatchId]?.length) {
          setSelectedLessonId(nextLessons[firstBatchId][0].id);
        }
      }
    } catch (err) {
      setErrorMsg(parseFirestoreErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [profile, selectedBatchId]);

  useEffect(() => {
    void loadStudentData();
  }, [loadStudentData]);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName || '');
      setPhone(profile.phone || '');
      setCity(profile.city || '');
      setBio(profile.bio || '');
    }
  }, [profile]);

  const approvedEnrollments = useMemo(
    () =>
      enrollments.filter(
        (e) => e.enrollmentStatus === 'approved' || e.enrollmentStatus === 'completed'
      ),
    [enrollments]
  );

  const completedLessonIds = useMemo(
    () => new Set(progressList.filter((p) => p.completed).map((p) => p.lessonId)),
    [progressList]
  );

  const allLessons = useMemo(
    () => Object.values(lessonsByBatch).flat(),
    [lessonsByBatch]
  );

  const allSessions = useMemo(
    () =>
      Object.entries(sessionsByBatch)
        .flatMap(([batchId, list]) =>
          list.map((session) => ({
            ...session,
            courseTitle:
              enrollments.find((e) => e.batchId === batchId)?.courseTitle || 'Enrolled Course',
            batchName: enrollments.find((e) => e.batchId === batchId)?.batchName || '',
          }))
        )
        .sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart)),
    [sessionsByBatch, enrollments]
  );

  const allAssignments = useMemo(
    () =>
      Object.entries(assignmentsByBatch).flatMap(([batchId, list]) =>
        list.map((asgn) => ({
          ...asgn,
          courseTitle:
            enrollments.find((e) => e.batchId === batchId)?.courseTitle || 'Enrolled Course',
        }))
      ),
    [assignmentsByBatch, enrollments]
  );

  const allAnnouncements = useMemo(
    () =>
      Object.entries(announcementsByBatch).flatMap(([batchId, list]) =>
        list.map((ann) => ({
          ...ann,
          courseTitle:
            enrollments.find((e) => e.batchId === batchId)?.courseTitle || 'Enrolled Course',
        }))
      ),
    [announcementsByBatch, enrollments]
  );

  const totalCompletionPercent = useMemo(() => {
    if (allLessons.length === 0) return 0;
    const done = allLessons.filter((l) => completedLessonIds.has(l.id)).length;
    return Math.round((done / allLessons.length) * 100);
  }, [allLessons, completedLessonIds]);

  const activeBatchLessons = lessonsByBatch[selectedBatchId] || [];
  const activeLesson =
    activeBatchLessons.find((l) => l.id === selectedLessonId) || activeBatchLessons[0] || null;

  const handleToggleLesson = async (lesson: Lesson) => {
    if (!profile) return;
    setTogglingLessonId(lesson.id);
    setErrorMsg(null);
    const nextCompleted = !completedLessonIds.has(lesson.id);
    try {
      await toggleLessonProgress({
        studentId: profile.uid,
        courseId: lesson.courseId,
        batchId: lesson.batchId,
        lessonId: lesson.id,
        completed: nextCompleted,
      });
      setProgressList((prev) => {
        const id = `${profile.uid}_${lesson.id}`;
        const exists = prev.some((p) => p.lessonId === lesson.id);
        if (exists) {
          return prev.map((p) =>
            p.lessonId === lesson.id ? { ...p, completed: nextCompleted } : p
          );
        }
        return [
          ...prev,
          {
            id,
            studentId: profile.uid,
            courseId: lesson.courseId,
            batchId: lesson.batchId,
            lessonId: lesson.id,
            completed: nextCompleted,
          },
        ];
      });
    } catch (err) {
      setErrorMsg(parseFirestoreErrorMessage(err));
    } finally {
      setTogglingLessonId(null);
    }
  };

  const handleAssignmentSubmit = async (asgn: Assignment, e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    const url = (submissionUrls[asgn.id] || '').trim();
    if (url.length < 5) {
      setErrorMsg('Please enter a valid project link (Google Drive, GitHub, Figma, or Loom URL).');
      return;
    }
    setSubmittingAssignmentId(asgn.id);
    setErrorMsg(null);
    try {
      await submitAssignmentWork({
        assignment: asgn,
        student: profile,
        submissionUrl: url,
        notes: submissionNotes[asgn.id] || '',
      });
      setStatusNotice(`Submitted work for "${asgn.title}".`);
      await loadStudentData();
    } catch (err) {
      setErrorMsg(parseFirestoreErrorMessage(err));
    } finally {
      setSubmittingAssignmentId(null);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSavingProfile(true);
    setErrorMsg(null);
    setStatusNotice(null);
    try {
      await updateOwnProfile(profile.uid, { displayName, phone, city, bio });
      await refreshProfile();
      setStatusNotice('Profile settings saved.');
    } catch (err) {
      setErrorMsg(parseFirestoreErrorMessage(err));
    } finally {
      setSavingProfile(false);
    }
  };

  const navItems: DashboardNavItem[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'courses', label: 'My Courses', icon: BookOpen, count: enrollments.length },
    { id: 'live', label: 'Live Classes', icon: Video, count: allSessions.length },
    { id: 'calendar', label: 'Learning Calendar', icon: Calendar },
    { id: 'player', label: 'Lesson Player', icon: PlayCircle, count: allLessons.length },
    { id: 'assignments', label: 'Assignments', icon: FileText, count: allAssignments.length },
    { id: 'resources', label: 'Resources', icon: FolderOpen },
    { id: 'progress', label: 'Progress Tracking', icon: TrendingUp },
    { id: 'certificates', label: 'Certificates', icon: Award, count: certificates.length },
    { id: 'notifications', label: 'Notifications', icon: Bell, count: allAnnouncements.length },
    { id: 'profile', label: 'Profile & Settings', icon: Settings },
  ];

  return (
    <DashboardShell
      portalTitle="Student LMS"
      roleLabel="Student Account"
      navItems={navItems}
      activeTab={activeTab}
      onSelectTab={(id) => {
        setActiveTab(id);
        setStatusNotice(null);
      }}
      headerAction={
        <Link
          to="/courses"
          className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-950 dark:bg-brand-600 text-white hover:opacity-90 whitespace-nowrap"
        >
          Browse Catalog
        </Link>
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

      {statusNotice && (
        <div className="mb-6 p-4 rounded-lg border border-emerald-300 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 text-sm text-emerald-800 dark:text-emerald-300">
          {statusNotice}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-28 rounded-xl bg-slate-200/60 dark:bg-slate-900 animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Approved Courses</p>
                  <p className="mt-2 font-mono tabular-nums text-2xl font-bold text-slate-950 dark:text-white">
                    {approvedEnrollments.length}
                  </p>
                </div>
                <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Pending Verification</p>
                  <p className="mt-2 font-mono tabular-nums text-2xl font-bold text-slate-950 dark:text-white">
                    {enrollments.filter((e) => e.enrollmentStatus === 'pending').length}
                  </p>
                </div>
                <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Overall Completion</p>
                  <p className="mt-2 font-mono tabular-nums text-2xl font-bold text-slate-950 dark:text-white">
                    {totalCompletionPercent}%
                  </p>
                </div>
                <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Certificates Issued</p>
                  <p className="mt-2 font-mono tabular-nums text-2xl font-bold text-slate-950 dark:text-white">
                    {certificates.filter((c) => c.status === 'issued').length}
                  </p>
                </div>
              </div>

              {enrollments.length === 0 ? (
                <div className="p-10 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-3">
                  <h2 className="font-display text-lg font-semibold text-slate-950 dark:text-white">
                    No enrolled courses yet
                  </h2>
                  <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
                    Browse upcoming Nepal Time cohorts and submit your NPR payment reference to
                    apply for enrollment.
                  </p>
                  <Link
                    to="/courses"
                    className="inline-block mt-2 px-5 py-2.5 text-sm font-semibold rounded-lg bg-slate-950 dark:bg-brand-600 text-white"
                  >
                    Explore Course Catalog
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  <div className="lg:col-span-7 p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
                    <div className="flex items-center justify-between">
                      <h2 className="font-display text-base font-semibold text-slate-950 dark:text-white">
                        My Enrollments
                      </h2>
                      <button
                        type="button"
                        onClick={() => setActiveTab('courses')}
                        className="text-xs font-medium text-brand-700 dark:text-brand-400 hover:underline"
                      >
                        View all
                      </button>
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {enrollments.map((enr) => (
                        <div key={enr.id} className="py-3.5 flex items-center justify-between gap-4">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-950 dark:text-white truncate">
                              {enr.courseTitle}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                              {enr.batchName} · Ref: <span className="font-mono">{enr.paymentReference}</span>
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p
                              className={`text-xs font-semibold capitalize ${
                                enr.enrollmentStatus === 'approved' || enr.enrollmentStatus === 'completed'
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : enr.enrollmentStatus === 'rejected'
                                  ? 'text-red-700 dark:text-red-400'
                                  : 'text-amber-700 dark:text-amber-400'
                              }`}
                            >
                              {enr.enrollmentStatus}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              Payment: {enr.paymentStatus.replace('_', ' ')}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="lg:col-span-5 p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
                    <h2 className="font-display text-base font-semibold text-slate-950 dark:text-white">
                      Next Live Sessions
                    </h2>
                    {allSessions.length === 0 ? (
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Live meeting links appear here once your enrollment is approved and your
                        instructor schedules sessions.
                      </p>
                    ) : (
                      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                        {allSessions.slice(0, 4).map((s) => (
                          <li key={s.id} className="py-3 space-y-1">
                            <p className="text-sm font-medium text-slate-950 dark:text-white">
                              {s.title}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                              {formatDateTimeValue(s.scheduledStart)} · {s.durationMinutes} min
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* MY COURSES */}
          {activeTab === 'courses' && (
            <div className="space-y-4">
              {enrollments.length === 0 ? (
                <div className="p-10 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center text-sm text-slate-600 dark:text-slate-400">
                  You have not applied to any cohorts yet.
                </div>
              ) : (
                enrollments.map((enr) => {
                  const isApproved =
                    enr.enrollmentStatus === 'approved' || enr.enrollmentStatus === 'completed';
                  const batchLessons = lessonsByBatch[enr.batchId] || [];
                  const doneCount = batchLessons.filter((l) => completedLessonIds.has(l.id)).length;
                  const pct =
                    batchLessons.length > 0
                      ? Math.round((doneCount / batchLessons.length) * 100)
                      : 0;

                  return (
                    <div
                      key={enr.id}
                      className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-6"
                    >
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span
                            className={`font-semibold capitalize ${
                              isApproved
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : enr.enrollmentStatus === 'rejected'
                                ? 'text-red-700 dark:text-red-400'
                                : 'text-amber-700 dark:text-amber-400'
                            }`}
                          >
                            Enrollment: {enr.enrollmentStatus}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>Payment: {enr.paymentStatus.replace('_', ' ')}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">{formatNpr(enr.amountNpr)}</span>
                        </div>
                        <h2 className="font-display text-lg font-semibold text-slate-950 dark:text-white">
                          {enr.courseTitle}
                        </h2>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          {enr.batchName} · {paymentMethodLabel(enr.paymentMethod)} · Ref:{' '}
                          <span className="font-mono">{enr.paymentReference}</span>
                        </p>
                        {enr.reviewNote && (
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Admin Note: {enr.reviewNote}
                          </p>
                        )}
                      </div>

                      <div className="shrink-0 flex flex-col items-start md:items-end gap-2">
                        {isApproved ? (
                          <>
                            <span className="font-mono tabular-nums text-xs text-slate-600 dark:text-slate-300">
                              {doneCount}/{batchLessons.length} lessons completed ({pct}%)
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedBatchId(enr.batchId);
                                if (batchLessons.length > 0) {
                                  setSelectedLessonId(batchLessons[0].id);
                                }
                                setActiveTab('player');
                              }}
                              className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-950 dark:bg-brand-600 text-white hover:opacity-90"
                            >
                              Open Lesson Player
                            </button>
                          </>
                        ) : (
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            Materials locked until Admin approval
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* LIVE CLASSES */}
          {activeTab === 'live' && (
            <div className="space-y-4">
              {allSessions.length === 0 ? (
                <div className="p-10 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center text-sm text-slate-600 dark:text-slate-400">
                  No scheduled live classes yet. Class links appear here, shortly before each class, once your
                  enrollment is approved.
                </div>
              ) : (
                allSessions.map((session) => (
                  <StudentLiveClassCard
                    key={session.id}
                    session={session}
                    studentId={profile?.uid ?? ''}
                    joinWindowMinutes={settings.joinWindowMinutes ?? 15}
                  />
                ))
              )}
            </div>
          )}

          {/* LEARNING CALENDAR */}
          {activeTab === 'calendar' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="p-5 border-b border-slate-200 dark:border-slate-800">
                <h2 className="font-display text-base font-semibold text-slate-950 dark:text-white">
                  Upcoming Sessions &amp; Assignment Deadlines
                </h2>
              </div>
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {[
                  ...allSessions.map((s) => ({
                    id: `sess_${s.id}`,
                    date: s.scheduledStart,
                    kind: 'Live Session',
                    title: s.title,
                    course: s.courseTitle,
                  })),
                  ...allAssignments.map((a) => ({
                    id: `asgn_${a.id}`,
                    date: a.dueDate,
                    kind: 'Assignment Due',
                    title: a.title,
                    course: a.courseTitle,
                  })),
                ]
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map((ev) => (
                    <div
                      key={ev.id}
                      className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm"
                    >
                      <div>
                        <p className="font-medium text-slate-950 dark:text-white">{ev.title}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {ev.kind} · {ev.course}
                        </p>
                      </div>
                      <span className="font-mono tabular-nums text-xs text-slate-700 dark:text-slate-300">
                        {formatDateTimeValue(ev.date)}
                      </span>
                    </div>
                  ))}
                {allSessions.length === 0 && allAssignments.length === 0 && (
                  <p className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                    No scheduled calendar items yet.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* LESSON PLAYER */}
          {activeTab === 'player' && (
            <div className="space-y-6">
              {approvedEnrollments.length === 0 ? (
                <div className="p-10 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center text-sm text-slate-600 dark:text-slate-400">
                  Lesson playback unlocks once at least one enrollment is approved by an Academy
                  Admin.
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    <label
                      htmlFor="player-batch"
                      className="text-xs font-semibold text-slate-600 dark:text-slate-400"
                    >
                      Active Cohort:
                    </label>
                    <select
                      id="player-batch"
                      value={selectedBatchId}
                      onChange={(e) => {
                        const bId = e.target.value;
                        setSelectedBatchId(bId);
                        const list = lessonsByBatch[bId] || [];
                        setSelectedLessonId(list[0]?.id || '');
                      }}
                      className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    >
                      {approvedEnrollments.map((enr) => (
                        <option key={enr.batchId} value={enr.batchId}>
                          {enr.courseTitle} — {enr.batchName}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                      <div className="p-4 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Lessons ({activeBatchLessons.length})
                      </div>
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {activeBatchLessons.map((lesson) => {
                          const done = completedLessonIds.has(lesson.id);
                          const isSelected = activeLesson?.id === lesson.id;
                          return (
                            <button
                              key={lesson.id}
                              type="button"
                              onClick={() => setSelectedLessonId(lesson.id)}
                              className={`w-full px-4 py-3.5 text-left flex items-start justify-between gap-3 transition-colors ${
                                isSelected
                                  ? 'bg-brand-50 dark:bg-brand-950/40'
                                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                              }`}
                            >
                              <div className="min-w-0">
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  {lesson.moduleTitle}
                                </p>
                                <p className="text-sm font-medium text-slate-950 dark:text-white mt-0.5">
                                  {lesson.title}
                                </p>
                                <p className="text-xs font-mono tabular-nums text-slate-500 mt-0.5">
                                  {lesson.durationMinutes} min
                                </p>
                              </div>
                              <CheckCircle2
                                className={`w-4 h-4 shrink-0 mt-1 ${
                                  done
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-slate-300 dark:text-slate-700'
                                }`}
                              />
                            </button>
                          );
                        })}
                        {activeBatchLessons.length === 0 && (
                          <p className="p-5 text-xs text-slate-500">
                            No lessons published for this batch yet.
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
                      {activeLesson ? (
                        <>
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                            <div>
                              <p className="text-xs font-medium text-brand-700 dark:text-brand-400">
                                {activeLesson.moduleTitle} · {activeLesson.durationMinutes} min
                              </p>
                              <h2 className="mt-1 font-display text-xl font-semibold text-slate-950 dark:text-white">
                                {activeLesson.title}
                              </h2>
                            </div>
                            <button
                              type="button"
                              disabled={togglingLessonId === activeLesson.id}
                              onClick={() => void handleToggleLesson(activeLesson)}
                              className={`px-4 py-2 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 transition-colors ${
                                completedLessonIds.has(activeLesson.id)
                                  ? 'bg-emerald-700 text-white hover:bg-emerald-600'
                                  : 'bg-slate-950 dark:bg-brand-600 text-white hover:opacity-90'
                              }`}
                            >
                              {completedLessonIds.has(activeLesson.id)
                                ? 'Completed (Click to Undo)'
                                : 'Mark Lesson Complete'}
                            </button>
                          </div>

                          <div className="p-6 rounded-lg bg-slate-950 text-slate-200 space-y-3">
                            <p className="text-xs font-mono text-slate-400">
                              Recorded Session Material
                            </p>
                            {activeLesson.videoUrl ? (
                              <a
                                href={safeHttpUrl(activeLesson.videoUrl) ?? '#'}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg bg-brand-600 text-white hover:bg-brand-500 transition-colors"
                              >
                                <PlayCircle className="w-4 h-4" />
                                <span>Open Recorded Lesson Video</span>
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            ) : (
                              <p className="text-sm text-slate-400">
                                Video recording link will appear here once uploaded by your
                                instructor.
                              </p>
                            )}
                          </div>

                          <div className="space-y-2">
                            <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                              Lesson Notes
                            </h3>
                            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                              {activeLesson.contentSummary}
                            </p>
                          </div>

                          {activeLesson.resourceUrl && (
                            <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                              <a
                                href={safeHttpUrl(activeLesson.resourceUrl) ?? '#'}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 dark:text-brand-400 hover:underline"
                              >
                                <FolderOpen className="w-4 h-4" />
                                <span>Open Attached Study Resource</span>
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="text-sm text-slate-500">Select a lesson to view materials.</p>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ASSIGNMENTS */}
          {activeTab === 'assignments' && (
            <div className="space-y-5">
              {allAssignments.length === 0 ? (
                <div className="p-10 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center text-sm text-slate-600 dark:text-slate-400">
                  No assignments published for your approved batches yet.
                </div>
              ) : (
                allAssignments.map((asgn) => {
                  const sub = submissions.find((s) => s.assignmentId === asgn.id);
                  return (
                    <div
                      key={asgn.id}
                      className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-medium text-brand-700 dark:text-brand-400">
                            {asgn.courseTitle} · Max Score:{' '}
                            <span className="font-mono tabular-nums">{asgn.maxScore}</span>
                          </p>
                          <h3 className="mt-1 font-display text-lg font-semibold text-slate-950 dark:text-white">
                            {asgn.title}
                          </h3>
                        </div>
                        <span className="font-mono tabular-nums text-xs text-slate-500 dark:text-slate-400">
                          Due: {formatDateValue(asgn.dueDate)}
                        </span>
                      </div>

                      <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                        {asgn.instructions}
                      </p>

                      {sub && (
                        <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs space-y-1.5">
                          <p className="font-semibold text-slate-900 dark:text-slate-100 capitalize">
                            Status: {sub.status.replace('_', ' ')}
                            {typeof sub.score === 'number'
                              ? ` · Score: ${sub.score} / ${asgn.maxScore}`
                              : ''}
                          </p>
                          <p className="text-slate-600 dark:text-slate-400 break-all">
                            Submitted URL:{' '}
                            <a
                              href={sub.submissionUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-brand-700 dark:text-brand-400 underline"
                            >
                              {sub.submissionUrl}
                            </a>
                          </p>
                          {sub.feedback && (
                            <p className="text-slate-700 dark:text-slate-300">
                              Instructor Feedback: {sub.feedback}
                            </p>
                          )}
                        </div>
                      )}

                      {sub?.status !== 'graded' && (
                        <form
                          onSubmit={(e) => void handleAssignmentSubmit(asgn, e)}
                          className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-2"
                        >
                          <input
                            type="url"
                            required
                            placeholder="https://github.com/... or Google Drive link"
                            value={submissionUrls[asgn.id] ?? sub?.submissionUrl ?? ''}
                            onChange={(e) =>
                              setSubmissionUrls((prev) => ({ ...prev, [asgn.id]: e.target.value }))
                            }
                            className="md:col-span-5 px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          />
                          <input
                            type="text"
                            placeholder="Optional submission notes"
                            value={submissionNotes[asgn.id] ?? sub?.notes ?? ''}
                            onChange={(e) =>
                              setSubmissionNotes((prev) => ({ ...prev, [asgn.id]: e.target.value }))
                            }
                            className="md:col-span-4 px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          />
                          <button
                            type="submit"
                            disabled={submittingAssignmentId === asgn.id}
                            className="md:col-span-3 px-4 py-2 text-xs font-semibold rounded-lg bg-slate-950 dark:bg-brand-600 text-white hover:opacity-90 disabled:opacity-50"
                          >
                            {submittingAssignmentId === asgn.id
                              ? 'Submitting...'
                              : sub
                              ? 'Update Submission'
                              : 'Submit Work'}
                          </button>
                        </form>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* RESOURCES */}
          {activeTab === 'resources' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-200 dark:divide-slate-800">
              {allLessons.filter((l) => l.resourceUrl).length === 0 ? (
                <p className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  No attached study resource links across your approved courses yet.
                </p>
              ) : (
                allLessons
                  .filter((l) => l.resourceUrl)
                  .map((lesson) => (
                    <div
                      key={lesson.id}
                      className="p-5 flex items-center justify-between gap-4 text-sm"
                    >
                      <div>
                        <p className="font-semibold text-slate-950 dark:text-white">
                          {lesson.title}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {lesson.moduleTitle}
                        </p>
                      </div>
                      <a
                        href={safeHttpUrl(lesson.resourceUrl) ?? '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 dark:text-brand-400 hover:underline whitespace-nowrap"
                      >
                        <span>Open Resource</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  ))
              )}
            </div>
          )}

          {/* PROGRESS TRACKING */}
          {activeTab === 'progress' && (
            <div className="space-y-4">
              {approvedEnrollments.length === 0 ? (
                <div className="p-10 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center text-sm text-slate-500">
                  Progress metrics appear once you have an approved cohort enrollment.
                </div>
              ) : (
                approvedEnrollments.map((enr) => {
                  const lessons = lessonsByBatch[enr.batchId] || [];
                  const done = lessons.filter((l) => completedLessonIds.has(l.id)).length;
                  const pct = lessons.length > 0 ? Math.round((done / lessons.length) * 100) : 0;
                  return (
                    <div
                      key={enr.id}
                      className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <h3 className="font-display text-base font-semibold text-slate-950 dark:text-white">
                            {enr.courseTitle}
                          </h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {enr.batchName}
                          </p>
                        </div>
                        <span className="font-mono tabular-nums text-sm font-semibold text-slate-950 dark:text-white">
                          {pct}% ({done}/{lessons.length})
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-brand-600 transition-all duration-300"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* CERTIFICATES */}
          {activeTab === 'certificates' && (
            <div className="space-y-5">
              {certificates.length === 0 ? (
                <div className="p-10 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center text-sm text-slate-600 dark:text-slate-400">
                  No completion certificates issued yet. Certificates are issued by Birta Academy
                  administrators upon cohort completion.
                </div>
              ) : (
                certificates.map((cert) => (
                  <div
                    key={cert.id}
                    className="p-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 space-y-4"
                  >
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-display font-semibold text-slate-950 dark:text-white">
                        Birta Academy · Certificate of Completion
                      </span>
                      <span className="font-mono uppercase">{cert.status}</span>
                    </div>
                    <div className="py-4 border-y border-slate-200 dark:border-slate-800 space-y-2">
                      <p className="text-xs text-slate-500">Awarded to</p>
                      <h3 className="font-display text-2xl font-bold text-slate-950 dark:text-white">
                        {cert.studentName}
                      </h3>
                      <p className="text-sm text-slate-600 dark:text-slate-300">
                        For successfully completing <strong>{cert.courseTitle}</strong> (
                        {cert.batchName}).
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400 font-mono">
                      <span>Verification Code: {cert.certificateCode}</span>
                      <span>Issued: {formatDateValue(cert.issuedAt)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* NOTIFICATIONS */}
          {activeTab === 'notifications' && (
            <div className="space-y-4">
              {allAnnouncements.length === 0 ? (
                <div className="p-10 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center text-sm text-slate-500">
                  No cohort announcements posted yet.
                </div>
              ) : (
                allAnnouncements.map((ann) => (
                  <article
                    key={ann.id}
                    className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
                      <span>
                        {ann.courseTitle} · {ann.authorName}
                      </span>
                      <span className="font-mono">{formatDateValue(ann.createdAt)}</span>
                    </div>
                    <h3 className="font-display text-base font-semibold text-slate-950 dark:text-white">
                      {ann.title}
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                      {ann.body}
                    </p>
                  </article>
                ))
              )}
            </div>
          )}

          {/* PROFILE & SETTINGS */}
          {activeTab === 'profile' && (
            <form
              onSubmit={handleSaveProfile}
              className="max-w-xl p-6 sm:p-7 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4"
            >
              <h2 className="font-display text-lg font-semibold text-slate-950 dark:text-white">
                Learner Profile
              </h2>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Email (Read-Only)
                </label>
                <input
                  type="email"
                  disabled
                  value={profile?.email || ''}
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 text-slate-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Display Name
                </label>
                <input
                  type="text"
                  required
                  maxLength={100}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Phone / WhatsApp
                  </label>
                  <input
                    type="tel"
                    maxLength={30}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+977 98XXXXXXXX"
                    className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    City
                  </label>
                  <input
                    type="text"
                    maxLength={80}
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Kathmandu"
                    className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Learning Goals / Bio
                </label>
                <textarea
                  rows={3}
                  maxLength={500}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <button
                type="submit"
                disabled={savingProfile}
                className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-slate-950 dark:bg-brand-600 text-white hover:opacity-90 disabled:opacity-50"
              >
                {savingProfile ? 'Saving...' : 'Save Changes'}
              </button>
            </form>
          )}
        </>
      )}
    </DashboardShell>
  );
}
