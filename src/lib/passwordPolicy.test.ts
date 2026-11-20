import { describe, expect, it } from 'vitest';
import { describeFirebaseAuthError } from './authErrors';
import { checkPassword, isValidEmail, isValidPhone } from './passwordPolicy';

describe('checkPassword', () => {
  it('accepts a strong password', () => {
    expect(checkPassword('Tr1cky-Lantern-92!', { email: 'asha@example.com', name: 'Asha Rai' })).toMatchObject({ ok: true, score: 4 });
  });
  it.each(['short1!A', 'alllowercase123!', 'ALLUPPERCASE123!', 'NoNumbersHere!!', 'NoSymbols12345A'])('rejects %s', (pw) => {
    expect(checkPassword(pw).ok).toBe(false);
  });
  it('rejects passwords containing the email name, first name or common words', () => {
    expect(checkPassword('AshaRai#2026xx', { email: 'asharai@example.com' }).ok).toBe(false);
    expect(checkPassword('Bimal-Lives-77!', { name: 'Bimal Bhandari' }).ok).toBe(false);
    expect(checkPassword('Password-2026!x').ok).toBe(false);
  });
  it('rejects long repeated runs', () => {
    expect(checkPassword('Aaaaa-1234-Zzzz!').ok).toBe(false);
  });
});

describe('field validators', () => {
  it('validates email and optional phone', () => {
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('nope')).toBe(false);
    expect(isValidPhone('')).toBe(true);
    expect(isValidPhone('+977 9800000000')).toBe(true);
    expect(isValidPhone('abc')).toBe(false);
  });
});

describe('describeFirebaseAuthError (no account enumeration)', () => {
  it('uses the same message for wrong password and unknown email at login', () => {
    const a = describeFirebaseAuthError('auth/wrong-password', 'login');
    expect(describeFirebaseAuthError('auth/user-not-found', 'login')).toBe(a);
    expect(describeFirebaseAuthError('auth/invalid-credential', 'login')).toBe(a);
  });
  it('does not say whether an email is registered during signup', () => {
    const m = describeFirebaseAuthError('auth/email-already-in-use', 'register');
    expect(m).not.toMatch(/already (registered|exists|in use)/i);
  });
  it('explains linking conflicts without merging', () => {
    expect(describeFirebaseAuthError('auth/credential-already-in-use', 'link')).toMatch(/cannot be linked/);
  });
  it('stays silent when the user closes the popup', () => {
    expect(describeFirebaseAuthError('auth/popup-closed-by-user', 'login')).toBe('');
  });
});
