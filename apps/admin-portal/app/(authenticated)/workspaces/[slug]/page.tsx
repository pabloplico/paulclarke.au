export const dynamic = 'force-dynamic';

import { and, desc, eq, inArray } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth/server';
import { db } from '@/lib/db';
import {
  adminDocuments,
  adminFindings,
  adminGapReports,
  adminSectionDependencies,
  adminSectionSources,
  adminSectionVersions,
  adminWorkspaceSections,
  adminWorkspaces,
} from '@/lib/db/schema';
import { isDependencyStale } from '@/lib/workspaces/staleness';
import { WorkspaceView } from './workspace-view';

export default async function WorkspaceDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await requireAuth();

  const [workspace] = await db
    .select()
    .from(adminWorkspaces)
    .where(and(eq(adminWorkspaces.slug, slug), eq(adminWorkspaces.userId, user.id)));

  if (!workspace) notFound();

  const sections = await db
    .select()
    .from(adminWorkspaceSections)
    .where(eq(adminWorkspaceSections.workspaceId, workspace.id))
    .orderBy(adminWorkspaceSections.sortOrder);

  const sectionsWithContent = await Promise.all(
    sections.map(async (section) => {
      const [latestVersion] = await db
        .select()
        .from(adminSectionVersions)
        .where(eq(adminSectionVersions.sectionId, section.id))
        .orderBy(desc(adminSectionVersions.version))
        .limit(1);

      const sourceRows = await db
        .select({
          id: adminDocuments.id,
          title: adminDocuments.title,
          source: adminDocuments.source,
          sourceUrl: adminDocuments.sourceUrl,
        })
        .from(adminSectionSources)
        .innerJoin(adminDocuments, eq(adminSectionSources.documentId, adminDocuments.id))
        .where(eq(adminSectionSources.sectionId, section.id));

      const seen = new Set<number>();
      const sources = sourceRows.filter((r) => {
        if (seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      });

      // Load research finding refs from version structuredData
      const findingRefs = (latestVersion?.structuredData as Record<string, unknown> | null)
        ?.findingRefs as number[] | undefined;
      let findingSources: Array<{
        id: number;
        title: string;
        findingType: string;
        confidenceScore: number;
        url: string | null;
      }> = [];
      if (findingRefs && findingRefs.length > 0) {
        findingSources = await db
          .select({
            id: adminFindings.id,
            title: adminFindings.title,
            findingType: adminFindings.findingType,
            confidenceScore: adminFindings.confidenceScore,
            url: adminFindings.url,
          })
          .from(adminFindings)
          .where(inArray(adminFindings.id, findingRefs));
      }

      // Load dependencies (sections this one depends on)
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

      // Load dependents (sections that depend on this one)
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

      return {
        ...section,
        latestVersion: latestVersion ?? null,
        sources,
        findingSources,
        dependencies: depRows,
        dependents: revRows,
      };
    })
  );

  // Resolve workspace slugs/titles for dependencies and dependents
  const wsIdsNeeded = new Set<number>();
  for (const s of sectionsWithContent) {
    for (const d of s.dependencies) wsIdsNeeded.add(d.targetWorkspaceId);
    for (const d of s.dependents) wsIdsNeeded.add(d.sectionWorkspaceId);
  }
  const wsMap = new Map<number, { slug: string; title: string }>();
  for (const wId of wsIdsNeeded) {
    const [ws] = await db
      .select({ slug: adminWorkspaces.slug, title: adminWorkspaces.title })
      .from(adminWorkspaces)
      .where(eq(adminWorkspaces.id, wId));
    if (ws) wsMap.set(wId, ws);
  }

  const enrichedSections = sectionsWithContent.map((s) => ({
    ...s,
    dependencies: s.dependencies.map((d) => {
      const ws = wsMap.get(d.targetWorkspaceId);
      return {
        id: d.id,
        dependsOnSectionId: d.dependsOnSectionId,
        dependsOnSectionTitle: d.targetTitle,
        dependsOnWorkspaceSlug: ws?.slug ?? '',
        dependsOnWorkspaceTitle: ws?.title ?? '',
        relationType: d.relationType,
        description: d.description,
        isStale: isDependencyStale({
          sectionUpdatedAt: s.updatedAt,
          dependsOnUpdatedAt: d.targetUpdatedAt,
        }),
      };
    }),
    dependents: s.dependents.map((d) => {
      const ws = wsMap.get(d.sectionWorkspaceId);
      return {
        id: d.id,
        sectionId: d.sectionId,
        sectionTitle: d.sectionTitle,
        workspaceSlug: ws?.slug ?? '',
        workspaceTitle: ws?.title ?? '',
        relationType: d.relationType,
      };
    }),
  }));

  // Load all sections across all workspaces (for the dependency picker)
  const allSectionsRaw = await db
    .select({
      id: adminWorkspaceSections.id,
      title: adminWorkspaceSections.title,
      workspaceId: adminWorkspaceSections.workspaceId,
      workspaceSlug: adminWorkspaces.slug,
      workspaceTitle: adminWorkspaces.title,
    })
    .from(adminWorkspaceSections)
    .innerJoin(adminWorkspaces, eq(adminWorkspaceSections.workspaceId, adminWorkspaces.id))
    .where(eq(adminWorkspaces.userId, user.id))
    .orderBy(adminWorkspaces.sortOrder, adminWorkspaceSections.sortOrder);

  // Get latest gap report
  const [latestReport] = await db
    .select({
      findings: adminGapReports.findings,
      createdAt: adminGapReports.createdAt,
    })
    .from(adminGapReports)
    .where(eq(adminGapReports.workspaceId, workspace.id))
    .orderBy(desc(adminGapReports.createdAt))
    .limit(1);

  return (
    <WorkspaceView
      workspace={{ ...workspace, sections: enrichedSections }}
      initialGapFindings={latestReport?.findings ?? null}
      lastAnalysedAt={latestReport?.createdAt?.toISOString() ?? null}
      allSections={allSectionsRaw}
    />
  );
}
