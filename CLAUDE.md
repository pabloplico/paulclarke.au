# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Deployment Overview

- **`apps/website`** — Stateless Vite SPA + Hono Worker. No database. Deployed to **Cloudflare Workers** with the Static Assets binding. Domain: `paulclarke.au`.
- **`apps/admin-portal`** — Next.js + postgres + redis. Deployed via Docker. Optional Playwright for URL scraping.

## Production Builds

### Website (Cloudflare Workers)

The website is a single Worker that serves the Vite SPA via the Static Assets binding and exposes a tiny blog API (`/api/posts`). Build and deploy from `apps/website/`:

```bash
cd apps/website
pnpm deploy            # vite build + wrangler deploy
pnpm deploy:dry-run    # build + bundle without uploading
```

The Worker has **no secrets**. The contact form opens the visitor's email client via `mailto:`, and the assessment results are downloaded as a PDF via the browser's print dialog (`window.print()` + a print stylesheet in `globals.css`). No Resend, no Turnstile, no SMTP.

Custom domain (`paulclarke.au`) is bound via the Cloudflare dashboard:
**Workers & Pages → website → Settings → Domains & Routes → Add Custom Domain**.
DNS must be on Cloudflare; the dashboard provisions the cert automatically.

Blog posts in `apps/website/content/posts/*.md` are bundled into the Worker at build time by `scripts/build-posts.mjs` (emits `server/posts.generated.ts`, gitignored).

### Admin Portal (Docker)

```bash
docker build -t admin-portal -f apps/admin-portal/Dockerfile .

# With Playwright (for URL scraping):
docker build --build-arg INSTALL_PLAYWRIGHT=true -t admin-portal -f apps/admin-portal/Dockerfile .
```

Next.js uses `output: 'standalone'` — the prod image contains only traced dependencies.

## Docker Dev Environments

Each app has its own `docker-compose.yml` and `Dockerfile.dev` in its app directory. All dev images use `node:22-alpine` (matching prod). Run commands from the app directory.

### Website Dev

The website dev container runs Vite (SPA, port 3004) and `wrangler dev` (Worker, port 3005) side-by-side. Vite proxies `/api/*` to the Worker. The Worker only serves the blog API — there are no secrets.

```bash
cd apps/website
cp .dev.vars.example .dev.vars    # only ENVIRONMENT=development
docker compose up -d              # Vite on 3004, wrangler dev on 3005
docker compose logs -f app        # View logs
docker compose down               # Stop
docker compose exec app <command> # Run commands
```

The dev container uses `node:22-slim` (not Alpine) because `workerd`, the Cloudflare Workers runtime that backs `wrangler dev`, ships glibc-only binaries that fail to spawn on musl libc.

### Admin Portal Dev

```bash
cd apps/admin-portal
docker compose up -d                      # Start (port 3001 + postgres + redis)
docker compose --profile ai up -d         # Include Ollama
docker compose logs -f app                # View logs
docker compose down                       # Stop
docker compose exec app <command>         # Run commands
```

### Running commands inside the container

All build, test, lint, and database commands must run inside the `app` container:

```bash
docker compose exec app <command>
```

Examples (from `apps/admin-portal/`):

```bash
# Build
docker compose exec app pnpm build

# Lint — Turbo runs `biome check .` in every package, plus `lint:root`
# for root-level config files (the container's working dir is the root)
docker compose exec app pnpm lint
docker compose exec app pnpm lint:fix    # biome check --write --unsafe .

# Type checking — Turbo runs `tsc --noEmit` in admin-portal, website and @repo/ui
docker compose exec app pnpm check-types

# Unit tests (Vitest in admin-portal and website)
docker compose exec app pnpm test
docker compose exec app bash -c "cd apps/admin-portal && npx vitest run lib/rag/chunker.test.ts"

# E2E tests (website: Playwright + axe against wrangler dev, no services needed;
# admin-portal needs postgres + redis)
docker compose exec app pnpm --filter website test:e2e
docker compose exec app pnpm test:e2e

# Database (from admin-portal dir inside container)
docker compose exec app bash -c "cd apps/admin-portal && pnpm db:generate"
docker compose exec app bash -c "cd apps/admin-portal && pnpm db:migrate"
docker compose exec app bash -c "cd apps/admin-portal && pnpm db:studio"
```

### After adding dependencies

If you add deps on the host (`pnpm add ...`), you must rebuild or install inside the container:

```bash
docker compose exec app pnpm install
```

### Environment variables

All env vars live in **`.env.docker`** (root of repo). Copy `.env.docker.example` to `.env.docker` to set up. Do **not** create `.env.local` files in app directories — the Docker container loads `.env.docker` via `env_file` in docker-compose.

Key vars (see `.env.docker.example` for full list):
- `DATABASE_URL` — Set in docker-compose `environment` (points to `postgres` service hostname)
- `REDIS_URL` — Redis connection string (points to `redis` service hostname)
- `AI_PROVIDER` — `anthropic`, `openai`, or `gemini`
- `AI_MODEL` — Model ID (e.g. `claude-sonnet-4-6`, `gpt-4o`, `gpt-5.2`)
- `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` — API keys for chosen provider
- `AUTH_SECRET` — JWT signing secret for session auth (required for login/signup to work; if unset, middleware skips auth)

### Services

