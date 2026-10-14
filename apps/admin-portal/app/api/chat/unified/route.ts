import { streamText } from 'ai';
import { and, desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireAiAllowance } from '@/lib/ai/allowance';
import { getModel } from '@/lib/ai/models';
import { withAuEnglish } from '@/lib/ai/style';
import { enforceBudget, estimateTokens } from '@/lib/ai/tokens';
import { logAIUsage } from '@/lib/ai/usage-logger';
import { safeParseJson } from '@/lib/api/safe-json';
import { requireAuthApi } from '@/lib/auth/server';
import { loadConfig } from '@/lib/config.server';
import { db } from '@/lib/db';
import type { ConversationScope } from '@/lib/db/schema';
import {
  adminConversations,
  adminKnowledgeBases,
  adminMessages,
  adminSectionVersions,
  adminWorkspaceSections,
} from '@/lib/db/schema';
import { generateEmbedding } from '@/lib/rag/embeddings';
import type { SearchResult } from '@/lib/rag/search';
import { searchKnowledgeBase } from '@/lib/rag/search';
import { resolveWorkspace } from '@/lib/workspaces/resolve';

const MAX_HISTORY = 20;

interface ChatRequest {
  message: string;
  conversationId?: number;
  scope: ConversationScope;
}

interface Source {
  chunkId: number;
  documentId: number;
  documentTitle: string;
  chunkIndex: number;
  score: number;
  preview: string;
}

/**
 * Build context + system prompt for workspace-scoped chat.
 */
async function buildWorkspaceContext(workspaceId: number, userId: number) {
  const workspace = await resolveWorkspace(String(workspaceId), userId);
  if (!workspace) return null;

  const sections = await db
    .select()
    .from(adminWorkspaceSections)
    .where(eq(adminWorkspaceSections.workspaceId, workspace.id))
    .orderBy(adminWorkspaceSections.sortOrder);

  const sectionContents = await Promise.all(
    sections.map(async (section) => {
      const [latest] = await db
        .select({ content: adminSectionVersions.content })
        .from(adminSectionVersions)
        .where(eq(adminSectionVersions.sectionId, section.id))
        .orderBy(desc(adminSectionVersions.version))
        .limit(1);
      return {
        title: section.title,
        template: section.template,
        content: latest?.content ?? '(empty)',
      };
    })
  );

  // Token budget: proportionally truncate sections if total exceeds 16K tokens
  const maxContextTokens = 16_000;
  const allContent = sectionContents.map((s) => s.content).join('\n');
  const totalContentTokens = estimateTokens(allContent);

  let contextBlock: string;
  let contextTruncated = false;
  if (totalContentTokens <= maxContextTokens) {
    contextBlock = sectionContents
      .map((s) => `### ${s.title} (${s.template})\n${s.content}`)
      .join('\n\n---\n\n');
  } else {
    contextTruncated = true;
    const ratio = maxContextTokens / totalContentTokens;
    contextBlock = sectionContents
      .map((s) => {
        const sectionTokens = estimateTokens(s.content);
        const budget = Math.max(100, Math.floor(sectionTokens * ratio));
        const truncated = enforceBudget(s.content, {
          maxInputTokens: budget,
          reserveOutputTokens: 0,
          strategy: 'truncate',
        });
        return `### ${s.title} (${s.template})\n${truncated.text}`;
      })
      .join('\n\n---\n\n');
  }

  const systemPrompt = `You are a knowledgeable assistant for the "${workspace.title}" workspace.${
    workspace.description ? ` This workspace covers: ${workspace.description}` : ''
  }

Answer the user's question based on the workspace content below. Be specific and reference section names when citing information. If the content doesn't cover the question, say so and suggest what sections might need to be expanded.

## Workspace Content

${contextBlock}`;

  return { systemPrompt, workspace, contextTruncated };
}

/**
 * Build context + system prompt for KB-scoped chat using RAG.
 */
async function buildKbContext(knowledgeBaseId: number, userId: number, message: string) {
  const [kb] = await db
    .select()
    .from(adminKnowledgeBases)
    .where(
      and(eq(adminKnowledgeBases.id, knowledgeBaseId), eq(adminKnowledgeBases.userId, userId))
    );

  if (!kb) return null;

  let queryEmbedding: number[];
  try {
    queryEmbedding = await generateEmbedding(message);
  } catch {
    return { error: 'Failed to generate embedding' };
  }

  let searchResults: SearchResult[];
  try {
    searchResults = await searchKnowledgeBase(knowledgeBaseId, queryEmbedding, 5);
  } catch {
    return { error: 'Search failed' };
  }

  const context = searchResults
    .map((r, i) => `[Source ${i + 1}: "${r.documentTitle}", Chunk #${r.chunkIndex}]\n${r.content}`)
    .join('\n\n---\n\n');

  const systemPrompt = `You are a knowledgeable assistant for the "${kb.name}" knowledge base.${
    kb.description ? ` Context: ${kb.description}` : ''
  }

Answer the user's question based on the provided source material. If the sources don't contain relevant information, say so. Always cite your sources using [Source N] notation.

## Source Material

${context || 'No relevant sources found for this query.'}`;

  const sources: Source[] = searchResults.map((r) => ({
    chunkId: r.chunkId,
    documentId: r.documentId,
    documentTitle: r.documentTitle,
    chunkIndex: r.chunkIndex,
    score: r.score,
    preview: r.content.slice(0, 200),
  }));

  return { systemPrompt, kb, sources };
}

