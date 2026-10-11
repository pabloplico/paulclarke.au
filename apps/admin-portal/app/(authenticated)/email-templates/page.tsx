import { desc, eq } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/server';
import { db } from '@/lib/db';
import { adminEmailTemplates } from '@/lib/db/schema';
import { TemplatesView } from './templates-view';

export const dynamic = 'force-dynamic';

export default async function EmailTemplatesPage() {
  const user = await requireAuth();

  const templates = await db
    .select()
    .from(adminEmailTemplates)
    .where(eq(adminEmailTemplates.userId, user.id))
    .orderBy(desc(adminEmailTemplates.createdAt));

  const serialized = templates.map((t) => ({
    ...t,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }));

  return (
    <div className="space-y-6 p-6">
      <TemplatesView initialTemplates={serialized} />
    </div>
  );
}
