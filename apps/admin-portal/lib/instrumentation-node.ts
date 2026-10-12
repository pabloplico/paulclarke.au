/**
 * Server start-up, Node.js runtime only (instrumentation.ts imports this
 * only when NEXT_RUNTIME is nodejs, so the Edge build never sees the
 * Node APIs here).
 */
export async function registerNode(): Promise<void> {
  // Refuse to start on bad configuration. Exit rather than throw: a throw in
  // register() is logged, but the server may keep running without it
  const { runStartupChecks } = await import('./startup-checks');
  try {
    runStartupChecks();
  } catch (error) {
    console.error(`FATAL: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }

  const { dbDriver, redisEnabled } = await import('./drivers');
  if (dbDriver() === 'pglite') {
    const { ensurePgliteReady } = await import('./db/pglite');
    await ensurePgliteReady();
  }

  // On the JobQueue seam: BullMQ or in-process, per QUEUE_DRIVER
  await import('./document-processing/worker');
  await import('./workspace-routing/worker');

  if (!redisEnabled()) {
    // In-process jobs don't survive a restart; pick up what was interrupted
    const { recoverInterruptedJobs } = await import('./queue/recover');
    await recoverInterruptedJobs();
    return;
  }

  // Redis only: these use repeatable jobs (backups, feeds, agent schedules)
  const { startBackupWorker } = await import('./db/backup-worker');
  const { startFeedWorker } = await import('./feeds/worker');
  const { startAgentQueues } = await import('./agents/queue/init');
  startBackupWorker();
  startFeedWorker();
  startAgentQueues();
}
