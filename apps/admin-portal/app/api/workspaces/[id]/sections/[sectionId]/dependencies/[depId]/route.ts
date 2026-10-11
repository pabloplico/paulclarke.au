import { and, eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { resolveWorkspaceSectionParams } from '@/lib/api/resolve-params';
import { db } from '@/lib/db';
import { adminSectionDependencies } from '@/lib/db/schema';

type Params = { params: Promise<{ id: string; sectionId: string; depId: string }> };

export async function DELETE(_request: NextRequest, { params }: Params) {
  const resolved = await resolveWorkspaceSectionParams(params);
  if (resolved.error) return resolved.error;
  const { section } = resolved;
  const { depId } = await params;

  const [dep] = await db
    .select()
    .from(adminSectionDependencies)
    .where(
      and(
        eq(adminSectionDependencies.id, Number(depId)),
        eq(adminSectionDependencies.sectionId, section.id)
      )
    );

  if (!dep) {
    return NextResponse.json({ error: 'Dependency not found' }, { status: 404 });
  }

  await db.delete(adminSectionDependencies).where(eq(adminSectionDependencies.id, Number(depId)));

  return NextResponse.json({ success: true });
}
