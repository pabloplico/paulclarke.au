import bcrypt from 'bcryptjs';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../lib/db/schema';

const { adminUsers } = schema;

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  process.exit(1);
}
const connectionString: string = process.env.DATABASE_URL;
const client = postgres(connectionString);
const db = drizzle(client, { schema });

const email = (process.env.ADMIN_EMAIL ?? 'admin@example.com').toLowerCase();
const password = process.env.ADMIN_PASSWORD ?? 'admin123';
const name = process.env.ADMIN_NAME ?? 'Admin';

async function main() {
  console.log(`Seeding admin user: ${email}`);

  const passwordHash = await bcrypt.hash(password, 12);

  const [user] = await db
    .insert(adminUsers)
    .values({ email, passwordHash, name, role: 'admin' })
    .onConflictDoNothing({ target: adminUsers.email })
    .returning({ id: adminUsers.id, email: adminUsers.email });

  if (user) {
    console.log(`Created admin user: ${user.email} (id: ${user.id})`);
  } else {
    console.log(`Admin user ${email} already exists, skipping.`);
  }

  await client.end();
}

main().catch((err) => {
  console.error('Failed to seed admin user:', err);
  process.exit(1);
});
