import {
  BookOpen,
  ChevronRight,
  ExternalLink,
  FileText,
  Inbox,
  LayoutDashboard,
  MessageSquare,
  Search,
  ShieldCheck,
} from 'lucide-react';

const workflowSteps = [
  {
    step: 1,
    title: 'Create Workspace',
    description: 'Pick a template or start blank.',
  },
  {
    step: 2,
    title: 'Add Sections',
    description: 'Prose, cards, tables, checklists, or key-value pairs.',
  },
  {
    step: 3,
    title: 'Set Rules',
    description: 'Define expected content and section dependencies.',
  },
  {
    step: 4,
    title: 'Ingest Documents',
    description: 'Drop files into the Inbox or Documents page.',
  },
  {
    step: 5,
    title: 'Preview & Approve',
    description: 'Review AI routing suggestions, approve or skip.',
  },
  {
    step: 6,
    title: 'Edit Sections',
    description: 'Refine content with inline AI editing.',
  },
  {
    step: 7,
    title: 'Analyse Gaps',
    description: 'Find missing content and fix with AI.',
  },
];

const features = [
  {
    icon: LayoutDashboard,
    title: 'Workspaces',
    description: 'Typed sections, version history, inline editing, workspace chat.',
  },
  {
    icon: Inbox,
    title: 'Inbox',
    description: 'AI-powered document routing to workspace sections.',
  },
  {
    icon: FileText,
    title: 'Documents',
    description: 'Manage files, review chunks, reprocess, send to inbox.',
  },
  {
    icon: MessageSquare,
    title: 'Chat',
    description: 'Workspace-scoped AI with full section context.',
  },
  {
    icon: ShieldCheck,
    title: 'Gap Analysis',
    description: 'Health checks, severity findings, one-click AI fixes.',
  },
  {
    icon: Search,
    title: 'Search',
    description: 'Cmd+K to search across all workspaces.',
  },
];

const tips = [
  'Select text in any section for AI rewriting via the floating toolbar.',
  'All section edits are versioned — roll back anytime.',
  'Send documents back to inbox from the Documents page for fresh routing.',
  'Toggle section numbering in workspace settings for structured docs.',
];

export default function GuidePage() {
  return (
    <div className="px-10 py-10">
      {/* Header */}
      <div className="mb-10 flex items-center gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <BookOpen className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-semibold">Getting Started</h1>
          <p className="text-sm text-muted-foreground">
            Typical workflow from workspace creation to gap analysis.
          </p>
        </div>
      </div>

      {/* Workflow — horizontal pipeline */}
      <div className="mb-12">
        <h2 className="mb-5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Workflow
        </h2>
        <div className="flex flex-col sm:flex-row items-start">
          {workflowSteps.map((item, i) => (
            <div key={item.step} className="flex items-start flex-1 min-w-0">
              <div className="flex flex-col items-center text-center px-4 flex-1">
                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-xs font-semibold text-primary mb-3">
                  {item.step}
                </div>
                <h3 className="text-xs font-medium leading-tight">{item.title}</h3>
                <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                  {item.description}
                </p>
              </div>
              {i < workflowSteps.length - 1 && (
                <ChevronRight className="h-4 w-4 text-white/10 mt-2 shrink-0" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Features */}
      <div className="mb-10">
        <h2 className="mb-5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Features
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((feature) => (
            <div key={feature.title} className="rounded-lg border border-border bg-card p-5">
              <div className="mb-2 flex items-center gap-2.5">
                <feature.icon className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-medium">{feature.title}</h3>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tips */}
      <div className="mb-10">
        <h2 className="mb-5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Tips
        </h2>
        <div className="flex flex-col sm:flex-row gap-4 sm:gap-8">
          {tips.map((tip) => (
            <p
              key={tip}
              className="flex-1 text-xs leading-relaxed text-muted-foreground flex items-start gap-2"
            >
              <span className="mt-0.5 text-primary/40">&#x2022;</span>
              <span>{tip}</span>
            </p>
          ))}
        </div>
      </div>

      {/* Contact */}
      <div className="flex justify-center">
        <a
          href="https://paulclarke.au/#contact"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2.5 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
        >
          Report bugs or suggest improvements
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    </div>
  );
}
