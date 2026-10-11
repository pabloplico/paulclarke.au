import { generateObject } from 'ai';
import { desc, eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getModel } from '@/lib/ai/models';
import { resolveWorkspaceSectionParams } from '@/lib/api/resolve-params';
import { loadConfig } from '@/lib/config.server';
import { db } from '@/lib/db';
import { adminSectionVersions } from '@/lib/db/schema';

type Params = { params: Promise<{ id: string; sectionId: string }> };

const suggestedRuleSchema = z.object({
  rules: z.array(
    z.object({
      type: z.enum(['min_length', 'required_headings', 'min_items']).describe('Rule type'),
      description: z
        .string()
        .describe('Human-readable description of what this rule checks and why'),
      params: z
        .record(z.string(), z.unknown())
        .describe(
          'Rule parameters: { minLength: number } for min_length, { headings: string[] } for required_headings, { minItems: number } for min_items'
        ),
    })
  ),
});

export async function POST(_request: NextRequest, { params }: Params) {
  const resolved = await resolveWorkspaceSectionParams(params);
  if (resolved.error) return resolved.error;
  const { workspace, section } = resolved;

  // Load latest content
  const [latestVersion] = await db
    .select()
    .from(adminSectionVersions)
    .where(eq(adminSectionVersions.sectionId, section.id))
    .orderBy(desc(adminSectionVersions.version))
    .limit(1);

  const content = latestVersion?.content ?? '';
  const structuredData = latestVersion?.structuredData ?? null;
  const existingRules = section.completenessRules ?? [];

  // Summarize structured data
  let structuredSummary = '(none)';
  if (structuredData) {
    const items =
      (structuredData.items as unknown[]) ??
      (structuredData.rows as unknown[]) ??
      (structuredData.pairs as unknown[]);
    if (Array.isArray(items)) {
      structuredSummary = `${items.length} items`;
    }
  }

  const cfg = await loadConfig();

  try {
    const { object } = await generateObject({
      model: getModel(cfg),
      schema: suggestedRuleSchema,
      prompt: `You are a knowledge base quality analyst. Suggest completeness rules for a workspace section.

## Workspace
- Title: ${workspace?.title ?? 'Unknown'}
- Description: ${workspace?.description ?? 'None'}

## Section
- Title: ${section.title}
- Template type: ${section.template}
- Description: ${section.description || 'None'}
- Current content length: ${content.length} characters
- Content preview: ${content.slice(0, 500) || '(empty)'}
- Structured data: ${structuredSummary}

## Existing Rules
${existingRules.length > 0 ? JSON.stringify(existingRules, null, 2) : 'None — this section has no rules yet'}

## Available Rule Types
1. min_length — content must meet a minimum character count. Params: { "minLength": <number> }
2. required_headings — specific markdown headings must be present. Params: { "headings": ["## Heading1", "## Heading2"] }. Best for prose sections.
3. min_items — structured data must have at least N items. Params: { "minItems": <number> }. Best for cards, table, checklist, kv-pairs sections.

## Instructions
- Suggest 1-4 rules appropriate for this section's template type and purpose
- Do NOT suggest rules that duplicate existing rules
- For prose sections, prefer min_length and required_headings
- For structured sections (cards, table, checklist, kv-pairs), prefer min_items
- Set realistic thresholds based on the section's purpose
- If content exists, set min_length slightly above current length to encourage expansion
- Write clear, actionable descriptions that explain what the rule checks`,
    });

    return NextResponse.json({ suggestions: object.rules });
  } catch (error) {
    console.error('AI rule suggestion failed:', error);
    return NextResponse.json({ error: 'Failed to generate suggestions' }, { status: 500 });
  }
}
