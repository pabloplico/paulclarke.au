import { Badge } from '@repo/ui/badge';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Calendar, Tag } from 'lucide-react';
import { formatPostDate, postsQuery } from '@/lib/api/posts';

export function PostList() {
  // Data is loaded by the /writing route loader, so this never suspends on navigation
  const { data: posts } = useSuspenseQuery(postsQuery);

  if (posts.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>No posts yet. Check back soon.</p>
      </div>
    );
  }

  return (
    <ul className="space-y-4">
      {posts.map((post) => (
        <li
          key={post.slug}
          className="relative rounded-xl bg-card border border-white/10 glass p-6 hover:border-primary/30 transition-all group"
        >
          <h2 className="text-lg font-semibold group-hover:text-primary transition-colors">
            {/* The ::after overlay makes the whole card clickable while the link's
                accessible name stays just the title */}
            <Link
              to="/writing/$slug"
              params={{ slug: post.slug }}
              className="after:absolute after:inset-0 after:rounded-xl"
            >
              {post.title}
            </Link>
          </h2>
          {post.excerpt && (
            <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{post.excerpt}</p>
          )}
          <div className="flex flex-wrap items-center gap-3 mt-4 text-xs text-muted-foreground">
            {post.date && (
              <span className="flex items-center gap-1 shrink-0">
                <Calendar aria-hidden="true" className="h-3 w-3" />
                <time dateTime={post.date}>{formatPostDate(post.date)}</time>
              </span>
            )}
            {post.tags.length > 0 && (
              <span className="flex flex-wrap items-center gap-1.5">
                <Tag aria-hidden="true" className="h-3 w-3 shrink-0" />
                <span className="sr-only">Tags:</span>
                {post.tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="text-xs px-1.5 py-0 bg-white/5 border-0"
                  >
                    {tag}
                  </Badge>
                ))}
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function PostListSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      {[1, 2].map((i) => (
        <div key={i} className="rounded-xl bg-card border border-white/10 p-6 animate-pulse">
          <div className="h-6 bg-white/5 rounded w-3/4 mb-3" />
          <div className="h-4 bg-white/5 rounded w-full mb-2" />
          <div className="h-4 bg-white/5 rounded w-1/2" />
        </div>
      ))}
    </div>
  );
}
