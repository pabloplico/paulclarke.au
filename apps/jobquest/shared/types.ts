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

// The AI's market taxonomy (J6): a tree of categories, the same shape from every
// provider. Shown, not stored.
export const taxonomyCategorySchema = z.object({
  name: z.string(),
  subcategories: z.array(z.object({ name: z.string(), items: z.array(z.string()) })),
});
export type TaxonomyCategory = z.infer<typeof taxonomyCategorySchema>;

/** A group skills can belong to on the Taxonomy page, such as "Front end". */
export const skillGroupSchema = z.object({
  id: z.string().min(1).max(60),
  name: z.string().trim().min(1, 'Enter a group name').max(60),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
});
export type SkillGroup = z.infer<typeof skillGroupSchema>;

/** How skill names are stored in a taxonomy: trimmed and lower-case, as normalizeSkill looks them up. */
export const normaliseSkillName = (name: string) => name.trim().toLowerCase();
const isNormalised = (name: string) => name.length > 0 && name === normaliseSkillName(name);
const skillName = z
  .string()
  .max(100)
  .refine(isNormalised, 'Skill names are trimmed and lower-case');

export const MAX_TAXONOMY_ENTRIES = 2000;

/**
 * A visitor's taxonomy. `canonicalMap` maps a synonym to the name it counts as;
 * `skillGroups` maps a canonical name to the ids of the groups it's in. The rules
 * below are what skillMatcher relies on (it looks a name up once), so the API
 * refuses a taxonomy that breaks them.
 */
export const taxonomySchema = z
  .object({
    // Stored as "categories" (the D1 column and the old app's name): the skill groups
    categories: z.array(skillGroupSchema).max(100),
    canonicalMap: z.record(skillName, skillName),
    skillGroups: z.record(skillName, z.array(z.string().min(1).max(60)).max(50)),
  })
  .superRefine((taxonomy, ctx) => {
    const synonyms = Object.entries(taxonomy.canonicalMap);
    if (synonyms.length > MAX_TAXONOMY_ENTRIES) {
      ctx.addIssue({ code: 'custom', message: 'Too many merged skills', path: ['canonicalMap'] });
    }
    if (Object.keys(taxonomy.skillGroups).length > MAX_TAXONOMY_ENTRIES) {
      ctx.addIssue({ code: 'custom', message: 'Too many grouped skills', path: ['skillGroups'] });
    }
    for (const [synonym, canonical] of synonyms) {
      if (synonym === canonical) {
        ctx.addIssue({
          code: 'custom',
          message: `${synonym} counts as itself`,
          path: ['canonicalMap'],
        });
      } else if (canonical in taxonomy.canonicalMap) {
        ctx.addIssue({
          code: 'custom',
          message: `${synonym} counts as ${canonical}, which counts as something else`,
          path: ['canonicalMap'],
        });
      }
    }
    for (const skill of Object.keys(taxonomy.skillGroups)) {
      if (skill in taxonomy.canonicalMap) {
        ctx.addIssue({
          code: 'custom',
          message: `${skill} counts as another skill, so it can't have groups of its own`,
          path: ['skillGroups'],
        });
      }
    }
    const ids = taxonomy.categories.map((group) => group.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: 'custom', message: 'Group ids must be unique', path: ['categories'] });
    }
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
