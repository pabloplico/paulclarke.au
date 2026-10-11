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
ALTER TABLE "admin_clients" ADD COLUMN "type" varchar(20) DEFAULT 'lead' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_clients" ADD COLUMN "source" varchar(100);--> statement-breakpoint
ALTER TABLE "admin_clients" ADD COLUMN "website" varchar(500);--> statement-breakpoint
ALTER TABLE "admin_clients" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "admin_todos" ADD COLUMN "jobId" integer;--> statement-breakpoint
ALTER TABLE "admin_todos" ADD COLUMN "clientId" integer;--> statement-breakpoint
ALTER TABLE "admin_communications" ADD CONSTRAINT "admin_communications_userId_admin_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_communications" ADD CONSTRAINT "admin_communications_clientId_admin_clients_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."admin_clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_communications" ADD CONSTRAINT "admin_communications_contactId_admin_contacts_id_fk" FOREIGN KEY ("contactId") REFERENCES "public"."admin_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_communications" ADD CONSTRAINT "admin_communications_templateId_admin_email_templates_id_fk" FOREIGN KEY ("templateId") REFERENCES "public"."admin_email_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_contacts" ADD CONSTRAINT "admin_contacts_userId_admin_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_contacts" ADD CONSTRAINT "admin_contacts_clientId_admin_clients_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."admin_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_email_templates" ADD CONSTRAINT "admin_email_templates_userId_admin_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
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
CREATE INDEX "admin_comm_user_idx" ON "admin_communications" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "admin_comm_client_idx" ON "admin_communications" USING btree ("clientId");--> statement-breakpoint
CREATE INDEX "admin_comm_followup_idx" ON "admin_communications" USING btree ("followUpDate");--> statement-breakpoint
CREATE INDEX "admin_contact_client_idx" ON "admin_contacts" USING btree ("clientId");--> statement-breakpoint
CREATE INDEX "admin_contact_user_idx" ON "admin_contacts" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "admin_email_template_user_idx" ON "admin_email_templates" USING btree ("userId");--> statement-breakpoint
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
ALTER TABLE "admin_todos" ADD CONSTRAINT "admin_todos_jobId_admin_jobs_id_fk" FOREIGN KEY ("jobId") REFERENCES "public"."admin_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_todos" ADD CONSTRAINT "admin_todos_clientId_admin_clients_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."admin_clients"("id") ON DELETE set null ON UPDATE no action;