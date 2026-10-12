export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // Refuse to start on bad configuration. Exit rather than throw: a throw in
  // register() is logged, but the server may keep running without it
  const { runStartupChecks } = await import('./lib/startup-checks');
  try {
    runStartupChecks();
  } catch (error) {
    console.error(`FATAL: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }

  const { dbDriver, redisEnabled } = await import('./lib/drivers');
  if (dbDriver() === 'pglite') {
    const { ensurePgliteReady } = await import('./lib/db/pglite');
    await ensurePgliteReady();
  }

  // On the JobQueue seam: BullMQ or in-process, per QUEUE_DRIVER
  await import('./lib/document-processing/worker');
  await import('./lib/workspace-routing/worker');

  if (!redisEnabled()) {
    // In-process jobs don't survive a restart; pick up what was interrupted
    const { recoverInterruptedJobs } = await import('./lib/queue/recover');
    await recoverInterruptedJobs();
    return;
  }

  // Redis only: these use repeatable jobs (backups, feeds, agent schedules)
  const { startBackupWorker } = await import('./lib/db/backup-worker');
  const { startFeedWorker } = await import('./lib/feeds/worker');
  const { startAgentQueues } = await import('./lib/agents/queue/init');
  startBackupWorker();
  startFeedWorker();
  startAgentQueues();
}
