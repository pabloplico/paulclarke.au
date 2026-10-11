'use client';

import { Badge } from '@repo/ui/badge';
import { Button } from '@repo/ui/button';
import { Input } from '@repo/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui/select';
import { Check, Loader2, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { useCallback, useState } from 'react';
import type { CompletenessRule } from '@/lib/db/schema';
import type { SectionWithContent } from '@/lib/workspaces/types';

interface RulesEditorDialogProps {
  section: SectionWithContent;
  workspaceId: number;
  onSave: (rules: CompletenessRule[]) => Promise<void>;
  onClose: () => void;
}

type RuleType = 'min_length' | 'required_headings' | 'min_items';

const RULE_LABELS: Record<RuleType, string> = {
  min_length: 'Min Length',
  required_headings: 'Required Headings',
  min_items: 'Min Items',
};

const RULE_BADGE_CLASSES: Record<RuleType, string> = {
  min_length: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  required_headings: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  min_items: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
};

function defaultRule(type: RuleType): CompletenessRule {
  switch (type) {
    case 'min_length':
      return { type, description: 'Minimum content length', params: { minLength: 200 } };
    case 'required_headings':
      return { type, description: 'Required section headings', params: { headings: [] } };
    case 'min_items':
      return { type, description: 'Minimum number of items', params: { minItems: 3 } };
  }
}

function ruleParamsSummary(rule: CompletenessRule): string {
  switch (rule.type) {
    case 'min_length':
      return `${(rule.params.minLength as number) ?? 200} chars`;
    case 'required_headings': {
      const headings = (rule.params.headings as string[]) ?? [];
      return headings.length === 0 ? 'no headings set' : `${headings.length} heading(s)`;
    }
    case 'min_items':
      return `${(rule.params.minItems as number) ?? 3} items`;
    default:
      return '';
  }
}

// ── Rule Row Editors ────────────────────────────────────────────────────────

function MinLengthEditor({
  rule,
  onChange,
}: {
  rule: CompletenessRule;
  onChange: (r: CompletenessRule) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-muted-foreground whitespace-nowrap">Min chars</label>
      <Input
        type="number"
        min={10}
        className="h-7 w-24 text-xs"
        value={(rule.params.minLength as number) ?? 200}
        onChange={(e) =>
          onChange({ ...rule, params: { ...rule.params, minLength: Number(e.target.value) } })
        }
      />
    </div>
  );
}

function MinItemsEditor({
  rule,
  onChange,
}: {
  rule: CompletenessRule;
  onChange: (r: CompletenessRule) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-muted-foreground whitespace-nowrap">Min items</label>
      <Input
        type="number"
        min={1}
        className="h-7 w-24 text-xs"
        value={(rule.params.minItems as number) ?? 3}
        onChange={(e) =>
          onChange({ ...rule, params: { ...rule.params, minItems: Number(e.target.value) } })
        }
      />
    </div>
  );
}

function RequiredHeadingsEditor({
  rule,
  onChange,
}: {
  rule: CompletenessRule;
  onChange: (r: CompletenessRule) => void;
}) {
  const headings = (rule.params.headings as string[]) ?? [];
  const [input, setInput] = useState('');

  const addHeading = () => {
    const value = input.trim();
    if (!value) return;
    const heading = value.startsWith('#') ? value : `## ${value}`;
    if (!headings.includes(heading)) {
      onChange({ ...rule, params: { ...rule.params, headings: [...headings, heading] } });
    }
    setInput('');
  };

  const removeHeading = (index: number) => {
    onChange({
      ...rule,
      params: { ...rule.params, headings: headings.filter((_, i) => i !== index) },
    });
  };

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1">
        {headings.map((h, i) => (
          <span
            key={h}
            className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-0.5 text-xs"
          >
            {h}
            <button
              type="button"
              onClick={() => removeHeading(i)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X size={10} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <Input
          className="h-7 text-xs flex-1"
          placeholder="Type heading and press Enter"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addHeading();
            }
          }}
        />
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={addHeading}
          disabled={!input.trim()}
        >
          <Plus size={12} />
        </Button>
      </div>
    </div>
  );
}

function RuleRow({
  rule,
  onChange,
  onDelete,
}: {
  rule: CompletenessRule;
  onChange: (r: CompletenessRule) => void;
  onDelete: () => void;
}) {
  const ruleType = rule.type as RuleType;

  return (
    <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3 space-y-2">
      <div className="flex items-center justify-between">
        <Badge
          variant="outline"
          className={`text-[10px] px-1.5 py-0 ${RULE_BADGE_CLASSES[ruleType] ?? ''}`}
        >
          {RULE_LABELS[ruleType] ?? rule.type}
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-muted-foreground hover:text-red-400"
          onClick={onDelete}
        >
          <Trash2 size={12} />
        </Button>
      </div>

      <Input
        className="h-7 text-xs"
        placeholder="Rule description"
        value={rule.description}
        onChange={(e) => onChange({ ...rule, description: e.target.value })}
      />

      {rule.type === 'min_length' && <MinLengthEditor rule={rule} onChange={onChange} />}
      {rule.type === 'required_headings' && (
        <RequiredHeadingsEditor rule={rule} onChange={onChange} />
      )}
      {rule.type === 'min_items' && <MinItemsEditor rule={rule} onChange={onChange} />}
    </div>
  );
}

// ── AI Suggestion Row ───────────────────────────────────────────────────────

function SuggestionRow({
  suggestion,
  selected,
  onToggle,
}: {
  suggestion: CompletenessRule;
  selected: boolean;
  onToggle: () => void;
}) {
  const ruleType = suggestion.type as RuleType;

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full text-left rounded-lg border p-3 transition-colors ${
        selected
          ? 'border-primary/40 bg-primary/[0.05]'
          : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.15]'
      }`}
    >
      <div className="flex items-center gap-2">
        <div
          className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${
            selected
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-white/20 bg-white/5'
          }`}
        >
          {selected && <Check size={10} />}
        </div>
        <Badge
          variant="outline"
          className={`text-[10px] px-1.5 py-0 ${RULE_BADGE_CLASSES[ruleType] ?? ''}`}
        >
          {RULE_LABELS[ruleType] ?? suggestion.type}
        </Badge>
        <span className="text-[10px] text-muted-foreground">{ruleParamsSummary(suggestion)}</span>
      </div>
      <p className="text-xs text-muted-foreground mt-1.5 ml-6">{suggestion.description}</p>
    </button>
  );
}

