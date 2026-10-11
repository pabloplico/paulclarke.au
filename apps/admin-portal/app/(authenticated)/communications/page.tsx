import { desc, eq } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/server';
import { db } from '@/lib/db';
import { adminClients, adminCommunications } from '@/lib/db/schema';
import { CommunicationsView } from './communications-view';

export const dynamic = 'force-dynamic';

export default async function CommunicationsPage() {
  const user = await requireAuth();

  const comms = await db
    .select({
      communication: adminCommunications,
      clientName: adminClients.contactName,
      companyName: adminClients.companyName,
    })
    .from(adminCommunications)
    .leftJoin(adminClients, eq(adminCommunications.clientId, adminClients.id))
    .where(eq(adminCommunications.userId, user.id))
    .orderBy(desc(adminCommunications.createdAt));

  const clients = await db
    .select({
      id: adminClients.id,
      contactName: adminClients.contactName,
      companyName: adminClients.companyName,
    })
    .from(adminClients)
    .where(eq(adminClients.userId, user.id));

  const serialized = comms.map(({ communication: c, clientName, companyName }) => ({
    ...c,
    sentAt: c.sentAt.toISOString(),
    followUpDate: c.followUpDate?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
    clientName,
    companyName,
  }));

  return (
    <div className="space-y-6 p-6">
      <CommunicationsView initialComms={serialized} clients={clients} />
    </div>
  );
}
