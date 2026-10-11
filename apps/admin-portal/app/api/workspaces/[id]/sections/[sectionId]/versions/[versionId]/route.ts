import { and, eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { resolveWorkspaceSectionParams } from '@/lib/api/resolve-params';
import { db } from '@/lib/db';
import { adminSectionVersions, adminWorkspaceSections } from '@/lib/db/schema';

type Params = { params: Promise<{ id: string; sectionId: string; versionId: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const resolved = await resolveWorkspaceSectionParams(params);
  if (resolved.error) return resolved.error;
  const { workspace, section } = resolved;
  const { versionId } = await params;

  // Verify version belongs to the specified section in this workspace
  const [version] = await db
    .select({
      id: adminSectionVersions.id,
      sectionId: adminSectionVersions.sectionId,
      version: adminSectionVersions.version,
      content: adminSectionVersions.content,
      structuredData: adminSectionVersions.structuredData,
      changeDescription: adminSectionVersions.changeDescription,
      changeSource: adminSectionVersions.changeSource,
      createdAt: adminSectionVersions.createdAt,
    })
    .from(adminSectionVersions)
    .innerJoin(
      adminWorkspaceSections,
      eq(adminSectionVersions.sectionId, adminWorkspaceSections.id)
    )
    .where(
      and(
        eq(adminSectionVersions.id, Number(versionId)),
        eq(adminSectionVersions.sectionId, section.id),
        eq(adminWorkspaceSections.workspaceId, workspace.id)
      )
    );

  if (!version) {
    return NextResponse.json({ error: 'Version not found' }, { status: 404 });
  }

  return NextResponse.json(version);
}
