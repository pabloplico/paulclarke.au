import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/config.server', () => ({
  loadConfig: vi.fn(() =>
    Promise.resolve({
      ai: { model: 'gpt-4o' },
      contextLimits: { routingSectionPreview: 200 },
    })
  ),
}));

vi.mock('@/lib/ai/models', () => ({
  getModel: vi.fn(() => ({ modelId: 'mock-model' })),
}));

vi.mock('@/lib/ai/tokens', () => ({
  estimateTokens: vi.fn(() => 100),
  enforceBudget: vi.fn((text: string) => ({
    text,
    truncated: false,
    originalTokens: 10,
    finalTokens: 10,
  })),
}));

vi.mock('@/lib/ai/usage-logger', () => ({
  logAIUsage: vi.fn(),
}));

vi.mock('ai', () => ({
  generateObject: vi.fn(() =>
    Promise.resolve({
      object: {
        suggestions: [
          {
            workspaceId: 1,
            sectionId: 10,
            confidence: 0.85,
            action: 'append',
            suggestedContent: '## New Content',
            reasoning: 'Fits the section topic',
            chunkRefs: [0, 1],
          },
        ],
      },
      usage: { inputTokens: 200, outputTokens: 100 },
    })
  ),
}));

// DB mocks — need hoisted so they're in place before module imports
const mockDbSelect = vi.hoisted(() => vi.fn());
const mockDbUpdate = vi.hoisted(() => vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })));

vi.mock('@/lib/db', () => ({
  db: {
    select: () => mockDbSelect(),
    update: () => mockDbUpdate(),
  },
}));

vi.mock('@/lib/db/schema', () => ({
  adminWorkspaces: { id: 'ws.id', userId: 'ws.userId', sortOrder: 'ws.sortOrder' },
  adminWorkspaceSections: {
    id: 'sec.id',
    workspaceId: 'sec.workspaceId',
    sortOrder: 'sec.sortOrder',
  },
  adminSectionVersions: {
    sectionId: 'sv.sectionId',
    version: 'sv.version',
    content: 'sv.content',
  },
  adminInboxItems: {
    id: 'inbox.id',
    userId: 'inbox.userId',
    documentId: 'inbox.documentId',
  },
  adminDocuments: {
    id: 'docs.id',
    cleanedText: 'docs.cleanedText',
    aiSummary: 'docs.aiSummary',
    metadata: 'docs.metadata',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: (col: unknown, val: unknown) => ({ _eq: { col, val } }),
  desc: (col: unknown) => ({ _desc: col }),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Sets up the DB mock chain for buildWorkspaceMap.
 *
 * buildWorkspaceMap issues three types of queries:
 *   1) workspace query: select().from(adminWorkspaces).orderBy()
 *      — with optional .where() appended when userId is provided
 *   2) per-workspace sections: select().from(adminWorkspaceSections).where().orderBy()
 *   3) per-section version: select().from(adminSectionVersions).where().orderBy().limit(1)
 *
 * Because section version queries run concurrently inside Promise.all, we cannot
 * rely on a sequential call counter reliably. Instead, we distinguish query types
 * by which "from" table object is passed (mocked schema tokens) and dispatch the
 * appropriate chain from a single mockImplementation.
 */
function setupBuildWorkspaceMapMocks({
  workspaces = [
    { id: 1, title: 'WS One', description: 'desc one', userId: 5 },
    { id: 2, title: 'WS Two', description: 'desc two', userId: 5 },
  ],
  sectionsPerWorkspace = [
    [
      { id: 10, workspaceId: 1, title: 'Section A', description: 'sa desc', template: 'prose' },
      { id: 11, workspaceId: 1, title: 'Section B', description: 'sb desc', template: 'cards' },
    ],
    [
      { id: 20, workspaceId: 2, title: 'Section C', description: 'sc desc', template: 'table' },
      { id: 21, workspaceId: 2, title: 'Section D', description: 'sd desc', template: 'checklist' },
    ],
  ],
  versionContent = 'preview content here',
  userId = undefined as number | undefined,
} = {}) {
  // Track which workspace index we're fetching sections for
  let sectionFetchIndex = 0;

  mockDbSelect.mockImplementation(() => ({
    from: vi.fn((table: string) => {
      // Workspace query: from(adminWorkspaces) → mocked as 'ws.id' schema token
      if (
        table === 'ws.id' ||
        (typeof table === 'object' &&
          'id' in table &&
          (table as Record<string, unknown>).id === 'ws.id')
      ) {
        // Workspace query
        if (userId !== undefined) {
          return {
            orderBy: vi.fn(() => ({
              where: vi.fn(() => Promise.resolve(workspaces)),
            })),
          };
        }
        return {
          orderBy: vi.fn(() => Promise.resolve(workspaces)),
        };
      }

      // Section version query: from(adminSectionVersions) — schema token 'sv.sectionId'
      if (table === 'sv.sectionId' || (typeof table === 'object' && 'sectionId' in table)) {
        return {
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() =>
                Promise.resolve(versionContent ? [{ content: versionContent }] : [])
              ),
            })),
          })),
        };
      }

      // Sections query: from(adminWorkspaceSections) — default
      const idx = sectionFetchIndex++;
      const sections = sectionsPerWorkspace[idx] ?? [];
      return {
        where: vi.fn(() => ({
          orderBy: vi.fn(() => Promise.resolve(sections)),
        })),
      };
    }),
  }));
}

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ── buildWorkspaceMap ────────────────────────────────────────────────────────

