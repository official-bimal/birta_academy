import crypto from 'node:crypto';
import type { Express, NextFunction, Request, RequestHandler, Response } from 'express';
import multer from 'multer';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { ALLOWED_TYPES, MAX_UPLOAD_BYTES, RESOURCE_KINDS, validateUpload, type ResourceKind } from '../src/lib/files.ts';
import { validateNoteInput } from '../src/lib/notes.ts';
import { safeHttpUrl } from '../src/lib/sessions.ts';
import { validateBatchInput, validateCourseInput } from '../src/lib/catalog.ts';
import { storage } from './storage.ts';

/** Pieces of server/index.ts that the LMS routes reuse. */
export interface LmsContext {
  app: Express;
  db: Firestore;
  auth: import('firebase-admin/auth').Auth;
  requireAuth: RequestHandler;
  requireRole: (role: 'SUPER_ADMIN' | 'INSTRUCTOR' | 'STUDENT') => RequestHandler;
  requireBatchStaff: RequestHandler;
  limiter: RequestHandler;
  audit: (actor: DecodedIdToken, action: string, targetId: string, summary: string) => Promise<void>;
  HttpError: new (status: number, message: string) => Error & { status: number };
  handleError: (res: Response, error: unknown, label: string) => unknown;
  loadManagedBatch: (user: DecodedIdToken, batchId: string) => Promise<Record<string, any>>;
  occupying: string[];
}

type Authed = Request & { user: DecodedIdToken };
const ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

