import { and, desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { triggerAnalysisTask, triggerResearchTask } from '@/lib/agents/queue/trigger';
import { requireAiAllowance } from '@/lib/ai/allowance';
import { resolveWorkspaceParams } from '@/lib/api/resolve-params';
import { db } from '@/lib/db';
import { adminAgentRuns, adminAgentTasks } from '@/lib/db/schema';

type Params = { params: Promise<{ id: string; taskId: string }> };

const COOLDOWN_MS = 60_000; // 1 minute cooldown between triggers

export async function POST(_request: Request, { params }: Params) {
  const resolved = await resolveWorkspaceParams(params);
  if (resolved.error) return resolved.error;
  await requireAiAllowance(resolved.user);
  const { workspace, user } = resolved;

  const { taskId } = await params;
  const taskIdNum = parseInt(taskId, 10);
  if (Number.isNaN(taskIdNum)) {
    return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });
  }

  const [task] = await db
    .select()
    .from(adminAgentTasks)
    .where(and(eq(adminAgentTasks.id, taskIdNum), eq(adminAgentTasks.workspaceId, workspace.id)));

  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  // Rate limiting: check if there's a recent run for this task
  const [recentRun] = await db
    .select({
      id: adminAgentRuns.id,
      startedAt: adminAgentRuns.startedAt,
      status: adminAgentRuns.status,
    })
    .from(adminAgentRuns)
    .where(eq(adminAgentRuns.taskId, taskIdNum))
    .orderBy(desc(adminAgentRuns.startedAt))
    .limit(1);

  if (recentRun) {
    if (recentRun.status === 'started') {
      return NextResponse.json(
        { error: 'A run is already in progress for this task' },
        { status: 429 }
      );
    }
    const elapsed = Date.now() - recentRun.startedAt.getTime();
    if (elapsed < COOLDOWN_MS) {
      const waitSec = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
      return NextResponse.json(
        { error: `Please wait ${waitSec}s before triggering again` },
        { status: 429 }
      );
    }
  }

  let jobId: string;
  if (task.agentType === 'analysis') {
    jobId = await triggerAnalysisTask(task.id, user.id);
  } else {
    jobId = await triggerResearchTask(task.id, user.id);
  }

  return NextResponse.json({
    message: 'Task triggered',
    taskId: task.id,
    agentType: task.agentType,
    jobId,
  });
}
