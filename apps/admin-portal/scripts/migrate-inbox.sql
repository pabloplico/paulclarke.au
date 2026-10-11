-- Inbox & Section Sources tables for Phase 2

CREATE TABLE IF NOT EXISTS admin_inbox_items (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  type varchar(20) NOT NULL,
  title varchar(500) NOT NULL,
  content text,
  "documentId" integer REFERENCES admin_documents(id),
  status varchar(20) NOT NULL DEFAULT 'pending',
  "routingResults" jsonb,
  "processingError" text,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "processedAt" timestamp
);

CREATE INDEX IF NOT EXISTS admin_inbox_status_idx ON admin_inbox_items (status);

CREATE TABLE IF NOT EXISTS admin_section_sources (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "sectionId" integer NOT NULL REFERENCES admin_workspace_sections(id) ON DELETE CASCADE,
  "versionId" integer NOT NULL REFERENCES admin_section_versions(id) ON DELETE CASCADE,
  "documentId" integer NOT NULL REFERENCES admin_documents(id) ON DELETE CASCADE,
  "chunkIds" jsonb,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_section_source_section_idx ON admin_section_sources ("sectionId");
