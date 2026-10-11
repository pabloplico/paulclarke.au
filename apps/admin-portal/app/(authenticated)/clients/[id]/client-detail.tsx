'use client';

import { Badge } from '@repo/ui/badge';
import { Button } from '@repo/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui/select';
import { toast } from '@repo/ui/sonner';
import {
  ArrowLeft,
  Building2,
  Loader2,
  Mail,
  Phone,
  Plus,
  Save,
  Search,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import { AutocompleteInput } from '@/components/ui/autocomplete-input';
import { useCompanyLookup } from '@/hooks/use-company-lookup';
import { isValidAbn } from '@/lib/external-apis/abn-validation';
import type { AddressPrediction, CompanySuggestion } from '@/lib/external-apis/types';
import type { Client } from '../clients-view';

type Contact = {
  id: number;
  userId: number;
  clientId: number;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  isPrimary: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type Communication = {
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
};

type Tab = 'overview' | 'contacts' | 'communications';

const TYPE_OPTIONS = [
  { value: 'lead', label: 'Lead' },
  { value: 'referral_partner', label: 'Referral Partner' },
  { value: 'client', label: 'Client' },
];

const STATUS_OPTIONS = [
  { value: 'lead', label: 'Lead' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
];

interface ClientDetailProps {
  initialClient: Client;
  initialContacts: Contact[];
  initialCommunications: Communication[];
}

export function ClientDetail({
  initialClient,
  initialContacts,
  initialCommunications,
}: ClientDetailProps) {
  const [client, setClient] = useState(initialClient);
  const [contacts, setContacts] = useState(initialContacts);
  const [communications] = useState(initialCommunications);
  const [tab, setTab] = useState<Tab>('overview');
  const [saving, setSaving] = useState(false);
  const [edited, setEdited] = useState(false);

  // ABN lookup state
  const [abnInput, setAbnInput] = useState((client.metadata?.abn as string) || '');
  const [abnLoading, setAbnLoading] = useState(false);

  // Contact form state
  const [showAddContact, setShowAddContact] = useState(false);
  const [contactForm, setContactForm] = useState({
    name: '',
    email: '',
    phone: '',
    role: '',
    notes: '',
  });
  const [addingContact, setAddingContact] = useState(false);

  const updateField = (field: string, value: string) => {
    setClient((prev) => ({ ...prev, [field]: value }));
    setEdited(true);
  };

  const updateMultipleFields = useCallback(
    (fields: Record<string, string | Record<string, unknown>>) => {
      setClient((prev) => {
        const next = { ...prev };
        for (const [key, value] of Object.entries(fields)) {
          if (key === 'metadata') {
            next.metadata = { ...(next.metadata || {}), ...(value as Record<string, unknown>) };
          } else {
            (next as Record<string, unknown>)[key] = value;
          }
        }
        return next;
      });
      setEdited(true);
      toast.success('Fields auto-populated');
    },
    []
  );

  const {
    fetchCompanySuggestions,
    fetchAddressPredictions,
    handleCompanySelect,
    handleAddressSelect,
    lookupAbn: doAbnLookup,
  } = useCompanyLookup(updateMultipleFields);

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

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactName: client.contactName,
          companyName: client.companyName,
          email: client.email,
          phone: client.phone,
          status: client.status,
          type: client.type,
          source: client.source,
          website: client.website,
          address: client.address,
          industry: client.industry,
          notes: client.notes,
          metadata: client.metadata,
        }),
      });
      if (res.ok) {
        setEdited(false);
        toast.success('Saved');
      } else {
        toast.error('Failed to save');
      }
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  }, [client]);

  const handleAddContact = useCallback(async () => {
    if (!contactForm.name.trim()) return;
    setAddingContact(true);
    try {
      const res = await fetch(`/api/clients/${client.id}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contactForm),
      });
      if (res.ok) {
        const contact = await res.json();
        setContacts((prev) => [...prev, contact]);
        setContactForm({ name: '', email: '', phone: '', role: '', notes: '' });
        setShowAddContact(false);
        toast.success('Contact added');
      } else {
        toast.error('Failed to add contact');
      }
    } catch {
      toast.error('Failed to add contact');
    } finally {
      setAddingContact(false);
    }
  }, [client.id, contactForm]);

  const handleDeleteContact = useCallback(async (id: number) => {
    if (!confirm('Delete this contact?')) return;
    setContacts((prev) => prev.filter((c) => c.id !== id));
    try {
      await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
      toast.success('Deleted');
    } catch {
      toast.error('Failed to delete');
    }
  }, []);

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'contacts', label: 'Contacts', count: contacts.length },
    { key: 'communications', label: 'Communications', count: communications.length },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/clients"
          className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-white/5"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{client.contactName}</h1>
          {client.companyName && (
            <p className="text-sm text-muted-foreground">{client.companyName}</p>
          )}
        </div>
        {edited && (
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-1" />
            )}
            Save
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-white/10 pb-px">
        {tabs.map(({ key, label, count }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === key
                ? 'border-lime-500 text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
            {count !== undefined && count > 0 && (
              <span className="ml-1 text-xs text-muted-foreground">{count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field
              label="Contact Name"
              value={client.contactName}
              onChange={(v) => updateField('contactName', v)}
            />
            <AutocompleteInput<CompanySuggestion>
              label="Company"
              value={client.companyName || ''}
              onChange={(v) => updateField('companyName', v)}
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
            {client.metadata?.abn ? (
              <div className="flex items-center gap-2 mt-1.5">
                <Badge
                  variant="outline"
                  className="text-[10px] bg-lime-500/10 text-lime-400 border-lime-500/20"
                >
                  ABN {String(client.metadata.abn)}
                </Badge>
                {client.metadata?.entityType ? (
                  <span className="text-[10px] text-muted-foreground">
                    {String(client.metadata.entityType)}
                  </span>
                ) : null}
                {client.metadata?.gstRegistered ? (
                  <Badge variant="outline" className="text-[10px]">
                    GST Registered
                  </Badge>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field
              label="Email"
              value={client.email || ''}
              onChange={(v) => updateField('email', v)}
            />
            <Field
              label="Phone"
              value={client.phone || ''}
              onChange={(v) => updateField('phone', v)}
            />
            <SelectField
              label="Type"
              value={client.type}
              options={TYPE_OPTIONS}
              onChange={(v) => updateField('type', v)}
            />
            <SelectField
              label="Status"
              value={client.status}
              options={STATUS_OPTIONS}
              onChange={(v) => updateField('status', v)}
            />
            <Field
              label="Source"
              value={client.source || ''}
              onChange={(v) => updateField('source', v)}
              placeholder="e.g. google, linkedin"
            />
            <Field
              label="Industry"
              value={client.industry || ''}
              onChange={(v) => updateField('industry', v)}
            />
            <Field
              label="Website"
              value={client.website || ''}
              onChange={(v) => updateField('website', v)}
            />
          </div>

          {/* Address autocomplete */}
          <AutocompleteInput<AddressPrediction>
            label="Address"
            value={client.address || ''}
            onChange={(v) => updateField('address', v)}
            onSelect={handleAddressSelect}
            fetchSuggestions={fetchAddressPredictions}
            placeholder="Start typing an address..."
            minChars={3}
            renderSuggestion={(p) => <span className="text-sm">{p.description}</span>}
          />

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Notes</label>
            <textarea
              value={client.notes || ''}
              onChange={(e) => updateField('notes', e.target.value)}
              rows={5}
              className="w-full rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-lime-500/50 resize-none"
            />
          </div>
        </div>
      )}

      {tab === 'contacts' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setShowAddContact(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add Contact
            </Button>
          </div>

          {showAddContact && (
            <div className="rounded-lg border border-white/10 bg-card p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input
                  autoFocus
                  placeholder="Name *"
                  value={contactForm.name}
                  onChange={(e) => setContactForm((p) => ({ ...p, name: e.target.value }))}
                  className="rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-lime-500/50"
                />
                <input
                  placeholder="Role"
                  value={contactForm.role}
                  onChange={(e) => setContactForm((p) => ({ ...p, role: e.target.value }))}
                  className="rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-lime-500/50"
                />
                <input
                  placeholder="Email"
                  value={contactForm.email}
                  onChange={(e) => setContactForm((p) => ({ ...p, email: e.target.value }))}
                  className="rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-lime-500/50"
                />
                <input
                  placeholder="Phone"
                  value={contactForm.phone}
                  onChange={(e) => setContactForm((p) => ({ ...p, phone: e.target.value }))}
                  className="rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-lime-500/50"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setShowAddContact(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleAddContact}
                  disabled={addingContact || !contactForm.name.trim()}
                >
                  {addingContact ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
                </Button>
              </div>
            </div>
          )}

          {contacts.length > 0 ? (
            contacts.map((contact) => (
              <div
                key={contact.id}
                className="flex items-center gap-4 rounded-lg border border-white/10 bg-card px-4 py-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{contact.name}</span>
                    {contact.role && (
                      <span className="text-xs text-muted-foreground">{contact.role}</span>
                    )}
                    {contact.isPrimary && (
                      <Badge
                        variant="outline"
                        className="text-[10px] bg-lime-500/10 text-lime-400 border-lime-500/20"
                      >
                        Primary
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    {contact.email && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Mail className="h-3 w-3" /> {contact.email}
                      </span>
                    )}
                    {contact.phone && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="h-3 w-3" /> {contact.phone}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteContact(contact.id)}
                  className="text-muted-foreground hover:text-red-400 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              No contacts yet. Add people from this company.
            </p>
          )}
        </div>
      )}

      {tab === 'communications' && (
        <div className="space-y-3">
          {communications.length > 0 ? (
            communications.map((comm) => (
              <div key={comm.id} className="rounded-lg border border-white/10 bg-card px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-[10px]">
                    {comm.type}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {comm.direction}
                  </Badge>
                  {comm.followUpDate && !comm.followUpDone && (
                    <Badge
                      variant="outline"
                      className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/20"
                    >
                      Follow-up {new Date(comm.followUpDate) < new Date() ? '(overdue)' : ''}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground ml-auto">
                    {new Date(comm.sentAt).toLocaleDateString()}
                  </span>
                </div>
                {comm.subject && <p className="text-sm font-medium">{comm.subject}</p>}
                {comm.body && (
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{comm.body}</p>
                )}
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              No communications logged yet. Log interactions from the Communications page.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-lime-500/50"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
