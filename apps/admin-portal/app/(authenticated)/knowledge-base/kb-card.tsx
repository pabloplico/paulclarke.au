'use client';

import { Button } from '@repo/ui/button';
import { Card, CardContent } from '@repo/ui/card';
import { FileText, Hash, Trash2 } from 'lucide-react';
import Link from 'next/link';
import type { KnowledgeBaseWithStats } from '@/lib/types';

interface KbCardProps {
  kb: KnowledgeBaseWithStats;
  onDelete: (id: number, name: string) => void;
}

export function KbCard({ kb, onDelete }: KbCardProps) {
  return (
    <Card className="group relative overflow-hidden">
      <Link href={`/knowledge-base/${kb.id}`} className="block">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <div
              className="mt-0.5 h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: kb.color || '#6b7280' }}
            />
            <div className="min-w-0 flex-1">
              <h3 className="font-medium text-sm truncate">{kb.name}</h3>
              {kb.description && (
                <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{kb.description}</p>
              )}
              <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Hash className="h-3 w-3" />
                  {kb.chunkCount} chunks
                </span>
                <span className="flex items-center gap-1">
                  <FileText className="h-3 w-3" />
                  {kb.documentCount} docs
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Link>
      <Button
        variant="ghost"
        size="sm"
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
        aria-label={`Delete ${kb.name}`}
        onClick={(e) => {
          e.preventDefault();
          onDelete(kb.id, kb.name);
        }}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </Card>
  );
}
