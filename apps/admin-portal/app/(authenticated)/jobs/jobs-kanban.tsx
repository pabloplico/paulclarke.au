'use client';

import { Button } from '@repo/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui/select';
import { toast } from '@repo/ui/sonner';
import { CalendarDays, Loader2, Plus, Trash2 } from 'lucide-react';
import { useCallback, useState } from 'react';

export type Job = {
  id: number;
  userId: number;
  clientId: number | null;
  title: string;
  description: string | null;
  stage: string;
  quotedAmount: number | null;
  finalAmount: number | null;
  currency: string;
  startDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  sortOrder: number;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  clientName: string | null;
  companyName: string | null;
};

type ClientOption = { id: number; contactName: string; companyName: string | null };

const STAGES = [
  { key: 'lead', label: 'Lead', color: 'border-blue-500/30' },
  { key: 'quoted', label: 'Quoted', color: 'border-amber-500/30' },
  { key: 'in_progress', label: 'In Progress', color: 'border-lime-500/30' },
  { key: 'complete', label: 'Complete', color: 'border-white/20' },
  { key: 'archived', label: 'Archived', color: 'border-white/10' },
];

interface JobsKanbanProps {
  initialJobs: Job[];
  clients: ClientOption[];
}

export function JobsKanban({ initialJobs, clients }: JobsKanbanProps) {
  const [jobs, setJobs] = useState(initialJobs);
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    clientId: '',
    stage: 'lead',
    dueDate: '',
  });

  const handleCreate = useCallback(async () => {
    if (!form.title.trim()) return;
    setAdding(true);
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          clientId: form.clientId ? Number(form.clientId) : null,
          dueDate: form.dueDate || null,
        }),
      });
      if (res.ok) {
        const created = await res.json();
        const client = clients.find((c) => c.id === created.clientId);
        setJobs((prev) => [
          {
            ...created,
            startDate: created.startDate ?? null,
            dueDate: created.dueDate ?? null,
            completedAt: created.completedAt ?? null,
            createdAt: created.createdAt ?? new Date().toISOString(),
            updatedAt: created.updatedAt ?? new Date().toISOString(),
            clientName: client?.contactName ?? null,
            companyName: client?.companyName ?? null,
          },
          ...prev,
        ]);
        setForm({ title: '', description: '', clientId: '', stage: 'lead', dueDate: '' });
        setShowAdd(false);
        toast.success('Job created');
      } else toast.error('Failed to create');
    } catch {
      toast.error('Failed to create');
    } finally {
      setAdding(false);
    }
  }, [form, clients]);

  const handleDragStart = (id: number) => setDraggedId(id);

  const handleDrop = useCallback(
    async (stage: string) => {
      if (draggedId === null) return;
      const job = jobs.find((j) => j.id === draggedId);
      if (!job || job.stage === stage) {
        setDraggedId(null);
        return;
      }
      setJobs((prev) => prev.map((j) => (j.id === draggedId ? { ...j, stage } : j)));
      setDraggedId(null);
      try {
        const res = await fetch(`/api/jobs/${draggedId}/stage`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stage }),
        });
        if (!res.ok) toast.error('Failed to update stage');
      } catch {
        toast.error('Failed to update stage');
      }
    },
    [draggedId, jobs]
  );

  const handleDelete = useCallback(async (id: number) => {
    if (!confirm('Delete this job?')) return;
    setJobs((prev) => prev.filter((j) => j.id !== id));
    try {
      await fetch(`/api/jobs/${id}`, { method: 'DELETE' });
      toast.success('Deleted');
    } catch {
      toast.error('Failed to delete');
    }
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add Job
        </Button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="rounded-lg border border-white/10 bg-card p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Title *</label>
              <input
                autoFocus
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                className="w-full rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-lime-500/50"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Client</label>
              <Select
                value={form.clientId || 'none'}
                onValueChange={(v) => setForm((p) => ({ ...p, clientId: v === 'none' ? '' : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.contactName}
                      {c.companyName ? ` (${c.companyName})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              rows={2}
              className="w-full rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-lime-500/50 resize-none"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Stage</label>
              <Select
                value={form.stage}
                onValueChange={(v) => setForm((p) => ({ ...p, stage: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Due Date</label>
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))}
                className="w-full rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-lime-500/50"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreate} disabled={adding || !form.title.trim()}>
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create'}
            </Button>
          </div>
        </div>
      )}

      {/* Kanban board */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {STAGES.map(({ key, label, color }) => {
          const stageJobs = jobs.filter((j) => j.stage === key);
          return (
            <div
              key={key}
              className={`rounded-lg border-t-2 ${color} bg-card/50 p-2 min-h-[200px]`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(key)}
            >
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {label}
                </span>
                <span className="text-xs text-muted-foreground">{stageJobs.length}</span>
              </div>
              <div className="space-y-2">
                {stageJobs.map((job) => (
                  <div
                    key={job.id}
                    draggable
                    onDragStart={() => handleDragStart(job.id)}
                    className="rounded-md border border-white/10 bg-card px-3 py-2.5 cursor-grab active:cursor-grabbing hover:border-white/20 transition-colors group"
                  >
                    <div className="flex items-start justify-between gap-1">
                      <p className="text-sm font-medium leading-tight">{job.title}</p>
                      <button
                        type="button"
                        onClick={() => handleDelete(job.id)}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-all shrink-0 mt-0.5"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                    {(job.clientName || job.dueDate) && (
                      <div className="flex items-center gap-2 mt-1.5">
                        {job.clientName && (
                          <span className="text-[11px] text-muted-foreground truncate">
                            {job.clientName}
                          </span>
                        )}
                        {job.dueDate && (
                          <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground ml-auto shrink-0">
                            <CalendarDays className="h-3 w-3" />
                            {new Date(job.dueDate).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
