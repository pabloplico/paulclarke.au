import { Badge } from '@repo/ui/badge';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Calendar, Tag } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { formatPostDate, postQuery } from '@/lib/api/posts';

const backLinkClass =
  'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors';

/** The /writing/$slug route. Lazy-loaded because react-markdown is only needed here. */
export function PostDetail({ slug }: { slug: string }) {
  // The route loader has already fetched this (or rendered not-found), so data is defined
  const { data: post } = useSuspenseQuery(postQuery(slug));
  useDocumentTitle(post.title);

  return (
    <article className="max-w-2xl pt-20 md:pt-32 pb-16">
      <Link to="/writing" className={`${backLinkClass} mb-6`}>
        <ArrowLeft size={16} aria-hidden="true" /> Back to writing
      </Link>

      <header className="mb-8 space-y-3">
        <h1 className="text-3xl font-bold tracking-tight">{post.title}</h1>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          {post.date && (
            <span className="flex items-center gap-1">
              <Calendar aria-hidden="true" className="h-3.5 w-3.5" />
              <time dateTime={post.date}>{formatPostDate(post.date)}</time>
            </span>
          )}
          {post.tags.length > 0 && (
            <span className="flex items-center gap-1.5">
              <Tag aria-hidden="true" className="h-3.5 w-3.5" />
              <span className="sr-only">Tags:</span>
              {post.tags.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="text-xs px-2 py-0 bg-white/5 border-0"
                >
                  {tag}
                </Badge>
              ))}
            </span>
          )}
        </div>
      </header>

      <div className="prose prose-invert max-w-none prose-headings:tracking-tight prose-a:text-primary">
        <ReactMarkdown>{post.content}</ReactMarkdown>
      </div>
    </article>
  );
}
