import { generateObject } from 'ai';
import { desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAiAllowance } from '@/lib/ai/allowance';
import { getModel } from '@/lib/ai/models';
import { requireAuthApi } from '@/lib/auth/server';
import { loadConfig } from '@/lib/config.server';
import { db } from '@/lib/db';
import { adminSectionVersions, adminWorkspaceSections, adminWorkspaces } from '@/lib/db/schema';

const suggestionSchema = z.object({
  suggestions: z.array(
    z.object({
      type: z.enum(['merge_workspaces', 'split_workspace', 'move_sections', 'rename_workspace']),
      description: z.string(),
      workspaceIds: z.array(z.number()),
      sectionIds: z.array(z.number()).optional(),
      newTitle: z.string().optional(),
      targetWorkspaceId: z.number().optional(),
    })
  ),
});

export async function POST() {
  const user = await requireAuthApi();
  await requireAiAllowance(user);

  // Fetch all non-archived workspaces
  const workspaces = await db
    .select()
    .from(adminWorkspaces)
    .where(eq(adminWorkspaces.userId, user.id))
    .orderBy(adminWorkspaces.sortOrder);

  const activeWorkspaces = workspaces.filter((ws) => ws.archivedAt === null);

  if (activeWorkspaces.length < 2) {
    return NextResponse.json({
      suggestions: [],
      message: 'Need at least 2 workspaces to suggest organisation improvements.',
    });
  }

  // Get sections with content previews for each workspace
  const workspaceData = await Promise.all(
    activeWorkspaces.map(async (ws) => {
      const sections = await db
        .select()
        .from(adminWorkspaceSections)
        .where(eq(adminWorkspaceSections.workspaceId, ws.id))
        .orderBy(adminWorkspaceSections.sortOrder);

      const sectionsWithContent = await Promise.all(
        sections.map(async (s) => {
          const [latest] = await db
            .select({ content: adminSectionVersions.content })
            .from(adminSectionVersions)
            .where(eq(adminSectionVersions.sectionId, s.id))
            .orderBy(desc(adminSectionVersions.version))
            .limit(1);
          return {
            id: s.id,
            title: s.title,
            template: s.template,
            contentPreview: (latest?.content ?? '').slice(0, 150),
          };
        })
      );

      return {
        id: ws.id,
        title: ws.title,
        description: ws.description,
        category: ws.category,
        sections: sectionsWithContent,
      };
    })
  );

  const config = await loadConfig();
  const model = getModel(config);

  try {
    const result = await generateObject({
      model,
      schema: suggestionSchema,
      prompt: `You are analysing ${workspaceData.length} workspaces for a business knowledge base. Suggest cross-workspace organisation improvements.

Workspaces:
${workspaceData
  .map(
    (ws) => `
## [${ws.id}] "${ws.title}" ${ws.category ? `(${ws.category})` : ''}
${ws.description || '(no description)'}
Sections:
${ws.sections.map((s) => `  - [${s.id}] "${s.title}" (${s.template}): ${s.contentPreview || '(empty)'}`).join('\n')}`
  )
  .join('\n')}

Consider:
1. Are any workspaces covering overlapping topics that should be merged?
2. Is any workspace too broad and should be split?
3. Should sections be moved between workspaces for better organisation?
4. Are workspace titles clear and descriptive?

Return only actionable suggestions. If workspaces are well-organised, return empty suggestions. Max 5 suggestions.`,
    });

    return NextResponse.json(result.object);
  } catch (error) {
    console.error('AI workspace organise error:', error);
    return NextResponse.json({ error: 'Failed to generate suggestions' }, { status: 500 });
  }
}
