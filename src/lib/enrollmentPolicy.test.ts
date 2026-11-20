import { describe, expect, it } from 'vitest';
import { allowedDecisions, planEnrollmentReview, validateEnrollmentSubmission } from './enrollmentPolicy';

const base = { paymentStatus: 'pending_verification' as const, occupiedSeats: 0, seatLimit: 2 };

describe('planEnrollmentReview', () => {
  it('approval verifies payment and grants access', () => {
    expect(planEnrollmentReview({ ...base, enrollmentStatus: 'pending', decision: 'approve' })).toEqual({
      kind: 'update',
      paymentStatus: 'verified',
      enrollmentStatus: 'approved',
    });
  });

  it('scholarship waiver is explicit and distinct from a verified payment', () => {
    expect(planEnrollmentReview({ ...base, enrollmentStatus: 'pending', decision: 'waive' })).toMatchObject({
      paymentStatus: 'waived',
      enrollmentStatus: 'approved',
    });
  });

  it('repeating an approval is a no-op (idempotent)', () => {
    expect(
      planEnrollmentReview({ ...base, paymentStatus: 'verified', enrollmentStatus: 'approved', decision: 'approve' })
    ).toEqual({ kind: 'noop' });
  });

  it('blocks approval when the batch is full', () => {
    expect(
      planEnrollmentReview({ ...base, occupiedSeats: 2, enrollmentStatus: 'pending', decision: 'approve' })
    ).toEqual({ kind: 'error', code: 'BATCH_FULL' });
  });

  it('allows the last seat but not one more', () => {
    expect(planEnrollmentReview({ ...base, occupiedSeats: 1, enrollmentStatus: 'pending', decision: 'approve' }).kind).toBe('update');
  });

  it('cannot complete a pending enrollment or approve a rejected one', () => {
    expect(planEnrollmentReview({ ...base, enrollmentStatus: 'pending', decision: 'complete' })).toEqual({
      kind: 'error',
      code: 'INVALID_TRANSITION',
    });
    expect(planEnrollmentReview({ ...base, enrollmentStatus: 'rejected', decision: 'approve' })).toEqual({
      kind: 'error',
      code: 'INVALID_TRANSITION',
    });
  });

  it('cannot reject a completed enrollment', () => {
    expect(planEnrollmentReview({ ...base, paymentStatus: 'verified', enrollmentStatus: 'completed', decision: 'reject' }).kind).toBe('error');
  });

  it('offers only valid decisions per state', () => {
    expect(allowedDecisions('pending')).toEqual(['approve', 'waive', 'reject']);
    expect(allowedDecisions('approved')).toEqual(['complete', 'reject']);
    expect(allowedDecisions('completed')).toEqual([]);
  });
});

describe('validateEnrollmentSubmission', () => {
  const ok = { batchId: 'batch_1', paymentMethod: 'bank_transfer', paymentReference: 'TXN12345' };

  it('accepts a valid submission and ignores client-supplied price fields', () => {
    const r = validateEnrollmentSubmission({ ...ok, amountNpr: 1, instructorId: 'x' });
    expect(r).toMatchObject({ ok: true, batchId: 'batch_1' });
    expect(r).not.toHaveProperty('amountNpr');
  });

  it('rejects bad batch ids, methods and references', () => {
    expect(validateEnrollmentSubmission({ ...ok, batchId: '../x' }).ok).toBe(false);
    expect(validateEnrollmentSubmission({ ...ok, paymentMethod: 'cash' }).ok).toBe(false);
    expect(validateEnrollmentSubmission({ ...ok, paymentReference: 'ab' }).ok).toBe(false);
    expect(validateEnrollmentSubmission(null).ok).toBe(false);
  });
});
