'use client';

import { Badge } from '@repo/ui/badge';
import { Button } from '@repo/ui/button';
import { Card, CardContent } from '@repo/ui/card';
import { Loader2, Sparkles, X } from 'lucide-react';
import { useCallback, useState } from 'react';

interface Suggestion {
  type: 'reorder' | 'merge' | 'split' | 'rename';
  description: string;
  sectionIds: number[];
  newOrder?: number[];
  newTitle?: string;
  splitAt?: number;
}

interface OrganiseDialogProps {
  workspaceId: number;
  onClose: () => void;
}

const TYPE_LABELS: Record<string, { label: string; className: string }> = {
  reorder: { label: 'Reorder', className: 'bg-blue-500/10 text-blue-400' },
  merge: { label: 'Merge', className: 'bg-purple-500/10 text-purple-400' },
  split: { label: 'Split', className: 'bg-yellow-500/10 text-yellow-400' },
  rename: { label: 'Rename', className: 'bg-green-500/10 text-green-400' },
};

export function OrganiseDialog({ workspaceId, onClose }: OrganiseDialogProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const analyse = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/organise`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to analyse');
        return;
      }

      const data = await res.json();
      setSuggestions(data.suggestions ?? []);
    } catch {
      setError('Failed to connect');
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="organise-dialog-title"
    >
      <Card className="w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto scrollbar-thin">
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles size={16} />
              <h3 id="organise-dialog-title" className="text-sm font-semibold">
                Auto-Organise
              </h3>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0">
              <X size={14} />
            </Button>
          </div>

          {suggestions === null && !loading && (
            <div className="text-center py-6">
              <p className="text-xs text-muted-foreground mb-3">
                AI will analyse your sections and suggest reordering, merging, splitting, or
                renaming to improve organisation.
              </p>
              <Button size="sm" onClick={analyse}>
                <Sparkles size={14} className="mr-1.5" />
                Analyse Organisation
              </Button>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin text-muted-foreground" />
              <span className="ml-2 text-xs text-muted-foreground">Analysing...</span>
            </div>
          )}

          {suggestions !== null && suggestions.length === 0 && (
            <div className="text-center py-6">
              <p className="text-xs text-green-400">Your workspace is well-organised!</p>
            </div>
          )}

          {suggestions && suggestions.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {suggestions.length} suggestion{suggestions.length !== 1 ? 's' : ''}. Use the
                merge/split/reorder tools to apply changes.
              </p>
              {suggestions.map((s, i) => {
                const typeInfo = TYPE_LABELS[s.type] ?? TYPE_LABELS.reorder!;
                const cls = typeInfo?.className ?? '';
                const lbl = typeInfo?.label ?? s.type;
                return (
                  <div key={i} className="rounded-lg border border-border p-3 space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge className={`text-[10px] px-1.5 py-0 ${cls}`}>{lbl}</Badge>
                    </div>
                    <p className="text-xs text-foreground">{s.description}</p>
                    {s.newTitle && (
                      <p className="text-[10px] text-muted-foreground">
                        Suggested title: <span className="font-medium">{s.newTitle}</span>
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
