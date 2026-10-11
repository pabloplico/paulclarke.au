import { embed } from 'ai';
import { and, eq, gte, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getEmbeddingModel } from '@/lib/agents/mastra/provider';
import { resolveWorkspaceParams } from '@/lib/api/resolve-params';
import { safeParseJson } from '@/lib/api/safe-json';
import { db } from '@/lib/db';
import { adminFindings, type FindingType } from '@/lib/db/schema';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const resolved = await resolveWorkspaceParams(params);
  if (resolved.error) return resolved.error;
  const { workspace } = resolved;

  const parsed = await safeParseJson(request);
  if (parsed.error) return parsed.error;

  const body = parsed.data as {
    query: string;
    findingType?: string;
    minConfidence?: number;
    limit?: number;
  };

  if (!body.query?.trim()) {
    return NextResponse.json({ error: 'query is required' }, { status: 400 });
  }

  const { embedding: queryVec } = await embed({
    model: getEmbeddingModel(),
    value: body.query,
  });

  const vectorLiteral = `[${queryVec.join(',')}]`;
  const limit = Math.min(body.limit ?? 20, 100);

  const conditions = [
    eq(adminFindings.workspaceId, workspace.id),
    gte(adminFindings.confidenceScore, body.minConfidence ?? 0.3),
  ];
  if (body.findingType) {
    conditions.push(eq(adminFindings.findingType, body.findingType as FindingType));
  }

  const results = await db
    .select({
      finding: adminFindings,
      similarity: sql<number>`1 - (${adminFindings.embedding} <=> ${vectorLiteral}::vector)`,
    })
    .from(adminFindings)
    .where(and(...conditions))
    .orderBy(sql`${adminFindings.embedding} <=> ${vectorLiteral}::vector`)
    .limit(limit);

  return NextResponse.json(results);
}
