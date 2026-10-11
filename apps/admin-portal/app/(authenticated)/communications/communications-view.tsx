'use client';

import { Badge } from '@repo/ui/badge';
import { Button } from '@repo/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui/select';
import { toast } from '@repo/ui/sonner';
import { Check, Loader2, MessageSquare, Plus, Trash2 } from 'lucide-react';
import { useCallback, useState } from 'react';

type CommunicationWithClient = {
  id: number;
  userId: number;
  clientId: number | null;
  contactId: number | null;
  type: string;
  direction: string;
  subject: string | null;
  body: string | null;
  sentAt: string;
  templateId: number | null;
  followUpDate: string | null;
  followUpDone: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  clientName: string | null;
  companyName: string | null;
};

type ClientOption = { id: number; contactName: string; companyName: string | null };
type TabFilter = 'all' | 'email' | 'phone' | 'meeting' | 'note';
type FollowUpFilter = 'all' | 'pending' | 'overdue';

const TAB_BUTTONS: { key: TabFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'meeting', label: 'Meeting' },
  { key: 'note', label: 'Note' },
];

const FOLLOWUP_BUTTONS: { key: FollowUpFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending Follow-ups' },
  { key: 'overdue', label: 'Overdue' },
];

const TYPE_COLORS: Record<string, string> = {
  email: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  phone: 'bg-lime-500/10 text-lime-400 border-lime-500/20',
  meeting: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  note: 'bg-white/5 text-white/40 border-white/10',
};

interface CommunicationsViewProps {
  initialComms: CommunicationWithClient[];
  clients: ClientOption[];
}

