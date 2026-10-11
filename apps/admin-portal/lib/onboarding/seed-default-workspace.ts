import { db } from '@/lib/db';
import { adminSectionVersions, adminWorkspaceSections, adminWorkspaces } from '@/lib/db/schema';

type SectionDef = {
  slug: string;
  title: string;
  description: string;
  template: string;
  sortOrder: number;
  content?: string;
  structuredData?: Record<string, unknown>;
};

const SECTIONS: SectionDef[] = [
  {
    slug: 'welcome',
    title: 'Welcome',
    description: 'Start here — an overview of how workspaces work',
    template: 'prose',
    sortOrder: 0,
    content: `## Welcome to your first workspace!

A **workspace** is where you organize knowledge about a topic. Each workspace is made up of **sections** — like this one.

### What you can do here

- **Edit any section** by clicking the edit button in the top-right corner of each section
- **Select text** while editing to get AI rewriting suggestions
- **View version history** to see how a section has changed over time
- **Run Gap Analysis** from the sidebar to find missing content

This workspace has example sections showing each section type. Try editing them!`,
  },
  {
    slug: 'example-cards',
    title: 'Features to Try',
    description: 'Key features shown as cards — try adding or editing one',
    template: 'cards',
    sortOrder: 1,
    structuredData: {
      items: [
        {
          title: 'Inbox',
          body: 'Drop files (PDF, DOCX, CSV, Markdown) into the Inbox. They get processed automatically and routed to the right workspace using AI.',
          tags: ['try-it'],
        },
        {
          title: 'AI Editing',
          body: 'Select any text in a section, and a floating toolbar appears. Ask AI to rewrite, expand, or summarize — then review the diff before accepting.',
          tags: ['try-it'],
        },
        {
          title: 'Chat',
          body: "Open the chat panel in any workspace. The AI can answer questions using the full context of that workspace's sections.",
          tags: ['try-it'],
        },
        {
          title: 'Gap Analysis',
          body: 'Run a health check on any workspace to find incomplete sections, missing content, or areas that need attention.',
          tags: ['try-it'],
        },
      ],
    },
  },
  {
    slug: 'example-table',
    title: 'Keyboard Shortcuts',
    description: 'Useful shortcuts — this is a table section',
    template: 'table',
    sortOrder: 2,
    structuredData: {
      columns: ['Shortcut', 'Action', 'Where'],
      rows: [
        { Shortcut: 'Cmd/Ctrl + K', Action: 'Open search', Where: 'Anywhere' },
        { Shortcut: 'Click edit icon', Action: 'Edit a section', Where: 'Any section' },
        { Shortcut: 'Select text', Action: 'AI rewrite toolbar', Where: 'While editing' },
      ],
    },
  },
  {
    slug: 'example-checklist',
    title: 'Getting Started Checklist',
    description: 'Track your onboarding progress — this is a checklist section',
    template: 'checklist',
    sortOrder: 3,
    structuredData: {
      items: [
        { text: 'Read through this workspace', checked: false },
        { text: 'Edit a section (try changing this checklist!)', checked: false },
        { text: 'Create a new workspace from the Workspaces page', checked: false },
        { text: 'Upload a file to the Inbox', checked: false },
        { text: 'Try the search bar (Cmd/Ctrl + K)', checked: false },
        { text: 'Open the chat panel and ask a question', checked: false },
        { text: 'Run Gap Analysis on this workspace', checked: false },
      ],
    },
  },
  {
    slug: 'example-kv',
    title: 'Your Setup',
    description: 'Key-value pairs — great for quick-reference info',
    template: 'kv-pairs',
    sortOrder: 4,
    structuredData: {
      pairs: [
        { key: 'Section Types', value: 'Prose, Cards, Table, Checklist, Key-Value' },
        { key: 'AI Features', value: 'Inline editing, Chat, Gap Analysis, Inbox routing' },
        { key: 'Search', value: 'Cmd/Ctrl + K from anywhere' },
        { key: 'Help', value: 'Click the ? icon in the top bar' },
      ],
    },
  },
];

export async function seedDefaultWorkspace(userId: number) {
  const slug = `getting-started-u${userId}`;

  const [workspace] = await db
    .insert(adminWorkspaces)
    .values({
      slug,
      title: 'Getting Started',
      description: 'Your first workspace — explore features and learn how things work',
      icon: 'rocket',
      sortOrder: 0,
      userId,
    })
    .returning();

  if (!workspace) return;

  for (const sec of SECTIONS) {
    const [section] = await db
      .insert(adminWorkspaceSections)
      .values({
        workspaceId: workspace.id,
        slug: sec.slug,
        title: sec.title,
        description: sec.description,
        template: sec.template,
        sortOrder: sec.sortOrder,
      })
      .returning();

    if (!section) continue;

    await db.insert(adminSectionVersions).values({
      sectionId: section.id,
      version: 1,
      content: sec.content || null,
      structuredData: sec.structuredData || null,
      changeDescription: 'Initial content',
      changeSource: 'manual',
    });
  }
}
