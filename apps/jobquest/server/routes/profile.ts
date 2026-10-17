import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { taxonomySchema } from '../../shared/types';
import { taxonomy } from '../db/schema';
import type { AppEnv } from '../env';
import { jsonBody } from '../http';

const taxonomyColumns = {
  categories: taxonomy.categories,
  canonicalMap: taxonomy.canonicalMap,
  skillGroups: taxonomy.skillGroups,
};

export const profileRoutes = new Hono<AppEnv>()
  /** Who the server thinks the visitor is. The client never sends a profile id. */
  .get('/me', (c) => c.json({ email: c.var.profile.email }))

  /** The profile's taxonomy, for skill matching (created with the profile). */
  .get('/taxonomy', async (c) => {
    const row = await c.var.db
      .select(taxonomyColumns)
      .from(taxonomy)
      .where(eq(taxonomy.profileId, c.var.profile.id))
      .get();
    return row ? c.json(row) : c.json({ error: 'Taxonomy not found' }, 404);
  })

  /**
   * Replaces the profile's taxonomy. It's one small document per visitor, edited on
   * the Taxonomy page, so the whole thing is sent; the client sends one at a time.
   */
  .put('/taxonomy', jsonBody(taxonomySchema), async (c) => {
    const values = c.req.valid('json');
    const row = await c.var.db
      .insert(taxonomy)
      .values({ ...values, profileId: c.var.profile.id })
      .onConflictDoUpdate({
        target: taxonomy.profileId,
        set: { ...values, updatedAt: new Date().toISOString() },
      })
      .returning(taxonomyColumns)
      .get();
    return c.json(row);
  });
