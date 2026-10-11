import { desc, eq } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/server';
import { db } from '@/lib/db';
import { adminClients } from '@/lib/db/schema';
import { ClientsView } from './clients-view';

export const dynamic = 'force-dynamic';

export default async function ClientsPage() {
  const user = await requireAuth();

  const clients = await db
    .select()
    .from(adminClients)
    .where(eq(adminClients.userId, user.id))
    .orderBy(desc(adminClients.createdAt));

  const serialized = clients.map((c) => ({
    ...c,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }));

  return (
    <div className="space-y-6 p-6">
      <ClientsView initialClients={serialized} />
    </div>
  );
}
