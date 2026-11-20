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
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
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
export async function syncUserProfileOnLogin(user: User): Promise<UserProfile> {
  const userPath = `users/${user.uid}`;
  const isBootstrapped =
    Boolean(user.emailVerified) &&
    user.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();

  try {
    const userRef = doc(db, 'users', user.uid);
    const snap = await getDoc(userRef);

    // Check admins lookup collection
    let isListedAdmin = isBootstrapped;
    if (!isListedAdmin) {
      try {
        const adminSnap = await getDoc(doc(db, 'admins', user.uid));
        isListedAdmin = adminSnap.exists();
      } catch {
        isListedAdmin = false;
      }
    }

    if (!snap.exists()) {
      const initialRole: UserRole = isListedAdmin ? 'admin' : 'student';
      const newProfile = {
        uid: user.uid,
        displayName: clampString(user.displayName || user.email?.split('@')[0] || 'Birta Learner', LIMITS.NAME_MAX),
        email: clampString(user.email || 'unknown@birtaacademy.edu.np', LIMITS.EMAIL_MAX),
        role: initialRole,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(userRef, newProfile);
      return {
        ...newProfile,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    const existing = snap.data() as UserProfile;
    if (isListedAdmin && existing.role !== 'admin') {
      await updateDoc(userRef, {
        role: 'admin',
        updatedAt: serverTimestamp(),
      });
      return { ...existing, role: 'admin' };
    }
    return existing;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
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

export async function adminUpdateUserRole(params: {
  targetUser: UserProfile;
  newRole: UserRole;
  actor: UserProfile;
}): Promise<void> {
  const path = `users/${params.targetUser.uid}`;
  try {
    await updateDoc(doc(db, 'users', params.targetUser.uid), {
      role: params.newRole,
      updatedAt: serverTimestamp(),
    });

    if (params.newRole === 'admin') {
      await setDoc(doc(db, 'admins', params.targetUser.uid), {
        uid: params.targetUser.uid,
        email: clampString(params.targetUser.email, LIMITS.EMAIL_MAX),
        grantedBy: params.actor.uid,
        createdAt: serverTimestamp(),
      });
    } else {
      // Remove from admins collection if demoting another user
      if (params.targetUser.uid !== params.actor.uid) {
        try {
          await deleteDoc(doc(db, 'admins', params.targetUser.uid));
        } catch {
          // Ignore if no admin doc existed
        }
      }
    }

    if (params.newRole === 'instructor') {
      const instRef = doc(db, 'instructors', params.targetUser.uid);
      const instSnap = await getDoc(instRef);
      if (!instSnap.exists()) {
        await setDoc(instRef, {
          id: params.targetUser.uid,
          userId: params.targetUser.uid,
          displayName: clampString(params.targetUser.displayName, LIMITS.NAME_MAX),
          specialty: 'Academy Faculty',
          bio: clampString(
            params.targetUser.bio || 'Instructor at Birta Academy. Update specialty and biography in the Instructor or Admin portal.',
            LIMITS.INSTRUCTOR_BIO_MAX
          ),
          active: true,
          isDemo: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }

    await writeAuditLog({
      actorId: params.actor.uid,
      actorEmail: params.actor.email,
      action: 'UPDATE_USER_ROLE',
      targetCollection: 'users',
      targetId: params.targetUser.uid,
      summary: `Changed role for ${params.targetUser.email} from ${params.targetUser.role} to ${params.newRole}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
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
      return snap.data() as AcademySettings;
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

export async function saveCourse(
  input: {
    id?: string;
    slug?: string;
    title: string;
    subtitle: string;
    categoryId: string;
    categoryName: string;
    instructorId: string;
    instructorName: string;
    level: CourseLevel;
    durationWeeks: number;
    priceNpr: number;
    thumbnailUrl?: string;
    description: string;
    outcomes: string[];
    syllabus: string[];
    published: boolean;
    featured: boolean;
    isDemo: boolean;
  },
  actor: UserProfile
): Promise<string> {
  const isNew = !input.id;
  const id = input.id || makeSafeId('course');
  const path = `courses/${id}`;
  const safeOutcomes =
    input.outcomes.length > 0
      ? input.outcomes.slice(0, LIMITS.OUTCOMES_MAX_ITEMS).map((o) => clampString(o, LIMITS.ITEM_STR_MAX))
      : ['Practical project-based skill mastery'];
  const safeSyllabus =
    input.syllabus.length > 0
      ? input.syllabus.slice(0, LIMITS.SYLLABUS_MAX_ITEMS).map((s) => clampString(s, LIMITS.ITEM_STR_MAX))
      : ['Module 1: Core Foundations'];

  try {
    const shared = stripUndefined({
      slug: toSlug(input.slug || input.title),
      title: clampString(input.title, LIMITS.TITLE_MAX),
      subtitle: clampString(input.subtitle, LIMITS.SUBTITLE_MAX),
      categoryId: clampString(input.categoryId, LIMITS.ID_MAX),
      categoryName: clampString(input.categoryName, 80),
      instructorId: clampString(input.instructorId, LIMITS.ID_MAX),
      instructorName: clampString(input.instructorName, LIMITS.NAME_MAX),
      level: input.level,
      durationWeeks: Math.max(1, Math.min(52, Number(input.durationWeeks) || 4)),
      priceNpr: Math.max(0, Math.min(500000, Number(input.priceNpr) || 0)),
      thumbnailUrl: clampString(input.thumbnailUrl, 300),
      description: clampString(input.description, LIMITS.LONG_DESC_MAX),
      outcomes: safeOutcomes,
      syllabus: safeSyllabus,
      published: Boolean(input.published),
      featured: Boolean(input.featured),
      isDemo: Boolean(input.isDemo),
      updatedAt: serverTimestamp(),
    });

    if (isNew) {
      await setDoc(doc(db, 'courses', id), {
        id,
        currency: 'NPR',
        ...shared,
        createdAt: serverTimestamp(),
      });
    } else {
      await updateDoc(doc(db, 'courses', id), shared);
    }

    await writeAuditLog({
      actorId: actor.uid,
      actorEmail: actor.email,
      action: isNew ? 'CREATE_COURSE' : 'UPDATE_COURSE',
      targetCollection: 'courses',
      targetId: id,
      summary: `${isNew ? 'Created' : 'Updated'} course "${input.title}" (NPR ${input.priceNpr})`,
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, path);
  }
}

export async function deleteCourse(id: string, title: string, actor: UserProfile): Promise<void> {
  const path = `courses/${id}`;
  try {
    await deleteDoc(doc(db, 'courses', id));
    await writeAuditLog({
      actorId: actor.uid,
      actorEmail: actor.email,
      action: 'DELETE_COURSE',
      targetCollection: 'courses',
      targetId: id,
      summary: `Deleted course "${title}"`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveBatch(
  input: {
    id?: string;
    courseId: string;
    courseTitle: string;
    courseSlug: string;
    instructorId: string;
    instructorName: string;
    name: string;
    startDate: string;
    endDate: string;
    scheduleText: string;
    timezone: string;
    seatLimit: number;
    priceNpr: number;
    status: BatchStatus;
    isDemo: boolean;
  },
  actor: UserProfile
): Promise<string> {
  const isNew = !input.id;
  const id = input.id || makeSafeId('batch');
  const path = `batches/${id}`;
  try {
    const shared = {
      courseTitle: clampString(input.courseTitle, LIMITS.TITLE_MAX),
      courseSlug: toSlug(input.courseSlug),
      instructorId: clampString(input.instructorId, LIMITS.ID_MAX),
      instructorName: clampString(input.instructorName, LIMITS.NAME_MAX),
      name: clampString(input.name, 120),
      startDate: clampString(input.startDate, 30),
      endDate: clampString(input.endDate, 30),
      scheduleText: clampString(input.scheduleText, 120),
      timezone: clampString(input.timezone || 'NPT (UTC+5:45)', 40),
      seatLimit: Math.max(1, Math.min(500, Number(input.seatLimit) || 25)),
      priceNpr: Math.max(0, Math.min(500000, Number(input.priceNpr) || 0)),
      status: input.status,
      isDemo: Boolean(input.isDemo),
      updatedAt: serverTimestamp(),
    };

    if (isNew) {
      await setDoc(doc(db, 'batches', id), {
        id,
        courseId: clampString(input.courseId, LIMITS.ID_MAX),
        ...shared,
        createdAt: serverTimestamp(),
      });
    } else {
      await updateDoc(doc(db, 'batches', id), shared);
    }

    await writeAuditLog({
      actorId: actor.uid,
      actorEmail: actor.email,
      action: isNew ? 'CREATE_BATCH' : 'UPDATE_BATCH',
      targetCollection: 'batches',
      targetId: id,
      summary: `${isNew ? 'Scheduled' : 'Updated'} batch "${input.name}" for ${input.courseTitle}`,
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, path);
  }
}

export async function deleteBatch(id: string, name: string, actor: UserProfile): Promise<void> {
  const path = `batches/${id}`;
  try {
    await deleteDoc(doc(db, 'batches', id));
    await writeAuditLog({
      actorId: actor.uid,
      actorEmail: actor.email,
      action: 'DELETE_BATCH',
      targetCollection: 'batches',
      targetId: id,
      summary: `Deleted batch "${name}"`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ---------------------------------------------------------------------------
// Enrollments & Manual NPR Payment Verification
// ---------------------------------------------------------------------------
export async function submitEnrollmentApplication(params: {
  student: UserProfile;
  course: Course;
  batch: Batch;
  paymentMethod: PaymentMethod;
  paymentReference: string;
  paymentNotes?: string;
}): Promise<string> {
  const id = `${params.student.uid}_${params.batch.id}`;
  const path = `enrollments/${id}`;
  try {
    const existingSnap = await getDoc(doc(db, 'enrollments', id));
    if (existingSnap.exists()) {
      const prev = existingSnap.data() as Enrollment;
      if (prev.enrollmentStatus === 'pending' && prev.paymentStatus === 'pending_verification') {
        await updateDoc(
          doc(db, 'enrollments', id),
          stripUndefined({
            paymentMethod: params.paymentMethod,
            paymentReference: clampString(params.paymentReference, LIMITS.PAYMENT_REF_MAX),
            paymentNotes: clampString(params.paymentNotes, LIMITS.NOTES_MAX),
            updatedAt: serverTimestamp(),
          })
        );
        return id;
      }
      throw new Error(`You already have a ${prev.enrollmentStatus} enrollment for this batch.`);
    }

    await setDoc(
      doc(db, 'enrollments', id),
      stripUndefined({
        id,
        studentId: params.student.uid,
        studentName: clampString(params.student.displayName, LIMITS.NAME_MAX),
        studentEmail: clampString(params.student.email, LIMITS.EMAIL_MAX),
        courseId: params.course.id,
        courseTitle: clampString(params.course.title, LIMITS.TITLE_MAX),
        batchId: params.batch.id,
        batchName: clampString(params.batch.name, 120),
        instructorId: params.batch.instructorId,
        amountNpr: params.batch.priceNpr,
        currency: 'NPR',
        paymentMethod: params.paymentMethod,
        paymentReference: clampString(params.paymentReference, LIMITS.PAYMENT_REF_MAX),
        paymentNotes: clampString(params.paymentNotes, LIMITS.NOTES_MAX),
        paymentStatus: 'pending_verification',
        enrollmentStatus: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
    return id;
  } catch (error) {
    if (error instanceof Error && error.message.includes('already have')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.CREATE, path);
  }
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
  paymentStatus: PaymentStatus;
  enrollmentStatus: EnrollmentStatus;
  reviewNote: string;
  actor: UserProfile;
}): Promise<void> {
  const path = `enrollments/${params.enrollment.id}`;
  try {
    await updateDoc(doc(db, 'enrollments', params.enrollment.id), {
      paymentStatus: params.paymentStatus,
      enrollmentStatus: params.enrollmentStatus,
      reviewedBy: params.actor.uid,
      reviewNote: clampString(params.reviewNote || 'Reviewed by Academy Admin', 400),
      updatedAt: serverTimestamp(),
    });
    await writeAuditLog({
      actorId: params.actor.uid,
      actorEmail: params.actor.email,
      action: 'REVIEW_ENROLLMENT',
      targetCollection: 'enrollments',
      targetId: params.enrollment.id,
      summary: `Set ${params.enrollment.studentEmail} (${params.enrollment.batchName}) -> payment: ${params.paymentStatus}, enrollment: ${params.enrollmentStatus}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
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
      videoUrl: clampString(input.videoUrl, LIMITS.URL_MAX),
      resourceUrl: clampString(input.resourceUrl, LIMITS.URL_MAX),
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

export async function listBatchLiveSessions(batchId: string): Promise<LiveSession[]> {
  const path = `batches/${batchId}/liveSessions`;
  try {
    const snap = await getDocs(collection(db, 'batches', batchId, 'liveSessions'));
    return snap.docs
      .map((d) => d.data() as LiveSession)
      .sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function saveBatchLiveSession(input: {
  id?: string;
  courseId: string;
  batchId: string;
  instructorId: string;
  title: string;
  scheduledStart: string;
  durationMinutes: number;
  meetingPlatform: string;
  meetingUrl?: string;
  status: LiveSessionStatus;
}): Promise<string> {
  const isNew = !input.id;
  const id = input.id || makeSafeId('session');
  const path = `batches/${input.batchId}/liveSessions/${id}`;
  try {
    const shared = stripUndefined({
      title: clampString(input.title, LIMITS.TITLE_MAX),
      scheduledStart: clampString(input.scheduledStart, 40),
      durationMinutes: Math.max(10, Math.min(480, Number(input.durationMinutes) || 90)),
      meetingPlatform: clampString(input.meetingPlatform || 'Google Meet', 40),
      meetingUrl: clampString(input.meetingUrl, LIMITS.URL_MAX),
      status: input.status,
      updatedAt: serverTimestamp(),
    });
    if (isNew) {
      await setDoc(doc(db, 'batches', input.batchId, 'liveSessions', id), {
        id,
        courseId: input.courseId,
        batchId: input.batchId,
        instructorId: input.instructorId,
        ...shared,
        createdAt: serverTimestamp(),
      });
    } else {
      await updateDoc(doc(db, 'batches', input.batchId, 'liveSessions', id), shared);
    }
    return id;
  } catch (error) {
    handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, path);
  }
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

export async function submitAssignmentWork(params: {
  assignment: Assignment;
  student: UserProfile;
  submissionUrl: string;
  notes?: string;
}): Promise<string> {
  const id = `${params.student.uid}_${params.assignment.id}`;
  const path = `submissions/${id}`;
  try {
    const ref = doc(db, 'submissions', id);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(
        ref,
        stripUndefined({
          submissionUrl: clampString(params.submissionUrl, LIMITS.URL_MAX),
          notes: clampString(params.notes, 1000),
          status: 'submitted',
          updatedAt: serverTimestamp(),
        })
      );
      return id;
    }
    await setDoc(
      ref,
      stripUndefined({
        id,
        assignmentId: params.assignment.id,
        courseId: params.assignment.courseId,
        batchId: params.assignment.batchId,
        studentId: params.student.uid,
        studentName: clampString(params.student.displayName, LIMITS.NAME_MAX),
        instructorId: params.assignment.instructorId,
        submissionUrl: clampString(params.submissionUrl, LIMITS.URL_MAX),
        notes: clampString(params.notes, 1000),
        status: 'submitted',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function gradeSubmission(params: {
  submissionId: string;
  status: SubmissionStatus;
  score: number;
  feedback: string;
}): Promise<void> {
  const path = `submissions/${params.submissionId}`;
  try {
    await updateDoc(doc(db, 'submissions', params.submissionId), {
      status: params.status,
      score: Math.max(0, Math.min(1000, Number(params.score) || 0)),
      feedback: clampString(params.feedback, 1000),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
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

export async function adminIssueCertificate(params: {
  enrollment: Enrollment;
  actor: UserProfile;
}): Promise<string> {
  const id = `${params.enrollment.studentId}_${params.enrollment.batchId}`;
  const path = `certificates/${id}`;
  const code = `BA-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  try {
    await setDoc(doc(db, 'certificates', id), {
      id,
      certificateCode: code,
      studentId: params.enrollment.studentId,
      studentName: clampString(params.enrollment.studentName, LIMITS.NAME_MAX),
      courseId: params.enrollment.courseId,
      courseTitle: clampString(params.enrollment.courseTitle, LIMITS.TITLE_MAX),
      batchId: params.enrollment.batchId,
      batchName: clampString(params.enrollment.batchName, 120),
      issuedBy: params.actor.uid,
      status: 'issued',
      issuedAt: serverTimestamp(),
    });
    await writeAuditLog({
      actorId: params.actor.uid,
      actorEmail: params.actor.email,
      action: 'ISSUE_CERTIFICATE',
      targetCollection: 'certificates',
      targetId: id,
      summary: `Issued certificate ${code} to ${params.enrollment.studentName} for ${params.enrollment.courseTitle}`,
    });
    return code;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function adminToggleCertificateStatus(params: {
  certificate: Certificate;
  nextStatus: 'issued' | 'revoked';
  actor: UserProfile;
}): Promise<void> {
  const path = `certificates/${params.certificate.id}`;
  try {
    await updateDoc(doc(db, 'certificates', params.certificate.id), {
      status: params.nextStatus,
    });
    await writeAuditLog({
      actorId: params.actor.uid,
      actorEmail: params.actor.email,
      action: 'UPDATE_CERTIFICATE_STATUS',
      targetCollection: 'certificates',
      targetId: params.certificate.id,
      summary: `Changed certificate ${params.certificate.certificateCode} status to ${params.nextStatus}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
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
export async function seedSampleCatalog(actor: UserProfile): Promise<void> {
  try {
    // 1. Settings
    await setDoc(doc(db, 'settings', 'academy'), {
      ...DEFAULT_ACADEMY_SETTINGS,
      updatedAt: serverTimestamp(),
    });

    // 2. Categories
    for (const cat of DEMO_CATEGORIES) {
      await setDoc(doc(db, 'categories', cat.id), {
        ...cat,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    // 3. Instructors
    for (const inst of DEMO_INSTRUCTORS) {
      await setDoc(doc(db, 'instructors', inst.id), {
        ...inst,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    // 4. Courses (must exist before Batches per Firestore rules)
    for (const course of DEMO_COURSES) {
      await setDoc(doc(db, 'courses', course.id), {
        ...course,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    // 5. Batches + Sample Lessons, Live Session, Assignment & Announcement
    for (const batch of DEMO_BATCHES) {
      await setDoc(doc(db, 'batches', batch.id), {
        ...batch,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const lesson1Id = `${batch.id}_lesson_01`;
      const lesson2Id = `${batch.id}_lesson_02`;
      await setDoc(doc(db, 'batches', batch.id, 'lessons', lesson1Id), {
        id: lesson1Id,
        courseId: batch.courseId,
        batchId: batch.id,
        instructorId: batch.instructorId,
        title: 'Orientation & Environment Setup (Sample Lesson)',
        moduleTitle: 'Module 1: Foundations',
        orderIndex: 1,
        contentSummary:
          'Demo orientation session covering cohort expectations, live session rhythm in Nepal Time (NPT), assignment rubric, and essential tools.',
        videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        resourceUrl: 'https://birtaacademy.edu.np/resources/orientation-guide',
        durationMinutes: 45,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'batches', batch.id, 'lessons', lesson2Id), {
        id: lesson2Id,
        courseId: batch.courseId,
        batchId: batch.id,
        instructorId: batch.instructorId,
        title: 'Core Framework & Practical Walkthrough (Sample Lesson)',
        moduleTitle: 'Module 2: Core Workflow',
        orderIndex: 2,
        contentSummary:
          'Hands-on guided workshop illustrating the core skills and workflow required for your first graded cohort milestone.',
        durationMinutes: 60,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const sessionId = `${batch.id}_live_01`;
      await setDoc(doc(db, 'batches', batch.id, 'liveSessions', sessionId), {
        id: sessionId,
        courseId: batch.courseId,
        batchId: batch.id,
        instructorId: batch.instructorId,
        title: 'Week 1 Live Kickoff & Q&A',
        scheduledStart: `${batch.startDate}T19:30`,
        durationMinutes: 90,
        meetingPlatform: 'Google Meet',
        meetingUrl: 'https://meet.google.com/birta-demo-session',
        status: 'scheduled',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const asgnId = `${batch.id}_asgn_01`;
      await setDoc(doc(db, 'batches', batch.id, 'assignments', asgnId), {
        id: asgnId,
        courseId: batch.courseId,
        batchId: batch.id,
        instructorId: batch.instructorId,
        title: 'Milestone 1 Practical Deliverable (Sample)',
        instructions:
          'Apply the Week 1 workflow to a real scenario and submit a shareable link (Google Drive, GitHub, Figma, or Notion) for instructor feedback.',
        dueDate: batch.endDate,
        maxScore: 100,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const annId = `${batch.id}_ann_01`;
      await setDoc(doc(db, 'batches', batch.id, 'announcements', annId), {
        id: annId,
        courseId: batch.courseId,
        batchId: batch.id,
        instructorId: batch.instructorId,
        authorName: batch.instructorName,
        title: 'Welcome to Birta Academy',
        body: 'Welcome to the cohort! Please review Module 1 before our first live session and reach out if you need help with setup.',
        createdAt: serverTimestamp(),
      });
    }

    await writeAuditLog({
      actorId: actor.uid,
      actorEmail: actor.email,
      action: 'SEED_DEMO_CATALOG',
      targetCollection: 'courses',
      targetId: 'demo_seed',
      summary: 'Seeded starter Birta Academy demo categories, instructors, courses, and batches into Firestore',
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'courses');
  }
}
