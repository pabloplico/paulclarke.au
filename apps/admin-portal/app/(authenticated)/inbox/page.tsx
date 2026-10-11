export const dynamic = 'force-dynamic';

import { desc, eq } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/server';
import { db } from '@/lib/db';
import { adminDocuments, adminInboxItems } from '@/lib/db/schema';
import { InboxView } from './inbox-view';

export default async function InboxPage() {
  const user = await requireAuth();

  const rows = await db
    .select({
      item: adminInboxItems,
      documentStatus: adminDocuments.status,
      documentError: adminDocuments.processingError,
    })
    .from(adminInboxItems)
    .leftJoin(adminDocuments, eq(adminInboxItems.documentId, adminDocuments.id))
    .where(eq(adminInboxItems.userId, user.id))
    .orderBy(desc(adminInboxItems.createdAt));

  const items = rows.map((r) => ({
    ...r.item,
    documentStatus: r.documentStatus,
    documentError: r.documentError,
    createdAt: r.item.createdAt.toISOString(),
    processedAt: r.item.processedAt?.toISOString() ?? null,
  }));

  return <InboxView initialItems={items} />;
}
