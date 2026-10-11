import { Badge } from '@repo/ui/badge';
import { Card } from '@repo/ui/card';
import { Checkbox } from '@repo/ui/checkbox';
import { Microscope } from 'lucide-react';
import Link from 'next/link';
import type { DocumentReviewStats } from '@/lib/types';
import { DocumentActions } from './document-actions';
import type { DocumentWithChunks } from './page';
import { FileIcon, StatusBadge } from './shared';
import { useDocumentStore } from './store';
import type { DocumentType } from './utils';
import { formatFileSize, formatRelativeDate, TYPE_CONFIG } from './utils';

function ReviewProgress({ stats }: { stats: DocumentReviewStats }) {
  if (stats.total === 0)
    return <span className="text-xs text-muted-foreground shrink-0">0 chunks</span>;
  const pctApproved = Math.round((stats.approved / stats.total) * 100);
  return (
    <div className="flex items-center gap-2 shrink-0">
      <div className="w-16 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all"
          style={{ width: `${pctApproved}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground">
        {stats.approved}/{stats.total}
      </span>
    </div>
  );
}

interface DocumentRowProps {
  doc: DocumentWithChunks;
}

export function DocumentRow({ doc }: DocumentRowProps) {
  const { selectedIds, toggleSelected } = useDocumentStore();
  const isSelected = selectedIds.has(doc.id);

  return (
    <Card className={`overflow-visible${isSelected ? ' ring-1 ring-lime-500/30' : ''}`}>
      <div className="flex w-full items-center gap-3 p-4">
        <Checkbox checked={isSelected} onChange={() => toggleSelected(doc.id)} />
        <Link
          href={`/documents/${doc.id}`}
          className="flex flex-1 items-center gap-3 min-w-0 hover:opacity-80 transition-opacity"
        >
          <StatusBadge status={doc.status} />
          {doc.archivedAt && (
            <Badge
              variant="outline"
              className="text-xs bg-white/5 text-white/40 border-white/10 shrink-0"
            >
              Archived
            </Badge>
          )}
          {doc.aiDocumentType && TYPE_CONFIG[doc.aiDocumentType as DocumentType] && (
            <Badge
              variant="outline"
              className={`text-[10px] shrink-0 ${TYPE_CONFIG[doc.aiDocumentType as DocumentType].className}`}
            >
              {TYPE_CONFIG[doc.aiDocumentType as DocumentType].label}
            </Badge>
          )}
          <FileIcon mime={doc.mimeType} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{doc.title}</p>
            {doc.title !== doc.filename && (
              <p className="truncate text-xs text-muted-foreground">{doc.filename}</p>
            )}
          </div>
          <span className="text-xs text-muted-foreground shrink-0">
            {formatFileSize(doc.fileSize)}
          </span>
          {doc.status === 'ready' && doc.chunkCount > 0 && (
            <ReviewProgress stats={doc.reviewStats} />
          )}
          <span className="text-xs text-muted-foreground shrink-0">
            {formatRelativeDate(doc.createdAt)}
          </span>
        </Link>
        {doc.status === 'ready' && doc.chunkCount > 0 && (
          <Link
            href={`/documents/${doc.id}/review`}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors shrink-0"
          >
            <Microscope className="h-3.5 w-3.5" />
            Review
          </Link>
        )}
        <DocumentActions doc={doc} />
      </div>
    </Card>
  );
}
