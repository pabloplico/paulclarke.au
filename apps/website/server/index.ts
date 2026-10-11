import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { POSTS } from './posts.generated';

interface Env {
  ENVIRONMENT?: string;
}

const app = new Hono<{ Bindings: Env }>();

app.use('/api/*', async (c, next) => {
  if (c.env.ENVIRONMENT === 'development') {
    return cors()(c, next);
  }
  await next();
});

// ── Posts (bundled at build time from content/posts/*.md) ───────────────────

interface PostMeta {
  slug: string;
  title: string;
  date: string;
  excerpt: string;
  tags: string[];
}

interface Post extends PostMeta {
  content: string;
}

function getAllPosts(): PostMeta[] {
  return POSTS.map(({ content: _content, ...meta }) => meta).sort((a, b) =>
    a.date > b.date ? -1 : 1
  );
}

function getPostBySlug(slug: string): Post | null {
  return POSTS.find((p) => p.slug === slug) ?? null;
}

app.get('/api/posts', (c) => {
  return c.json(getAllPosts());
});

app.get('/api/posts/:slug', (c) => {
  const slug = c.req.param('slug');
  const post = getPostBySlug(slug);
  if (!post) return c.json({ error: 'Post not found' }, 404);
  return c.json(post);
});

export default app;
