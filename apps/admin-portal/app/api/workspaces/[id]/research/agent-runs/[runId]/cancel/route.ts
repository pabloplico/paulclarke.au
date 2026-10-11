import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { publishRunComplete, publishRunLog } from '@/lib/agents/queue/run-logger';
import { resolveWorkspaceParams } from '@/lib/api/resolve-params';
import { db } from '@/lib/db';
import { adminAgentRuns, adminAgentTasks } from '@/lib/db/schema';
import { logger } from '@/lib/logger';

type Params = { params: Promise<{ id: string; runId: string }> };

const log = logger.child({ module: 'research-cancel' });

export async function POST(_request: Request, { params }: Params) {
  const resolved = await resolveWorkspaceParams(params);
  if (resolved.error) return resolved.error;
  const { workspace } = resolved;

  const { runId } = await params;
  const runIdNum = parseInt(runId, 10);
  if (Number.isNaN(runIdNum)) {
    return NextResponse.json({ error: 'Invalid run ID' }, { status: 400 });
  }

  // Join with tasks to verify workspace ownership
  const [result] = await db
    .select({ run: adminAgentRuns })
    .from(adminAgentRuns)
    .innerJoin(adminAgentTasks, eq(adminAgentTasks.id, adminAgentRuns.taskId))
    .where(and(eq(adminAgentRuns.id, runIdNum), eq(adminAgentTasks.workspaceId, workspace.id)));

  if (!result) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  }

  if (result.run.status !== 'started') {
    return NextResponse.json({ error: 'Run is not in progress' }, { status: 400 });
  }

  // Mark as cancelled in DB
  await db
    .update(adminAgentRuns)
    .set({ status: 'cancelled', completedAt: new Date() })
    .where(eq(adminAgentRuns.id, runIdNum));

  // Notify SSE subscribers
  await publishRunLog(runIdNum, 'Run cancelled by user', 'warn');
  await publishRunComplete(runIdNum, 'failed');

  // Attempt to remove the BullMQ job (best-effort)
  try {
    const { researchQueue } = await import('@/lib/agents/queue/research-queue');
    const { ingestionQueue } = await import('@/lib/agents/queue/ingestion-queue');
    const { analysisQueue } = await import('@/lib/agents/queue/analysis-queue');

    for (const queue of [researchQueue, ingestionQueue, analysisQueue]) {
      const jobs = await queue.getJobs(['active', 'waiting', 'delayed']);
      for (const job of jobs) {
        if (job.data?.taskId === result.run.taskId) {
          await job.remove().catch((err: unknown) =>
            log.warn('Job removal failed (best-effort)', {
              jobId: job.id,
              taskId: result.run.taskId,
              error: err instanceof Error ? err.message : String(err),
            })
          );
        }
      }
    }
  } catch (err) {
    log.warn('Queue cleanup failed', {
      runId: runIdNum,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return NextResponse.json({ cancelled: true, runId: runIdNum });
}
