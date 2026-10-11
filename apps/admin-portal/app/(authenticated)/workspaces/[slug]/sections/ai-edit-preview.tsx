'use client';

import { Button } from '@repo/ui/button';
import { Card, CardContent } from '@repo/ui/card';
import { Check, Loader2, X } from 'lucide-react';
import { VersionDiff } from './version-diff';

interface AiEditPreviewProps {
  originalContent: string;
  modifiedContent: string;
  action: string;
  loading: boolean;
  onAccept: () => void;
  onReject: () => void;
}

const ACTION_LABELS: Record<string, string> = {
  rewrite: 'Rewrite',
  expand: 'Expand',
  simplify: 'Simplify',
  analyse: 'Analyse',
  research: 'Research',
  custom: 'Custom Edit',
};

export function AiEditPreview({
  originalContent,
  modifiedContent,
  action,
  loading,
  onAccept,
  onReject,
}: AiEditPreviewProps) {
  return (
    <Card className="border-primary/30 bg-primary/[0.02]">
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-primary">
              AI {ACTION_LABELS[action] ?? action}
            </span>
            {loading && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 size={12} className="animate-spin" />
                Generating...
              </span>
            )}
          </div>
          {!loading && (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={onReject}
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                <X size={12} className="mr-1" />
                Reject
              </Button>
              <Button size="sm" onClick={onAccept} className="h-7 px-2 text-xs">
                <Check size={12} className="mr-1" />
                Accept
              </Button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="max-h-[400px] overflow-y-auto scrollbar-thin rounded border border-border p-3">
            <VersionDiff oldText={originalContent} newText={modifiedContent} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
