import { generateText } from 'ai';
import { desc, eq } from 'drizzle-orm';
import { getModel } from '@/lib/ai/models';
import { enforceBudget } from '@/lib/ai/tokens';
import { logAIUsage } from '@/lib/ai/usage-logger';
import { loadConfig } from '@/lib/config.server';
import { db } from '@/lib/db';
import {
  adminDocuments,
  adminInboxItems,
  adminSectionVersions,
  type GapFinding,
  type GapFindingRef,
} from '@/lib/db/schema';
import { queueDocument } from '@/lib/document-processing/queue';

export async function createInboxItemFromGap(params: {
  gapReportId: number;
  findingIndex: number;
  finding: GapFinding;
  workspaceId: number;
  userId: number;
  autoGenerate?: boolean;
}): Promise<{ inboxItemId: number; documentId: number }> {
  const { gapReportId, findingIndex, finding, workspaceId, userId, autoGenerate } = params;

  let content: string;

  if (autoGenerate) {
    // Load the section's latest version content for context
    let sectionContent = '';
    if (finding.sectionId) {
      const [latestVersion] = await db
        .select({ content: adminSectionVersions.content })
        .from(adminSectionVersions)
        .where(eq(adminSectionVersions.sectionId, finding.sectionId))
        .orderBy(desc(adminSectionVersions.version))
        .limit(1);
      sectionContent = latestVersion?.content ?? '';
    }

    const cfg = await loadConfig();
    const budgetResult = enforceBudget(
      sectionContent,
      { maxInputTokens: 3000, reserveOutputTokens: 500, strategy: 'truncate' },
      cfg.ai.model
    );

    const startTime = Date.now();
    const { text: generatedText, usage } = await generateText({
      model: getModel(cfg),
      prompt: `You are a business knowledge writer. A gap analysis found: ${finding.issue}. Suggestion: ${finding.suggestion}. Section: ${finding.sectionTitle}. Current content: ${budgetResult.text}. Write a concise paragraph addressing this gap. Output only the content, no preamble.`,
    });

    logAIUsage({
      stage: 'gap-to-inbox',
      model: cfg.ai.model,
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
      totalTokens: (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0),
      latencyMs: Date.now() - startTime,
      truncated: budgetResult.truncated,
    });

    content = generatedText;
  } else {
    content = `Gap finding: ${finding.issue}\n\nSuggestion: ${finding.suggestion}`;
  }

  const title = `Gap fix: ${finding.sectionTitle} - ${finding.issue.slice(0, 100)}`;
  const fileSize = new TextEncoder().encode(content).length;

  const gapFindingRef: GapFindingRef = { gapReportId, findingIndex, workspaceId };

  // Create document record
  const [document] = await db
    .insert(adminDocuments)
    .values({
      userId,
      title,
      filename: 'gap-fix.txt',
      mimeType: 'text/plain',
      filePath: '',
      fileSize,
      status: 'uploaded',
      source: 'note',
      rawText: content,
      cleanedText: content,
    })
    .returning();

  if (!document) {
    throw new Error('Failed to create document record');
  }

  // Create inbox item
  const [inboxItem] = await db
    .insert(adminInboxItems)
    .values({
      userId,
      type: 'note',
      title,
      content,
      documentId: document.id,
      status: 'pending',
      gapFindingRef,
    })
    .returning();

  if (!inboxItem) {
    throw new Error('Failed to create inbox item');
  }

  // Queue document for processing pipeline
  await queueDocument(document.id);

  return { inboxItemId: inboxItem.id, documentId: document.id };
}
