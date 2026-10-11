'use client';

import { toast } from '@repo/ui/sonner';
import { Globe, Key, Plus, Rss, Search, X } from 'lucide-react';
import { useState } from 'react';
import {
  CATEGORY_LABELS,
  type DirectorySource,
  SOURCE_DIRECTORY,
  type SourceCategory,
} from '@/lib/agents/source-directory';

const TYPE_ICONS = {
  api: Globe,
  rss: Rss,
  scrape: Search,
} as const;

const GEO_LABELS: Record<string, string> = {
  global: 'Global',
  US: 'US',
  AU: 'AU',
  EU: 'EU',
};

interface SourceDirectoryPanelProps {
  workspaceId: number;
  workspaceType: string;
  existingUrls: Set<string>;
  onAdd: (source: { name: string; sourceType: string; url: string }) => void;
  onClose: () => void;
}

export function SourceDirectoryPanel({
  workspaceType,
  existingUrls,
  onAdd,
  onClose,
}: SourceDirectoryPanelProps) {
  const [category, setCategory] = useState<SourceCategory | 'all' | 'recommended'>('recommended');
  const [search, setSearch] = useState('');
  const [addingUrl, setAddingUrl] = useState<string | null>(null);
  const [hidePaid, setHidePaid] = useState(true);

  const categories: Array<SourceCategory | 'all' | 'recommended'> = [
    'recommended',
    'all',
    ...(Object.keys(CATEGORY_LABELS) as SourceCategory[]),
  ];

  function getRecommended(): DirectorySource[] {
    return SOURCE_DIRECTORY.filter((s) => {
      if (s.apiKeyRequired) return false;
      if (s.bestFor !== 'both' && s.bestFor !== workspaceType) return false;
      return true;
    }).slice(0, 15);
  }

  function getFiltered(): DirectorySource[] {
    let sources =
      category === 'recommended'
        ? getRecommended()
        : category === 'all'
          ? SOURCE_DIRECTORY
          : SOURCE_DIRECTORY.filter((s) => s.category === category);

    if (hidePaid && category !== 'recommended') {
      sources = sources.filter((s) => !s.apiKeyRequired);
    }

    if (search) {
      const q = search.toLowerCase();
      sources = sources.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.category.includes(q)
      );
    }

    return sources;
  }

  async function handleAdd(source: DirectorySource) {
    setAddingUrl(source.url);
    try {
      onAdd({
        name: source.name,
        sourceType:
          source.type === 'api'
            ? 'public_api'
            : source.type === 'rss'
              ? 'web_scrape'
              : 'web_scrape',
        url: source.url,
      });
      toast.success(`Added ${source.name}`);
    } finally {
      setAddingUrl(null);
    }
  }

  const filtered = getFiltered();

  return (
    <div className="rounded-xl border border-lime-500/20 bg-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h3 className="text-sm font-medium text-foreground">Discover Sources</h3>
          <p className="text-xs text-muted-foreground">
            {SOURCE_DIRECTORY.length} free data sources &middot;{' '}
            {SOURCE_DIRECTORY.filter((s) => !s.apiKeyRequired).length} need no API key
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className="rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Search + category filter */}
      <div className="border-b border-border px-4 py-2 space-y-2">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sources..."
            aria-label="Search sources"
            className="w-full rounded-md border border-border bg-background pl-7 pr-3 py-1.5 text-xs text-foreground"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 flex-wrap flex-1">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                  category === cat
                    ? 'bg-lime-600 text-white'
                    : 'bg-white/5 text-muted-foreground hover:text-foreground'
                }`}
              >
                {cat === 'recommended'
                  ? 'Recommended'
                  : cat === 'all'
                    ? 'All'
                    : CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground shrink-0 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hidePaid}
              onChange={(e) => setHidePaid(e.target.checked)}
              className="rounded border-border"
            />
            Free only
          </label>
        </div>
      </div>

      {/* Source list */}
      <div className="max-h-80 overflow-y-auto divide-y divide-border">
        {filtered.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            No sources match your filter.
          </div>
        ) : (
          filtered.map((source) => {
            const TypeIcon = TYPE_ICONS[source.type];
            const alreadyAdded = existingUrls.has(source.url);

            return (
              <div key={source.url} className="flex items-center gap-3 px-4 py-2.5">
                <TypeIcon size={14} className="shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-foreground truncate">
                      {source.name}
                    </span>
                    {source.apiKeyRequired && (
                      <span className="flex items-center gap-0.5 rounded bg-yellow-500/10 px-1 py-0.5 text-[9px] text-yellow-500 shrink-0">
                        <Key size={8} />
                        API key
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {GEO_LABELS[source.geoFocus]}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">{source.description}</p>
                </div>
                {alreadyAdded ? (
                  <span className="text-[10px] text-muted-foreground shrink-0">Added</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleAdd(source)}
                    disabled={addingUrl === source.url}
                    className="shrink-0 rounded-md bg-lime-600/20 p-1.5 text-lime-500 hover:bg-lime-600/30 disabled:opacity-50 transition-colors"
                    title={`Add ${source.name}`}
                    aria-label={`Add ${source.name}`}
                  >
                    <Plus size={12} />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
