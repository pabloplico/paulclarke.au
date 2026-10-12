import { relations, sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  varchar,
  vector,
} from 'drizzle-orm/pg-core';
import { adminUsers } from './base';
import { adminDocuments } from './documents';
import { adminAgentTasks, adminFindings, adminResearchSources } from './research';

// ── Workspaces ──────────────────────────────────────────────────────────────

export const adminWorkspaces = pgTable('admin_workspaces', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: integer().references(() => adminUsers.id, { onDelete: 'cascade' }),
  slug: varchar({ length: 100 }).notNull().unique(),
  title: varchar({ length: 255 }).notNull(),
  description: text(),
  icon: varchar({ length: 50 }),
  category: varchar({ length: 100 }),
  sortOrder: integer().notNull().default(0),
  metadata: jsonb().$type<Record<string, unknown>>(),
  archivedAt: timestamp(),
  createdAt: timestamp().defaultNow().notNull(),
  updatedAt: timestamp().defaultNow().notNull(),
});

// ── Workspace Sections ──────────────────────────────────────────────────────

export const adminWorkspaceSections = pgTable(
  'admin_workspace_sections',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    workspaceId: integer()
      .notNull()
      .references(() => adminWorkspaces.id, { onDelete: 'cascade' }),
    slug: varchar({ length: 100 }).notNull(),
    title: varchar({ length: 255 }).notNull(),
    description: text(),
    template: varchar({ length: 20 }).notNull().default('prose'),
    parentSectionId: integer('parentSectionId'),
    sortOrder: integer().notNull().default(0),
    completenessRules: jsonb().$type<CompletenessRule[]>(),
    metadata: jsonb().$type<Record<string, unknown>>(),
    createdAt: timestamp().defaultNow().notNull(),
    updatedAt: timestamp().defaultNow().notNull(),
  },
  (table) => [
    index('admin_ws_section_ws_idx').on(table.workspaceId),
    index('admin_ws_section_parent_idx').on(table.parentSectionId),
    index('admin_ws_section_ws_parent_idx').on(table.workspaceId, table.parentSectionId),
    uniqueIndex('admin_ws_section_slug_unique').on(table.workspaceId, table.slug),
    // Named because the generated name is over Postgres's 63-character limit
    foreignKey({
      name: 'admin_ws_section_parent_fk',
      columns: [table.parentSectionId],
      foreignColumns: [table.id],
    }).onDelete('cascade'),
    check(
      'admin_ws_section_no_self_parent',
      sql`"parentSectionId" IS NULL OR "parentSectionId" != id`
    ),
  ]
);

export type CompletenessRule = {
  type: 'min_length' | 'required_headings' | 'min_items' | 'custom';
  description: string;
  params: Record<string, unknown>;
};

// ── Section Versions ────────────────────────────────────────────────────────

export const adminSectionVersions = pgTable(
  'admin_section_versions',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    sectionId: integer()
      .notNull()
      .references(() => adminWorkspaceSections.id, { onDelete: 'cascade' }),
    version: integer().notNull(),
    content: text(),
    structuredData: jsonb().$type<Record<string, unknown>>(),
    changeDescription: text(),
    changeSource: varchar({ length: 20 }).notNull().default('manual'),
    sourceDocumentId: integer().references(() => adminDocuments.id, { onDelete: 'set null' }),
    createdAt: timestamp().defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('admin_section_version_unique').on(table.sectionId, table.version),
    index('admin_section_version_section_idx').on(table.sectionId, table.version),
  ]
);

// ── Section Sources (tracks which documents contributed to a section) ────────

export const adminSectionSources = pgTable(
  'admin_section_sources',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    sectionId: integer()
      .notNull()
      .references(() => adminWorkspaceSections.id, { onDelete: 'cascade' }),
    versionId: integer()
      .notNull()
      .references(() => adminSectionVersions.id, { onDelete: 'cascade' }),
    documentId: integer()
      .notNull()
      .references(() => adminDocuments.id, { onDelete: 'cascade' }),
    chunkIds: jsonb().$type<number[]>(),
    createdAt: timestamp().defaultNow().notNull(),
  },
  (table) => [index('admin_section_source_section_idx').on(table.sectionId)]
);

// ── Section Dependencies ────────────────────────────────────────────────────

export type DependencyRelationType = 'derived_from' | 'summarizes' | 'requires' | 'references';

export const adminSectionDependencies = pgTable(
  'admin_section_dependencies',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    sectionId: integer().notNull(),
    dependsOnSectionId: integer().notNull(),
    relationType: varchar({ length: 30 }).notNull(),
    description: text(),
    createdAt: timestamp().defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('admin_section_dep_unique').on(table.sectionId, table.dependsOnSectionId),
    index('admin_section_dep_section_idx').on(table.sectionId),
    index('admin_section_dep_target_idx').on(table.dependsOnSectionId),
    // Named because the generated names are over Postgres's 63-character limit
    foreignKey({
      name: 'admin_section_dep_section_fk',
      columns: [table.sectionId],
      foreignColumns: [adminWorkspaceSections.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'admin_section_dep_target_fk',
      columns: [table.dependsOnSectionId],
      foreignColumns: [adminWorkspaceSections.id],
    }).onDelete('cascade'),
  ]
);

// ── Gap Reports ─────────────────────────────────────────────────────────────

