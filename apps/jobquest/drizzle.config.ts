import { defineConfig } from 'drizzle-kit';

// Generates the SQL migrations only; wrangler applies them (pnpm db:migrate:local, and the
// deploy from J5 on), reading the same folder through migrations_dir in wrangler.jsonc
export default defineConfig({
  dialect: 'sqlite',
  schema: './server/db/schema.ts',
  out: './drizzle',
});
