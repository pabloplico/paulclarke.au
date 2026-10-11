import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseRss } from './rss-parser';

// No mocks needed — parseRss is a pure function

beforeEach(() => {
  vi.clearAllMocks();
});

describe('parseRss', () => {
  // ── TC-008-RSS-01 — RSS 2.0 with content:encoded (happy path) ────────────

  it('TC-008-RSS-01: parses RSS 2.0 with content:encoded', () => {
    const xml = `<?xml version="1.0"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <item>
      <title>Test Article</title>
      <link>https://example.com/article</link>
      <guid>https://example.com/article</guid>
      <content:encoded><![CDATA[<p>Article body</p>]]></content:encoded>
      <pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

    const items = parseRss(xml);

    expect(items.length).toBe(1);
    expect(items[0]!.title).toBe('Test Article');
    expect(items[0]!.link).toBe('https://example.com/article');
    expect(items[0]!.guid).toBe('https://example.com/article');
    expect(items[0]!.content).toBe('<p>Article body</p>');
    expect(items[0]!.pubDate).toBeInstanceOf(Date);
    expect(items[0]!.pubDate!.toISOString()).toMatch(/^2024-01-01/);
  });

  // ── TC-008-RSS-02 — Falls back to description when content:encoded absent ─

  it('TC-008-RSS-02: falls back to description when content:encoded absent', () => {
    const xml = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <item>
      <title>Article</title>
      <link>https://example.com/article</link>
      <guid>https://example.com/article</guid>
      <description>Plain description</description>
    </item>
  </channel>
</rss>`;

    const items = parseRss(xml);

    expect(items[0]!.content).toBe('Plain description');
  });

  // ── TC-008-RSS-03 — guid as object with #text child ───────────────────────

  it('TC-008-RSS-03: handles guid as object with isPermaLink attribute', () => {
    const xml = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <item>
      <title>Article</title>
      <link>https://example.com</link>
      <guid isPermaLink="false">unique-id-123</guid>
      <description>body</description>
    </item>
  </channel>
</rss>`;

    const items = parseRss(xml);

    expect(items[0]!.guid).toBe('unique-id-123');
  });

  // ── TC-008-RSS-04 — Atom feed with string title and alternate link ─────────

  it('TC-008-RSS-04: parses Atom feed with string title and alternate link', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>urn:uuid:1225c695-cfb8-4ebb-aaaa-80da344efa6a</id>
    <title>Atom Article</title>
    <link rel="alternate" href="https://example.com/atom-article"/>
    <content type="html">&lt;p&gt;Atom body&lt;/p&gt;</content>
    <published>2024-03-01T10:00:00Z</published>
  </entry>
</feed>`;

    const items = parseRss(xml);

    expect(items.length).toBe(1);
    expect(items[0]!.guid).toBe('urn:uuid:1225c695-cfb8-4ebb-aaaa-80da344efa6a');
    expect(items[0]!.title).toBe('Atom Article');
    expect(items[0]!.link).toBe('https://example.com/atom-article');
    expect(items[0]!.pubDate).toBeInstanceOf(Date);
  });

  // ── TC-008-RSS-05 — Atom entry with title as object (#text) ──────────────

  it('TC-008-RSS-05: Atom entry with title as object uses #text value', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>urn:uuid:abc123</id>
    <title type="html">My &amp; Title</title>
    <link rel="alternate" href="https://example.com/entry"/>
    <content>body</content>
    <published>2024-03-01T10:00:00Z</published>
  </entry>
</feed>`;

    const items = parseRss(xml);

    expect(items[0]!.title).toBe('My & Title');
  });

  // ── TC-008-RSS-06 — Atom link as array, picks alternate rel ──────────────

  it('TC-008-RSS-06: Atom link as array picks alternate rel href', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>urn:uuid:abc123</id>
    <title>My Article</title>
    <link rel="self" href="https://example.com/feed/entry1"/>
    <link rel="alternate" href="https://example.com/article1"/>
    <content>body</content>
    <published>2024-03-01T10:00:00Z</published>
  </entry>
</feed>`;

    const items = parseRss(xml);

    expect(items[0]!.link).toBe('https://example.com/article1');
  });

  // ── TC-008-RSS-07 — Malformed XML returns empty array ────────────────────

  it('TC-008-RSS-07: malformed XML returns empty array without throwing', () => {
    const xml = 'not xml at all <<<';

    const items = parseRss(xml);

    expect(items).toEqual([]);
  });

  // ── TC-008-RSS-08 — Valid XML but unrecognised structure returns empty array

  it('TC-008-RSS-08: valid XML but unrecognised structure returns empty array', () => {
    const xml = '<root><stuff>data</stuff></root>';

    const items = parseRss(xml);

    expect(items).toEqual([]);
  });

  // ── TC-008-RSS-09 — Invalid pubDate string results in undefined pubDate ───

  it('TC-008-RSS-09: invalid pubDate string results in undefined pubDate', () => {
    const xml = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <item>
      <title>Article</title>
      <link>https://example.com</link>
      <guid>https://example.com</guid>
      <description>body</description>
      <pubDate>not-a-date</pubDate>
    </item>
  </channel>
</rss>`;

    const items = parseRss(xml);

    expect(items[0]!.pubDate).toBeUndefined();
  });

  // ── TC-008-RSS-10 — Multiple items returned in order ─────────────────────

  it('TC-008-RSS-10: multiple items returned in insertion order', () => {
    const xml = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <item>
      <title>First Article</title>
      <link>https://example.com/1</link>
      <guid>https://example.com/1</guid>
      <description>body 1</description>
    </item>
    <item>
      <title>Second Article</title>
      <link>https://example.com/2</link>
      <guid>https://example.com/2</guid>
      <description>body 2</description>
    </item>
    <item>
      <title>Third Article</title>
      <link>https://example.com/3</link>
      <guid>https://example.com/3</guid>
      <description>body 3</description>
    </item>
  </channel>
</rss>`;

    const items = parseRss(xml);

    expect(items.length).toBe(3);
    expect(items[0]!.title).toBe('First Article');
    expect(items[1]!.title).toBe('Second Article');
    expect(items[2]!.title).toBe('Third Article');
  });
});
