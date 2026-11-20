import React from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { UserRole } from '../types';

interface ProtectedRouteProps {
  allowedRoles: UserRole[];
  children: React.ReactNode;
}

export function ProtectedRoute({ allowedRoles, children }: ProtectedRouteProps) {
  const { profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-sm text-slate-500 dark:text-slate-400">
          Verifying academy session...
        </div>
      </div>
    );
  }

  if (!profile) {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(profile.role)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-6">
        <div className="max-w-md w-full p-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <ShieldAlert className="w-5 h-5" />
            <h1 className="font-display text-lg font-semibold">Access Restricted</h1>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            Your account (<span className="font-mono">{profile.email}</span>) has the{' '}
            <strong className="capitalize">{profile.role}</strong> role. This portal requires{' '}
            {allowedRoles.join(' or ')} permissions enforced by Birta Academy database security
            rules.
          </p>
          <div className="pt-2 flex items-center gap-3">
            <Link
              to="/student"
              className="px-4 py-2 text-sm font-medium rounded-lg bg-slate-950 dark:bg-brand-600 text-white"
            >
              Go to Student Dashboard
            </Link>
            <Link
              to="/"
              className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200"
            >
              Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
