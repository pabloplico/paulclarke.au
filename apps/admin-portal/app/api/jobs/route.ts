import { and, desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { safeParseJson } from '@/lib/api/safe-json';
import { requireAuthApi } from '@/lib/auth/server';
import { db } from '@/lib/db';
import { adminClients, adminJobs } from '@/lib/db/schema';

export async function GET(request: Request) {
  const user = await requireAuthApi();
  const { searchParams } = new URL(request.url);
  const stage = searchParams.get('stage');
  const clientId = searchParams.get('clientId');

  const conditions = [eq(adminJobs.userId, user.id)];
  if (stage) conditions.push(eq(adminJobs.stage, stage));
  if (clientId) conditions.push(eq(adminJobs.clientId, Number(clientId)));

  const jobs = await db
    .select({
      job: adminJobs,
      clientName: adminClients.contactName,
      companyName: adminClients.companyName,
    })
    .from(adminJobs)
    .leftJoin(adminClients, eq(adminJobs.clientId, adminClients.id))
    .where(and(...conditions))
    .orderBy(adminJobs.sortOrder, desc(adminJobs.createdAt));

  return NextResponse.json(jobs);
}

export async function POST(request: Request) {
  const user = await requireAuthApi();
  const parsed = await safeParseJson(request);
  if (parsed.error) return parsed.error;
  const body = parsed.data as {
    title: string;
    description?: string;
    clientId?: number;
    stage?: string;
    quotedAmount?: number;
    finalAmount?: number;
    startDate?: string;
    dueDate?: string;
  };

  if (!body.title?.trim()) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  const [created] = await db
    .insert(adminJobs)
    .values({
      userId: user.id,
      title: body.title.trim(),
      description: body.description,
      clientId: body.clientId || null,
      stage: body.stage || 'lead',
      quotedAmount: body.quotedAmount,
      finalAmount: body.finalAmount,
      startDate: body.startDate ? new Date(body.startDate) : null,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
