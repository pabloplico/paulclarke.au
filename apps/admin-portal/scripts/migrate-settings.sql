-- Settings key-value store for runtime configuration
CREATE TABLE IF NOT EXISTS admin_settings (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  key VARCHAR(100) NOT NULL,
  value JSONB NOT NULL,
  "updatedAt" TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_settings_key_unique ON admin_settings(key);
