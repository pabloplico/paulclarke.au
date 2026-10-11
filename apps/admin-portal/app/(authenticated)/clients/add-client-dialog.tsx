'use client';

import { Badge } from '@repo/ui/badge';
import { Button } from '@repo/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui/select';
import { toast } from '@repo/ui/sonner';
import { Building2, Loader2, Search } from 'lucide-react';
import { useCallback, useState } from 'react';
import { AutocompleteInput } from '@/components/ui/autocomplete-input';
import { useCompanyLookup } from '@/hooks/use-company-lookup';
import { isValidAbn } from '@/lib/external-apis/abn-validation';
import type { AddressPrediction, CompanySuggestion } from '@/lib/external-apis/types';
import type { Client } from './clients-view';

interface AddClientFormProps {
  onCancel: () => void;
  onCreated: (client: Client) => void;
}

const TYPE_OPTIONS = [
  { value: 'lead', label: 'Lead' },
  { value: 'referral_partner', label: 'Referral Partner' },
  { value: 'client', label: 'Client' },
];

export function AddClientForm({ onCancel, onCreated }: AddClientFormProps) {
  const [loading, setLoading] = useState(false);
  const [abnLoading, setAbnLoading] = useState(false);
  const [abnInput, setAbnInput] = useState('');
  const [form, setForm] = useState({
    contactName: '',
    companyName: '',
    email: '',
    phone: '',
    type: 'lead',
    source: '',
    website: '',
    industry: '',
    address: '',
    notes: '',
    metadata: {} as Record<string, unknown>,
  });

  const update = (field: string, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  const updateMultiple = useCallback((fields: Record<string, string | Record<string, unknown>>) => {
    setForm((prev) => {
      const next = { ...prev };
      for (const [key, value] of Object.entries(fields)) {
        if (key === 'metadata') {
          next.metadata = { ...next.metadata, ...(value as Record<string, unknown>) };
        } else if (!prev[key as keyof typeof prev] || prev[key as keyof typeof prev] === '') {
          (next as Record<string, unknown>)[key] = value;
        }
      }
      return next;
    });
    toast.success('Fields auto-populated');
  }, []);

  const {
    fetchCompanySuggestions,
    fetchAddressPredictions,
    handleCompanySelect,
    handleAddressSelect,
    lookupAbn: doAbnLookup,
  } = useCompanyLookup(updateMultiple);

  const handleAbnLookup = async () => {
    const cleanAbn = abnInput.replace(/\s/g, '');
    if (!isValidAbn(cleanAbn)) {
      toast.error('Invalid ABN format');
      return;
    }
    setAbnLoading(true);
    try {
      const result = await doAbnLookup(cleanAbn);
      if (!result) toast.error('ABN not found');
    } catch {
      toast.error('ABN lookup failed');
    } finally {
      setAbnLoading(false);
    }
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.contactName.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const client = await res.json();
        onCreated(client);
      } else {
        toast.error('Failed to create client');
      }
    } catch {
      toast.error('Failed to create client');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-white/10 bg-card p-4">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Contact Name *</label>
            <input
              autoFocus
              value={form.contactName}
              onChange={(e) => update('contactName', e.target.value)}
              className="w-full rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-lime-500/50"
            />
          </div>
          <AutocompleteInput<CompanySuggestion>
            label="Company Name"
            value={form.companyName}
            onChange={(v) => update('companyName', v)}
            onSelect={handleCompanySelect}
            fetchSuggestions={fetchCompanySuggestions}
            placeholder="Search company..."
            renderSuggestion={(s) => (
              <div className="flex items-center gap-2">
                <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{s.companyName}</div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {s.abn && <span>ABN {s.abn}</span>}
                    {s.state && <span>{s.state}</span>}
                    {s.address && !s.abn && <span className="truncate">{s.address}</span>}
                    <Badge variant="outline" className="text-[9px] px-1 py-0">
                      {s.source === 'abn' ? 'ABR' : 'Places'}
                    </Badge>
                  </div>
                </div>
              </div>
            )}
          />
        </div>

        {/* ABN Lookup */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">ABN Lookup</label>
          <div className="flex gap-2">
            <input
              value={abnInput}
              onChange={(e) => setAbnInput(e.target.value)}
              placeholder="Enter 11-digit ABN"
              className="flex-1 rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-lime-500/50"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAbnLookup();
                }
              }}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleAbnLookup}
              disabled={abnLoading || !abnInput.trim()}
            >
              {abnLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </Button>
          </div>
          {form.metadata?.abn ? (
            <div className="flex items-center gap-2 mt-1.5">
              <Badge
                variant="outline"
                className="text-[10px] bg-lime-500/10 text-lime-400 border-lime-500/20"
              >
                ABN {String(form.metadata.abn)}
              </Badge>
              {form.metadata?.entityType ? (
                <span className="text-[10px] text-muted-foreground">
                  {String(form.metadata.entityType)}
                </span>
              ) : null}
              {form.metadata?.gstRegistered ? (
                <Badge variant="outline" className="text-[10px]">
                  GST
                </Badge>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              className="w-full rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-lime-500/50"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Phone</label>
            <input
              value={form.phone}
              onChange={(e) => update('phone', e.target.value)}
              className="w-full rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-lime-500/50"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Type</label>
            <Select value={form.type} onValueChange={(value) => update('type', value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Source</label>
            <input
              value={form.source}
              onChange={(e) => update('source', e.target.value)}
              placeholder="e.g. google, linkedin"
              className="w-full rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-lime-500/50"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Industry</label>
            <input
              value={form.industry}
              onChange={(e) => update('industry', e.target.value)}
              className="w-full rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-lime-500/50"
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Website</label>
          <input
            value={form.website}
            onChange={(e) => update('website', e.target.value)}
            placeholder="https://"
            className="w-full rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-lime-500/50"
          />
        </div>

        {/* Address autocomplete */}
        <AutocompleteInput<AddressPrediction>
          label="Address"
          value={form.address}
          onChange={(v) => update('address', v)}
          onSelect={handleAddressSelect}
          fetchSuggestions={fetchAddressPredictions}
          placeholder="Start typing an address..."
          minChars={3}
          renderSuggestion={(p) => <span className="text-sm">{p.description}</span>}
        />

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            rows={3}
            className="w-full rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-lime-500/50 resize-none"
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" type="button" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" type="submit" disabled={loading || !form.contactName.trim()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add Client'}
          </Button>
        </div>
      </form>
    </div>
  );
}