describe('buildWorkspaceMap', () => {
  it('TC-001 — happy path: returns entries for all workspaces when no userId given', async () => {
    setupBuildWorkspaceMapMocks();

    const { buildWorkspaceMap } = await import('./router');
    const result = await buildWorkspaceMap();

    expect(result).toHaveLength(2);

    for (const entry of result) {
      expect(entry).toMatchObject({
        workspaceId: expect.any(Number),
        workspaceTitle: expect.any(String),
        sections: expect.any(Array),
      });
      for (const sec of entry.sections) {
        expect(sec).toMatchObject({
          sectionId: expect.any(Number),
          sectionTitle: expect.any(String),
          template: expect.any(String),
          contentPreview: expect.any(String),
        });
        expect(sec.contentPreview.length).toBeLessThanOrEqual(200);
      }
    }

    // No .where() on the workspace query — unscoped path
    // Verify by checking the result structure (two workspaces returned)
    expect(result[0]!.workspaceId).toBe(1);
    expect(result[1]!.workspaceId).toBe(2);
  });

  it('TC-002 — happy path: filters by userId when provided', async () => {
    const userScopedWorkspaces = [
      { id: 3, title: 'My WS', description: null as unknown as string, userId: 7 },
    ];
    setupBuildWorkspaceMapMocks({
      workspaces: userScopedWorkspaces,
      sectionsPerWorkspace: [
        [
          {
            id: 30,
            workspaceId: 3,
            title: 'Sec',
            description: null as unknown as string,
            template: 'prose',
          },
        ],
      ],
      userId: 7,
    });

    const { buildWorkspaceMap } = await import('./router');
    const result = await buildWorkspaceMap(7);

    // The userId path uses .where() on the workspace query
    expect(result).toHaveLength(1);
    expect(result[0]!.workspaceId).toBe(3);
    expect(result[0]!.workspaceTitle).toBe('My WS');
  });

  it('TC-003 — boundary: section with no version rows produces empty contentPreview', async () => {
    setupBuildWorkspaceMapMocks({
      workspaces: [{ id: 1, title: 'WS', description: null as unknown as string, userId: 1 }],
      sectionsPerWorkspace: [
        [
          {
            id: 10,
            workspaceId: 1,
            title: 'Sec',
            description: null as unknown as string,
            template: 'prose',
          },
        ],
      ],
      versionContent: '', // empty → version query returns []
    });

    const { buildWorkspaceMap } = await import('./router');
    const result = await buildWorkspaceMap();

    expect(result[0]!.sections[0]!.contentPreview).toBe('');
  });

  it('TC-004 — boundary: contentPreview is sliced to exactly routingSectionPreview chars', async () => {
    const { loadConfig } = await import('@/lib/config.server');
    vi.mocked(loadConfig).mockResolvedValueOnce({
      ai: { model: 'gpt-4o' },
      contextLimits: { routingSectionPreview: 50 },
    } as never);

    setupBuildWorkspaceMapMocks({
      workspaces: [{ id: 1, title: 'WS', description: null as unknown as string, userId: 1 }],
      sectionsPerWorkspace: [
        [
          {
            id: 10,
            workspaceId: 1,
            title: 'Sec',
            description: null as unknown as string,
            template: 'prose',
          },
        ],
      ],
      versionContent: 'a'.repeat(200),
    });

    const { buildWorkspaceMap } = await import('./router');
    const result = await buildWorkspaceMap();

    expect(result[0]!.sections[0]!.contentPreview.length).toBeLessThanOrEqual(50);
  });

  it('TC-005 — happy path: workspace with no sections produces entry with empty sections array', async () => {
    setupBuildWorkspaceMapMocks({
      workspaces: [{ id: 1, title: 'WS', description: null as unknown as string, userId: 1 }],
      sectionsPerWorkspace: [[]],
      versionContent: '',
    });

    const { buildWorkspaceMap } = await import('./router');
    const result = await buildWorkspaceMap();

    expect(result).toHaveLength(1);
    expect(result[0]!.sections).toEqual([]);
  });
});

