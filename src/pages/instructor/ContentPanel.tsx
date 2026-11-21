import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Archive, ArrowDown, ArrowUp, FilePlus2, FileText, RefreshCw, Trash2, Upload } from 'lucide-react';
import { btnGhost, btnPrimary, EmptyState, fieldClass, NoteContent, Notice, Panel, Pill, Progress, Section } from '../../components/lms/ui';
import { deleteResource, errorMessage, listNotes, listResources, patchResource, replaceResourceFile, saveNote, uploadResource, type NoteForm } from '../../lib/lmsApi';
import { deleteBatchLesson, listBatchLessons, listBatchLiveSessions, saveBatchLesson } from '../../lib/firestoreService';
import { formatBytes, KIND_LABEL, MAX_UPLOAD_BYTES, RESOURCE_KINDS, validateUpload } from '../../lib/files';
import { formatNptDateTime, safeHttpUrl } from '../../lib/sessions';
import { useAuth } from '../../context/AuthContext';
import type { Batch, ClassNote, Lesson, LiveSession, Resource, ResourceKindId } from '../../types';

type Msg = { ok: boolean; text: string } | null;

/** Quick client-side check so people get feedback before a large upload starts (the server checks again). */
async function precheck(file: File, pdfOnly: boolean): Promise<string | null> {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const r = validateUpload({ name: file.name, mime: file.type, size: file.size, head, pdfOnly });
  return r.ok ? null : r.error;
}

function UploadForm({ batchId, fixedKind, onDone, onCancel }: { batchId: string; fixedKind?: ResourceKindId; onDone: () => void; onCancel: () => void }) {
  const [kind, setKind] = useState<ResourceKindId>(fixedKind ?? 'lecture');
  const [title, setTitle] = useState(fixedKind === 'roadmap' ? 'Course Roadmap' : '');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [publish, setPublish] = useState(false);
  const [allowDownload, setAllowDownload] = useState(true);
  const [pct, setPct] = useState<number | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const isLink = kind === 'link';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (!isLink) {
      if (!file) return setMsg({ ok: false, text: 'Choose a file.' });
      const bad = await precheck(file, kind === 'roadmap');
      if (bad) return setMsg({ ok: false, text: bad });
    } else if (!safeHttpUrl(url)) return setMsg({ ok: false, text: 'Enter a valid https link.' });
    setPct(0);
    try {
      await uploadResource(batchId, { file: file ?? undefined, kind, title: title || (file?.name ?? ''), description, published: publish, allowDownload, externalUrl: isLink ? url : undefined }, setPct);
      onDone();
    } catch (err) {
      setMsg({ ok: false, text: errorMessage(err) });
      setPct(null);
    }
  };

  return (
    <Panel className="p-4 mb-4">
      <form onSubmit={(e) => void submit(e)} className="space-y-3">
        <p className="text-sm font-semibold">{fixedKind === 'roadmap' ? 'Upload roadmap (PDF)' : 'Upload resource'}</p>
        {msg && <Notice kind={msg.ok ? 'ok' : 'error'}>{msg.text}</Notice>}
        <div className="grid sm:grid-cols-2 gap-3">
          {!fixedKind && (
            <label className="text-xs font-medium">Type
              <select className={`${fieldClass} mt-1`} value={kind} onChange={(e) => setKind(e.target.value as ResourceKindId)}>
                {RESOURCE_KINDS.filter((k) => k !== 'roadmap').map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
              </select>
            </label>
          )}
          <label className="text-xs font-medium">Title<input className={`${fieldClass} mt-1`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Day 1 lecture" maxLength={140} /></label>
        </div>
        <label className="text-xs font-medium block">Description (optional)<input className={`${fieldClass} mt-1`} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} /></label>
        {isLink ? (
          <label className="text-xs font-medium block">Link<input className={`${fieldClass} mt-1`} type="url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} /></label>
        ) : (
          <label className="text-xs font-medium block">File ({fixedKind === 'roadmap' ? 'PDF' : 'PDF, Office, ZIP, text, image'}, up to {MAX_UPLOAD_BYTES / 1024 / 1024} MB)
            <input className={`${fieldClass} mt-1`} type="file" accept={fixedKind === 'roadmap' ? 'application/pdf,.pdf' : undefined} onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, '')); }} />
            {file && <span className="text-slate-500">{file.name} · {formatBytes(file.size)}</span>}
          </label>
        )}
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs">
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} /> Publish to students now</label>
          {!isLink && <label className="inline-flex items-center gap-2"><input type="checkbox" checked={allowDownload} onChange={(e) => setAllowDownload(e.target.checked)} /> Allow download</label>}
        </div>
        {pct !== null && <div className="space-y-1" aria-live="polite"><Progress value={pct} /><p className="text-xs text-slate-500">Uploading… {pct}%</p></div>}
        <div className="flex gap-2">
          <button className={btnPrimary} disabled={pct !== null}><Upload className="w-4 h-4" aria-hidden="true" />{isLink ? 'Add link' : 'Upload'}</button>
          <button type="button" className={btnGhost} onClick={onCancel} disabled={pct !== null}>Cancel</button>
        </div>
      </form>
    </Panel>
  );
}

