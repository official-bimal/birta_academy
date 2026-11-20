import { describe, expect, it } from 'vitest';
import {
  canJoin,
  countdownLabel,
  nptToUtcIso,
  parseMeetUrl,
  safeHttpUrl,
  sessionPhase,
  validateAttendance,
  validateSessionInput,
} from './sessions';

describe('nptToUtcIso', () => {
  it('converts Kathmandu time (UTC+5:45) to UTC', () => {
    expect(nptToUtcIso('2026-12-10', '19:30')).toBe('2026-12-10T13:45:00.000Z');
    expect(nptToUtcIso('2026-12-10', '03:00')).toBe('2026-12-09T21:15:00.000Z');
  });
  it('rejects impossible dates and times', () => {
    expect(nptToUtcIso('2026-02-31', '10:00')).toBeNull();
    expect(nptToUtcIso('2026-12-10', '25:00')).toBeNull();
    expect(nptToUtcIso('10/12/2026', '10:00')).toBeNull();
  });
});

describe('parseMeetUrl', () => {
  it('accepts real Meet links and normalises them', () => {
    expect(parseMeetUrl('https://meet.google.com/abc-defg-hij')).toBe('https://meet.google.com/abc-defg-hij');
    expect(parseMeetUrl('  https://meet.google.com/abc-defg-hij?authuser=1#x ')).toBe('https://meet.google.com/abc-defg-hij');
    expect(parseMeetUrl('https://meet.google.com/lookup/abcd1234')).toBe('https://meet.google.com/lookup/abcd1234');
  });
  it.each([
    'http://meet.google.com/abc-defg-hij',
    'https://meet.google.com.evil.com/abc-defg-hij',
    'https://evil.com/meet.google.com/abc-defg-hij',
    'https://user@meet.google.com/abc-defg-hij',
    'https://meet.google.com/',
    'https://meet.google.com/abcd-efgh-ijk',
    'javascript:alert(1)',
    'https://zoom.us/j/123456789',
    '',
  ])('rejects %s', (u) => {
    expect(parseMeetUrl(u)).toBeNull();
  });
  it('rejects non-strings', () => {
    expect(parseMeetUrl(null)).toBeNull();
  });
});

describe('safeHttpUrl', () => {
  it('allows http(s) only', () => {
    expect(safeHttpUrl('https://example.com/a')).toBe('https://example.com/a');
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpUrl('data:text/html,hi')).toBeNull();
  });
});

describe('session phase and join window', () => {
  const start = '2026-12-10T13:45:00.000Z';
  const at = (iso: string, extra = {}) =>
    sessionPhase({ now: new Date(iso), scheduledStart: start, durationMinutes: 60, status: 'scheduled', joinWindowMinutes: 15, ...extra });

  it('is upcoming before the join window opens', () => {
    expect(at('2026-12-10T13:29:00.000Z')).toBe('upcoming');
    expect(canJoin(at('2026-12-10T13:29:00.000Z'))).toBe(false);
  });
  it('opens exactly at start minus the configured window', () => {
    expect(at('2026-12-10T13:30:00.000Z')).toBe('joinable');
    expect(at('2026-12-10T13:00:00.000Z', { joinWindowMinutes: 45 })).toBe('joinable');
  });
  it('is live during the class and ended afterwards', () => {
    expect(at('2026-12-10T14:00:00.000Z')).toBe('live');
    expect(canJoin(at('2026-12-10T14:00:00.000Z'))).toBe(true);
    expect(at('2026-12-10T14:45:00.000Z')).toBe('ended');
    expect(canJoin(at('2026-12-10T14:45:00.000Z'))).toBe(false);
  });
  it('respects instructor-set cancelled and completed status', () => {
    expect(at('2026-12-10T13:50:00.000Z', { status: 'cancelled' })).toBe('cancelled');
    expect(at('2026-12-10T13:50:00.000Z', { status: 'completed' })).toBe('completed');
  });
  it('labels countdowns', () => {
    expect(countdownLabel(new Date('2026-12-10T13:00:00.000Z'), start)).toBe('Starts in 45 min');
    expect(countdownLabel(new Date('2026-12-10T14:00:00.000Z'), start)).toBe('');
  });
});

describe('validateSessionInput', () => {
  const ok = { batchId: 'b1', title: 'Week 2 Live', date: '2026-12-10', time: '19:30', durationMinutes: 90, meetingUrl: 'https://meet.google.com/abc-defg-hij' };
  it('builds a UTC start and normalised link', () => {
    expect(validateSessionInput(ok)).toMatchObject({ ok: true, scheduledStart: '2026-12-10T13:45:00.000Z' });
  });
  it('rejects non-Meet links and bad durations', () => {
    expect(validateSessionInput({ ...ok, meetingUrl: 'https://zoom.us/j/1' }).ok).toBe(false);
    expect(validateSessionInput({ ...ok, durationMinutes: 5 }).ok).toBe(false);
  });
});

describe('validateAttendance', () => {
  it('accepts valid records and rejects duplicates or bad statuses', () => {
    expect(validateAttendance({ records: [{ studentId: 'a', status: 'present' }] }).ok).toBe(true);
    expect(validateAttendance({ records: [{ studentId: 'a', status: 'present' }, { studentId: 'a', status: 'late' }] }).ok).toBe(false);
    expect(validateAttendance({ records: [{ studentId: 'a', status: 'maybe' }] }).ok).toBe(false);
    expect(validateAttendance({ records: [] }).ok).toBe(false);
  });
});
