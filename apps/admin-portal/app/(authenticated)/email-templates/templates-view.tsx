'use client';

import { Badge } from '@repo/ui/badge';
import { Button } from '@repo/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui/select';
import { toast } from '@repo/ui/sonner';
import { Check, ClipboardCopy, FileText, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useCallback, useState } from 'react';

export type EmailTemplate = {
  id: number;
  userId: number;
  name: string;
  subject: string | null;
  body: string;
  category: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

type CategoryFilter = 'all' | 'initial_outreach' | 'follow_up' | 'partnership_proposal' | 'general';

const CATEGORY_BUTTONS: { key: CategoryFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'initial_outreach', label: 'Initial Outreach' },
  { key: 'follow_up', label: 'Follow Up' },
  { key: 'partnership_proposal', label: 'Partnership' },
  { key: 'general', label: 'General' },
];

const CATEGORY_OPTIONS = CATEGORY_BUTTONS.filter((c) => c.key !== 'all');

const CATEGORY_COLORS: Record<string, string> = {
  initial_outreach: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  follow_up: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  partnership_proposal: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  general: 'bg-white/5 text-white/40 border-white/10',
};

interface TemplatesViewProps {
  initialTemplates: EmailTemplate[];
}

export function TemplatesView({ initialTemplates }: TemplatesViewProps) {
  const [templates, setTemplates] = useState<EmailTemplate[]>(initialTemplates);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: '',
    subject: '',
    body: '',
    category: 'initial_outreach',
  });
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const filtered = templates.filter((t) => {
    if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;
    return true;
  });

  // Only calls state setters (stable), so it never needs to change
  const resetForm = useCallback(() => {
    setForm({ name: '', subject: '', body: '', category: 'initial_outreach' });
    setEditingId(null);
    setShowForm(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (!form.name.trim() || !form.body.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        const res = await fetch(`/api/email-templates/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        if (res.ok) {
          const updated = await res.json();
          setTemplates((prev) => prev.map((t) => (t.id === editingId ? updated : t)));
          resetForm();
          toast.success('Template updated');
        } else toast.error('Failed to save');
      } else {
        const res = await fetch('/api/email-templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        if (res.ok) {
          const created = await res.json();
          setTemplates((prev) => [created, ...prev]);
          resetForm();
          toast.success('Template created');
        } else toast.error('Failed to create');
      }
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  }, [form, editingId, resetForm]);

  const handleEdit = (t: EmailTemplate) => {
    setForm({ name: t.name, subject: t.subject || '', body: t.body, category: t.category });
    setEditingId(t.id);
    setShowForm(true);
  };

  const handleDelete = useCallback(async (id: number) => {
    if (!confirm('Delete this template?')) return;
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    try {
      await fetch(`/api/email-templates/${id}`, { method: 'DELETE' });
      toast.success('Deleted');
    } catch {
      toast.error('Failed to delete');
    }
  }, []);

  const handleCopy = useCallback(async (t: EmailTemplate) => {
    const text = t.subject ? `Subject: ${t.subject}\n\n${t.body}` : t.body;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for non-secure contexts (e.g. HTTP in dev)
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopiedId(t.id);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  return (
    <div className="space-y-4">
      {/* Filters + Add */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1">
          {CATEGORY_BUTTONS.map(({ key, label }) => (
            <Button
              key={key}
              variant={categoryFilter === key ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setCategoryFilter(key)}
            >
              {label}
              {key !== 'all' && (
                <span className="ml-1 text-xs text-muted-foreground">
                  {templates.filter((t) => t.category === key).length}
                </span>
              )}
            </Button>
          ))}
        </div>
        <Button
          size="sm"
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
        >
          <Plus className="h-4 w-4 mr-1" /> New Template
        </Button>
      </div>

      {/* Create/Edit form */}
      {showForm && (
        <div className="rounded-lg border border-white/10 bg-card p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Name *</label>
              <input
                autoFocus
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Business Coach Intro"
                className="w-full rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-lime-500/50"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Category</label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm((p) => ({ ...p, category: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((o) => (
                    <SelectItem key={o.key} value={o.key}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Subject Line</label>
            <input
              value={form.subject}
              onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))}
              placeholder="Email subject"
              className="w-full rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-lime-500/50"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Body *</label>
            <textarea
              value={form.body}
              onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))}
              rows={8}
              placeholder="Email body..."
              className="w-full rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-lime-500/50 resize-none"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={resetForm}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || !form.name.trim() || !form.body.trim()}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : editingId ? (
                'Update'
              ) : (
                'Create'
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Template list */}
      {filtered.length > 0 ? (
        <div className="space-y-2">
          {filtered.map((t) => (
            <div key={t.id} className="rounded-lg border border-white/10 bg-card px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-sm">{t.name}</span>
                <Badge
                  variant="outline"
                  className={`text-[10px] ${CATEGORY_COLORS[t.category] || CATEGORY_COLORS.general}`}
                >
                  {t.category.replace(/_/g, ' ')}
                </Badge>
                <div className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleCopy(t)}
                    className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                    title="Copy to clipboard"
                  >
                    {copiedId === t.id ? (
                      <Check className="h-3.5 w-3.5 text-lime-400" />
                    ) : (
                      <ClipboardCopy className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEdit(t)}
                    className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                    title="Edit"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(t.id)}
                    className="p-1 text-muted-foreground hover:text-red-400 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {t.subject && (
                <p className="text-xs text-muted-foreground mb-1">Subject: {t.subject}</p>
              )}
              <p className="text-sm text-muted-foreground line-clamp-2 whitespace-pre-wrap">
                {t.body}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 py-16 text-center">
          <FileText className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-muted-foreground text-sm">
            {templates.length === 0
              ? 'No templates yet. Create your first email template.'
              : 'No matches for this filter.'}
          </p>
        </div>
      )}
    </div>
  );
}
