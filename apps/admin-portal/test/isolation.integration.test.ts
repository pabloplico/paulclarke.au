import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * One user can't reach another user's data through the API. Two visitors get
 * the demo seed on a real database (PGlite); the second one then calls every
 * by-id route on the first one's resources, and every list route.
 *
 * Routes are loaded by their path under app/api, so the cases read like the
 * API and survive changes to how the handlers are written. Only the signed-in
 * user and the AI models are faked.
 */
process.env.DB_DRIVER = 'pglite';
process.env.QUEUE_DRIVER = 'memory';
process.env.NEXT_RUNTIME = 'nodejs';
delete process.env.PGLITE_DATA_DIR;
delete process.env.PGLITE_SNAPSHOT;
const uploadsDir = mkdtempSync(join(tmpdir(), 'admin-isolation-uploads-'));
process.env.UPLOADS_DIR = uploadsDir;

const signedIn = vi.hoisted(() => ({ id: 0 }));
vi.mock('@/lib/auth/server', () => {
  const user = async () => ({ id: signedIn.id, email: 'u@example.com', name: 'U', role: 'member' });
  return { requireAuthApi: user, getCurrentUser: user };
});
vi.mock('@/lib/ai/providers', async () => {
  const { createFakeChatModel, createFakeEmbeddingModel } = await import('./fake-ai');
  const chat = createFakeChatModel({ suggestions: () => [] }, 'gpt-4.1-nano');
  const embedding = createFakeEmbeddingModel('text-embedding-3-small');
  return { createLanguageModel: () => chat, createEmbeddingModel: () => embedding };
});

const { db } = await import('@/lib/db');
const { ensurePgliteReady, getPglite } = await import('@/lib/db/pglite');
const schema = await import('@/lib/db/schema');
const { count, eq } = await import('drizzle-orm');
const { seedDemoUser } = await import('@/lib/demo-seed/seed');

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';
type Handler = (
  req: Request,
  ctx: { params: Promise<Record<string, string>> }
) => Promise<Response>;

/** Calls app/api/<route>/route.ts the way Next.js would, as the signed-in user. */
async function call(
  method: Method,
  route: string,
  params: Record<string, number> = {},
  body?: unknown
): Promise<Response> {
  const mod = (await import(resolve(__dirname, '../app/api', route, 'route.ts'))) as Record<
    string,
    Handler | undefined
  >;
  const handler = mod[method];
  if (!handler) throw new Error(`${route} has no ${method} handler`);
  const url = `http://localhost/api/${route}`;
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { 'Content-Type': 'application/json' };
  }
  const stringParams = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]));
  try {
    return await handler(new Request(url, init), { params: Promise.resolve(stringParams) });
  } catch (thrown) {
    // requireAuthApi-style helpers throw Responses
    if (thrown instanceof Response) return thrown;
    throw thrown;
  }
}

async function newUser(name: string): Promise<number> {
  const user = await db
    .insert(schema.adminUsers)
    .values({ email: `${name}@example.com`, passwordHash: 'x', name })
    .returning()
    .then((rows) => rows[0]!);
  await db.transaction((tx) => seedDemoUser(tx, user.id));
  return user.id;
}

/** Ids of one of each of a user's resources. */
async function resourcesOf(userId: number) {
  const first = <T>(rows: T[]) => rows[0]!;
  const workspace = first(
    await db
      .select({ id: schema.adminWorkspaces.id })
      .from(schema.adminWorkspaces)
      .where(eq(schema.adminWorkspaces.userId, userId))
  );
  const section = first(
    await db
      .select({ id: schema.adminWorkspaceSections.id })
      .from(schema.adminWorkspaceSections)
      .where(eq(schema.adminWorkspaceSections.workspaceId, workspace.id))
  );
  const version = first(
    await db
      .select({ id: schema.adminSectionVersions.id })
      .from(schema.adminSectionVersions)
      .where(eq(schema.adminSectionVersions.sectionId, section.id))
  );
  const document = first(
    await db
      .select({ id: schema.adminDocuments.id })
      .from(schema.adminDocuments)
      .where(eq(schema.adminDocuments.userId, userId))
  );
  const inboxItem = first(
    await db
      .select({ id: schema.adminInboxItems.id })
      .from(schema.adminInboxItems)
      .where(eq(schema.adminInboxItems.userId, userId))
  );
  const client = first(
    await db
      .select({ id: schema.adminClients.id })
      .from(schema.adminClients)
      .where(eq(schema.adminClients.userId, userId))
  );
  const job = first(
    await db
      .select({ id: schema.adminJobs.id })
      .from(schema.adminJobs)
      .where(eq(schema.adminJobs.userId, userId))
  );
  const todo = first(
    await db
      .select({ id: schema.adminTodos.id })
      .from(schema.adminTodos)
      .where(eq(schema.adminTodos.userId, userId))
  );
  return {
    workspace: workspace.id,
    section: section.id,
    version: version.id,
    document: document.id,
    inboxItem: inboxItem.id,
    client: client.id,
    job: job.id,
    todo: todo.id,
  };
}

