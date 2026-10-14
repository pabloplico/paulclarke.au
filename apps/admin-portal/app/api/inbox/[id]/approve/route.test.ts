import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth/server', () => ({
  requireAuthApi: vi.fn(() =>
    Promise.resolve({ id: 1, email: 'test@test.com', name: 'Test', role: 'admin' })
  ),
}));

// Track all DB operations for assertions
let dbCalls: { op: string; table: string; args?: unknown }[] = [];

// Configurable query results per table
let inboxResult: unknown[] = [];
let versionsResult: unknown[] = [];
let sectionsResult: unknown[] = [];
let workspacesResult: unknown[] = [];
let chunksResult: unknown[] = [];
let insertResult: unknown[] = [];

// Track inserts and updates
let insertedValues: Record<string, unknown>[] = [];
let updatedSets: Record<string, unknown>[] = [];

function chainable(resolve: () => Promise<unknown[]>) {
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.orderBy = vi.fn(() => chain);
  chain.limit = vi.fn(() => resolve());
  chain.set = vi.fn((data: Record<string, unknown>) => {
    updatedSets.push(data);
    return chain;
  });
  chain.then = (fn: (v: unknown[]) => void) => resolve().then(fn);
  return chain;
}

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => {
      // Return different results based on the table passed to .from()
      let fromTable = '';
      const chain = chainable(() => {
        switch (fromTable) {
          case 'adminInboxItems':
            return Promise.resolve(inboxResult);
          case 'adminSectionVersions':
            return Promise.resolve(versionsResult);
          case 'adminWorkspaceSections':
            return Promise.resolve(sectionsResult);
          case 'adminWorkspaces':
            return Promise.resolve(workspacesResult);
          case 'adminDocumentChunks':
            return Promise.resolve(chunksResult);
          default:
            return Promise.resolve([]);
        }
      });
      // Override .from to capture the table name
      chain.from = vi.fn((table: { _: { name: string } } | string) => {
        fromTable = typeof table === 'string' ? table : ((table as { _name?: string })._name ?? '');
        // Fall back to object identity matching
        if (!fromTable) {
          const ref = table as unknown;
          if (ref === mockSchema.adminInboxItems) fromTable = 'adminInboxItems';
          else if (ref === mockSchema.adminSectionVersions) fromTable = 'adminSectionVersions';
          else if (ref === mockSchema.adminWorkspaceSections) fromTable = 'adminWorkspaceSections';
          else if (ref === mockSchema.adminWorkspaces) fromTable = 'adminWorkspaces';
          else if (ref === mockSchema.adminDocumentChunks) fromTable = 'adminDocumentChunks';
        }
        dbCalls.push({ op: 'select', table: fromTable });
        return chain;
      });
      return chain;
    }),
    insert: vi.fn((table: unknown) => {
      let tableName = '';
      if (table === mockSchema.adminSectionVersions) tableName = 'adminSectionVersions';
      else if (table === mockSchema.adminSectionSources) tableName = 'adminSectionSources';
      dbCalls.push({ op: 'insert', table: tableName });
      return {
        values: vi.fn((vals: Record<string, unknown>) => {
          insertedValues.push({ _table: tableName, ...vals });
          return {
            returning: vi.fn(() => Promise.resolve(insertResult)),
          };
        }),
      };
    }),
    update: vi.fn((table: unknown) => {
      let tableName = '';
      if (table === mockSchema.adminInboxItems) tableName = 'adminInboxItems';
      else if (table === mockSchema.adminWorkspaceSections) tableName = 'adminWorkspaceSections';
      dbCalls.push({ op: 'update', table: tableName });
      return {
        set: vi.fn((data: Record<string, unknown>) => {
          updatedSets.push({ _table: tableName, ...data });
          return {
            where: vi.fn(() => Promise.resolve()),
          };
        }),
      };
    }),
  },
}));

