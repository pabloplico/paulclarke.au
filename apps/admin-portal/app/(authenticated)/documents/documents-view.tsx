'use client';

import { Button } from '@repo/ui/button';
import { Checkbox } from '@repo/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui/select';
import { toast } from '@repo/ui/sonner';
import {
  Archive,
  Download,
  Eraser,
  FileText,
  Inbox,
  Loader2,
  Plus,
  RefreshCw,
  RotateCw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFeatureEnabled } from '@/components/demo/demo-features';
import { formatProcessingError } from '@/lib/document-processing/format-error';
import type { KnowledgeBaseWithStats } from '@/lib/types';
import { ConfirmDialog } from './confirm-dialog';
import { DocumentRow } from './document-row';
import type { DocumentWithChunks } from './page';
import { useDocumentStore } from './store';
import { UploadPanel } from './upload-panel';
import type { StatusFilter } from './utils';
import { DOCUMENT_TYPES, isProcessing, matchesFilter, TYPE_CONFIG } from './utils';

const FILTER_BUTTONS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'processing', label: 'Processing' },
  { key: 'ready', label: 'Ready' },
  { key: 'error', label: 'Error' },
  { key: 'archived', label: 'Archived' },
];

interface DocumentsViewProps {
  initialDocuments: DocumentWithChunks[];
  knowledgeBases: KnowledgeBaseWithStats[];
}

