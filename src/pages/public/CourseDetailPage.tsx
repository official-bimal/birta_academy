import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Clock, ShieldCheck } from 'lucide-react';
import { PublicLayout } from '../../components/PublicLayout';
import { MediaFrame } from '../../components/MediaFrame';
import { useCatalog } from '../../context/CatalogContext';
import { useAuth } from '../../context/AuthContext';
import { submitEnrollmentApplication } from '../../lib/firestoreService';
import { parseFirestoreErrorMessage } from '../../lib/firebase';
import { formatDateValue, formatNpr } from '../../lib/validation';
import type { PaymentMethod } from '../../types';

export function CourseDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const { courses, batches, instructors, settings, usingFallbackDemo } = useCatalog();
  const { profile, signInWithGoogle } = useAuth();

  const course = useMemo(() => courses.find((c) => c.slug === slug) || null, [courses, slug]);
  const courseBatches = useMemo(
    () => (course ? batches.filter((b) => b.courseId === course.id) : []),
    [batches, course]
  );
  const instructor = useMemo(
    () => (course ? instructors.find((i) => i.id === course.instructorId) || null : null),
    [instructors, course]
  );

  const requestedBatchId = searchParams.get('batch');
  const [selectedBatchId, setSelectedBatchId] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('bank_transfer');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);

  useEffect(() => {
    if (requestedBatchId && courseBatches.some((b) => b.id === requestedBatchId)) {
      setSelectedBatchId(requestedBatchId);
    } else if (courseBatches.length > 0) {
      setSelectedBatchId(courseBatches[0].id);
    } else {
      setSelectedBatchId('');
    }
  }, [requestedBatchId, courseBatches]);

  const activeBatch = courseBatches.find((b) => b.id === selectedBatchId) || null;

  const handleEnrollSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessId(null);

    if (!course || !activeBatch) {
      setErrorMsg('Please select an available live batch first.');
      return;
    }
    if (usingFallbackDemo) {
      setErrorMsg(
        'This course is currently in Demo Preview mode. An Academy Admin must seed or create live courses in the Admin Console before enrollments can be recorded in Firestore.'
      );
      return;
    }
    if (!profile) {
      setErrorMsg('Please sign in with Google to submit your enrollment application.');
      return;
    }
    if (paymentReference.trim().length < 3) {
      setErrorMsg('Enter your Bank Transfer, eSewa, or Khalti transaction reference ID (min 3 characters).');
      return;
    }

    setSubmitting(true);
    try {
      const enrollmentId = await submitEnrollmentApplication({
        student: profile,
        course,
        batch: activeBatch,
        paymentMethod,
        paymentReference,
        paymentNotes,
      });
      setSuccessId(enrollmentId);
      setPaymentReference('');
      setPaymentNotes('');
    } catch (err) {
      setErrorMsg(parseFirestoreErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (!course) {
    return (
      <PublicLayout>
        <div className="max-w-4xl mx-auto px-6 py-20 text-center">
          <h1 className="font-display text-2xl font-bold text-slate-950 dark:text-white">
            Course not found
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            The course you requested may have been moved or is not published yet.
          </p>
          <Link
            to="/courses"
            className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-lg bg-slate-950 text-white dark:bg-brand-600"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Catalog</span>
          </Link>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      {/* Course Header */}
      <section className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
        <div className="max-w-7xl mx-auto px-6 py-10 lg:py-14">
          <Link
            to="/courses"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Course Catalog</span>
          </Link>

          <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
            <div className="lg:col-span-7">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-medium text-brand-700 dark:text-brand-400">
                  {course.categoryName}
                </span>
                <span aria-hidden="true">·</span>
                <span>{course.level}</span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{course.durationWeeks} weeks</span>
                {course.isDemo && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-medium text-amber-700 dark:text-amber-400">
                      Demo Curriculum
                    </span>
                  </>
                )}
              </div>

              <h1 className="mt-3 font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-950 dark:text-white">
                {course.title}
              </h1>
              <p className="mt-4 text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                {course.subtitle}
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-600 dark:text-slate-400">
                <span>
                  Instructor:{' '}
                  <strong className="font-medium text-slate-900 dark:text-slate-100">
                    {course.instructorName}
                  </strong>
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums font-semibold text-slate-950 dark:text-white">
                  {formatNpr(course.priceNpr)}
                </span>
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800">
                <MediaFrame
                  src={course.thumbnailUrl}
                  alt={course.title}
                  title={course.title}
                  aspectClass="aspect-[4/3]"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content + Enrollment Panel */}
      <section className="py-12 lg:py-16">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          {/* Left Column: Overview, Outcomes, Syllabus, Instructor */}
          <div className="lg:col-span-7 space-y-10">
            <div>
              <h2 className="font-display text-xl font-semibold text-slate-950 dark:text-white">
                Program Overview
              </h2>
              <p className="mt-3 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                {course.description}
              </p>
            </div>

            <div className="pt-8 border-t border-slate-200 dark:border-slate-800">
              <h2 className="font-display text-xl font-semibold text-slate-950 dark:text-white">
                What You Will Learn
              </h2>
              <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {course.outcomes.map((outcome, index) => (
                  <li
                    key={index}
                    className="flex items-start gap-2.5 text-sm text-slate-700 dark:text-slate-300 leading-relaxed"
                  >
                    <CheckCircle2 className="w-4 h-4 text-brand-600 dark:text-brand-400 shrink-0 mt-0.5" />
                    <span>{outcome}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="pt-8 border-t border-slate-200 dark:border-slate-800">
              <h2 className="font-display text-xl font-semibold text-slate-950 dark:text-white">
                Curriculum Outline
              </h2>
              <ol className="mt-4 divide-y divide-slate-200 dark:divide-slate-800 border-y border-slate-200 dark:border-slate-800">
                {course.syllabus.map((moduleItem, idx) => (
                  <li key={idx} className="py-3.5 flex items-baseline gap-4 text-sm">
                    <span className="font-mono text-xs text-slate-400 tabular-nums shrink-0">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <span className="text-slate-800 dark:text-slate-200">{moduleItem}</span>
                  </li>
                ))}
              </ol>
            </div>

            {instructor && (
              <div className="pt-8 border-t border-slate-200 dark:border-slate-800">
                <h2 className="font-display text-xl font-semibold text-slate-950 dark:text-white">
                  Cohort Instructor
                </h2>
                <div className="mt-4 p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <p className="text-xs font-medium text-brand-700 dark:text-brand-400">
                    {instructor.specialty}
                  </p>
                  <h3 className="mt-1 font-display text-lg font-semibold text-slate-950 dark:text-white">
                    {instructor.displayName}
                  </h3>
                  <p className="mt-2.5 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    {instructor.bio}
                  </p>
                  {instructor.credentialsNote && (
                    <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                      {instructor.credentialsNote}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Batch Selection & Manual NPR Enrollment Application */}
          <aside className="lg:col-span-5 lg:sticky lg:top-24">
            <div className="p-6 sm:p-7 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-6">
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Cohort Tuition (NPR)
                </p>
                <p className="mt-1 font-mono tabular-nums text-2xl font-bold text-slate-950 dark:text-white">
                  {formatNpr(activeBatch ? activeBatch.priceNpr : course.priceNpr)}
                </p>
              </div>

              {courseBatches.length > 0 ? (
                <form onSubmit={handleEnrollSubmit} className="space-y-5">
                  <div>
                    <label
                      htmlFor="batch-select"
                      className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2"
                    >
                      1. Choose Live Batch
                    </label>
                    <select
                      id="batch-select"
                      value={selectedBatchId}
                      onChange={(e) => setSelectedBatchId(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-600"
                    >
                      {courseBatches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name} — Starts {formatDateValue(b.startDate)}
                        </option>
                      ))}
                    </select>
                    {activeBatch && (
                      <div className="mt-2.5 text-xs text-slate-600 dark:text-slate-400 space-y-1">
                        <p className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>
                            {activeBatch.scheduleText} ({activeBatch.timezone})
                          </span>
                        </p>
                        <p className="font-mono tabular-nums">
                          {formatDateValue(activeBatch.startDate)} – {formatDateValue(activeBatch.endDate)} · Seat limit: {activeBatch.seatLimit}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Nepal Payment Method Selector */}
                  <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      2. Payment Method (Manual Verification in NPR)
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          { id: 'bank_transfer', label: 'Bank' },
                          { id: 'esewa_manual', label: 'eSewa' },
                          { id: 'khalti_manual', label: 'Khalti' },
                        ] as const
                      ).map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setPaymentMethod(m.id)}
                          className={`py-2 px-3 text-xs font-medium rounded-lg border transition-colors ${
                            paymentMethod === m.id
                              ? 'border-brand-600 bg-brand-50 text-brand-800 dark:bg-brand-950/60 dark:text-brand-300'
                              : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>

                    <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 space-y-1 leading-relaxed">
                      {paymentMethod === 'bank_transfer' && (
                        <>
                          <p className="font-semibold text-slate-900 dark:text-slate-100">
                            {settings.bankName}
                          </p>
                          <p>Account Name: {settings.bankAccountName}</p>
                          <p className="font-mono tabular-nums">
                            Account No: {settings.bankAccountNumber}
                          </p>
                        </>
                      )}
                      {paymentMethod === 'esewa_manual' && (
                        <p>{settings.esewaInstructions}</p>
                      )}
                      {paymentMethod === 'khalti_manual' && (
                        <p>{settings.khaltiInstructions}</p>
                      )}
                    </div>
                  </div>

                  {/* Reference Code Input */}
                  <div className="space-y-3">
                    <div>
                      <label
                        htmlFor="payment-ref"
                        className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                      >
                        3. Payment Reference / Receipt ID
                      </label>
                      <input
                        id="payment-ref"
                        type="text"
                        required
                        maxLength={120}
                        value={paymentReference}
                        onChange={(e) => setPaymentReference(e.target.value)}
                        placeholder="e.g. TXN-20261120-8492"
                        className="w-full px-3.5 py-2.5 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-600"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="payment-notes"
                        className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5"
                      >
                        Sender Name / Optional Notes
                      </label>
                      <textarea
                        id="payment-notes"
                        rows={2}
                        maxLength={500}
                        value={paymentNotes}
                        onChange={(e) => setPaymentNotes(e.target.value)}
                        placeholder="Account holder name or remarks for admin verification"
                        className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-600"
                      />
                    </div>
                  </div>

                  {errorMsg && (
                    <div
                      role="alert"
                      className="p-3.5 rounded-lg border border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300"
                    >
                      {errorMsg}
                    </div>
                  )}

                  {successId && (
                    <div className="p-4 rounded-lg border border-emerald-300 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 text-xs text-emerald-800 dark:text-emerald-300 space-y-2">
                      <p className="font-semibold">
                        Enrollment application submitted (Pending Admin Verification).
                      </p>
                      <p>
                        No payment is auto-confirmed. Track verification status inside your Student
                        Dashboard.
                      </p>
                      <Link
                        to="/student"
                        className="inline-block font-semibold underline underline-offset-4"
                      >
                        Go to Student Dashboard
                      </Link>
                    </div>
                  )}

                  {profile ? (
                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full py-3 px-4 text-sm font-semibold rounded-lg bg-slate-950 dark:bg-brand-600 text-white hover:bg-slate-800 dark:hover:bg-brand-500 disabled:opacity-50 transition-colors"
                    >
                      {submitting
                        ? 'Submitting Application...'
                        : 'Submit Enrollment for Verification'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void signInWithGoogle()}
                      className="w-full py-3 px-4 text-sm font-semibold rounded-lg bg-slate-950 dark:bg-brand-600 text-white hover:bg-slate-800 dark:hover:bg-brand-500 transition-colors"
                    >
                      Sign In with Google to Enroll
                    </button>
                  )}

                  <p className="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-slate-400" />
                    <span>
                      Course materials and live meeting links unlock only after an authorized Birta
                      Academy Admin verifies your NPR payment receipt.
                    </span>
                  </p>
                </form>
              ) : (
                <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-600 dark:text-slate-400 space-y-3">
                  <p>No live batches are currently scheduled for this course.</p>
                  <Link
                    to="/contact"
                    className="inline-block text-xs font-semibold text-brand-700 dark:text-brand-400 hover:underline"
                  >
                    Inquire about the next cohort date
                  </Link>
                </div>
              )}
            </div>
          </aside>
        </div>
      </section>
    </PublicLayout>
  );
}