function ResourceControls({ r, batchId, siblings, onChanged, onMsg }: { r: Resource; batchId: string; siblings: Resource[]; onChanged: () => void; onMsg: (m: Msg) => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [pct, setPct] = useState<number | null>(null);
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) onMsg({ ok: true, text: ok });
      onChanged();
    } catch (e) {
      onMsg({ ok: false, text: errorMessage(e) });
    }
  };
  const idx = siblings.findIndex((x) => x.id === r.id);
  const swap = (other: Resource | undefined) => other && run(async () => { await patchResource(batchId, r.id, { order: other.order }); await patchResource(batchId, other.id, { order: r.order }); });

  return (
    <div className="p-3.5 space-y-2">
      <div className="flex items-start gap-3">
        <FileText className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{r.title}</p>
          <p className="text-xs text-slate-500 truncate">{KIND_LABEL[r.kind]}{r.fileName ? ` · ${r.fileName}` : ''}{r.size ? ` · ${formatBytes(r.size)}` : ''}{r.version > 1 ? ` · v${r.version}` : ''}{r.uploadedByName ? ` · by ${r.uploadedByName}` : ''}</p>
        </div>
        {r.archived ? <Pill tone="neutral">Archived</Pill> : r.published ? <Pill tone="good">Published</Pill> : <Pill tone="warn">Draft</Pill>}
      </div>
      {pct !== null && <Progress value={pct} />}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs pl-7">
        {!r.archived && <button type="button" className="font-semibold text-brand-700 dark:text-brand-400" onClick={() => void run(() => patchResource(batchId, r.id, { published: !r.published }))}>{r.published ? 'Unpublish' : 'Publish'}</button>}
        {!r.archived && r.kind !== 'link' && <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={r.allowDownload !== false} onChange={(e) => void run(() => patchResource(batchId, r.id, { allowDownload: e.target.checked }))} /> Download</label>}
        {!r.archived && r.kind !== 'link' && (
          <>
            <button type="button" className="inline-flex items-center gap-1" onClick={() => fileInput.current?.click()}><RefreshCw className="w-3 h-3" aria-hidden="true" />Replace file</button>
            <input ref={fileInput} type="file" className="hidden" onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              const bad = await precheck(f, r.kind === 'roadmap');
              if (bad) return onMsg({ ok: false, text: bad });
              setPct(0);
              await run(() => replaceResourceFile(batchId, r.id, f, setPct), 'File replaced.');
              setPct(null);
            }} />
          </>
        )}
        {!r.archived && <>
          <button type="button" aria-label="Move up" disabled={idx <= 0} onClick={() => void swap(siblings[idx - 1])} className="disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
          <button type="button" aria-label="Move down" disabled={idx < 0 || idx >= siblings.length - 1} onClick={() => void swap(siblings[idx + 1])} className="disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
        </>}
        <button type="button" className="inline-flex items-center gap-1" onClick={() => void run(() => patchResource(batchId, r.id, { archived: !r.archived }))}><Archive className="w-3 h-3" aria-hidden="true" />{r.archived ? 'Restore' : 'Archive'}</button>
        <button type="button" className="inline-flex items-center gap-1 text-red-700 dark:text-red-400" onClick={() => { if (window.confirm(`Permanently delete "${r.title}"? Students will lose access.`)) void run(() => deleteResource(batchId, r.id), 'Deleted.'); }}><Trash2 className="w-3 h-3" aria-hidden="true" />Delete</button>
      </div>
    </div>
  );
}

