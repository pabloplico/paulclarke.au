'use client';

import { Badge } from '@repo/ui/badge';
import { Button } from '@repo/ui/button';
import { Card, CardContent } from '@repo/ui/card';
import { Check, Loader2, X } from 'lucide-react';

interface TopicPillPreviewProps {
  topics: string[];
  loading: boolean;
  onAccept: () => void;
  onReject: () => void;
}

export function TopicPillPreview({ topics, loading, onAccept, onReject }: TopicPillPreviewProps) {
  return (
    <Card className="border-primary/30 bg-primary/[0.02]">
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-primary">AI Analyse</span>
            {loading && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 size={12} className="animate-spin" />
                Extracting topics...
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
          <div className="flex flex-wrap gap-1.5 py-2">
            {topics.map((topic) => (
              <Badge
                key={topic}
                variant="secondary"
                className="bg-white/10 text-foreground/80 text-xs"
              >
                {topic}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
