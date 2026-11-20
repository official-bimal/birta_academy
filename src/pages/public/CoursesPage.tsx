import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { PublicLayout } from '../../components/PublicLayout';
import { CourseCard } from '../../components/CourseCard';
import { useCatalog } from '../../context/CatalogContext';
import type { CourseLevel } from '../../types';

const LEVELS: Array<'All' | CourseLevel> = ['All', 'Beginner', 'Intermediate', 'Advanced'];

export function CoursesPage() {
  const { slug: categorySlug } = useParams<{ slug?: string }>();
  const { categories, courses, batches, loading, usingFallbackDemo } = useCatalog();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<'All' | CourseLevel>('All');

  const activeCategory = useMemo(
    () => categories.find((c) => c.slug === categorySlug) || null,
    [categories, categorySlug]
  );

  const filteredCourses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return courses.filter((course) => {
      if (activeCategory && course.categoryId !== activeCategory.id) return false;
      if (selectedLevel !== 'All' && course.level !== selectedLevel) return false;
      if (q) {
        const hay = `${course.title} ${course.subtitle} ${course.categoryName} ${course.instructorName}`.toLowerCase();
        return hay.includes(q);
      }
      return true;
    });
  }, [courses, activeCategory, selectedLevel, searchQuery]);

  return (
    <PublicLayout>
      <section className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
        <div className="max-w-7xl mx-auto px-6 py-12 lg:py-16">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Link to="/" className="hover:text-slate-900 dark:hover:text-white">
              Home
            </Link>
            <span aria-hidden="true">/</span>
            <Link to="/courses" className="hover:text-slate-900 dark:hover:text-white">
              Courses
            </Link>
            {activeCategory && (
              <>
                <span aria-hidden="true">/</span>
                <span className="text-slate-900 dark:text-slate-100 font-medium">
                  {activeCategory.name}
                </span>
              </>
            )}
          </div>

          <h1 className="mt-4 font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-950 dark:text-white">
            {activeCategory ? activeCategory.name : 'Course Catalog'}
          </h1>
          <p className="mt-3 text-base text-slate-600 dark:text-slate-400 max-w-2xl">
            {activeCategory
              ? activeCategory.description
              : 'Explore live instructor-led training cohorts priced transparently in NPR.'}
          </p>

          {usingFallbackDemo && (
            <p className="mt-4 text-xs text-amber-700 dark:text-amber-400">
              Showing clearly labeled demo courses until live courses are seeded or published in the
              Admin Console.
            </p>
          )}
        </div>
      </section>

      <section className="py-10 lg:py-14">
        <div className="max-w-7xl mx-auto px-6 space-y-8">
          {/* Search & Interactive Filters */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search courses, skills, or topics..."
                aria-label="Search courses"
                className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            </div>

            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-200/70 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-x-auto">
              {LEVELS.map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setSelectedLevel(level)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    selectedLevel === level
                      ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          {/* Category Filter Tabs */}
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-4">
            <Link
              to="/courses"
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                !activeCategory
                  ? 'bg-slate-950 text-white dark:bg-brand-600'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
              }`}
            >
              All Tracks
            </Link>
            {categories.map((cat) => (
              <Link
                key={cat.id}
                to={`/categories/${cat.slug}`}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  activeCategory?.id === cat.id
                    ? 'bg-slate-950 text-white dark:bg-brand-600'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
                }`}
              >
                {cat.name}
              </Link>
            ))}
          </div>

          {/* Course Grid */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="h-96 rounded-xl bg-slate-200/60 dark:bg-slate-900 animate-pulse"
                />
              ))}
            </div>
          ) : filteredCourses.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredCourses.map((course) => (
                <CourseCard
                  key={course.id}
                  course={course}
                  batchCount={batches.filter((b) => b.courseId === course.id).length}
                />
              ))}
            </div>
          ) : (
            <div className="p-12 text-center rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <p className="font-display text-base font-semibold text-slate-950 dark:text-white">
                No courses match your filters
              </p>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                Try clearing your search term or switching back to all skill tracks.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedLevel('All');
                }}
                className="mt-5 px-4 py-2 text-sm font-medium rounded-lg bg-slate-950 text-white dark:bg-brand-600 hover:opacity-90"
              >
                Reset Filters
              </button>
            </div>
          )}
        </div>
      </section>
    </PublicLayout>
  );
}
