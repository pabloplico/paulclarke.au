import { generateObject, generateText } from 'ai';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAiAllowance } from '@/lib/ai/allowance';
import { getModel } from '@/lib/ai/models';
import { checkFidelity, recordProvenance } from '@/lib/ai/semantic-fidelity';
import { enforceBudget, estimateTokens } from '@/lib/ai/tokens';
import { logAIUsage } from '@/lib/ai/usage-logger';
import { resolveWorkspaceSectionParams } from '@/lib/api/resolve-params';
import { safeParseJson } from '@/lib/api/safe-json';
import { loadConfig } from '@/lib/config.server';
import { logger } from '@/lib/logger';
import { generateEmbedding } from '@/lib/rag/embeddings';
import { searchKnowledgeBase } from '@/lib/rag/search';

type Params = { params: Promise<{ id: string; sectionId: string }> };

const ACTION_PROMPTS: Record<string, string> = {
  rewrite:
    'Rewrite the selected text to be clearer and more professional while preserving the meaning. Keep the same level of detail.',
  expand:
    'Expand the selected text with more detail, examples, or explanation. Maintain the same tone and style.',
  simplify:
    'Simplify the selected text to be more concise and easier to understand. Remove jargon where possible.',
  research:
    'Enhance the selected text with additional factual detail, data points, or context based on the research material provided below.',
};

