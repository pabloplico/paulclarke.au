import { generateText } from 'ai';
import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getModel } from '@/lib/ai/models';
import { logAIUsage } from '@/lib/ai/usage-logger';
import { safeParseJson } from '@/lib/api/safe-json';
import { requireAuthApi } from '@/lib/auth/server';
import { loadConfig } from '@/lib/config.server';
import { db } from '@/lib/db';
import { adminConversations, adminKnowledgeBases, adminMessages } from '@/lib/db/schema';
import { generateEmbedding } from '@/lib/rag/embeddings';
import type { SearchResult } from '@/lib/rag/search';
import { searchKnowledgeBase } from '@/lib/rag/search';

export async function POST(request: Request) {
  const user = await requireAuthApi();
  const parsed = await safeParseJson(request);
  if (parsed.error) return parsed.error;
  const body = parsed.data as { message: string; knowledgeBaseId: number; conversationId?: number };
  const { message, knowledgeBaseId, conversationId } = body;

  if (!message?.trim()) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 });
  }

  if (!knowledgeBaseId) {
    return NextResponse.json({ error: 'knowledgeBaseId is required' }, { status: 400 });
  }

  // Verify KB exists and belongs to user
  const [kb] = await db
    .select()
    .from(adminKnowledgeBases)
    .where(
      and(eq(adminKnowledgeBases.id, knowledgeBaseId), eq(adminKnowledgeBases.userId, user.id))
    );

  if (!kb) {
    return NextResponse.json({ error: 'Knowledge base not found' }, { status: 404 });
  }

  // Generate query embedding
  let queryEmbedding: number[];
  try {
    queryEmbedding = await generateEmbedding(message);
  } catch (_err) {
    return NextResponse.json({ error: 'Failed to generate embedding' }, { status: 500 });
  }

  // Search KB for relevant chunks
  let searchResults: SearchResult[];
  try {
    searchResults = await searchKnowledgeBase(knowledgeBaseId, queryEmbedding, 5);
  } catch (_err) {
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }

  // Build context from search results
  const context = searchResults
    .map((r, i) => `[Source ${i + 1}: "${r.documentTitle}", Chunk #${r.chunkIndex}]\n${r.content}`)
    .join('\n\n---\n\n');

  const systemPrompt = `You are a knowledgeable assistant for the "${kb.name}" knowledge base.${
    kb.description ? ` Context: ${kb.description}` : ''
  }

Answer the user's question based on the provided source material. If the sources don't contain relevant information, say so. Always cite your sources using [Source N] notation.

## Source Material

${context || 'No relevant sources found for this query.'}`;

  // Get conversation history if resuming (verify conversation ownership)
  let history: { role: 'user' | 'assistant'; content: string }[] = [];
  if (conversationId) {
    // Verify conversation belongs to user
    const [conv] = await db
      .select({ id: adminConversations.id })
      .from(adminConversations)
      .where(
        and(eq(adminConversations.id, conversationId), eq(adminConversations.userId, user.id))
      );

    if (!conv) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const messages = await db
      .select()
      .from(adminMessages)
      .where(eq(adminMessages.conversationId, conversationId));

    history = messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));
  }

  // Call LLM
  const cfg = await loadConfig();
  let responseText: string;
  try {
    const startTime = Date.now();
    const result = await generateText({
      model: getModel(cfg),
      system: systemPrompt,
      messages: [...history, { role: 'user', content: message }],
    });
    responseText = result.text;

    logAIUsage({
      stage: 'kb-chat',
      model: cfg.ai.model,
      inputTokens: result.usage?.inputTokens ?? 0,
      outputTokens: result.usage?.outputTokens ?? 0,
      totalTokens: (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0),
      latencyMs: Date.now() - startTime,
    });
  } catch (_err) {
    return NextResponse.json({ error: 'LLM call failed' }, { status: 500 });
  }

  // Persist conversation + messages
  let activeConversationId: number = conversationId ?? 0;

  if (!conversationId) {
    const [conv] = await db
      .insert(adminConversations)
      .values({
        title: message.slice(0, 100),
        knowledgeBaseId,
        userId: user.id,
      })
      .returning();
    activeConversationId = conv?.id ?? 0;
  }

  // Save user message
  await db.insert(adminMessages).values({
    conversationId: activeConversationId,
    role: 'user',
    content: message,
  });

  // Save assistant response with sources
  await db.insert(adminMessages).values({
    conversationId: activeConversationId,
    role: 'assistant',
    content: responseText,
    sources: searchResults.map((r) => ({
      chunkId: r.chunkId,
      documentId: r.documentId,
      documentTitle: r.documentTitle,
      chunkIndex: r.chunkIndex,
      score: r.score,
    })),
  });

  return NextResponse.json({
    message: responseText,
    conversationId: activeConversationId,
    sources: searchResults.map((r) => ({
      chunkId: r.chunkId,
      documentId: r.documentId,
      documentTitle: r.documentTitle,
      chunkIndex: r.chunkIndex,
      score: r.score,
      preview: r.content.slice(0, 200),
    })),
  });
}
