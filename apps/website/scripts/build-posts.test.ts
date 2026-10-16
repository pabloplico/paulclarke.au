// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { parseFrontmatter, readPosts } from './build-posts.mjs';

const dir = mkdtempSync(join(tmpdir(), 'build-posts-'));

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('parseFrontmatter', () => {
  it('reads quoted, unquoted and list values, and keeps the body', () => {
    const raw = [
      '---',
      'title: "A post: with a colon"',
      "date: '2026-03-05'",
      'author: Paul',
      'tags: ["AI", \'Strategy\', Workforce]',
      'not a key value line',
      '---',
      '',
      '# Body',
      'text',
    ].join('\n');

    expect(parseFrontmatter(raw)).toEqual({
      data: {
        title: 'A post: with a colon',
        date: '2026-03-05',
        author: 'Paul',
        tags: ['AI', 'Strategy', 'Workforce'],
      },
      content: '\n# Body\ntext',
    });
  });

  it('handles Windows line endings', () => {
    expect(parseFrontmatter('---\r\ntitle: CRLF\r\n---\r\nBody')).toEqual({
      data: { title: 'CRLF' },
      content: 'Body',
    });
  });

  it('treats a file without front matter as all body', () => {
    expect(parseFrontmatter('Just text')).toEqual({ data: {}, content: 'Just text' });
  });
});

describe('readPosts', () => {
  it('takes the slug from the file name, with defaults for missing fields', () => {
    writeFileSync(join(dir, 'first-post.md'), '---\ntitle: First\ndate: 2026-01-02\n---\nHello');
    writeFileSync(join(dir, 'no-front-matter.md'), 'Only a body');
    writeFileSync(join(dir, 'notes.txt'), 'not a post');

    const posts = readPosts(dir).sort((a, b) => a.slug.localeCompare(b.slug));

    expect(posts).toEqual([
      {
        slug: 'first-post',
        title: 'First',
        date: '2026-01-02',
        excerpt: '',
        tags: [],
        content: 'Hello',
      },
      {
        slug: 'no-front-matter',
        title: 'no-front-matter',
        date: '',
        excerpt: '',
        tags: [],
        content: 'Only a body',
      },
    ]);
  });

  it('reads the published posts with a title, an ISO date and tags', () => {
    const posts = readPosts();

    expect(posts.map((p) => p.slug).sort()).toEqual(['ai-adoption-gap', 'thinking-about-thinking']);
    for (const p of posts) {
      expect(p.title).not.toBe(p.slug);
      expect(p.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(p.tags.length).toBeGreaterThan(0);
    }
  });

  it('returns no posts for a missing folder', () => {
    expect(readPosts(join(dir, 'missing'))).toEqual([]);
  });
});
