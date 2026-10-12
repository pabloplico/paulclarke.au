/**
 * Redis pub/sub channel for one agent run's live log. Shared by the publisher
 * (run-logger.ts) and the SSE route that subscribes, so the two can't drift.
 */
export function runLogChannel(runId: number): string {
  return `agent-run-log:${runId}`;
}
