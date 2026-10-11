-- Add archivedAt column to admin_workspaces for soft-delete/archive support
ALTER TABLE admin_workspaces ADD COLUMN IF NOT EXISTS "archivedAt" timestamp;
