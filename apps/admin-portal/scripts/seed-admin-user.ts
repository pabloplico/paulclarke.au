/**
 * Creates the admin account.
 *
 *   ADMIN_EMAIL=you@example.com pnpm db:seed-admin                      # random password, printed once
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=… pnpm db:seed-admin     # your own password
 *
 * Uses the database DB_DRIVER selects (Postgres via DATABASE_URL, or PGlite).
 * Does nothing if the email already has an account.
 */
import { dbDriver } from '@/lib/drivers';

async function main() {
  if (dbDriver() === 'pglite') {
    const { ensurePgliteReady } = await import('@/lib/db/pglite');
    await ensurePgliteReady();
  } else if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  const { seedAdminUser } = await import('@/lib/auth/seed-admin');
  const result = await seedAdminUser({
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
    name: process.env.ADMIN_NAME,
  });

  if (!result.created) {
    console.log(`An account for ${result.email} already exists; nothing changed.`);
  } else if (result.generatedPassword) {
    console.log(`Created admin ${result.email}. Password (shown once, store it now):`);
    console.log(result.generatedPassword);
  } else {
    console.log(`Created admin ${result.email} with the password from ADMIN_PASSWORD.`);
  }
  process.exit(0);
}

main().catch((error) => {
  console.error(`Failed to seed the admin user: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
