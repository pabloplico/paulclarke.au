// Skill normalisation and matching. Ported from pabloplico/jobquest@a9103e8
// (utils/skillMatcher.ts) under strict TS and noUncheckedIndexedAccess.
//
// Pure functions: the taxonomy is an argument, not module state. In the React
// app, configureTaxonomy() set it globally, which is why <App> needed a key per
// profile; here each caller passes the profile's taxonomy (useSkillMatch).
import type { Taxonomy } from './types';

/** The parts of a taxonomy that matching reads. */
export type SkillTaxonomy = Pick<Taxonomy, 'canonicalMap' | 'skillGroups'>;

export interface SkillMatch {
  matched: boolean;
  confidence: number; // 0-100
  method: 'exact' | 'normalized' | 'fuzzy' | 'ai' | 'none';
  normalizedSkill?: string;
}

// Common skill variations and their normalised forms (synonym -> canonical)
export const DEFAULT_SKILL_CANONICAL_MAP: Record<string, string> = {
  // JavaScript
  js: 'javascript',
  ecmascript: 'javascript',
  es6: 'javascript',
  es2015: 'javascript',

  // TypeScript
  ts: 'typescript',

  // React
  reactjs: 'react',
  'react.js': 'react',

  // Node
  node: 'node.js',
  nodejs: 'node.js',
  'node js': 'node.js',

  // Python
  py: 'python',
  python3: 'python',

  // GitHub/GitLab casing
  'git hub': 'github',
  'git hub actions': 'github actions',

  // Databases
  postgres: 'postgresql',
  postgre: 'postgresql',
  mongo: 'mongodb',

  // Cloud acronyms
  gcp: 'google cloud platform',
  'google cloud': 'google cloud platform',
  aws: 'amazon web services',

  // CI/CD
  cicd: 'ci/cd',
  'continuous integration': 'ci/cd',
  'continuous deployment': 'ci/cd',

  // APIs
  restful: 'rest',
  'rest apis': 'rest',
  'rest api': 'rest',

  // Web basics
  html5: 'html',
  css3: 'css',
};

// Canonical -> groups (one-to-many taxonomy)
export const DEFAULT_SKILL_GROUPS: Record<string, string[]> = {
  javascript: ['frontend', 'programming-language'],
  typescript: ['frontend', 'programming-language'],
  react: ['frontend', 'framework'],
  'node.js': ['backend', 'runtime'],
  python: ['programming-language', 'backend'],

  git: ['version-control', 'devtools'],
  github: ['version-control', 'devtools'],
  gitlab: ['version-control', 'devtools'],

  postgresql: ['database', 'sql'],
  mysql: ['database', 'sql'],
  mongodb: ['database', 'nosql'],

  'amazon web services': ['cloud'],
  'microsoft azure': ['cloud'],
  'google cloud platform': ['cloud'],

  'ci/cd': ['devops'],
  'github actions': ['devops', 'ci/cd'],

  rest: ['api'],
  graphql: ['api'],

  testing: ['quality'],
  'automated testing': ['quality', 'testing'],
  'quality assurance': ['quality'],

  scrum: ['agile'],
  kanban: ['agile'],

  html: ['frontend'],
  css: ['frontend'],
};

/** The built-in maps. A profile's own taxonomy replaces them; it isn't merged with them. */
export const DEFAULT_TAXONOMY: SkillTaxonomy = {
  canonicalMap: DEFAULT_SKILL_CANONICAL_MAP,
  skillGroups: DEFAULT_SKILL_GROUPS,
};

/**
 * Normalise a skill name to its canonical form
 */
export function normalizeSkill(skill: string, taxonomy: SkillTaxonomy): string {
  const cleaned = skill.toLowerCase().trim();
  return taxonomy.canonicalMap[cleaned] || cleaned;
}

/**
 * Get the groups associated with a skill
 */
export function getSkillGroups(skill: string, taxonomy: SkillTaxonomy): string[] {
  const canonical = normalizeSkill(skill, taxonomy);
  return taxonomy.skillGroups[canonical] || [];
}

/**
 * Levenshtein distance between two strings, one row at a time
 */
