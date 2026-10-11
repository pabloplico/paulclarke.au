import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { resolveWorkspaceParams } from '@/lib/api/resolve-params';
import { safeParseJson } from '@/lib/api/safe-json';
import { db } from '@/lib/db';
import { adminAgentTasks } from '@/lib/db/schema';

type Params = { params: Promise<{ id: string; taskId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const resolved = await resolveWorkspaceParams(params);
  if (resolved.error) return resolved.error;
  const { workspace } = resolved;

  const { taskId } = await params;
  const taskIdNum = parseInt(taskId, 10);
  if (Number.isNaN(taskIdNum)) {
    return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });
  }

  const parsed = await safeParseJson(request);
  if (parsed.error) return parsed.error;

  const body = parsed.data as Partial<{
    name: string;
    status: string;
    cronSchedule: string | null;
    config: Record<string, unknown>;
  }>;

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.status !== undefined) updates.status = body.status;
  if (body.cronSchedule !== undefined) updates.cronSchedule = body.cronSchedule;
  if (body.config !== undefined) updates.config = body.config;

  const [task] = await db
    .update(adminAgentTasks)
    .set(updates)
    .where(and(eq(adminAgentTasks.id, taskIdNum), eq(adminAgentTasks.workspaceId, workspace.id)))
    .returning();

  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  return NextResponse.json(task);
}

export async function DELETE(_request: Request, { params }: Params) {
  const resolved = await resolveWorkspaceParams(params);
  if (resolved.error) return resolved.error;
  const { workspace } = resolved;

  const { taskId } = await params;
  const taskIdNum = parseInt(taskId, 10);
  if (Number.isNaN(taskIdNum)) {
    return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });
  }

  const [task] = await db
    .delete(adminAgentTasks)
    .where(and(eq(adminAgentTasks.id, taskIdNum), eq(adminAgentTasks.workspaceId, workspace.id)))
    .returning();

  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  return NextResponse.json({ deleted: true });
}
