'use client';

import { Toaster } from '@repo/ui/sonner';
import { useMemo, useState } from 'react';
import { FloatingChat } from '@/components/chat/FloatingChat';
import { Header } from './Header';
import { HeaderProvider } from './header-context';
import { Sidebar } from './Sidebar';

interface ShellProps {
  children: React.ReactNode;
  userRole?: string;
  workspaces?: { id: number; title: string; slug: string }[];
  knowledgeBases?: { id: number; name: string }[];
}

export function Shell({ children, userRole, workspaces, knowledgeBases }: ShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const workspaceMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const w of workspaces ?? []) {
      map.set(w.slug, w.id);
    }
    return map;
  }, [workspaces]);

  return (
    <HeaderProvider>
      <div className="flex h-dvh overflow-hidden">
        {/* Mobile overlay backdrop */}
        {mobileOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={() => setMobileOpen(false)}
            onKeyDown={(e) => e.key === 'Escape' && setMobileOpen(false)}
            aria-hidden="true"
          />
        )}
        <Sidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed(!collapsed)}
          userRole={userRole}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
        />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header onMobileMenuToggle={() => setMobileOpen(!mobileOpen)} />
          <main className="flex-1 overflow-y-auto scrollbar-thin p-4 md:p-6">{children}</main>
        </div>
        <FloatingChat
          workspaceMap={workspaceMap}
          workspaces={workspaces}
          knowledgeBases={knowledgeBases}
        />
        <Toaster />
      </div>
    </HeaderProvider>
  );
}
