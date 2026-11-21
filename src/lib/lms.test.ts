import { describe, expect, it } from 'vitest';
import { validateBatchInput, validateCourseInput, slugify } from './catalog';
import { sanitizeFileName, validateUpload } from './files';
import { validateNoteInput } from './notes';

const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

describe('upload validation', () => {
  it('accepts a real PDF and rejects a renamed executable or wrong magic bytes', () => {
    expect(validateUpload({ name: 'Roadmap Day 1.pdf', mime: 'application/pdf', size: 1000, head: pdf })).toMatchObject({ ok: true, safeName: 'Roadmap-Day-1.pdf', inline: true });
    expect(validateUpload({ name: 'evil.pdf', mime: 'application/pdf', size: 1000, head: new Uint8Array([0x4d, 0x5a, 0, 0]) }).ok).toBe(false);
    expect(validateUpload({ name: 'tool.exe', mime: 'application/x-msdownload', size: 1000, head: new Uint8Array([0x4d, 0x5a]) }).ok).toBe(false);
  });
  it('enforces size, extension and roadmap-must-be-PDF', () => {
    expect(validateUpload({ name: 'a.pdf', mime: 'application/pdf', size: 26 * 1024 * 1024, head: pdf }).ok).toBe(false);
    expect(validateUpload({ name: 'a.pdf', mime: 'application/pdf', size: 0, head: pdf }).ok).toBe(false);
    expect(validateUpload({ name: 'a.txt', mime: 'application/pdf', size: 10, head: pdf }).ok).toBe(false);
    expect(validateUpload({ name: 'deck.pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', size: 10, head: zip, pdfOnly: true }).ok).toBe(false);
    expect(validateUpload({ name: 'deck.pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', size: 10, head: zip })).toMatchObject({ ok: true, inline: false });
  });
  it('sanitises file names (no paths, unicode or odd characters)', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFileName('C:\\x\\My Notes (final)!!.PDF')).toBe('My-Notes-final.pdf');
    expect(sanitizeFileName('....')).toBe('file');
  });
});

describe('class notes validation', () => {
  it('validates and sanitises a note', () => {
    const r = validateNoteInput({ title: 'Day 1 — Intro', date: '2026-12-10', content: 'Hello\u0000 world', status: 'published', links: [{ label: 'Meta', url: 'https://facebook.com/business' }] });
    expect(r).toMatchObject({ ok: true });
    if (r.ok) expect(r.value.content).toBe('Hello world');
  });
  it('rejects empty publishes, bad dates and unsafe links', () => {
    expect(validateNoteInput({ title: 'Day 1', status: 'published', content: '' }).ok).toBe(false);
    expect(validateNoteInput({ title: 'Day 1', date: '10/12/2026', content: 'x' }).ok).toBe(false);
    expect(validateNoteInput({ title: 'Day 1', content: 'x', links: [{ url: 'javascript:alert(1)' }] }).ok).toBe(false);
    expect(validateNoteInput({ title: 'ab', content: 'x' }).ok).toBe(false);
  });
});

describe('course and batch validation', () => {
  const course = { title: 'Digital Marketing', categoryId: 'cat_marketing', categoryName: 'Digital Marketing', level: 'Beginner', durationWeeks: 8, priceNpr: 15000, description: 'Learn practical digital marketing.', outcomes: ['Run a campaign'], syllabus: ['Intro'], status: 'published' };
  it('accepts a complete course, derives a slug', () => {
    expect(validateCourseInput(course)).toMatchObject({ ok: true, value: { slug: 'digital-marketing', priceNpr: 15000 } });
    expect(slugify('AI & Vibe Coding!')).toBe('ai-vibe-coding');
  });
  it('blocks publishing without outcomes/syllabus and rejects bad prices', () => {
    expect(validateCourseInput({ ...course, outcomes: [] }).ok).toBe(false);
    expect(validateCourseInput({ ...course, priceNpr: -1 }).ok).toBe(false);
    expect(validateCourseInput({ ...course, priceNpr: 1.5 }).ok).toBe(false);
    expect(validateCourseInput({ ...course, status: 'draft', outcomes: [], syllabus: [] }).ok).toBe(true);
  });
  const batch = { courseId: 'c1', name: 'Batch 1', startDate: '2027-01-10', endDate: '2027-03-10', seatLimit: 20, instructorId: 'u1', status: 'upcoming' };
  it('validates batches', () => {
    expect(validateBatchInput(batch).ok).toBe(true);
    expect(validateBatchInput({ ...batch, endDate: '2026-01-01' }).ok).toBe(false);
    expect(validateBatchInput({ ...batch, seatLimit: 0 }).ok).toBe(false);
    expect(validateBatchInput({ ...batch, status: 'weird' }).ok).toBe(false);
    expect(validateBatchInput({ ...batch, instructorId: '../x' }).ok).toBe(false);
  });
});
