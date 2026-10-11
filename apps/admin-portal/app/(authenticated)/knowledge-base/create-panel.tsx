'use client';

import { Button } from '@repo/ui/button';
import { Card, CardContent } from '@repo/ui/card';
import { Input } from '@repo/ui/input';
import { toast } from '@repo/ui/sonner';
import { Textarea } from '@repo/ui/textarea';
import { useState } from 'react';
import type { KnowledgeBaseWithStats } from '@/lib/types';
import { useKnowledgeBaseStore } from './store';

const COLOR_PRESETS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
];

interface CreatePanelProps {
  onCreated: (kb: KnowledgeBaseWithStats) => void;
}

export function CreatePanel({ onCreated }: CreatePanelProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(COLOR_PRESETS[5]);
  const [saving, setSaving] = useState(false);
  const toggleCreate = useKnowledgeBaseStore((s) => s.toggleCreate);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    try {
      const res = await fetch('/api/knowledge-bases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || null, color }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create');
      }

      const kb: KnowledgeBaseWithStats = await res.json();
      onCreated(kb);
      toggleCreate();
      toast.success(`${kb.name} created`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create knowledge base');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              placeholder="Knowledge base name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <Textarea
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={1}
              className="resize-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Colour:</span>
            {COLOR_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                className={`h-6 w-6 rounded-full transition-all ${
                  color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-background' : ''
                }`}
                style={{ backgroundColor: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={!name.trim() || saving}>
              {saving ? 'Creating...' : 'Create'}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={toggleCreate}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
