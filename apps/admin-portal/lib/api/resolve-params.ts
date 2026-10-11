import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireAuthApi } from '@/lib/auth/server';
import { db } from '@/lib/db';
import { adminWorkspaceSections } from '@/lib/db/schema';
import { resolveWorkspace } from '@/lib/workspaces/resolve';

type AuthUser = Awaited<ReturnType<typeof requireAuthApi>>;
type Workspace = NonNullable<Awaited<ReturnType<typeof resolveWorkspace>>>;
type Section = typeof adminWorkspaceSections.$inferSelect;

/**
 * Resolve workspace from route params with auth check.
 * Returns { workspace, user } or { error: NextResponse }.
 */
export async function resolveWorkspaceParams(
  params: Promise<{ id: string; [key: string]: string }>
): Promise<
  | { workspace: Workspace; user: AuthUser; error?: never }
  | { error: NextResponse; workspace?: never; user?: never }
> {
  const user = await requireAuthApi();
  const { id } = await params;
  const workspace = await resolveWorkspace(id, user.id);
  if (!workspace) {
    return { error: NextResponse.json({ error: 'Workspace not found' }, { status: 404 }) };
  }
  return { workspace, user };
}

/**
 * Resolve workspace + section from route params with auth and ownership check.
 * Returns { workspace, section, user } or { error: NextResponse }.
 */
export async function resolveWorkspaceSectionParams(
  params: Promise<{ id: string; sectionId: string; [key: string]: string }>
): Promise<
  | { workspace: Workspace; section: Section; user: AuthUser; error?: never }
  | { error: NextResponse; workspace?: never; section?: never; user?: never }
> {
  const resolved = await resolveWorkspaceParams(params as Promise<{ id: string }>);
  if (resolved.error) return resolved;

  const { id: _id, sectionId } = await params;
  const [section] = await db
    .select()
    .from(adminWorkspaceSections)
    .where(eq(adminWorkspaceSections.id, Number(sectionId)));

  if (!section || section.workspaceId !== resolved.workspace.id) {
    return { error: NextResponse.json({ error: 'Section not found' }, { status: 404 }) };
  }

  return { workspace: resolved.workspace, section, user: resolved.user };
}
