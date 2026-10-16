// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('./posts.generated', () => ({
  POSTS: [
    { slug: 'middle', title: 'Middle', date: '2026-02-01', excerpt: 'm', tags: [], content: 'M' },
    {
      slug: 'newest',
      title: 'Newest',
      date: '2026-03-05',
      excerpt: 'n',
      tags: ['AI'],
      content: 'N',
    },
    { slug: 'oldest', title: 'Oldest', date: '2025-12-31', excerpt: 'o', tags: [], content: 'O' },
  ],
}));

const { default: app } = await import('./index');

/** Requests the Worker as production sees it. */
const get = (path: string) => app.request(path, {}, { ENVIRONMENT: 'production' });

describe('posts API', () => {
  it('lists posts newest first, without their content', async () => {
    const response = await get('/api/posts');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      { slug: 'newest', title: 'Newest', date: '2026-03-05', excerpt: 'n', tags: ['AI'] },
      { slug: 'middle', title: 'Middle', date: '2026-02-01', excerpt: 'm', tags: [] },
      { slug: 'oldest', title: 'Oldest', date: '2025-12-31', excerpt: 'o', tags: [] },
    ]);
  });

  it('returns one post with its content, or 404', async () => {
    expect(await (await get('/api/posts/middle')).json()).toMatchObject({
      slug: 'middle',
      content: 'M',
    });

    const missing = await get('/api/posts/nope');
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: 'Post not found' });
  });
});
