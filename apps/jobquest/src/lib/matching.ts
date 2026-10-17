// How the visitor's skills compare with a job and with the market (their saved
// jobs). Pure functions over skillMatcher; useSkillMatch wraps them reactively.
import {
  countSkillDemand,
  findBestMatch,
  matchSkills,
  type SkillDemand,
  type SkillTaxonomy,
} from '../../shared/skillMatcher';
import type { Job } from '../../shared/types';

/** A job skill counts as one the visitor has from this confidence up (as in the old app). */
export const MATCH_CONFIDENCE = 80;

/**
 * Adding a skill this close to one the visitor has is refused as a duplicate:
 * exact, synonym (95) and near-typo (85 to 90) matches, but not the looser
 * contains rule (80), so "React Native" can be added beside "React".
 */
export const DUPLICATE_CONFIDENCE = 85;

/** The visitor's skill that `name` would duplicate, if any. */
export function duplicateOf<T extends { name: string }>(
  name: string,
  skills: T[],
  taxonomy: SkillTaxonomy
): T | undefined {
  return skills.find(
    (skill) => matchSkills(skill.name, name, taxonomy).confidence >= DUPLICATE_CONFIDENCE
  );
}

/** How many gaps My Skills & Gaps lists. */
export const TOP_GAPS = 15;

export function hasSkill(skill: string, skillNames: string[], taxonomy: SkillTaxonomy): boolean {
  const match = findBestMatch(skill, skillNames, taxonomy);
  return match !== null && match.confidence >= MATCH_CONFIDENCE;
}

export interface JobMatch {
  matched: string[];
  missing: string[];
  /** Null when there's nothing to compare: the job lists no skills, or the visitor has none. */
  percentage: number | null;
}

/** The job's skills and software the visitor has and lacks, and the share they have. */
export function matchJob(
  job: Pick<Job, 'skills' | 'software'>,
  skillNames: string[],
  taxonomy: SkillTaxonomy
): JobMatch {
  const wanted = [...job.skills, ...job.software];
  const matched = wanted.filter((skill) => hasSkill(skill, skillNames, taxonomy));
  const missing = wanted.filter((skill) => !matched.includes(skill));
  const percentage =
    wanted.length === 0 || skillNames.length === 0
      ? null
      : Math.round((matched.length / wanted.length) * 100);
  return { matched, missing, percentage };
}

export interface MarketFit {
  /** Skills the market wants that the visitor has, most wanted first. */
  matched: SkillDemand[];
  /** The most wanted skills the visitor lacks, at most TOP_GAPS. */
  gaps: SkillDemand[];
}

export function marketFit(
  jobs: Pick<Job, 'skills' | 'software'>[],
  skillNames: string[],
  taxonomy: SkillTaxonomy
): MarketFit {
  const demand = countSkillDemand(jobs, taxonomy);
  const matched = demand.filter((item) => hasSkill(item.name, skillNames, taxonomy));
  const gaps = demand.filter((item) => !matched.includes(item)).slice(0, TOP_GAPS);
  return { matched, gaps };
}
