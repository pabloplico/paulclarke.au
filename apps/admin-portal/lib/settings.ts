import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { adminSettings } from '@/lib/db/schema';

/** Load all settings from the DB as a flat key→value record. */
export async function getSettings(): Promise<Record<string, unknown>> {
  const rows = await db.select().from(adminSettings);
  const result: Record<string, unknown> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

/** Look up a single setting by key. Returns undefined if not set. */
export async function getSetting(key: string): Promise<unknown | undefined> {
  const [row] = await db.select().from(adminSettings).where(eq(adminSettings.key, key)).limit(1);
  return row?.value;
}

/** Upsert multiple settings in one call. */
export async function updateSettings(updates: Record<string, unknown>): Promise<void> {
  for (const [key, value] of Object.entries(updates)) {
    const [existing] = await db
      .select({ id: adminSettings.id })
      .from(adminSettings)
      .where(eq(adminSettings.key, key))
      .limit(1);

    if (existing) {
      await db
        .update(adminSettings)
        .set({ value, updatedAt: new Date() })
        .where(eq(adminSettings.key, key));
    } else {
      await db.insert(adminSettings).values({ key, value });
    }
  }
}
