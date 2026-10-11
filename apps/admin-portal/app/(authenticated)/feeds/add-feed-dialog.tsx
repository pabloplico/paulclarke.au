'use client';

import { Button } from '@repo/ui/button';
import { Input } from '@repo/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui/select';
import { Loader2, X } from 'lucide-react';
import { useEffect, useState } from 'react';

interface Workspace {
  id: number;
  title: string;
}

interface AddFeedDialogProps {
  onClose: () => void;
  onCreated: () => void;
}

export function AddFeedDialog({ onClose, onCreated }: AddFeedDialogProps) {
  const [url, setUrl] = useState('');
  const [type, setType] = useState<'rss' | 'page'>('rss');
  const [label, setLabel] = useState('');
  const [workspaceId, setWorkspaceId] = useState<number | null>(null);
  const [intervalMinutes, setIntervalMinutes] = useState(60);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/workspaces')
      .then((res) => res.json())
      .then((data) => setWorkspaces(data))
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!url.trim()) {
      setError('URL is required');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/feeds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          type,
          label: label.trim() || undefined,
          workspaceId: workspaceId || undefined,
          intervalMinutes,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to create feed');
        return;
      }

      onCreated();
    } catch {
      setError('Failed to create feed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-popover p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold">Add Feed</h4>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-6 w-6 p-0 text-muted-foreground"
        >
          <X size={12} />
        </Button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* URL */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">URL *</label>
          <Input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/feed.xml"
            required
          />
        </div>

        {/* Type */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Type</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setType('rss')}
              className={`flex-1 rounded-md border px-3 py-2 text-sm transition-colors cursor-pointer ${
                type === 'rss'
                  ? 'border-lime-400/50 bg-lime-400/10 text-foreground'
                  : 'border-border bg-transparent text-muted-foreground hover:bg-white/5'
              }`}
            >
              RSS / Atom
            </button>
            <button
              type="button"
              onClick={() => setType('page')}
              className={`flex-1 rounded-md border px-3 py-2 text-sm transition-colors cursor-pointer ${
                type === 'page'
                  ? 'border-lime-400/50 bg-lime-400/10 text-foreground'
                  : 'border-border bg-transparent text-muted-foreground hover:bg-white/5'
              }`}
            >
              Web Page
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground/60">
            {type === 'rss'
              ? 'Parses RSS/Atom XML for new entries.'
              : 'Monitors a page for content changes.'}
          </p>
        </div>

        {/* Label */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Label</label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Optional display name"
          />
        </div>

        {/* Workspace */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Route to Workspace</label>
          <Select
            value={workspaceId != null ? String(workspaceId) : 'none'}
            onValueChange={(v) => setWorkspaceId(v === 'none' ? null : Number.parseInt(v, 10))}
          >
            <SelectTrigger>
              <SelectValue placeholder="None (inbox only)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None (inbox only)</SelectItem>
              {workspaces.map((ws) => (
                <SelectItem key={ws.id} value={String(ws.id)}>
                  {ws.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Interval */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Check Interval (minutes)
          </label>
          <Input
            type="number"
            min={5}
            value={intervalMinutes}
            onChange={(e) => setIntervalMinutes(Number.parseInt(e.target.value, 10) || 60)}
          />
        </div>

        {/* Error */}
        {error && <p className="text-xs text-red-400">{error}</p>}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" size="sm" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={submitting}>
            {submitting && <Loader2 size={14} className="mr-1.5 animate-spin" />}
            Add Feed
          </Button>
        </div>
      </form>
    </div>
  );
}
