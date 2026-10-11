import { eq, sql } from 'drizzle-orm';
import IORedis from 'ioredis';
import { db } from '@/lib/db';
import { adminAgentRuns } from '@/lib/db/schema';
import { logger } from '@/lib/logger';

const log = logger.child({ module: 'run-logger' });

const publisher = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

const LOG_CHANNEL_PREFIX = 'agent-run-log:';

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

  // Publish to Redis for live SSE subscribers
  await publisher
    .publish(`${LOG_CHANNEL_PREFIX}${runId}`, JSON.stringify(entry))
    .catch((err: unknown) =>
      log.warn('Redis publish failed', {
        runId,
        error: err instanceof Error ? err.message : String(err),
      })
    );
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

  await publisher
    .publish(`${LOG_CHANNEL_PREFIX}${runId}`, JSON.stringify(entry))
    .catch((err: unknown) =>
      log.warn('Redis publish failed', {
        runId,
        error: err instanceof Error ? err.message : String(err),
      })
    );
}

export async function publishRunComplete(
  runId: number,
  status: 'completed' | 'failed'
): Promise<void> {
  await publisher
    .publish(`${LOG_CHANNEL_PREFIX}${runId}`, JSON.stringify({ done: true, status }))
    .catch((err: unknown) =>
      log.warn('Redis publish failed', {
        runId,
        error: err instanceof Error ? err.message : String(err),
      })
    );
}
