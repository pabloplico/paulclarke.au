import { createHash } from 'node:crypto';
import { fetchUrlContent } from '@/lib/document-processing/url-fetcher';
import { parseRss } from './rss-parser';
import type { FeedConfig, RssItem } from './types';

export type FetchResult = {
  items: RssItem[];
  contentHash: string;
};

/**
 * Fetch a feed and return parsed items plus a content hash.
 *
 * - RSS feeds: fetches XML, parses items, hash = SHA-256 of raw XML.
 * - Page feeds: fetches page text, compares hash to previous. Returns a
 *   single synthetic item when content has changed, empty otherwise.
 */
export async function fetchFeed(feed: FeedConfig): Promise<FetchResult> {
  if (feed.type === 'rss') {
    return fetchRssFeed(feed);
  }
  return fetchPageFeed(feed);
}

async function fetchRssFeed(feed: FeedConfig): Promise<FetchResult> {
  const response = await fetch(feed.url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
    },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch RSS feed: ${response.status} ${response.statusText}`);
  }

  const xml = await response.text();
  const contentHash = sha256(xml);
  const items = parseRss(xml);

  return { items, contentHash };
}

async function fetchPageFeed(feed: FeedConfig): Promise<FetchResult> {
  const { text, title } = await fetchUrlContent(feed.url);
  const contentHash = sha256(text);

  // No change since last fetch — nothing new to ingest
  if (feed.lastContentHash === contentHash) {
    return { items: [], contentHash };
  }

  const item: RssItem = {
    guid: `page-${contentHash}`,
    title: title ?? feed.url,
    link: feed.url,
    content: text,
    pubDate: new Date(),
  };

  return { items: [item], contentHash };
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
