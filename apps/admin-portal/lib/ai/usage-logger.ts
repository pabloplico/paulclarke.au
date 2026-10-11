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
