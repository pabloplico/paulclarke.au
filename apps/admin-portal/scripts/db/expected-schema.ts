/**
 * What lib/db/schema says the database should contain, as plain table and
 * column names. Shared by the fresh-database check and the baseline marker so
 * both compare a live database against the same source of truth.
 */
import { is } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import * as schema from '../../lib/db/schema';

export function expectedTables(): Map<string, Set<string>> {
  const tables = new Map<string, Set<string>>();
  for (const value of Object.values(schema)) {
    if (!is(value, PgTable)) continue;
    const config = getTableConfig(value);
    tables.set(config.name, new Set(config.columns.map((c) => c.name)));
  }
  return tables;
}

type Query = (sql: string) => Promise<Record<string, unknown>[]>;

/** Public tables and their columns, as the database reports them. */
export async function actualTables(query: Query): Promise<Map<string, Set<string>>> {
  const rows = await query(
    `select table_name, column_name from information_schema.columns
     where table_schema = 'public' order by table_name, ordinal_position`
  );
  const tables = new Map<string, Set<string>>();
  for (const row of rows) {
    const table = String(row.table_name);
    const columns = tables.get(table) ?? new Set<string>();
    columns.add(String(row.column_name));
    tables.set(table, columns);
  }
  return tables;
}

/** Differences between the schema and a database, as readable lines. */
export function compareTables(
  expected: Map<string, Set<string>>,
  actual: Map<string, Set<string>>
): { missing: string[]; extra: string[] } {
  const missing: string[] = [];
  const extra: string[] = [];
  for (const [table, columns] of expected) {
    const live = actual.get(table);
    if (!live) {
      missing.push(`table ${table}`);
      continue;
    }
    for (const column of columns) if (!live.has(column)) missing.push(`column ${table}.${column}`);
    for (const column of live) if (!columns.has(column)) extra.push(`column ${table}.${column}`);
  }
  for (const table of actual.keys()) if (!expected.has(table)) extra.push(`table ${table}`);
  return { missing, extra };
}
