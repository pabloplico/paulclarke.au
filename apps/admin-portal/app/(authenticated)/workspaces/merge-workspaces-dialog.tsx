'use client';

import { Button } from '@repo/ui/button';
import { Input } from '@repo/ui/input';
import { Loader2, X } from 'lucide-react';
import { useState } from 'react';
import type { WorkspaceWithCounts } from '@/lib/workspaces/types';

interface MergeWorkspacesDialogProps {
  workspaces: WorkspaceWithCounts[];
  onClose: () => void;
  onMerged: () => void;
}

export function MergeWorkspacesDialog({
  workspaces,
  onClose,
  onMerged,
}: MergeWorkspacesDialogProps) {
  const defaultTitle = workspaces.map((w) => w.title).join(' + ');
  const [title, setTitle] = useState(defaultTitle);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalSections = workspaces.reduce((acc, w) => acc + w.sectionCount, 0);

  const handleMerge = async () => {
    if (!title.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/workspaces/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceIds: workspaces.map((w) => w.id),
          title: title.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to merge');
        return;
      }

      onMerged();
    } catch {
      setError('Failed to merge workspaces');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-popover p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold">Merge {workspaces.length} Workspaces</h4>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-6 w-6 p-0 text-muted-foreground"
        >
          <X size={12} />
        </Button>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          This will combine all sections from the selected workspaces into a single new workspace.
          The original workspaces will be removed.
        </p>
        <div className="space-y-1 rounded border border-border p-2 max-h-[60vh] overflow-y-auto">
          {workspaces.map((ws) => (
            <div key={ws.id} className="flex items-center justify-between text-xs">
              <span>{ws.title}</span>
              <span className="text-muted-foreground">
                {ws.sectionCount} {ws.sectionCount === 1 ? 'section' : 'sections'}
              </span>
            </div>
          ))}
          <div className="border-t border-border pt-1 mt-1 flex justify-between text-xs font-medium">
            <span>Total</span>
            <span>{totalSections} sections</span>
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium" htmlFor="merge-title">
          Merged workspace title
        </label>
        <Input
          id="merge-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New workspace title"
          className="text-sm"
        />
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleMerge} disabled={loading || !title.trim()}>
          {loading ? (
            <>
              <Loader2 size={14} className="mr-1.5 animate-spin" />
              Merging...
            </>
          ) : (
            'Merge'
          )}
        </Button>
      </div>
    </div>
  );
}
