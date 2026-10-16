import type { StepResult, ToolSet } from 'ai';
import { publishToolCall } from '@/lib/agents/queue/run-logger';

/**
 * Publish each tool call from an agent's generate() result as a structured
 * event for the run log viewer, in the order the agent made them, and return
 * the agent's text response for persistence.
 *
 * A call the tool refused (input it couldn't validate: see define-tool.ts) or
 * that threw is logged with status 'error'.
 */
export async function logToolCalls<TOOLS extends ToolSet>(
  runId: number,
  result: { text: string; steps: StepResult<TOOLS>[] }
): Promise<{ toolCallCount: number; agentResponse: string }> {
  let count = 0;

  for (const step of result.steps) {
    for (const part of step.content) {
      if (part.type === 'tool-result') {
        const refused = (part.output as { error?: unknown } | null)?.error === true;
        await publishToolCall(
          runId,
          part.toolName,
          summarize(part.input),
          summarize(part.output),
          refused ? 'error' : 'success'
        );
        count++;
      } else if (part.type === 'tool-error') {
        await publishToolCall(
          runId,
          part.toolName,
          summarize(part.input),
          { error: part.error instanceof Error ? part.error.message : String(part.error) },
          'error'
        );
        count++;
      }
    }
  }

  return { toolCallCount: count, agentResponse: result.text };
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
