import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logAIUsage, PipelineTokenTracker } from './usage-logger';

// Helper to extract and parse JSON from a console.log spy call
function parseLogCall(spy: ReturnType<typeof vi.spyOn>, callIndex: number) {
  const call = spy.mock.calls[callIndex];
  if (!call) throw new Error(`No log call at index ${callIndex}`);
  const [, jsonStr] = call;
  return JSON.parse(jsonStr as string);
}

describe('logAIUsage', () => {
  it('writes structured JSON to stdout', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logAIUsage({
      stage: 'test',
      model: 'gpt-4o',
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      latencyMs: 500,
    });
    expect(spy).toHaveBeenCalledOnce();
    const [prefix, json] = spy.mock.calls[0]!;
    expect(prefix).toBe('[ai-usage]');
    const parsed = JSON.parse(json as string);
    expect(parsed.stage).toBe('test');
    expect(parsed.inputTokens).toBe(100);
    expect(parsed.timestamp).toBeDefined();
    spy.mockRestore();
  });

  // ── GAP-017-A: Required field completeness ────────────────────────────────

  it('TC-017-A1: all required fields present in logged JSON', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logAIUsage({
      stage: 's',
      model: 'gpt-4o',
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      latencyMs: 250,
    });
    const parsed = parseLogCall(spy, 0);
    expect(parsed.stage).toBe('s');
    expect(parsed.model).toBe('gpt-4o');
    expect(parsed.inputTokens).toBe(100);
    expect(parsed.outputTokens).toBe(50);
    expect(parsed.totalTokens).toBe(150);
    expect(parsed.latencyMs).toBe(250);
    expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    spy.mockRestore();
  });

  it('TC-017-A2: optional documentId appears in log when set', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logAIUsage({
      stage: 's',
      model: 'm',
      inputTokens: 1,
      outputTokens: 1,
      totalTokens: 2,
      latencyMs: 10,
      documentId: 42,
    });
    const parsed = parseLogCall(spy, 0);
    expect(parsed.documentId).toBe(42);
    spy.mockRestore();
  });

  it('TC-017-A3: optional userId appears in log when set', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logAIUsage({
      stage: 's',
      model: 'm',
      inputTokens: 1,
      outputTokens: 1,
      totalTokens: 2,
      latencyMs: 10,
      userId: 7,
    });
    const parsed = parseLogCall(spy, 0);
    expect(parsed.userId).toBe(7);
    spy.mockRestore();
  });

  it('TC-017-A4: optional truncated: true appears in log', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logAIUsage({
      stage: 's',
      model: 'm',
      inputTokens: 1,
      outputTokens: 1,
      totalTokens: 2,
      latencyMs: 10,
      truncated: true,
    });
    const parsed = parseLogCall(spy, 0);
    expect(parsed.truncated).toBe(true);
    spy.mockRestore();
  });

  it('TC-017-A5: optional droppedChunks appears in log when set', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logAIUsage({
      stage: 's',
      model: 'm',
      inputTokens: 1,
      outputTokens: 1,
      totalTokens: 2,
      latencyMs: 10,
      droppedChunks: 3,
    });
    const parsed = parseLogCall(spy, 0);
    expect(parsed.droppedChunks).toBe(3);
    spy.mockRestore();
  });

  it('TC-017-A6: optional fields absent when not provided', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logAIUsage({
      stage: 's',
      model: 'm',
      inputTokens: 1,
      outputTokens: 1,
      totalTokens: 2,
      latencyMs: 10,
    });
    const parsed = parseLogCall(spy, 0);
    expect('documentId' in parsed).toBe(false);
    expect('userId' in parsed).toBe(false);
    expect('truncated' in parsed).toBe(false);
    expect('droppedChunks' in parsed).toBe(false);
    spy.mockRestore();
  });

  it('TC-017-A7: timestamp is a valid ISO string close to Date.now()', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const before = Date.now();
    logAIUsage({
      stage: 's',
      model: 'm',
      inputTokens: 1,
      outputTokens: 1,
      totalTokens: 2,
      latencyMs: 10,
    });
    const after = Date.now();
    const parsed = parseLogCall(spy, 0);
    const ts = new Date(parsed.timestamp).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
    spy.mockRestore();
  });
});

