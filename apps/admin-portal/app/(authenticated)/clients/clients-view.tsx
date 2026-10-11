'use client';

import { Badge } from '@repo/ui/badge';
import { Button } from '@repo/ui/button';
import { Checkbox } from '@repo/ui/checkbox';
import { toast } from '@repo/ui/sonner';
import { Plus, Search, Trash2, Users } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { AddClientForm } from './add-client-dialog';
import { OutreachPanel } from './outreach-panel';

export type Client = {
  id: number;
  userId: number | null;
  contactName: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  type: string;
  source: string | null;
  website: string | null;
  address: string | null;
  industry: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

type StatusFilter = 'all' | 'lead' | 'active' | 'completed' | 'archived';
type TypeFilter = 'all' | 'lead' | 'referral_partner' | 'client';

const STATUS_BUTTONS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'lead', label: 'Lead' },
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
  { key: 'archived', label: 'Archived' },
];

const TYPE_BUTTONS: { key: TypeFilter; label: string }[] = [
  { key: 'all', label: 'All Types' },
  { key: 'lead', label: 'Leads' },
  { key: 'referral_partner', label: 'Referral Partners' },
  { key: 'client', label: 'Clients' },
];

const STATUS_COLORS: Record<string, string> = {
  lead: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  active: 'bg-lime-500/10 text-lime-400 border-lime-500/20',
  completed: 'bg-white/5 text-white/40 border-white/10',
  archived: 'bg-white/5 text-white/30 border-white/10',
};

const TYPE_COLORS: Record<string, string> = {
  lead: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  referral_partner: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  client: 'bg-lime-500/10 text-lime-400 border-lime-500/20',
};

interface ClientsViewProps {
  initialClients: Client[];
}

export function ClientsView({ initialClients }: ClientsViewProps) {
  const [clients, setClients] = useState<Client[]>(initialClients);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchLoading, setBatchLoading] = useState(false);

  const selectedClients = useMemo(
    () => clients.filter((c) => selectedIds.has(c.id)),
    [clients, selectedIds]
  );

  const filtered = clients.filter((c) => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (typeFilter !== 'all' && c.type !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !c.contactName.toLowerCase().includes(q) &&
        !c.companyName?.toLowerCase().includes(q) &&
        !c.email?.toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  const handleCreated = useCallback((client: Client) => {
    setClients((prev) => [client, ...prev]);
    setShowAdd(false);
    toast.success('Client added');
  }, []);

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === filtered.length && filtered.every((c) => prev.has(c.id))) {
        return new Set();
      }
      return new Set(filtered.map((c) => c.id));
    });
  }, [filtered]);

  const handleBatchDelete = useCallback(async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} client${ids.length === 1 ? '' : 's'}?`)) return;
    setBatchLoading(true);
    setClients((prev) => prev.filter((c) => !ids.includes(c.id)));
    try {
      await Promise.all(ids.map((id) => fetch(`/api/clients/${id}`, { method: 'DELETE' })));
      setSelectedIds(new Set());
      toast.success('Deleted');
    } catch {
      toast.error('Failed to delete');
    } finally {
      setBatchLoading(false);
    }
  }, [selectedIds]);

  return (
    <div className="space-y-4">
      {/* Search + Add */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients..."
            className="w-full rounded-lg border border-white/10 bg-card pl-9 pr-4 py-2.5 text-sm placeholder:text-muted-foreground outline-none focus:border-lime-500/50"
          />
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Add Client
        </Button>
      </div>

      {/* Status filters */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1">
          {STATUS_BUTTONS.map(({ key, label }) => (
            <Button
              key={key}
              variant={statusFilter === key ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setStatusFilter(key)}
            >
              {label}
              {key !== 'all' && (
                <span className="ml-1 text-xs text-muted-foreground">
                  {clients.filter((c) => c.status === key).length}
                </span>
              )}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {TYPE_BUTTONS.map(({ key, label }) => (
            <Button
              key={key}
              variant={typeFilter === key ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setTypeFilter(key)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      {/* Add form */}
      {showAdd && <AddClientForm onCancel={() => setShowAdd(false)} onCreated={handleCreated} />}

      {/* Batch actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 px-1">
          <span className="text-xs text-muted-foreground">{selectedIds.size} selected</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11px] text-red-400 hover:text-red-300"
            disabled={batchLoading}
            onClick={handleBatchDelete}
          >
            <Trash2 className="h-3 w-3" />
            Delete
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-[11px] text-muted-foreground"
            onClick={() => setSelectedIds(new Set())}
          >
            Clear
          </Button>
        </div>
      )}

      {/* Client list */}
      {filtered.length > 0 ? (
        <div className="space-y-2">
          {/* Select all header */}
          <div className="flex items-center gap-3 px-4 py-1.5">
            <Checkbox
              checked={filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id))}
              onChange={toggleSelectAll}
            />
            <span className="text-xs text-muted-foreground">Select all ({filtered.length})</span>
          </div>
          {filtered.map((client) => (
            <div
              key={client.id}
              className="flex items-center gap-3 rounded-lg border border-white/10 bg-card px-4 py-3 hover:bg-white/[0.02] transition-colors"
            >
              <Checkbox
                checked={selectedIds.has(client.id)}
                onChange={() => toggleSelect(client.id)}
              />
              <Link href={`/clients/${client.id}`} className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate">{client.contactName}</span>
                  {client.companyName && (
                    <span className="text-xs text-muted-foreground truncate">
                      {client.companyName}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {client.email && (
                    <span className="text-xs text-muted-foreground">{client.email}</span>
                  )}
                  {client.industry && (
                    <span className="text-xs text-muted-foreground">· {client.industry}</span>
                  )}
                  {client.source && (
                    <span className="text-xs text-muted-foreground">· via {client.source}</span>
                  )}
                </div>
              </Link>
              <div className="flex items-center gap-2 shrink-0">
                <Badge
                  variant="outline"
                  className={`text-xs ${TYPE_COLORS[client.type] || TYPE_COLORS.lead}`}
                >
                  {client.type === 'referral_partner' ? 'Partner' : client.type}
                </Badge>
                <Badge
                  variant="outline"
                  className={`text-xs ${STATUS_COLORS[client.status] || STATUS_COLORS.lead}`}
                >
                  {client.status}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 py-16 text-center">
          <Users className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-muted-foreground text-sm">
            {clients.length === 0
              ? 'No clients yet. Add your first client to get started.'
              : 'No matches for this filter.'}
          </p>
        </div>
      )}

      {/* Outreach panel */}
      <OutreachPanel selectedClients={selectedClients} />
    </div>
  );
}
