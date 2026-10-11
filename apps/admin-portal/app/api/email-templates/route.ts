import { and, desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { safeParseJson } from '@/lib/api/safe-json';
import { requireAuthApi } from '@/lib/auth/server';
import { db } from '@/lib/db';
import { adminEmailTemplates } from '@/lib/db/schema';

export async function GET(request: Request) {
  const user = await requireAuthApi();
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');

  const conditions = [eq(adminEmailTemplates.userId, user.id)];
  if (category) conditions.push(eq(adminEmailTemplates.category, category));

  const templates = await db
    .select()
    .from(adminEmailTemplates)
    .where(and(...conditions))
    .orderBy(desc(adminEmailTemplates.createdAt));

  return NextResponse.json(templates);
}

export async function POST(request: Request) {
  const user = await requireAuthApi();
  const parsed = await safeParseJson(request);
  if (parsed.error) return parsed.error;
  const body = parsed.data as {
    name: string;
    subject?: string;
    body: string;
    category?: string;
  };

  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }
  if (!body.body?.trim()) {
    return NextResponse.json({ error: 'Body is required' }, { status: 400 });
  }

  const [created] = await db
    .insert(adminEmailTemplates)
    .values({
      userId: user.id,
      name: body.name.trim(),
      subject: body.subject,
      body: body.body.trim(),
      category: body.category || 'general',
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
