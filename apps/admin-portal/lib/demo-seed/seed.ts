import { inArray } from 'drizzle-orm';
import type { Db, DbTx } from '@/lib/db';
import {
  adminDocumentChunks,
  adminDocuments,
  adminGapReports,
  adminInboxItems,
  adminSectionVersions,
  type GapFinding,
  type QualityFlag,
  type RoutingSuggestion,
} from '@/lib/db/schema';
import { hashSectionContent, hashWorkspace } from '@/lib/gap-analysis/content-hash';
import { seedDefaultWorkspace } from '@/lib/onboarding/seed-default-workspace';
import { storage } from '@/lib/storage';
import generatedJson from './generated.json';
import { type SeededContent, seedDemoContent } from './seed-content';

/** generated.json, written by scripts/demo/build-seed.ts. Ids are replaced by keys. */
type Generated = {
  document: {
    filename: string;
    title: string;
    mimeType: string;
    fileSize: number;
    rawText: string | null;
    cleanedText: string | null;
    pageCount: number | null;
    aiSummary: string | null;
    aiTitle: string | null;
    aiTags: string[] | null;
    aiLanguage: string | null;
    aiDocumentType: string | null;
    metadata: Record<string, unknown> | null;
  };
  chunks: {
    chunkIndex: number;
    content: string;
    tokenCount: number | null;
    metadata: Record<string, unknown> | null;
    embedding: number[];
  }[];
  inboxItem: {
    title: string;
    qualityFlags: QualityFlag[] | null;
    routingResults: (Omit<RoutingSuggestion, 'workspaceId' | 'sectionId'> & {
      workspaceKey: string | null;
      sectionKey: string | null;
    })[];
  };
  gapReports: {
    workspaceKey: string;
    findings: (Omit<GapFinding, 'sectionId' | 'contentHashAtAnalysis'> & {
      sectionKey: string | null;
    })[];
  }[];
};

const generated = generatedJson as unknown as Generated;

/**
 * Everything a demo visitor starts with, as fresh rows of their own: the
 * Getting Started workspace, the Harbourside Bakery workspaces, clients, jobs
 * and todos, one document already processed and routed into the inbox, and
 * a saved gap report for two workspaces. No AI calls: the AI-made parts come
 * from generated.json.
 *
 * Run it inside the transaction that creates the user, so a failed seed
 * never leaves an account half-seeded.
 */
export async function seedDemoUser(conn: Db | DbTx, userId: number): Promise<void> {
  await seedDefaultWorkspace(userId, conn);
  const seeded = await seedDemoContent(conn, userId);
  const documentId = await seedProcessedDocument(conn, userId);
  await seedRoutedInboxItem(conn, userId, documentId, seeded);
  await seedGapReports(conn, seeded);
}

async function seedProcessedDocument(conn: Db | DbTx, userId: number): Promise<number> {
  const { document: d, chunks } = generated;
  const filePath = await storage.save(
    `demo-u${userId}-${d.filename}`,
    Buffer.from(d.rawText ?? '', 'utf8')
  );
  const now = new Date();
  const [doc] = await conn
    .insert(adminDocuments)
    .values({
      userId,
      title: d.title,
      filename: d.filename,
      mimeType: d.mimeType,
      filePath,
      fileSize: d.fileSize,
      status: 'ready',
      source: 'inbox',
      rawText: d.rawText,
      cleanedText: d.cleanedText,
      pageCount: d.pageCount,
      aiSummary: d.aiSummary,
      aiTitle: d.aiTitle,
      aiTags: d.aiTags,
      aiLanguage: d.aiLanguage,
      aiDocumentType: d.aiDocumentType,
      metadata: d.metadata ?? {},
      processingStartedAt: now,
      processingCompletedAt: now,
    })
    .returning({ id: adminDocuments.id });
  if (!doc) throw new Error('Demo seed: document not created');

  if (chunks.length > 0) {
    await conn.insert(adminDocumentChunks).values(
      chunks.map((c) => ({
        documentId: doc.id,
        chunkIndex: c.chunkIndex,
        content: c.content,
        tokenCount: c.tokenCount,
        metadata: c.metadata as never,
        embedding: c.embedding,
      }))
    );
  }
  return doc.id;
}

async function seedRoutedInboxItem(
  conn: Db | DbTx,
  userId: number,
  documentId: number,
  seeded: SeededContent
): Promise<void> {
  const routingResults: RoutingSuggestion[] = [];
  for (const { workspaceKey, sectionKey, ...s } of generated.inboxItem.routingResults) {
    const workspace = workspaceKey ? seeded.workspaces.get(workspaceKey) : undefined;
    const section = sectionKey ? seeded.sections.get(sectionKey) : undefined;
    // The same rule as routeMaterial: the section must be in the workspace
    if (!workspace) continue;
    if (s.action !== 'new_section' && section?.workspaceKey !== workspaceKey) continue;
    routingResults.push({
      ...s,
      workspaceId: workspace.id,
      workspaceTitle: workspace.title,
      sectionId: section?.id ?? 0,
      sectionTitle: section?.title ?? 'Unknown',
    });
  }

  await conn.insert(adminInboxItems).values({
    userId,
    type: 'file',
    title: generated.inboxItem.title,
    documentId,
    status: 'routed',
    routingResults,
    qualityFlags: generated.inboxItem.qualityFlags,
    processedAt: new Date(),
  });
}

/**
 * The hashes the gap analysis route would store, so findings start out
 * current. Read back from the database rather than hashed from the fixtures:
 * jsonb reorders object keys, and the route hashes what the database returns.
 */
async function workspaceHashes(conn: Db | DbTx, sectionIds: number[]) {
  const versions = await conn
    .select({
      sectionId: adminSectionVersions.sectionId,
      version: adminSectionVersions.version,
      content: adminSectionVersions.content,
      structuredData: adminSectionVersions.structuredData,
    })
    .from(adminSectionVersions)
    .where(inArray(adminSectionVersions.sectionId, sectionIds));
  const latest = new Map<number, (typeof versions)[number]>();
  for (const v of versions) {
    if ((latest.get(v.sectionId)?.version ?? 0) < v.version) latest.set(v.sectionId, v);
  }
  const sectionContentHashes: Record<number, string> = {};
  for (const id of sectionIds) {
    const v = latest.get(id);
    sectionContentHashes[id] = hashSectionContent(v?.content ?? '', v?.structuredData ?? null);
  }
  return { sectionContentHashes, workspaceContentHash: hashWorkspace(sectionContentHashes) };
}

async function seedGapReports(conn: Db | DbTx, seeded: SeededContent): Promise<void> {
  for (const report of generated.gapReports) {
    const workspace = seeded.workspaces.get(report.workspaceKey);
    if (!workspace) continue;
    const sectionIds = [...seeded.sections.values()]
      .filter((sec) => sec.workspaceKey === report.workspaceKey)
      .map((sec) => sec.id);
    const { sectionContentHashes, workspaceContentHash } = await workspaceHashes(conn, sectionIds);
    const findings: GapFinding[] = report.findings.map(({ sectionKey, ...f }) => {
      const section = sectionKey ? seeded.sections.get(sectionKey) : undefined;
      const sectionId = section?.id ?? 0;
      return {
        ...f,
        sectionId,
        contentHashAtAnalysis: sectionId ? sectionContentHashes[sectionId] : undefined,
      };
    });
    await conn.insert(adminGapReports).values({
      workspaceId: workspace.id,
      findings,
      workspaceContentHash,
      sectionContentHashes,
    });
  }
}
