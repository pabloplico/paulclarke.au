import { Worker } from 'bullmq';
import { eq } from 'drizzle-orm';
import { config } from '@/lib/config';
import { db } from '@/lib/db';
import { adminFeeds } from '@/lib/db/schema';
import { getRedis } from '@/lib/redis';
import { fetchFeed } from './fetcher';
import { ingestFeedItems } from './ingest';
import { getFeedQueue } from './queue';
import type { FeedConfig } from './types';

let started: Worker | null = null;

/**
 * Schedules the feed check every 15 minutes and starts its worker. Called
 * from instrumentation, and only when Redis is on.
 */
export function startFeedWorker(): Worker {
  if (started) return started;
  // Every 15 minutes
  void getFeedQueue().upsertJobScheduler(
    'feed-check',
    { pattern: '*/15 * * * *' },
    { name: 'check-feeds' }
  );

  const worker = new Worker(
    'feed-monitor',
    async (job) => {
      console.log(`[feed-worker] Starting feed check (job ${job.id})...`);

      const feeds = await db.select().from(adminFeeds).where(eq(adminFeeds.enabled, true));

      if (feeds.length === 0) {
        console.log('[feed-worker] No enabled feeds found');
        return { checked: 0, ingested: 0 };
      }

      let totalIngested = 0;

      for (const row of feeds) {
        const feedConfig: FeedConfig = {
          id: row.id,
          userId: row.userId,
          url: row.url,
          type: row.type as FeedConfig['type'],
          workspaceId: row.workspaceId,
          lastFetchedAt: row.lastFetchedAt,
          lastContentHash: row.lastContentHash,
        };

        try {
          const { items, contentHash } = await fetchFeed(feedConfig);
          const ingested = await ingestFeedItems(feedConfig, items);
          totalIngested += ingested;

          await db
            .update(adminFeeds)
            .set({
              lastFetchedAt: new Date(),
              lastContentHash: contentHash,
              lastError: null,
              updatedAt: new Date(),
            })
            .where(eq(adminFeeds.id, row.id));

          if (ingested > 0) {
            console.log(`[feed-worker] Feed "${row.label ?? row.url}": ${ingested} new item(s)`);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[feed-worker] Feed "${row.label ?? row.url}" failed: ${message}`);

          await db
            .update(adminFeeds)
            .set({
              lastFetchedAt: new Date(),
              lastError: message,
              updatedAt: new Date(),
            })
            .where(eq(adminFeeds.id, row.id));
        }
      }

      console.log(
        `[feed-worker] Check complete: ${feeds.length} feed(s), ${totalIngested} new item(s)`
      );
      return { checked: feeds.length, ingested: totalIngested };
    },
    {
      connection: getRedis('Feed monitoring'),
      concurrency: config.queue.feedMonitor.concurrency,
    }
  );

  worker.on('completed', (job) => {
    console.log(`[feed-worker] Job ${job.id} completed successfully`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[feed-worker] Job ${job?.id} failed:`, err.message);
  });

  started = worker;
  return worker;
}
