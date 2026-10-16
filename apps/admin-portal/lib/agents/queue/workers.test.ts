import { afterAll, beforeAll, beforeEach, describe, expect, it, test, vi } from 'vitest';
import type { ScriptedReply } from '@/test/fake-ai';

/**
 * Characterisation tests for the three agent workers (research, ingestion,
 * analysis): what they do today, recorded before they move from BullMQ to
 * the in-process JobQueue (docs/audit/queue-decoupling.md). The move must keep
 * these passing, apart from the assertions marked MOVE, which record today's
 * known bugs and say what they should become.
 *
 * Real: PGlite, the Mastra agents and tools, the run logger, the AI guard and
 * spend ledger, and the cancel and trigger route handlers.
 * Faked: the OpenAI provider package (scripted models from test/fake-ai.ts,
 * so every call still goes through the guard), BullMQ (only to capture each
 * worker's processor so the test can call it), the Redis connection BullMQ is
 * handed, and the signed-in user for the two routes.
 */
process.env.DB_DRIVER = 'pglite';
delete process.env.PGLITE_DATA_DIR;
delete process.env.PGLITE_SNAPSHOT;
process.env.QUEUE_DRIVER = 'memory';
process.env.AI_PROVIDER = 'openai';
process.env.AI_MODEL = 'gpt-4.1-mini';
process.env.OPENAI_API_KEY = 'sk-test';
delete process.env.DEMO_MODE;
delete process.env.AUTH_ENABLED;

const ai = vi.hoisted(() => ({
  replies: [] as ScriptedReply[],
  beforeReply: undefined as undefined | ((call: number) => Promise<void>),
}));

// The provider package both the Mastra agents (lib/agents/mastra/provider.ts)
// and the embeddings (lib/ai/providers.ts) build their models from. The app
// still wraps whatever comes back in the AI guard
vi.mock('@ai-sdk/openai', async () => {
  const { createFakeEmbeddingModel, createScriptedChatModel } = await import('@/test/fake-ai');
  const openai = Object.assign(
    (modelId: string) => createScriptedChatModel(ai.replies, modelId, ai.beforeReply),
    { embedding: (modelId: string) => createFakeEmbeddingModel(modelId) }
  );
  return { openai, createOpenAI: () => openai };
});

type Processor = (job: { data: unknown }) => Promise<unknown>;
const processors = vi.hoisted(() => new Map<string, Processor>());

// Just enough BullMQ to hand over each worker's processor
vi.mock('bullmq', () => ({
  Queue: class {
    async add(_name: string, _data: unknown, opts?: { jobId?: string }) {
      return { id: opts?.jobId ?? 'job' };
    }
    async getJobs() {
      return [];
    }
  },
  Worker: class {
    constructor(name: string, processor: Processor) {
      processors.set(name, processor);
    }
    on() {
      return this;
    }
  },
}));

// The connection the workers pass to BullMQ, which the fake above ignores
vi.mock('@/lib/redis', () => ({ getRedis: () => ({}), closeRedis: async () => {} }));

const signedIn = vi.hoisted(() => ({ user: { id: 0, email: '', name: '', role: 'member' } }));
vi.mock('@/lib/auth/server', () => ({
  requireAuthApi: async () => signedIn.user,
  // A worker runs outside any request. The real getCurrentUser then throws
  // (cookies() outside a request scope), and the guard counts the call
  // against nobody
  getCurrentUser: async () => {
    throw new Error('cookies() was called outside a request scope');
  },
}));

const { and, desc, eq } = await import('drizzle-orm');
const { db } = await import('@/lib/db');
const { ensurePgliteReady, getPglite } = await import('@/lib/db/pglite');
const schema = await import('@/lib/db/schema');
const { spendLedger } = await import('@/lib/ai/usage-logger');
const { startResearchWorker } = await import('./research-queue');
const { startIngestionWorker } = await import('./ingestion-queue');
const { startAnalysisWorker } = await import('./analysis-queue');

