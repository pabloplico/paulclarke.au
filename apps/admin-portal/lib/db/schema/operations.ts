import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { adminSessions, adminUsers } from './base';
import { adminConversations, adminDocuments } from './documents';

// ── Clients ─────────────────────────────────────────────────────────────────

export const adminClients = pgTable(
  'admin_clients',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: integer().references(() => adminUsers.id, { onDelete: 'cascade' }),
    contactName: varchar({ length: 255 }).notNull(),
    companyName: varchar({ length: 255 }),
    email: varchar({ length: 255 }),
    phone: varchar({ length: 50 }),
    status: varchar({ length: 20 }).notNull().default('lead'),
    type: varchar({ length: 20 }).notNull().default('lead'),
    source: varchar({ length: 100 }),
    website: varchar({ length: 500 }),
    address: text(),
    industry: varchar({ length: 100 }),
    notes: text(),
    metadata: jsonb().$type<Record<string, unknown>>(),
    createdAt: timestamp().defaultNow().notNull(),
    updatedAt: timestamp().defaultNow().notNull(),
  },
  (table) => [
    index('admin_client_user_idx').on(table.userId),
    index('admin_client_user_status_idx').on(table.userId, table.status),
    index('admin_client_user_type_idx').on(table.userId, table.type),
  ]
);

// ── Contacts ────────────────────────────────────────────────────────────────

export const adminContacts = pgTable(
  'admin_contacts',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: integer()
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'cascade' }),
    clientId: integer()
      .notNull()
      .references(() => adminClients.id, { onDelete: 'cascade' }),
    name: varchar({ length: 255 }).notNull(),
    email: varchar({ length: 255 }),
    phone: varchar({ length: 50 }),
    role: varchar({ length: 100 }),
    isPrimary: boolean().notNull().default(false),
    notes: text(),
    createdAt: timestamp().defaultNow().notNull(),
    updatedAt: timestamp().defaultNow().notNull(),
  },
  (table) => [
    index('admin_contact_client_idx').on(table.clientId),
    index('admin_contact_user_idx').on(table.userId),
  ]
);

// ── Jobs ────────────────────────────────────────────────────────────────────

export const adminJobs = pgTable(
  'admin_jobs',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: integer()
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'cascade' }),
    clientId: integer().references(() => adminClients.id, { onDelete: 'set null' }),
    title: varchar({ length: 500 }).notNull(),
    description: text(),
    stage: varchar({ length: 20 }).notNull().default('lead'),
    quotedAmount: integer(),
    finalAmount: integer(),
    currency: varchar({ length: 3 }).notNull().default('AUD'),
    startDate: timestamp(),
    dueDate: timestamp(),
    completedAt: timestamp(),
    sortOrder: integer().notNull().default(0),
    metadata: jsonb().$type<Record<string, unknown>>(),
    createdAt: timestamp().defaultNow().notNull(),
    updatedAt: timestamp().defaultNow().notNull(),
  },
  (table) => [
    index('admin_job_user_idx').on(table.userId),
    index('admin_job_client_idx').on(table.clientId),
    index('admin_job_stage_idx').on(table.stage),
  ]
);

// ── Email Templates ─────────────────────────────────────────────────────────

export const adminEmailTemplates = pgTable(
  'admin_email_templates',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: integer()
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'cascade' }),
    name: varchar({ length: 255 }).notNull(),
    subject: varchar({ length: 500 }),
    body: text().notNull(),
    category: varchar({ length: 50 }).notNull().default('general'),
    metadata: jsonb().$type<Record<string, unknown>>(),
    createdAt: timestamp().defaultNow().notNull(),
    updatedAt: timestamp().defaultNow().notNull(),
  },
  (table) => [index('admin_email_template_user_idx').on(table.userId)]
);

// ── Communications ──────────────────────────────────────────────────────────

export const adminCommunications = pgTable(
  'admin_communications',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: integer()
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'cascade' }),
    clientId: integer().references(() => adminClients.id, { onDelete: 'set null' }),
    contactId: integer().references(() => adminContacts.id, { onDelete: 'set null' }),
    type: varchar({ length: 20 }).notNull().default('email'),
    direction: varchar({ length: 20 }).notNull().default('outbound'),
    subject: varchar({ length: 500 }),
    body: text(),
    sentAt: timestamp().defaultNow().notNull(),
    templateId: integer().references(() => adminEmailTemplates.id, { onDelete: 'set null' }),
    followUpDate: timestamp(),
    followUpDone: boolean().notNull().default(false),
    metadata: jsonb().$type<Record<string, unknown>>(),
    createdAt: timestamp().defaultNow().notNull(),
  },
  (table) => [
    index('admin_comm_user_idx').on(table.userId),
    index('admin_comm_client_idx').on(table.clientId),
    index('admin_comm_followup_idx').on(table.followUpDate),
  ]
);

// ── Referrals (deferred UI) ────────────────────────────────────────────────

