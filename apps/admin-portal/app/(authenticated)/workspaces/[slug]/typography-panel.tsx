'use client';

import { Button } from '@repo/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui/select';
import { RotateCcw, Type, X } from 'lucide-react';
import { useRef, useState } from 'react';
import {
  FONT_LABELS,
  type FontFamily,
  TYPOGRAPHY_DEFAULTS,
  useTypography,
} from '@/lib/workspaces/typography';

export function TypographyButton() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen((o) => !o)}
        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
        title="Typography settings"
        aria-expanded={open}
      >
        <Type size={14} />
      </Button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          {/* Panel */}
          <div
            ref={panelRef}
            className="absolute right-0 top-full mt-1 z-50 w-72 rounded-lg border border-border bg-card p-4 shadow-xl space-y-3"
            role="dialog"
            aria-label="Typography settings"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Typography
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
                onClick={() => setOpen(false)}
                aria-label="Close typography settings"
              >
                <X size={12} />
              </Button>
            </div>
            <TypographyControls />
          </div>
        </>
      )}
    </div>
  );
}

function TypographyControls() {
  const { settings, update, reset } = useTypography();

  return (
    <div className="space-y-3">
      <Field label="Typeface">
        <Select
          value={settings.fontFamily}
          onValueChange={(v) => update({ fontFamily: v as FontFamily })}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.entries(FONT_LABELS) as [FontFamily, string][]).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <SliderField
        label="Line spacing"
        value={settings.lineHeight}
        min={1.2}
        max={2.4}
        step={0.1}
        format={(v) => v.toFixed(1)}
        onChange={(v) => update({ lineHeight: v })}
      />

      <SliderField
        label="Max width"
        value={settings.maxWidth}
        min={25}
        max={100}
        step={5}
        suffix="%"
        onChange={(v) => update({ maxWidth: v })}
      />

      <SliderField
        label="Header indent"
        value={settings.headerIndent}
        min={0}
        max={4}
        step={0.25}
        suffix="rem"
        format={(v) => v.toFixed(2)}
        onChange={(v) => update({ headerIndent: v })}
      />

      <SliderField
        label="Body indent"
        value={settings.bodyIndent}
        min={0}
        max={4}
        step={0.25}
        suffix="rem"
        format={(v) => v.toFixed(2)}
        onChange={(v) => update({ bodyIndent: v })}
      />

      {JSON.stringify(settings) !== JSON.stringify(TYPOGRAPHY_DEFAULTS) && (
        <Button
          variant="ghost"
          size="sm"
          onClick={reset}
          className="w-full h-7 text-xs text-muted-foreground hover:text-foreground"
        >
          <RotateCcw size={12} className="mr-1.5" />
          Reset to defaults
        </Button>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  suffix,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  format?: (v: number) => string;
  onChange: (value: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  const display = format ? format(value) : String(value);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-[11px] text-muted-foreground">{label}</label>
        <span className="text-[11px] tabular-nums text-foreground/70">
          {display}
          {suffix ? ` ${suffix}` : ''}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="slider-track h-1 w-full cursor-pointer appearance-none rounded-full"
        style={{ '--pct': `${pct}%` } as React.CSSProperties}
      />
    </div>
  );
}
