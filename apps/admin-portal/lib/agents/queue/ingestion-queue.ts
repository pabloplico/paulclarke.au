import { and, eq, isNull, sql } from 'drizzle-orm';
import { enterAiUser } from '@/lib/ai/guard';
import { db } from '@/lib/db';
import { adminAgentRuns, adminAgentTasks, adminFindings } from '@/lib/db/schema';
import { createJobQueue, type JobContext } from '@/lib/queue';
import { embedFindings } from '../embeddings';
import { createIngestionAgent } from '../mastra/agents/create';
import { getModel } from '../mastra/provider';
import { loadResearchSettings } from '../settings';
import { logToolCalls } from './log-tool-calls';
import { finishRun, logStopped, runIsStarted, stopWhenCancelled } from './run-control';
import { publishRunLog } from './run-logger';

/** userId is the user who triggered the run. */
export type IngestionJobData = {
  taskId: number;
  userId: number;
  filePath: string;
  fileType: 'pdf' | 'csv';
  workspaceId: number;
};

export const ingestionQueue = createJobQueue<IngestionJobData>('mr-ingestion', {
  attempts: 2,
  backoffDelayMs: 60_000,
});

export async function handleIngestionJob(job: JobContext<IngestionJobData>): Promise<void> {
  const { taskId, userId, filePath, fileType, workspaceId } = job.data;

  const [task] = await db.select().from(adminAgentTasks).where(eq(adminAgentTasks.id, taskId));
  if (!task) throw new Error(`Task ${taskId} not found`);
  // The agent's AI calls count against the user who triggered the run.
  // After the first await, so it doesn't leak into the caller
  enterAiUser(userId);

  const [run] = await db
    .insert(adminAgentRuns)
    .values({ taskId, userId, status: 'started' })
    .returning();
  if (!run) throw new Error('Failed to create run record');

  try {
    const settings = await loadResearchSettings(userId);
    await publishRunLog(run.id, `Ingesting ${fileType.toUpperCase()} file: ${filePath}`);

    const agent = createIngestionAgent(
      getModel({ provider: settings.aiProvider, model: settings.aiModel }),
      { userId, workspaceId, agentRunId: run.id }
    );
    const result = await agent.generate(
      `Process this ${fileType.toUpperCase()} file and extract market research findings.
File path: ${filePath}
Save each finding using the save-finding tool.`,
      { maxSteps: 10, ...stopWhenCancelled(run.id) }
    );
    if (!(await runIsStarted(run.id))) {
      // Cancelled: Mastra stops after the step in progress and returns.
      // Log the tool calls it made (their findings are saved), then stop
      await logToolCalls(run.id, result);
      await logStopped(run.id);
      return;
    }

    const { toolCallCount, agentResponse } = await logToolCalls(run.id, result);

    const findingsResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(adminFindings)
      .where(eq(adminFindings.agentRunId, run.id));
    const findingsCount = findingsResult[0]?.count ?? 0;

    await publishRunLog(
      run.id,
      `Completed: ${toolCallCount} tool calls, ${findingsCount} findings extracted, ${result.usage?.totalTokens ?? 0} tokens`
    );
    if (agentResponse) {
      await publishRunLog(run.id, `Agent response: ${agentResponse.slice(0, 2000)}`);
    }

    const completed = await finishRun(run.id, {
      status: 'completed',
      completedAt: new Date(),
      findingsCount,
      tokensUsed: result.usage?.totalTokens ?? 0,
    });
    if (!completed) {
      await logStopped(run.id);
      return;
    }

    // Embed new findings
    const unembedded = await db
      .select({ id: adminFindings.id, content: adminFindings.content })
      .from(adminFindings)
      .where(and(eq(adminFindings.workspaceId, workspaceId), isNull(adminFindings.embedding)));

    if (unembedded.length > 0) {
      await embedFindings(unembedded);
    }
  } catch (error) {
    // A cancel can stop the agent with an abort error: the run stays
    // cancelled, and returning (not throwing) means no retry
    if (!(await runIsStarted(run.id))) {
      await logStopped(run.id);
      return;
    }
    const errorMsg = error instanceof Error ? error.message : String(error);
    await finishRun(run.id, { status: 'failed', completedAt: new Date(), errorLog: errorMsg });
    throw error;
  }
}

/** Registers the mr-ingestion processor. Called once on boot (lib/agents/queue/init.ts). */
export function startIngestionWorker(): void {
  ingestionQueue.process(handleIngestionJob, { concurrency: 1 });
}
