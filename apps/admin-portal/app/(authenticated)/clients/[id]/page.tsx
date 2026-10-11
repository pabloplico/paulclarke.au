import { and, eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth/server';
import { db } from '@/lib/db';
import { adminClients, adminCommunications, adminContacts } from '@/lib/db/schema';
import { ClientDetail } from './client-detail';

export const dynamic = 'force-dynamic';

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  const { id } = await params;

  const [client] = await db
    .select()
    .from(adminClients)
    .where(and(eq(adminClients.id, Number(id)), eq(adminClients.userId, user.id)));

  if (!client) notFound();

  const contacts = await db
    .select()
    .from(adminContacts)
    .where(and(eq(adminContacts.clientId, client.id), eq(adminContacts.userId, user.id)));

  const communications = await db
    .select()
    .from(adminCommunications)
    .where(
      and(eq(adminCommunications.clientId, client.id), eq(adminCommunications.userId, user.id))
    )
    .orderBy(adminCommunications.createdAt);

  type DateToString<T> = T extends Date ? string : T;
  function serialize<T extends Record<string, unknown>>(
    obj: T
  ): { [K in keyof T]: DateToString<T[K]> } {
    const result = {} as Record<string, unknown>;
    for (const [k, v] of Object.entries(obj)) {
      result[k] = v instanceof Date ? v.toISOString() : v;
    }
    return result as { [K in keyof T]: DateToString<T[K]> };
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <ClientDetail
        initialClient={serialize(client)}
        initialContacts={contacts.map((c) => serialize(c))}
        initialCommunications={communications.map((c) => serialize(c))}
      />
    </div>
  );
}
