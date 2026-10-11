import { createLazyRoute } from '@tanstack/react-router';
import { AssessmentPage } from '@/components/sections/assessment/AssessmentPage';

// Code-split: the assessment UI, its 1,300-line content file and scoring load on first visit
export const Route = createLazyRoute('/assessment')({
  component: AssessmentPage,
});
