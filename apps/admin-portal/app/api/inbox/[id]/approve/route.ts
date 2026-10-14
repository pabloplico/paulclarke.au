import { and, desc, eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { safeParseJson } from '@/lib/api/safe-json';
import { requireAuthApi } from '@/lib/auth/server';
import { db } from '@/lib/db';
import {
  type ApprovedResult,
  adminDocumentChunks,
  adminInboxItems,
  adminSectionSources,
  adminSectionVersions,
  adminWorkspaceSections,
  adminWorkspaces,
  type GapFindingRef,
  type RoutingSuggestion,
} from '@/lib/db/schema';
import {
  mergeStructuredData,
  parseMarkdownToCards,
  parseMarkdownToChecklist,
  parseMarkdownToKvPairs,
  parseMarkdownToTable,
} from '@/lib/workspaces/parse-structured';

/**
 * Extract chunk indices from [chunk N] citations in text.
 */
function parseChunkRefs(text: string): number[] {
  const refs = new Set<number>();
  const regex = /\[chunk\s+(\d+)\]/gi;
  for (const match of text.matchAll(regex)) {
    refs.add(Number(match[1]));
  }
  return Array.from(refs).sort((a, b) => a - b);
}

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const user = await requireAuthApi();
  const { id } = await params;
  const parsed = await safeParseJson(request);
  if (parsed.error) return parsed.error;
  const body = parsed.data as { suggestionIndex: number };
  const { suggestionIndex } = body;

  const [item] = await db
    .select()
    .from(adminInboxItems)
    .where(and(eq(adminInboxItems.id, Number(id)), eq(adminInboxItems.userId, user.id)));

  if (!item) {
    return NextResponse.json({ error: 'Inbox item not found' }, { status: 404 });
  }

  if (item.status !== 'routed') {
    return NextResponse.json({ error: 'Item has no routing results to approve' }, { status: 400 });
  }

  const suggestions = item.routingResults as RoutingSuggestion[] | null;
  if (!suggestions || suggestionIndex >= suggestions.length) {
    return NextResponse.json({ error: 'Invalid suggestion index' }, { status: 400 });
  }

  const suggestion = suggestions[suggestionIndex];
  if (!suggestion) {
    return NextResponse.json({ error: 'Invalid suggestion index' }, { status: 400 });
  }

  // Get current latest version number for the target section
  const [latest] = await db
    .select({ version: adminSectionVersions.version })
    .from(adminSectionVersions)
    .where(eq(adminSectionVersions.sectionId, suggestion.sectionId))
    .orderBy(desc(adminSectionVersions.version))
    .limit(1);

  const nextVersion = (latest?.version ?? 0) + 1;

  // Look up the target section's template to determine if we need structured data
  const [section] = await db
    .select({ template: adminWorkspaceSections.template })
    .from(adminWorkspaceSections)
    .where(eq(adminWorkspaceSections.id, suggestion.sectionId))
    .limit(1);

  const template = section?.template ?? 'prose';

  // Strip [chunk N] references from content — these are internal pipeline markers,
  // not meaningful to users. Source traceability is handled via section_sources + RAG search.
  const cleanContent = suggestion.suggestedContent.replace(/\s*\[chunk\s+\d+\]/gi, '');

  // For append, the current version is what the suggestion adds to
  const appending = suggestion.action === 'append' && latest;
  const [currentVersion] = appending
    ? await db
        .select({
          content: adminSectionVersions.content,
          structuredData: adminSectionVersions.structuredData,
        })
        .from(adminSectionVersions)
        .where(eq(adminSectionVersions.sectionId, suggestion.sectionId))
        .orderBy(desc(adminSectionVersions.version))
        .limit(1)
    : [];

  let finalContent = cleanContent;
  if (currentVersion?.content) {
    finalContent = `${currentVersion.content}\n\n${cleanContent}`;
  }

  // Parse the suggestion into structured data for non-prose templates. When
  // appending, add it to the section's current data: structured sections
  // keep their items there, not in content, so re-parsing content alone
  // would replace what the section already has
  let structuredData: Record<string, unknown> | undefined;
  const parsers: Record<string, (md: string) => Record<string, unknown>> = {
    table: parseMarkdownToTable,
    cards: parseMarkdownToCards,
    checklist: parseMarkdownToChecklist,
    'kv-pairs': parseMarkdownToKvPairs,
  };
  const parse = parsers[template];
  if (parse && cleanContent) {
    structuredData = currentVersion?.structuredData
      ? mergeStructuredData(template, currentVersion.structuredData, parse(cleanContent))
      : parse(finalContent);
  }

  // Create new section version
  const [version] = await db
    .insert(adminSectionVersions)
    .values({
      sectionId: suggestion.sectionId,
      version: nextVersion,
      content: finalContent,
      structuredData,
      changeDescription: `Ingested from: ${item.title}`,
      changeSource: 'ai_ingest',
      sourceDocumentId: item.documentId,
    })
    .returning();

  // Update section's updatedAt
  await db
    .update(adminWorkspaceSections)
    .set({ updatedAt: new Date() })
    .where(eq(adminWorkspaceSections.id, suggestion.sectionId));

  // Track source with chunk references
  if (item.documentId && version) {
    // Parse [chunk N] citations from the suggested content + any chunkRefs from routing
    const citedChunkIndices = parseChunkRefs(suggestion.suggestedContent);
    const allChunkIndices = new Set([...citedChunkIndices, ...(suggestion.chunkRefs ?? [])]);

    let chunkIds: number[] | null = null;
    if (allChunkIndices.size > 0) {
      // Look up actual chunk IDs by matching chunkIndex + documentId
      const chunks = await db
        .select({ id: adminDocumentChunks.id, chunkIndex: adminDocumentChunks.chunkIndex })
        .from(adminDocumentChunks)
        .where(eq(adminDocumentChunks.documentId, item.documentId));

      chunkIds = chunks.filter((c) => allChunkIndices.has(c.chunkIndex)).map((c) => c.id);

      if (chunkIds.length === 0) chunkIds = null;
    }

    await db.insert(adminSectionSources).values({
      sectionId: suggestion.sectionId,
      versionId: version.id,
      documentId: item.documentId,
      chunkIds,
    });
  }

  // Fetch workspace slug for the approved result link
  const [workspace] = await db
    .select({ slug: adminWorkspaces.slug })
    .from(adminWorkspaces)
    .where(eq(adminWorkspaces.id, suggestion.workspaceId))
    .limit(1);

  // Build approved result record
  const approvedResult: ApprovedResult = {
    workspaceId: suggestion.workspaceId,
    workspaceTitle: suggestion.workspaceTitle,
    workspaceSlug: workspace?.slug ?? '',
    sectionId: suggestion.sectionId,
    sectionTitle: suggestion.sectionTitle,
    versionId: version?.id,
    approvedAt: new Date().toISOString(),
  };

  const existingApproved = (item.approvedResults as ApprovedResult[] | null) ?? [];
  const updatedApproved = [...existingApproved, approvedResult];

  // Remove approved suggestion from results, set status to 'approved' when all done
  const remaining = suggestions.filter((_, i) => i !== suggestionIndex);
  await db
    .update(adminInboxItems)
    .set({
      routingResults: remaining.length > 0 ? remaining : null,
      approvedResults: updatedApproved,
      status: remaining.length > 0 ? 'routed' : 'approved',
    })
    .where(eq(adminInboxItems.id, item.id));

  // Check if this inbox item originated from a gap finding
  const gapFindingRef = item.gapFindingRef as GapFindingRef | null;

  return NextResponse.json({
    version,
    workspaceTitle: suggestion.workspaceTitle,
    sectionTitle: suggestion.sectionTitle,
    approvedResult,
    ...(gapFindingRef ? { gapFindingRef, gapReportStale: true } : {}),
  });
}
