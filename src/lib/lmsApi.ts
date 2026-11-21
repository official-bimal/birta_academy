import { useEffect, useRef } from 'react';
import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import { auth, db } from './firebase';
import { apiFetch, ApiError } from './api';
import type { ClassNote, Resource, ResourceKindId } from '../types';
import type { CourseInput, BatchInput } from './catalog';

// ---------------------------------------------------------------- resources
export interface ResourceUpload {
  file?: File;
  kind: ResourceKindId;
  title: string;
  description?: string;
  published: boolean;
  allowDownload: boolean;
  externalUrl?: string;
}

/** multipart upload with real progress (fetch cannot report upload progress). */
function xhrUpload(path: string, method: string, form: FormData, onProgress?: (pct: number) => void): Promise<{ id?: string }> {
  return new Promise(async (resolve, reject) => {
    const user = auth.currentUser;
    if (!user) return reject(new ApiError(401, 'UNAUTHENTICATED'));
    const token = await user.getIdToken();
    const xhr = new XMLHttpRequest();
    xhr.open(method, `/api${path}`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = () => reject(new ApiError(0, 'NETWORK', 'Network problem during upload.'));
    xhr.onload = () => {
      let data: { error?: string; id?: string } = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* non-JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new ApiError(xhr.status, data.error ?? 'SERVER_ERROR', data.error));
    };
    xhr.send(form);
  });
}

export function uploadResource(batchId: string, input: ResourceUpload, onProgress?: (pct: number) => void) {
  const form = new FormData();
  form.set('kind', input.kind);
  form.set('title', input.title);
  form.set('description', input.description ?? '');
  form.set('published', String(input.published));
  form.set('allowDownload', String(input.allowDownload));
  if (input.externalUrl) form.set('externalUrl', input.externalUrl);
  if (input.file) form.set('file', input.file);
  return xhrUpload(`/staff/batches/${batchId}/resources`, 'POST', form, onProgress);
}

export function replaceResourceFile(batchId: string, id: string, file: File, onProgress?: (pct: number) => void) {
  const form = new FormData();
  form.set('file', file);
  return xhrUpload(`/staff/batches/${batchId}/resources/${id}/replace`, 'POST', form, onProgress);
}

export const patchResource = (batchId: string, id: string, patch: Partial<Pick<Resource, 'title' | 'description' | 'published' | 'archived' | 'allowDownload' | 'order'>>) =>
  apiFetch(`/staff/batches/${batchId}/resources/${id}`, { method: 'PATCH', body: patch });

export const deleteResource = (batchId: string, id: string) => apiFetch(`/staff/batches/${batchId}/resources/${id}`, { method: 'DELETE' });

/** Asks the server for a short-lived link (5 minutes). External links come back as-is. */
export async function getResourceLink(batchId: string, id: string, download = false): Promise<string> {
  const r = await apiFetch<{ url: string }>(`/batches/${batchId}/resources/${id}/link`, { method: 'POST', body: { download } });
  return r.url;
}

/** Opens a resource in a new tab (view) or saves it (download). */
export async function openResource(batchId: string, id: string, download = false) {
  const url = await getResourceLink(batchId, id, download);
  window.open(url, '_blank', 'noopener,noreferrer');
}

export async function listResources(batchId: string, asStudent: boolean): Promise<Resource[]> {
  const col = collection(db, 'batches', batchId, 'resources');
  const snap = await getDocs(asStudent ? query(col, where('published', '==', true)) : col);
  return snap.docs.map((d) => d.data() as Resource).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

// ---------------------------------------------------------------- notes
export async function listNotes(batchId: string, asStudent: boolean): Promise<ClassNote[]> {
  const col = collection(db, 'batches', batchId, 'notes');
  const snap = await getDocs(asStudent ? query(col, where('status', '==', 'published')) : query(col, orderBy('createdAt', 'desc')));
  const rows = snap.docs.map((d) => d.data() as ClassNote);
  const key = (n: ClassNote) => n.date || '';
  return rows.sort((a, b) => key(b).localeCompare(key(a)));
}

export interface NoteForm {
  title: string;
  description: string;
  date: string;
  sessionId?: string;
  moduleTitle: string;
  content: string;
  attachmentIds: string[];
  links: { label: string; url: string }[];
  status: 'draft' | 'published';
}

export async function saveNote(batchId: string, noteId: string | null, form: NoteForm): Promise<string> {
  const r = noteId
    ? await apiFetch<{ id: string }>(`/staff/batches/${batchId}/notes/${noteId}`, { method: 'PUT', body: form })
    : await apiFetch<{ id: string }>(`/staff/batches/${batchId}/notes`, { method: 'POST', body: form });
  return r.id;
}

// ---------------------------------------------------------------- Super Admin catalog (server-validated)
export const saveCourse = (input: Partial<CourseInput> & { id?: string }) => apiFetch<{ id: string }>('/admin/courses', { method: 'POST', body: input });
export const saveBatch = (input: Partial<BatchInput> & { id?: string }) => apiFetch<{ id: string }>('/admin/batches', { method: 'POST', body: input });

export function saveCourseThumbnail(courseId: string, file: File, onProgress?: (pct: number) => void) {
  const form = new FormData();
  form.set('file', file);
  return xhrUpload(`/admin/courses/${courseId}/thumbnail`, 'POST', form, onProgress);
}

// ---------------------------------------------------------------- server clock
let offsetMs = 0;
let synced = false;

/** Class timing is decided by the server; this only keeps the on-screen countdown honest if the device clock is wrong. */
export async function syncServerClock(): Promise<void> {
  try {
    const t0 = Date.now();
    const res = await fetch('/api/server-time', { cache: 'no-store' });
    const { now } = (await res.json()) as { now: number };
    const t1 = Date.now();
    offsetMs = now - (t0 + t1) / 2;
    synced = true;
  } catch {
    /* keep the device clock */
  }
}
export const serverNow = () => new Date(Date.now() + offsetMs);

/** Re-renders on an interval using server-corrected time. */
export function useServerClock(tick: (now: Date) => void, everyMs = 15000) {
  const cb = useRef(tick);
  cb.current = tick;
  useEffect(() => {
    let alive = true;
    const run = () => alive && cb.current(serverNow());
    if (!synced) void syncServerClock().then(run);
    run();
    const id = setInterval(run, everyMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [everyMs]);
}

export function errorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (err instanceof ApiError) {
    if (err.code === 'MFA_REQUIRED') return 'Enrol an authenticator app at /staff/security and sign in again.';
    if (err.code === 'RATE_LIMITED') return 'Too many requests. Please wait a few minutes.';
    return err.message || fallback;
  }
  return fallback;
}
