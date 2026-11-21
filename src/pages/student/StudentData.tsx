import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  listBatchAnnouncements,
  listBatchAssignments,
  listBatchLessons,
  listBatchLiveSessions,
  listStudentCertificates,
  listStudentEnrollments,
  listStudentProgress,
  listStudentSubmissions,
} from '../../lib/firestoreService';
import type { Announcement, Assignment, Certificate, Enrollment, Lesson, LessonProgress, LiveSession, Submission } from '../../types';

export interface BatchData {
  lessons: Lesson[];
  sessions: LiveSession[];
  assignments: Assignment[];
  announcements: Announcement[];
}

interface StudentDataValue {
  loading: boolean;
  error: string | null;
  enrollments: Enrollment[];
  /** approved or completed: these give access to course material */
  active: Enrollment[];
  pending: Enrollment[];
  rejected: Enrollment[];
  byBatch: Record<string, BatchData>;
  progress: LessonProgress[];
  submissions: Submission[];
  certificates: Certificate[];
  reload: () => Promise<void>;
  setProgress: (p: LessonProgress[]) => void;
  setSubmissions: (s: Submission[]) => void;
  percentFor: (e: Enrollment) => number;
}

const Ctx = createContext<StudentDataValue | null>(null);
export const useStudentData = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStudentData must be used inside StudentDataProvider');
  return v;
};

const EMPTY: BatchData = { lessons: [], sessions: [], assignments: [], announcements: [] };

/** Loads everything the student portal needs once, from real Firestore data the student is authorised to read. */
export function StudentDataProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [byBatch, setByBatch] = useState<Record<string, BatchData>>({});
  const [progress, setProgress] = useState<LessonProgress[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);

  const reload = useCallback(async () => {
    if (!profile) return;
    setError(null);
    try {
      const enr = await listStudentEnrollments(profile.uid);
      const activeEnr = enr.filter((e) => e.enrollmentStatus === 'approved' || e.enrollmentStatus === 'completed');
      const [prog, subs, certs, batchRows] = await Promise.all([
        listStudentProgress(profile.uid),
        listStudentSubmissions(profile.uid),
        listStudentCertificates(profile.uid),
        Promise.all(
          activeEnr.map(async (e) => {
            const [lessons, sessions, assignments, announcements] = await Promise.all([
              listBatchLessons(e.batchId).catch(() => []),
              listBatchLiveSessions(e.batchId, true).catch(() => []),
              listBatchAssignments(e.batchId).catch(() => []),
              listBatchAnnouncements(e.batchId).catch(() => []),
            ]);
            return [e.batchId, { lessons, sessions, assignments, announcements }] as const;
          })
        ),
      ]);
      setEnrollments(enr.sort((a, b) => String(b.batchName).localeCompare(String(a.batchName))));
      setByBatch(Object.fromEntries(batchRows));
      setProgress(prog);
      setSubmissions(subs);
      setCertificates(certs);
    } catch {
      setError('We could not load your learning data. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const value = useMemo<StudentDataValue>(() => {
    const active = enrollments.filter((e) => e.enrollmentStatus === 'approved' || e.enrollmentStatus === 'completed');
    return {
      loading,
      error,
      enrollments,
      active,
      pending: enrollments.filter((e) => e.enrollmentStatus === 'pending'),
      rejected: enrollments.filter((e) => e.enrollmentStatus === 'rejected'),
      byBatch,
      progress,
      submissions,
      certificates,
      reload,
      setProgress,
      setSubmissions,
      percentFor: (e) => {
        const lessons = (byBatch[e.batchId] ?? EMPTY).lessons;
        if (lessons.length === 0) return 0;
        const done = progress.filter((p) => p.batchId === e.batchId && p.completed && lessons.some((l) => l.id === p.lessonId)).length;
        return Math.round((done / lessons.length) * 100);
      },
    };
  }, [loading, error, enrollments, byBatch, progress, submissions, certificates, reload]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const batchData = (byBatch: Record<string, BatchData>, batchId: string): BatchData => byBatch[batchId] ?? EMPTY;