export function DocumentsView({ initialDocuments, knowledgeBases }: DocumentsViewProps) {
  const [reprocessing, setReprocessing] = useState(false);
  const [batchLoading, setBatchLoading] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    confirmVariant?: 'default' | 'destructive';
    onConfirm: () => void;
  } | null>(null);
  const {
    documents,
    statusFilter,
    typeFilter,
    selectedKbId,
    showUpload,
    selectedIds,
    setDocuments,
    addDocument,
    setFilter,
    setTypeFilter,
    setSelectedKbId,
    toggleUpload,
    selectAll,
    clearSelection,
  } = useDocumentStore();

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevDocsRef = useRef<DocumentWithChunks[]>([]);

  // Hydrate store from server data on mount
  useEffect(() => {
    setDocuments(initialDocuments);
    prevDocsRef.current = initialDocuments;
  }, [initialDocuments, setDocuments]);

  // Detect processing -> ready/error transitions
  useEffect(() => {
    const prevMap = new Map(prevDocsRef.current.map((d) => [d.id, d.status]));
    for (const doc of documents) {
      const prev = prevMap.get(doc.id);
      if (prev && isProcessing(prev) && doc.status === 'ready') {
        toast.success(`${doc.title} processed`);
      }
      if (prev && isProcessing(prev) && doc.status === 'error') {
        toast.error(`${doc.title} failed`, {
          description: formatProcessingError(doc.processingError) ?? undefined,
        });
      }
    }
    prevDocsRef.current = documents;
  }, [documents]);

  // Polling: active only when processing docs exist
  const hasProcessing = documents.some((d) => isProcessing(d.status));

  useEffect(() => {
    if (!hasProcessing) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(async () => {
      try {
        const url = statusFilter === 'archived' ? '/api/documents?archived=true' : '/api/documents';
        const res = await fetch(url);
        if (res.ok) {
          const data: DocumentWithChunks[] = await res.json();
          setDocuments(
            data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          );
        }
      } catch {
        toast.error('Failed to refresh documents', {
          id: 'poll-error',
          duration: 3000,
        });
      }
    }, 4000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [hasProcessing, setDocuments, statusFilter]);

  const fetchDocuments = useCallback(
    async (archived = false) => {
      try {
        const url = archived ? '/api/documents?archived=true' : '/api/documents';
        const res = await fetch(url);
        if (res.ok) {
          const data: DocumentWithChunks[] = await res.json();
          setDocuments(
            data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          );
        }
      } catch {
        // Silently fail — polling will retry
      }
    },
    [setDocuments]
  );

  const handleFilterChange = useCallback(
    (filter: StatusFilter) => {
      setFilter(filter);
      if (filter === 'archived') {
        fetchDocuments(true);
      } else if (statusFilter === 'archived') {
        // Switching away from archived — refetch non-archived docs
        fetchDocuments(false);
      }
    },
    [setFilter, fetchDocuments, statusFilter]
  );

  // Re-running the AI pipeline on every document is off in the demo
  const reprocessAllEnabled = useFeatureEnabled('bulkReprocess');

  const executeReprocessAll = useCallback(async () => {
    setReprocessing(true);
    try {
      const res = await fetch('/api/documents/reprocess-all', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        toast.success(data.message);
        await fetchDocuments();
      } else {
        toast.error('Failed to reprocess documents');
      }
    } catch {
      toast.error('Failed to reprocess documents');
    } finally {
      setReprocessing(false);
    }
  }, [fetchDocuments]);

  const handleReprocessAll = useCallback(() => {
    const nonProcessing = documents.filter((d) => !d.archivedAt && !isProcessing(d.status));
    if (nonProcessing.length === 0) {
      toast.info('No documents to reprocess');
      return;
    }
    setConfirmState({
      title: 'Reprocess All Documents',
      description: `This will re-run the full extraction pipeline on ${nonProcessing.length} document${nonProcessing.length === 1 ? '' : 's'}. Existing chunks and AI metadata will be regenerated.`,
      confirmLabel: 'Reprocess All',
      onConfirm: () => {
        setConfirmState(null);
        executeReprocessAll();
      },
    });
  }, [documents, executeReprocessAll]);

  const downloadExport = useCallback(async (ids: number[]) => {
    try {
      const res = await fetch('/api/documents/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentIds: ids }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `documents-export-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      toast.error('Export failed');
    }
  }, []);

  const executeBatchAction = useCallback(
    async (action: string, label: string, ids: number[]) => {
      setBatchLoading(action);
      try {
        const res = await fetch('/api/documents/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, documentIds: ids }),
        });
        if (res.ok) {
          const data = await res.json();
          toast.success(data.message);
          clearSelection();
          await fetchDocuments(statusFilter === 'archived');
        } else {
          const data = await res.json().catch(() => ({}));
          toast.error(data.error || `${label} failed`);
        }
      } catch {
        toast.error(`${label} failed`);
      } finally {
        setBatchLoading(null);
      }
    },
    [clearSelection, fetchDocuments, statusFilter]
  );

  const handleBatchAction = useCallback(
    (action: string, label: string) => {
      const ids = [...selectedIds];
      if (ids.length === 0) return;

      const isDestructive = action === 'reprocess' || action === 'delete';
      if (isDestructive) {
        const noun = `${ids.length} document${ids.length === 1 ? '' : 's'}`;
        const verb = action === 'delete' ? 'Delete' : 'Reprocess';
        const detail =
          action === 'delete'
            ? 'This cannot be undone.'
            : 'Existing chunks and AI metadata will be regenerated.';

        setConfirmState({
          title: `${verb} ${noun}`,
          description: detail,
          confirmLabel: verb,
          confirmVariant: action === 'delete' ? 'destructive' : 'default',
          onConfirm: () => {
            setConfirmState(null);
            executeBatchAction(action, label, ids);
          },
        });
        return;
      }

      executeBatchAction(action, label, ids);
    },
    [selectedIds, executeBatchAction]
  );

  const handleUploaded = useCallback(
    (doc: DocumentWithChunks) => {
      addDocument(doc);
      toggleUpload();
      toast.success(`${doc.title} uploaded`);
    },
    [addDocument, toggleUpload]
  );

  const filtered = documents.filter((d) => {
    if (statusFilter === 'archived') {
      if (!d.archivedAt) return false;
    } else {
      if (d.archivedAt) return false;
      if (!matchesFilter(d.status, statusFilter)) return false;
    }
    if (typeFilter && d.aiDocumentType !== typeFilter) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1">
          {FILTER_BUTTONS.map(({ key, label }) => (
            <Button
              key={key}
              variant={statusFilter === key ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => handleFilterChange(key)}
            >
              {label}
              {key !== 'all' && (
                <span className="ml-1 text-xs text-muted-foreground">
                  {key === 'archived'
                    ? documents.filter((d) => !!d.archivedAt).length
                    : documents.filter((d) => !d.archivedAt && matchesFilter(d.status, key)).length}
                </span>
              )}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={typeFilter ?? 'all'}
            onValueChange={(v) => setTypeFilter(v === 'all' ? null : v)}
          >
            <SelectTrigger className="h-8 w-auto px-2 text-xs" aria-label="Document type">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {DOCUMENT_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {TYPE_CONFIG[type].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {knowledgeBases.length > 0 && (
            <Select
              value={selectedKbId != null ? String(selectedKbId) : 'all'}
              onValueChange={(v) => setSelectedKbId(v === 'all' ? null : Number(v))}
            >
              <SelectTrigger className="h-8 w-auto px-2 text-xs" aria-label="Knowledge base">
                <SelectValue placeholder="All Knowledge Bases" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Knowledge Bases</SelectItem>
                {knowledgeBases.map((kb) => (
                  <SelectItem key={kb.id} value={String(kb.id)}>
                    {kb.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="flex items-center gap-2">
          {reprocessAllEnabled && (
            <Button size="sm" variant="ghost" onClick={handleReprocessAll} disabled={reprocessing}>
              {reprocessing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCw className="h-4 w-4" />
              )}
              Reprocess All
            </Button>
          )}
          <Button size="sm" onClick={toggleUpload}>
            <Plus className="h-4 w-4" />
            Upload
          </Button>
        </div>
      </div>

      {showUpload && <UploadPanel onUploaded={handleUploaded} />}

      {filtered.length > 0 ? (
        <div className="space-y-2">
          {/* Select all + batch action bar */}
          <div className="flex items-center gap-3 px-1">
            <Checkbox
              checked={filtered.length > 0 && filtered.every((d) => selectedIds.has(d.id))}
              onChange={() => {
                const allSelected = filtered.every((d) => selectedIds.has(d.id));
                if (allSelected) {
                  clearSelection();
                } else {
                  selectAll(filtered.map((d) => d.id));
                }
              }}
            />
            {selectedIds.size > 0 ? (
              <div className="flex flex-wrap items-center gap-1 flex-1">
                <span className="text-xs text-muted-foreground mr-1">
                  {selectedIds.size} selected
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  disabled={!!batchLoading}
                  onClick={() => handleBatchAction('reprocess', 'Reprocess')}
                >
                  {batchLoading === 'reprocess' ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3" />
                  )}
                  Reprocess
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  disabled={!!batchLoading}
                  onClick={() => handleBatchAction('reclean', 'Re-clean')}
                >
                  {batchLoading === 'reclean' ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Eraser className="h-3 w-3" />
                  )}
                  Re-clean
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  disabled={!!batchLoading}
                  onClick={() => handleBatchAction('ai-cleanup', 'AI clean-up')}
                >
                  {batchLoading === 'ai-cleanup' ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  AI clean-up
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  disabled={!!batchLoading}
                  onClick={() => handleBatchAction('send-to-inbox', 'Send to Inbox')}
                >
                  {batchLoading === 'send-to-inbox' ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Inbox className="h-3 w-3" />
                  )}
                  Send to Inbox
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  disabled={!!batchLoading}
                  onClick={() => handleBatchAction('archive', 'Archive')}
                >
                  {batchLoading === 'archive' ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Archive className="h-3 w-3" />
                  )}
                  Archive
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  disabled={!!batchLoading}
                  onClick={() => downloadExport([...selectedIds])}
                >
                  <Download className="h-3 w-3" />
                  Export
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px] text-red-400 hover:text-red-300"
                  disabled={!!batchLoading}
                  onClick={() => handleBatchAction('delete', 'Delete')}
                >
                  {batchLoading === 'delete' ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3" />
                  )}
                  Delete
                </Button>
                <div className="flex-1" />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 text-[11px] text-muted-foreground"
                  onClick={clearSelection}
                  aria-label="Clear selection"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">
                Select documents for batch actions
              </span>
            )}
          </div>

          {filtered.map((doc) => (
            <DocumentRow key={doc.id} doc={doc} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 py-16 text-center">
          <FileText className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-muted-foreground text-sm">
            {documents.length === 0 ? 'No documents yet.' : 'No matches for this filter.'}
          </p>
        </div>
      )}

      {confirmState && (
        <ConfirmDialog
          title={confirmState.title}
          description={confirmState.description}
          confirmLabel={confirmState.confirmLabel}
          confirmVariant={confirmState.confirmVariant}
          onConfirm={confirmState.onConfirm}
          onCancel={() => setConfirmState(null)}
        />
      )}
    </div>
  );
}
