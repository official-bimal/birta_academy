/**
 * Course-to-classroom workflow, end to end, against the REAL Firebase dev project and the LOCAL API.
 *   npm run dev:all   (with RATE_LIMIT_SENSITIVE/RATE_LIMIT_INIT raised for the run)
 *   npm run test:lms
 *
 * Uses only clearly labelled test data ("[TEST] ... dev only", isDemo=true) and synthetic users (@birta-e2e.test).
 * No real payments. Never prints tokens or passwords. Private files go to .data/private-files (git-ignored).
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { signInWithCustomToken, signOut } from 'firebase/auth';
import { adminApp, adminDb } from '../server/firebaseAdmin.ts';

for (const ev of ['uncaughtException', 'unhandledRejection'] as const) {
  process.on(ev, (e) => {
    console.error('FATAL:', String((e as Error)?.message ?? e).split('\n')[0].slice(0, 200));
    process.exit(2);
  });
}
const API = process.env.E2E_API || 'http://localhost:8787';
const realFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = ((input: any, init?: any) => (typeof input === 'string' && input.startsWith('/api') ? realFetch(API + input, init) : realFetch(input, init))) as typeof fetch;

const { auth } = await import('../src/lib/firebase.ts');
const lms = await import('../src/lib/lmsApi.ts');
const svc = await import('../src/lib/firestoreService.ts');
const adminAuth = getAuth(adminApp);
const DOM = 'birta-e2e.test';
const SLUG = 'e2e-digital-marketing-dev';

type Result = { id: string; title: string; status: 'PASS' | 'FAIL' | 'BLOCKED'; note?: string };
const results: Result[] = [];
const expect: (c: unknown, m: string) => asserts c = (c, m) => {
  if (!c) throw new Error(m);
};
async function step(id: string, title: string, fn: () => Promise<string | void>) {
  try {
    const note = await fn();
    results.push({ id, title, status: 'PASS', note: note || undefined });
  } catch (e) {
    results.push({ id, title, status: 'FAIL', note: (e as Error).message.split('\n')[0].slice(0, 230) });
  }
}
const isPerm = (e: any) => /permission|insufficient/i.test(String(e?.message ?? ''));
async function rejects(fn: () => Promise<unknown>, test: (e: any) => boolean, what: string) {
  try {
    await fn();
  } catch (e) {
    if (test(e)) return;
    throw new Error(`${what}: unexpected error ${(e as Error).message.split('\n')[0].slice(0, 100)}`);
  }
  throw new Error(`${what}: was allowed but must be rejected`);
}

// ---- users ---------------------------------------------------------------
const U = { admin: 'e2e_lms_admin', ia: 'e2e_lms_inst_a', ib: 'e2e_lms_inst_b', s1: 'e2e_lms_s1', s2: 'e2e_lms_s2', s3: 'e2e_lms_s3' } as const;
async function ensureUser(uid: string, role: 'SUPER_ADMIN' | 'INSTRUCTOR' | 'STUDENT', name: string) {
  const email = `${uid.replace(/_/g, '-')}@${DOM}`;
  try {
    await adminAuth.getUser(uid);
    await adminAuth.updateUser(uid, { email, displayName: `[TEST] ${name}`, emailVerified: true, disabled: false });
  } catch {
    await adminAuth.createUser({ uid, email, displayName: `[TEST] ${name}`, emailVerified: true });
  }
  await adminAuth.setCustomUserClaims(uid, { role });
  await adminDb.collection('users').doc(uid).set({ uid, displayName: `[TEST] ${name}`, email, role: role === 'SUPER_ADMIN' ? 'admin' : role.toLowerCase(), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}
async function tokenFor(uid: string): Promise<string> {
  await signInWithCustomToken(auth, await adminAuth.createCustomToken(uid));
  return auth.currentUser!.getIdToken(true);
}
async function call(method: string, p: string, token: string | null, body?: unknown, form?: FormData) {
  const res = await realFetch(API + p, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body && !form ? { 'Content-Type': 'application/json' } : {}) },
    body: form ?? (body && method !== 'GET' ? JSON.stringify(body) : undefined),
  });
  const ct = res.headers.get('content-type') ?? '';
  return { status: res.status, headers: res.headers, data: ct.includes('json') ? await res.json().catch(() => ({})) : ((await res.arrayBuffer().then((b) => Buffer.from(b))) as any) };
}
const pdf = (marker: string, pad = 600) => Buffer.from(`%PDF-1.4\n% ${marker}\n1 0 obj<<>>endobj\n${'x'.repeat(pad)}\n%%EOF\n`);
function fileForm(fields: Record<string, string>, name: string, mime: string, data: Buffer) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  f.set('file', new Blob([new Uint8Array(data)], { type: mime }), name);
  return f;
}
const nptParts = (d: Date) => {
  const npt = new Date(d.getTime() + (5 * 60 + 45) * 60_000);
  return { date: npt.toISOString().slice(0, 10), time: npt.toISOString().slice(11, 16) };
};

// ---- clean previous test data (only records created by this script) -------
const health = await call('GET', '/api/health', null);
if (!health.data.adminCredentials) throw new Error('Start the API with credentials first (npm run dev:all).');
for (const [uid, role, name] of [[U.admin, 'SUPER_ADMIN', 'LMS Admin'], [U.ia, 'INSTRUCTOR', 'Instructor A'], [U.ib, 'INSTRUCTOR', 'Instructor B'], [U.s1, 'STUDENT', 'Student One'], [U.s2, 'STUDENT', 'Student Two (not enrolled)'], [U.s3, 'STUDENT', 'Student Three']] as const) {
  await ensureUser(uid, role, name);
}
const old = await adminDb.collection('courses').where('slug', '==', SLUG).get();
for (const c of old.docs) {
  const bs = await adminDb.collection('batches').where('courseId', '==', c.id).get();
  for (const b of bs.docs) {
    await adminDb.recursiveDelete(b.ref);
    for (const col of ['enrollments', 'submissions', 'lessonProgress']) {
      const s = await adminDb.collection(col).where('batchId', '==', b.id).get();
      await Promise.all(s.docs.map((d) => d.ref.delete()));
    }
    fs.rmSync(path.resolve('.data/private-files/batches', b.id), { recursive: true, force: true });
  }
  await c.ref.delete();
}

let tAdmin = await tokenFor(U.admin);
let courseId = '';
let batchId = '';

// 1-3 ------------------------------------------------------------------------
await step('W01', 'Super Admin creates the Digital Marketing course (server-validated, published)', async () => {
  const r = await call('POST', '/api/admin/courses', tAdmin, { title: '[TEST] Digital Marketing (dev only)', slug: SLUG, subtitle: 'Development test course', categoryId: 'cat_digital_marketing', categoryName: 'Digital Marketing', level: 'Beginner', durationWeeks: 8, priceNpr: 15000, description: 'Created by scripts/e2e-lms.ts for development testing only. Safe to delete.', outcomes: ['Plan a Meta ads campaign'], syllabus: ['Day 1 - Introduction', 'Day 2 - Social media strategy'], status: 'published', isDemo: true });
  expect(r.status === 201, `create failed (${r.status} ${r.data.error ?? ''})`);
  courseId = r.data.id;
  const dup = await call('POST', '/api/admin/courses', tAdmin, { title: 'Other', slug: SLUG, categoryId: 'c', level: 'Beginner', durationWeeks: 4, priceNpr: 1, description: 'Duplicate slug attempt', outcomes: ['x'], syllabus: ['y'], status: 'draft' });
  expect(dup.status === 409, `duplicate slug not refused (${dup.status})`);
  const bad = await call('POST', '/api/admin/courses', tAdmin, { title: 'No outcomes', categoryId: 'c', level: 'Beginner', durationWeeks: 4, priceNpr: 100, description: 'Publishing without outcomes', status: 'published' });
  expect(bad.status === 400, 'invalid publish accepted');
});
await step('W02', 'Super Admin creates a batch; cannot open it without an instructor or with a non-instructor', async () => {
  const base = { courseId, name: '[TEST] Batch 1 (dev only)', startDate: '2027-01-10', endDate: '2027-03-10', scheduleText: 'Sun-Fri 7:00 PM NPT', seatLimit: 5, isDemo: true };
  const draft = await call('POST', '/api/admin/batches', tAdmin, { ...base, status: 'draft', instructorId: '' });
  expect(draft.status === 201, `draft batch failed (${draft.status} ${draft.data.error ?? ''})`);
  batchId = draft.data.id;
  const noInst = await call('POST', '/api/admin/batches', tAdmin, { ...base, id: batchId, status: 'upcoming', instructorId: '' });
  expect(noInst.status === 400, 'opened a batch without an instructor');
  const notInst = await call('POST', '/api/admin/batches', tAdmin, { ...base, id: batchId, status: 'upcoming', instructorId: U.s1 });
  expect(notInst.status === 400, 'a student was accepted as instructor');
  const badDates = await call('POST', '/api/admin/batches', tAdmin, { ...base, id: batchId, endDate: '2026-01-01', status: 'draft', instructorId: '' });
  expect(badDates.status === 400, 'bad dates accepted');
});
await step('W03', 'Super Admin assigns Instructor A and opens the batch for enrollment', async () => {
  const r = await call('POST', '/api/admin/batches', tAdmin, { courseId, id: batchId, name: '[TEST] Batch 1 (dev only)', startDate: '2027-01-10', endDate: '2027-03-10', scheduleText: 'Sun-Fri 7:00 PM NPT', seatLimit: 5, status: 'upcoming', instructorId: U.ia, isDemo: true });
  expect(r.status === 200, `assign failed (${r.status} ${r.data.error ?? ''})`);
  const b = (await adminDb.collection('batches').doc(batchId).get()).data() as any;
  expect(b.instructorId === U.ia && b.instructorName.includes('Instructor A'), 'assignment not stored');
});

// 4-9 (instructor) -----------------------------------------------------------
let tA = await tokenFor(U.ia);
let tB = await tokenFor(U.ib);
let roadmapId = '';
let roadmap2Id = '';
let lectureId = '';
let noteDraftId = '';
let noteId = '';
let soonId = '';
let laterId = '';
let draftSessionId = '';
await step('W04', 'Instructor A uploads the roadmap PDF; non-PDF, spoofed and oversize files are refused', async () => {
  const ok = await call('POST', `/api/staff/batches/${batchId}/resources`, tA, undefined, fileForm({ kind: 'roadmap', title: 'Course Roadmap', published: 'true', allowDownload: 'true' }, 'Roadmap Digital Marketing.pdf', 'application/pdf', pdf('ROADMAP-V1')));
  expect(ok.status === 201, `roadmap upload failed (${ok.status} ${ok.data.error ?? ''})`);
  roadmapId = ok.data.id;
  const spoof = await call('POST', `/api/staff/batches/${batchId}/resources`, tA, undefined, fileForm({ kind: 'roadmap', title: 'Fake' }, 'fake.pdf', 'application/pdf', Buffer.from('MZ\u0090 not a pdf at all')));
  expect(spoof.status === 400, `spoofed PDF accepted (${spoof.status})`);
  const notPdf = await call('POST', `/api/staff/batches/${batchId}/resources`, tA, undefined, fileForm({ kind: 'roadmap', title: 'Deck' }, 'deck.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3])));
  expect(notPdf.status === 400, 'roadmap accepted a non-PDF');
  const exe = await call('POST', `/api/staff/batches/${batchId}/resources`, tA, undefined, fileForm({ kind: 'other', title: 'tool' }, 'tool.exe', 'application/x-msdownload', Buffer.from([0x4d, 0x5a, 0, 0])));
  expect(exe.status === 400, 'executable accepted');
  const big = await call('POST', `/api/staff/batches/${batchId}/resources`, tA, undefined, fileForm({ kind: 'lecture', title: 'Huge' }, 'huge.pdf', 'application/pdf', Buffer.concat([pdf('BIG', 10), Buffer.alloc(26 * 1024 * 1024)])));
  expect(big.status === 400, `oversize accepted (${big.status})`);
});
await step('W05', 'Instructor A uploads a lecture PDF (draft), then publishes it', async () => {
  const r = await call('POST', `/api/staff/batches/${batchId}/resources`, tA, undefined, fileForm({ kind: 'lecture', title: 'Day 1 Lecture', published: 'false', allowDownload: 'true' }, 'day1-lecture.pdf', 'application/pdf', pdf('LECTURE-1')));
  expect(r.status === 201, `lecture upload failed (${r.status})`);
  lectureId = r.data.id;
  const p = await call('PATCH', `/api/staff/batches/${batchId}/resources/${lectureId}`, tA, { published: true });
  expect(p.status === 200, 'publish failed');
});
await step('W06', 'Instructor A writes Day 1 notes (draft, then published); audit history kept', async () => {
  const draft = await call('POST', `/api/staff/batches/${batchId}/notes`, tA, { title: 'Day 1 - Introduction to Digital Marketing', description: 'Overview', date: '2027-01-10', moduleTitle: 'Module 1', content: 'Welcome!\n- Channels\n- Funnels', attachmentIds: [lectureId], links: [{ label: 'Meta Blueprint', url: 'https://www.facebook.com/business/learn' }], status: 'draft' });
  expect(draft.status === 201, `note failed (${draft.status} ${draft.data.error ?? ''})`);
  noteDraftId = draft.data.id;
  const bad = await call('POST', `/api/staff/batches/${batchId}/notes`, tA, { title: 'Evil', content: 'x', links: [{ url: 'javascript:alert(1)' }], status: 'draft' });
  expect(bad.status === 400, 'unsafe link accepted in a note');
  const pub = await call('PUT', `/api/staff/batches/${batchId}/notes/${noteDraftId}`, tA, { title: 'Day 1 - Introduction to Digital Marketing', description: 'Overview', date: '2027-01-10', moduleTitle: 'Module 1', content: 'Welcome!\n- Channels\n- Funnels\n- Goals', attachmentIds: [lectureId], links: [], status: 'published' });
  expect(pub.status === 200, 'publish note failed');
  noteId = noteDraftId;
  const n = (await adminDb.collection('batches').doc(batchId).collection('notes').doc(noteId).get()).data() as any;
  expect(n.status === 'published' && n.publishedAt && n.revision === 2 && n.history.length === 2, 'revision/audit info missing');
});
await step('W07', 'Instructor A schedules Meet classes: soon, tomorrow, and an unpublished draft class', async () => {
  const soon = nptParts(new Date(Date.now() + 5 * 60_000));
  const later = nptParts(new Date(Date.now() + 26 * 3600_000));
  const mk = (title: string, when: { date: string; time: string }, extra: object = {}) => call('POST', '/api/staff/sessions', tA, { batchId, title, description: 'Test class', moduleTitle: 'Module 1', ...when, durationMinutes: 90, meetingUrl: 'https://meet.google.com/abc-defg-hij', ...extra });
  const a = await mk('[TEST] Meta Ads Fundamentals (soon)', soon);
  const b = await mk('[TEST] Meta Ads Fundamentals (tomorrow)', later, { meetingUrl: 'https://meet.google.com/xyz-abcd-efg' });
  const c = await mk('[TEST] Unpublished draft class', soon, { published: false });
  expect(a.status === 201 && b.status === 201 && c.status === 201, 'scheduling failed');
  [soonId, laterId, draftSessionId] = [a.data.id, b.data.id, c.data.id];
  const bad = await mk('[TEST] bad link', later, { meetingUrl: 'https://zoom.us/j/123' });
  expect(bad.status === 400, 'non-Meet link accepted');
  const doc = (await adminDb.collection('batches').doc(batchId).collection('liveSessions').doc(soonId).get()).data() as any;
  expect(!('meetingUrl' in doc) && doc.scheduledStart.endsWith('Z') && doc.published === true, 'session document leaks the link or is not UTC');
});

// 10-12 (student) -------------------------------------------------------------
let tS1 = await tokenFor(U.s1);
await step('W08', 'Student S1 requests enrollment; before approval nothing private is reachable', async () => {
  const r = await call('POST', '/api/enrollments', tS1, { batchId, paymentMethod: 'bank_transfer', paymentReference: 'E2E-TEST-REF-LMS-S1' });
  expect(r.status === 201, `enrollment failed (${r.status} ${r.data.error ?? ''})`);
  await rejects(() => lms.listResources(batchId, true), isPerm, 'resources before approval');
  await rejects(() => lms.listNotes(batchId, true), isPerm, 'notes before approval');
  const link = await call('POST', `/api/batches/${batchId}/resources/${roadmapId}/link`, tS1, { download: false });
  expect(link.status === 403, `link before approval not 403 (${link.status})`);
  const join = await call('POST', '/api/sessions/access', tS1, { batchId, sessionId: soonId, kind: 'join' });
  expect(join.status === 403, 'join before approval allowed');
});
await step('W09', 'Admin verifies the (fake) payment and approves S1', async () => {
  tAdmin = await tokenFor(U.admin);
  const r = await call('POST', `/api/admin/enrollments/${U.s1}_${batchId}/review`, tAdmin, { decision: 'approve', note: 'E2E test verification' });
  expect(r.status === 200 && r.data.changed === true, `approve failed (${r.status})`);
});
await step('W10', 'S1 sees the roadmap and published lecture (not drafts), notes, and upcoming classes', async () => {
  tS1 = await tokenFor(U.s1);
  const res = await lms.listResources(batchId, true);
  expect(res.some((r) => r.id === roadmapId && r.kind === 'roadmap') && res.some((r) => r.id === lectureId), 'roadmap/lecture missing');
  const notes = await lms.listNotes(batchId, true);
  expect(notes.length === 1 && notes[0].status === 'published' && notes[0].title.startsWith('Day 1'), 'daily notes wrong');
  const sessions = await svc.listBatchLiveSessions(batchId, true);
  expect(sessions.length === 2 && !sessions.some((s) => s.id === draftSessionId), `student sees ${sessions.length} sessions or the draft class`);
});
await step('W11', 'S1 opens the roadmap via a short-lived link; bytes match; tampered link refused; view-only enforced', async () => {
  const l = await call('POST', `/api/batches/${batchId}/resources/${roadmapId}/link`, tS1, { download: false });
  expect(l.status === 200 && l.data.url.startsWith('/api/files/download?token='), 'no link');
  const f = await call('GET', l.data.url, null);
  expect(f.status === 200 && String(f.headers.get('content-type')).includes('pdf') && String(f.headers.get('content-disposition')).startsWith('inline'), `view failed (${f.status})`);
  expect((f.data as Buffer).toString().includes('ROADMAP-V1'), 'file bytes differ');
  expect(String(f.headers.get('cache-control')).includes('no-store'), 'download is cacheable');
  const tampered = await call('GET', l.data.url.replace(/.$/, (c: string) => (c === 'A' ? 'B' : 'A')), null);
  expect(tampered.status === 403, `tampered link accepted (${tampered.status})`);
  const noToken = await call('GET', '/api/files/download', null);
  expect(noToken.status === 403, 'download without token allowed');
  const off = await call('PATCH', `/api/staff/batches/${batchId}/resources/${lectureId}`, tA, { allowDownload: false });
  expect(off.status === 200, 'toggle failed');
  const dl = await call('POST', `/api/batches/${batchId}/resources/${lectureId}/link`, tS1, { download: true });
  expect(dl.status === 403, 'download allowed although disabled');
  const view = await call('POST', `/api/batches/${batchId}/resources/${lectureId}/link`, tS1, { download: false });
  expect(view.status === 200, 'view blocked although allowed');
  const rawPath = (await adminDb.collection('batches').doc(batchId).collection('resources').doc(roadmapId).get()).data()!.storagePath as string;
  const direct = await realFetch(`${API}/${rawPath}`);
  const pub = await realFetch(`http://localhost:3001/${rawPath}`).catch(() => null);
  expect(direct.status === 404 && (!pub || !String(pub.headers.get('content-type')).includes('pdf')), 'a guessed path served the file');
});
await step('W12', 'Join button rules: link only inside the window; unpublished class hidden; server decides', async () => {
  const soon = await call('POST', '/api/sessions/access', tS1, { batchId, sessionId: soonId, kind: 'join' });
  expect(soon.status === 200 && soon.data.url === 'https://meet.google.com/abc-defg-hij', `join for class in 5 min failed (${soon.status})`);
  const later = await call('POST', '/api/sessions/access', tS1, { batchId, sessionId: laterId, kind: 'join' });
  expect(later.status === 403, 'early join allowed');
  const draft = await call('POST', '/api/sessions/access', tS1, { batchId, sessionId: draftSessionId, kind: 'join' });
  expect(draft.status === 404, `unpublished class joinable (${draft.status})`);
  const t = await call('GET', '/api/server-time', null);
  expect(Math.abs(t.data.now - Date.now()) < 60_000, 'server time endpoint wrong');
});

// 19 (unauthorised) ------------------------------------------------------------
await step('W13', 'Unauthorised student S2 cannot reach the same private content (rules and API)', async () => {
  const tS2 = await tokenFor(U.s2);
  await rejects(() => lms.listResources(batchId, true), isPerm, 'S2 resources');
  await rejects(() => lms.listNotes(batchId, true), isPerm, 'S2 notes');
  await rejects(() => svc.listBatchLiveSessions(batchId, true), isPerm, 'S2 sessions');
  for (const p of [`/api/batches/${batchId}/resources/${roadmapId}/link`]) expect((await call('POST', p, tS2, {})).status === 403, 'S2 got a link');
  expect((await call('POST', '/api/sessions/access', tS2, { batchId, sessionId: soonId, kind: 'join' })).status === 403, 'S2 got the Meet link');
  expect((await call('POST', `/api/staff/batches/${batchId}/resources`, tS2, undefined, fileForm({ kind: 'other', title: 'x1' }, 'a.txt', 'text/plain', Buffer.from('hi')))).status === 403, 'student uploaded a resource');
});

// 20 (instructor isolation) -----------------------------------------------------
await step('W14', "Instructor B cannot read or modify Instructor A's course content (resources, notes, classes, batch)", async () => {
  tB = await tokenFor(U.ib);
  const up = await call('POST', `/api/staff/batches/${batchId}/resources`, tB, undefined, fileForm({ kind: 'other', title: 'intrusion' }, 'x.txt', 'text/plain', Buffer.from('hi')));
  expect(up.status === 403, `upload by other instructor not 403 (${up.status})`);
  expect((await call('PATCH', `/api/staff/batches/${batchId}/resources/${roadmapId}`, tB, { published: false })).status === 403, 'patch allowed');
  expect((await call('DELETE', `/api/staff/batches/${batchId}/resources/${roadmapId}`, tB)).status === 403, 'delete allowed');
  expect((await call('PUT', `/api/staff/batches/${batchId}/notes/${noteId}`, tB, { title: 'Hacked', content: 'x', status: 'published' })).status === 403, 'note edit allowed');
  expect((await call('POST', '/api/staff/sessions', tB, { batchId, title: 'Hack class', date: '2027-02-01', time: '10:00', durationMinutes: 60, meetingUrl: 'https://meet.google.com/abc-defg-hij' })).status === 403, 'session created');
  expect((await call('POST', `/api/batches/${batchId}/resources/${roadmapId}/link`, tB, {})).status === 403, 'link granted');
  await rejects(() => lms.listResources(batchId, false), isPerm, 'B reads A resources');
  for (const [p, body] of [['/api/admin/courses', { title: 'Self-made course', categoryId: 'c', level: 'Beginner', durationWeeks: 4, priceNpr: 1, description: 'Instructor creating a course', outcomes: ['x'], syllabus: ['y'], status: 'published' }], ['/api/admin/batches', { courseId, name: 'Self assigned', startDate: '2027-01-01', endDate: '2027-02-01', seatLimit: 5, status: 'upcoming', instructorId: U.ib }]] as const) {
    expect((await call('POST', p, tB, body)).status === 403, `${p} allowed for an instructor`);
  }
  const tAx = await tokenFor(U.ia);
  expect((await call('POST', '/api/admin/batches', tAx, { courseId, id: batchId, name: 'x', startDate: '2027-01-01', endDate: '2027-02-01', seatLimit: 5, status: 'upcoming', instructorId: U.ia })).status === 403, 'instructor reassigned themself');
});

// extras ------------------------------------------------------------------------------
await step('W15', 'Replace file: students get the new version, old file is deleted; roadmap upload archives the old roadmap', async () => {
  tA = await tokenFor(U.ia);
  const r = await call('POST', `/api/staff/batches/${batchId}/resources/${lectureId}/replace`, tA, undefined, fileForm({}, 'day1-lecture-v2.pdf', 'application/pdf', pdf('LECTURE-2')));
  expect(r.status === 200, `replace failed (${r.status} ${r.data.error ?? ''})`);
  const doc = (await adminDb.collection('batches').doc(batchId).collection('resources').doc(lectureId).get()).data() as any;
  expect(doc.version === 2 && doc.fileName === 'day1-lecture-v2.pdf', 'metadata not updated');
  tS1 = await tokenFor(U.s1);
  const l = await call('POST', `/api/batches/${batchId}/resources/${lectureId}/link`, tS1, { download: false });
  const f = await call('GET', l.data.url, null);
  expect((f.data as Buffer).toString().includes('LECTURE-2'), 'student got the old file');
  const files = fs.readdirSync(path.resolve('.data/private-files/batches', batchId, 'resources', lectureId));
  expect(files.length === 1, `old file not deleted (${files.join(',')})`);
  const rm2 = await call('POST', `/api/staff/batches/${batchId}/resources`, tA, undefined, fileForm({ kind: 'roadmap', title: 'Course Roadmap v2', published: 'true' }, 'roadmap-v2.pdf', 'application/pdf', pdf('ROADMAP-V2')));
  expect(rm2.status === 201, 'second roadmap failed');
  roadmap2Id = rm2.data.id;
  const first = (await adminDb.collection('batches').doc(batchId).collection('resources').doc(roadmapId).get()).data() as any;
  expect(first.archived === true && first.published === false, 'old roadmap still active');
  const visible = await lms.listResources(batchId, true);
  expect(visible.filter((x) => x.kind === 'roadmap').length === 1, 'student sees two roadmaps');
});
await step('W16', 'Archive hides a resource from students immediately', async () => {
  tA = await tokenFor(U.ia);
  expect((await call('PATCH', `/api/staff/batches/${batchId}/resources/${lectureId}`, tA, { archived: true })).status === 200, 'archive failed');
  tS1 = await tokenFor(U.s1);
  expect((await call('POST', `/api/batches/${batchId}/resources/${lectureId}/link`, tS1, {})).status === 404, 'archived resource still reachable');
  expect((await lms.listResources(batchId, true)).every((x) => x.id !== lectureId), 'archived resource listed');
});
await step('W17', 'Reassigning the instructor moves access; capacity cannot drop below enrolled students', async () => {
  tAdmin = await tokenFor(U.admin);
  const base = { courseId, id: batchId, name: '[TEST] Batch 1 (dev only)', startDate: '2027-01-10', endDate: '2027-03-10', scheduleText: 'Sun-Fri 7:00 PM NPT', status: 'upcoming', isDemo: true };
  const low = await call('POST', '/api/admin/batches', tAdmin, { ...base, seatLimit: 0, instructorId: U.ia });
  expect(low.status === 400, 'zero capacity accepted');
  const r = await call('POST', '/api/admin/batches', tAdmin, { ...base, seatLimit: 5, instructorId: U.ib });
  expect(r.status === 200, `reassign failed (${r.status})`);
  const enr = (await adminDb.collection('enrollments').doc(`${U.s1}_${batchId}`).get()).data() as any;
  expect(enr.instructorId === U.ib, 'enrollment instructor not updated');
  tA = await tokenFor(U.ia);
  expect((await call('POST', `/api/staff/batches/${batchId}/resources`, tA, undefined, fileForm({ kind: 'other', title: 'old inst' }, 'a.txt', 'text/plain', Buffer.from('hi')))).status === 403, 'old instructor still has access');
  tB = await tokenFor(U.ib);
  expect((await call('POST', `/api/staff/batches/${batchId}/resources`, tB, undefined, fileForm({ kind: 'other', title: 'new inst', published: 'false' }, 'b.txt', 'text/plain', Buffer.from('hi')))).status === 201, 'new instructor has no access');
  expect((await call('POST', '/api/admin/batches', tAdmin, { ...base, seatLimit: 5, instructorId: U.ia })).status === 200, 'reassign back failed');
});
await step('W18', 'Removing an enrollment revokes access, even for an already-issued file link', async () => {
  const tS3 = await tokenFor(U.s3);
  expect((await call('POST', '/api/enrollments', tS3, { batchId, paymentMethod: 'esewa_manual', paymentReference: 'E2E-TEST-REF-LMS-S3' })).status === 201, 'S3 enroll failed');
  tAdmin = await tokenFor(U.admin);
  expect((await call('POST', `/api/admin/enrollments/${U.s3}_${batchId}/review`, tAdmin, { decision: 'waive', note: 'E2E scholarship' })).status === 200, 'waive failed');
  const t3 = await tokenFor(U.s3);
  const l = await call('POST', `/api/batches/${batchId}/resources/${roadmap2Id}/link`, t3, { download: false });
  expect(l.status === 200, `S3 link failed (${l.status})`);
  expect((await call('GET', l.data.url, null)).status === 200, 'S3 download failed before revoke');
  expect((await call('POST', `/api/admin/enrollments/${U.s3}_${batchId}/review`, tAdmin, { decision: 'reject', note: 'E2E revoke' })).status === 200, 'reject failed');
  expect((await call('GET', l.data.url, null)).status === 403, 'revoked student could still download with an existing link');
});

await signOut(auth).catch(() => {});
const mark = (s: string) => (s === 'PASS' ? 'PASS   ' : s === 'FAIL' ? 'FAIL   ' : 'BLOCKED');
console.log('\nRESULTS');
for (const r of results) console.log(`${mark(r.status)} ${r.id.padEnd(4)} ${r.title}${r.note ? `\n         -> ${r.note}` : ''}`);
const n = (s: string) => results.filter((r) => r.status === s).length;
console.log(`\nPASS ${n('PASS')}  FAIL ${n('FAIL')}  BLOCKED ${n('BLOCKED')}`);
process.exit(n('FAIL') > 0 ? 1 : 0);
