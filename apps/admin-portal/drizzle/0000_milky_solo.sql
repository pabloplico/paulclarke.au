CREATE TABLE "admin_clients" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_clients_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"contactName" varchar(255) NOT NULL,
	"companyName" varchar(255),
	"email" varchar(255),
	"phone" varchar(50),
	"status" varchar(20) DEFAULT 'lead' NOT NULL,
	"industry" varchar(100),
	"notes" text,
	"metadata" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_conversations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_conversations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"title" varchar(500),
	"knowledgeBaseId" integer,
	"clientId" integer,
	"metadata" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_document_chunks" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_document_chunks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"documentId" integer NOT NULL,
	"content" text NOT NULL,
	"chunkIndex" integer NOT NULL,
	"embedding" vector(1536),
	"tokenCount" integer,
	"metadata" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"curationStatus" varchar(20) DEFAULT 'raw' NOT NULL,
	"curatorNote" text,
	"reviewedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "admin_documents" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_documents_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"title" varchar(500) NOT NULL,
	"filename" varchar(500) NOT NULL,
	"mimeType" varchar(100) NOT NULL,
	"filePath" varchar(1000) NOT NULL,
	"fileSize" integer NOT NULL,
	"status" varchar(20) DEFAULT 'uploaded' NOT NULL,
	"metadata" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"rawText" text,
	"cleanedText" text,
	"pageCount" integer,
	"processingError" text,
	"processingStartedAt" timestamp,
	"processingCompletedAt" timestamp,
	"source" varchar(20) DEFAULT 'upload',
	"sourceUrl" text,
	"aiSummary" text,
	"aiTitle" varchar(500),
	"aiTags" jsonb,
	"aiLanguage" varchar(20),
	"aiDocumentType" varchar(50),
	"clientId" integer,
	"userTags" jsonb,
	"archivedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "admin_gap_reports" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_gap_reports_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"workspaceId" integer NOT NULL,
	"findings" jsonb NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_inbox_items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_inbox_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"type" varchar(20) NOT NULL,
	"title" varchar(500) NOT NULL,
	"content" text,
	"documentId" integer,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"routingResults" jsonb,
	"approvedResults" jsonb,
	"processingError" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"processedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "admin_kb_chunks" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_kb_chunks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"knowledgeBaseId" integer NOT NULL,
	"chunkId" integer NOT NULL,
	"addedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_kb_documents" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_kb_documents_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"knowledgeBaseId" integer NOT NULL,
	"documentId" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_knowledge_bases" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_knowledge_bases_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(255) NOT NULL,
	"description" text,
	"color" varchar(7),
	"metadata" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admin_knowledge_bases_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "admin_messages" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_messages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"conversationId" integer NOT NULL,
	"role" varchar(20) NOT NULL,
	"content" text NOT NULL,
	"sources" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_section_sources" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_section_sources_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"sectionId" integer NOT NULL,
	"versionId" integer NOT NULL,
	"documentId" integer NOT NULL,
	"chunkIds" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_section_versions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_section_versions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"sectionId" integer NOT NULL,
	"version" integer NOT NULL,
	"content" text,
	"structuredData" jsonb,
	"changeDescription" text,
	"changeSource" varchar(20) DEFAULT 'manual' NOT NULL,
	"sourceDocumentId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_settings" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_settings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"key" varchar(100) NOT NULL,
	"value" jsonb NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_workspace_sections" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_workspace_sections_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"workspaceId" integer NOT NULL,
	"slug" varchar(100) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"template" varchar(20) DEFAULT 'prose' NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"completenessRules" jsonb,
	"metadata" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_workspaces" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_workspaces_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"slug" varchar(100) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"icon" varchar(50),
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"archivedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admin_workspaces_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "admin_conversations" ADD CONSTRAINT "admin_conversations_knowledgeBaseId_admin_knowledge_bases_id_fk" FOREIGN KEY ("knowledgeBaseId") REFERENCES "public"."admin_knowledge_bases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_conversations" ADD CONSTRAINT "admin_conversations_clientId_admin_clients_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."admin_clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_document_chunks" ADD CONSTRAINT "admin_document_chunks_documentId_admin_documents_id_fk" FOREIGN KEY ("documentId") REFERENCES "public"."admin_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_documents" ADD CONSTRAINT "admin_documents_clientId_admin_clients_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."admin_clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_gap_reports" ADD CONSTRAINT "admin_gap_reports_workspaceId_admin_workspaces_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."admin_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_inbox_items" ADD CONSTRAINT "admin_inbox_items_documentId_admin_documents_id_fk" FOREIGN KEY ("documentId") REFERENCES "public"."admin_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_kb_chunks" ADD CONSTRAINT "admin_kb_chunks_knowledgeBaseId_admin_knowledge_bases_id_fk" FOREIGN KEY ("knowledgeBaseId") REFERENCES "public"."admin_knowledge_bases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_kb_chunks" ADD CONSTRAINT "admin_kb_chunks_chunkId_admin_document_chunks_id_fk" FOREIGN KEY ("chunkId") REFERENCES "public"."admin_document_chunks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_kb_documents" ADD CONSTRAINT "admin_kb_documents_knowledgeBaseId_admin_knowledge_bases_id_fk" FOREIGN KEY ("knowledgeBaseId") REFERENCES "public"."admin_knowledge_bases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_kb_documents" ADD CONSTRAINT "admin_kb_documents_documentId_admin_documents_id_fk" FOREIGN KEY ("documentId") REFERENCES "public"."admin_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_messages" ADD CONSTRAINT "admin_messages_conversationId_admin_conversations_id_fk" FOREIGN KEY ("conversationId") REFERENCES "public"."admin_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_section_sources" ADD CONSTRAINT "admin_section_sources_sectionId_admin_workspace_sections_id_fk" FOREIGN KEY ("sectionId") REFERENCES "public"."admin_workspace_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_section_sources" ADD CONSTRAINT "admin_section_sources_versionId_admin_section_versions_id_fk" FOREIGN KEY ("versionId") REFERENCES "public"."admin_section_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_section_sources" ADD CONSTRAINT "admin_section_sources_documentId_admin_documents_id_fk" FOREIGN KEY ("documentId") REFERENCES "public"."admin_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_section_versions" ADD CONSTRAINT "admin_section_versions_sectionId_admin_workspace_sections_id_fk" FOREIGN KEY ("sectionId") REFERENCES "public"."admin_workspace_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_section_versions" ADD CONSTRAINT "admin_section_versions_sourceDocumentId_admin_documents_id_fk" FOREIGN KEY ("sourceDocumentId") REFERENCES "public"."admin_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_workspace_sections" ADD CONSTRAINT "admin_workspace_sections_workspaceId_admin_workspaces_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."admin_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_chunk_doc_idx" ON "admin_document_chunks" USING btree ("documentId");--> statement-breakpoint
CREATE INDEX "admin_gap_report_workspace_idx" ON "admin_gap_reports" USING btree ("workspaceId");--> statement-breakpoint
CREATE INDEX "admin_inbox_status_idx" ON "admin_inbox_items" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_kb_chunk_unique" ON "admin_kb_chunks" USING btree ("knowledgeBaseId","chunkId");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_kb_doc_unique" ON "admin_kb_documents" USING btree ("knowledgeBaseId","documentId");--> statement-breakpoint
CREATE INDEX "admin_msg_conv_idx" ON "admin_messages" USING btree ("conversationId");--> statement-breakpoint
CREATE INDEX "admin_section_source_section_idx" ON "admin_section_sources" USING btree ("sectionId");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_section_version_unique" ON "admin_section_versions" USING btree ("sectionId","version");--> statement-breakpoint
CREATE INDEX "admin_section_version_section_idx" ON "admin_section_versions" USING btree ("sectionId");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_settings_key_unique" ON "admin_settings" USING btree ("key");--> statement-breakpoint
CREATE INDEX "admin_ws_section_ws_idx" ON "admin_workspace_sections" USING btree ("workspaceId");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_ws_section_slug_unique" ON "admin_workspace_sections" USING btree ("workspaceId","slug");