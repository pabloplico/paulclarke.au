'use client';

import { Badge } from '@repo/ui/badge';
import { Button } from '@repo/ui/button';
import { Card } from '@repo/ui/card';
import { Input } from '@repo/ui/input';
import { BookOpen, Check, Hash, ParkingMeter, X } from 'lucide-react';
import { useState } from 'react';
import type { ChunkWithCuration, CurationStatus, KnowledgeBaseWithStats } from '@/lib/types';
import { CURATION_CONFIG } from './utils';

interface ChunkCardProps {
  chunk: ChunkWithCuration;
  focused: boolean;
  knowledgeBases?: KnowledgeBaseWithStats[];
  onStatusChange: (chunkId: number, status: CurationStatus) => void;
  onNoteChange: (chunkId: number, note: string) => void;
  onKbAssigned?: (chunkId: number, kbId: number) => void;
}

export function ChunkCard({
  chunk,
  focused,
  knowledgeBases,
  onStatusChange,
  onNoteChange,
  onKbAssigned,
}: ChunkCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [noteValue, setNoteValue] = useState(chunk.curatorNote || '');
  const [showKbMenu, setShowKbMenu] = useState(false);

  const config = CURATION_CONFIG[chunk.curationStatus as CurationStatus] ?? CURATION_CONFIG.raw;
  const contentPreview = expanded ? chunk.content : chunk.content.slice(0, 300);
  const sectionHeading = (chunk.metadata as Record<string, unknown> | null)?.sectionHeading as
    | string
    | undefined;
  const contentType = (chunk.metadata as Record<string, unknown> | null)?.contentType as
    | string
    | undefined;

  const handleSaveNote = () => {
    onNoteChange(chunk.id, noteValue);
    setEditingNote(false);
  };

  return (
    <Card
      className={`overflow-hidden transition-colors ${focused ? 'ring-1 ring-primary/50' : ''}`}
      data-chunk-id={chunk.id}
    >
      <div className="p-4 space-y-3">
        {/* Header row */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className={config.className}>
            {config.label}
          </Badge>
          <span className="text-xs text-muted-foreground">
            <Hash className="inline h-3 w-3" />
            {chunk.chunkIndex}
          </span>
          {chunk.tokenCount && (
            <span className="text-xs text-muted-foreground">{chunk.tokenCount} tokens</span>
          )}
          {contentType && (
            <Badge variant="secondary" className="text-xs">
              {contentType}
            </Badge>
          )}
          {sectionHeading && (
            <span className="text-xs text-muted-foreground truncate max-w-[200px]">
              {sectionHeading}
            </span>
          )}
          {/* KB assignment badges */}
          {chunk.kbAssignments.map((kb) => (
            <Badge key={kb.knowledgeBaseId} variant="outline" className="text-xs gap-1">
              <span
                className="h-2 w-2 rounded-full inline-block"
                style={{ backgroundColor: kb.color || '#6b7280' }}
              />
              {kb.name}
            </Badge>
          ))}
        </div>

        {/* Content */}
        <button type="button" className="text-left w-full" onClick={() => setExpanded(!expanded)}>
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {contentPreview}
            {!expanded && chunk.content.length > 300 && (
              <span className="text-primary ml-1">...more</span>
            )}
          </p>
        </button>

        {/* Curator note */}
        {editingNote ? (
          <div className="flex items-center gap-2">
            <Input
              value={noteValue}
              onChange={(e) => setNoteValue(e.target.value)}
              placeholder="Curator note..."
              className="text-xs h-8"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveNote();
                if (e.key === 'Escape') setEditingNote(false);
              }}
              autoFocus
            />
            <Button variant="ghost" size="sm" onClick={handleSaveNote}>
              Save
            </Button>
          </div>
        ) : chunk.curatorNote ? (
          <button
            type="button"
            className="text-xs text-muted-foreground italic text-left"
            onClick={() => setEditingNote(true)}
          >
            Note: {chunk.curatorNote}
          </button>
        ) : null}

        {/* Actions */}
        <div className="flex items-center gap-1.5">
          <Button
            variant={chunk.curationStatus === 'approved' ? 'default' : 'outline'}
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => onStatusChange(chunk.id, 'approved')}
          >
            <Check className="h-3 w-3" />
            Approve
          </Button>
          <Button
            variant={chunk.curationStatus === 'excluded' ? 'destructive' : 'outline'}
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => onStatusChange(chunk.id, 'excluded')}
          >
            <X className="h-3 w-3" />
            Exclude
          </Button>
          <Button
            variant={chunk.curationStatus === 'parked' ? 'secondary' : 'outline'}
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => onStatusChange(chunk.id, 'parked')}
          >
            <ParkingMeter className="h-3 w-3" />
            Park
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setEditingNote(true)}
            >
              {chunk.curatorNote ? 'Edit note' : 'Add note'}
            </button>
            {chunk.curationStatus === 'approved' && knowledgeBases && knowledgeBases.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setShowKbMenu(!showKbMenu)}
                >
                  <BookOpen className="h-3 w-3" />
                  Add to KB
                </button>
                {showKbMenu && (
                  <div className="absolute right-0 bottom-full mb-1 z-10 min-w-[180px] rounded-md border border-white/10 bg-background p-1 shadow-lg">
                    {knowledgeBases.map((kb) => {
                      const alreadyAssigned = chunk.kbAssignments.some(
                        (a) => a.knowledgeBaseId === kb.id
                      );
                      return (
                        <button
                          key={kb.id}
                          type="button"
                          disabled={alreadyAssigned}
                          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-white/5 disabled:opacity-40"
                          onClick={() => {
                            onKbAssigned?.(chunk.id, kb.id);
                            setShowKbMenu(false);
                          }}
                        >
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: kb.color || '#6b7280' }}
                          />
                          {kb.name}
                          {alreadyAssigned && (
                            <Check className="h-3 w-3 ml-auto text-emerald-400" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
