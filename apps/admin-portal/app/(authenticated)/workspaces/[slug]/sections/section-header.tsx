'use client';

import { Badge } from '@repo/ui/badge';
import { Button } from '@repo/ui/button';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Clock,
  CornerLeftUp,
  FileText,
  FolderInput,
  Inbox,
  Link2,
  ListChecks,
  Loader2,
  MoreVertical,
  MoveDown,
  MoveUp,
  Pencil,
  PencilLine,
  Plus,
  RefreshCw,
  Scissors,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { GapFinding } from '@/lib/db/schema';

interface SectionHeaderProps {
  title: string;
  template: string;
  isEditing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onShowVersions: () => void;
  onDelete?: () => Promise<void>;
  onAiSelect?: () => void;
  onShowRules?: () => void;
  onShowDependencies?: () => void;
  dependencyCount?: number;
  staleDependencyCount?: number;
  gapFindings?: GapFinding[];
  workspaceId?: number;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onSplit?: () => void;
  depth?: number;
  parentTitle?: string;
  onAddChild?: () => void;
  onAddSectionAbove?: () => void;
  onAddSectionBelow?: () => void;
  onChangeTemplate?: (template: string) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onPromoteToRoot?: () => void;
  onMoveTo?: () => void;
  childCount?: number;
  previewText?: string;
  onRename?: (newTitle: string) => void;
  onDescriptionChange?: (newDescription: string) => void;
  sectionNumber?: string;
  description?: string | null;
}

const TEMPLATE_LABELS: Record<string, string> = {
  heading: 'Heading',
  prose: 'Prose',
  cards: 'Cards',
  table: 'Table',
  checklist: 'Checklist',
  'kv-pairs': 'Key-Value',
};

function GapSeverityBadge({ findings }: { findings: GapFinding[] }) {
  if (findings.length === 0) return null;

  const hasHigh = findings.some((f) => f.severity === 'high');
  const hasMedium = findings.some((f) => f.severity === 'medium');

  let className: string;
  let label: string;

  if (hasHigh) {
    className = 'bg-red-500/10 text-red-400 border-red-500/20';
    label = `${findings.length} gap${findings.length > 1 ? 's' : ''}`;
  } else if (hasMedium) {
    className = 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
    label = `${findings.length} gap${findings.length > 1 ? 's' : ''}`;
  } else {
    className = 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    label = `${findings.length} gap${findings.length > 1 ? 's' : ''}`;
  }

  return (
    <Badge className={`text-[10px] px-1.5 py-0 ${className}`}>
      <AlertTriangle size={10} className="mr-0.5" />
      {label}
    </Badge>
  );
}

