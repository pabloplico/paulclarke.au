'use client';

import { Button } from '@repo/ui/button';
import { toast } from '@repo/ui/sonner';
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  FileUp,
  Globe,
  Lightbulb,
  Loader2,
  Play,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

interface AgentRun {
  id: number;
  taskId: number;
  status: string;
  startedAt: string;
  completedAt: string | null;
  findingsCount: number;
  tokensUsed: number;
  log: Array<{ timestamp: string; message: string; level: string }>;
}

interface ResearchToolbarProps {
  workspaceId: number;
  sourceCount: number;
  findingCount: number;
  onShowSources: () => void;
  onShowFindings: () => void;
  onShowRuns: () => void;
  onCountsChanged?: () => void;
}

export function ResearchToolbar({
  workspaceId,
  sourceCount,
  findingCount,
  onShowSources,
  onShowFindings,
  onShowRuns,
  onCountsChanged,
}: ResearchToolbarProps) {
  const [runningResearch, setRunningResearch] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Active run polling state
  const [activeRuns, setActiveRuns] = useState<AgentRun[]>([]);
  const [showRunDetail, setShowRunDetail] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchActiveRuns = useCallback(async () => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/research/agent-runs?status=started`);
      if (!res.ok) return;
      const data = await res.json();
      const runs: AgentRun[] = data.runs ?? data ?? [];
      const wasActive = activeRuns.length > 0;
      setActiveRuns(runs);

      // If runs just completed, refresh counts
      if (wasActive && runs.length === 0) {
        onCountsChanged?.();
      }
    } catch {
      // Silently ignore polling errors
    }
  }, [workspaceId, activeRuns.length, onCountsChanged]);

  // Poll for active runs every 3s when there are active runs, 10s otherwise
  useEffect(() => {
    fetchActiveRuns();
    const interval = setInterval(fetchActiveRuns, activeRuns.length > 0 ? 3000 : 10000);
    pollRef.current = interval;
    return () => clearInterval(interval);
  }, [activeRuns.length, fetchActiveRuns]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRunResearch = useCallback(async () => {
    setRunningResearch(true);
    try {
      const tasksRes = await fetch(`/api/workspaces/${workspaceId}/research/agent-tasks`);
      if (!tasksRes.ok) throw new Error('Failed to load agent tasks');
      const tasksData = await tasksRes.json();
      const tasks = tasksData.tasks ?? tasksData ?? [];
      let researchTask = tasks.find((t: { agentType: string }) => t.agentType === 'research');

      if (!researchTask) {
        const createRes = await fetch(`/api/workspaces/${workspaceId}/research/agent-tasks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentType: 'research', name: 'Research Agent' }),
        });
        if (!createRes.ok) throw new Error('Failed to create research agent task');
        researchTask = await createRes.json();
      }

      const res = await fetch(
        `/api/workspaces/${workspaceId}/research/agent-tasks/${researchTask.id}/trigger`,
        { method: 'POST' }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to start research');
      }
      toast.success('Research agent started');
      // Immediately poll for the new run
      setTimeout(fetchActiveRuns, 500);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start research');
    } finally {
      setRunningResearch(false);
    }
  }, [workspaceId, fetchActiveRuns]);

  const handleGenerateReport = useCallback(async () => {
    setGeneratingReport(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/research/generate-report`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to generate report');
      }
      toast.success('Analysis agent started — sections will update when complete');
      setTimeout(fetchActiveRuns, 500);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate report');
    } finally {
      setGeneratingReport(false);
    }
  }, [workspaceId, fetchActiveRuns]);

  const handleIngestFile = useCallback(
    async (file: File) => {
      setIngesting(true);
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch(`/api/workspaces/${workspaceId}/research/ingest`, {
          method: 'POST',
          body: formData,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? 'Failed to ingest file');
        }
        toast.success(`Ingesting ${file.name}...`);
        setTimeout(fetchActiveRuns, 500);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to ingest file');
      } finally {
        setIngesting(false);
      }
    },
    [workspaceId, fetchActiveRuns]
  );

  const hasActiveRuns = activeRuns.length > 0;

  // Get the latest log entry from active runs for display
  const latestLog = activeRuns
    .flatMap((r) => (r.log ?? []).map((l) => ({ ...l, runId: r.id })))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];

  return (
    <div className="space-y-0">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5">
        {/* Actions */}
        <Button
          size="sm"
          onClick={handleRunResearch}
          disabled={runningResearch || sourceCount === 0 || hasActiveRuns}
          title={
            hasActiveRuns
              ? 'Agent is already running'
              : sourceCount === 0
                ? 'Add sources before running research'
                : 'Run AI research agents'
          }
          className="gap-1.5 bg-lime-600 text-white hover:bg-lime-500 disabled:opacity-50"
        >
          {runningResearch ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          Run Research
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={handleGenerateReport}
          disabled={generatingReport || findingCount === 0 || hasActiveRuns}
          title={
            hasActiveRuns
              ? 'Agent is already running'
              : findingCount === 0
                ? 'Run research first to generate findings'
                : 'Generate report from findings'
          }
          className="gap-1.5"
        >
          {generatingReport ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <BookOpen size={14} />
          )}
          Generate Report
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={ingesting}
          className="gap-1.5"
        >
          {ingesting ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />}
          Ingest File
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".pdf,.docx,.csv,.md,.txt,.json"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleIngestFile(file);
            e.target.value = '';
          }}
        />

        {/* Separator */}
        <div className="mx-1 h-5 w-px bg-border" />

        {/* Badges */}
        <button
          type="button"
          onClick={onShowSources}
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors ${
            sourceCount === 0
              ? 'border border-dashed border-yellow-500/50 bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20'
              : 'bg-white/5 text-muted-foreground hover:text-foreground'
          }`}
        >
          <Globe size={12} />
          {sourceCount === 0 ? (
            <span className="font-medium">Add sources</span>
          ) : (
            <>
              <span className="font-medium text-foreground">{sourceCount}</span> sources
            </>
          )}
        </button>

        <button
          type="button"
          onClick={sourceCount === 0 ? onShowSources : onShowFindings}
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors ${
            findingCount === 0
              ? 'border border-dashed border-yellow-500/50 bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20'
              : 'bg-white/5 text-muted-foreground hover:text-foreground'
          }`}
        >
          <Lightbulb size={12} />
          {findingCount === 0 ? (
            <span className="font-medium">
              {sourceCount === 0 ? 'Add sources first' : 'Run research'}
            </span>
          ) : (
            <>
              <span className="font-medium text-foreground">{findingCount}</span> findings
            </>
          )}
        </button>
      </div>

      {/* Active agent run status bar */}
      {hasActiveRuns && (
        <div className="mx-2 rounded-b-lg border border-t-0 border-lime-500/30 bg-lime-500/5 px-4 py-2">
          <button
            type="button"
            onClick={() => setShowRunDetail(!showRunDetail)}
            className="flex w-full items-center gap-2 text-xs"
          >
            <Loader2 size={12} className="animate-spin text-lime-500" />
            <span className="font-medium text-lime-400">
              {activeRuns.length} agent{activeRuns.length > 1 ? 's' : ''} running
            </span>
            {latestLog && (
              <span className="flex-1 truncate text-left text-muted-foreground">
                — {latestLog.message}
              </span>
            )}
            <span className="text-muted-foreground">{formatElapsed(activeRuns[0]?.startedAt)}</span>
            {showRunDetail ? (
              <ChevronUp size={12} className="text-muted-foreground" />
            ) : (
              <ChevronDown size={12} className="text-muted-foreground" />
            )}
          </button>

          {showRunDetail && (
            <div className="mt-2 max-h-40 space-y-1 overflow-y-auto scrollbar-thin">
              {activeRuns.map((run) => (
                <div key={run.id} className="rounded-md bg-black/20 px-3 py-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-medium text-foreground">Run #{run.id}</span>
                    <span className="text-muted-foreground">
                      {run.findingsCount > 0 && `${run.findingsCount} findings · `}
                      {formatElapsed(run.startedAt)}
                    </span>
                  </div>
                  {(run.log ?? []).length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {(run.log ?? []).slice(-5).map((entry, i) => (
                        <p
                          key={i}
                          className={`text-[10px] leading-tight ${
                            entry.level === 'error'
                              ? 'text-red-400'
                              : entry.level === 'warn'
                                ? 'text-yellow-400'
                                : 'text-muted-foreground'
                          }`}
                        >
                          <span className="text-muted-foreground/50">
                            {new Date(entry.timestamp).toLocaleTimeString()}
                          </span>{' '}
                          {entry.message}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatElapsed(startedAt: string | undefined): string {
  if (!startedAt) return '';
  const elapsed = Date.now() - new Date(startedAt).getTime();
  const secs = Math.floor(elapsed / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  return `${mins}m ${remSecs}s`;
}
