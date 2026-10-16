'use client';

import { Button } from '@repo/ui/button';
import { Checkbox } from '@repo/ui/checkbox';
import { Input } from '@repo/ui/input';
import { Loader2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { WorkspaceWithCounts } from '@/lib/workspaces/types';

interface Section {
  id: number;
  title: string;
  template: string;
}

interface SplitWorkspaceDialogProps {
  workspace: WorkspaceWithCounts;
  onClose: () => void;
  onSplit: () => void;
}

export function SplitWorkspaceDialog({ workspace, onClose, onSplit }: SplitWorkspaceDialogProps) {
  const [sections, setSections] = useState<Section[]>([]);
  const [loadingSections, setLoadingSections] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [newTitle, setNewTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/workspaces/${workspace.id}`)
      .then((res) => res.json())
      .then((data) => {
        setSections(
          (data.sections ?? []).map((s: { id: number; title: string; template: string }) => ({
            id: s.id,
            title: s.title,
            template: s.template,
          }))
        );
        setLoadingSections(false);
      })
      .catch(() => setLoadingSections(false));
  }, [workspace.id]);

  const toggleSection = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const canSplit =
    selectedIds.size > 0 && selectedIds.size < sections.length && newTitle.trim().length > 0;

  const handleSplit = async () => {
    if (!canSplit) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/workspaces/split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: workspace.id,
          sectionIds: [...selectedIds],
          newTitle: newTitle.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to split');
        return;
      }

      onSplit();
    } catch {
      setError('Failed to split workspace');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-popover p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold">Split &ldquo;{workspace.title}&rdquo;</h4>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          aria-label="Close"
          className="h-6 w-6 p-0 text-muted-foreground"
        >
          <X size={12} />
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Select sections to move to a new workspace. Remaining sections stay in the original.
      </p>

      {loadingSections ? (
        <p className="text-xs text-muted-foreground">Loading sections...</p>
      ) : (
        <div className="space-y-1 rounded border border-border p-2 max-h-[60vh] overflow-y-auto">
          {sections.map((s) => (
            <label
              key={s.id}
              className="flex items-center gap-2 py-1 px-1 rounded hover:bg-white/5 cursor-pointer"
            >
              <Checkbox checked={selectedIds.has(s.id)} onChange={() => toggleSection(s.id)} />
              <span className="text-xs flex-1">{s.title}</span>
              <span className="text-[10px] text-muted-foreground">{s.template}</span>
            </label>
          ))}
        </div>
      )}

      <div className="flex justify-between text-xs text-muted-foreground">
        <span>
          Stays in &ldquo;{workspace.title}&rdquo;: {sections.length - selectedIds.size}
        </span>
        <span>Moves to new: {selectedIds.size}</span>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium" htmlFor="split-title">
          New workspace title
        </label>
        <Input
          id="split-title"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Title for new workspace"
          className="text-sm"
        />
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSplit} disabled={!canSplit || loading}>
          {loading ? (
            <>
              <Loader2 size={14} className="mr-1.5 animate-spin" />
              Splitting...
            </>
          ) : (
            'Split'
          )}
        </Button>
      </div>
    </div>
  );
}
