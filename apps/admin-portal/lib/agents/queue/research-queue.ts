import { type Job, Queue, Worker } from 'bullmq';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { adminAgentRuns, adminAgentTasks, adminFindings, adminWorkspaces } from '@/lib/db/schema';
import { logger } from '@/lib/logger';
import { embedFindings } from '../embeddings';
import { createResearchAgent } from '../mastra/agents/create';
import { getModel } from '../mastra/provider';
import { loadResearchSettings } from '../settings';
import { connection } from './connection';
import { logToolCalls } from './log-tool-calls';
import { publishRunComplete, publishRunLog } from './run-logger';

type ResearchJobData = { taskId: number; userId: number };

export const researchQueue = new Queue<ResearchJobData>('mr-research', {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 300_000 },
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 100 },
  },
});

export const researchWorker = new Worker<ResearchJobData>(
  'mr-research',
  async (job: Job<ResearchJobData>) => {
    const { taskId, userId } = job.data;

    // Load task and workspace
    const [task] = await db.select().from(adminAgentTasks).where(eq(adminAgentTasks.id, taskId));
    if (!task) throw new Error(`Task ${taskId} not found`);

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
        (workspace.metadata as Record<string, unknown>)?.industry ??
        workspace.category ??
        'general';
      const result = await agent.generate(
        `Research the market "${workspace.title}": ${workspace.description || ''}.
Category: ${workspace.category || 'general'}. Industry: ${industry}.
Save each distinct finding using the save-finding tool.`,
        {
          maxSteps:
            ((task.config as Record<string, unknown>)?.maxSteps as number) ??
            settings.maxResearchSteps,
        }
      );

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

      // Update run as completed
      await db
        .update(adminAgentRuns)
        .set({
          status: 'completed',
          completedAt: new Date(),
          findingsCount,
          tokensUsed: result.usage?.totalTokens ?? 0,
        })
        .where(eq(adminAgentRuns.id, run.id));

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
      await publishRunComplete(run.id, 'completed');

      return { runId: run.id, findingsCount };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await db
        .update(adminAgentRuns)
        .set({ status: 'failed', completedAt: new Date(), errorLog: errorMsg })
        .where(eq(adminAgentRuns.id, run.id));

      await publishRunLog(run.id, `Research failed: ${errorMsg}`, 'error');
      await publishRunComplete(run.id, 'failed');
      throw error;
    }
  },
  { connection, concurrency: 1 }
);

const workerLog = logger.child({ module: 'mr-research' });
researchWorker.on('completed', (job) => {
  workerLog.info('Job completed', { jobId: job.id });
});
researchWorker.on('failed', (job, err) => {
  workerLog.error('Job failed', { jobId: job?.id, error: err.message });
});
