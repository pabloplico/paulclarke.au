'use client';

import { Badge } from '@repo/ui/badge';
import { Button } from '@repo/ui/button';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ExternalLink,
  FileText,
  Loader2,
  ScanSearch,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useRef, useState } from 'react';
import { VersionDiff } from '@/app/(authenticated)/workspaces/[slug]/sections/version-diff';
import { useFeatureEnabled } from '@/components/demo/demo-features';
import { toastAiRefusal } from '@/lib/ai/refusal-toast';
import type { ContentAuditFinding, GapFinding } from '@/lib/db/schema';
import { cn } from '@/lib/utils';
import {
  parseMarkdownToCards,
  parseMarkdownToChecklist,
  parseMarkdownToKvPairs,
  parseMarkdownToTable,
} from '@/lib/workspaces/parse-structured';
import type { WorkspaceHealth } from '@/lib/workspaces/types';

// ── Types ────────────────────────────────────────────────────────────────────

export type WorkspaceSummary = {
  id: number;
  slug: string;
  title: string;
  icon: string | null;
  sectionCount: number;
  health: WorkspaceHealth;
  findings: GapFinding[] | null;
  lastAnalysedAt: string | null;
};

export type ContentAuditReport = {
  id: number;
  findings: ContentAuditFinding[];
  postsSummary: { slug: string; title: string; date: string }[] | null;
  insightsSummary: { count: number; categories: string[] } | null;
  createdAt: string;
};

type Severity = 'high' | 'medium' | 'low';

type FindingWithWorkspace = GapFinding & {
  workspaceId: number;
  workspaceTitle: string;
  workspaceSlug: string;
};

type GapFixPreview = {
  workspaceId: number;
  sectionId: number;
  sectionTitle: string;
  template: string;
  oldContent: string;
  newContent: string;
  suggestion: string;
};

// ── Constants ────────────────────────────────────────────────────────────────

const SEVERITY_STYLES = {
  high: {
    label: 'High',
    className: 'bg-red-500/10 text-red-400',
    activeClassName: 'bg-red-500/20 text-red-300 ring-1 ring-red-500/30',
    dot: 'bg-red-400',
  },
  medium: {
    label: 'Medium',
    className: 'bg-yellow-500/10 text-yellow-400',
    activeClassName: 'bg-yellow-500/20 text-yellow-300 ring-1 ring-yellow-500/30',
    dot: 'bg-yellow-400',
  },
  low: {
    label: 'Low',
    className: 'bg-blue-500/10 text-blue-400',
    activeClassName: 'bg-blue-500/20 text-blue-300 ring-1 ring-blue-500/30',
    dot: 'bg-blue-400',
  },
} as const;

// ── Progress Bar ────────────────────────────────────────────────────────────

function ProgressBar({
  count,
  total,
  color,
  label,
  active,
  onClick,
}: {
  count: number;
  total: number;
  color: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 flex-1 min-w-0 px-2 py-1 rounded transition-all cursor-pointer',
        active ? 'bg-white/5' : 'opacity-40 hover:opacity-70'
      )}
    >
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
    </button>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function computeHealthClient(findings: GapFinding[]): WorkspaceHealth {
  if (findings.length === 0) return 'green';
  if (findings.some((f) => f.severity === 'high')) return 'red';
  if (findings.some((f) => f.severity === 'medium')) return 'yellow';
  return 'green';
}

// ── Component ────────────────────────────────────────────────────────────────

const AUDIT_TYPE_STYLES = {
  conflict: { label: 'Conflict', className: 'bg-red-500/10 text-red-400' },
  unsourced_claim: { label: 'Unsourced', className: 'bg-yellow-500/10 text-yellow-400' },
  stale_data: { label: 'Stale', className: 'bg-orange-500/10 text-orange-400' },
  missing_coverage: { label: 'Gap', className: 'bg-blue-500/10 text-blue-400' },
} as const;

