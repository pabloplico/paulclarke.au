import { useAssessment } from '@/hooks/useAssessment';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { AssessmentForm } from './AssessmentForm';
import { AssessmentResults } from './AssessmentResults';

/** The /assessment route. Loaded lazily, together with the assessment content and scoring. */
export function AssessmentPage() {
  useDocumentTitle('AI readiness assessment');
  const { profile, results, updateProfile, updateDimensionAnswer, restart } = useAssessment();

  return (
    <section className="pt-20 md:pt-32 pb-16 relative">
      <div className="absolute -top-24 -left-24 w-96 h-96 bg-primary/5 rounded-full blur-[120px] pointer-events-none" />
      <p className="relative mb-10 rounded-lg border border-primary/30 bg-primary/[0.06] px-4 py-3 text-sm text-foreground">
        A demo project: a free AI readiness assessment I built for small businesses.
      </p>
      <div className="mb-16 relative">
        <span className="font-label text-primary tracking-[0.2em] text-xs uppercase mb-6 block">
          Assessment
        </span>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tighter leading-tight mb-6">
          90-Day AI Action Plan
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed">
          Built for your business, free personalised action plan based on current Australian and
          global AI frameworks.
        </p>
      </div>
      <div className="flex flex-col lg:flex-row gap-10 lg:items-start">
        <div className="w-full lg:w-[420px] lg:shrink-0">
          <AssessmentForm
            profile={profile}
            onProfileChange={updateProfile}
            onDimensionAnswer={updateDimensionAnswer}
          />
        </div>
        <div className="flex-1 min-w-0 lg:sticky lg:top-20">
          <AssessmentResults profile={profile} results={results} onRestart={restart} />
        </div>
      </div>
    </section>
  );
}
