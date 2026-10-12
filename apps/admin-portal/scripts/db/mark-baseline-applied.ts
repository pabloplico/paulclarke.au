/**
 * Records drizzle/0000_baseline.sql as applied on a database that already has
 * the schema (for example a dev database built with `drizzle-kit push` or the
 * old migrations), so `pnpm db:migrate` skips the baseline instead of failing
 * on "relation already exists".
 *
 *   pnpm db:mark-baseline            # dry run: compares, prints, writes nothing
 *   pnpm db:mark-baseline --apply    # records the baseline
 *
 * It never drops, alters or deletes anything. With --apply it only creates
 * drizzle.__drizzle_migrations if it's missing and inserts one row into it.
 * It refuses if any schema table or column is missing, because then the
 * database doesn't match the baseline and marking it applied would hide that.
 * Extra tables (such as the old mr_* research tables) are listed but left alone.
 */
import { readMigrationFiles } from 'drizzle-orm/migrator';
import postgres from 'postgres';
import { actualTables, compareTables, expectedTables } from './expected-schema';

const apply = process.argv.includes('--apply');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');

  const migrations = readMigrationFiles({ migrationsFolder: './drizzle' });
  if (migrations.length !== 1) {
    throw new Error(`Expected exactly one migration (the baseline), found ${migrations.length}`);
  }
  const [baseline] = migrations;
  if (!baseline) throw new Error('No baseline migration found');

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const { host, port, database } = sql.options;
    console.log(`Database: ${database} on ${host}:${port}`);

    const { missing, extra } = compareTables(
      expectedTables(),
      await actualTables((q) => sql.unsafe(q))
    );
    if (extra.length) {
      console.log(`Not in the schema (left as is):\n  ${extra.join('\n  ')}`);
    }
    if (missing.length) {
      throw new Error(
        `The database is missing parts of the schema, so it doesn't match the baseline:\n  ${missing.join('\n  ')}\nBring it up to date first (for example with drizzle-kit push), then run this again.`
      );
    }
    console.log('Every schema table and column exists.');

    const [table] = await sql<{ exists: boolean }[]>`
      select to_regclass('drizzle.__drizzle_migrations') is not null as exists`;
    const recorded = table?.exists
      ? await sql<{ hash: string; created_at: string }[]>`
          select hash, created_at::text from drizzle.__drizzle_migrations order by created_at`
      : [];
    if (recorded.some((row) => row.hash === baseline.hash)) {
      console.log('The baseline is already recorded. Nothing to do.');
      return;
    }
    console.log(
      `Recorded migrations: ${recorded.length}${recorded.length ? ' (from the old history; kept)' : ''}`
    );

    if (!apply) {
      console.log(
        `Dry run: would record the baseline (created_at ${baseline.folderMillis}). Run again with --apply to write it.`
      );
      return;
    }

    // Same table definition as drizzle-orm's migrator. tx.unsafe because
    // postgres.js types TransactionSql without its tagged-template call signature
    await sql.begin(async (tx) => {
      await tx.unsafe('create schema if not exists drizzle');
      await tx.unsafe(
        'create table if not exists drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)'
      );
      await tx.unsafe(
        'insert into drizzle.__drizzle_migrations (hash, created_at) values ($1, $2)',
        [baseline.hash, baseline.folderMillis]
      );
    });
    console.log('Recorded the baseline. `pnpm db:migrate` will now skip it.');
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
