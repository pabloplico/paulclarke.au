import { count } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { profiles } from './db/schema';
import type { AppEnv } from './env';
import { DEV_IDENTITY_COOKIE, resolveIdentity } from './identity';
import { getOrCreateProfile } from './profiles';
import { jobRoutes } from './routes/jobs';
import { profileRoutes } from './routes/profile';
import { skillRoutes } from './routes/skills';

export type { Env } from './env';

const app = new Hono<AppEnv>();

// Up only when the D1 binding works and the migrations have run. Registered before
// the identity middleware, so it needs no sign-in
app.get('/api/health', async (c) => {
  try {
    await drizzle(c.env.DB).select({ n: count() }).from(profiles);
    return c.json({ ok: true });
  } catch (error) {
    console.error('Health check failed:', error);
    return c.json({ ok: false }, 503);
  }
});

// Everything else under /api acts for one visitor: no identity, no access
app.use('/api/*', async (c, next) => {
  const email = resolveIdentity(c.env, getCookie(c, DEV_IDENTITY_COOKIE));
  if (!email) return c.json({ error: 'Sign in to use JobQuest.' }, 401);
  const db = drizzle(c.env.DB);
  c.set('db', db);
  c.set('profile', await getOrCreateProfile(db, email));
  await next();
});

app.route('/api', profileRoutes);
app.route('/api/jobs', jobRoutes);
app.route('/api/skills', skillRoutes);

app.notFound((c) => c.json({ error: 'Not found' }, 404));

export default app;
