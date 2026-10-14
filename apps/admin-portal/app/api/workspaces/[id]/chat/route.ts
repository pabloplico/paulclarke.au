import { generateText } from 'ai';
import { desc, eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { aiBudgetResponse, requireAiAllowance } from '@/lib/ai/allowance';
import { getModel } from '@/lib/ai/models';
import { withAuEnglish } from '@/lib/ai/style';
import { enforceBudget, estimateTokens } from '@/lib/ai/tokens';
import { logAIUsage } from '@/lib/ai/usage-logger';
import { resolveWorkspaceParams } from '@/lib/api/resolve-params';
import { safeParseJson } from '@/lib/api/safe-json';
import { loadConfig } from '@/lib/config.server';
import { db } from '@/lib/db';
import { adminFindings, adminWorkspaceSections } from '@/lib/db/schema';
import { getLatestVersions } from '@/lib/workspaces/latest-versions';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const resolved = await resolveWorkspaceParams(params);
  if (resolved.error) return resolved.error;
  await requireAiAllowance(resolved.user);
  const { workspace } = resolved;

  const parsed = await safeParseJson(request);
  if (parsed.error) return parsed.error;
  const body = parsed.data as {
    message: string;
    history?: { role: string; content: string }[];
  };
  const { message, history } = body;

  if (!message?.trim()) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 });
  }

  // Load all sections with latest content for context
  const sections = await db
    .select()
    .from(adminWorkspaceSections)
    .where(eq(adminWorkspaceSections.workspaceId, workspace.id))
    .orderBy(adminWorkspaceSections.sortOrder);

  const versionMap = await getLatestVersions(sections.map((s) => s.id));
  const sectionContents = sections.map((section) => ({
    title: section.title,
    template: section.template,
    content: versionMap.get(section.id)?.content ?? '(empty)',
  }));

  const cfg = await loadConfig();

  // Token budget: 16K for context, 4K reserved for output
  const maxContextTokens = 16_000;
  const totalContentTokens = estimateTokens(
    sectionContents.map((s) => s.content).join('\n'),
    cfg.ai.model
  );

  let contextBlock: string;
  let contextTruncated = false;

  if (totalContentTokens <= maxContextTokens) {
    // All sections fit
    contextBlock = sectionContents
      .map((s) => `### ${s.title} (${s.template})\n${s.content}`)
      .join('\n\n---\n\n');
  } else {
    // Proportionally truncate sections to fit budget
    const ratio = maxContextTokens / totalContentTokens;
    contextBlock = sectionContents
      .map((s) => {
        const sectionTokens = estimateTokens(s.content, cfg.ai.model);
        const budget = Math.max(100, Math.floor(sectionTokens * ratio));
        const truncated = enforceBudget(
          s.content,
          { maxInputTokens: budget, reserveOutputTokens: 0, strategy: 'truncate' },
          cfg.ai.model
        );
        if (truncated.truncated) contextTruncated = true;
        return `### ${s.title} (${s.template})\n${truncated.text}`;
      })
      .join('\n\n---\n\n');
  }

  // For research workspaces, include recent findings as additional context
  let findingsBlock = '';
  if (workspace.category === 'research') {
    const recentFindings = await db
      .select()
      .from(adminFindings)
      .where(eq(adminFindings.workspaceId, workspace.id))
      .orderBy(desc(adminFindings.createdAt))
      .limit(20);

    if (recentFindings.length > 0) {
      findingsBlock = `\n\n## Research Findings\n\n${recentFindings
        .map(
          (f) =>
            `- **[${f.findingType}]** ${f.title} (confidence: ${f.confidenceScore})\n  ${f.content.slice(0, 300)}${f.content.length > 300 ? '...' : ''}`
        )
        .join('\n\n')}`;
    }
  }

  const systemPrompt = `You are a knowledgeable assistant for the "${workspace.title}" workspace.${
    workspace.description ? ` This workspace covers: ${workspace.description}` : ''
  }

Answer the user's question based on the workspace content below. Be specific and reference section names when citing information.${workspace.category === 'research' ? ' You also have access to recent research findings — reference specific findings when relevant.' : ''} If the content doesn't cover the question, say so and suggest what sections might need to be expanded.

## Workspace Content

${contextBlock}${findingsBlock}`;

  const conversationHistory: { role: 'user' | 'assistant'; content: string }[] = Array.isArray(
    history
  )
    ? history.map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))
    : [];

  try {
    const startTime = Date.now();
    const result = await generateText({
      model: getModel(cfg),
      system: withAuEnglish(systemPrompt),
      messages: [...conversationHistory, { role: 'user', content: message }],
    });

    logAIUsage({
      stage: 'workspace-chat',
      model: cfg.ai.model,
      inputTokens: result.usage?.inputTokens ?? 0,
      outputTokens: result.usage?.outputTokens ?? 0,
      totalTokens: (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0),
      latencyMs: Date.now() - startTime,
      truncated: contextTruncated,
    });

    return NextResponse.json({
      message: result.text,
      ...(contextTruncated ? { contextTruncated: true } : {}),
    });
  } catch (error) {
    const budget = aiBudgetResponse(error);
    if (budget) return budget;
    console.error('Workspace chat failed:', error);
    return NextResponse.json({ error: 'Chat request failed' }, { status: 500 });
  }
}
