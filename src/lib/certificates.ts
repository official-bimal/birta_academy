/**
 * Certificate eligibility and assignment rules, shared by the server and UI.
 * A certificate is issued only after the server verifies all of these conditions.
 */
export interface CertificateCriteria {
  /** minimum % of the batch's lessons marked complete (default 80) */
  minLessonPercent: number;
  /** every assignment must be graded (default true) */
  requireAssignments: boolean;
  /** minimum score % on each graded assignment (default 50) */
  minAssignmentPercent: number;
}

export const DEFAULT_CERTIFICATE_CRITERIA: CertificateCriteria = {
  minLessonPercent: 80,
  requireAssignments: true,
  minAssignmentPercent: 50,
};

export function resolveCriteria(raw: Partial<CertificateCriteria> | undefined): CertificateCriteria {
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100 ? v : d);
  return {
    minLessonPercent: num(raw?.minLessonPercent, DEFAULT_CERTIFICATE_CRITERIA.minLessonPercent),
    requireAssignments: typeof raw?.requireAssignments === 'boolean' ? raw.requireAssignments : DEFAULT_CERTIFICATE_CRITERIA.requireAssignments,
    minAssignmentPercent: num(raw?.minAssignmentPercent, DEFAULT_CERTIFICATE_CRITERIA.minAssignmentPercent),
  };
}

export type EligibilityReason =
  | 'ENROLLMENT_NOT_ACTIVE'
  | 'PAYMENT_NOT_CONFIRMED'
  | 'LESSONS_INCOMPLETE'
  | 'ASSIGNMENT_MISSING'
  | 'ASSIGNMENT_NOT_GRADED'
  | 'ASSIGNMENT_SCORE_LOW';

export interface EligibilityResult {
  eligible: boolean;
  reasons: EligibilityReason[];
  lessonPercent: number;
}

export function percent(done: number, total: number): number {
  return total <= 0 ? 0 : Math.round((done / total) * 100);
}

export function evaluateCertificateEligibility(input: {
  enrollmentStatus: string;
  paymentStatus: string;
  totalLessons: number;
  completedLessons: number;
  assignments: { id: string; maxScore: number }[];
  submissions: { assignmentId: string; status: string; score?: number }[];
  criteria: CertificateCriteria;
}): EligibilityResult {
  const reasons = new Set<EligibilityReason>();
  if (!['approved', 'completed'].includes(input.enrollmentStatus)) reasons.add('ENROLLMENT_NOT_ACTIVE');
  if (!['verified', 'waived'].includes(input.paymentStatus)) reasons.add('PAYMENT_NOT_CONFIRMED');

  const lessonPercent = percent(input.completedLessons, input.totalLessons);
  if (input.totalLessons === 0 || lessonPercent < input.criteria.minLessonPercent) reasons.add('LESSONS_INCOMPLETE');

  if (input.criteria.requireAssignments) {
    for (const a of input.assignments) {
      const sub = input.submissions.find((s) => s.assignmentId === a.id);
      if (!sub) {
        reasons.add('ASSIGNMENT_MISSING');
      } else if (sub.status !== 'graded') {
        reasons.add('ASSIGNMENT_NOT_GRADED');
      } else if (percent(sub.score ?? 0, a.maxScore) < input.criteria.minAssignmentPercent) {
        reasons.add('ASSIGNMENT_SCORE_LOW');
      }
    }
  }
  return { eligible: reasons.size === 0, reasons: [...reasons], lessonPercent };
}

export const REASON_TEXT: Record<EligibilityReason, string> = {
  ENROLLMENT_NOT_ACTIVE: 'Enrollment is not approved.',
  PAYMENT_NOT_CONFIRMED: 'Payment is not verified or waived.',
  LESSONS_INCOMPLETE: 'Required lesson completion not reached.',
  ASSIGNMENT_MISSING: 'An assignment has not been submitted.',
  ASSIGNMENT_NOT_GRADED: 'An assignment has not been graded yet.',
  ASSIGNMENT_SCORE_LOW: 'An assignment score is below the pass mark.',
};

// ---------------------------------------------------------------------------
// Assignment submissions
// ---------------------------------------------------------------------------
/** Date-only due dates close at the end of that day in Nepal time. */
export function isLateSubmission(dueDate: string, now: Date): boolean {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    const end = Date.parse(`${dueDate}T23:59:59+05:45`);
    return !Number.isNaN(end) && now.getTime() > end;
  }
  const t = Date.parse(dueDate);
  return !Number.isNaN(t) && now.getTime() > t;
}

export function canResubmit(status: string | undefined): boolean {
  return status === undefined || status === 'submitted' || status === 'needs_revision';
}

export function validateGrade(body: unknown, maxScore: number):
  | { ok: true; status: 'graded' | 'needs_revision'; score: number; feedback: string }
  | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (b.status !== 'graded' && b.status !== 'needs_revision') return { ok: false, error: 'Choose graded or needs revision.' };
  const score = Number(b.score);
  if (!Number.isFinite(score) || score < 0 || score > maxScore) {
    return { ok: false, error: `Score must be between 0 and ${maxScore}.` };
  }
  const feedback = typeof b.feedback === 'string' ? b.feedback.trim() : '';
  if (feedback.length > 1000) return { ok: false, error: 'Feedback is limited to 1000 characters.' };
  return { ok: true, status: b.status, score, feedback };
}
