import type {
  adminSectionVersions,
  adminWorkspaceSections,
  adminWorkspaces,
  GapFinding,
} from '@/lib/db/schema';

// ── Base Types (inferred from schema) ───────────────────────────────────────

export type Workspace = typeof adminWorkspaces.$inferSelect;
export type WorkspaceInsert = typeof adminWorkspaces.$inferInsert;

export type WorkspaceSection = typeof adminWorkspaceSections.$inferSelect;
export type WorkspaceSectionInsert = typeof adminWorkspaceSections.$inferInsert;

export type SectionVersion = typeof adminSectionVersions.$inferSelect;
export type SectionVersionInsert = typeof adminSectionVersions.$inferInsert;

// ── Template Types ──────────────────────────────────────────────────────────

export type SectionTemplate = 'prose' | 'cards' | 'table' | 'checklist' | 'kv-pairs' | 'heading';

export type ChangeSource = 'manual' | 'ai_ingest' | 'ai_edit' | 'ai_gap_fill';

// ── Structured Data Shapes ──────────────────────────────────────────────────

export type CardsData = {
  items: { title: string; body: string; tags?: string[] }[];
};

export type TableData = {
  columns: string[];
  rows: Record<string, string>[];
  showHeader?: boolean;
};

export type ChecklistData = {
  items: { text: string; checked: boolean }[];
};

export type KvPairsData = {
  pairs: { key: string; value: string }[];
};

export type StructuredData = CardsData | TableData | ChecklistData | KvPairsData;

// ── Dependency Types ───────────────────────────────────────────────────────

export type SectionDependency = {
  id: number;
  dependsOnSectionId: number;
  dependsOnSectionTitle: string;
  dependsOnWorkspaceSlug: string;
  dependsOnWorkspaceTitle: string;
  relationType: string;
  description: string | null;
  isStale: boolean;
};

export type SectionDependent = {
  id: number;
  sectionId: number;
  sectionTitle: string;
  workspaceSlug: string;
  workspaceTitle: string;
  relationType: string;
};

// ── Enriched Types (API responses) ──────────────────────────────────────────

export type WorkspaceHealth = 'green' | 'yellow' | 'red' | null;

export type DocumentSource = {
  id: number;
  title: string;
  source: string | null;
  sourceUrl: string | null;
};

export type FindingSource = {
  id: number;
  title: string;
  findingType: string;
  confidenceScore: number;
  url: string | null;
};

export type WorkspaceWithCounts = Workspace & {
  sectionCount: number;
  lastUpdated: Date | null;
  health: WorkspaceHealth;
  findings: GapFinding[] | null;
  completeness: number | null;
};

export type SectionWithContent = WorkspaceSection & {
  latestVersion: SectionVersion | null;
  sources: DocumentSource[];
  findingSources?: FindingSource[];
  dependencies?: SectionDependency[];
  dependents?: SectionDependent[];
};

export type WorkspaceDetail = Workspace & {
  sections: SectionWithContent[];
};

export type SectionTreeNode = SectionWithContent & {
  children: SectionTreeNode[];
  depth: number;
};

export type AllSectionItem = {
  id: number;
  title: string;
  workspaceId: number;
  workspaceSlug: string;
  workspaceTitle: string;
};
