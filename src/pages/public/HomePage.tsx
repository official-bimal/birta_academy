import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { PublicLayout } from '../../components/PublicLayout';
import { CourseCard } from '../../components/CourseCard';
import { useCatalog } from '../../context/CatalogContext';
import {
  ACADEMY_FAQS,
} from '../../data/demoCatalog';
import { formatDateValue, formatNpr } from '../../lib/validation';

const WHY_BIRTA_ITEMS = [
  {
    index: '01.',
    title: 'Instructor-Led Live Cohorts in Nepal Time',
    description:
      'Every program runs on a structured evening schedule in NPT (UTC+5:45) so students and working professionals across Nepal can ask questions live instead of learning alone from static videos.',
    span: 'lg:col-span-7',
  },
  {
    index: '02.',
    title: 'Practical Weekly Assignments',
    description:
      'Real deliverables reviewed directly by cohort instructors with written feedback and revision loops.',
    span: 'lg:col-span-5',
  },
  {
    index: '03.',
    title: 'Recorded Replays & Curated Resources',
    description:
      'Missed a live class or want to revisit a workshop? Approved cohort members get organized lesson recordings and study references in their dashboard.',
    span: 'lg:col-span-5',
  },
  {
    index: '04.',
    title: 'Transparent NPR Billing & Verified Completion Certificates',
    description:
      'Clear tuition in Nepalese Rupees with verified manual payment approval via Bank Transfer, eSewa, or Khalti—and official academy certificates upon cohort completion.',
    span: 'lg:col-span-7',
  },
];

const HOW_IT_WORKS_STEPS = [
  {
    step: '01.',
    title: 'Select a Course & Live Batch',
    detail:
      'Browse the catalog, inspect the week-by-week syllabus, and choose an upcoming cohort whose Nepal Time schedule fits your routine.',
  },
  {
    step: '02.',
    title: 'Enroll & Verify Tuition in NPR',
    detail:
      'Submit your Bank Transfer, eSewa, or Khalti payment reference. An authorized Birta Academy administrator verifies your receipt before activating access.',
  },
  {
    step: '03.',
    title: 'Attend Live Classes & Submit Projects',
    detail:
      'Join live instructor sessions from your Student Dashboard, track lesson progress, and submit practical coursework for review.',
  },
  {
    step: '04.',
    title: 'Earn Your Completion Certificate',
    detail:
      'Complete required lessons and assignments to receive an official Birta Academy completion certificate with a unique verification code.',
  },
];