/** Rows of each kind that belong to a user, to show nothing of theirs changed. */
async function rowCounts(userId: number) {
  const n = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
  return {
    workspaces: await n(
      db
        .select({ n: count() })
        .from(schema.adminWorkspaces)
        .where(eq(schema.adminWorkspaces.userId, userId))
    ),
    sections: await n(
      db
        .select({ n: count() })
        .from(schema.adminWorkspaceSections)
        .innerJoin(
          schema.adminWorkspaces,
          eq(schema.adminWorkspaceSections.workspaceId, schema.adminWorkspaces.id)
        )
        .where(eq(schema.adminWorkspaces.userId, userId))
    ),
    versions: await n(
      db
        .select({ n: count() })
        .from(schema.adminSectionVersions)
        .innerJoin(
          schema.adminWorkspaceSections,
          eq(schema.adminSectionVersions.sectionId, schema.adminWorkspaceSections.id)
        )
        .innerJoin(
          schema.adminWorkspaces,
          eq(schema.adminWorkspaceSections.workspaceId, schema.adminWorkspaces.id)
        )
        .where(eq(schema.adminWorkspaces.userId, userId))
    ),
    documents: await n(
      db
        .select({ n: count() })
        .from(schema.adminDocuments)
        .where(eq(schema.adminDocuments.userId, userId))
    ),
    inboxItems: await n(
      db
        .select({ n: count() })
        .from(schema.adminInboxItems)
        .where(eq(schema.adminInboxItems.userId, userId))
    ),
    clients: await n(
      db
        .select({ n: count() })
        .from(schema.adminClients)
        .where(eq(schema.adminClients.userId, userId))
    ),
    contacts: await n(
      db
        .select({ n: count() })
        .from(schema.adminContacts)
        .innerJoin(schema.adminClients, eq(schema.adminContacts.clientId, schema.adminClients.id))
        .where(eq(schema.adminClients.userId, userId))
    ),
    jobs: await n(
      db.select({ n: count() }).from(schema.adminJobs).where(eq(schema.adminJobs.userId, userId))
    ),
    todos: await n(
      db.select({ n: count() }).from(schema.adminTodos).where(eq(schema.adminTodos.userId, userId))
    ),
    conversations: await n(
      db
        .select({ n: count() })
        .from(schema.adminConversations)
        .where(eq(schema.adminConversations.userId, userId))
    ),
    knowledgeBases: await n(
      db
        .select({ n: count() })
        .from(schema.adminKnowledgeBases)
        .where(eq(schema.adminKnowledgeBases.userId, userId))
    ),
  };
}

let alice: Awaited<ReturnType<typeof resourcesOf>> & {
  conversation: number;
  knowledgeBase: number;
};
let bob: Awaited<ReturnType<typeof resourcesOf>>;
let aliceId = 0;
let aliceBefore: Awaited<ReturnType<typeof rowCounts>>;

