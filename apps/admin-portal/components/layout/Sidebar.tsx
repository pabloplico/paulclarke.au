'use client';

import type { LucideIcon } from 'lucide-react';
import {
  BookOpen,
  Briefcase,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  FileText,
  GripVertical,
  Inbox,
  Layers,
  MailPlus,
  MessageSquare,
  ScanSearch,
  Settings,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useHrefVisible } from '@/components/demo/demo-features';
import { cn } from '@/lib/utils';

type NavItem = { label: string; href: string; icon: LucideIcon; adminOnly?: boolean };

const DEFAULT_KNOWLEDGE_NAV: NavItem[] = [
  { label: 'Workspaces', href: '/workspaces', icon: Layers },
  { label: 'Inbox', href: '/inbox', icon: Inbox },
  { label: 'Gap Analysis', href: '/gap-analysis', icon: ScanSearch },
  { label: 'Documents', href: '/documents', icon: FileText },
  { label: 'Knowledge Base', href: '/knowledge-base', icon: BookOpen },
];

const DEFAULT_OPERATIONS_NAV: NavItem[] = [
  { label: 'Clients', href: '/clients', icon: Users },
  { label: 'Jobs', href: '/jobs', icon: Briefcase },
  { label: 'Tasks', href: '/todos', icon: CheckSquare },
  { label: 'Communications', href: '/communications', icon: MessageSquare },
  { label: 'Email Templates', href: '/email-templates', icon: MailPlus },
];

const SYSTEM_NAV: NavItem[] = [{ label: 'Settings', href: '/settings', icon: Settings }];

// Maps href to its NavItem definition (for restoring icons after rehydrating from localStorage)
const ALL_ITEMS = [...DEFAULT_KNOWLEDGE_NAV, ...DEFAULT_OPERATIONS_NAV, ...SYSTEM_NAV];
const ITEM_MAP = new Map(ALL_ITEMS.map((item) => [item.href, item]));

function loadOrder(key: string, defaults: NavItem[]): NavItem[] {
  if (typeof window === 'undefined') return defaults;
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return defaults;
    const hrefs: string[] = JSON.parse(stored);
    // Rebuild from stored order, filtering out stale entries and adding new ones
    const ordered: NavItem[] = [];
    for (const href of hrefs) {
      const item = ITEM_MAP.get(href);
      if (item && defaults.some((d) => d.href === href)) ordered.push(item);
    }
    // Append any new items not in stored order
    for (const d of defaults) {
      if (!ordered.some((o) => o.href === d.href)) ordered.push(d);
    }
    return ordered;
  } catch {
    return defaults;
  }
}

