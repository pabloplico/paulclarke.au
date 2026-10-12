-- Baseline: built from lib/db/schema with drizzle-kit generate. Replaces the old
-- 0000-0013 history, which could not build a fresh database.
-- pgvector is needed by the vector(1536) columns below.
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_sessions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"userId" integer NOT NULL,
	"token" varchar(500) NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admin_sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "admin_settings" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_settings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"key" varchar(100) NOT NULL,
	"value" jsonb NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"email" varchar(255) NOT NULL,
	"passwordHash" text NOT NULL,
	"name" varchar(255) NOT NULL,
	"role" varchar(20) DEFAULT 'admin' NOT NULL,
	"lastLoginAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admin_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "ai_statistics" (
	"id" integer PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"sort_order" integer NOT NULL,
	"title" text NOT NULL,
	"value" text,
	"suffix" text,
	"description" text NOT NULL,
	"detail" text,
	"source_name" text,
	"source_url" text,
	"source_date" text,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "admin_conversations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_conversations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"userId" integer,
	"title" varchar(500),
	"knowledgeBaseId" integer,
	"workspaceId" integer,
	"clientId" integer,
	"scope" jsonb,
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
	"userId" integer,
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
	"userId" integer,
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
CREATE TABLE "admin_clients" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_clients_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"userId" integer,
	"contactName" varchar(255) NOT NULL,
	"companyName" varchar(255),
	"email" varchar(255),
	"phone" varchar(50),
	"status" varchar(20) DEFAULT 'lead' NOT NULL,
	"type" varchar(20) DEFAULT 'lead' NOT NULL,
	"source" varchar(100),
	"website" varchar(500),
	"address" text,
	"industry" varchar(100),
	"notes" text,
	"metadata" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_communications" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_communications_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"userId" integer NOT NULL,
	"clientId" integer,
	"contactId" integer,
	"type" varchar(20) DEFAULT 'email' NOT NULL,
	"direction" varchar(20) DEFAULT 'outbound' NOT NULL,
	"subject" varchar(500),
	"body" text,
	"sentAt" timestamp DEFAULT now() NOT NULL,
	"templateId" integer,
	"followUpDate" timestamp,
	"followUpDone" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_contacts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_contacts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"userId" integer NOT NULL,
	"clientId" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255),
	"phone" varchar(50),
	"role" varchar(100),
	"isPrimary" boolean DEFAULT false NOT NULL,
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_email_templates" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_email_templates_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"userId" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"subject" varchar(500),
	"body" text NOT NULL,
	"category" varchar(50) DEFAULT 'general' NOT NULL,
	"metadata" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_inbox_items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_inbox_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"userId" integer,
	"type" varchar(20) NOT NULL,
	"title" varchar(500) NOT NULL,
	"content" text,
	"documentId" integer,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"routingResults" jsonb,
	"approvedResults" jsonb,
	"processingError" text,
	"qualityFlags" jsonb,
	"gapFindingRef" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"processedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "admin_invoice_line_items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_invoice_line_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"invoiceId" integer NOT NULL,
	"description" varchar(500) NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unitPrice" integer NOT NULL,
	"amount" integer NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_invoices" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_invoices_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"userId" integer NOT NULL,
	"clientId" integer,
	"jobId" integer,
	"invoiceNumber" varchar(50) NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"issueDate" timestamp NOT NULL,
	"dueDate" timestamp NOT NULL,
	"paidAt" timestamp,
	"subtotal" integer DEFAULT 0 NOT NULL,
	"taxRate" integer DEFAULT 10 NOT NULL,
	"taxAmount" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"currency" varchar(3) DEFAULT 'AUD' NOT NULL,
	"notes" text,
	"paymentTerms" text,
	"fromDetails" jsonb,
	"toDetails" jsonb,
	"metadata" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_jobs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_jobs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"userId" integer NOT NULL,
	"clientId" integer,
	"title" varchar(500) NOT NULL,
	"description" text,
	"stage" varchar(20) DEFAULT 'lead' NOT NULL,
	"quotedAmount" integer,
	"finalAmount" integer,
	"currency" varchar(3) DEFAULT 'AUD' NOT NULL,
	"startDate" timestamp,
	"dueDate" timestamp,
	"completedAt" timestamp,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_referrals" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_referrals_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"userId" integer NOT NULL,
	"referrerClientId" integer,
	"referredClientId" integer,
	"jobId" integer,
	"source" varchar(100),
	"notes" text,
	"referredAt" timestamp DEFAULT now() NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_todos" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_todos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"userId" integer NOT NULL,
	"title" varchar(500) NOT NULL,
	"description" text,
	"completed" boolean DEFAULT false NOT NULL,
	"completedAt" timestamp,
	"priority" varchar(20) DEFAULT 'medium' NOT NULL,
	"dueDate" timestamp,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"jobId" integer,
	"clientId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_agent_runs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_agent_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"userId" integer NOT NULL,
	"taskId" integer NOT NULL,
	"status" varchar(20) DEFAULT 'started' NOT NULL,
	"startedAt" timestamp DEFAULT now() NOT NULL,
	"completedAt" timestamp,
	"findingsCount" integer DEFAULT 0,
	"tokensUsed" integer DEFAULT 0,
	"errorLog" text,
	"log" jsonb DEFAULT '[]'::jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_agent_tasks" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_agent_tasks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"userId" integer NOT NULL,
	"workspaceId" integer NOT NULL,
	"agentType" varchar(20) NOT NULL,
	"name" varchar(255) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"cronSchedule" varchar(100),
	"config" jsonb DEFAULT '{}'::jsonb,
	"lastRun" timestamp,
	"runCount" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_feed_items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_feed_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"feedId" integer NOT NULL,
	"guid" varchar(500) NOT NULL,
	"title" varchar(500),
	"url" text,
	"contentHash" varchar(64),
	"inboxItemId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_feeds" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_feeds_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"userId" integer NOT NULL,
	"url" text NOT NULL,
	"type" varchar(20) NOT NULL,
	"label" varchar(255),
	"workspaceId" integer,
	"enabled" boolean DEFAULT true NOT NULL,
	"intervalMinutes" integer DEFAULT 60 NOT NULL,
	"lastFetchedAt" timestamp,
	"lastContentHash" varchar(64),
	"lastError" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_findings" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_findings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"userId" integer NOT NULL,
	"sourceId" integer,
	"workspaceId" integer NOT NULL,
	"agentRunId" integer,
	"findingType" varchar(20) NOT NULL,
	"title" varchar(500) NOT NULL,
	"content" text NOT NULL,
	"contentHash" varchar(32) NOT NULL,
	"confidenceScore" real DEFAULT 0.5 NOT NULL,
	"sentimentScore" real,
	"geo" jsonb DEFAULT '{}'::jsonb,
	"tags" jsonb DEFAULT '{}'::jsonb,
	"embedding" vector(1536),
	"url" text,
	"publishedAt" timestamp,
	"foundAt" timestamp DEFAULT now() NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_research_settings" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_research_settings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"userId" integer NOT NULL,
	"aiProvider" varchar(20) DEFAULT 'openai' NOT NULL,
	"aiModel" varchar(100) DEFAULT 'gpt-4o' NOT NULL,
	"embeddingModel" varchar(100) DEFAULT 'text-embedding-3-small' NOT NULL,
	"ollamaUrl" varchar(500) DEFAULT 'http://localhost:11434',
	"defaultCronSchedule" varchar(100) DEFAULT '0 2 * * *' NOT NULL,
	"minCompositeScore" real DEFAULT 0.3 NOT NULL,
	"maxResearchSteps" integer DEFAULT 15 NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_research_sources" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_research_sources_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"userId" integer NOT NULL,
	"workspaceId" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"sourceType" varchar(20) NOT NULL,
	"url" text,
	"config" jsonb DEFAULT '{}'::jsonb,
	"qualityScore" real DEFAULT 0.5,
	"reliabilityScore" real DEFAULT 0.5,
	"authorityScore" real DEFAULT 0.5,
	"compositeScore" real GENERATED ALWAYS AS ("qualityScore" * 0.4 + "reliabilityScore" * 0.35 + "authorityScore" * 0.25) STORED,
	"lastCrawledAt" timestamp,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_ai_provenance" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_ai_provenance_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"userId" integer,
	"operationType" varchar(30) NOT NULL,
	"sourceText" text NOT NULL,
	"outputText" text NOT NULL,
	"sourceEmbedding" vector(1536) NOT NULL,
	"outputEmbedding" vector(1536) NOT NULL,
	"cosineSimilarity" real NOT NULL,
	"status" varchar(20) DEFAULT 'passed' NOT NULL,
	"sectionId" integer,
	"actionPrompt" text,
	"metadata" jsonb,
	"reviewedAt" timestamp,
	"reviewedBy" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_content_audit_reports" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_content_audit_reports_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"userId" integer,
	"findings" jsonb,
	"postsSummary" jsonb,
	"insightsSummary" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_gap_reports" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_gap_reports_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"workspaceId" integer NOT NULL,
	"findings" jsonb NOT NULL,
	"workspaceContentHash" varchar(64),
	"sectionContentHashes" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_section_dependencies" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_section_dependencies_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"sectionId" integer NOT NULL,
	"dependsOnSectionId" integer NOT NULL,
	"relationType" varchar(30) NOT NULL,
	"description" text,
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
CREATE TABLE "admin_workspace_sections" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_workspace_sections_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"workspaceId" integer NOT NULL,
	"slug" varchar(100) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"template" varchar(20) DEFAULT 'prose' NOT NULL,
	"parentSectionId" integer,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"completenessRules" jsonb,
	"metadata" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admin_ws_section_no_self_parent" CHECK ("parentSectionId" IS NULL OR "parentSectionId" != id)
);
--> statement-breakpoint
CREATE TABLE "admin_workspaces" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_workspaces_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"userId" integer,
	"slug" varchar(100) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"icon" varchar(50),
	"category" varchar(100),
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"archivedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admin_workspaces_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_userId_admin_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_conversations" ADD CONSTRAINT "admin_conversations_userId_admin_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_conversations" ADD CONSTRAINT "admin_conversations_knowledgeBaseId_admin_knowledge_bases_id_fk" FOREIGN KEY ("knowledgeBaseId") REFERENCES "public"."admin_knowledge_bases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_conversations" ADD CONSTRAINT "admin_conversations_workspaceId_admin_workspaces_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."admin_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_conversations" ADD CONSTRAINT "admin_conversations_clientId_admin_clients_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."admin_clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_document_chunks" ADD CONSTRAINT "admin_document_chunks_documentId_admin_documents_id_fk" FOREIGN KEY ("documentId") REFERENCES "public"."admin_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_documents" ADD CONSTRAINT "admin_documents_userId_admin_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_documents" ADD CONSTRAINT "admin_documents_clientId_admin_clients_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."admin_clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_kb_chunks" ADD CONSTRAINT "admin_kb_chunks_knowledgeBaseId_admin_knowledge_bases_id_fk" FOREIGN KEY ("knowledgeBaseId") REFERENCES "public"."admin_knowledge_bases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_kb_chunks" ADD CONSTRAINT "admin_kb_chunks_chunkId_admin_document_chunks_id_fk" FOREIGN KEY ("chunkId") REFERENCES "public"."admin_document_chunks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_kb_documents" ADD CONSTRAINT "admin_kb_documents_knowledgeBaseId_admin_knowledge_bases_id_fk" FOREIGN KEY ("knowledgeBaseId") REFERENCES "public"."admin_knowledge_bases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_kb_documents" ADD CONSTRAINT "admin_kb_documents_documentId_admin_documents_id_fk" FOREIGN KEY ("documentId") REFERENCES "public"."admin_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_knowledge_bases" ADD CONSTRAINT "admin_knowledge_bases_userId_admin_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_messages" ADD CONSTRAINT "admin_messages_conversationId_admin_conversations_id_fk" FOREIGN KEY ("conversationId") REFERENCES "public"."admin_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_clients" ADD CONSTRAINT "admin_clients_userId_admin_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_communications" ADD CONSTRAINT "admin_communications_userId_admin_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_communications" ADD CONSTRAINT "admin_communications_clientId_admin_clients_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."admin_clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_communications" ADD CONSTRAINT "admin_communications_contactId_admin_contacts_id_fk" FOREIGN KEY ("contactId") REFERENCES "public"."admin_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_communications" ADD CONSTRAINT "admin_communications_templateId_admin_email_templates_id_fk" FOREIGN KEY ("templateId") REFERENCES "public"."admin_email_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_contacts" ADD CONSTRAINT "admin_contacts_userId_admin_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_contacts" ADD CONSTRAINT "admin_contacts_clientId_admin_clients_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."admin_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_email_templates" ADD CONSTRAINT "admin_email_templates_userId_admin_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_inbox_items" ADD CONSTRAINT "admin_inbox_items_userId_admin_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_inbox_items" ADD CONSTRAINT "admin_inbox_items_documentId_admin_documents_id_fk" FOREIGN KEY ("documentId") REFERENCES "public"."admin_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_invoice_line_items" ADD CONSTRAINT "admin_invoice_line_items_invoiceId_admin_invoices_id_fk" FOREIGN KEY ("invoiceId") REFERENCES "public"."admin_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_invoices" ADD CONSTRAINT "admin_invoices_userId_admin_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_invoices" ADD CONSTRAINT "admin_invoices_clientId_admin_clients_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."admin_clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_invoices" ADD CONSTRAINT "admin_invoices_jobId_admin_jobs_id_fk" FOREIGN KEY ("jobId") REFERENCES "public"."admin_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_jobs" ADD CONSTRAINT "admin_jobs_userId_admin_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_jobs" ADD CONSTRAINT "admin_jobs_clientId_admin_clients_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."admin_clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_referrals" ADD CONSTRAINT "admin_referrals_userId_admin_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_referrals" ADD CONSTRAINT "admin_referrals_referrerClientId_admin_clients_id_fk" FOREIGN KEY ("referrerClientId") REFERENCES "public"."admin_clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_referrals" ADD CONSTRAINT "admin_referrals_referredClientId_admin_clients_id_fk" FOREIGN KEY ("referredClientId") REFERENCES "public"."admin_clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_referrals" ADD CONSTRAINT "admin_referrals_jobId_admin_jobs_id_fk" FOREIGN KEY ("jobId") REFERENCES "public"."admin_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_todos" ADD CONSTRAINT "admin_todos_userId_admin_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_todos" ADD CONSTRAINT "admin_todos_jobId_admin_jobs_id_fk" FOREIGN KEY ("jobId") REFERENCES "public"."admin_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_todos" ADD CONSTRAINT "admin_todos_clientId_admin_clients_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."admin_clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_agent_runs" ADD CONSTRAINT "admin_agent_runs_userId_admin_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_agent_runs" ADD CONSTRAINT "admin_agent_runs_taskId_admin_agent_tasks_id_fk" FOREIGN KEY ("taskId") REFERENCES "public"."admin_agent_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_agent_tasks" ADD CONSTRAINT "admin_agent_tasks_userId_admin_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_agent_tasks" ADD CONSTRAINT "admin_agent_tasks_workspaceId_admin_workspaces_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."admin_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_feed_items" ADD CONSTRAINT "admin_feed_items_feedId_admin_feeds_id_fk" FOREIGN KEY ("feedId") REFERENCES "public"."admin_feeds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_feed_items" ADD CONSTRAINT "admin_feed_items_inboxItemId_admin_inbox_items_id_fk" FOREIGN KEY ("inboxItemId") REFERENCES "public"."admin_inbox_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_feeds" ADD CONSTRAINT "admin_feeds_userId_admin_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_feeds" ADD CONSTRAINT "admin_feeds_workspaceId_admin_workspaces_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."admin_workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_findings" ADD CONSTRAINT "admin_findings_userId_admin_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_findings" ADD CONSTRAINT "admin_findings_sourceId_admin_research_sources_id_fk" FOREIGN KEY ("sourceId") REFERENCES "public"."admin_research_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_findings" ADD CONSTRAINT "admin_findings_workspaceId_admin_workspaces_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."admin_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_findings" ADD CONSTRAINT "admin_findings_agentRunId_admin_agent_runs_id_fk" FOREIGN KEY ("agentRunId") REFERENCES "public"."admin_agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_research_settings" ADD CONSTRAINT "admin_research_settings_userId_admin_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_research_sources" ADD CONSTRAINT "admin_research_sources_userId_admin_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_research_sources" ADD CONSTRAINT "admin_research_sources_workspaceId_admin_workspaces_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."admin_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_ai_provenance" ADD CONSTRAINT "admin_ai_provenance_userId_admin_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_ai_provenance" ADD CONSTRAINT "admin_ai_provenance_sectionId_admin_workspace_sections_id_fk" FOREIGN KEY ("sectionId") REFERENCES "public"."admin_workspace_sections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_ai_provenance" ADD CONSTRAINT "admin_ai_provenance_reviewedBy_admin_users_id_fk" FOREIGN KEY ("reviewedBy") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_content_audit_reports" ADD CONSTRAINT "admin_content_audit_reports_userId_admin_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_gap_reports" ADD CONSTRAINT "admin_gap_reports_workspaceId_admin_workspaces_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."admin_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_section_dependencies" ADD CONSTRAINT "admin_section_dependencies_sectionId_admin_workspace_sections_id_fk" FOREIGN KEY ("sectionId") REFERENCES "public"."admin_workspace_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_section_dependencies" ADD CONSTRAINT "admin_section_dependencies_dependsOnSectionId_admin_workspace_sections_id_fk" FOREIGN KEY ("dependsOnSectionId") REFERENCES "public"."admin_workspace_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_section_sources" ADD CONSTRAINT "admin_section_sources_sectionId_admin_workspace_sections_id_fk" FOREIGN KEY ("sectionId") REFERENCES "public"."admin_workspace_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_section_sources" ADD CONSTRAINT "admin_section_sources_versionId_admin_section_versions_id_fk" FOREIGN KEY ("versionId") REFERENCES "public"."admin_section_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_section_sources" ADD CONSTRAINT "admin_section_sources_documentId_admin_documents_id_fk" FOREIGN KEY ("documentId") REFERENCES "public"."admin_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_section_versions" ADD CONSTRAINT "admin_section_versions_sectionId_admin_workspace_sections_id_fk" FOREIGN KEY ("sectionId") REFERENCES "public"."admin_workspace_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_section_versions" ADD CONSTRAINT "admin_section_versions_sourceDocumentId_admin_documents_id_fk" FOREIGN KEY ("sourceDocumentId") REFERENCES "public"."admin_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_workspace_sections" ADD CONSTRAINT "admin_workspace_sections_workspaceId_admin_workspaces_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."admin_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_workspace_sections" ADD CONSTRAINT "admin_workspace_sections_parentSectionId_admin_workspace_sections_id_fk" FOREIGN KEY ("parentSectionId") REFERENCES "public"."admin_workspace_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_workspaces" ADD CONSTRAINT "admin_workspaces_userId_admin_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_session_user_idx" ON "admin_sessions" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_settings_key_unique" ON "admin_settings" USING btree ("key");--> statement-breakpoint
CREATE INDEX "admin_chunk_doc_idx" ON "admin_document_chunks" USING btree ("documentId");--> statement-breakpoint
CREATE INDEX "admin_document_user_idx" ON "admin_documents" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "admin_document_user_status_idx" ON "admin_documents" USING btree ("userId","status","archivedAt");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_kb_chunk_unique" ON "admin_kb_chunks" USING btree ("knowledgeBaseId","chunkId");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_kb_doc_unique" ON "admin_kb_documents" USING btree ("knowledgeBaseId","documentId");--> statement-breakpoint
CREATE INDEX "admin_kb_user_idx" ON "admin_knowledge_bases" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "admin_msg_conv_idx" ON "admin_messages" USING btree ("conversationId");--> statement-breakpoint
CREATE INDEX "admin_client_user_idx" ON "admin_clients" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "admin_client_user_status_idx" ON "admin_clients" USING btree ("userId","status");--> statement-breakpoint
CREATE INDEX "admin_client_user_type_idx" ON "admin_clients" USING btree ("userId","type");--> statement-breakpoint
CREATE INDEX "admin_comm_user_idx" ON "admin_communications" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "admin_comm_client_idx" ON "admin_communications" USING btree ("clientId");--> statement-breakpoint
CREATE INDEX "admin_comm_followup_idx" ON "admin_communications" USING btree ("followUpDate");--> statement-breakpoint
CREATE INDEX "admin_contact_client_idx" ON "admin_contacts" USING btree ("clientId");--> statement-breakpoint
CREATE INDEX "admin_contact_user_idx" ON "admin_contacts" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "admin_email_template_user_idx" ON "admin_email_templates" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "admin_inbox_status_idx" ON "admin_inbox_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "admin_inbox_user_idx" ON "admin_inbox_items" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "admin_line_item_invoice_idx" ON "admin_invoice_line_items" USING btree ("invoiceId");--> statement-breakpoint
CREATE INDEX "admin_invoice_user_idx" ON "admin_invoices" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "admin_invoice_client_idx" ON "admin_invoices" USING btree ("clientId");--> statement-breakpoint
CREATE INDEX "admin_invoice_job_idx" ON "admin_invoices" USING btree ("jobId");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_invoice_number_unique" ON "admin_invoices" USING btree ("userId","invoiceNumber");--> statement-breakpoint
CREATE INDEX "admin_job_user_idx" ON "admin_jobs" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "admin_job_client_idx" ON "admin_jobs" USING btree ("clientId");--> statement-breakpoint
CREATE INDEX "admin_job_stage_idx" ON "admin_jobs" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "admin_referral_user_idx" ON "admin_referrals" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "admin_referral_referrer_idx" ON "admin_referrals" USING btree ("referrerClientId");--> statement-breakpoint
CREATE INDEX "admin_referral_referred_idx" ON "admin_referrals" USING btree ("referredClientId");--> statement-breakpoint
CREATE INDEX "admin_todo_user_idx" ON "admin_todos" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "admin_agent_run_user_idx" ON "admin_agent_runs" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "admin_agent_run_task_idx" ON "admin_agent_runs" USING btree ("taskId");--> statement-breakpoint
CREATE INDEX "admin_agent_run_status_idx" ON "admin_agent_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "admin_agent_task_user_idx" ON "admin_agent_tasks" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "admin_agent_task_ws_idx" ON "admin_agent_tasks" USING btree ("workspaceId");--> statement-breakpoint
CREATE INDEX "admin_agent_task_status_idx" ON "admin_agent_tasks" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_feed_item_guid_unique" ON "admin_feed_items" USING btree ("feedId","guid");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_finding_dedup_idx" ON "admin_findings" USING btree ("workspaceId","contentHash");--> statement-breakpoint
CREATE INDEX "admin_finding_user_idx" ON "admin_findings" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "admin_finding_ws_idx" ON "admin_findings" USING btree ("workspaceId");--> statement-breakpoint
CREATE INDEX "admin_finding_type_idx" ON "admin_findings" USING btree ("findingType");--> statement-breakpoint
CREATE INDEX "admin_finding_confidence_idx" ON "admin_findings" USING btree ("confidenceScore");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_research_settings_user_unique" ON "admin_research_settings" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "admin_research_source_user_idx" ON "admin_research_sources" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "admin_research_source_ws_idx" ON "admin_research_sources" USING btree ("workspaceId");--> statement-breakpoint
CREATE INDEX "admin_research_source_type_idx" ON "admin_research_sources" USING btree ("sourceType");--> statement-breakpoint
CREATE INDEX "admin_ai_provenance_section_idx" ON "admin_ai_provenance" USING btree ("sectionId");--> statement-breakpoint
CREATE INDEX "admin_ai_provenance_status_idx" ON "admin_ai_provenance" USING btree ("status");--> statement-breakpoint
CREATE INDEX "admin_gap_report_workspace_idx" ON "admin_gap_reports" USING btree ("workspaceId");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_section_dep_unique" ON "admin_section_dependencies" USING btree ("sectionId","dependsOnSectionId");--> statement-breakpoint
CREATE INDEX "admin_section_dep_section_idx" ON "admin_section_dependencies" USING btree ("sectionId");--> statement-breakpoint
CREATE INDEX "admin_section_dep_target_idx" ON "admin_section_dependencies" USING btree ("dependsOnSectionId");--> statement-breakpoint
CREATE INDEX "admin_section_source_section_idx" ON "admin_section_sources" USING btree ("sectionId");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_section_version_unique" ON "admin_section_versions" USING btree ("sectionId","version");--> statement-breakpoint
CREATE INDEX "admin_section_version_section_idx" ON "admin_section_versions" USING btree ("sectionId","version");--> statement-breakpoint
CREATE INDEX "admin_ws_section_ws_idx" ON "admin_workspace_sections" USING btree ("workspaceId");--> statement-breakpoint
CREATE INDEX "admin_ws_section_parent_idx" ON "admin_workspace_sections" USING btree ("parentSectionId");--> statement-breakpoint
CREATE INDEX "admin_ws_section_ws_parent_idx" ON "admin_workspace_sections" USING btree ("workspaceId","parentSectionId");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_ws_section_slug_unique" ON "admin_workspace_sections" USING btree ("workspaceId","slug");