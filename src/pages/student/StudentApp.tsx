import { Route, Routes } from 'react-router-dom';
import { Award, Bell, BookOpen, ClipboardList, LayoutDashboard, UserRound, Video, ShieldCheck } from 'lucide-react';
import { LmsShell } from '../../components/lms/LmsShell';
import { StudentDataProvider } from './StudentData';
import { MyLearning, StudentAssignments, StudentCertificates, StudentHome, StudentLive, StudentNotifications, StudentProfile } from './StudentPages';
import { LearnWorkspace } from './LearnWorkspace';

/** Student portal: five sidebar items; profile, settings, notifications and sign out live in the account menu. */
export function StudentApp() {
  return (
    <StudentDataProvider>
      <Routes>
        <Route
          element={
            <LmsShell
              portal="Student"
              nav={[
                { to: '/student', label: 'Dashboard', icon: LayoutDashboard, end: true },
                { to: '/student/learning', label: 'My Learning', icon: BookOpen },
                { to: '/student/live', label: 'Live Classes', icon: Video },
                { to: '/student/assignments', label: 'Assignments', icon: ClipboardList },
                { to: '/student/certificates', label: 'Certificates', icon: Award },
              ]}
              menu={[
                { to: '/student/profile', label: 'Profile & settings', icon: UserRound },
                { to: '/student/settings/security', label: 'Security', icon: ShieldCheck },
                { to: '/student/notifications', label: 'Notifications', icon: Bell },
              ]}
            />
          }
        >
          <Route index element={<StudentHome />} />
          <Route path="learning" element={<MyLearning />} />
          <Route path="live" element={<StudentLive />} />
          <Route path="assignments" element={<StudentAssignments />} />
          <Route path="certificates" element={<StudentCertificates />} />
          <Route path="profile" element={<StudentProfile />} />
          <Route path="notifications" element={<StudentNotifications />} />
          <Route path="learn/:enrollmentId" element={<LearnWorkspace />} />
          <Route path="*" element={<StudentHome />} />
        </Route>
      </Routes>
    </StudentDataProvider>
  );
}
