import { and, eq, inArray } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { resolveWorkspaceSectionParams } from '@/lib/api/resolve-params';
import { safeParseJson } from '@/lib/api/safe-json';
import { db } from '@/lib/db';
import { adminSectionDependencies, adminWorkspaceSections, adminWorkspaces } from '@/lib/db/schema';
import { isDependencyStale } from '@/lib/workspaces/staleness';

type Params = { params: Promise<{ id: string; sectionId: string }> };

const VALID_RELATION_TYPES = ['derived_from', 'summarizes', 'requires', 'references'];

export async function GET(_request: NextRequest, { params }: Params) {
  const resolved = await resolveWorkspaceSectionParams(params);
  if (resolved.error) return resolved.error;
  const { section, user } = resolved;

  // Dependencies: sections this one depends on
  const depRows = await db
    .select({
      id: adminSectionDependencies.id,
      dependsOnSectionId: adminSectionDependencies.dependsOnSectionId,
      relationType: adminSectionDependencies.relationType,
      description: adminSectionDependencies.description,
      targetTitle: adminWorkspaceSections.title,
      targetWorkspaceId: adminWorkspaceSections.workspaceId,
      targetUpdatedAt: adminWorkspaceSections.updatedAt,
    })
    .from(adminSectionDependencies)
    .innerJoin(
      adminWorkspaceSections,
      eq(adminSectionDependencies.dependsOnSectionId, adminWorkspaceSections.id)
    )
    .where(eq(adminSectionDependencies.sectionId, section.id));

  // Dependents: sections that depend on this one
  const revRows = await db
    .select({
      id: adminSectionDependencies.id,
      sectionId: adminSectionDependencies.sectionId,
      relationType: adminSectionDependencies.relationType,
      sectionTitle: adminWorkspaceSections.title,
      sectionWorkspaceId: adminWorkspaceSections.workspaceId,
    })
    .from(adminSectionDependencies)
    .innerJoin(
      adminWorkspaceSections,
      eq(adminSectionDependencies.sectionId, adminWorkspaceSections.id)
    )
    .where(eq(adminSectionDependencies.dependsOnSectionId, section.id));

  // Resolve workspace slugs/titles for both deps and dependents (single batch query)
  const allWsIds = [
    ...new Set([
      ...depRows.map((r) => r.targetWorkspaceId),
      ...revRows.map((r) => r.sectionWorkspaceId),
    ]),
  ];
  const workspaceMap = new Map<number, { slug: string; title: string }>();
  if (allWsIds.length > 0) {
    const wsRows = await db
      .select({
        id: adminWorkspaces.id,
        slug: adminWorkspaces.slug,
        title: adminWorkspaces.title,
      })
      .from(adminWorkspaces)
      .where(inArray(adminWorkspaces.id, allWsIds));
    for (const ws of wsRows) {
      workspaceMap.set(ws.id, { slug: ws.slug, title: ws.title });
    }
  }

  const dependencies = depRows.map((r) => {
    const ws = workspaceMap.get(r.targetWorkspaceId);
    return {
      id: r.id,
      dependsOnSectionId: r.dependsOnSectionId,
      dependsOnSectionTitle: r.targetTitle,
      dependsOnWorkspaceSlug: ws?.slug ?? '',
      dependsOnWorkspaceTitle: ws?.title ?? '',
      relationType: r.relationType,
      description: r.description,
      isStale: isDependencyStale({
        sectionUpdatedAt: section.updatedAt,
        dependsOnUpdatedAt: r.targetUpdatedAt,
      }),
    };
  });

  const dependents = revRows.map((r) => {
    const ws = workspaceMap.get(r.sectionWorkspaceId);
    return {
      id: r.id,
      sectionId: r.sectionId,
      sectionTitle: r.sectionTitle,
      workspaceSlug: ws?.slug ?? '',
      workspaceTitle: ws?.title ?? '',
      relationType: r.relationType,
    };
  });

  return NextResponse.json({ dependencies, dependents });
}

export async function POST(request: NextRequest, { params }: Params) {
  const resolved = await resolveWorkspaceSectionParams(params);
  if (resolved.error) return resolved.error;
  const { section, user } = resolved;

  const parsed = await safeParseJson(request);
  if (parsed.error) return parsed.error;
  const { dependsOnSectionId, relationType, description } = parsed.data as {
    dependsOnSectionId: number;
    relationType: string;
    description?: string;
  };

  if (!dependsOnSectionId || !relationType) {
    return NextResponse.json(
      { error: 'dependsOnSectionId and relationType are required' },
      { status: 400 }
    );
  }

  if (!VALID_RELATION_TYPES.includes(relationType)) {
    return NextResponse.json(
      { error: `relationType must be one of: ${VALID_RELATION_TYPES.join(', ')}` },
      { status: 400 }
    );
  }

  if (dependsOnSectionId === section.id) {
    return NextResponse.json({ error: 'A section cannot depend on itself' }, { status: 400 });
  }

  // Verify target section exists and belongs to a workspace owned by this user
  const [target] = await db
    .select({ id: adminWorkspaceSections.id, workspaceId: adminWorkspaceSections.workspaceId })
    .from(adminWorkspaceSections)
    .innerJoin(adminWorkspaces, eq(adminWorkspaceSections.workspaceId, adminWorkspaces.id))
    .where(
      and(
        eq(adminWorkspaceSections.id, dependsOnSectionId as number),
        eq(adminWorkspaces.userId, user.id)
      )
    );

  if (!target) {
    return NextResponse.json({ error: 'Target section not found' }, { status: 404 });
  }

  try {
    const [created] = await db
      .insert(adminSectionDependencies)
      .values({
        sectionId: section.id,
        dependsOnSectionId,
        relationType,
        description: description ?? null,
      })
      .returning();

    return NextResponse.json(created, { status: 201 });
  } catch (error: unknown) {
    const errStr = String(error);
    const causeStr = error instanceof Error && error.cause ? String(error.cause) : '';
    if (
      errStr.includes('unique') ||
      errStr.includes('duplicate') ||
      causeStr.includes('unique') ||
      causeStr.includes('duplicate')
    ) {
      return NextResponse.json({ error: 'Dependency already exists' }, { status: 409 });
    }
    throw error;
  }
}
