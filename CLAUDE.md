# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Deployment Overview

- **`apps/website`** — Stateless Vite SPA + Hono Worker. No database. Deployed to **Cloudflare Workers** with the Static Assets binding. Domain: `paulclarke.au`.
- **`apps/admin-portal`** — Next.js + postgres + redis. Deployed via Docker. Optional Playwright for URL scraping.

## Production Builds

### Website (Cloudflare Workers)

The website is a single Worker that serves the Vite SPA via the Static Assets binding and exposes a tiny blog API (`/api/posts`).

**CI deploys it.** The `deploy-website` job in `.github/workflows/ci.yml` runs on pushes to `main` after every other job passes, and only when `nx show projects --affected` (from the previous `main` commit) includes `website`. Running the CI workflow by hand on `main` (Actions → CI → Run workflow) always deploys. The job uses the `production` GitHub environment, which holds the `CLOUDFLARE_API_TOKEN` (Workers edit permission, this account only) and `CLOUDFLARE_ACCOUNT_ID` secrets. Don't also connect the repo to Workers Builds in the Cloudflare dashboard, or every merge deploys twice.

To deploy by hand, from `apps/website/` (use `pnpm run`: plain `pnpm deploy` is pnpm's own command and fails):

```bash
cd apps/website
pnpm run deploy            # nx run website:build (posts + vite build), then wrangler deploy
pnpm run deploy:dry-run    # build + bundle without uploading
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

Each app has its own `docker-compose.yml` and `Dockerfile.dev` in its app directory. The admin-portal dev image uses `node:22-alpine` (matching prod); the website's uses `node:22-slim` (see below). Run commands from the app directory.

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

### Without Docker

Both apps run on the host with nothing else installed or running:

```bash
pnpm nx run website:dev               # generates the blog posts, then Vite (3004) + wrangler dev (3005)
pnpm nx run admin-portal:dev:lite     # Next.js on 3001: PGlite + in-process jobs, sign-in off
OPENAI_API_KEY=… pnpm nx run admin-portal:dev:demo   # Next.js on 3003: demo mode as a visitor sees it
```

`dev:lite` (`apps/admin-portal/scripts/dev-lite.ts`) sets `DB_DRIVER=pglite` with the database in `apps/admin-portal/.pglite/data` (gitignored; delete the folder to start again), `QUEUE_DRIVER=memory`, `UPLOADS_DIR=.pglite/uploads` and `AUTH_ENABLED=false`. On an empty database it creates `dev@localhost.test` with the Getting Started workspace. Variables already set win, so pass `OPENAI_API_KEY`, `AI_PROVIDER` and `AI_MODEL` for AI features; a mismatched AI config is a start-up warning in development, not an error.

`dev:demo` (`scripts/dev-demo.ts`) runs `DEMO_MODE=true` signed in as `DEV_ACCESS_IDENTITY` (default `visitor@example.com`) instead of through Cloudflare Access, on a fresh PGlite database in `.pglite/demo` every start, with OpenAI `gpt-4.1-nano`. The first request seeds that visitor. It needs `OPENAI_API_KEY` (demo mode checks the AI setup at start-up; AI features spend on it). It uses port 3003 and its own build folder (`NEXT_DIST_DIR=.next/demo`), so it runs beside the Docker dev server, which locks `.next/dev`.

### Admin Portal Dev

```bash
cd apps/admin-portal
export COMPOSE_ENV_FILES=../../.env.docker  # once per shell: compose reads its ${VARS} from here
docker compose up -d                      # Start (port 3001 + postgres + redis)
docker compose --profile ai up -d         # Include Ollama
docker compose logs -f app                # View logs
docker compose down                       # Stop
docker compose exec app <command>         # Run commands
```

### Running commands inside the container

All build, test, lint, and database commands must run inside the `app` container. The image is Alpine, so there's no `bash`; for commands in `apps/admin-portal`, set the working directory with `-w /app/apps/admin-portal` (or use `sh -c`):

```bash
docker compose exec app <command>
```

Examples (from `apps/admin-portal/`):

```bash
# Build
docker compose exec app pnpm build

# Lint — NX runs `biome check .` in every package, plus `lint:root`
# for root-level config files (the container's working dir is the root)
docker compose exec app pnpm lint
docker compose exec app pnpm lint:fix    # biome check --write --unsafe .

# Type checking — NX runs `tsc --noEmit` in admin-portal, website and @repo/ui
# (the website's check-types depends on prebuild:posts, which NX runs first;
# admin-portal's runs `next typegen` first, which writes the gitignored
# next-env.d.ts and the .next/types route types without a build)
docker compose exec app pnpm check-types

# One target in one project, and NX inspection commands
docker compose exec app pnpm exec nx run website:build
docker compose exec app pnpm exec nx show project website       # targets, inputs, outputs
docker compose exec app pnpm exec nx show projects --affected --base=main
docker compose exec app pnpm exec nx run-many -t test --skip-nx-cache
docker compose exec app pnpm exec nx reset                      # clear the cache

# Unit tests (Vitest in admin-portal and website)
docker compose exec app pnpm test
docker compose exec -w /app/apps/admin-portal app npx vitest run lib/rag/chunker.test.ts

# E2E tests (website: Playwright + axe against wrangler dev, no services needed;
# admin-portal needs postgres + redis)
docker compose exec app pnpm --filter website test:e2e
docker compose exec app pnpm test:e2e

# Database (from admin-portal dir inside container)
docker compose exec -w /app/apps/admin-portal app pnpm db:generate
docker compose exec -w /app/apps/admin-portal app pnpm db:migrate
docker compose exec -w /app/apps/admin-portal app pnpm db:studio
# Build a fresh in-memory PGlite database from drizzle/ and smoke-test it (also
# fails if the schema has drifted from the latest migration). CI runs this
docker compose exec -w /app/apps/admin-portal app pnpm db:check-fresh
```

**Migrations** start from one baseline (`drizzle/0000_baseline.sql`, generated from `lib/db/schema`), which replaced a history that couldn't build a fresh database. A new, empty database (a fresh `postgres_data` volume) only needs `db:migrate`. A database built before the baseline (with `drizzle-kit push` or the old migrations) needs the baseline recorded once, or `db:migrate` fails with "already exists". `db:mark-baseline` is non-destructive: it refuses unless every schema table and column exists, never drops anything, and with `--apply` only inserts one row into `drizzle.__drizzle_migrations`:

```bash
docker compose exec -w /app/apps/admin-portal app pnpm db:mark-baseline          # dry run
docker compose exec -w /app/apps/admin-portal app pnpm db:mark-baseline --apply  # record it
docker compose exec -w /app/apps/admin-portal app pnpm db:migrate                # then later migrations
```

### After adding dependencies

If you add deps on the host (`pnpm add ...`), you must rebuild or install inside the container:

```bash
docker compose exec app pnpm install
```

### Environment variables

All env vars live in **`.env.docker`** (root of repo). Copy `.env.docker.example` to `.env.docker` to set up. Do **not** create `.env.local` files in app directories — the Docker container loads `.env.docker` via `env_file` in docker-compose. `env_file` only reaches the container, though: Compose fills the `${POSTGRES_PASSWORD}` and `${REDIS_PASSWORD}` in `apps/admin-portal/docker-compose.yml` from the shell or a `.env` file, not from `env_file`. Run `export COMPOSE_ENV_FILES=../../.env.docker` in `apps/admin-portal` first (or pass `--env-file ../../.env.docker`). Don't add an `apps/admin-portal/.env`: Next.js would load it on the host too. Without it every `docker compose` command there, `exec` included, fails with "required variable POSTGRES_PASSWORD is missing a value".

Key vars (see `.env.docker.example` for full list):
- `DATABASE_URL` — Set in docker-compose `environment` (points to `postgres` service hostname)
- `REDIS_URL` — Redis connection string (points to `redis` service hostname)
- `AI_PROVIDER` — `anthropic`, `openai`, or `gemini`
- `AI_MODEL` — Model ID (e.g. `claude-sonnet-4-6`, `gpt-4o`, `gpt-5.2`)
- `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` — API keys for chosen provider
- `AUTH_SECRET` — JWT signing secret for session auth (required for login/signup to work; if unset, middleware skips auth)
- `DB_DRIVER` — `postgres` (default, `DATABASE_URL`) or `pglite` (embedded Postgres in the Node process; in memory, or in `PGLITE_DATA_DIR`; `PGLITE_SNAPSHOT` seeds a new database from a `dumpDataDir()` tarball)
- `QUEUE_DRIVER` — `bullmq` (default, `REDIS_URL`) or `memory` (in-process queues; nothing connects to Redis, and the Redis-only workers for feeds, backups and research agents don't start)
- `RATE_LIMIT_DRIVER` — `memory` (default, per process) or `redis` (shared; needs `QUEUE_DRIVER=bullmq`)
- `DEMO_MODE`, `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, `DEV_ACCESS_IDENTITY` — demo mode and Cloudflare Access (see Demo mode below)
- `AI_MAX_OUTPUT_TOKENS`, `AI_DAILY_BUDGET_USD`, `AI_USER_DAILY_BUDGET_USD`, `AI_USER_REQUESTS`, `AI_USER_WINDOW_MINUTES` — AI cost controls (see `.env.docker.example`)

### Services

| Service | App | Container | Port |
|---------|-----|-----------|------|
| Website (dev, Vite SPA) | website | `website-dev` | 3004 |
| Website (dev, wrangler Worker) | website | `website-dev` | 3005 |
| Admin Portal (dev) | admin-portal | `admin-portal-dev-node` | 3001 |
| Admin Portal (demo mode, `dev:demo`) | admin-portal | host | 3003 |
| PostgreSQL 15 (pgvector) | admin-portal | `admin-portal-dev-postgres` | 5432 |
| Redis 7 | admin-portal | `admin-portal-dev-redis` | 6379 |
| Ollama (optional, `--profile ai`) | admin-portal | `admin-portal-dev-ollama` | 11434 |

DB user: `business_portal` (admin-portal). Password set via `POSTGRES_PASSWORD` in `.env.docker`.

## Architecture

**Monorepo** with pnpm workspaces + NX (23.3.0, pinned exactly).

### NX

- **No NX plugins.** Every target is the package's own `package.json` script. `nx.json` holds the task graph: `namedInputs` (`default`, `production` = default minus tests/specs/e2e/test configs, `sharedGlobals` = Node version, `biome`) and `targetDefaults` with explicit `inputs`, `outputs` and `dependsOn`. A new tool config that affects a task's result must be added to its inputs there.
- **Root scripts** (`pnpm lint`, `check-types`, `test`, `build`, `test:e2e`, `dev`) call `nx run-many -t …`. The root `package.json` is itself a project (`paulclarke.au`) that only exposes `lint:root` (`nx.includedScripts`), so root scripts can't recurse.
- **Website posts:** `prebuild:posts` is its own cached target (output `server/posts.generated.ts`); the website's `build` and `check-types` depend on it via `targetDefaults` entries filtered to `website`. The `website` scripts `build`/`check-types` no longer run it themselves, so build through NX (`nx run website:build`), as `deploy` and the Playwright `webServer` do. `dev` still runs it inline.
- **Cache:** local only. `neverConnectToCloud: true` and `analytics: false` in `nx.json`; CI sets `NX_NO_CLOUD=true`. NX 23 keeps the cache in `~/.nx/<repo-id>/cache`, shared by every checkout and worktree of the repo; `nx reset` clears it. Script targets hash all external dependencies, so any lockfile change invalidates every task.
- **CI:** pull requests run `nx affected` (base from `nrwl/nx-set-shas`); pushes to `main` run `nx run-many`, then deploy the website if it changed (see Production Builds). Runners are pinned to `ubuntu-24.04`.

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

- **Auth** — JWT-based session auth with bcryptjs password hashing. Middleware protects all routes except `/login`, `/signup`, and `/api/auth/*`. Tables: `admin_users`, `admin_sessions`. All major tables have `userId` foreign key. New accounts are `member`s; the only admin comes from `pnpm db:seed-admin` (needs `ADMIN_EMAIL`; no default password). Global settings and backups need an admin. Auth helpers in `lib/auth/` — `requireAuth()` for pages, `requireAuthApi()` for API routes.
- **Demo mode** — `DEMO_MODE=true`, read at request time. `lib/demo.ts` lists every page and API route as `core` or a switched-off feature (a test fails if a route is missing), and the middleware returns 404 for switched-off ones and 403 for settings changes. The only way in is Cloudflare Access: the middleware verifies the `Cf-Access-Jwt-Assertion` JWT (`lib/auth/access.ts`; never the plain email header) and each verified email gets a `member` user. `DEV_ACCESS_IDENTITY` stands in for Access locally and is refused in production. Start-up checks (`lib/startup-checks.ts`) stop the process on bad config.
- **AI cost controls** — every model goes through `lib/ai/guard.ts` (via `getModel`/`getEmbeddingModel`): `maxOutputTokens` cap, daily spend caps in total and per user (priced from `lib/ai/pricing.ts`), and in demo mode no unattributed calls. Every API route that starts AI work calls `requireAiAllowance(user)` (per-user rate limit + budget); `lib/ai/allowance-coverage.test.ts` enforces it from the import graph. Tests fake models by mocking `@/lib/ai/providers`, so the guard still runs.
- **Demo seed** — each Access visitor is seeded on first sign-in, in the same transaction as their user row (`findOrCreateAccessUser` → `lib/demo-seed/seed.ts`): Getting Started plus a fictional Cairns bakery (Harbourside Bakery) with workspaces and version history, clients, jobs, todos, a processed and routed inbox document and saved gap reports. Hand-written content is in `lib/demo-seed/content.ts`; the AI-made parts are in `generated.json`, built once by `pnpm demo:build-seed` (paid: it runs the real pipeline with `OPENAI_API_KEY`; re-run it after changing the content and commit the result). Sample files for visitors to upload are in `public/demo/`. A visitor can have 20 documents of their own on top of the seeded one (`lib/document-processing/demo-upload-limit.ts`, counted from the database).
- **Onboarding** — New users get a "Getting Started" workspace seeded on signup (`lib/onboarding/seed-default-workspace.ts`) with example sections for each template type. Guide page at `/guide` explains all features.
- **Workspaces** — Structured knowledge base with typed sections (prose, cards, table, checklist, kv-pairs). Version history per section. Tables prefixed `admin_*`. Pages live under `app/(authenticated)/` route group.
- **Inbox** — File upload drop zone → document processing pipeline (PDF/DOCX/CSV/MD parsing, chunking, embedding) → AI-powered workspace routing via BullMQ workers.
- **AI Editing** — Inline text selection → floating toolbar → AI rewrite → diff preview → accept/reject.
- **Gap Analysis** — Rule-based + AI checks for missing content, health badges, "Fix with AI".
- **RAG Search** — pgvector embeddings (1536d via OpenAI `text-embedding-3-small`), vector similarity search.
- **Chat** — Workspace-scoped floating panel, full section context fed to LLM.

### Infrastructure

- **Database**: PostgreSQL 15 with pgvector extension, Drizzle ORM. Used by admin-portal. `DB_DRIVER=pglite` swaps in PGlite (Postgres compiled to WASM, with pgvector) for the single-instance demo; `lib/db/index.ts` is the one place the client is created, lazily, so `next build` never connects.
- **Queue**: BullMQ + Redis for the admin-portal workers. Document processing and workspace routing sit behind the `JobQueue` interface (`lib/queue/`), with an in-process implementation for `QUEUE_DRIVER=memory`; feeds, backups and the research agents stay on BullMQ (repeatable jobs, pub/sub). `lib/redis.ts` is the only place that opens Redis connections, on first use, and it throws when Redis is off.
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
