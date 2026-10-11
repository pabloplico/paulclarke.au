import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { safeParseJson } from '@/lib/api/safe-json';
import { requireAuthApi } from '@/lib/auth/server';
import { db } from '@/lib/db';
import { adminTodos } from '@/lib/db/schema';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuthApi();
  const { id } = await params;
  const parsed = await safeParseJson(request);
  if (parsed.error) return parsed.error;
  const body = parsed.data as {
    title?: string;
    description?: string;
    priority?: string;
    sortOrder?: number;
    dueDate?: string | null;
    completed?: boolean;
    jobId?: number | null;
    clientId?: number | null;
  };

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.title !== undefined) updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if (body.priority !== undefined) updates.priority = body.priority;
  if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;
  if (body.dueDate !== undefined) updates.dueDate = body.dueDate ? new Date(body.dueDate) : null;
  if (body.completed !== undefined) {
    updates.completed = body.completed;
    updates.completedAt = body.completed ? new Date() : null;
  }
  if (body.jobId !== undefined) updates.jobId = body.jobId || null;
  if (body.clientId !== undefined) updates.clientId = body.clientId || null;

  const [updated] = await db
    .update(adminTodos)
    .set(updates)
    .where(and(eq(adminTodos.id, Number(id)), eq(adminTodos.userId, user.id)))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }

  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuthApi();
  const { id } = await params;

  const [deleted] = await db
    .delete(adminTodos)
    .where(and(eq(adminTodos.id, Number(id)), eq(adminTodos.userId, user.id)))
    .returning();

  if (!deleted) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