describe('PipelineTokenTracker', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('accumulates entries', () => {
    const tracker = new PipelineTokenTracker();

    tracker.record({
      stage: 'chunk-analysis',
      model: 'gpt-4o',
      inputTokens: 1000,
      outputTokens: 200,
      totalTokens: 1200,
      latencyMs: 500,
    });
    tracker.record({
      stage: 'metadata',
      model: 'gpt-4o',
      inputTokens: 500,
      outputTokens: 100,
      totalTokens: 600,
      latencyMs: 300,
    });

    expect(tracker.getEntries()).toHaveLength(2);
  });

  it('sums totals correctly', () => {
    const tracker = new PipelineTokenTracker();

    tracker.record({
      stage: 'a',
      model: 'm',
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      latencyMs: 100,
      droppedChunks: 5,
    });
    tracker.record({
      stage: 'b',
      model: 'm',
      inputTokens: 200,
      outputTokens: 80,
      totalTokens: 280,
      latencyMs: 200,
      droppedChunks: 3,
    });

    const totals = tracker.getTotals();
    expect(totals.totalInput).toBe(300);
    expect(totals.totalOutput).toBe(130);
    expect(totals.droppedChunks).toBe(8);
  });

  it('produces a summary with all stage names', () => {
    const tracker = new PipelineTokenTracker();

    tracker.record({
      stage: 'extract',
      model: 'm',
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      latencyMs: 10,
    });
    tracker.record({
      stage: 'route',
      model: 'm',
      inputTokens: 20,
      outputTokens: 10,
      totalTokens: 30,
      latencyMs: 20,
    });

    const summary = tracker.toSummary();
    expect(summary.stages).toContain('extract');
    expect(summary.stages).toContain('route');
    expect(summary.totalCalls).toBe(2);
  });

  // ── GAP-017-B: toSummary completeness ─────────────────────────────────────

  it('TC-017-B1: toSummary returns correct totalInputTokens and totalOutputTokens', () => {
    const tracker = new PipelineTokenTracker();
    tracker.record({
      stage: 'a',
      model: 'm',
      inputTokens: 100,
      outputTokens: 40,
      totalTokens: 140,
      latencyMs: 10,
    });
    tracker.record({
      stage: 'b',
      model: 'm',
      inputTokens: 200,
      outputTokens: 60,
      totalTokens: 260,
      latencyMs: 20,
    });

    const summary = tracker.toSummary();
    expect(summary.totalInputTokens).toBe(300);
    expect(summary.totalOutputTokens).toBe(100);
  });

  it('TC-017-B2: toSummary returns droppedChunks summed across entries', () => {
    const tracker = new PipelineTokenTracker();
    tracker.record({
      stage: 'a',
      model: 'm',
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      latencyMs: 10,
      droppedChunks: 2,
    });
    tracker.record({
      stage: 'b',
      model: 'm',
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      latencyMs: 10,
      droppedChunks: 5,
    });

    const summary = tracker.toSummary();
    expect(summary.droppedChunks).toBe(7);
  });

  it('TC-017-B3: toSummary deduplicates stage names', () => {
    const tracker = new PipelineTokenTracker();
    tracker.record({
      stage: 'a',
      model: 'm',
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      latencyMs: 10,
    });
    tracker.record({
      stage: 'b',
      model: 'm',
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      latencyMs: 10,
    });
    tracker.record({
      stage: 'a',
      model: 'm',
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      latencyMs: 10,
    });

    const summary = tracker.toSummary();
    expect(summary.stages).toEqual(['a', 'b']);
    expect(summary.stages.length).toBe(2);
  });

  it('TC-017-B4: toSummary on empty tracker returns zeros and empty stages', () => {
    const tracker = new PipelineTokenTracker();

    const summary = tracker.toSummary();
    expect(summary.totalInputTokens).toBe(0);
    expect(summary.totalOutputTokens).toBe(0);
    expect(summary.totalCalls).toBe(0);
    expect(summary.stages.length).toBe(0);
    expect(summary.droppedChunks).toBe(0);
  });

  // ── GAP-017-C: logSummary format ──────────────────────────────────────────

  it('TC-017-C1: logSummary logs with prefix [ai-usage] and stage pipeline-complete', () => {
    const tracker = new PipelineTokenTracker();
    tracker.record({
      stage: 'extract',
      model: 'm',
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      latencyMs: 10,
    });

    // record() already caused one console.log call; logSummary will be the second
    tracker.logSummary(99);

    const summaryCall = consoleSpy.mock.calls[1]!;
    const [prefix, jsonStr] = summaryCall;
    expect(prefix).toBe('[ai-usage]');
    const parsed = JSON.parse(jsonStr as string);
    expect(parsed.stage).toBe('pipeline-complete');
    expect(parsed.documentId).toBe(99);
  });

  it('TC-017-C2: logSummary JSON contains all required summary fields', () => {
    const tracker = new PipelineTokenTracker();
    tracker.record({
      stage: 'extract',
      model: 'm',
      inputTokens: 100,
      outputTokens: 40,
      totalTokens: 140,
      latencyMs: 10,
      droppedChunks: 1,
    });

    tracker.logSummary(5);

    const summaryCall = consoleSpy.mock.calls[1]!;
    const parsed = JSON.parse(summaryCall[1] as string);

    expect(typeof parsed.totalInputTokens).toBe('number');
    expect(typeof parsed.totalOutputTokens).toBe('number');
    expect(typeof parsed.totalCalls).toBe('number');
    expect(Array.isArray(parsed.stages)).toBe(true);
    expect(typeof parsed.droppedChunks).toBe('number');
    expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

    expect(parsed.totalInputTokens).toBe(100);
    expect(parsed.totalOutputTokens).toBe(40);
    expect(parsed.totalCalls).toBe(1);
    expect(parsed.droppedChunks).toBe(1);
  });

  it('TC-017-C3: logSummary called without documentId omits or sets undefined', () => {
    const tracker = new PipelineTokenTracker();
    tracker.record({
      stage: 'a',
      model: 'm',
      inputTokens: 1,
      outputTokens: 1,
      totalTokens: 2,
      latencyMs: 1,
    });

    tracker.logSummary();

    const summaryCall = consoleSpy.mock.calls[1]!;
    const parsed = JSON.parse(summaryCall[1] as string);
    // documentId should either be absent or undefined (JSON.stringify strips undefined, so it won't be present)
    expect(parsed.documentId === undefined || !('documentId' in parsed)).toBe(true);
  });
});
