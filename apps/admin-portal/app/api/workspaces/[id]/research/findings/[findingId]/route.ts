import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { resolveWorkspaceParams } from '@/lib/api/resolve-params';
import { safeParseJson } from '@/lib/api/safe-json';
import { db } from '@/lib/db';
import { adminFindings } from '@/lib/db/schema';

type Params = { params: Promise<{ id: string; findingId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const resolved = await resolveWorkspaceParams(params);
  if (resolved.error) return resolved.error;
  const { workspace } = resolved;

  const { findingId } = await params;
  const findingIdNum = parseInt(findingId, 10);
  if (Number.isNaN(findingIdNum)) {
    return NextResponse.json({ error: 'Invalid finding ID' }, { status: 400 });
  }

  const parsed = await safeParseJson(request);
  if (parsed.error) return parsed.error;

  const body = parsed.data as Partial<{
    title: string;
    content: string;
    findingType: string;
    confidenceScore: number;
    tags: { sectors?: string[]; topics?: string[]; entities?: string[] };
  }>;

  const updates: Record<string, unknown> = {};
  if (body.title !== undefined) updates.title = body.title;
  if (body.content !== undefined) updates.content = body.content;
  if (body.findingType !== undefined) updates.findingType = body.findingType;
  if (body.confidenceScore !== undefined) updates.confidenceScore = body.confidenceScore;
  if (body.tags !== undefined) updates.tags = body.tags;

  const [finding] = await db
    .update(adminFindings)
    .set(updates)
    .where(and(eq(adminFindings.id, findingIdNum), eq(adminFindings.workspaceId, workspace.id)))
    .returning();

  if (!finding) {
    return NextResponse.json({ error: 'Finding not found' }, { status: 404 });
  }

  return NextResponse.json(finding);
}

export async function DELETE(_request: Request, { params }: Params) {
  const resolved = await resolveWorkspaceParams(params);
  if (resolved.error) return resolved.error;
  const { workspace } = resolved;

  const { findingId } = await params;
  const findingIdNum = parseInt(findingId, 10);
  if (Number.isNaN(findingIdNum)) {
    return NextResponse.json({ error: 'Invalid finding ID' }, { status: 400 });
  }

  const [finding] = await db
    .delete(adminFindings)
    .where(and(eq(adminFindings.id, findingIdNum), eq(adminFindings.workspaceId, workspace.id)))
    .returning();

  if (!finding) {
    return NextResponse.json({ error: 'Finding not found' }, { status: 404 });
  }

  return NextResponse.json({ deleted: true });
}
