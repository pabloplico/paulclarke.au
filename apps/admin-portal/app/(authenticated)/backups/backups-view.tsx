'use client';

import { Badge } from '@repo/ui/badge';
import { Button } from '@repo/ui/button';
import { Card, CardContent } from '@repo/ui/card';
import { toast } from '@repo/ui/sonner';
import { Clock, Database, Download, HardDrive, Loader, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { BackupInfo } from '@/lib/db/backup';

interface BackupsViewProps {
  initialBackups: BackupInfo[];
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function BackupsView({ initialBackups }: BackupsViewProps) {
  const [backups, setBackups] = useState<BackupInfo[]>(initialBackups);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Poll while a backup is being created
  useEffect(() => {
    if (!creating) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/backups');
        if (res.ok) {
          const fresh: BackupInfo[] = await res.json();
          setBackups(fresh);
        }
      } catch {
        // ignore polling errors
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [creating]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/backups');
      if (res.ok) setBackups(await res.json());
    } catch {
      // ignore
    }
  }, []);

  const handleCreate = useCallback(async () => {
    setCreating(true);
    try {
      const res = await fetch('/api/backups', { method: 'POST' });
      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error || 'Backup failed');
      }
      const backup: BackupInfo = await res.json();
      toast.success(`Backup created: ${backup.filename}`);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Backup failed');
    } finally {
      setCreating(false);
    }
  }, [refresh]);

  const handleDelete = useCallback(
    async (filename: string) => {
      setDeleting(filename);
      try {
        const res = await fetch(`/api/backups/${filename}`, { method: 'DELETE' });
        if (!res.ok) {
          const { error } = await res.json();
          throw new Error(error || 'Delete failed');
        }
        toast.success('Backup deleted');
        await refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Delete failed');
      } finally {
        setDeleting(null);
      }
    },
    [refresh]
  );

  const totalSize = backups.reduce((sum, b) => sum + b.size, 0);
  const lastBackup = backups[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Automated backups run twice daily (8 AM & 8 PM). Max 14 backups retained.
        </p>
        <Button onClick={handleCreate} disabled={creating}>
          {creating ? (
            <>
              <Loader size={16} className="mr-2 animate-spin" />
              Backing up...
            </>
          ) : (
            <>
              <Database size={16} className="mr-2" />
              Back Up Now
            </>
          )}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <Database size={20} className="text-muted-foreground shrink-0" />
            <div>
              <p className="text-2xl font-bold">{backups.length}</p>
              <p className="text-xs text-muted-foreground">Total backups</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <HardDrive size={20} className="text-muted-foreground shrink-0" />
            <div>
              <p className="text-2xl font-bold">{formatSize(totalSize)}</p>
              <p className="text-xs text-muted-foreground">Total size</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <Clock size={20} className="text-muted-foreground shrink-0" />
            <div>
              <p className="text-2xl font-bold" suppressHydrationWarning>
                {lastBackup ? timeAgo(lastBackup.createdAt) : 'Never'}
              </p>
              <p className="text-xs text-muted-foreground">Last backup</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Backup list */}
      {backups.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Database size={40} className="text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No backups yet.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Click &quot;Back Up Now&quot; to create your first backup.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {backups.map((backup) => (
            <Card key={backup.filename}>
              <CardContent className="flex items-center justify-between py-3">
                <div className="flex items-center gap-4">
                  <Database size={18} className="text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-sm font-medium font-mono">{backup.filename}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(backup.createdAt)}</p>
                  </div>
                  <Badge variant="secondary">{formatSize(backup.size)}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <a href={`/api/backups/${backup.filename}`} download>
                    <Button variant="ghost" size="sm">
                      <Download size={16} />
                    </Button>
                  </a>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(backup.filename)}
                    disabled={deleting === backup.filename}
                  >
                    {deleting === backup.filename ? (
                      <Loader size={16} className="animate-spin" />
                    ) : (
                      <Trash2 size={16} className="text-red-400" />
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
