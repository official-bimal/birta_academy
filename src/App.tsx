import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { CatalogProvider } from './context/CatalogContext';
import { ProtectedRoute } from './components/ProtectedRoute';

import { HomePage } from './pages/public/HomePage';
const CoursesPage = lazy(() => import('./pages/public/CoursesPage').then((m) => ({ default: m.CoursesPage })));
const CourseDetailPage = lazy(() => import('./pages/public/CourseDetailPage').then((m) => ({ default: m.CourseDetailPage })));
const BatchesPage = lazy(() => import('./pages/public/BatchesPage').then((m) => ({ default: m.BatchesPage })));
const InstructorsPage = lazy(() => import('./pages/public/InstructorsPage').then((m) => ({ default: m.InstructorsPage })));
const AboutPage = lazy(() => import('./pages/public/AboutPage').then((m) => ({ default: m.AboutPage })));
const ContactPage = lazy(() => import('./pages/public/ContactPage').then((m) => ({ default: m.ContactPage })));
const AuthPage = lazy(() => import('./pages/public/AuthPage').then((m) => ({ default: m.AuthPage })));
const VerifyCertificatePage = lazy(() => import('./pages/public/VerifyCertificatePage').then((m) => ({ default: m.VerifyCertificatePage })));
const StaffLoginPage = lazy(() => import('./pages/staff/StaffLoginPage').then((m) => ({ default: m.StaffLoginPage })));
const StaffSecurityPage = lazy(() => import('./pages/staff/StaffSecurityPage').then((m) => ({ default: m.StaffSecurityPage })));
const LegalPage = lazy(() => import('./pages/public/LegalPage').then((m) => ({ default: m.LegalPage })));

const StudentDashboard = lazy(() => import('./pages/student/StudentDashboard').then((m) => ({ default: m.StudentDashboard })));
const InstructorDashboard = lazy(() => import('./pages/instructor/InstructorDashboard').then((m) => ({ default: m.InstructorDashboard })));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard').then((m) => ({ default: m.AdminDashboard })));

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <CatalogProvider>
            <BrowserRouter>
              <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm text-slate-500" role="status">Loading…</div>}>
              <Routes>
                {/* Public Marketing Website */}
                <Route path="/" element={<HomePage />} />
                <Route path="/courses" element={<CoursesPage />} />
                <Route path="/courses/:slug" element={<CourseDetailPage />} />
                <Route path="/categories/:slug" element={<CoursesPage />} />
                <Route path="/batches" element={<BatchesPage />} />
                <Route path="/instructors" element={<InstructorsPage />} />
                <Route path="/about" element={<AboutPage />} />
                <Route path="/contact" element={<ContactPage />} />
                <Route path="/login" element={<AuthPage mode="login" />} />
                <Route path="/staff/login" element={<StaffLoginPage />} />
                <Route path="/staff/security" element={<StaffSecurityPage />} />
                <Route path="/register" element={<Navigate to="/login" replace />} />
                <Route path="/privacy" element={<LegalPage type="privacy" />} />
                <Route path="/terms" element={<LegalPage type="terms" />} />
                <Route path="/refund" element={<LegalPage type="refund" />} />
                <Route path="/verify" element={<VerifyCertificatePage />} />
                <Route path="/verify/:code" element={<VerifyCertificatePage />} />

                {/* Student Learning Management System */}
                <Route
                  path="/student/*"
                  element={
                    <ProtectedRoute allowedRoles={['student']}>
                      <StudentDashboard />
                    </ProtectedRoute>
                  }
                />

                {/* Instructor Portal */}
                <Route
                  path="/instructor/*"
                  element={
                    <ProtectedRoute allowedRoles={['instructor', 'admin']} loginPath="/staff/login">
                      <InstructorDashboard />
                    </ProtectedRoute>
                  }
                />

                {/* Academy Admin Dashboard */}
                <Route
                  path="/admin/*"
                  element={
                    <ProtectedRoute allowedRoles={['admin']} loginPath="/staff/login">
                      <AdminDashboard />
                    </ProtectedRoute>
                  }
                />

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
              </Suspense>
            </BrowserRouter>
          </CatalogProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
