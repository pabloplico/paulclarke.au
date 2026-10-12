export async function register() {
  // Node-only start-up lives in its own module, so the Edge build of this
  // file doesn't pull in process.exit, PGlite or the workers
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerNode } = await import('./lib/instrumentation-node');
    await registerNode();
  }
}
