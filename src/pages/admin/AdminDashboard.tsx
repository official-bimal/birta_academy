import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Award,
  BookOpen,
  Calendar,
  CreditCard,
  Database,
  FolderKanban,
  LayoutDashboard,
  MessageSquare,
  Settings,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react';
import { DashboardShell, type DashboardNavItem } from '../../components/DashboardShell';
import { useAuth } from '../../context/AuthContext';
import { useCatalog } from '../../context/CatalogContext';
import {
  adminIssueCertificate,
  adminReviewEnrollment,
  adminToggleCertificateStatus,
  adminUpdateInquiryStatus,
  adminUpdateUserRole,
  deleteBatch,
  deleteCategory,
  deleteCourse,
  fetchAcademySettings,
  fetchAdminCatalog,
  listAllCertificates,
  listAllEnrollments,
  listAllInquiries,
  listAllUsers,
  listAuditLogs,
  saveAcademySettings,
  saveBatch,
  saveCategory,
  saveCourse,
  saveInstructorProfile,
  seedSampleCatalog,
} from '../../lib/firestoreService';
import { parseFirestoreErrorMessage } from '../../lib/firebase';
import {
  formatDateTimeValue,
  formatDateValue,
  formatNpr,
  paymentMethodLabel,
  sanitizeStringList,
} from '../../lib/validation';
import { MEDIA_ASSETS } from '../../data/demoCatalog';
import type {
  AcademySettings,
  AuditLog,
  Batch,
  BatchStatus,
  Category,
  Certificate,
  Course,
  CourseLevel,
  Enrollment,
  Inquiry,
  InstructorProfile,
  UserProfile,
  UserRole,
} from '../../types';

