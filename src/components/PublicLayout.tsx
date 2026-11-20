import React, { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Menu, Moon, Sun, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useCatalog } from '../context/CatalogContext';
import { BrandLogo } from './BrandLogo';

const PUBLIC_NAV_LINKS = [
  { to: '/courses', label: 'Courses' },
  { to: '/batches', label: 'Batches' },
  { to: '/instructors', label: 'Instructors' },
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' },
];

export function PublicLayout({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { settings } = useCatalog();
  const [mobileOpen, setMobileOpen] = useState(false);

  const portalPath =
    profile?.role === 'admin'
      ? '/admin'
      : profile?.role === 'instructor'
      ? '/instructor'
      : '/student';

  const portalLabel =
    profile?.role === 'admin'
      ? 'Admin Console'
      : profile?.role === 'instructor'
      ? 'Instructor Portal'
      : 'Student Portal';

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-200">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 h-16 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto h-full px-6 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <Link
            to="/"
            className="inline-flex shrink-0 rounded-md"
          >
            <BrandLogo size={36} withWordmark />
          </Link>

          {/* Zone 2: 5 Concise Single-Line Navigation Links */}
          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600 dark:text-slate-300"
          >
            {PUBLIC_NAV_LINKS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `whitespace-nowrap shrink-0 py-1 transition-colors duration-150 hover:text-slate-950 dark:hover:text-white ${
                    isActive
                      ? 'text-brand-700 dark:text-brand-400 underline underline-offset-8 decoration-2'
                      : ''
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* Zone 3: Primary Action */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              className="hidden sm:inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors shrink-0"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {!loading && profile ? (
              <Link
                to={portalPath}
                className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg bg-brand-600 text-white hover:bg-brand-700 dark:hover:bg-brand-500 transition-colors whitespace-nowrap shrink-0"
              >
                {portalLabel}
              </Link>
            ) : (
              <Link
                to="/login"
                className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg bg-brand-600 text-white hover:bg-brand-700 dark:hover:bg-brand-500 transition-colors whitespace-nowrap shrink-0"
              >
                Sign In
              </Link>
            )}

            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Toggle navigation menu"
              className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Drawer */}
        {mobileOpen && (
          <div className="md:hidden border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-6 py-4 space-y-3">
            <nav className="flex flex-col space-y-2">
              {PUBLIC_NAV_LINKS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `py-2 text-sm font-medium ${
                      isActive
                        ? 'text-brand-700 dark:text-brand-400'
                        : 'text-slate-700 dark:text-slate-200'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={toggleTheme}
                className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                <span>{theme === 'dark' ? 'Light theme' : 'Dark theme'}</span>
              </button>
              <Link
                to="/login"
                onClick={() => setMobileOpen(false)}
                className="text-sm font-medium text-brand-700 dark:text-brand-400"
              >
                Student Login
              </Link>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">{children}</main>

      {/* Quiet Editorial Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
        <div className="max-w-7xl mx-auto px-6 py-14 grid grid-cols-1 md:grid-cols-12 gap-10">
          <div className="md:col-span-5 space-y-3">
            <Link
              to="/"
              className="inline-flex shrink-0 rounded-md"
            >
            <BrandLogo size={36} withWordmark />
          </Link>
            <p className="text-sm text-slate-600 dark:text-slate-400 max-w-sm leading-relaxed">
              Learn Skills. Build Your Future. Nepal-based online skill training with instructor-led
              live classes, practical assignments, recorded replays, and completion certificates.
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {settings.location} · {settings.supportEmail}
            </p>
          </div>

          <div className="md:col-span-2 space-y-2.5">
            <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">Academy</h3>
            <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
              <li><Link to="/courses" className="hover:text-slate-950 dark:hover:text-white transition-colors">Course Catalog</Link></li>
              <li><Link to="/batches" className="hover:text-slate-950 dark:hover:text-white transition-colors">Upcoming Batches</Link></li>
              <li><Link to="/instructors" className="hover:text-slate-950 dark:hover:text-white transition-colors">Instructors</Link></li>
              <li><Link to="/about" className="hover:text-slate-950 dark:hover:text-white transition-colors">About Birta</Link></li>
            </ul>
          </div>

          <div className="md:col-span-2 space-y-2.5">
            <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">Students</h3>
            <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
              <li><Link to="/login" className="hover:text-slate-950 dark:hover:text-white transition-colors">Student Login</Link></li>
              <li><Link to="/contact" className="hover:text-slate-950 dark:hover:text-white transition-colors">Admissions Inquiry</Link></li>
              <li><a href="https://www.facebook.com/birtaacademy/" target="_blank" rel="noopener noreferrer" className="hover:text-slate-950 dark:hover:text-white transition-colors">Facebook</a></li>
              <li><a href="https://www.instagram.com/birtaacademy_/" target="_blank" rel="noopener noreferrer" className="hover:text-slate-950 dark:hover:text-white transition-colors">Instagram</a></li>
            </ul>
          </div>

          <div className="md:col-span-3 space-y-2.5">
            <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">Legal & Theme</h3>
            <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
              <li><Link to="/privacy" className="hover:text-slate-950 dark:hover:text-white transition-colors">Privacy Policy</Link></li>
              <li><Link to="/terms" className="hover:text-slate-950 dark:hover:text-white transition-colors">Terms of Service</Link></li>
              <li><Link to="/refund" className="hover:text-slate-950 dark:hover:text-white transition-colors">Refund Policy</Link></li>
              <li><Link to="/verify" className="hover:text-slate-950 dark:hover:text-white transition-colors">Verify a Certificate</Link></li>
            </ul>
            <button
              type="button"
              onClick={toggleTheme}
              className="mt-3 inline-flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
            >
              {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              <span>{theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}</span>
            </button>
          </div>
        </div>

        <div className="border-t border-slate-200 dark:border-slate-800">
          <div className="max-w-7xl mx-auto px-6 py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
            <p>© {new Date().getFullYear()} Birta Academy. All rights reserved.</p>
            <p className="sm:order-last">Education only. Forex and trading content is not financial advice and carries no guaranteed results.</p>
            <p>Currency: NPR · Live Cohort Schedule: Nepal Time (UTC+5:45)</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
