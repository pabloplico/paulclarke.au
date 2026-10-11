import { generateText } from 'ai';
import { desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getModel } from '@/lib/agents/mastra/provider';
import { loadResearchSettings } from '@/lib/agents/settings';
import { resolveWorkspaceParams } from '@/lib/api/resolve-params';
import { safeParseJson } from '@/lib/api/safe-json';
import { db } from '@/lib/db';
import { adminFindings } from '@/lib/db/schema';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const resolved = await resolveWorkspaceParams(params);
  if (resolved.error) return resolved.error;
  const { workspace, user } = resolved;

  const parsed = await safeParseJson(request);
  if (parsed.error) return parsed.error;

  const body = parsed.data as {
    message: string;
    history?: Array<{ role: string; content: string }>;
  };

  if (!body.message?.trim()) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 });
  }

  // Load recent findings as context
  const findings = await db
    .select({
      title: adminFindings.title,
      content: adminFindings.content,
      findingType: adminFindings.findingType,
    })
    .from(adminFindings)
    .where(eq(adminFindings.workspaceId, workspace.id))
    .orderBy(desc(adminFindings.createdAt))
    .limit(50);

  const findingsContext =
    findings.length > 0
      ? `\n\nRecent findings for this workspace:\n${findings.map((f, i) => `${i + 1}. [${f.findingType}] ${f.title}: ${f.content.slice(0, 200)}`).join('\n')}`
      : '';

  const systemPrompt = `You are a research assistant for the workspace "${workspace.title}" (category: ${workspace.category || 'general'}).
Answer questions using the provided findings as context. Be specific and data-driven.${findingsContext}`;

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
    ...(body.history ?? []).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: body.message },
  ];

  const settings = await loadResearchSettings(user.id);
  const result = await generateText({
    model: getModel({ provider: settings.aiProvider, model: settings.aiModel }),
    messages,
  });

  return NextResponse.json({
    message: result.text,
    usage: result.usage,
  });
}
