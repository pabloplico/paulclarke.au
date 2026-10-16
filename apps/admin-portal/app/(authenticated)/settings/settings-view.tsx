'use client';

import { Button } from '@repo/ui/button';
import { Input } from '@repo/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui/select';
import { toast } from '@repo/ui/sonner';
import { Loader2, RotateCcw, Save } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { AIProvider, AppConfig } from '@/lib/config';

type ModelOption = { id: string; name: string };
type ProviderInfo = { available: boolean; models: ModelOption[] };
type ModelsResponse = { providers: Record<string, ProviderInfo> };

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  gemini: 'Google Gemini',
  ollama: 'Ollama (Local)',
  'ollama-remote': 'Ollama (Remote)',
};

const DEFAULT_MODELS: Record<string, string> = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.5-flash',
  ollama: 'gemma3:4b',
  'ollama-remote': 'gemma3:4b',
};

type SettingsViewProps = {
  initialConfig: AppConfig;
};

export function SettingsView({ initialConfig }: SettingsViewProps) {
  const [cfg, setCfg] = useState(initialConfig);
  const [saving, setSaving] = useState(false);
  const [providerData, setProviderData] = useState<Record<string, ProviderInfo> | null>(null);
  const [loadingModels, setLoadingModels] = useState(true);

  const fetchModels = useCallback(async () => {
    setLoadingModels(true);
    try {
      const res = await fetch('/api/models');
      if (res.ok) {
        const data: ModelsResponse = await res.json();
        setProviderData(data.providers);
      }
    } catch {
      // Silently fall back to hardcoded lists
    } finally {
      setLoadingModels(false);
    }
  }, []);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  function set<K1 extends keyof AppConfig>(
    section: K1,
    key: string,
    value: string | number | boolean
  ) {
    setCfg((prev) => {
      const clone = structuredClone(prev);
      const parts = key.split('.');
      // biome-ignore lint/suspicious/noExplicitAny: nested dynamic access
      let target: any = clone[section];
      for (let i = 0; i < parts.length - 1; i++) {
        target = target[parts[i]!];
      }
      target[parts[parts.length - 1]!] = value;
      return clone;
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const updates: Record<string, string | number | boolean> = {
        'ai.provider': cfg.ai.provider,
        'ai.model': cfg.ai.model,
        'ai.fallbackProvider': cfg.ai.fallbackProvider,
        'ai.fallbackModel': cfg.ai.fallbackModel,
        'ai.ollamaUrl': cfg.ai.ollamaUrl,
        'ai.ollamaRemoteUrl': cfg.ai.ollamaRemoteUrl,
        'search.minQueryLength': cfg.search.minQueryLength,
        'search.maxResults': cfg.search.maxResults,
        'search.snippetContextChars': cfg.search.snippetContextChars,
        'search.titlePreviewChars': cfg.search.titlePreviewChars,
        'dashboard.recentChangesLimit': cfg.dashboard.recentChangesLimit,
        'marketResearch.defaultCronSchedule': cfg.marketResearch.defaultCronSchedule,
        'marketResearch.maxResearchSteps': cfg.marketResearch.maxResearchSteps,
        'marketResearch.minCompositeScore': cfg.marketResearch.minCompositeScore,
      };

      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed to save');
      }

      const updated = await res.json();
      setCfg(updated);
      toast.success('Settings saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setCfg((prev) => {
      const clone = structuredClone(prev);
      clone.ai.provider = 'anthropic';
      clone.ai.model = 'claude-sonnet-4-6';
      clone.ai.fallbackProvider = 'openai';
      clone.ai.fallbackModel = 'gpt-4o-mini';
      clone.ai.ollamaUrl = 'http://localhost:11434';
      clone.ai.ollamaRemoteUrl = '';
      clone.search.minQueryLength = 2;
      clone.search.maxResults = 20;
      clone.search.snippetContextChars = 60;
      clone.search.titlePreviewChars = 120;
      clone.dashboard.recentChangesLimit = 10;
      return clone;
    });
    toast.success('Reset to defaults — click Save to persist');
  }

  const isOllamaProvider = cfg.ai.provider === 'ollama' || cfg.ai.provider === 'ollama-remote';

  return (
    <div className="space-y-6">
      <Section
        title="AI Provider"
        description="LLM used for AI editing, gap analysis, and inbox routing."
      >
        <SubLabel>Primary</SubLabel>
        <Row>
          <Field label="Provider">
            <ProviderSelect
              value={cfg.ai.provider}
              providerData={providerData}
              onChange={(provider) => {
                set('ai', 'provider', provider);
                const models = providerData?.[provider]?.models;
                const defaultModel = models?.[0]?.id ?? DEFAULT_MODELS[provider] ?? '';
                set('ai', 'model', defaultModel);
              }}
            />
          </Field>
          <Field label="Model">
            <ModelSelect
              value={cfg.ai.model}
              models={providerData?.[cfg.ai.provider]?.models ?? []}
              loading={loadingModels}
              onChange={(value) => set('ai', 'model', value)}
            />
          </Field>
        </Row>
        <SubLabel>Fallback</SubLabel>
        <Row>
          <Field label="Provider">
            <ProviderSelect
              value={cfg.ai.fallbackProvider}
              providerData={providerData}
              onChange={(provider) => {
                set('ai', 'fallbackProvider', provider);
                const models = providerData?.[provider]?.models;
                const defaultModel = models?.[0]?.id ?? DEFAULT_MODELS[provider] ?? '';
                set('ai', 'fallbackModel', defaultModel);
              }}
            />
          </Field>
          <Field label="Model">
            <ModelSelect
              value={cfg.ai.fallbackModel}
              models={providerData?.[cfg.ai.fallbackProvider]?.models ?? []}
              loading={loadingModels}
              onChange={(value) => set('ai', 'fallbackModel', value)}
            />
          </Field>
        </Row>
        {isOllamaProvider && (
          <>
            <SubLabel>Ollama</SubLabel>
            <Row>
              <Field label="Local URL">
                <Input
                  className="h-7 text-xs"
                  placeholder="http://localhost:11434"
                  value={cfg.ai.ollamaUrl}
                  onChange={(e) => set('ai', 'ollamaUrl', e.target.value)}
                />
              </Field>
              <Field label="Remote URL">
                <Input
                  className="h-7 text-xs"
                  placeholder="http://your-ollama-host:11434"
                  value={cfg.ai.ollamaRemoteUrl}
                  onChange={(e) => set('ai', 'ollamaRemoteUrl', e.target.value)}
                />
              </Field>
            </Row>
          </>
        )}
      </Section>

      <Section
        title="Search & Display"
        description="Controls for the cross-workspace search bar and dashboard."
      >
        <Grid>
          <SliderField
            label="Min query length"
            value={cfg.search.minQueryLength}
            min={1}
            max={10}
            step={1}
            onChange={(v) => set('search', 'minQueryLength', v)}
          />
          <SliderField
            label="Max results"
            value={cfg.search.maxResults}
            min={5}
            max={100}
            step={5}
            onChange={(v) => set('search', 'maxResults', v)}
          />
          <SliderField
            label="Snippet context"
            value={cfg.search.snippetContextChars}
            min={20}
            max={200}
            step={10}
            suffix=" chars"
            onChange={(v) => set('search', 'snippetContextChars', v)}
          />
          <SliderField
            label="Title preview"
            value={cfg.search.titlePreviewChars}
            min={40}
            max={300}
            step={10}
            suffix=" chars"
            onChange={(v) => set('search', 'titlePreviewChars', v)}
          />
          <SliderField
            label="Recent changes"
            value={cfg.dashboard.recentChangesLimit}
            min={5}
            max={50}
            step={5}
            onChange={(v) => set('dashboard', 'recentChangesLimit', v)}
          />
        </Grid>
      </Section>

      <Section title="Market Research" description="Settings for automated market research agents.">
        <Grid>
          <SliderField
            label="Max Research Steps"
            value={cfg.marketResearch.maxResearchSteps}
            min={1}
            max={50}
            step={1}
            onChange={(v) => set('marketResearch', 'maxResearchSteps', v)}
          />
          <SliderField
            label="Min Source Quality Score"
            value={cfg.marketResearch.minCompositeScore}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => set('marketResearch', 'minCompositeScore', v)}
          />
        </Grid>
      </Section>

      <div className="flex justify-end gap-2 pt-2">
        <Button size="sm" variant="ghost" onClick={handleReset}>
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          Reset to defaults
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="mr-1.5 h-3.5 w-3.5" />
          )}
          Save settings
        </Button>
      </div>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-white/5 pb-5">
      <div className="mb-3">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground/60">{description}</p>
      </div>
      {children}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-x-3 gap-y-2 sm:grid-cols-3 lg:grid-cols-5">{children}</div>;
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-3 gap-y-2">{children}</div>;
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1 mt-3 text-[11px] font-medium text-muted-foreground/70 first:mt-0">
      {children}
    </p>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <label className="text-[11px] text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function ProviderSelect({
  value,
  providerData,
  onChange,
}: {
  value: AIProvider;
  providerData: Record<string, ProviderInfo> | null;
  onChange: (provider: AIProvider) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as AIProvider)}>
      <SelectTrigger className="h-7 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(PROVIDER_LABELS).map(([v, label]) => {
          const info = providerData?.[v];
          const isOllama = v === 'ollama' || v === 'ollama-remote';
          const disabled = info ? !info.available : false;
          return (
            <SelectItem key={v} value={v} disabled={!isOllama && disabled}>
              {label}
              {!isOllama && disabled ? ' (no API key)' : ''}
              {isOllama && info && !info.available ? ' (unreachable)' : ''}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

function ModelSelect({
  value,
  models,
  loading,
  onChange,
}: {
  value: string;
  models: ModelOption[];
  loading: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={loading}>
      <SelectTrigger className="h-7 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {loading ? (
          <SelectItem value={value}>{value}</SelectItem>
        ) : (
          models.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.name}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  const display = step < 1 ? value.toFixed(2) : String(value);
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between">
        <label className="text-[11px] text-muted-foreground">{label}</label>
        <span className="text-[11px] tabular-nums text-foreground/80">
          {display}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="slider-track h-1.5 w-full cursor-pointer appearance-none rounded-full"
        style={
          {
            '--pct': `${pct}%`,
          } as React.CSSProperties
        }
      />
    </div>
  );
}
