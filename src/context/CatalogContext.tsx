import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  fetchAcademySettings,
  fetchPublicCatalog,
} from '../lib/firestoreService';
import {
  DEFAULT_ACADEMY_SETTINGS,
  DEMO_BATCHES,
  DEMO_CATEGORIES,
  DEMO_COURSES,
  DEMO_INSTRUCTORS,
} from '../data/demoCatalog';
import type {
  AcademySettings,
  Batch,
  Category,
  Course,
  InstructorProfile,
} from '../types';

interface CatalogContextValue {
  categories: Category[];
  courses: Course[];
  batches: Batch[];
  instructors: InstructorProfile[];
  settings: AcademySettings;
  usingFallbackDemo: boolean;
  loading: boolean;
  refreshCatalog: () => Promise<void>;
}

const CatalogContext = createContext<CatalogContextValue | null>(null);

export function CatalogProvider({ children }: { children: React.ReactNode }) {
  const [categories, setCategories] = useState<Category[]>(DEMO_CATEGORIES);
  const [courses, setCourses] = useState<Course[]>(DEMO_COURSES);
  const [batches, setBatches] = useState<Batch[]>(DEMO_BATCHES);
  const [instructors, setInstructors] = useState<InstructorProfile[]>(DEMO_INSTRUCTORS);
  const [settings, setSettings] = useState<AcademySettings>(DEFAULT_ACADEMY_SETTINGS);
  const [usingFallbackDemo, setUsingFallbackDemo] = useState(true);
  const [loading, setLoading] = useState(true);

  const refreshCatalog = useCallback(async () => {
    setLoading(true);
    try {
      const [catalog, academySettings] = await Promise.all([
        fetchPublicCatalog(),
        fetchAcademySettings(),
      ]);
      setCategories(catalog.categories);
      setCourses(catalog.courses);
      setBatches(catalog.batches);
      setInstructors(catalog.instructors);
      setUsingFallbackDemo(catalog.usingFallbackDemo);
      setSettings(academySettings);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshCatalog();
  }, [refreshCatalog]);

  return (
    <CatalogContext.Provider
      value={{
        categories,
        courses,
        batches,
        instructors,
        settings,
        usingFallbackDemo,
        loading,
        refreshCatalog,
      }}
    >
      {children}
    </CatalogContext.Provider>
  );
}

export function useCatalog() {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error('useCatalog must be used within CatalogProvider');
  return ctx;
}
