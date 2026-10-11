'use client';

import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

interface AutocompleteInputProps<T> {
  value: string;
  onChange: (value: string) => void;
  onSelect: (item: T) => void;
  fetchSuggestions: (query: string) => Promise<T[]>;
  renderSuggestion: (item: T) => React.ReactNode;
  minChars?: number;
  debounceMs?: number;
  placeholder?: string;
  label?: string;
  autoFocus?: boolean;
}

export function AutocompleteInput<T>({
  value,
  onChange,
  onSelect,
  fetchSuggestions,
  renderSuggestion,
  minChars = 2,
  debounceMs = 300,
  placeholder,
  label,
  autoFocus,
}: AutocompleteInputProps<T>) {
  const [suggestions, setSuggestions] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(
    async (q: string) => {
      if (q.length < minChars) {
        setSuggestions([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const results = await fetchSuggestions(q);
        setSuggestions(results);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    },
    [fetchSuggestions, minChars]
  );

  const handleChange = useCallback(
    (val: string) => {
      onChange(val);
      setOpen(true);
      setActiveIndex(-1);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (val.trim().length < minChars) {
        setSuggestions([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      debounceRef.current = setTimeout(() => doSearch(val.trim()), debounceMs);
    },
    [onChange, doSearch, minChars, debounceMs]
  );

  const handleSelect = useCallback(
    (item: T) => {
      onSelect(item);
      setOpen(false);
      setSuggestions([]);
      setActiveIndex(-1);
    },
    [onSelect]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!open || suggestions.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
      } else if (e.key === 'Enter' && activeIndex >= 0 && suggestions[activeIndex]) {
        e.preventDefault();
        handleSelect(suggestions[activeIndex]);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    },
    [open, suggestions, activeIndex, handleSelect]
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

  return (
    <div ref={containerRef} className="relative">
      {label && <label className="text-xs text-muted-foreground mb-1 block">{label}</label>}
      <div className="relative">
        <input
          ref={inputRef}
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => value.length >= minChars && suggestions.length > 0 && setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-lime-500/50"
          autoComplete="off"
        />
        {loading && (
          <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}
      </div>

      {open && (suggestions.length > 0 || (loading && value.length >= minChars)) && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto scrollbar-thin rounded-lg border border-border bg-popover shadow-lg">
          {suggestions.map((item, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleSelect(item)}
              onMouseEnter={() => setActiveIndex(i)}
              className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                i === activeIndex ? 'bg-white/10' : 'hover:bg-white/5'
              }`}
            >
              {renderSuggestion(item)}
            </button>
          ))}
          {loading && suggestions.length === 0 && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      )}

      {open && !loading && suggestions.length === 0 && value.length >= minChars && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border border-border bg-popover shadow-lg">
          <div className="py-3 text-center text-xs text-muted-foreground">No results</div>
        </div>
      )}
    </div>
  );
}
