/**
 * Starts the agent queue workers and syncs CRON schedules. Called from
 * instrumentation.ts, and only when Redis is on (QUEUE_DRIVER=bullmq).
 */

import { startAnalysisWorker } from '@/lib/agents/queue/analysis-queue';
import { startIngestionWorker } from '@/lib/agents/queue/ingestion-queue';
import { startResearchWorker } from '@/lib/agents/queue/research-queue';
import { syncSchedules } from '@/lib/agents/queue/scheduler';
import { logger } from '@/lib/logger';

export function startAgentQueues(): void {
  startResearchWorker();
  startIngestionWorker();
  startAnalysisWorker();

  syncSchedules().catch((err: unknown) => {
    logger.error('Failed to sync agent schedules on startup', {
      module: 'agent-queue',
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

export { syncSchedules };
