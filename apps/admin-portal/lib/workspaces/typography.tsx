'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type FontFamily = 'system' | 'serif' | 'sans' | 'mono';

export interface TypographySettings {
  fontFamily: FontFamily;
  lineHeight: number;
  maxWidth: number; // percentage of section width (25-100)
  headerIndent: number; // in rem
  bodyIndent: number; // in rem
}

export const TYPOGRAPHY_DEFAULTS: TypographySettings = {
  fontFamily: 'system',
  lineHeight: 1.6,
  maxWidth: 100,
  headerIndent: 0,
  bodyIndent: 0,
};

const FONT_STACKS: Record<FontFamily, string> = {
  system: 'system-ui, -apple-system, sans-serif',
  serif: 'Georgia, Cambria, "Times New Roman", Times, serif',
  sans: '"Inter", "Helvetica Neue", Helvetica, Arial, sans-serif',
  mono: '"JetBrains Mono", "Fira Code", "Cascadia Code", Consolas, monospace',
};

export const FONT_LABELS: Record<FontFamily, string> = {
  system: 'System Default',
  serif: 'Serif',
  sans: 'Sans Serif',
  mono: 'Monospace',
};

const STORAGE_KEY = 'workspace-typography';

function loadSettings(): TypographySettings {
  if (typeof window === 'undefined') return TYPOGRAPHY_DEFAULTS;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return TYPOGRAPHY_DEFAULTS;
    return { ...TYPOGRAPHY_DEFAULTS, ...JSON.parse(stored) };
  } catch {
    return TYPOGRAPHY_DEFAULTS;
  }
}

function saveSettings(settings: TypographySettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

interface TypographyContextValue {
  settings: TypographySettings;
  update: (patch: Partial<TypographySettings>) => void;
  reset: () => void;
  cssVars: Record<string, string>;
}

const TypographyContext = createContext<TypographyContextValue | null>(null);

export function TypographyProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<TypographySettings>(TYPOGRAPHY_DEFAULTS);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSettings(loadSettings());
    setMounted(true);
  }, []);

  const update = useCallback((patch: Partial<TypographySettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setSettings(TYPOGRAPHY_DEFAULTS);
    saveSettings(TYPOGRAPHY_DEFAULTS);
  }, []);

  const cssVars: Record<string, string> = mounted
    ? {
        '--typo-font': FONT_STACKS[settings.fontFamily],
        '--typo-line-height': String(settings.lineHeight),
        '--typo-max-width': `${settings.maxWidth}%`,
        '--typo-header-indent': `${settings.headerIndent}rem`,
        '--typo-body-indent': `${settings.bodyIndent}rem`,
      }
    : {};

  return (
    <TypographyContext.Provider value={{ settings, update, reset, cssVars }}>
      {children}
    </TypographyContext.Provider>
  );
}

export function useTypography() {
  const ctx = useContext(TypographyContext);
  if (!ctx) {
    return {
      settings: TYPOGRAPHY_DEFAULTS,
      update: () => {},
      reset: () => {},
      cssVars: {} as Record<string, string>,
    };
  }
  return ctx;
}
