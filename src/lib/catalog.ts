/** Validation for Super Admin course and batch management (enforced by the server, reused by the admin forms). */
const ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LEVELS = ['Beginner', 'Intermediate', 'Advanced'] as const;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

export const COURSE_STATUSES = ['draft', 'published', 'archived'] as const;
export const BATCH_STATUSES = ['draft', 'upcoming', 'ongoing', 'completed', 'archived'] as const;
export type CourseStatus = (typeof COURSE_STATUSES)[number];
export type BatchEditStatus = (typeof BATCH_STATUSES)[number];

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(CONTROL, '').trim().slice(0, max) : '');
const list = (v: unknown, maxItems: number, maxLen: number) =>
  Array.isArray(v) ? v.map((x) => text(x, maxLen)).filter(Boolean).slice(0, maxItems) : [];

export interface CourseInput {
  id?: string;
  slug: string;
  title: string;
  subtitle: string;
  categoryId: string;
  categoryName: string;
  level: (typeof LEVELS)[number];
  durationWeeks: number;
  priceNpr: number;
  description: string;
  outcomes: string[];
  syllabus: string[];
  status: CourseStatus;
  featured: boolean;
  isDemo: boolean;
}

export function validateCourseInput(body: unknown): { ok: true; value: CourseInput } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid request.' };
  const b = body as Record<string, unknown>;
  const title = text(b.title, 120);
  if (title.length < 3) return { ok: false, error: 'Title must be at least 3 characters.' };
  const slug = slugify(typeof b.slug === 'string' && b.slug.trim() ? b.slug : title);
  if (slug.length < 2) return { ok: false, error: 'Could not build a web address from the title.' };
  const level = b.level as CourseInput['level'];
  if (!LEVELS.includes(level)) return { ok: false, error: 'Choose a level.' };
  const durationWeeks = Number(b.durationWeeks);
  if (!Number.isInteger(durationWeeks) || durationWeeks < 1 || durationWeeks > 52) return { ok: false, error: 'Duration must be 1–52 weeks.' };
  const priceNpr = Number(b.priceNpr);
  if (!Number.isInteger(priceNpr) || priceNpr < 0 || priceNpr > 500000) return { ok: false, error: 'Price must be a whole number of NPR between 0 and 500,000.' };
  const description = text(b.description, 2000);
  if (description.length < 10) return { ok: false, error: 'Add a description (at least 10 characters).' };
  const categoryId = typeof b.categoryId === 'string' && ID_RE.test(b.categoryId) ? b.categoryId : '';
  if (!categoryId) return { ok: false, error: 'Choose a category.' };
  const status = (b.status ?? 'draft') as CourseStatus;
  if (!COURSE_STATUSES.includes(status)) return { ok: false, error: 'Invalid status.' };
  const id = typeof b.id === 'string' && b.id ? b.id : undefined;
  if (id && !ID_RE.test(id)) return { ok: false, error: 'Invalid course.' };
  const outcomes = list(b.outcomes, 12, 160);
  const syllabus = list(b.syllabus, 30, 160);
  if (status === 'published' && (outcomes.length === 0 || syllabus.length === 0)) {
    return { ok: false, error: 'Add at least one learning outcome and one syllabus module before publishing.' };
  }
  return {
    ok: true,
    value: {
      id, slug, title, subtitle: text(b.subtitle, 200), categoryId, categoryName: text(b.categoryName, 80) || categoryId,
      level, durationWeeks, priceNpr, description, outcomes, syllabus, status, featured: b.featured === true, isDemo: b.isDemo === true,
    },
  };
}

export interface BatchInput {
  id?: string;
  courseId: string;
  name: string;
  startDate: string;
  endDate: string;
  scheduleText: string;
  timezone: string;
  seatLimit: number;
  priceNpr?: number;
  instructorId: string;
  status: BatchEditStatus;
  isDemo: boolean;
}

export function validateBatchInput(body: unknown): { ok: true; value: BatchInput } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid request.' };
  const b = body as Record<string, unknown>;
  const courseId = typeof b.courseId === 'string' && ID_RE.test(b.courseId) ? b.courseId : '';
  if (!courseId) return { ok: false, error: 'Choose a course.' };
  const name = text(b.name, 120);
  if (name.length < 3) return { ok: false, error: 'Batch name must be at least 3 characters.' };
  const startDate = text(b.startDate, 10);
  const endDate = text(b.endDate, 10);
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) return { ok: false, error: 'Enter valid start and end dates.' };
  if (endDate < startDate) return { ok: false, error: 'The end date cannot be before the start date.' };
  const seatLimit = Number(b.seatLimit);
  if (!Number.isInteger(seatLimit) || seatLimit < 1 || seatLimit > 500) return { ok: false, error: 'Capacity must be 1–500 seats.' };
  let priceNpr: number | undefined;
  if (b.priceNpr !== undefined && b.priceNpr !== '' && b.priceNpr !== null) {
    priceNpr = Number(b.priceNpr);
    if (!Number.isInteger(priceNpr) || priceNpr < 0 || priceNpr > 500000) return { ok: false, error: 'Price must be a whole number of NPR.' };
  }
  const instructorId = typeof b.instructorId === 'string' ? b.instructorId.trim() : '';
  if (instructorId && !ID_RE.test(instructorId)) return { ok: false, error: 'Invalid instructor.' };
  const status = (b.status ?? 'draft') as BatchEditStatus;
  if (!BATCH_STATUSES.includes(status)) return { ok: false, error: 'Invalid status.' };
  const id = typeof b.id === 'string' && b.id ? b.id : undefined;
  if (id && !ID_RE.test(id)) return { ok: false, error: 'Invalid batch.' };
  return {
    ok: true,
    value: { id, courseId, name, startDate, endDate, scheduleText: text(b.scheduleText, 120), timezone: text(b.timezone, 40) || 'NPT (UTC+5:45)', seatLimit, priceNpr, instructorId, status, isDemo: b.isDemo === true },
  };
}
