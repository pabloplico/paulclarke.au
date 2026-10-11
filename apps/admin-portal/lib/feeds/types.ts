export type FeedType = 'rss' | 'page';

export type FeedConfig = {
  id: number;
  userId: number;
  url: string;
  type: FeedType;
  workspaceId: number | null;
  lastFetchedAt: Date | null;
  lastContentHash: string | null;
};

export type RssItem = {
  guid: string;
  title: string;
  link: string;
  content: string;
  pubDate?: Date;
};
