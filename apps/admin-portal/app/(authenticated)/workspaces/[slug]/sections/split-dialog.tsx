'use client';

import { Button } from '@repo/ui/button';
import { Input } from '@repo/ui/input';
import { Loader2, Scissors, X } from 'lucide-react';
import { useState } from 'react';
import type { SectionWithContent } from '@/lib/workspaces/types';

interface SplitDialogProps {
  section: SectionWithContent;
  workspaceId: number;
  onClose: () => void;
  onSplit: () => void;
}

export function SplitDialog({ section, workspaceId, onClose, onSplit }: SplitDialogProps) {
  const content = section.latestVersion?.content ?? '';
  const lines = content.split('\n');
  const [splitAt, setSplitAt] = useState<number | null>(null);
  const [secondTitle, setSecondTitle] = useState(`${section.title} (continued)`);
  const [splitting, setSplitting] = useState(false);
  const [error, setError] = useState('');
  const [previewExpanded, setPreviewExpanded] = useState(false);

  const handleSplit = async () => {
    if (splitAt === null || splitAt < 1) return;
    setSplitting(true);
    setError('');

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/sections/${section.id}/split`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ splitAt, secondTitle: secondTitle.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to split');
        return;
      }

      onSplit();
    } finally {
      setSplitting(false);
    }
  };

  const firstHalf = splitAt !== null ? lines.slice(0, splitAt).join('\n') : '';
  const secondHalf = splitAt !== null ? lines.slice(splitAt).join('\n') : '';

  return (
    <div className="rounded-lg border border-border bg-popover p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold">Split Section</h4>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-6 w-6 p-0 text-muted-foreground"
        >
          <X size={12} />
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Click a line to set the split point. Everything above stays in the original section.
      </p>

      <div className="rounded-md border border-border max-h-48 overflow-y-auto scrollbar-thin">
        {lines.map((line, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setSplitAt(i + 1)}
            className={`w-full text-left px-3 py-0.5 text-xs font-mono border-b border-border/30 last:border-0 hover:bg-white/5 transition-colors ${
              splitAt !== null && i + 1 === splitAt ? 'bg-primary/10 border-primary/30' : ''
            } ${splitAt !== null && i + 1 < splitAt ? 'text-foreground' : ''} ${
              splitAt !== null && i + 1 >= splitAt ? 'text-muted-foreground/60' : ''
            }`}
          >
            <span className="inline-block w-8 text-muted-foreground/30 text-right mr-2 select-none">
              {i + 1}
            </span>
            {line || '\u00A0'}
          </button>
        ))}
      </div>

      {splitAt !== null && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] font-medium text-muted-foreground mb-1">
                First half ({splitAt} lines)
              </p>
              <pre
                className={`text-[10px] text-muted-foreground/70 ${previewExpanded ? 'max-h-60' : 'max-h-20'} overflow-y-auto scrollbar-thin rounded border border-border/50 p-2 whitespace-pre-wrap`}
              >
                {previewExpanded ? firstHalf : firstHalf.slice(0, 300)}
                {!previewExpanded && firstHalf.length > 300 ? '...' : ''}
              </pre>
            </div>
            <div>
              <p className="text-[10px] font-medium text-muted-foreground mb-1">
                Second half ({lines.length - splitAt} lines)
              </p>
              <pre
                className={`text-[10px] text-muted-foreground/70 ${previewExpanded ? 'max-h-60' : 'max-h-20'} overflow-y-auto scrollbar-thin rounded border border-border/50 p-2 whitespace-pre-wrap`}
              >
                {previewExpanded ? secondHalf : secondHalf.slice(0, 300)}
                {!previewExpanded && secondHalf.length > 300 ? '...' : ''}
              </pre>
            </div>
          </div>
          {(firstHalf.length > 300 || secondHalf.length > 300) && (
            <button
              type="button"
              onClick={() => setPreviewExpanded(!previewExpanded)}
              className="text-[10px] text-muted-foreground/70 hover:text-foreground"
            >
              {previewExpanded ? 'Show less' : 'Show full preview'}
            </button>
          )}

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Title for second section
            </label>
            <Input value={secondTitle} onChange={(e) => setSecondTitle(e.target.value)} />
          </div>
        </>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="sm"
          className="h-7 text-xs"
          onClick={handleSplit}
          disabled={splitting || splitAt === null}
        >
          {splitting ? (
            <Loader2 size={12} className="mr-1 animate-spin" />
          ) : (
            <Scissors size={12} className="mr-1" />
          )}
          Split
        </Button>
      </div>
    </div>
  );
}
