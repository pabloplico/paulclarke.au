import { queryOptions } from '@tanstack/react-query';

export interface PostMeta {
  slug: string;
  title: string;
  date: string;
  excerpt: string;
  tags: string[];
}

export interface Post extends PostMeta {
  content: string;
}

/** Thrown when the API returns 404, so the route can render its not-found page. */
export class PostNotFoundError extends Error {
  constructor(slug: string) {
    super(`Post not found: ${slug}`);
    this.name = 'PostNotFoundError';
  }
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request to ${url} failed with ${res.status}`);
  return (await res.json()) as T;
}

// Posts are bundled into the Worker at build time, so they only change on deploy:
// once fetched in a session they never go stale.
export const postsQuery = queryOptions({
  queryKey: ['posts'],
  queryFn: () => getJson<PostMeta[]>('/api/posts'),
  staleTime: Number.POSITIVE_INFINITY,
});

export const postQuery = (slug: string) =>
  queryOptions({
    queryKey: ['posts', slug],
    queryFn: async () => {
      const res = await fetch(`/api/posts/${encodeURIComponent(slug)}`);
      if (res.status === 404) throw new PostNotFoundError(slug);
      if (!res.ok) throw new Error(`Request for post "${slug}" failed with ${res.status}`);
      return (await res.json()) as Post;
    },
    staleTime: Number.POSITIVE_INFINITY,
    // A missing post won't appear on retry
    retry: (count, error) => !(error instanceof PostNotFoundError) && count < 2,
  });

export function formatPostDate(date: string): string {
  return new Date(date).toLocaleDateString('en-AU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
