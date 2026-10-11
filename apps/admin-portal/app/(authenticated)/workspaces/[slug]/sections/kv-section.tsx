'use client';

import { Button } from '@repo/ui/button';
import { Input } from '@repo/ui/input';
import { Plus, Save, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { KvPairsData } from '@/lib/workspaces/types';

interface KvSectionProps {
  data: Record<string, unknown> | null;
  isEditing: boolean;
  saving: boolean;
  onEdit?: () => void;
  onSave: (
    data: { structuredData: KvPairsData; content: string },
    changeDescription?: string
  ) => Promise<void>;
}

function toKvData(data: Record<string, unknown> | null): KvPairsData {
  if (!data || !Array.isArray((data as KvPairsData).pairs)) {
    return { pairs: [] };
  }
  return data as KvPairsData;
}

function kvToMarkdown(kv: KvPairsData): string {
  return kv.pairs.map((p) => `**${p.key}:** ${p.value}`).join('\n\n');
}

export function KvSection({ data, isEditing, saving, onEdit, onSave }: KvSectionProps) {
  const parsed = toKvData(data);
  const [draft, setDraft] = useState<KvPairsData>(parsed);

  const updatePair = (index: number, field: 'key' | 'value', value: string) => {
    setDraft((prev) => ({
      pairs: prev.pairs.map((pair, i) => (i === index ? { ...pair, [field]: value } : pair)),
    }));
  };

  const addPair = () => {
    setDraft((prev) => ({
      pairs: [...prev.pairs, { key: '', value: '' }],
    }));
  };

  const removePair = (index: number) => {
    setDraft((prev) => ({
      pairs: prev.pairs.filter((_, i) => i !== index),
    }));
  };

  if (!isEditing) {
    if (parsed.pairs.length === 0) {
      return (
        <p
          className="text-sm text-muted-foreground italic cursor-pointer hover:text-muted-foreground/80"
          onDoubleClick={onEdit}
        >
          No data yet. Double-click or click Edit to add key-value pairs.
        </p>
      );
    }
    return (
      <dl className="space-y-3">
        {parsed.pairs.map((pair, i) => (
          <div key={i} className="flex items-baseline gap-3">
            <dt className="text-sm font-medium text-muted-foreground min-w-[160px] shrink-0">
              {pair.key}
            </dt>
            <dd className="text-sm text-foreground">{pair.value}</dd>
          </div>
        ))}
      </dl>
    );
  }

  return (
    <div className="space-y-2">
      {draft.pairs.map((pair, i) => (
        <div key={i} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <Input
            value={pair.key}
            onChange={(e) => updatePair(i, 'key', e.target.value)}
            placeholder="Key"
            className="w-full sm:w-[180px] h-8 text-sm"
          />
          <Input
            value={pair.value}
            onChange={(e) => updatePair(i, 'value', e.target.value)}
            placeholder="Value"
            className="flex-1 h-8 text-sm"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => removePair(i)}
            className="h-8 w-8 p-0 text-muted-foreground hover:text-red-400"
          >
            <Trash2 size={14} />
          </Button>
        </div>
      ))}
      <div className="flex items-center justify-between pt-1">
        <Button variant="outline" size="sm" onClick={addPair}>
          <Plus size={14} className="mr-1.5" />
          Add Pair
        </Button>
        <Button
          size="sm"
          disabled={saving || JSON.stringify(draft) === JSON.stringify(parsed)}
          onClick={() =>
            onSave({
              structuredData: draft,
              content: kvToMarkdown(draft),
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
