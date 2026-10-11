import { and, desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireAuthApi } from '@/lib/auth/server';
import { db } from '@/lib/db';
import { adminSectionVersions, adminWorkspaceSections, adminWorkspaces } from '@/lib/db/schema';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuthApi();
  const { id } = await params;
  const sectionId = Number(id);

  if (Number.isNaN(sectionId)) {
    return NextResponse.json({ error: 'Invalid section ID' }, { status: 400 });
  }

  // Verify the section belongs to the user's workspace
  const [section] = await db
    .select({
      id: adminWorkspaceSections.id,
      title: adminWorkspaceSections.title,
      workspaceId: adminWorkspaceSections.workspaceId,
    })
    .from(adminWorkspaceSections)
    .where(eq(adminWorkspaceSections.id, sectionId));

  if (!section) {
    return NextResponse.json({ error: 'Section not found' }, { status: 404 });
  }

  // Verify workspace ownership
  const [workspace] = await db
    .select({ userId: adminWorkspaces.userId })
    .from(adminWorkspaces)
    .where(and(eq(adminWorkspaces.id, section.workspaceId), eq(adminWorkspaces.userId, user.id)));

  if (!workspace) {
    return NextResponse.json({ error: 'Section not found' }, { status: 404 });
  }

  // Get latest version content
  const [latest] = await db
    .select({ content: adminSectionVersions.content })
    .from(adminSectionVersions)
    .where(eq(adminSectionVersions.sectionId, sectionId))
    .orderBy(desc(adminSectionVersions.version))
    .limit(1);

  return NextResponse.json({ content: latest?.content ?? '' });
}