function saveOrder(key: string, items: NavItem[]) {
  try {
    localStorage.setItem(key, JSON.stringify(items.map((i) => i.href)));
  } catch {
    // localStorage unavailable
  }
}

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  userRole?: string;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({
  collapsed,
  onToggle,
  userRole,
  mobileOpen,
  onMobileClose,
}: SidebarProps) {
  const pathname = usePathname();
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  const [opsOpen, setOpsOpen] = useState(false);
  const [systemOpen, setSystemOpen] = useState(false);

  const [knowledgeNav, setKnowledgeNav] = useState(DEFAULT_KNOWLEDGE_NAV);
  const [opsNav, setOpsNav] = useState(DEFAULT_OPERATIONS_NAV);

  // Load persisted order on mount
  useEffect(() => {
    setKnowledgeNav(loadOrder('sidebar-knowledge-order', DEFAULT_KNOWLEDGE_NAV));
    setOpsNav(loadOrder('sidebar-ops-order', DEFAULT_OPERATIONS_NAV));
  }, []);

  // Close mobile drawer on navigation
  useEffect(() => {
    onMobileClose?.();
  }, [onMobileClose]); // eslint-disable-line react-hooks/exhaustive-deps

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  // Demo mode hides switched-off pages (the middleware refuses them anyway)
  const hrefVisible = useHrefVisible();
  const visibleKnowledge = knowledgeNav.filter((item) => hrefVisible(item.href));
  const visibleOps = opsNav.filter((item) => hrefVisible(item.href));
  const visibleSystem = SYSTEM_NAV.filter(
    (item) => (!item.adminOnly || userRole === 'admin') && hrefVisible(item.href)
  );

  const onKnowledgePage = knowledgeNav.some((item) => isActive(item.href));
  const onOpsPage = opsNav.some((item) => isActive(item.href));
  const onSystemPage = visibleSystem.some((item) => isActive(item.href));

  return (
    <aside
      className={cn(
        'flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200',
        // Desktop: static positioning, collapse/expand
        'hidden md:flex',
        collapsed ? 'md:w-16' : 'md:w-56',
        // Mobile: fixed drawer overlay
        mobileOpen && 'fixed inset-y-0 left-0 z-50 flex w-56'
      )}
    >
      {/* Brand */}
      <div className="flex h-14 items-center justify-between border-b border-sidebar-border px-4">
        {(!collapsed || mobileOpen) && (
          <span className="text-sm font-bold tracking-tight text-foreground">Admin</span>
        )}
        <button
          type="button"
          onClick={mobileOpen ? onMobileClose : onToggle}
          className="rounded-md p-1.5 text-sidebar-foreground hover:bg-white/5 hover:text-foreground transition-colors"
          aria-label={mobileOpen ? 'Close menu' : collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <ChevronLeft
            size={18}
            className={cn('transition-transform', collapsed && !mobileOpen && 'rotate-180')}
          />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 flex flex-col px-2 py-3 overflow-y-auto scrollbar-thin">
        {/* Knowledge group */}
        <NavGroup
          groupLabel="Knowledge"
          groupIcon={BookOpen}
          items={visibleKnowledge}
          open={knowledgeOpen}
          onPageInGroup={onKnowledgePage}
          onToggle={() => setKnowledgeOpen(!knowledgeOpen)}
          collapsed={collapsed && !mobileOpen}
          isActive={isActive}
          onReorder={(items) => {
            setKnowledgeNav(items);
            saveOrder('sidebar-knowledge-order', items);
          }}
        />

        {/* Operations group */}
        <NavGroup
          groupLabel="Operations"
          groupIcon={Briefcase}
          items={visibleOps}
          open={opsOpen}
          onPageInGroup={onOpsPage}
          onToggle={() => setOpsOpen(!opsOpen)}
          collapsed={collapsed && !mobileOpen}
          isActive={isActive}
          onReorder={(items) => {
            setOpsNav(items);
            saveOrder('sidebar-ops-order', items);
          }}
        />

        {/* Spacer */}
        <div className="flex-1" />

        {/* System group (not reorderable) */}
        <div className="space-y-1">
          {!(collapsed && !mobileOpen) && visibleSystem.length > 0 && (
            <button
              type="button"
              onClick={() => setSystemOpen(!systemOpen)}
              aria-expanded={systemOpen || onSystemPage}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground hover:bg-white/5 hover:text-foreground transition-colors"
            >
              <Settings size={18} className="shrink-0" />
              <span className="flex-1 text-left">System</span>
              <ChevronDown
                size={14}
                className={cn('transition-transform', (systemOpen || onSystemPage) && 'rotate-180')}
              />
            </button>
          )}
          {((collapsed && !mobileOpen) || systemOpen || onSystemPage) &&
            visibleSystem.map(({ label, href, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  collapsed && !mobileOpen ? '' : 'pl-6',
                  isActive(href)
                    ? 'bg-sidebar-active text-sidebar-active-foreground'
                    : 'text-sidebar-foreground hover:bg-white/5 hover:text-foreground'
                )}
                title={collapsed && !mobileOpen ? label : undefined}
              >
                <Icon size={18} className="shrink-0" />
                {!(collapsed && !mobileOpen) && <span>{label}</span>}
              </Link>
            ))}
        </div>
      </nav>
    </aside>
  );
}

