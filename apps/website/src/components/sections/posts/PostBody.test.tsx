import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { parseFrontmatter, readPosts } from '../../../../scripts/build-posts.mjs';
import { PostBody } from './PostDetail';

/**
 * How the published posts render, so a react-markdown upgrade that changes
 * the output fails here. The fixture covers what posts may use beyond them.
 */

/** The structure of a rendered post. */
function outline(content: string) {
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

const post = (slug: string) => {
  const found = readPosts().find((p) => p.slug === slug);
  if (!found) throw new Error(`no post ${slug}`);
  return found.content;
};

describe('PostBody', () => {
  it('renders "The AI Adoption Gap"', () => {
    const rendered = outline(post('ai-adoption-gap'));

    expect(rendered.headings).toEqual([
      'h2 The Numbers Tell a Story',
      "h2 It's Not a Technology Problem — It's a People Problem",
      'h2 Industry Patterns Matter',
      'h2 The Australian Workforce Picture',
      'h2 Where Government Stands',
      'h2 The Real Barriers for SMBs',
      'h2 What Actually Works',
      'h2 The Window Is Still Open',
    ]);
    expect(rendered.links).toEqual([
      'https://businesschamberqld.com.au/article/queensland-businesses-need-support-to-embrace-ai/',
      'https://hbr.org/2026/02/why-ai-adoption-stalls-according-to-industry-data',
      'https://www.jobsandskills.gov.au/studies/generative-artificial-intelligence-capacity-study/industry-data-on-ai-exposure',
      'https://www.qrida.qld.gov.au/artificial-intelligence-transparency-statement',
      '/#contact',
    ]);
    expect(rendered.orderedListItems).toEqual([]);
    expect(rendered.unorderedListItems).toEqual([3, 5]);
    expect(rendered.paragraphs).toBe(27);
  });

  it('renders "Your AI Tool Isn’t Thinking"', () => {
    const rendered = outline(post('thinking-about-thinking'));

    expect(rendered.headings).toEqual([
      'h2 What AI tools are actually doing',
      'h2 "But it shows its working" — the chain of thought problem',
      'h2 The information problem',
      'h2 Where it goes wrong in business settings',
      'h2 So what is it actually good for?',
      'h2 Three questions to ask before using AI in your business',
      'h2 The bottom line',
    ]);
    expect(rendered.links).toEqual(['https://linkedin.com/in/georgemontanez']);
    expect(rendered.orderedListItems).toEqual([3]);
    expect(rendered.unorderedListItems).toEqual([5, 7]);
    expect(rendered.paragraphs).toBe(26);
  });

  it('renders code, quotes and rules; tables, raw HTML and bare URLs stay text (no GFM)', () => {
    const fixture = readFileSync(
      join(__dirname, '../../../../test/fixtures/markdown-features.md'),
      'utf8'
    );

    const { root } = outline(parseFrontmatter(fixture).content);

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
