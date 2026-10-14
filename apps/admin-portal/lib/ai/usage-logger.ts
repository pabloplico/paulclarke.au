/**
 * Structured AI usage logging.
 * Logs to stdout as JSON for Cloud Run log capture.
 */

export type AIUsageEntry = {
  stage: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
  documentId?: number;
  userId?: number;
  truncated?: boolean;
  droppedChunks?: number;
};

/**
 * Log a single AI usage entry as structured JSON.
 */
export function logAIUsage(entry: AIUsageEntry): void {
  console.log(
    '[ai-usage]',
    JSON.stringify({
      ...entry,
      timestamp: new Date().toISOString(),
    })
  );
}

/**
 * Tracks cumulative token usage across a pipeline run (e.g., processing one document).
 */
export class PipelineTokenTracker {
  private entries: AIUsageEntry[] = [];

  record(entry: AIUsageEntry): void {
    this.entries.push(entry);
    logAIUsage(entry);
  }

  getTotals() {
    let totalInput = 0;
    let totalOutput = 0;
    let droppedChunks = 0;

    for (const e of this.entries) {
      totalInput += e.inputTokens;
      totalOutput += e.outputTokens;
      if (e.droppedChunks) droppedChunks += e.droppedChunks;
    }

    return { totalInput, totalOutput, total: totalInput + totalOutput, droppedChunks };
  }

  getEntries(): readonly AIUsageEntry[] {
    return this.entries;
  }

  toSummary(): {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCalls: number;
    stages: string[];
    droppedChunks: number;
  } {
    const totals = this.getTotals();
    const stages = [...new Set(this.entries.map((e) => e.stage))];
    return {
      totalInputTokens: totals.totalInput,
      totalOutputTokens: totals.totalOutput,
      totalCalls: this.entries.length,
      stages,
      droppedChunks: totals.droppedChunks,
    };
  }

  logSummary(documentId?: number): void {
    const summary = this.toSummary();
    console.log(
      '[ai-usage]',
      JSON.stringify({
        stage: 'pipeline-complete',
        documentId,
        ...summary,
        timestamp: new Date().toISOString(),
      })
    );
  }
}

// ── Daily spend ─────────────────────────────────────────────────────────────

/** Today's date in Brisbane (the demo's day starts and resets at midnight there). */
export function brisbaneDay(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Brisbane' }).format(now);
}

/**
 * Running AI spend for the current Brisbane day, in total and per user. The
 * AI guard records every call here and checks it before the next one.
 *
 * In memory, per process: it starts at zero on every restart. That's why the
 * provider's own budget (set in the OpenAI project) is the real hard limit;
 * this cap stops one day's runaway use well before that.
 */
export class SpendLedger {
  private day = brisbaneDay();
  private total = 0;
  private byUser = new Map<number, number>();

  private rollOver() {
    const today = brisbaneDay();
    if (today !== this.day) {
      this.day = today;
      this.total = 0;
      this.byUser.clear();
    }
  }

  record(userId: number | undefined, usd: number): void {
    this.rollOver();
    this.total += usd;
    if (userId !== undefined) this.byUser.set(userId, (this.byUser.get(userId) ?? 0) + usd);
  }

  spentToday(userId?: number): { total: number; user: number } {
    this.rollOver();
    return { total: this.total, user: userId === undefined ? 0 : (this.byUser.get(userId) ?? 0) };
  }
}

const g = globalThis as unknown as { _spendLedger?: SpendLedger };

/** Process-wide (Next.js can load this module more than once per process). */
export function spendLedger(): SpendLedger {
  g._spendLedger ??= new SpendLedger();
  return g._spendLedger;
}
