'use client';

import { Badge } from '@repo/ui/badge';
import { Button } from '@repo/ui/button';
import { Card, CardContent } from '@repo/ui/card';
import {
  AlertCircle,
  Check,
  Clock,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  Rss,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { AddFeedDialog } from './add-feed-dialog';

interface Feed {
  id: number;
  url: string;
  type: string;
  label: string | null;
  workspaceId: number | null;
  enabled: boolean;
  intervalMinutes: number;
  lastFetchedAt: string | null;
  lastError: string | null;
  itemCount: number;
  createdAt: string;
}

function formatRelativeTime(date: string | null): string {
  if (!date) return 'Never';
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

function truncateUrl(url: string, maxLen = 50): string {
  try {
    const u = new URL(url);
    const display = u.hostname + u.pathname;
    return display.length > maxLen ? `${display.slice(0, maxLen)}...` : display;
  } catch {
    return url.length > maxLen ? `${url.slice(0, maxLen)}...` : url;
  }
}

export function FeedsView() {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [checkingId, setCheckingId] = useState<number | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const fetchFeeds = useCallback(async () => {
    try {
      const res = await fetch('/api/feeds');
      if (!res.ok) throw new Error('Failed to load feeds');
      const data = await res.json();
      setFeeds(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load feeds');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFeeds();
  }, [fetchFeeds]);

  const handleCheckNow = async (feedId: number) => {
    setCheckingId(feedId);
    try {
      const res = await fetch(`/api/feeds/${feedId}/check`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        // Refresh feeds to get updated lastFetchedAt and itemCount
        await fetchFeeds();
        if (data.newItems > 0) {
          setError(null);
        }
      } else {
        setError(data.error || 'Check failed');
      }
    } catch {
      setError('Failed to check feed');
    } finally {
      setCheckingId(null);
    }
  };

  const handleToggleEnabled = async (feed: Feed) => {
    setTogglingId(feed.id);
    try {
      const res = await fetch(`/api/feeds/${feed.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !feed.enabled }),
      });
      if (res.ok) {
        setFeeds((prev) => prev.map((f) => (f.id === feed.id ? { ...f, enabled: !f.enabled } : f)));
      }
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (feedId: number) => {
    const res = await fetch(`/api/feeds/${feedId}`, { method: 'DELETE' });
    if (res.ok) {
      setFeeds((prev) => prev.filter((f) => f.id !== feedId));
      setDeleteConfirmId(null);
    }
  };

  const handleFeedCreated = () => {
    setShowAddDialog(false);
    fetchFeeds();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => setShowAddDialog(true)}>
          <Plus size={14} className="mr-1.5" />
          Add Feed
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
          <AlertCircle size={14} />
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-auto hover:text-red-300"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {feeds.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Rss size={40} className="text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No feeds configured yet.</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Add an RSS feed or page URL to monitor for new content.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {feeds.map((feed) => (
            <Card key={feed.id} className="transition-colors hover:border-foreground/10">
              <CardContent className="flex items-center gap-4 py-3">
                {/* Icon & info */}
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5">
                  <Rss size={16} className="text-muted-foreground" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">
                      {feed.label || truncateUrl(feed.url)}
                    </span>
                    <Badge
                      className={`text-[10px] px-1.5 py-0 ${
                        feed.type === 'rss'
                          ? 'bg-orange-500/10 text-orange-400'
                          : 'bg-blue-500/10 text-blue-400'
                      }`}
                    >
                      {feed.type.toUpperCase()}
                    </Badge>
                    {!feed.enabled && (
                      <Badge className="text-[10px] px-1.5 py-0 bg-white/5 text-muted-foreground">
                        Paused
                      </Badge>
                    )}
                    {feed.lastError && (
                      <Badge className="text-[10px] px-1.5 py-0 bg-red-500/10 text-red-400">
                        Error
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                    {feed.label && (
                      <a
                        href={feed.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 hover:text-foreground transition-colors truncate max-w-[200px]"
                      >
                        {truncateUrl(feed.url, 35)}
                        <ExternalLink size={10} />
                      </a>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock size={10} />
                      {formatRelativeTime(feed.lastFetchedAt)}
                    </span>
                    <span>{feed.itemCount} items</span>
                    <span>every {feed.intervalMinutes}m</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Toggle enabled */}
                  <button
                    type="button"
                    onClick={() => handleToggleEnabled(feed)}
                    disabled={togglingId === feed.id}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${
                      feed.enabled ? 'bg-lime-500/30' : 'bg-white/10'
                    }`}
                    title={feed.enabled ? 'Pause feed' : 'Enable feed'}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                        feed.enabled ? 'translate-x-4.5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>

                  {/* Check now */}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleCheckNow(feed.id)}
                    disabled={checkingId === feed.id}
                    className="h-7 px-2 text-xs"
                  >
                    {checkingId === feed.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <RefreshCw size={12} />
                    )}
                  </Button>

                  {/* Delete */}
                  {deleteConfirmId === feed.id ? (
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDelete(feed.id)}
                        className="h-7 px-2 text-xs text-red-400 hover:bg-red-500/10"
                      >
                        <Check size={12} />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDeleteConfirmId(null)}
                        className="h-7 px-2 text-xs"
                      >
                        <X size={12} />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDeleteConfirmId(feed.id)}
                      className="h-7 px-2 text-xs text-muted-foreground hover:text-red-400"
                    >
                      <Trash2 size={12} />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showAddDialog && (
        <AddFeedDialog onClose={() => setShowAddDialog(false)} onCreated={handleFeedCreated} />
      )}
    </div>
  );
}
