export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { dbDriver } = await import('./lib/drivers');
    if (dbDriver() === 'pglite') {
      const { ensurePgliteReady } = await import('./lib/db/pglite');
      await ensurePgliteReady();
    }
    await import('./lib/document-processing/worker');
    await import('./lib/workspace-routing/worker');
    await import('./lib/db/backup-worker');
    await import('./lib/feeds/worker');
    await import('./lib/agents/queue/init');
  }
}
