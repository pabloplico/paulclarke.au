import { and, desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { resolveWorkspaceParams } from '@/lib/api/resolve-params';
import { safeParseJson } from '@/lib/api/safe-json';
import { db } from '@/lib/db';
import { adminResearchSources, type SourceType } from '@/lib/db/schema';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const resolved = await resolveWorkspaceParams(params);
  if (resolved.error) return resolved.error;
  const { workspace } = resolved;

  const { searchParams } = new URL(request.url);
  const sourceType = searchParams.get('sourceType');

  const conditions = [eq(adminResearchSources.workspaceId, workspace.id)];
  if (sourceType) {
    conditions.push(eq(adminResearchSources.sourceType, sourceType as SourceType));
  }

  const sources = await db
    .select()
    .from(adminResearchSources)
    .where(and(...conditions))
    .orderBy(desc(adminResearchSources.createdAt));

  return NextResponse.json(sources);
}

export async function POST(request: Request, { params }: Params) {
  const resolved = await resolveWorkspaceParams(params);
  if (resolved.error) return resolved.error;
  const { workspace, user } = resolved;

  const parsed = await safeParseJson(request);
  if (parsed.error) return parsed.error;

  const body = parsed.data as {
    name: string;
    sourceType: string;
    url?: string;
    config?: Record<string, unknown>;
  };

  if (!body.name?.trim() || !body.sourceType) {
    return NextResponse.json({ error: 'name and sourceType are required' }, { status: 400 });
  }

  const [source] = await db
    .insert(adminResearchSources)
    .values({
      userId: user.id,
      workspaceId: workspace.id,
      name: body.name.trim(),
      sourceType: body.sourceType as SourceType,
      url: body.url || null,
      config: body.config || {},
    })
    .returning();

  return NextResponse.json(source, { status: 201 });
}
