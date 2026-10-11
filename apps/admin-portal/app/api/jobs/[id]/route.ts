import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireAuthApi } from '@/lib/auth/server';
import { db } from '@/lib/db';
import { adminJobs } from '@/lib/db/schema';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuthApi();
  const { id } = await params;
  const [job] = await db
    .select()
    .from(adminJobs)
    .where(and(eq(adminJobs.id, Number(id)), eq(adminJobs.userId, user.id)));

  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(job);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuthApi();
  const { id } = await params;
  const body = await req.json();

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.title !== undefined) updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if (body.stage !== undefined) {
    updates.stage = body.stage;
    if (body.stage === 'complete') updates.completedAt = new Date();
  }
  if (body.clientId !== undefined) updates.clientId = body.clientId || null;
  if (body.quotedAmount !== undefined) updates.quotedAmount = body.quotedAmount;
  if (body.finalAmount !== undefined) updates.finalAmount = body.finalAmount;
  if (body.startDate !== undefined)
    updates.startDate = body.startDate ? new Date(body.startDate) : null;
  if (body.dueDate !== undefined) updates.dueDate = body.dueDate ? new Date(body.dueDate) : null;
  if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;

  const [updated] = await db
    .update(adminJobs)
    .set(updates)
    .where(and(eq(adminJobs.id, Number(id)), eq(adminJobs.userId, user.id)))
    .returning();

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuthApi();
  const { id } = await params;

  const [deleted] = await db
    .delete(adminJobs)
    .where(and(eq(adminJobs.id, Number(id)), eq(adminJobs.userId, user.id)))
    .returning();

  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
