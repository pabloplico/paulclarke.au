import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { fakeEmbedding } from '../fake-ai';
import { createFakeOpenAI } from './server';

/**
 * The stub OpenAI server the admin E2E suite runs against, driven through
 * the app's real code: the real @ai-sdk/openai provider, the AI guard, and
 * the app's own prompts and output schemas. When an E2E test that needs AI
 * fails, this says whether the stub still answers the app correctly ("stub
 * is wrong") or not ("app is wrong").
 */

// loadConfig() reads settings from the database first; there is none here
vi.mock('@/lib/config.server', async () => {
  const { config } = await import('@/lib/config');
  return { loadConfig: async () => config };
});

const { server, unmatched } = createFakeOpenAI();
let app: {
  ai: typeof import('ai');
  models: typeof import('@/lib/ai/models');
  guard: typeof import('@/lib/ai/guard');
  ledger: typeof import('@/lib/ai/usage-logger');
  router: typeof import('@/lib/workspace-routing/router');
  chunks: typeof import('@/lib/document-processing/chunk-analysis');
  metadata: typeof import('@/lib/document-processing/metadata');
  embeddings: typeof import('@/lib/rag/embeddings');
  config: typeof import('@/lib/config');
};

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  // The E2E settings: priced models, so the guard records what the calls cost
  vi.stubEnv('AI_PROVIDER', 'openai');
  vi.stubEnv('AI_MODEL', 'gpt-4.1-mini');
  vi.stubEnv('OPENAI_API_KEY', 'stub-test-key');
  vi.stubEnv('OPENAI_BASE_URL', `http://127.0.0.1:${port}/v1`);
  // The provider and config read these when first imported
  vi.resetModules();
  app = {
    ai: await import('ai'),
    models: await import('@/lib/ai/models'),
    guard: await import('@/lib/ai/guard'),
    ledger: await import('@/lib/ai/usage-logger'),
    router: await import('@/lib/workspace-routing/router'),
    chunks: await import('@/lib/document-processing/chunk-analysis'),
    metadata: await import('@/lib/document-processing/metadata'),
    embeddings: await import('@/lib/rag/embeddings'),
    config: await import('@/lib/config'),
  };
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await new Promise((resolve) => server.close(resolve));
});

const WORKSPACE_MAP = [
  {
    workspaceId: 7,
    workspaceTitle: 'Research',
    workspaceDescription: null,
    sections: [
      {
        sectionId: 31,
        sectionTitle: 'Industry Trends',
        sectionDescription: null,
        template: 'prose',
        contentPreview: 'Trends so far.',
      },
      {
        sectionId: 32,
        sectionTitle: 'Sources',
        sectionDescription: null,
        template: 'table',
        contentPreview: '',
      },
    ],
  },
  {
    workspaceId: 8,
    workspaceTitle: 'Clients',
    workspaceDescription: null,
    sections: [
      {
        sectionId: 41,
        sectionTitle: 'Overview',
        sectionDescription: null,
        template: 'prose',
        contentPreview: '',
      },
    ],
  },
];

describe('fake OpenAI server', () => {
  it('routes material to the first section of the first workspace', async () => {
    const suggestions = await app.router.routeMaterial('A note', 'Some text.', WORKSPACE_MAP);

    // The section's id, paired with its own workspace (the router drops mismatched pairs)
    expect(suggestions).toMatchObject([
      { workspaceId: 7, sectionId: 31, sectionTitle: 'Industry Trends', action: 'append' },
    ]);
    expect(suggestions[0]?.suggestedContent).toContain('A note');
  });

  it('answers document processing in the app’s own schemas', async () => {
    const cfg = app.config.config;
    const batch = await app.chunks.analyzeChunksBatch(
      [
        { index: 0, content: 'First chunk.' },
        { index: 1, content: 'Second chunk.' },
      ],
      cfg
    );
    expect([...batch.keys()]).toEqual([0, 1]);

    const enriched = await app.metadata.extractEnrichedMetadata(
      [...batch].map(([chunkIndex, analysis]) => ({ chunkIndex, analysis })),
      '# Quarterly report\n\nText.',
      cfg
    );
    expect(enriched.suggestedTitle).toBe('Quarterly report');
  });

  it('gives deterministic embeddings', async () => {
    const embedding = await app.embeddings.generateEmbedding('hello world');

    expect(embedding).toEqual(fakeEmbedding('hello world'));
  });

  it('streams a chat answer', async () => {
    const result = app.ai.streamText({
      model: app.models.getModel(),
      system: 'You are a knowledgeable assistant for the "Test" workspace.',
      prompt: 'What is in it?',
    });

    expect(await result.text).toBe('Fake answer from the stub.');
  });

  it('revises the selected text and nothing else', async () => {
    const { text } = await app.ai.generateText({
      model: app.models.getModel(),
      prompt: [
        '## Full Section Content',
        '```markdown',
        'Intro.\n\nThe middle.\n\nOutro.',
        '```',
        '',
        '## Selected Text to Modify',
        '```',
        'The middle.',
        '```',
        '',
        'Return the complete updated section content with the selected text modified according to the action.',
      ].join('\n'),
    });

    expect(text).toBe('Intro.\n\nRevised: The middle.\n\nOutro.');
  });

  it('records the spend against the user who made the calls', async () => {
    const userId = 990_001;
    const before = app.ledger.spendLedger().spentToday(userId).user;

    await app.guard.withAiUser(userId, async () => {
      await app.router.routeMaterial('A note', 'Some text.', WORKSPACE_MAP);
      await app.embeddings.generateEmbedding('hello world');
    });

    expect(before).toBe(0);
    expect(app.ledger.spendLedger().spentToday(userId).user).toBeGreaterThan(0);
  });

  it('fails a request it doesn’t recognise, and records it', async () => {
    const before = unmatched.length;

    await expect(
      app.ai.generateText({
        model: app.models.getModel(),
        prompt: 'A prompt no rule knows.',
        maxRetries: 0,
      })
    ).rejects.toThrow(/fake-openai has no reply/);

    expect(unmatched.slice(before)).toMatchObject([
      { path: '/v1/responses', prompt: expect.stringContaining('A prompt no rule knows.') },
    ]);
  });
});
