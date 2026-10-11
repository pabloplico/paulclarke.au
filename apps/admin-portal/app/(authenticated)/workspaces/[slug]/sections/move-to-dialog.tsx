'use client';

import { Button } from '@repo/ui/button';
import { ChevronRight, CornerDownRight, FolderInput, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { MAX_SECTION_DEPTH } from '@/lib/workspaces/section-tree';
import type { SectionTreeNode } from '@/lib/workspaces/types';

interface MoveToDialogProps {
  sectionId: number;
  sectionTitle: string;
  sectionDepth: number;
  /** Max depth of descendants below this section (0 if leaf) */
  subtreeDepth: number;
  sectionTree: SectionTreeNode[];
  onMove: (targetParentId: number | null) => void;
  onClose: () => void;
}

/** Collect all descendant IDs of a section (including itself). */
function collectDescendantIds(node: SectionTreeNode): Set<number> {
  const ids = new Set<number>([node.id]);
  for (const child of node.children) {
    for (const id of collectDescendantIds(child)) {
      ids.add(id);
    }
  }
  return ids;
}

function findNode(tree: SectionTreeNode[], id: number): SectionTreeNode | null {
  for (const node of tree) {
    if (node.id === id) return node;
    const found = findNode(node.children, id);
    if (found) return found;
  }
  return null;
}

/** Get max depth of descendants below a node. */
function maxDescendantDepth(node: SectionTreeNode): number {
  if (node.children.length === 0) return 0;
  let max = 0;
  for (const child of node.children) {
    const d = 1 + maxDescendantDepth(child);
    if (d > max) max = d;
  }
  return max;
}

type TargetOption = {
  id: number | null;
  title: string;
  depth: number;
  disabled: boolean;
  reason?: string;
};

export function MoveToDialog({
  sectionId,
  sectionTitle,
  sectionTree,
  onMove,
  onClose,
}: MoveToDialogProps) {
  const [selected, setSelected] = useState<number | null | undefined>(undefined);

  // Build flat list of valid targets
  const targets = useMemo(() => {
    const movingNode = findNode(sectionTree, sectionId);
    const descendantIds = movingNode ? collectDescendantIds(movingNode) : new Set([sectionId]);
    const subtreeMaxDepth = movingNode ? maxDescendantDepth(movingNode) : 0;
    const currentParentId = movingNode?.parentSectionId ?? null;

    const options: TargetOption[] = [];

    // Root level option
    options.push({
      id: null,
      title: 'Top Level (no parent)',
      depth: 0,
      disabled: currentParentId === null,
      reason: currentParentId === null ? 'Already at top level' : undefined,
    });

    // Walk tree to build options
    function walk(nodes: SectionTreeNode[]) {
      for (const node of nodes) {
        const isSelf = node.id === sectionId;
        const isDescendant = descendantIds.has(node.id);
        const isCurrentParent = node.id === currentParentId;
        // New child depth = node.depth + 1, plus subtree of the moving section
        const wouldExceedDepth = node.depth + 1 + subtreeMaxDepth > MAX_SECTION_DEPTH;

        let disabled = false;
        let reason: string | undefined;

        if (isSelf) {
          disabled = true;
          reason = 'Cannot move into itself';
        } else if (isDescendant) {
          disabled = true;
          reason = 'Cannot move into own descendant';
        } else if (isCurrentParent) {
          disabled = true;
          reason = 'Already a child of this section';
        } else if (wouldExceedDepth) {
          disabled = true;
          reason = `Would exceed max depth (${MAX_SECTION_DEPTH + 1} levels)`;
        }

        options.push({
          id: node.id,
          title: node.title,
          depth: node.depth,
          disabled,
          reason,
        });

        walk(node.children);
      }
    }

    walk(sectionTree);
    return options;
  }, [sectionTree, sectionId]);

  const handleConfirm = () => {
    if (selected === undefined) return;
    onMove(selected);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-background border border-border rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <FolderInput size={16} className="text-muted-foreground" />
            <h3 className="text-sm font-medium">Move &ldquo;{sectionTitle}&rdquo;</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors p-1"
          >
            <X size={14} />
          </button>
        </div>

        <div className="px-4 py-2 overflow-y-auto scrollbar-thin flex-1 min-h-0">
          <p className="text-xs text-muted-foreground mb-2">
            Select a destination to move this section under:
          </p>
          <div className="space-y-0.5 rounded border border-border p-1">
            {targets.map((target) => {
              const isSelected = selected === target.id;
              return (
                <button
                  key={target.id ?? 'root'}
                  type="button"
                  disabled={target.disabled}
                  onClick={() => setSelected(target.id)}
                  className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors flex items-center gap-1.5 ${
                    target.disabled
                      ? 'text-muted-foreground/30 cursor-not-allowed'
                      : isSelected
                        ? 'bg-primary/15 text-foreground'
                        : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
                  }`}
                  title={target.reason}
                  style={{ paddingLeft: `${8 + target.depth * 16}px` }}
                >
                  {target.depth > 0 && (
                    <CornerDownRight size={10} className="shrink-0 opacity-40" />
                  )}
                  {target.id !== null && target.depth === 0 && (
                    <ChevronRight size={10} className="shrink-0 opacity-40" />
                  )}
                  <span className="truncate">{target.title}</span>
                  {target.reason && (
                    <span className="text-[10px] text-muted-foreground/40 ml-auto shrink-0">
                      {target.reason}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7 text-xs">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={selected === undefined}
            className="h-7 text-xs"
          >
            <FolderInput size={12} className="mr-1" />
            Move
          </Button>
        </div>
      </div>
    </div>
  );
}
