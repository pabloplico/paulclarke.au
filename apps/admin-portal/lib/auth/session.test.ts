import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Cookie sessions against a real database (PGlite). The JWT alone isn't
 * enough: the session row must still exist, belong to the token's user and
 * not have expired, so logging out (or expiring the row) ends the session
 * even though the JWT would still verify.
 */
process.env.DB_DRIVER = 'pglite';
process.env.AUTH_SECRET = 'session-test-secret-at-least-32-characters';
delete process.env.PGLITE_DATA_DIR;
delete process.env.PGLITE_SNAPSHOT;

const { db } = await import('@/lib/db');
const { ensurePgliteReady, getPglite } = await import('@/lib/db/pglite');
const schema = await import('@/lib/db/schema');
const { eq } = await import('drizzle-orm');
const { createSession, destroySession, validateSession } = await import('./index');

async function newUser(name: string): Promise<number> {
  const user = await db
    .insert(schema.adminUsers)
    .values({ email: `${name}@example.com`, passwordHash: 'x', name })
    .returning()
    .then((rows) => rows[0]!);
  return user.id;
}

let alice = 0;
let bob = 0;

beforeAll(async () => {
  await ensurePgliteReady();
  alice = await newUser('alice');
  bob = await newUser('bob');
}, 60_000);

afterAll(async () => {
  await getPglite().close();
});

describe('validateSession', () => {
  it('accepts a new session for its user', async () => {
    const token = await createSession(alice);
    expect(await validateSession(token)).toMatchObject({ userId: alice });
  });

  it('gives each login its own session, even within the same second', async () => {
    const [first, second] = await Promise.all([createSession(alice), createSession(alice)]);
    expect(first).not.toBe(second);
    const a = await validateSession(first);
    const b = await validateSession(second);
    expect(a).toMatchObject({ userId: alice });
    expect(b).toMatchObject({ userId: alice });
    expect(b!.sessionId).not.toBe(a!.sessionId);
  });

  it('refuses the token once the session is destroyed (logout)', async () => {
    const token = await createSession(alice);
    const session = await validateSession(token);
    await destroySession(session!.sessionId);

    expect(await validateSession(token)).toBeNull();
  });

  it('refuses the token once the session row has expired', async () => {
    const token = await createSession(alice);
    const session = await validateSession(token);
    await db
      .update(schema.adminSessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.adminSessions.id, session!.sessionId));

    expect(await validateSession(token)).toBeNull();
  });

  it('refuses a token whose session row belongs to another user', async () => {
    const token = await createSession(alice);
    const session = await validateSession(token);
    await db
      .update(schema.adminSessions)
      .set({ userId: bob })
      .where(eq(schema.adminSessions.id, session!.sessionId));

    expect(await validateSession(token)).toBeNull();
  });
});
