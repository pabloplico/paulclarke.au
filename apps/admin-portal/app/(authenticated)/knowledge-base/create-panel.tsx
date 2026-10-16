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
  { value: '#ef4444', name: 'Red' },
  { value: '#f97316', name: 'Orange' },
  { value: '#eab308', name: 'Yellow' },
  { value: '#22c55e', name: 'Green' },
  { value: '#06b6d4', name: 'Cyan' },
  { value: '#3b82f6', name: 'Blue' },
  { value: '#8b5cf6', name: 'Violet' },
  { value: '#ec4899', name: 'Pink' },
] as const;

interface CreatePanelProps {
  onCreated: (kb: KnowledgeBaseWithStats) => void;
}

export function CreatePanel({ onCreated }: CreatePanelProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState<string>(COLOR_PRESETS[5].value);
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
                key={c.value}
                type="button"
                aria-label={c.name}
                aria-pressed={color === c.value}
                className={`h-6 w-6 rounded-full transition-all ${
                  color === c.value ? 'ring-2 ring-white ring-offset-2 ring-offset-background' : ''
                }`}
                style={{ backgroundColor: c.value }}
                onClick={() => setColor(c.value)}
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
