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
ALTER TABLE "admin_ai_provenance" ADD CONSTRAINT "admin_ai_provenance_userId_admin_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_ai_provenance" ADD CONSTRAINT "admin_ai_provenance_sectionId_admin_workspace_sections_id_fk" FOREIGN KEY ("sectionId") REFERENCES "public"."admin_workspace_sections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_ai_provenance" ADD CONSTRAINT "admin_ai_provenance_reviewedBy_admin_users_id_fk" FOREIGN KEY ("reviewedBy") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_ai_provenance_section_idx" ON "admin_ai_provenance" USING btree ("sectionId");--> statement-breakpoint
CREATE INDEX "admin_ai_provenance_status_idx" ON "admin_ai_provenance" USING btree ("status");