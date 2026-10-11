'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useChatStore } from './store';

/**
 * Watches the current URL and auto-sets the chat scope.
 * - /workspaces/[slug] → workspace scope (needs workspaceId lookup)
 * - Otherwise → general
 *
 * Accepts an optional workspaceMap to resolve slugs to IDs without extra fetches.
 */
export function useAutoScope(workspaceMap?: Map<string, number>) {
  const pathname = usePathname();
  const setScope = useChatStore((s) => s.setScope);
  const lastSlug = useRef<string | null>(null);

  useEffect(() => {
    const match = pathname.match(/^\/workspaces\/([^/]+)/);
    const slug = match?.[1] ?? null;

    if (slug === lastSlug.current) return;
    lastSlug.current = slug;

    if (slug && workspaceMap?.has(slug)) {
      setScope({ type: 'workspace', workspaceId: workspaceMap.get(slug)! });
    } else if (!slug) {
      setScope({ type: 'general' });
    }
  }, [pathname, workspaceMap, setScope]);
}
