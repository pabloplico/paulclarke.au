import { and, count, eq, inArray, isNull, max } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { safeParseJson } from '@/lib/api/safe-json';
import { requireAuthApi } from '@/lib/auth/server';
import { db } from '@/lib/db';
import {
  adminAgentTasks,
  adminSectionVersions,
  adminWorkspaceSections,
  adminWorkspaces,
} from '@/lib/db/schema';
import { WORKSPACE_TEMPLATES } from '@/lib/workspaces/templates';

export async function GET() {
  const user = await requireAuthApi();

  const workspaces = await db
    .select()
    .from(adminWorkspaces)
    .where(and(isNull(adminWorkspaces.archivedAt), eq(adminWorkspaces.userId, user.id)))
    .orderBy(adminWorkspaces.sortOrder);

  const workspaceIds = workspaces.map((ws) => ws.id);
  const sectionStats =
    workspaceIds.length > 0
      ? await db
          .select({
            workspaceId: adminWorkspaceSections.workspaceId,
            sectionCount: count(adminWorkspaceSections.id),
            lastUpdated: max(adminSectionVersions.createdAt),
          })
          .from(adminWorkspaceSections)
          .leftJoin(
            adminSectionVersions,
            eq(adminWorkspaceSections.id, adminSectionVersions.sectionId)
          )
          .where(inArray(adminWorkspaceSections.workspaceId, workspaceIds))
          .groupBy(adminWorkspaceSections.workspaceId)
      : [];

  const statsMap = new Map(
    sectionStats.map((s) => [
      s.workspaceId,
      { sectionCount: s.sectionCount, lastUpdated: s.lastUpdated },
    ])
  );

  const enriched = workspaces.map((ws) => ({
    ...ws,
    sectionCount: statsMap.get(ws.id)?.sectionCount ?? 0,
    lastUpdated: statsMap.get(ws.id)?.lastUpdated ?? ws.updatedAt,
  }));

  return NextResponse.json(enriched);
}

export async function POST(request: Request) {
  const user = await requireAuthApi();

  const parsed = await safeParseJson(request);
  if (parsed.error) return parsed.error;
  const body = parsed.data as {
    title: string;
    slug: string;
    description?: string;
    icon?: string;
    templateId?: string;
    metadata?: Record<string, unknown>;
    customSections?: { title: string; template: string }[];
    category?: string;
  };
  const { title, slug, description, icon, templateId, metadata, customSections, category } = body;

  if (!title?.trim() || !slug?.trim()) {
    return NextResponse.json({ error: 'Title and slug are required' }, { status: 400 });
  }

  // Get max sort order for this user's workspaces
  const existing = await db
    .select({ maxSort: max(adminWorkspaces.sortOrder) })
    .from(adminWorkspaces)
    .where(eq(adminWorkspaces.userId, user.id));
  const nextSort = (existing[0]?.maxSort ?? -1) + 1;

  const template = templateId ? WORKSPACE_TEMPLATES.find((t) => t.id === templateId) : null;

  const [created] = await db
    .insert(adminWorkspaces)
    .values({
      title: title.trim(),
      slug: slug
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .slice(0, 100),
      description: description || null,
      icon: icon || template?.icon || null,
      category: category || null,
      sortOrder: nextSort,
      metadata: metadata || null,
      userId: user.id,
    })
    .returning();

  if (!created) {
    return NextResponse.json({ error: 'Failed to create workspace' }, { status: 500 });
  }

  // Build section list from template or custom sections
  const sectionDefs =
    templateId === 'custom' && Array.isArray(customSections)
      ? customSections
          .filter((s: { title?: string }) => s.title?.trim())
          .map((s: { title: string; template: string }) => ({
            title: s.title.trim(),
            slug: s.title
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, '')
              .slice(0, 100),
            template: s.template || 'prose',
            description: '',
          }))
      : (template?.sections ?? []);

  for (let i = 0; i < sectionDefs.length; i++) {
    const sectionDef = sectionDefs[i];
    if (!sectionDef) continue;

    const [section] = await db
      .insert(adminWorkspaceSections)
      .values({
        workspaceId: created.id,
        slug: sectionDef.slug,
        title: sectionDef.title,
        description: sectionDef.description || '',
        template: sectionDef.template,
        sortOrder: i,
        completenessRules: ('completenessRules' in sectionDef
          ? sectionDef.completenessRules
          : null) as typeof adminWorkspaceSections.$inferInsert.completenessRules,
      })
      .returning();

    // Add starter content as v1 if provided
    if (section && 'starterContent' in sectionDef && sectionDef.starterContent) {
      await db.insert(adminSectionVersions).values({
        sectionId: section.id,
        version: 1,
        content: sectionDef.starterContent as string,
        changeDescription: 'Initial template content',
        changeSource: 'manual',
      });
    }
  }

  // Auto-create agent tasks for research workspaces
  if (templateId === 'market-research') {
    const agentTypes = [
      { agentType: 'research' as const, name: 'Research Agent' },
      { agentType: 'ingestion' as const, name: 'Ingestion Agent' },
      { agentType: 'analysis' as const, name: 'Analysis Agent' },
    ];
    for (const agent of agentTypes) {
      await db.insert(adminAgentTasks).values({
        userId: user.id,
        workspaceId: created.id,
        agentType: agent.agentType,
        name: agent.name,
        status: 'pending',
      });
    }
  }

  return NextResponse.json(
    { ...created, sectionCount: sectionDefs.length, lastUpdated: null },
    { status: 201 }
  );
}