// ── Main Dialog ─────────────────────────────────────────────────────────────

export function RulesEditorDialog({
  section,
  workspaceId,
  onSave,
  onClose,
}: RulesEditorDialogProps) {
  const [rules, setRules] = useState<CompletenessRule[]>(section.completenessRules ?? []);
  const [saving, setSaving] = useState(false);
  const [newRuleType, setNewRuleType] = useState<RuleType>('min_length');

  // AI suggestions
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<CompletenessRule[] | null>(null);
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<number>>(new Set());

  const updateRule = useCallback((index: number, updated: CompletenessRule) => {
    setRules((prev) => prev.map((r, i) => (i === index ? updated : r)));
  }, []);

  const deleteRule = useCallback((index: number) => {
    setRules((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const addRule = useCallback(() => {
    setRules((prev) => [...prev, defaultRule(newRuleType)]);
  }, [newRuleType]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await onSave(rules);
    } finally {
      setSaving(false);
    }
  }, [rules, onSave]);

  const suggestRules = useCallback(async () => {
    setAiLoading(true);
    setAiSuggestions(null);
    setSelectedSuggestions(new Set());
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/sections/${section.id}/suggest-rules`,
        { method: 'POST' }
      );
      if (!res.ok) return;
      const data = await res.json();
      setAiSuggestions(data.suggestions ?? []);
      // Auto-select all suggestions
      setSelectedSuggestions(new Set((data.suggestions ?? []).map((_: unknown, i: number) => i)));
    } finally {
      setAiLoading(false);
    }
  }, [workspaceId, section.id]);

  const toggleSuggestion = useCallback((index: number) => {
    setSelectedSuggestions((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const applySelectedSuggestions = useCallback(() => {
    if (!aiSuggestions) return;
    const selected = aiSuggestions.filter((_, i) => selectedSuggestions.has(i));
    setRules((prev) => [...prev, ...selected]);
    setAiSuggestions(null);
    setSelectedSuggestions(new Set());
  }, [aiSuggestions, selectedSuggestions]);

  return (
    <div className="rounded-lg border border-border bg-popover p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold">Completeness Rules</h4>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-muted-foreground"
          onClick={onClose}
        >
          <X size={12} />
        </Button>
      </div>

      {/* Rules list */}
      {rules.length > 0 ? (
        <div className="space-y-2">
          {rules.map((rule, index) => (
            <RuleRow
              key={`${rule.type}-${index}`}
              rule={rule}
              onChange={(updated) => updateRule(index, updated)}
              onDelete={() => deleteRule(index)}
            />
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground text-center py-3">
          No rules configured. Add rules manually or use AI suggestions.
        </p>
      )}

      {/* Add rule */}
      <div className="flex items-center gap-2">
        <Select value={newRuleType} onValueChange={(value) => setNewRuleType(value as RuleType)}>
          <SelectTrigger className="h-8 text-xs flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="min_length">Min Length</SelectItem>
            <SelectItem value="required_headings">Required Headings</SelectItem>
            <SelectItem value="min_items">Min Items</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={addRule}>
          <Plus size={12} className="mr-1" />
          Add Rule
        </Button>
      </div>

      {/* Divider */}
      <div className="border-t border-white/[0.08]" />

      {/* AI suggestions */}
      <div className="space-y-2">
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs w-full"
          onClick={suggestRules}
          disabled={aiLoading}
        >
          {aiLoading ? (
            <Loader2 size={12} className="mr-1.5 animate-spin" />
          ) : (
            <Sparkles size={12} className="mr-1.5" />
          )}
          {aiLoading ? 'Analysing section...' : 'Suggest with AI'}
        </Button>

        {aiSuggestions && aiSuggestions.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Suggestions</p>
            {aiSuggestions.map((suggestion, i) => (
              <SuggestionRow
                key={`${suggestion.type}-${i}`}
                suggestion={suggestion}
                selected={selectedSuggestions.has(i)}
                onToggle={() => toggleSuggestion(i)}
              />
            ))}
            <Button
              size="sm"
              className="h-7 text-xs w-full"
              onClick={applySelectedSuggestions}
              disabled={selectedSuggestions.size === 0}
            >
              <Plus size={12} className="mr-1" />
              Add Selected ({selectedSuggestions.size})
            </Button>
          </div>
        )}

        {aiSuggestions && aiSuggestions.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-2">
            No additional rules suggested — the section looks well-configured.
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={saving}>
          {saving && <Loader2 size={12} className="mr-1.5 animate-spin" />}
          Save Rules
        </Button>
      </div>
    </div>
  );
}