beforeAll(async () => {
  await ensurePgliteReady();
  aliceId = await newUser('alice');
  const bobId = await newUser('bob');

  const knowledgeBase = await db
    .insert(schema.adminKnowledgeBases)
    .values({ userId: aliceId, name: 'Alice private notes' })
    .returning()
    .then((rows) => rows[0]!);
  const conversation = await db
    .insert(schema.adminConversations)
    .values({ userId: aliceId, title: 'Alice private chat' })
    .returning()
    .then((rows) => rows[0]!);
  await db
    .insert(schema.adminMessages)
    .values({ conversationId: conversation.id, role: 'user', content: 'alice secret message' });

  alice = {
    ...(await resourcesOf(aliceId)),
    conversation: conversation.id,
    knowledgeBase: knowledgeBase.id,
  };
  // Bob gets his own, so his lists aren't empty and the list checks mean something
  await db.insert(schema.adminKnowledgeBases).values({ userId: bobId, name: 'Bob notes' });
  await db.insert(schema.adminConversations).values({ userId: bobId, title: 'Bob chat' });
  bob = await resourcesOf(bobId);
  aliceBefore = await rowCounts(aliceId);
  signedIn.id = bobId;
}, 60_000);

afterAll(async () => {
  await getPglite().close();
  rmSync(uploadsDir, { recursive: true, force: true });
});

type Case = [Method, string, () => Record<string, number>, unknown?];

// Every by-id route on one of the first user's resources, called by the second
const byId: Case[] = [
  ['GET', 'workspaces/[id]', () => ({ id: alice.workspace })],
  ['PATCH', 'workspaces/[id]', () => ({ id: alice.workspace }), { title: 'taken' }],
  ['DELETE', 'workspaces/[id]', () => ({ id: alice.workspace })],

  [
    'GET',
    'workspaces/[id]/sections/[sectionId]',
    () => ({ id: alice.workspace, sectionId: alice.section }),
  ],
  [
    'PATCH',
    'workspaces/[id]/sections/[sectionId]',
    () => ({ id: alice.workspace, sectionId: alice.section }),
    { title: 'taken' },
  ],
  [
    'DELETE',
    'workspaces/[id]/sections/[sectionId]',
    () => ({ id: alice.workspace, sectionId: alice.section }),
  ],
  // Alice's section under Bob's own workspace
  [
    'GET',
    'workspaces/[id]/sections/[sectionId]',
    () => ({ id: bob.workspace, sectionId: alice.section }),
  ],
  [
    'PATCH',
    'workspaces/[id]/sections/[sectionId]',
    () => ({ id: bob.workspace, sectionId: alice.section }),
    { title: 'taken' },
  ],
  [
    'DELETE',
    'workspaces/[id]/sections/[sectionId]',
    () => ({ id: bob.workspace, sectionId: alice.section }),
  ],
  ['GET', 'sections/[id]/content', () => ({ id: alice.section })],

  [
    'GET',
    'workspaces/[id]/sections/[sectionId]/versions',
    () => ({ id: alice.workspace, sectionId: alice.section }),
  ],
  // Alice's version under Bob's own workspace and section
  [
    'GET',
    'workspaces/[id]/sections/[sectionId]/versions/[versionId]',
    () => ({ id: bob.workspace, sectionId: bob.section, versionId: alice.version }),
  ],
  [
    'POST',
    'workspaces/[id]/sections/[sectionId]/versions/[versionId]/restore',
    () => ({ id: bob.workspace, sectionId: bob.section, versionId: alice.version }),
  ],

  ['GET', 'documents/[id]', () => ({ id: alice.document })],
  ['PATCH', 'documents/[id]', () => ({ id: alice.document }), { title: 'taken' }],
  ['DELETE', 'documents/[id]', () => ({ id: alice.document })],
  ['GET', 'documents/[id]/file', () => ({ id: alice.document })],
  ['GET', 'documents/[id]/chunks', () => ({ id: alice.document })],
  ['POST', 'documents/[id]/retry', () => ({ id: alice.document })],
  ['POST', 'documents/[id]/clean', () => ({ id: alice.document }), { mode: 'reclean' }],

  ['GET', 'inbox/[id]', () => ({ id: alice.inboxItem })],
  ['POST', 'inbox/[id]/approve', () => ({ id: alice.inboxItem }), { suggestionIndex: 0 }],
  ['POST', 'inbox/[id]/skip', () => ({ id: alice.inboxItem }), { suggestionIndex: 0 }],
  ['POST', 'inbox/[id]/dismiss', () => ({ id: alice.inboxItem })],
  ['POST', 'inbox/[id]/reroute', () => ({ id: alice.inboxItem })],

  ['GET', 'clients/[id]', () => ({ id: alice.client })],
  ['PATCH', 'clients/[id]', () => ({ id: alice.client }), { contactName: 'taken' }],
  ['DELETE', 'clients/[id]', () => ({ id: alice.client })],
  ['GET', 'clients/[id]/contacts', () => ({ id: alice.client })],
  ['POST', 'clients/[id]/contacts', () => ({ id: alice.client }), { name: 'Planted contact' }],

  ['GET', 'jobs/[id]', () => ({ id: alice.job })],
  ['PATCH', 'jobs/[id]', () => ({ id: alice.job }), { title: 'taken' }],
  ['DELETE', 'jobs/[id]', () => ({ id: alice.job })],
  ['PATCH', 'jobs/[id]/stage', () => ({ id: alice.job }), { stage: 'complete' }],

  ['PATCH', 'todos/[id]', () => ({ id: alice.todo }), { title: 'taken' }],
  ['DELETE', 'todos/[id]', () => ({ id: alice.todo })],

  ['GET', 'chat/conversations/[id]/messages', () => ({ id: alice.conversation })],
  ['PATCH', 'chat/conversations/[id]', () => ({ id: alice.conversation }), { title: 'taken' }],
  ['DELETE', 'chat/conversations/[id]', () => ({ id: alice.conversation })],

  ['GET', 'knowledge-bases/[id]', () => ({ id: alice.knowledgeBase })],
  ['PATCH', 'knowledge-bases/[id]', () => ({ id: alice.knowledgeBase }), { name: 'taken' }],
  ['DELETE', 'knowledge-bases/[id]', () => ({ id: alice.knowledgeBase })],
  ['GET', 'knowledge-bases/[id]/chunks', () => ({ id: alice.knowledgeBase })],
  ['GET', 'knowledge-bases/[id]/available-chunks', () => ({ id: alice.knowledgeBase })],
];

