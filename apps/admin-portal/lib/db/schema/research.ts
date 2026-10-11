import { relations, sql } from 'drizzle-orm';
import {
  boolean,
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
import { adminInboxItems } from './operations';
import { adminWorkspaces } from './workspaces';

// ── Research Types ──────────────────────────────────────────────────────────

export type MarketType = 'b2b' | 'b2c' | 'both';
export type SourceType = 'web_scrape' | 'public_api' | 'paid_feed' | 'file_upload' | 'social';
export type AgentType = 'research' | 'ingestion' | 'analysis';
export type AgentTaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'paused';
export type AgentRunStatus = 'started' | 'completed' | 'failed' | 'cancelled';
export type FindingType =
  | 'trend'
  | 'competitor'
  | 'pricing'
  | 'regulation'
  | 'sentiment'
  | 'statistic'
  | 'news';

// ── Research Sources ────────────────────────────────────────────────────────

export const adminResearchSources = pgTable(
  'admin_research_sources',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: integer()
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'cascade' }),
    workspaceId: integer()
      .notNull()
      .references(() => adminWorkspaces.id, { onDelete: 'cascade' }),
    name: varchar({ length: 255 }).notNull(),
    sourceType: varchar('sourceType', { length: 20 }).notNull().$type<SourceType>(),
    url: text(),
    config: jsonb().$type<Record<string, unknown>>().default({}),
    qualityScore: real().default(0.5),
    reliabilityScore: real().default(0.5),
    authorityScore: real().default(0.5),
    compositeScore: real().generatedAlwaysAs(
      sql`"qualityScore" * 0.4 + "reliabilityScore" * 0.35 + "authorityScore" * 0.25`
    ),
    lastCrawledAt: timestamp(),
    isActive: boolean().default(true).notNull(),
    createdAt: timestamp().defaultNow().notNull(),
    updatedAt: timestamp().defaultNow().notNull(),
  },
  (table) => [
    index('admin_research_source_user_idx').on(table.userId),
    index('admin_research_source_ws_idx').on(table.workspaceId),
    index('admin_research_source_type_idx').on(table.sourceType),
  ]
);

// ── Agent Tasks ─────────────────────────────────────────────────────────────

export const adminAgentTasks = pgTable(
  'admin_agent_tasks',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: integer()
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'cascade' }),
    workspaceId: integer()
      .notNull()
      .references(() => adminWorkspaces.id, { onDelete: 'cascade' }),
    agentType: varchar('agentType', { length: 20 }).notNull().$type<AgentType>(),
    name: varchar({ length: 255 }).notNull(),
    status: varchar({ length: 20 }).default('pending').notNull().$type<AgentTaskStatus>(),
    cronSchedule: varchar('cronSchedule', { length: 100 }),
    config: jsonb().$type<Record<string, unknown>>().default({}),
    lastRun: timestamp(),
    runCount: integer().default(0).notNull(),
    createdAt: timestamp().defaultNow().notNull(),
    updatedAt: timestamp().defaultNow().notNull(),
  },
  (table) => [
    index('admin_agent_task_user_idx').on(table.userId),
    index('admin_agent_task_ws_idx').on(table.workspaceId),
    index('admin_agent_task_status_idx').on(table.status),
  ]
);

// ── Agent Runs ──────────────────────────────────────────────────────────────

export const adminAgentRuns = pgTable(
  'admin_agent_runs',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: integer()
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'cascade' }),
    taskId: integer()
      .notNull()
      .references(() => adminAgentTasks.id, { onDelete: 'cascade' }),
    status: varchar({ length: 20 }).default('started').notNull().$type<AgentRunStatus>(),
    startedAt: timestamp().defaultNow().notNull(),
    completedAt: timestamp(),
    findingsCount: integer().default(0),
    tokensUsed: integer().default(0),
    errorLog: text(),
    log: jsonb().$type<Array<{ timestamp: string; message: string; level: string }>>().default([]),
    createdAt: timestamp().defaultNow().notNull(),
  },
  (table) => [
    index('admin_agent_run_user_idx').on(table.userId),
    index('admin_agent_run_task_idx').on(table.taskId),
    index('admin_agent_run_status_idx').on(table.status),
  ]
);

// ── Findings ────────────────────────────────────────────────────────────────

export const adminFindings = pgTable(
  'admin_findings',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: integer()
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'cascade' }),
    sourceId: integer().references(() => adminResearchSources.id, { onDelete: 'set null' }),
    workspaceId: integer()
      .notNull()
      .references(() => adminWorkspaces.id, { onDelete: 'cascade' }),
    agentRunId: integer().references(() => adminAgentRuns.id, { onDelete: 'set null' }),
    findingType: varchar('findingType', { length: 20 }).notNull().$type<FindingType>(),
    title: varchar({ length: 500 }).notNull(),
    content: text().notNull(),
    contentHash: varchar('contentHash', { length: 32 }).notNull(),
    confidenceScore: real().default(0.5).notNull(),
    sentimentScore: real(),
    geo: jsonb().$type<{ country?: string; state?: string; city?: string }>().default({}),
    tags: jsonb()
      .$type<{ sectors?: string[]; topics?: string[]; entities?: string[] }>()
      .default({}),
    embedding: vector({ dimensions: 1536 }),
    url: text(),
    publishedAt: timestamp(),
    foundAt: timestamp().defaultNow().notNull(),
    createdAt: timestamp().defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('admin_finding_dedup_idx').on(table.workspaceId, table.contentHash),
    index('admin_finding_user_idx').on(table.userId),
    index('admin_finding_ws_idx').on(table.workspaceId),
    index('admin_finding_type_idx').on(table.findingType),
    index('admin_finding_confidence_idx').on(table.confidenceScore),
  ]
);

