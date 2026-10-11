import { and, desc, eq, lte, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { safeParseJson } from '@/lib/api/safe-json';
import { requireAuthApi } from '@/lib/auth/server';
import { db } from '@/lib/db';
import { adminClients, adminCommunications } from '@/lib/db/schema';

export async function GET(request: Request) {
  const user = await requireAuthApi();
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('clientId');
  const type = searchParams.get('type');
  const followUp = searchParams.get('followUp');

  const conditions = [eq(adminCommunications.userId, user.id)];
  if (clientId) conditions.push(eq(adminCommunications.clientId, Number(clientId)));
  if (type) conditions.push(eq(adminCommunications.type, type));

  if (followUp === 'pending') {
    conditions.push(eq(adminCommunications.followUpDone, false));
    conditions.push(sql`${adminCommunications.followUpDate} IS NOT NULL`);
  }
  if (followUp === 'overdue') {
    conditions.push(eq(adminCommunications.followUpDone, false));
    conditions.push(sql`${adminCommunications.followUpDate} IS NOT NULL`);
    conditions.push(lte(adminCommunications.followUpDate, new Date()));
  }

  const comms = await db
    .select({
      communication: adminCommunications,
      clientName: adminClients.contactName,
      companyName: adminClients.companyName,
    })
    .from(adminCommunications)
    .leftJoin(adminClients, eq(adminCommunications.clientId, adminClients.id))
    .where(and(...conditions))
    .orderBy(desc(adminCommunications.createdAt));

  return NextResponse.json(comms);
}

export async function POST(request: Request) {
  const user = await requireAuthApi();
  const parsed = await safeParseJson(request);
  if (parsed.error) return parsed.error;
  const body = parsed.data as {
    type: string;
    clientId?: number;
    contactId?: number;
    direction?: string;
    subject?: string;
    body?: string;
    sentAt?: string;
    templateId?: number;
    followUpDate?: string;
  };

  if (!body.type) {
    return NextResponse.json({ error: 'Type is required' }, { status: 400 });
  }

  const [created] = await db
    .insert(adminCommunications)
    .values({
      userId: user.id,
      clientId: body.clientId || null,
      contactId: body.contactId || null,
      type: body.type,
      direction: body.direction || 'outbound',
      subject: body.subject,
      body: body.body,
      sentAt: body.sentAt ? new Date(body.sentAt) : new Date(),
      templateId: body.templateId || null,
      followUpDate: body.followUpDate ? new Date(body.followUpDate) : null,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
