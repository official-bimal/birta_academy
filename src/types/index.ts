import type { Timestamp } from 'firebase/firestore';

export type UserRole = 'student' | 'instructor' | 'admin';
export type CourseLevel = 'Beginner' | 'Intermediate' | 'Advanced';
export type BatchStatus = 'upcoming' | 'ongoing' | 'completed';
export type PaymentMethod = 'bank_transfer' | 'esewa_manual' | 'khalti_manual';
export type PaymentStatus = 'pending_verification' | 'verified' | 'rejected';
export type EnrollmentStatus = 'pending' | 'approved' | 'rejected' | 'completed';
export type LiveSessionStatus = 'scheduled' | 'live' | 'completed';
export type SubmissionStatus = 'submitted' | 'graded' | 'needs_revision';
export type CertificateStatus = 'issued' | 'revoked';
export type InquiryStatus = 'new' | 'responded' | 'closed';

export type DateValue = Timestamp | string | null | undefined;

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  phone?: string;
  city?: string;
  bio?: string;
  role: UserRole;
  createdAt?: DateValue;
  updatedAt?: DateValue;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  description: string;
  sortOrder: number;
  active: boolean;
  createdAt?: DateValue;
  updatedAt?: DateValue;
}

export interface InstructorProfile {
  id: string;
  userId?: string;
  displayName: string;
  specialty: string;
  bio: string;
  credentialsNote?: string;
  active: boolean;
  isDemo: boolean;
  createdAt?: DateValue;
  updatedAt?: DateValue;
}

export interface Course {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  categoryId: string;
  categoryName: string;
  instructorId: string;
  instructorName: string;
  level: CourseLevel;
  durationWeeks: number;
  priceNpr: number;
  currency: 'NPR';
  thumbnailUrl?: string;
  description: string;
  outcomes: string[];
  syllabus: string[];
  published: boolean;
  featured: boolean;
  isDemo: boolean;
  createdAt?: DateValue;
  updatedAt?: DateValue;
}

export interface Batch {
  id: string;
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
  createdAt?: DateValue;
  updatedAt?: DateValue;
}

export interface Enrollment {
  id: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  courseId: string;
  courseTitle: string;
  batchId: string;
  batchName: string;
  instructorId: string;
  amountNpr: number;
  currency: 'NPR';
  paymentMethod: PaymentMethod;
  paymentReference: string;
  paymentNotes?: string;
  paymentStatus: PaymentStatus;
  enrollmentStatus: EnrollmentStatus;
  reviewedBy?: string;
  reviewNote?: string;
  createdAt?: DateValue;
  updatedAt?: DateValue;
}

export interface Lesson {
  id: string;
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
  createdAt?: DateValue;
  updatedAt?: DateValue;
}

export interface LiveSession {
  id: string;
  courseId: string;
  batchId: string;
  instructorId: string;
  title: string;
  scheduledStart: string;
  durationMinutes: number;
  meetingPlatform: string;
  meetingUrl?: string;
  status: LiveSessionStatus;
  createdAt?: DateValue;
  updatedAt?: DateValue;
}

export interface Assignment {
  id: string;
  courseId: string;
  batchId: string;
  instructorId: string;
  title: string;
  instructions: string;
  dueDate: string;
  maxScore: number;
  createdAt?: DateValue;
  updatedAt?: DateValue;
}

export interface Submission {
  id: string;
  assignmentId: string;
  courseId: string;
  batchId: string;
  studentId: string;
  studentName: string;
  instructorId: string;
  submissionUrl: string;
  notes?: string;
  status: SubmissionStatus;
  score?: number;
  feedback?: string;
  createdAt?: DateValue;
  updatedAt?: DateValue;
}

export interface LessonProgress {
  id: string;
  studentId: string;
  courseId: string;
  batchId: string;
  lessonId: string;
  completed: boolean;
  updatedAt?: DateValue;
}

export interface Certificate {
  id: string;
  certificateCode: string;
  studentId: string;
  studentName: string;
  courseId: string;
  courseTitle: string;
  batchId: string;
  batchName: string;
  issuedBy: string;
  status: CertificateStatus;
  issuedAt?: DateValue;
}

export interface Announcement {
  id: string;
  courseId: string;
  batchId: string;
  instructorId: string;
  authorName: string;
  title: string;
  body: string;
  createdAt?: DateValue;
}

export interface Inquiry {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  phone?: string;
  courseInterest: string;
  message: string;
  status: InquiryStatus;
  createdAt?: DateValue;
}

export interface AuditLog {
  id: string;
  actorId: string;
  actorEmail: string;
  action: string;
  targetCollection: string;
  targetId: string;
  summary: string;
  createdAt?: DateValue;
}

export interface AcademySettings {
  academyName: string;
  supportEmail: string;
  supportPhone?: string;
  location?: string;
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  esewaInstructions?: string;
  khaltiInstructions?: string;
  updatedAt?: DateValue;
}