beforeAll(async () => {
  await ensurePgliteReady();
  startResearchWorker();
  startIngestionWorker();
  startAnalysisWorker();
}, 60_000);

afterAll(async () => {
  await getPglite().close();
});

beforeEach(() => {
  (globalThis as { _spendLedger?: unknown })._spendLedger = undefined;
  ai.replies = [{ text: 'Done.' }];
  ai.beforeReply = undefined;
});

let seq = 0;

/** A user, a workspace and an agent task of their own for each test. */
async function given(agentType: 'research' | 'ingestion' | 'analysis') {
  seq++;
  const [user] = await db
    .insert(schema.adminUsers)
    .values({ email: `agent-${seq}@example.com`, passwordHash: 'x', name: `Agent ${seq}` })
    .returning();
  const [workspace] = await db
    .insert(schema.adminWorkspaces)
    .values({ slug: `market-${seq}`, title: 'Cairns bakeries', userId: user!.id })
    .returning();
  const [task] = await db
    .insert(schema.adminAgentTasks)
    .values({ userId: user!.id, workspaceId: workspace!.id, agentType, name: `${agentType} task` })
    .returning();
  signedIn.user = { id: user!.id, email: user!.email, name: user!.name, role: 'member' };
  return { userId: user!.id, workspaceId: workspace!.id, taskId: task!.id };
}

function run(queue: 'mr-research' | 'mr-ingestion' | 'mr-analysis', data: unknown) {
  const processor = processors.get(queue);
  if (!processor) throw new Error(`no worker registered for ${queue}`);
  return processor({ data });
}

async function runsFor(taskId: number) {
  return db
    .select()
    .from(schema.adminAgentRuns)
    .where(eq(schema.adminAgentRuns.taskId, taskId))
    .orderBy(desc(schema.adminAgentRuns.id));
}

/** The run log without timestamps, tool inputs or outputs. */
function logOf(entries: unknown) {
  return (entries as Record<string, unknown>[]).map((entry) =>
    entry.type === 'tool_call'
      ? { type: entry.type, toolName: entry.toolName, status: entry.status }
      : { type: entry.type, level: entry.level, message: entry.message }
  );
}

const info = (message: string) => ({ type: 'log', level: 'info', message });

const saveFinding = {
  toolName: 'saveFinding',
  input: {
    title: 'Sourdough demand',
    content: 'Demand for sourdough in Cairns grew 12% in 2026.',
    findingType: 'statistic',
    confidenceScore: 0.8,
  },
};

/** Records the run's status at the start of every model call. */
function watchStatus(taskId: number) {
  const seen: string[] = [];
  ai.beforeReply = async () => {
    const [latest] = await runsFor(taskId);
    seen.push(latest?.status ?? 'none');
  };
  return seen;
}