| Service | App | Container | Port |
|---------|-----|-----------|------|
| Website (dev, Vite SPA) | website | `website-dev` | 3004 |
| Website (dev, wrangler Worker) | website | `website-dev` | 3005 |
| Admin Portal (dev) | admin-portal | `admin-portal-dev-node` | 3001 |
| PostgreSQL 15 (pgvector) | admin-portal | `admin-portal-dev-postgres` | 5432 |
| Redis 7 | admin-portal | `admin-portal-dev-redis` | 6379 |
| Ollama (optional, `--profile ai`) | admin-portal | `admin-portal-dev-ollama` | 11434 |

DB user: `business_portal` (admin-portal). Password set via `POSTGRES_PASSWORD` in `.env.docker`.

## Architecture

**Monorepo** with pnpm workspaces + Turborepo.

### Apps

| App | Framework | Production | Dev | Role |
|-----|-----------|-----------|-----|------|
| `apps/website` | Vite SPA + Hono Worker | Cloudflare Workers (paulclarke.au) | Docker (Vite 3004, wrangler 3005) | Developer portfolio: projects, assessment demo, writing |
| `apps/admin-portal` | Next.js 16 | Docker | Docker (port 3001) | Internal: workspace knowledge management, document processing, inbox routing, gap analysis |

### Packages

- **`@repo/ui`** — Shared React components (Button, Card, Badge, Input, etc.). Uses direct path exports: `import { Button } from '@repo/ui/button'` (no barrel file).
- **`@repo/typescript-config`** — Shared tsconfig bases (base, vite, nextjs, react-library)
- **`@repo/biome-config`** — Shared Biome linting/formatting rules
- **`@repo/prettier-config`** — Shared Prettier config

### Website

- **Developer portfolio** — Pages: Home, Projects, Assessment, About, Writing, Contact. Code-based TanStack Router routes in `src/router.tsx` (`/assessment` and `/writing/$slug` are lazy). Project cards come from `src/lib/data/projects.ts`.
- **Deep links** — `wrangler.jsonc` `not_found_handling: single-page-application` serves `index.html` for unknown paths; `/api/*` runs the Worker first. Security headers (CSP) live in `public/_headers`, not the Worker.
- **Assessment** — AI readiness assessment demo; answers stay in the browser (`src/hooks/assessment-state.tsx`). Results page has a "Download as PDF" button (`window.print()` + print stylesheet in `globals.css`).
- **Blog (Writing)** — Markdown posts in `content/posts/*.md`, bundled into the Worker at build time via `scripts/build-posts.mjs`; fetched with TanStack Query (`src/lib/api/posts.ts`).
- **Contact form** — Builds a `mailto:` URL on submit and opens the visitor's email client. No backend, no captcha, no SMTP. Contact email is the `CONTACT_EMAIL` constant in `src/lib/mailto.ts`.

### Admin Portal Key Systems

- **Auth** — JWT-based session auth with bcryptjs password hashing. Middleware protects all routes except `/login`, `/signup`, and `/api/auth/*`. Tables: `admin_users`, `admin_sessions`. All major tables have `userId` foreign key. Default role is `admin` (member roles planned). Auth helpers in `lib/auth/` — `requireAuth()` for pages, `requireAuthApi()` for API routes.
- **Onboarding** — New users get a "Getting Started" workspace seeded on signup (`lib/onboarding/seed-default-workspace.ts`) with example sections for each template type. Guide page at `/guide` explains all features.
- **Workspaces** — Structured knowledge base with typed sections (prose, cards, table, checklist, kv-pairs). Version history per section. Tables prefixed `admin_*`. Pages live under `app/(authenticated)/` route group.
- **Inbox** — File upload drop zone → document processing pipeline (PDF/DOCX/CSV/MD parsing, chunking, embedding) → AI-powered workspace routing via BullMQ workers.
- **AI Editing** — Inline text selection → floating toolbar → AI rewrite → diff preview → accept/reject.
- **Gap Analysis** — Rule-based + AI checks for missing content, health badges, "Fix with AI".
- **RAG Search** — pgvector embeddings (1536d via OpenAI `text-embedding-3-small`), vector similarity search.
- **Chat** — Workspace-scoped floating panel, full section context fed to LLM.

### Infrastructure

- **Database**: PostgreSQL 15 with pgvector extension, Drizzle ORM. Used by admin-portal.
- **Queue**: BullMQ + Redis for document processing and workspace routing workers (admin-portal only).
- **AI**: Vercel AI SDK (`ai@^6`, 6.0.x installed) with configurable provider (Anthropic, OpenAI, Gemini or Ollama) for admin-portal. Mastra (`@mastra/core`) drives the research agents.
- **Storage**: Local filesystem (`./uploads/`) via `StorageProvider` abstraction (admin-portal only).
- **Cloudflare Workers**: Website deployed as a single Worker with the Static Assets binding. No backend services — contact uses `mailto:`, assessment results download as PDF via `window.print()`.
- **Docker**: Admin-portal uses `node:22-alpine` for both dev and prod (`Dockerfile` + `Dockerfile.dev`). Website uses `Dockerfile.dev` only — production is `wrangler deploy`, no container.

## Code Style & Conventions

- **Biome 2.4.4** for linting and formatting. Single quotes, semicolons, 2-space indent, 100-char line width, ES5 trailing commas.
- **Tailwind v4** — Uses CSS `@import "tailwindcss"` syntax. No plugin system. Apps include `@source` directive to scan `@repo/ui`. Dark theme with lime green accent.
- **Drizzle schema** uses `admin_` table prefix and camelCase column names in PostgreSQL (Drizzle maps JS prop names directly).
- **No pre-commit hooks** — there is no Husky or lint-staged setup. Run `pnpm lint` before committing.
- Dependency versions managed via pnpm catalog in `pnpm-workspace.yaml`.
