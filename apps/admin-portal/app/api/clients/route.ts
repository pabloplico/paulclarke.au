import { and, desc, eq, ilike, or } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { safeParseJson } from '@/lib/api/safe-json';
import { requireAuthApi } from '@/lib/auth/server';
import { db } from '@/lib/db';
import { adminClients } from '@/lib/db/schema';

export async function GET(request: Request) {
  const user = await requireAuthApi();
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const type = searchParams.get('type');
  const search = searchParams.get('search');

  const conditions = [eq(adminClients.userId, user.id)];
  if (status) conditions.push(eq(adminClients.status, status));
  if (type) conditions.push(eq(adminClients.type, type));
  if (search) {
    conditions.push(
      or(
        ilike(adminClients.contactName, `%${search}%`),
        ilike(adminClients.companyName, `%${search}%`),
        ilike(adminClients.email, `%${search}%`)
      )!
    );
  }

  const clients = await db
    .select()
    .from(adminClients)
    .where(and(...conditions))
    .orderBy(desc(adminClients.createdAt));

  return NextResponse.json(clients);
}

export async function POST(request: Request) {
  const user = await requireAuthApi();
  const parsed = await safeParseJson(request);
  if (parsed.error) return parsed.error;
  const body = parsed.data as {
    contactName: string;
    companyName?: string;
    email?: string;
    phone?: string;
    status?: string;
    type?: string;
    source?: string;
    website?: string;
    address?: string;
    industry?: string;
    notes?: string;
    metadata?: Record<string, unknown>;
  };
  const {
    contactName,
    companyName,
    email,
    phone,
    status,
    type,
    source,
    website,
    address,
    industry,
    notes,
    metadata,
  } = body;

  if (!contactName?.trim()) {
    return NextResponse.json({ error: 'Contact name is required' }, { status: 400 });
  }

  const [created] = await db
    .insert(adminClients)
    .values({
      contactName: contactName.trim(),
      companyName,
      email,
      phone,
      status: status || 'lead',
      type: type || 'lead',
      source,
      website,
      address,
      industry,
      notes,
      metadata: metadata || undefined,
      userId: user.id,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
