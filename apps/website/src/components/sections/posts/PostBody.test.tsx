import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { parseFrontmatter, readPosts } from '../../../../scripts/posts.mjs';
import { PostBody } from './PostDetail';

/**
 * How posts render, so a react-markdown upgrade that changes the output fails
 * here. Every published post is checked against its own Markdown source, so
 * editing or adding a post doesn't touch this file. The fixture pins the exact
 * HTML for what posts may use beyond them.
 */

/** The structure of a rendered post. */
function renderedOutline(content: string) {
  const { container } = render(<PostBody content={content} />);
  const root = container.firstElementChild as HTMLElement;
  return {
    root,
    headings: [...root.querySelectorAll('h1, h2, h3, h4, h5, h6')].map(
      (h) => `${h.tagName.toLowerCase()} ${h.textContent}`
    ),
    links: [...root.querySelectorAll('a')].map((a) => a.getAttribute('href')),
    orderedListItems: [...root.querySelectorAll('ol')].map((list) => list.children.length),
    unorderedListItems: [...root.querySelectorAll('ul')].map((list) => list.children.length),
    paragraphs: root.querySelectorAll(':scope > p').length,
  };
}

const BULLET = /^[-*+]\s/;
const NUMBERED = /^\d+\.\s/;

/** Inline Markdown reduced to its text: [text](url) -> text, emphasis and code marks dropped. */
const plain = (line: string) => line.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '');

/**
 * The same structure, read from the Markdown source (CommonMark, as PostBody
 * renders it). Enough for the posts' own syntax: headings, links, flat lists,
 * rules and paragraphs. Blank lines between items keep a list together.
 */
function sourceOutline(markdown: string) {
  const headings: string[] = [];
  const orderedListItems: number[] = [];
  const unorderedListItems: number[] = [];
  let paragraphs = 0;
  let previous: 'ol' | 'ul' | 'other' = 'other';

  for (const block of markdown.trim().split(/\n\s*\n/)) {
    const lines = block.split('\n');
    const heading = lines.length === 1 ? lines[0]?.match(/^(#{1,6})\s+(.+)$/) : null;
    if (heading) {
      headings.push(`h${heading[1]?.length} ${plain(heading[2] ?? '')}`);
      previous = 'other';
    } else if (/^(-{3,}|\*{3,}|_{3,})$/.test(block.trim())) {
      previous = 'other';
    } else {
      // A paragraph, optionally followed by a list that interrupts it
      const firstItem = lines.findIndex((l) => BULLET.test(l) || NUMBERED.test(l));
      if (firstItem !== 0) paragraphs++;
      if (firstItem === -1) {
        previous = 'other';
        continue;
      }
      const kind = BULLET.test(lines[firstItem] ?? '') ? 'ul' : 'ol';
      const pattern = kind === 'ul' ? BULLET : NUMBERED;
      const items = lines.filter((l) => pattern.test(l)).length;
      const counts = kind === 'ul' ? unorderedListItems : orderedListItems;
      // A list after a blank line continues the one before it
      if (previous === kind && firstItem === 0) counts.push((counts.pop() ?? 0) + items);
      else counts.push(items);
      previous = kind;
    }
  }

  return {
    headings,
    links: [...markdown.matchAll(/(?<!!)\[[^\]]*\]\(([^)\s]+)\)/g)].map((m) => m[1]),
    orderedListItems,
    unorderedListItems,
    paragraphs,
  };
}

describe('PostBody', () => {
  it.each(
    readPosts().map((post) => [post.slug, post.content])
  )('renders %s as its Markdown says', (_slug, content) => {
    const expected = sourceOutline(content);
    const { root: _root, ...rendered } = renderedOutline(content);

    expect(expected.headings.length).toBeGreaterThan(0);
    expect(expected.paragraphs).toBeGreaterThan(0);
    expect(rendered).toEqual(expected);
  });

  it('renders code, quotes and rules; tables, raw HTML and bare URLs stay text (no GFM)', () => {
    const fixture = readFileSync(
      join(__dirname, '../../../../test/fixtures/markdown-features.md'),
      'utf8'
    );

    const { root } = renderedOutline(parseFrontmatter(fixture).content);

    expect(root.innerHTML).toBe(
      [
        '<p>Intro with <code>inline code</code>, <strong>bold</strong>, <em>emphasis</em> and a <a href="/writing">relative link</a>.</p>',
        '<h3>A third-level heading</h3>',
        '<pre><code class="language-ts">const answer: number = 42;\n</code></pre>',
        '<blockquote>\n<p>A quoted line.</p>\n</blockquote>',
        '<p>| Cafe | Price |\n| --- | --- |\n| Harbourside | $5.20 |</p>',
        '<hr>',
        '<p>Raw &lt;span&gt;HTML&lt;/span&gt; stays text.</p>',
        '<p>https://example.com is a bare URL.</p>',
      ].join('\n')
    );
  });
});
