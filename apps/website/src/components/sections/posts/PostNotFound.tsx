import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

// Kept separate from PostDetail so the not-found page doesn't pull react-markdown into the
// main bundle (the route's notFoundComponent is defined eagerly in router.tsx).
export function PostNotFound() {
  useDocumentTitle('Post not found');
  return (
    <div className="max-w-2xl pt-20 md:pt-32 pb-16 space-y-4">
      <h1 className="text-3xl font-bold tracking-tight">Post not found</h1>
      <p className="text-muted-foreground">That post doesn’t exist or has been removed.</p>
      <Link
        to="/writing"
        className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
      >
        <ArrowLeft size={16} aria-hidden="true" /> Back to writing
      </Link>
    </div>
  );
}