// Schema mock — use unique objects so identity matching works
const mockSchema = {
  adminInboxItems: { id: 'id', status: 'status', routingResults: 'routingResults' },
  adminSectionVersions: { sectionId: 'sectionId', version: 'version' },
  adminWorkspaceSections: { id: 'id', template: 'template', updatedAt: 'updatedAt' },
  adminWorkspaces: { id: 'id', slug: 'slug' },
  adminSectionSources: { id: 'id' },
  adminDocumentChunks: { id: 'id', chunkIndex: 'chunkIndex', documentId: 'documentId' },
};

vi.mock('@/lib/db/schema', () => ({
  adminInboxItems: mockSchema.adminInboxItems,
  adminSectionVersions: mockSchema.adminSectionVersions,
  adminWorkspaceSections: mockSchema.adminWorkspaceSections,
  adminWorkspaces: mockSchema.adminWorkspaces,
  adminSectionSources: mockSchema.adminSectionSources,
  adminDocumentChunks: mockSchema.adminDocumentChunks,
}));

vi.mock('drizzle-orm', () => ({
  and: (...conditions: unknown[]) => conditions,
  eq: (col: string, val: unknown) => ({ col, val }),
  desc: (col: string) => ({ desc: col }),
  inArray: (col: string, vals: unknown[]) => ({ col, vals }),
}));

// Mock structured data parsers
const mockParseTable = vi.fn((_md: string) => ({ columns: ['A'], rows: [{ A: '1' }] }));
const mockParseCards = vi.fn((_md: string) => ({ items: [{ title: 'Card', body: 'text' }] }));
const mockParseChecklist = vi.fn((_md: string, _opts?: { listItemsOnly?: boolean }) => ({
  items: [{ text: 'Do thing', checked: false }],
}));
const mockParseKvPairs = vi.fn((_md: string) => ({ pairs: [{ key: 'k', value: 'v' }] }));

