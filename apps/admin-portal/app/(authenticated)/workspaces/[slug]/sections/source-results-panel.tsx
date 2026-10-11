'use client';

import { Badge } from '@repo/ui/badge';
import { Button } from '@repo/ui/button';
import { Card, CardContent } from '@repo/ui/card';
import { BookOpen, FileText, Globe, Loader2, Search, X } from 'lucide-react';

export type SourceChunk = {
  chunkId: number;
  content: string;
  score: number;
  chunkIndex: number;
  pageRange?: string;
  sectionHeading?: string;
};

export type SourceResult = {
  documentId: number;
  documentTitle: string;
  bestScore: number;
  chunks: SourceChunk[];
};

interface SourceResultsPanelProps {
  query: string;
  sources: SourceResult[];
  loading: boolean;
  onClose: () => void;
  onSearchOnline?: (text: string) => void;
}

function scoreLabel(score: number): { text: string; className: string } {
  if (score >= 0.8) return { text: 'Strong match', className: 'text-green-400' };
  if (score >= 0.6) return { text: 'Good match', className: 'text-lime-400' };
  if (score >= 0.4) return { text: 'Partial match', className: 'text-yellow-400' };
  return { text: 'Weak match', className: 'text-orange-400' };
}

function formatLocation(chunk: SourceChunk): string | null {
  const parts: string[] = [];
  if (chunk.pageRange) {
    const isRange = chunk.pageRange.includes('-');
    parts.push(`${isRange ? 'pp' : 'p'}.${chunk.pageRange}`);
  }
  if (chunk.sectionHeading) {
    parts.push(chunk.sectionHeading);
  }
  return parts.length > 0 ? parts.join(', ') : null;
}

export function SourceResultsPanel({
  query,
  sources,
  loading,
  onClose,
  onSearchOnline,
}: SourceResultsPanelProps) {
  const hasResults = sources.length > 0;

  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen size={14} className="text-lime-400" />
            <span className="text-xs font-medium">Find Source</span>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-6 px-1.5">
            <X size={12} />
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground truncate">
          Searching for: &ldquo;{query}&rdquo;
        </p>

        {loading && (
          <div className="flex items-center gap-2 py-4 justify-center text-muted-foreground">
            <Loader2 size={14} className="animate-spin" />
            <span className="text-xs">Searching documents...</span>
          </div>
        )}

        {!loading && hasResults && (
          <div className="space-y-2">
            {sources.map((source) => {
              const label = scoreLabel(source.bestScore);
              return (
                <div
                  key={source.documentId}
                  className="rounded-lg border border-border p-2.5 space-y-2"
                >
                  <div className="flex items-start gap-2">
                    <FileText size={14} className="text-muted-foreground shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium truncate">{source.documentTitle}</span>
                        <Badge
                          variant="secondary"
                          className={`text-[10px] px-1.5 py-0 shrink-0 ${label.className}`}
                        >
                          {Math.round(source.bestScore * 100)}% {label.text}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {source.chunks.map((chunk) => {
                    const location = formatLocation(chunk);
                    return (
                      <div
                        key={chunk.chunkId}
                        className="ml-5 rounded bg-white/[0.02] p-2 space-y-1"
                      >
                        {location && (
                          <p className="text-[10px] text-lime-400/70 font-medium">{location}</p>
                        )}
                        <p className="text-[11px] text-foreground/60 line-clamp-3 font-mono">
                          {chunk.content}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {Math.round(chunk.score * 100)}% similarity
                        </p>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        {!loading && !hasResults && (
          <div className="py-4 text-center space-y-3">
            <div className="flex flex-col items-center gap-1.5">
              <Search size={20} className="text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                No matching sources found in your documents.
              </p>
            </div>
          </div>
        )}

        {/* Search online — useful when no local source found, or to cross-reference */}
        {!loading && onSearchOnline && (
          <div className="flex gap-2 pt-1 border-t border-white/5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSearchOnline(query)}
              className="h-7 px-2 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <Globe size={12} />
              Search Online
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
