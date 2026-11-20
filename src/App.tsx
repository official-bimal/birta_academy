import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { CatalogProvider } from './context/CatalogContext';
import { ProtectedRoute } from './components/ProtectedRoute';

import { HomePage } from './pages/public/HomePage';
import { CoursesPage } from './pages/public/CoursesPage';
import { CourseDetailPage } from './pages/public/CourseDetailPage';
import { BatchesPage } from './pages/public/BatchesPage';
import { InstructorsPage } from './pages/public/InstructorsPage';
import { AboutPage } from './pages/public/AboutPage';
import { ContactPage } from './pages/public/ContactPage';
import { AuthPage } from './pages/public/AuthPage';
import { VerifyCertificatePage } from './pages/public/VerifyCertificatePage';
import { StaffLoginPage } from './pages/staff/StaffLoginPage';
import { StaffSecurityPage } from './pages/staff/StaffSecurityPage';
import { LegalPage } from './pages/public/LegalPage';

import { StudentDashboard } from './pages/student/StudentDashboard';
import { InstructorDashboard } from './pages/instructor/InstructorDashboard';
import { AdminDashboard } from './pages/admin/AdminDashboard';

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <CatalogProvider>
            <BrowserRouter>
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
            </BrowserRouter>
          </CatalogProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
