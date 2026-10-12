import { type Job, Queue, Worker } from 'bullmq';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { adminAgentRuns, adminAgentTasks, adminFindings } from '@/lib/db/schema';
import { logger } from '@/lib/logger';
import { getRedis } from '@/lib/redis';
import { embedFindings } from '../embeddings';
import { createIngestionAgent } from '../mastra/agents/create';
import { getModel } from '../mastra/provider';
import { loadResearchSettings } from '../settings';
import { logToolCalls } from './log-tool-calls';
import { publishRunComplete, publishRunLog } from './run-logger';

type IngestionJobData = {
  taskId: number;
  userId: number;
  filePath: string;
  fileType: 'pdf' | 'csv';
  workspaceId: number;
};

let ingestionQueue: Queue<IngestionJobData> | null = null;

/** The mr-ingestion queue, created (and connected to Redis) on first use. */
export function getIngestionQueue(): Queue<IngestionJobData> {
  ingestionQueue ??= new Queue<IngestionJobData>('mr-ingestion', {
    connection: getRedis('Ingestion agents'),
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: 'exponential', delay: 60_000 },
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 100 },
    },
  });
  return ingestionQueue;
}

let ingestionWorker: Worker<IngestionJobData> | null = null;

/** Starts the mr-ingestion worker. Called from instrumentation, and only when Redis is on. */
export function startIngestionWorker(): Worker<IngestionJobData> {
  if (ingestionWorker) return ingestionWorker;
  const worker = new Worker<IngestionJobData>(
    'mr-ingestion',
    async (job: Job<IngestionJobData>) => {
      const { taskId, userId, filePath, fileType, workspaceId } = job.data;

      const [task] = await db.select().from(adminAgentTasks).where(eq(adminAgentTasks.id, taskId));
      if (!task) throw new Error(`Task ${taskId} not found`);

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
          { maxSteps: 10 }
        );

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

        await db
          .update(adminAgentRuns)
          .set({
            status: 'completed',
            completedAt: new Date(),
            findingsCount,
            tokensUsed: result.usage?.totalTokens ?? 0,
          })
          .where(eq(adminAgentRuns.id, run.id));

        // Embed new findings
        const unembedded = await db
          .select({ id: adminFindings.id, content: adminFindings.content })
          .from(adminFindings)
          .where(and(eq(adminFindings.workspaceId, workspaceId), isNull(adminFindings.embedding)));

        if (unembedded.length > 0) {
          await embedFindings(unembedded);
        }

        await publishRunComplete(run.id, 'completed');
        return { runId: run.id, findingsCount };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        await db
          .update(adminAgentRuns)
          .set({ status: 'failed', completedAt: new Date(), errorLog: errorMsg })
          .where(eq(adminAgentRuns.id, run.id));
        await publishRunComplete(run.id, 'failed');
        throw error;
      }
    },
    { connection: getRedis('Ingestion agents'), concurrency: 1 }
  );

  const workerLog = logger.child({ module: 'mr-ingestion' });
  worker.on('completed', (job) => {
    workerLog.info('Job completed', { jobId: job.id });
  });
  worker.on('failed', (job, err) => {
    workerLog.error('Job failed', { jobId: job?.id, error: err.message });
  });

  ingestionWorker = worker;
  return worker;
}
