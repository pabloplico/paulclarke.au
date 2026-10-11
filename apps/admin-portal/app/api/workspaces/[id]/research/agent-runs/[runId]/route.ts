import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { resolveWorkspaceParams } from '@/lib/api/resolve-params';
import { db } from '@/lib/db';
import { adminAgentRuns, adminAgentTasks } from '@/lib/db/schema';

type Params = { params: Promise<{ id: string; runId: string }> };

export async function GET(_request: Request, { params }: Params) {
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

  return NextResponse.json(result.run);
}
