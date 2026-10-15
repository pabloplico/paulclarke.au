import { Button } from '@repo/ui/button';
import { ChevronDown, Download, ExternalLink, Lock, RotateCcw } from 'lucide-react';
import { createContext, useContext, useEffect, useId, useMemo, useState } from 'react';
import type { AssessmentProfile, AssessmentResults as Results } from '@/hooks/useAssessment';
import {
  type AI6Practice,
  type DimensionScore,
  getReadinessLevelMeta,
  INDUSTRY_BENCHMARKS,
  type ReadinessLevel,
  type ScoredRecommendation,
} from '@/lib/assessment-content';
import { cn } from '@/lib/utils';

const PrintModeContext = createContext(false);
const usePrintMode = () => useContext(PrintModeContext);

interface AssessmentResultsProps {
  profile: AssessmentProfile;
  results: Results | null;
  onRestart: () => void;
}

const QLD_AVERAGE = 31;

function computeHeadlineSaving(results: Results): string {
  const allRecs = [...results.quickWins, ...results.nextSteps, ...results.strategicActions];
  const hourRegex = /(\d+)[–-](\d+)\s*hrs?/;

  let totalHours = 0;
  let hourCount = 0;
  let bestNonHourSaving = '';

  for (const rec of allRecs) {
    if (!rec.estimatedSaving) continue;
    const match = rec.estimatedSaving.match(hourRegex);
    if (match?.[1] && match[2]) {
      const midpoint = (Number.parseInt(match[1], 10) + Number.parseInt(match[2], 10)) / 2;
      totalHours += midpoint;
      hourCount++;
      if (hourCount >= 3) break;
    } else if (!bestNonHourSaving) {
      bestNonHourSaving = rec.estimatedSaving;
    }
  }

  if (hourCount > 0) return `~${Math.round(totalHours)} hrs/week`;
  if (bestNonHourSaving) return bestNonHourSaving;
  return '~5.6 hrs/week';
}

