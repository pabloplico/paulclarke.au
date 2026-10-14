/**
 * House style for text the AI writes for people to read. Added to every
 * prompt that writes such text (lib/ai/style-coverage.test.ts checks).
 * Prompts that clean up a user's own document don't use it: they must keep
 * the document's spelling.
 */
export const AU_ENGLISH =
  'Write in Australian English: Australian spelling and conventions in everything you write ' +
  '(for example "organise", "colour", "labelling", "centre"). Keep names, quotes and text ' +
  'copied from the source exactly as they are.';

/** A system prompt with the house style added. */
export function withAuEnglish(system: string): string {
  return `${system}\n\n${AU_ENGLISH}`;
}
