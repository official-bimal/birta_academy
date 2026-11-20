import React, { useEffect, useState } from 'react';
import { PublicLayout } from '../../components/PublicLayout';
import { useAuth } from '../../context/AuthContext';
import { useCatalog } from '../../context/CatalogContext';
import { submitInquiry } from '../../lib/firestoreService';
import { parseFirestoreErrorMessage } from '../../lib/firebase';
import { PATTERNS } from '../../lib/validation';

export function ContactPage() {
  const { profile, signInWithGoogle } = useAuth();
  const { courses, settings } = useCatalog();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [courseInterest, setCourseInterest] = useState('General Admissions Inquiry');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submittedId, setSubmittedId] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setFullName((prev) => prev || profile.displayName);
      setEmail((prev) => prev || profile.email);
      setPhone((prev) => prev || profile.phone || '');
    }
  }, [profile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmittedId(null);

    if (!profile) {
      setErrorMsg('Please sign in with Google first to submit a tracked admission inquiry.');
      return;
    }
    if (fullName.trim().length < 2) {
      setErrorMsg('Please enter your full name.');
      return;
    }
    if (!PATTERNS.EMAIL.test(email.trim())) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }
    if (message.trim().length < 10) {
      setErrorMsg('Please share at least 10 characters describing your question or learning goal.');
      return;
    }

    setSubmitting(true);
    try {
      const id = await submitInquiry({
        user: profile,
        fullName,
        email,
        phone,
        courseInterest,
        message,
      });
      setSubmittedId(id);
      setMessage('');
    } catch (err) {
      setErrorMsg(parseFirestoreErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PublicLayout>
      <section className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
        <div className="max-w-7xl mx-auto px-6 py-12 lg:py-16">
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-950 dark:text-white">
            Contact &amp; Admission Inquiries
          </h1>
          <p className="mt-3 text-base text-slate-600 dark:text-slate-400 max-w-2xl">
            Ask about upcoming Nepal Time batch schedules, prerequisites, or NPR Bank Transfer,
            eSewa, and Khalti verification procedures.
          </p>
        </div>
      </section>

      <section className="py-12 lg:py-16">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-5 space-y-6">
            <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
              <h2 className="font-display text-lg font-semibold text-slate-950 dark:text-white">
                Admissions Desk
              </h2>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-xs text-slate-500 dark:text-slate-400">Location</dt>
                  <dd className="text-slate-900 dark:text-slate-100 mt-0.5">{settings.location}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500 dark:text-slate-400">Admissions Email</dt>
                  <dd className="font-mono text-slate-900 dark:text-slate-100 mt-0.5">
                    {settings.supportEmail}
                  </dd>
                </div>
                {settings.supportPhone && (
                  <div>
                    <dt className="text-xs text-slate-500 dark:text-slate-400">Phone</dt>
                    <dd className="font-mono text-slate-900 dark:text-slate-100 mt-0.5">
                      {settings.supportPhone}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3 text-sm">
              <h2 className="font-display text-lg font-semibold text-slate-950 dark:text-white">
                Nepal Manual Payment Details (NPR)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Online gateway integrations (eSewa/Khalti APIs) are enabled only once live merchant
                keys are configured. Until then, submit your transfer reference on any course page
                for manual Admin verification.
              </p>
              <div className="pt-2 text-xs space-y-1 text-slate-700 dark:text-slate-300">
                <p className="font-semibold">{settings.bankName}</p>
                <p>Account: {settings.bankAccountName}</p>
                <p className="font-mono tabular-nums">No: {settings.bankAccountNumber}</p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7">
            <div className="p-7 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <h2 className="font-display text-xl font-semibold text-slate-950 dark:text-white">
                Send an Admission Inquiry
              </h2>
              <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
                Inquiries are stored securely in Firestore and reviewed inside the Birta Academy
                Admin Console.
              </p>

              {!profile ? (
                <div className="mt-6 p-5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-4">
                  <p className="text-sm text-slate-700 dark:text-slate-300">
                    To protect admissions from spam and link your inquiry directly to your learner
                    account, sign in with Google before submitting.
                  </p>
                  <button
                    type="button"
                    onClick={() => void signInWithGoogle()}
                    className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-slate-950 dark:bg-brand-600 text-white hover:opacity-90 transition-opacity"
                  >
                    Sign In with Google to Continue
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="inq-name"
                        className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                      >
                        Full Name
                      </label>
                      <input
                        id="inq-name"
                        type="text"
                        required
                        maxLength={100}
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-600"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="inq-email"
                        className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                      >
                        Email Address
                      </label>
                      <input
                        id="inq-email"
                        type="email"
                        required
                        maxLength={200}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-600"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="inq-phone"
                        className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                      >
                        Phone / WhatsApp (Optional)
                      </label>
                      <input
                        id="inq-phone"
                        type="tel"
                        maxLength={30}
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+977 98XXXXXXXX"
                        className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-600"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="inq-course"
                        className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                      >
                        Course of Interest
                      </label>
                      <select
                        id="inq-course"
                        value={courseInterest}
                        onChange={(e) => setCourseInterest(e.target.value)}
                        className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-600"
                      >
                        <option value="General Admissions Inquiry">General Admissions Inquiry</option>
                        {courses.map((c) => (
                          <option key={c.id} value={c.title}>
                            {c.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="inq-message"
                      className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                    >
                      Your Question
                    </label>
                    <textarea
                      id="inq-message"
                      required
                      rows={4}
                      maxLength={1500}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Tell us about your learning goals, schedule questions, or batch inquiry..."
                      className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-600"
                    />
                  </div>

                  {errorMsg && (
                    <div
                      role="alert"
                      className="p-3.5 rounded-lg border border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300"
                    >
                      {errorMsg}
                    </div>
                  )}

                  {submittedId && (
                    <div className="p-3.5 rounded-lg border border-emerald-300 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 text-xs text-emerald-800 dark:text-emerald-300">
                      Inquiry received (Reference:{' '}
                      <span className="font-mono font-semibold">{submittedId}</span>). Our
                      admissions team will follow up via email.
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-6 py-2.5 text-sm font-semibold rounded-lg bg-slate-950 dark:bg-brand-600 text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
                  >
                    {submitting ? 'Submitting Inquiry...' : 'Submit Admission Inquiry'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
