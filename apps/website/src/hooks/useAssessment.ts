import { useMemo } from 'react';
import {
  type AssessmentProfile,
  type AssessmentResults,
  computeResults,
  type Industry,
  type MaturityLevel,
  type PainPointId,
  type ReadinessDimension,
  type ReadinessLevel,
} from '@/lib/assessment-content';
import { useAssessmentState } from './assessment-state';

interface UseAssessmentReturn {
  profile: AssessmentProfile;
  results: AssessmentResults | null;
  updateProfile: (patch: Partial<AssessmentProfile>) => void;
  updateDimensionAnswer: (questionId: string, value: number | null) => void;
  restart: () => void;
}

/** Answers come from AssessmentStateProvider; results are derived here, in the lazy chunk. */
export function useAssessment(): UseAssessmentReturn {
  const { profile, updateProfile, updateDimensionAnswer, restart } = useAssessmentState();
  const results = useMemo(() => computeResults(profile), [profile]);

  return { profile, results, updateProfile, updateDimensionAnswer, restart };
}

export type {
  AssessmentProfile,
  AssessmentResults,
  Industry,
  MaturityLevel,
  PainPointId,
  ReadinessDimension,
  ReadinessLevel,
};
