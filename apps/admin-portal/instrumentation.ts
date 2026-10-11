export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./lib/document-processing/worker');
    await import('./lib/workspace-routing/worker');
    await import('./lib/db/backup-worker');
    await import('./lib/feeds/worker');
    await import('./lib/agents/queue/init');
  }
}
