import { eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { DEFAULT_TAXONOMY } from '../shared/skillMatcher';
import { jobs, profiles, taxonomy } from './db/schema';
import type { Profile } from './env';
import { SEED_JOBS } from './seed';

const DAY_MS = 24 * 60 * 60 * 1000;

async function findProfile(db: DrizzleD1Database, email: string): Promise<Profile | undefined> {
  return db
    .select({ id: profiles.id, email: profiles.email })
    .from(profiles)
    .where(eq(profiles.email, email))
    .get();
}

/**
 * The profile for this email, created and seeded on its first request.
 *
 * The profile, its taxonomy and the seed jobs go in one D1 batch, which is a
 * transaction. If two first requests race, the second insert fails on the unique
 * email, its whole batch rolls back, and it uses the first one's profile, so a
 * profile is only ever seeded once. Seeding happens at creation only: deleting
 * every job doesn't bring the samples back.
 */
export async function getOrCreateProfile(db: DrizzleD1Database, email: string): Promise<Profile> {
  const existing = await findProfile(db, email);
  if (existing) return existing;

  const id = crypto.randomUUID();
  const now = Date.now();
  try {
    await db.batch([
      db.insert(profiles).values({ id, email }),
      db.insert(taxonomy).values({
        profileId: id,
        canonicalMap: DEFAULT_TAXONOMY.canonicalMap,
        skillGroups: DEFAULT_TAXONOMY.skillGroups,
      }),
      // One statement per job: D1 allows at most 100 bound parameters per query
      ...SEED_JOBS.map((job, index) =>
        db.insert(jobs).values({
          ...job,
          id: crypto.randomUUID(),
          profileId: id,
          // Newest first, a day apart, so the list has a stable order
          dateAdded: new Date(now - index * DAY_MS).toISOString(),
        })
      ),
    ]);
  } catch (error) {
    const created = await findProfile(db, email);
    if (created) return created;
    throw error;
  }
  return { id, email };
}
