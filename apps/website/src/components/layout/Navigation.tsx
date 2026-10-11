import { Link, type LinkProps } from '@tanstack/react-router';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  to: NonNullable<LinkProps['to']>;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Home', to: '/' },
  { label: 'Projects', to: '/projects' },
  { label: 'Assessment', to: '/assessment' },
  { label: 'About', to: '/about' },
  { label: 'Writing', to: '/writing' },
  { label: 'Contact', to: '/contact' },
];

// <Link> sets aria-current="page" and data-status="active" on the active route
const linkState = 'text-white/70 hover:text-primary data-[status=active]:text-primary';

export function Navigation() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const close = () => setMobileOpen(false);

  const renderLinks = (mobile: boolean) =>
    NAV_ITEMS.map(({ label, to }) => (
      <li key={to}>
        <Link
          to={to}
          // Home must match exactly, otherwise "/" would be active on every page
          activeOptions={{ exact: to === '/' }}
          onClick={close}
          className={cn(
            linkState,
            'transition-colors duration-300 font-medium tracking-tight text-sm',
            mobile ? 'block px-4 py-2.5 rounded-lg' : 'px-3 py-1.5'
          )}
        >
          {label}
        </Link>
      </li>
    ));

  return (
    <nav
      aria-label="Main"
      className="fixed top-0 left-0 right-0 z-40 bg-background/60 backdrop-blur-xl shadow-2xl shadow-black/20"
    >
      <div className="max-w-7xl mx-auto px-8 flex items-center justify-between h-16">
        <Link to="/" onClick={close} className="flex items-center gap-2.5">
          <img
            src="/images/logo.svg"
            alt=""
            width={32}
            height={32}
            className="h-8 w-8 rounded-full"
          />
          <span className="text-lg font-semibold text-white tracking-tight">Paul Clarke</span>
        </Link>

        <ul className="hidden md:flex items-center gap-8">{renderLinks(false)}</ul>

        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden p-2 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Menu"
          aria-expanded={mobileOpen}
          aria-controls="mobile-menu"
        >
          {mobileOpen ? <X size={24} aria-hidden="true" /> : <Menu size={24} aria-hidden="true" />}
        </button>
      </div>

      {mobileOpen && (
        <div
          id="mobile-menu"
          className="md:hidden border-t border-white/[0.08] bg-background/95 backdrop-blur-xl"
        >
          <ul className="max-w-7xl mx-auto px-8 py-4 flex flex-col gap-1">{renderLinks(true)}</ul>
        </div>
      )}
    </nav>
  );
}