export type GapFinding = {
  sectionId: number;
  sectionTitle: string;
  severity: 'low' | 'medium' | 'high';
  issue: string;
  suggestion: string;
  ruleType?: string;
  contentRef?: {
    startOffset: number;
    endOffset: number;
    snippet: string;
  };
  contentHashAtAnalysis?: string;
};

export const adminGapReports = pgTable(
  'admin_gap_reports',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    workspaceId: integer()
      .notNull()
      .references(() => adminWorkspaces.id, { onDelete: 'cascade' }),
    findings: jsonb().$type<GapFinding[]>().notNull(),
    workspaceContentHash: varchar({ length: 64 }),
    sectionContentHashes: jsonb().$type<Record<number, string>>(),
    createdAt: timestamp().defaultNow().notNull(),
  },
  (table) => [index('admin_gap_report_workspace_idx').on(table.workspaceId)]
);

// ── AI Provenance (semantic fidelity tracking) ──────────────────────────────

export const adminAiProvenance = pgTable(
  'admin_ai_provenance',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: integer().references(() => adminUsers.id, { onDelete: 'set null' }),
    operationType: varchar({ length: 30 }).notNull(),
    sourceText: text().notNull(),
    outputText: text().notNull(),
    sourceEmbedding: vector({ dimensions: 1536 }).notNull(),
    outputEmbedding: vector({ dimensions: 1536 }).notNull(),
    cosineSimilarity: real().notNull(),
    status: varchar({ length: 20 }).notNull().default('passed'),
    sectionId: integer().references(() => adminWorkspaceSections.id, { onDelete: 'set null' }),
    actionPrompt: text(),
    metadata: jsonb().$type<Record<string, unknown>>(),
    reviewedAt: timestamp(),
    reviewedBy: integer().references(() => adminUsers.id, { onDelete: 'set null' }),
    createdAt: timestamp().defaultNow().notNull(),
  },
  (table) => [
    index('admin_ai_provenance_section_idx').on(table.sectionId),
    index('admin_ai_provenance_status_idx').on(table.status),
  ]
);

// ── Content Audit Reports ────────────────────────────────────────────────────

export type ContentAuditFinding = {
  severity: 'high' | 'medium' | 'low';
  type: 'conflict' | 'unsourced_claim' | 'stale_data' | 'missing_coverage';
  postSlug: string | null;
  insightCategory: string | null;
  claim: string;
  issue: string;
  suggestion: string;
};

export const adminContentAuditReports = pgTable('admin_content_audit_reports', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: integer().references(() => adminUsers.id, { onDelete: 'cascade' }),
  findings: jsonb().$type<ContentAuditFinding[]>(),
  postsSummary: jsonb(),
  insightsSummary: jsonb(),
  createdAt: timestamp().defaultNow().notNull(),
});

// ── Relations ───────────────────────────────────────────────────────────────

export const adminWorkspacesRelations = relations(adminWorkspaces, ({ many }) => ({
  sections: many(adminWorkspaceSections),
  gapReports: many(adminGapReports),
  researchSources: many(adminResearchSources),
  agentTasks: many(adminAgentTasks),
  findings: many(adminFindings),
}));

export const adminWorkspaceSectionsRelations = relations(
  adminWorkspaceSections,
  ({ one, many }) => ({
    workspace: one(adminWorkspaces, {
      fields: [adminWorkspaceSections.workspaceId],
      references: [adminWorkspaces.id],
    }),
    parent: one(adminWorkspaceSections, {
      fields: [adminWorkspaceSections.parentSectionId],
      references: [adminWorkspaceSections.id],
      relationName: 'sectionParent',
    }),
    children: many(adminWorkspaceSections, { relationName: 'sectionParent' }),
    versions: many(adminSectionVersions),
    dependencies: many(adminSectionDependencies, { relationName: 'sectionDeps' }),
    dependents: many(adminSectionDependencies, { relationName: 'targetDeps' }),
  })
);

export const adminSectionVersionsRelations = relations(adminSectionVersions, ({ one }) => ({
  section: one(adminWorkspaceSections, {
    fields: [adminSectionVersions.sectionId],
    references: [adminWorkspaceSections.id],
  }),
  sourceDocument: one(adminDocuments, {
    fields: [adminSectionVersions.sourceDocumentId],
    references: [adminDocuments.id],
  }),
}));

export const adminSectionSourcesRelations = relations(adminSectionSources, ({ one }) => ({
  section: one(adminWorkspaceSections, {
    fields: [adminSectionSources.sectionId],
    references: [adminWorkspaceSections.id],
  }),
  version: one(adminSectionVersions, {
    fields: [adminSectionSources.versionId],
    references: [adminSectionVersions.id],
  }),
  document: one(adminDocuments, {
    fields: [adminSectionSources.documentId],
    references: [adminDocuments.id],
  }),
}));

export const adminSectionDependenciesRelations = relations(adminSectionDependencies, ({ one }) => ({
  section: one(adminWorkspaceSections, {
    fields: [adminSectionDependencies.sectionId],
    references: [adminWorkspaceSections.id],
    relationName: 'sectionDeps',
  }),
  dependsOnSection: one(adminWorkspaceSections, {
    fields: [adminSectionDependencies.dependsOnSectionId],
    references: [adminWorkspaceSections.id],
    relationName: 'targetDeps',
  }),
}));

export const adminGapReportsRelations = relations(adminGapReports, ({ one }) => ({
  workspace: one(adminWorkspaces, {
    fields: [adminGapReports.workspaceId],
    references: [adminWorkspaces.id],
  }),
}));
