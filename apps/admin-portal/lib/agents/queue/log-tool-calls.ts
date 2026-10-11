import { publishToolCall } from '@/lib/agents/queue/run-logger';

/**
 * Extract tool calls from an agent generate() result and publish each one
 * as a structured event for the run log viewer.
 * Also returns the agent's text response for persistence.
 */
export async function logToolCalls(
  runId: number,
  // biome-ignore lint/suspicious/noExplicitAny: Mastra result type varies
  result: any
): Promise<{ toolCallCount: number; agentResponse: string }> {
  let count = 0;
  const agentResponse = result?.text ?? '';

  const steps = result?.steps ?? [];
  for (const step of steps) {
    const toolCalls = step?.toolCalls ?? [];
    const toolResults = step?.toolResults ?? [];

    for (let i = 0; i < toolResults.length; i++) {
      const tr = toolResults[i];
      if (!tr) continue;

      // Mastra wraps tool results in { payload: { toolName, args, result, ... } }
      const payload = tr?.payload ?? tr;
      const toolName =
        payload?.toolName ?? toolCalls[i]?.toolName ?? toolCalls[i]?.name ?? 'unknown';
      const args = payload?.args ?? toolCalls[i]?.args ?? {};
      const toolResult = payload?.result ?? null;
      const isError = tr?.isError ?? false;

      const input = summarize(args);
      const output = toolResult ? summarize(toolResult) : null;

      await publishToolCall(runId, toolName, input, output, isError ? 'error' : 'success');
      count++;
    }

    // Handle any toolCalls without matching toolResults
    if (toolResults.length === 0 && toolCalls.length > 0) {
      for (const call of toolCalls) {
        if (!call) continue;
        const toolName = call.toolName ?? call.name ?? 'unknown';
        const input = summarize(call.args ?? {});
        await publishToolCall(runId, toolName, input, null, 'success');
        count++;
      }
    }
  }

  return { toolCallCount: count, agentResponse };
}

function summarize(obj: unknown): Record<string, unknown> {
  if (!obj || typeof obj !== 'object') return { value: String(obj) };
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof value === 'string' && value.length > 300) {
      result[key] = `${value.slice(0, 300)}...`;
    } else if (Array.isArray(value) && value.length > 5) {
      result[key] = `[${value.length} items]`;
    } else if (Array.isArray(value)) {
      result[key] = value;
    } else if (typeof value === 'object' && value !== null) {
      result[key] = summarize(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}