interface GapAnalysisViewProps {
  workspaces: WorkspaceSummary[];
  contentAuditReport?: ContentAuditReport | null;
}

export function GapAnalysisView({ workspaces, contentAuditReport }: GapAnalysisViewProps) {
  // The public content audit fetches from another service; off in the demo
  const contentAuditEnabled = useFeatureEnabled('contentAudit');
  const [workspaceData, setWorkspaceData] = useState(workspaces);
  const [analysing, setAnalysing] = useState(false);
  const [auditReport, setAuditReport] = useState<ContentAuditReport | null>(
    contentAuditReport ?? null
  );
  const [auditing, setAuditing] = useState(false);
  const [selectedAuditIndex, setSelectedAuditIndex] = useState<number | null>(null);
  const [enabledSeverities, setEnabledSeverities] = useState<Set<Severity>>(
    new Set(['high', 'medium', 'low'])
  );
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [gapFixPreview, setGapFixPreview] = useState<GapFixPreview | null>(null);
  const [gapFixLoading, setGapFixLoading] = useState<number | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [addingTodos, setAddingTodos] = useState(false);
  const [todosResult, setTodosResult] = useState<string | null>(null);
  const _promptInputRef = useRef<HTMLInputElement>(null);

  // Aggregate findings
  const allFindings: FindingWithWorkspace[] = workspaceData.flatMap((ws) =>
    (ws.findings ?? []).map((f) => ({
      ...f,
      workspaceId: ws.id,
      workspaceTitle: ws.title,
      workspaceSlug: ws.slug,
    }))
  );

  const counts = {
    high: allFindings.filter((f) => f.severity === 'high').length,
    medium: allFindings.filter((f) => f.severity === 'medium').length,
    low: allFindings.filter((f) => f.severity === 'low').length,
  };

  const filteredFindings = allFindings.filter((f) => enabledSeverities.has(f.severity as Severity));

  const _selectedFinding = selectedIndex !== null ? filteredFindings[selectedIndex] : null;

  const toggleSeverity = useCallback((severity: Severity) => {
    setEnabledSeverities((prev) => {
      const next = new Set(prev);
      if (next.has(severity)) next.delete(severity);
      else next.add(severity);
      return next;
    });
    setSelectedIndex(null);
  }, []);

  // ── Run analysis on all workspaces ───────────────────────────────────────

  const handleAnalyseAll = useCallback(async () => {
    setAnalysing(true);
    try {
      const results = await Promise.allSettled(
        workspaceData.map(async (ws) => {
          const res = await fetch(`/api/workspaces/${ws.id}/gap-analysis`, {
            method: 'POST',
          });
          if (!res.ok) return null;
          const data = await res.json();
          return { workspaceId: ws.id, findings: data.report?.findings ?? [] };
        })
      );

      setWorkspaceData((prev) =>
        prev.map((ws) => {
          const result = results.find(
            (r) => r.status === 'fulfilled' && r.value?.workspaceId === ws.id
          );
          if (result?.status === 'fulfilled' && result.value) {
            const findings = result.value.findings as GapFinding[];
            return {
              ...ws,
              findings,
              health: computeHealthClient(findings),
              lastAnalysedAt: new Date().toISOString(),
            };
          }
          return ws;
        })
      );
      setSelectedIndex(null);
      setGapFixPreview(null);
    } finally {
      setAnalysing(false);
    }
  }, [workspaceData]);

  // ── Fix with AI ──────────────────────────────────────────────────────────

  const handleFixWithAi = useCallback(async (finding: FindingWithWorkspace) => {
    setGapFixLoading(finding.sectionId);
    try {
      // Fetch current section content
      const sectionRes = await fetch(
        `/api/workspaces/${finding.workspaceId}/sections/${finding.sectionId}`
      );
      if (!sectionRes.ok) return;
      const sectionData = await sectionRes.json();
      const fullContent = sectionData.latestVersion?.content ?? '';
      const template = sectionData.template ?? 'prose';

      // Generate AI fix
      const editRes = await fetch(
        `/api/workspaces/${finding.workspaceId}/sections/${finding.sectionId}/ai-edit`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            selectedText: fullContent || undefined,
            fullContent: fullContent || undefined,
            action: 'custom',
            customPrompt: `Improve this section based on the following gap analysis finding: ${finding.suggestion}`,
          }),
        }
      );
      if (!editRes.ok) return;
      const editData = await editRes.json();

      setGapFixPreview({
        workspaceId: finding.workspaceId,
        sectionId: finding.sectionId,
        sectionTitle: finding.sectionTitle,
        template,
        oldContent: fullContent,
        newContent: editData.modifiedContent,
        suggestion: finding.suggestion,
      });
    } finally {
      setGapFixLoading(null);
    }
  }, []);

  const handleAcceptFix = useCallback(async () => {
    if (!gapFixPreview) return;

    const markdown = gapFixPreview.newContent;
    let saveData: { content?: string; structuredData?: Record<string, unknown> };

    switch (gapFixPreview.template) {
      case 'cards':
        saveData = { content: markdown, structuredData: parseMarkdownToCards(markdown) };
        break;
      case 'table':
        saveData = { content: markdown, structuredData: parseMarkdownToTable(markdown) };
        break;
      case 'checklist':
        saveData = { content: markdown, structuredData: parseMarkdownToChecklist(markdown) };
        break;
      case 'kv-pairs':
        saveData = { content: markdown, structuredData: parseMarkdownToKvPairs(markdown) };
        break;
      default:
        saveData = { content: markdown };
    }

    await fetch(
      `/api/workspaces/${gapFixPreview.workspaceId}/sections/${gapFixPreview.sectionId}/content`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...saveData,
          changeDescription: `AI gap fix: ${gapFixPreview.suggestion.slice(0, 60)}`,
          changeSource: 'ai_gap_fill',
        }),
      }
    );

    // Re-run analysis on the affected workspace to refresh findings
    const wsId = gapFixPreview.workspaceId;
    setGapFixPreview(null);

    const res = await fetch(`/api/workspaces/${wsId}/gap-analysis`, { method: 'POST' });
    await toastAiRefusal(res);
    if (res.ok) {
      const data = await res.json();
      setWorkspaceData((prev) =>
        prev.map((ws) =>
          ws.id === wsId
            ? {
                ...ws,
                findings: data.report?.findings ?? [],
                health: computeHealthClient(data.report?.findings ?? []),
                lastAnalysedAt: new Date().toISOString(),
              }
            : ws
        )
      );
    }
    setSelectedIndex(null);
  }, [gapFixPreview]);

  const handleRejectFix = useCallback(() => {
    setGapFixPreview(null);
  }, []);

  const handleFixWithPrompt = useCallback(async (finding: FindingWithWorkspace, prompt: string) => {
    setGapFixLoading(finding.sectionId);
    try {
      const sectionRes = await fetch(
        `/api/workspaces/${finding.workspaceId}/sections/${finding.sectionId}`
      );
      if (!sectionRes.ok) return;
      const sectionData = await sectionRes.json();
      const fullContent = sectionData.latestVersion?.content ?? '';
      const template = sectionData.template ?? 'prose';

      const editRes = await fetch(
        `/api/workspaces/${finding.workspaceId}/sections/${finding.sectionId}/ai-edit`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            selectedText: fullContent || undefined,
            fullContent: fullContent || undefined,
            action: 'custom',
            customPrompt: `Improve this section based on the following gap analysis finding: ${finding.suggestion}\n\nAdditional instructions: ${prompt}`,
          }),
        }
      );
      if (!editRes.ok) return;
      const editData = await editRes.json();

      setGapFixPreview({
        workspaceId: finding.workspaceId,
        sectionId: finding.sectionId,
        sectionTitle: finding.sectionTitle,
        template,
        oldContent: fullContent,
        newContent: editData.modifiedContent,
        suggestion: finding.suggestion,
      });
    } finally {
      setGapFixLoading(null);
    }
  }, []);

  const handleAddHighToTodos = useCallback(async () => {
    const highFindings = allFindings.filter((f) => f.severity === 'high');
    if (highFindings.length === 0) return;
    setAddingTodos(true);
    setTodosResult(null);
    try {
      let created = 0;
      for (const finding of highFindings) {
        const res = await fetch('/api/todos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title:
              `[Gap] ${finding.workspaceTitle} — ${finding.sectionTitle}: ${finding.issue}`.slice(
                0,
                500
              ),
            description: finding.suggestion,
            priority: 'high',
          }),
        });
        if (res.ok) created++;
      }
      setTodosResult(`${created} todo${created === 1 ? '' : 's'} created`);
    } finally {
      setAddingTodos(false);
    }
  }, [allFindings]);

  // ── Run content audit ─────────────────────────────────────────────────────

  const handleRunContentAudit = useCallback(async () => {
    setAuditing(true);
    try {
      const res = await fetch('/api/content-audit', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setAuditReport(data.report);
        setSelectedAuditIndex(null);
      }
    } finally {
      setAuditing(false);
    }
  }, []);

  // ── Derived counts ───────────────────────────────────────────────────────

  const unanalysedCount = workspaceData.filter((ws) => ws.health === null).length;

  // ── Render ───────────────────────────────────────────────────────────────

  const auditFindings = auditReport?.findings ?? [];
  const selectedAuditFinding =
    selectedAuditIndex !== null ? auditFindings[selectedAuditIndex] : null;

  const auditHealth: 'green' | 'yellow' | 'red' | null = !auditReport
    ? null
    : auditFindings.length === 0
      ? 'green'
      : auditFindings.some((f) => f.severity === 'high')
        ? 'red'
        : auditFindings.some((f) => f.severity === 'medium')
          ? 'yellow'
          : 'green';

  return (
    <div className="flex flex-col h-[calc(100vh-7.5rem)] gap-6">
      {/* ── Workspace Gap Analysis ──────────────────────────────────────── */}
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between shrink-0 gap-2 md:gap-3">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {allFindings.length} {allFindings.length === 1 ? 'finding' : 'findings'}
            {unanalysedCount > 0 && (
              <span className="ml-1">
                · {unanalysedCount} workspace{unanalysedCount !== 1 ? 's' : ''} not analysed
              </span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1 w-full md:w-80">
            <ProgressBar
              count={counts.high}
              total={allFindings.length}
              color="rgb(248, 113, 113)"
              label="High"
              active={enabledSeverities.has('high')}
              onClick={() => toggleSeverity('high')}
            />
            <ProgressBar
              count={counts.medium}
              total={allFindings.length}
              color="rgb(250, 204, 21)"
              label="Med"
              active={enabledSeverities.has('medium')}
              onClick={() => toggleSeverity('medium')}
            />
            <ProgressBar
              count={counts.low}
              total={allFindings.length}
              color="rgb(96, 165, 250)"
              label="Low"
              active={enabledSeverities.has('low')}
              onClick={() => toggleSeverity('low')}
            />
          </div>
          {counts.high > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleAddHighToTodos}
              disabled={addingTodos}
              className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
              title="Add all high-severity findings to todo list"
            >
              {addingTodos ? (
                <Loader2 size={12} className="mr-1 animate-spin" />
              ) : (
                <AlertTriangle size={12} className="mr-1" />
              )}
              Add high to todos
            </Button>
          )}
          {todosResult && <span className="text-[10px] text-green-400">{todosResult}</span>}
          <Button size="sm" onClick={handleAnalyseAll} disabled={analysing} className="h-8 text-xs">
            {analysing ? (
              <>
                <Loader2 size={14} className="mr-1.5 animate-spin" />
                Analysing...
              </>
            ) : (
              <>
                <ScanSearch size={14} className="mr-1.5" />
                Run Analysis
              </>
            )}
          </Button>
        </div>
      </div>

      {/* ── Three columns ────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row gap-3 flex-1 min-h-0">
        {allFindings.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3 border border-border rounded-lg">
            {unanalysedCount > 0 ? (
              <>
                <ScanSearch size={32} className="opacity-40" />
                <p className="text-sm">
                  Click &ldquo;Run Analysis&rdquo; to scan {unanalysedCount} workspace
                  {unanalysedCount !== 1 ? 's' : ''} for gaps
                </p>
              </>
            ) : (
              <>
                <CheckCircle2 size={32} className="text-green-400 opacity-60" />
                <p className="text-sm">All workspaces look healthy</p>
              </>
            )}
          </div>
        ) : (
          <>
            {(['high', 'medium', 'low'] as const).map((severity, colIdx) => {
              const config = SEVERITY_STYLES[severity];
              const colFindings = allFindings.filter((f) => f.severity === severity);
              return (
                <div key={severity} className="flex-1 min-w-0 flex flex-col">
                  {colIdx > 0 && <div className="hidden" />}
                  {/* Column progress bar */}
                  <div className="pb-2 px-1 shrink-0">
                    <ProgressBar
                      count={colFindings.length}
                      total={allFindings.length}
                      color={
                        severity === 'high'
                          ? 'rgb(248, 113, 113)'
                          : severity === 'medium'
                            ? 'rgb(250, 204, 21)'
                            : 'rgb(96, 165, 250)'
                      }
                      label={config.label}
                      active={enabledSeverities.has(severity)}
                      onClick={() => toggleSeverity(severity)}
                    />
                  </div>
                  {/* Findings list */}
                  <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin space-y-1 px-1">
                    {colFindings.length === 0 && (
                      <p className="text-[10px] text-muted-foreground/40 text-center py-4">None</p>
                    )}
                    {colFindings.map((finding, _i) => {
                      const globalIdx = allFindings.indexOf(finding);
                      const isSelected = selectedIndex === globalIdx;
                      return (
                        <div key={`${finding.workspaceSlug}-${finding.sectionId}-${globalIdx}`}>
                          <button
                            type="button"
                            onClick={() => setSelectedIndex(isSelected ? null : globalIdx)}
                            className={cn(
                              'w-full text-left rounded border px-2 py-1.5 transition-colors',
                              isSelected
                                ? 'border-primary/30 bg-white/[0.04]'
                                : 'border-border/50 hover:bg-white/[0.02]'
                            )}
                          >
                            <span
                              className="text-[10px] font-medium truncate"
                              title={`${finding.workspaceTitle} / ${finding.sectionTitle}: ${finding.issue}`}
                            >
                              {finding.sectionTitle}
                              <span className="text-muted-foreground/40 font-normal">
                                {' '}
                                · {finding.workspaceTitle}
                              </span>
                              <span className="text-muted-foreground/60 font-normal">
                                {' '}
                                — {finding.issue}
                              </span>
                            </span>
                          </button>
                          {/* Inline detail when selected */}
                          {isSelected && (
                            <div className="mt-1 rounded border border-border/50 bg-white/[0.02] p-2 space-y-2">
                              <div>
                                <p className="text-[9px] uppercase tracking-wide text-muted-foreground/50">
                                  Suggestion
                                </p>
                                <p className="text-[10px] text-muted-foreground italic leading-relaxed">
                                  {finding.suggestion}
                                </p>
                              </div>
                              <div className="flex items-center gap-1">
                                {finding.sectionId > 0 && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleFixWithAi(finding)}
                                    disabled={gapFixLoading != null}
                                    className="h-6 px-1.5 text-[9px]"
                                    title="Auto-fix"
                                  >
                                    {gapFixLoading === finding.sectionId ? (
                                      <Loader2 size={9} className="animate-spin" />
                                    ) : (
                                      <>
                                        <Sparkles size={9} className="mr-0.5" />
                                        Fix
                                      </>
                                    )}
                                  </Button>
                                )}
                                <Link
                                  href={`/workspaces/${finding.workspaceSlug}#section-${finding.sectionId}`}
                                >
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-1.5 text-[9px]"
                                  >
                                    <ExternalLink size={9} className="mr-0.5" />
                                    View
                                  </Button>
                                </Link>
                              </div>
                              {finding.sectionId > 0 && (
                                <div className="flex items-center gap-1">
                                  <input
                                    value={customPrompt}
                                    onChange={(e) => setCustomPrompt(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && customPrompt.trim()) {
                                        handleFixWithPrompt(finding, customPrompt.trim());
                                        setCustomPrompt('');
                                      }
                                    }}
                                    placeholder="Custom fix..."
                                    className="flex-1 bg-transparent border border-border rounded px-1.5 py-0.5 text-[10px] text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-foreground/30 min-w-0"
                                  />
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      if (customPrompt.trim()) {
                                        handleFixWithPrompt(finding, customPrompt.trim());
                                        setCustomPrompt('');
                                      }
                                    }}
                                    disabled={!customPrompt.trim() || gapFixLoading != null}
                                    className="h-5 px-1.5 text-[9px]"
                                  >
                                    <Wand2 size={9} />
                                  </Button>
                                </div>
                              )}
                              {gapFixPreview && gapFixPreview.sectionId === finding.sectionId && (
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <p className="text-[10px] font-medium">AI Fix Preview</p>
                                    <div className="flex items-center gap-1">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={handleRejectFix}
                                        className="h-5 text-[9px]"
                                      >
                                        <X size={9} className="mr-0.5" />
                                        Reject
                                      </Button>
                                      <Button
                                        size="sm"
                                        onClick={handleAcceptFix}
                                        className="h-5 text-[9px]"
                                      >
                                        <Check size={9} className="mr-0.5" />
                                        Accept
                                      </Button>
                                    </div>
                                  </div>
                                  <div className="max-h-48 overflow-y-auto scrollbar-thin rounded border border-border">
                                    <VersionDiff
                                      oldText={gapFixPreview.oldContent}
                                      newText={gapFixPreview.newContent}
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {/* Column dividers */}
          </>
        )}
      </div>

      {/* ── Public Content Audit ─────────────────────────────────────────── */}
      {contentAuditEnabled && (
        <div className="shrink-0">
          <div className="flex items-center justify-between pb-3">
            <div className="flex items-center gap-3">
              <FileText size={16} className="text-muted-foreground" />
              <h2 className="text-sm font-semibold">Public Content</h2>
              {auditHealth && (
                <span
                  className={cn(
                    'w-2 h-2 rounded-full',
                    auditHealth === 'green' && 'bg-green-400',
                    auditHealth === 'yellow' && 'bg-yellow-400',
                    auditHealth === 'red' && 'bg-red-400'
                  )}
                />
              )}
              {auditReport && (
                <span className="text-xs text-muted-foreground">
                  {auditFindings.length} {auditFindings.length === 1 ? 'finding' : 'findings'}
                  {' · '}Last audited{' '}
                  {new Date(auditReport.createdAt).toLocaleDateString('en-AU', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleRunContentAudit}
              disabled={auditing}
              className="h-8 text-xs"
            >
              {auditing ? (
                <>
                  <Loader2 size={14} className="mr-1.5 animate-spin" />
                  Auditing...
                </>
              ) : (
                <>
                  <ScanSearch size={14} className="mr-1.5" />
                  Run Content Audit
                </>
              )}
            </Button>
          </div>

          <div className="flex flex-col md:flex-row gap-0 min-h-[160px] max-h-[320px]">
            {/* Audit findings list */}
            <div className="flex-1 min-w-0 overflow-y-auto scrollbar-thin border border-border rounded-lg">
              {!auditReport ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 py-8">
                  <FileText size={24} className="opacity-40" />
                  <p className="text-xs">
                    Run a content audit to check blog posts against insights data
                  </p>
                </div>
              ) : auditFindings.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 py-8">
                  <CheckCircle2 size={24} className="text-green-400 opacity-60" />
                  <p className="text-xs">All public content is consistent</p>
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {auditFindings.map((finding, i) => {
                    const sevStyle =
                      SEVERITY_STYLES[finding.severity as Severity] ?? SEVERITY_STYLES.low;
                    const typeStyle =
                      AUDIT_TYPE_STYLES[finding.type as keyof typeof AUDIT_TYPE_STYLES] ??
                      AUDIT_TYPE_STYLES.missing_coverage;
                    const isSelected = selectedAuditIndex === i;
                    return (
                      <button
                        key={`audit-${finding.postSlug}-${finding.type}-${i}`}
                        type="button"
                        onClick={() => setSelectedAuditIndex(isSelected ? null : i)}
                        className={cn(
                          'flex items-center gap-3 w-full text-left py-2.5 px-4 transition-colors cursor-pointer',
                          isSelected
                            ? 'bg-white/[0.04] border-l-2 border-l-primary'
                            : 'hover:bg-white/[0.02] border-l-2 border-l-transparent'
                        )}
                      >
                        <span
                          className={cn('w-2 h-2 rounded-full shrink-0', sevStyle.dot)}
                          title={sevStyle.label}
                        />
                        <Badge className={`text-[9px] px-1.5 py-0 shrink-0 ${typeStyle.className}`}>
                          {typeStyle.label}
                        </Badge>
                        {finding.postSlug && (
                          <span className="text-xs font-medium w-36 truncate shrink-0">
                            {finding.postSlug}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground/60 flex-1 truncate">
                          {finding.issue}
                        </span>
                        <Badge className={`text-[9px] px-1.5 py-0 shrink-0 ${sevStyle.className}`}>
                          {sevStyle.label}
                        </Badge>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Audit detail pane */}
            {selectedAuditFinding && (
              <div className="w-full md:w-[380px] shrink-0 border-t md:border-t-0 md:border-l border-border flex flex-col overflow-y-auto scrollbar-thin">
                <div className="px-5 py-3 border-b border-border">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <Badge
                        className={`text-[9px] px-1.5 py-0 ${
                          (
                            AUDIT_TYPE_STYLES[
                              selectedAuditFinding.type as keyof typeof AUDIT_TYPE_STYLES
                            ] ?? AUDIT_TYPE_STYLES.missing_coverage
                          ).className
                        }`}
                      >
                        {
                          (
                            AUDIT_TYPE_STYLES[
                              selectedAuditFinding.type as keyof typeof AUDIT_TYPE_STYLES
                            ] ?? AUDIT_TYPE_STYLES.missing_coverage
                          ).label
                        }
                      </Badge>
                      <Badge
                        className={`text-[9px] px-1.5 py-0 ${
                          SEVERITY_STYLES[selectedAuditFinding.severity as Severity]?.className ??
                          SEVERITY_STYLES.low.className
                        }`}
                      >
                        {selectedAuditFinding.severity}
                      </Badge>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedAuditIndex(null)}
                      className="p-1 rounded hover:bg-white/5 text-muted-foreground transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                    {selectedAuditFinding.postSlug && (
                      <span>Post: {selectedAuditFinding.postSlug}</span>
                    )}
                    {selectedAuditFinding.insightCategory && (
                      <span>Category: {selectedAuditFinding.insightCategory}</span>
                    )}
                  </div>
                </div>
                <div className="px-5 py-3 space-y-3 flex-1">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mb-1">
                      Claim
                    </p>
                    <p className="text-xs leading-relaxed">{selectedAuditFinding.claim}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mb-1">
                      Issue
                    </p>
                    <p className="text-xs leading-relaxed">{selectedAuditFinding.issue}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mb-1">
                      Suggestion
                    </p>
                    <p className="text-xs leading-relaxed text-muted-foreground italic">
                      {selectedAuditFinding.suggestion}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
