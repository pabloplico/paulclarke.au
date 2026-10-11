'use client';

import { Button } from '@repo/ui/button';
import { Input } from '@repo/ui/input';
import { Skeleton } from '@repo/ui/skeleton';
import { toast } from '@repo/ui/sonner';
import { Globe, Lightbulb, Loader2, Plus, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SourceDirectoryPanel } from './source-directory-panel';

interface Source {
  id: number;
  name: string;
  sourceType: string;
  url: string | null;
  qualityScore: number | null;
  createdAt: string;
}

interface SourcesPanelProps {
  workspaceId: number;
  open: boolean;
  onClose: () => void;
  onSourceCountChange?: (count: number) => void;
}

const SOURCE_TYPES = ['web_scrape', 'public_api', 'manual_upload', 'rss_feed'] as const;

export function SourcesPanel({
  workspaceId,
  open,
  onClose,
  onSourceCountChange,
}: SourcesPanelProps) {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showDirectory, setShowDirectory] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Add form state
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<string>('web_scrape');
  const [newUrl, setNewUrl] = useState('');

  const fetchSources = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/research/sources`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      const list = data.sources ?? data ?? [];
      setSources(list);
      onSourceCountChange?.(list.length);
    } catch {
      setSources([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, onSourceCountChange]);

  useEffect(() => {
    if (open) fetchSources();
  }, [open, fetchSources]);

  const existingUrls = useMemo(
    () => new Set(sources.filter((s) => s.url).map((s) => s.url!)),
    [sources]
  );

  const handleAddSource = useCallback(
    async (source: { name: string; sourceType: string; url: string }) => {
      setAdding(true);
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/research/sources`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(source),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? 'Failed to add source');
        }
        toast.success(`Added ${source.name}`);
        await fetchSources();
        setShowAddForm(false);
        setNewName('');
        setNewType('web_scrape');
        setNewUrl('');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to add source');
      } finally {
        setAdding(false);
      }
    },
    [workspaceId, fetchSources]
  );

  const handleDelete = useCallback(
    async (id: number) => {
      setDeletingId(id);
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/research/sources/${id}`, {
          method: 'DELETE',
        });
        if (!res.ok) throw new Error();
        toast.success('Source removed');
        await fetchSources();
      } catch {
        toast.error('Failed to remove source');
      } finally {
        setDeletingId(null);
      }
    },
    [workspaceId, fetchSources]
  );

  const handleSuggest = useCallback(async () => {
    setSuggesting(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/research/sources/suggest`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const count = data.added ?? 0;
      toast.success(`Added ${count} suggested source${count !== 1 ? 's' : ''}`);
      await fetchSources();
    } catch {
      toast.error('Failed to suggest sources');
    } finally {
      setSuggesting(false);
    }
  }, [workspaceId, fetchSources]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-border bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-medium text-foreground">Research Sources</h2>
            <p className="text-xs text-muted-foreground">
              {sources.length} source{sources.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sources panel"
            className="rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setShowAddForm(!showAddForm);
              setShowDirectory(false);
            }}
            className="gap-1.5"
          >
            <Plus size={14} />
            Add Source
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleSuggest}
            disabled={suggesting}
            className="gap-1.5"
          >
            {suggesting ? <Loader2 size={14} className="animate-spin" /> : <Lightbulb size={14} />}
            Suggest Sources
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setShowDirectory(!showDirectory);
              setShowAddForm(false);
            }}
            className="gap-1.5"
          >
            <Globe size={14} />
            Browse Directory
          </Button>
        </div>

        {/* Add form */}
        {showAddForm && (
          <div className="border-b border-border px-4 py-3 space-y-2">
            <Input
              placeholder="Source name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="text-xs"
            />
            <div className="flex gap-2">
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground"
              >
                {SOURCE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
              <Input
                placeholder="URL (optional)"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                className="flex-1 text-xs"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowAddForm(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!newName.trim() || adding}
                onClick={() =>
                  handleAddSource({ name: newName.trim(), sourceType: newType, url: newUrl.trim() })
                }
                className="gap-1.5 bg-lime-600 text-white hover:bg-lime-500"
              >
                {adding && <Loader2 size={14} className="animate-spin" />}
                Add
              </Button>
            </div>
          </div>
        )}

        {/* Directory panel */}
        {showDirectory && (
          <div className="border-b border-border p-4">
            <SourceDirectoryPanel
              workspaceId={workspaceId}
              workspaceType="both"
              existingUrls={existingUrls}
              onAdd={(source) => {
                handleAddSource(source);
              }}
              onClose={() => setShowDirectory(false)}
            />
          </div>
        )}

        {/* Source list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="rounded-lg border border-border bg-card p-3 space-y-1">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
              ))}
            </div>
          ) : sources.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm text-muted-foreground">
                No sources yet. Add sources or browse the directory.
              </p>
            </div>
          ) : (
            sources.map((source) => (
              <div
                key={source.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5"
              >
                <Globe size={14} className="shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-foreground truncate">
                      {source.name}
                    </span>
                    <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {source.sourceType.replace(/_/g, ' ')}
                    </span>
                  </div>
                  {source.url && (
                    <p className="text-[11px] text-muted-foreground truncate">{source.url}</p>
                  )}
                </div>
                {source.qualityScore != null && (
                  <span
                    className={`text-xs font-medium ${
                      source.qualityScore >= 0.7
                        ? 'text-lime-500'
                        : source.qualityScore >= 0.4
                          ? 'text-yellow-500'
                          : 'text-red-400'
                    }`}
                  >
                    {(source.qualityScore * 100).toFixed(0)}%
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => handleDelete(source.id)}
                  disabled={deletingId === source.id}
                  className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-red-400 disabled:opacity-50 transition-colors"
                  aria-label={`Remove ${source.name}`}
                >
                  {deletingId === source.id ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Trash2 size={14} />
                  )}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
