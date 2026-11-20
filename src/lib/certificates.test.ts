import { describe, expect, it } from 'vitest';
import {
  canResubmit,
  DEFAULT_CERTIFICATE_CRITERIA as criteria,
  evaluateCertificateEligibility,
  isLateSubmission,
  resolveCriteria,
  validateGrade,
} from './certificates';

const base = {
  enrollmentStatus: 'approved',
  paymentStatus: 'verified',
  totalLessons: 10,
  completedLessons: 9,
  assignments: [{ id: 'a1', maxScore: 100 }],
  submissions: [{ assignmentId: 'a1', status: 'graded', score: 80 }],
  criteria,
};

describe('certificate eligibility', () => {
  it('is eligible when everything is met', () => {
    expect(evaluateCertificateEligibility(base)).toMatchObject({ eligible: true, reasons: [], lessonPercent: 90 });
  });

  it('requires a confirmed payment and active enrollment', () => {
    const r = evaluateCertificateEligibility({ ...base, enrollmentStatus: 'pending', paymentStatus: 'pending_verification' });
    expect(r.eligible).toBe(false);
    expect(r.reasons).toEqual(expect.arrayContaining(['ENROLLMENT_NOT_ACTIVE', 'PAYMENT_NOT_CONFIRMED']));
  });

  it('accepts a scholarship waiver as payment', () => {
    expect(evaluateCertificateEligibility({ ...base, paymentStatus: 'waived' }).eligible).toBe(true);
  });

  it('fails on low lesson completion and on batches with no lessons', () => {
    expect(evaluateCertificateEligibility({ ...base, completedLessons: 7 }).reasons).toContain('LESSONS_INCOMPLETE');
    expect(evaluateCertificateEligibility({ ...base, totalLessons: 0, completedLessons: 0 }).eligible).toBe(false);
  });

  it('checks assignments: missing, ungraded, low score', () => {
    expect(evaluateCertificateEligibility({ ...base, submissions: [] }).reasons).toContain('ASSIGNMENT_MISSING');
    expect(evaluateCertificateEligibility({ ...base, submissions: [{ assignmentId: 'a1', status: 'submitted' }] }).reasons).toContain('ASSIGNMENT_NOT_GRADED');
    expect(evaluateCertificateEligibility({ ...base, submissions: [{ assignmentId: 'a1', status: 'graded', score: 20 }] }).reasons).toContain('ASSIGNMENT_SCORE_LOW');
  });

  it('can be configured to ignore assignments', () => {
    expect(evaluateCertificateEligibility({ ...base, submissions: [], criteria: { ...criteria, requireAssignments: false } }).eligible).toBe(true);
  });

  it('falls back to defaults for invalid criteria', () => {
    expect(resolveCriteria({ minLessonPercent: 500 })).toEqual(criteria);
    expect(resolveCriteria({ minLessonPercent: 60 }).minLessonPercent).toBe(60);
  });
});

describe('submissions', () => {
  it('treats date-only due dates as end of day in Nepal time', () => {
    expect(isLateSubmission('2026-12-10', new Date('2026-12-10T18:00:00Z'))).toBe(false); // 23:45 NPT
    expect(isLateSubmission('2026-12-10', new Date('2026-12-10T18:30:00Z'))).toBe(true); // 00:15 NPT next day
  });
  it('allows resubmission only before grading or when revision is requested', () => {
    expect(canResubmit(undefined)).toBe(true);
    expect(canResubmit('needs_revision')).toBe(true);
    expect(canResubmit('graded')).toBe(false);
  });
  it('validates grades against the assignment max score', () => {
    expect(validateGrade({ status: 'graded', score: 90, feedback: 'Good' }, 100).ok).toBe(true);
    expect(validateGrade({ status: 'graded', score: 101 }, 100).ok).toBe(false);
    expect(validateGrade({ status: 'graded', score: -1 }, 100).ok).toBe(false);
    expect(validateGrade({ status: 'done', score: 5 }, 100).ok).toBe(false);
  });
});
