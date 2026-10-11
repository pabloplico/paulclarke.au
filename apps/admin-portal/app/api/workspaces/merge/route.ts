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
    workspaceIds: number[];
    title: string;
    description?: string;
    icon?: string;
    category?: string;
  };
  const { workspaceIds, title, description, icon, category } = body;

  if (!Array.isArray(workspaceIds) || workspaceIds.length < 2) {
    return NextResponse.json({ error: 'At least 2 workspace IDs required' }, { status: 400 });
  }

  if (!title?.trim()) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  // Verify all workspaces exist and belong to the user
  const workspaces = await db
    .select()
    .from(adminWorkspaces)
    .where(and(inArray(adminWorkspaces.id, workspaceIds), eq(adminWorkspaces.userId, user.id)));

  if (workspaces.length !== workspaceIds.length) {
    return NextResponse.json({ error: 'Some workspaces not found' }, { status: 404 });
  }

  // Get max sort order for this user's workspaces
  const existing = await db
    .select({ maxSort: max(adminWorkspaces.sortOrder) })
    .from(adminWorkspaces)
    .where(eq(adminWorkspaces.userId, user.id));
  const nextSort = (existing[0]?.maxSort ?? -1) + 1;

  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);

  // Create the merged workspace
  const [created] = await db
    .insert(adminWorkspaces)
    .values({
      title: title.trim(),
      slug,
      description: description || `Merged from: ${workspaces.map((w) => w.title).join(', ')}`,
      icon: icon || workspaces[0]?.icon || null,
      category: category || null,
      sortOrder: nextSort,
      userId: user.id,
    })
    .returning();

  if (!created) {
    return NextResponse.json({ error: 'Failed to create workspace' }, { status: 500 });
  }

  // Move all sections from source workspaces to the merged workspace
  // Track used slugs to handle uniqueness conflicts
  const usedSlugs = new Set<string>();
  let sortOrder = 0;

  for (const wsId of workspaceIds) {
    const sections = await db
      .select()
      .from(adminWorkspaceSections)
      .where(eq(adminWorkspaceSections.workspaceId, wsId))
      .orderBy(adminWorkspaceSections.sortOrder);

    for (const section of sections) {
      let sectionSlug = section.slug;
      while (usedSlugs.has(sectionSlug)) {
        sectionSlug = `${section.slug}-${Math.random().toString(36).slice(2, 6)}`;
      }
      usedSlugs.add(sectionSlug);

      await db
        .update(adminWorkspaceSections)
        .set({
          workspaceId: created.id,
          slug: sectionSlug,
          sortOrder: sortOrder++,
        })
        .where(eq(adminWorkspaceSections.id, section.id));
    }
  }

  // Delete source workspaces (sections have been moved, so cascade won't remove them)
  await db.delete(adminWorkspaces).where(inArray(adminWorkspaces.id, workspaceIds));

  return NextResponse.json(
    {
      ...created,
      sectionCount: sortOrder,
      mergedFrom: workspaces.map((w) => w.title),
    },
    { status: 201 }
  );
}
