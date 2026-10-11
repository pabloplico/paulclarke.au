import { Link, useRouter } from '@tanstack/react-router';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const pageClass = 'pt-20 md:pt-32 pb-16 max-w-2xl space-y-4';
const actionClass =
  'inline-flex items-center rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground';

export function NotFoundPage() {
  useDocumentTitle('Page not found');
  return (
    <section className={pageClass}>
      <h1 className="text-4xl font-bold tracking-tight">Page not found</h1>
      <p className="text-muted-foreground">There’s nothing at this address.</p>
      <Link to="/" className={actionClass}>
        Go to the home page
      </Link>
    </section>
  );
}

/** Shown when a route's loader fails, e.g. the blog API is unreachable. */
export function RouteErrorPage() {
  const router = useRouter();
  useDocumentTitle('Something went wrong');
  return (
    <section className={pageClass} role="alert">
      <h1 className="text-4xl font-bold tracking-tight">Something went wrong</h1>
      <p className="text-muted-foreground">This page couldn’t be loaded. Please try again.</p>
      <button type="button" onClick={() => router.invalidate()} className={actionClass}>
        Try again
      </button>
    </section>
  );
}
