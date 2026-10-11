import { desc, eq } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/server';
import { db } from '@/lib/db';
import { adminClients, adminJobs } from '@/lib/db/schema';
import { JobsKanban } from './jobs-kanban';

export const dynamic = 'force-dynamic';

export default async function JobsPage() {
  const user = await requireAuth();

  const jobs = await db
    .select({
      job: adminJobs,
      clientName: adminClients.contactName,
      companyName: adminClients.companyName,
    })
    .from(adminJobs)
    .leftJoin(adminClients, eq(adminJobs.clientId, adminClients.id))
    .where(eq(adminJobs.userId, user.id))
    .orderBy(adminJobs.sortOrder, desc(adminJobs.createdAt));

  const clients = await db
    .select({
      id: adminClients.id,
      contactName: adminClients.contactName,
      companyName: adminClients.companyName,
    })
    .from(adminClients)
    .where(eq(adminClients.userId, user.id));

  const serialized = jobs.map(({ job: j, clientName, companyName }) => ({
    ...j,
    startDate: j.startDate?.toISOString() ?? null,
    dueDate: j.dueDate?.toISOString() ?? null,
    completedAt: j.completedAt?.toISOString() ?? null,
    createdAt: j.createdAt.toISOString(),
    updatedAt: j.updatedAt.toISOString(),
    clientName,
    companyName,
  }));

  return (
    <div className="space-y-6 p-6">
      <JobsKanban initialJobs={serialized} clients={clients} />
    </div>
  );
}
