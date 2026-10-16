import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { adminAgentRuns } from '@/lib/db/schema';
import { logger } from '@/lib/logger';

const log = logger.child({ module: 'run-logger' });

/**
 * The run log lives in admin_agent_runs.log. There's no live stream: the
 * research toolbar polls the runs (components/research/research-toolbar.tsx).
 */

/** Append a log entry to the run's log in the DB. */
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
}

/** Append a tool call entry to the run's log in the DB. */
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
}
