import { and, asc, eq, getTableColumns } from 'drizzle-orm';
import { Hono } from 'hono';
import { skillInputSchema, skillPatchSchema } from '../../shared/forms';
import { skills } from '../db/schema';
import type { AppEnv } from '../env';
import { isUniqueViolation, jsonBody } from '../http';

const { profileId: _profileId, ...skillColumns } = getTableColumns(skills);

const notFound = { error: 'Skill not found' } as const;
const duplicate = (name: string) => ({
  error: `You already have ${name}.`,
  fieldErrors: { name: `You already have ${name}.` },
});

export const skillRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const rows = await c.var.db
      .select(skillColumns)
      .from(skills)
      .where(eq(skills.profileId, c.var.profile.id))
      .orderBy(asc(skills.name));
    return c.json(rows);
  })

  .post('/', jsonBody(skillInputSchema), async (c) => {
    const input = c.req.valid('json');
    try {
      const skill = await c.var.db
        .insert(skills)
        .values({ ...input, id: crypto.randomUUID(), profileId: c.var.profile.id })
        .returning(skillColumns)
        .get();
      return c.json(skill, 201);
    } catch (error) {
      if (isUniqueViolation(error)) return c.json(duplicate(input.name), 409);
      throw error;
    }
  })

  .patch('/:id', jsonBody(skillPatchSchema), async (c) => {
    const changes = c.req.valid('json');
    const ownSkill = and(eq(skills.id, c.req.param('id')), eq(skills.profileId, c.var.profile.id));
    try {
      const skill =
        Object.keys(changes).length === 0
          ? await c.var.db.select(skillColumns).from(skills).where(ownSkill).get()
          : await c.var.db
              .update(skills)
              .set(changes)
              .where(ownSkill)
              .returning(skillColumns)
              .get();
      return skill ? c.json(skill) : c.json(notFound, 404);
    } catch (error) {
      if (isUniqueViolation(error) && changes.name) return c.json(duplicate(changes.name), 409);
      throw error;
    }
  })

  .delete('/:id', async (c) => {
    const deleted = await c.var.db
      .delete(skills)
      .where(and(eq(skills.id, c.req.param('id')), eq(skills.profileId, c.var.profile.id)))
      .returning({ id: skills.id })
      .get();
    return deleted ? c.body(null, 204) : c.json(notFound, 404);
  });
