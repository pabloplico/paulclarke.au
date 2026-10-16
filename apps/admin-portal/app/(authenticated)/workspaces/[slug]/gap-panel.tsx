'use client';

import { Button } from '@repo/ui/button';
import { Card, CardContent } from '@repo/ui/card';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { toastAiRefusal } from '@/lib/ai/refusal-toast';
import type { GapFinding } from '@/lib/db/schema';
import { cn } from '@/lib/utils';

const DEFAULT_PANEL_HEIGHT = 255;
const MIN_PANEL_HEIGHT = 150;
const MAX_PANEL_HEIGHT = 500;

function getStoredHeight(): number {
  if (typeof window === 'undefined') return DEFAULT_PANEL_HEIGHT;
  const stored = localStorage.getItem('gap-panel-height');
  if (stored) {
    const n = Number(stored);
    if (n >= MIN_PANEL_HEIGHT && n <= MAX_PANEL_HEIGHT) return n;
  }
  return DEFAULT_PANEL_HEIGHT;
}

interface GapPanelProps {
  workspaceId: number;
  initialFindings: GapFinding[] | null;
  lastAnalysedAt?: string | null;
  hasChanges?: boolean;
  onFixWithAi: (sectionId: number, suggestion: string) => void;
  onFixWithPrompt: (sectionId: number, suggestion: string, customPrompt: string) => void;
  fixingSection?: number | null;
  onFindingsChange?: (findings: GapFinding[] | null, analysedAt?: string) => void;
}

export interface GapPanelHandle {
  runAnalysis: () => Promise<void>;
}

// ── Progress Bar ─────────────────────────────────────────────────────────────

function ProgressBar({
  count,
  total,
  color,
  label,
}: {
  count: number;
  total: number;
  color: string;
  label: string;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;

  return (
    <div className="flex items-center gap-2 w-full">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 w-10 shrink-0">
        {label}
      </span>
      <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
        {count > 0 && (
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, backgroundColor: color }}
          />
        )}
      </div>
      <span
        className="text-[11px] font-semibold w-5 text-right shrink-0"
        style={{ color: count > 0 ? color : undefined }}
      >
        {count}
      </span>
    </div>
  );
}

// ── Severity Column ──────────────────────────────────────────────────────────

const SEVERITY_CONFIG = {
  high: { label: 'High', color: 'rgb(248, 113, 113)', badgeClass: 'bg-red-500/10 text-red-400' },
  medium: {
    label: 'Medium',
    color: 'rgb(250, 204, 21)',
    badgeClass: 'bg-yellow-500/10 text-yellow-400',
  },
  low: { label: 'Low', color: 'rgb(96, 165, 250)', badgeClass: 'bg-blue-500/10 text-blue-400' },
} as const;