export async function POST(request: Request) {
  const user = await requireAuthApi();
  await requireAiAllowance(user);
  const parsed = await safeParseJson(request);
  if (parsed.error) return parsed.error;
  const body = parsed.data as ChatRequest;
  const { message, conversationId, scope } = body;

  if (!message?.trim()) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 });
  }

  if (!scope?.type) {
    return NextResponse.json({ error: 'Scope is required' }, { status: 400 });
  }

  // ── Build context based on scope ───────────────────────────────────────────

  let systemPrompt: string;
  let sources: Source[] = [];
  let contextTruncated = false;

  if (scope.type === 'workspace') {
    const result = await buildWorkspaceContext(scope.workspaceId, user.id);
    if (!result) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }
    systemPrompt = result.systemPrompt;
    contextTruncated = result.contextTruncated;
  } else if (scope.type === 'kb') {
    const result = await buildKbContext(scope.knowledgeBaseId, user.id, message);
    if (!result) {
      return NextResponse.json({ error: 'Knowledge base not found' }, { status: 404 });
    }
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    systemPrompt = result.systemPrompt;
    sources = result.sources;
  } else {
    systemPrompt = "You are a helpful assistant. Answer the user's question clearly and concisely.";
  }

  // ── Load conversation history ──────────────────────────────────────────────

  let history: { role: 'user' | 'assistant'; content: string }[] = [];
  if (conversationId) {
    const [conv] = await db
      .select({ id: adminConversations.id })
      .from(adminConversations)
      .where(
        and(eq(adminConversations.id, conversationId), eq(adminConversations.userId, user.id))
      );

    if (!conv) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const msgs = await db
      .select({ role: adminMessages.role, content: adminMessages.content })
      .from(adminMessages)
      .where(eq(adminMessages.conversationId, conversationId));

    history = msgs
      .slice(-MAX_HISTORY)
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
  }

  // ── Create or reuse conversation ───────────────────────────────────────────

  let activeConversationId: number = conversationId ?? 0;

  if (!conversationId) {
    const [conv] = await db
      .insert(adminConversations)
      .values({
        title: message.slice(0, 100),
        userId: user.id,
        scope,
        knowledgeBaseId: scope.type === 'kb' ? scope.knowledgeBaseId : null,
        workspaceId: scope.type === 'workspace' ? scope.workspaceId : null,
      })
      .returning();
    activeConversationId = conv?.id ?? 0;
  }

  // Save user message immediately
  await db.insert(adminMessages).values({
    conversationId: activeConversationId,
    role: 'user',
    content: message,
  });

  // ── Stream LLM response ────────────────────────────────────────────────────

  const cfg = await loadConfig();
  const streamStartTime = Date.now();

  const result = streamText({
    model: getModel(cfg),
    system: withAuEnglish(systemPrompt),
    messages: [...history, { role: 'user', content: message }],
    async onFinish({ text, usage }) {
      logAIUsage({
        stage: 'unified-chat',
        model: cfg.ai.model,
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
        totalTokens: (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0),
        latencyMs: Date.now() - streamStartTime,
      });

      // Persist assistant message after stream completes
      await db.insert(adminMessages).values({
        conversationId: activeConversationId,
        role: 'assistant',
        content: text,
        sources:
          sources.length > 0
            ? sources.map((r) => ({
                chunkId: r.chunkId,
                documentId: r.documentId,
                documentTitle: r.documentTitle,
                chunkIndex: r.chunkIndex,
                score: r.score,
              }))
            : undefined,
      });

      // Touch conversation updatedAt so history sort is accurate
      await db
        .update(adminConversations)
        .set({ updatedAt: new Date() })
        .where(eq(adminConversations.id, activeConversationId));
    },
  });

  // Return streaming text response with metadata in headers
  const response = result.toTextStreamResponse({
    headers: {
      'X-Conversation-Id': String(activeConversationId),
      ...(sources.length > 0 ? { 'X-Sources': JSON.stringify(sources) } : {}),
      ...(contextTruncated ? { 'X-Context-Truncated': 'true' } : {}),
    },
  });

  return response;
}
