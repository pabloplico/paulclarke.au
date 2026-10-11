import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { adminFindings } from '@/lib/db/schema';
import { generateEmbedding, generateEmbeddings } from '@/lib/rag/embeddings';

export async function embedFinding(findingId: number, content: string): Promise<void> {
  const embedding = await generateEmbedding(content);

  await db.update(adminFindings).set({ embedding }).where(eq(adminFindings.id, findingId));
}

export async function embedFindings(
  items: Array<{ id: number; content: string }>
): Promise<number> {
  const BATCH_SIZE = 50;
  let totalEmbedded = 0;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const embeddings = await generateEmbeddings(batch.map((item) => item.content));

    for (let j = 0; j < batch.length; j++) {
      const item = batch[j];
      const emb = embeddings[j];
      if (!item || !emb) continue;
      await db.update(adminFindings).set({ embedding: emb }).where(eq(adminFindings.id, item.id));
    }
    totalEmbedded += batch.length;
  }

  return totalEmbedded;
}
