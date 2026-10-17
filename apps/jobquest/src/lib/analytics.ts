// The data behind Analytics. The grouping is ported from the React app
// (pabloplico/jobquest@a9103e8, components/SkillDashboard.tsx) as it was: a skill
// goes in the first group with a keyword it contains, otherwise Other. One change:
// it groups each skill's canonical name, so merges on the Taxonomy page flow
// through to the charts.
import { countSkillDemand, normalizeSkill, type SkillTaxonomy } from '../../shared/skillMatcher';
import type { Job } from '../../shared/types';

export const ANALYTICS_GROUPS = [
  {
    name: 'Soft skills',
    color: '#1d4ed8',
    keywords: [
      'communication',
      'stakeholder',
      'leadership',
      'collaboration',
      'presentation',
      'teamwork',
      'interpersonal',
    ],
  },
  {
    name: 'Analytical skills',
    color: '#047857',
    keywords: [
      'problem solving',
      'analysis',
      'analytical',
      'critical thinking',
      'research',
      'troubleshooting',
    ],
  },
  {
    name: 'Delivery and ops',
    color: '#b45309',
    keywords: [
      'agile',
      'scrum',
      'documentation',
      'process',
      'project management',
      'kanban',
      'jira',
      'confluence',
    ],
  },
  {
    name: 'Productivity and enterprise',
    color: '#6d28d9',
    keywords: [
      'microsoft',
      'office',
      '365',
      'sharepoint',
      'teams',
      'excel',
      'word',
      'powerpoint',
      'outlook',
      'visio',
    ],
  },
  {
    name: 'Cloud and platforms',
    color: '#0e7490',
    keywords: ['azure', 'aws', 'cloud', 'gcp', 'google cloud', 'kubernetes', 'docker'],
  },
  {
    name: 'Dev and data',
    color: '#b91c1c',
    keywords: [
      'sql',
      'python',
      'javascript',
      'java',
      'c#',
      'power bi',
      'tableau',
      'r ',
      'data',
      'api',
      'rest',
      'react',
      'node',
      'git',
      'typescript',
    ],
  },
] as const;

export const OTHER_GROUP = { name: 'Other', color: '#4b5563' } as const;

export type AnalyticsGroupName = (typeof ANALYTICS_GROUPS)[number]['name'] | 'Other';

export const groupNames: AnalyticsGroupName[] = [
  ...ANALYTICS_GROUPS.map((group) => group.name),
  OTHER_GROUP.name,
];

export function groupColour(name: AnalyticsGroupName): string {
  return ANALYTICS_GROUPS.find((group) => group.name === name)?.color ?? OTHER_GROUP.color;
}

/** The analytics group of a (canonical) skill name. */
export function analyticsGroup(skill: string): AnalyticsGroupName {
  const lower = skill.toLowerCase();
  return (
    ANALYTICS_GROUPS.find((group) => group.keywords.some((keyword) => lower.includes(keyword)))
      ?.name ?? OTHER_GROUP.name
  );
}

type JobSkills = Pick<Job, 'skills' | 'software'>;

export interface SkillsByGroup {
  group: AnalyticsGroupName;
  /** Skills by how many jobs ask for them, most first. */
  skills: { name: string; count: number }[];
  total: number;
}

/** Demand per skill, in its group: the treemap and its table. Empty groups are left out. */
export function skillsByGroup(jobs: JobSkills[], taxonomy: SkillTaxonomy): SkillsByGroup[] {
  const demand = countSkillDemand(jobs, taxonomy);
  return groupNames
    .map((group) => {
      const skills = demand.filter((item) => analyticsGroup(item.name) === group);
      return { group, skills, total: skills.reduce((sum, item) => sum + item.count, 0) };
    })
    .filter((entry) => entry.skills.length > 0);
}

export interface GroupsByCategory {
  /** The radar's axes: every group but Other. */
  groups: AnalyticsGroupName[];
  /** One series per job category: how many of its jobs' skills fall in each group. */
  categories: { name: string; values: number[] }[];
}

/**
 * For each job category, how many skill mentions fall in each group (each skill
 * counted once per job). The old app counted every mention, so a job listing
 * "JS" and "JavaScript" counted twice; with canonical names it counts once.
 */
export function groupsByCategory(
  jobs: (JobSkills & Pick<Job, 'category'>)[],
  taxonomy: SkillTaxonomy
): GroupsByCategory {
  const groups = ANALYTICS_GROUPS.map((group) => group.name) as AnalyticsGroupName[];
  const counts = new Map<string, number[]>();
  for (const job of jobs) {
    const category = job.category ?? 'Other';
    const values = counts.get(category) ?? groups.map(() => 0);
    const skills = new Set(
      [...job.skills, ...job.software].map((skill) => normalizeSkill(skill, taxonomy))
    );
    for (const skill of skills) {
      const index = groups.indexOf(analyticsGroup(skill));
      if (index >= 0) values[index] = (values[index] ?? 0) + 1;
    }
    counts.set(category, values);
  }
  return {
    groups,
    categories: [...counts]
      .map(([name, values]) => ({ name, values }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