describe('research worker', () => {
  it('runs the agent, saves and embeds its findings, and completes the run', async () => {
    const { userId, taskId, workspaceId } = await given('research');
    ai.replies = [{ toolCalls: [saveFinding] }, { text: 'Saved one finding.' }];
    const statusDuringCalls = watchStatus(taskId);

    const result = await run('mr-research', { taskId, userId });

    const [runRow] = await runsFor(taskId);
    expect(statusDuringCalls).toEqual(['started', 'started']);
    expect(runRow).toMatchObject({ status: 'completed', findingsCount: 1, errorLog: null });
    expect(runRow?.completedAt).toBeInstanceOf(Date);
    // Two model calls × 20 tokens from the scripted model
    expect(runRow?.tokensUsed).toBe(40);
    expect(result).toEqual({ runId: runRow?.id, findingsCount: 1 });

    const findings = await db
      .select()
      .from(schema.adminFindings)
      .where(eq(schema.adminFindings.agentRunId, runRow!.id));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ workspaceId, userId, findingType: 'statistic' });
    expect(findings[0]?.embedding).toHaveLength(1536);

    expect(logOf(runRow?.log)).toEqual([
      info('Starting research agent (openai/gpt-4.1-mini)...'),
      { type: 'tool_call', toolName: 'saveFinding', status: 'success' },
      info('Completed: 1 tool calls, 1 findings saved, 40 tokens used'),
      info('Agent response: Saved one finding.'),
      info('Embedding 1 new findings...'),
      info('Research complete. 1 findings saved.'),
    ]);

    const spent = spendLedger().spentToday(userId);
    expect(spent.total).toBeGreaterThan(0);
    // MOVE: today the worker never calls enterAiUser, so the spend (chat and
    // embeddings) counts against nobody and the user's daily cap never sees
    // it (queue-decoupling.md §2, "Attribution"). The move attributes it:
    // flip this to expect(spent.user).toBeCloseTo(spent.total)
    expect(spent.user).toBe(0);
  });

  it('fails the run and logs the error when the model call fails', async () => {
    const { userId, taskId } = await given('research');
    ai.replies = [{ error: new Error('provider unavailable') }];

    await expect(run('mr-research', { taskId, userId })).rejects.toThrow('provider unavailable');

    const [runRow] = await runsFor(taskId);
    expect(runRow).toMatchObject({ status: 'failed', findingsCount: 0 });
    expect(runRow?.completedAt).toBeInstanceOf(Date);
    expect(runRow?.errorLog).toContain('provider unavailable');
    expect(logOf(runRow?.log)).toEqual([
      info('Starting research agent (openai/gpt-4.1-mini)...'),
      { type: 'log', level: 'error', message: expect.stringContaining('Research failed:') },
    ]);
  });
});

describe('ingestion worker', () => {
  it('runs the agent, saves and embeds its findings, and completes the run', async () => {
    const { userId, taskId, workspaceId } = await given('ingestion');
    ai.replies = [{ toolCalls: [saveFinding] }, { text: 'Extracted one finding.' }];
    const statusDuringCalls = watchStatus(taskId);
    const job = { taskId, userId, filePath: '/uploads/prices.csv', fileType: 'csv', workspaceId };

    const result = await run('mr-ingestion', job);

    const [runRow] = await runsFor(taskId);
    expect(statusDuringCalls).toEqual(['started', 'started']);
    expect(runRow).toMatchObject({ status: 'completed', findingsCount: 1, tokensUsed: 40 });
    expect(result).toEqual({ runId: runRow?.id, findingsCount: 1 });

    const findings = await db
      .select()
      .from(schema.adminFindings)
      .where(eq(schema.adminFindings.agentRunId, runRow!.id));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.embedding).toHaveLength(1536);

    // No "complete" line at the end, unlike the research worker
    expect(logOf(runRow?.log)).toEqual([
      info('Ingesting CSV file: /uploads/prices.csv'),
      { type: 'tool_call', toolName: 'saveFinding', status: 'success' },
      info('Completed: 1 tool calls, 1 findings extracted, 40 tokens'),
      info('Agent response: Extracted one finding.'),
    ]);

    const spent = spendLedger().spentToday(userId);
    expect(spent.total).toBeGreaterThan(0);
    // MOVE: unattributed today (see the research worker test); the move
    // flips this to expect(spent.user).toBeCloseTo(spent.total)
    expect(spent.user).toBe(0);
  });

  it('fails the run when the model call fails, without a log entry for it', async () => {
    const { userId, taskId, workspaceId } = await given('ingestion');
    ai.replies = [{ error: new Error('provider unavailable') }];
    const job = { taskId, userId, filePath: '/uploads/prices.csv', fileType: 'csv', workspaceId };

    await expect(run('mr-ingestion', job)).rejects.toThrow('provider unavailable');

    const [runRow] = await runsFor(taskId);
    expect(runRow).toMatchObject({ status: 'failed' });
    expect(runRow?.errorLog).toContain('provider unavailable');
    // Today the failure is only in errorLog: the log itself stops short
    expect(logOf(runRow?.log)).toEqual([info('Ingesting CSV file: /uploads/prices.csv')]);
  });
});