export async function POST(request: NextRequest, { params }: Params) {
  const resolved = await resolveWorkspaceSectionParams(params);
  if (resolved.error) return resolved.error;
  await requireAiAllowance(resolved.user);
  const { section } = resolved;

  const parsed = await safeParseJson(request);
  if (parsed.error) return parsed.error;
  const body = parsed.data as {
    selectedText?: string;
    fullContent?: string;
    fullSection?: boolean;
    action: string;
    customPrompt?: string;
    knowledgeBaseId?: number;
  };
  const { selectedText, fullContent, fullSection, action, customPrompt, knowledgeBaseId } = body;

  if (!action) {
    return NextResponse.json({ error: 'action is required' }, { status: 400 });
  }

  const cfg = await loadConfig();

  // Handle analyse action separately — returns structured topics, not modified content
  if (action === 'analyse') {
    try {
      const result = await generateObject({
        model: getModel(cfg),
        schema: z.object({
          topics: z.array(z.string()),
        }),
        system:
          'You are an expert content analyst. Extract between 3 and 8 key topics from the given text as short phrases (2–5 words each). Return ONLY the most important and distinctive themes. Never return more than 8 topics.',
        messages: [
          {
            role: 'user',
            content: `Extract key topics from the following text:\n\n${selectedText}`,
          },
        ],
      });

      return NextResponse.json({
        topics: result.object.topics.slice(0, 8),
        action: 'analyse',
      });
    } catch (error) {
      logger.error('AI analyse failed', {
        module: 'ai-edit',
        error: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json({ error: 'AI analyse failed' }, { status: 500 });
    }
  }

  // Allow empty content for gap-fill (generate from scratch)
  const isGenerateFromScratch = !fullContent && !selectedText;

  // Build the action instruction
  let actionInstruction = ACTION_PROMPTS[action];
  if (action === 'custom' && customPrompt) {
    actionInstruction = customPrompt;
  }
  if (!actionInstruction) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  // For "research" action, run RAG search for grounding material
  let researchContext = '';
  if (action === 'research' && knowledgeBaseId) {
    try {
      const queryEmbedding = await generateEmbedding(selectedText ?? '');
      const results = await searchKnowledgeBase(knowledgeBaseId, queryEmbedding, 5);
      if (results.length > 0) {
        researchContext = results
          .map(
            (r, i) =>
              `[Source ${i + 1}: "${r.documentTitle}", Chunk #${r.chunkIndex}]\n${r.content}`
          )
          .join('\n\n---\n\n');
      }
    } catch {
      // Continue without research context if RAG fails
    }
  }

  let systemPrompt: string;
  let userPrompt: string;

  if (isGenerateFromScratch) {
    // Generate content from scratch for empty sections
    systemPrompt = `You are an expert content writer for a business knowledge base. Your task is to generate initial content for an empty section.

## Rules
- Generate well-structured markdown content appropriate for the section
- Use appropriate headings, lists, tables, or other markdown elements
- Make content practical and actionable, not generic filler
- Do not add explanatory notes or comments about your work
- Keep content focused and concise but substantive

## Section Context
- Section title: ${section?.title ?? 'Unknown'}
- Section description: ${section?.description ?? ''}
- Section template type: ${section?.template ?? 'prose'}

## Task
${actionInstruction}

${researchContext ? `## Research Material\n${researchContext}` : ''}`;

    userPrompt = `Generate initial content for this empty section. Output ONLY the markdown content, no code fences or explanations.`;
  } else if (fullSection) {
    systemPrompt = `You are an expert editor working on a knowledge base section. Your task is to ${actionInstruction.toLowerCase()}

## Rules
- Apply the action to the ENTIRE section content
- Return the COMPLETE rewritten section content
- Maintain consistent markdown formatting (heading levels, list styles, etc.)
- Do not add explanatory notes or comments about your changes
- Preserve the overall structure and organization unless the action requires changing it

${
  researchContext
    ? `## Research Material
${researchContext}`
    : ''
}`;

    userPrompt = `## Section Content
\`\`\`markdown
${fullContent}
\`\`\`

Apply the action to the entire section. Output ONLY the markdown content, no code fences or explanations.`;
  } else {
    systemPrompt = `You are an expert editor working on a knowledge base section. Your task is to modify a specific portion of the content while keeping everything else exactly the same.

## Rules
- ONLY modify the selected text portion — leave ALL surrounding content exactly as-is
- Return the COMPLETE section content with your modification applied in place
- Maintain consistent markdown formatting with the rest of the document
- Do not add explanatory notes or comments about your changes
- Preserve heading levels, list styles, and other formatting conventions from the original

## Action
${actionInstruction}

${
  researchContext
    ? `## Research Material (use to enhance the selected text)
${researchContext}`
    : ''
}`;

    userPrompt = `## Full Section Content
\`\`\`markdown
${fullContent}
\`\`\`

## Selected Text to Modify
\`\`\`
${selectedText}
\`\`\`

Return the complete updated section content with the selected text modified according to the action. Output ONLY the markdown content, no code fences or explanations.`;
  }

  try {
    // Token budget check — truncate content if needed
    const totalInputTokens = estimateTokens(systemPrompt + userPrompt, cfg.ai.model);
    const maxInputTokens = 12_000;
    let finalUserPrompt = userPrompt;
    let truncated = false;

    if (totalInputTokens > maxInputTokens && fullContent) {
      const systemTokens = estimateTokens(systemPrompt, cfg.ai.model);
      const contentBudget = Math.max(1000, maxInputTokens - systemTokens - 500);

      if (selectedText && !fullSection) {
        // Partial edit: keep a window around the selected text
        const selIdx = fullContent.indexOf(selectedText);
        if (selIdx >= 0) {
          const halfBudget = Math.floor(contentBudget / 2);
          const beforeText = fullContent.slice(0, selIdx);
          const afterText = fullContent.slice(selIdx + selectedText.length);

          const beforeBudget = enforceBudget(
            beforeText,
            { maxInputTokens: halfBudget, reserveOutputTokens: 0, strategy: 'truncate' },
            cfg.ai.model
          );
          const afterBudget = enforceBudget(
            afterText,
            { maxInputTokens: halfBudget, reserveOutputTokens: 0, strategy: 'truncate' },
            cfg.ai.model
          );

          // For the "after" portion, we need the start not the end, so reverse the truncation
          // enforceBudget keeps the beginning — for after-context we want the beginning too (text right after selection)
          const windowedContent = beforeBudget.text + selectedText + afterBudget.text;
          truncated = true;
          finalUserPrompt = userPrompt.replace(fullContent, windowedContent);
        }
      } else {
        // Full section edit: simple truncation from end
        const budgetResult = enforceBudget(
          fullContent,
          { maxInputTokens: contentBudget, reserveOutputTokens: 0, strategy: 'truncate' },
          cfg.ai.model
        );
        if (budgetResult.truncated) {
          truncated = true;
          finalUserPrompt = userPrompt.replace(fullContent, budgetResult.text);
        }
      }
    }

    const startTime = Date.now();
    const result = await generateText({
      model: getModel(cfg),
      system: systemPrompt,
      messages: [{ role: 'user', content: finalUserPrompt }],
    });

    logAIUsage({
      stage: 'ai-edit',
      model: cfg.ai.model,
      inputTokens: result.usage?.inputTokens ?? 0,
      outputTokens: result.usage?.outputTokens ?? 0,
      totalTokens: (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0),
      latencyMs: Date.now() - startTime,
      truncated,
    });

    // Semantic fidelity check (skip for generate-from-scratch — no source to compare)
    const sourceTextForFidelity = selectedText ?? fullContent;
    let fidelityWarning: { similarity: number; threshold: number; message: string } | undefined;
    let provenanceId: number | null = null;

    if (sourceTextForFidelity && !isGenerateFromScratch) {
      try {
        const fidelityResult = await checkFidelity(sourceTextForFidelity, result.text, action);

        provenanceId = await recordProvenance({
          operationType: action,
          sourceTextPreview: sourceTextForFidelity.slice(0, 2000),
          outputTextPreview: result.text.slice(0, 2000),
          cosineSimilarity: fidelityResult.similarity,
          status: fidelityResult.status,
          sectionId: section?.id,
          actionPrompt: actionInstruction,
          sourceEmbedding: fidelityResult.sourceEmbedding,
          outputEmbedding: fidelityResult.outputEmbedding,
        });

        if (fidelityResult.status === 'rejected') {
          return NextResponse.json(
            {
              error: 'semantic_fidelity_rejected',
              similarity: fidelityResult.similarity,
              message: `AI output diverged too far from source (similarity: ${fidelityResult.similarity.toFixed(2)}). Please try again.`,
            },
            { status: 422 }
          );
        }

        if (fidelityResult.status === 'flagged') {
          const thresholds = {
            rewrite: 0.78,
            simplify: 0.75,
            expand: 0.55,
            research: 0.5,
            custom: 0.6,
          };
          fidelityWarning = {
            similarity: fidelityResult.similarity,
            threshold: thresholds[action as keyof typeof thresholds] ?? 0.6,
            message: `AI output may have drifted from source (similarity: ${fidelityResult.similarity.toFixed(2)})`,
          };
        }
      } catch (fidelityError) {
        // Don't block the edit if fidelity check fails — log and continue
        logger.warn('Semantic fidelity check failed, continuing without', {
          module: 'ai-edit',
          error: fidelityError instanceof Error ? fidelityError.message : String(fidelityError),
        });
      }
    }

    return NextResponse.json({
      modifiedContent: result.text,
      action,
      selectedText,
      sectionTitle: section?.title ?? 'Unknown',
      ...(provenanceId ? { provenanceId } : {}),
      ...(fidelityWarning ? { fidelityWarning } : {}),
    });
  } catch (error) {
    logger.error('AI edit failed', {
      module: 'ai-edit',
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'AI edit failed' }, { status: 500 });
  }
}
