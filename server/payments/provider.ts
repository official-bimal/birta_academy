/**
 * Payment provider abstraction. Only the manual (bank transfer / eSewa-manual / Khalti-manual) flow is live:
 * a student submits a reference and a Super Admin verifies it (see /api/admin/enrollments/:id/review).
 *
 * To add eSewa or Khalti gateways later, implement PaymentProvider, register it below, and have its
 * verified-callback handler call the same transactional approval used for manual payments. Never grant
 * course access from the browser redirect: only from a server-verified provider callback or lookup call.
 */
export type PaymentMethodId = 'bank_transfer' | 'esewa_manual' | 'khalti_manual' | 'esewa' | 'khalti';

export interface PaymentInitiation {
  enrollmentId: string;
  amountNpr: number;
  /** URL to redirect the student to, for gateway providers */
  redirectUrl?: string;
}

export interface PaymentProvider {
  id: PaymentMethodId;
  kind: 'manual' | 'gateway';
  /** Gateway providers create a payment session; manual providers return null. */
  initiate?(input: { enrollmentId: string; amountNpr: number; returnUrl: string }): Promise<PaymentInitiation>;
  /**
   * Server-side confirmation (callback or lookup API). Must return true only if the provider itself
   * confirms the amount and reference. A screenshot or client message is never proof of payment.
   */
  confirm?(input: { enrollmentId: string; providerReference: string; amountNpr: number }): Promise<boolean>;
}

const manual = (id: PaymentMethodId): PaymentProvider => ({ id, kind: 'manual' });

export const paymentProviders: Record<string, PaymentProvider> = {
  bank_transfer: manual('bank_transfer'),
  esewa_manual: manual('esewa_manual'),
  khalti_manual: manual('khalti_manual'),
  // esewa: { id: 'esewa', kind: 'gateway', initiate, confirm }   <- future
  // khalti: { id: 'khalti', kind: 'gateway', initiate, confirm } <- future
};
