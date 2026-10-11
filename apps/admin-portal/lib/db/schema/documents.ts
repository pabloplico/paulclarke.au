import { relations } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
  vector,
} from 'drizzle-orm/pg-core';
import { adminUsers } from './base';
import { adminClients } from './operations';
import { adminWorkspaces } from './workspaces';

// ── Documents ───────────────────────────────────────────────────────────────

export const adminDocuments = pgTable(
  'admin_documents',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: integer().references(() => adminUsers.id, { onDelete: 'cascade' }),
    title: varchar({ length: 500 }).notNull(),
    filename: varchar({ length: 500 }).notNull(),
    mimeType: varchar({ length: 100 }).notNull(),
    filePath: varchar({ length: 1000 }).notNull(),
    fileSize: integer().notNull(),
    status: varchar({ length: 20 }).notNull().default('uploaded'),
    metadata: jsonb().$type<Record<string, unknown>>(),
    createdAt: timestamp().defaultNow().notNull(),
    updatedAt: timestamp().defaultNow().notNull(),
    // Processing fields
    rawText: text(),
    cleanedText: text(),
    pageCount: integer(),
    processingError: text(),
    processingStartedAt: timestamp(),
    processingCompletedAt: timestamp(),
    // Source tracking
    source: varchar({ length: 20 }).default('upload'),
    sourceUrl: text(),
    // AI metadata
    aiSummary: text(),
    aiTitle: varchar({ length: 500 }),
    aiTags: jsonb().$type<string[]>(),
    aiLanguage: varchar({ length: 20 }),
    aiDocumentType: varchar({ length: 50 }),
    // Relations & user metadata
    clientId: integer().references(() => adminClients.id),
    userTags: jsonb().$type<string[]>(),
    archivedAt: timestamp(),
  },
  (table) => [
    index('admin_document_user_idx').on(table.userId),
    index('admin_document_user_status_idx').on(table.userId, table.status, table.archivedAt),
  ]
);

// ── Document Chunks ─────────────────────────────────────────────────────────

export const adminDocumentChunks = pgTable(
  'admin_document_chunks',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    documentId: integer()
      .notNull()
      .references(() => adminDocuments.id, { onDelete: 'cascade' }),
    content: text().notNull(),
    chunkIndex: integer().notNull(),
    embedding: vector({ dimensions: 1536 }),
    tokenCount: integer(),
    metadata: jsonb().$type<import('@/lib/rag/chunker').ChunkMetadata & Record<string, unknown>>(),
    createdAt: timestamp().defaultNow().notNull(),
    // Curation fields
    curationStatus: varchar({ length: 20 }).notNull().default('raw'),
    curatorNote: text(),
    reviewedAt: timestamp(),
  },
  (table) => [index('admin_chunk_doc_idx').on(table.documentId)]
);

// ── Knowledge Bases ─────────────────────────────────────────────────────────

export const adminKnowledgeBases = pgTable(
  'admin_knowledge_bases',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: integer().references(() => adminUsers.id, { onDelete: 'cascade' }),
    name: varchar({ length: 255 }).notNull().unique(),
    description: text(),
    color: varchar({ length: 7 }),
    metadata: jsonb().$type<Record<string, unknown>>(),
    createdAt: timestamp().defaultNow().notNull(),
    updatedAt: timestamp().defaultNow().notNull(),
  },
  (table) => [index('admin_kb_user_idx').on(table.userId)]
);

// ── KB ↔ Documents (junction) ───────────────────────────────────────────────

export const adminKbDocuments = pgTable(
  'admin_kb_documents',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    knowledgeBaseId: integer()
      .notNull()
      .references(() => adminKnowledgeBases.id, { onDelete: 'cascade' }),
    documentId: integer()
      .notNull()
      .references(() => adminDocuments.id, { onDelete: 'cascade' }),
    createdAt: timestamp().defaultNow().notNull(),
  },
  (table) => [uniqueIndex('admin_kb_doc_unique').on(table.knowledgeBaseId, table.documentId)]
);

// ── KB ↔ Chunks (chunk-level assignment, source of truth for RAG) ──────────