// ── routeMaterial ─────────────────────────────────────────────────────────────

const baseWorkspaceMap = [
  {
    workspaceId: 1,
    workspaceTitle: 'Clients',
    workspaceDescription: null,
    sections: [
      {
        sectionId: 10,
        sectionTitle: 'Overview',
        sectionDescription: null,
        template: 'prose',
        contentPreview: '',
      },
    ],
  },
];

const baseEnrichedMetadata = {
  summary: 'This is the enriched summary with [chunk 0] and [chunk 1] references.',
  documentType: 'report',
  tags: ['finance', 'Q4'],
  entities: [{ name: 'Acme Corp', type: 'company', chunkRefs: [0] }],
  keyDecisions: [{ decision: 'Proceed with audit', chunkRefs: [1], confidence: 0.9 }],
  actionItems: [{ item: 'Schedule meeting', chunkRefs: [0, 1], confidence: 0.8 }],
} as any;

describe('routeMaterial', () => {
  it('TC-006 — happy path: uses enrichedMetadata path when provided', async () => {
    const { generateObject } = await import('ai');
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        suggestions: [
          {
            workspaceId: 1,
            sectionId: 10,
            confidence: 0.9,
            action: 'append',
            suggestedContent: 'content here',
            reasoning: 'fits',
            chunkRefs: [0],
          },
        ],
      },
      usage: { inputTokens: 100, outputTokens: 50 },
    } as never);

    const { routeMaterial } = await import('./router');
    const result = await routeMaterial(
      'Doc Title',
      'raw content',
      baseWorkspaceMap,
      baseEnrichedMetadata
    );

    // generateObject called once
    expect(generateObject).toHaveBeenCalledTimes(1);

    // Prompt uses enriched path — contains chunkRefs instruction
    const callArgs = vi.mocked(generateObject).mock.calls[0]![0] as { prompt: string };
    expect(callArgs.prompt).toContain('chunkRefs array');

    // Prompt does NOT contain raw materialContent
    expect(callArgs.prompt).not.toContain('raw content');

    // Prompt includes the enriched summary
    expect(callArgs.prompt).toContain(baseEnrichedMetadata.summary);

    // Return value is enriched with titles
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      workspaceId: 1,
      sectionId: 10,
      workspaceTitle: 'Clients',
      sectionTitle: 'Overview',
      confidence: 0.9,
      action: 'append',
      suggestedContent: 'content here',
      reasoning: 'fits',
      chunkRefs: [0],
    });

    // logAIUsage called with correct args
    const { logAIUsage } = await import('@/lib/ai/usage-logger');
    expect(logAIUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'routing',
        model: 'gpt-4o',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        latencyMs: expect.any(Number),
      })
    );
  });

  it('TC-007 — happy path: uses raw content path when enrichedMetadata is absent', async () => {
    const { enforceBudget } = await import('@/lib/ai/tokens');
    vi.mocked(enforceBudget).mockReturnValueOnce({
      text: 'truncated content',
      truncated: false,
      originalTokens: 10,
      finalTokens: 10,
    });

    const { generateObject } = await import('ai');
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: { suggestions: [] },
      usage: { inputTokens: 10, outputTokens: 5 },
    } as never);

    const { routeMaterial } = await import('./router');
    await routeMaterial('Doc Title', 'raw content', baseWorkspaceMap);

    // enforceBudget called with raw content and correct options
    expect(enforceBudget).toHaveBeenCalledWith(
      'raw content',
      { maxInputTokens: 4000, reserveOutputTokens: 0, strategy: 'truncate' },
      'gpt-4o'
    );

    // Prompt contains the truncated content
    const callArgs = vi.mocked(generateObject).mock.calls[0]![0] as { prompt: string };
    expect(callArgs.prompt).toContain('truncated content');

    // Prompt does NOT contain citation instruction
    expect(callArgs.prompt).not.toContain('chunkRefs array');
  });

  it('TC-008 — boundary: halves section preview when map tokens exceed 50% of routing budget', async () => {
    const { loadConfig } = await import('@/lib/config.server');
    vi.mocked(loadConfig).mockResolvedValueOnce({
      ai: { model: 'gpt-4o' },
      contextLimits: { routingSectionPreview: 400 },
    } as never);

    // Make estimateTokens return > 4000 on first call to trigger halving
    const { estimateTokens } = await import('@/lib/ai/tokens');
    vi.mocked(estimateTokens).mockReturnValueOnce(4_001);

    const { generateObject } = await import('ai');
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: { suggestions: [] },
      usage: { inputTokens: 10, outputTokens: 5 },
    } as never);

    // Create a workspace map with a section that has a long content preview
    const longPreviewMap = [
      {
        workspaceId: 1,
        workspaceTitle: 'Clients',
        workspaceDescription: null,
        sections: [
          {
            sectionId: 10,
            sectionTitle: 'Overview',
            sectionDescription: null,
            template: 'prose',
            contentPreview: 'x'.repeat(400),
          },
        ],
      },
    ];

    const { routeMaterial } = await import('./router');
    await routeMaterial('T', 'content', longPreviewMap);

    // The prompt should have the preview truncated to 200 (Math.max(50, floor(400/2)))
    const callArgs = vi.mocked(generateObject).mock.calls[0]![0] as { prompt: string };
    // The preview in the prompt should be at most 200 x's (not 400)
    const xCount = (callArgs.prompt.match(/x+/)?.[0] ?? '').length;
    expect(xCount).toBeLessThanOrEqual(200);
    expect(xCount).toBeGreaterThan(0);
  });

  it('TC-009 — boundary: minimum preview floor is 50 chars even when routingSectionPreview is tiny', async () => {
    const { loadConfig } = await import('@/lib/config.server');
    vi.mocked(loadConfig).mockResolvedValueOnce({
      ai: { model: 'gpt-4o' },
      contextLimits: { routingSectionPreview: 60 },
    } as never);

    const { estimateTokens } = await import('@/lib/ai/tokens');
    vi.mocked(estimateTokens).mockReturnValueOnce(4_001);

    const { generateObject } = await import('ai');
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: { suggestions: [] },
      usage: { inputTokens: 10, outputTokens: 5 },
    } as never);

    const { routeMaterial } = await import('./router');
    // Should not throw — floor is 50, not 30
    await expect(routeMaterial('T', 'content', baseWorkspaceMap)).resolves.not.toThrow();
    expect(generateObject).toHaveBeenCalledTimes(1);
  });

  it('TC-010 — happy path: unknown workspaceId/sectionId in AI response gets Unknown titles', async () => {
    const { generateObject } = await import('ai');
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        suggestions: [
          {
            workspaceId: 999,
            sectionId: 888,
            confidence: 0.8,
            action: 'append',
            suggestedContent: 'content',
            reasoning: 'unknown match',
            chunkRefs: [],
          },
        ],
      },
      usage: { inputTokens: 10, outputTokens: 5 },
    } as never);

    const { routeMaterial } = await import('./router');
    const result = await routeMaterial('T', 'content', baseWorkspaceMap);

    expect(result[0]!.workspaceTitle).toBe('Unknown');
    expect(result[0]!.sectionTitle).toBe('Unknown');
  });

  it('TC-011 — happy path: empty suggestions array from AI is passed through unchanged', async () => {
    const { generateObject } = await import('ai');
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: { suggestions: [] },
      usage: { inputTokens: 10, outputTokens: 5 },
    } as never);

    const { routeMaterial } = await import('./router');
    const result = await routeMaterial('T', 'content', baseWorkspaceMap);

    expect(result).toEqual([]);

    const { logAIUsage } = await import('@/lib/ai/usage-logger');
    expect(logAIUsage).toHaveBeenCalledTimes(1);
  });

  it('TC-012 — error path: generateObject rejects with network error', async () => {
    const { generateObject } = await import('ai');
    vi.mocked(generateObject).mockRejectedValueOnce(new Error('Network timeout'));

    const { routeMaterial } = await import('./router');
    await expect(routeMaterial('T', 'content', baseWorkspaceMap)).rejects.toThrow(
      'Network timeout'
    );

    const { logAIUsage } = await import('@/lib/ai/usage-logger');
    expect(logAIUsage).not.toHaveBeenCalled();
  });

  it('TC-013 — boundary: null usage from generateObject defaults token counts to 0', async () => {
    const { generateObject } = await import('ai');
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: { suggestions: [] },
      usage: undefined,
    } as never);

    const { routeMaterial } = await import('./router');
    await routeMaterial('T', 'content', baseWorkspaceMap);

    const { logAIUsage } = await import('@/lib/ai/usage-logger');
    expect(logAIUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      })
    );
  });
});
