import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { taxonomy } from '../db/schema';
import type { AppEnv } from '../env';

export const profileRoutes = new Hono<AppEnv>()
  /** Who the server thinks the visitor is. The client never sends a profile id. */
  .get('/me', (c) => c.json({ email: c.var.profile.email }))

  /** The profile's taxonomy, for skill matching (created with the profile). */
  .get('/taxonomy', async (c) => {
    const row = await c.var.db
      .select({
        categories: taxonomy.categories,
        canonicalMap: taxonomy.canonicalMap,
        skillGroups: taxonomy.skillGroups,
      })
      .from(taxonomy)
      .where(eq(taxonomy.profileId, c.var.profile.id))
      .get();
    return row ? c.json(row) : c.json({ error: 'Taxonomy not found' }, 404);
  });
