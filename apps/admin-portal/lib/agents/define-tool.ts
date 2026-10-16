import { type Tool, tool } from 'ai';
import type { z } from 'zod';

/** What a tool returns for input that doesn't match its schema, instead of running. */
export interface ToolInputError {
  error: true;
  message: string;
  validationErrors: { path: string; message: string }[];
}

/**
 * An AI SDK tool whose execute() checks its own input first. The AI SDK
 * already validates the model's tool calls, but execute() itself runs whatever
 * it's given: this keeps a direct call (a test, another caller) from writing
 * bad input, and returns the problems as data the model can correct, as the
 * research agents' tools did under Mastra. The parsed value is passed on, so
 * schema defaults apply.
 *
 * outputSchema documents and types the result; the AI SDK doesn't check it.
 */
export function defineTool<INPUT extends z.ZodType, OUTPUT>(definition: {
  description: string;
  inputSchema: INPUT;
  outputSchema?: z.ZodType<OUTPUT>;
  execute: (input: z.output<INPUT>) => Promise<OUTPUT>;
}): Tool<z.output<INPUT>, OUTPUT | ToolInputError> {
  const definedTool = {
    description: definition.description,
    inputSchema: definition.inputSchema,
    execute: async (input: z.output<INPUT>): Promise<OUTPUT | ToolInputError> => {
      const parsed = definition.inputSchema.safeParse(input);
      if (!parsed.success) {
        const validationErrors = parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        }));
        return {
          error: true,
          message: `Tool input validation failed: ${validationErrors
            .map((e) => `${e.path || 'input'}: ${e.message}`)
            .join('; ')}`,
          validationErrors,
        };
      }
      return definition.execute(parsed.data);
    },
  };
  // Tool's type is conditional on OUTPUT (NeverOptional), which TypeScript can't
  // resolve while OUTPUT is still generic. Each concrete tool gets exact types
  return tool(definedTool as unknown as Tool<z.output<INPUT>, OUTPUT | ToolInputError>);
}
