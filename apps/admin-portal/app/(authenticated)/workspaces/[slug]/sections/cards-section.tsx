'use client';

import { Badge } from '@repo/ui/badge';
import { Button } from '@repo/ui/button';
import { Card, CardContent } from '@repo/ui/card';
import { Input } from '@repo/ui/input';
import { Plus, Save, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { CardsData } from '@/lib/workspaces/types';

interface CardsSectionProps {
  data: Record<string, unknown> | null;
  isEditing: boolean;
  saving: boolean;
  onEdit?: () => void;
  onSave: (
    data: { structuredData: CardsData; content: string },
    changeDescription?: string
  ) => Promise<void>;
}

function toCardsData(data: Record<string, unknown> | null): CardsData {
  if (!data || !Array.isArray((data as CardsData).items)) {
    return { items: [] };
  }
  return data as CardsData;
}

function cardsToMarkdown(cards: CardsData): string {
  return cards.items
    .map((item) => {
      const tags = item.tags?.length ? `\n_Tags: ${item.tags.join(', ')}_` : '';
      return `### ${item.title}\n\n${item.body}${tags}`;
    })
    .join('\n\n---\n\n');
}

export function CardsSection({ data, isEditing, saving, onEdit, onSave }: CardsSectionProps) {
  const parsed = toCardsData(data);
  const [draft, setDraft] = useState<CardsData>(parsed);

  const updateItem = (index: number, field: string, value: string | string[]) => {
    setDraft((prev) => ({
      items: prev.items.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    }));
  };

  const addItem = () => {
    setDraft((prev) => ({
      items: [...prev.items, { title: '', body: '', tags: [] }],
    }));
  };

  const removeItem = (index: number) => {
    setDraft((prev) => ({
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  if (!isEditing) {
    if (parsed.items.length === 0) {
      return (
        <p
          className="text-sm text-muted-foreground italic cursor-pointer hover:text-muted-foreground/80"
          onDoubleClick={onEdit}
        >
          No cards yet. Double-click or click Edit to add cards.
        </p>
      );
    }
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {parsed.items.map((item, i) => (
          <Card key={`${item.title}-${i}`} className="bg-white/[0.02]">
            <CardContent className="pt-4 space-y-2">
              <h4 className="font-medium text-sm">{item.title}</h4>
              <p className="text-xs text-muted-foreground">{item.body}</p>
              {item.tags && item.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {item.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {draft.items.map((item, i) => (
        <div key={i} className="rounded-lg border border-border p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Input
              value={item.title}
              onChange={(e) => updateItem(i, 'title', e.target.value)}
              placeholder="Card title"
              className="flex-1 h-8 text-sm"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => removeItem(i)}
              className="h-8 w-8 p-0 text-muted-foreground hover:text-red-400"
            >
              <Trash2 size={14} />
            </Button>
          </div>
          <textarea
            value={item.body}
            onChange={(e) => updateItem(i, 'body', e.target.value)}
            placeholder="Card body"
            className="w-full rounded-md border border-border bg-white/5 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-y min-h-[60px]"
          />
          <Input
            value={item.tags?.join(', ') ?? ''}
            onChange={(e) =>
              updateItem(
                i,
                'tags',
                e.target.value
                  .split(',')
                  .map((t) => t.trim())
                  .filter(Boolean) as string[]
              )
            }
            placeholder="Tags (comma-separated)"
            className="h-8 text-sm"
          />
        </div>
      ))}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={addItem}>
          <Plus size={14} className="mr-1.5" />
          Add Card
        </Button>
        <Button
          size="sm"
          disabled={saving || JSON.stringify(draft) === JSON.stringify(parsed)}
          onClick={() =>
            onSave({
              structuredData: draft,
              content: cardsToMarkdown(draft),
            })
          }
        >
          <Save size={14} className="mr-1.5" />
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
