import { Checkbox } from '@repo/ui/checkbox';
import { Star } from 'lucide-react';
import { type Ref, useId, useState } from 'react';
import type { AssessmentProfile } from '@/hooks/useAssessment';
import {
  DIMENSION_QUESTIONS,
  DIMENSIONS,
  INDUSTRIES,
  MATURITY_LEVELS,
  PAIN_POINTS,
  type PainPointId,
} from '@/lib/assessment-content';
import { cn } from '@/lib/utils';

interface AssessmentFormProps {
  profile: AssessmentProfile;
  onProfileChange: (patch: Partial<AssessmentProfile>) => void;
  onDimensionAnswer: (questionId: string, value: number | null) => void;
  /** The industry buttons' container, so the page can focus the first one after a restart. */
  industryListRef?: Ref<HTMLDivElement>;
}

const MAX_PAIN_POINTS = 3;

const PAIN_POINT_GROUPS: { label: string; ids: PainPointId[] }[] = [
  {
    label: 'Operations',
    ids: [
      'admin-overload',
      'scheduling-coordination',
      'quoting-estimating',
      'inventory-management',
    ],
  },
  {
    label: 'Growth',
    ids: ['customer-response-time', 'marketing-content', 'lead-followup'],
  },
  {
    label: 'Back Office',
    ids: ['financial-reporting', 'compliance-documentation', 'staff-onboarding'],
  },
];

