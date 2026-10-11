import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireAuthApi } from '@/lib/auth/server';
import { db } from '@/lib/db';
import { adminContacts } from '@/lib/db/schema';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuthApi();
  const { id } = await params;
  const contacts = await db
    .select()
    .from(adminContacts)
    .where(and(eq(adminContacts.clientId, Number(id)), eq(adminContacts.userId, user.id)));

  return NextResponse.json(contacts);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuthApi();
  const { id } = await params;
  const body = await req.json();

  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  const [created] = await db
    .insert(adminContacts)
    .values({
      clientId: Number(id),
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
