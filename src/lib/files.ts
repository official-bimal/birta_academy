/**
 * File-upload rules shared by the server (enforcement) and the UI (early feedback).
 * Files are validated by size, an allow-list of types AND their leading bytes (magic numbers), never by name alone.
 */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export const RESOURCE_KINDS = ['roadmap', 'lecture', 'slides', 'notes', 'worksheet', 'project', 'link', 'other'] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

export const KIND_LABEL: Record<ResourceKind, string> = {
  roadmap: 'Course roadmap',
  lecture: 'Lecture PDF',
  slides: 'Slides',
  notes: 'Notes',
  worksheet: 'Worksheet',
  project: 'Project file',
  link: 'External link',
  other: 'Other',
};

interface TypeRule {
  exts: string[];
  /** safe to display in the browser tab; everything else is always a download */
  inline: boolean;
  magic: 'pdf' | 'zip' | 'ole' | 'png' | 'jpeg' | 'text';
}

export const ALLOWED_TYPES: Record<string, TypeRule> = {
  'application/pdf': { exts: ['pdf'], inline: true, magic: 'pdf' },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { exts: ['pptx'], inline: false, magic: 'zip' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { exts: ['docx'], inline: false, magic: 'zip' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { exts: ['xlsx'], inline: false, magic: 'zip' },
  'application/vnd.ms-powerpoint': { exts: ['ppt'], inline: false, magic: 'ole' },
  'application/msword': { exts: ['doc'], inline: false, magic: 'ole' },
  'application/zip': { exts: ['zip'], inline: false, magic: 'zip' },
  'text/plain': { exts: ['txt', 'md'], inline: false, magic: 'text' },
  'image/png': { exts: ['png'], inline: true, magic: 'png' },
  'image/jpeg': { exts: ['jpg', 'jpeg'], inline: true, magic: 'jpeg' },
};

const startsWith = (head: Uint8Array, bytes: number[]) => bytes.every((b, i) => head[i] === b);

function magicMatches(kind: TypeRule['magic'], head: Uint8Array): boolean {
  switch (kind) {
    case 'pdf':
      return startsWith(head, [0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
    case 'zip':
      return startsWith(head, [0x50, 0x4b, 0x03, 0x04]) || startsWith(head, [0x50, 0x4b, 0x05, 0x06]);
    case 'ole':
      return startsWith(head, [0xd0, 0xcf, 0x11, 0xe0]);
    case 'png':
      return startsWith(head, [0x89, 0x50, 0x4e, 0x47]);
    case 'jpeg':
      return startsWith(head, [0xff, 0xd8, 0xff]);
    case 'text':
      return !Array.from(head.slice(0, 512)).includes(0);
  }
}

/** Strips any path, keeps a short safe ASCII name and a lower-case extension. */
export function sanitizeFileName(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? 'file').normalize('NFKD').replace(/[^\x20-\x7e]/g, '');
  const dot = base.lastIndexOf('.');
  const ext = dot > 0 ? base.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) : '';
  const stem = (dot > 0 ? base.slice(0, dot) : base).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').replace(/-{2,}/g, '-').slice(0, 80);
  const safeStem = stem || 'file';
  return ext ? `${safeStem}.${ext}` : safeStem;
}

export type UploadCheck =
  | { ok: true; mime: string; safeName: string; inline: boolean }
  | { ok: false; error: string };

export function validateUpload(input: { name: string; mime: string; size: number; head: Uint8Array; pdfOnly?: boolean }): UploadCheck {
  if (!Number.isFinite(input.size) || input.size <= 0) return { ok: false, error: 'The file is empty.' };
  if (input.size > MAX_UPLOAD_BYTES) return { ok: false, error: `File is too large (limit ${MAX_UPLOAD_BYTES / 1024 / 1024} MB).` };
  const rule = ALLOWED_TYPES[input.mime];
  if (!rule) return { ok: false, error: 'This file type is not allowed. Use PDF, Office documents, ZIP, text or images.' };
  if (input.pdfOnly && input.mime !== 'application/pdf') return { ok: false, error: 'The roadmap must be a PDF file.' };
  const safeName = sanitizeFileName(input.name);
  const ext = safeName.includes('.') ? safeName.split('.').pop()! : '';
  if (!rule.exts.includes(ext)) return { ok: false, error: `The file name must end in .${rule.exts[0]} for this file type.` };
  if (!magicMatches(rule.magic, input.head)) return { ok: false, error: 'The file contents do not match its type.' };
  return { ok: true, mime: input.mime, safeName, inline: rule.inline };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
