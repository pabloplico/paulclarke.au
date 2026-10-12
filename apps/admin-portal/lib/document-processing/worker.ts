import { eq } from 'drizzle-orm';
import { config } from '@/lib/config';
import { loadConfig } from '@/lib/config.server';
import { db } from '@/lib/db';
import type { QualityFlag } from '@/lib/db/schema';
import { adminDocumentChunks, adminDocuments, adminInboxItems } from '@/lib/db/schema';
import type { JobContext } from '@/lib/queue';
import { chunkText } from '@/lib/rag/chunker';
import { generateEmbeddings } from '@/lib/rag/embeddings';
import { storage } from '@/lib/storage';
import { analyzeAllChunks } from './chunk-analysis';
import { extractCitations } from './citations';
import { cleanText } from './cleaner';
import { PermanentProcessingError, ProcessingError } from './errors';
import { type EnrichedMetadata, extractEnrichedMetadata, extractMetadata } from './metadata';
import { getParser } from './parsers';
import {
  checkChunkingQuality,
  checkCleaningQuality,
  checkExtractionQuality,
} from './quality-gates';
import { type DocumentJob, documentQueue } from './queue';
import { fetchUrlContent } from './url-fetcher';

async function updateDocumentStatus(
  documentId: number,
  status: string,
  extra?: Record<string, unknown>
) {
  await db
    .update(adminDocuments)
    .set({ status, updatedAt: new Date(), ...extra })
    .where(eq(adminDocuments.id, documentId));
}