describe('analysis worker', () => {
  async function withFindingAndSection(workspaceId: number, userId: number) {
    const [finding] = await db
      .insert(schema.adminFindings)
      .values({
        userId,
        workspaceId,
        title: 'Sourdough demand',
        content: 'Demand for sourdough in Cairns grew 12% in 2026.',
        contentHash: `hash-${workspaceId}`,
        findingType: 'statistic',
      })
      .returning();
    const [section] = await db
      .insert(schema.adminWorkspaceSections)
      .values({ workspaceId, slug: 'executive-summary', title: 'Executive Summary' })
      .returning();
    return { findingId: finding!.id, sectionId: section!.id };
  }

  it('writes the analysis into the matching section, with its citations', async () => {
    const { userId, taskId, workspaceId } = await given('analysis');
    const { findingId, sectionId } = await withFindingAndSection(workspaceId, userId);
    ai.replies = [{ text: '## Executive Summary\nSourdough demand grew 12% [1].' }];
    const statusDuringCalls = watchStatus(taskId);

    const result = await run('mr-analysis', { taskId, userId });

    const [runRow] = await runsFor(taskId);
    expect(statusDuringCalls).toEqual(['started']);
    expect(result).toEqual({ sectionsWritten: 1 });
    // findingsCount isn't set by this worker; tokensUsed is (one call × 20)
    expect(runRow).toMatchObject({ status: 'completed', findingsCount: 0, tokensUsed: 20 });

    const versions = await db
      .select()
      .from(schema.adminSectionVersions)
      .where(eq(schema.adminSectionVersions.sectionId, sectionId));
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      version: 1,
      // The [1] marker is stripped, leaving the space before the full stop
      content: 'Sourdough demand grew 12% .',
      structuredData: { findingRefs: [findingId] },
      changeSource: 'ai_research',
      changeDescription: `AI research analysis (run #${runRow?.id})`,
    });

    expect(logOf(runRow?.log)).toEqual([
      info('Loading workspace structure and findings...'),
      info('Analyzing 1 findings across 1 sections...'),
      info('Parsed 1 sections from analysis output'),
      info('Updated "Executive Summary" (v1)'),
      info('Analysis complete. 1 sections updated, 20 tokens used'),
    ]);

    const spent = spendLedger().spentToday(userId);
    expect(spent.total).toBeGreaterThan(0);
    // MOVE: unattributed today (see the research worker test); the move
    // flips this to expect(spent.user).toBeCloseTo(spent.total)
    expect(spent.user).toBe(0);
  });

  it('completes without calling the model when the workspace has no findings', async () => {
    const { userId, taskId } = await given('analysis');

    const result = await run('mr-analysis', { taskId, userId });

    const [runRow] = await runsFor(taskId);
    expect(result).toEqual({ sectionsWritten: 0 });
    expect(runRow).toMatchObject({ status: 'completed', findingsCount: 0 });
    expect(logOf(runRow?.log)).toEqual([
      info('Loading workspace structure and findings...'),
      info('No findings available for analysis. Skipping.'),
    ]);
    expect(spendLedger().spentToday().total).toBe(0);
  });

  it('fails the run when the model call fails, without a log entry for it', async () => {
    const { userId, taskId, workspaceId } = await given('analysis');
    await withFindingAndSection(workspaceId, userId);
    ai.replies = [{ error: new Error('provider unavailable') }];

    await expect(run('mr-analysis', { taskId, userId })).rejects.toThrow('provider unavailable');

    const [runRow] = await runsFor(taskId);
    expect(runRow).toMatchObject({ status: 'failed' });
    expect(runRow?.errorLog).toContain('provider unavailable');
    // Today the failure is only in errorLog: the log itself stops short
    expect(logOf(runRow?.log)).toEqual([
      info('Loading workspace structure and findings...'),
      info('Analyzing 1 findings across 1 sections...'),
    ]);
  });
});

