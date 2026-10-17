// @vitest-environment node
import { count, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_GROUPS, DEFAULT_TAXONOMY } from '../shared/skillMatcher';
import { jobs, profiles, skills } from './db/schema';
import { getOrCreateProfile } from './profiles';
import { SEED_JOBS } from './seed';
import {
  apiAs,
  createTestPlatform,
  newIdentity,
  STARTUP_MS,
  type TestPlatform,
} from './test/platform';

describe('getOrCreateProfile', () => {
  let platform: TestPlatform;
  beforeAll(async () => {
    platform = await createTestPlatform({ vars: { ENVIRONMENT: 'development' } });
  }, STARTUP_MS);
  afterAll(() => platform?.dispose());

  const db = () => drizzle(platform.env.DB);
  const jobCount = async (profileId: string) =>
    (await db().select({ n: count() }).from(jobs).where(eq(jobs.profileId, profileId)).get())?.n;

  it('seeds a new profile with the sample jobs, no skills and the built-in taxonomy and groups', async () => {
    const call = apiAs(platform.env, newIdentity());

    const jobList = (await (await call('GET', '/api/jobs')).json()) as { title: string }[];
    const skillList = await (await call('GET', '/api/skills')).json();
    const taxonomy = await (await call('GET', '/api/taxonomy')).json();

    expect(jobList.map((job) => job.title)).toEqual(SEED_JOBS.map((job) => job.title));
    expect(skillList).toEqual([]);
    expect(taxonomy).toEqual({ categories: DEFAULT_GROUPS, ...DEFAULT_TAXONOMY });
  });

  it('creates one profile, seeded once, when two first requests race', async () => {
    const email = newIdentity();

    const [first, second] = await Promise.all([
      getOrCreateProfile(db(), email),
      getOrCreateProfile(db(), email),
    ]);

    expect(second.id).toBe(first.id);
    const rows = await db().select().from(profiles).where(eq(profiles.email, email));
    expect(rows).toHaveLength(1);
    expect(await jobCount(first.id)).toBe(SEED_JOBS.length);
  });

  it("doesn't seed again once the visitor has deleted every job", async () => {
    const email = newIdentity();
    const profile = await getOrCreateProfile(db(), email);
    await db().delete(jobs).where(eq(jobs.profileId, profile.id));

    const again = await getOrCreateProfile(db(), email);

    expect(again.id).toBe(profile.id);
    expect(await jobCount(profile.id)).toBe(0);
    expect(await db().select().from(skills).where(eq(skills.profileId, profile.id))).toEqual([]);
  });
});
