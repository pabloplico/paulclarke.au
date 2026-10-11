-- Workspace tables for Phase 1

CREATE TABLE IF NOT EXISTS admin_workspaces (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  slug varchar(100) NOT NULL UNIQUE,
  title varchar(255) NOT NULL,
  description text,
  icon varchar(50),
  "sortOrder" integer NOT NULL DEFAULT 0,
  metadata jsonb,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_workspace_sections (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "workspaceId" integer NOT NULL REFERENCES admin_workspaces(id) ON DELETE CASCADE,
  slug varchar(100) NOT NULL,
  title varchar(255) NOT NULL,
  description text,
  template varchar(20) NOT NULL DEFAULT 'prose',
  "sortOrder" integer NOT NULL DEFAULT 0,
  "completenessRules" jsonb,
  metadata jsonb,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_ws_section_ws_idx ON admin_workspace_sections ("workspaceId");
CREATE UNIQUE INDEX IF NOT EXISTS admin_ws_section_slug_unique ON admin_workspace_sections ("workspaceId", slug);

CREATE TABLE IF NOT EXISTS admin_section_versions (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "sectionId" integer NOT NULL REFERENCES admin_workspace_sections(id) ON DELETE CASCADE,
  version integer NOT NULL,
  content text,
  "structuredData" jsonb,
  "changeDescription" text,
  "changeSource" varchar(20) NOT NULL DEFAULT 'manual',
  "sourceDocumentId" integer REFERENCES admin_documents(id),
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_section_version_unique ON admin_section_versions ("sectionId", version);
CREATE INDEX IF NOT EXISTS admin_section_version_section_idx ON admin_section_versions ("sectionId");
