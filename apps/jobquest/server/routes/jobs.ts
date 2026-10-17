import { and, desc, eq, getTableColumns } from 'drizzle-orm';
import { Hono } from 'hono';
import { jobInputSchema, jobPatchSchema } from '../../shared/forms';
import { jobs } from '../db/schema';
import type { AppEnv } from '../env';
import { jsonBody } from '../http';

// Every column but profileId: responses never say whose a row is
const { profileId: _profileId, ...jobColumns } = getTableColumns(jobs);

const notFound = { error: 'Job not found' } as const;

export const jobRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const rows = await c.var.db
      .select(jobColumns)
      .from(jobs)
      .where(eq(jobs.profileId, c.var.profile.id))
      .orderBy(desc(jobs.dateAdded));
    return c.json(rows);
  })

  .get('/:id', async (c) => {
    const job = await c.var.db
      .select(jobColumns)
      .from(jobs)
      .where(and(eq(jobs.id, c.req.param('id')), eq(jobs.profileId, c.var.profile.id)))
      .get();
    return job ? c.json(job) : c.json(notFound, 404);
  })

  .post('/', jsonBody(jobInputSchema), async (c) => {
    const job = await c.var.db
      .insert(jobs)
      .values({
        ...c.req.valid('json'),
        id: crypto.randomUUID(),
        profileId: c.var.profile.id,
        dateAdded: new Date().toISOString(),
      })
      .returning(jobColumns)
      .get();
    return c.json(job, 201);
  })

  .patch('/:id', jsonBody(jobPatchSchema), async (c) => {
    const changes = c.req.valid('json');
    const ownJob = and(eq(jobs.id, c.req.param('id')), eq(jobs.profileId, c.var.profile.id));
    const job =
      Object.keys(changes).length === 0
        ? await c.var.db.select(jobColumns).from(jobs).where(ownJob).get()
        : await c.var.db.update(jobs).set(changes).where(ownJob).returning(jobColumns).get();
    return job ? c.json(job) : c.json(notFound, 404);
  })

  .delete('/:id', async (c) => {
    const deleted = await c.var.db
      .delete(jobs)
      .where(and(eq(jobs.id, c.req.param('id')), eq(jobs.profileId, c.var.profile.id)))
      .returning({ id: jobs.id })
      .get();
    return deleted ? c.body(null, 204) : c.json(notFound, 404);
  });
