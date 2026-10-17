// Shared by the Vue app and the Worker: the data shapes as zod schemas, so form
// checks and Hono validators use the same definitions. Ported from
// pabloplico/jobquest@a9103e8 (types.ts, components/jobSearchTypes.ts); the TS
// enums became zod enums, and the tab enum went (the router replaces it).
import { z } from 'zod';

export const SENIORITY_LEVELS = ['not_specified', 'junior', 'mid', 'senior', 'lead'] as const;
export const seniorityLevelSchema = z.enum(SENIORITY_LEVELS);
export type SeniorityLevel = z.infer<typeof seniorityLevelSchema>;

export const SENIORITY_LABELS: Record<SeniorityLevel, string> = {
  not_specified: 'Not Specified',
  junior: 'Junior',
  mid: 'Mid-Level',
  senior: 'Senior',
  lead: 'Lead/Principal',
};

// Broad industry categories
export const JOB_CATEGORIES = [
  'Technology',
  'Engineering',
  'Business',
  'Finance',
  'Healthcare',
  'Education',
  'Marketing',
  'Sales',
  'Design',
  'Operations',
  'Manufacturing',
  'Legal',
  'Human Resources',
  'Customer Service',
  'Construction',
  'Other',
] as const;

// Specific role types
export const POSITION_SUBCATEGORIES = [
  'Product',
  'Management',
  'Developer',
  'QA/Testing',
  'Analysis',
  'Design',
  'Data',
  'DevOps',
  'Security',
  'Support',
  'Research',
  'Consulting',
  'Administration',
  'Other',
] as const;

export const jobSchema = z.object({
  id: z.string(),
  title: z.string(),
  company: z.string(),
  rawText: z.string(),
  skills: z.array(z.string()),
  software: z.array(z.string()),
  requirements: z.array(z.string()),
  salaryRange: z.string().nullable(),
  seniorityLevel: seniorityLevelSchema,
  category: z.string().nullable(),
  positionSubcategory: z.string().nullable(),
  dateAdded: z.string(),
  url: z.string().nullable(),
  notes: z.string().nullable(),
});
export type Job = z.infer<typeof jobSchema>;

export const PROFICIENCY_LABELS = {
  1: 'Learning',
  2: 'Junior',
  3: 'Mid',
  4: 'Senior',
  5: 'Expert',
} as const;
export const proficiencySchema = z.number().int().min(1).max(5);
export type Proficiency = keyof typeof PROFICIENCY_LABELS;

export const userSkillSchema = z.object({
  id: z.string(),
  name: z.string(),
  proficiency: proficiencySchema,
  category: z.string().nullable(),
});
export type UserSkill = z.infer<typeof userSkillSchema>;

// The AI's taxonomy output (the same shape from every provider)
export const taxonomyCategorySchema = z.object({
  name: z.string(),
  subcategories: z.array(z.object({ name: z.string(), items: z.array(z.string()) })),
});
export type TaxonomyCategory = z.infer<typeof taxonomyCategorySchema>;

/** Synonym → canonical name, and canonical name → its groups. */
export const taxonomySchema = z.object({
  categories: z.array(taxonomyCategorySchema),
  canonicalMap: z.record(z.string(), z.string()),
  skillGroups: z.record(z.string(), z.array(z.string())),
});
export type Taxonomy = z.infer<typeof taxonomySchema>;

export const generatedSkillSchema = z.object({
  name: z.string(),
  category: z.string(),
  suggestedLevel: proficiencySchema,
});
export type GeneratedSkill = z.infer<typeof generatedSkillSchema>;

export const searchPrefsSchema = z.object({
  location: z.string(),
  country: z.string(),
  distanceKm: z.number().int().positive().optional(),
  salaryMin: z.number().int().nonnegative().optional(),
  maxDaysOld: z.number().int().positive().optional(),
  fullTimeOnly: z.boolean().optional(),
  includeRemote: z.boolean().optional(),
});
export type SearchPrefs = z.infer<typeof searchPrefsSchema>;

export const DEFAULT_PREFS: SearchPrefs = { location: '', country: 'gb' };

// Every country Adzuna supports, alphabetical
export const COUNTRIES: { code: string; name: string }[] = [
  { code: 'au', name: 'Australia' },
  { code: 'at', name: 'Austria' },
  { code: 'be', name: 'Belgium' },
  { code: 'br', name: 'Brazil' },
  { code: 'ca', name: 'Canada' },
  { code: 'fr', name: 'France' },
  { code: 'de', name: 'Germany' },
  { code: 'in', name: 'India' },
  { code: 'ie', name: 'Ireland' },
  { code: 'it', name: 'Italy' },
  { code: 'mx', name: 'Mexico' },
  { code: 'nl', name: 'Netherlands' },
  { code: 'nz', name: 'New Zealand' },
  { code: 'pl', name: 'Poland' },
  { code: 'sg', name: 'Singapore' },
  { code: 'za', name: 'South Africa' },
  { code: 'es', name: 'Spain' },
  { code: 'ch', name: 'Switzerland' },
  { code: 'gb', name: 'United Kingdom' },
  { code: 'us', name: 'United States' },
];

/** A job from a search source (Adzuna, Jooble, JSearch), as the Find Jobs agent returns it. */
export interface FoundJob {
  id: string;
  title: string;
  company: string;
  location: string;
  description: string;
  url: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryIsPredicted: boolean;
  // Free-text salary when a source doesn't give yearly numbers (Jooble, hourly JSearch pay)
  salaryText?: string | null;
  contractTime: string | null;
  category: string | null;
  created: string | null;
  source?: string;
  // Site the listing was originally posted on, when the source reports it
  via?: string | null;
}
