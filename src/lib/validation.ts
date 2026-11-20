import type { Timestamp } from 'firebase/firestore';
import type { DateValue } from '../types';

/**
 * Validation constants mirrored verbatim from firebase-blueprint.json and firestore.rules
 * so client mutations always respect schema boundaries before hitting Firestore.
 */
export const PATTERNS = {
  ID: /^[a-zA-Z0-9_-]+$/,
  SLUG: /^[a-z0-9-]+$/,
  CERT_CODE: /^[A-Z0-9-]+$/,
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
} as const;

export const LIMITS = {
  ID_MAX: 128,
  SLUG_MAX: 100,
  NAME_MAX: 100,
  EMAIL_MAX: 200,
  PHONE_MAX: 30,
  CITY_MAX: 80,
  BIO_MAX: 500,
  INSTRUCTOR_BIO_MAX: 800,
  TITLE_MAX: 140,
  SUBTITLE_MAX: 220,
  SHORT_DESC_MAX: 300,
  LONG_DESC_MAX: 2000,
  URL_MAX: 400,
  PAYMENT_REF_MAX: 120,
  NOTES_MAX: 500,
  OUTCOMES_MAX_ITEMS: 10,
  SYLLABUS_MAX_ITEMS: 15,
  ITEM_STR_MAX: 200,
} as const;

export function clampString(value: string | undefined | null, maxLen: number): string {
  if (!value) return '';
  return value.trim().slice(0, maxLen);
}

export function toSlug(input: string): string {
  const cleaned = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, LIMITS.SLUG_MAX);
  return cleaned.length >= 2 ? cleaned : `item-${Date.now().toString(36)}`;
}

export function makeSafeId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 8);
  const stamp = Date.now().toString(36);
  const safePrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || 'doc';
  return `${safePrefix}_${stamp}_${random}`.slice(0, LIMITS.ID_MAX);
}

export function formatNpr(amount: number): string {
  return `NPR ${new Intl.NumberFormat('en-NP', {
    maximumFractionDigits: 0,
  }).format(Math.max(0, Math.round(amount)))}`;
}

export function formatDateValue(value: DateValue): string {
  if (!value) return '—';
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    }
    return value;
  }
  if (typeof value === 'object' && 'toDate' in value && typeof (value as Timestamp).toDate === 'function') {
    return (value as Timestamp).toDate().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }
  return '—';
}

export function formatDateTimeValue(value: DateValue): string {
  if (!value) return '—';
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    return value;
  }
  if (typeof value === 'object' && 'toDate' in value && typeof (value as Timestamp).toDate === 'function') {
    return (value as Timestamp).toDate().toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return '—';
}

export function sanitizeStringList(raw: string, maxItems: number): string[] {
  return raw
    .split('\n')
    .map((line) => line.trim().slice(0, LIMITS.ITEM_STR_MAX))
    .filter(Boolean)
    .slice(0, maxItems);
}

export function paymentMethodLabel(method: string): string {
  switch (method) {
    case 'bank_transfer':
      return 'Bank Transfer (Manual Verification)';
    case 'esewa_manual':
      return 'eSewa Transfer (Manual Verification)';
    case 'khalti_manual':
      return 'Khalti Transfer (Manual Verification)';
    default:
      return method;
  }
}
