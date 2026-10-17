import { validator } from 'hono/validator';
import type { z } from 'zod';
import { fieldErrors } from '../shared/forms';

/**
 * Validates a JSON body against a shared form schema. A bad body gets a 400 with
 * the same per-field messages the form shows. Only the schema's fields come
 * through, so a body can't set id, profileId or dateAdded.
 */
export const jsonBody = <T extends z.ZodType>(schema: T) =>
  validator('json', (value, c) => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      return c.json(
        { error: 'Some fields need fixing.', fieldErrors: fieldErrors(parsed.error) },
        400
      );
    }
    return parsed.data as z.output<T>;
  });

/** True for a unique-index violation, wherever D1 or Drizzle put the message. */
export function isUniqueViolation(error: unknown): boolean {
  for (let current = error; current instanceof Error; current = current.cause) {
    if (current.message.includes('UNIQUE constraint failed')) return true;
  }
  return false;
}
