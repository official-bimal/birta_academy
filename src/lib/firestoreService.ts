import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { apiFetch } from './api';
import { safeHttpUrl } from './sessions';
import type { ReviewDecision } from './enrollmentPolicy';
import {
  db,
  handleFirestoreError,
  OperationType,
} from './firebase';
import {
  clampString,
  LIMITS,
  makeSafeId,
  toSlug,
} from './validation';
import {
  DEFAULT_ACADEMY_SETTINGS,
  DEMO_BATCHES,
  DEMO_CATEGORIES,
  DEMO_COURSES,
  DEMO_INSTRUCTORS,
} from '../data/demoCatalog';
import type {
  AcademySettings,
  Announcement,
  Assignment,
  AuditLog,
  Batch,
  BatchStatus,
  Category,
  Certificate,
  DateValue,
  Course,
  CourseLevel,
  Enrollment,
  EnrollmentStatus,
  Inquiry,
  InquiryStatus,
  InstructorProfile,
  Lesson,
  LessonProgress,
  LiveSession,
  LiveSessionStatus,
  PaymentMethod,
  PaymentStatus,
  Submission,
  SubmissionStatus,
  UserProfile,
  UserRole,
} from '../types';

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined && val !== '') {
      result[key] = val;
    }
  }
  return result as T;
}

