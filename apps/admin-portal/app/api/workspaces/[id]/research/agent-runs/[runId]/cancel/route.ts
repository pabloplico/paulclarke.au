import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { publishRunLog } from '@/lib/agents/queue/run-logger';
import { resolveWorkspaceParams } from '@/lib/api/resolve-params';
import { db } from '@/lib/db';
import { adminAgentRuns, adminAgentTasks } from '@/lib/db/schema';

type Params = { params: Promise<{ id: string; runId: string }> };

/**
 * Cancels a run cooperatively: it only marks the run 'cancelled'. The worker
 * checks the status between agent steps, stops, and leaves it cancelled
 * (lib/agents/queue/run-control.ts).
 */
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

  // Only a run that's still in progress: it may have finished since the check above
  const cancelled = await db
    .update(adminAgentRuns)
    .set({ status: 'cancelled', completedAt: new Date() })
    .where(and(eq(adminAgentRuns.id, runIdNum), eq(adminAgentRuns.status, 'started')))
    .returning({ id: adminAgentRuns.id });
  if (cancelled.length === 0) {
    return NextResponse.json({ error: 'Run is not in progress' }, { status: 400 });
  }

  await publishRunLog(runIdNum, 'Run cancelled by user', 'warn');

  return NextResponse.json({ cancelled: true, runId: runIdNum });
}
