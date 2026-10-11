'use client';

import { ChevronDown, ExternalLink } from 'lucide-react';
import { useState } from 'react';

interface Finding {
  id: number;
  title: string;
  content: string;
  findingType: string;
  confidenceScore: number;
  sentimentScore: number | null;
  geo: { country?: string; state?: string; city?: string } | null;
  tags: { sectors?: string[]; topics?: string[]; entities?: string[] } | null;
  url: string | null;
  publishedAt: string | null;
  createdAt: string;
}

const TYPE_COLORS: Record<string, string> = {
  trend: 'bg-blue-500/10 text-blue-400',
  competitor: 'bg-purple-500/10 text-purple-400',
  pricing: 'bg-green-500/10 text-green-400',
  regulation: 'bg-red-500/10 text-red-400',
  sentiment: 'bg-yellow-500/10 text-yellow-400',
  statistic: 'bg-cyan-500/10 text-cyan-400',
  news: 'bg-orange-500/10 text-orange-400',
};

export function FindingCard({ finding, similarity }: { finding: Finding; similarity?: number }) {
  const [expanded, setExpanded] = useState(false);
  const typeColor = TYPE_COLORS[finding.findingType] ?? 'bg-white/5 text-muted-foreground';
  const isLong = finding.content.length > 200;

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium text-foreground text-sm leading-snug">{finding.title}</h3>
        <div className="flex items-center gap-2 shrink-0">
          {similarity != null && (
            <span className="text-xs text-lime-500 font-medium">
              {(similarity * 100).toFixed(0)}%
            </span>
          )}
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${typeColor}`}>
            {finding.findingType}
          </span>
        </div>
      </div>

      <p className={`text-sm text-muted-foreground ${expanded ? '' : 'line-clamp-3'}`}>
        {finding.content}
      </p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-lime-500 hover:text-lime-400 transition-colors"
        >
          <ChevronDown
            size={12}
            className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span
          className={`font-medium ${
            finding.confidenceScore >= 0.7
              ? 'text-lime-500'
              : finding.confidenceScore >= 0.4
                ? 'text-yellow-500'
                : 'text-red-400'
          }`}
        >
          {(finding.confidenceScore * 100).toFixed(0)}% confidence
        </span>
        {finding.sentimentScore != null && (
          <span
            className={
              finding.sentimentScore > 0.2
                ? 'text-lime-500'
                : finding.sentimentScore < -0.2
                  ? 'text-red-400'
                  : 'text-muted-foreground'
            }
          >
            {finding.sentimentScore > 0.2
              ? 'Positive'
              : finding.sentimentScore < -0.2
                ? 'Negative'
                : 'Neutral'}
          </span>
        )}
        {finding.geo?.country && <span>{finding.geo.country}</span>}
        {finding.url && (
          <a
            href={finding.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-lime-500 hover:text-lime-400"
          >
            Source <ExternalLink size={10} />
          </a>
        )}
        <span className="ml-auto">{new Date(finding.createdAt).toLocaleDateString()}</span>
      </div>

      {finding.tags && (
        <div className="flex flex-wrap gap-1">
          {finding.tags.topics?.map((tag) => (
            <span
              key={tag}
              className="rounded bg-white/5 px-1.5 py-0.5 text-xs text-muted-foreground"
            >
              {tag}
            </span>
          ))}
          {finding.tags.sectors?.map((tag) => (
            <span key={tag} className="rounded bg-blue-500/10 px-1.5 py-0.5 text-xs text-blue-400">
              {tag}
            </span>
          ))}
          {finding.tags.entities?.map((tag) => (
            <span
              key={tag}
              className="rounded bg-purple-500/10 px-1.5 py-0.5 text-xs text-purple-400"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