// ---------------------------------------------------------------------------
// Audit Logging (Admin Actions)
// ---------------------------------------------------------------------------
export async function writeAuditLog(params: {
  actorId: string;
  actorEmail: string;
  action: string;
  targetCollection: string;
  targetId: string;
  summary: string;
}): Promise<void> {
  const id = makeSafeId('audit');
  const path = `auditLogs/${id}`;
  try {
    await setDoc(doc(db, 'auditLogs', id), {
      id,
      actorId: clampString(params.actorId, LIMITS.ID_MAX),
      actorEmail: clampString(params.actorEmail, LIMITS.EMAIL_MAX),
      action: clampString(params.action, 80),
      targetCollection: clampString(params.targetCollection, 60),
      targetId: clampString(params.targetId, LIMITS.ID_MAX),
      summary: clampString(params.summary, 400),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function listAuditLogs(): Promise<AuditLog[]> {
  const path = 'auditLogs';
  try {
    const snap = await getDocs(collection(db, path));
    return snap.docs
      .map((d) => d.data() as AuditLog)
      .sort((a, b) => {
        const ta = a.createdAt && typeof a.createdAt === 'object' && 'toMillis' in a.createdAt ? a.createdAt.toMillis() : 0;
        const tb = b.createdAt && typeof b.createdAt === 'object' && 'toMillis' in b.createdAt ? b.createdAt.toMillis() : 0;
        return tb - ta;
      });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

// ---------------------------------------------------------------------------
// User Profiles & RBAC Bootstrap
// ---------------------------------------------------------------------------
/** Read-only. Profiles and roles are created by the trusted server, never by the browser. */
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const path = `users/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? (snap.data() as UserProfile) : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function updateOwnProfile(
  uid: string,
  updates: { displayName: string; phone?: string; city?: string; bio?: string }
): Promise<void> {
  const path = `users/${uid}`;
  try {
    const payload = stripUndefined({
      displayName: clampString(updates.displayName, LIMITS.NAME_MAX) || 'Birta Learner',
      phone: clampString(updates.phone, LIMITS.PHONE_MAX),
      city: clampString(updates.city, LIMITS.CITY_MAX),
      bio: clampString(updates.bio, LIMITS.BIO_MAX),
      updatedAt: serverTimestamp(),
    });
    await updateDoc(doc(db, 'users', uid), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function listAllUsers(): Promise<UserProfile[]> {
  const path = 'users';
  try {
    const snap = await getDocs(collection(db, path));
    return snap.docs.map((d) => d.data() as UserProfile);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

// ---------------------------------------------------------------------------
// Public Catalog Reads (with graceful demo fallback when Firestore is empty)
// ---------------------------------------------------------------------------
export interface CatalogData {
  categories: Category[];
  courses: Course[];
  batches: Batch[];
  instructors: InstructorProfile[];
  usingFallbackDemo: boolean;
}

export async function fetchPublicCatalog(): Promise<CatalogData> {
  try {
    const [catSnap, courseSnap, batchSnap, instSnap] = await Promise.all([
      getDocs(query(collection(db, 'categories'), where('active', '==', true))),
      getDocs(query(collection(db, 'courses'), where('published', '==', true))),
      getDocs(
        query(collection(db, 'batches'), where('status', 'in', ['upcoming', 'ongoing', 'completed']))
      ),
      getDocs(query(collection(db, 'instructors'), where('active', '==', true))),
    ]);

    const liveCategories = catSnap.docs
      .map((d) => d.data() as Category)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const liveCourses = courseSnap.docs.map((d) => d.data() as Course);
    const liveBatches = batchSnap.docs.map((d) => d.data() as Batch);
    const liveInstructors = instSnap.docs.map((d) => d.data() as InstructorProfile);

    if (liveCourses.length === 0 && liveCategories.length === 0) {
      return {
        categories: DEMO_CATEGORIES,
        courses: DEMO_COURSES,
        batches: DEMO_BATCHES,
        instructors: DEMO_INSTRUCTORS,
        usingFallbackDemo: true,
      };
    }

    return {
      categories: liveCategories.length > 0 ? liveCategories : DEMO_CATEGORIES,
      courses: liveCourses,
      batches: liveBatches,
      instructors: liveInstructors.length > 0 ? liveInstructors : DEMO_INSTRUCTORS,
      usingFallbackDemo: false,
    };
  } catch {
    // Graceful public catalog display even before initial admin seed
    return {
      categories: DEMO_CATEGORIES,
      courses: DEMO_COURSES,
      batches: DEMO_BATCHES,
      instructors: DEMO_INSTRUCTORS,
      usingFallbackDemo: true,
    };
  }
}

export async function fetchAdminCatalog(): Promise<{
  categories: Category[];
  courses: Course[];
  batches: Batch[];
  instructors: InstructorProfile[];
}> {
  try {
    const [catSnap, courseSnap, batchSnap, instSnap] = await Promise.all([
      getDocs(collection(db, 'categories')),
      getDocs(collection(db, 'courses')),
      getDocs(collection(db, 'batches')),
      getDocs(collection(db, 'instructors')),
    ]);
    return {
      categories: catSnap.docs
        .map((d) => d.data() as Category)
        .sort((a, b) => a.sortOrder - b.sortOrder),
      courses: courseSnap.docs.map((d) => d.data() as Course),
      batches: batchSnap.docs.map((d) => d.data() as Batch),
      instructors: instSnap.docs.map((d) => d.data() as InstructorProfile),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'courses');
  }
}

// ---------------------------------------------------------------------------
// Academy Settings (Payment Instructions & Support Info)
// ---------------------------------------------------------------------------
export async function fetchAcademySettings(): Promise<AcademySettings> {
  try {
    const snap = await getDoc(doc(db, 'settings', 'academy'));
    if (snap.exists()) {
      const data = snap.data() as Partial<AcademySettings>;
      return {
        ...DEFAULT_ACADEMY_SETTINGS,
        ...data,
        certificateCriteria: { ...DEFAULT_ACADEMY_SETTINGS.certificateCriteria, ...data.certificateCriteria },
      } as AcademySettings;
    }
    return DEFAULT_ACADEMY_SETTINGS;
  } catch {
    return DEFAULT_ACADEMY_SETTINGS;
  }
}

export async function saveAcademySettings(
  settings: Omit<AcademySettings, 'updatedAt'>,
  actor: UserProfile
): Promise<void> {
  const path = 'settings/academy';
  try {
    const payload = stripUndefined({
      academyName: clampString(settings.academyName, 100),
      supportEmail: clampString(settings.supportEmail, 200),
      supportPhone: clampString(settings.supportPhone, 40),
      location: clampString(settings.location, 140),
      bankName: clampString(settings.bankName, 120),
      bankAccountName: clampString(settings.bankAccountName, 120),
      bankAccountNumber: clampString(settings.bankAccountNumber, 60),
      esewaInstructions: clampString(settings.esewaInstructions, 300),
      khaltiInstructions: clampString(settings.khaltiInstructions, 300),
      joinWindowMinutes: Math.max(0, Math.min(240, Number(settings.joinWindowMinutes ?? 15) || 0)),
      certificateCriteria: {
        minLessonPercent: Math.max(0, Math.min(100, Number(settings.certificateCriteria?.minLessonPercent ?? 80))),
        requireAssignments: settings.certificateCriteria?.requireAssignments ?? true,
        minAssignmentPercent: Math.max(0, Math.min(100, Number(settings.certificateCriteria?.minAssignmentPercent ?? 50))),
      },
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'settings', 'academy'), payload);
    await writeAuditLog({
      actorId: actor.uid,
      actorEmail: actor.email,
      action: 'UPDATE_SETTINGS',
      targetCollection: 'settings',
      targetId: 'academy',
      summary: 'Updated academy payment instructions and support settings',
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// ---------------------------------------------------------------------------
// Admin CRUD: Categories, Instructors, Courses, Batches
// ---------------------------------------------------------------------------
export async function saveCategory(
  input: {
    id?: string;
    name: string;
    slug?: string;
    description: string;
    sortOrder: number;
    active: boolean;
  },
  actor: UserProfile
): Promise<string> {
  const isNew = !input.id;
  const id = input.id || makeSafeId('cat');
  const path = `categories/${id}`;
  try {
    if (isNew) {
      await setDoc(doc(db, 'categories', id), {
        id,
        slug: toSlug(input.slug || input.name),
        name: clampString(input.name, 80),
        description: clampString(input.description, 300),
        sortOrder: Math.max(0, Math.min(1000, Number(input.sortOrder) || 0)),
        active: Boolean(input.active),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(doc(db, 'categories', id), {
        slug: toSlug(input.slug || input.name),
        name: clampString(input.name, 80),
        description: clampString(input.description, 300),
        sortOrder: Math.max(0, Math.min(1000, Number(input.sortOrder) || 0)),
        active: Boolean(input.active),
        updatedAt: serverTimestamp(),
      });
    }
    await writeAuditLog({
      actorId: actor.uid,
      actorEmail: actor.email,
      action: isNew ? 'CREATE_CATEGORY' : 'UPDATE_CATEGORY',
      targetCollection: 'categories',
      targetId: id,
      summary: `${isNew ? 'Created' : 'Updated'} category "${input.name}"`,
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, path);
  }
}

export async function deleteCategory(id: string, name: string, actor: UserProfile): Promise<void> {
  const path = `categories/${id}`;
  try {
    await deleteDoc(doc(db, 'categories', id));
    await writeAuditLog({
      actorId: actor.uid,
      actorEmail: actor.email,
      action: 'DELETE_CATEGORY',
      targetCollection: 'categories',
      targetId: id,
      summary: `Deleted category "${name}"`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveInstructorProfile(
  input: {
    id?: string;
    userId?: string;
    displayName: string;
    specialty: string;
    bio: string;
    credentialsNote?: string;
    active: boolean;
    isDemo: boolean;
  },
  actor: UserProfile
): Promise<string> {
  const isNew = !input.id;
  const id = input.id || makeSafeId('inst');
  const path = `instructors/${id}`;
  try {
    if (isNew) {
      await setDoc(
        doc(db, 'instructors', id),
        stripUndefined({
          id,
          userId: clampString(input.userId, LIMITS.ID_MAX),
          displayName: clampString(input.displayName, LIMITS.NAME_MAX),
          specialty: clampString(input.specialty, 120),
          bio: clampString(input.bio, LIMITS.INSTRUCTOR_BIO_MAX),
          credentialsNote: clampString(input.credentialsNote, 200),
          active: Boolean(input.active),
          isDemo: Boolean(input.isDemo),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );
    } else {
      await updateDoc(
        doc(db, 'instructors', id),
        stripUndefined({
          userId: clampString(input.userId, LIMITS.ID_MAX),
          displayName: clampString(input.displayName, LIMITS.NAME_MAX),
          specialty: clampString(input.specialty, 120),
          bio: clampString(input.bio, LIMITS.INSTRUCTOR_BIO_MAX),
          credentialsNote: clampString(input.credentialsNote, 200),
          active: Boolean(input.active),
          isDemo: Boolean(input.isDemo),
          updatedAt: serverTimestamp(),
        })
      );
    }
    await writeAuditLog({
      actorId: actor.uid,
      actorEmail: actor.email,
      action: isNew ? 'CREATE_INSTRUCTOR' : 'UPDATE_INSTRUCTOR',
      targetCollection: 'instructors',
      targetId: id,
      summary: `${isNew ? 'Created' : 'Updated'} instructor profile "${input.displayName}"`,
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, path);
  }
}

// ---------------------------------------------------------------------------
// Enrollments & Manual NPR Payment Verification
// ---------------------------------------------------------------------------
/** Enrollment is created by the trusted server, which reads price/instructor from the batch. */
export async function submitEnrollmentApplication(params: {
  student: UserProfile;
  course: Course;
  batch: Batch;
  paymentMethod: PaymentMethod;
  paymentReference: string;
  paymentNotes?: string;
}): Promise<string> {
  const res = await apiFetch<{ id: string }>('/enrollments', {
    method: 'POST',
    body: {
      batchId: params.batch.id,
      paymentMethod: params.paymentMethod,
      paymentReference: params.paymentReference,
      paymentNotes: params.paymentNotes ?? '',
    },
  });
  return res.id;
}

export async function listStudentEnrollments(studentId: string): Promise<Enrollment[]> {
  const path = 'enrollments';
  try {
    const snap = await getDocs(
      query(collection(db, path), where('studentId', '==', studentId))
    );
    return snap.docs.map((d) => d.data() as Enrollment);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

/** Batches assigned to this instructor (admins see all). Assignment is set only by the Super Admin through the server. */
export async function listInstructorBatches(instructorId: string, isAdminUser: boolean): Promise<Batch[]> {
  const path = 'batches';
  try {
    const snap = await getDocs(isAdminUser ? collection(db, path) : query(collection(db, path), where('instructorId', '==', instructorId)));
    return snap.docs.map((d) => d.data() as Batch).sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function listInstructorEnrollments(instructorId: string): Promise<Enrollment[]> {
  const path = 'enrollments';
  try {
    const snap = await getDocs(
      query(collection(db, path), where('instructorId', '==', instructorId))
    );
    return snap.docs.map((d) => d.data() as Enrollment);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function listAllEnrollments(): Promise<Enrollment[]> {
  const path = 'enrollments';
  try {
    const snap = await getDocs(collection(db, path));
    return snap.docs.map((d) => d.data() as Enrollment);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function adminReviewEnrollment(params: {
  enrollment: Enrollment;
  decision: ReviewDecision;
  reviewNote: string;
}): Promise<void> {
  await apiFetch(`/admin/enrollments/${encodeURIComponent(params.enrollment.id)}/review`, {
    method: 'POST',
    body: { decision: params.decision, note: params.reviewNote },
  });
}

// ---------------------------------------------------------------------------
// Gated Batch Subcollections: Lessons, Live Sessions, Assignments, Announcements
// ---------------------------------------------------------------------------
export async function listBatchLessons(batchId: string): Promise<Lesson[]> {
  const path = `batches/${batchId}/lessons`;
  try {
    const snap = await getDocs(collection(db, 'batches', batchId, 'lessons'));
    return snap.docs
      .map((d) => d.data() as Lesson)
      .sort((a, b) => a.orderIndex - b.orderIndex);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function saveBatchLesson(input: {
  id?: string;
  courseId: string;
  batchId: string;
  instructorId: string;
  title: string;
  moduleTitle: string;
  orderIndex: number;
  contentSummary: string;
  videoUrl?: string;
  resourceUrl?: string;
  durationMinutes: number;
}): Promise<string> {
  const isNew = !input.id;
  const id = input.id || makeSafeId('lesson');
  const path = `batches/${input.batchId}/lessons/${id}`;
  try {
    const shared = stripUndefined({
      title: clampString(input.title, LIMITS.TITLE_MAX),
      moduleTitle: clampString(input.moduleTitle, 100),
      orderIndex: Math.max(0, Math.min(500, Number(input.orderIndex) || 1)),
      contentSummary: clampString(input.contentSummary, 1500),
      videoUrl: safeHttpUrl(input.videoUrl) ?? undefined,
      resourceUrl: safeHttpUrl(input.resourceUrl) ?? undefined,
      durationMinutes: Math.max(1, Math.min(600, Number(input.durationMinutes) || 45)),
      updatedAt: serverTimestamp(),
    });
    if (isNew) {
      await setDoc(doc(db, 'batches', input.batchId, 'lessons', id), {
        id,
        courseId: input.courseId,
        batchId: input.batchId,
        instructorId: input.instructorId,
        ...shared,
        createdAt: serverTimestamp(),
      });
    } else {
      await updateDoc(doc(db, 'batches', input.batchId, 'lessons', id), shared);
    }
    return id;
  } catch (error) {
    handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, path);
  }
}

export async function deleteBatchLesson(batchId: string, lessonId: string): Promise<void> {
  const path = `batches/${batchId}/lessons/${lessonId}`;
  try {
    await deleteDoc(doc(db, 'batches', batchId, 'lessons', lessonId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function listBatchLiveSessions(batchId: string, asStudent = false): Promise<LiveSession[]> {
  const path = `batches/${batchId}/liveSessions`;
  try {
    const col = collection(db, 'batches', batchId, 'liveSessions');
    // students may only list published classes (enforced by the rules, so the query must say so)
    const snap = await getDocs(asStudent ? query(col, where('published', '==', true)) : col);
    return snap.docs
      .map((d) => d.data() as LiveSession)
      .sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

/** Saved by the trusted server, which validates the Meet link and the instructor's ownership of the batch. */
export async function saveBatchLiveSession(input: {
  id?: string;
  batchId: string;
  title: string;
  date: string;
  time: string;
  durationMinutes: number;
  meetingUrl: string;
  status?: 'scheduled' | 'completed' | 'cancelled';
  description?: string;
  moduleTitle?: string;
  joinWindowMinutes?: number;
  published?: boolean;
}): Promise<string> {
  const res = await apiFetch<{ id: string }>('/staff/sessions', {
    method: 'POST',
    body: { ...input, sessionId: input.id },
  });
  return res.id;
}

export async function setSessionRecording(batchId: string, sessionId: string, recordingUrl: string): Promise<void> {
  await apiFetch(`/staff/sessions/${batchId}/${sessionId}/recording`, { method: 'POST', body: { recordingUrl } });
}

export async function setSessionStatus(batchId: string, sessionId: string, status: 'scheduled' | 'completed' | 'cancelled'): Promise<void> {
  await apiFetch(`/staff/sessions/${batchId}/${sessionId}/status`, { method: 'POST', body: { status } });
}

export interface AttendanceRecord {
  studentId: string;
  studentName: string;
  status: 'present' | 'late' | 'absent' | 'excused';
}

export async function saveAttendance(
  batchId: string,
  sessionId: string,
  records: { studentId: string; status: AttendanceRecord['status'] }[]
): Promise<void> {
  await apiFetch(`/staff/sessions/${batchId}/${sessionId}/attendance`, { method: 'PUT', body: { records } });
}

export async function listAttendance(batchId: string, sessionId: string): Promise<AttendanceRecord[]> {
  const snap = await getDocs(collection(db, 'batches', batchId, 'liveSessions', sessionId, 'attendance'));
  return snap.docs.map((d) => d.data() as AttendanceRecord);
}

export async function getOwnAttendance(batchId: string, sessionId: string, uid: string): Promise<AttendanceRecord | null> {
  const snap = await getDoc(doc(db, 'batches', batchId, 'liveSessions', sessionId, 'attendance', uid));
  return snap.exists() ? (snap.data() as AttendanceRecord) : null;
}

/** Asks the API for the Meet (or recording) link. Enforces enrollment and the join window server-side. */
export async function requestSessionLink(batchId: string, sessionId: string, kind: 'join' | 'recording'): Promise<string> {
  const res = await apiFetch<{ url: string }>('/sessions/access', { method: 'POST', body: { batchId, sessionId, kind } });
  return res.url;
}

export async function listBatchAssignments(batchId: string): Promise<Assignment[]> {
  const path = `batches/${batchId}/assignments`;
  try {
    const snap = await getDocs(collection(db, 'batches', batchId, 'assignments'));
    return snap.docs
      .map((d) => d.data() as Assignment)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function saveBatchAssignment(input: {
  id?: string;
  courseId: string;
  batchId: string;
  instructorId: string;
  title: string;
  instructions: string;
  dueDate: string;
  maxScore: number;
}): Promise<string> {
  const isNew = !input.id;
  const id = input.id || makeSafeId('asgn');
  const path = `batches/${input.batchId}/assignments/${id}`;
  try {
    const shared = {
      title: clampString(input.title, LIMITS.TITLE_MAX),
      instructions: clampString(input.instructions, LIMITS.LONG_DESC_MAX),
      dueDate: clampString(input.dueDate, 40),
      maxScore: Math.max(1, Math.min(1000, Number(input.maxScore) || 100)),
      updatedAt: serverTimestamp(),
    };
    if (isNew) {
      await setDoc(doc(db, 'batches', input.batchId, 'assignments', id), {
        id,
        courseId: input.courseId,
        batchId: input.batchId,
        instructorId: input.instructorId,
        ...shared,
        createdAt: serverTimestamp(),
      });
    } else {
      await updateDoc(doc(db, 'batches', input.batchId, 'assignments', id), shared);
    }
    return id;
  } catch (error) {
    handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, path);
  }
}

export async function listBatchAnnouncements(batchId: string): Promise<Announcement[]> {
  const path = `batches/${batchId}/announcements`;
  try {
    const snap = await getDocs(collection(db, 'batches', batchId, 'announcements'));
    return snap.docs.map((d) => d.data() as Announcement);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function createBatchAnnouncement(input: {
  courseId: string;
  batchId: string;
  instructorId: string;
  authorName: string;
  title: string;
  body: string;
}): Promise<string> {
  const id = makeSafeId('ann');
  const path = `batches/${input.batchId}/announcements/${id}`;
  try {
    await setDoc(doc(db, 'batches', input.batchId, 'announcements', id), {
      id,
      courseId: input.courseId,
      batchId: input.batchId,
      instructorId: input.instructorId,
      authorName: clampString(input.authorName, LIMITS.NAME_MAX),
      title: clampString(input.title, LIMITS.TITLE_MAX),
      body: clampString(input.body, 1500),
      createdAt: serverTimestamp(),
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

// ---------------------------------------------------------------------------
// Student Progress & Assignment Submissions
// ---------------------------------------------------------------------------
export async function listStudentProgress(studentId: string): Promise<LessonProgress[]> {
  const path = 'lessonProgress';
  try {
    const snap = await getDocs(
      query(collection(db, path), where('studentId', '==', studentId))
    );
    return snap.docs.map((d) => d.data() as LessonProgress);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function toggleLessonProgress(params: {
  studentId: string;
  courseId: string;
  batchId: string;
  lessonId: string;
  completed: boolean;
}): Promise<void> {
  const id = `${params.studentId}_${params.lessonId}`;
  const path = `lessonProgress/${id}`;
  try {
    const ref = doc(db, 'lessonProgress', id);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        id,
        studentId: params.studentId,
        courseId: params.courseId,
        batchId: params.batchId,
        lessonId: params.lessonId,
        completed: params.completed,
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        completed: params.completed,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function listStudentSubmissions(studentId: string): Promise<Submission[]> {
  const path = 'submissions';
  try {
    const snap = await getDocs(
      query(collection(db, path), where('studentId', '==', studentId))
    );
    return snap.docs.map((d) => d.data() as Submission);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function listInstructorSubmissions(instructorId: string, isAdminUser: boolean): Promise<Submission[]> {
  const path = 'submissions';
  try {
    const q = isAdminUser
      ? collection(db, path)
      : query(collection(db, path), where('instructorId', '==', instructorId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Submission);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

/** Submissions are created by the trusted server (enrollment, due date, ownership are verified there). */
export async function submitAssignmentWork(params: {
  assignment: Assignment;
  student: UserProfile;
  submissionUrl: string;
  notes?: string;
}): Promise<string> {
  const res = await apiFetch<{ id: string }>('/submissions', {
    method: 'POST',
    body: {
      batchId: params.assignment.batchId,
      assignmentId: params.assignment.id,
      submissionUrl: params.submissionUrl,
      notes: params.notes ?? '',
    },
  });
  return res.id;
}

export async function gradeSubmission(params: {
  submissionId: string;
  status: SubmissionStatus;
  score: number;
  feedback: string;
}): Promise<void> {
  await apiFetch(`/staff/submissions/${encodeURIComponent(params.submissionId)}/grade`, {
    method: 'POST',
    body: { status: params.status, score: params.score, feedback: params.feedback },
  });
}

// ---------------------------------------------------------------------------
// Certificates
// ---------------------------------------------------------------------------
export async function listStudentCertificates(studentId: string): Promise<Certificate[]> {
  const path = 'certificates';
  try {
    const snap = await getDocs(
      query(collection(db, path), where('studentId', '==', studentId))
    );
    return snap.docs.map((d) => d.data() as Certificate);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function listAllCertificates(): Promise<Certificate[]> {
  const path = 'certificates';
  try {
    const snap = await getDocs(collection(db, path));
    return snap.docs.map((d) => d.data() as Certificate);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

/** Issued by the server only if eligibility checks pass; throws ApiError('NOT_ELIGIBLE') with reasons otherwise. */
export async function adminIssueCertificate(params: {
  enrollment: Enrollment;
  actor: UserProfile;
}): Promise<string> {
  const res = await apiFetch<{ code: string }>('/admin/certificates', {
    method: 'POST',
    body: { enrollmentId: params.enrollment.id },
  });
  return res.code;
}

export async function adminToggleCertificateStatus(params: {
  certificate: Certificate;
  nextStatus: 'issued' | 'revoked';
  actor: UserProfile;
}): Promise<void> {
  await apiFetch(`/admin/certificates/${encodeURIComponent(params.certificate.id)}/status`, {
    method: 'POST',
    body: { status: params.nextStatus },
  });
}

export async function getCertificateEligibility(enrollmentId: string): Promise<{
  eligible: boolean;
  reasons: string[];
  lessonPercent: number;
}> {
  return apiFetch(`/admin/enrollments/${encodeURIComponent(enrollmentId)}/eligibility`);
}

// ---------------------------------------------------------------------------
// Inquiries
// ---------------------------------------------------------------------------
export async function submitInquiry(params: {
  user: UserProfile;
  fullName: string;
  email: string;
  phone?: string;
  courseInterest: string;
  message: string;
}): Promise<string> {
  const id = makeSafeId('inq');
  const path = `inquiries/${id}`;
  try {
    await setDoc(
      doc(db, 'inquiries', id),
      stripUndefined({
        id,
        userId: params.user.uid,
        fullName: clampString(params.fullName, LIMITS.NAME_MAX),
        email: clampString(params.email, LIMITS.EMAIL_MAX),
        phone: clampString(params.phone, LIMITS.PHONE_MAX),
        courseInterest: clampString(params.courseInterest, LIMITS.TITLE_MAX),
        message: clampString(params.message, 1500),
        status: 'new',
        createdAt: serverTimestamp(),
      })
    );
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function listAllInquiries(): Promise<Inquiry[]> {
  const path = 'inquiries';
  try {
    const snap = await getDocs(collection(db, path));
    return snap.docs.map((d) => d.data() as Inquiry);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function adminUpdateInquiryStatus(
  inquiryId: string,
  status: InquiryStatus,
  actor: UserProfile
): Promise<void> {
  const path = `inquiries/${inquiryId}`;
  try {
    await updateDoc(doc(db, 'inquiries', inquiryId), { status });
    await writeAuditLog({
      actorId: actor.uid,
      actorEmail: actor.email,
      action: 'UPDATE_INQUIRY_STATUS',
      targetCollection: 'inquiries',
      targetId: inquiryId,
      summary: `Marked admission inquiry ${inquiryId} as ${status}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// ---------------------------------------------------------------------------
// Admin One-Click Starter Demo Catalog Seeder
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Public certificate verification (reads the minimal mirror document only)
// ---------------------------------------------------------------------------
export interface CertificateVerification {
  certificateCode: string;
  studentName: string;
  courseTitle: string;
  status: 'issued' | 'revoked';
  issuedAt?: DateValue;
}

export async function verifyCertificateCode(code: string): Promise<CertificateVerification | null> {
  const clean = code.trim().toUpperCase();
  if (!/^[A-Z0-9-]{4,64}$/.test(clean)) return null;
  const snap = await getDoc(doc(db, 'certificateVerifications', clean));
  return snap.exists() ? (snap.data() as CertificateVerification) : null;
}
