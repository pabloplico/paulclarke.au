import { eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { resolveWorkspaceParams } from '@/lib/api/resolve-params';
import { safeParseJson } from '@/lib/api/safe-json';
import { db } from '@/lib/db';
import { adminWorkspaceSections, adminWorkspaces } from '@/lib/db/schema';
import { getLatestVersions } from '@/lib/workspaces/latest-versions';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const resolved = await resolveWorkspaceParams(params);
  if (resolved.error) return resolved.error;
  const { workspace } = resolved;

  // Fetch sections with latest version content
  const sections = await db
    .select()
    .from(adminWorkspaceSections)
    .where(eq(adminWorkspaceSections.workspaceId, workspace.id))
    .orderBy(adminWorkspaceSections.sortOrder);

  const versionMap = await getLatestVersions(sections.map((s) => s.id));
  const sectionsWithContent = sections.map((section) => ({
    ...section,
    latestVersion: versionMap.get(section.id) ?? null,
  }));

  return NextResponse.json({ ...workspace, sections: sectionsWithContent });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const resolved = await resolveWorkspaceParams(params);
  if (resolved.error) return resolved.error;
  const { workspace } = resolved;

  const parsed = await safeParseJson(request);
  if (parsed.error) return parsed.error;
  const body = parsed.data as {
    title?: string;
    description?: string;
    icon?: string;
    sortOrder?: number;
    archived?: boolean;
    category?: string;
    metadata?: Record<string, unknown>;
  };
  const { title, description, icon, sortOrder, archived, category, metadata } = body;

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (icon !== undefined) updates.icon = icon;
  if (sortOrder !== undefined) updates.sortOrder = sortOrder;
  if (category !== undefined) updates.category = category;
  if (archived === true) updates.archivedAt = new Date();
  if (archived === false) updates.archivedAt = null;
  if (metadata !== undefined) {
    // Merge with existing metadata to avoid overwriting other keys
    const existing = (workspace.metadata ?? {}) as Record<string, unknown>;
    updates.metadata = { ...existing, ...metadata };
  }

  const [updated] = await db
    .update(adminWorkspaces)
    .set(updates)
    .where(eq(adminWorkspaces.id, workspace.id))
    .returning();

  return NextResponse.json(updated);
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const resolved = await resolveWorkspaceParams(params);
  if (resolved.error) return resolved.error;
  const { workspace } = resolved;

  await db.delete(adminWorkspaces).where(eq(adminWorkspaces.id, workspace.id));
  return NextResponse.json({ success: true });
}
