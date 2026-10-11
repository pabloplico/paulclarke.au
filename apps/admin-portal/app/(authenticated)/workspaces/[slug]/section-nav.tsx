'use client';

import {
  AlignLeft,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  CreditCard,
  Heading,
  KeyRound,
  MoreVertical,
  Table2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GapFinding } from '@/lib/db/schema';
import { cn } from '@/lib/utils';
import type { SectionTreeNode, SectionWithContent } from '@/lib/workspaces/types';

const TEMPLATE_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  heading: Heading,
  prose: AlignLeft,
  cards: CreditCard,
  table: Table2,
  checklist: CheckSquare,
  'kv-pairs': KeyRound,
};

function severityDot(findings: GapFinding[]) {
  if (findings.length === 0) return null;
  const hasHigh = findings.some((f) => f.severity === 'high');
  const hasMedium = findings.some((f) => f.severity === 'medium');
  if (hasHigh) return 'bg-red-400';
  if (hasMedium) return 'bg-yellow-400';
  return 'bg-blue-400';
}

const DEFAULT_NAV_WIDTH = 256;
const MIN_NAV_WIDTH = 160;
const MAX_NAV_WIDTH = 480;

function getNavMinimized(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('section-nav-minimized') === 'true';
}

function getNavWidth(): number {
  if (typeof window === 'undefined') return DEFAULT_NAV_WIDTH;
  const stored = localStorage.getItem('section-nav-width');
  if (stored) {
    const n = Number(stored);
    if (n >= MIN_NAV_WIDTH && n <= MAX_NAV_WIDTH) return n;
  }
  return DEFAULT_NAV_WIDTH;
}

function getNavExpanded(): Record<number, boolean> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem('section-nav-expanded') ?? '{}');
  } catch {
    return {};
  }
}

interface SectionNavProps {
  sectionTree: SectionTreeNode[];
  findingsBySection: Map<number, GapFinding[]>;
  activeId: number | null;
  numberingMap?: Map<number, string>;
}

function filterTree(nodes: SectionTreeNode[], query: string): SectionTreeNode[] {
  if (!query) return nodes;
  const lower = query.toLowerCase();
  return nodes
    .map((node) => {
      const filteredChildren = filterTree(node.children, query);
      if (node.title.toLowerCase().includes(lower) || filteredChildren.length > 0) {
        return { ...node, children: filteredChildren };
      }
      return null;
    })
    .filter(Boolean) as SectionTreeNode[];
}

