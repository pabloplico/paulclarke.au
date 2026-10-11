import { and, eq, gte, isNull, like, max, sql } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { resolveWorkspaceParams } from '@/lib/api/resolve-params';
import { safeParseJson } from '@/lib/api/safe-json';
import { db } from '@/lib/db';
import { adminWorkspaceSections } from '@/lib/db/schema';
import { validateDepth } from '@/lib/workspaces/section-tree';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const resolved = await resolveWorkspaceParams(params);
  if (resolved.error) return resolved.error;
  const { workspace } = resolved;

  const parsed = await safeParseJson(request);
  if (parsed.error) return parsed.error;
  const body = parsed.data as {
    title: string;
    slug: string;
    description?: string;
    template?: string;
    parentSectionId?: number;
    sortOrder?: number;
  };
  const { title, slug, description, template, parentSectionId, sortOrder: requestedSort } = body;

  if (!title?.trim() || !slug?.trim()) {
    return NextResponse.json({ error: 'Title and slug are required' }, { status: 400 });
  }

  // Validate parent exists and belongs to this workspace
  if (parentSectionId != null) {
    const [parent] = await db
      .select()
      .from(adminWorkspaceSections)
      .where(eq(adminWorkspaceSections.id, parentSectionId));
    if (!parent || parent.workspaceId !== workspace.id) {
      return NextResponse.json({ error: 'Parent section not found' }, { status: 404 });
    }

    // Validate depth
    const allSections = await db
      .select({
        id: adminWorkspaceSections.id,
        parentSectionId: adminWorkspaceSections.parentSectionId,
      })
      .from(adminWorkspaceSections)
      .where(eq(adminWorkspaceSections.workspaceId, workspace.id));
    const depthCheck = validateDepth(parentSectionId, allSections);
    if (!depthCheck.valid) {
      return NextResponse.json({ error: depthCheck.error }, { status: 400 });
    }
  }

  // Determine sort order
  const parentFilter =
    parentSectionId != null
      ? eq(adminWorkspaceSections.parentSectionId, parentSectionId)
      : isNull(adminWorkspaceSections.parentSectionId);
  const siblingCondition = and(eq(adminWorkspaceSections.workspaceId, workspace.id), parentFilter);

  let finalSort: number;
  if (typeof requestedSort === 'number') {
    // Inserting at a specific position — bump siblings at or after this position
    await db
      .update(adminWorkspaceSections)
      .set({ sortOrder: sql`${adminWorkspaceSections.sortOrder} + 1` })
      .where(and(siblingCondition, gte(adminWorkspaceSections.sortOrder, requestedSort)));
    finalSort = requestedSort;
  } else {
    // Append at end
    const existing = await db
      .select({ maxSort: max(adminWorkspaceSections.sortOrder) })
      .from(adminWorkspaceSections)
      .where(siblingCondition);
    finalSort = (existing[0]?.maxSort ?? -1) + 1;
  }

  // Deduplicate slug within workspace
  const baseSlug = slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);

  const existingSlugs = await db
    .select({ slug: adminWorkspaceSections.slug })
    .from(adminWorkspaceSections)
    .where(
      and(
        eq(adminWorkspaceSections.workspaceId, workspace.id),
        like(adminWorkspaceSections.slug, `${baseSlug}%`)
      )
    );
  const taken = new Set(existingSlugs.map((e) => e.slug));
  let finalSlug = baseSlug;
  let suffix = 2;
  while (taken.has(finalSlug)) {
    finalSlug = `${baseSlug}-${suffix++}`;
  }

  const [created] = await db
    .insert(adminWorkspaceSections)
    .values({
      workspaceId: workspace.id,
      parentSectionId: parentSectionId ?? null,
      slug: finalSlug,
      title: title.trim(),
      description: description || null,
      template: template || 'prose',
      sortOrder: finalSort,
    })
    .returning();

  return NextResponse.json({ ...created, latestVersion: null }, { status: 201 });
}