const emptyNote = (): NoteForm => ({ title: '', description: '', date: new Date().toISOString().slice(0, 10), sessionId: '', moduleTitle: '', content: '', attachmentIds: [], links: [], status: 'draft' });

function NoteEditor({ batchId, note, resources, sessions, onDone, onCancel }: { batchId: string; note: ClassNote | null; resources: Resource[]; sessions: LiveSession[]; onDone: () => void; onCancel: () => void }) {
  const [f, setF] = useState<NoteForm>(note ? { title: note.title, description: note.description ?? '', date: note.date ?? '', sessionId: note.sessionId ?? '', moduleTitle: note.moduleTitle ?? '', content: note.content, attachmentIds: note.attachmentIds ?? [], links: note.links ?? [], status: note.status } : emptyNote());
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const save = async (status: 'draft' | 'published') => {
    setBusy(true);
    setMsg(null);
    try {
      await saveNote(batchId, note?.id ?? null, { ...f, status, sessionId: f.sessionId || undefined });
      onDone();
    } catch (e) {
      setMsg({ ok: false, text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel className="p-4 mb-4 space-y-3">
      <p className="text-sm font-semibold">{note ? 'Edit note' : 'New class note'} {note?.status === 'published' && <span className="text-xs font-normal text-slate-500">(published; students see your changes immediately)</span>}</p>
      {msg && <Notice kind="error">{msg.text}</Notice>}
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="text-xs font-medium sm:col-span-2">Title<input className={`${fieldClass} mt-1`} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Day 1 — Introduction to Digital Marketing" maxLength={140} /></label>
        <label className="text-xs font-medium">Date<input className={`${fieldClass} mt-1`} type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
        <label className="text-xs font-medium">Module (optional)<input className={`${fieldClass} mt-1`} value={f.moduleTitle} onChange={(e) => setF({ ...f, moduleTitle: e.target.value })} maxLength={100} /></label>
        <label className="text-xs font-medium sm:col-span-2">Related class (optional)
          <select className={`${fieldClass} mt-1`} value={f.sessionId ?? ''} onChange={(e) => setF({ ...f, sessionId: e.target.value })}>
            <option value="">None</option>
            {sessions.map((s) => <option key={s.id} value={s.id}>{s.title} · {formatNptDateTime(s.scheduledStart)}</option>)}
          </select>
        </label>
      </div>
      <label className="text-xs font-medium block">Short description<input className={`${fieldClass} mt-1`} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={300} /></label>
      <label className="text-xs font-medium block">Notes<textarea className={`${fieldClass} mt-1 font-mono`} rows={8} value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} placeholder={'Write the notes. Use "- " for bullet points and **bold** for emphasis. Web links become clickable.'} maxLength={20000} /></label>
      {resources.length > 0 && (
        <fieldset className="text-xs">
          <legend className="font-medium mb-1">Attach files</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5">
            {resources.filter((r) => !r.archived).map((r) => (
              <label key={r.id} className="inline-flex items-center gap-2"><input type="checkbox" checked={f.attachmentIds.includes(r.id)} onChange={(e) => setF({ ...f, attachmentIds: e.target.checked ? [...f.attachmentIds, r.id] : f.attachmentIds.filter((x) => x !== r.id) })} />{r.title}{!r.published && <span className="text-amber-700">(draft)</span>}</label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="space-y-2">
        <p className="text-xs font-medium">External links</p>
        {f.links.map((l, i) => (
          <div key={i} className="flex gap-2">
            <input className={fieldClass} placeholder="Label" value={l.label} onChange={(e) => setF({ ...f, links: f.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
            <input className={fieldClass} type="url" placeholder="https://…" value={l.url} onChange={(e) => setF({ ...f, links: f.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} />
            <button type="button" aria-label="Remove link" onClick={() => setF({ ...f, links: f.links.filter((_, j) => j !== i) })}><Trash2 className="w-4 h-4 text-slate-500" /></button>
          </div>
        ))}
        {f.links.length < 10 && <button type="button" className="text-xs font-semibold text-brand-700 dark:text-brand-400" onClick={() => setF({ ...f, links: [...f.links, { label: '', url: '' }] })}>+ Add link</button>}
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        <button className={btnPrimary} disabled={busy} onClick={() => void save('published')} type="button">{note?.status === 'published' ? 'Save changes' : 'Publish to students'}</button>
        <button className={btnGhost} disabled={busy} onClick={() => void save('draft')} type="button">{note?.status === 'published' ? 'Unpublish (save as draft)' : 'Save draft'}</button>
        <button className={btnGhost} disabled={busy} onClick={onCancel} type="button">Cancel</button>
      </div>
    </Panel>
  );
}

export function ContentPanel({ batch, startWith }: { batch: Batch; /** open the upload form straight away (from the workspace header) */ startWith?: 'resource' | 'roadmap' | null }) {
  const { profile } = useAuth();
  const [resources, setResources] = useState<Resource[]>([]);
  const [notes, setNotes] = useState<ClassNote[]>([]);
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [form, setForm] = useState<'resource' | 'roadmap' | null>(startWith ?? null);
  const [editing, setEditing] = useState<ClassNote | 'new' | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [lesson, setLesson] = useState({ title: '', moduleTitle: 'Module 1', videoUrl: '', contentSummary: '' });

  const load = useCallback(async () => {
    try {
      const [r, n, s, l] = await Promise.all([listResources(batch.id, false), listNotes(batch.id, false), listBatchLiveSessions(batch.id), listBatchLessons(batch.id)]);
      setResources(r);
      setNotes(n);
      setSessions(s);
      setLessons(l);
    } catch (e) {
      setMsg({ ok: false, text: errorMessage(e, 'Could not load content.') });
    }
  }, [batch.id]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (startWith) setForm(startWith); }, [startWith]);

  const roadmap = resources.filter((r) => r.kind === 'roadmap' && !r.archived).sort((a, b) => b.version - a.version)[0];
  const others = resources.filter((r) => r.kind !== 'roadmap' && (showArchived || !r.archived));
  const active = others.filter((r) => !r.archived);

  const addLesson = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    if (lesson.videoUrl && !safeHttpUrl(lesson.videoUrl)) return setMsg({ ok: false, text: 'Enter a valid https video link.' });
    try {
      await saveBatchLesson({ courseId: batch.courseId, batchId: batch.id, instructorId: batch.instructorId, title: lesson.title, moduleTitle: lesson.moduleTitle, orderIndex: lessons.length + 1, contentSummary: lesson.contentSummary, videoUrl: lesson.videoUrl || undefined, durationMinutes: 45 });
      setLesson({ ...lesson, title: '', videoUrl: '', contentSummary: '' });
      await load();
    } catch (err) {
      setMsg({ ok: false, text: errorMessage(err, 'Could not save the lesson.') });
    }
  };

  return (
    <>
      {msg && <div className="mb-4"><Notice kind={msg.ok ? 'ok' : 'error'}>{msg.text}</Notice></div>}

      <Section title="Course roadmap" action={<button type="button" className={btnGhost} onClick={() => setForm('roadmap')}><Upload className="w-4 h-4" aria-hidden="true" />{roadmap ? 'Upload new roadmap' : 'Upload roadmap'}</button>}>
        {form === 'roadmap' && <UploadForm batchId={batch.id} fixedKind="roadmap" onCancel={() => setForm(null)} onDone={() => { setForm(null); setMsg({ ok: true, text: 'Roadmap uploaded. Publish it when you are ready.' }); void load(); }} />}
        {roadmap ? <Panel><ResourceControls r={roadmap} batchId={batch.id} siblings={[]} onChanged={() => void load()} onMsg={setMsg} /></Panel> : <EmptyState title="No roadmap yet" text="Upload a PDF that students see first on their course page." />}
      </Section>

      <Section title="Resources" action={<div className="flex items-center gap-3"><label className="text-xs inline-flex items-center gap-1.5"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived</label><button type="button" className={btnGhost} onClick={() => setForm('resource')}><FilePlus2 className="w-4 h-4" aria-hidden="true" />Upload resource</button></div>}>
        {form === 'resource' && <UploadForm batchId={batch.id} onCancel={() => setForm(null)} onDone={() => { setForm(null); setMsg({ ok: true, text: 'Uploaded.' }); void load(); }} />}
        {others.length === 0 ? <EmptyState title="No resources yet" text="Lecture PDFs, slides, worksheets, project files and links." /> : (
          <Panel className="divide-y divide-slate-100 dark:divide-slate-800">{others.map((r) => <ResourceControls key={r.id} r={r} batchId={batch.id} siblings={active} onChanged={() => void load()} onMsg={setMsg} />)}</Panel>
        )}
      </Section>

      <Section title="Daily class notes" action={<button type="button" className={btnGhost} onClick={() => setEditing('new')}>New note</button>}>
        {editing && <NoteEditor key={editing === 'new' ? 'new' : editing.id} batchId={batch.id} note={editing === 'new' ? null : editing} resources={resources} sessions={sessions} onCancel={() => setEditing(null)} onDone={() => { setEditing(null); setMsg({ ok: true, text: 'Note saved.' }); void load(); }} />}
        {notes.length === 0 ? <EmptyState title="No notes yet" text="Publish notes after each class so students can catch up." /> : (
          <Panel className="divide-y divide-slate-100 dark:divide-slate-800">
            {notes.map((n) => (
              <div key={n.id} className="p-3.5 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{n.title}</p>
                  <p className="text-xs text-slate-500">{n.date || 'Undated'}{n.moduleTitle ? ` · ${n.moduleTitle}` : ''}{(n.revision ?? 1) > 1 ? ` · ${n.revision} revisions` : ''}</p>
                  {n.content && <details className="mt-1"><summary className="text-xs text-slate-500 cursor-pointer">Preview</summary><div className="mt-2"><NoteContent text={n.content} /></div></details>}
                </div>
                <Pill tone={n.status === 'published' ? 'good' : 'warn'}>{n.status === 'published' ? 'Published' : 'Draft'}</Pill>
                <button type="button" className="text-xs font-semibold text-brand-700 dark:text-brand-400" onClick={() => setEditing(n)}>Edit</button>
              </div>
            ))}
          </Panel>
        )}
      </Section>

      <Section title="Recorded lessons and modules">
        <Panel className="p-4 space-y-4">
          <form onSubmit={(e) => void addLesson(e)} className="grid sm:grid-cols-2 gap-3">
            <input className={fieldClass} required placeholder="Lesson title" value={lesson.title} onChange={(e) => setLesson({ ...lesson, title: e.target.value })} maxLength={140} />
            <input className={fieldClass} placeholder="Module (e.g. Module 1)" value={lesson.moduleTitle} onChange={(e) => setLesson({ ...lesson, moduleTitle: e.target.value })} maxLength={100} />
            <input className={fieldClass} type="url" placeholder="Video link (https, optional)" value={lesson.videoUrl} onChange={(e) => setLesson({ ...lesson, videoUrl: e.target.value })} />
            <input className={fieldClass} placeholder="Short summary (optional)" value={lesson.contentSummary} onChange={(e) => setLesson({ ...lesson, contentSummary: e.target.value })} maxLength={300} />
            <div className="sm:col-span-2"><button className={btnGhost}>Add lesson</button></div>
          </form>
          {lessons.length > 0 && (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              {lessons.map((l) => (
                <li key={l.id} className="py-2 flex items-center justify-between gap-3"><span className="truncate">{l.moduleTitle} · {l.title}</span><button type="button" aria-label={`Remove ${l.title}`} onClick={() => void deleteBatchLesson(batch.id, l.id).then(load)}><Trash2 className="w-4 h-4 text-slate-500" /></button></li>
              ))}
            </ul>
          )}
          <p className="text-xs text-slate-500">Students tick lessons off to track progress. Video links should point to a restricted or unlisted video; they are visible only to enrolled students here.</p>
        </Panel>
      </Section>
    </>
  );
}