describe('cancelling a run', () => {
  const cancelRoute = () =>
    import('@/app/api/workspaces/[id]/research/agent-runs/[runId]/cancel/route');

  /** Starts a research run that the user cancels while the agent is working. */
  async function cancelDuringRun() {
    const { userId, taskId, workspaceId } = await given('research');
    let cancelStatus = 0;
    let statusAfterCancel = '';
    ai.replies = [{ toolCalls: [saveFinding] }, { text: 'Saved one finding.' }];
    ai.beforeReply = async (call) => {
      if (call !== 1) return;
      const [runRow] = await runsFor(taskId);
      const { POST } = await cancelRoute();
      const response = await POST(new Request('http://test/cancel', { method: 'POST' }), {
        params: Promise.resolve({ id: String(workspaceId), runId: String(runRow!.id) }),
      });
      cancelStatus = response.status;
      statusAfterCancel = (await runsFor(taskId))[0]?.status ?? '';
    };
    await run('mr-research', { taskId, userId });
    const [runRow] = await runsFor(taskId);
    return { cancelStatus, statusAfterCancel, runRow };
  }

  it('marks the run cancelled and logs it', async () => {
    const { cancelStatus, statusAfterCancel, runRow } = await cancelDuringRun();
    expect(cancelStatus).toBe(200);
    expect(statusAfterCancel).toBe('cancelled');
    expect(logOf(runRow?.log)).toContainEqual({
      type: 'log',
      level: 'warn',
      message: 'Run cancelled by user',
    });
  });

  // MOVE: a known bug, recorded with test.fails so it shows up as passing
  // while the bug is there. The agent keeps working after a cancel, and the
  // worker then overwrites 'cancelled' with 'completed' (queue-decoupling.md
  // §2, "Cancel"). When the move fixes it, this starts failing: change
  // test.fails to it.
  test.fails('keeps a cancelled run cancelled when the agent finishes', async () => {
    const { runRow } = await cancelDuringRun();
    expect(runRow?.status).toBe('cancelled');
  });
});

describe('triggering a task with a run still marked started', () => {
  const triggerRoute = () =>
    import('@/app/api/workspaces/[id]/research/agent-tasks/[taskId]/trigger/route');

  /** A research task whose last run was left 'started' two hours ago (a restart, say). */
  async function givenInterruptedRun() {
    const { userId, taskId, workspaceId } = await given('research');
    await db.insert(schema.adminAgentRuns).values({
      taskId,
      userId,
      status: 'started',
      startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    });
    const trigger = async () => {
      const { POST } = await triggerRoute();
      return POST(new Request('http://test/trigger', { method: 'POST' }), {
        params: Promise.resolve({ id: String(workspaceId), taskId: String(taskId) }),
      });
    };
    return { taskId, trigger };
  }

  it('refuses with 429 while that run is marked started', async () => {
    const { trigger } = await givenInterruptedRun();
    const response = await trigger();
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: 'A run is already in progress for this task' });
  });

  // MOVE: a known bug, recorded with test.fails. Nothing ever finishes a run
  // that a restart interrupted, so the task is refused for good. The move
  // adds start-up recovery for agent runs (queue-decoupling.md §2, "Restart
  // recovery"); once recoverInterruptedJobs() covers them, this passes:
  // change test.fails to it.
  test.fails('accepts the task again once start-up recovery has run', async () => {
    const { taskId, trigger } = await givenInterruptedRun();
    const { recoverInterruptedJobs } = await import('@/lib/queue/recover');
    await recoverInterruptedJobs();

    const response = await trigger();
    expect(response.status).toBe(200);
    const [interrupted] = await db
      .select()
      .from(schema.adminAgentRuns)
      .where(
        and(eq(schema.adminAgentRuns.taskId, taskId), eq(schema.adminAgentRuns.status, 'started'))
      );
    expect(interrupted).toBeUndefined();
  });
});
