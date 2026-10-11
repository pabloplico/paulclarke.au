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
} from 'drizzle-orm/pg-core';

// ── Users ───────────────────────────────────────────────────────────────────

export const adminUsers = pgTable('admin_users', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  email: varchar({ length: 255 }).notNull().unique(),
  passwordHash: text().notNull(),
  name: varchar({ length: 255 }).notNull(),
  role: varchar({ length: 20 }).notNull().default('admin'),
  lastLoginAt: timestamp(),
  createdAt: timestamp().defaultNow().notNull(),
  updatedAt: timestamp().defaultNow().notNull(),
});

// ── Sessions ────────────────────────────────────────────────────────────────

export const adminSessions = pgTable(
  'admin_sessions',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: integer()
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'cascade' }),
    token: varchar({ length: 500 }).notNull().unique(),
    expiresAt: timestamp().notNull(),
    createdAt: timestamp().defaultNow().notNull(),
  },
  (table) => [index('admin_session_user_idx').on(table.userId)]
);

// ── Settings ─────────────────────────────────────────────────────────────────

export const adminSettings = pgTable(
  'admin_settings',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    key: varchar({ length: 100 }).notNull(),
    value: jsonb().notNull(),
    updatedAt: timestamp().defaultNow().notNull(),
  },
  (table) => [uniqueIndex('admin_settings_key_unique').on(table.key)]
);

// ── AI Statistics (read-only ref to business-portal table) ───────────────────

export const aiStatistics = pgTable('ai_statistics', {
  id: integer().primaryKey(),
  category: text().notNull(),
  sortOrder: integer('sort_order').notNull(),
  title: text().notNull(),
  value: text(),
  suffix: text(),
  description: text().notNull(),
  detail: text(),
  sourceName: text('source_name'),
  sourceUrl: text('source_url'),
  sourceDate: text('source_date'),
  updatedAt: timestamp('updated_at'),
});

// ── Relations ───────────────────────────────────────────────────────────────

export const adminSessionsRelations = relations(adminSessions, ({ one }) => ({
  user: one(adminUsers, {
    fields: [adminSessions.userId],
    references: [adminUsers.id],
  }),
}));
