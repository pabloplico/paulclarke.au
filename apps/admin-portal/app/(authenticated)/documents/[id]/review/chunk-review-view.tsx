'use client';

import { Badge } from '@repo/ui/badge';
import { Button } from '@repo/ui/button';
import { toast } from '@repo/ui/sonner';
import { ArrowLeft, CheckCheck, ParkingMeter, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef } from 'react';
import type { ChunkWithCuration, CurationStatus, KnowledgeBaseWithStats } from '@/lib/types';
import { ChunkCard } from './chunk-card';
import { useChunkReviewStore } from './store';
import type { CurationFilter } from './utils';
import { CURATION_CONFIG, matchesCurationFilter } from './utils';

interface ChunkReviewViewProps {
  documentId: number;
  documentTitle: string;
  initialChunks: ChunkWithCuration[];
  knowledgeBases: KnowledgeBaseWithStats[];
}

const FILTER_BUTTONS: { key: CurationFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'raw', label: 'Raw' },
  { key: 'approved', label: 'Approved' },
  { key: 'excluded', label: 'Excluded' },
  { key: 'parked', label: 'Parked' },
];

export function ChunkReviewView({
  documentId,
  documentTitle,
  initialChunks,
  knowledgeBases,
}: ChunkReviewViewProps) {
  const {
    chunks,
    filter,
    focusedIndex,
    setChunks,
    updateChunk,
    setFilter,
    setFocusedIndex,
    getCounts,
  } = useChunkReviewStore();

  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setChunks(initialChunks);
  }, [initialChunks, setChunks]);

  const counts = getCounts();
  const filtered = chunks.filter((c) => matchesCurationFilter(c.curationStatus, filter));

  const handleStatusChange = useCallback(
    async (chunkId: number, status: CurationStatus) => {
      const prev = chunks.find((c) => c.id === chunkId);
      updateChunk(chunkId, { curationStatus: status, reviewedAt: new Date() });

      try {
        const res = await fetch(`/api/documents/${documentId}/chunks`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chunkId, curationStatus: status }),
        });
        if (!res.ok) throw new Error();
      } catch {
        if (prev) updateChunk(chunkId, { curationStatus: prev.curationStatus });
        toast.error('Failed to update chunk status');
      }
    },
    [chunks, documentId, updateChunk]
  );

  const handleNoteChange = useCallback(
    async (chunkId: number, note: string) => {
      updateChunk(chunkId, { curatorNote: note || null });

      try {
        const res = await fetch(`/api/documents/${documentId}/chunks`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chunkId,
            curationStatus: chunks.find((c) => c.id === chunkId)?.curationStatus || 'raw',
            curatorNote: note || null,
          }),
        });
        if (!res.ok) throw new Error();
      } catch {
        toast.error('Failed to save note');
      }
    },
    [chunks, documentId, updateChunk]
  );

  const handleBulkAction = useCallback(
    async (targetStatus: CurationStatus, sourceFilter?: CurationStatus) => {
      const targets = sourceFilter
        ? chunks.filter((c) => c.curationStatus === sourceFilter)
        : chunks;
      const chunkIds = targets.map((c) => c.id);
      if (chunkIds.length === 0) return;

      // Optimistic update
      for (const id of chunkIds) {
        updateChunk(id, { curationStatus: targetStatus, reviewedAt: new Date() });
      }

      try {
        const res = await fetch(`/api/documents/${documentId}/chunks/bulk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chunkIds, curationStatus: targetStatus }),
        });
        if (!res.ok) throw new Error();
        toast.success(`${chunkIds.length} chunks updated`);
      } catch {
        // Re-fetch on failure
        const res = await fetch(`/api/documents/${documentId}/chunks`);
        if (res.ok) {
          const data: ChunkWithCuration[] = await res.json();
          setChunks(data);
        }
        toast.error('Bulk update failed');
      }
    },
    [chunks, documentId, updateChunk, setChunks]
  );

  const handleKbAssign = useCallback(
    async (chunkId: number, kbId: number) => {
      try {
        const res = await fetch('/api/kb-chunks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ knowledgeBaseId: kbId, chunkIds: [chunkId] }),
        });
        if (!res.ok) throw new Error();
        const kb = knowledgeBases.find((k) => k.id === kbId);
        if (kb) {
          updateChunk(chunkId, {
            kbAssignments: [
              ...(chunks.find((c) => c.id === chunkId)?.kbAssignments || []),
              { id: kbId, knowledgeBaseId: kbId, name: kb.name, color: kb.color },
            ],
          });
        }
        toast.success('Chunk assigned to KB');
      } catch {
        toast.error('Failed to assign chunk');
      }
    },
    [chunks, knowledgeBases, updateChunk]
  );

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'j') {
        setFocusedIndex(Math.min(focusedIndex + 1, filtered.length - 1));
      } else if (e.key === 'k') {
        setFocusedIndex(Math.max(focusedIndex - 1, 0));
      } else if (e.key === 'a' && filtered[focusedIndex]) {
        handleStatusChange(filtered[focusedIndex].id, 'approved');
      } else if (e.key === 'e' && filtered[focusedIndex]) {
        handleStatusChange(filtered[focusedIndex].id, 'excluded');
      } else if (e.key === 'p' && filtered[focusedIndex]) {
        handleStatusChange(filtered[focusedIndex].id, 'parked');
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [focusedIndex, filtered, handleStatusChange, setFocusedIndex]);

  // Scroll focused card into view
  useEffect(() => {
    if (!listRef.current) return;
    const cards = listRef.current.querySelectorAll('[data-chunk-id]');
    cards[focusedIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [focusedIndex]);

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex items-center gap-3">
        <Link
          href="/documents"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold truncate">{documentTitle}</h2>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {(Object.keys(CURATION_CONFIG) as CurationStatus[]).map((status) => (
            <Badge
              key={status}
              variant="outline"
              className={`${CURATION_CONFIG[status].className} text-xs`}
            >
              {counts[status]} {CURATION_CONFIG[status].label.toLowerCase()}
            </Badge>
          ))}
        </div>
      </div>

      {/* Filter + bulk actions */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          {FILTER_BUTTONS.map(({ key, label }) => (
            <Button
              key={key}
              variant={filter === key ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setFilter(key)}
            >
              {label}
              {key !== 'all' && (
                <span className="ml-1 text-xs text-muted-foreground">{counts[key]}</span>
              )}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="text-xs gap-1"
            onClick={() => handleBulkAction('approved', 'raw')}
            disabled={counts.raw === 0}
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Approve All Raw
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs gap-1"
            onClick={() => handleBulkAction('excluded', 'raw')}
            disabled={counts.raw === 0}
          >
            <XCircle className="h-3.5 w-3.5" />
            Exclude All Raw
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs gap-1"
            onClick={() => handleBulkAction('parked')}
            disabled={counts.total === 0}
          >
            <ParkingMeter className="h-3.5 w-3.5" />
            Park All
          </Button>
        </div>
      </div>

      {/* Keyboard hint */}
      <p className="text-xs text-muted-foreground">
        Keyboard: <kbd className="px-1 py-0.5 rounded bg-white/5 text-[10px]">j</kbd>/
        <kbd className="px-1 py-0.5 rounded bg-white/5 text-[10px]">k</kbd> navigate,{' '}
        <kbd className="px-1 py-0.5 rounded bg-white/5 text-[10px]">a</kbd> approve,{' '}
        <kbd className="px-1 py-0.5 rounded bg-white/5 text-[10px]">e</kbd> exclude,{' '}
        <kbd className="px-1 py-0.5 rounded bg-white/5 text-[10px]">p</kbd> park
      </p>

      {/* Chunk list */}
      <div ref={listRef} className="space-y-2">
        {filtered.map((chunk, index) => (
          <ChunkCard
            key={chunk.id}
            chunk={chunk}
            focused={index === focusedIndex}
            knowledgeBases={knowledgeBases}
            onStatusChange={handleStatusChange}
            onNoteChange={handleNoteChange}
            onKbAssigned={handleKbAssign}
          />
        ))}
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 py-16 text-center">
            <p className="text-muted-foreground text-sm">
              {chunks.length === 0
                ? 'No chunks found for this document.'
                : 'No chunks match this filter.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
