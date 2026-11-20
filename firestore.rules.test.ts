/**
 * Phase 0 Security Test Specification for Birta Academy Firestore Rules.
 * Verifies the "Dirty Dozen" adversarial payloads return PERMISSION_DENIED.
 *
 * Run with Firebase Emulator Suite (`@firebase/rules-unit-testing`) when testing locally.
 */

export interface DirtyDozenTestCase {
  id: number;
  name: string;
  collectionPath: string;
  operation: 'create' | 'update' | 'delete' | 'get' | 'list';
  actor: 'anonymous' | 'student' | 'unverified_admin' | 'admin';
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_CASES: DirtyDozenTestCase[] = [
  {
    id: 1,
    name: 'Self-assigned admin role on signup',
    collectionPath: 'users/student_1',
    operation: 'create',
    actor: 'student',
    payload: {
      uid: 'student_1',
      displayName: 'Attacker',
      email: 'attacker@example.com',
      role: 'admin',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Shadow update escalating role to instructor',
    collectionPath: 'users/student_1',
    operation: 'update',
    actor: 'student',
    payload: { role: 'instructor', ghostField: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Cross-user PII read on users collection',
    collectionPath: 'users/victim_uid',
    operation: 'get',
    actor: 'student',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Student self-approving payment and enrollment',
    collectionPath: 'enrollments/student_1_batch_1',
    operation: 'create',
    actor: 'student',
    payload: {
      id: 'student_1_batch_1',
      studentId: 'student_1',
      paymentStatus: 'verified',
      enrollmentStatus: 'approved',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Enrollment identity spoofing for another student',
    collectionPath: 'enrollments/victim_uid_batch_1',
    operation: 'create',
    actor: 'student',
    payload: {
      id: 'victim_uid_batch_1',
      studentId: 'victim_uid',
      paymentStatus: 'pending_verification',
      enrollmentStatus: 'pending',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Enrollment referencing non-existent batch',
    collectionPath: 'enrollments/student_1_ghost_batch',
    operation: 'create',
    actor: 'student',
    payload: {
      id: 'student_1_ghost_batch',
      studentId: 'student_1',
      batchId: 'ghost_batch',
      paymentStatus: 'pending_verification',
      enrollmentStatus: 'pending',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Pending student scraping live class meeting links',
    collectionPath: 'batches/batch_1/liveSessions/session_1',
    operation: 'get',
    actor: 'student',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Student attempting to publish or edit a course',
    collectionPath: 'courses/course_1',
    operation: 'create',
    actor: 'student',
    payload: { id: 'course_1', title: 'Hijacked Course', priceNpr: 0 },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'ID poisoning with oversized malformed document ID',
    collectionPath: `courses/${'a'.repeat(200)}`,
    operation: 'create',
    actor: 'admin',
    payload: { id: 'a'.repeat(200), title: 'Poison' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Student self-grading their own assignment submission',
    collectionPath: 'submissions/sub_1',
    operation: 'update',
    actor: 'student',
    payload: { status: 'graded', score: 100, feedback: 'Self graded' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Tampering with immutable audit logs even as admin',
    collectionPath: 'auditLogs/log_1',
    operation: 'delete',
    actor: 'admin',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Unverified admin email spoof attempting catalog write',
    collectionPath: 'courses/course_2',
    operation: 'create',
    actor: 'unverified_admin',
    payload: { id: 'course_2', title: 'Spoofed' },
    expected: 'PERMISSION_DENIED',
  },
];
