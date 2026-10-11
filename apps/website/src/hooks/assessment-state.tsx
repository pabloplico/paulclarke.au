import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';
// Type-only import: keeps the assessment content and scoring code out of the main bundle
import type { AssessmentProfile } from '@/lib/assessment-content';

export const INITIAL_PROFILE: AssessmentProfile = {
  industry: null,
  maturityLevel: null,
  painPoints: [],
  dimensionAnswers: {},
};

interface AssessmentState {
  profile: AssessmentProfile;
  updateProfile: (patch: Partial<AssessmentProfile>) => void;
  /** `null` clears the rating, so the question counts as unanswered again. */
  updateDimensionAnswer: (questionId: string, value: number | null) => void;
  restart: () => void;
}

const AssessmentStateContext = createContext<AssessmentState | null>(null);

/**
 * Holds the visitor's assessment answers above the router, so they survive navigating
 * to other pages and back (the answers never leave the browser).
 */
export function AssessmentStateProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<AssessmentProfile>(INITIAL_PROFILE);

  const updateProfile = useCallback((patch: Partial<AssessmentProfile>) => {
    setProfile((prev) => ({ ...prev, ...patch }));
  }, []);

  const updateDimensionAnswer = useCallback((questionId: string, value: number | null) => {
    setProfile((prev) => {
      // Scoring treats any key as answered, so clearing removes the key rather than storing 0
      const { [questionId]: _previous, ...others } = prev.dimensionAnswers;
      return {
        ...prev,
        dimensionAnswers: value === null ? others : { ...others, [questionId]: value },
      };
    });
  }, []);

  const restart = useCallback(() => {
    setProfile(INITIAL_PROFILE);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const value = useMemo(
    () => ({ profile, updateProfile, updateDimensionAnswer, restart }),
    [profile, updateProfile, updateDimensionAnswer, restart]
  );

  return (
    <AssessmentStateContext.Provider value={value}>{children}</AssessmentStateContext.Provider>
  );
}

export function useAssessmentState(): AssessmentState {
  const state = useContext(AssessmentStateContext);
  if (!state) throw new Error('useAssessmentState must be used inside <AssessmentStateProvider>');
  return state;
}
