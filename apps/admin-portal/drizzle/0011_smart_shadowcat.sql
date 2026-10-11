ALTER TABLE "admin_gap_reports" ADD COLUMN "workspaceContentHash" varchar(64);--> statement-breakpoint
ALTER TABLE "admin_gap_reports" ADD COLUMN "sectionContentHashes" jsonb;--> statement-breakpoint
CREATE INDEX "admin_client_user_idx" ON "admin_clients" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "admin_client_user_status_idx" ON "admin_clients" USING btree ("userId","status");--> statement-breakpoint
CREATE INDEX "admin_client_user_type_idx" ON "admin_clients" USING btree ("userId","type");--> statement-breakpoint
CREATE INDEX "admin_document_user_idx" ON "admin_documents" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "admin_kb_user_idx" ON "admin_knowledge_bases" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "admin_ws_section_ws_parent_idx" ON "admin_workspace_sections" USING btree ("workspaceId","parentSectionId");--> statement-breakpoint
ALTER TABLE "admin_workspace_sections" ADD CONSTRAINT "admin_ws_section_no_self_parent" CHECK ("parentSectionId" IS NULL OR "parentSectionId" != id);