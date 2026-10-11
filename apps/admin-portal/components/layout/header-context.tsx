'use client';

import { createContext, useCallback, useContext, useState } from 'react';

interface HeaderContextValue {
  /** Custom ReactNode to replace the default page title in the header. */
  slot: React.ReactNode | null;
  setSlot: (node: React.ReactNode | null) => void;
}

const HeaderContext = createContext<HeaderContextValue>({
  slot: null,
  setSlot: () => {},
});

export function HeaderProvider({ children }: { children: React.ReactNode }) {
  const [slot, setSlotRaw] = useState<React.ReactNode | null>(null);
  const setSlot = useCallback((node: React.ReactNode | null) => setSlotRaw(node), []);

  return <HeaderContext.Provider value={{ slot, setSlot }}>{children}</HeaderContext.Provider>;
}

export function useHeaderSlot() {
  return useContext(HeaderContext);
}
