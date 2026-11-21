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
const StudentLoginPage = lazy(() => import('./pages/auth/StudentLoginPage').then((m) => ({ default: m.StudentLoginPage })));
const StudentRegisterPage = lazy(() => import('./pages/auth/StudentRegisterPage').then((m) => ({ default: m.StudentRegisterPage })));
const ForgotPasswordPage = lazy(() => import('./pages/auth/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })));
const VerifyEmailPage = lazy(() => import('./pages/auth/VerifyEmailPage').then((m) => ({ default: m.VerifyEmailPage })));
const StudentSecurityPage = lazy(() => import('./pages/student/StudentSecurityPage').then((m) => ({ default: m.StudentSecurityPage })));
const VerifyCertificatePage = lazy(() => import('./pages/public/VerifyCertificatePage').then((m) => ({ default: m.VerifyCertificatePage })));
const StaffLoginPage = lazy(() => import('./pages/staff/StaffLoginPage').then((m) => ({ default: m.StaffLoginPage })));
const StaffSecurityPage = lazy(() => import('./pages/staff/StaffSecurityPage').then((m) => ({ default: m.StaffSecurityPage })));
const LegalPage = lazy(() => import('./pages/public/LegalPage').then((m) => ({ default: m.LegalPage })));

const StudentApp = lazy(() => import('./pages/student/StudentApp').then((m) => ({ default: m.StudentApp })));
const InstructorApp = lazy(() => import('./pages/instructor/InstructorApp').then((m) => ({ default: m.InstructorApp })));
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
                <Route path="/login" element={<StudentLoginPage />} />
                <Route path="/student/login" element={<Navigate to="/login" replace />} />
                <Route path="/student/register" element={<Navigate to="/register" replace />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/verify-email" element={<VerifyEmailPage />} />
                <Route path="/staff/login" element={<StaffLoginPage />} />
                <Route path="/staff/security" element={<StaffSecurityPage />} />
                <Route path="/register" element={<StudentRegisterPage />} />
                <Route path="/privacy" element={<LegalPage type="privacy" />} />
                <Route path="/terms" element={<LegalPage type="terms" />} />
                <Route path="/refund" element={<LegalPage type="refund" />} />
                <Route path="/verify" element={<VerifyCertificatePage />} />
                <Route path="/verify/:code" element={<VerifyCertificatePage />} />

                <Route
                  path="/student/settings/security"
                  element={
                    <ProtectedRoute allowedRoles={["student"]} loginPath="/login">
                      <StudentSecurityPage />
                    </ProtectedRoute>
                  }
                />

                {/* Student Learning Management System */}
                <Route
                  path="/student/*"
                  element={
                    <ProtectedRoute allowedRoles={["student"]} loginPath="/login" requireVerifiedEmail>
                      <StudentApp />
                    </ProtectedRoute>
                  }
                />

                {/* Instructor Portal */}
                <Route
                  path="/instructor/*"
                  element={
                    <ProtectedRoute allowedRoles={['instructor', 'admin']} loginPath="/staff/login">
                      <InstructorApp />
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