// ── Research Settings ───────────────────────────────────────────────────────

export const adminResearchSettings = pgTable(
  'admin_research_settings',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: integer()
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'cascade' }),
    aiProvider: varchar('aiProvider', { length: 20 }).default('openai').notNull(),
    aiModel: varchar('aiModel', { length: 100 }).default('gpt-4o').notNull(),
    embeddingModel: varchar('embeddingModel', { length: 100 })
      .default('text-embedding-3-small')
      .notNull(),
    ollamaUrl: varchar('ollamaUrl', { length: 500 }).default('http://localhost:11434'),
    defaultCronSchedule: varchar('defaultCronSchedule', { length: 100 })
      .default('0 2 * * *')
      .notNull(),
    minCompositeScore: real().default(0.3).notNull(),
    maxResearchSteps: integer().default(15).notNull(),
    config: jsonb().$type<Record<string, unknown>>().default({}),
    updatedAt: timestamp().defaultNow().notNull(),
  },
  (table) => [uniqueIndex('admin_research_settings_user_unique').on(table.userId)]
);

// ── Feeds ────────────────────────────────────────────────────────────────────

export const adminFeeds = pgTable('admin_feeds', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: integer()
    .references(() => adminUsers.id, { onDelete: 'cascade' })
    .notNull(),
  url: text().notNull(),
  type: varchar({ length: 20 }).notNull(), // 'rss' | 'page'
  label: varchar({ length: 255 }),
  workspaceId: integer().references(() => adminWorkspaces.id, { onDelete: 'set null' }),
  enabled: boolean().notNull().default(true),
  intervalMinutes: integer().notNull().default(60),
  lastFetchedAt: timestamp(),
  lastContentHash: varchar({ length: 64 }),
  lastError: text(),
  createdAt: timestamp().defaultNow().notNull(),
  updatedAt: timestamp().defaultNow().notNull(),
});

// ── Feed Items ───────────────────────────────────────────────────────────────

export const adminFeedItems = pgTable(
  'admin_feed_items',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    feedId: integer()
      .notNull()
      .references(() => adminFeeds.id, { onDelete: 'cascade' }),
    guid: varchar({ length: 500 }).notNull(),
    title: varchar({ length: 500 }),
    url: text(),
    contentHash: varchar({ length: 64 }),
    inboxItemId: integer().references(() => adminInboxItems.id),
    createdAt: timestamp().defaultNow().notNull(),
  },
  (table) => [uniqueIndex('admin_feed_item_guid_unique').on(table.feedId, table.guid)]
);

// ── Relations ───────────────────────────────────────────────────────────────

export const adminResearchSourcesRelations = relations(adminResearchSources, ({ one, many }) => ({
  workspace: one(adminWorkspaces, {
    fields: [adminResearchSources.workspaceId],
    references: [adminWorkspaces.id],
  }),
  findings: many(adminFindings),
}));

export const adminAgentTasksRelations = relations(adminAgentTasks, ({ one, many }) => ({
  workspace: one(adminWorkspaces, {
    fields: [adminAgentTasks.workspaceId],
    references: [adminWorkspaces.id],
  }),
  runs: many(adminAgentRuns),
}));

export const adminAgentRunsRelations = relations(adminAgentRuns, ({ one, many }) => ({
  task: one(adminAgentTasks, {
    fields: [adminAgentRuns.taskId],
    references: [adminAgentTasks.id],
  }),
  findings: many(adminFindings),
}));

export const adminFindingsRelations = relations(adminFindings, ({ one }) => ({
  source: one(adminResearchSources, {
    fields: [adminFindings.sourceId],
    references: [adminResearchSources.id],
  }),
  workspace: one(adminWorkspaces, {
    fields: [adminFindings.workspaceId],
    references: [adminWorkspaces.id],
  }),
  agentRun: one(adminAgentRuns, {
    fields: [adminFindings.agentRunId],
    references: [adminAgentRuns.id],
  }),
}));

export const adminFeedsRelations = relations(adminFeeds, ({ one, many }) => ({
  user: one(adminUsers, {
    fields: [adminFeeds.userId],
    references: [adminUsers.id],
  }),
  workspace: one(adminWorkspaces, {
    fields: [adminFeeds.workspaceId],
    references: [adminWorkspaces.id],
  }),
  items: many(adminFeedItems),
}));

export const adminFeedItemsRelations = relations(adminFeedItems, ({ one }) => ({
  feed: one(adminFeeds, {
    fields: [adminFeedItems.feedId],
    references: [adminFeeds.id],
  }),
  inboxItem: one(adminInboxItems, {
    fields: [adminFeedItems.inboxItemId],
    references: [adminInboxItems.id],
  }),
}));
