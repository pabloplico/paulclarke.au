'use client';

import { Badge } from '@repo/ui/badge';
import { Button } from '@repo/ui/button';
import { ExternalLink, FileText, Lightbulb, Save } from 'lucide-react';
import { useRef, useState } from 'react';
import type { DocumentSource, FindingSource } from '@/lib/workspaces/types';
import { useTypography } from '@/lib/workspaces/typography';
import { MarkdownRenderer } from './markdown-renderer';

interface ProseSectionProps {
  content: string;
  topics?: string[];
  sources?: DocumentSource[];
  findingSources?: FindingSource[];
  isEditing: boolean;
  saving: boolean;
  onSave: (data: { content: string }, changeDescription?: string) => Promise<void>;
  onEdit?: () => void;
}

export function ProseSection({
  content,
  topics,
  sources,
  findingSources,
  isEditing,
  saving,
  onSave,
  onEdit,
}: ProseSectionProps) {
  const [draft, setDraft] = useState(content);
  const { cssVars } = useTypography();
  const _contentRef = useRef<HTMLDivElement>(null);
  const lastHeightRef = useRef<number>(200);

  if (!isEditing) {
    if (!content) {
      return (
        <p
          className="text-sm text-muted-foreground italic cursor-pointer hover:text-muted-foreground/80"
          onDoubleClick={onEdit}
        >
          No content yet. Double-click or click Edit to add content.
        </p>
      );
    }
    return (
      <div
        ref={(el) => {
          if (el) lastHeightRef.current = el.offsetHeight;
        }}
        data-prose-content
        style={
          {
            fontFamily: 'var(--typo-font)',
            lineHeight: 'var(--typo-line-height)',
            maxWidth: 'var(--typo-max-width)',
            paddingLeft: 'var(--typo-body-indent)',
            ...cssVars,
          } as React.CSSProperties
        }
      >
        {topics && topics.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {topics.map((topic) => (
              <Badge
                key={topic}
                variant="secondary"
                className="bg-white/5 text-foreground/70 text-[10px]"
              >
                {topic}
              </Badge>
            ))}
          </div>
        )}
        <MarkdownRenderer content={content} />
        {((sources && sources.length > 0) || (findingSources && findingSources.length > 0)) && (
          <div className="mt-3 pt-3 border-t border-white/5 flex flex-wrap gap-1.5">
            {sources?.map((src) => (
              <Badge
                key={`doc-${src.id}`}
                variant="secondary"
                className="bg-white/5 text-foreground/50 text-[10px] gap-1"
              >
                <FileText size={10} />
                {src.title}
                {src.sourceUrl && (
                  <a
                    href={src.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="hover:text-foreground/70"
                  >
                    <ExternalLink size={10} />
                  </a>
                )}
              </Badge>
            ))}
            {findingSources?.map((f) => (
              <Badge
                key={`finding-${f.id}`}
                variant="secondary"
                className="bg-lime-500/10 text-lime-400/70 text-[10px] gap-1 border border-lime-500/20"
                title={`${f.findingType} finding (${Math.round(f.confidenceScore * 100)}% confidence)`}
              >
                <Lightbulb size={10} />
                {f.title.length > 40 ? `${f.title.slice(0, 40)}...` : f.title}
                {f.url && (
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="hover:text-lime-300"
                  >
                    <ExternalLink size={10} />
                  </a>
                )}
              </Badge>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        style={{ minHeight: Math.max(200, lastHeightRef.current) }}
        className="w-full rounded-md border border-border bg-white/5 px-3 py-2 text-sm text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-ring resize-y"
        placeholder="Write markdown content..."
      />
      <div className="flex justify-end">
        <Button
          size="sm"
          disabled={saving || draft === content}
          onClick={() => onSave({ content: draft })}
        >
          <Save size={14} className="mr-1.5" />
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
