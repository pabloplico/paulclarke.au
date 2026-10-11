import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { resolveWorkspaceParams } from '@/lib/api/resolve-params';
import { safeParseJson } from '@/lib/api/safe-json';
import { db } from '@/lib/db';
import { adminResearchSources, type SourceType } from '@/lib/db/schema';

type Params = { params: Promise<{ id: string; sourceId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const resolved = await resolveWorkspaceParams(params);
  if (resolved.error) return resolved.error;
  const { workspace } = resolved;

  const { sourceId } = await params;
  const sourceIdNum = parseInt(sourceId, 10);
  if (Number.isNaN(sourceIdNum)) {
    return NextResponse.json({ error: 'Invalid source ID' }, { status: 400 });
  }

  const parsed = await safeParseJson(request);
  if (parsed.error) return parsed.error;

  const body = parsed.data as Partial<{
    name: string;
    sourceType: string;
    url: string | null;
    config: Record<string, unknown>;
    isActive: boolean;
  }>;

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.sourceType !== undefined) updates.sourceType = body.sourceType as SourceType;
  if (body.url !== undefined) updates.url = body.url;
  if (body.config !== undefined) updates.config = body.config;
  if (body.isActive !== undefined) updates.isActive = body.isActive;

  const [source] = await db
    .update(adminResearchSources)
    .set(updates)
    .where(
      and(
        eq(adminResearchSources.id, sourceIdNum),
        eq(adminResearchSources.workspaceId, workspace.id)
      )
    )
    .returning();

  if (!source) {
    return NextResponse.json({ error: 'Source not found' }, { status: 404 });
  }

  return NextResponse.json(source);
}

export async function DELETE(_request: Request, { params }: Params) {
  const resolved = await resolveWorkspaceParams(params);
  if (resolved.error) return resolved.error;
  const { workspace } = resolved;

  const { sourceId } = await params;
  const sourceIdNum = parseInt(sourceId, 10);
  if (Number.isNaN(sourceIdNum)) {
    return NextResponse.json({ error: 'Invalid source ID' }, { status: 400 });
  }

  const [source] = await db
    .delete(adminResearchSources)
    .where(
      and(
        eq(adminResearchSources.id, sourceIdNum),
        eq(adminResearchSources.workspaceId, workspace.id)
      )
    )
    .returning();

  if (!source) {
    return NextResponse.json({ error: 'Source not found' }, { status: 404 });
  }

  return NextResponse.json({ deleted: true });
}
