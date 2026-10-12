/**
 * Builds a fresh database from drizzle/ and smoke-tests it.
 *
 *   pnpm db:check-fresh                   # in-memory PGlite (what CI runs)
 *   pnpm db:check-fresh --driver postgres # DATABASE_URL, which must be an empty database
 *
 * Checks: lib/db/schema hasn't drifted from the latest migration snapshot,
 * the migrations apply, the database they build matches the schema exactly
 * (drizzle-kit introspects it and finds nothing to change: tables, columns,
 * types, indexes and foreign keys), every table and column exists, pgvector
 * works (insert a 1536-d embedding, order by cosine distance), and running the
 * migrations a second time is a no-op.
 *
 * The postgres driver refuses to touch a database that already has tables,
 * so it can't be pointed at the dev database by mistake.
 */
import { readFileSync } from 'node:fs';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import * as schema from '../../lib/db/schema';
import { actualTables, compareTables, expectedTables } from './expected-schema';

type Query = (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

interface Target {
  query: Query;
  migrate: () => Promise<void>;
  /** The SQL `drizzle-kit push` would run to make this database match the schema. */
  pushStatements: () => Promise<string[]>;
  close: () => Promise<void>;
}

const driver = process.argv.includes('--driver')
  ? process.argv[process.argv.indexOf('--driver') + 1]
  : 'pglite';

async function pgliteTarget(): Promise<Target> {
  const { PGlite } = await import('@electric-sql/pglite');
  const { vector } = await import('@electric-sql/pglite-pgvector');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');
  // In-memory. Options go in the first argument: new PGlite(undefined, opts) ignores them
  const pg = await PGlite.create({ extensions: { vector } });
  const db = drizzle(pg);
  return {
    query: async (sql, params) => (await pg.query<Record<string, unknown>>(sql, params)).rows,
    migrate: () => migrate(db, { migrationsFolder: './drizzle' }),
    pushStatements: () => pushStatements(db),
    close: () => pg.close(),
  };
}

async function postgresTarget(): Promise<Target> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required with --driver postgres');
  const { default: postgres } = await import('postgres');
  const { drizzle } = await import('drizzle-orm/postgres-js');
  const { migrate } = await import('drizzle-orm/postgres-js/migrator');
  const client = postgres(url, { max: 1, onnotice: () => {} });
  const db = drizzle(client);
  return {
    query: (sql, params) => client.unsafe(sql, params as never[]),
    migrate: () => migrate(db, { migrationsFolder: './drizzle' }),
    // pushSchema reads `.rows` from execute(), which is PGlite's result shape;
    // postgres-js returns the rows array itself
    pushStatements: () =>
      pushStatements({
        execute: async (query: Parameters<typeof db.execute>[0]) => ({
          rows: await db.execute(query),
        }),
      }),
    close: () => client.end(),
  };
}

/** Introspects the database and diffs it with the schema. Never applies anything. */
async function pushStatements(db: unknown): Promise<string[]> {
  const { pushSchema } = await import('drizzle-kit/api');
  // biome-ignore lint/suspicious/noExplicitAny: drizzle-kit types the pg-core base class
  const { statementsToExecute } = await pushSchema(schema, db as any);
  return statementsToExecute;
}

function check(ok: boolean, message: string) {
  if (!ok) throw new Error(message);
  console.log(`  ok  ${message}`);
}

/**
 * The SQL `drizzle-kit generate` would write next: the latest snapshot in
 * drizzle/meta compared with the schema. Empty means no drift.
 */
async function pendingSchemaChanges(): Promise<string[]> {
  const { generateDrizzleJson, generateMigration } = await import('drizzle-kit/api');
  const journal = JSON.parse(readFileSync('./drizzle/meta/_journal.json', 'utf8'));
  const latest = journal.entries.at(-1).idx.toString().padStart(4, '0');
  const snapshot = JSON.parse(readFileSync(`./drizzle/meta/${latest}_snapshot.json`, 'utf8'));
  return generateMigration(snapshot, generateDrizzleJson(schema, snapshot.id));
}

async function main() {
  if (driver !== 'pglite' && driver !== 'postgres') {
    throw new Error(`Unknown --driver ${driver}: use pglite or postgres`);
  }
  console.log(`Fresh database check (${driver})`);

  const pending = await pendingSchemaChanges();
  if (pending.length) console.error(pending.join('\n'));
  check(
    pending.length === 0,
    'lib/db/schema matches the latest migration (run `pnpm db:generate` if not)'
  );

  const target = driver === 'pglite' ? await pgliteTarget() : await postgresTarget();

  try {
    const before = await actualTables(target.query);
    if (before.size > 0) {
      throw new Error(
        `Refusing to run: the database already has ${before.size} tables. Point it at an empty database.`
      );
    }

    const started = performance.now();
    await target.migrate();
    check(true, `migrations applied in ${(performance.now() - started).toFixed(0)} ms`);

    const differences = await target.pushStatements();
    if (differences.length) console.error(differences.join('\n'));
    check(differences.length === 0, 'the migrated database matches lib/db/schema exactly');

    const expected = expectedTables();
    const { missing, extra } = compareTables(expected, await actualTables(target.query));
    if (missing.length) console.error(missing.join('\n'));
    check(missing.length === 0, `all ${expected.size} schema tables and their columns exist`);
    if (extra.length) console.error(extra.join('\n'));
    check(extra.length === 0, 'no tables or columns outside the schema');

    const [ext] = await target.query(
      "select extversion from pg_extension where extname = 'vector'"
    );
    check(Boolean(ext), `pgvector ${ext?.extversion} installed`);

    // Insert a user, a document and two chunks, then search by cosine distance
    const [user] = await target.query(
      `insert into admin_users (email, "passwordHash", name) values ('smoke@example.com', 'x', 'Smoke') returning id`
    );
    const [doc] = await target.query(
      `insert into admin_documents ("userId", title, filename, "mimeType", "filePath", "fileSize")
       values ($1, 'Smoke', 'smoke.md', 'text/markdown', 'smoke.md', 1) returning id`,
      [user?.id]
    );
    const near = Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0));
    const far = Array.from({ length: 1536 }, (_, i) => (i === 1 ? 1 : 0));
    for (const [index, embedding] of [near, far].entries()) {
      await target.query(
        `insert into admin_document_chunks ("documentId", content, "chunkIndex", embedding)
         values ($1, $2, $3, $4::vector)`,
        [doc?.id, `chunk ${index}`, index, JSON.stringify(embedding)]
      );
    }
    const hits = await target.query(
      `select content, 1 - (embedding <=> $1::vector) as similarity
       from admin_document_chunks order by embedding <=> $1::vector limit 2`,
      [JSON.stringify(near)]
    );
    check(
      hits[0]?.content === 'chunk 0' && Number(hits[0]?.similarity) > 0.99,
      'vector search returns the nearest chunk first'
    );

    // A deleted document takes its chunks with it (ON DELETE cascade)
    await target.query('delete from admin_documents where id = $1', [doc?.id]);
    const [left] = await target.query('select count(*)::int as n from admin_document_chunks');
    check(left?.n === 0, 'deleting a document cascades to its chunks');

    await target.migrate();
    const journal = readMigrationFiles({ migrationsFolder: './drizzle' });
    const [applied] = await target.query(
      'select count(*)::int as n from drizzle.__drizzle_migrations'
    );
    check(applied?.n === journal.length, 'running the migrations again is a no-op');

    console.log('Fresh database check passed');
  } finally {
    await target.close();
  }
}

main().catch((error) => {
  console.error(`Fresh database check failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