export function CommunicationsView({ initialComms, clients }: CommunicationsViewProps) {
  const [comms, setComms] = useState(initialComms);
  const [tabFilter, setTabFilter] = useState<TabFilter>('all');
  const [followUpFilter, setFollowUpFilter] = useState<FollowUpFilter>('all');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    clientId: '',
    type: 'email',
    direction: 'outbound',
    subject: '',
    body: '',
    followUpDate: '',
  });

  const now = new Date();
  const filtered = comms.filter((c) => {
    if (tabFilter !== 'all' && c.type !== tabFilter) return false;
    if (followUpFilter === 'pending' && (c.followUpDone || !c.followUpDate)) return false;
    if (followUpFilter === 'overdue') {
      if (c.followUpDone || !c.followUpDate) return false;
      if (new Date(c.followUpDate) >= now) return false;
    }
    return true;
  });

  const pendingCount = comms.filter((c) => !c.followUpDone && c.followUpDate).length;
  const overdueCount = comms.filter(
    (c) => !c.followUpDone && c.followUpDate && new Date(c.followUpDate) < now
  ).length;

  const handleCreate = useCallback(async () => {
    if (!form.type) return;
    setSaving(true);
    try {
      const res = await fetch('/api/communications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          clientId: form.clientId ? Number(form.clientId) : null,
          followUpDate: form.followUpDate || null,
        }),
      });
      if (res.ok) {
        const created = await res.json();
        const client = clients.find((c) => c.id === created.clientId);
        setComms((prev) => [
          {
            ...created,
            sentAt: created.sentAt ?? new Date().toISOString(),
            followUpDate: created.followUpDate ?? null,
            createdAt: created.createdAt ?? new Date().toISOString(),
            clientName: client?.contactName ?? null,
            companyName: client?.companyName ?? null,
          },
          ...prev,
        ]);
        setForm({
          clientId: '',
          type: 'email',
          direction: 'outbound',
          subject: '',
          body: '',
          followUpDate: '',
        });
        setShowForm(false);
        toast.success('Communication logged');
      } else toast.error('Failed to log');
    } catch {
      toast.error('Failed to log');
    } finally {
      setSaving(false);
    }
  }, [form, clients]);

  const handleMarkDone = useCallback(async (id: number) => {
    setComms((prev) => prev.map((c) => (c.id === id ? { ...c, followUpDone: true } : c)));
    try {
      await fetch(`/api/communications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ followUpDone: true }),
      });
      toast.success('Marked done');
    } catch {
      toast.error('Failed to update');
    }
  }, []);

  const handleDelete = useCallback(async (id: number) => {
    if (!confirm('Delete this communication?')) return;
    setComms((prev) => prev.filter((c) => c.id !== id));
    try {
      await fetch(`/api/communications/${id}`, { method: 'DELETE' });
    } catch {
      toast.error('Failed to delete');
    }
  }, []);

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      {(pendingCount > 0 || overdueCount > 0) && (
        <div className="flex items-center gap-4 rounded-lg border border-white/10 bg-card px-4 py-2.5 text-sm">
          {pendingCount > 0 && (
            <span className="text-amber-400">
              {pendingCount} pending follow-up{pendingCount !== 1 ? 's' : ''}
            </span>
          )}
          {overdueCount > 0 && <span className="text-red-400">{overdueCount} overdue</span>}
        </div>
      )}

      {/* Filters + Log button */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1">
          {TAB_BUTTONS.map(({ key, label }) => (
            <Button
              key={key}
              variant={tabFilter === key ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setTabFilter(key)}
            >
              {label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {FOLLOWUP_BUTTONS.map(({ key, label }) => (
            <Button
              key={key}
              variant={followUpFilter === key ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setFollowUpFilter(key)}
            >
              {label}
              {key === 'overdue' && overdueCount > 0 && (
                <span className="ml-1 text-xs text-red-400">{overdueCount}</span>
              )}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4 mr-1" /> Log Communication
        </Button>
      </div>

      {/* Log form */}
      {showForm && (
        <div className="rounded-lg border border-white/10 bg-card p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Type</label>
              <Select value={form.type} onValueChange={(v) => setForm((p) => ({ ...p, type: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="phone">Phone</SelectItem>
                  <SelectItem value="meeting">Meeting</SelectItem>
                  <SelectItem value="note">Note</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Direction</label>
              <Select
                value={form.direction}
                onValueChange={(v) => setForm((p) => ({ ...p, direction: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="outbound">Outbound</SelectItem>
                  <SelectItem value="inbound">Inbound</SelectItem>
                  <SelectItem value="internal">Internal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Subject</label>
            <input
              value={form.subject}
              onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))}
              className="w-full rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-lime-500/50"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Body</label>
            <textarea
              value={form.body}
              onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))}
              rows={4}
              className="w-full rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-lime-500/50 resize-none"
            />
          </div>
          <div className="w-48">
            <label className="text-xs text-muted-foreground mb-1 block">Follow-up Date</label>
            <input
              type="date"
              value={form.followUpDate}
              onChange={(e) => setForm((p) => ({ ...p, followUpDate: e.target.value }))}
              className="w-full rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-lime-500/50"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreate} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Log'}
            </Button>
          </div>
        </div>
      )}

      {/* Communication list */}
      {filtered.length > 0 ? (
        <div className="space-y-2">
          {filtered.map((comm) => (
            <div key={comm.id} className="rounded-lg border border-white/10 bg-card px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className={`text-[10px] ${TYPE_COLORS[comm.type] || ''}`}>
                  {comm.type}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  {comm.direction}
                </Badge>
                {comm.clientName && (
                  <span className="text-xs text-muted-foreground">
                    {comm.clientName}
                    {comm.companyName ? ` (${comm.companyName})` : ''}
                  </span>
                )}
                {comm.followUpDate && !comm.followUpDone && (
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      new Date(comm.followUpDate) < now
                        ? 'bg-red-500/10 text-red-400 border-red-500/20'
                        : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                    }`}
                  >
                    Follow-up: {new Date(comm.followUpDate).toLocaleDateString()}
                    {new Date(comm.followUpDate) < now ? ' (overdue)' : ''}
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground ml-auto">
                  {new Date(comm.sentAt).toLocaleDateString()}
                </span>
                <div className="flex items-center gap-1">
                  {comm.followUpDate && !comm.followUpDone && (
                    <button
                      type="button"
                      onClick={() => handleMarkDone(comm.id)}
                      className="p-1 text-muted-foreground hover:text-lime-400 transition-colors"
                      title="Mark follow-up done"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(comm.id)}
                    className="p-1 text-muted-foreground hover:text-red-400 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {comm.subject && <p className="text-sm font-medium">{comm.subject}</p>}
              {comm.body && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2 whitespace-pre-wrap">
                  {comm.body}
                </p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 py-16 text-center">
          <MessageSquare className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-muted-foreground text-sm">
            {comms.length === 0
              ? 'No communications logged yet. Log your first interaction.'
              : 'No matches for this filter.'}
          </p>
        </div>
      )}
    </div>
  );
}
