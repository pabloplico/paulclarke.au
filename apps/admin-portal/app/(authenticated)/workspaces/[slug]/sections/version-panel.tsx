'use client';

import { Badge } from '@repo/ui/badge';
import { Button } from '@repo/ui/button';
import { RotateCcw, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { SectionVersion, SectionWithContent } from '@/lib/workspaces/types';
import { VersionDiff } from './version-diff';

interface VersionPanelProps {
  workspaceId: number;
  section: SectionWithContent;
  onClose: () => void;
  onRestore: (sectionId: number, restoredVersion: SectionVersion) => void;
}

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Manual',
  ai_ingest: 'AI Ingest',
  ai_edit: 'AI Edit',
  ai_gap_fill: 'AI Gap Fill',
};

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-AU', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function VersionPanel({ workspaceId, section, onClose, onRestore }: VersionPanelProps) {
  const [versions, setVersions] = useState<SectionVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setSelectedId(null);
    setError(null);
    fetch(`/api/workspaces/${workspaceId}/sections/${section.id}/versions`)
      .then((res) => res.json())
      .then((data) => {
        setVersions(data);
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load version history');
        setLoading(false);
      });
  }, [workspaceId, section.id]);

  const selectedVersion = versions.find((v) => v.id === selectedId);
  const previousVersion =
    selectedVersion && versions.find((v) => v.version === selectedVersion.version - 1);

  const handleRestore = useCallback(async () => {
    if (!selectedVersion) return;
    setRestoring(true);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/sections/${section.id}/versions/${selectedVersion.id}/restore`,
        { method: 'POST' }
      );
      if (res.ok) {
        const restored: SectionVersion = await res.json();
        onRestore(section.id, restored);
        const versionsRes = await fetch(
          `/api/workspaces/${workspaceId}/sections/${section.id}/versions`
        );
        if (versionsRes.ok) {
          setVersions(await versionsRes.json());
        }
        setSelectedId(null);
      }
    } finally {
      setRestoring(false);
    }
  }, [selectedVersion, workspaceId, section.id, onRestore]);

  return (
    <div className="rounded-lg border border-border bg-popover p-3 space-y-3 max-h-80 overflow-y-auto scrollbar-thin">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold">Version History</h4>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          aria-label="Close"
          className="h-6 w-6 p-0 text-muted-foreground"
        >
          <X size={12} />
        </Button>
      </div>

      {error && <p className="text-xs text-red-400 px-2">{error}</p>}

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading...</p>
      ) : versions.length === 0 ? (
        <p className="text-xs text-muted-foreground">No versions yet.</p>
      ) : (
        <div className="space-y-2">
          {versions.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setSelectedId(selectedId === v.id ? null : v.id)}
              className={`w-full text-left rounded-lg border p-2.5 transition-colors ${
                selectedId === v.id
                  ? 'border-foreground/30 bg-white/5'
                  : 'border-border hover:border-foreground/10'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium">v{v.version}</span>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {SOURCE_LABELS[v.changeSource] ?? v.changeSource}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-1">{v.changeDescription}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{formatDate(v.createdAt)}</p>
            </button>
          ))}
        </div>
      )}

      {selectedVersion && (
        <div className="space-y-3 pt-2 border-t border-border">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-medium">Changes in v{selectedVersion.version}</h4>
            {selectedVersion.id !== versions[0]?.id && (
              <Button
                variant="outline"
                size="sm"
                disabled={restoring}
                onClick={handleRestore}
                className="h-7 text-xs"
              >
                <RotateCcw size={12} className="mr-1" />
                {restoring ? 'Restoring...' : 'Restore'}
              </Button>
            )}
          </div>
          <VersionDiff
            oldText={previousVersion?.content ?? ''}
            newText={selectedVersion.content ?? ''}
          />
        </div>
      )}
    </div>
  );
}
