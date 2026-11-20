import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, LogOut, Menu, Moon, Sun, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export interface DashboardNavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  count?: number;
}

interface DashboardShellProps {
  portalTitle: string;
  roleLabel: string;
  navItems: DashboardNavItem[];
  activeTab: string;
  onSelectTab: (id: string) => void;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}

export function DashboardShell({
  portalTitle,
  roleLabel,
  navItems,
  activeTab,
  onSelectTab,
  headerAction,
  children,
}: DashboardShellProps) {
  const { profile, logout, isAdmin, isInstructor } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const activeItem = navItems.find((i) => i.id === activeTab);

  const renderSidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="h-16 px-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <Link
          to="/"
          className="font-display text-base font-bold tracking-tight text-slate-950 dark:text-white whitespace-nowrap"
        >
          Birta Academy
        </Link>
        <button
          type="button"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close sidebar"
          className="lg:hidden p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{roleLabel}</p>
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate mt-0.5">
          {profile?.displayName}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{profile?.email}</p>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = item.id === activeTab;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectTab(item.id);
                setSidebarOpen(false);
              }}
              className={`w-full flex items-center justify-between gap-2.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors text-left ${
                active
                  ? 'bg-slate-900 text-white dark:bg-brand-600 dark:text-white'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </span>
              {typeof item.count === 'number' && item.count > 0 && (
                <span
                  className={`font-mono tabular-nums text-xs ${
                    active ? 'text-white/80' : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {item.count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Role portal switcher for authorized multi-role accounts */}
      <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium text-slate-500 dark:text-slate-400">
          <Link to="/student" className="hover:text-slate-900 dark:hover:text-white transition-colors">
            Student
          </Link>
          {isInstructor && (
            <>
              <span aria-hidden="true">·</span>
              <Link to="/instructor" className="hover:text-slate-900 dark:hover:text-white transition-colors">
                Instructor
              </Link>
            </>
          )}
          {isAdmin && (
            <>
              <span aria-hidden="true">·</span>
              <Link to="/admin" className="hover:text-slate-900 dark:hover:text-white transition-colors">
                Admin
              </Link>
            </>
          )}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Public Site</span>
          </Link>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="p-1.5 rounded-md text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => void logout()}
              aria-label="Sign out"
              className="p-1.5 rounded-md text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60">
        {renderSidebarContent()}
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/50"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="relative z-10 w-64 max-w-[82vw] bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">
            {renderSidebarContent()}
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 h-16 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 backdrop-blur-sm px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation"
              className="lg:hidden p-2 -ml-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap">
                {portalTitle}
              </span>
              <span className="text-slate-400" aria-hidden="true">/</span>
              <h1 className="font-display font-semibold text-slate-950 dark:text-white truncate">
                {activeItem?.label || 'Overview'}
              </h1>
            </div>
          </div>

          {headerAction && <div className="shrink-0">{headerAction}</div>}
        </header>

        <main className="flex-1 p-6 lg:p-8 max-w-6xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
