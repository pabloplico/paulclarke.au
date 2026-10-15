import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireAuthApi } from '@/lib/auth/server';
import { db } from '@/lib/db';
import { adminClients, adminContacts } from '@/lib/db/schema';

/** The caller's own client with this id, or undefined. */
async function ownClient(id: string, userId: number) {
  const [client] = await db
    .select({ id: adminClients.id })
    .from(adminClients)
    .where(and(eq(adminClients.id, Number(id)), eq(adminClients.userId, userId)));
  return client;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuthApi();
  const { id } = await params;
  const client = await ownClient(id, user.id);
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  const contacts = await db
    .select()
    .from(adminContacts)
    .where(and(eq(adminContacts.clientId, client.id), eq(adminContacts.userId, user.id)));

  return NextResponse.json(contacts);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuthApi();
  const { id } = await params;
  const client = await ownClient(id, user.id);
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  const body = await req.json();

  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  const [created] = await db
    .insert(adminContacts)
    .values({
      clientId: client.id,
      userId: user.id,
      name: body.name.trim(),
      email: body.email,
      phone: body.phone,
      role: body.role,
      isPrimary: body.isPrimary ?? false,
      notes: body.notes,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
