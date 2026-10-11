import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { safeParseJson } from '@/lib/api/safe-json';
import { requireAuthApi } from '@/lib/auth/server';
import { db } from '@/lib/db';
import { adminEmailTemplates } from '@/lib/db/schema';

const patchSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  subject: z.string().max(500).optional(),
  body: z.string().min(1).optional(),
  category: z.enum(['initial_outreach', 'follow_up', 'partnership_proposal', 'general']).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuthApi();
  const { id } = await params;

  const jsonResult = await safeParseJson(req);
  if (jsonResult.error) return jsonResult.error;

  const parsed = patchSchema.safeParse(jsonResult.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const [updated] = await db
    .update(adminEmailTemplates)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(adminEmailTemplates.id, Number(id)), eq(adminEmailTemplates.userId, user.id)))
    .returning();

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuthApi();
  const { id } = await params;

  const [deleted] = await db
    .delete(adminEmailTemplates)
    .where(and(eq(adminEmailTemplates.id, Number(id)), eq(adminEmailTemplates.userId, user.id)))
    .returning();

  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
