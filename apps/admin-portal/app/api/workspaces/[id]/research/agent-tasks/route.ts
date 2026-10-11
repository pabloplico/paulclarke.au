import { and, desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { resolveWorkspaceParams } from '@/lib/api/resolve-params';
import { safeParseJson } from '@/lib/api/safe-json';
import { db } from '@/lib/db';
import { type AgentTaskStatus, type AgentType, adminAgentTasks } from '@/lib/db/schema';

type Params = { params: Promise<{ id: string }> };

const VALID_AGENT_TYPES = ['research', 'ingestion', 'analysis'];

export async function GET(request: Request, { params }: Params) {
  const resolved = await resolveWorkspaceParams(params);
  if (resolved.error) return resolved.error;
  const { workspace } = resolved;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');

  const conditions = [eq(adminAgentTasks.workspaceId, workspace.id)];
  if (status) conditions.push(eq(adminAgentTasks.status, status as AgentTaskStatus));

  const tasks = await db
    .select()
    .from(adminAgentTasks)
    .where(and(...conditions))
    .orderBy(desc(adminAgentTasks.createdAt));

  return NextResponse.json(tasks);
}

export async function POST(request: Request, { params }: Params) {
  const resolved = await resolveWorkspaceParams(params);
  if (resolved.error) return resolved.error;
  const { workspace, user } = resolved;

  const parsed = await safeParseJson(request);
  if (parsed.error) return parsed.error;

  const body = parsed.data as {
    name: string;
    agentType: string;
    cronSchedule?: string;
    config?: Record<string, unknown>;
  };

  if (!body.name?.trim() || !body.agentType) {
    return NextResponse.json({ error: 'name and agentType are required' }, { status: 400 });
  }

  if (!VALID_AGENT_TYPES.includes(body.agentType)) {
    return NextResponse.json(
      { error: 'agentType must be research, ingestion, or analysis' },
      { status: 400 }
    );
  }

  const [task] = await db
    .insert(adminAgentTasks)
    .values({
      userId: user.id,
      workspaceId: workspace.id,
      name: body.name.trim(),
      agentType: body.agentType as AgentType,
      cronSchedule: body.cronSchedule || null,
      config: body.config || {},
    })
    .returning();

  return NextResponse.json(task, { status: 201 });
}
