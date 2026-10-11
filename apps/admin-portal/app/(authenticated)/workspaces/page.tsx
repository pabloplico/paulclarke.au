export const dynamic = 'force-dynamic';

import { and, desc, eq, isNotNull, isNull, max, sql } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/server';
import { config } from '@/lib/config';
import { db } from '@/lib/db';
import {
  adminGapReports,
  adminSectionVersions,
  adminWorkspaceSections,
  adminWorkspaces,
  type CompletenessRule,
  type GapFinding,
} from '@/lib/db/schema';
import {
  computeWorkspaceCompleteness,
  type SectionCompletenessInput,
} from '@/lib/workspaces/completeness';
import type { WorkspaceHealth } from '@/lib/workspaces/types';
import type { RecentChange } from './workspaces-view';
import { WorkspacesView } from './workspaces-view';

function computeHealth(findings: GapFinding[] | null): WorkspaceHealth {
  if (!findings) return null;
  if (findings.length === 0) return 'green';
  const hasHigh = findings.some((f) => f.severity === 'high');
  if (hasHigh) return 'red';
  const hasMedium = findings.some((f) => f.severity === 'medium');
  if (hasMedium) return 'yellow';
  return 'green';
}

export default async function WorkspacesPage() {
  const user = await requireAuth();

  const workspaces = await db
    .select()
    .from(adminWorkspaces)
    .where(and(eq(adminWorkspaces.userId, user.id), isNull(adminWorkspaces.archivedAt)))
    .orderBy(adminWorkspaces.sortOrder);

  const archivedWorkspaces = await db
    .select()
    .from(adminWorkspaces)
    .where(and(eq(adminWorkspaces.userId, user.id), isNotNull(adminWorkspaces.archivedAt)))
    .orderBy(adminWorkspaces.sortOrder);

  const sectionStats = await db
    .select({
      workspaceId: adminWorkspaceSections.workspaceId,
      sectionCount: sql<number>`count(distinct ${adminWorkspaceSections.id})::int`,
      lastUpdated: max(adminSectionVersions.createdAt),
    })
    .from(adminWorkspaceSections)
    .leftJoin(adminSectionVersions, eq(adminWorkspaceSections.id, adminSectionVersions.sectionId))
    .groupBy(adminWorkspaceSections.workspaceId);

  // Get latest gap report per workspace
  const latestReports = await db
    .selectDistinctOn([adminGapReports.workspaceId], {
      workspaceId: adminGapReports.workspaceId,
      findings: adminGapReports.findings,
    })
    .from(adminGapReports)
    .orderBy(adminGapReports.workspaceId, desc(adminGapReports.createdAt));

  // Get all sections with their completeness rules
  const allSections = await db
    .select({
      id: adminWorkspaceSections.id,
      workspaceId: adminWorkspaceSections.workspaceId,
      completenessRules: adminWorkspaceSections.completenessRules,
    })
    .from(adminWorkspaceSections);

  // Get latest version content for each section (for completeness computation)
  const latestVersions = await db
    .selectDistinctOn([adminSectionVersions.sectionId], {
      sectionId: adminSectionVersions.sectionId,
      content: adminSectionVersions.content,
      structuredData: adminSectionVersions.structuredData,
    })
    .from(adminSectionVersions)
    .orderBy(adminSectionVersions.sectionId, desc(adminSectionVersions.version));

  const versionMap = new Map(latestVersions.map((v) => [v.sectionId, v]));

  // Group sections by workspace and compute completeness
  const completenessMap = new Map<number, number>();
  const sectionsByWorkspace = new Map<number, SectionCompletenessInput[]>();

  for (const section of allSections) {
    const version = versionMap.get(section.id);
    const input: SectionCompletenessInput = {
      content: version?.content ?? null,
      structuredData: (version?.structuredData as Record<string, unknown>) ?? null,
      completenessRules: section.completenessRules as CompletenessRule[] | null,
    };

    const existing = sectionsByWorkspace.get(section.workspaceId) ?? [];
    existing.push(input);
    sectionsByWorkspace.set(section.workspaceId, existing);
  }

  for (const [workspaceId, sections] of sectionsByWorkspace) {
    completenessMap.set(workspaceId, computeWorkspaceCompleteness(sections));
  }

  const statsMap = new Map(
    sectionStats.map((s) => [
      s.workspaceId,
      { sectionCount: s.sectionCount, lastUpdated: s.lastUpdated },
    ])
  );

  const reportsMap = new Map(latestReports.map((r) => [r.workspaceId, r.findings]));

  // Recent changes across all workspaces
  const recentChanges: RecentChange[] = await db
    .select({
      versionId: adminSectionVersions.id,
      sectionTitle: adminWorkspaceSections.title,
      workspaceTitle: adminWorkspaces.title,
      workspaceSlug: adminWorkspaces.slug,
      changeDescription: adminSectionVersions.changeDescription,
      changeSource: adminSectionVersions.changeSource,
      createdAt: adminSectionVersions.createdAt,
    })
    .from(adminSectionVersions)
    .innerJoin(
      adminWorkspaceSections,
      eq(adminSectionVersions.sectionId, adminWorkspaceSections.id)
    )
    .innerJoin(adminWorkspaces, eq(adminWorkspaceSections.workspaceId, adminWorkspaces.id))
    .where(eq(adminWorkspaces.userId, user.id))
    .orderBy(desc(adminSectionVersions.createdAt))
    .limit(config.dashboard.recentChangesLimit)
    .then((rows) =>
      rows.map((r) => ({
        ...r,
        createdAt: r.createdAt?.toISOString() ?? new Date().toISOString(),
      }))
    );

  const data = workspaces.map((ws) => ({
    ...ws,
    sectionCount: statsMap.get(ws.id)?.sectionCount ?? 0,
    lastUpdated: statsMap.get(ws.id)?.lastUpdated ?? ws.updatedAt,
    health: computeHealth(reportsMap.get(ws.id) ?? null),
    findings: (reportsMap.get(ws.id) ?? null) as GapFinding[] | null,
    completeness: completenessMap.get(ws.id) ?? null,
  }));

  const archivedData = archivedWorkspaces.map((ws) => ({
    ...ws,
    sectionCount: statsMap.get(ws.id)?.sectionCount ?? 0,
    lastUpdated: statsMap.get(ws.id)?.lastUpdated ?? ws.updatedAt,
    health: computeHealth(reportsMap.get(ws.id) ?? null),
    findings: (reportsMap.get(ws.id) ?? null) as GapFinding[] | null,
    completeness: completenessMap.get(ws.id) ?? null,
  }));

  // Get distinct categories
  const categories = [
    ...new Set(
      [...workspaces, ...archivedWorkspaces]
        .map((ws) => ws.category)
        .filter((c): c is string => c != null && c.trim() !== '')
    ),
  ].sort();

  return (
    <WorkspacesView
      workspaces={data}
      archivedWorkspaces={archivedData}
      recentChanges={recentChanges}
      categories={categories}
    />
  );
}
