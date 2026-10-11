import { eq } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/server';
import { db } from '@/lib/db';
import { adminClients, adminJobs, adminTodos } from '@/lib/db/schema';
import { TasksView } from './tasks-view';

export const dynamic = 'force-dynamic';

export default async function TasksPage() {
  const user = await requireAuth();

  const todos = await db
    .select({
      todo: adminTodos,
      jobTitle: adminJobs.title,
      clientName: adminClients.contactName,
    })
    .from(adminTodos)
    .leftJoin(adminJobs, eq(adminTodos.jobId, adminJobs.id))
    .leftJoin(adminClients, eq(adminTodos.clientId, adminClients.id))
    .where(eq(adminTodos.userId, user.id));

  const serialized = todos.map(({ todo: t, jobTitle, clientName }) => ({
    ...t,
    completedAt: t.completedAt?.toISOString() ?? null,
    dueDate: t.dueDate?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    jobTitle,
    clientName,
  }));

  const clients = await db
    .select({ id: adminClients.id, contactName: adminClients.contactName })
    .from(adminClients)
    .where(eq(adminClients.userId, user.id));

  const jobs = await db
    .select({ id: adminJobs.id, title: adminJobs.title })
    .from(adminJobs)
    .where(eq(adminJobs.userId, user.id));

  return (
    <div className="space-y-4 p-6">
      <TasksView initialTodos={serialized} clients={clients} jobs={jobs} />
    </div>
  );
}
