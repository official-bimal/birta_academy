import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Archive, ChevronDown, ChevronRight, ImagePlus, Plus } from 'lucide-react';
import { btnGhost, btnPrimary, EmptyState, fieldClass, Notice, Panel, Pill, Progress } from '../../components/lms/ui';
import { errorMessage, saveBatch, saveCourse, saveCourseThumbnail } from '../../lib/lmsApi';
import { formatNpr } from '../../lib/validation';
import type { Batch, Category, Course, Enrollment, UserProfile } from '../../types';

interface Props {
  courses: Course[];
  batches: Batch[];
  categories: Category[];
  users: UserProfile[];
  enrollments: Enrollment[];
  onChanged: () => Promise<void>;
}

type Msg = { ok: boolean; text: string } | null;
const courseStatus = (c: Course) => (c.archived ? 'archived' : c.published ? 'published' : 'draft');
const blankCourse = { id: '', title: '', subtitle: '', categoryId: '', level: 'Beginner', durationWeeks: 8, priceNpr: 0, description: '', outcomes: '', syllabus: '', status: 'draft', isDemo: false };
const blankBatch = { id: '', name: '', startDate: '', endDate: '', scheduleText: '', seatLimit: 20, priceNpr: '', instructorId: '', status: 'draft', isDemo: false };

