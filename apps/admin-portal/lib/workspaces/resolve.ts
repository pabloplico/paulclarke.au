import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { adminWorkspaces } from '@/lib/db/schema';

/** Resolve a workspace by numeric ID or slug, scoped to a user. Returns null if not found. */
export async function resolveWorkspace(id: string, userId?: number) {
  const isNumeric = /^\d+$/.test(id);
  const idCondition = isNumeric ? eq(adminWorkspaces.id, Number(id)) : eq(adminWorkspaces.slug, id);

  const conditions = userId ? and(idCondition, eq(adminWorkspaces.userId, userId)) : idCondition;

  const [workspace] = await db.select().from(adminWorkspaces).where(conditions);
  return workspace ?? null;
}
