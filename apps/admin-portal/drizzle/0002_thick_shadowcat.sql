CREATE TABLE "admin_content_audit_reports" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_content_audit_reports_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"findings" jsonb,
	"postsSummary" jsonb,
	"insightsSummary" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL
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
