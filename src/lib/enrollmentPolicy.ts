/**
 * Pure enrollment / payment rules, shared by the trusted server and the admin UI.
 * Access to a paid batch is granted only by `approved`/`completed` enrollments, which can only be reached
 * through a verified payment or an explicit admin waiver (scholarship).
 */
import type { EnrollmentStatus, PaymentMethod, PaymentStatus } from '../types';

export type ReviewDecision = 'approve' | 'waive' | 'reject' | 'complete';

export type ReviewPlan =
  | { kind: 'noop' }
  | { kind: 'update'; paymentStatus: PaymentStatus; enrollmentStatus: EnrollmentStatus }
  | { kind: 'error'; code: 'INVALID_TRANSITION' | 'BATCH_FULL' };

export function planEnrollmentReview(input: {
  enrollmentStatus: EnrollmentStatus;
  paymentStatus: PaymentStatus;
  decision: ReviewDecision;
  /** approved + completed enrollments in the batch, excluding this one */
  occupiedSeats: number;
  seatLimit: number;
}): ReviewPlan {
  const { enrollmentStatus: status, decision } = input;

  switch (decision) {
    case 'approve':
    case 'waive': {
      const payment: PaymentStatus = decision === 'approve' ? 'verified' : 'waived';
      if (status === 'approved' || status === 'completed') {
        // Idempotent: repeating an approval never double-counts or double-logs.
        return input.paymentStatus === payment ? { kind: 'noop' } : { kind: 'error', code: 'INVALID_TRANSITION' };
      }
      if (status !== 'pending') return { kind: 'error', code: 'INVALID_TRANSITION' };
      if (input.occupiedSeats >= input.seatLimit) return { kind: 'error', code: 'BATCH_FULL' };
      return { kind: 'update', paymentStatus: payment, enrollmentStatus: 'approved' };
    }
    case 'reject':
      if (status === 'rejected') return { kind: 'noop' };
      if (status === 'completed') return { kind: 'error', code: 'INVALID_TRANSITION' };
      return { kind: 'update', paymentStatus: 'rejected', enrollmentStatus: 'rejected' };
    case 'complete':
      if (status === 'completed') return { kind: 'noop' };
      if (status !== 'approved') return { kind: 'error', code: 'INVALID_TRANSITION' };
      return { kind: 'update', paymentStatus: input.paymentStatus, enrollmentStatus: 'completed' };
  }
}

/** Which decisions the admin UI should offer for an enrollment in a given state. */
export function allowedDecisions(status: EnrollmentStatus): ReviewDecision[] {
  switch (status) {
    case 'pending':
      return ['approve', 'waive', 'reject'];
    case 'approved':
      return ['complete', 'reject'];
    default:
      return [];
  }
}

const PAYMENT_METHODS: PaymentMethod[] = ['bank_transfer', 'esewa_manual', 'khalti_manual'];

export function validateEnrollmentSubmission(body: unknown):
  | { ok: true; batchId: string; paymentMethod: PaymentMethod; paymentReference: string; paymentNotes: string }
  | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid request.' };
  const b = body as Record<string, unknown>;
  if (typeof b.batchId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(b.batchId)) {
    return { ok: false, error: 'Choose a batch.' };
  }
  if (typeof b.paymentMethod !== 'string' || !PAYMENT_METHODS.includes(b.paymentMethod as PaymentMethod)) {
    return { ok: false, error: 'Choose a payment method.' };
  }
  const ref = typeof b.paymentReference === 'string' ? b.paymentReference.trim() : '';
  if (ref.length < 3 || ref.length > 80) return { ok: false, error: 'Enter your payment reference (3–80 characters).' };
  const notes = typeof b.paymentNotes === 'string' ? b.paymentNotes.trim() : '';
  if (notes.length > 500) return { ok: false, error: 'Notes are limited to 500 characters.' };
  return {
    ok: true,
    batchId: b.batchId,
    paymentMethod: b.paymentMethod as PaymentMethod,
    paymentReference: ref,
    paymentNotes: notes,
  };
}

const REVIEW_DECISIONS: ReviewDecision[] = ['approve', 'waive', 'reject', 'complete'];
export function isReviewDecision(value: unknown): value is ReviewDecision {
  return typeof value === 'string' && (REVIEW_DECISIONS as string[]).includes(value);
}
