'use client';

import { Button } from '@repo/ui/button';
import { Input } from '@repo/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui/select';
import {
  BarChart3,
  BookOpen,
  Briefcase,
  Building2,
  ClipboardList,
  Loader2,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { WORKSPACE_TEMPLATES, type WorkspaceTemplate } from '@/lib/workspaces/templates';

const SECTION_TYPES = ['prose', 'cards', 'table', 'checklist', 'kv-pairs'] as const;

interface CustomSection {
  title: string;
  template: (typeof SECTION_TYPES)[number];
}

const TEMPLATE_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  briefcase: Briefcase,
  'building-2': Building2,
  'book-open': BookOpen,
  'clipboard-list': ClipboardList,
  'bar-chart-3': BarChart3,
};

interface NewWorkspaceDialogProps {
  onClose: () => void;
  categories?: string[];
}

export function NewWorkspaceDialog({ onClose, categories = [] }: NewWorkspaceDialogProps) {
  const router = useRouter();
  const [step, setStep] = useState<'template' | 'details'>('template');
  const [selectedTemplate, setSelectedTemplate] = useState<WorkspaceTemplate | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [creating, setCreating] = useState(false);
  const [customSections, setCustomSections] = useState<CustomSection[]>([]);
  const isCustom = selectedTemplate?.id === 'custom';
  const isResearch = selectedTemplate?.id === 'market-research';

  // Market research fields
  const [marketType, setMarketType] = useState<'b2b' | 'b2c' | 'both'>('both');
  const [industry, setIndustry] = useState('');
  const [geoCountry, setGeoCountry] = useState('');

  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const handleSelectTemplate = (template: WorkspaceTemplate) => {
    setSelectedTemplate(template);
    setStep('details');
  };

  const handleCreate = useCallback(async () => {
    if (!title.trim() || !slug) return;
    setCreating(true);

    try {
      const res = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          slug,
          description: description.trim() || null,
          templateId: selectedTemplate?.id,
          icon: selectedTemplate?.icon,
          category: isResearch ? 'research' : category.trim() || null,
          customSections: isCustom ? customSections : undefined,
          metadata: isResearch
            ? {
                marketType,
                industry: industry.trim() || null,
                geo: geoCountry.trim() ? { country: geoCountry.trim() } : {},
              }
            : undefined,
        }),
      });

      if (res.ok) {
        const workspace = await res.json();
        router.push(`/workspaces/${workspace.slug}`);
        router.refresh();
        onClose();
      }
    } finally {
      setCreating(false);
    }
  }, [
    title,
    slug,
    description,
    selectedTemplate,
    isCustom,
    customSections,
    router,
    onClose,
    category,
    isResearch,
    marketType,
    industry,
    geoCountry,
  ]);

  return (
    <div className="rounded-lg border border-border bg-popover p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold">
          {step === 'template' ? 'Choose a Template' : 'Workspace Details'}
        </h4>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-6 w-6 p-0 text-muted-foreground"
        >
          <X size={12} />
        </Button>
      </div>

      {step === 'template' && (
        <div className="space-y-1">
          {WORKSPACE_TEMPLATES.map((template) => {
            const Icon = TEMPLATE_ICONS[template.icon] ?? ClipboardList;
            return (
              <button
                key={template.id}
                type="button"
                onClick={() => handleSelectTemplate(template)}
                className="flex w-full items-center gap-3 rounded-md border border-transparent px-2 py-2 text-left hover:border-border hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/5">
                  <Icon size={14} className="text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-medium">{template.name}</span>
                  <span className="text-[10px] text-muted-foreground ml-2">
                    {template.description}
                  </span>
                </div>
                <span className="shrink-0 text-[10px] text-muted-foreground/50">
                  {template.id === 'custom' ? 'Custom' : `${template.sections.length}s`}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {step === 'details' && (
        <div className="space-y-3">
          {selectedTemplate && (
            <button
              type="button"
              onClick={() => setStep('template')}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Change template ({selectedTemplate.name})
            </button>
          )}

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Title</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="My Workspace"
              autoFocus
            />
            {slug && (
              <p className="text-[10px] text-muted-foreground/50">URL: /workspaces/{slug}</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Description (optional)
            </label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this workspace for?"
            />
          </div>

          {!isResearch && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Category (optional)
              </label>
              <Input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. Clients, Internal, Research"
                list="workspace-categories"
              />
              {categories.length > 0 && (
                <datalist id="workspace-categories">
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              )}
            </div>
          )}

          {isResearch && (
            <div className="space-y-3 rounded-lg border border-border p-3">
              <p className="text-xs font-medium text-muted-foreground">Research Configuration</p>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Market Type</label>
                <Select
                  value={marketType}
                  onValueChange={(v) => setMarketType(v as 'b2b' | 'b2c' | 'both')}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="b2b">B2B</SelectItem>
                    <SelectItem value="b2c">B2C</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Industry</label>
                <Input
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  placeholder="e.g. Technology, Healthcare, Finance"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Geographic Focus</label>
                <Input
                  value={geoCountry}
                  onChange={(e) => setGeoCountry(e.target.value)}
                  placeholder="e.g. Australia, United States"
                  className="h-8 text-xs"
                />
              </div>
            </div>
          )}

          {isCustom ? (
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Sections</label>
              {customSections.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={s.title}
                    onChange={(e) => {
                      const next = [...customSections];
                      next[i] = { ...next[i]!, title: e.target.value };
                      setCustomSections(next);
                    }}
                    placeholder="Section title"
                    className="flex-1 h-8 text-xs"
                  />
                  <Select
                    value={s.template}
                    onValueChange={(v) => {
                      const next = [...customSections];
                      next[i] = {
                        ...next[i]!,
                        template: v as CustomSection['template'],
                      };
                      setCustomSections(next);
                    }}
                  >
                    <SelectTrigger className="h-8 w-auto min-w-[100px] px-2 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SECTION_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => setCustomSections(customSections.filter((_, j) => j !== i))}
                  >
                    <Trash2 size={12} />
                  </Button>
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground"
                onClick={() =>
                  setCustomSections([...customSections, { title: '', template: 'prose' }])
                }
              >
                <Plus size={12} className="mr-1" />
                Add section
              </Button>
            </div>
          ) : (
            selectedTemplate &&
            selectedTemplate.sections.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Sections</label>
                <div className="space-y-1">
                  {selectedTemplate.sections.map((s) => (
                    <div
                      key={s.slug}
                      className="flex items-center gap-2 text-xs text-muted-foreground"
                    >
                      <span className="h-1 w-1 rounded-full bg-muted-foreground/30" />
                      <span>{s.title}</span>
                      <span className="text-muted-foreground/30">({s.template})</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreate} disabled={creating || !title.trim() || !slug}>
              {creating ? (
                <Loader2 size={14} className="mr-1.5 animate-spin" />
              ) : (
                <Plus size={14} className="mr-1.5" />
              )}
              Create Workspace
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
