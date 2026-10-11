import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireAuthApi } from '@/lib/auth/server';
import { db } from '@/lib/db';
import { adminJobs } from '@/lib/db/schema';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuthApi();
  const { id } = await params;
  const { stage } = await req.json();

  const updates: Record<string, unknown> = { stage, updatedAt: new Date() };
  if (stage === 'complete') updates.completedAt = new Date();

  const [updated] = await db
    .update(adminJobs)
    .set(updates)
    .where(and(eq(adminJobs.id, Number(id)), eq(adminJobs.userId, user.id)))
    .returning();

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(updated);
}
