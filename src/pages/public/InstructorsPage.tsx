import { Link } from 'react-router-dom';
import { PublicLayout } from '../../components/PublicLayout';
import { useCatalog } from '../../context/CatalogContext';

export function InstructorsPage() {
  const { instructors, courses, usingFallbackDemo } = useCatalog();

  return (
    <PublicLayout>
      <section className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
        <div className="max-w-7xl mx-auto px-6 py-12 lg:py-16">
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-950 dark:text-white">
            Instructors &amp; Faculty
          </h1>
          <p className="mt-3 text-base text-slate-600 dark:text-slate-400 max-w-2xl">
            Practitioners leading live sessions, practical critiques, and assignment reviews at
            Birta Academy.
          </p>
          {usingFallbackDemo && (
            <p className="mt-4 text-xs text-amber-700 dark:text-amber-400">
              Demo instructor profiles are shown below. We never fabricate qualifications; replace
              these placeholders with real faculty profiles from the Admin Console.
            </p>
          )}
        </div>
      </section>

      <section className="py-12 lg:py-16">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          {instructors.map((inst) => {
            const assignedCourses = courses.filter((c) => c.instructorId === inst.id);
            return (
              <article
                key={inst.id}
                className="p-7 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-medium text-brand-700 dark:text-brand-400">
                      {inst.specialty}
                    </span>
                    {inst.isDemo && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-medium text-amber-700 dark:text-amber-400">
                          Demo Profile
                        </span>
                      </>
                    )}
                  </div>

                  <h2 className="mt-2 font-display text-xl font-semibold text-slate-950 dark:text-white">
                    {inst.displayName}
                  </h2>

                  <p className="mt-3 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    {inst.bio}
                  </p>

                  {inst.credentialsNote && (
                    <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                      {inst.credentialsNote}
                    </p>
                  )}
                </div>

                {assignedCourses.length > 0 && (
                  <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
                      Courses Taught
                    </p>
                    <ul className="space-y-1.5">
                      {assignedCourses.map((c) => (
                        <li key={c.id}>
                          <Link
                            to={`/courses/${c.slug}`}
                            className="text-sm font-medium text-slate-900 dark:text-slate-100 hover:text-brand-700 dark:hover:text-brand-400 hover:underline"
                          >
                            {c.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </PublicLayout>
  );
}
