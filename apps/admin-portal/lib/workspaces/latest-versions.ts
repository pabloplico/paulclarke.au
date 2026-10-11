import { desc, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { adminSectionVersions } from '@/lib/db/schema';

/**
 * Fetch the latest version for each section in a single query.
 * Uses PostgreSQL DISTINCT ON to deduplicate at the DB level.
 * Returns a Map keyed by sectionId.
 */
export async function getLatestVersions(sectionIds: number[]) {
  if (sectionIds.length === 0) return new Map<number, (typeof rows)[0]>();

  const rows = await db
    .selectDistinctOn([adminSectionVersions.sectionId])
    .from(adminSectionVersions)
    .where(inArray(adminSectionVersions.sectionId, sectionIds))
    .orderBy(adminSectionVersions.sectionId, desc(adminSectionVersions.version));

  const map = new Map<number, (typeof rows)[0]>();
  for (const row of rows) {
    map.set(row.sectionId, row);
  }
  return map;
}
