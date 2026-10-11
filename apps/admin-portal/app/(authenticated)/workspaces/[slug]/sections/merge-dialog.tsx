'use client';

import { Button } from '@repo/ui/button';
import { Checkbox } from '@repo/ui/checkbox';
import { Input } from '@repo/ui/input';
import { Loader2, Merge, X } from 'lucide-react';
import { useState } from 'react';
import type { SectionWithContent } from '@/lib/workspaces/types';

interface MergeDialogProps {
  sections: SectionWithContent[];
  workspaceId: number;
  onClose: () => void;
  onMerged: () => void;
}

export function MergeDialog({ sections, workspaceId, onClose, onMerged }: MergeDialogProps) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [title, setTitle] = useState('');
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState('');

  // Once a section is selected, filter to only show siblings (same parentSectionId)
  const firstSelectedId = [...selected][0];
  const firstSelected =
    firstSelectedId != null ? sections.find((s) => s.id === firstSelectedId) : null;
  const availableSections = firstSelected
    ? sections.filter((s) => s.parentSectionId === firstSelected.parentSectionId)
    : sections;

  const toggleSection = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleMerge = async () => {
    if (selected.size < 2 || !title.trim()) return;
    setMerging(true);
    setError('');

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/sections/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionIds: [...selected], title: title.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to merge');
        return;
      }

      onMerged();
    } finally {
      setMerging(false);
    }
  };

  // Preview merged content
  const previewSections = availableSections.filter((s) => selected.has(s.id));

  return (
    <div className="rounded-lg border border-border bg-popover p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Merge size={14} />
          <h4 className="text-xs font-semibold">Merge Sections</h4>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-6 w-6 p-0 text-muted-foreground"
        >
          <X size={12} />
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Select 2 or more sections to merge into one. Only sections at the same level can be merged.
      </p>

      <div className="space-y-1 max-h-[60vh] overflow-y-auto">
        {availableSections.map((s) => (
          <label
            key={s.id}
            className={`flex items-center gap-2 p-2 rounded-md border transition-colors cursor-pointer ${
              selected.has(s.id)
                ? 'border-foreground/30 bg-white/5'
                : 'border-border hover:border-foreground/10'
            }`}
          >
            <Checkbox checked={selected.has(s.id)} onChange={() => toggleSection(s.id)} />
            <span className="text-xs font-medium">{s.title}</span>
            <span className="text-[10px] text-muted-foreground/50">({s.template})</span>
          </label>
        ))}
      </div>

      {selected.size >= 2 && (
        <>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Merged section title
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter title for merged section"
              autoFocus
            />
          </div>

          {previewSections.length > 0 && (
            <div className="text-[10px] text-muted-foreground/60">
              Will merge: {previewSections.map((s) => s.title).join(' + ')}
            </div>
          )}
        </>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleMerge}
          disabled={merging || selected.size < 2 || !title.trim()}
        >
          {merging ? (
            <Loader2 size={14} className="mr-1.5 animate-spin" />
          ) : (
            <Merge size={14} className="mr-1.5" />
          )}
          Merge {selected.size > 0 ? `(${selected.size})` : ''}
        </Button>
      </div>
    </div>
  );
}
