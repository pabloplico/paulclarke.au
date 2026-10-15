import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Restore runs against a real database (PGlite), with only the signed-in
 * user faked. The version in the URL must belong to the section in the URL,
 * or one user could copy another user's content into a section and read it.
 */
process.env.DB_DRIVER = 'pglite';
delete process.env.PGLITE_DATA_DIR;
delete process.env.PGLITE_SNAPSHOT;

const signedIn = vi.hoisted(() => ({ id: 0 }));
vi.mock('@/lib/auth/server', () => {
  const user = async () => ({ id: signedIn.id, email: 'u@example.com', name: 'U', role: 'member' });
  return { requireAuthApi: user, getCurrentUser: user };
});

const { db } = await import('@/lib/db');
const { ensurePgliteReady, getPglite } = await import('@/lib/db/pglite');
const schema = await import('@/lib/db/schema');
const { eq } = await import('drizzle-orm');
const { POST } = await import('./route');

type Owned = { userId: number; workspaceId: number; sectionId: number; oldVersionId: number };

async function newOwner(name: string): Promise<Owned> {
  const user = await db
    .insert(schema.adminUsers)
    .values({ email: `${name}@example.com`, passwordHash: 'x', name })
    .returning()
    .then((rows) => rows[0]!);
  const workspace = await db
    .insert(schema.adminWorkspaces)
    .values({ userId: user.id, slug: `${name}-ws`, title: `${name} workspace` })
    .returning()
    .then((rows) => rows[0]!);
  const section = await db
    .insert(schema.adminWorkspaceSections)
    .values({ workspaceId: workspace.id, slug: 'notes', title: 'Notes' })
    .returning()
    .then((rows) => rows[0]!);
  const [oldVersion] = await db
    .insert(schema.adminSectionVersions)
    .values([
      { sectionId: section.id, version: 1, content: `${name} secret v1` },
      { sectionId: section.id, version: 2, content: `${name} secret v2` },
    ])
    .returning();
  return {
    userId: user.id,
    workspaceId: workspace.id,
    sectionId: section.id,
    oldVersionId: oldVersion!.id,
  };
}

function restore(as: Owned, urlOwner: Owned, versionId: number) {
  signedIn.id = as.userId;
  const params = Promise.resolve({
    id: String(urlOwner.workspaceId),
    sectionId: String(urlOwner.sectionId),
    versionId: String(versionId),
  });
  return POST(new Request('http://localhost/restore', { method: 'POST' }) as never, { params });
}

async function versionsOf(sectionId: number) {
  return db
    .select()
    .from(schema.adminSectionVersions)
    .where(eq(schema.adminSectionVersions.sectionId, sectionId));
}

let alice: Owned;
let bob: Owned;

beforeAll(async () => {
  await ensurePgliteReady();
  alice = await newOwner('alice');
  bob = await newOwner('bob');
}, 60_000);

afterAll(async () => {
  await getPglite().close();
});

describe('POST /api/workspaces/[id]/sections/[sectionId]/versions/[versionId]/restore', () => {
  it("refuses another user's version under the caller's own section, and changes nothing", async () => {
    const res = await restore(bob, bob, alice.oldVersionId);

    expect(res.status).toBe(404);
    expect(JSON.stringify(await res.json())).not.toContain('alice secret');
    expect(await versionsOf(alice.sectionId)).toHaveLength(2);
    expect(await versionsOf(bob.sectionId)).toHaveLength(2);
  });

  it('restores an older version of the section as a new latest version', async () => {
    const carol = await newOwner('carol');
    const res = await restore(carol, carol, carol.oldVersionId);

    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      sectionId: carol.sectionId,
      version: 3,
      content: 'carol secret v1',
    });
    expect(await versionsOf(carol.sectionId)).toHaveLength(3);
  });
});
