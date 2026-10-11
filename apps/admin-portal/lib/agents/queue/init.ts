/**
 * Import this module to start agent queue workers and sync CRON schedules.
 * Should be imported from a server-side entry point (e.g., instrumentation.ts or a route).
 */

import { syncSchedules } from '@/lib/agents/queue/scheduler';
import { logger } from '@/lib/logger';

// Import workers to register them (side effect: creates Worker instances)
import '@/lib/agents/queue/research-queue';
import '@/lib/agents/queue/ingestion-queue';
import '@/lib/agents/queue/analysis-queue';

// Sync CRON schedules on startup
syncSchedules().catch((err: unknown) => {
  logger.error('Failed to sync agent schedules on startup', {
    module: 'agent-queue',
    error: err instanceof Error ? err.message : String(err),
  });
});

export { syncSchedules };
