'use client';

import { Badge } from '@repo/ui/badge';
import { Button } from '@repo/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui/select';
import { AlertTriangle, ArrowRight, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import type { AllSectionItem, SectionDependency, SectionDependent } from '@/lib/workspaces/types';

interface DependenciesDialogProps {
  sectionId: number;
  sectionTitle: string;
  dependencies: SectionDependency[];
  dependents: SectionDependent[];
  allSections: AllSectionItem[];
  onAdd: (body: {
    dependsOnSectionId: number;
    relationType: string;
    description?: string;
  }) => Promise<void>;
  onRemove: (depId: number) => Promise<void>;
  onClose: () => void;
}

const RELATION_TYPES = [
  { value: 'derived_from', label: 'Derived from' },
  { value: 'summarizes', label: 'Summarizes' },
  { value: 'requires', label: 'Requires' },
  { value: 'references', label: 'References' },
];

const RELATION_BADGE_CLASSES: Record<string, string> = {
  derived_from: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  summarizes: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  requires: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  references: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
};

export function DependenciesDialog({
  sectionId,
  sectionTitle,
  dependencies,
  dependents,
  allSections,
  onAdd,
  onRemove,
  onClose,
}: DependenciesDialogProps) {
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(null);
  const [relationType, setRelationType] = useState('references');
  const [description, setDescription] = useState('');
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Filter out self and already-depended-on sections
  const existingDepIds = new Set(dependencies.map((d) => d.dependsOnSectionId));
  const filteredSections = allSections.filter((s) => {
    if (s.id === sectionId) return false;
    if (existingDepIds.has(s.id)) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return s.title.toLowerCase().includes(q) || s.workspaceTitle.toLowerCase().includes(q);
  });

  const handleAdd = async () => {
    if (!selectedSectionId) return;
    setAdding(true);
    setError(null);
    try {
      await onAdd({
        dependsOnSectionId: selectedSectionId,
        relationType,
        description: description.trim() || undefined,
      });
      setSelectedSectionId(null);
      setDescription('');
      setSearchQuery('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add dependency');
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (depId: number) => {
    setRemoving(depId);
    try {
      await onRemove(depId);
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-popover p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold">Dependencies</h4>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-6 w-6 p-0 text-muted-foreground"
        >
          <X size={12} />
        </Button>
      </div>

      {/* Add dependency form */}
      <div className="space-y-2 rounded-lg border border-border p-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Add dependency
        </p>
        <input
          type="text"
          placeholder="Search sections..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setSelectedSectionId(null);
          }}
          className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
        {(searchQuery || selectedSectionId) && (
          <div className="max-h-40 overflow-y-auto scrollbar-thin rounded border border-border">
            {filteredSections.length === 0 ? (
              <p className="p-2 text-xs text-muted-foreground">No matching sections</p>
            ) : (
              filteredSections.slice(0, 20).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setSelectedSectionId(s.id);
                    setSearchQuery(`${s.workspaceTitle} / ${s.title}`);
                  }}
                  className={`w-full text-left px-2 py-1.5 text-sm hover:bg-muted/50 ${
                    selectedSectionId === s.id ? 'bg-muted/50' : ''
                  }`}
                >
                  <span className="text-muted-foreground">{s.workspaceTitle}</span>
                  <span className="mx-1 text-muted-foreground">/</span>
                  <span>{s.title}</span>
                </button>
              ))
            )}
          </div>
        )}
        <div className="flex items-center gap-2">
          <Select value={relationType} onValueChange={setRelationType}>
            <SelectTrigger className="w-auto min-w-[140px] h-8 px-2 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RELATION_TYPES.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input
            type="text"
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="flex-1 rounded border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <Button
            size="sm"
            onClick={handleAdd}
            disabled={!selectedSectionId || adding}
            className="h-8 px-3 text-xs"
          >
            <Plus size={12} className="mr-1" />
            Add
          </Button>
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>

      {/* Depends on list */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Depends on ({dependencies.length})
        </p>
        {dependencies.length === 0 ? (
          <p className="text-sm text-muted-foreground">No dependencies</p>
        ) : (
          <div className="space-y-1">
            {dependencies.map((dep) => (
              <div
                key={dep.id}
                className="flex items-center justify-between rounded border border-border px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Badge
                    variant="secondary"
                    className={`text-[10px] px-1.5 py-0 shrink-0 ${
                      RELATION_BADGE_CLASSES[dep.relationType] ?? ''
                    }`}
                  >
                    {dep.relationType.replace('_', ' ')}
                  </Badge>
                  <span className="text-sm text-muted-foreground truncate">
                    {dep.dependsOnWorkspaceTitle}
                  </span>
                  <ArrowRight size={12} className="text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium truncate">{dep.dependsOnSectionTitle}</span>
                  {dep.isStale && (
                    <Badge className="text-[10px] px-1.5 py-0 bg-yellow-500/10 text-yellow-400 border-yellow-500/20 shrink-0">
                      <AlertTriangle size={10} className="mr-0.5" />
                      stale
                    </Badge>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemove(dep.id)}
                  disabled={removing === dep.id}
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive shrink-0"
                >
                  <Trash2 size={12} />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Depended on by list */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Depended on by ({dependents.length})
        </p>
        {dependents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sections depend on this one</p>
        ) : (
          <div className="space-y-1">
            {dependents.map((dep) => (
              <div
                key={dep.id}
                className="flex items-center gap-2 rounded border border-border px-3 py-2"
              >
                <Badge
                  variant="secondary"
                  className={`text-[10px] px-1.5 py-0 shrink-0 ${
                    RELATION_BADGE_CLASSES[dep.relationType] ?? ''
                  }`}
                >
                  {dep.relationType.replace('_', ' ')}
                </Badge>
                <span className="text-sm text-muted-foreground truncate">{dep.workspaceTitle}</span>
                <ArrowRight size={12} className="text-muted-foreground shrink-0" />
                <span className="text-sm font-medium truncate">{dep.sectionTitle}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