// ─── Reorderable Nav Group ───────────────────────────────────────────────────

interface NavGroupProps {
  groupLabel: string;
  groupIcon: LucideIcon;
  items: NavItem[];
  open: boolean;
  onPageInGroup: boolean;
  onToggle: () => void;
  collapsed: boolean;
  isActive: (href: string) => boolean;
  onReorder: (items: NavItem[]) => void;
}

function NavGroup({
  groupLabel,
  groupIcon: GroupIcon,
  items,
  open,
  onPageInGroup,
  onToggle,
  collapsed,
  isActive,
  onReorder,
}: NavGroupProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      if (dragIndex === null || dragIndex === index) return;
      setDropIndex(index);
    },
    [dragIndex]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (dragIndex === null || dropIndex === null || dragIndex === dropIndex) {
        setDragIndex(null);
        setDropIndex(null);
        return;
      }
      const next = [...items];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(dropIndex, 0, moved!);
      onReorder(next);
      setDragIndex(null);
      setDropIndex(null);
    },
    [dragIndex, dropIndex, items, onReorder]
  );

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDropIndex(null);
  }, []);

  const handleKeyReorder = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      if (!e.altKey || collapsed) return;
      if (e.key === 'ArrowUp' && index > 0) {
        e.preventDefault();
        const next = [...items];
        [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
        onReorder(next);
        // Restore focus to the moved item after re-render
        requestAnimationFrame(() => {
          const el = document.querySelector(`[data-nav-index="${index - 1}"]`) as HTMLElement;
          el?.focus();
        });
      } else if (e.key === 'ArrowDown' && index < items.length - 1) {
        e.preventDefault();
        const next = [...items];
        [next[index], next[index + 1]] = [next[index + 1]!, next[index]!];
        onReorder(next);
        requestAnimationFrame(() => {
          const el = document.querySelector(`[data-nav-index="${index + 1}"]`) as HTMLElement;
          el?.focus();
        });
      }
    },
    [collapsed, items, onReorder]
  );

  const expanded = collapsed || open || onPageInGroup;

  return (
    <div className="space-y-1">
      {!collapsed && (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open || onPageInGroup}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground hover:bg-white/5 hover:text-foreground transition-colors"
        >
          <GroupIcon size={18} className="shrink-0" />
          <span className="flex-1 text-left">{groupLabel}</span>
          <ChevronDown
            size={14}
            className={cn('transition-transform', (open || onPageInGroup) && 'rotate-180')}
          />
        </button>
      )}
      {expanded &&
        items.map(({ label, href, icon: Icon }, index) => (
          <div
            key={href}
            data-nav-index={index}
            tabIndex={collapsed ? undefined : 0}
            draggable={!collapsed}
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
            onKeyDown={(e) => handleKeyReorder(e, index)}
            aria-roledescription={collapsed ? undefined : 'reorderable item'}
            className={cn(
              'group/item rounded-lg transition-colors',
              dragIndex === index && 'opacity-40',
              dropIndex === index && dragIndex !== null && 'border-t border-lime-500/40'
            )}
          >
            <Link
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                collapsed ? '' : 'pl-6',
                isActive(href)
                  ? 'bg-sidebar-active text-sidebar-active-foreground'
                  : 'text-sidebar-foreground hover:bg-white/5 hover:text-foreground'
              )}
              title={collapsed ? label : undefined}
            >
              {!collapsed && (
                <GripVertical
                  size={12}
                  className="shrink-0 opacity-0 group-hover/item:opacity-40 cursor-grab active:cursor-grabbing -ml-2 mr-0"
                />
              )}
              <Icon size={18} className="shrink-0" />
              {!collapsed && <span>{label}</span>}
            </Link>
          </div>
        ))}
    </div>
  );
}