function SeverityColumn({
  severity,
  findings,
  total,
  onFixWithAi,
  onFixWithPrompt,
  fixingSection,
  allFindings,
}: {
  severity: 'high' | 'medium' | 'low';
  findings: GapFinding[];
  total: number;
  onFixWithAi: (sectionId: number, suggestion: string) => void;
  onFixWithPrompt: (sectionId: number, suggestion: string, customPrompt: string) => void;
  fixingSection?: number | null;
  allFindings: GapFinding[];
}) {
  const config = SEVERITY_CONFIG[severity];
  const [promptFor, setPromptFor] = useState<number | null>(null);
  const [promptText, setPromptText] = useState('');
  const promptInputRef = useRef<HTMLInputElement>(null);

  const handlePromptSubmit = useCallback(
    (sectionId: number, suggestion: string) => {
      if (!promptText.trim()) return;
      onFixWithPrompt(sectionId, suggestion, promptText.trim());
      setPromptFor(null);
      setPromptText('');
    },
    [promptText, onFixWithPrompt]
  );

  const scrollToSection = useCallback((sectionId: number) => {
    const el = document.getElementById(`section-${sectionId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      {/* Progress bar header */}
      <div className="pb-2 px-1">
        <ProgressBar
          count={findings.length}
          total={total}
          color={config.color}
          label={config.label}
        />
      </div>
      {/* Findings list */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin space-y-1 px-1">
        {findings.length === 0 && (
          <p className="text-[10px] text-muted-foreground/40 text-center py-2">None</p>
        )}
        {findings.map((finding) => {
          const globalIndex = allFindings.indexOf(finding);
          const isFixing = fixingSection === finding.sectionId;
          const showPrompt = promptFor === globalIndex;

          return (
            <div
              key={`${finding.sectionId}-${globalIndex}`}
              className="rounded border border-border/50"
            >
              <div className="flex items-center gap-1.5 px-1.5 py-1">
                <button
                  type="button"
                  onClick={() => finding.sectionId > 0 && scrollToSection(finding.sectionId)}
                  className={cn(
                    'text-[10px] font-medium truncate flex-1 min-w-0 text-left',
                    finding.sectionId > 0 && 'cursor-pointer hover:text-primary/80'
                  )}
                  title={`${finding.sectionTitle}: ${finding.issue}\nClick to scroll to section`}
                >
                  {finding.sectionTitle}
                  <span className="text-muted-foreground/60 font-normal"> — {finding.issue}</span>
                </button>
                {finding.sectionId > 0 && (
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onFixWithAi(finding.sectionId, finding.suggestion)}
                      disabled={fixingSection != null}
                      className="h-5 px-1.5 text-[9px]"
                      title="Auto-fix with AI"
                    >
                      {isFixing ? (
                        <Loader2 size={9} className="animate-spin" />
                      ) : (
                        <>
                          <Sparkles size={9} className="mr-0.5" />
                          Fix
                        </>
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setPromptFor(showPrompt ? null : globalIndex);
                        setPromptText('');
                        setTimeout(() => promptInputRef.current?.focus(), 0);
                      }}
                      disabled={fixingSection != null}
                      className="h-5 px-1.5 text-[9px]"
                      title="Fix with custom prompt"
                    >
                      <Wand2 size={9} />
                    </Button>
                  </div>
                )}
              </div>
              {showPrompt && (
                <div className="flex items-center gap-1 px-1.5 pb-1">
                  <input
                    ref={promptInputRef}
                    value={promptText}
                    onChange={(e) => setPromptText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter')
                        handlePromptSubmit(finding.sectionId, finding.suggestion);
                      if (e.key === 'Escape') {
                        setPromptFor(null);
                        setPromptText('');
                      }
                    }}
                    placeholder="How should this be fixed?"
                    className="flex-1 bg-transparent border border-border rounded px-1.5 py-0.5 text-[10px] text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-foreground/30 min-w-0"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handlePromptSubmit(finding.sectionId, finding.suggestion)}
                    disabled={!promptText.trim()}
                    className="h-5 px-1.5 text-[9px]"
                  >
                    Go
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Panel ───────────────────────────────────────────────────────────────

export const GapPanel = forwardRef<GapPanelHandle, GapPanelProps>(function GapPanel(
  {
    workspaceId,
    initialFindings,
    lastAnalysedAt,
    hasChanges,
    onFixWithAi,
    onFixWithPrompt,
    fixingSection,
    onFindingsChange,
  },
  ref
) {
  const [findings, setFindings] = useState<GapFinding[] | null>(initialFindings);
  const [running, setRunning] = useState(false);
  const [_sentFindings, setSentFindings] = useState<Set<number>>(new Set());
  const [_sendingFinding, setSendingFinding] = useState<number | null>(null);
  const [autoFixing, setAutoFixing] = useState(false);
  const [autoFixResult, setAutoFixResult] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [panelHeight, setPanelHeight] = useState(getStoredHeight);
  const [dragging, setDragging] = useState(false);

  const runAnalysis = useCallback(async () => {
    setRunning(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/gap-analysis`, {
        method: 'POST',
      });
      await toastAiRefusal(res);
      if (res.ok) {
        const { report } = await res.json();
        setFindings(report.findings);
        const analysedAt = report.createdAt ?? new Date().toISOString();
        onFindingsChange?.(report.findings, analysedAt);
      }
    } finally {
      setRunning(false);
    }
  }, [workspaceId, onFindingsChange]);

  useImperativeHandle(ref, () => ({ runAnalysis }), [runAnalysis]);

  const _handleSendToInbox = useCallback(
    async (findingIndex: number) => {
      setSendingFinding(findingIndex);
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/gap-analysis/create-inbox-item`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ findingIndex }),
        });
        if (res.ok) {
          setSentFindings((prev) => new Set(prev).add(findingIndex));
        }
      } finally {
        setSendingFinding(null);
      }
    },
    [workspaceId]
  );

  const handleAddHighToTodos = useCallback(async () => {
    if (!findings) return;
    const highFindings = findings.filter((f) => f.severity === 'high');
    if (highFindings.length === 0) return;

    setAutoFixing(true);
    setAutoFixResult(null);
    try {
      let created = 0;
      for (const finding of highFindings) {
        const res = await fetch('/api/todos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: `[Gap] ${finding.sectionTitle}: ${finding.issue}`.slice(0, 500),
            description: finding.suggestion,
            priority: 'high',
          }),
        });
        if (res.ok) created++;
      }
      setAutoFixResult(`${created} todo${created === 1 ? '' : 's'} created`);
    } finally {
      setAutoFixing(false);
    }
  }, [findings]);

  // Drag to resize
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setDragging(true);
      const startY = e.clientY;
      const startHeight = panelHeight;

      function onMouseMove(ev: MouseEvent) {
        const newHeight = Math.min(
          MAX_PANEL_HEIGHT,
          Math.max(MIN_PANEL_HEIGHT, startHeight + ev.clientY - startY)
        );
        setPanelHeight(newHeight);
      }

      function onMouseUp() {
        setDragging(false);
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        setPanelHeight((h) => {
          localStorage.setItem('gap-panel-height', String(h));
          return h;
        });
      }

      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [panelHeight]
  );

  const { high, medium, low } = useMemo(() => {
    if (!findings) return { high: [], medium: [], low: [] };
    return {
      high: findings.filter((f) => f.severity === 'high'),
      medium: findings.filter((f) => f.severity === 'medium'),
      low: findings.filter((f) => f.severity === 'low'),
    };
  }, [findings]);

  const formattedTime = useMemo(() => {
    if (!lastAnalysedAt) return null;
    const d = new Date(lastAnalysedAt);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  }, [lastAnalysedAt]);

  // Not yet analysed — show prompt
  if (findings === null) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-center justify-between py-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Sparkles size={14} />
            <span>Run AI gap analysis to check content completeness</span>
          </div>
          <Button size="sm" onClick={runAnalysis} disabled={running} className="h-7 text-xs">
            {running ? (
              <>
                <Loader2 size={12} className="mr-1.5 animate-spin" />
                Analysing...
              </>
            ) : (
              <>
                <Sparkles size={12} className="mr-1.5" />
                Run Analysis
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Healthy — thin bar
  if (findings.length === 0) {
    return (
      <Card className="border-green-500/20">
        <CardContent className="flex items-center justify-between py-2.5">
          <div className="flex items-center gap-2 text-xs text-green-400">
            <CheckCircle2 size={14} />
            <span>All sections healthy</span>
            {formattedTime && (
              <span className="text-muted-foreground/40 text-[10px]">· {formattedTime}</span>
            )}
            {hasChanges && (
              <span className="text-yellow-400/70 text-[10px] flex items-center gap-1">
                <AlertTriangle size={10} />
                Changes since last analysis
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={runAnalysis}
            disabled={running}
            aria-label="Run analysis again"
            className="h-6 w-6 p-0 text-muted-foreground"
          >
            {running ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Has findings — three-column layout
  const total = findings.length;

  return (
    <Card className="relative">
      <CardContent
        className="py-2.5 px-4 flex flex-col"
        style={expanded ? { height: panelHeight } : undefined}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-2 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-muted-foreground hover:text-foreground transition-colors p-0.5 shrink-0"
              aria-label={expanded ? 'Collapse gap panel' : 'Expand gap panel'}
            >
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            <span className="text-xs font-medium">
              {total} {total === 1 ? 'gap' : 'gaps'}
            </span>
            {formattedTime && (
              <span className="text-[10px] text-muted-foreground/40">· {formattedTime}</span>
            )}
            {hasChanges && (
              <span className="text-[10px] text-yellow-400/70 flex items-center gap-1">
                <AlertTriangle size={9} />
                Changes since last analysis
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {high.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleAddHighToTodos}
                disabled={autoFixing}
                className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                title="Add all high-severity findings to todo list"
              >
                {autoFixing ? (
                  <Loader2 size={10} className="mr-1 animate-spin" />
                ) : (
                  <AlertTriangle size={10} className="mr-1" />
                )}
                Add high to todos
              </Button>
            )}
            {autoFixResult && <span className="text-[10px] text-green-400">{autoFixResult}</span>}
            <Button
              variant="ghost"
              size="sm"
              onClick={runAnalysis}
              disabled={running}
              className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
            >
              {running ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <>
                  <RefreshCw size={10} className="mr-1" />
                  Re-analyse
                </>
              )}
            </Button>
          </div>
        </div>

        {expanded ? (
          /* Three columns — expanded */
          <div className="flex flex-col md:flex-row gap-3 flex-1 min-h-0">
            <SeverityColumn
              severity="high"
              findings={high}
              total={total}
              onFixWithAi={onFixWithAi}
              onFixWithPrompt={onFixWithPrompt}
              fixingSection={fixingSection}
              allFindings={findings}
            />
            <div className="w-px bg-border/30 shrink-0" />
            <SeverityColumn
              severity="medium"
              findings={medium}
              total={total}
              onFixWithAi={onFixWithAi}
              onFixWithPrompt={onFixWithPrompt}
              fixingSection={fixingSection}
              allFindings={findings}
            />
            <div className="w-px bg-border/30 shrink-0" />
            <SeverityColumn
              severity="low"
              findings={low}
              total={total}
              onFixWithAi={onFixWithAi}
              onFixWithPrompt={onFixWithPrompt}
              fixingSection={fixingSection}
              allFindings={findings}
            />
          </div>
        ) : (
          /* Collapsed — three columns with just progress bars */
          <div className="flex gap-3 py-1">
            {(['high', 'medium', 'low'] as const).map((sev, i) => {
              const config = SEVERITY_CONFIG[sev];
              const count =
                sev === 'high' ? high.length : sev === 'medium' ? medium.length : low.length;
              return (
                <div key={sev} className="flex-1 min-w-0 px-1 flex items-center">
                  {i > 0 && <div className="w-px bg-border/30 shrink-0 self-stretch -ml-1 mr-2" />}
                  <div className="flex-1 min-w-0">
                    <ProgressBar
                      count={count}
                      total={total}
                      color={config.color}
                      label={config.label}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* Drag handle — only when expanded */}
      {expanded && (
        <div
          onMouseDown={handleDragStart}
          className="absolute bottom-0 left-0 right-0 h-1.5 cursor-row-resize group"
        >
          <div
            className={cn(
              'w-full h-full rounded-b-lg transition-colors',
              dragging ? 'bg-primary/40' : 'bg-transparent group-hover:bg-border'
            )}
          />
        </div>
      )}
    </Card>
  );
});