export function SectionNav({
  sectionTree,
  findingsBySection,
  activeId,
  numberingMap,
}: SectionNavProps) {
  const [minimized, setMinimized] = useState(getNavMinimized);
  const [navWidth, setNavWidth] = useState(getNavWidth);
  const [dragging, setDragging] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const [menuOpen, setMenuOpen] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expanded, setExpanded] = useState<Record<number, boolean>>(() => {
    // Default: all parents expanded
    const saved = getNavExpanded();
    const defaults: Record<number, boolean> = {};
    function walk(nodes: SectionTreeNode[]) {
      for (const node of nodes) {
        if (node.children.length > 0) {
          defaults[node.id] = saved[node.id] ?? true;
        }
        walk(node.children);
      }
    }
    walk(sectionTree);
    return defaults;
  });
  const menuRef = useRef<HTMLDivElement>(null);

  const toggleMinimized = useCallback(() => {
    setMinimized((prev) => {
      const next = !prev;
      localStorage.setItem('section-nav-minimized', String(next));
      return next;
    });
    setMenuOpen(null);
  }, []);

  const toggleExpanded = useCallback((id: number) => {
    setExpanded((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      localStorage.setItem('section-nav-expanded', JSON.stringify(next));
      return next;
    });
  }, []);

  // Check if any sections have children (for collapse/expand all button)
  const hasAnyChildren = useMemo(() => {
    function check(nodes: SectionTreeNode[]): boolean {
      return nodes.some((n) => n.children.length > 0 || check(n.children));
    }
    return check(sectionTree);
  }, [sectionTree]);

  const allExpanded = useMemo(() => {
    if (!hasAnyChildren) return true;
    function check(nodes: SectionTreeNode[]): boolean {
      return nodes.every((n) => {
        if (n.children.length === 0) return true;
        return (expanded[n.id] ?? true) && check(n.children);
      });
    }
    return check(sectionTree);
  }, [hasAnyChildren, sectionTree, expanded]);

  const toggleAllExpanded = useCallback(() => {
    const shouldExpand = !allExpanded;
    setExpanded((prev) => {
      const next = { ...prev };
      function walk(nodes: SectionTreeNode[]) {
        for (const node of nodes) {
          if (node.children.length > 0) {
            next[node.id] = shouldExpand;
          }
          walk(node.children);
        }
      }
      walk(sectionTree);
      localStorage.setItem('section-nav-expanded', JSON.stringify(next));
      return next;
    });
  }, [allExpanded, sectionTree]);

  // Close menu on click outside
  useEffect(() => {
    if (menuOpen === null) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  // Drag to resize
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setDragging(true);
      const startX = e.clientX;
      const startWidth = navWidth;

      function onMouseMove(ev: MouseEvent) {
        const newWidth = Math.min(
          MAX_NAV_WIDTH,
          Math.max(MIN_NAV_WIDTH, startWidth + ev.clientX - startX)
        );
        setNavWidth(newWidth);
      }

      function onMouseUp() {
        setDragging(false);
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        // Persist final width
        setNavWidth((w) => {
          localStorage.setItem('section-nav-width', String(w));
          return w;
        });
      }

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [navWidth]
  );

  const scrollToSection = useCallback((id: number) => {
    const el = document.getElementById(`section-${id}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  function renderNavNodes(nodes: SectionTreeNode[]) {
    return nodes.map((node) => {
      const Icon = TEMPLATE_ICONS[node.template] ?? AlignLeft;
      const findings = findingsBySection.get(node.id) ?? [];
      const dot = severityDot(findings);
      const isActive = node.id === activeId;
      const hasChildren = node.children.length > 0;
      const isExpanded = expanded[node.id] ?? true;
      const num = numberingMap?.get(node.id);

      if (minimized) {
        return (
          <div key={node.id}>
            <div className="relative group">
              <button
                type="button"
                onClick={() => scrollToSection(node.id)}
                className={cn(
                  'w-full flex items-center justify-center p-2 rounded-md transition-colors relative',
                  isActive
                    ? 'bg-white/10 text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                )}
                title={num ? `${num} ${node.title}` : node.title}
                aria-label={num ? `${num} ${node.title}` : node.title}
              >
                <Icon size={14} />
                {dot && (
                  <span className={`absolute top-1 right-1 h-1.5 w-1.5 rounded-full ${dot}`} />
                )}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(menuOpen === node.id ? null : node.id);
                }}
                className="absolute -right-1 top-0.5 opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-white/10 transition-opacity"
                aria-label={`Options for ${node.title}`}
              >
                <MoreVertical size={10} />
              </button>
              {menuOpen === node.id && (
                <div
                  ref={menuRef}
                  className="absolute left-full top-0 ml-1 z-50 w-44 rounded-md border border-border bg-background shadow-lg py-1 animate-in fade-in slide-in-from-left-1 duration-100"
                >
                  <div className="px-3 py-1.5 border-b border-border/50">
                    <p className="text-xs font-medium truncate">{node.title}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      scrollToSection(node.id);
                      setMenuOpen(null);
                    }}
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-white/5"
                  >
                    Scroll to section
                  </button>
                </div>
              )}
            </div>
            {/* Show children as indented dots in minimized mode */}
            {hasChildren && isExpanded && (
              <div className="ml-1 opacity-60">{renderNavNodes(node.children)}</div>
            )}
          </div>
        );
      }

      return (
        <div key={node.id}>
          <div className="flex items-center">
            {hasChildren && (
              <button
                type="button"
                onClick={() => toggleExpanded(node.id)}
                className="p-0.5 text-muted-foreground/50 hover:text-muted-foreground transition-colors shrink-0"
                aria-expanded={isExpanded}
                aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${node.title}`}
              >
                {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
              </button>
            )}
            <button
              type="button"
              onClick={() => scrollToSection(node.id)}
              className={cn(
                'flex-1 flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-xs transition-colors',
                !hasChildren && 'ml-3.5',
                isActive
                  ? 'bg-white/10 text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
              )}
            >
              <Icon size={12} className="shrink-0" />
              <span className="truncate flex-1" title={num ? `${num} ${node.title}` : node.title}>
                {num && <span className="text-muted-foreground/40 mr-1">{num}</span>}
                {node.title}
              </span>
              {hasChildren && (
                <span className="text-[9px] text-muted-foreground/40">
                  ({node.children.length})
                </span>
              )}
              {dot && <span className={`h-1.5 w-1.5 rounded-full ${dot} shrink-0`} />}
            </button>
          </div>
          {hasChildren && isExpanded && (
            <div className="ml-3 pl-2 border-l border-border/30">
              {renderNavNodes(node.children)}
            </div>
          )}
        </div>
      );
    });
  }

  return (
    <nav
      ref={navRef}
      className={cn(
        'shrink-0 hidden lg:block min-w-0 relative',
        minimized && 'w-10',
        !minimized && !dragging && 'transition-[width] duration-200 ease-in-out'
      )}
      style={minimized ? undefined : { width: navWidth }}
    >
      <div className="space-y-0.5 h-full overflow-y-auto scrollbar-thin overflow-x-hidden">
        {/* Header with minimize toggle */}
        <div
          className={cn(
            'flex items-center mb-2',
            minimized ? 'justify-center' : 'justify-between px-2'
          )}
        >
          {!minimized && (
            <p className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">
              Sections
            </p>
          )}
          <div className="flex items-center">
            {!minimized && hasAnyChildren && (
              <button
                type="button"
                onClick={toggleAllExpanded}
                className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                title={allExpanded ? 'Collapse all' : 'Expand all'}
                aria-label={allExpanded ? 'Collapse all' : 'Expand all'}
              >
                {allExpanded ? <ChevronsDownUp size={12} /> : <ChevronsUpDown size={12} />}
              </button>
            )}
            <button
              type="button"
              onClick={toggleMinimized}
              className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
              title={minimized ? 'Expand sections' : 'Minimize sections'}
              aria-label={minimized ? 'Expand sections' : 'Minimize sections'}
            >
              <ChevronLeft
                size={14}
                className={cn('transition-transform duration-200', minimized && 'rotate-180')}
              />
            </button>
          </div>
        </div>

        {!minimized && sectionTree.length > 3 && (
          <div className="px-1 mb-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter sections..."
              aria-label="Filter sections"
              className="w-full bg-white/5 border border-border/30 rounded-md px-2 py-1 text-[10px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-border/60"
            />
          </div>
        )}
        {sectionTree.length === 0 && !minimized ? (
          <p className="px-2 py-4 text-[10px] text-muted-foreground/60 italic">
            No sections yet. Add one to get started.
          </p>
        ) : (
          renderNavNodes(filterTree(sectionTree, searchQuery))
        )}
      </div>
      {/* Drag handle */}
      {!minimized && (
        <div
          onMouseDown={handleDragStart}
          className="absolute top-0 right-0 w-1 h-full cursor-col-resize group"
        >
          <div
            className={cn(
              'w-full h-full rounded-full transition-colors',
              dragging ? 'bg-primary/40' : 'bg-transparent group-hover:bg-border'
            )}
          />
        </div>
      )}
    </nav>
  );
}

/** Hook: track which section is visible via IntersectionObserver */
export function useActiveSectionId(sections: SectionWithContent[]): number | null {
  const [activeId, setActiveId] = useState<number | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = Number(entry.target.id.replace('section-', ''));
            if (!Number.isNaN(id)) setActiveId(id);
          }
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0 }
    );

    for (const section of sections) {
      const el = document.getElementById(`section-${section.id}`);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [sections]);

  return activeId;
}
