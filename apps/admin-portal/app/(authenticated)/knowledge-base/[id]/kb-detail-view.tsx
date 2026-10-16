'use client';

import { Badge } from '@repo/ui/badge';
import { Button } from '@repo/ui/button';
import { Card } from '@repo/ui/card';
import { Input } from '@repo/ui/input';
import { toast } from '@repo/ui/sonner';
import { ArrowLeft, FileText, Hash, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { KnowledgeBaseWithStats } from '@/lib/types';
import { ChunkPickerModal } from './chunk-picker-modal';
import type { KbChunk } from './store';
import { useKbDetailStore } from './store';

interface KbDetailViewProps {
  initialKb: KnowledgeBaseWithStats;
  initialChunks: KbChunk[];
}

export function KbDetailView({ initialKb, initialChunks }: KbDetailViewProps) {
  const {
    kb,
    chunks,
    showPicker,
    search,
    setKb,
    setChunks,
    removeChunks,
    togglePicker,
    setSearch,
  } = useKbDetailStore();

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  useEffect(() => {
    setKb(initialKb);
    setChunks(initialChunks);
  }, [initialKb, initialChunks, setKb, setChunks]);

  const refreshChunks = useCallback(async () => {
    if (!kb) return;
    const res = await fetch(`/api/knowledge-bases/${kb.id}/chunks`);
    if (res.ok) {
      const data: KbChunk[] = await res.json();
      setChunks(data);
    }
  }, [kb, setChunks]);

  const handleSaveEdit = async () => {
    if (!kb) return;
    try {
      const res = await fetch(`/api/knowledge-bases/${kb.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName, description: editDescription }),
      });
      if (!res.ok) throw new Error();
      const updated: KnowledgeBaseWithStats = await res.json();
      setKb(updated);
      setEditing(false);
      toast.success('Knowledge base updated');
    } catch {
      toast.error('Failed to update');
    }
  };

  const handleRemoveChunks = useCallback(
    async (chunkIds: number[]) => {
      if (!kb) return;
      removeChunks(chunkIds);

      try {
        const res = await fetch('/api/kb-chunks', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ knowledgeBaseId: kb.id, chunkIds }),
        });
        if (!res.ok) throw new Error();
        toast.success(`${chunkIds.length} chunk${chunkIds.length !== 1 ? 's' : ''} removed`);
      } catch {
        refreshChunks();
        toast.error('Failed to remove chunks');
      }
    },
    [kb, removeChunks, refreshChunks]
  );

  if (!kb) return null;

  const filtered = search
    ? chunks.filter(
        (c) =>
          c.content.toLowerCase().includes(search.toLowerCase()) ||
          c.documentTitle.toLowerCase().includes(search.toLowerCase())
      )
    : chunks;

  // Group by document
  const grouped = new Map<number, { title: string; chunks: KbChunk[] }>();
  for (const chunk of filtered) {
    const group = grouped.get(chunk.documentId) || { title: chunk.documentTitle, chunks: [] };
    group.chunks.push(chunk);
    grouped.set(chunk.documentId, group);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link
          href="/knowledge-base"
          aria-label="Back to knowledge bases"
          className="mt-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="space-y-2">
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="text-lg font-semibold h-9"
                autoFocus
              />
              <Input
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Description..."
                className="text-sm h-8"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveEdit}>
                  Save
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <button
                type="button"
                className="text-left"
                onClick={() => {
                  setEditName(kb.name);
                  setEditDescription(kb.description || '');
                  setEditing(true);
                }}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="h-3 w-3 rounded-full shrink-0"
                    style={{ backgroundColor: kb.color || '#6b7280' }}
                  />
                  <h2 className="text-lg font-semibold">{kb.name}</h2>
                </div>
                {kb.description && (
                  <p className="mt-1 text-sm text-muted-foreground">{kb.description}</p>
                )}
              </button>
              <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Hash className="h-3 w-3" />
                  {chunks.length} chunks
                </span>
                <span className="flex items-center gap-1">
                  <FileText className="h-3 w-3" />
                  {grouped.size} documents
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Search + add button */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <Input
          placeholder="Search chunks..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 text-sm w-full sm:max-w-xs"
        />
        <Button size="sm" onClick={togglePicker}>
          <Plus className="h-4 w-4" />
          Add Chunks
        </Button>
      </div>

      {/* Chunk list grouped by document */}
      {grouped.size > 0 ? (
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([docId, { title, chunks: docChunks }]) => (
            <div key={docId}>
              <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                <FileText className="h-3.5 w-3.5" />
                {title}
                <Badge variant="secondary" className="text-xs">
                  {docChunks.length}
                </Badge>
              </h3>
              <div className="space-y-1.5">
                {docChunks.map((chunk) => (
                  <Card key={chunk.kbChunkId} className="p-3">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                          {chunk.content}
                        </p>
                        <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                          <span>#{chunk.chunkIndex}</span>
                          {chunk.tokenCount && <span>{chunk.tokenCount} tokens</span>}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0 text-destructive hover:text-destructive"
                        onClick={() => handleRemoveChunks([chunk.chunkId])}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 py-16 text-center">
          <Hash className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-muted-foreground text-sm">
            {chunks.length === 0
              ? 'No chunks assigned yet. Add approved chunks to this knowledge base.'
              : 'No chunks match your search.'}
          </p>
        </div>
      )}

      {/* Chunk picker modal */}
      {showPicker && (
        <ChunkPickerModal knowledgeBaseId={kb.id} onClose={togglePicker} onAdded={refreshChunks} />
      )}
    </div>
  );
}
