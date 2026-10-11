import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireAuthApi } from '@/lib/auth/server';
import { db } from '@/lib/db';
import { adminCommunications } from '@/lib/db/schema';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuthApi();
  const { id } = await params;
  const body = await req.json();

  const updates: Record<string, unknown> = {};
  if (body.followUpDone !== undefined) updates.followUpDone = body.followUpDone;
  if (body.subject !== undefined) updates.subject = body.subject;
  if (body.body !== undefined) updates.body = body.body;
  if (body.followUpDate !== undefined)
    updates.followUpDate = body.followUpDate ? new Date(body.followUpDate) : null;

  const [updated] = await db
    .update(adminCommunications)
    .set(updates)
    .where(and(eq(adminCommunications.id, Number(id)), eq(adminCommunications.userId, user.id)))
    .returning();

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuthApi();
  const { id } = await params;

  const [deleted] = await db
    .delete(adminCommunications)
    .where(and(eq(adminCommunications.id, Number(id)), eq(adminCommunications.userId, user.id)))
    .returning();

  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
