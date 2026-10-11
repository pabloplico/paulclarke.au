'use client';

import { Badge } from '@repo/ui/badge';
import { Button } from '@repo/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/card';
import { Checkbox } from '@repo/ui/checkbox';
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  BookOpen,
  Briefcase,
  Building2,
  Calendar,
  CheckSquare,
  ClipboardList,
  Clock,
  DollarSign,
  Download,
  FileText,
  Layers,
  Loader2,
  Megaphone,
  Merge,
  MoreVertical,
  Paperclip,
  PencilLine,
  Plus,
  ScanSearch,
  Scissors,
  Search,
  Settings,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { GapFinding } from '@/lib/db/schema';
import type { WorkspaceWithCounts } from '@/lib/workspaces/types';
import { MergeWorkspacesDialog } from './merge-workspaces-dialog';
import { NewWorkspaceDialog } from './new-workspace-dialog';
import { OrganiseWorkspacesDialog } from './organise-workspaces-dialog';
import { SplitWorkspaceDialog } from './split-workspace-dialog';

const HEALTH_STYLES = {
  green: { label: 'Healthy', className: 'bg-green-500/10 text-green-400' },
  yellow: { label: 'Gaps', className: 'bg-yellow-500/10 text-yellow-400' },
  red: { label: 'Needs work', className: 'bg-red-500/10 text-red-400' },
} as const;

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  briefcase: Briefcase,
  users: Users,
  'clipboard-list': ClipboardList,
  'book-open': BookOpen,
  'building-2': Building2,
  'file-text': FileText,
  search: Search,
  megaphone: Megaphone,
  settings: Settings,
  'dollar-sign': DollarSign,
  calendar: Calendar,
  paperclip: Paperclip,
};

type Severity = 'high' | 'medium' | 'low';

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Manual',
  ai_edit: 'AI Edit',
  ai_ingest: 'AI Ingest',
  ai_gap_fill: 'AI Fix',
};

export interface RecentChange {
  versionId: number;
  sectionTitle: string;
  workspaceTitle: string;
  workspaceSlug: string;
  changeDescription: string | null;
  changeSource: string | null;
  createdAt: string;
}

function formatRelativeTime(date: Date | string | null): string {
  if (!date) return 'No content yet';
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

interface WorkspacesViewProps {
  workspaces: WorkspaceWithCounts[];
  archivedWorkspaces: WorkspaceWithCounts[];
  recentChanges: RecentChange[];
  categories: string[];
}

type FindingWithWorkspace = GapFinding & { workspaceTitle: string; workspaceSlug: string };

// ── Context menu for workspace cards ────────────────────────────────────────

function WorkspaceContextMenu({
  ws,
  isArchived,
  onArchive,
  onUnarchive,
  onExport,
  onDelete,
  onSplit,
  onRename,
}: {
  ws: WorkspaceWithCounts;
  isArchived: boolean;
  onArchive: (ws: WorkspaceWithCounts) => void;
  onUnarchive: (ws: WorkspaceWithCounts) => void;
  onExport: (ws: WorkspaceWithCounts) => void;
  onDelete: (ws: WorkspaceWithCounts) => void;
  onSplit: (ws: WorkspaceWithCounts) => void;
  onRename: (ws: WorkspaceWithCounts) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="p-1 rounded hover:bg-white/10 transition-colors cursor-pointer"
      >
        <MoreVertical size={14} className="text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute right-0 top-7 z-50 w-40 rounded-md border border-border bg-background shadow-lg py-1">
          {!isArchived && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
                onRename(ws);
              }}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-white/5 cursor-pointer"
            >
              <PencilLine size={12} />
              Rename
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              onExport(ws);
            }}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-white/5 cursor-pointer"
          >
            <Download size={12} />
            Export
          </button>
          {!isArchived && ws.sectionCount >= 2 && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
                onSplit(ws);
              }}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-white/5 cursor-pointer"
            >
              <Scissors size={12} />
              Split
            </button>
          )}
          {isArchived ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
                onUnarchive(ws);
              }}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-white/5 cursor-pointer"
            >
              <ArchiveRestore size={12} />
              Unarchive
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
                onArchive(ws);
              }}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-white/5 cursor-pointer"
            >
              <Archive size={12} />
              Archive
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              onDelete(ws);
            }}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 cursor-pointer"
          >
            <Trash2 size={12} />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

