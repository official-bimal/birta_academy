import { Route, Routes } from 'react-router-dom';
import { BookOpen, ClipboardCheck, LayoutDashboard, Users, Video, UserRound, ShieldCheck } from 'lucide-react';
import { LmsShell } from '../../components/lms/LmsShell';
import { InstructorDataProvider } from './InstructorData';
import { InstructorAssignments, InstructorClasses, InstructorOverview, InstructorStudents, MyCourses } from './InstructorPages';
import { CourseWorkspace } from './CourseWorkspace';

/** Instructor portal: five sidebar items; everything course-specific lives in the course workspace. */
export function InstructorApp() {
  return (
    <InstructorDataProvider>
      <Routes>
        <Route
          element={
            <LmsShell
              portal="Instructor"
              nav={[
                { to: '/instructor', label: 'Overview', icon: LayoutDashboard, end: true },
                { to: '/instructor/courses', label: 'My Courses', icon: BookOpen },
                { to: '/instructor/classes', label: 'Live Classes', icon: Video },
                { to: '/instructor/students', label: 'Students', icon: Users },
                { to: '/instructor/assignments', label: 'Assignments', icon: ClipboardCheck },
              ]}
              menu={[
                { to: '/staff/security', label: 'Security (2-step)', icon: ShieldCheck },
                { to: '/forgot-password?for=staff', label: 'Change password', icon: UserRound },
              ]}
            />
          }
        >
          <Route index element={<InstructorOverview />} />
          <Route path="courses" element={<MyCourses />} />
          <Route path="courses/:courseId/batches/:batchId" element={<CourseWorkspace />} />
          <Route path="classes" element={<InstructorClasses />} />
          <Route path="students" element={<InstructorStudents />} />
          <Route path="assignments" element={<InstructorAssignments />} />
          <Route path="*" element={<InstructorOverview />} />
        </Route>
      </Routes>
    </InstructorDataProvider>
  );
}
