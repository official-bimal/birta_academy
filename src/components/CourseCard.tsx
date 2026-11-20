import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { MediaFrame } from './MediaFrame';
import { formatNpr } from '../lib/validation';
import type { Course } from '../types';

interface CourseCardProps {
  course: Course;
  batchCount?: number;
}

export function CourseCard({ course, batchCount }: CourseCardProps) {
  return (
    <article className="group flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden transition-colors hover:border-slate-300 dark:hover:border-slate-700">
      <Link to={`/courses/${course.slug}`} className="block overflow-hidden">
        <MediaFrame
          src={course.thumbnailUrl}
          alt={course.title}
          title={course.title}
          aspectClass="aspect-[4/3]"
          className="transition-transform duration-300 group-hover:scale-[1.02]"
        />
      </Link>

      <div className="flex-1 flex flex-col p-6">
        {/* Zero-pill quiet text metadata with typographic separators */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
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
              <span className="text-amber-700 dark:text-amber-400 font-medium">Demo Course</span>
            </>
          )}
        </div>

        <h3 className="mt-2.5 font-display text-lg font-semibold text-slate-950 dark:text-white leading-snug">
          <Link
            to={`/courses/${course.slug}`}
            className="hover:text-brand-700 dark:hover:text-brand-400 transition-colors"
          >
            {course.title}
          </Link>
        </h3>

        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-2">
          {course.subtitle}
        </p>

        <div className="mt-auto pt-5 mt-5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4">
          <div>
            <p className="font-mono tabular-nums text-base font-semibold text-slate-950 dark:text-white">
              {formatNpr(course.priceNpr)}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {typeof batchCount === 'number' && batchCount > 0
                ? `${batchCount} upcoming ${batchCount === 1 ? 'batch' : 'batches'}`
                : 'Live cohort training'}
            </p>
          </div>

          <Link
            to={`/courses/${course.slug}`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-900 dark:text-slate-100 hover:text-brand-700 dark:hover:text-brand-400 transition-colors whitespace-nowrap shrink-0"
          >
            <span>View Details</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </article>
  );
}
