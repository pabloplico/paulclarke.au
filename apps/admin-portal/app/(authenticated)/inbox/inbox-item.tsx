'use client';

import { Badge } from '@repo/ui/badge';
import { Button } from '@repo/ui/button';
import { Card, CardContent } from '@repo/ui/card';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  FileText,
  Globe,
  Loader2,
  RefreshCw,
  StickyNote,
  X,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { formatProcessingError } from '@/lib/document-processing/format-error';
import type { ApprovedResult, InboxItem, QualityFlag, RoutingSuggestion } from './store';

const TYPE_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  file: FileText,
  url: Globe,
  note: StickyNote,
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-500/10 text-yellow-400',
  processing: 'bg-blue-500/10 text-blue-400',
  routed: 'bg-green-500/10 text-green-400',
  failed: 'bg-red-500/10 text-red-400',
  approved: 'bg-green-500/10 text-green-400',
  dismissed: 'bg-muted text-muted-foreground',
};

function formatTime(date: string): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return d.toLocaleDateString();
}

interface InboxItemCardProps {
  item: InboxItem;
  onUpdate: (id: number, patch: Partial<InboxItem>) => void;
  onRemove: (id: number) => void;
}

export function InboxItemCard({ item, onUpdate, onRemove: _onRemove }: InboxItemCardProps) {
  const [expandedSuggestion, setExpandedSuggestion] = useState<number | null>(null);
  const [showMoreSuggestions, setShowMoreSuggestions] = useState(false);
  const [showQualityFlags, setShowQualityFlags] = useState(false);
  const [approving, setApproving] = useState<number | null>(null);
  const [skipping, setSkipping] = useState<number | null>(null);
  const [dismissing, setDismissing] = useState(false);
  const [rerouting, setRerouting] = useState(false);
  const [existingContent, setExistingContent] = useState<Record<number, string>>({});

  const Icon = TYPE_ICONS[item.type] ?? FileText;
  const suggestions = item.routingResults ?? [];

  const handleApprove = async (index: number) => {
    setApproving(index);
    try {
      const res = await fetch(`/api/inbox/${item.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestionIndex: index }),
      });
      if (res.ok) {
        const data = await res.json();
        const remaining = suggestions.filter((_, i) => i !== index);
        const existingApproved = item.approvedResults ?? [];
        const updatedApproved = data.approvedResult
          ? [...existingApproved, data.approvedResult as ApprovedResult]
          : existingApproved;

        if (remaining.length === 0) {
          onUpdate(item.id, {
            routingResults: null,
            approvedResults: updatedApproved,
            status: 'approved',
          });
        } else {
          onUpdate(item.id, {
            routingResults: remaining,
            approvedResults: updatedApproved,
          });
        }
      }
    } finally {
      setApproving(null);
    }
  };

  const handleSkip = async (index: number) => {
    setSkipping(index);
    try {
      const res = await fetch(`/api/inbox/${item.id}/skip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestionIndex: index }),
      });
      if (res.ok) {
        const remaining = suggestions.filter((_, i) => i !== index);
        const hasApproved = (item.approvedResults ?? []).length > 0;
        if (remaining.length === 0) {
          onUpdate(item.id, {
            routingResults: null,
            status: hasApproved ? 'approved' : 'dismissed',
          });
        } else {
          onUpdate(item.id, { routingResults: remaining });
        }
      }
    } finally {
      setSkipping(null);
    }
  };

  const handleDismiss = async () => {
    setDismissing(true);
    try {
      const res = await fetch(`/api/inbox/${item.id}/dismiss`, { method: 'POST' });
      if (res.ok) {
        onUpdate(item.id, { status: 'dismissed' });
      }
    } finally {
      setDismissing(false);
    }
  };

  const handleReroute = async () => {
    setRerouting(true);
    try {
      const res = await fetch(`/api/inbox/${item.id}/reroute`, { method: 'POST' });
      if (res.ok) {
        onUpdate(item.id, { status: 'pending', routingResults: null, processingError: null });
      }
    } finally {
      setRerouting(false);
    }
  };

  return (
    <Card className={item.status === 'dismissed' ? 'opacity-50' : ''}>
      <CardContent className="pt-4 space-y-3">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/5">
            <Icon size={16} className="text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-medium truncate">{item.title}</h4>
              <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[item.status] ?? ''}`}>
                {item.status}
              </Badge>
              {item.gapFindingRef && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  Gap fix
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{formatTime(item.createdAt)}</p>
          </div>
          <div className="flex gap-1 shrink-0">
            {item.status === 'failed' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReroute}
                aria-label="Retry routing"
                disabled={rerouting}
                className="h-7 px-2 text-xs"
              >
                {rerouting ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <RefreshCw size={12} />
                )}
              </Button>
            )}
            {item.status !== 'dismissed' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDismiss}
                aria-label="Dismiss"
                disabled={dismissing}
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                {dismissing ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
              </Button>
            )}
          </div>
        </div>

        {/* Error */}
        {item.processingError && (
          <p className="text-xs text-red-400 bg-red-500/5 rounded px-2 py-1">
            {formatProcessingError(item.processingError)}
          </p>
        )}

        {/* Quality flags */}
        {item.qualityFlags && item.qualityFlags.length > 0 && (
          <QualityFlagsBadge
            flags={item.qualityFlags}
            expanded={showQualityFlags}
            onToggle={() => setShowQualityFlags(!showQualityFlags)}
          />
        )}

        {/* Processing indicator */}
        {item.status === 'pending' && item.documentStatus === 'error' ? (
          <div className="space-y-2">
            <p className="text-xs text-red-400 bg-red-500/5 rounded px-2 py-1">
              {formatProcessingError(item.documentError) ?? 'Document processing failed'}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReroute}
              disabled={rerouting}
              className="h-7 px-2 text-xs gap-1"
            >
              {rerouting ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              Retry
            </Button>
          </div>
        ) : item.status === 'pending' || item.status === 'processing' ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 size={12} className="animate-spin" />
            <span>{item.status === 'pending' ? 'Queued for routing...' : 'AI is routing...'}</span>
          </div>
        ) : null}

        {/* Routing suggestions */}
        {suggestions.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              {suggestions.length} routing {suggestions.length === 1 ? 'suggestion' : 'suggestions'}
            </p>
            {suggestions.slice(0, 3).map((suggestion, i) => (
              <SuggestionCard
                key={`${suggestion.sectionId}-${i}`}
                suggestion={suggestion}
                index={i}
                expandedSuggestion={expandedSuggestion}
                setExpandedSuggestion={setExpandedSuggestion}
                existingContent={existingContent}
                setExistingContent={setExistingContent}
                approving={approving}
                skipping={skipping}
                onApprove={handleApprove}
                onSkip={handleSkip}
              />
            ))}
            {suggestions.length > 3 && (
              <>
                <button
                  type="button"
                  onClick={() => setShowMoreSuggestions(!showMoreSuggestions)}
                  className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground w-full px-1 py-1"
                >
                  {showMoreSuggestions ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  <span>
                    {showMoreSuggestions ? 'Hide' : 'Show'} {suggestions.length - 3} more{' '}
                    {suggestions.length - 3 === 1 ? 'suggestion' : 'suggestions'}
                  </span>
                </button>
                {showMoreSuggestions &&
                  suggestions
                    .slice(3)
                    .map((suggestion, i) => (
                      <SuggestionCard
                        key={`${suggestion.sectionId}-${i + 3}`}
                        suggestion={suggestion}
                        index={i + 3}
                        expandedSuggestion={expandedSuggestion}
                        setExpandedSuggestion={setExpandedSuggestion}
                        existingContent={existingContent}
                        setExistingContent={setExistingContent}
                        approving={approving}
                        skipping={skipping}
                        onApprove={handleApprove}
                        onSkip={handleSkip}
                      />
                    ))}
              </>
            )}
          </div>
        )}

        {/* Approved results */}
        {item.approvedResults && item.approvedResults.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              {item.approvedResults.length} approved
            </p>
            {item.approvedResults.map((result) => (
              <div
                key={`${result.sectionId}-${result.versionId}`}
                className="flex items-center gap-2 text-xs"
              >
                <Check size={12} className="text-green-400 shrink-0" />
                <Link
                  href={`/workspaces/${result.workspaceSlug}`}
                  className="flex items-center gap-1 hover:underline"
                >
                  <span className="font-medium">{result.workspaceTitle}</span>
                  <ArrowRight size={10} className="text-muted-foreground" />
                  <span className="text-muted-foreground">{result.sectionTitle}</span>
                </Link>
              </div>
            ))}
          </div>
        )}

        {/* Content preview for notes */}
        {item.type === 'note' && item.content && (
          <p className="text-xs text-muted-foreground line-clamp-2">{item.content}</p>
        )}
      </CardContent>
    </Card>
  );
}

function SuggestionCard({
  suggestion,
  index,
  expandedSuggestion,
  setExpandedSuggestion,
  existingContent,
  setExistingContent,
  approving,
  skipping,
  onApprove,
  onSkip,
}: {
  suggestion: RoutingSuggestion;
  index: number;
  expandedSuggestion: number | null;
  setExpandedSuggestion: (i: number | null) => void;
  existingContent: Record<number, string>;
  setExistingContent: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  approving: number | null;
  skipping: number | null;
  onApprove: (index: number) => void;
  onSkip: (index: number) => void;
}) {
  return (
    <div className="rounded-lg border border-border p-2.5 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-medium">{suggestion.workspaceTitle}</span>
            <ArrowRight size={10} className="text-muted-foreground" />
            <span className="text-muted-foreground">{suggestion.sectionTitle}</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">{suggestion.reasoning}</p>
        </div>
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
          {Math.round(suggestion.confidence * 100)}%
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            if (expandedSuggestion === index) {
              setExpandedSuggestion(null);
              return;
            }
            setExpandedSuggestion(index);
            if (!(suggestion.sectionId in existingContent)) {
              try {
                const res = await fetch(`/api/sections/${suggestion.sectionId}/content`);
                if (res.ok) {
                  const data = await res.json();
                  setExistingContent((prev) => ({
                    ...prev,
                    [suggestion.sectionId]: data.content ?? '',
                  }));
                }
              } catch {
                // ignore — will just show proposed content
              }
            }
          }}
          className="h-6 px-1.5 text-[10px]"
        >
          {expandedSuggestion === index ? 'Hide' : 'Preview'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onSkip(index)}
          disabled={approving !== null || skipping !== null}
          className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
        >
          {skipping === index ? <Loader2 size={10} className="animate-spin" /> : 'Skip'}
        </Button>
        <Button
          size="sm"
          onClick={() => onApprove(index)}
          disabled={approving !== null || skipping !== null}
          className="h-6 px-2 text-[10px]"
        >
          {approving === index ? (
            <Loader2 size={10} className="animate-spin" />
          ) : (
            <>
              <Check size={10} className="mr-0.5" />
              Approve
            </>
          )}
        </Button>
      </div>

      {expandedSuggestion === index && (
        <SuggestionPreview
          action={suggestion.action}
          existing={existingContent[suggestion.sectionId]}
          proposed={suggestion.suggestedContent}
        />
      )}
    </div>
  );
}

function SuggestionPreview({
  action,
  existing,
  proposed,
}: {
  action: string;
  existing?: string;
  proposed: string;
}) {
  const hasExisting = existing !== undefined && existing.length > 0;

  // For replace/append with existing content, show side-by-side
  if (hasExisting) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <p className="text-[10px] font-medium text-muted-foreground mb-1">Current</p>
          <div className="text-xs text-foreground/50 bg-white/[0.02] rounded p-2 font-mono whitespace-pre-wrap max-h-[200px] overflow-y-auto scrollbar-thin border border-white/5">
            {existing || <span className="italic text-muted-foreground">(empty)</span>}
          </div>
        </div>
        <div>
          <p className="text-[10px] font-medium text-lime-400/70 mb-1">
            {action === 'append'
              ? 'Appending'
              : action === 'replace'
                ? 'Replacing with'
                : 'Proposed'}
          </p>
          <div className="text-xs text-foreground/70 bg-lime-500/[0.03] rounded p-2 font-mono whitespace-pre-wrap max-h-[200px] overflow-y-auto scrollbar-thin border border-lime-500/10">
            {proposed}
          </div>
        </div>
      </div>
    );
  }

  // No existing content or still loading — just show proposed
  return (
    <div>
      {existing === undefined && (
        <p className="text-[10px] text-muted-foreground mb-1">Loading current content...</p>
      )}
      <div className="text-xs text-foreground/70 bg-white/[0.02] rounded p-2 font-mono whitespace-pre-wrap max-h-[200px] overflow-y-auto scrollbar-thin">
        {proposed}
      </div>
    </div>
  );
}

function QualityFlagsBadge({
  flags,
  expanded,
  onToggle,
}: {
  flags: QualityFlag[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const errors = flags.filter((f) => f.severity === 'error');
  const warnings = flags.filter((f) => f.severity === 'warning');
  const hasErrors = errors.length > 0;

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={onToggle}
        className={`flex items-center gap-1.5 text-[11px] rounded px-2 py-1 w-full text-left ${
          hasErrors
            ? 'bg-red-500/5 text-red-400 hover:bg-red-500/10'
            : 'bg-yellow-500/5 text-yellow-400 hover:bg-yellow-500/10'
        }`}
      >
        {hasErrors ? <XCircle size={12} /> : <AlertTriangle size={12} />}
        <span className="flex-1">
          {errors.length > 0 && `${errors.length} error${errors.length > 1 ? 's' : ''}`}
          {errors.length > 0 && warnings.length > 0 && ', '}
          {warnings.length > 0 && `${warnings.length} warning${warnings.length > 1 ? 's' : ''}`}
        </span>
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      {expanded && (
        <div className="space-y-1 pl-2">
          {flags.map((flag) => (
            <p
              key={flag.code}
              className={`text-[11px] ${flag.severity === 'error' ? 'text-red-400' : flag.severity === 'warning' ? 'text-yellow-400' : 'text-muted-foreground'}`}
            >
              <span className="font-mono text-[10px] mr-1">[{flag.stage}]</span>
              {flag.message}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
