'use client';

import { Badge } from '@repo/ui/badge';
import { Button } from '@repo/ui/button';
import { Card } from '@repo/ui/card';
import { toast } from '@repo/ui/sonner';
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Eraser,
  ExternalLink,
  FileDown,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { adminDocumentChunks, adminDocuments } from '@/lib/db/schema';
import { formatProcessingError } from '@/lib/document-processing/format-error';
import { MarkdownRenderer } from '../../workspaces/[slug]/sections/markdown-renderer';
import { ConfirmDialog } from '../confirm-dialog';
import { FileIcon, MetaItem, StatusBadge } from '../shared';
import { formatDate, formatFileSize, formatRelativeDate, isProcessing } from '../utils';

type Document = typeof adminDocuments.$inferSelect;
type Chunk = Omit<typeof adminDocumentChunks.$inferSelect, 'embedding'>;

interface DocumentDetailProps {
  doc: Document;
  chunks: Chunk[];
}

const CONTENT_TYPE_STYLES: Record<string, string> = {
  code: 'bg-blue-500/15 text-blue-400',
  table: 'bg-amber-500/15 text-amber-400',
};

function ChunkCard({ chunk }: { chunk: Chunk }) {
  const meta = chunk.metadata as Record<string, unknown> | null;
  const sectionHeading = meta?.sectionHeading as string | undefined;
  const contentType = (meta?.contentType as string) ?? 'prose';
  const typeStyle = CONTENT_TYPE_STYLES[contentType] ?? 'bg-white/5 text-white/60';

  return (
    <Card className="p-4 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono text-muted-foreground">#{chunk.chunkIndex}</span>
        {sectionHeading && <span className="text-sm font-medium truncate">{sectionHeading}</span>}
        <Badge variant="outline" className={`ml-auto text-xs ${typeStyle}`}>
          {contentType}
        </Badge>
      </div>
      <p
        className={`text-sm text-muted-foreground leading-relaxed ${
          contentType === 'code' ? 'whitespace-pre-wrap font-mono' : ''
        }`}
      >
        {chunk.content}
      </p>
      {chunk.tokenCount != null && (
        <p className="text-xs text-muted-foreground/60">{chunk.tokenCount} tokens</p>
      )}
    </Card>
  );
}

