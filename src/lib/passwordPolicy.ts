/**
 * Password policy for student email/password accounts. Enforced in the UI for fast feedback; Firebase also
 * enforces its own minimum, and the server never sees or stores passwords (Firebase hashes them).
 */
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

const COMMON = ['password', 'passw0rd', 'qwerty', 'letmein', 'welcome', 'birta', 'academy', '12345678', 'iloveyou', 'admin123'];

export interface PasswordCheck {
  ok: boolean;
  issues: string[];
  /** 0 (very weak) – 4 (strong) */
  score: number;
}

export function checkPassword(password: string, context: { email?: string; name?: string } = {}): PasswordCheck {
  const issues: string[] = [];
  if (password.length < PASSWORD_MIN) issues.push(`Use at least ${PASSWORD_MIN} characters.`);
  if (password.length > PASSWORD_MAX) issues.push(`Use at most ${PASSWORD_MAX} characters.`);
  if (!/[a-z]/.test(password)) issues.push('Add a lowercase letter.');
  if (!/[A-Z]/.test(password)) issues.push('Add an uppercase letter.');
  if (!/[0-9]/.test(password)) issues.push('Add a number.');
  if (!/[^A-Za-z0-9]/.test(password)) issues.push('Add a symbol (for example ! ? # %).');

  const lower = password.toLowerCase();
  const local = (context.email ?? '').split('@')[0].toLowerCase();
  if (local.length >= 4 && lower.includes(local)) issues.push('Do not include your email name in the password.');
  const first = (context.name ?? '').trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  if (first.length >= 4 && lower.includes(first)) issues.push('Do not include your name in the password.');
  if (COMMON.some((c) => lower.includes(c))) issues.push('Avoid common words such as "password".');
  if (/(.)\1{3,}/.test(password)) issues.push('Avoid long runs of the same character.');

  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
  let score = 0;
  if (password.length >= PASSWORD_MIN) score += 1;
  if (password.length >= 14) score += 1;
  if (classes >= 3) score += 1;
  if (classes === 4 && issues.length === 0) score += 1;
  if (issues.length > 0) score = Math.min(score, 2);
  return { ok: issues.length === 0, issues, score };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const isValidEmail = (email: string) => email.length <= 200 && EMAIL_RE.test(email.trim());

/** Optional phone: digits with an optional leading +, spaces/dashes/brackets allowed. */
export const isValidPhone = (phone: string) => phone.trim() === '' || /^\+?[0-9 ()-]{7,20}$/.test(phone.trim());
