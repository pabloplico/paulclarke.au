'use client';

import { Skeleton } from '@repo/ui/skeleton';
import { X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { FindingCard } from './finding-card';

const FINDING_TYPES = [
  'all',
  'trend',
  'competitor',
  'pricing',
  'regulation',
  'sentiment',
  'statistic',
  'news',
] as const;

type FindingType = (typeof FINDING_TYPES)[number];

interface Finding {
  id: number;
  title: string;
  content: string;
  findingType: string;
  confidenceScore: number;
  sentimentScore: number | null;
  geo: { country?: string; state?: string; city?: string } | null;
  tags: { sectors?: string[]; topics?: string[]; entities?: string[] } | null;
  url: string | null;
  publishedAt: string | null;
  createdAt: string;
}

interface FindingsPanelProps {
  workspaceId: number;
  open: boolean;
  onClose: () => void;
}

export function FindingsPanel({ workspaceId, open, onClose }: FindingsPanelProps) {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FindingType>('all');

  const fetchFindings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/research/findings`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setFindings(data.findings ?? data ?? []);
    } catch {
      setFindings([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (open) fetchFindings();
  }, [open, fetchFindings]);

  const filtered = filter === 'all' ? findings : findings.filter((f) => f.findingType === filter);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-border bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-medium text-foreground">Research Findings</h2>
            <p className="text-xs text-muted-foreground">
              {findings.length} finding{findings.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close findings panel"
            className="rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 flex-wrap border-b border-border px-4 py-2">
          {FINDING_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setFilter(type)}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                filter === type
                  ? 'bg-lime-600 text-white'
                  : 'bg-white/5 text-muted-foreground hover:text-foreground'
              }`}
            >
              {type === 'all' ? 'All' : type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm text-muted-foreground">
                {findings.length === 0
                  ? 'No findings yet. Run research to generate findings.'
                  : 'No findings match this filter.'}
              </p>
            </div>
          ) : (
            filtered.map((finding) => <FindingCard key={finding.id} finding={finding} />)
          )}
        </div>
      </div>
    </>
  );
}