export const adminReferrals = pgTable(
  'admin_referrals',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: integer()
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'cascade' }),
    referrerClientId: integer().references(() => adminClients.id, { onDelete: 'set null' }),
    referredClientId: integer().references(() => adminClients.id, { onDelete: 'set null' }),
    jobId: integer().references(() => adminJobs.id, { onDelete: 'set null' }),
    source: varchar({ length: 100 }),
    notes: text(),
    referredAt: timestamp().defaultNow().notNull(),
    createdAt: timestamp().defaultNow().notNull(),
  },
  (table) => [
    index('admin_referral_user_idx').on(table.userId),
    index('admin_referral_referrer_idx').on(table.referrerClientId),
    index('admin_referral_referred_idx').on(table.referredClientId),
  ]
);

// ── Invoices (deferred UI) ─────────────────────────────────────────────────

export const adminInvoices = pgTable(
  'admin_invoices',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: integer()
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'cascade' }),
    clientId: integer().references(() => adminClients.id, { onDelete: 'set null' }),
    jobId: integer().references(() => adminJobs.id, { onDelete: 'set null' }),
    invoiceNumber: varchar({ length: 50 }).notNull(),
    status: varchar({ length: 20 }).notNull().default('draft'),
    issueDate: timestamp().notNull(),
    dueDate: timestamp().notNull(),
    paidAt: timestamp(),
    subtotal: integer().notNull().default(0),
    taxRate: integer().notNull().default(10),
    taxAmount: integer().notNull().default(0),
    total: integer().notNull().default(0),
    currency: varchar({ length: 3 }).notNull().default('AUD'),
    notes: text(),
    paymentTerms: text(),
    fromDetails: jsonb().$type<{
      name: string;
      address?: string;
      abn?: string;
      email?: string;
      phone?: string;
    }>(),
    toDetails: jsonb().$type<{ name: string; address?: string; abn?: string; email?: string }>(),
    metadata: jsonb().$type<Record<string, unknown>>(),
    createdAt: timestamp().defaultNow().notNull(),
    updatedAt: timestamp().defaultNow().notNull(),
  },
  (table) => [
    index('admin_invoice_user_idx').on(table.userId),
    index('admin_invoice_client_idx').on(table.clientId),
    index('admin_invoice_job_idx').on(table.jobId),
    uniqueIndex('admin_invoice_number_unique').on(table.userId, table.invoiceNumber),
  ]
);

// ── Invoice Line Items (deferred UI) ───────────────────────────────────────

export const adminInvoiceLineItems = pgTable(
  'admin_invoice_line_items',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    invoiceId: integer()
      .notNull()
      .references(() => adminInvoices.id, { onDelete: 'cascade' }),
    description: varchar({ length: 500 }).notNull(),
    quantity: integer().notNull().default(1),
    unitPrice: integer().notNull(),
    amount: integer().notNull(),
    sortOrder: integer().notNull().default(0),
  },
  (table) => [index('admin_line_item_invoice_idx').on(table.invoiceId)]
);

// ── Inbox Items ─────────────────────────────────────────────────────────────

export const adminInboxItems = pgTable(
  'admin_inbox_items',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: integer().references(() => adminUsers.id, { onDelete: 'cascade' }),
    type: varchar({ length: 20 }).notNull(), // file | url | note
    title: varchar({ length: 500 }).notNull(),
    content: text(), // raw text or URL
    documentId: integer().references(() => adminDocuments.id),
    status: varchar({ length: 20 }).notNull().default('pending'), // pending | processing | routed | failed | approved | dismissed
    routingResults: jsonb().$type<RoutingSuggestion[]>(),
    approvedResults: jsonb().$type<ApprovedResult[]>(),
    processingError: text(),
    qualityFlags: jsonb().$type<QualityFlag[]>(),
    gapFindingRef: jsonb().$type<GapFindingRef>(),
    createdAt: timestamp().defaultNow().notNull(),
    processedAt: timestamp(),
  },
  (table) => [
    index('admin_inbox_status_idx').on(table.status),
    index('admin_inbox_user_idx').on(table.userId),
  ]
);

export type QualityFlag = {
  stage: 'clean' | 'chunk' | 'extract' | 'route';
  severity: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export type RoutingSuggestion = {
  workspaceId: number;
  workspaceTitle: string;
  sectionId: number;
  sectionTitle: string;
  confidence: number;
  action: 'append' | 'replace' | 'new_section';
  suggestedContent: string;
  reasoning: string;
  chunkRefs?: number[];
};

export type ApprovedResult = {
  workspaceId: number;
  workspaceTitle: string;
  workspaceSlug: string;
  sectionId: number;
  sectionTitle: string;
  versionId?: number;
  approvedAt: string;
};

export type GapFindingRef = {
  gapReportId: number;
  findingIndex: number;
  workspaceId: number;
};

// ── Todos ───────────────────────────────────────────────────────────────────

export const adminTodos = pgTable(
  'admin_todos',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: integer()
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'cascade' }),
    title: varchar({ length: 500 }).notNull(),
    description: text(),
    completed: boolean().notNull().default(false),
    completedAt: timestamp(),
    priority: varchar({ length: 20 }).notNull().default('medium'),
    dueDate: timestamp(),
    sortOrder: integer().notNull().default(0),
    jobId: integer().references(() => adminJobs.id, { onDelete: 'set null' }),
    clientId: integer().references(() => adminClients.id, { onDelete: 'set null' }),
    createdAt: timestamp().defaultNow().notNull(),
    updatedAt: timestamp().defaultNow().notNull(),
  },
  (table) => [index('admin_todo_user_idx').on(table.userId)]
);

