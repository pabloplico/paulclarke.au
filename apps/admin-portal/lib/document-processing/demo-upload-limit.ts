import { count, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { adminDocuments } from '@/lib/db/schema';
import { isDemoMode } from '@/lib/demo';
import { SEEDED_DOCUMENT_COUNT } from '@/lib/demo-seed/content';

/** Files and notes one demo visitor can add, on top of the seeded document. */
export const DEMO_UPLOAD_LIMIT = 20;

/**
 * Demo mode only: refuses a new upload or note once the visitor has
 * DEMO_UPLOAD_LIMIT of their own documents. Uploads live on the instance's
 * disk (memory on Cloud Run), so this bounds what one visitor can store;
 * the daily AI caps bound what they can spend. It counts every document the
 * visitor has, not a client-supplied field, so it can't be talked around;
 * deleting a document makes room for another.
 */
export async function rejectDemoUploadOverLimit(userId: number): Promise<Response | null> {
  if (!isDemoMode()) return null;
  const [row] = await db
    .select({ n: count() })
    .from(adminDocuments)
    .where(eq(adminDocuments.userId, userId));
  if ((row?.n ?? 0) < DEMO_UPLOAD_LIMIT + SEEDED_DOCUMENT_COUNT) return null;
  return Response.json(
    {
      error: `The demo allows ${DEMO_UPLOAD_LIMIT} uploads per visitor. Delete a document to add another.`,
    },
    { status: 429 }
  );
}
