'use client';

import { ArrowRight, Loader2, Search, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { clientConfig } from '@/lib/config';

interface SearchResult {
  sectionId: number;
  sectionTitle: string;
  sectionTemplate: string;
  workspaceId: number;
  workspaceSlug: string;
  workspaceTitle: string;
  snippet: string;
}

export function SearchBar() {
  const _router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    if (q.length < clientConfig.search.minQueryLength) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.results);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = useCallback(
    (value: string) => {
      setQuery(value);
      setOpen(true);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (value.trim().length < clientConfig.search.minQueryLength) {
        setResults([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      debounceRef.current = setTimeout(() => search(value.trim()), clientConfig.search.debounceMs);
    },
    [search]
  );

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Keyboard shortcut: Ctrl+K / Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === 'Escape') {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleResultClick = () => {
    setOpen(false);
    setQuery('');
    setResults([]);
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-2 rounded-md border border-border bg-white/5 px-3 py-1.5">
        <Search size={14} className="text-muted-foreground shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => query.length >= clientConfig.search.minQueryLength && setOpen(true)}
          placeholder="Search workspaces..."
          aria-label="Search workspaces"
          role="combobox"
          aria-expanded={
            open && (query.length >= clientConfig.search.minQueryLength || results.length > 0)
          }
          aria-autocomplete="list"
          className="bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none w-24 sm:w-48"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setResults([]);
              setOpen(false);
            }}
            aria-label="Clear search"
            className="text-muted-foreground hover:text-foreground"
          >
            <X size={12} />
          </button>
        ) : (
          <kbd className="text-[10px] text-muted-foreground/50 border border-border/50 rounded px-1">
            ⌘K
          </kbd>
        )}
      </div>

      {open && (query.length >= clientConfig.search.minQueryLength || results.length > 0) && (
        <div className="absolute right-0 top-full mt-1 w-[calc(100vw-2rem)] sm:w-96 rounded-lg border border-border bg-popover shadow-lg z-50 overflow-hidden">
          {loading && results.length === 0 && (
            <div className="flex items-center justify-center py-6">
              <Loader2 size={16} className="animate-spin text-muted-foreground" />
            </div>
          )}

          {!loading &&
            results.length === 0 &&
            query.length >= clientConfig.search.minQueryLength && (
              <div className="py-6 text-center text-xs text-muted-foreground">
                No results for "{query}"
              </div>
            )}

          {results.length > 0 && (
            <div className="max-h-80 overflow-y-auto scrollbar-thin py-1">
              {results.map((r) => (
                <Link
                  key={r.sectionId}
                  href={`/workspaces/${r.workspaceSlug}`}
                  onClick={handleResultClick}
                  className="block px-3 py-2.5 hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="font-medium text-foreground">{r.workspaceTitle}</span>
                    <ArrowRight size={10} className="text-muted-foreground" />
                    <span className="text-muted-foreground">{r.sectionTitle}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground/70 mt-0.5 line-clamp-2">
                    {r.snippet}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