export function AssessmentForm({
  profile,
  onProfileChange,
  onDimensionAnswer,
  industryListRef,
}: AssessmentFormProps) {
  const [detailedOpen, setDetailedOpen] = useState(false);
  const [painPointsOpen, setPainPointsOpen] = useState(false);
  const hasPainPoints = profile.painPoints.length > 0;
  const painPointsId = useId();

  const togglePainPoint = (id: PainPointId) => {
    const current = profile.painPoints;
    if (current.includes(id)) {
      onProfileChange({ painPoints: current.filter((p) => p !== id) });
    } else if (current.length < MAX_PAIN_POINTS) {
      onProfileChange({ painPoints: [...current, id] });
    }
  };

  return (
    <div className="space-y-8">
      <fieldset className="space-y-5">
        <legend className="flex items-center gap-3">
          <span className="font-label text-primary text-2xl font-light">01</span>
          <span className="text-lg font-semibold">Your Industry</span>
        </legend>

        <div ref={industryListRef} className="grid gap-1.5">
          {INDUSTRIES.map(({ id, label }) => {
            const selected = profile.industry === id;
            if (profile.industry && !selected) return null;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={selected}
                onClick={() => onProfileChange({ industry: selected ? null : id })}
                className={cn(
                  'w-full text-left rounded-lg border px-4 py-2 transition-all cursor-pointer flex items-center gap-3',
                  selected
                    ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                    : 'border-white/15 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/25'
                )}
              >
                <div
                  aria-hidden="true"
                  className={cn(
                    'w-3.5 h-3.5 rounded-full border-2 shrink-0 transition-colors',
                    selected ? 'border-primary bg-primary' : 'border-white/25 bg-transparent'
                  )}
                />
                <span className={cn('text-sm font-medium', selected && 'text-primary')}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="flex items-center gap-3">
          <span className="font-label text-primary text-2xl font-light">02</span>
          <span className="text-lg font-semibold">Your AI Journey</span>
        </legend>

        <DetailedAnalysis
          profile={profile}
          onDimensionAnswer={onDimensionAnswer}
          onClear={() => onProfileChange({ dimensionAnswers: {} })}
          open={detailedOpen}
          onOpenChange={setDetailedOpen}
        />

        {!detailedOpen && (
          <div className="grid gap-1.5">
            {MATURITY_LEVELS.map(({ id, label, description }) => {
              const selected = profile.maturityLevel === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onProfileChange({ maturityLevel: id })}
                  className={cn(
                    'w-full text-left rounded-lg border px-4 py-2 transition-all cursor-pointer',
                    selected
                      ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                      : 'border-white/15 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/25'
                  )}
                >
                  <span className={cn('text-sm font-medium', selected && 'text-primary')}>
                    {label}
                  </span>
                  <p
                    className={cn(
                      'text-xs mt-0.5',
                      selected ? 'text-white/70' : 'text-muted-foreground'
                    )}
                  >
                    {description}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </fieldset>

      <div className="rounded-xl border border-primary/25 bg-primary/[0.04] px-4 py-3 space-y-3">
        <button
          type="button"
          role="switch"
          aria-checked={painPointsOpen}
          aria-labelledby={`${painPointsId}-label`}
          aria-describedby={`${painPointsId}-desc`}
          onClick={() => {
            const next = !painPointsOpen;
            setPainPointsOpen(next);
            if (!next && hasPainPoints) {
              onProfileChange({ painPoints: [] });
            }
          }}
          className="w-full flex items-start justify-between text-left cursor-pointer"
        >
          <div className="space-y-0.5">
            <span
              id={`${painPointsId}-label`}
              className="flex items-center gap-2 text-sm font-semibold text-primary"
            >
              <span className="font-label text-lg font-light">03</span>
              Pain Points
            </span>
            <p id={`${painPointsId}-desc`} className="text-xs text-muted-foreground">
              {painPointsOpen
                ? hasPainPoints
                  ? `${profile.painPoints.length}/${MAX_PAIN_POINTS} selected`
                  : `Pick up to ${MAX_PAIN_POINTS} to personalise your plan`
                : 'Optional — tailor recommendations to your challenges'}
            </p>
          </div>
          <div
            aria-hidden="true"
            className={cn(
              'relative w-11 h-6 rounded-full transition-colors shrink-0 mt-0.5',
              painPointsOpen ? 'bg-primary' : 'bg-white/15'
            )}
          >
            <div
              className={cn(
                'absolute top-1 w-4 h-4 rounded-full transition-transform',
                painPointsOpen ? 'translate-x-6 bg-background' : 'translate-x-1 bg-white'
              )}
            />
          </div>
        </button>

        {painPointsOpen && (
          <div className="space-y-3 pt-1">
            {PAIN_POINT_GROUPS.map((group) => (
              <fieldset key={group.label} className="space-y-1">
                <legend className="text-xs font-medium uppercase tracking-wider text-primary mb-1">
                  {group.label}
                </legend>
                {group.ids.map((ppId) => {
                  const pp = PAIN_POINTS.find((p) => p.id === ppId);
                  if (!pp) return null;
                  const selected = profile.painPoints.includes(pp.id);
                  const disabled = !selected && profile.painPoints.length >= MAX_PAIN_POINTS;
                  return (
                    <label
                      key={pp.id}
                      className={cn(
                        'flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors',
                        selected
                          ? 'bg-primary/10'
                          : disabled
                            ? 'opacity-40 cursor-not-allowed'
                            : 'hover:bg-white/[0.04]'
                      )}
                    >
                      <Checkbox
                        checked={selected}
                        disabled={disabled}
                        onChange={() => togglePainPoint(pp.id)}
                        className="h-4 w-4"
                      />
                      <span className={cn('text-[13px]', selected && 'text-primary font-medium')}>
                        {pp.label}
                      </span>
                    </label>
                  );
                })}
              </fieldset>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DetailedAnalysis({
  profile,
  onDimensionAnswer,
  onClear,
  open,
  onOpenChange,
}: {
  profile: AssessmentProfile;
  onDimensionAnswer: (questionId: string, value: number | null) => void;
  onClear: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const answeredCount = Object.keys(profile.dimensionAnswers).length;
  const detailedId = useId();

  const handleToggle = () => {
    const next = !open;
    onOpenChange(next);
    if (!next && answeredCount > 0) {
      onClear();
    }
  };

  return (
    <div className="rounded-xl border border-primary/25 bg-primary/[0.04] px-4 py-3 space-y-3">
      <button
        type="button"
        role="switch"
        aria-checked={open}
        aria-labelledby={`${detailedId}-label`}
        aria-describedby={`${detailedId}-desc`}
        onClick={handleToggle}
        className="w-full flex items-start justify-between text-left cursor-pointer"
      >
        <div className="space-y-0.5">
          <span id={`${detailedId}-label`} className="text-sm font-semibold text-primary">
            Detailed Analysis
          </span>
          <p id={`${detailedId}-desc`} className="text-xs text-muted-foreground">
            {open
              ? answeredCount > 0
                ? `${answeredCount}/10 rated`
                : 'Rate 10 areas for a breakdown'
              : 'Optional — get a dimension-by-dimension breakdown'}
          </p>
        </div>
        <div
          aria-hidden="true"
          className={cn(
            'relative w-11 h-6 rounded-full transition-colors shrink-0 mt-0.5',
            open ? 'bg-primary' : 'bg-white/15'
          )}
        >
          <div
            className={cn(
              'absolute top-1 w-4 h-4 rounded-full transition-transform',
              open ? 'translate-x-6 bg-background' : 'translate-x-1 bg-white'
            )}
          />
        </div>
      </button>

      {open && (
        <div className="space-y-4 pt-1">
          {DIMENSIONS.map((dim) => {
            const dimQuestions = DIMENSION_QUESTIONS.filter((q) => q.dimension === dim.id);
            return (
              <fieldset key={dim.id} className="space-y-2">
                <legend className="text-xs font-medium uppercase tracking-wider text-primary mb-2">
                  {dim.label}
                </legend>
                <div className="space-y-1.5">
                  {dimQuestions.map((q) => (
                    <StarRatingRow
                      key={q.id}
                      keyword={q.keyword}
                      maxStars={q.maxStars}
                      value={profile.dimensionAnswers[q.id] ?? null}
                      onChange={(v) => onDimensionAnswer(q.id, v)}
                    />
                  ))}
                </div>
              </fieldset>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StarRatingRow({
  keyword,
  maxStars,
  value,
  onChange,
}: {
  keyword: string;
  maxStars: number;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  const handleClick = (star: number) => {
    // Clicking the selected star again clears the rating
    onChange(value === star ? null : star);
  };

  const displayValue = hovered ?? value ?? 0;

  return (
    <fieldset
      className="flex items-center justify-between gap-2 group"
      onMouseLeave={() => setHovered(null)}
    >
      <legend className="sr-only">{keyword}</legend>
      <span aria-hidden="true" className="text-xs font-medium truncate">
        {keyword}
      </span>
      <div className="flex gap-0.5 shrink-0">
        {Array.from({ length: maxStars }, (_, i) => {
          const star = i + 1;
          const filled = star <= displayValue;
          const isExact = star === displayValue && hovered !== null;

          return (
            <button
              key={star}
              type="button"
              aria-label={`${star} of ${maxStars}`}
              aria-pressed={value === star}
              onClick={() => handleClick(star)}
              onMouseEnter={() => setHovered(star)}
              className="p-0.5 transition-transform duration-150 hover:scale-110 active:scale-95"
            >
              <Star
                size={18}
                aria-hidden="true"
                className={cn(
                  'transition-all duration-200',
                  filled
                    ? 'fill-primary text-primary drop-shadow-[0_0_4px_rgba(132,204,22,0.4)]'
                    : 'fill-transparent text-white/40 group-hover:text-white/50',
                  isExact && 'scale-110'
                )}
                style={{
                  transitionDelay: filled ? `${i * 30}ms` : '0ms',
                }}
              />
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
