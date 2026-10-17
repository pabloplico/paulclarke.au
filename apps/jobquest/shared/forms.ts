// Input schemas: one per form, used by the Vue form (to show errors next to
// fields) and by the Hono route (to validate the body). Messages are user-facing.
import { z } from 'zod';
import { proficiencySchema, seniorityLevelSchema } from './types';

/** Trimmed text; an empty string becomes null. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => value || null);

const webAddress = z
  .string()
  .trim()
  .max(2000)
  .nullable()
  .transform((value) => value || null)
  .refine((value) => value === null || (/^https?:\/\//i.test(value) && URL.canParse(value)), {
    message: 'Enter a web address starting with http:// or https://',
  });

const tagList = (maxLength: number) => z.array(z.string().trim().min(1).max(maxLength)).max(100);

const jobFields = {
  title: z.string().trim().min(1, 'Enter a job title').max(200),
  company: z.string().trim().min(1, 'Enter a company').max(200),
  rawText: z.string().trim().max(50_000),
  skills: tagList(100),
  software: tagList(100),
  requirements: tagList(500),
  salaryRange: optionalText(100),
  seniorityLevel: seniorityLevelSchema,
  category: optionalText(100),
  positionSubcategory: optionalText(100),
  url: webAddress,
  notes: optionalText(5000),
};

/** Add Job: title and company are required, everything else has a default. */
export const jobInputSchema = z.object({
  ...jobFields,
  rawText: jobFields.rawText.default(''),
  skills: jobFields.skills.default([]),
  software: jobFields.software.default([]),
  requirements: jobFields.requirements.default([]),
  salaryRange: jobFields.salaryRange.default(null),
  seniorityLevel: jobFields.seniorityLevel.default('not_specified'),
  category: jobFields.category.default(null),
  positionSubcategory: jobFields.positionSubcategory.default(null),
  url: jobFields.url.default(null),
  notes: jobFields.notes.default(null),
});
export type JobInput = z.input<typeof jobInputSchema>;

/** Editing a job: any subset of the fields. */
export const jobPatchSchema = z.object(jobFields).partial();
export type JobPatch = z.input<typeof jobPatchSchema>;

const skillName = z.string().trim().min(1, 'Enter a skill').max(100);

export const skillInputSchema = z.object({
  name: skillName,
  proficiency: proficiencySchema.default(3),
  category: optionalText(100).default(null),
});
export type SkillInput = z.input<typeof skillInputSchema>;

export const skillPatchSchema = z
  .object({ name: skillName, proficiency: proficiencySchema, category: optionalText(100) })
  .partial();
export type SkillPatch = z.input<typeof skillPatchSchema>;

/**
 * Splits a list typed into a form, dropping blanks and repeats: by commas and lines
 * for skills and software, by lines only for requirements (which are sentences).
 */
export function parseList(text: string, separator: RegExp = /[,\n]/): string[] {
  const items = text
    .split(separator)
    .map((item) => item.trim())
    .filter(Boolean);
  return [...new Set(items)];
}

/** Field errors keyed by field name, as the API returns them and the forms show them. */
export type FieldErrors = Partial<Record<string, string>>;

export function fieldErrors(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? 'form');
    errors[field] ??= issue.message;
  }
  return errors;
}