export const adminKbChunks = pgTable(
  'admin_kb_chunks',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    knowledgeBaseId: integer()
      .notNull()
      .references(() => adminKnowledgeBases.id, { onDelete: 'cascade' }),
    chunkId: integer()
      .notNull()
      .references(() => adminDocumentChunks.id, { onDelete: 'cascade' }),
    addedAt: timestamp().defaultNow().notNull(),
  },
  (table) => [uniqueIndex('admin_kb_chunk_unique').on(table.knowledgeBaseId, table.chunkId)]
);

// ── Conversations ───────────────────────────────────────────────────────────

export type ConversationScope =
  | { type: 'workspace'; workspaceId: number }
  | { type: 'kb'; knowledgeBaseId: number }
  | { type: 'general' };

export const adminConversations = pgTable('admin_conversations', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: integer().references(() => adminUsers.id, { onDelete: 'cascade' }),
  title: varchar({ length: 500 }),
  knowledgeBaseId: integer().references(() => adminKnowledgeBases.id),
  workspaceId: integer().references(() => adminWorkspaces.id),
  clientId: integer().references(() => adminClients.id),
  scope: jsonb().$type<ConversationScope>(),
  metadata: jsonb().$type<Record<string, unknown>>(),
  createdAt: timestamp().defaultNow().notNull(),
  updatedAt: timestamp().defaultNow().notNull(),
});

// ── Messages ────────────────────────────────────────────────────────────────

export const adminMessages = pgTable(
  'admin_messages',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    conversationId: integer()
      .notNull()
      .references(() => adminConversations.id, { onDelete: 'cascade' }),
    role: varchar({ length: 20 }).notNull(),
    content: text().notNull(),
    sources: jsonb().$type<Record<string, unknown>[]>(),
    createdAt: timestamp().defaultNow().notNull(),
  },
  (table) => [index('admin_msg_conv_idx').on(table.conversationId)]
);

// ── Relations ───────────────────────────────────────────────────────────────

export const adminDocumentsRelations = relations(adminDocuments, ({ one, many }) => ({
  chunks: many(adminDocumentChunks),
  knowledgeBases: many(adminKbDocuments),
  client: one(adminClients, {
    fields: [adminDocuments.clientId],
    references: [adminClients.id],
  }),
}));

export const adminDocumentChunksRelations = relations(adminDocumentChunks, ({ one, many }) => ({
  document: one(adminDocuments, {
    fields: [adminDocumentChunks.documentId],
    references: [adminDocuments.id],
  }),
  knowledgeBases: many(adminKbChunks),
}));

export const adminKnowledgeBasesRelations = relations(adminKnowledgeBases, ({ many }) => ({
  documents: many(adminKbDocuments),
  chunks: many(adminKbChunks),
  conversations: many(adminConversations),
}));

export const adminKbDocumentsRelations = relations(adminKbDocuments, ({ one }) => ({
  knowledgeBase: one(adminKnowledgeBases, {
    fields: [adminKbDocuments.knowledgeBaseId],
    references: [adminKnowledgeBases.id],
  }),
  document: one(adminDocuments, {
    fields: [adminKbDocuments.documentId],
    references: [adminDocuments.id],
  }),
}));

export const adminKbChunksRelations = relations(adminKbChunks, ({ one }) => ({
  knowledgeBase: one(adminKnowledgeBases, {
    fields: [adminKbChunks.knowledgeBaseId],
    references: [adminKnowledgeBases.id],
  }),
  chunk: one(adminDocumentChunks, {
    fields: [adminKbChunks.chunkId],
    references: [adminDocumentChunks.id],
  }),
}));

export const adminConversationsRelations = relations(adminConversations, ({ one, many }) => ({
  knowledgeBase: one(adminKnowledgeBases, {
    fields: [adminConversations.knowledgeBaseId],
    references: [adminKnowledgeBases.id],
  }),
  workspace: one(adminWorkspaces, {
    fields: [adminConversations.workspaceId],
    references: [adminWorkspaces.id],
  }),
  client: one(adminClients, {
    fields: [adminConversations.clientId],
    references: [adminClients.id],
  }),
  messages: many(adminMessages),
}));

export const adminMessagesRelations = relations(adminMessages, ({ one }) => ({
  conversation: one(adminConversations, {
    fields: [adminMessages.conversationId],
    references: [adminConversations.id],
  }),
}));
