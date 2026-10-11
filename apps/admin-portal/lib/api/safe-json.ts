import { NextResponse } from 'next/server';
import type { ZodSchema, z } from 'zod';

/**
 * Safely parse JSON from a request body.
 * Returns the parsed data or a 400 NextResponse on malformed JSON.
 *
 * Overload 1: With Zod schema — returns typed, validated data.
 * Overload 2: Without schema — returns unknown (backward compatible).
 */
export async function safeParseJson<T extends ZodSchema>(
  request: Request,
  schema: T
): Promise<{ data: z.infer<T>; error?: never } | { data?: never; error: NextResponse }>;

export async function safeParseJson(
  request: Request
): Promise<{ data: unknown; error?: never } | { data?: never; error: NextResponse }>;

export async function safeParseJson(
  request: Request,
  schema?: ZodSchema
): Promise<{ data: unknown; error?: never } | { data?: never; error: NextResponse }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      error: NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 }),
    };
  }

  if (!schema) {
    return { data: raw };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    return {
      error: NextResponse.json(
        { error: 'Validation failed', details: result.error.flatten().fieldErrors },
        { status: 400 }
      ),
    };
  }

  return { data: result.data };
}
