// D1 (SQLite) schema. Generate a migration after changing it: pnpm db:generate.
// Column names are the property names, as in admin-portal's schema.
import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import type { SeniorityLevel, TaxonomyCategory } from '../../shared/types';
import { SENIORITY_LEVELS } from '../../shared/types';

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

/** One per visitor: the Access identity's email (DEV_ACCESS_IDENTITY locally). */
export const profiles = sqliteTable('profiles', {
  id: text().primaryKey(),
  email: text().notNull().unique(),
  createdAt: text().notNull().default(now),
});

const profileId = () =>
  text()
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' });

export const jobs = sqliteTable(
  'jobs',
  {
    id: text().primaryKey(),
    profileId: profileId(),
    title: text().notNull(),
    company: text().notNull(),
    rawText: text().notNull().default(''),
    skills: text({ mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
    software: text({ mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
    requirements: text({ mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
    salaryRange: text(),
    seniorityLevel: text({ enum: SENIORITY_LEVELS })
      .$type<SeniorityLevel>()
      .notNull()
      .default('not_specified'),
    category: text(),
    positionSubcategory: text(),
    url: text(),
    notes: text(),
    dateAdded: text().notNull().default(now),
  },
  (t) => [index('jobs_profile_idx').on(t.profileId)]
);

export const skills = sqliteTable(
  'skills',
  {
    id: text().primaryKey(),
    profileId: profileId(),
    name: text().notNull(),
    // 1 (learning) to 5 (expert)
    proficiency: integer().notNull(),
    category: text(),
  },
  (t) => [uniqueIndex('skills_profile_name_idx').on(t.profileId, t.name)]
);

export const taxonomy = sqliteTable('taxonomy', {
  profileId: text()
    .primaryKey()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  categories: text({ mode: 'json' }).$type<TaxonomyCategory[]>().notNull().default(sql`'[]'`),
  canonicalMap: text({ mode: 'json' }).$type<Record<string, string>>().notNull().default(sql`'{}'`),
  skillGroups: text({ mode: 'json' })
    .$type<Record<string, string[]>>()
    .notNull()
    .default(sql`'{}'`),
  updatedAt: text().notNull().default(now),
});

export const searchPrefs = sqliteTable('search_prefs', {
  profileId: text()
    .primaryKey()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  location: text().notNull().default(''),
  country: text().notNull().default('gb'),
  distanceKm: integer(),
  salaryMin: integer(),
  maxDaysOld: integer(),
  fullTimeOnly: integer({ mode: 'boolean' }),
  includeRemote: integer({ mode: 'boolean' }),
});

/** Find Jobs conversations; `messages` is the AI SDK's UIMessage[] as JSON. */
export const chats = sqliteTable(
  'chats',
  {
    id: text().primaryKey(),
    profileId: profileId(),
    title: text().notNull(),
    messages: text({ mode: 'json' }).$type<unknown[]>().notNull().default(sql`'[]'`),
    createdAt: text().notNull().default(now),
    updatedAt: text().notNull().default(now),
  },
  (t) => [index('chats_profile_updated_idx').on(t.profileId, t.updatedAt)]
);

/** AI requests and spend per visitor per UTC day, for the caps (IMPORT_PLAN J6). */
export const usage = sqliteTable(
  'usage',
  {
    profileId: profileId(),
    day: text().notNull(),
    requests: integer().notNull().default(0),
    costMicroUsd: integer().notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.day] })]
);
