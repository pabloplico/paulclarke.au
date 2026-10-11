export const dynamic = 'force-dynamic';

import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/server';
import { db } from '@/lib/db';
import {
  adminContentAuditReports,
  adminGapReports,
  adminWorkspaceSections,
  adminWorkspaces,
  type ContentAuditFinding,
  type GapFinding,
} from '@/lib/db/schema';
import type { WorkspaceHealth } from '@/lib/workspaces/types';
import {
  type ContentAuditReport,
  GapAnalysisView,
  type WorkspaceSummary,
} from './gap-analysis-view';

function computeHealth(findings: GapFinding[] | null): WorkspaceHealth {
  if (!findings) return null;
  if (findings.length === 0) return 'green';
  if (findings.some((f) => f.severity === 'high')) return 'red';
  if (findings.some((f) => f.severity === 'medium')) return 'yellow';
  return 'green';
}

export default async function GapAnalysisPage() {
  const user = await requireAuth();

  const workspaces = await db
    .select({
      id: adminWorkspaces.id,
      slug: adminWorkspaces.slug,
      title: adminWorkspaces.title,
      icon: adminWorkspaces.icon,
    })
    .from(adminWorkspaces)
    .where(and(eq(adminWorkspaces.userId, user.id), isNull(adminWorkspaces.archivedAt)))
    .orderBy(adminWorkspaces.sortOrder);

  const sectionCounts = await db
    .select({
      workspaceId: adminWorkspaceSections.workspaceId,
      count: sql<number>`count(*)::int`,
    })
    .from(adminWorkspaceSections)
    .groupBy(adminWorkspaceSections.workspaceId);

  const latestReports = await db
    .selectDistinctOn([adminGapReports.workspaceId], {
      workspaceId: adminGapReports.workspaceId,
      findings: adminGapReports.findings,
      createdAt: adminGapReports.createdAt,
    })
    .from(adminGapReports)
    .orderBy(adminGapReports.workspaceId, desc(adminGapReports.createdAt));

  const countsMap = new Map(sectionCounts.map((s) => [s.workspaceId, s.count]));
  const reportsMap = new Map(
    latestReports.map((r) => [r.workspaceId, { findings: r.findings, createdAt: r.createdAt }])
  );

  const data: WorkspaceSummary[] = workspaces.map((ws) => {
    const report = reportsMap.get(ws.id);
    const findings = report?.findings ?? null;
    return {
      id: ws.id,
      slug: ws.slug,
      title: ws.title,
      icon: ws.icon,
      sectionCount: countsMap.get(ws.id) ?? 0,
      health: computeHealth(findings),
      findings,
      lastAnalysedAt: report?.createdAt?.toISOString() ?? null,
    };
  });

  // Fetch latest content audit report
  const [latestAudit] = await db
    .select()
    .from(adminContentAuditReports)
    .where(eq(adminContentAuditReports.userId, user.id))
    .orderBy(desc(adminContentAuditReports.createdAt))
    .limit(1);

  const contentAuditReport: ContentAuditReport | null = latestAudit
    ? {
        id: latestAudit.id,
        findings: (latestAudit.findings as ContentAuditFinding[]) ?? [],
        postsSummary: latestAudit.postsSummary as { slug: string; title: string; date: string }[],
        insightsSummary: latestAudit.insightsSummary as { count: number; categories: string[] },
        createdAt: latestAudit.createdAt.toISOString(),
      }
    : null;

  return <GapAnalysisView workspaces={data} contentAuditReport={contentAuditReport} />;
}
