import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireAuthApi } from '@/lib/auth/server';
import { db } from '@/lib/db';
import { adminClients } from '@/lib/db/schema';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuthApi();
  const { id } = await params;
  const [client] = await db
    .select()
    .from(adminClients)
    .where(and(eq(adminClients.id, Number(id)), eq(adminClients.userId, user.id)));

  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(client);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuthApi();
  const { id } = await params;
  const body = await req.json();

  // Merge metadata instead of replacing
  if (body.metadata) {
    const [existing] = await db
      .select({ metadata: adminClients.metadata })
      .from(adminClients)
      .where(and(eq(adminClients.id, Number(id)), eq(adminClients.userId, user.id)));
    if (existing) {
      body.metadata = {
        ...((existing.metadata as Record<string, unknown>) || {}),
        ...body.metadata,
      };
    }
  }

  const [updated] = await db
    .update(adminClients)
    .set({ ...body, updatedAt: new Date() })
    .where(and(eq(adminClients.id, Number(id)), eq(adminClients.userId, user.id)))
    .returning();

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuthApi();
  const { id } = await params;

  const [deleted] = await db
    .delete(adminClients)
    .where(and(eq(adminClients.id, Number(id)), eq(adminClients.userId, user.id)))
    .returning();

  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
