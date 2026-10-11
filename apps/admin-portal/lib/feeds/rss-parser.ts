import { XMLParser } from 'fast-xml-parser';
import type { RssItem } from './types';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => ['item', 'entry'].includes(name),
});

/**
 * Parse RSS 2.0 or Atom XML into a normalized RssItem array.
 * Returns an empty array for malformed or unrecognised XML.
 */
export function parseRss(xml: string): RssItem[] {
  try {
    const doc = parser.parse(xml);

    // RSS 2.0
    const rssItems: unknown[] | undefined = doc?.rss?.channel?.item ?? doc?.rdf?.item;
    if (rssItems) {
      return rssItems.map(normalizeRssItem);
    }

    // Atom
    const atomEntries: unknown[] | undefined = doc?.feed?.entry;
    if (atomEntries) {
      return atomEntries.map(normalizeAtomEntry);
    }

    return [];
  } catch {
    return [];
  }
}

// biome-ignore lint/suspicious/noExplicitAny: XML parsing yields untyped data
function normalizeRssItem(item: any): RssItem {
  const guid = String(item.guid?.['#text'] ?? item.guid ?? item.link ?? '');
  const title = String(item.title ?? '');
  const link = String(item.link ?? '');
  const content = String(item['content:encoded'] ?? item.description ?? item.summary ?? '');
  const pubDate = item.pubDate ? safeDate(item.pubDate) : undefined;

  return { guid, title, link, content, pubDate };
}

// biome-ignore lint/suspicious/noExplicitAny: XML parsing yields untyped data
function normalizeAtomEntry(entry: any): RssItem {
  const guid = String(entry.id ?? getLinkHref(entry.link) ?? '');
  const title =
    typeof entry.title === 'object'
      ? String(entry.title['#text'] ?? '')
      : String(entry.title ?? '');
  const link = getLinkHref(entry.link);
  const content = String(entry.content?.['#text'] ?? entry.content ?? entry.summary ?? '');
  const pubDate = entry.published
    ? safeDate(entry.published)
    : entry.updated
      ? safeDate(entry.updated)
      : undefined;

  return { guid, title, link, content, pubDate };
}

// biome-ignore lint/suspicious/noExplicitAny: XML link can be string, object, or array
function getLinkHref(link: any): string {
  if (!link) return '';
  if (typeof link === 'string') return link;
  if (Array.isArray(link)) {
    const alt = link.find((l) => l['@_rel'] === 'alternate' || !l['@_rel']);
    return String(alt?.['@_href'] ?? link[0]?.['@_href'] ?? '');
  }
  return String(link['@_href'] ?? '');
}

function safeDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? undefined : d;
}
