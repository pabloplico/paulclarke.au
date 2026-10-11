import type { CompletenessRule } from '@/lib/db/schema';

export interface WorkspaceTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  sections: {
    title: string;
    slug: string;
    template: 'prose' | 'cards' | 'table' | 'checklist' | 'kv-pairs';
    description: string;
    starterContent?: string;
    completenessRules?: CompletenessRule[];
    dependencies?: {
      targetWorkspaceId: string;
      targetSlug: string;
      relationType: 'derived_from' | 'summarizes' | 'requires' | 'references';
      description?: string;
    }[];
  }[];
}

export const WORKSPACE_TEMPLATES: WorkspaceTemplate[] = [
  {
    id: 'client-project',
    name: 'Client Project',
    description: 'Track a client engagement from kickoff to delivery',
    icon: 'briefcase',
    sections: [
      {
        title: 'Project Overview',
        slug: 'project-overview',
        template: 'prose',
        description: 'Goals, scope, and key stakeholders',
        starterContent: '## Objectives\n\n## Scope\n\n## Key Stakeholders\n\n## Timeline\n',
      },
      {
        title: 'Requirements',
        slug: 'requirements',
        template: 'checklist',
        description: 'Requirements and acceptance criteria',
      },
      {
        title: 'Deliverables',
        slug: 'deliverables',
        template: 'cards',
        description: 'Project deliverables and their status',
      },
      {
        title: 'Meeting Notes',
        slug: 'meeting-notes',
        template: 'prose',
        description: 'Notes from client meetings and calls',
      },
      {
        title: 'Key Decisions',
        slug: 'key-decisions',
        template: 'table',
        description: 'Decision log with rationale',
      },
    ],
  },
  {
    id: 'product-launch',
    name: 'Product Launch',
    description: 'Plan and track a product or service launch',
    icon: 'building-2',
    sections: [
      {
        title: 'Launch Plan',
        slug: 'launch-plan',
        template: 'prose',
        description: 'Overall launch strategy and timeline',
        starterContent: '## Launch Date\n\n## Target Audience\n\n## Key Messages\n\n## Channels\n',
      },
      {
        title: 'Pre-Launch Checklist',
        slug: 'pre-launch-checklist',
        template: 'checklist',
        description: 'Tasks to complete before launch',
      },
      {
        title: 'Marketing Assets',
        slug: 'marketing-assets',
        template: 'cards',
        description: 'Content, collateral, and campaign materials',
      },
      {
        title: 'Launch Metrics',
        slug: 'launch-metrics',
        template: 'kv-pairs',
        description: 'KPIs and success metrics',
      },
    ],
  },
  {
    id: 'research-topic',
    name: 'Research Topic',
    description: 'Deep-dive research on a specific topic',
    icon: 'book-open',
    sections: [
      {
        title: 'Summary',
        slug: 'summary',
        template: 'prose',
        description: 'Executive summary of findings',
      },
      {
        title: 'Key Findings',
        slug: 'key-findings',
        template: 'cards',
        description: 'Individual research findings',
      },
      {
        title: 'Sources & References',
        slug: 'sources-references',
        template: 'table',
        description: 'Reference materials and links',
      },
      {
        title: 'Open Questions',
        slug: 'open-questions',
        template: 'checklist',
        description: 'Questions still to be answered',
      },
    ],
  },
  {
    id: 'market-research',
    name: 'Market Research',
    description: 'AI-powered research workspace with agents, sources, and findings',
    icon: 'bar-chart-3',
    sections: [
      {
        title: 'Executive Summary',
        slug: 'executive-summary',
        template: 'prose',
        description: 'High-level overview of research findings',
      },
      {
        title: 'Key Trends',
        slug: 'key-trends',
        template: 'prose',
        description: 'Major trends identified in the market',
      },
      {
        title: 'Competitive Landscape',
        slug: 'competitive-landscape',
        template: 'prose',
        description: 'Competitor analysis and positioning',
      },
      {
        title: 'Regulatory Environment',
        slug: 'regulatory-environment',
        template: 'prose',
        description: 'Regulatory and compliance landscape',
      },
      {
        title: 'Recommendations',
        slug: 'recommendations',
        template: 'prose',
        description: 'Strategic recommendations based on findings',
      },
    ],
  },
  {
    id: 'custom',
    name: 'Custom Workspace',
    description: 'Build your own workspace with custom sections',
    icon: 'clipboard-list',
    sections: [],
  },
];
