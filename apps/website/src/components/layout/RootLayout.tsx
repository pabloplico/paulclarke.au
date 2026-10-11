import { Outlet, useRouter, useRouterState } from '@tanstack/react-router';
import { useEffect } from 'react';
import { AssessmentStateProvider } from '@/hooks/assessment-state';
import { Footer } from './Footer';
import { Navigation } from './Navigation';
import { SkipLink } from './SkipLink';

/**
 * After an in-app navigation, move focus to the new page's <h1> so keyboard and screen-reader
 * users start at the new content (and hear its heading) instead of staying on the nav link.
 * Not done on first load, so the first Tab still reaches the skip link.
 */
function useFocusHeadingOnNavigate() {
  const router = useRouter();

  useEffect(() => {
    // onResolved fires once lazy chunks and loader data are in, so the <h1> can render
    return router.subscribe('onResolved', ({ fromLocation, pathChanged }) => {
      if (!fromLocation || !pathChanged) return;
      requestAnimationFrame(() => {
        const heading = document.querySelector<HTMLElement>('main h1');
        if (!heading) return;
        heading.tabIndex = -1; // focusable by script, but not a Tab stop
        heading.focus({ preventScroll: true });
      });
    });
  }, [router]);
}

export function RootLayout() {
  useFocusHeadingOnNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <AssessmentStateProvider>
      <SkipLink />
      <Navigation />
      <main id="main" tabIndex={-1} className="min-h-screen pt-16">
        {/* Keyed on the path so the enter animation replays per page */}
        <div className="max-w-7xl mx-auto px-8 section-enter" key={pathname}>
          <Outlet />
        </div>
      </main>
      <Footer />
    </AssessmentStateProvider>
  );
}
