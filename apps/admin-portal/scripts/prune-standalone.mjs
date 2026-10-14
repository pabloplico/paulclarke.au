/**
 * Runs after `next build`: keeps data out of .next/standalone.
 *
 * lib/db/backup.ts and the storage layer resolve backups/ and uploads/ at
 * runtime, so Next's file tracer copies whatever is in them (real pg_dump
 * files, users' uploads) into the standalone output that the Docker image
 * ships. outputFileTracingExcludes in next.config.ts stops it for the route
 * traces, but its keys are routes, and the same files also arrive through
 * the instrumentation and server traces, which it can't reach. So this
 * removes them, then fails the build if anything data-like is left.
 */
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const standalone = join(process.cwd(), '.next', 'standalone');
if (!existsSync(standalone)) {
  console.log('[prune-standalone] no .next/standalone (not an output: standalone build); skipping');
  process.exit(0);
}

const DATA_DIRS = ['backups', 'apps/admin-portal/backups', 'uploads', 'apps/admin-portal/uploads'];
for (const dir of DATA_DIRS) {
  const path = join(standalone, dir);
  if (existsSync(path)) {
    rmSync(path, { recursive: true, force: true });
    console.log(`[prune-standalone] removed ${dir}/ from the standalone output`);
  }
}

// Belt and braces: no database dumps or upload folders anywhere outside node_modules
const leftovers = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === 'backups' || name === 'uploads') {
        // The Next route bundles for the backups pages are code, not data
        if (!path.includes(join('.next', 'server'))) leftovers.push(path);
      }
      walk(path);
    } else if (
      /\.(sql|dump)(\.gz)?$/.test(name) &&
      !path.includes(join('apps', 'admin-portal', 'drizzle'))
    ) {
      leftovers.push(path);
    }
  }
}
walk(standalone);
if (leftovers.length) {
  console.error('[prune-standalone] data found in .next/standalone:');
  for (const path of leftovers) console.error(`  ${relative(process.cwd(), path)}`);
  process.exit(1);
}
console.log('[prune-standalone] no backups or uploads in .next/standalone');
