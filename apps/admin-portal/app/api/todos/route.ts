import { and, desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { safeParseJson } from '@/lib/api/safe-json';
import { requireAuthApi } from '@/lib/auth/server';
import { db } from '@/lib/db';
import { adminTodos } from '@/lib/db/schema';

export async function GET(request: Request) {
  const user = await requireAuthApi();
  const { searchParams } = new URL(request.url);
  const completed = searchParams.get('completed');
  const priority = searchParams.get('priority');

  const jobId = searchParams.get('jobId');
  const clientId = searchParams.get('clientId');
  const _from = searchParams.get('from');
  const _to = searchParams.get('to');

  const conditions = [eq(adminTodos.userId, user.id)];
  if (completed === 'true') conditions.push(eq(adminTodos.completed, true));
  if (completed === 'false') conditions.push(eq(adminTodos.completed, false));
  if (priority) conditions.push(eq(adminTodos.priority, priority));
  if (jobId) conditions.push(eq(adminTodos.jobId, Number(jobId)));
  if (clientId) conditions.push(eq(adminTodos.clientId, Number(clientId)));

  const todos = await db
    .select()
    .from(adminTodos)
    .where(and(...conditions))
    .orderBy(adminTodos.sortOrder, desc(adminTodos.createdAt));

  return NextResponse.json(todos);
}

export async function POST(request: Request) {
  const user = await requireAuthApi();
  const parsed = await safeParseJson(request);
  if (parsed.error) return parsed.error;
  const body = parsed.data as {
    title: string;
    description?: string;
    priority?: string;
    dueDate?: string;
    jobId?: number;
    clientId?: number;
  };

  const [todo] = await db
    .insert(adminTodos)
    .values({
      userId: user.id,
      title: body.title,
      description: body.description || null,
      priority: body.priority || 'medium',
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      jobId: body.jobId || null,
      clientId: body.clientId || null,
    })
    .returning();

  return NextResponse.json(todo, { status: 201 });
}
