import { count } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import { profiles } from './db/schema';

export interface Env {
  DB: D1Database;
  ENVIRONMENT?: string;
}

const app = new Hono<{ Bindings: Env }>();

// Up only when the D1 binding works and the migrations have run
app.get('/api/health', async (c) => {
  try {
    await drizzle(c.env.DB).select({ n: count() }).from(profiles);
    return c.json({ ok: true });
  } catch (error) {
    console.error('Health check failed:', error);
    return c.json({ ok: false }, 503);
  }
});

app.notFound((c) => c.json({ error: 'Not found' }, 404));

export default app;