export function AdminDashboard() {
  const { profile } = useAuth();
  const { refreshCatalog } = useCatalog();

  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [instructors, setInstructors] = useState<InstructorProfile[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [settingsForm, setSettingsForm] = useState<Omit<AcademySettings, 'updatedAt'>>({
    academyName: 'Birta Academy',
    supportEmail: 'info@birtaacademy.com',
    supportPhone: '',
    location: 'Kathmandu, Nepal',
    bankName: '',
    bankAccountName: '',
    bankAccountNumber: '',
    esewaInstructions: '',
    khaltiInstructions: '',
  });

  // Review notes per enrollment
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  // Course form
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [courseForm, setCourseForm] = useState({
    title: '',
    subtitle: '',
    categoryId: '',
    instructorId: '',
    level: 'Beginner' as CourseLevel,
    durationWeeks: 8,
    priceNpr: 18000,
    thumbnailUrl: MEDIA_ASSETS.engineeringAi as string,
    description: '',
    outcomesText: 'Build practical portfolio projects\nReceive weekly live instructor critiques',
    syllabusText: 'Week 1–2: Core Foundations\nWeek 3–4: Applied Workshop\nWeek 5–8: Capstone Project',
    published: true,
    featured: false,
    isDemo: false,
  });

  // Category form
  const [catForm, setCatForm] = useState({
    name: '',
    description: '',
    sortOrder: 1,
    active: true,
  });

  // Batch form
  const [batchForm, setBatchForm] = useState({
    courseId: '',
    instructorId: '',
    name: '',
    startDate: '2026-12-15',
    endDate: '2027-02-15',
    scheduleText: 'Sun, Tue, Thu · 7:30 PM – 9:00 PM',
    timezone: 'NPT (UTC+5:45)',
    seatLimit: 25,
    priceNpr: 18000,
    status: 'upcoming' as BatchStatus,
    isDemo: false,
  });

  // Instructor form
  const [instForm, setInstForm] = useState({
    displayName: '',
    specialty: '',
    bio: '',
    credentialsNote: '',
    userId: '',
    active: true,
    isDemo: false,
  });

  const loadAdminData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [catData, enr, usr, certs, inq, logs, cfg] = await Promise.all([
        fetchAdminCatalog(),
        listAllEnrollments(),
        listAllUsers(),
        listAllCertificates(),
        listAllInquiries(),
        listAuditLogs(),
        fetchAcademySettings(),
      ]);
      setCategories(catData.categories);
      setCourses(catData.courses);
      setBatches(catData.batches);
      setInstructors(catData.instructors);
      setEnrollments(enr);
      setUsers(usr);
      setCertificates(certs);
      setInquiries(inq);
      setAuditLogs(logs);
      setSettingsForm({
        academyName: cfg.academyName,
        supportEmail: cfg.supportEmail,
        supportPhone: cfg.supportPhone || '',
        location: cfg.location || '',
        bankName: cfg.bankName,
        bankAccountName: cfg.bankAccountName,
        bankAccountNumber: cfg.bankAccountNumber,
        esewaInstructions: cfg.esewaInstructions || '',
        khaltiInstructions: cfg.khaltiInstructions || '',
      });

      if (catData.categories.length > 0 && !courseForm.categoryId) {
        setCourseForm((p) => ({ ...p, categoryId: catData.categories[0].id }));
      }
      if (catData.instructors.length > 0 && !courseForm.instructorId) {
        setCourseForm((p) => ({ ...p, instructorId: catData.instructors[0].id }));
      }
      if (catData.courses.length > 0 && !batchForm.courseId) {
        const firstCourse = catData.courses[0];
        setBatchForm((p) => ({
          ...p,
          courseId: firstCourse.id,
          instructorId: firstCourse.instructorId,
          priceNpr: firstCourse.priceNpr,
        }));
      }
    } catch (err) {
      setErrorMsg(parseFirestoreErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [courseForm.categoryId, courseForm.instructorId, batchForm.courseId]);

  useEffect(() => {
    void loadAdminData();
  }, [loadAdminData]);

  const verifiedRevenueNpr = useMemo(
    () =>
      enrollments
        .filter((e) => e.paymentStatus === 'verified')
        .reduce((acc, e) => acc + e.amountNpr, 0),
    [enrollments]
  );

  const pendingRevenueNpr = useMemo(
    () =>
      enrollments
        .filter((e) => e.paymentStatus === 'pending_verification')
        .reduce((acc, e) => acc + e.amountNpr, 0),
    [enrollments]
  );

  const pendingEnrollmentsCount = useMemo(
    () => enrollments.filter((e) => e.enrollmentStatus === 'pending').length,
    [enrollments]
  );

  const handleSeedDemo = async () => {
    if (!profile) return;
    setBusyAction('seed');
    setErrorMsg(null);
    setNotice(null);
    try {
      await seedSampleCatalog(profile);
      await Promise.all([loadAdminData(), refreshCatalog()]);
      setNotice(
        'Sample Birta Academy categories, courses, batches, lessons, and live sessions seeded into Firestore (marked isDemo: true).'
      );
    } catch (err) {
      setErrorMsg(parseFirestoreErrorMessage(err));
    } finally {
      setBusyAction(null);
    }
  };

  const handleSaveCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    const cat = categories.find((c) => c.id === courseForm.categoryId);
    const inst = instructors.find((i) => i.id === courseForm.instructorId);
    if (!cat || !inst) {
      setErrorMsg('Please create or select both a Category and an Instructor first.');
      return;
    }
    setBusyAction('course');
    setErrorMsg(null);
    setNotice(null);
    try {
      await saveCourse(
        {
          id: editingCourseId || undefined,
          title: courseForm.title,
          subtitle: courseForm.subtitle,
          categoryId: cat.id,
          categoryName: cat.name,
          instructorId: inst.id,
          instructorName: inst.displayName,
          level: courseForm.level,
          durationWeeks: courseForm.durationWeeks,
          priceNpr: courseForm.priceNpr,
          thumbnailUrl: courseForm.thumbnailUrl,
          description: courseForm.description,
          outcomes: sanitizeStringList(courseForm.outcomesText, 10),
          syllabus: sanitizeStringList(courseForm.syllabusText, 15),
          published: courseForm.published,
          featured: courseForm.featured,
          isDemo: courseForm.isDemo,
        },
        profile
      );
      setEditingCourseId(null);
      setCourseForm((p) => ({ ...p, title: '', subtitle: '', description: '' }));
      await Promise.all([loadAdminData(), refreshCatalog()]);
      setNotice('Course saved and recorded in audit log.');
    } catch (err) {
      setErrorMsg(parseFirestoreErrorMessage(err));
    } finally {
      setBusyAction(null);
    }
  };

  const handleEditCourse = (c: Course) => {
    setEditingCourseId(c.id);
    setCourseForm({
      title: c.title,
      subtitle: c.subtitle,
      categoryId: c.categoryId,
      instructorId: c.instructorId,
      level: c.level,
      durationWeeks: c.durationWeeks,
      priceNpr: c.priceNpr,
      thumbnailUrl: c.thumbnailUrl || MEDIA_ASSETS.engineeringAi,
      description: c.description,
      outcomesText: c.outcomes.join('\n'),
      syllabusText: c.syllabus.join('\n'),
      published: c.published,
      featured: c.featured,
      isDemo: c.isDemo,
    });
    setActiveTab('courses');
  };

  const handleDeleteCourse = async (c: Course) => {
    if (!profile) return;
    setErrorMsg(null);
    try {
      await deleteCourse(c.id, c.title, profile);
      await Promise.all([loadAdminData(), refreshCatalog()]);
      setNotice(`Deleted course "${c.title}".`);
    } catch (err) {
      setErrorMsg(parseFirestoreErrorMessage(err));
    }
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setBusyAction('cat');
    setErrorMsg(null);
    try {
      await saveCategory(catForm, profile);
      setCatForm({ name: '', description: '', sortOrder: categories.length + 1, active: true });
      await Promise.all([loadAdminData(), refreshCatalog()]);
      setNotice('Category saved.');
    } catch (err) {
      setErrorMsg(parseFirestoreErrorMessage(err));
    } finally {
      setBusyAction(null);
    }
  };

  const handleSaveBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    const course = courses.find((c) => c.id === batchForm.courseId);
    const inst = instructors.find((i) => i.id === (batchForm.instructorId || course?.instructorId));
    if (!course) {
      setErrorMsg('Please select an existing course before scheduling a batch.');
      return;
    }
    setBusyAction('batch');
    setErrorMsg(null);
    try {
      await saveBatch(
        {
          courseId: course.id,
          courseTitle: course.title,
          courseSlug: course.slug,
          instructorId: inst?.id || course.instructorId,
          instructorName: inst?.displayName || course.instructorName,
          name: batchForm.name,
          startDate: batchForm.startDate,
          endDate: batchForm.endDate,
          scheduleText: batchForm.scheduleText,
          timezone: batchForm.timezone,
          seatLimit: batchForm.seatLimit,
          priceNpr: batchForm.priceNpr,
          status: batchForm.status,
          isDemo: batchForm.isDemo,
        },
        profile
      );
      setBatchForm((p) => ({ ...p, name: '' }));
      await Promise.all([loadAdminData(), refreshCatalog()]);
      setNotice('Live batch scheduled and logged.');
    } catch (err) {
      setErrorMsg(parseFirestoreErrorMessage(err));
    } finally {
      setBusyAction(null);
    }
  };

  const handleSaveInstructor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setBusyAction('inst');
    setErrorMsg(null);
    try {
      await saveInstructorProfile(instForm, profile);
      setInstForm({
        displayName: '',
        specialty: '',
        bio: '',
        credentialsNote: '',
        userId: '',
        active: true,
        isDemo: false,
      });
      await Promise.all([loadAdminData(), refreshCatalog()]);
      setNotice('Instructor profile saved.');
    } catch (err) {
      setErrorMsg(parseFirestoreErrorMessage(err));
    } finally {
      setBusyAction(null);
    }
  };

  const handleReviewEnrollment = async (
    enr: Enrollment,
    decision: 'approve' | 'reject' | 'complete'
  ) => {
    if (!profile) return;
    setBusyAction(enr.id);
    setErrorMsg(null);
    try {
      await adminReviewEnrollment({
        enrollment: enr,
        paymentStatus: decision === 'reject' ? 'rejected' : 'verified',
        enrollmentStatus:
          decision === 'approve'
            ? 'approved'
            : decision === 'complete'
            ? 'completed'
            : 'rejected',
        reviewNote:
          reviewNotes[enr.id] ||
          (decision === 'reject'
            ? 'Payment verification failed or rejected by admin.'
            : 'Manual NPR payment verified and enrollment approved.'),
        actor: profile,
      });
      await loadAdminData();
      setNotice(`Updated enrollment for ${enr.studentName} (${decision}).`);
    } catch (err) {
      setErrorMsg(parseFirestoreErrorMessage(err));
    } finally {
      setBusyAction(null);
    }
  };

  const handleRoleChange = async (targetUser: UserProfile, newRole: UserRole) => {
    if (!profile) return;
    setBusyAction(targetUser.uid);
    setErrorMsg(null);
    try {
      await adminUpdateUserRole({ targetUser, newRole, actor: profile });
      await loadAdminData();
      setNotice(`Updated ${targetUser.email} role to ${newRole}.`);
    } catch (err) {
      setErrorMsg(parseFirestoreErrorMessage(err));
    } finally {
      setBusyAction(null);
    }
  };

  const handleIssueCert = async (enr: Enrollment) => {
    if (!profile) return;
    setBusyAction(`cert_${enr.id}`);
    setErrorMsg(null);
    try {
      const code = await adminIssueCertificate({ enrollment: enr, actor: profile });
      await loadAdminData();
      setNotice(`Issued completion certificate ${code} to ${enr.studentName}.`);
    } catch (err) {
      setErrorMsg(parseFirestoreErrorMessage(err));
    } finally {
      setBusyAction(null);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setBusyAction('settings');
    setErrorMsg(null);
    try {
      await saveAcademySettings(settingsForm, profile);
      await refreshCatalog();
      setNotice('Academy payment and contact settings updated.');
    } catch (err) {
      setErrorMsg(parseFirestoreErrorMessage(err));
    } finally {
      setBusyAction(null);
    }
  };

  const navItems: DashboardNavItem[] = [
    { id: 'overview', label: 'Academy Overview', icon: LayoutDashboard },
    { id: 'enrollments', label: 'Enrollments & Payments', icon: CreditCard, count: pendingEnrollmentsCount },
    { id: 'courses', label: 'Courses CRUD', icon: BookOpen, count: courses.length },
    { id: 'batches', label: 'Batch Scheduling', icon: Calendar, count: batches.length },
    { id: 'categories', label: 'Categories', icon: FolderKanban, count: categories.length },
    { id: 'instructors', label: 'Instructors', icon: UserCheck, count: instructors.length },
    { id: 'users', label: 'Students & Roles', icon: Users, count: users.length },
    { id: 'certificates', label: 'Certificates', icon: Award, count: certificates.length },
    { id: 'inquiries', label: 'Inquiries', icon: MessageSquare, count: inquiries.filter((i) => i.status === 'new').length },
    { id: 'audit', label: 'Audit Logs', icon: ShieldCheck, count: auditLogs.length },
    { id: 'settings', label: 'Academy Settings', icon: Settings },
  ];

  return (
    <DashboardShell
      portalTitle="Admin Console"
      roleLabel="Academy Administrator"
      navItems={navItems}
      activeTab={activeTab}
      onSelectTab={(id) => {
        setActiveTab(id);
        setNotice(null);
      }}
      headerAction={
        <button
          type="button"
          disabled={busyAction === 'seed'}
          onClick={() => void handleSeedDemo()}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
        >
          <Database className="w-3.5 h-3.5" />
          <span>{busyAction === 'seed' ? 'Seeding...' : 'Seed Sample Catalog'}</span>
        </button>
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

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
          {[1, 2, 3, 4].map((n) => (
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
                  <p className="text-xs text-slate-500 dark:text-slate-400">Verified Payments (NPR)</p>
                  <p className="mt-2 font-mono tabular-nums text-2xl font-bold text-slate-950 dark:text-white">
                    {formatNpr(verifiedRevenueNpr)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Real admin-verified receipts only</p>
                </div>
                <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Pending Verification (NPR)</p>
                  <p className="mt-2 font-mono tabular-nums text-2xl font-bold text-amber-700 dark:text-amber-400">
                    {formatNpr(pendingRevenueNpr)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{pendingEnrollmentsCount} applications awaiting review</p>
                </div>
                <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Published Courses &amp; Batches</p>
                  <p className="mt-2 font-mono tabular-nums text-2xl font-bold text-slate-950 dark:text-white">
                    {courses.filter((c) => c.published).length} / {batches.length}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Live Firestore records</p>
                </div>
                <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Registered Accounts</p>
                  <p className="mt-2 font-mono tabular-nums text-2xl font-bold text-slate-950 dark:text-white">
                    {users.length}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Verified Google accounts</p>
                </div>
              </div>

              {courses.length === 0 && (
                <div className="p-7 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="font-display text-base font-semibold text-slate-950 dark:text-white">
                      Firestore Catalog Is Empty
                    </h2>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                      Seed the starter clearly-labeled Birta Academy sample dataset (6 categories, 6
                      courses, 4 live batches, lessons, and live sessions) or create your first live
                      course manually.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busyAction === 'seed'}
                    onClick={() => void handleSeedDemo()}
                    className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-slate-950 dark:bg-brand-600 text-white whitespace-nowrap shrink-0"
                  >
                    {busyAction === 'seed' ? 'Seeding Catalog...' : 'Seed Sample Catalog'}
                  </button>
                </div>
              )}

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <h2 className="font-display text-base font-semibold text-slate-950 dark:text-white">
                    Recent Audit Activity
                  </h2>
                  <button
                    type="button"
                    onClick={() => setActiveTab('audit')}
                    className="text-xs font-medium text-brand-700 dark:text-brand-400 hover:underline"
                  >
                    Full Audit Trail
                  </button>
                </div>
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {auditLogs.slice(0, 5).map((log) => (
                    <div key={log.id} className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                      <div>
                        <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                          {log.action}
                        </span>
                        <span className="mx-2 text-slate-400">·</span>
                        <span className="text-slate-600 dark:text-slate-300">{log.summary}</span>
                      </div>
                      <span className="font-mono text-slate-500 shrink-0">
                        {formatDateTimeValue(log.createdAt)}
                      </span>
                    </div>
                  ))}
                  {auditLogs.length === 0 && (
                    <p className="p-6 text-sm text-slate-500 text-center">No administrative audit entries yet.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ENROLLMENTS & MANUAL PAYMENT VERIFICATION */}
          {activeTab === 'enrollments' && (
            <div className="space-y-4">
              {enrollments.length === 0 ? (
                <div className="p-10 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center text-sm text-slate-500">
                  No student enrollment applications submitted yet.
                </div>
              ) : (
                enrollments.map((enr) => (
                  <div
                    key={enr.id}
                    className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4"
                  >
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span
                            className={`font-semibold capitalize ${
                              enr.enrollmentStatus === 'approved' || enr.enrollmentStatus === 'completed'
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : enr.enrollmentStatus === 'rejected'
                                ? 'text-red-700 dark:text-red-400'
                                : 'text-amber-700 dark:text-amber-400'
                            }`}
                          >
                            Enrollment: {enr.enrollmentStatus}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="text-slate-500">
                            Payment: {enr.paymentStatus.replace('_', ' ')}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono font-semibold text-slate-950 dark:text-white">
                            {formatNpr(enr.amountNpr)}
                          </span>
                        </div>
                        <h3 className="font-display text-base font-semibold text-slate-950 dark:text-white">
                          {enr.studentName} ({enr.studentEmail})
                        </h3>
                        <p className="text-sm text-slate-600 dark:text-slate-300">
                          {enr.courseTitle} — {enr.batchName}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {paymentMethodLabel(enr.paymentMethod)} · Reference:{' '}
                          <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                            {enr.paymentReference}
                          </span>
                        </p>
                        {enr.paymentNotes && (
                          <p className="text-xs text-slate-500">Student Note: {enr.paymentNotes}</p>
                        )}
                      </div>

                      <div className="flex flex-col gap-2 min-w-[240px]">
                        <input
                          type="text"
                          placeholder="Verification note (optional)"
                          value={reviewNotes[enr.id] ?? enr.reviewNote ?? ''}
                          onChange={(e) =>
                            setReviewNotes((p) => ({ ...p, [enr.id]: e.target.value }))
                          }
                          className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={busyAction === enr.id}
                            onClick={() => void handleReviewEnrollment(enr, 'approve')}
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-600 disabled:opacity-50"
                          >
                            Verify &amp; Approve
                          </button>
                          <button
                            type="button"
                            disabled={busyAction === enr.id}
                            onClick={() => void handleReviewEnrollment(enr, 'complete')}
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-700 text-white hover:bg-blue-600 disabled:opacity-50"
                          >
                            Mark Completed
                          </button>
                          <button
                            type="button"
                            disabled={busyAction === enr.id}
                            onClick={() => void handleReviewEnrollment(enr, 'reject')}
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-300 dark:border-red-900 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* COURSES CRUD */}
          {activeTab === 'courses' && (
            <div className="space-y-6">
              <form
                onSubmit={handleSaveCourse}
                className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-base font-semibold text-slate-950 dark:text-white">
                    {editingCourseId ? 'Edit Course' : 'Create New Course'}
                  </h2>
                  {editingCourseId && (
                    <button
                      type="button"
                      onClick={() => setEditingCourseId(null)}
                      className="text-xs text-slate-500 hover:underline"
                    >
                      Cancel edit
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input
                    type="text"
                    required
                    maxLength={140}
                    placeholder="Course Title"
                    value={courseForm.title}
                    onChange={(e) => setCourseForm((p) => ({ ...p, title: e.target.value }))}
                    className="px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                  <input
                    type="text"
                    required
                    maxLength={220}
                    placeholder="Short Subtitle"
                    value={courseForm.subtitle}
                    onChange={(e) => setCourseForm((p) => ({ ...p, subtitle: e.target.value }))}
                    className="px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                  <select
                    required
                    value={courseForm.categoryId}
                    onChange={(e) => setCourseForm((p) => ({ ...p, categoryId: e.target.value }))}
                    className="px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    <option value="">Select Category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <select
                    required
                    value={courseForm.instructorId}
                    onChange={(e) => setCourseForm((p) => ({ ...p, instructorId: e.target.value }))}
                    className="px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    <option value="">Select Instructor</option>
                    {instructors.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.displayName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <select
                    value={courseForm.level}
                    onChange={(e) =>
                      setCourseForm((p) => ({ ...p, level: e.target.value as CourseLevel }))
                    }
                    className="px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    <option value="Beginner">Beginner</option>
                    <option value="Intermediate">Intermediate</option>
                    <option value="Advanced">Advanced</option>
                  </select>
                  <input
                    type="number"
                    min={1}
                    max={52}
                    placeholder="Weeks"
                    value={courseForm.durationWeeks}
                    onChange={(e) =>
                      setCourseForm((p) => ({ ...p, durationWeeks: Number(e.target.value) }))
                    }
                    className="px-3.5 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                  <input
                    type="number"
                    min={0}
                    max={500000}
                    placeholder="Price (NPR)"
                    value={courseForm.priceNpr}
                    onChange={(e) =>
                      setCourseForm((p) => ({ ...p, priceNpr: Number(e.target.value) }))
                    }
                    className="px-3.5 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                  <select
                    value={courseForm.thumbnailUrl}
                    onChange={(e) => setCourseForm((p) => ({ ...p, thumbnailUrl: e.target.value }))}
                    className="px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    <option value={MEDIA_ASSETS.engineeringAi}>Cover: Engineering &amp; AI</option>
                    <option value={MEDIA_ASSETS.tradingDesk}>Cover: Trading Desk</option>
                    <option value={MEDIA_ASSETS.creativeStudio}>Cover: Creative Studio</option>
                    <option value={MEDIA_ASSETS.growthMarketing}>Cover: Growth Marketing</option>
                  </select>
                </div>

                <textarea
                  required
                  rows={3}
                  maxLength={2000}
                  placeholder="Full course overview description..."
                  value={courseForm.description}
                  onChange={(e) => setCourseForm((p) => ({ ...p, description: e.target.value }))}
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      Learning Outcomes (one per line, max 10)
                    </label>
                    <textarea
                      rows={3}
                      value={courseForm.outcomesText}
                      onChange={(e) =>
                        setCourseForm((p) => ({ ...p, outcomesText: e.target.value }))
                      }
                      className="w-full px-3.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      Syllabus Modules (one per line, max 15)
                    </label>
                    <textarea
                      rows={3}
                      value={courseForm.syllabusText}
                      onChange={(e) =>
                        setCourseForm((p) => ({ ...p, syllabusText: e.target.value }))
                      }
                      className="w-full px-3.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-6 text-xs text-slate-700 dark:text-slate-300">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={courseForm.published}
                      onChange={(e) =>
                        setCourseForm((p) => ({ ...p, published: e.target.checked }))
                      }
                    />
                    <span>Published to Public Catalog</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={courseForm.featured}
                      onChange={(e) =>
                        setCourseForm((p) => ({ ...p, featured: e.target.checked }))
                      }
                    />
                    <span>Featured on Homepage</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={courseForm.isDemo}
                      onChange={(e) => setCourseForm((p) => ({ ...p, isDemo: e.target.checked }))}
                    />
                    <span>Mark as Demo Sample</span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={busyAction === 'course'}
                  className="px-5 py-2.5 text-xs font-semibold rounded-lg bg-slate-950 dark:bg-brand-600 text-white hover:opacity-90 disabled:opacity-50"
                >
                  {editingCourseId ? 'Update Course' : 'Save Course'}
                </button>
              </form>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-200 dark:divide-slate-800">
                {courses.map((c) => (
                  <div key={c.id} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <p className="text-xs text-slate-500">
                        {c.categoryName} · {c.level} · {c.published ? 'Published' : 'Draft'}
                        {c.isDemo ? ' · Demo' : ''}
                      </p>
                      <h3 className="font-semibold text-sm text-slate-950 dark:text-white mt-0.5">
                        {c.title}
                      </h3>
                      <p className="text-xs font-mono text-slate-500 mt-0.5">
                        {formatNpr(c.priceNpr)} · /{c.slug}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleEditCourse(c)}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteCourse(c)}
                        aria-label={`Delete ${c.title}`}
                        className="p-1.5 text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
                {courses.length === 0 && (
                  <p className="p-6 text-sm text-slate-500 text-center">No courses in Firestore yet.</p>
                )}
              </div>
            </div>
          )}

          {/* BATCH SCHEDULING */}
          {activeTab === 'batches' && (
            <div className="space-y-6">
              <form
                onSubmit={handleSaveBatch}
                className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4"
              >
                <h2 className="font-display text-base font-semibold text-slate-950 dark:text-white">
                  Schedule Live Cohort Batch
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <select
                    required
                    value={batchForm.courseId}
                    onChange={(e) => {
                      const c = courses.find((item) => item.id === e.target.value);
                      setBatchForm((p) => ({
                        ...p,
                        courseId: e.target.value,
                        instructorId: c?.instructorId || p.instructorId,
                        priceNpr: c?.priceNpr ?? p.priceNpr,
                      }));
                    }}
                    className="px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    <option value="">Select Course</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    required
                    placeholder="Batch name (e.g. Batch 02 — Evening Live Cohort)"
                    value={batchForm.name}
                    onChange={(e) => setBatchForm((p) => ({ ...p, name: e.target.value }))}
                    className="px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                  <input
                    type="date"
                    required
                    value={batchForm.startDate}
                    onChange={(e) => setBatchForm((p) => ({ ...p, startDate: e.target.value }))}
                    className="px-3.5 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                  <input
                    type="date"
                    required
                    value={batchForm.endDate}
                    onChange={(e) => setBatchForm((p) => ({ ...p, endDate: e.target.value }))}
                    className="px-3.5 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                  <input
                    type="text"
                    required
                    placeholder="Schedule (e.g. Sun, Tue, Thu · 7:30 PM)"
                    value={batchForm.scheduleText}
                    onChange={(e) => setBatchForm((p) => ({ ...p, scheduleText: e.target.value }))}
                    className="px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="number"
                      min={1}
                      max={500}
                      placeholder="Seats"
                      value={batchForm.seatLimit}
                      onChange={(e) =>
                        setBatchForm((p) => ({ ...p, seatLimit: Number(e.target.value) }))
                      }
                      className="px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                    <input
                      type="number"
                      min={0}
                      max={500000}
                      placeholder="NPR"
                      value={batchForm.priceNpr}
                      onChange={(e) =>
                        setBatchForm((p) => ({ ...p, priceNpr: Number(e.target.value) }))
                      }
                      className="px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                    <select
                      value={batchForm.status}
                      onChange={(e) =>
                        setBatchForm((p) => ({ ...p, status: e.target.value as BatchStatus }))
                      }
                      className="px-2 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    >
                      <option value="upcoming">Upcoming</option>
                      <option value="ongoing">Ongoing</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={busyAction === 'batch'}
                  className="px-5 py-2 text-xs font-semibold rounded-lg bg-slate-950 dark:bg-brand-600 text-white"
                >
                  Create Live Batch
                </button>
              </form>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-200 dark:divide-slate-800">
                {batches.map((b) => (
                  <div key={b.id} className="p-5 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs text-slate-500 capitalize">
                        {b.status} · {formatDateValue(b.startDate)} – {formatDateValue(b.endDate)} ·{' '}
                        {formatNpr(b.priceNpr)}
                      </p>
                      <p className="font-semibold text-sm text-slate-950 dark:text-white mt-0.5">
                        {b.courseTitle} — {b.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {b.scheduleText} ({b.timezone}) · Instructor: {b.instructorName}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (profile) {
                          void deleteBatch(b.id, b.name, profile).then(() => {
                            void loadAdminData();
                            void refreshCatalog();
                          });
                        }
                      }}
                      className="p-2 text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CATEGORIES */}
          {activeTab === 'categories' && (
            <div className="space-y-6">
              <form
                onSubmit={handleSaveCategory}
                className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4"
              >
                <h2 className="font-display text-base font-semibold text-slate-950 dark:text-white">
                  Add Skill Category
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <input
                    type="text"
                    required
                    placeholder="Category name"
                    value={catForm.name}
                    onChange={(e) => setCatForm((p) => ({ ...p, name: e.target.value }))}
                    className="px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                  <input
                    type="text"
                    required
                    placeholder="Short category description"
                    value={catForm.description}
                    onChange={(e) => setCatForm((p) => ({ ...p, description: e.target.value }))}
                    className="md:col-span-2 px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold rounded-lg bg-slate-950 dark:bg-brand-600 text-white"
                >
                  Create Category
                </button>
              </form>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-200 dark:divide-slate-800">
                {categories.map((cat) => (
                  <div key={cat.id} className="p-5 flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-sm text-slate-950 dark:text-white">{cat.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{cat.description}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (profile) {
                          void deleteCategory(cat.id, cat.name, profile).then(() => {
                            void loadAdminData();
                            void refreshCatalog();
                          });
                        }
                      }}
                      className="p-2 text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* INSTRUCTORS */}
          {activeTab === 'instructors' && (
            <div className="space-y-6">
              <form
                onSubmit={handleSaveInstructor}
                className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4"
              >
                <h2 className="font-display text-base font-semibold text-slate-950 dark:text-white">
                  Add Public Instructor Profile (No PII)
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input
                    type="text"
                    required
                    placeholder="Instructor Display Name"
                    value={instForm.displayName}
                    onChange={(e) => setInstForm((p) => ({ ...p, displayName: e.target.value }))}
                    className="px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                  <input
                    type="text"
                    required
                    placeholder="Specialty (e.g. Full-Stack Engineering)"
                    value={instForm.specialty}
                    onChange={(e) => setInstForm((p) => ({ ...p, specialty: e.target.value }))}
                    className="px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <textarea
                  required
                  rows={3}
                  placeholder="Verified instructor bio..."
                  value={instForm.bio}
                  onChange={(e) => setInstForm((p) => ({ ...p, bio: e.target.value }))}
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold rounded-lg bg-slate-950 dark:bg-brand-600 text-white"
                >
                  Save Instructor Profile
                </button>
              </form>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {instructors.map((inst) => (
                  <div
                    key={inst.id}
                    className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                  >
                    <p className="text-xs text-brand-700 dark:text-brand-400">
                      {inst.specialty} {inst.isDemo ? '· Demo' : ''}
                    </p>
                    <p className="font-semibold text-sm text-slate-950 dark:text-white mt-1">
                      {inst.displayName}
                    </p>
                    <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{inst.bio}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STUDENTS & RBAC ROLES */}
          {activeTab === 'users' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 bg-slate-50 dark:bg-slate-900">
                      <th className="py-3 px-5">User</th>
                      <th className="py-3 px-5">City / Phone</th>
                      <th className="py-3 px-5">Role</th>
                      <th className="py-3 px-5 text-right">Update Role</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {users.map((u) => (
                      <tr key={u.uid}>
                        <td className="py-3.5 px-5">
                          <p className="font-medium text-slate-950 dark:text-white">
                            {u.displayName}
                          </p>
                          <p className="text-xs text-slate-500">{u.email}</p>
                        </td>
                        <td className="py-3.5 px-5 text-xs text-slate-500">
                          {u.city || '—'} · {u.phone || '—'}
                        </td>
                        <td className="py-3.5 px-5 capitalize font-mono text-xs font-semibold">
                          {u.role}
                        </td>
                        <td className="py-3.5 px-5 text-right">
                          <select
                            aria-label={`Role for ${u.email}`}
                            disabled={busyAction === u.uid || u.uid === profile?.uid}
                            value={u.role}
                            onChange={(e) => void handleRoleChange(u, e.target.value as UserRole)}
                            className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 disabled:opacity-50"
                          >
                            <option value="student">Student</option>
                            <option value="instructor">Instructor</option>
                            <option value="admin">Admin</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* CERTIFICATES */}
          {activeTab === 'certificates' && (
            <div className="space-y-6">
              <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
                <h2 className="font-display text-base font-semibold text-slate-950 dark:text-white">
                  Issue Completion Certificate to Approved Student
                </h2>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {enrollments
                    .filter(
                      (e) => e.enrollmentStatus === 'approved' || e.enrollmentStatus === 'completed'
                    )
                    .map((enr) => {
                      const alreadyIssued = certificates.some(
                        (c) => c.studentId === enr.studentId && c.batchId === enr.batchId
                      );
                      return (
                        <div key={enr.id} className="py-3 flex items-center justify-between gap-4 text-sm">
                          <div>
                            <p className="font-medium text-slate-950 dark:text-white">
                              {enr.studentName}
                            </p>
                            <p className="text-xs text-slate-500">
                              {enr.courseTitle} — {enr.batchName}
                            </p>
                          </div>
                          {alreadyIssued ? (
                            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                              Certificate Issued
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={busyAction === `cert_${enr.id}`}
                              onClick={() => void handleIssueCert(enr)}
                              className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-slate-950 dark:bg-brand-600 text-white"
                            >
                              Issue Certificate
                            </button>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-200 dark:divide-slate-800">
                {certificates.map((cert) => (
                  <div key={cert.id} className="p-5 flex items-center justify-between gap-4 text-sm">
                    <div>
                      <p className="font-mono text-xs text-brand-700 dark:text-brand-400">
                        {cert.certificateCode} · {cert.status.toUpperCase()}
                      </p>
                      <p className="font-semibold text-slate-950 dark:text-white mt-0.5">
                        {cert.studentName} — {cert.courseTitle}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (profile) {
                          void adminToggleCertificateStatus({
                            certificate: cert,
                            nextStatus: cert.status === 'issued' ? 'revoked' : 'issued',
                            actor: profile,
                          }).then(() => void loadAdminData());
                        }
                      }}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700"
                    >
                      {cert.status === 'issued' ? 'Revoke' : 'Reinstate'}
                    </button>
                  </div>
                ))}
                {certificates.length === 0 && (
                  <p className="p-6 text-sm text-slate-500 text-center">No certificates issued yet.</p>
                )}
              </div>
            </div>
          )}

          {/* INQUIRIES */}
          {activeTab === 'inquiries' && (
            <div className="space-y-4">
              {inquiries.map((inq) => (
                <div
                  key={inq.id}
                  className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                    <span>
                      {inq.fullName} ({inq.email}) {inq.phone ? `· ${inq.phone}` : ''}
                    </span>
                    <span className="font-mono uppercase">{inq.status}</span>
                  </div>
                  <p className="text-xs font-medium text-brand-700 dark:text-brand-400">
                    Interest: {inq.courseInterest}
                  </p>
                  <p className="text-sm text-slate-700 dark:text-slate-300">{inq.message}</p>
                  <div className="pt-2 flex items-center gap-2">
                    {(['responded', 'closed'] as const).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => {
                          if (profile) {
                            void adminUpdateInquiryStatus(inq.id, st, profile).then(
                              () => void loadAdminData()
                            );
                          }
                        }}
                        className="px-3 py-1 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 capitalize"
                      >
                        Mark {st}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {inquiries.length === 0 && (
                <div className="p-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center text-sm text-slate-500">
                  No admission inquiries submitted yet.
                </div>
              )}
            </div>
          )}

          {/* AUDIT LOGS */}
          {activeTab === 'audit' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="p-5 border-b border-slate-200 dark:border-slate-800">
                <h2 className="font-display text-base font-semibold text-slate-950 dark:text-white">
                  Immutable Administrative Audit Trail
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Updates and deletions are permanently blocked at the database rule level.
                </p>
              </div>
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {auditLogs.map((log) => (
                  <div key={log.id} className="px-5 py-3.5 text-xs space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {log.action} · {log.targetCollection}/{log.targetId}
                      </span>
                      <span className="font-mono text-slate-500">
                        {formatDateTimeValue(log.createdAt)}
                      </span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-300">{log.summary}</p>
                    <p className="text-slate-500">Actor: {log.actorEmail}</p>
                  </div>
                ))}
                {auditLogs.length === 0 && (
                  <p className="p-8 text-center text-sm text-slate-500">No audit records yet.</p>
                )}
              </div>
            </div>
          )}

          {/* ACADEMY SETTINGS */}
          {activeTab === 'settings' && (
            <form
              onSubmit={handleSaveSettings}
              className="max-w-2xl p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4"
            >
              <h2 className="font-display text-base font-semibold text-slate-950 dark:text-white">
                Academy Contact &amp; Nepal Manual Payment Settings
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1">Academy Name</label>
                  <input
                    type="text"
                    required
                    value={settingsForm.academyName}
                    onChange={(e) =>
                      setSettingsForm((p) => ({ ...p, academyName: e.target.value }))
                    }
                    className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Admissions Email</label>
                  <input
                    type="email"
                    required
                    value={settingsForm.supportEmail}
                    onChange={(e) =>
                      setSettingsForm((p) => ({ ...p, supportEmail: e.target.value }))
                    }
                    className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Bank Name</label>
                  <input
                    type="text"
                    required
                    value={settingsForm.bankName}
                    onChange={(e) => setSettingsForm((p) => ({ ...p, bankName: e.target.value }))}
                    className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Bank Account Name</label>
                  <input
                    type="text"
                    required
                    value={settingsForm.bankAccountName}
                    onChange={(e) =>
                      setSettingsForm((p) => ({ ...p, bankAccountName: e.target.value }))
                    }
                    className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold mb-1">Bank Account Number</label>
                  <input
                    type="text"
                    required
                    value={settingsForm.bankAccountNumber}
                    onChange={(e) =>
                      setSettingsForm((p) => ({ ...p, bankAccountNumber: e.target.value }))
                    }
                    className="w-full px-3.5 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">
                  eSewa Manual Verification Instructions
                </label>
                <textarea
                  rows={2}
                  value={settingsForm.esewaInstructions}
                  onChange={(e) =>
                    setSettingsForm((p) => ({ ...p, esewaInstructions: e.target.value }))
                  }
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">
                  Khalti Manual Verification Instructions
                </label>
                <textarea
                  rows={2}
                  value={settingsForm.khaltiInstructions}
                  onChange={(e) =>
                    setSettingsForm((p) => ({ ...p, khaltiInstructions: e.target.value }))
                  }
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <button
                type="submit"
                disabled={busyAction === 'settings'}
                className="px-5 py-2.5 text-xs font-semibold rounded-lg bg-slate-950 dark:bg-brand-600 text-white"
              >
                Save Academy Settings
              </button>
            </form>
          )}
        </>
      )}
    </DashboardShell>
  );
}
