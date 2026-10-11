'use client';

import { Badge } from '@repo/ui/badge';
import { Button } from '@repo/ui/button';
import { Card } from '@repo/ui/card';
import { Input } from '@repo/ui/input';
import { toast } from '@repo/ui/sonner';
import { Check, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { AvailableChunk } from './store';

interface ChunkPickerModalProps {
  knowledgeBaseId: number;
  onClose: () => void;
  onAdded: () => void;
}

export function ChunkPickerModal({ knowledgeBaseId, onClose, onAdded }: ChunkPickerModalProps) {
  const [available, setAvailable] = useState<AvailableChunk[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/knowledge-bases/${knowledgeBaseId}/available-chunks`)
      .then((r) => r.json())
      .then((data: AvailableChunk[]) => {
        setAvailable(data);
        setLoading(false);
      })
      .catch(() => {
        toast.error('Failed to load available chunks');
        setLoading(false);
      });
  }, [knowledgeBaseId]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const toggleChunk = useCallback((chunkId: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(chunkId)) next.delete(chunkId);
      else next.add(chunkId);
      return next;
    });
  }, []);

  const handleAdd = async () => {
    if (selected.size === 0) return;
    setSaving(true);
    try {
      const res = await fetch('/api/kb-chunks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          knowledgeBaseId,
          chunkIds: Array.from(selected),
        }),
      });
      if (!res.ok) throw new Error();
      toast.success(`${selected.size} chunks added`);
      onAdded();
      onClose();
    } catch {
      toast.error('Failed to add chunks');
    } finally {
      setSaving(false);
    }
  };

  const filtered = search
    ? available.filter(
        (c) =>
          c.content.toLowerCase().includes(search.toLowerCase()) ||
          c.documentTitle.toLowerCase().includes(search.toLowerCase())
      )
    : available;

  // Group by document
  const grouped = new Map<number, { title: string; chunks: AvailableChunk[] }>();
  for (const chunk of filtered) {
    const group = grouped.get(chunk.documentId) || { title: chunk.documentTitle, chunks: [] };
    group.chunks.push(chunk);
    grouped.set(chunk.documentId, group);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-[calc(100vw-2rem)] sm:max-w-2xl max-h-[80vh] flex flex-col rounded-xl border border-white/10 bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <h3 className="font-semibold">Add Approved Chunks</h3>
          <div className="flex items-center gap-2">
            {selected.size > 0 && (
              <Badge variant="secondary" className="text-xs">
                {selected.size} selected
              </Badge>
            )}
            <button
              type="button"
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="border-b border-white/10 p-3">
          <Input
            placeholder="Search chunks or documents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-sm"
            autoFocus
          />
        </div>

        {/* Chunk list */}
        <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-4">
          {loading ? (
            <p className="text-center text-sm text-muted-foreground py-8">Loading...</p>
          ) : grouped.size === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              No available approved chunks.
            </p>
          ) : (
            Array.from(grouped.entries()).map(([docId, { title, chunks: docChunks }]) => (
              <div key={docId}>
                <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center justify-between">
                  {title}
                  <button
                    type="button"
                    className="text-primary text-[10px] hover:underline"
                    onClick={() => {
                      setSelected((prev) => {
                        const next = new Set(prev);
                        for (const c of docChunks) next.add(c.chunkId);
                        return next;
                      });
                    }}
                  >
                    Select all
                  </button>
                </h4>
                <div className="space-y-1.5">
                  {docChunks.map((chunk) => (
                    <Card
                      key={chunk.chunkId}
                      className={`cursor-pointer p-3 transition-colors ${
                        selected.has(chunk.chunkId)
                          ? 'ring-1 ring-primary bg-primary/5'
                          : 'hover:bg-white/[0.02]'
                      }`}
                      onClick={() => toggleChunk(chunk.chunkId)}
                    >
                      <div className="flex items-start gap-2">
                        <div
                          className={`mt-0.5 h-4 w-4 shrink-0 rounded border flex items-center justify-center ${
                            selected.has(chunk.chunkId)
                              ? 'bg-primary border-primary'
                              : 'border-white/20'
                          }`}
                        >
                          {selected.has(chunk.chunkId) && (
                            <Check className="h-3 w-3 text-primary-foreground" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {chunk.content.slice(0, 200)}
                          </p>
                          <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                            <span>#{chunk.chunkIndex}</span>
                            {chunk.tokenCount && <span>{chunk.tokenCount} tokens</span>}
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-white/10 p-3">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleAdd} disabled={selected.size === 0 || saving}>
            {saving ? 'Adding...' : `Add ${selected.size} Chunk${selected.size !== 1 ? 's' : ''}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
