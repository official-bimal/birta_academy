import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { PublicLayout } from '../../components/PublicLayout';
import { useCatalog } from '../../context/CatalogContext';
import { formatDateValue, formatNpr } from '../../lib/validation';
import type { BatchStatus } from '../../types';

const STATUS_FILTERS: Array<'all' | BatchStatus> = ['all', 'upcoming', 'ongoing', 'completed'];

export function BatchesPage() {
  const { batches, usingFallbackDemo } = useCatalog();
  const [statusFilter, setStatusFilter] = useState<'all' | BatchStatus>('all');

  const visibleBatches = useMemo(
    () =>
      batches.filter((b) =>
        statusFilter === 'all' ? true : b.status === statusFilter
      ),
    [batches, statusFilter]
  );

  return (
    <PublicLayout>
      <section className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
        <div className="max-w-7xl mx-auto px-6 py-12 lg:py-16">
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-950 dark:text-white">
            Upcoming &amp; Active Live Batches
          </h1>
          <p className="mt-3 text-base text-slate-600 dark:text-slate-400 max-w-2xl">
            Every Birta Academy cohort runs live with dedicated seat limits and interactive sessions
            scheduled in Nepal Time (NPT, UTC+5:45).
          </p>
          {usingFallbackDemo && (
            <p className="mt-4 text-xs text-amber-700 dark:text-amber-400">
              Showing demo batch schedule until live cohorts are published in the Admin Console.
            </p>
          )}
        </div>
      </section>

      <section className="py-10 lg:py-14">
        <div className="max-w-7xl mx-auto px-6 space-y-6">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-200/70 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-fit">
            {STATUS_FILTERS.map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-md capitalize transition-colors ${
                  statusFilter === st
                    ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {visibleBatches.map((batch) => (
              <article
                key={batch.id}
                className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-medium capitalize text-violet-700 dark:text-violet-400">
                      {batch.status}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">Seat limit: {batch.seatLimit}</span>
                    {batch.isDemo && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-amber-700 dark:text-amber-400 font-medium">
                          Demo Batch
                        </span>
                      </>
                    )}
                  </div>

                  <h2 className="mt-2.5 font-display text-xl font-semibold text-slate-950 dark:text-white">
                    {batch.courseTitle}
                  </h2>
                  <p className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                    {batch.name}
                  </p>

                  <dl className="mt-5 grid grid-cols-2 gap-4 text-xs border-t border-slate-100 dark:border-slate-800 pt-4">
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">Duration</dt>
                      <dd className="mt-1 font-mono tabular-nums text-slate-900 dark:text-slate-100">
                        {formatDateValue(batch.startDate)} – {formatDateValue(batch.endDate)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">Schedule</dt>
                      <dd className="mt-1 text-slate-900 dark:text-slate-100">
                        {batch.scheduleText}
                      </dd>
                      <dd className="text-slate-500 dark:text-slate-400">{batch.timezone}</dd>
                    </div>
                  </dl>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4">
                  <span className="font-mono tabular-nums text-base font-semibold text-slate-950 dark:text-white">
                    {formatNpr(batch.priceNpr)}
                  </span>
                  <Link
                    to={`/courses/${batch.courseSlug}?batch=${batch.id}`}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-slate-950 dark:bg-violet-600 text-white hover:bg-slate-800 dark:hover:bg-violet-500 transition-colors"
                  >
                    <span>Enroll in Batch</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </article>
            ))}
          </div>

          {visibleBatches.length === 0 && (
            <div className="p-12 text-center rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm text-slate-600 dark:text-slate-400">
              No batches found under this status filter.
            </div>
          )}
        </div>
      </section>
    </PublicLayout>
  );
}
