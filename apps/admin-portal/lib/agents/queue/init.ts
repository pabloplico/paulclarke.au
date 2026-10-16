/**
 * Registers the agent queue processors on the JobQueue seam (in-process or
 * BullMQ, per QUEUE_DRIVER). Called once on boot from
 * lib/instrumentation-node.ts, except in demo mode, where research is off.
 * There are no cron schedules: a run starts only when a user triggers it.
 */

import { startAnalysisWorker } from '@/lib/agents/queue/analysis-queue';
import { startIngestionWorker } from '@/lib/agents/queue/ingestion-queue';
import { startResearchWorker } from '@/lib/agents/queue/research-queue';

export function startAgentQueues(): void {
  startResearchWorker();
  startIngestionWorker();
  startAnalysisWorker();
}
