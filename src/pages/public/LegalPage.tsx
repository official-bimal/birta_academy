import { PublicLayout } from '../../components/PublicLayout';

interface LegalPageProps {
  type: 'privacy' | 'terms';
}

export function LegalPage({ type }: LegalPageProps) {
  const isPrivacy = type === 'privacy';

  return (
    <PublicLayout>
      <article className="max-w-3xl mx-auto px-6 py-14 lg:py-20 space-y-8">
        <header className="pb-6 border-b border-slate-200 dark:border-slate-800">
          <p className="text-xs font-medium text-violet-700 dark:text-violet-400">
            Birta Academy Legal
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-slate-950 dark:text-white">
            {isPrivacy ? 'Privacy Policy' : 'Terms of Service'}
          </h1>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 font-mono">
            Effective Date: November 2026 · Jurisdiction: Nepal
          </p>
        </header>

        {isPrivacy ? (
          <div className="space-y-6 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
            <section className="space-y-2">
              <h2 className="font-display text-lg font-semibold text-slate-950 dark:text-white">
                1. Information We Collect
              </h2>
              <p>
                When you sign in to Birta Academy, we collect your name, verified email address,
                optional phone number and city, enrollment records, manual payment reference codes,
                assignment submissions, and lesson progress strictly to deliver your educational
                experience.
              </p>
            </section>
            <section className="space-y-2">
              <h2 className="font-display text-lg font-semibold text-slate-950 dark:text-white">
                2. Strict Data Isolation
              </h2>
              <p>
                Personal account information, payment references, and admission inquiries are
                isolated via database-level Firestore Security Rules so only you and authorized
                Birta Academy Administrators (and assigned instructors where needed for coursework)
                can view your records.
              </p>
            </section>
            <section className="space-y-2">
              <h2 className="font-display text-lg font-semibold text-slate-950 dark:text-white">
                3. Data Retention &amp; Requests
              </h2>
              <p>
                Certificate verification records are retained to validate issued credentials. You
                may request profile updates or account data removal by contacting admissions.
              </p>
            </section>
          </div>
        ) : (
          <div className="space-y-6 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
            <section className="space-y-2">
              <h2 className="font-display text-lg font-semibold text-slate-950 dark:text-white">
                1. Enrollment &amp; Manual Payment Verification (NPR)
              </h2>
              <p>
                Tuition is billed in Nepalese Rupees (NPR). Submitting a Bank Transfer, eSewa, or
                Khalti payment reference creates a pending enrollment application. Course access,
                recorded lessons, and live meeting links are granted only after an authorized Birta
                Academy Administrator verifies receipt of funds.
              </p>
            </section>
            <section className="space-y-2">
              <h2 className="font-display text-lg font-semibold text-slate-950 dark:text-white">
                2. Educational Disclaimer
              </h2>
              <p>
                All Birta Academy programs—including Forex &amp; Trading Education—are strictly
                educational. Nothing taught in live sessions, recordings, or assignments
                constitutes financial, investment, or legal advice.
              </p>
            </section>
            <section className="space-y-2">
              <h2 className="font-display text-lg font-semibold text-slate-950 dark:text-white">
                3. Cohort Conduct &amp; Intellectual Property
              </h2>
              <p>
                Live session links, recorded lessons, and study resources are licensed exclusively
                to approved students enrolled in the corresponding batch and may not be redistributed
                publicly.
              </p>
            </section>
          </div>
        )}
      </article>
    </PublicLayout>
  );
}
