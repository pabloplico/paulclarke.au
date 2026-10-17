// What a new profile starts with: a few fictional, already-analysed jobs (so
// the job list, match % and gaps have something to show), no skills (so the
// visitor starts on My Skills & Gaps) and the built-in taxonomy. Every company
// and posting here is made up. Never put real data here.
import type { SeniorityLevel } from '../shared/types';

export interface SeedJob {
  title: string;
  company: string;
  rawText: string;
  skills: string[];
  software: string[];
  requirements: string[];
  salaryRange: string | null;
  seniorityLevel: SeniorityLevel;
  category: string;
  positionSubcategory: string;
  url: string | null;
  notes: string | null;
}

export const SEED_JOBS: SeedJob[] = [
  {
    title: 'Frontend Developer',
    company: 'Saltwater Digital',
    rawText:
      'Saltwater Digital builds booking platforms for tour operators. You will build accessible Vue 3 interfaces with TypeScript, work with designers on a shared component library and write tests for everything you ship.',
    skills: ['Vue', 'TypeScript', 'JavaScript', 'Accessibility', 'CSS'],
    software: ['Vite', 'Vitest', 'Figma', 'Git'],
    requirements: [
      '3+ years building production web apps',
      'Experience with a component-driven design system',
      'Comfortable writing unit and end-to-end tests',
    ],
    salaryRange: '$105,000 – $125,000',
    seniorityLevel: 'mid',
    category: 'Technology',
    positionSubcategory: 'Developer',
    url: null,
    notes: null,
  },
  {
    title: 'Senior React Engineer',
    company: 'Copperleaf Software',
    rawText:
      'Copperleaf Software makes scheduling tools for clinics. As a senior engineer you will lead the move of a large React app to TypeScript, mentor two developers and own front-end performance.',
    skills: ['React', 'TypeScript', 'Performance optimisation', 'Mentoring', 'REST APIs'],
    software: ['Next.js', 'Jest', 'GitHub Actions', 'Sentry'],
    requirements: [
      '5+ years with React',
      'Led a migration or large refactor',
      'Clear written communication',
    ],
    salaryRange: '$140,000 – $160,000',
    seniorityLevel: 'senior',
    category: 'Technology',
    positionSubcategory: 'Developer',
    url: null,
    notes: null,
  },
  {
    title: 'QA Automation Engineer',
    company: 'Brightwater Freight',
    rawText:
      'Brightwater Freight is building a new shipment tracking portal. You will design the automated test suite, run it in CI and work with developers to keep releases safe.',
    skills: ['Test automation', 'JavaScript', 'API testing', 'CI/CD'],
    software: ['Playwright', 'Postman', 'GitHub Actions', 'Jira'],
    requirements: [
      'Experience building an automated test suite from scratch',
      'Understands accessibility testing',
    ],
    salaryRange: '$95,000 – $110,000',
    seniorityLevel: 'mid',
    category: 'Technology',
    positionSubcategory: 'QA/Testing',
    url: null,
    notes: null,
  },
  {
    title: 'Junior Web Developer',
    company: 'Tidepool Analytics',
    rawText:
      'Tidepool Analytics turns water-quality sensor data into dashboards for councils. Join a small team building charts and forms in Vue, with plenty of support while you learn.',
    skills: ['JavaScript', 'HTML', 'CSS', 'Vue', 'Data visualisation'],
    software: ['Git', 'VS Code', 'ECharts'],
    requirements: ['A portfolio of web projects', 'Keen to learn TypeScript'],
    salaryRange: '$70,000 – $80,000',
    seniorityLevel: 'junior',
    category: 'Technology',
    positionSubcategory: 'Developer',
    url: null,
    notes: null,
  },
  {
    title: 'Full Stack Developer',
    company: 'Canopy Health Systems',
    rawText:
      'Canopy Health Systems runs patient portals for regional hospitals. You will work across a TypeScript front end and a Node.js API on PostgreSQL, with a strong focus on security and accessibility.',
    skills: ['TypeScript', 'Node.js', 'React', 'SQL', 'Accessibility', 'Security'],
    software: ['PostgreSQL', 'Docker', 'AWS', 'Git'],
    requirements: [
      'Experience with both front-end and back-end work',
      'Knowledge of secure coding practices',
      'Australian work rights',
    ],
    salaryRange: '$120,000 – $135,000',
    seniorityLevel: 'mid',
    category: 'Healthcare',
    positionSubcategory: 'Developer',
    url: null,
    notes: null,
  },
  {
    title: 'UI Engineer, Design Systems',
    company: 'Lumen & Reed',
    rawText:
      'Lumen & Reed is a product studio. You will build and document our design system in Storybook, work closely with designers and make sure every component meets WCAG 2.2 AA.',
    skills: ['Design systems', 'Accessibility', 'CSS', 'TypeScript', 'Vue'],
    software: ['Storybook', 'Figma', 'Tailwind CSS', 'Chromatic'],
    requirements: ['Built or maintained a component library', 'Strong eye for visual detail'],
    salaryRange: null,
    seniorityLevel: 'senior',
    category: 'Design',
    positionSubcategory: 'Design',
    url: null,
    notes: null,
  },
];
