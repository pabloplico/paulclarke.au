import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { PostList } from './posts/PostList';

/** The /writing route: the list of posts. */
export function PostsSection() {
  useDocumentTitle('Writing');

  return (
    <section className="pt-20 md:pt-32 pb-16 relative">
      <div className="absolute -top-24 -left-24 w-96 h-96 bg-primary/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="mb-16">
        <span className="font-label text-primary tracking-[0.2em] text-xs uppercase mb-6 block">
          Writing
        </span>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tighter leading-tight mb-6">
          Thoughts & Updates
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed">
          On frontend development, accessibility, and what AI tools can and can’t actually do.
        </p>
      </div>
      <PostList />
    </section>
  );
}
