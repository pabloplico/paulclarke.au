ALTER TABLE "admin_clients" ADD COLUMN "userId" integer;--> statement-breakpoint
ALTER TABLE "admin_content_audit_reports" ADD COLUMN "userId" integer;--> statement-breakpoint
ALTER TABLE "admin_conversations" ADD COLUMN "userId" integer;--> statement-breakpoint
ALTER TABLE "admin_documents" ADD COLUMN "userId" integer;--> statement-breakpoint
ALTER TABLE "admin_inbox_items" ADD COLUMN "userId" integer;--> statement-breakpoint
ALTER TABLE "admin_knowledge_bases" ADD COLUMN "userId" integer;--> statement-breakpoint
ALTER TABLE "admin_workspaces" ADD COLUMN "userId" integer;--> statement-breakpoint
ALTER TABLE "admin_clients" ADD CONSTRAINT "admin_clients_userId_admin_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_content_audit_reports" ADD CONSTRAINT "admin_content_audit_reports_userId_admin_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_conversations" ADD CONSTRAINT "admin_conversations_userId_admin_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_documents" ADD CONSTRAINT "admin_documents_userId_admin_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_inbox_items" ADD CONSTRAINT "admin_inbox_items_userId_admin_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_knowledge_bases" ADD CONSTRAINT "admin_knowledge_bases_userId_admin_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_workspaces" ADD CONSTRAINT "admin_workspaces_userId_admin_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;