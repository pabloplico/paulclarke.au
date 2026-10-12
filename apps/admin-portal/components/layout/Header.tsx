'use client';

import { HelpCircle, LogOut, Menu } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useDemoMode } from '@/components/demo/demo-features';
import { useHeaderSlot } from './header-context';
import { SearchBar } from './search-bar';

const PAGE_TITLES: Record<string, string> = {
  '/': 'Workspaces',
  '/workspaces': 'Workspaces',
  '/knowledge-base': 'Knowledge Base',
  '/clients': 'Clients',
  '/documents': 'Documents',
  '/inbox': 'Inbox',
  '/chat': 'Chat',
  '/gap-analysis': 'Gap Analysis',
  '/settings': 'Settings',
  '/jobs': 'Jobs',
  '/scheduler': 'Scheduler',
  '/communications': 'Communications',
  '/email-templates': 'Email Templates',
};

function resolveTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  if (pathname.match(/^\/documents\/\d+\/review$/)) return 'Chunk Review';
  if (pathname.startsWith('/workspaces/')) return 'Workspace';
  if (pathname.startsWith('/clients/')) return 'Client';
  if (pathname.startsWith('/jobs/')) return 'Job';
  return (
    Object.entries(PAGE_TITLES).find(([path]) => path !== '/' && pathname.startsWith(path))?.[1] ??
    'Admin Portal'
  );
}

interface HeaderProps {
  onMobileMenuToggle?: () => void;
}

export function Header({ onMobileMenuToggle }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const title = resolveTitle(pathname);
  const { slot } = useHeaderSlot();

  const demoMode = useDemoMode();

  async function handleLogout() {
    if (demoMode) {
      // Demo visitors are signed in by Cloudflare Access, which owns the session
      window.location.href = '/cdn-cgi/access/logout';
      return;
    }
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-border px-3 md:px-6 gap-2 md:gap-4">
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onMobileMenuToggle}
          className="flex md:hidden h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="text-base md:text-lg font-semibold tracking-tight shrink-0">{title}</h1>
      </div>
      {slot && <div className="flex-1 min-w-0">{slot}</div>}
      <div className="flex items-center gap-1 md:gap-3 shrink-0">
        <SearchBar />
        <Link
          href="/guide"
          className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          title="How to use this app"
        >
          <HelpCircle className="h-4 w-4" />
        </Link>
        <button
          type="button"
          onClick={handleLogout}
          className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          title="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
