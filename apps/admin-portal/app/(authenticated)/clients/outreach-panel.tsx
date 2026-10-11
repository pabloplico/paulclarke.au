'use client';

import { Button } from '@repo/ui/button';
import { toast } from '@repo/ui/sonner';
import { Textarea } from '@repo/ui/textarea';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Loader2,
  Mail,
  Sparkles,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { Client } from './clients-view';

type EmailTemplate = {
  id: number;
  name: string;
  subject: string | null;
  body: string;
  category: string;
};

type PersonaliseResult = {
  clientId: number;
  contactName: string;
  companyName: string;
  email: string;
  personalisedBody: string;
  error?: string;
};

const TONES = ['Professional', 'Friendly', 'Direct'] as const;

const DEFAULT_TEMPLATE = `Hi [Name],

I wanted to reach out regarding how we might be able to help your team. Based on what I know about your business, I believe there's a great opportunity for us to work together.

Would you be open to a brief call this week to discuss?

Best regards`;

interface OutreachPanelProps {
  selectedClients: Client[];
}

export function OutreachPanel({ selectedClients }: OutreachPanelProps) {
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [tone, setTone] = useState<string>('Professional');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<PersonaliseResult[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [editedBodies, setEditedBodies] = useState<Record<number, string>>({});
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/email-templates')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: EmailTemplate[]) => setEmailTemplates(data))
      .catch(() => {});
  }, []);

  const handleTemplateSelect = useCallback(
    (id: string) => {
      if (id === 'custom') {
        setSelectedTemplateId(null);
        setTemplate(DEFAULT_TEMPLATE);
        return;
      }
      const numId = Number(id);
      const found = emailTemplates.find((t) => t.id === numId);
      if (found) {
        setSelectedTemplateId(found.id);
        setTemplate(found.body);
      }
    },
    [emailTemplates]
  );

  const canGenerate = selectedClients.length > 0 && template.trim().length > 0;

  const handleGenerate = useCallback(async () => {
    if (!canGenerate) return;
    setLoading(true);
    setResults([]);
    setEditedBodies({});

    try {
      const res = await fetch('/api/outreach/personalise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template: template.trim(),
          clientIds: selectedClients.map((c) => c.id),
          tone,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to generate emails');
      }

      const data = await res.json();
      setResults(data.results);
      // Auto-expand all results
      setExpandedIds(new Set(data.results.map((r: PersonaliseResult) => r.clientId)));

      const errorCount = data.results.filter((r: PersonaliseResult) => r.error).length;
      if (errorCount > 0) {
        toast.error(`${errorCount} email${errorCount > 1 ? 's' : ''} failed to generate`);
      } else {
        toast.success(
          `Generated ${data.results.length} personalised email${data.results.length > 1 ? 's' : ''}`
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate emails');
    } finally {
      setLoading(false);
    }
  }, [canGenerate, template, selectedClients, tone]);

  const toggleExpand = useCallback((clientId: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  }, []);

  const getBody = useCallback(
    (result: PersonaliseResult) => editedBodies[result.clientId] ?? result.personalisedBody,
    [editedBodies]
  );

  const handleCopy = useCallback(
    async (result: PersonaliseResult) => {
      await navigator.clipboard.writeText(getBody(result));
      toast.success(`Copied email for ${result.contactName}`);
    },
    [getBody]
  );

  const handleCopyAll = useCallback(async () => {
    const successful = results.filter((r) => !r.error);
    const text = successful
      .map((r) => `--- ${r.contactName} (${r.companyName}) ---\n\n${getBody(r)}`)
      .join('\n\n');
    await navigator.clipboard.writeText(text);
    toast.success(`Copied ${successful.length} emails`);
  }, [results, getBody]);

  const handleBodyEdit = useCallback((clientId: number, value: string) => {
    setEditedBodies((prev) => ({ ...prev, [clientId]: value }));
  }, []);

  return (
    <div className="space-y-4 rounded-xl border border-white/10 bg-card p-5">
      <div className="flex items-center gap-2">
        <Mail className="h-5 w-5 text-lime-400" />
        <h3 className="text-sm font-semibold">Email Outreach</h3>
      </div>

      {/* Template selector */}
      {emailTemplates.length > 0 && (
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Use a saved template</label>
          <div className="flex flex-wrap gap-1.5">
            <Button
              variant={selectedTemplateId === null ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => handleTemplateSelect('custom')}
            >
              Custom
            </Button>
            {emailTemplates.map((et) => (
              <Button
                key={et.id}
                variant={selectedTemplateId === et.id ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => handleTemplateSelect(String(et.id))}
              >
                {et.name}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Template body */}
      <div className="space-y-2">
        <label className="text-xs text-muted-foreground">Email Template</label>
        <Textarea
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          placeholder="Write or paste your email template..."
          className="min-h-[160px] text-sm"
        />
      </div>

      {/* Tone + Generate */}
      <div className="flex items-end gap-3">
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Tone</label>
          <div className="flex gap-1">
            {TONES.map((t) => (
              <Button
                key={t}
                variant={tone === t ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setTone(t)}
              >
                {t}
              </Button>
            ))}
          </div>
        </div>

        <div className="ml-auto">
          <Button size="sm" disabled={!canGenerate || loading} onClick={handleGenerate}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                Personalising for {selectedClients.length} client
                {selectedClients.length > 1 ? 's' : ''}...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-1.5" />
                Generate Emails
                {selectedClients.length > 0 && (
                  <span className="ml-1 text-xs opacity-70">({selectedClients.length})</span>
                )}
              </>
            )}
          </Button>
        </div>
      </div>

      {!canGenerate && selectedClients.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Select clients from the list above to generate personalised emails.
        </p>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Generated Emails ({results.filter((r) => !r.error).length}/{results.length})
            </span>
            <Button variant="ghost" size="sm" onClick={handleCopyAll}>
              <Copy className="h-3.5 w-3.5 mr-1" />
              Copy All
            </Button>
          </div>

          {results.map((result) => (
            <div
              key={result.clientId}
              className={`rounded-lg border ${
                result.error ? 'border-red-500/20 bg-red-500/5' : 'border-white/10 bg-white/[0.02]'
              }`}
            >
              {/* Header */}
              <button
                type="button"
                className="flex w-full items-center gap-2 px-4 py-3 text-left"
                onClick={() => toggleExpand(result.clientId)}
              >
                {expandedIds.has(result.clientId) ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium">{result.contactName}</span>
                  {result.companyName && (
                    <span className="ml-2 text-xs text-muted-foreground">{result.companyName}</span>
                  )}
                </div>
                {result.error ? (
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                ) : (
                  <div className="flex items-center gap-1 shrink-0">
                    <Check className="h-3.5 w-3.5 text-lime-400" />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopy(result);
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </button>

              {/* Body */}
              {expandedIds.has(result.clientId) && (
                <div className="border-t border-white/5 px-4 py-3">
                  {result.error ? (
                    <p className="text-sm text-red-400">{result.error}</p>
                  ) : (
                    <textarea
                      value={getBody(result)}
                      onChange={(e) => handleBodyEdit(result.clientId, e.target.value)}
                      className="w-full min-h-[200px] resize-y rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground focus:outline-none focus:border-lime-500/50"
                    />
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
