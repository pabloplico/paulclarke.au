import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireAuthApi } from '@/lib/auth/server';
import { db } from '@/lib/db';
import { adminConversations } from '@/lib/db/schema';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuthApi();
  const { id } = await params;

  const [deleted] = await db
    .delete(adminConversations)
    .where(and(eq(adminConversations.id, Number(id)), eq(adminConversations.userId, user.id)))
    .returning();

  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuthApi();
  const { id } = await params;
  const body = await req.json();

  const [updated] = await db
    .update(adminConversations)
    .set({ title: body.title, updatedAt: new Date() })
    .where(and(eq(adminConversations.id, Number(id)), eq(adminConversations.userId, user.id)))
    .returning();

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(updated);
}
