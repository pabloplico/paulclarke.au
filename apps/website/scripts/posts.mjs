// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Reads the blog posts in content/posts. No side effects: build-posts.mjs is
 * the script that writes them out for the Worker.
 */

export const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const POSTS_DIR = path.join(APP_ROOT, 'content', 'posts');

/**
 * @typedef {object} Post
 * @property {string} slug
 * @property {string} title
 * @property {string} date
 * @property {string} excerpt
 * @property {string[]} tags
 * @property {string} content
 */

/**
 * Splits a Markdown file into its front matter (simple `key: value` lines) and body.
 * @param {string} raw
 * @returns {{ data: Record<string, string | string[]>, content: string }}
 */
export function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { data: {}, content: raw };

  const frontmatter = match[1] ?? '';
  const content = match[2] ?? '';
  /** @type {Record<string, string | string[]>} */
  const data = {};

  for (const line of frontmatter.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (value.startsWith('[') && value.endsWith(']')) {
      const inner = value.slice(1, -1);
      data[key] = inner
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    } else {
      data[key] = value;
    }
  }

  return { data, content };
}

/**
 * A front matter value as text, or the fallback when it's missing or a list.
 * @param {string | string[] | undefined} value
 * @param {string} fallback
 */
function text(value, fallback) {
  return typeof value === 'string' ? value : fallback;
}

/**
 * Every `*.md` post in `dir`, its slug taken from the file name.
 * @param {string} [dir]
 * @returns {Post[]}
 */
export function readPosts(dir = POSTS_DIR) {
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.md')) : [];

  return files.map((filename) => {
    const slug = filename.replace(/\.md$/, '');
    const raw = fs.readFileSync(path.join(dir, filename), 'utf-8');
    const { data, content } = parseFrontmatter(raw);
    return {
      slug,
      title: text(data.title, slug),
      date: text(data.date, ''),
      excerpt: text(data.excerpt, ''),
      tags: Array.isArray(data.tags) ? data.tags : [],
      content,
    };
  });
}
