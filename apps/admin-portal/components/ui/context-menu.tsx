'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface ContextMenuItem {
  label: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
  /** If set, shows an inline confirmation before executing onClick */
  confirmMessage?: string;
  separator?: false;
}

export interface ContextMenuSeparator {
  separator: true;
}

export type ContextMenuEntry = ContextMenuItem | ContextMenuSeparator;

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuEntry[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [confirmIndex, setConfirmIndex] = useState<number | null>(null);

  // Adjust position to keep menu in viewport
  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      el.style.left = `${x - rect.width}px`;
    }
    if (rect.bottom > window.innerHeight) {
      el.style.top = `${y - rect.height}px`;
    }
  }, [x, y]);

  // Close on click outside, escape, or scroll
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (confirmIndex !== null) {
          setConfirmIndex(null);
        } else {
          onClose();
        }
      }
    }
    function handleScroll() {
      onClose();
    }

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [onClose, confirmIndex]);

  return (
    <div
      ref={menuRef}
      role="menu"
      className="fixed z-50 w-48 rounded-md border border-border bg-background shadow-lg py-1 animate-in fade-in zoom-in-95 duration-100"
      style={{ top: y, left: x }}
    >
      {items.map((item, i) => {
        if (item.separator) {
          return <div key={`sep-${i}`} className="my-1 border-t border-border/50" />;
        }

        if (confirmIndex === i && item.confirmMessage) {
          return (
            <div key={item.label} className="flex items-center gap-1 px-3 py-1.5">
              <span className="text-xs text-destructive flex-1">{item.confirmMessage}</span>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  item.onClick();
                }}
                className="text-[11px] px-2 py-0.5 rounded text-destructive hover:bg-destructive/10"
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setConfirmIndex(null)}
                className="text-[11px] px-2 py-0.5 rounded text-muted-foreground hover:bg-white/5"
              >
                No
              </button>
            </div>
          );
        }

        const Icon = item.icon;
        return (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              if (item.confirmMessage) {
                setConfirmIndex(i);
                return;
              }
              onClose();
              item.onClick();
            }}
            className={cn(
              'flex items-center gap-2 w-full px-3 py-1.5 text-xs transition-colors disabled:opacity-40',
              item.destructive
                ? 'text-red-400 hover:bg-red-500/10'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
            )}
          >
            {Icon && <Icon size={12} />}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