// ── Relations ───────────────────────────────────────────────────────────────

export const adminUsersRelations = relations(adminUsers, ({ many }) => ({
  sessions: many(adminSessions),
  todos: many(adminTodos),
  clients: many(adminClients),
  jobs: many(adminJobs),
  emailTemplates: many(adminEmailTemplates),
  communications: many(adminCommunications),
}));

export const adminClientsRelations = relations(adminClients, ({ many }) => ({
  conversations: many(adminConversations),
  documents: many(adminDocuments),
  contacts: many(adminContacts),
  jobs: many(adminJobs),
  communications: many(adminCommunications),
  todos: many(adminTodos),
  invoices: many(adminInvoices),
  referralsAsReferrer: many(adminReferrals, { relationName: 'referrer' }),
  referralsAsReferred: many(adminReferrals, { relationName: 'referred' }),
}));

export const adminContactsRelations = relations(adminContacts, ({ one }) => ({
  client: one(adminClients, {
    fields: [adminContacts.clientId],
    references: [adminClients.id],
  }),
  user: one(adminUsers, {
    fields: [adminContacts.userId],
    references: [adminUsers.id],
  }),
}));

export const adminJobsRelations = relations(adminJobs, ({ one, many }) => ({
  client: one(adminClients, {
    fields: [adminJobs.clientId],
    references: [adminClients.id],
  }),
  user: one(adminUsers, {
    fields: [adminJobs.userId],
    references: [adminUsers.id],
  }),
  invoices: many(adminInvoices),
  referrals: many(adminReferrals),
  todos: many(adminTodos),
}));

export const adminEmailTemplatesRelations = relations(adminEmailTemplates, ({ one }) => ({
  user: one(adminUsers, {
    fields: [adminEmailTemplates.userId],
    references: [adminUsers.id],
  }),
}));

export const adminCommunicationsRelations = relations(adminCommunications, ({ one }) => ({
  user: one(adminUsers, {
    fields: [adminCommunications.userId],
    references: [adminUsers.id],
  }),
  client: one(adminClients, {
    fields: [adminCommunications.clientId],
    references: [adminClients.id],
  }),
  contact: one(adminContacts, {
    fields: [adminCommunications.contactId],
    references: [adminContacts.id],
  }),
  template: one(adminEmailTemplates, {
    fields: [adminCommunications.templateId],
    references: [adminEmailTemplates.id],
  }),
}));

export const adminReferralsRelations = relations(adminReferrals, ({ one }) => ({
  user: one(adminUsers, {
    fields: [adminReferrals.userId],
    references: [adminUsers.id],
  }),
  referrerClient: one(adminClients, {
    fields: [adminReferrals.referrerClientId],
    references: [adminClients.id],
    relationName: 'referrer',
  }),
  referredClient: one(adminClients, {
    fields: [adminReferrals.referredClientId],
    references: [adminClients.id],
    relationName: 'referred',
  }),
  job: one(adminJobs, {
    fields: [adminReferrals.jobId],
    references: [adminJobs.id],
  }),
}));

export const adminInvoicesRelations = relations(adminInvoices, ({ one, many }) => ({
  user: one(adminUsers, {
    fields: [adminInvoices.userId],
    references: [adminUsers.id],
  }),
  client: one(adminClients, {
    fields: [adminInvoices.clientId],
    references: [adminClients.id],
  }),
  job: one(adminJobs, {
    fields: [adminInvoices.jobId],
    references: [adminJobs.id],
  }),
  lineItems: many(adminInvoiceLineItems),
}));

export const adminInvoiceLineItemsRelations = relations(adminInvoiceLineItems, ({ one }) => ({
  invoice: one(adminInvoices, {
    fields: [adminInvoiceLineItems.invoiceId],
    references: [adminInvoices.id],
  }),
}));

export const adminInboxItemsRelations = relations(adminInboxItems, ({ one }) => ({
  document: one(adminDocuments, {
    fields: [adminInboxItems.documentId],
    references: [adminDocuments.id],
  }),
}));

export const adminTodosRelations = relations(adminTodos, ({ one }) => ({
  user: one(adminUsers, {
    fields: [adminTodos.userId],
    references: [adminUsers.id],
  }),
  job: one(adminJobs, {
    fields: [adminTodos.jobId],
    references: [adminJobs.id],
  }),
  client: one(adminClients, {
    fields: [adminTodos.clientId],
    references: [adminClients.id],
  }),
}));
