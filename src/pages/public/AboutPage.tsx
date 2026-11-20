import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { PublicLayout } from '../../components/PublicLayout';
import { MediaFrame } from '../../components/MediaFrame';
import { MEDIA_ASSETS } from '../../data/demoCatalog';

const PRINCIPLES = [
  {
    index: '01.',
    title: 'Live Accountability Over Passive Playlists',
    body: 'Learners complete courses when they attend scheduled live sessions, ask questions directly to practicing instructors, and submit weekly milestones.',
  },
  {
    index: '02.',
    title: 'Built for Nepal, Ready for Global Learners',
    body: 'We begin with Nepal Time (NPT) cohorts, Nepalese Rupee (NPR) pricing, and local payment verification workflows—while designing our curriculum standards for international careers.',
  },
  {
    index: '03.',
    title: 'Honest Proof & Verifiable Credentials',
    body: 'Birta Academy never fabricates graduate counts, testimonials, or unverified claims. Certificates are issued only after documented lesson and assignment completion.',
  },
];

export function AboutPage() {
  return (
    <PublicLayout>
      <section className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
        <div className="max-w-7xl mx-auto px-6 py-14 lg:py-20 grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-center">
            <p className="text-sm font-medium text-violet-700 dark:text-violet-400">
              About Birta Academy
            </p>
            <h1 className="mt-3 font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-950 dark:text-white leading-tight">
              Practical skill training built for real careers.
            </h1>
            <p className="mt-5 text-base text-slate-600 dark:text-slate-300 leading-relaxed">
              Birta Academy is a Nepal-based online skill training academy founded around a direct
              belief: motivated learners progress fastest through structured instructor-led cohorts,
              practical projects, and honest feedback.
            </p>
            <p className="mt-4 text-base text-slate-600 dark:text-slate-300 leading-relaxed">
              Starting with six practical career tracks—Forex &amp; Trading Education, AI &amp; Vibe
              Coding, Full-Stack Web Development, Graphic Design, Video Editing &amp; AI Video
              Creation, and Digital Marketing—our platform expands continuously to support emerging
              professional skills in Nepal and internationally.
            </p>
          </div>
          <div className="lg:col-span-6">
            <div className="h-full rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800">
              <MediaFrame
                src={MEDIA_ASSETS.heroStudio}
                alt="Birta Academy learning studio in Kathmandu"
                title="Birta Academy"
                aspectClass="aspect-[16/10] lg:aspect-auto lg:h-full"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-20 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-950 dark:text-white">
            How We Approach Education
          </h2>
          <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
            {PRINCIPLES.map((item) => (
              <div
                key={item.index}
                className="p-7 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
              >
                <span className="font-mono text-xs font-semibold text-violet-700 dark:text-violet-400">
                  {item.index}
                </span>
                <h3 className="mt-3 font-display text-lg font-semibold text-slate-950 dark:text-white">
                  {item.title}
                </h3>
                <p className="mt-3 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-white dark:bg-slate-950">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div>
            <h2 className="font-display text-2xl font-bold text-slate-950 dark:text-white">
              Have questions about an upcoming cohort?
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Reach out to our admissions desk or explore current schedules.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Link
              to="/courses"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg bg-slate-950 dark:bg-violet-600 text-white hover:opacity-90"
            >
              <span>Explore Courses</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/contact"
              className="px-5 py-2.5 text-sm font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-900"
            >
              Contact Admissions
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
