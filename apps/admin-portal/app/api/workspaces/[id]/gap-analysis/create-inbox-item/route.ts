import { desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { resolveWorkspaceParams } from '@/lib/api/resolve-params';
import { safeParseJson } from '@/lib/api/safe-json';
import { db } from '@/lib/db';
import { adminGapReports, type GapFinding } from '@/lib/db/schema';
import { createInboxItemFromGap } from '@/lib/gap-analysis/gap-to-inbox';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const resolved = await resolveWorkspaceParams(params);
  if (resolved.error) return resolved.error;
  const { workspace, user } = resolved;
  const workspaceId = workspace.id;

  const parsed = await safeParseJson(request);
  if (parsed.error) return parsed.error;
  const body = parsed.data as { findingIndex: number; autoGenerate?: boolean };
  const { findingIndex, autoGenerate } = body;

  if (typeof findingIndex !== 'number' || findingIndex < 0) {
    return NextResponse.json({ error: 'Invalid finding index' }, { status: 400 });
  }

  // Load latest gap report for this workspace
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
  if (findingIndex >= findings.length) {
    return NextResponse.json({ error: 'Finding index out of range' }, { status: 400 });
  }

  const finding = findings[findingIndex];
  if (!finding) {
    return NextResponse.json({ error: 'Finding not found' }, { status: 400 });
  }

  const result = await createInboxItemFromGap({
    gapReportId: report.id,
    findingIndex,
    finding,
    workspaceId,
    userId: user.id,
    autoGenerate,
  });

  return NextResponse.json(result, { status: 201 });
}
