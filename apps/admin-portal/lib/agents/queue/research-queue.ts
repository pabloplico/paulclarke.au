import { and, eq, isNull, sql } from 'drizzle-orm';
import { enterAiUser } from '@/lib/ai/guard';
import { db } from '@/lib/db';
import { adminAgentRuns, adminAgentTasks, adminFindings, adminWorkspaces } from '@/lib/db/schema';
import { createJobQueue, type JobContext } from '@/lib/queue';
import { embedFindings } from '../embeddings';
import { createResearchAgent } from '../mastra/agents/create';
import { getModel } from '../mastra/provider';
import { loadResearchSettings } from '../settings';
import { logToolCalls } from './log-tool-calls';
import { finishRun, logStopped, runIsStarted, stopWhenCancelled } from './run-control';
import { publishRunLog } from './run-logger';

/** userId is the user who triggered the run. */
export type ResearchJobData = { taskId: number; userId: number };

export const researchQueue = createJobQueue<ResearchJobData>('mr-research', {
  attempts: 2,
  backoffDelayMs: 300_000,
});

export async function handleResearchJob(job: JobContext<ResearchJobData>): Promise<void> {
  const { taskId, userId } = job.data;

  // Load task and workspace
  const [task] = await db.select().from(adminAgentTasks).where(eq(adminAgentTasks.id, taskId));
  if (!task) throw new Error(`Task ${taskId} not found`);
  // The agent's AI calls count against the user who triggered the run.
  // After the first await, so it doesn't leak into the caller
  enterAiUser(userId);

  const [workspace] = await db
    .select()
    .from(adminWorkspaces)
    .where(eq(adminWorkspaces.id, task.workspaceId));
  if (!workspace) throw new Error(`Workspace ${task.workspaceId} not found`);

  // Create run record
  const [run] = await db
    .insert(adminAgentRuns)
    .values({ taskId, userId, status: 'started' })
    .returning();
  if (!run) throw new Error('Failed to create run record');

  try {
    // Load user's research settings for provider/model override
    const settings = await loadResearchSettings(userId);
    await publishRunLog(
      run.id,
      `Starting research agent (${settings.aiProvider}/${settings.aiModel})...`
    );

    const agent = createResearchAgent(
      getModel({ provider: settings.aiProvider, model: settings.aiModel }),
      { userId, workspaceId: workspace.id, agentRunId: run.id }
    );
    const industry =
      (workspace.metadata as Record<string, unknown>)?.industry ?? workspace.category ?? 'general';
    const result = await agent.generate(
      `Research the market "${workspace.title}": ${workspace.description || ''}.
Category: ${workspace.category || 'general'}. Industry: ${industry}.
Save each distinct finding using the save-finding tool.`,
      {
        maxSteps:
          ((task.config as Record<string, unknown>)?.maxSteps as number) ??
          settings.maxResearchSteps,
        ...stopWhenCancelled(run.id),
      }
    );
    if (!(await runIsStarted(run.id))) {
      // Cancelled: Mastra stops after the step in progress and returns.
      // Log the tool calls it made (their findings are saved), then stop
      await logToolCalls(run.id, result);
      await logStopped(run.id);
      return;
    }

    // Publish tool call details for observability
    const { toolCallCount, agentResponse } = await logToolCalls(run.id, result);

    // Count findings actually saved to DB by this run
    const findingsResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(adminFindings)
      .where(eq(adminFindings.agentRunId, run.id));
    const findingsCount = findingsResult[0]?.count ?? 0;

    await publishRunLog(
      run.id,
      `Completed: ${toolCallCount} tool calls, ${findingsCount} findings saved, ${result.usage?.totalTokens ?? 0} tokens used`
    );

    // Save agent response as a log entry
    if (agentResponse) {
      await publishRunLog(run.id, `Agent response: ${agentResponse.slice(0, 2000)}`);
    }

    // Update run as completed, unless it was cancelled meanwhile
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

    // Update task
    await db
      .update(adminAgentTasks)
      .set({
        lastRun: new Date(),
        runCount: task.runCount + 1,
        updatedAt: new Date(),
      })
      .where(eq(adminAgentTasks.id, taskId));

    // Embed new findings without embeddings
    const unembedded = await db
      .select({ id: adminFindings.id, content: adminFindings.content })
      .from(adminFindings)
      .where(and(eq(adminFindings.workspaceId, workspace.id), isNull(adminFindings.embedding)));

    if (unembedded.length > 0) {
      await publishRunLog(run.id, `Embedding ${unembedded.length} new findings...`);
      await embedFindings(unembedded);
    }

    await publishRunLog(run.id, `Research complete. ${findingsCount} findings saved.`);
  } catch (error) {
    // A cancel can stop the agent with an abort error: the run stays
    // cancelled, and returning (not throwing) means no retry
    if (!(await runIsStarted(run.id))) {
      await logStopped(run.id);
      return;
    }
    const errorMsg = error instanceof Error ? error.message : String(error);
    await finishRun(run.id, { status: 'failed', completedAt: new Date(), errorLog: errorMsg });

    await publishRunLog(run.id, `Research failed: ${errorMsg}`, 'error');
    throw error;
  }
}

/** Registers the mr-research processor. Called once on boot (lib/agents/queue/init.ts). */
export function startResearchWorker(): void {
  researchQueue.process(handleResearchJob, { concurrency: 1 });
}
