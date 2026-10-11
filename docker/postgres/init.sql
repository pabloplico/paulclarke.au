-- PostgreSQL initialization for admin-portal dev
-- Schema is managed by Drizzle ORM migrations (pnpm db:migrate)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

GRANT ALL ON SCHEMA public TO business_portal;
GRANT ALL ON ALL TABLES IN SCHEMA public TO business_portal;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO business_portal;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO business_portal;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO business_portal;
