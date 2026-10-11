CREATE TABLE "mr_agent_runs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mr_agent_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
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
CREATE TABLE "mr_agent_tasks" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mr_agent_tasks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"userId" integer NOT NULL,
	"marketId" integer NOT NULL,
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
CREATE TABLE "mr_finding_embeddings" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mr_finding_embeddings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"findingId" integer NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"model" varchar(100) DEFAULT 'text-embedding-3-small' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mr_findings" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mr_findings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"userId" integer NOT NULL,
	"sourceId" integer,
	"marketId" integer NOT NULL,
	"agentRunId" integer,
	"findingType" varchar(20) NOT NULL,
	"title" varchar(500) NOT NULL,
	"content" text NOT NULL,
	"contentHash" varchar(32) NOT NULL,
	"confidenceScore" real DEFAULT 0.5 NOT NULL,
	"sentimentScore" real,
	"geo" jsonb DEFAULT '{}'::jsonb,
	"tags" jsonb DEFAULT '{}'::jsonb,
	"url" text,
	"publishedAt" timestamp,
	"foundAt" timestamp DEFAULT now() NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mr_markets" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mr_markets_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"userId" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"marketType" varchar(10) NOT NULL,
	"industry" varchar(255),
	"geo" jsonb DEFAULT '{}'::jsonb,
	"config" jsonb DEFAULT '{}'::jsonb,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mr_reports" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mr_reports_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"userId" integer NOT NULL,
	"marketId" integer NOT NULL,
	"title" varchar(500) NOT NULL,
	"summary" text,
	"sections" jsonb DEFAULT '[]'::jsonb,
	"summaryEmbedding" vector(1536),
	"generatedBy" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mr_settings" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mr_settings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
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
CREATE TABLE "mr_sources" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mr_sources_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"userId" integer NOT NULL,
	"marketId" integer NOT NULL,
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
ALTER TABLE "mr_agent_runs" ADD CONSTRAINT "mr_agent_runs_userId_admin_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mr_agent_runs" ADD CONSTRAINT "mr_agent_runs_taskId_mr_agent_tasks_id_fk" FOREIGN KEY ("taskId") REFERENCES "public"."mr_agent_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mr_agent_tasks" ADD CONSTRAINT "mr_agent_tasks_userId_admin_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mr_agent_tasks" ADD CONSTRAINT "mr_agent_tasks_marketId_mr_markets_id_fk" FOREIGN KEY ("marketId") REFERENCES "public"."mr_markets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mr_finding_embeddings" ADD CONSTRAINT "mr_finding_embeddings_findingId_mr_findings_id_fk" FOREIGN KEY ("findingId") REFERENCES "public"."mr_findings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mr_findings" ADD CONSTRAINT "mr_findings_userId_admin_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mr_findings" ADD CONSTRAINT "mr_findings_sourceId_mr_sources_id_fk" FOREIGN KEY ("sourceId") REFERENCES "public"."mr_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mr_findings" ADD CONSTRAINT "mr_findings_marketId_mr_markets_id_fk" FOREIGN KEY ("marketId") REFERENCES "public"."mr_markets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mr_findings" ADD CONSTRAINT "mr_findings_agentRunId_mr_agent_runs_id_fk" FOREIGN KEY ("agentRunId") REFERENCES "public"."mr_agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mr_markets" ADD CONSTRAINT "mr_markets_userId_admin_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mr_reports" ADD CONSTRAINT "mr_reports_userId_admin_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mr_reports" ADD CONSTRAINT "mr_reports_marketId_mr_markets_id_fk" FOREIGN KEY ("marketId") REFERENCES "public"."mr_markets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mr_reports" ADD CONSTRAINT "mr_reports_generatedBy_mr_agent_runs_id_fk" FOREIGN KEY ("generatedBy") REFERENCES "public"."mr_agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mr_settings" ADD CONSTRAINT "mr_settings_userId_admin_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mr_sources" ADD CONSTRAINT "mr_sources_userId_admin_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mr_sources" ADD CONSTRAINT "mr_sources_marketId_mr_markets_id_fk" FOREIGN KEY ("marketId") REFERENCES "public"."mr_markets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mr_run_user_idx" ON "mr_agent_runs" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "mr_run_task_idx" ON "mr_agent_runs" USING btree ("taskId");--> statement-breakpoint
CREATE INDEX "mr_run_status_idx" ON "mr_agent_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "mr_task_user_idx" ON "mr_agent_tasks" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "mr_task_market_idx" ON "mr_agent_tasks" USING btree ("marketId");--> statement-breakpoint
CREATE INDEX "mr_task_status_idx" ON "mr_agent_tasks" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "mr_embedding_finding_idx" ON "mr_finding_embeddings" USING btree ("findingId");--> statement-breakpoint
CREATE UNIQUE INDEX "mr_finding_dedup_idx" ON "mr_findings" USING btree ("marketId","contentHash");--> statement-breakpoint
CREATE INDEX "mr_finding_user_idx" ON "mr_findings" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "mr_finding_market_idx" ON "mr_findings" USING btree ("marketId");--> statement-breakpoint
CREATE INDEX "mr_finding_type_idx" ON "mr_findings" USING btree ("findingType");--> statement-breakpoint
CREATE INDEX "mr_finding_confidence_idx" ON "mr_findings" USING btree ("confidenceScore");--> statement-breakpoint
CREATE INDEX "mr_market_user_idx" ON "mr_markets" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "mr_market_type_idx" ON "mr_markets" USING btree ("marketType");--> statement-breakpoint
CREATE INDEX "mr_report_user_idx" ON "mr_reports" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "mr_report_market_idx" ON "mr_reports" USING btree ("marketId");--> statement-breakpoint
CREATE UNIQUE INDEX "mr_settings_user_unique" ON "mr_settings" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "mr_source_user_idx" ON "mr_sources" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "mr_source_market_idx" ON "mr_sources" USING btree ("marketId");--> statement-breakpoint
CREATE INDEX "mr_source_type_idx" ON "mr_sources" USING btree ("sourceType");