function InlineFindings({
  findings,
  workspaceId,
}: {
  findings: GapFinding[];
  workspaceId?: number;
}) {
  const [sentFindings, setSentFindings] = useState<Set<number>>(new Set());
  const [sendingFinding, setSendingFinding] = useState<number | null>(null);

  const handleSendToInbox = async (findingIndex: number) => {
    if (!workspaceId) return;
    setSendingFinding(findingIndex);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/gap-analysis/create-inbox-item`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ findingIndex }),
      });
      if (res.ok) {
        setSentFindings((prev) => new Set(prev).add(findingIndex));
      }
    } finally {
      setSendingFinding(null);
    }
  };

  return (
    <div className="space-y-1 mt-2 pt-2 border-t border-border/50">
      {findings.map((f, i) => (
        <div key={`${f.sectionId}-${i}`} className="flex items-start gap-2">
          <Badge
            className={`text-[9px] px-1 py-0 shrink-0 mt-0.5 ${
              f.severity === 'high'
                ? 'bg-red-500/10 text-red-400'
                : f.severity === 'medium'
                  ? 'bg-yellow-500/10 text-yellow-400'
                  : 'bg-blue-500/10 text-blue-400'
            }`}
          >
            {f.severity}
          </Badge>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-muted-foreground">{f.issue}</p>
            <p className="text-[10px] text-muted-foreground/60 italic">{f.suggestion}</p>
          </div>
          {workspaceId && (
            <div className="shrink-0 mt-0.5">
              {sentFindings.has(i) ? (
                <Badge className="text-[9px] px-1 py-0 bg-green-500/10 text-green-400">Sent</Badge>
              ) : (
                <button
                  type="button"
                  onClick={() => handleSendToInbox(i)}
                  disabled={sendingFinding !== null}
                  className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  title="Send to inbox"
                >
                  {sendingFinding === i ? (
                    <Loader2 size={10} className="animate-spin" />
                  ) : (
                    <Inbox size={10} />
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function SectionHeader({
  title,
  template,
  isEditing,
  onEdit,
  onCancelEdit,
  onShowVersions,
  onDelete,
  onAiSelect,
  onShowRules,
  onShowDependencies,
  dependencyCount,
  staleDependencyCount,
  gapFindings,
  workspaceId,
  isCollapsed,
  onToggleCollapse,
  onSplit,
  depth = 0,
  parentTitle,
  onAddChild,
  onAddSectionAbove,
  onAddSectionBelow,
  onChangeTemplate,
  onMoveUp,
  onMoveDown,
  onPromoteToRoot,
  onMoveTo,
  childCount = 0,
  previewText,
  onRename,
  sectionNumber,
  description,
  onDescriptionChange,
}: SectionHeaderProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmChangeType, setConfirmChangeType] = useState<{ key: string; label: string } | null>(
    null
  );
  const [showInlineFindings, setShowInlineFindings] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(title);
  const [editingDescription, setEditingDescription] = useState(false);
  const [descValue, setDescValue] = useState(description ?? '');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const descInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const handleRenameSubmit = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== title && onRename) {
      onRename(trimmed);
    } else {
      setRenameValue(title);
    }
    setRenaming(false);
  };

  const handleDescriptionSubmit = () => {
    const trimmed = descValue.trim();
    if (trimmed !== (description ?? '') && onDescriptionChange) {
      onDescriptionChange(trimmed);
    } else {
      setDescValue(description ?? '');
    }
    setEditingDescription(false);
  };

  useEffect(() => {
    if (renaming) {
      renameInputRef.current?.select();
    }
  }, [renaming]);

  useEffect(() => {
    if (editingDescription) {
      descInputRef.current?.focus();
    }
  }, [editingDescription]);

  const hasFindings = gapFindings && gapFindings.length > 0;

  // Close overflow menu on click outside
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        menuButtonRef.current &&
        !menuButtonRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [menuOpen]);

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {/* Collapse toggle */}
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="text-muted-foreground hover:text-foreground transition-colors p-0.5 shrink-0"
              aria-label={isCollapsed ? 'Expand section' : 'Collapse section'}
            >
              {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            </button>
          )}
          {/* Section number */}
          {sectionNumber && (
            <span className="text-xs text-muted-foreground/40 shrink-0">{sectionNumber}</span>
          )}
          {/* Title */}
          {renaming ? (
            <input
              ref={renameInputRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={handleRenameSubmit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameSubmit();
                if (e.key === 'Escape') {
                  setRenameValue(title);
                  setRenaming(false);
                }
              }}
              className="bg-transparent border border-border rounded px-1.5 py-0.5 outline-none focus:border-foreground/40 text-sm font-medium min-w-0"
            />
          ) : (
            <h3
              className={`text-sm font-medium shrink-0 ${onRename ? 'cursor-pointer hover:text-foreground/80' : ''}`}
              onDoubleClick={() => {
                if (onRename) {
                  setRenameValue(title);
                  setRenaming(true);
                }
              }}
            >
              {title}
            </h3>
          )}
          {/* Type badge */}
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
            {TEMPLATE_LABELS[template] ?? template}
          </Badge>
          {/* Parent */}
          {depth > 0 && parentTitle && (
            <span className="text-[10px] text-muted-foreground/40 shrink-0 hidden sm:inline">
              in {parentTitle}
            </span>
          )}
          {/* Description */}
          {editingDescription ? (
            <input
              ref={descInputRef}
              value={descValue}
              onChange={(e) => setDescValue(e.target.value)}
              onBlur={handleDescriptionSubmit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleDescriptionSubmit();
                if (e.key === 'Escape') {
                  setDescValue(description ?? '');
                  setEditingDescription(false);
                }
              }}
              placeholder="Add a description..."
              className="bg-transparent border border-border rounded px-1.5 py-0.5 text-xs text-muted-foreground outline-none focus:border-foreground/40 min-w-[150px] max-w-full sm:max-w-xs"
            />
          ) : description ? (
            <span
              className={`text-xs text-muted-foreground/50 truncate min-w-0 hidden md:inline ${onDescriptionChange ? 'cursor-pointer hover:text-muted-foreground/70' : ''}`}
              title={`${description}${onDescriptionChange ? '\nDouble-click to edit' : ''}`}
              onDoubleClick={() => {
                if (onDescriptionChange) {
                  setDescValue(description);
                  setEditingDescription(true);
                }
              }}
            >
              — {description}
            </span>
          ) : null}
          {/* Gap findings */}
          {hasFindings && (
            <button
              type="button"
              onClick={() => setShowInlineFindings((v) => !v)}
              className="cursor-pointer shrink-0"
            >
              <GapSeverityBadge findings={gapFindings} />
            </button>
          )}
          {/* Preview when collapsed */}
          {isCollapsed && previewText && (
            <span className="text-xs text-muted-foreground/30 truncate min-w-0 hidden sm:inline">
              {previewText}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* Cancel button visible when editing */}
          {isEditing && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancelEdit}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <X size={14} className="mr-1" />
              Cancel
            </Button>
          )}

          {/* Three-dot overflow menu */}
          <div className="relative">
            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
              title="More actions"
              aria-label="More actions"
            >
              <MoreVertical size={14} />
            </button>

            {menuOpen && (
              <div
                ref={menuRef}
                className="absolute right-0 top-8 z-50 w-44 max-h-[calc(100vh-120px)] overflow-y-auto scrollbar-thin rounded-md border border-border bg-background shadow-lg py-1 animate-in fade-in slide-in-from-top-1 duration-100"
                role="menu"
                tabIndex={-1}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    const buttons = menuRef.current?.querySelectorAll('button');
                    if (!buttons?.length) return;
                    const items = Array.from(buttons);
                    const current = document.activeElement as HTMLElement;
                    const idx = items.indexOf(current as HTMLButtonElement);
                    if (e.key === 'ArrowDown') {
                      const next = idx < items.length - 1 ? idx + 1 : 0;
                      items[next]?.focus();
                    } else {
                      const prev = idx > 0 ? idx - 1 : items.length - 1;
                      items[prev]?.focus();
                    }
                  }
                }}
              >
                {/* ── Edit group ── */}
                {!isEditing && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onEdit();
                    }}
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-white/5"
                  >
                    <Pencil size={12} />
                    Edit
                  </button>
                )}
                {onRename && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      setRenameValue(title);
                      setRenaming(true);
                    }}
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-white/5"
                  >
                    <PencilLine size={12} />
                    Rename
                  </button>
                )}
                {onDescriptionChange && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      setDescValue(description ?? '');
                      setEditingDescription(true);
                    }}
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-white/5"
                  >
                    <FileText size={12} />
                    {description ? 'Edit Description' : 'Add Description'}
                  </button>
                )}
                {onAiSelect && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onAiSelect();
                    }}
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-white/5"
                  >
                    <Sparkles size={12} />
                    AI Actions
                  </button>
                )}

                {/* ── Inspect group ── */}
                <div className="my-1 border-t border-border/50" />
                {onShowRules && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onShowRules();
                    }}
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-white/5"
                  >
                    <ListChecks size={12} />
                    Rules
                  </button>
                )}
                {onShowDependencies && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onShowDependencies();
                    }}
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-white/5"
                  >
                    <Link2 size={12} />
                    Dependencies
                    {(dependencyCount ?? 0) > 0 && (
                      <Badge variant="secondary" className="text-[9px] px-1 py-0">
                        {dependencyCount}
                      </Badge>
                    )}
                    {(staleDependencyCount ?? 0) > 0 && (
                      <Badge className="text-[9px] px-1 py-0 bg-yellow-500/10 text-yellow-400 border-yellow-500/20">
                        <AlertTriangle size={8} className="mr-0.5" />
                        {staleDependencyCount}
                      </Badge>
                    )}
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onShowVersions();
                  }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-white/5"
                >
                  <Clock size={12} />
                  History
                </button>

                {/* ── Structure group ── */}
                <div className="my-1 border-t border-border/50" />
                {onSplit && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onSplit();
                    }}
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-white/5"
                  >
                    <Scissors size={12} />
                    Split
                  </button>
                )}
                {onAddChild && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onAddChild();
                    }}
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-white/5"
                  >
                    <Plus size={12} />
                    Add Child Section
                  </button>
                )}
                {onAddSectionAbove && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onAddSectionAbove();
                    }}
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-white/5"
                  >
                    <ArrowUp size={12} />
                    Add Section Above
                  </button>
                )}
                {onAddSectionBelow && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onAddSectionBelow();
                    }}
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-white/5"
                  >
                    <ArrowDown size={12} />
                    Add Section Below
                  </button>
                )}

                {/* ── Move group ── */}
                {(onMoveUp || onMoveDown || onPromoteToRoot || onMoveTo) && (
                  <>
                    <div className="my-1 border-t border-border/50" />
                    {onMoveUp && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          onMoveUp();
                        }}
                        className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-white/5"
                      >
                        <MoveUp size={12} />
                        Move Up
                      </button>
                    )}
                    {onMoveDown && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          onMoveDown();
                        }}
                        className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-white/5"
                      >
                        <MoveDown size={12} />
                        Move Down
                      </button>
                    )}
                    {onPromoteToRoot && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          onPromoteToRoot();
                        }}
                        className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-white/5"
                      >
                        <CornerLeftUp size={12} />
                        Move to Top Level
                      </button>
                    )}
                    {onMoveTo && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          onMoveTo();
                        }}
                        className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-white/5"
                      >
                        <FolderInput size={12} />
                        Move to...
                      </button>
                    )}
                  </>
                )}
                {onChangeTemplate && (
                  <>
                    <div className="my-1 border-t border-border/50" />
                    <div className="px-3 py-1 text-[10px] text-muted-foreground/50 uppercase tracking-wider">
                      Change Type
                    </div>
                    {confirmChangeType ? (
                      <div className="px-3 py-1.5 space-y-1">
                        <p className="text-[11px] text-yellow-400">
                          Change to {confirmChangeType.label}? Content format may change.
                        </p>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              onChangeTemplate(confirmChangeType.key);
                              setConfirmChangeType(null);
                              setMenuOpen(false);
                            }}
                            className="h-6 px-2 text-[11px] text-yellow-400 hover:text-yellow-400 hover:bg-yellow-500/10"
                          >
                            Yes
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirmChangeType(null)}
                            className="h-6 px-2 text-[11px] text-muted-foreground"
                          >
                            No
                          </Button>
                        </div>
                      </div>
                    ) : (
                      Object.entries(TEMPLATE_LABELS)
                        .filter(([key]) => key !== template)
                        .map(([key, label]) => (
                          <button
                            key={key}
                            type="button"
                            role="menuitem"
                            onClick={() => setConfirmChangeType({ key, label })}
                            className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-white/5"
                          >
                            <RefreshCw size={12} />
                            {label}
                          </button>
                        ))
                    )}
                  </>
                )}
                {onDelete && (
                  <>
                    <div className="my-1 border-t border-border/50" />
                    {confirmDelete ? (
                      <div className="flex items-center gap-1 px-3 py-1.5">
                        <span className="text-xs text-destructive flex-1">
                          Delete?
                          {childCount > 0 &&
                            ` (+${childCount} child${childCount > 1 ? 'ren' : ''})`}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            setDeleting(true);
                            await onDelete();
                            setMenuOpen(false);
                          }}
                          disabled={deleting}
                          className="h-6 px-2 text-[11px] text-destructive hover:text-destructive hover:bg-destructive/10"
                          aria-label="Confirm delete"
                        >
                          {deleting ? 'Deleting...' : 'Yes'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmDelete(false)}
                          className="h-6 px-2 text-[11px] text-muted-foreground"
                          aria-label="Cancel delete"
                        >
                          No
                        </Button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => setConfirmDelete(true)}
                        className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10"
                      >
                        <Trash2 size={12} />
                        Delete
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      {showInlineFindings && hasFindings && (
        <InlineFindings findings={gapFindings} workspaceId={workspaceId} />
      )}
    </div>
  );
}