export async function processDocument(job: JobContext<DocumentJob>): Promise<void> {
  const { documentId } = job.data;
  const qualityFlags: QualityFlag[] = [];

  // Load document record
  const [doc] = await db.select().from(adminDocuments).where(eq(adminDocuments.id, documentId));

  if (!doc) {
    throw new Error(`Document ${documentId} not found`);
  }

  await updateDocumentStatus(documentId, 'extracting', {
    processingStartedAt: new Date(),
  });
  job.updateProgress(1);

  // ── Stage 1: Extract text ──────────────────────────────────────────────
  let rawText: string;

  if (doc.source === 'url' && doc.sourceUrl) {
    // URL source: fetch page content
    const result = await fetchUrlContent(doc.sourceUrl);
    rawText = result.text;
    if (result.title && doc.title === doc.sourceUrl) {
      await updateDocumentStatus(documentId, 'extracting', { title: result.title });
    }
  } else if (doc.source === 'note' || doc.source === 'feed') {
    if (doc.rawText) {
      rawText = doc.rawText;
    } else {
      // Fallback: recover content from linked inbox item
      const [inboxItem] = await db
        .select({ content: adminInboxItems.content })
        .from(adminInboxItems)
        .where(eq(adminInboxItems.documentId, documentId));
      if (inboxItem?.content) {
        rawText = inboxItem.content;
      } else {
        throw new PermanentProcessingError(
          'Note/feed document has no text content and no linked inbox item',
          'NO_CONTENT',
          'extract'
        );
      }
    }
  } else {
    // File source: parse from disk
    const parser = getParser(doc.mimeType, doc.filename);
    const fileBuffer = await storage.read(doc.filePath);
    const parseResult = await parser(fileBuffer, doc.filename);
    rawText = parseResult.text;

    // Check page count limit for PDFs
    const cfg = await loadConfig();
    const maxPages = cfg.upload?.maxPdfPages ?? 200;
    if (parseResult.pageCount && parseResult.pageCount > maxPages) {
      throw new PermanentProcessingError(
        `PDF has ${parseResult.pageCount} pages (limit: ${maxPages})`,
        'PAGE_LIMIT_EXCEEDED',
        'extract'
      );
    }

    await updateDocumentStatus(documentId, 'extracting', {
      pageCount: parseResult.pageCount ?? null,
    });
  }

  await updateDocumentStatus(documentId, 'extracting', { rawText });
  job.updateProgress(2);

  // ── Stage 2: Clean text ────────────────────────────────────────────────
  await updateDocumentStatus(documentId, 'cleaning');
  const cleaned = cleanText(rawText);
  await updateDocumentStatus(documentId, 'cleaning', { cleanedText: cleaned });
  qualityFlags.push(...checkCleaningQuality(rawText, cleaned));
  job.updateProgress(3);

  // ── Stage 2.5: Citation extraction ─────────────────────────────────────
  const { citations, annotatedText } = extractCitations(cleaned, documentId);
  if (citations.length > 0) {
    console.log(
      `[document-worker] Extracted ${citations.length} citations from document ${documentId}`
    );
  }

  // ── Stage 3: Chunk text (uses annotated text with citation placeholders) ─
  await updateDocumentStatus(documentId, 'chunking');
  const chunks = chunkText(annotatedText);

  // Delete any existing chunks from a previous attempt
  await db.delete(adminDocumentChunks).where(eq(adminDocumentChunks.documentId, documentId));

  // Insert chunk rows (without embeddings yet)
  if (chunks.length > 0) {
    await db.insert(adminDocumentChunks).values(
      chunks.map((chunk) => ({
        documentId,
        content: chunk.content,
        chunkIndex: chunk.index,
        metadata: chunk.metadata,
      }))
    );
  }
  qualityFlags.push(...checkChunkingQuality(cleaned, chunks));
  job.updateProgress(4);

  // ── Stage 4: Generate embeddings ───────────────────────────────────────
  await updateDocumentStatus(documentId, 'embedding');

  if (chunks.length > 0) {
    const texts = chunks.map((c) => c.content);
    const embeddings = await generateEmbeddings(texts);

    // Fetch inserted chunk IDs in order
    const insertedChunks = await db
      .select({ id: adminDocumentChunks.id, chunkIndex: adminDocumentChunks.chunkIndex })
      .from(adminDocumentChunks)
      .where(eq(adminDocumentChunks.documentId, documentId));

    // Sort by chunkIndex to match embeddings order
    insertedChunks.sort((a, b) => a.chunkIndex - b.chunkIndex);

    // Update each chunk with its embedding
    for (let i = 0; i < insertedChunks.length; i++) {
      const chunk = insertedChunks[i]!;
      await db
        .update(adminDocumentChunks)
        .set({ embedding: embeddings[i] })
        .where(eq(adminDocumentChunks.id, chunk.id));
    }
  }
  job.updateProgress(5);

  // ── Stage 5: AI metadata extraction (multi-step with citations) ──────
  await updateDocumentStatus(documentId, 'analyzing');

  const cfg = await loadConfig();
  let aiSummary: string;
  let aiTitle: string;
  let aiTags: string[];
  let aiLanguage: string;
  let aiDocumentType: string;
  let enrichedResult: EnrichedMetadata | null = null;

  if (chunks.length > 0) {
    // Step 1: Per-chunk analysis
    const chunkInputs = chunks.map((c) => ({ content: c.content, index: c.index }));
    const { analyses: chunkAnalyses, droppedChunks } = await analyzeAllChunks(chunkInputs, cfg);
    if (droppedChunks > 0) {
      qualityFlags.push({
        stage: 'extract',
        severity: 'warning',
        code: 'chunks_dropped',
        message: `Analyzed ${chunkInputs.length - droppedChunks} of ${chunkInputs.length} chunks (limit: ${cfg.extraction?.chunkAnalysisMaxChunks ?? 50})`,
        details: { droppedChunks, totalChunks: chunkInputs.length },
      });
    }

    // Store per-chunk analysis in chunk metadata
    const insertedChunksForMeta = await db
      .select({ id: adminDocumentChunks.id, chunkIndex: adminDocumentChunks.chunkIndex })
      .from(adminDocumentChunks)
      .where(eq(adminDocumentChunks.documentId, documentId));

    for (const dbChunk of insertedChunksForMeta) {
      const analysis = chunkAnalyses.get(dbChunk.chunkIndex);
      if (analysis) {
        await db
          .update(adminDocumentChunks)
          .set({ metadata: { ...chunks[dbChunk.chunkIndex]?.metadata, analysis } })
          .where(eq(adminDocumentChunks.id, dbChunk.id));
      }
    }

    // Step 2: Synthesize enriched metadata from chunk analyses
    const analysisEntries = Array.from(chunkAnalyses.entries()).map(([chunkIndex, analysis]) => ({
      chunkIndex,
      analysis,
    }));
    enrichedResult = await extractEnrichedMetadata(analysisEntries, cleaned, cfg);

    aiSummary = enrichedResult.summary;
    aiTitle = enrichedResult.suggestedTitle;
    aiTags = enrichedResult.tags;
    aiLanguage = enrichedResult.language;
    aiDocumentType = enrichedResult.documentType;

    qualityFlags.push(...checkExtractionQuality(enrichedResult));
  } else {
    // Fallback: no chunks (empty document), use basic extraction
    const metadata = await extractMetadata(cleaned);
    aiSummary = metadata.summary;
    aiTitle = metadata.suggestedTitle;
    aiTags = metadata.tags;
    aiLanguage = metadata.language;
    aiDocumentType = metadata.documentType;
  }

  await updateDocumentStatus(documentId, 'ready', {
    aiSummary,
    aiTitle,
    aiTags,
    aiLanguage,
    aiDocumentType,
    metadata: enrichedResult ?? {},
    processingCompletedAt: new Date(),
  });
  job.updateProgress(6);

  // ── Stage 6: Enqueue workspace routing if linked to inbox item ───────
  const [inboxItem] = await db
    .select({ id: adminInboxItems.id })
    .from(adminInboxItems)
    .where(eq(adminInboxItems.documentId, documentId));

  if (inboxItem) {
    // Save quality flags on the inbox item
    if (qualityFlags.length > 0) {
      await db
        .update(adminInboxItems)
        .set({ qualityFlags })
        .where(eq(adminInboxItems.id, inboxItem.id));
    }

    try {
      const { queueRouting } = await import('@/lib/workspace-routing/queue');
      await queueRouting(inboxItem.id, true);
    } catch (err) {
      console.error(
        `[document-worker] Failed to queue routing for inbox item ${inboxItem.id}:`,
        err
      );
    }
  }
}

// ── Start worker ─────────────────────────────────────────────────────────────

/** Wraps processDocument with error recording and the retry/discard policy. */
export async function handleDocumentJob(job: JobContext<DocumentJob>): Promise<void> {
  try {
    await processDocument(job);
    console.log(`[document-worker] Document ${job.data.documentId} processed successfully`);
  } catch (error) {
    const isPermanent = error instanceof PermanentProcessingError;
    const code = error instanceof ProcessingError ? error.code : 'UNKNOWN';
    const stage = error instanceof ProcessingError ? error.stage : undefined;
    const message = error instanceof Error ? error.message : 'Unknown processing error';

    console.error(`[document-worker] Document ${job.data.documentId} failed:`, message);

    // Store structured error info
    await updateDocumentStatus(job.data.documentId, 'error', {
      processingError: JSON.stringify({ code, message, permanent: isPermanent, stage }),
    });

    if (isPermanent) {
      // Skip remaining retries — this error will not resolve on retry
      job.discard();
      return;
    }

    throw error; // Re-throw so the queue handles retries
  }
}

documentQueue.process(handleDocumentJob, {
  concurrency: config.queue.documentProcessing.concurrency,
});