// ── Delete confirmation dialog ──────────────────────────────────────────────

function DeleteDialog({
  workspace,
  onConfirm,
  onCancel,
}: {
  workspace: WorkspaceWithCounts;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2">
      <p className="text-xs text-foreground">
        Delete <strong>{workspace.title}</strong>? This permanently removes all sections, versions,
        and gap reports. This action cannot be undone.
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={onConfirm}
          className="bg-red-600 hover:bg-red-700 text-white"
        >
          Delete
        </Button>
      </div>
    </div>
  );
}

// ── Main view ───────────────────────────────────────────────────────────────

export function WorkspacesView({
  workspaces: initialWorkspaces,
  archivedWorkspaces: initialArchived,
  recentChanges,
  categories: initialCategories,
}: WorkspacesViewProps) {
  const _router = useRouter();
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [analysing, setAnalysing] = useState(false);
  const [workspaces, setWorkspaces] = useState(initialWorkspaces);
  const [archivedWorkspaces, setArchivedWorkspaces] = useState(initialArchived);
  const [showArchived, setShowArchived] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WorkspaceWithCounts | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Selection mode for workspace-level operations
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [splitTarget, setSplitTarget] = useState<WorkspaceWithCounts | null>(null);
  const [showOrganiseDialog, setShowOrganiseDialog] = useState(false);
  const [renameTarget, setRenameTarget] = useState<WorkspaceWithCounts | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  const toggleSelection = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const selectedWorkspaces = workspaces.filter((ws) => selectedIds.has(ws.id));

  // Compute live categories from current workspace data
  const categories = [
    ...new Set([
      ...initialCategories,
      ...workspaces
        .map((ws) => (ws as WorkspaceWithCounts & { category?: string | null }).category)
        .filter((c): c is string => c != null && c.trim() !== ''),
    ]),
  ].sort();

  // Filter and group workspaces by category
  const filteredWorkspaces = selectedCategory
    ? workspaces.filter(
        (ws) =>
          (ws as WorkspaceWithCounts & { category?: string | null }).category === selectedCategory
      )
    : workspaces;

  const groupedWorkspaces = new Map<string, WorkspaceWithCounts[]>();
  if (!selectedCategory && categories.length > 0) {
    for (const ws of workspaces) {
      const cat =
        (ws as WorkspaceWithCounts & { category?: string | null }).category || 'Uncategorised';
      const group = groupedWorkspaces.get(cat) ?? [];
      group.push(ws);
      groupedWorkspaces.set(cat, group);
    }
    // Ensure Uncategorised is last
    if (groupedWorkspaces.has('Uncategorised')) {
      const uncategorised = groupedWorkspaces.get('Uncategorised')!;
      groupedWorkspaces.delete('Uncategorised');
      groupedWorkspaces.set('Uncategorised', uncategorised);
    }
  }
  // Aggregate all findings across workspaces
  const allFindings: FindingWithWorkspace[] = workspaces.flatMap((ws) =>
    (ws.findings ?? []).map((f) => ({
      ...f,
      workspaceTitle: ws.title,
      workspaceSlug: ws.slug,
    }))
  );

  const counts: Record<Severity, number> = {
    high: allFindings.filter((f) => f.severity === 'high').length,
    medium: allFindings.filter((f) => f.severity === 'medium').length,
    low: allFindings.filter((f) => f.severity === 'low').length,
  };

  const handleAnalyseAll = async () => {
    setAnalysing(true);
    try {
      // Run gap analysis on all workspaces in parallel
      const results = await Promise.allSettled(
        workspaces.map(async (ws) => {
          const res = await fetch(`/api/workspaces/${ws.id}/gap-analysis`, {
            method: 'POST',
          });
          if (!res.ok) return null;
          const data = await res.json();
          return { workspaceId: ws.id, findings: data.report?.findings ?? [] };
        })
      );

      // Update workspace findings with fresh results
      setWorkspaces((prev) =>
        prev.map((ws) => {
          const result = results.find(
            (r) => r.status === 'fulfilled' && r.value?.workspaceId === ws.id
          );
          if (result?.status === 'fulfilled' && result.value) {
            const findings = result.value.findings as GapFinding[];
            const hasHigh = findings.some((f) => f.severity === 'high');
            const hasMedium = findings.some((f) => f.severity === 'medium');
            const health =
              findings.length === 0
                ? ('green' as const)
                : hasHigh
                  ? ('red' as const)
                  : hasMedium
                    ? ('yellow' as const)
                    : ('green' as const);
            return { ...ws, findings, health };
          }
          return ws;
        })
      );
    } finally {
      setAnalysing(false);
    }
  };

  const handleExportAll = () => {
    window.location.href = '/api/workspaces/export';
  };

  const handleExportOne = (ws: WorkspaceWithCounts) => {
    window.open(`/api/workspaces/${ws.id}/export/pdf`, '_blank');
  };

  const handleArchive = async (ws: WorkspaceWithCounts) => {
    const res = await fetch(`/api/workspaces/${ws.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: true }),
    });
    if (res.ok) {
      setWorkspaces((prev) => prev.filter((w) => w.id !== ws.id));
      setArchivedWorkspaces((prev) => [...prev, { ...ws, archivedAt: new Date() }]);
    }
  };

  const handleUnarchive = async (ws: WorkspaceWithCounts) => {
    const res = await fetch(`/api/workspaces/${ws.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: false }),
    });
    if (res.ok) {
      setArchivedWorkspaces((prev) => prev.filter((w) => w.id !== ws.id));
      setWorkspaces((prev) => [...prev, { ...ws, archivedAt: null }]);
    }
  };

  const handleDelete = async (ws: WorkspaceWithCounts) => {
    const res = await fetch(`/api/workspaces/${ws.id}`, { method: 'DELETE' });
    if (res.ok) {
      setWorkspaces((prev) => prev.filter((w) => w.id !== ws.id));
      setArchivedWorkspaces((prev) => prev.filter((w) => w.id !== ws.id));
      setDeleteTarget(null);
    }
  };

  const handleRename = async (ws: WorkspaceWithCounts, newTitle: string) => {
    const trimmed = newTitle.trim();
    if (!trimmed || trimmed === ws.title) {
      setRenameTarget(null);
      return;
    }
    const res = await fetch(`/api/workspaces/${ws.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: trimmed }),
    });
    if (res.ok) {
      setWorkspaces((prev) => prev.map((w) => (w.id === ws.id ? { ...w, title: trimmed } : w)));
    }
    setRenameTarget(null);
  };

  const hasAnyFindings = allFindings.length > 0;
  const hasUnanalysed = workspaces.some((ws) => ws.health === null);

  const renderWorkspaceCard = (ws: WorkspaceWithCounts, isArchived: boolean) => {
    const Icon = ICON_MAP[ws.icon ?? ''] ?? Layers;
    const cardContent = (
      <Card
        className={`h-full transition-colors hover:border-foreground/20 cursor-pointer ${isArchived ? 'opacity-50' : ''}`}
      >
        <CardHeader className="flex flex-row items-start gap-3 pb-2">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/5">
            <Icon size={20} className="text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {renameTarget?.id === ws.id ? (
                <input
                  ref={renameInputRef}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => handleRename(ws, renameValue)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRename(ws, renameValue);
                    if (e.key === 'Escape') setRenameTarget(null);
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  className="text-base font-semibold bg-transparent border border-border rounded px-1.5 py-0.5 outline-none focus:border-foreground/40"
                  autoFocus
                />
              ) : (
                <CardTitle className="text-base">{ws.title}</CardTitle>
              )}
              {isArchived && (
                <Badge className="text-[9px] px-1.5 py-0 bg-white/5 text-muted-foreground">
                  Archived
                </Badge>
              )}
            </div>
            {ws.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{ws.description}</p>
            )}
          </div>
          <WorkspaceContextMenu
            ws={ws}
            isArchived={isArchived}
            onExport={handleExportOne}
            onArchive={handleArchive}
            onUnarchive={handleUnarchive}
            onDelete={setDeleteTarget}
            onSplit={setSplitTarget}
            onRename={(ws) => {
              setRenameTarget(ws);
              setRenameValue(ws.title);
            }}
          />
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>
                {ws.sectionCount} {ws.sectionCount === 1 ? 'section' : 'sections'}
              </span>
              {ws.health &&
                ws.health in HEALTH_STYLES &&
                (() => {
                  const style = HEALTH_STYLES[ws.health as keyof typeof HEALTH_STYLES];
                  return (
                    <Badge className={`text-[10px] px-1.5 py-0 ${style.className}`}>
                      {style.label}
                    </Badge>
                  );
                })()}
            </div>
            <span>{formatRelativeTime(ws.lastUpdated)}</span>
          </div>
          {ws.completeness !== null && (
            <div className="mt-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-muted-foreground">
                  {ws.completeness}% complete
                </span>
              </div>
              <div className="h-1 w-full rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-lime-400/70 transition-all duration-500"
                  style={{ width: `${ws.completeness}%` }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );

    if (isArchived) {
      return <div key={ws.id}>{cardContent}</div>;
    }

    if (selectionMode) {
      const isSelected = selectedIds.has(ws.id);
      return (
        <div
          key={ws.id}
          onClick={() => toggleSelection(ws.id)}
          onKeyDown={(e) => e.key === 'Enter' && toggleSelection(ws.id)}
          className={`relative cursor-pointer rounded-lg ${isSelected ? 'ring-2 ring-lime-400/50' : ''}`}
        >
          <div className="absolute top-3 left-3 z-10">
            <Checkbox checked={isSelected} onChange={() => toggleSelection(ws.id)} />
          </div>
          {cardContent}
        </div>
      );
    }

    return (
      <Link key={ws.id} href={`/workspaces/${ws.slug}`}>
        {cardContent}
      </Link>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" onClick={() => setShowNewDialog(true)}>
          <Plus size={14} className="mr-1.5" />
          New Workspace
        </Button>
        <Button size="sm" variant="outline" onClick={handleAnalyseAll} disabled={analysing}>
          {analysing ? (
            <Loader2 size={14} className="mr-1.5 animate-spin" />
          ) : (
            <ScanSearch size={14} className="mr-1.5" />
          )}
          {analysing ? 'Analysing...' : 'Analyse All'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowOrganiseDialog(true)}
          title="AI suggests how to reorganise your workspaces"
        >
          <Sparkles size={14} className="mr-1.5" />
          Organise
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => (selectionMode ? exitSelectionMode() : setSelectionMode(true))}
          className={selectionMode ? 'ring-1 ring-foreground/20' : ''}
        >
          <CheckSquare size={14} className="mr-1.5" />
          {selectionMode ? 'Cancel Select' : 'Select'}
        </Button>
        {selectionMode && selectedIds.size >= 2 && (
          <Button size="sm" variant="outline" onClick={() => setShowMergeDialog(true)}>
            <Merge size={14} className="mr-1.5" />
            Merge ({selectedIds.size})
          </Button>
        )}
        {selectionMode && selectedIds.size === 1 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const ws = workspaces.find((w) => selectedIds.has(w.id));
              if (ws) setSplitTarget(ws);
            }}
          >
            <Scissors size={14} className="mr-1.5" />
            Split
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={handleExportAll}>
          <Download size={14} className="mr-1.5" />
          Export All
        </Button>
        {archivedWorkspaces.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowArchived((v) => !v)}
            className={showArchived ? 'ring-1 ring-foreground/20' : ''}
          >
            <Archive size={14} className="mr-1.5" />
            {showArchived ? 'Hide Archived' : `Archived (${archivedWorkspaces.length})`}
          </Button>
        )}
      </div>

      {showNewDialog && (
        <NewWorkspaceDialog onClose={() => setShowNewDialog(false)} categories={categories} />
      )}
      {showOrganiseDialog && (
        <OrganiseWorkspacesDialog onClose={() => setShowOrganiseDialog(false)} />
      )}
      {deleteTarget && (
        <DeleteDialog
          workspace={deleteTarget}
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* Category filter tabs */}
      {categories.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          <button
            type="button"
            onClick={() => setSelectedCategory(null)}
            className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
              selectedCategory === null
                ? 'bg-white/10 text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
              className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                selectedCategory === cat
                  ? 'bg-white/10 text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Workspace cards */}
      {workspaces.length === 0 && !showArchived ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Layers size={40} className="text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No workspaces yet.</p>
          </CardContent>
        </Card>
      ) : selectedCategory || categories.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredWorkspaces.map((ws) => renderWorkspaceCard(ws, false))}
        </div>
      ) : (
        <div className="space-y-6">
          {[...groupedWorkspaces.entries()].map(([cat, items]) => (
            <div key={cat}>
              <p className="text-xs font-medium text-muted-foreground mb-2">{cat}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {items.map((ws) => renderWorkspaceCard(ws, false))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Archived workspaces */}
      {showArchived && archivedWorkspaces.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Archive size={14} className="text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">
              Archived ({archivedWorkspaces.length})
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {archivedWorkspaces.map((ws) => renderWorkspaceCard(ws, true))}
          </div>
        </div>
      )}

      {/* Recent activity */}
      {recentChanges.length > 0 && (
        <Card>
          <CardContent className="pt-4 pb-2">
            <div className="flex items-center gap-2 mb-3">
              <Clock size={14} className="text-muted-foreground" />
              <span className="text-xs font-medium">Recent Activity</span>
            </div>
            <div className="space-y-0">
              {recentChanges.slice(0, 5).map((change) => (
                <Link
                  key={change.versionId}
                  href={`/workspaces/${change.workspaceSlug}`}
                  className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0 hover:bg-white/[0.02] -mx-1 px-1 rounded transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="font-medium truncate">{change.sectionTitle}</span>
                      <span className="text-muted-foreground/50">in</span>
                      <span className="text-muted-foreground truncate">
                        {change.workspaceTitle}
                      </span>
                    </div>
                    {change.changeDescription && (
                      <p className="text-[10px] text-muted-foreground/60 truncate">
                        {change.changeDescription}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {change.changeSource && (
                      <Badge className="text-[9px] px-1 py-0 bg-white/5 text-muted-foreground">
                        {SOURCE_LABELS[change.changeSource] ?? change.changeSource}
                      </Badge>
                    )}
                    <span className="text-[10px] text-muted-foreground/50">
                      {formatRelativeTime(change.createdAt)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cross-workspace gap analysis link */}
      {(hasAnyFindings || hasUnanalysed) && (
        <Link href="/gap-analysis">
          <Card className="hover:border-foreground/20 transition-colors">
            <CardContent className="flex items-center justify-between py-3">
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} className="text-muted-foreground" />
                <span className="text-xs font-medium">
                  {allFindings.length} gap{allFindings.length !== 1 ? 's' : ''} across workspaces
                </span>
                {counts.high > 0 && (
                  <Badge className="text-[9px] px-1.5 py-0 bg-red-500/10 text-red-400">
                    {counts.high} high
                  </Badge>
                )}
                {counts.medium > 0 && (
                  <Badge className="text-[9px] px-1.5 py-0 bg-yellow-500/10 text-yellow-400">
                    {counts.medium} medium
                  </Badge>
                )}
              </div>
              <span className="text-xs text-muted-foreground">View all &rarr;</span>
            </CardContent>
          </Card>
        </Link>
      )}

      {/* Workspace-level dialogs */}
      {showMergeDialog && selectedWorkspaces.length >= 2 && (
        <MergeWorkspacesDialog
          workspaces={selectedWorkspaces}
          onClose={() => setShowMergeDialog(false)}
          onMerged={() => {
            setShowMergeDialog(false);
            exitSelectionMode();
            window.location.reload();
          }}
        />
      )}
      {splitTarget && (
        <SplitWorkspaceDialog
          workspace={splitTarget}
          onClose={() => setSplitTarget(null)}
          onSplit={() => {
            setSplitTarget(null);
            exitSelectionMode();
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}
