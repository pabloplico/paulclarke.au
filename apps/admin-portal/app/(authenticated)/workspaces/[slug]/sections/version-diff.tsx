'use client';

import { diffWords } from 'diff';
import { useMemo } from 'react';

interface VersionDiffProps {
  oldText: string;
  newText: string;
}

export function VersionDiff({ oldText, newText }: VersionDiffProps) {
  const parts = useMemo(() => diffWords(oldText, newText), [oldText, newText]);

  return (
    <pre className="text-xs font-mono whitespace-pre-wrap p-3 rounded-md bg-white/[0.02] border border-border overflow-x-auto">
      {parts.map((part, i) => {
        if (part.added) {
          return (
            <span key={i} className="bg-green-500/20 text-green-300">
              {part.value}
            </span>
          );
        }
        if (part.removed) {
          return (
            <span key={i} className="bg-red-500/20 text-red-300 line-through">
              {part.value}
            </span>
          );
        }
        return <span key={i}>{part.value}</span>;
      })}
    </pre>
  );
}
