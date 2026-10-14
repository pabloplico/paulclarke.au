/**
 * One tiny paid check that a model works with this app's AI layer: a
 * generateObject call (structured output, as the document pipeline and
 * routing use) and one embedding, through getModel/getEmbeddingModel and the
 * AI guard. Prints tokens and cost. Costs a fraction of a cent.
 *
 *   OPENAI_API_KEY=… AI_PROVIDER=openai AI_MODEL=gpt-4.1-nano pnpm ai:smoke
 *
 * Ask before running it: it spends real money on whatever key is set.
 */
import { embed, generateObject } from 'ai';
import { z } from 'zod';

async function main() {
  const { aiConfigProblems } = await import('@/lib/ai/config-check');
  const problems = aiConfigProblems();
  if (problems.length) throw new Error(problems.join(' '));

  const { getEmbeddingModel, getModel } = await import('@/lib/ai/models');
  const { withAiUser } = await import('@/lib/ai/guard');
  const { spendLedger } = await import('@/lib/ai/usage-logger');

  await withAiUser(0, async () => {
    const started = Date.now();
    const { object, usage } = await generateObject({
      model: getModel(),
      schema: z.object({
        title: z.string(),
        tags: z.array(z.string()).max(3),
        documentType: z.enum(['procedure', 'policy', 'report', 'other']),
        confidence: z.number().min(0).max(1),
      }),
      prompt:
        'Classify this note: "The cold room at Harbourside Bakery must stay between 1 and 5 °C; record the temperature at opening, midday and close."',
    });
    console.log(`chat: ${JSON.stringify(object)} (${Date.now() - started} ms)`);
    console.log(`      tokens in ${usage.inputTokens}, out ${usage.outputTokens}`);

    const { embedding } = await embed({
      model: getEmbeddingModel(),
      value: 'cold room temperature',
    });
    console.log(`embedding: ${embedding.length} dimensions`);
  });

  console.log(`cost: US$${spendLedger().spentToday(0).total.toFixed(6)}`);
}

main().catch((error) => {
  console.error(`AI smoke check failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
