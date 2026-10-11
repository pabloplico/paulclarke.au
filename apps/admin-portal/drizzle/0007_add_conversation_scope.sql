ALTER TABLE "admin_conversations" ADD COLUMN IF NOT EXISTS "workspaceId" integer REFERENCES "admin_workspaces"("id");
ALTER TABLE "admin_conversations" ADD COLUMN IF NOT EXISTS "scope" jsonb;
