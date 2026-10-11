import { desc, eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { resolveWorkspaceSectionParams } from '@/lib/api/resolve-params';
import { db } from '@/lib/db';
import { adminSectionVersions, adminWorkspaceSections } from '@/lib/db/schema';

type Params = { params: Promise<{ id: string; sectionId: string; versionId: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  const resolved = await resolveWorkspaceSectionParams(params);
  if (resolved.error) return resolved.error;
  const { versionId } = await params;

  // Get the version to restore
  const [sourceVersion] = await db
    .select()
    .from(adminSectionVersions)
    .where(eq(adminSectionVersions.id, Number(versionId)));

  if (!sourceVersion) {
    return NextResponse.json({ error: 'Version not found' }, { status: 404 });
  }

  // Get current latest version number
  const [latest] = await db
    .select({ version: adminSectionVersions.version })
    .from(adminSectionVersions)
    .where(eq(adminSectionVersions.sectionId, sourceVersion.sectionId))
    .orderBy(desc(adminSectionVersions.version))
    .limit(1);

  const nextVersion = (latest?.version ?? 0) + 1;

  // Create a new version with the old content
  const [restored] = await db
    .insert(adminSectionVersions)
    .values({
      sectionId: sourceVersion.sectionId,
      version: nextVersion,
      content: sourceVersion.content,
      structuredData: sourceVersion.structuredData,
      changeDescription: `Restored from version ${sourceVersion.version}`,
      changeSource: 'manual',
    })
    .returning();

  // Update section's updatedAt
  await db
    .update(adminWorkspaceSections)
    .set({ updatedAt: new Date() })
    .where(eq(adminWorkspaceSections.id, sourceVersion.sectionId));

  return NextResponse.json(restored, { status: 201 });
}
