import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScriptedReply } from '@/test/fake-ai';

/**
 * The three agent workers (research, ingestion, analysis). Written as
 * characterisation tests before they moved from BullMQ to the JobQueue seam
 * (docs/audit/queue-decoupling.md); the assertions marked MOVE recorded bugs
 * that the move fixed: spend now counts against the user who triggered the
 * run, a cancelled run stays cancelled, and start-up recovery fails runs a
 * restart cut off.
 *
 * Real: PGlite, the in-process queue, the Mastra agents and tools, the run
 * logger, the AI guard and spend ledger, and the cancel and trigger route
 * handlers. No Redis and no BullMQ.
 * Faked: the OpenAI provider package (scripted models from test/fake-ai.ts,
 * so every call still goes through the guard) and the signed-in user for the
 * two routes.
 */
process.env.DB_DRIVER = 'pglite';
delete process.env.PGLITE_DATA_DIR;
delete process.env.PGLITE_SNAPSHOT;
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
const { handleResearchJob, researchQueue } = await import('./research-queue');
const { handleIngestionJob } = await import('./ingestion-queue');
const { handleAnalysisJob } = await import('./analysis-queue');
const { startAgentQueues } = await import('./init');

beforeAll(async () => {
  await ensurePgliteReady();
  // For the tests that go through the trigger route and the queue
  startAgentQueues();
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

const handlers = {
  'mr-research': handleResearchJob,
  'mr-ingestion': handleIngestionJob,
  'mr-analysis': handleAnalysisJob,
};

/** Calls a worker's handler directly, as the queue would, so a test sees what it throws. */
function run(queue: keyof typeof handlers, data: unknown) {
  return handlers[queue]({
    id: `${queue}-test`,
    name: queue,
    data: data as never,
    attempt: 1,
    updateProgress: () => {},
    discard: () => {},
  });
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

    await run('mr-research', { taskId, userId });

    const [runRow] = await runsFor(taskId);
    expect(statusDuringCalls).toEqual(['started', 'started']);
    expect(runRow).toMatchObject({ status: 'completed', findingsCount: 1, errorLog: null });
    expect(runRow?.completedAt).toBeInstanceOf(Date);
    // Two model calls × 20 tokens from the scripted model
    expect(runRow?.tokensUsed).toBe(40);

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
    // The worker calls enterAiUser, so all of it (chat and embeddings) counts
    // against the user's daily cap. Before the move it counted against nobody
    expect(spent.user).toBeCloseTo(spent.total);
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

    await run('mr-ingestion', job);

    const [runRow] = await runsFor(taskId);
    expect(statusDuringCalls).toEqual(['started', 'started']);
    expect(runRow).toMatchObject({ status: 'completed', findingsCount: 1, tokensUsed: 40 });

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
    // Counted against the user (see the research worker test)
    expect(spent.user).toBeCloseTo(spent.total);
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

    await run('mr-analysis', { taskId, userId });

    const [runRow] = await runsFor(taskId);
    expect(statusDuringCalls).toEqual(['started']);
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
    // Counted against the user (see the research worker test)
    expect(spent.user).toBeCloseTo(spent.total);
  });

  it('completes without calling the model when the workspace has no findings', async () => {
    const { userId, taskId } = await given('analysis');

    await run('mr-analysis', { taskId, userId });

    const [runRow] = await runsFor(taskId);
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
    let modelCalls = 0;
    ai.replies = [{ toolCalls: [saveFinding] }, { text: 'Saved one finding.' }];
    ai.beforeReply = async (call) => {
      modelCalls = call;
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
    return { cancelStatus, statusAfterCancel, runRow, modelCalls };
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

  // Before the move the worker overwrote 'cancelled' with 'completed'
  it('keeps a cancelled run cancelled when the agent finishes', async () => {
    const { runRow } = await cancelDuringRun();
    expect(runRow?.status).toBe('cancelled');
  });

  it('stops the agent after the step in progress', async () => {
    const { runRow, modelCalls } = await cancelDuringRun();
    // The cancel lands during the first model call. That step's tool call
    // still runs and is logged, then the agent stops: no second call
    expect(modelCalls).toBe(1);
    expect(logOf(runRow?.log)).toEqual([
      info('Starting research agent (openai/gpt-4.1-mini)...'),
      { type: 'log', level: 'warn', message: 'Run cancelled by user' },
      { type: 'tool_call', toolName: 'saveFinding', status: 'success' },
      { type: 'log', level: 'warn', message: 'Agent stopped: the run was cancelled' },
    ]);
    expect(runRow?.findingsCount).toBe(0);
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

  // Before the move nothing finished a run a restart cut off, so the task was
  // refused for good
  it('accepts the task again once start-up recovery has run', async () => {
    const { taskId, trigger } = await givenInterruptedRun();
    const { recoverInterruptedJobs } = await import('@/lib/queue/recover');
    await recoverInterruptedJobs();

    const response = await trigger();
    expect(response.status).toBe(200);
    // The trigger queued a real run; let it finish before looking
    await researchQueue.drained();
    const [interrupted] = await db
      .select()
      .from(schema.adminAgentRuns)
      .where(
        and(eq(schema.adminAgentRuns.taskId, taskId), eq(schema.adminAgentRuns.status, 'started'))
      );
    expect(interrupted).toBeUndefined();
  });
});

describe('a research job through the in-process queue', () => {
  it('saves findings, completes the run and counts the spend against the user who triggered it', async () => {
    const { userId, taskId, workspaceId } = await given('research');
    ai.replies = [{ toolCalls: [saveFinding] }, { text: 'Saved one finding.' }];
    const { POST } = await import(
      '@/app/api/workspaces/[id]/research/agent-tasks/[taskId]/trigger/route'
    );

    const response = await POST(new Request('http://test/trigger', { method: 'POST' }), {
      params: Promise.resolve({ id: String(workspaceId), taskId: String(taskId) }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      taskId,
      jobId: expect.stringMatching(new RegExp(`^research-${taskId}-\\d+$`)),
    });
    await researchQueue.drained();

    const runs = await runsFor(taskId);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ status: 'completed', userId, findingsCount: 1 });
    const findings = await db
      .select()
      .from(schema.adminFindings)
      .where(eq(schema.adminFindings.agentRunId, runs[0]!.id));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.embedding).toHaveLength(1536);

    // Outside any request (getCurrentUser throws), so only the worker's
    // enterAiUser can attribute the spend
    const spent = spendLedger().spentToday(userId);
    expect(spent.total).toBeGreaterThan(0);
    expect(spent.user).toBeCloseTo(spent.total);
  });
});
