import { and, eq, inArray, max } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { safeParseJson } from '@/lib/api/safe-json';
import { requireAuthApi } from '@/lib/auth/server';
import { db } from '@/lib/db';
import { adminWorkspaceSections, adminWorkspaces } from '@/lib/db/schema';

export async function POST(request: Request) {
  const user = await requireAuthApi();
  const parsed = await safeParseJson(request);
  if (parsed.error) return parsed.error;
  const body = parsed.data as {
    workspaceId: number;
    sectionIds: number[];
    newTitle: string;
    newDescription?: string;
    newIcon?: string;
    newCategory?: string;
  };
  const { workspaceId, sectionIds, newTitle, newDescription, newIcon, newCategory } = body;

  if (!workspaceId || !Array.isArray(sectionIds) || sectionIds.length === 0) {
    return NextResponse.json(
      { error: 'workspaceId and non-empty sectionIds required' },
      { status: 400 }
    );
  }

  if (!newTitle?.trim()) {
    return NextResponse.json({ error: 'newTitle is required' }, { status: 400 });
  }

  // Verify workspace belongs to user
  const [workspace] = await db
    .select()
    .from(adminWorkspaces)
    .where(and(eq(adminWorkspaces.id, workspaceId), eq(adminWorkspaces.userId, user.id)));

  if (!workspace) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
  }

  // Verify sections belong to this workspace
  const sections = await db
    .select()
    .from(adminWorkspaceSections)
    .where(eq(adminWorkspaceSections.workspaceId, workspaceId));

  const sectionIdSet = new Set(sectionIds as number[]);
  const toMove = sections.filter((s) => sectionIdSet.has(s.id));
  const remaining = sections.filter((s) => !sectionIdSet.has(s.id));

  if (toMove.length !== sectionIds.length) {
    return NextResponse.json({ error: 'Some sections not found in workspace' }, { status: 400 });
  }

  if (remaining.length === 0) {
    return NextResponse.json(
      { error: 'At least one section must remain in the original workspace' },
      { status: 400 }
    );
  }

  // Get max sort order
  const existing = await db
    .select({ maxSort: max(adminWorkspaces.sortOrder) })
    .from(adminWorkspaces)
    .where(eq(adminWorkspaces.userId, user.id));
  const nextSort = (existing[0]?.maxSort ?? -1) + 1;

  const slug = newTitle
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);

  // Create new workspace
  const [newWorkspace] = await db
    .insert(adminWorkspaces)
    .values({
      title: newTitle.trim(),
      slug,
      description: newDescription || null,
      icon: newIcon || workspace.icon,
      category: newCategory ?? workspace.category,
      sortOrder: nextSort,
      userId: user.id,
    })
    .returning();

  if (!newWorkspace) {
    return NextResponse.json({ error: 'Failed to create workspace' }, { status: 500 });
  }

  // Move selected sections to new workspace
  await db
    .update(adminWorkspaceSections)
    .set({ workspaceId: newWorkspace.id })
    .where(inArray(adminWorkspaceSections.id, sectionIds));

  // Re-number sort orders in both workspaces
  for (const [i, section] of remaining.entries()) {
    await db
      .update(adminWorkspaceSections)
      .set({ sortOrder: i })
      .where(eq(adminWorkspaceSections.id, section.id));
  }
  for (const [i, section] of toMove.entries()) {
    await db
      .update(adminWorkspaceSections)
      .set({ sortOrder: i })
      .where(eq(adminWorkspaceSections.id, section.id));
  }

  return NextResponse.json(
    {
      original: { id: workspace.id, title: workspace.title, sectionCount: remaining.length },
      newWorkspace: {
        id: newWorkspace.id,
        title: newWorkspace.title,
        slug: newWorkspace.slug,
        sectionCount: toMove.length,
      },
    },
    { status: 201 }
  );
}
