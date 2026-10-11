'use client';

import { Badge } from '@repo/ui/badge';
import { Button } from '@repo/ui/button';
import { Input } from '@repo/ui/input';
import { FileText, Heading, LayoutGrid, List, Table2, X } from 'lucide-react';
import { useState } from 'react';
import type { SectionTemplate } from '@/lib/workspaces/types';

const TEMPLATES: {
  value: SectionTemplate;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}[] = [
  { value: 'heading', label: 'Heading', icon: Heading },
  { value: 'prose', label: 'Prose', icon: FileText },
  { value: 'cards', label: 'Cards', icon: LayoutGrid },
  { value: 'table', label: 'Table', icon: Table2 },
  { value: 'checklist', label: 'Checklist', icon: List },
  { value: 'kv-pairs', label: 'Key-Value', icon: List },
];

interface AddSectionDialogProps {
  onAdd: (data: {
    title: string;
    slug: string;
    template: SectionTemplate;
    description?: string;
    parentSectionId?: number | null;
  }) => Promise<void>;
  onClose: () => void;
  parentSectionId?: number | null;
  parentTitle?: string;
}

export function AddSectionDialog({
  onAdd,
  onClose,
  parentSectionId,
  parentTitle,
}: AddSectionDialogProps) {
  const [title, setTitle] = useState('');
  const [template, setTemplate] = useState<SectionTemplate>('prose');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const handleSubmit = async () => {
    if (!title.trim() || !slug) return;
    setSaving(true);
    try {
      await onAdd({
        title: title.trim(),
        slug,
        template,
        description: description.trim() || undefined,
        parentSectionId: parentSectionId ?? null,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-popover p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-xs font-semibold">
            {parentTitle ? 'Add Child Section' : 'Add Section'}
          </h4>
          {parentTitle && (
            <p className="text-xs text-muted-foreground mt-0.5">Under: {parentTitle}</p>
          )}
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

      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Title</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Project Timeline"
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            autoFocus
          />
          {slug && (
            <p className="text-[11px] text-muted-foreground mt-1">
              Slug: <code className="text-foreground/70">{slug}</code>
            </p>
          )}
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Template</label>
          <div className="flex flex-wrap gap-1.5">
            {TEMPLATES.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setTemplate(value)}
                className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors ${
                  template === value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
                }`}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            Description{' '}
            <Badge variant="secondary" className="text-[9px] px-1 py-0 ml-1">
              optional
            </Badge>
          </label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description of this section"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSubmit} disabled={!title.trim() || saving}>
          {saving ? 'Adding...' : 'Add Section'}
        </Button>
      </div>
    </div>
  );
}
