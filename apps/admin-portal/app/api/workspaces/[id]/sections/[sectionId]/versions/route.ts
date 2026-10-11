import { desc, eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { resolveWorkspaceSectionParams } from '@/lib/api/resolve-params';
import { db } from '@/lib/db';
import { adminSectionVersions } from '@/lib/db/schema';

type Params = { params: Promise<{ id: string; sectionId: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const resolved = await resolveWorkspaceSectionParams(params);
  if (resolved.error) return resolved.error;
  const { section } = resolved;

  const versions = await db
    .select()
    .from(adminSectionVersions)
    .where(eq(adminSectionVersions.sectionId, section.id))
    .orderBy(desc(adminSectionVersions.version));

  return NextResponse.json(versions);
}
