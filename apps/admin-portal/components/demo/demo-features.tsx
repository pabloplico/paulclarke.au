'use client';

import { createContext, useCallback, useContext } from 'react';
import { type DemoFeature, routeFeature } from '@/lib/demo';

type DemoState = { demoMode: boolean; disabled: readonly DemoFeature[] };

const DemoFeaturesContext = createContext<DemoState>({ demoMode: false, disabled: [] });

/**
 * Demo state for client components. The server layout reads DEMO_MODE and
 * passes it down, because process.env isn't available in the browser.
 * Hiding UI is cosmetic: the middleware is what actually refuses the routes.
 */
export function DemoFeaturesProvider({
  demoMode,
  disabled,
  children,
}: DemoState & { children: React.ReactNode }) {
  return (
    <DemoFeaturesContext.Provider value={{ demoMode, disabled }}>
      {children}
    </DemoFeaturesContext.Provider>
  );
}

export function useDemoMode(): boolean {
  return useContext(DemoFeaturesContext).demoMode;
}

export function useFeatureEnabled(feature: DemoFeature): boolean {
  return !useContext(DemoFeaturesContext).disabled.includes(feature);
}

/** Returns a check for whether a link's page is switched on. */
export function useHrefVisible(): (href: string) => boolean {
  const { disabled } = useContext(DemoFeaturesContext);
  return useCallback(
    (href: string) => {
      const feature = routeFeature(href);
      return !feature || feature === 'core' || !disabled.includes(feature);
    },
    [disabled]
  );
}
