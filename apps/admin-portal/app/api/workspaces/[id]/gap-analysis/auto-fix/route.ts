import { desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireAiAllowance } from '@/lib/ai/allowance';
import { resolveWorkspaceParams } from '@/lib/api/resolve-params';
import { safeParseJson } from '@/lib/api/safe-json';
import { db } from '@/lib/db';
import { adminGapReports, type GapFinding } from '@/lib/db/schema';
import { createInboxItemFromGap } from '@/lib/gap-analysis/gap-to-inbox';

const SEVERITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const resolved = await resolveWorkspaceParams(params);
  if (resolved.error) return resolved.error;
  await requireAiAllowance(resolved.user);
  const { workspace, user } = resolved;
  const workspaceId = workspace.id;

  const parsed = await safeParseJson(request);
  if (parsed.error) return parsed.error;
  const body = parsed.data as { minSeverity?: 'high' | 'medium' | 'low' };
  const { minSeverity = 'high' } = body;

  // Load latest gap report
  const [report] = await db
    .select({
      id: adminGapReports.id,
      findings: adminGapReports.findings,
    })
    .from(adminGapReports)
    .where(eq(adminGapReports.workspaceId, workspaceId))
    .orderBy(desc(adminGapReports.createdAt))
    .limit(1);

  if (!report) {
    return NextResponse.json({ error: 'No gap report found for this workspace' }, { status: 404 });
  }

  const findings = report.findings as GapFinding[];
  const minRank = SEVERITY_RANK[minSeverity] ?? 0;

  // Filter findings by severity threshold
  const eligibleFindings = findings
    .map((finding, index) => ({ finding, index }))
    .filter(({ finding }) => (SEVERITY_RANK[finding.severity] ?? 3) <= minRank);

  const results: { findingIndex: number; inboxItemId: number }[] = [];

  for (const { finding, index } of eligibleFindings) {
    const result = await createInboxItemFromGap({
      gapReportId: report.id,
      findingIndex: index,
      finding,
      workspaceId,
      userId: user.id,
      autoGenerate: true,
    });
    results.push({ findingIndex: index, inboxItemId: result.inboxItemId });
  }

  return NextResponse.json({ created: results.length, findings: results }, { status: 201 });
}
