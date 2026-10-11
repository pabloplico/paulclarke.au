-- Gap Reports table for Phase 4
CREATE TABLE IF NOT EXISTS admin_gap_reports (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  workspace_id INTEGER NOT NULL REFERENCES admin_workspaces(id) ON DELETE CASCADE,
  findings JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS admin_gap_report_workspace_idx ON admin_gap_reports(workspace_id);
