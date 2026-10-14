import type { LinkProps } from '@tanstack/react-router';

/** An in-site route (type-checked against the router) or an external URL. */
export type ProjectLink =
  | { label: string; to: NonNullable<LinkProps['to']> }
  /** href null = not available yet; such links are not rendered. */
  | { label: string; href: string | null };

export interface ProjectImage {
  src: string;
  alt: string;
}

export interface Project {
  id: string;
  title: string;
  /** One-line description, used for short cards and as a fallback. */
  summary: string;
  problem?: string;
  solution?: string;
  highlights?: string[];
  stack: string[];
  links: ProjectLink[];
  image: ProjectImage | null;
  /** Short cards show only the summary. */
  variant?: 'full' | 'short';
}

export const PROJECTS: Project[] = [
  {
    id: 'document-workspace',
    title: 'Document workspace platform',
    summary:
      'A full-stack platform that turns uploaded documents into structured, versioned workspaces with AI-assisted editing.',
    problem:
      'My business planning documents were scattered across PDFs, notes and spreadsheets, and I couldn’t see what was missing.',
    solution:
      'A full-stack platform that parses uploaded documents, routes the content into structured workspaces, and lets you edit sections with AI, previewing each change as a diff before accepting it. Every edit is versioned and can be restored.',
    highlights: [
      'typed parsing pipeline with quality gates',
      'background job queues',
      'AI edits with diff preview',
      '1,000+ unit tests',
    ],
    stack: [
      'Next.js',
      'React 19',
      'TypeScript (strict)',
      'Postgres + pgvector',
      'Drizzle',
      'Redis/BullMQ',
      'AI SDK',
      'Vitest',
      'Playwright',
    ],
    links: [
      { label: 'Case study', href: null }, // TODO: case study page
      {
        label: 'Code',
        href: 'https://github.com/pabloplico/paulclarke.au/tree/main/apps/admin-portal',
      },
      { label: 'Demo video', href: null }, // TODO: demo video URL
    ],
    image: null, // TODO: screenshot of the AI edit diff preview
  },
  {
    id: 'ai-readiness-assessment',
    title: 'AI readiness assessment',
    summary:
      'A free self-assessment that scores AI readiness and gives tailored recommendations, with a printable report.',
    problem:
      'Small business owners hear about AI constantly but can’t tell where it would actually help them.',
    solution:
      'A free self-assessment that scores readiness across key areas and gives tailored recommendations, with a printable report. It’s built mobile-first, works fully by keyboard, and sends no data to a server.',
    highlights: [
      'accessible form patterns',
      'responsive layout',
      'print stylesheet',
      'tested with Playwright + axe',
    ],
    stack: [
      'React 19',
      'TypeScript',
      'Vite',
      'Tailwind v4',
      'Cloudflare Workers (static hosting)',
      'Vitest',
      'Playwright',
    ],
    links: [
      { label: 'Try it', to: '/assessment' },
      {
        label: 'Code',
        href: 'https://github.com/pabloplico/paulclarke.au/tree/main/apps/website/src/components/sections/assessment',
      },
    ],
    image: null, // TODO: screenshot of the results panel
  },
  {
    id: 'this-site',
    title: 'This site',
    summary:
      'A pnpm + NX monorepo with shared UI and config packages, cached tasks, CI that checks only what a pull request affects, and deployment to Cloudflare Workers.',
    stack: ['pnpm workspaces', 'NX', 'GitHub Actions', 'Cloudflare Workers'],
    links: [{ label: 'Code', href: 'https://github.com/pabloplico/paulclarke.au' }],
    image: null,
    variant: 'short',
  },
  // TODO: placeholder slot for the Vue 3 version of the assessment (after phase 4)
];
