import { inArray } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { resolveWorkspaceParams } from '@/lib/api/resolve-params';
import { safeParseJson } from '@/lib/api/safe-json';
import { db } from '@/lib/db';
import { adminSectionVersions, adminWorkspaceSections } from '@/lib/db/schema';
import { getLatestVersions } from '@/lib/workspaces/latest-versions';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const resolved = await resolveWorkspaceParams(params);
  if (resolved.error) return resolved.error;
  const { workspace } = resolved;

  const parsed = await safeParseJson(request);
  if (parsed.error) return parsed.error;
  const { sectionIds, title } = parsed.data as { sectionIds: number[]; title: string };

  if (!Array.isArray(sectionIds) || sectionIds.length < 2) {
    return NextResponse.json({ error: 'At least 2 section IDs are required' }, { status: 400 });
  }

  if (!(title as string)?.trim()) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  // Fetch sections to merge (in sort order)
  const sections = await db
    .select()
    .from(adminWorkspaceSections)
    .where(inArray(adminWorkspaceSections.id, sectionIds))
    .orderBy(adminWorkspaceSections.sortOrder);

  if (sections.length !== sectionIds.length) {
    return NextResponse.json({ error: 'Some sections not found' }, { status: 404 });
  }

  // Verify all sections belong to this workspace
  if (sections.some((s) => s.workspaceId !== workspace.id)) {
    return NextResponse.json({ error: 'Sections must belong to this workspace' }, { status: 400 });
  }

  // Verify all sections share the same parent (siblings only)
  const parentIds = new Set(sections.map((s) => s.parentSectionId));
  if (parentIds.size > 1) {
    return NextResponse.json(
      { error: 'Only sections at the same level can be merged' },
      { status: 400 }
    );
  }

  // Get latest content for each section (single batch query)
  const versionMap = await getLatestVersions(sections.map((s) => s.id));
  const contentParts = sections.map((s) => versionMap.get(s.id)?.content ?? '');

  const mergedContent = contentParts.filter(Boolean).join('\n\n---\n\n');
  const slug = (title as string)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const result = await db.transaction(async (tx) => {
    // Create new merged section (inherits parent from source sections)
    const [newSection] = await tx
      .insert(adminWorkspaceSections)
      .values({
        workspaceId: workspace.id,
        parentSectionId: sections[0]?.parentSectionId ?? null,
        slug,
        title: (title as string).trim(),
        description: `Merged from: ${sections.map((s) => s.title).join(', ')}`,
        template: 'prose',
        sortOrder: sections[0]?.sortOrder,
      })
      .returning();

    if (!newSection) {
      throw new Error('Failed to create merged section');
    }

    // Create initial version with merged content
    await tx.insert(adminSectionVersions).values({
      sectionId: newSection.id,
      version: 1,
      content: mergedContent,
      changeDescription: `Merged from ${sections.length} sections`,
      changeSource: 'manual',
    });

    // Delete original sections (cascade deletes versions)
    await tx.delete(adminWorkspaceSections).where(inArray(adminWorkspaceSections.id, sectionIds));

    return { ...newSection, latestVersion: { version: 1, content: mergedContent } };
  });

  return NextResponse.json(result, { status: 201 });
}
