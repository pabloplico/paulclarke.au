import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { adminAgentRuns } from '@/lib/db/schema';
import { redisEnabled } from '@/lib/drivers';
import { logger } from '@/lib/logger';
import { getRedis } from '@/lib/redis';
import { runLogChannel } from './log-channel';

const log = logger.child({ module: 'run-logger' });

/**
 * Publishes to the run's live-log channel. Without Redis (QUEUE_DRIVER=memory)
 * there's no live stream: the log is still saved to the database.
 */
async function publish(runId: number, payload: unknown): Promise<void> {
  if (!redisEnabled()) return;
  await getRedis('Live agent logs')
    .publish(runLogChannel(runId), JSON.stringify(payload))
    .catch((err: unknown) =>
      log.warn('Redis publish failed', {
        runId,
        error: err instanceof Error ? err.message : String(err),
      })
    );
}

/** Append a log entry to the DB and publish to Redis for live SSE. */
export async function publishRunLog(runId: number, message: string, level = 'info'): Promise<void> {
  const entry = {
    type: 'log' as const,
    timestamp: new Date().toISOString(),
    message,
    level,
  };

  // Persist to DB (append to JSONB array)
  await db
    .update(adminAgentRuns)
    .set({
      log: sql`COALESCE(${adminAgentRuns.log}, '[]'::jsonb) || ${JSON.stringify(entry)}::jsonb`,
    })
    .where(eq(adminAgentRuns.id, runId))
    .catch((err: unknown) =>
      log.warn('DB log persist failed', {
        runId,
        error: err instanceof Error ? err.message : String(err),
      })
    );

  // Publish for live SSE subscribers
  await publish(runId, entry);
}

/** Append a tool call entry to the DB and publish to Redis. */
export async function publishToolCall(
  runId: number,
  toolName: string,
  input: Record<string, unknown>,
  output: Record<string, unknown> | null,
  status: 'success' | 'error'
): Promise<void> {
  const entry = {
    type: 'tool_call' as const,
    timestamp: new Date().toISOString(),
    toolName,
    input,
    output,
    status,
  };

  await db
    .update(adminAgentRuns)
    .set({
      log: sql`COALESCE(${adminAgentRuns.log}, '[]'::jsonb) || ${JSON.stringify(entry)}::jsonb`,
    })
    .where(eq(adminAgentRuns.id, runId))
    .catch((err: unknown) =>
      log.warn('DB log persist failed', {
        runId,
        error: err instanceof Error ? err.message : String(err),
      })
    );

  await publish(runId, entry);
}

export async function publishRunComplete(
  runId: number,
  status: 'completed' | 'failed'
): Promise<void> {
  await publish(runId, { done: true, status });
}
