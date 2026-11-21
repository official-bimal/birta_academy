import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, LogOut, Menu, Moon, ShieldCheck, Sun, UserRound, X } from 'lucide-react';
import { BrandLogo } from '../BrandLogo';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

export interface ShellNavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  end?: boolean;
}

export interface ShellMenuItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

interface Props {
  portal: string;
  nav: ShellNavItem[];
  menu: ShellMenuItem[];
  footer?: ReactNode;
}

/** Compact LMS shell: five-item sidebar, account menu (profile, settings, notifications, sign out). */
export function LmsShell({ portal, nav, menu, footer }: Props) {
  const { profile, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOpen(false);
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const initials = (profile?.displayName || 'U').split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('');

  const links = (
    <nav aria-label={`${portal} navigation`} className="px-3 py-4 space-y-1">
      {nav.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              isActive ? 'bg-brand-50 text-brand-800 dark:bg-brand-950/60 dark:text-brand-200' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900'
            }`
          }
        >
          <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
          {label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      {/* desktop sidebar */}
      <aside className="hidden lg:flex flex-col sticky top-0 h-screen border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
        <div className="h-16 px-4 flex items-center">
          <Link to="/" aria-label="Birta Academy home"><BrandLogo size={32} withWordmark /></Link>
        </div>
        <p className="px-6 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{portal}</p>
        <div className="flex-1 overflow-y-auto">{links}</div>
        {footer && <div className="p-4 border-t border-slate-200 dark:border-slate-800">{footer}</div>}
      </aside>

      {/* mobile drawer */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="w-64 bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 flex flex-col">
            <div className="h-16 px-4 flex items-center justify-between">
              <BrandLogo size={32} withWordmark />
              <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="p-1.5"><X className="w-5 h-5" /></button>
            </div>
            {links}
          </div>
          <button type="button" aria-label="Close menu" className="flex-1 bg-slate-950/50" onClick={() => setOpen(false)} />
        </div>
      )}

      <div className="min-w-0 flex flex-col min-h-screen">
        <header className="sticky top-0 z-30 h-16 shrink-0 flex items-center justify-between gap-3 px-4 sm:px-6 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 backdrop-blur-sm">
          <button type="button" aria-label="Open menu" onClick={() => setOpen(true)} className="lg:hidden p-2 -ml-2"><Menu className="w-5 h-5" /></button>
          <Link to="/" className="lg:hidden" aria-label="Birta Academy home"><BrandLogo size={28} /></Link>
          <div className="flex-1" />
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900"
            >
              <span className="w-8 h-8 rounded-full bg-brand-600 text-white text-xs font-semibold inline-flex items-center justify-center">{initials}</span>
              <span className="hidden sm:block text-sm font-medium max-w-[10rem] truncate">{profile?.displayName}</span>
              <ChevronDown className="w-4 h-4 text-slate-500" aria-hidden="true" />
            </button>
            {menuOpen && (
              <div role="menu" className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg py-1.5">
                <div className="px-3.5 py-2 border-b border-slate-100 dark:border-slate-800">
                  <p className="text-sm font-semibold truncate">{profile?.displayName}</p>
                  <p className="text-xs text-slate-500 truncate">{profile?.email}</p>
                </div>
                {menu.map(({ to, label, icon: Icon }) => (
                  <Link key={to} role="menuitem" to={to} className="flex items-center gap-2.5 px-3.5 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
                    <Icon className="w-4 h-4 text-slate-500" aria-hidden="true" /> {label}
                  </Link>
                ))}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void logout().then(() => navigate('/login', { replace: true }))}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left hover:bg-slate-50 dark:hover:bg-slate-800 border-t border-slate-100 dark:border-slate-800 mt-1"
                >
                  <LogOut className="w-4 h-4 text-slate-500" aria-hidden="true" /> Sign out
                </button>
              </div>
            )}
          </div>
        </header>
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-6xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export { Bell, ShieldCheck, UserRound };
