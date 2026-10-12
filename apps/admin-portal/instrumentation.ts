export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

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
  await import('./lib/db/backup-worker');
  await import('./lib/feeds/worker');
  await import('./lib/agents/queue/init');
}