describe("another user's resources", () => {
  it.each(byId)('%s %s is a 404', async (method, route, params, body) => {
    const res = await call(method, route, params(), body);
    expect(res.status).toBe(404);
  });

  it("leaves every one of the first user's rows as it was", async () => {
    expect(await rowCounts(aliceId)).toEqual(aliceBefore);
  });
});

describe('own resources', () => {
  // So the 404s above come from ownership checks, not from refusing everyone
  it('still works for the owner', async () => {
    expect((await call('GET', 'workspaces/[id]', { id: bob.workspace })).status).toBe(200);
    const added = await call(
      'POST',
      'clients/[id]/contacts',
      { id: bob.client },
      { name: 'Real contact' }
    );
    expect(added.status).toBe(201);
    const listed = await call('GET', 'clients/[id]/contacts', { id: bob.client });
    expect(collectIds(await listed.json())).toContain((await added.json()).id);
  });
});

describe('list routes', () => {
  const lists: [string, () => number][] = [
    ['workspaces', () => alice.workspace],
    ['documents', () => alice.document],
    ['inbox', () => alice.inboxItem],
    ['clients', () => alice.client],
    ['jobs', () => alice.job],
    ['todos', () => alice.todo],
    ['knowledge-bases', () => alice.knowledgeBase],
    ['chat/conversations', () => alice.conversation],
  ];

  it.each(lists)("GET %s shows none of another user's rows", async (route, aliceRowId) => {
    const res = await call('GET', route);
    expect(res.status).toBe(200);
    const ids = collectIds(await res.json());
    expect(ids.length).toBeGreaterThan(0);
    expect(ids).not.toContain(aliceRowId());
  });
});

/**
 * The row id of each item in a list response, whatever its envelope: a bare
 * array or `{ items: [...] }`, with rows flat (`{ id }`) or joined (`{ job: { id }, clientName }`).
 */
function collectIds(body: unknown): number[] {
  const rows = Array.isArray(body)
    ? body
    : (Object.values(body as Record<string, unknown>).find(Array.isArray) ?? []);
  return (rows as Record<string, unknown>[])
    .map((row) => {
      if (typeof row.id === 'number') return row.id;
      const nested = Object.values(row).find(
        (v): v is { id: number } =>
          typeof v === 'object' && v !== null && typeof (v as { id?: unknown }).id === 'number'
      );
      return nested?.id;
    })
    .filter((id): id is number => id !== undefined);
}
