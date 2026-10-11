import { and, desc, eq, inArray } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { resolveWorkspaceParams } from '@/lib/api/resolve-params';
import { db } from '@/lib/db';
import { type AgentRunStatus, adminAgentRuns, adminAgentTasks } from '@/lib/db/schema';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const resolved = await resolveWorkspaceParams(params);
  if (resolved.error) return resolved.error;
  const { workspace } = resolved;

  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get('taskId');
  const status = searchParams.get('status');

  // Get task IDs belonging to this workspace
  const tasks = await db
    .select({ id: adminAgentTasks.id })
    .from(adminAgentTasks)
    .where(eq(adminAgentTasks.workspaceId, workspace.id));

  const taskIds = tasks.map((t) => t.id);
  if (taskIds.length === 0) {
    return NextResponse.json([]);
  }

  const conditions = [inArray(adminAgentRuns.taskId, taskIds)];
  if (taskId) conditions.push(eq(adminAgentRuns.taskId, parseInt(taskId, 10)));
  if (status) conditions.push(eq(adminAgentRuns.status, status as AgentRunStatus));

  const runs = await db
    .select()
    .from(adminAgentRuns)
    .where(and(...conditions))
    .orderBy(desc(adminAgentRuns.createdAt));

  return NextResponse.json(runs);
}
