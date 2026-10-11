'use client';

import { Button } from '@repo/ui/button';
import { Checkbox } from '@repo/ui/checkbox';
import { Input } from '@repo/ui/input';
import { Plus, Save, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { ChecklistData } from '@/lib/workspaces/types';

interface ChecklistSectionProps {
  data: Record<string, unknown> | null;
  isEditing: boolean;
  saving: boolean;
  onEdit?: () => void;
  onSave: (
    data: { structuredData: ChecklistData; content: string },
    changeDescription?: string
  ) => Promise<void>;
}

function toChecklistData(data: Record<string, unknown> | null): ChecklistData {
  if (!data || !Array.isArray((data as ChecklistData).items)) {
    return { items: [] };
  }
  return data as ChecklistData;
}

function checklistToMarkdown(checklist: ChecklistData): string {
  return checklist.items.map((item) => `- [${item.checked ? 'x' : ' '}] ${item.text}`).join('\n');
}

export function ChecklistSection({
  data,
  isEditing,
  saving,
  onEdit,
  onSave,
}: ChecklistSectionProps) {
  const parsed = toChecklistData(data);
  const [draft, setDraft] = useState<ChecklistData>(parsed);

  const toggleItem = (index: number) => {
    const updated = {
      items: draft.items.map((item, i) =>
        i === index ? { ...item, checked: !item.checked } : item
      ),
    };
    setDraft(updated);
    // Auto-save check toggles
    if (!isEditing) {
      onSave(
        {
          structuredData: updated,
          content: checklistToMarkdown(updated),
        },
        'Toggle checklist item'
      ).catch(() => {
        // Revert on failure
        setDraft(draft);
      });
    }
  };

  const updateItemText = (index: number, text: string) => {
    setDraft((prev) => ({
      items: prev.items.map((item, i) => (i === index ? { ...item, text } : item)),
    }));
  };

  const addItem = () => {
    setDraft((prev) => ({
      items: [...prev.items, { text: '', checked: false }],
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
          No checklist items yet. Double-click or click Edit to add items.
        </p>
      );
    }
    const completed = parsed.items.filter((i) => i.checked).length;
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          {completed} of {parsed.items.length} complete
        </p>
        <div className="space-y-1">
          {draft.items.map((item, i) => (
            <label key={i} className="flex items-center gap-2 py-1 cursor-pointer group">
              <Checkbox checked={item.checked} onChange={() => toggleItem(i)} className="h-4 w-4" />
              <span
                className={`text-sm ${item.checked ? 'line-through text-muted-foreground' : 'text-foreground/80'}`}
              >
                {item.text}
              </span>
            </label>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {draft.items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <Checkbox checked={item.checked} onChange={() => toggleItem(i)} className="h-4 w-4" />
          <Input
            value={item.text}
            onChange={(e) => updateItemText(i, e.target.value)}
            placeholder="Checklist item"
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
      ))}
      <div className="flex items-center justify-between pt-1">
        <Button variant="outline" size="sm" onClick={addItem}>
          <Plus size={14} className="mr-1.5" />
          Add Item
        </Button>
        <Button
          size="sm"
          disabled={saving || JSON.stringify(draft) === JSON.stringify(parsed)}
          onClick={() =>
            onSave({
              structuredData: draft,
              content: checklistToMarkdown(draft),
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
