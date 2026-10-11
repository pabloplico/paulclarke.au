import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireAuthApi } from '@/lib/auth/server';
import { db } from '@/lib/db';
import { adminWorkspaces } from '@/lib/db/schema';

export async function GET() {
  const user = await requireAuthApi();

  const workspaces = await db
    .select({ category: adminWorkspaces.category })
    .from(adminWorkspaces)
    .where(eq(adminWorkspaces.userId, user.id));

  const categories = [
    ...new Set(
      workspaces.map((w) => w.category).filter((c): c is string => c != null && c.trim() !== '')
    ),
  ].sort();

  return NextResponse.json(categories);
}
