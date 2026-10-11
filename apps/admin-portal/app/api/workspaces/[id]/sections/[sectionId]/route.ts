import { and, count, desc, eq, like } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { resolveWorkspaceSectionParams } from '@/lib/api/resolve-params';
import { safeParseJson } from '@/lib/api/safe-json';
import { db } from '@/lib/db';
import { adminSectionVersions, adminWorkspaceSections } from '@/lib/db/schema';
import { validateDepth } from '@/lib/workspaces/section-tree';

type Params = { params: Promise<{ id: string; sectionId: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const resolved = await resolveWorkspaceSectionParams(params);
  if (resolved.error) return resolved.error;
  const { section } = resolved;

  const [latestVersion] = await db
    .select()
    .from(adminSectionVersions)
    .where(eq(adminSectionVersions.sectionId, section.id))
    .orderBy(desc(adminSectionVersions.version))
    .limit(1);

  return NextResponse.json({ ...section, latestVersion: latestVersion ?? null });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const resolved = await resolveWorkspaceSectionParams(params);
  if (resolved.error) return resolved.error;
  const { workspace, section } = resolved;

  const parsed = await safeParseJson(request);
  if (parsed.error) return parsed.error;
  const body = parsed.data as {
    title?: string;
    description?: string;
    template?: string;
    sortOrder?: number;
    completenessRules?: unknown;
    parentSectionId?: number | null;
  };
  const { title, description, template, sortOrder, completenessRules, parentSectionId } = body;

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (title !== undefined) {
    updates.title = title;
    // Update slug to match new title
    const baseSlug = title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 100);
    if (baseSlug) {
      // Find existing slugs with this prefix to avoid collisions
      const existing = await db
        .select({ slug: adminWorkspaceSections.slug })
        .from(adminWorkspaceSections)
        .where(
          and(
            eq(adminWorkspaceSections.workspaceId, workspace.id),
            like(adminWorkspaceSections.slug, `${baseSlug}%`)
          )
        );
      const taken = new Set(existing.filter((e) => e.slug !== section.slug).map((e) => e.slug));
      let slug = baseSlug;
      let suffix = 2;
      while (taken.has(slug)) {
        slug = `${baseSlug}-${suffix++}`;
      }
      updates.slug = slug;
    }
  }
  if (description !== undefined) updates.description = description;
  if (template !== undefined) updates.template = template;
  if (sortOrder !== undefined) updates.sortOrder = sortOrder;
  if (completenessRules !== undefined) updates.completenessRules = completenessRules;

  // Handle reparenting
  if (parentSectionId !== undefined) {
    const newParentId = parentSectionId ?? null;

    if (newParentId != null) {
      // Validate parent exists and belongs to same workspace
      const [parent] = await db
        .select()
        .from(adminWorkspaceSections)
        .where(eq(adminWorkspaceSections.id, newParentId));
      if (!parent || parent.workspaceId !== workspace.id) {
        return NextResponse.json({ error: 'Parent section not found' }, { status: 404 });
      }

      // Validate depth and cycle prevention
      const allSections = await db
        .select({
          id: adminWorkspaceSections.id,
          parentSectionId: adminWorkspaceSections.parentSectionId,
        })
        .from(adminWorkspaceSections)
        .where(eq(adminWorkspaceSections.workspaceId, workspace.id));
      const depthCheck = validateDepth(newParentId, allSections, section.id);
      if (!depthCheck.valid) {
        return NextResponse.json({ error: depthCheck.error }, { status: 400 });
      }
    }

    updates.parentSectionId = newParentId;
  }

  const [updated] = await db
    .update(adminWorkspaceSections)
    .set(updates)
    .where(eq(adminWorkspaceSections.id, section.id))
    .returning();

  return NextResponse.json(updated);
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const resolved = await resolveWorkspaceSectionParams(params);
  if (resolved.error) return resolved.error;
  const { section } = resolved;

  // Count children for informational response
  const childResult = await db
    .select({ value: count() })
    .from(adminWorkspaceSections)
    .where(eq(adminWorkspaceSections.parentSectionId, section.id));
  const childCount = childResult[0]?.value ?? 0;

  await db.delete(adminWorkspaceSections).where(eq(adminWorkspaceSections.id, section.id));

  return NextResponse.json({ success: true, childCount });
}