export function AdminCatalogPanel({ courses, batches, categories, users, enrollments, onChanged }: Props) {
  const [msg, setMsg] = useState<Msg>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [courseForm, setCourseForm] = useState<typeof blankCourse | null>(null);
  const [batchFor, setBatchFor] = useState<{ courseId: string; form: typeof blankBatch } | null>(null);
  const [busy, setBusy] = useState(false);
  const [thumbPct, setThumbPct] = useState<number | null>(null);
  const thumbRef = useRef<HTMLInputElement>(null);
  const thumbTarget = useRef<string>('');
  const instructors = useMemo(() => users.filter((u) => u.role === 'instructor'), [users]);
  const showArchived = useState(false);

  const editCourse = (c: Course) =>
    setCourseForm({ id: c.id, title: c.title, subtitle: c.subtitle ?? '', categoryId: c.categoryId, level: c.level, durationWeeks: c.durationWeeks, priceNpr: c.priceNpr, description: c.description, outcomes: (c.outcomes ?? []).join('\n'), syllabus: (c.syllabus ?? []).join('\n'), status: courseStatus(c), isDemo: c.isDemo });

  const submitCourse = async (e: FormEvent) => {
    e.preventDefault();
    if (!courseForm) return;
    setBusy(true);
    setMsg(null);
    try {
      const cat = categories.find((c) => c.id === courseForm.categoryId);
      await saveCourse({
        id: courseForm.id || undefined,
        title: courseForm.title,
        subtitle: courseForm.subtitle,
        categoryId: courseForm.categoryId,
        categoryName: cat?.name ?? courseForm.categoryId,
        level: courseForm.level as Course['level'],
        durationWeeks: Number(courseForm.durationWeeks),
        priceNpr: Number(courseForm.priceNpr),
        description: courseForm.description,
        outcomes: courseForm.outcomes.split('\n'),
        syllabus: courseForm.syllabus.split('\n'),
        status: courseForm.status as 'draft' | 'published' | 'archived',
        isDemo: courseForm.isDemo,
      });
      setCourseForm(null);
      setMsg({ ok: true, text: 'Course saved.' });
      await onChanged();
    } catch (err) {
      setMsg({ ok: false, text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (c: Course, status: 'draft' | 'published' | 'archived') => {
    try {
      await saveCourse({ id: c.id, title: c.title, subtitle: c.subtitle, categoryId: c.categoryId, categoryName: c.categoryName, level: c.level, durationWeeks: c.durationWeeks, priceNpr: c.priceNpr, description: c.description, outcomes: c.outcomes, syllabus: c.syllabus, status, isDemo: c.isDemo });
      setMsg({ ok: true, text: status === 'published' ? 'Course published.' : status === 'archived' ? 'Course archived.' : 'Course unpublished.' });
      await onChanged();
    } catch (err) {
      setMsg({ ok: false, text: errorMessage(err) });
    }
  };

  const submitBatch = async (e: FormEvent) => {
    e.preventDefault();
    if (!batchFor) return;
    const f = batchFor.form;
    setBusy(true);
    setMsg(null);
    try {
      await saveBatch({
        id: f.id || undefined,
        courseId: batchFor.courseId,
        name: f.name,
        startDate: f.startDate,
        endDate: f.endDate,
        scheduleText: f.scheduleText,
        seatLimit: Number(f.seatLimit),
        priceNpr: f.priceNpr === '' ? undefined : Number(f.priceNpr),
        instructorId: f.instructorId,
        status: f.status as Batch['status'] & ('draft' | 'upcoming' | 'ongoing' | 'completed' | 'archived'),
        isDemo: f.isDemo,
      });
      setBatchFor(null);
      setMsg({ ok: true, text: 'Batch saved.' });
      await onChanged();
    } catch (err) {
      setMsg({ ok: false, text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const onThumb = async (file: File | undefined) => {
    if (!file || !thumbTarget.current) return;
    setThumbPct(0);
    try {
      await saveCourseThumbnail(thumbTarget.current, file, setThumbPct);
      setMsg({ ok: true, text: 'Thumbnail updated.' });
      await onChanged();
    } catch (err) {
      setMsg({ ok: false, text: errorMessage(err) });
    } finally {
      setThumbPct(null);
    }
  };

  void showArchived;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600 dark:text-slate-400">Create courses, open batches and assign instructors. Only you can do this; instructors work inside the batches you assign.</p>
        <button type="button" className={btnPrimary} onClick={() => setCourseForm({ ...blankCourse, categoryId: categories[0]?.id ?? '' })}><Plus className="w-4 h-4" aria-hidden="true" />New course</button>
      </div>
      {msg && <Notice kind={msg.ok ? 'ok' : 'error'}>{msg.text}</Notice>}
      <input ref={thumbRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => { void onThumb(e.target.files?.[0]); e.target.value = ''; }} />
      {thumbPct !== null && <div><Progress value={thumbPct} /><p className="text-xs text-slate-500 mt-1">Uploading thumbnail… {thumbPct}%</p></div>}

      {courseForm && (
        <Panel className="p-5">
          <form onSubmit={(e) => void submitCourse(e)} className="space-y-4">
            <h2 className="text-sm font-semibold">{courseForm.id ? 'Edit course' : 'New course'}</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="text-xs font-medium sm:col-span-2">Title<input className={`${fieldClass} mt-1`} required minLength={3} maxLength={120} value={courseForm.title} onChange={(e) => setCourseForm({ ...courseForm, title: e.target.value })} /></label>
              <label className="text-xs font-medium sm:col-span-2">Subtitle<input className={`${fieldClass} mt-1`} maxLength={200} value={courseForm.subtitle} onChange={(e) => setCourseForm({ ...courseForm, subtitle: e.target.value })} /></label>
              <label className="text-xs font-medium">Category
                <select className={`${fieldClass} mt-1`} required value={courseForm.categoryId} onChange={(e) => setCourseForm({ ...courseForm, categoryId: e.target.value })}>
                  <option value="" disabled>Choose…</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label className="text-xs font-medium">Level
                <select className={`${fieldClass} mt-1`} value={courseForm.level} onChange={(e) => setCourseForm({ ...courseForm, level: e.target.value })}>{['Beginner', 'Intermediate', 'Advanced'].map((l) => <option key={l}>{l}</option>)}</select>
              </label>
              <label className="text-xs font-medium">Duration (weeks)<input className={`${fieldClass} mt-1`} type="number" min={1} max={52} value={courseForm.durationWeeks} onChange={(e) => setCourseForm({ ...courseForm, durationWeeks: Number(e.target.value) })} /></label>
              <label className="text-xs font-medium">Price (NPR)<input className={`${fieldClass} mt-1`} type="number" min={0} max={500000} step={1} value={courseForm.priceNpr} onChange={(e) => setCourseForm({ ...courseForm, priceNpr: Number(e.target.value) })} /></label>
            </div>
            <label className="text-xs font-medium block">Description<textarea className={`${fieldClass} mt-1`} rows={3} required minLength={10} maxLength={2000} value={courseForm.description} onChange={(e) => setCourseForm({ ...courseForm, description: e.target.value })} /></label>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="text-xs font-medium">Learning outcomes (one per line)<textarea className={`${fieldClass} mt-1`} rows={4} value={courseForm.outcomes} onChange={(e) => setCourseForm({ ...courseForm, outcomes: e.target.value })} /></label>
              <label className="text-xs font-medium">Syllabus modules (one per line)<textarea className={`${fieldClass} mt-1`} rows={4} value={courseForm.syllabus} onChange={(e) => setCourseForm({ ...courseForm, syllabus: e.target.value })} /></label>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <label className="text-xs font-medium">Status
                <select className={`${fieldClass} mt-1 !w-auto`} value={courseForm.status} onChange={(e) => setCourseForm({ ...courseForm, status: e.target.value })}>
                  <option value="draft">Draft (hidden)</option><option value="published">Published</option><option value="archived">Archived</option>
                </select>
              </label>
              <label className="inline-flex items-center gap-2 text-xs"><input type="checkbox" checked={courseForm.isDemo} onChange={(e) => setCourseForm({ ...courseForm, isDemo: e.target.checked })} /> Mark as test / demo data</label>
            </div>
            <div className="flex gap-2"><button className={btnPrimary} disabled={busy}>Save course</button><button type="button" className={btnGhost} onClick={() => setCourseForm(null)}>Cancel</button></div>
          </form>
        </Panel>
      )}

      {courses.length === 0 ? <EmptyState title="No courses yet" text="Create your first course, then open a batch and assign an instructor." /> : (
        <Panel className="divide-y divide-slate-100 dark:divide-slate-800">
          {courses.map((c) => {
            const cb = batches.filter((b) => b.courseId === c.id);
            const expanded = open === c.id;
            const st = courseStatus(c);
            return (
              <div key={c.id}>
                <div className="flex flex-wrap items-center gap-3 p-4">
                  <button type="button" onClick={() => setOpen(expanded ? null : c.id)} aria-expanded={expanded} className="text-slate-500" aria-label={expanded ? 'Collapse' : 'Expand'}>{expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</button>
                  {c.thumbnailUrl ? <img src={c.thumbnailUrl} alt="" className="w-12 h-9 rounded object-cover bg-slate-100" /> : <div className="w-12 h-9 rounded bg-slate-100 dark:bg-slate-800" aria-hidden="true" />}
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="text-sm font-semibold truncate">{c.title}{c.isDemo && <span className="ml-2 text-xs font-normal text-amber-700">test data</span>}</p>
                    <p className="text-xs text-slate-500 truncate">{c.categoryName} · {c.level} · {c.durationWeeks} wk · {formatNpr(c.priceNpr)} · {cb.length} batch{cb.length === 1 ? '' : 'es'}</p>
                  </div>
                  <Pill tone={st === 'published' ? 'good' : st === 'archived' ? 'neutral' : 'warn'}>{st}</Pill>
                  <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-brand-700 dark:text-brand-400">
                    <button type="button" onClick={() => editCourse(c)}>Edit</button>
                    <button type="button" className="inline-flex items-center gap-1" onClick={() => { thumbTarget.current = c.id; thumbRef.current?.click(); }}><ImagePlus className="w-3.5 h-3.5" aria-hidden="true" />Thumbnail</button>
                    {st !== 'published' && st !== 'archived' && <button type="button" onClick={() => void setStatus(c, 'published')}>Publish</button>}
                    {st === 'published' && <button type="button" onClick={() => void setStatus(c, 'draft')}>Unpublish</button>}
                    {st !== 'archived' ? <button type="button" className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-400" onClick={() => { if (window.confirm('Archive this course? It disappears from the website; existing students keep their access.')) void setStatus(c, 'archived'); }}><Archive className="w-3.5 h-3.5" aria-hidden="true" />Archive</button> : <button type="button" onClick={() => void setStatus(c, 'draft')}>Restore</button>}
                  </div>
                </div>

                {expanded && (
                  <div className="px-4 pb-4 pl-12 space-y-3">
                    {cb.length === 0 ? <p className="text-sm text-slate-500">No batches yet.</p> : cb.map((b) => {
                      const enrolled = enrollments.filter((e) => e.batchId === b.id && (e.enrollmentStatus === 'approved' || e.enrollmentStatus === 'completed'));
                      const pending = enrollments.filter((e) => e.batchId === b.id && e.enrollmentStatus === 'pending').length;
                      return (
                        <div key={b.id} className="rounded-lg border border-slate-200 dark:border-slate-800 p-3.5 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-medium">{b.name} <Pill tone={b.status === 'draft' ? 'warn' : b.status === 'archived' ? 'neutral' : 'brand'}>{b.status}</Pill></p>
                              <p className="text-xs text-slate-500">{b.startDate} → {b.endDate} · {enrolled.length}/{b.seatLimit} seats{pending ? ` · ${pending} pending` : ''} · Instructor: {b.instructorName || <span className="text-amber-700">not assigned</span>}</p>
                            </div>
                            <button type="button" className="text-xs font-semibold text-brand-700 dark:text-brand-400" onClick={() => setBatchFor({ courseId: c.id, form: { id: b.id, name: b.name, startDate: b.startDate, endDate: b.endDate, scheduleText: b.scheduleText, seatLimit: b.seatLimit, priceNpr: String(b.priceNpr), instructorId: b.instructorId, status: b.status, isDemo: b.isDemo } })}>Edit / reassign</button>
                          </div>
                          {enrolled.length > 0 && <details className="text-xs"><summary className="cursor-pointer text-slate-500">Enrolled students ({enrolled.length})</summary><ul className="mt-1.5 space-y-0.5">{enrolled.map((e) => <li key={e.id}>{e.studentName} · {e.studentEmail}</li>)}</ul></details>}
                        </div>
                      );
                    })}
                    <button type="button" className={btnGhost} onClick={() => setBatchFor({ courseId: c.id, form: { ...blankBatch, priceNpr: String(c.priceNpr) } })}><Plus className="w-4 h-4" aria-hidden="true" />New batch</button>
                    {batchFor?.courseId === c.id && (
                      <Panel className="p-4">
                        <form onSubmit={(e) => void submitBatch(e)} className="space-y-3">
                          <h3 className="text-sm font-semibold">{batchFor.form.id ? 'Edit batch' : 'New batch'}</h3>
                          <div className="grid sm:grid-cols-2 gap-3">
                            <label className="text-xs font-medium sm:col-span-2">Batch name<input className={`${fieldClass} mt-1`} required minLength={3} maxLength={120} value={batchFor.form.name} onChange={(e) => setBatchFor({ ...batchFor, form: { ...batchFor.form, name: e.target.value } })} /></label>
                            <label className="text-xs font-medium">Start date<input className={`${fieldClass} mt-1`} type="date" required value={batchFor.form.startDate} onChange={(e) => setBatchFor({ ...batchFor, form: { ...batchFor.form, startDate: e.target.value } })} /></label>
                            <label className="text-xs font-medium">End date<input className={`${fieldClass} mt-1`} type="date" required value={batchFor.form.endDate} onChange={(e) => setBatchFor({ ...batchFor, form: { ...batchFor.form, endDate: e.target.value } })} /></label>
                            <label className="text-xs font-medium sm:col-span-2">Schedule text<input className={`${fieldClass} mt-1`} maxLength={120} placeholder="Sun–Fri, 7:00 PM Nepal time" value={batchFor.form.scheduleText} onChange={(e) => setBatchFor({ ...batchFor, form: { ...batchFor.form, scheduleText: e.target.value } })} /></label>
                            <label className="text-xs font-medium">Capacity<input className={`${fieldClass} mt-1`} type="number" min={1} max={500} value={batchFor.form.seatLimit} onChange={(e) => setBatchFor({ ...batchFor, form: { ...batchFor.form, seatLimit: Number(e.target.value) } })} /></label>
                            <label className="text-xs font-medium">Fee (NPR)<input className={`${fieldClass} mt-1`} type="number" min={0} value={batchFor.form.priceNpr} onChange={(e) => setBatchFor({ ...batchFor, form: { ...batchFor.form, priceNpr: e.target.value } })} /></label>
                            <label className="text-xs font-medium">Instructor
                              <select className={`${fieldClass} mt-1`} value={batchFor.form.instructorId} onChange={(e) => setBatchFor({ ...batchFor, form: { ...batchFor.form, instructorId: e.target.value } })}>
                                <option value="">Not assigned</option>
                                {instructors.map((u) => <option key={u.uid} value={u.uid}>{u.displayName} ({u.email})</option>)}
                              </select>
                            </label>
                            <label className="text-xs font-medium">Status
                              <select className={`${fieldClass} mt-1`} value={batchFor.form.status} onChange={(e) => setBatchFor({ ...batchFor, form: { ...batchFor.form, status: e.target.value } })}>
                                <option value="draft">Draft (hidden)</option><option value="upcoming">Upcoming (open for enrolment)</option><option value="ongoing">Ongoing</option><option value="completed">Completed</option><option value="archived">Archived</option>
                              </select>
                            </label>
                          </div>
                          {instructors.length === 0 && <p className="text-xs text-amber-700">No instructors yet. Invite one from the Instructors tab first.</p>}
                          <label className="inline-flex items-center gap-2 text-xs"><input type="checkbox" checked={batchFor.form.isDemo} onChange={(e) => setBatchFor({ ...batchFor, form: { ...batchFor.form, isDemo: e.target.checked } })} /> Mark as test / demo data</label>
                          <div className="flex gap-2"><button className={btnPrimary} disabled={busy}>Save batch</button><button type="button" className={btnGhost} onClick={() => setBatchFor(null)}>Cancel</button></div>
                        </form>
                      </Panel>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </Panel>
      )}
    </div>
  );
}
