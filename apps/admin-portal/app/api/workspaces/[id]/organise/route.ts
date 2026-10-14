import { generateObject } from 'ai';
import { eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { aiBudgetResponse, requireAiAllowance } from '@/lib/ai/allowance';
import { getModel } from '@/lib/ai/models';
import { resolveWorkspaceParams } from '@/lib/api/resolve-params';
import { loadConfig } from '@/lib/config.server';
import { db } from '@/lib/db';
import { adminWorkspaceSections } from '@/lib/db/schema';
import { getLatestVersions } from '@/lib/workspaces/latest-versions';

type Params = { params: Promise<{ id: string }> };

const suggestionSchema = z.object({
  suggestions: z.array(
    z.object({
      type: z.enum(['reorder', 'merge', 'split', 'rename']),
      description: z.string(),
      sectionIds: z.array(z.number()),
      newOrder: z.array(z.number()).optional(),
      newTitle: z.string().optional(),
      splitAt: z.number().optional(),
    })
  ),
});

export async function POST(request: NextRequest, { params }: Params) {
  const resolved = await resolveWorkspaceParams(params);
  if (resolved.error) return resolved.error;
  await requireAiAllowance(resolved.user);
  const { workspace } = resolved;

  const body = await request.json().catch(() => ({}));
  const { apply } = body;

  // Get all sections with latest content
  const sections = await db
    .select()
    .from(adminWorkspaceSections)
    .where(eq(adminWorkspaceSections.workspaceId, workspace.id))
    .orderBy(adminWorkspaceSections.sortOrder);

  const versionMap = await getLatestVersions(sections.map((s) => s.id));
  const sectionsWithContent = sections.map((section) => ({
    id: section.id,
    title: section.title,
    template: section.template,
    sortOrder: section.sortOrder,
    contentPreview: (versionMap.get(section.id)?.content ?? '').slice(0, 200),
  }));

  if (apply) {
    // Apply previously-returned suggestions is not automated — user calls merge/split/reorder individually
    return NextResponse.json(
      { error: 'Apply mode not supported. Use individual operations.' },
      { status: 400 }
    );
  }

  // Generate AI suggestions
  const config = await loadConfig();
  const model = getModel(config);

  try {
    const result = await generateObject({
      model,
      schema: suggestionSchema,
      prompt: `You are analysing a workspace called "${workspace.title}" with ${sectionsWithContent.length} sections.

Sections:
${sectionsWithContent.map((s) => `- [${s.id}] "${s.title}" (${s.template}, order: ${s.sortOrder})\n  Preview: ${s.contentPreview || '(empty)'}`).join('\n')}

Suggest improvements to the organisation of these sections. Consider:
1. Are sections in a logical order? Suggest reordering if not.
2. Are any sections too similar and should be merged?
3. Are any sections too long or cover multiple topics and should be split?
4. Are any section titles unclear and should be renamed?

Return only actionable suggestions. If the workspace is well-organised, return an empty suggestions array. Maximum 5 suggestions.`,
    });

    return NextResponse.json(result.object);
  } catch (error) {
    const budget = aiBudgetResponse(error);
    if (budget) return budget;
    console.error('AI organise error:', error);
    return NextResponse.json({ error: 'Failed to generate suggestions' }, { status: 500 });
  }
}
