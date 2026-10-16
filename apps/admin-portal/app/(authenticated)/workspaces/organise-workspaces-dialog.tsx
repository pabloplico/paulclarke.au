'use client';

import { Badge } from '@repo/ui/badge';
import { Button } from '@repo/ui/button';
import { Loader2, Sparkles, X } from 'lucide-react';
import { useState } from 'react';

interface Suggestion {
  type: 'merge_workspaces' | 'split_workspace' | 'move_sections' | 'rename_workspace';
  description: string;
  workspaceIds: number[];
  sectionIds?: number[];
  newTitle?: string;
  targetWorkspaceId?: number;
}

const TYPE_LABELS: Record<string, { label: string; className: string }> = {
  merge_workspaces: { label: 'Merge', className: 'bg-purple-500/10 text-purple-400' },
  split_workspace: { label: 'Split', className: 'bg-blue-500/10 text-blue-400' },
  move_sections: { label: 'Move', className: 'bg-yellow-500/10 text-yellow-400' },
  rename_workspace: { label: 'Rename', className: 'bg-green-500/10 text-green-400' },
};

interface OrganiseWorkspacesDialogProps {
  onClose: () => void;
}

export function OrganiseWorkspacesDialog({ onClose }: OrganiseWorkspacesDialogProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyse = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/workspaces/organise', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to analyse');
        return;
      }
      const data = await res.json();
      setSuggestions(data.suggestions ?? []);
    } catch {
      setError('Failed to analyse workspaces');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-popover p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold">Auto-Organise Workspaces</h4>
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
        AI analyses your workspaces and suggests how to reorganise them for better structure.
        Suggestions are advisory only — no changes are made automatically.
      </p>

      {suggestions === null && (
        <Button size="sm" onClick={handleAnalyse} disabled={loading} className="w-full">
          {loading ? (
            <>
              <Loader2 size={14} className="mr-1.5 animate-spin" />
              Analysing workspaces...
            </>
          ) : (
            <>
              <Sparkles size={14} className="mr-1.5" />
              Analyse Organisation
            </>
          )}
        </Button>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      {suggestions !== null && suggestions.length === 0 && (
        <div className="text-center py-6">
          <p className="text-sm text-muted-foreground">
            Your workspaces are well-organised. No suggestions.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={handleAnalyse}
            disabled={loading}
            className="mt-3"
          >
            {loading ? (
              <Loader2 size={14} className="mr-1.5 animate-spin" />
            ) : (
              <Sparkles size={14} className="mr-1.5" />
            )}
            Re-analyse
          </Button>
        </div>
      )}

      {suggestions !== null && suggestions.length > 0 && (
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {suggestions.map((s, i) => {
            const typeInfo = TYPE_LABELS[s.type] ?? TYPE_LABELS.merge_workspaces!;
            return (
              <div
                key={`${s.type}-${i}`}
                className="rounded-lg border border-border p-3 space-y-1.5"
              >
                <div className="flex items-center gap-2">
                  <Badge className={`text-[10px] px-1.5 py-0 ${typeInfo.className}`}>
                    {typeInfo.label}
                  </Badge>
                  {s.newTitle && (
                    <span className="text-[10px] text-muted-foreground">&rarr; {s.newTitle}</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{s.description}</p>
              </div>
            );
          })}
          <Button
            size="sm"
            variant="outline"
            onClick={handleAnalyse}
            disabled={loading}
            className="w-full"
          >
            {loading ? (
              <Loader2 size={14} className="mr-1.5 animate-spin" />
            ) : (
              <Sparkles size={14} className="mr-1.5" />
            )}
            Re-analyse
          </Button>
        </div>
      )}
    </div>
  );
}
