import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  listAllEnrollments,
  listBatchAssignments,
  listBatchLiveSessions,
  listInstructorBatches,
  listInstructorEnrollments,
  listInstructorSubmissions,
} from '../../lib/firestoreService';
import type { Assignment, Batch, Enrollment, LiveSession, Submission } from '../../types';

interface Value {
  loading: boolean;
  error: string | null;
  batches: Batch[];
  enrollments: Enrollment[];
  /** approved or completed students only */
  students: Enrollment[];
  sessionsByBatch: Record<string, LiveSession[]>;
  assignmentsByBatch: Record<string, Assignment[]>;
  submissions: Submission[];
  reload: () => Promise<void>;
}

const Ctx = createContext<Value | null>(null);
export const useInstructorData = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useInstructorData must be used inside InstructorDataProvider');
  return v;
};

/** Everything the teaching portal needs, scoped by the server-set assignment (batch.instructorId). */
export function InstructorDataProvider({ children }: { children: ReactNode }) {
  const { profile, isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [sessionsByBatch, setSessions] = useState<Record<string, LiveSession[]>>({});
  const [assignmentsByBatch, setAssignments] = useState<Record<string, Assignment[]>>({});
  const [submissions, setSubmissions] = useState<Submission[]>([]);

  const reload = useCallback(async () => {
    if (!profile) return;
    setError(null);
    try {
      const b = (await listInstructorBatches(profile.uid, isAdmin)).filter((x) => x.status !== 'archived');
      const [enr, subs, perBatch] = await Promise.all([
        isAdmin ? listAllEnrollments() : listInstructorEnrollments(profile.uid),
        listInstructorSubmissions(profile.uid, isAdmin),
        Promise.all(b.map(async (x) => [x.id, await listBatchLiveSessions(x.id).catch(() => []), await listBatchAssignments(x.id).catch(() => [])] as const)),
      ]);
      setBatches(b);
      setEnrollments(enr);
      setSubmissions(subs);
      setSessions(Object.fromEntries(perBatch.map(([id, s]) => [id, s])));
      setAssignments(Object.fromEntries(perBatch.map(([id, , a]) => [id, a])));
    } catch {
      setError('Could not load your teaching data. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  }, [profile, isAdmin]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const value = useMemo<Value>(
    () => ({
      loading,
      error,
      batches,
      enrollments,
      students: enrollments.filter((e) => e.enrollmentStatus === 'approved' || e.enrollmentStatus === 'completed'),
      sessionsByBatch,
      assignmentsByBatch,
      submissions,
      reload,
    }),
    [loading, error, batches, enrollments, sessionsByBatch, assignmentsByBatch, submissions, reload]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