export function DocumentDetail({ doc, chunks }: DocumentDetailProps) {
  const router = useRouter();
  const [archiving, setArchiving] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [recleaning, setRecleaning] = useState(false);
  const [aiCleaning, setAiCleaning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [contentTab, setContentTab] = useState<'document' | 'chunks'>('document');

  async function handleArchive() {
    setArchiving(true);
    try {
      const res = await fetch(`/api/documents/${doc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: !doc.archivedAt }),
      });
      if (!res.ok) throw new Error();
      toast.success(doc.archivedAt ? 'Document unarchived' : 'Document archived');
      router.refresh();
    } catch {
      toast.error('Failed to update document');
    } finally {
      setArchiving(false);
    }
  }

  async function handleReprocess() {
    setReprocessing(true);
    try {
      const res = await fetch(`/api/documents/${doc.id}/retry`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Reprocess failed');
      }
      toast.success('Document re-queued for processing');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reprocessing failed');
    } finally {
      setReprocessing(false);
    }
  }

  async function handleReclean() {
    setRecleaning(true);
    try {
      const res = await fetch(`/api/documents/${doc.id}/clean`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'reclean' }),
      });
      if (!res.ok) throw new Error();
      toast.success('Text re-cleaned');
      router.refresh();
    } catch {
      toast.error('Re-clean failed');
    } finally {
      setRecleaning(false);
    }
  }

  async function handleAiCleanup() {
    setAiCleaning(true);
    try {
      const res = await fetch(`/api/documents/${doc.id}/clean`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'ai-cleanup' }),
      });
      if (!res.ok) throw new Error();
      toast.success('AI clean-up complete');
      router.refresh();
    } catch {
      toast.error('AI clean-up failed');
    } finally {
      setAiCleaning(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/documents/${doc.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      toast.success('Document deleted');
      router.push('/documents');
    } catch {
      toast.error('Failed to delete document');
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  const processing = isProcessing(doc.status);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/documents"
          className="rounded-lg p-1.5 hover:bg-white/[0.06] transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-muted-foreground" />
        </Link>
        <FileIcon mime={doc.mimeType} />
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-bold tracking-tight truncate">{doc.title}</h2>
          {doc.title !== doc.filename && (
            <p className="text-sm text-muted-foreground truncate">{doc.filename}</p>
          )}
        </div>
        <StatusBadge status={doc.status} />
        {doc.archivedAt && (
          <Badge variant="outline" className="text-xs bg-white/5 text-white/40 border-white/10">
            Archived
          </Badge>
        )}
        <span className="text-sm text-muted-foreground shrink-0">
          {formatFileSize(doc.fileSize)}
        </span>
        <span className="text-sm text-muted-foreground shrink-0">
          {formatRelativeDate(doc.createdAt)}
        </span>
      </div>

      {/* AI Metadata */}
      <Card className="p-5 space-y-4">
        {doc.aiSummary && (
          <p className="text-sm text-muted-foreground leading-relaxed">{doc.aiSummary}</p>
        )}

        <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-2">
          <MetaItem label="Document Type" value={doc.aiDocumentType} />
          <MetaItem label="Language" value={doc.aiLanguage} />
          <MetaItem label="Pages" value={doc.pageCount} />
          <MetaItem label="Chunks" value={chunks.length || undefined} />
          <MetaItem label="Size" value={formatFileSize(doc.fileSize)} />
          <MetaItem label="Uploaded" value={formatDate(doc.createdAt)} />
          <MetaItem
            label="Processed"
            value={doc.processingCompletedAt ? formatDate(doc.processingCompletedAt) : undefined}
          />
          <MetaItem label="Source" value={doc.source} />
        </dl>

        {doc.aiTags?.length || doc.userTags?.length ? (
          <div className="flex flex-wrap gap-1.5">
            {doc.aiTags?.map((tag) => (
              <Badge key={`ai-${tag}`} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
            {doc.userTags?.map((tag) => (
              <Badge key={`user-${tag}`} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        ) : null}

        {doc.processingError && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3">
            <p className="text-sm text-red-400">{formatProcessingError(doc.processingError)}</p>
          </div>
        )}
      </Card>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        {doc.source === 'upload' && (
          <Button variant="outline" size="sm" asChild>
            <a href={`/api/documents/${doc.id}/file`} target="_blank" rel="noopener noreferrer">
              <FileDown className="h-3.5 w-3.5" />
              View Original
            </a>
          </Button>
        )}
        {doc.sourceUrl && (
          <Button variant="outline" size="sm" asChild>
            <a href={doc.sourceUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
              Source URL
            </a>
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={handleArchive} disabled={archiving}>
          {archiving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : doc.archivedAt ? (
            <ArchiveRestore className="h-3.5 w-3.5" />
          ) : (
            <Archive className="h-3.5 w-3.5" />
          )}
          {doc.archivedAt ? 'Unarchive' : 'Archive'}
        </Button>

        {!processing && (
          <Button variant="outline" size="sm" onClick={handleReprocess} disabled={reprocessing}>
            {reprocessing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Reprocess
          </Button>
        )}

        {doc.status === 'ready' && (
          <>
            <Button variant="outline" size="sm" onClick={handleReclean} disabled={recleaning}>
              {recleaning ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Eraser className="h-3.5 w-3.5" />
              )}
              Re-clean
            </Button>
            <Button variant="outline" size="sm" onClick={handleAiCleanup} disabled={aiCleaning}>
              {aiCleaning ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              AI Clean-up
            </Button>
          </>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={() => setShowDeleteConfirm(true)}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </Button>
      </div>

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete Document"
          description={`Permanently delete "${doc.title}"? This will remove the file and all chunks.`}
          confirmLabel="Delete"
          confirmVariant="destructive"
          loading={deleting}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

      {/* Content tabs */}
      {(doc.cleanedText || doc.rawText || chunks.length > 0) && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                contentTab === 'document'
                  ? 'bg-white/10 text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
              }`}
              onClick={() => setContentTab('document')}
            >
              Document
            </button>
            {chunks.length > 0 && (
              <button
                type="button"
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  contentTab === 'chunks'
                    ? 'bg-white/10 text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                }`}
                onClick={() => setContentTab('chunks')}
              >
                Chunks
                <span className="ml-1.5 text-muted-foreground font-normal">({chunks.length})</span>
              </button>
            )}
          </div>

          {contentTab === 'document' ? (
            <Card className="p-5">
              <div className="max-h-[70vh] overflow-y-auto scrollbar-thin scrollbar-thin pr-2">
                {doc.cleanedText || doc.rawText ? (
                  <MarkdownRenderer content={doc.cleanedText || doc.rawText || ''} />
                ) : (
                  <p className="text-sm text-muted-foreground">No text extracted.</p>
                )}
              </div>
            </Card>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto scrollbar-thin space-y-2 pr-1">
              {chunks.map((chunk) => (
                <ChunkCard key={chunk.id} chunk={chunk} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