vi.mock('@/lib/workspaces/parse-structured', async (importOriginal) => ({
  // The real merge: it's what the append regression tests check
  mergeStructuredData: (await importOriginal<typeof import('@/lib/workspaces/parse-structured')>())
    .mergeStructuredData,
  parseMarkdownToTable: (md: string) => mockParseTable(md),
  parseMarkdownToCards: (md: string) => mockParseCards(md),
  parseMarkdownToChecklist: (md: string, opts?: { listItemsOnly?: boolean }) =>
    opts ? mockParseChecklist(md, opts) : mockParseChecklist(md),
  parseMarkdownToKvPairs: (md: string) => mockParseKvPairs(md),
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(body: Record<string, unknown> = { suggestionIndex: 0 }): NextRequest {
  return new Request('http://localhost:3001/api/inbox/1/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

type NextRequest = import('next/server').NextRequest;

function makeParams(id = '1') {
  return { params: Promise.resolve({ id }) };
}

function makeSuggestion(overrides: Partial<import('@/lib/db/schema').RoutingSuggestion> = {}) {
  return {
    workspaceId: 10,
    workspaceTitle: 'Services',
    sectionId: 20,
    sectionTitle: 'Overview',
    confidence: 0.9,
    action: 'replace' as const,
    suggestedContent: 'New content from document',
    reasoning: 'Matches section topic',
    ...overrides,
  };
}

function makeInboxItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    type: 'file',
    title: 'uploaded-doc.pdf',
    content: null,
    documentId: 100,
    status: 'routed',
    routingResults: [makeSuggestion()],
    approvedResults: null,
    processingError: null,
    createdAt: new Date(),
    processedAt: new Date(),
    ...overrides,
  };
}

async function getHandler() {
  const mod = await import('./route');
  return mod.POST;
}

// ── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  dbCalls = [];
  insertedValues = [];
  updatedSets = [];
  inboxResult = [];
  versionsResult = [];
  sectionsResult = [];
  workspacesResult = [];
  chunksResult = [];
  insertResult = [{ id: 1, sectionId: 20, version: 1, content: 'New content from document' }];
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('POST /api/inbox/[id]/approve', () => {
  it('returns 404 when inbox item not found', async () => {
    inboxResult = [];

    const POST = await getHandler();
    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Inbox item not found');
  });

  it('returns 400 when item status is not "routed"', async () => {
    inboxResult = [makeInboxItem({ status: 'pending' })];

    const POST = await getHandler();
    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Item has no routing results to approve');
  });

  it('returns 400 when routingResults is null', async () => {
    inboxResult = [makeInboxItem({ routingResults: null })];

    const POST = await getHandler();
    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid suggestion index');
  });

  it('returns 400 when suggestionIndex is out of bounds', async () => {
    inboxResult = [makeInboxItem()]; // has 1 suggestion at index 0

    const POST = await getHandler();
    const res = await POST(makeRequest({ suggestionIndex: 5 }), makeParams());

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid suggestion index');
  });

  it('creates a new section version with replace action', async () => {
    inboxResult = [makeInboxItem()];
    versionsResult = [{ version: 3, content: 'Old content' }];
    sectionsResult = [{ template: 'prose' }];
    workspacesResult = [{ slug: 'services' }];

    const POST = await getHandler();
    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(200);

    // Should insert version with version = 4 (latest 3 + 1)
    const versionInsert = insertedValues.find((v) => v._table === 'adminSectionVersions');
    expect(versionInsert).toBeDefined();
    expect(versionInsert?.version).toBe(4);
    expect(versionInsert?.content).toBe('New content from document');
    expect(versionInsert?.changeSource).toBe('ai_ingest');
    expect(versionInsert?.changeDescription).toBe('Ingested from: uploaded-doc.pdf');
  });

  it('starts version at 1 when no prior versions exist', async () => {
    inboxResult = [makeInboxItem()];
    versionsResult = []; // no prior versions
    sectionsResult = [{ template: 'prose' }];
    workspacesResult = [{ slug: 'services' }];

    const POST = await getHandler();
    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(200);
    const versionInsert = insertedValues.find((v) => v._table === 'adminSectionVersions');
    expect(versionInsert?.version).toBe(1);
  });

  it('appends content to existing version for append action', async () => {
    const suggestion = makeSuggestion({
      action: 'append',
      suggestedContent: 'Appended paragraph',
    });
    inboxResult = [makeInboxItem({ routingResults: [suggestion] })];
    versionsResult = [{ version: 2, content: 'Existing content' }];
    sectionsResult = [{ template: 'prose' }];
    workspacesResult = [{ slug: 'services' }];

    const POST = await getHandler();
    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(200);
    const versionInsert = insertedValues.find((v) => v._table === 'adminSectionVersions');
    expect(versionInsert?.content).toBe('Existing content\n\nAppended paragraph');
  });

  it('does not append when there is no existing content', async () => {
    const suggestion = makeSuggestion({
      action: 'append',
      suggestedContent: 'First content',
    });
    inboxResult = [makeInboxItem({ routingResults: [suggestion] })];
    versionsResult = []; // no prior version
    sectionsResult = [{ template: 'prose' }];
    workspacesResult = [{ slug: 'services' }];

    const POST = await getHandler();
    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(200);
    const versionInsert = insertedValues.find((v) => v._table === 'adminSectionVersions');
    // No append since no latest version — just uses suggested content directly
    expect(versionInsert?.content).toBe('First content');
  });

  it('parses structured data for table template', async () => {
    inboxResult = [makeInboxItem()];
    versionsResult = [{ version: 1, content: 'old' }];
    sectionsResult = [{ template: 'table' }];
    workspacesResult = [{ slug: 'services' }];

    const POST = await getHandler();
    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(200);
    expect(mockParseTable).toHaveBeenCalledWith('New content from document');
    const versionInsert = insertedValues.find((v) => v._table === 'adminSectionVersions');
    expect(versionInsert?.structuredData).toEqual({ columns: ['A'], rows: [{ A: '1' }] });
  });

  it('parses structured data for cards template', async () => {
    inboxResult = [makeInboxItem()];
    versionsResult = [{ version: 1, content: 'old' }];
    sectionsResult = [{ template: 'cards' }];
    workspacesResult = [{ slug: 'services' }];

    const POST = await getHandler();
    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(200);
    expect(mockParseCards).toHaveBeenCalledWith('New content from document');
    const versionInsert = insertedValues.find((v) => v._table === 'adminSectionVersions');
    expect(versionInsert?.structuredData).toEqual({
      items: [{ title: 'Card', body: 'text' }],
    });
  });

  it('parses structured data for checklist template', async () => {
    inboxResult = [makeInboxItem()];
    versionsResult = [{ version: 1, content: 'old' }];
    sectionsResult = [{ template: 'checklist' }];
    workspacesResult = [{ slug: 'services' }];

    const POST = await getHandler();
    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(200);
    expect(mockParseChecklist).toHaveBeenCalledWith('New content from document');
  });

  it('parses structured data for kv-pairs template', async () => {
    inboxResult = [makeInboxItem()];
    versionsResult = [{ version: 1, content: 'old' }];
    sectionsResult = [{ template: 'kv-pairs' }];
    workspacesResult = [{ slug: 'services' }];

    const POST = await getHandler();
    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(200);
    expect(mockParseKvPairs).toHaveBeenCalledWith('New content from document');
  });

  // Regression: appending into a structured section used to re-parse only the
  // suggestion, so the new version kept the new items and lost the old ones
  describe('append into a structured section keeps what it has', () => {
    async function approveAppend(template: string, structuredData: Record<string, unknown>) {
      const suggestion = makeSuggestion({ action: 'append', suggestedContent: 'New items' });
      inboxResult = [makeInboxItem({ routingResults: [suggestion] })];
      versionsResult = [{ version: 1, content: null, structuredData }];
      sectionsResult = [{ template }];
      workspacesResult = [{ slug: 'services' }];
      const POST = await getHandler();
      const res = await POST(makeRequest(), makeParams());
      expect(res.status).toBe(200);
      return insertedValues.find((v) => v._table === 'adminSectionVersions')?.structuredData;
    }

    it('checklist', async () => {
      const data = await approveAppend('checklist', {
        items: [{ text: 'Existing check', checked: true }],
      });
      expect(mockParseChecklist).toHaveBeenCalledWith('New items', { listItemsOnly: true });
      expect(data).toEqual({
        items: [
          { text: 'Existing check', checked: true },
          { text: 'Do thing', checked: false },
        ],
      });
    });

    it('cards', async () => {
      const data = await approveAppend('cards', {
        items: [{ title: 'Existing', body: 'card' }],
      });
      expect(data).toEqual({
        items: [
          { title: 'Existing', body: 'card' },
          { title: 'Card', body: 'text' },
        ],
      });
    });

    it('kv-pairs', async () => {
      const data = await approveAppend('kv-pairs', { pairs: [{ key: 'Owner', value: 'Marie' }] });
      expect(data).toEqual({
        pairs: [
          { key: 'Owner', value: 'Marie' },
          { key: 'k', value: 'v' },
        ],
      });
    });

    it('table', async () => {
      const data = await approveAppend('table', {
        columns: ['A', 'B'],
        rows: [{ A: '0', B: 'x' }],
      });
      expect(data).toEqual({ columns: ['A', 'B'], rows: [{ A: '0', B: 'x' }, { A: '1' }] });
    });
  });

  it('does not parse structured data for prose template', async () => {
    inboxResult = [makeInboxItem()];
    versionsResult = [{ version: 1, content: 'old' }];
    sectionsResult = [{ template: 'prose' }];
    workspacesResult = [{ slug: 'services' }];

    const POST = await getHandler();
    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(200);
    expect(mockParseTable).not.toHaveBeenCalled();
    expect(mockParseCards).not.toHaveBeenCalled();
    expect(mockParseChecklist).not.toHaveBeenCalled();
    expect(mockParseKvPairs).not.toHaveBeenCalled();
    const versionInsert = insertedValues.find((v) => v._table === 'adminSectionVersions');
    expect(versionInsert?.structuredData).toBeUndefined();
  });

  it('defaults to prose when section template is missing', async () => {
    inboxResult = [makeInboxItem()];
    versionsResult = [{ version: 1, content: 'old' }];
    sectionsResult = []; // section not found — defaults to prose
    workspacesResult = [{ slug: 'services' }];

    const POST = await getHandler();
    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(200);
    expect(mockParseTable).not.toHaveBeenCalled();
    expect(mockParseCards).not.toHaveBeenCalled();
  });

  it('tracks source document when documentId exists', async () => {
    inboxResult = [makeInboxItem({ documentId: 42 })];
    versionsResult = [{ version: 1, content: 'old' }];
    sectionsResult = [{ template: 'prose' }];
    workspacesResult = [{ slug: 'services' }];

    const POST = await getHandler();
    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(200);
    const sourceInsert = insertedValues.find((v) => v._table === 'adminSectionSources');
    expect(sourceInsert).toBeDefined();
    expect(sourceInsert?.sectionId).toBe(20);
    expect(sourceInsert?.documentId).toBe(42);
  });

  it('does not track source when documentId is null', async () => {
    inboxResult = [makeInboxItem({ documentId: null })];
    versionsResult = [{ version: 1, content: 'old' }];
    sectionsResult = [{ template: 'prose' }];
    workspacesResult = [{ slug: 'services' }];

    const POST = await getHandler();
    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(200);
    const sourceInsert = insertedValues.find((v) => v._table === 'adminSectionSources');
    expect(sourceInsert).toBeUndefined();
  });

  it('sets inbox item status to "approved" when last suggestion is approved', async () => {
    inboxResult = [makeInboxItem({ routingResults: [makeSuggestion()] })]; // only 1 suggestion
    versionsResult = [{ version: 1, content: 'old' }];
    sectionsResult = [{ template: 'prose' }];
    workspacesResult = [{ slug: 'services' }];

    const POST = await getHandler();
    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(200);
    const inboxUpdate = updatedSets.find(
      (s) => (s as { _table?: string })._table === 'adminInboxItems'
    );
    expect(inboxUpdate).toBeDefined();
    expect(inboxUpdate?.status).toBe('approved');
    expect(inboxUpdate?.routingResults).toBeNull(); // no remaining suggestions
  });

  it('keeps status "routed" when more suggestions remain', async () => {
    const suggestions = [
      makeSuggestion({ sectionTitle: 'Overview' }),
      makeSuggestion({ sectionId: 30, sectionTitle: 'Details' }),
    ];
    inboxResult = [makeInboxItem({ routingResults: suggestions })];
    versionsResult = [{ version: 1, content: 'old' }];
    sectionsResult = [{ template: 'prose' }];
    workspacesResult = [{ slug: 'services' }];

    const POST = await getHandler();
    // Approve suggestion at index 0
    const res = await POST(makeRequest({ suggestionIndex: 0 }), makeParams());

    expect(res.status).toBe(200);
    const inboxUpdate = updatedSets.find(
      (s) => (s as { _table?: string })._table === 'adminInboxItems'
    );
    expect(inboxUpdate?.status).toBe('routed');
    // Remaining should only have the second suggestion
    const remaining = inboxUpdate?.routingResults as unknown[];
    expect(remaining).toHaveLength(1);
  });

  it('appends to existing approvedResults', async () => {
    const existingApproved = [
      {
        workspaceId: 5,
        workspaceTitle: 'Old',
        workspaceSlug: 'old',
        sectionId: 15,
        sectionTitle: 'Prev',
        versionId: 99,
        approvedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    inboxResult = [makeInboxItem({ approvedResults: existingApproved })];
    versionsResult = [{ version: 1, content: 'old' }];
    sectionsResult = [{ template: 'prose' }];
    workspacesResult = [{ slug: 'services' }];

    const POST = await getHandler();
    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(200);
    const inboxUpdate = updatedSets.find(
      (s) => (s as { _table?: string })._table === 'adminInboxItems'
    );
    const approved = inboxUpdate?.approvedResults as unknown[];
    expect(approved).toHaveLength(2);
    expect((approved[0] as { workspaceTitle: string }).workspaceTitle).toBe('Old');
    expect((approved[1] as { workspaceTitle: string }).workspaceTitle).toBe('Services');
  });

  it('returns version, titles, and approvedResult in response body', async () => {
    inboxResult = [makeInboxItem()];
    versionsResult = [{ version: 2, content: 'old' }];
    sectionsResult = [{ template: 'prose' }];
    workspacesResult = [{ slug: 'services' }];

    const POST = await getHandler();
    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.workspaceTitle).toBe('Services');
    expect(body.sectionTitle).toBe('Overview');
    expect(body.approvedResult).toBeDefined();
    expect(body.approvedResult.workspaceSlug).toBe('services');
    expect(body.approvedResult.sectionId).toBe(20);
  });

  it('updates section updatedAt timestamp', async () => {
    inboxResult = [makeInboxItem()];
    versionsResult = [{ version: 1, content: 'old' }];
    sectionsResult = [{ template: 'prose' }];
    workspacesResult = [{ slug: 'services' }];

    const POST = await getHandler();
    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(200);
    const sectionUpdate = updatedSets.find(
      (s) => (s as { _table?: string })._table === 'adminWorkspaceSections'
    );
    expect(sectionUpdate).toBeDefined();
    expect(sectionUpdate?.updatedAt).toBeInstanceOf(Date);
  });

  it('populates chunkIds from [chunk N] citations in suggestedContent', async () => {
    const suggestion = makeSuggestion({
      suggestedContent:
        'Revenue grew 15% [chunk 0]. Expansion planned [chunk 2]. Hiring underway [chunk 0].',
    });
    inboxResult = [makeInboxItem({ documentId: 42, routingResults: [suggestion] })];
    versionsResult = [{ version: 1, content: 'old' }];
    sectionsResult = [{ template: 'prose' }];
    workspacesResult = [{ slug: 'services' }];
    chunksResult = [
      { id: 101, chunkIndex: 0 },
      { id: 102, chunkIndex: 1 },
      { id: 103, chunkIndex: 2 },
    ];

    const POST = await getHandler();
    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(200);
    const sourceInsert = insertedValues.find((v) => v._table === 'adminSectionSources');
    expect(sourceInsert).toBeDefined();
    expect(sourceInsert?.chunkIds).toEqual([101, 103]); // chunk 0 → 101, chunk 2 → 103
  });

  it('includes chunkRefs from routing suggestion alongside citations', async () => {
    const suggestion = makeSuggestion({
      suggestedContent: 'Content from [chunk 1].',
      chunkRefs: [0, 1, 3],
    });
    inboxResult = [makeInboxItem({ documentId: 42, routingResults: [suggestion] })];
    versionsResult = [{ version: 1, content: 'old' }];
    sectionsResult = [{ template: 'prose' }];
    workspacesResult = [{ slug: 'services' }];
    chunksResult = [
      { id: 201, chunkIndex: 0 },
      { id: 202, chunkIndex: 1 },
      { id: 203, chunkIndex: 2 },
      { id: 204, chunkIndex: 3 },
    ];

    const POST = await getHandler();
    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(200);
    const sourceInsert = insertedValues.find((v) => v._table === 'adminSectionSources');
    // chunkRefs [0,1,3] + citations [1] = unique [0,1,3] → ids [201,202,204]
    expect(sourceInsert?.chunkIds).toEqual([201, 202, 204]);
  });

  it('sets chunkIds to null when no citations and no chunkRefs', async () => {
    inboxResult = [makeInboxItem({ documentId: 42 })]; // default suggestion has no citations
    versionsResult = [{ version: 1, content: 'old' }];
    sectionsResult = [{ template: 'prose' }];
    workspacesResult = [{ slug: 'services' }];

    const POST = await getHandler();
    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(200);
    const sourceInsert = insertedValues.find((v) => v._table === 'adminSectionSources');
    expect(sourceInsert?.chunkIds).toBeNull();
  });
});