export function AssessmentResults({ profile, results, onRestart }: AssessmentResultsProps) {
  const [printMode, setPrintMode] = useState(false);
  const hasIndustry = !!profile.industry;
  const hasDimensionAnswers = Object.keys(profile.dimensionAnswers).length > 0;

  useEffect(() => {
    const reset = () => setPrintMode(false);
    window.addEventListener('afterprint', reset);
    return () => window.removeEventListener('afterprint', reset);
  }, []);

  const handleDownload = () => {
    setPrintMode(true);
    // Two RAFs so React commits the expanded state and the browser
    // paints it before the print dialog snapshots the document.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.print();
      });
    });
  };

  const levelMeta = results ? getReadinessLevelMeta(results.overallLevel) : null;
  const headlineSaving = useMemo(
    () => (results ? computeHeadlineSaving(results) : null),
    [results]
  );
  const benchmark = useMemo(() => {
    if (!profile.industry) return undefined;
    return INDUSTRY_BENCHMARKS.find((b) => b.industry === profile.industry);
  }, [profile.industry]);

  const ai6Practices = useMemo(() => {
    if (!results || !hasDimensionAnswers) return [];
    const sorted = [...results.dimensionScores].sort((a, b) => a.score - b.score);
    const weakest = sorted.slice(0, 2);
    const seen = new Set<number>();
    const practices: AI6Practice[] = [];
    for (const dim of weakest) {
      for (const p of dim.ai6Practices) {
        if (!seen.has(p.id)) {
          seen.add(p.id);
          practices.push(p);
        }
        if (practices.length >= 3) break;
      }
      if (practices.length >= 3) break;
    }
    return practices;
  }, [results, hasDimensionAnswers]);

  return (
    <PrintModeContext.Provider value={printMode}>
      <div className="space-y-6 print:space-y-4" data-print-root>
        <ResultsAnnouncer results={results} />
        <PrintHeader profile={profile} results={results} />
        <div className="rounded-xl border border-white/8 bg-white/[0.02] p-5 print:break-inside-avoid">
          <div className="grid grid-cols-1 md:grid-cols-[auto_auto_1fr] gap-5">
            {results && levelMeta ? (
              <ReadinessScoreRing
                score={results.overallScore}
                level={results.overallLevel}
                size={120}
              />
            ) : (
              <div
                aria-hidden="true"
                className="relative inline-flex items-center justify-center shrink-0"
              >
                <svg aria-hidden="true" width={120} height={120} className="-rotate-90">
                  <circle
                    cx={60}
                    cy={60}
                    r={52}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={8}
                    className="text-white/[0.06]"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold leading-none tabular-nums text-white/10">
                    —
                  </span>
                  <span className="text-xs text-muted-foreground/30 mt-1">/ 100</span>
                </div>
              </div>
            )}

            {results && levelMeta ? (
              <div className="flex flex-col gap-2 justify-center">
                <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-white/[0.05] border border-white/10 text-center">
                  {levelMeta.label}
                </span>
                <span className="text-xs px-3 py-1.5 rounded-full bg-white/[0.05] border border-white/10 text-white/70 text-center">
                  {(() => {
                    const delta = results.overallScore - QLD_AVERAGE;
                    const ahead = delta >= 0;
                    return (
                      <>
                        <span
                          className={cn(
                            'font-medium tabular-nums',
                            ahead ? 'text-cyan-400' : 'text-amber-400'
                          )}
                        >
                          {Math.abs(delta)}pts {ahead ? 'above' : 'below'}
                        </span>{' '}
                        QLD avg
                      </>
                    );
                  })()}
                </span>
                <span className="text-xs px-3 py-1.5 rounded-full bg-white/[0.05] border border-white/10 text-white/70 text-center">
                  <span className="font-semibold text-emerald-400">{headlineSaving}</span> savings
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-2 justify-center">
                <span className="text-xs px-3 py-1.5 rounded-full bg-white/[0.03] border border-white/6 text-muted-foreground text-center">
                  {hasIndustry ? 'Select AI maturity' : 'Select industry to begin'}
                </span>
                <span className="text-xs px-3 py-1.5 rounded-full bg-white/[0.03] border border-white/6 text-muted-foreground text-center">
                  — pts vs QLD avg
                </span>
                <span className="text-xs px-3 py-1.5 rounded-full bg-white/[0.03] border border-white/6 text-muted-foreground text-center">
                  — hrs/week savings
                </span>
              </div>
            )}

            {benchmark ? (
              <div className="flex flex-col justify-center space-y-1.5 border-l border-white/8 pl-5">
                <div className="font-label text-xs uppercase tracking-widest text-primary">
                  Industry Insights
                </div>
                <p className="text-xs font-semibold text-emerald-400">{benchmark.stat}</p>
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                  {benchmark.body}
                </p>
              </div>
            ) : (
              <div className="flex items-center justify-center border-l border-white/6 pl-5">
                <p className="text-xs text-muted-foreground">
                  {hasIndustry ? '' : 'Select industry for insights'}
                </p>
              </div>
            )}
          </div>
        </div>

        {results ? (
          <NinetyDayPlan
            quickWins={results.quickWins}
            nextSteps={results.nextSteps}
            strategicActions={results.strategicActions}
          />
        ) : (
          <NinetyDayPlanSkeleton />
        )}

        <InsightColumns
          hasDimensionAnswers={hasDimensionAnswers}
          dimensionScores={results?.dimensionScores ?? []}
          ai6Practices={ai6Practices}
        />

        {results && <DownloadCTA onDownload={handleDownload} onRestart={onRestart} />}

        {results && (
          <div className="pt-6 border-t border-white/6">
            <div className="text-xs font-semibold tracking-wide uppercase text-muted-foreground mb-2.5">
              Informed by
            </div>
            <div className="flex flex-wrap gap-2">
              {results.frameworkReferences.map((ref) => (
                <a
                  key={ref.id}
                  href={ref.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground px-2.5 py-1 bg-white/5 border border-white/8 rounded-md hover:text-foreground hover:bg-white/8 transition-colors"
                >
                  {ref.shortName}{' '}
                  <ExternalLink aria-hidden="true" className="inline h-3 w-3 ml-0.5" />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </PrintModeContext.Provider>
  );
}

/**
 * Screen readers don't notice the results panel changing as answers come in, so announce the
 * score politely. The short delay means a run of quick clicks is announced once, at the end.
 */
function ResultsAnnouncer({ results }: { results: Results | null }) {
  const [message, setMessage] = useState('');
  const next = results
    ? `Readiness score ${results.overallScore} out of 100: ${getReadinessLevelMeta(results.overallLevel).label}.`
    : '';

  useEffect(() => {
    const timer = setTimeout(() => setMessage(next), 500);
    return () => clearTimeout(timer);
  }, [next]);

  return (
    // <output> is a status region; aria-live is explicit for screen readers that don't infer it
    <output aria-live="polite" className="sr-only">
      {message}
    </output>
  );
}

function PrintHeader({
  profile,
  results,
}: {
  profile: AssessmentProfile;
  results: Results | null;
}) {
  if (!results) return null;
  const date = new Date().toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const industry = profile.industry ?? 'General';
  return (
    <div className="hidden print:block print:mb-6 print:pb-4 print:border-b print:border-black/15">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-black/60">Paul Clarke</div>
          <h1 className="text-2xl font-bold text-black mt-1">90-Day AI Action Plan</h1>
          <div className="text-xs text-black/60 mt-1">
            {industry} · Generated {date}
          </div>
        </div>
        <div className="text-right text-xs text-black/60">paulclarke.au</div>
      </div>
    </div>
  );
}

function InsightColumns({
  hasDimensionAnswers,
  dimensionScores,
  ai6Practices,
}: {
  hasDimensionAnswers: boolean;
  dimensionScores: DimensionScore[];
  ai6Practices: AI6Practice[];
}) {
  const [breakdownOpenState, setBreakdownOpen] = useState(false);
  const [practicesOpenState, setPracticesOpen] = useState(false);
  const printMode = usePrintMode();
  const breakdownOpen = breakdownOpenState || printMode;
  const practicesOpen = practicesOpenState || printMode;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={!hasDimensionAnswers}
          aria-expanded={hasDimensionAnswers ? breakdownOpen : undefined}
          onClick={() => hasDimensionAnswers && setBreakdownOpen(!breakdownOpen)}
          className={cn(
            'text-xs px-3 py-2.5 rounded-lg border transition-all text-center',
            hasDimensionAnswers
              ? breakdownOpen
                ? 'bg-white/[0.08] border-emerald-400/40 text-foreground'
                : 'bg-white/[0.05] border-emerald-400/30 text-foreground hover:bg-white/[0.08] cursor-pointer'
              : 'bg-white/[0.02] border-amber-400/20 text-muted-foreground cursor-default'
          )}
        >
          <span className="flex items-center justify-center gap-1.5">
            {!hasDimensionAnswers && <Lock aria-hidden="true" className="h-3 w-3" />}
            Breakdown
            {hasDimensionAnswers && (
              <ChevronDown
                className={cn('h-3 w-3 transition-transform', breakdownOpen && 'rotate-180')}
              />
            )}
          </span>
          {!hasDimensionAnswers && (
            <span className="block text-xs mt-0.5">Needs detailed analysis</span>
          )}
        </button>
        <button
          type="button"
          disabled={ai6Practices.length === 0}
          aria-expanded={ai6Practices.length > 0 ? practicesOpen : undefined}
          onClick={() => ai6Practices.length > 0 && setPracticesOpen(!practicesOpen)}
          className={cn(
            'text-xs px-3 py-2.5 rounded-lg border transition-all text-center',
            ai6Practices.length > 0
              ? practicesOpen
                ? 'bg-white/[0.08] border-emerald-400/40 text-foreground'
                : 'bg-white/[0.05] border-emerald-400/30 text-foreground hover:bg-white/[0.08] cursor-pointer'
              : 'bg-white/[0.02] border-amber-400/20 text-muted-foreground cursor-default'
          )}
        >
          <span className="flex items-center justify-center gap-1.5">
            {ai6Practices.length === 0 && <Lock aria-hidden="true" className="h-3 w-3" />}
            Practices
            {ai6Practices.length > 0 && (
              <ChevronDown
                className={cn('h-3 w-3 transition-transform', practicesOpen && 'rotate-180')}
              />
            )}
          </span>
          {ai6Practices.length === 0 && (
            <span className="block text-xs mt-0.5">Needs detailed analysis</span>
          )}
        </button>
      </div>

      {breakdownOpen && hasDimensionAnswers && (
        <div className="space-y-3">
          {dimensionScores.map((ds) => (
            <DimensionBar key={ds.dimension} dimensionScore={ds} />
          ))}
        </div>
      )}
      {practicesOpen && ai6Practices.length > 0 && <AI6PracticesList practices={ai6Practices} />}
    </div>
  );
}

function NinetyDayPlanSkeleton() {
  const phases = [
    { label: 'This Week', dot: 'border-cyan-400/20 bg-cyan-400/5' },
    {
      label: 'This Month',
      dot: 'border-emerald-400/20 bg-emerald-400/5',
    },
    {
      label: 'This Quarter',
      dot: 'border-violet-400/20 bg-violet-400/5',
    },
  ];

  return (
    <div>
      <h2 className="text-lg font-bold tracking-tight mb-4 text-muted-foreground">
        Your 90-Day AI Action Plan
      </h2>
      {phases.map((phase, i) => (
        <div key={phase.label} className="relative pl-7 mb-7 last:mb-0">
          {i < phases.length - 1 && (
            <div className="absolute left-[7px] top-6 bottom-[-28px] w-px bg-white/6" />
          )}
          <div
            className={cn('absolute left-[2px] top-[6px] w-3 h-3 rounded-full border-2', phase.dot)}
          />
          <div className="text-xs font-semibold tracking-wide uppercase mb-3 text-muted-foreground">
            {phase.label}
          </div>
          <div className="space-y-2">
            <div className="h-10 rounded-xl bg-white/[0.02] border border-white/4" />
            <div className="h-10 rounded-xl bg-white/[0.02] border border-white/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

function AI6PracticesList({ practices }: { practices: AI6Practice[] }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground mb-2">
        Focus areas based on your weakest dimensions.
      </p>
      {practices.map((p) => (
        <div key={p.id} className="flex gap-3 py-2">
          <div className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold bg-cyan-400/8 text-cyan-400 shrink-0">
            {p.id}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">{p.name}</div>
            <div className="text-xs text-muted-foreground leading-snug">{p.description}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

const LEVEL_STROKE_COLORS: Record<ReadinessLevel, string> = {
  emerging: '#f87171',
  developing: '#fbbf24',
  implementing: '#22d3ee',
  leading: '#34d399',
};

const LEVEL_BG_COLORS: Record<ReadinessLevel, string> = {
  emerging: 'bg-red-400',
  developing: 'bg-amber-400',
  implementing: 'bg-cyan-400',
  leading: 'bg-emerald-400',
};

const LEVEL_TEXT_COLORS: Record<ReadinessLevel, string> = {
  emerging: 'text-red-400',
  developing: 'text-amber-400',
  implementing: 'text-cyan-400',
  leading: 'text-emerald-400',
};

function ReadinessScoreRing({
  score,
  level,
  size = 96,
}: {
  score: number;
  level: ReadinessLevel;
  size?: number;
}) {
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = LEVEL_STROKE_COLORS[level];

  return (
    <div className="relative inline-flex items-center justify-center shrink-0">
      <svg aria-hidden="true" width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-white/[0.06]"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth + 4}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          opacity={0.15}
          style={{ filter: 'blur(4px)' }}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold leading-none tabular-nums">{score}</span>
        <span className="text-xs text-muted-foreground mt-1">/ 100</span>
      </div>
    </div>
  );
}

interface PhaseConfig {
  label: string;
  items: ScoredRecommendation[];
  dotColor: string;
  labelColor: string;
  cardBorder: string;
  savingBg: string;
  savingText: string;
}

function PlanCard({ card, phase }: { card: ScoredRecommendation; phase: PhaseConfig }) {
  const [openState, setOpen] = useState(false);
  const printMode = usePrintMode();
  const open = openState || printMode;
  const detailsId = useId();

  // Only the title row is the button: buttons may only hold phrasing content, and the details
  // would otherwise be read out as part of the button's name.
  return (
    <div
      className={cn(
        'bg-white/3 border border-white/6 border-l-2 rounded-xl mb-2 last:mb-0 hover:bg-white/6 transition-colors print:break-inside-avoid',
        phase.cardBorder
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? detailsId : undefined}
        onClick={() => setOpen(!openState)}
        className={cn(
          'w-full text-left flex items-center gap-3 px-4 cursor-pointer rounded-xl',
          open ? 'pt-4' : 'py-3'
        )}
      >
        <span data-card-title className="text-sm font-semibold leading-snug flex-1">
          {card.title}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-transform',
            open && 'rotate-180'
          )}
        />
      </button>
      {open && (
        <div id={detailsId} className="px-4 pb-4 mt-2">
          <p className="text-sm text-muted-foreground leading-snug">{card.body}</p>
          <div className="flex flex-wrap items-center gap-2 mt-2.5">
            {card.estimatedSaving && (
              <span
                className={cn(
                  'inline-block px-2.5 py-0.5 rounded-md text-xs font-semibold',
                  phase.savingBg,
                  phase.savingText
                )}
              >
                {card.estimatedSaving}
              </span>
            )}
            {card.timeToValue && (
              <span className="text-xs text-muted-foreground px-2 py-0.5 bg-white/4 rounded">
                {card.timeToValue}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NinetyDayPlan({
  quickWins,
  nextSteps,
  strategicActions,
}: {
  quickWins: ScoredRecommendation[];
  nextSteps: ScoredRecommendation[];
  strategicActions: ScoredRecommendation[];
}) {
  const phases: PhaseConfig[] = [
    {
      label: 'This Week',
      items: quickWins.slice(0, 2),
      dotColor: 'border-cyan-400 bg-cyan-400/8',
      labelColor: 'text-cyan-400',
      cardBorder: 'border-l-cyan-400/40',
      savingBg: 'bg-cyan-400/8',
      savingText: 'text-cyan-400',
    },
    {
      label: 'This Month',
      items: nextSteps.slice(0, 3),
      dotColor: 'border-emerald-400 bg-emerald-400/8',
      labelColor: 'text-emerald-400',
      cardBorder: 'border-l-emerald-400/40',
      savingBg: 'bg-emerald-400/8',
      savingText: 'text-emerald-400',
    },
    {
      label: 'This Quarter',
      items: strategicActions.slice(0, 3),
      dotColor: 'border-violet-400 bg-violet-400/8',
      labelColor: 'text-violet-400',
      cardBorder: 'border-l-violet-400/40',
      savingBg: 'bg-violet-400/8',
      savingText: 'text-violet-400',
    },
  ];

  const nonEmptyPhases = phases.filter((p) => p.items.length > 0);
  if (nonEmptyPhases.length === 0) return null;

  return (
    <div>
      <h2 className="text-lg font-bold tracking-tight mb-4">Your 90-Day AI Action Plan</h2>

      {nonEmptyPhases.map((phase, phaseIdx) => (
        <div key={phase.label} className="relative pl-7 mb-7 last:mb-0">
          {phaseIdx < nonEmptyPhases.length - 1 && (
            <div className="absolute left-[7px] top-6 bottom-[-28px] w-px bg-white/20" />
          )}
          <div
            className={cn(
              'absolute left-[2px] top-[6px] w-3 h-3 rounded-full border-2',
              phase.dotColor
            )}
          />
          <div
            className={cn('text-xs font-semibold tracking-wide uppercase mb-3', phase.labelColor)}
          >
            {phase.label}
          </div>
          {phase.items.map((card) => (
            <PlanCard key={card.id} card={card} phase={phase} />
          ))}
        </div>
      ))}
    </div>
  );
}

function DimensionBar({ dimensionScore }: { dimensionScore: DimensionScore }) {
  const [expandedState, setExpanded] = useState(false);
  const printMode = usePrintMode();
  const expanded = expandedState || printMode;
  const barColor = LEVEL_BG_COLORS[dimensionScore.level];
  const textColor = LEVEL_TEXT_COLORS[dimensionScore.level];

  return (
    <div>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expandedState)}
        className="w-full text-left rounded-lg hover:bg-white/[0.02] transition-colors py-1.5 px-1 -mx-1 group print:break-inside-avoid"
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium shrink-0 truncate" style={{ width: '140px' }}>
            {dimensionScore.label}
          </span>
          <div className="relative flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all duration-500', barColor)}
              style={{ width: `${dimensionScore.score}%` }}
            />
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className={cn('text-xs tabular-nums font-semibold', textColor)}>
              {dimensionScore.score}
            </span>
            <ChevronDown
              className={cn(
                'h-3 w-3 text-muted-foreground/40 transition-transform',
                expanded && 'rotate-180'
              )}
            />
          </div>
        </div>
      </button>

      {expanded && (
        <div className="pl-1 pr-1 pb-2 space-y-1">
          <p className="text-xs text-muted-foreground leading-relaxed">{dimensionScore.feedback}</p>
          {dimensionScore.ai6Practices.map((p) => (
            <a
              key={p.id}
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline inline-flex items-center gap-1"
            >
              AI6 #{p.id}: {p.name} <ExternalLink className="h-2.5 w-2.5" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function DownloadCTA({ onDownload, onRestart }: { onDownload: () => void; onRestart: () => void }) {
  return (
    <div className="rounded-xl bg-primary p-8 md:p-10 text-primary-foreground space-y-4 print:hidden">
      <h3 className="text-xl font-bold tracking-tight">Save your action plan</h3>
      <p className="text-sm opacity-80">
        Download a PDF of your results to share with your team or revisit later.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={onDownload}
          className="gap-2 bg-primary-foreground text-primary px-5 py-2.5 rounded-full text-sm font-semibold hover:opacity-90"
        >
          <Download size={16} /> Download as PDF
        </Button>
        <button
          type="button"
          onClick={onRestart}
          className="text-xs opacity-60 hover:opacity-100 transition-opacity flex items-center gap-1"
        >
          <RotateCcw size={12} /> Start over
        </button>
      </div>
      <p className="text-xs opacity-60 pt-1">
        Tip: choose &ldquo;Save as PDF&rdquo; in your browser&rsquo;s print dialog.
      </p>
    </div>
  );
}