export function HomePage() {
  const { categories, courses, batches, instructors, usingFallbackDemo } = useCatalog();
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  const featuredCourses = courses.filter((c) => c.featured).slice(0, 4);
  const displayCourses = featuredCourses.length > 0 ? featuredCourses : courses.slice(0, 4);
  const upcomingBatches = batches.filter((b) => b.status === 'upcoming' || b.status === 'ongoing').slice(0, 4);

  const nextBatch = upcomingBatches[0];

  return (
    <PublicLayout>
      {/* 1. Editorial Split Hero */}
      <section className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
        <div className="max-w-7xl mx-auto px-6 py-16 lg:py-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-center">
              <p className="text-sm font-medium text-brand-700 dark:text-brand-400">
                Kathmandu, Nepal · Live Online Skill Training
              </p>

              <h1
                className="mt-4 font-display font-bold tracking-tight text-slate-950 dark:text-white leading-[1.08]"
                style={{
                  fontSize: 'clamp(2.25rem, 4.2vw, 3.6rem)',
                  textWrap: 'balance',
                }}
              >
                Learn Skills. Build Your Future.
              </h1>

              <p className="mt-6 text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
                Birta Academy delivers instructor-led live cohorts, practical assignments, recorded
                class materials, and completion certificates designed for ambitious learners in
                Nepal and beyond.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link
                  to="/courses"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold rounded-lg bg-brand-600 text-white hover:bg-brand-700 dark:hover:bg-brand-500 transition-colors whitespace-nowrap"
                >
                  <span>Explore Courses</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  to="/batches"
                  className="inline-flex items-center justify-center px-6 py-3 text-sm font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors whitespace-nowrap"
                >
                  View Upcoming Batches
                </Link>
              </div>

              <div className="mt-10 pt-6 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
                <span>Live evening sessions (NPT)</span>
                <span aria-hidden="true">·</span>
                <span>Practical instructor feedback</span>
                <span aria-hidden="true">·</span>
                <span>NPR Bank, eSewa &amp; Khalti manual verification</span>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="h-full rounded-2xl bg-brand-600 text-white p-7 sm:p-9 flex flex-col justify-between gap-10 min-h-[340px]">
                <div>
                  <p className="text-xs font-medium text-white/70">How Birta works</p>
                  <ul className="mt-5 divide-y divide-white/15">
                    {[
                      ['Live', 'Instructor-led classes on Google Meet in Nepal Time'],
                      ['Recorded', 'Replays and resources for approved students'],
                      ['Practice', 'Assignments with written instructor feedback'],
                    ].map(([k, v]) => (
                      <li key={k} className="py-4 flex items-baseline gap-5">
                        <span className="font-display text-xl font-bold w-24 shrink-0">{k}</span>
                        <span className="text-sm text-white/80 leading-relaxed">{v}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-xl bg-white text-slate-950 p-5">
                  <p className="text-xs font-medium text-brand-700">
                    {nextBatch ? 'Next batch' : 'Batches'}
                  </p>
                  {nextBatch ? (
                    <>
                      <p className="mt-1 font-display text-lg font-semibold">{nextBatch.courseTitle}</p>
                      <p className="mt-0.5 text-sm text-slate-600">
                        {nextBatch.name} · starts {formatDateValue(nextBatch.startDate)}
                        {nextBatch.isDemo ? ' (demo schedule)' : ''}
                      </p>
                      <Link
                        to={`/courses/${nextBatch.courseSlug}?batch=${nextBatch.id}`}
                        className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline"
                      >
                        <span>View batch</span>
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                    </>
                  ) : (
                    <p className="mt-1 text-sm text-slate-600">
                      New batches will be announced soon. Contact admissions to be notified.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {usingFallbackDemo && (
            <div className="mt-10 pt-5 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400">
              <p>
                <span className="font-semibold text-amber-700 dark:text-amber-400">Demo Catalog Preview:</span>{' '}
                Showing clearly labeled sample courses, batches, and faculty placeholders until an
                Academy Admin seeds or publishes live records.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* 2. Course Category Navigation */}
      <section className="py-16 lg:py-20 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-950 dark:text-white">
                Skill Tracks Built for Modern Careers
              </h2>
              <p className="mt-2 text-sm sm:text-base text-slate-600 dark:text-slate-400 max-w-2xl">
                Start with focused, structured curricula across six core domains—designed to expand
                as new professional skills emerge.
              </p>
            </div>
            <Link
              to="/courses"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 dark:text-brand-400 hover:underline whitespace-nowrap shrink-0"
            >
              <span>Browse Full Catalog</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {categories.map((cat, idx) => {
              const count = courses.filter((c) => c.categoryId === cat.id).length;
              return (
                <Link
                  key={cat.id}
                  to={`/categories/${cat.slug}`}
                  className="group p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-brand-500/60 dark:hover:border-brand-500/60 transition-colors flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-mono tabular-nums">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <span className="tabular-nums">
                        {count} {count === 1 ? 'program' : 'programs'}
                      </span>
                    </div>
                    <h3 className="mt-3 font-display text-lg font-semibold text-slate-950 dark:text-white group-hover:text-brand-700 dark:group-hover:text-brand-400 transition-colors">
                      {cat.name}
                    </h3>
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                      {cat.description}
                    </p>
                  </div>
                  <span className="mt-5 inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 group-hover:text-brand-700 dark:group-hover:text-brand-400">
                    <span>Explore track</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* 3. Featured Courses */}
      <section className="py-16 lg:py-20 bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-950 dark:text-white">
                Featured Cohort Programs
              </h2>
              <p className="mt-2 text-sm sm:text-base text-slate-600 dark:text-slate-400">
                Structured multi-week programs with transparent NPR tuition and weekly live guidance.
              </p>
            </div>
            <Link
              to="/courses"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 dark:text-brand-400 hover:underline whitespace-nowrap shrink-0"
            >
              <span>All Courses</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {displayCourses.map((course) => (
              <CourseCard
                key={course.id}
                course={course}
                batchCount={batches.filter((b) => b.courseId === course.id).length}
              />
            ))}
          </div>
        </div>
      </section>

      {/* 4. Upcoming Live Batches */}
      <section className="py-16 lg:py-20 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-950 dark:text-white">
                Upcoming Live Batches
              </h2>
              <p className="mt-2 text-sm sm:text-base text-slate-600 dark:text-slate-400">
                Reserve a seat in an upcoming cohort. All class timings are listed in Nepal Time
                (NPT, UTC+5:45).
              </p>
            </div>
            <Link
              to="/batches"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 dark:text-brand-400 hover:underline whitespace-nowrap shrink-0"
            >
              <span>Full Batch Schedule</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="mt-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-900">
                    <th className="py-3.5 px-5">Course &amp; Cohort</th>
                    <th className="py-3.5 px-5">Start Date</th>
                    <th className="py-3.5 px-5">Schedule</th>
                    <th className="py-3.5 px-5 text-right">Tuition</th>
                    <th className="py-3.5 px-5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                  {upcomingBatches.map((batch) => (
                    <tr
                      key={batch.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-4 px-5">
                        <p className="font-semibold text-slate-950 dark:text-white">
                          {batch.courseTitle}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {batch.name}
                          {batch.isDemo ? ' · Demo Schedule' : ''}
                        </p>
                      </td>
                      <td className="py-4 px-5 font-mono tabular-nums text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {formatDateValue(batch.startDate)}
                      </td>
                      <td className="py-4 px-5 text-xs text-slate-600 dark:text-slate-400">
                        <p>{batch.scheduleText}</p>
                        <p className="text-slate-500 dark:text-slate-500 mt-0.5">{batch.timezone}</p>
                      </td>
                      <td className="py-4 px-5 text-right font-mono tabular-nums font-medium text-slate-950 dark:text-white whitespace-nowrap">
                        {formatNpr(batch.priceNpr)}
                      </td>
                      <td className="py-4 px-5 text-right whitespace-nowrap">
                        <Link
                          to={`/courses/${batch.courseSlug}?batch=${batch.id}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 dark:text-brand-400 hover:underline"
                        >
                          <span>Apply</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {upcomingBatches.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="py-10 px-5 text-center text-sm text-slate-500 dark:text-slate-400"
                      >
                        No upcoming batches scheduled yet. Check back soon or contact admissions.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Why Learn With Birta Academy (Asymmetric Bento) */}
      <section className="py-16 lg:py-20 bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-2xl">
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-950 dark:text-white">
              Why Learn With Birta Academy
            </h2>
            <p className="mt-2 text-sm sm:text-base text-slate-600 dark:text-slate-400">
              Built around accountability, real projects, and clear learning workflows—without
              passive video fatigue.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 lg:grid-cols-12 gap-6">
            {WHY_BIRTA_ITEMS.map((item) => (
              <div
                key={item.index}
                className={`${item.span} p-7 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800`}
              >
                <p className="font-mono text-xs font-medium text-brand-700 dark:text-brand-400">
                  {item.index}
                </p>
                <h3 className="mt-3 font-display text-xl font-semibold text-slate-950 dark:text-white">
                  {item.title}
                </h3>
                <p className="mt-3 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 6. How Online Classes Work */}
      <section className="py-16 lg:py-20 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-2xl">
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-950 dark:text-white">
              How Online Classes Work
            </h2>
            <p className="mt-2 text-sm sm:text-base text-slate-600 dark:text-slate-400">
              From cohort enrollment to verified completion certificate in four straightforward
              steps.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {HOW_IT_WORKS_STEPS.map((item) => (
              <div
                key={item.step}
                className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
              >
                <span className="font-mono text-sm font-semibold text-blue-700 dark:text-blue-400">
                  {item.step}
                </span>
                <h3 className="mt-3 font-display text-base font-semibold text-slate-950 dark:text-white">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {item.detail}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 7. Instructor Showcase */}
      <section className="py-16 lg:py-20 bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-950 dark:text-white">
                Academy Instructors
              </h2>
              <p className="mt-2 text-sm sm:text-base text-slate-600 dark:text-slate-400">
                Faculty profiles are managed directly from the Admin Console. Unverified demo
                entries are clearly marked until real instructor biographies are published.
              </p>
            </div>
            <Link
              to="/instructors"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 dark:text-brand-400 hover:underline whitespace-nowrap shrink-0"
            >
              <span>All Instructors</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {instructors.slice(0, 4).map((inst) => (
              <div
                key={inst.id}
                className="p-6 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between"
              >
                <div>
                  <p className="text-xs font-medium text-brand-700 dark:text-brand-400">
                    {inst.specialty}
                  </p>
                  <h3 className="mt-2 font-display text-base font-semibold text-slate-950 dark:text-white">
                    {inst.displayName}
                  </h3>
                  <p className="mt-3 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    {inst.bio}
                  </p>
                </div>
                {inst.isDemo && (
                  <p className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 text-xs text-amber-700 dark:text-amber-400">
                    Demo Profile · Configure in Admin
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 9. FAQ Section */}
      <section className="py-16 lg:py-20 bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-950 dark:text-white">
            Frequently Asked Questions
          </h2>
          <p className="mt-2 text-sm sm:text-base text-slate-600 dark:text-slate-400">
            Clear answers on live classes, Nepal payment verification, and dashboard access.
          </p>

          <div className="mt-8 divide-y divide-slate-200 dark:divide-slate-800 border-y border-slate-200 dark:border-slate-800">
            {ACADEMY_FAQS.map((faq, idx) => {
              const isOpen = openFaqIndex === idx;
              return (
                <div key={faq.question} className="py-5">
                  <button
                    type="button"
                    onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                    aria-expanded={isOpen}
                    className="w-full flex items-center justify-between gap-4 text-left"
                  >
                    <span className="font-display text-base font-semibold text-slate-950 dark:text-white">
                      {faq.question}
                    </span>
                    <ChevronDown
                      className={`w-5 h-5 text-slate-500 shrink-0 transition-transform duration-150 ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <p className="mt-3 text-sm text-slate-600 dark:text-slate-400 leading-relaxed pr-8">
                      {faq.answer}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Closing Admission CTA */}
      <section className="py-16 lg:py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="p-8 sm:p-12 rounded-2xl bg-slate-950 dark:bg-slate-900 border border-slate-800 text-white flex flex-col lg:flex-row lg:items-center justify-between gap-8">
            <div className="max-w-2xl">
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">
                Ready to join the next live cohort?
              </h2>
              <p className="mt-3 text-sm sm:text-base text-slate-300 leading-relaxed">
                Explore the course catalog, choose your preferred Nepal Time batch, or send an
                admission inquiry to our team.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <Link
                to="/courses"
                className="inline-flex items-center justify-center px-6 py-3 text-sm font-semibold rounded-lg bg-brand-600 text-white hover:bg-brand-500 transition-colors whitespace-nowrap"
              >
                Browse Courses
              </Link>
              <Link
                to="/contact"
                className="inline-flex items-center justify-center px-6 py-3 text-sm font-semibold rounded-lg border border-slate-700 text-slate-100 hover:bg-slate-800 transition-colors whitespace-nowrap"
              >
                Admissions Inquiry
              </Link>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
