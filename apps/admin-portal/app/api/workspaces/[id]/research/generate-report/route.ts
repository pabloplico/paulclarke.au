import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { triggerAnalysisTask } from '@/lib/agents/queue/trigger';
import { resolveWorkspaceParams } from '@/lib/api/resolve-params';
import { db } from '@/lib/db';
import { adminAgentTasks } from '@/lib/db/schema';

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const resolved = await resolveWorkspaceParams(params);
  if (resolved.error) return resolved.error;
  const { workspace, user } = resolved;

  // Find or create an analysis task for this workspace
  let [task] = await db
    .select()
    .from(adminAgentTasks)
    .where(
      and(
        eq(adminAgentTasks.workspaceId, workspace.id),
        eq(adminAgentTasks.userId, user.id),
        eq(adminAgentTasks.agentType, 'analysis')
      )
    );

  if (!task) {
    [task] = await db
      .insert(adminAgentTasks)
      .values({
        userId: user.id,
        workspaceId: workspace.id,
        agentType: 'analysis',
        name: 'Analysis',
      })
      .returning();
  }

  if (!task) {
    return NextResponse.json({ error: 'Failed to create analysis task' }, { status: 500 });
  }

  const jobId = await triggerAnalysisTask(task.id, user.id);

  return NextResponse.json({ message: 'Report generation queued', taskId: task.id, jobId });
}