function levenshteinDistance(str1: string, str2: string): number {
  let previous = Array.from({ length: str1.length + 1 }, (_, j) => j);

  for (let i = 1; i <= str2.length; i++) {
    const current = [i];
    for (let j = 1; j <= str1.length; j++) {
      const substitution = (previous[j - 1] ?? 0) + (str2[i - 1] === str1[j - 1] ? 0 : 1);
      const insertion = (current[j - 1] ?? 0) + 1;
      const deletion = (previous[j] ?? 0) + 1;
      current[j] = Math.min(substitution, insertion, deletion);
    }
    previous = current;
  }

  return previous[str1.length] ?? 0;
}

/**
 * Similarity percentage between two strings
 */
export function calculateSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 100;

  const distance = levenshteinDistance(longer, shorter);
  const similarity = ((longer.length - distance) / longer.length) * 100;

  return Math.round(similarity);
}

/**
 * Whether one skill contains another (for partial matches)
 */
function containsMatch(skill1: string, skill2: string): boolean {
  const s1 = skill1.toLowerCase();
  const s2 = skill2.toLowerCase();

  // Any significant word (longer than 3 characters) in both
  const words1 = s1.split(/\s+/);
  const words2 = s2.split(/\s+/);
  for (const word1 of words1) {
    if (word1.length > 3 && words2.includes(word1)) {
      return true;
    }
  }

  return s1.includes(s2) || s2.includes(s1);
}

/**
 * Match two skills: exact, then normalised, then fuzzy, then contains
 */
export function matchSkills(
  userSkill: string,
  jobSkill: string,
  taxonomy: SkillTaxonomy
): SkillMatch {
  const user = userSkill.toLowerCase().trim();
  const job = jobSkill.toLowerCase().trim();

  // 1. Exact match (case-insensitive)
  if (user === job) {
    return { matched: true, confidence: 100, method: 'exact', normalizedSkill: user };
  }

  // 2. Normalised match
  const normalizedUser = normalizeSkill(user, taxonomy);
  const normalizedJob = normalizeSkill(job, taxonomy);
  if (normalizedUser === normalizedJob) {
    return { matched: true, confidence: 95, method: 'normalized', normalizedSkill: normalizedUser };
  }

  // 3. Fuzzy string matching
  const similarity = calculateSimilarity(user, job);
  if (similarity >= 85) {
    return {
      matched: true,
      confidence: Math.min(90, similarity),
      method: 'fuzzy',
      normalizedSkill: job,
    };
  }

  // 4. Contains match (one skill contains another)
  if (containsMatch(user, job)) {
    return { matched: true, confidence: 80, method: 'fuzzy', normalizedSkill: job };
  }

  return { matched: false, confidence: similarity, method: 'none' };
}

/**
 * The best matching user skill for a job skill
 */
export function findBestMatch(
  jobSkill: string,
  userSkills: string[],
  taxonomy: SkillTaxonomy
): SkillMatch | null {
  let bestMatch: SkillMatch | null = null;

  for (const userSkill of userSkills) {
    const match = matchSkills(userSkill, jobSkill, taxonomy);
    if (match.matched && (!bestMatch || match.confidence > bestMatch.confidence)) {
      bestMatch = match;
    }
  }

  return bestMatch;
}

export type SkillDemand = { name: string; count: number };

/**
 * How many jobs mention each skill, by canonical name (so taxonomy merges apply),
 * counting each job at most once per skill. Most-mentioned first.
 * `fields` picks which job lists to read; by default both skills and software.
 */
export function countSkillDemand(
  jobs: Array<{ skills: string[]; software: string[] }>,
  taxonomy: SkillTaxonomy,
  fields: Array<'skills' | 'software'> = ['skills', 'software']
): SkillDemand[] {
  const counts: Record<string, number> = {};
  for (const job of jobs) {
    const names = fields
      .flatMap((f) => job[f] ?? [])
      .map((skill) => normalizeSkill(skill, taxonomy));
    for (const name of new Set(names)) {
      counts[name] = (counts[name] ?? 0) + 1;
    }
  }
  return Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}
