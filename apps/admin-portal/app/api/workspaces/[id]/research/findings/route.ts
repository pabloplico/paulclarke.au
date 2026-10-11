import { and, desc, eq, gte } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { resolveWorkspaceParams } from '@/lib/api/resolve-params';
import { db } from '@/lib/db';
import { adminFindings, type FindingType } from '@/lib/db/schema';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const resolved = await resolveWorkspaceParams(params);
  if (resolved.error) return resolved.error;
  const { workspace } = resolved;

  const { searchParams } = new URL(request.url);
  const findingType = searchParams.get('findingType');
  const minConfidence = searchParams.get('minConfidence');
  const since = searchParams.get('since');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  const conditions = [eq(adminFindings.workspaceId, workspace.id)];
  if (findingType) conditions.push(eq(adminFindings.findingType, findingType as FindingType));
  if (minConfidence) conditions.push(gte(adminFindings.confidenceScore, parseFloat(minConfidence)));
  if (since) conditions.push(gte(adminFindings.createdAt, new Date(since)));

  const findings = await db
    .select()
    .from(adminFindings)
    .where(and(...conditions))
    .orderBy(desc(adminFindings.createdAt))
    .offset(offset)
    .limit(limit);

  return NextResponse.json({ findings, offset, limit, hasMore: findings.length === limit });
}
