import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { adminAgentRuns } from '@/lib/db/schema';
import { publishRunLog } from './run-logger';

/**
 * Cooperative cancel. The cancel route only marks a run 'cancelled'. The
 * worker notices between agent steps, stops the agent, and never overwrites
 * the status: every end-of-run write goes through finishRun(), which only
 * changes a run that is still 'started'.
 */

export async function runIsStarted(runId: number): Promise<boolean> {
  const [run] = await db
    .select({ status: adminAgentRuns.status })
    .from(adminAgentRuns)
    .where(eq(adminAgentRuns.id, runId));
  return run?.status === 'started';
}

/**
 * Options for agent.generate(): after each step, aborts the agent if the run
 * is no longer 'started' (the user cancelled it).
 */
export function stopWhenCancelled(runId: number) {
  const controller = new AbortController();
  return {
    abortSignal: controller.signal,
    onStepFinish: async () => {
      if (!(await runIsStarted(runId))) controller.abort();
    },
  };
}

/** Updates the run only while it is still 'started'. False if it was cancelled meanwhile. */
export async function finishRun(
  runId: number,
  values: Partial<typeof adminAgentRuns.$inferInsert>
): Promise<boolean> {
  const updated = await db
    .update(adminAgentRuns)
    .set(values)
    .where(and(eq(adminAgentRuns.id, runId), eq(adminAgentRuns.status, 'started')))
    .returning({ id: adminAgentRuns.id });
  return updated.length > 0;
}

/** Logs that the worker stopped because the run was cancelled. */
export async function logStopped(runId: number): Promise<void> {
  await publishRunLog(runId, 'Agent stopped: the run was cancelled', 'warn');
}
