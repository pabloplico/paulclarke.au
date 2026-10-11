'use client';

import { Button } from '@repo/ui/button';
import { toast } from '@repo/ui/sonner';
import {
  Archive,
  ArchiveRestore,
  Eraser,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from './confirm-dialog';
import type { DocumentWithChunks } from './page';
import { useDocumentStore } from './store';
import { isProcessing } from './utils';

interface DocumentActionsProps {
  doc: DocumentWithChunks;
}

interface ActionItem {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  destructive?: boolean;
  separator?: boolean;
}

export function DocumentActions({ doc }: DocumentActionsProps) {
  const [open, setOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { removeDocument, updateDocument } = useDocumentStore();

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

  const isArchived = !!doc.archivedAt;

  async function handleArchiveToggle() {
    setLoading('archive');
    try {
      const res = await fetch(`/api/documents/${doc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: !isArchived }),
      });
      if (!res.ok) throw new Error();
      if (isArchived) {
        updateDocument(doc.id, { archivedAt: null });
        toast.success('Document unarchived');
      } else {
        removeDocument(doc.id);
        toast.success('Document archived');
      }
    } catch {
      toast.error('Failed to update document');
    } finally {
      setLoading(null);
      setOpen(false);
    }
  }

  async function handleReprocess() {
    setLoading('reprocess');
    try {
      const res = await fetch(`/api/documents/${doc.id}/retry`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Reprocess failed');
      }
      updateDocument(doc.id, {
        status: 'uploaded',
        processingError: null,
      });
      toast.success('Document re-queued for processing');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reprocessing failed');
    } finally {
      setLoading(null);
      setOpen(false);
    }
  }

  async function handleReclean() {
    setLoading('reclean');
    try {
      const res = await fetch(`/api/documents/${doc.id}/clean`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'reclean' }),
      });
      if (!res.ok) throw new Error();
      toast.success('Text re-cleaned');
    } catch {
      toast.error('Re-clean failed');
    } finally {
      setLoading(null);
      setOpen(false);
    }
  }

  async function handleAiCleanup() {
    setLoading('ai-cleanup');
    try {
      const res = await fetch(`/api/documents/${doc.id}/clean`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'ai-cleanup' }),
      });
      if (!res.ok) throw new Error();
      toast.success('AI clean-up complete');
    } catch {
      toast.error('AI clean-up failed');
    } finally {
      setLoading(null);
      setOpen(false);
    }
  }

  async function handleDelete() {
    setLoading('delete');
    try {
      const res = await fetch(`/api/documents/${doc.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      removeDocument(doc.id);
      toast.success('Document deleted');
    } catch {
      toast.error('Failed to delete document');
    } finally {
      setLoading(null);
      setConfirmAction(null);
    }
  }

  const actions: ActionItem[] = [
    {
      label: isArchived ? 'Unarchive' : 'Archive',
      icon: isArchived ? ArchiveRestore : Archive,
      onClick: handleArchiveToggle,
    },
    ...(!isProcessing(doc.status)
      ? [
          {
            label: 'Reprocess',
            icon: RefreshCw,
            onClick: handleReprocess,
          },
        ]
      : []),
    ...(doc.status === 'ready'
      ? [
          {
            label: 'Re-clean text',
            icon: Eraser,
            onClick: handleReclean,
          },
          {
            label: 'AI clean-up',
            icon: Sparkles,
            onClick: handleAiCleanup,
          },
        ]
      : []),
    {
      label: 'Delete',
      icon: Trash2,
      onClick: () => {
        setOpen(false);
        setConfirmAction('delete');
      },
      destructive: true,
      separator: true,
    },
  ];

  return (
    <div className="relative shrink-0" ref={menuRef}>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(!open);
        }}
        disabled={!!loading}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <MoreHorizontal className="h-4 w-4" />
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-48 rounded-lg border border-border bg-card shadow-lg py-1">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                action.onClick();
              }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
                action.separator ? 'border-t border-border mt-1 pt-2' : ''
              } ${
                action.destructive
                  ? 'text-red-400 hover:bg-red-500/10'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
              }`}
            >
              <action.icon className="h-3.5 w-3.5" />
              {action.label}
            </button>
          ))}
        </div>
      )}

      {confirmAction === 'delete' && (
        <ConfirmDialog
          title="Delete Document"
          description={`Permanently delete "${doc.title}"? This will remove the file and all chunks.`}
          confirmLabel="Delete"
          confirmVariant="destructive"
          loading={loading === 'delete'}
          onConfirm={handleDelete}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}