export function registerLms(ctx: LmsContext) {
  const { app, db, auth, requireAuth, requireRole, requireBatchStaff, limiter, audit, HttpError, handleError, loadManagedBatch, occupying } = ctx;
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES + 1, files: 1, fields: 20 } });
  const single = (field: string): RequestHandler => (req, res, next) =>
    upload.single(field)(req, res, (err: unknown) => {
      if (!err) return next();
      const tooBig = (err as { code?: string }).code === 'LIMIT_FILE_SIZE';
      res.status(400).json({ error: tooBig ? `File is too large (limit ${MAX_UPLOAD_BYTES / 1024 / 1024} MB).` : 'Upload failed.' });
    });

  const resCol = (batchId: string) => db.collection('batches').doc(batchId).collection('resources');
  const notesCol = (batchId: string) => db.collection('batches').doc(batchId).collection('notes');
  const secret = process.env.DOWNLOAD_TOKEN_SECRET ? Buffer.from(process.env.DOWNLOAD_TOKEN_SECRET) : crypto.randomBytes(32);

  // ------------------------------------------------------------------ download tokens
  const TOKEN_TTL_MS = 5 * 60 * 1000;
  function signToken(payload: Record<string, unknown>): string {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
    return `${body}.${sig}`;
  }
  function verifyToken(token: string): Record<string, any> | null {
    const [body, sig] = token.split('.');
    if (!body || !sig) return null;
    const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    try {
      const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'));
      return typeof p.e === 'number' && p.e > Date.now() ? p : null;
    } catch {
      return null;
    }
  }

  /** Who may read a batch's learning material: its instructor, admins, and students with an active enrollment. */
  async function batchAccess(user: DecodedIdToken, batchId: string): Promise<'staff' | 'student'> {
    if (user.role === 'SUPER_ADMIN') return 'staff';
    if (user.role === 'INSTRUCTOR') {
      await loadManagedBatch(user, batchId); // throws 403 for another instructor's batch
      return 'staff';
    }
    const enr = await db.collection('enrollments').doc(`${user.uid}_${batchId}`).get();
    if (!enr.exists || !occupying.includes(enr.data()?.enrollmentStatus)) throw new HttpError(403, 'You are not enrolled in this batch.');
    return 'student';
  }

  // ------------------------------------------------------------------ resources
  const parseBool = (v: unknown, d: boolean) => (v === 'true' || v === true ? true : v === 'false' || v === false ? false : d);
  const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '');

  app.post('/api/staff/batches/:batchId/resources', limiter, requireAuth, requireBatchStaff, single('file'), async (req, res) => {
    const user = (req as Authed).user;
    const batchId = String(req.params.batchId);
    try {
      const batch = await loadManagedBatch(user, batchId);
      const b = req.body as Record<string, unknown>;
      const kind = String(b.kind) as ResourceKind;
      if (!RESOURCE_KINDS.includes(kind)) throw new HttpError(400, 'Choose a resource type.');
      const published = parseBool(b.published, false);
      const description = clean(b.description, 300);
      const allowDownload = parseBool(b.allowDownload, true);
      const id = resCol(batchId).doc().id;
      const base = {
        id,
        courseId: batch.courseId,
        batchId,
        kind,
        description,
        allowDownload,
        uploadedBy: user.uid,
        uploadedByName: user.name ?? user.email ?? '',
        published,
        archived: false,
        version: 1,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };
      const orderSnap = await resCol(batchId).count().get();
      const order = orderSnap.data().count + 1;

      if (kind === 'link') {
        const url = safeHttpUrl(b.externalUrl);
        const title = clean(b.title, 140);
        if (!url || title.length < 3) throw new HttpError(400, 'Enter a title and a valid link.');
        await resCol(batchId).doc(id).set({ ...base, title, externalUrl: url, order });
      } else {
        const file = req.file;
        if (!file) throw new HttpError(400, 'Choose a file to upload.');
        const check = validateUpload({ name: file.originalname, mime: file.mimetype, size: file.size, head: new Uint8Array(file.buffer.subarray(0, 16)), pdfOnly: kind === 'roadmap' });
        if (!check.ok) throw new HttpError(400, check.error);
        const title = clean(b.title, 140) || check.safeName.replace(/\.[^.]+$/, '');
        if (title.length < 3) throw new HttpError(400, 'Title must be at least 3 characters.');
        const key = `batches/${batchId}/resources/${id}/${check.safeName}`;
        await storage.put(key, file.buffer, check.mime);
        if (kind === 'roadmap') {
          // one active roadmap per batch: older roadmaps are archived, not destroyed
          const old = await resCol(batchId).where('kind', '==', 'roadmap').where('archived', '==', false).get();
          await Promise.all(old.docs.map((d) => d.ref.update({ archived: true, published: false, updatedAt: FieldValue.serverTimestamp() })));
        }
        await resCol(batchId).doc(id).set({ ...base, title, fileName: check.safeName, mimeType: check.mime, size: file.size, storagePath: key, order });
      }
      await audit(user, 'UPLOAD_RESOURCE', id, `Added ${kind} resource to batch ${batchId}`);
      res.status(201).json({ id });
    } catch (error) {
      handleError(res, error, 'resource upload failed');
    }
  });

  app.patch('/api/staff/batches/:batchId/resources/:id', limiter, requireAuth, requireBatchStaff, async (req, res) => {
    const user = (req as Authed).user;
    const { batchId, id } = req.params as Record<string, string>;
    try {
      await loadManagedBatch(user, batchId);
      const ref = resCol(batchId).doc(id);
      const snap = await ref.get();
      if (!snap.exists) throw new HttpError(404, 'Resource not found.');
      const b = (req.body ?? {}) as Record<string, unknown>;
      const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
      if (typeof b.title === 'string') {
        const t = clean(b.title, 140);
        if (t.length < 3) throw new HttpError(400, 'Title must be at least 3 characters.');
        patch.title = t;
      }
      if (typeof b.description === 'string') patch.description = clean(b.description, 300);
      if (typeof b.published === 'boolean') patch.published = b.published;
      if (typeof b.allowDownload === 'boolean') patch.allowDownload = b.allowDownload;
      if (typeof b.archived === 'boolean') {
        patch.archived = b.archived;
        if (b.archived) patch.published = false;
      }
      if (typeof b.order === 'number' && Number.isInteger(b.order) && b.order >= 0 && b.order < 10000) patch.order = b.order;
      if (patch.published === true && snap.data()?.archived === true && patch.archived !== false) throw new HttpError(409, 'Restore the resource before publishing it.');
      await ref.update(patch);
      res.json({ ok: true });
    } catch (error) {
      handleError(res, error, 'resource update failed');
    }
  });

  app.post('/api/staff/batches/:batchId/resources/:id/replace', limiter, requireAuth, requireBatchStaff, single('file'), async (req, res) => {
    const user = (req as Authed).user;
    const { batchId, id } = req.params as Record<string, string>;
    try {
      await loadManagedBatch(user, batchId);
      const ref = resCol(batchId).doc(id);
      const snap = await ref.get();
      if (!snap.exists || !snap.data()?.storagePath) throw new HttpError(404, 'Resource not found.');
      const file = req.file;
      if (!file) throw new HttpError(400, 'Choose a file to upload.');
      const old = snap.data()!;
      const check = validateUpload({ name: file.originalname, mime: file.mimetype, size: file.size, head: new Uint8Array(file.buffer.subarray(0, 16)), pdfOnly: old.kind === 'roadmap' });
      if (!check.ok) throw new HttpError(400, check.error);
      const key = `batches/${batchId}/resources/${id}/v${Number(old.version ?? 1) + 1}-${check.safeName}`;
      await storage.put(key, file.buffer, check.mime);
      await ref.update({ fileName: check.safeName, mimeType: check.mime, size: file.size, storagePath: key, version: FieldValue.increment(1), replacedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      await storage.remove(String(old.storagePath));
      await audit(user, 'REPLACE_RESOURCE', id, `Replaced file of resource in batch ${batchId}`);
      res.json({ ok: true });
    } catch (error) {
      handleError(res, error, 'resource replace failed');
    }
  });

  app.delete('/api/staff/batches/:batchId/resources/:id', limiter, requireAuth, requireBatchStaff, async (req, res) => {
    const user = (req as Authed).user;
    const { batchId, id } = req.params as Record<string, string>;
    try {
      await loadManagedBatch(user, batchId);
      const ref = resCol(batchId).doc(id);
      const snap = await ref.get();
      if (!snap.exists) throw new HttpError(404, 'Resource not found.');
      if (snap.data()?.storagePath) await storage.remove(String(snap.data()!.storagePath));
      await ref.delete();
      await audit(user, 'DELETE_RESOURCE', id, `Deleted resource from batch ${batchId}`);
      res.json({ ok: true });
    } catch (error) {
      handleError(res, error, 'resource delete failed');
    }
  });

  /** Short-lived authorised link. Access is re-checked when the link is created and again when it is used. */
  app.post('/api/batches/:batchId/resources/:id/link', limiter, requireAuth, async (req, res) => {
    const user = (req as Authed).user;
    const { batchId, id } = req.params as Record<string, string>;
    if (!ID_RE.test(batchId) || !ID_RE.test(id)) return res.status(400).json({ error: 'Invalid request.' });
    try {
      const who = await batchAccess(user, batchId);
      const snap = await resCol(batchId).doc(id).get();
      if (!snap.exists) throw new HttpError(404, 'Resource not found.');
      const r = snap.data()!;
      if (who === 'student' && (!r.published || r.archived)) throw new HttpError(404, 'Resource not found.');
      if (r.externalUrl) return res.json({ url: r.externalUrl, external: true });
      const wantDownload = Boolean((req.body as { download?: unknown })?.download);
      if (who === 'student' && wantDownload && r.allowDownload === false) throw new HttpError(403, 'Downloading is disabled for this file. You can view it in your browser.');
      const inline = ALLOWED_TYPES[String(r.mimeType)]?.inline === true && !wantDownload;
      const exp = Date.now() + TOKEN_TTL_MS;
      const token = signToken({ b: batchId, r: id, u: user.uid, i: inline, e: exp });
      res.json({ url: `/api/files/download?token=${encodeURIComponent(token)}`, expiresAt: exp });
    } catch (error) {
      handleError(res, error, 'resource link failed');
    }
  });

  app.get('/api/files/download', async (req, res) => {
    const p = verifyToken(String(req.query.token ?? ''));
    if (!p) return res.status(403).send('This link has expired or is not valid.');
    try {
      const snap = await resCol(String(p.b)).doc(String(p.r)).get();
      if (!snap.exists || !snap.data()?.storagePath) return res.status(404).send('Not found.');
      const r = snap.data()!;
      // a student's access is re-verified at use time (enrollment may have been revoked since the link was made)
      const asUser = await auth.getUser(String(p.u)).catch(() => null);
      const role = asUser?.customClaims?.role;
      if (role === 'STUDENT') {
        const enr = await db.collection('enrollments').doc(`${p.u}_${p.b}`).get();
        if (!enr.exists || !occupying.includes(enr.data()?.enrollmentStatus) || !r.published || r.archived) return res.status(403).send('Access has been removed.');
      } else if (role !== 'SUPER_ADMIN' && role !== 'INSTRUCTOR') {
        return res.status(403).send('Not allowed.');
      }
      const stream = await storage.read(String(r.storagePath));
      res.setHeader('Content-Type', String(r.mimeType));
      res.setHeader('Content-Length', String(r.size));
      res.setHeader('Content-Disposition', `${p.i ? 'inline' : 'attachment'}; filename="${String(r.fileName).replace(/"/g, '')}"`);
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'no-referrer');
      stream.on('error', () => res.destroy());
      stream.pipe(res);
    } catch (error) {
      console.error('download failed', (error as Error).message);
      res.status(500).send('Could not read the file.');
    }
  });

  // ------------------------------------------------------------------ class notes
  async function checkNoteRefs(batchId: string, sessionId: string | undefined, attachmentIds: string[]) {
    if (sessionId && !(await db.collection('batches').doc(batchId).collection('liveSessions').doc(sessionId).get()).exists) {
      throw new HttpError(400, 'That class does not exist in this batch.');
    }
    for (const a of attachmentIds) {
      if (!(await resCol(batchId).doc(a).get()).exists) throw new HttpError(400, 'An attached file does not exist in this batch.');
    }
  }

  const noteHandler = (isUpdate: boolean): RequestHandler => async (req, res) => {
    const user = (req as Authed).user;
    const { batchId, noteId } = req.params as Record<string, string>;
    try {
      const batch = await loadManagedBatch(user, batchId);
      const parsed = validateNoteInput(req.body);
      if (!parsed.ok) throw new HttpError(400, parsed.error);
      const v = parsed.value;
      await checkNoteRefs(batchId, v.sessionId, v.attachmentIds);
      const ref = isUpdate ? notesCol(batchId).doc(noteId) : notesCol(batchId).doc();
      const prev = isUpdate ? await ref.get() : null;
      if (isUpdate && !prev?.exists) throw new HttpError(404, 'Note not found.');
      const wasPublished = prev?.data()?.status === 'published';
      const history = [...((prev?.data()?.history as unknown[]) ?? []), { at: Date.now(), by: user.uid, status: v.status }].slice(-15);
      await ref.set(
        {
          id: ref.id,
          courseId: batch.courseId,
          batchId,
          instructorId: prev?.data()?.instructorId ?? user.uid,
          authorName: prev?.data()?.authorName ?? (user.name ?? user.email ?? ''),
          title: v.title,
          description: v.description,
          date: v.date,
          sessionId: v.sessionId ?? FieldValue.delete(),
          moduleTitle: v.moduleTitle,
          content: v.content,
          attachmentIds: v.attachmentIds,
          links: v.links,
          status: v.status,
          ...(v.status === 'published' && !wasPublished ? { publishedAt: FieldValue.serverTimestamp() } : {}),
          editedBy: user.uid,
          revision: FieldValue.increment(1),
          history,
          updatedAt: FieldValue.serverTimestamp(),
          ...(isUpdate ? {} : { createdAt: FieldValue.serverTimestamp() }),
        },
        { merge: true }
      );
      await audit(user, isUpdate ? 'UPDATE_NOTE' : 'CREATE_NOTE', ref.id, `${v.status} note "${v.title}" in batch ${batchId}`);
      res.status(isUpdate ? 200 : 201).json({ id: ref.id });
    } catch (error) {
      handleError(res, error, 'note save failed');
    }
  };
  app.post('/api/staff/batches/:batchId/notes', limiter, requireAuth, requireBatchStaff, noteHandler(false));
  app.put('/api/staff/batches/:batchId/notes/:noteId', limiter, requireAuth, requireBatchStaff, noteHandler(true));

  // ------------------------------------------------------------------ Super Admin: courses, thumbnails, batches, assignment
  const adminOnly = [limiter, requireAuth, requireRole('SUPER_ADMIN')] as RequestHandler[];

  app.post('/api/admin/courses', ...adminOnly, async (req, res) => {
    const actor = (req as Authed).user;
    try {
      const parsed = validateCourseInput(req.body);
      if (!parsed.ok) throw new HttpError(400, parsed.error);
      const c = parsed.value;
      const id = c.id ?? `course_${crypto.randomBytes(6).toString('hex')}`;
      const slugClash = await db.collection('courses').where('slug', '==', c.slug).get();
      if (slugClash.docs.some((d) => d.id !== id)) throw new HttpError(409, 'Another course already uses this web address (slug).');
      const ref = db.collection('courses').doc(id);
      const existing = await ref.get();
      if (c.id && !existing.exists) throw new HttpError(404, 'Course not found.');
      await ref.set(
        {
          id,
          slug: c.slug,
          title: c.title,
          subtitle: c.subtitle,
          categoryId: c.categoryId,
          categoryName: c.categoryName,
          instructorId: existing.data()?.instructorId ?? '',
          instructorName: existing.data()?.instructorName ?? '',
          level: c.level,
          durationWeeks: c.durationWeeks,
          priceNpr: c.priceNpr,
          currency: 'NPR',
          description: c.description,
          outcomes: c.outcomes,
          syllabus: c.syllabus,
          published: c.status === 'published',
          archived: c.status === 'archived',
          featured: c.featured,
          isDemo: c.isDemo,
          updatedAt: FieldValue.serverTimestamp(),
          ...(existing.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
        },
        { merge: true }
      );
      // keep denormalised course info on batches in sync
      const batches = await db.collection('batches').where('courseId', '==', id).get();
      await Promise.all(batches.docs.map((d) => d.ref.update({ courseTitle: c.title, courseSlug: c.slug, ...(c.status === 'archived' ? { status: 'archived' } : {}) })));
      await audit(actor, existing.exists ? 'UPDATE_COURSE' : 'CREATE_COURSE', id, `${c.status} course "${c.title}" (NPR ${c.priceNpr})`);
      res.status(existing.exists ? 200 : 201).json({ id });
    } catch (error) {
      handleError(res, error, 'course save failed');
    }
  });

  app.post('/api/admin/courses/:id/thumbnail', ...adminOnly, single('file'), async (req, res) => {
    const actor = (req as Authed).user;
    const id = String(req.params.id);
    try {
      const ref = db.collection('courses').doc(id);
      if (!(await ref.get()).exists) throw new HttpError(404, 'Course not found.');
      const file = req.file;
      if (!file) throw new HttpError(400, 'Choose an image.');
      if (file.size > 2 * 1024 * 1024) throw new HttpError(400, 'Thumbnails are limited to 2 MB.');
      const check = validateUpload({ name: file.originalname, mime: file.mimetype, size: file.size, head: new Uint8Array(file.buffer.subarray(0, 16)) });
      if (!check.ok || !check.mime.startsWith('image/')) throw new HttpError(400, 'Use a PNG or JPEG image.');
      const key = `public-thumbnails/${id}/${Date.now()}-${check.safeName}`;
      await storage.put(key, file.buffer, check.mime);
      await ref.update({ thumbnailKey: key, thumbnailMime: check.mime, thumbnailUrl: `/api/public/thumbnails/${id}?v=${Date.now()}`, updatedAt: FieldValue.serverTimestamp() });
      await audit(actor, 'COURSE_THUMBNAIL', id, 'Updated course thumbnail');
      res.json({ ok: true });
    } catch (error) {
      handleError(res, error, 'thumbnail failed');
    }
  });

  // Thumbnails are marketing images: public, but only for courses that are published.
  app.get('/api/public/thumbnails/:id', async (req, res) => {
    try {
      const snap = await db.collection('courses').doc(String(req.params.id)).get();
      const c = snap.data();
      if (!c?.thumbnailKey || c.published !== true) return res.status(404).end();
      const stream = await storage.read(String(c.thumbnailKey));
      res.setHeader('Content-Type', String(c.thumbnailMime ?? 'image/jpeg'));
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      stream.on('error', () => res.destroy());
      stream.pipe(res);
    } catch {
      res.status(404).end();
    }
  });

  app.post('/api/admin/batches', ...adminOnly, async (req, res) => {
    const actor = (req as Authed).user;
    try {
      const parsed = validateBatchInput(req.body);
      if (!parsed.ok) throw new HttpError(400, parsed.error);
      const b = parsed.value;
      const courseSnap = await db.collection('courses').doc(b.courseId).get();
      if (!courseSnap.exists) throw new HttpError(400, 'Choose an existing course.');
      const course = courseSnap.data()!;

      // Instructor assignment is verified on the server: the user must exist, be enabled and hold the INSTRUCTOR claim.
      let instructorName = '';
      if (b.instructorId) {
        const inst = await auth.getUser(b.instructorId).catch(() => null);
        if (!inst || inst.disabled || inst.customClaims?.role !== 'INSTRUCTOR') throw new HttpError(400, 'That user is not an active instructor.');
        instructorName = inst.displayName || inst.email || 'Instructor';
      }
      const id = b.id ?? `batch_${crypto.randomBytes(6).toString('hex')}`;
      const ref = db.collection('batches').doc(id);
      const existing = await ref.get();
      if (b.id && !existing.exists) throw new HttpError(404, 'Batch not found.');
      if (existing.exists && existing.data()?.courseId !== b.courseId) throw new HttpError(400, 'A batch cannot be moved to another course.');

      const occupied = existing.exists
        ? (await db.collection('enrollments').where('batchId', '==', id).where('enrollmentStatus', 'in', occupying).get()).size
        : 0;
      if (b.seatLimit < occupied) throw new HttpError(409, `Capacity cannot be lower than the ${occupied} students already enrolled.`);
      if (b.status === 'upcoming' || b.status === 'ongoing') {
        if (!b.instructorId) throw new HttpError(400, 'Assign an instructor before opening a batch for enrollment.');
        if (course.published !== true) throw new HttpError(400, 'Publish the course before opening a batch for enrollment.');
      }
      const reassigned = existing.exists && existing.data()?.instructorId !== b.instructorId;

      await ref.set(
        {
          id,
          courseId: b.courseId,
          courseTitle: course.title,
          courseSlug: course.slug,
          instructorId: b.instructorId,
          instructorName,
          name: b.name,
          startDate: b.startDate,
          endDate: b.endDate,
          scheduleText: b.scheduleText,
          timezone: b.timezone,
          seatLimit: b.seatLimit,
          priceNpr: b.priceNpr ?? course.priceNpr,
          status: b.status,
          isDemo: b.isDemo,
          updatedAt: FieldValue.serverTimestamp(),
          ...(existing.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
        },
        { merge: true }
      );

      if (reassigned) {
        // denormalised instructor ids (used by instructor-scoped queries) follow the assignment
        const targets = [
          ...(await db.collection('enrollments').where('batchId', '==', id).get()).docs,
          ...(await db.collection('submissions').where('batchId', '==', id).get()).docs,
        ];
        for (let i = 0; i < targets.length; i += 400) {
          const wb = db.batch();
          targets.slice(i, i + 400).forEach((d) => wb.update(d.ref, { instructorId: b.instructorId }));
          await wb.commit();
        }
        for (const sub of ['liveSessions', 'lessons', 'assignments']) {
          const snap = await ref.collection(sub).get();
          await Promise.all(snap.docs.map((d) => d.ref.update({ instructorId: b.instructorId })));
        }
      }
      await audit(actor, existing.exists ? (reassigned ? 'REASSIGN_INSTRUCTOR' : 'UPDATE_BATCH') : 'CREATE_BATCH', id, `${b.status} batch "${b.name}" -> instructor ${instructorName || 'none'}`);
      res.status(existing.exists ? 200 : 201).json({ id });
    } catch (error) {
      handleError(res, error, 'batch save failed');
    }
  });

  app.get('/api/server-time', (_req: Request, res: Response, _next?: NextFunction) => {
    res.json({ now: Date.now() });
  });
}
