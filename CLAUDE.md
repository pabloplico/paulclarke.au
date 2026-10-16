# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Deployment Overview

- **`apps/website`** — Stateless Vite SPA + Hono Worker. No database. Deployed to **Cloudflare Workers** with the Static Assets binding. Domain: `paulclarke.au`.
- **`apps/admin-portal`** — Next.js + Postgres (or embedded PGlite), single-instance with in-process job queues. Deployed via Docker. Optional Playwright for URL scraping.

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

## Development

Everything runs on the host: Node 22 and pnpm (`corepack enable`). Docker is optional and only provides Postgres and Ollama for the admin portal's full stack. There is no app container. Run commands from the repo root unless noted.

A fresh clone needs one command after `pnpm install`: `pnpm dev` runs `website:dev` and `admin-portal:dev`, which is `dev:lite`.

**Network access.** The website's dev servers listen on all interfaces. The admin dev servers (`dev`, `dev:lite`, `dev:full`, `dev:demo`) listen on 127.0.0.1 only, unless `DEV_HOST` says otherwise. To open them from a phone or another computer, set `DEV_HOST=0.0.0.0` and list the device's IP in `ALLOWED_DEV_ORIGINS`, or Next.js blocks its dev assets. `DEV_HOST` comes from the shell only, never `.env.docker`. `ALLOWED_DEV_ORIGINS` reaches `dev:full` from `.env.docker`; `dev:lite` and `dev:demo` need it from the shell. For example: `DEV_HOST=0.0.0.0 ALLOWED_DEV_ORIGINS=192.168.0.20 pnpm dev`. Export both in your shell profile to make that the default.

### Website

```bash
cp apps/website/.dev.vars.example apps/website/.dev.vars   # only ENVIRONMENT=development
pnpm nx run website:dev    # generates the blog posts, then Vite (3004) + wrangler dev (3005)
```

Vite proxies `/api/*` to the Worker. The Worker only serves the blog API and has no secrets. `wrangler dev` runs `workerd`, which ships glibc-only binaries, so it doesn't work on musl (Alpine) hosts.

### Admin portal: daily work (`dev:lite`)

```bash
pnpm nx run admin-portal:dev:lite     # Next.js on 127.0.0.1:3001: PGlite + in-process jobs, sign-in off
                                      # (admin-portal:dev and root `pnpm dev` run this too)
OPENAI_API_KEY=… pnpm nx run admin-portal:dev:demo   # Next.js on 3003: demo mode as a visitor sees it
```

`dev:lite` (`apps/admin-portal/scripts/dev-lite.ts`) needs nothing else installed or running. It sets `DB_DRIVER=pglite` with the database in `apps/admin-portal/.pglite/data` (gitignored; delete the folder to start again), `UPLOADS_DIR=.pglite/uploads` and `AUTH_ENABLED=false`. On an empty database it creates `dev@localhost.test` with the Getting Started workspace. Variables already set win, so pass `OPENAI_API_KEY`, `AI_PROVIDER` and `AI_MODEL` for AI features; a mismatched AI config is a start-up warning in development, not an error.

`dev:demo` (`scripts/dev-demo.ts`) runs `DEMO_MODE=true` signed in as `DEV_ACCESS_IDENTITY` (default `visitor@example.com`) instead of through Cloudflare Access, on a fresh PGlite database in `.pglite/demo` every start, with OpenAI `gpt-4.1-nano`. The first request seeds that visitor. It needs `OPENAI_API_KEY` (demo mode checks the AI setup at start-up; AI features spend on it). It uses port 3003 and its own build folder (`NEXT_DIST_DIR=.next/demo`), so it can run beside `dev:lite` or `dev:full`, which use `.next/dev`.

**Single-instance by design.** Every dev server, and production, runs one Node process. Document processing, workspace routing and the research agents (`lib/agents/`) all run on the in-process job queue (`lib/queue/`), and rate limits are counted per process. Queued jobs are lost on restart; on boot, `lib/queue/recover.ts` re-queues unfinished documents and inbox items and fails interrupted agent runs. Research is off in demo mode. The agents have no cron schedules (a run starts only when a user triggers it) and no live log stream (the research toolbar polls the run log in the database). Cancelling a run marks it `cancelled`, and the worker stops the agent after the step in progress. On boot, `lib/queue/recover.ts` marks runs a restart cut off as `failed` ("interrupted by restart") rather than running them again. Redis, BullMQ, feeds, backups, cron schedules and the live log stream are at the `full-stack-v1` tag.

### Admin portal: full stack (`dev:full`)

The same app as `dev:lite`, on Postgres 15 + pgvector instead of PGlite, with sign-in on. Start the services-only compose stack (or use a native Postgres 15 with pgvector on the same port), then run the app on the host:

```bash
cp .env.docker.example .env.docker          # once; fill in section 1
cd apps/admin-portal
export COMPOSE_ENV_FILES=../../.env.docker  # once per shell: compose reads its ${VARS} from here
docker compose up -d                        # Postgres on 5432
docker compose --profile ai up -d           # also Ollama on 11434
docker compose down                         # stop (data stays in the volumes)

pnpm with-dev-env pnpm db:migrate           # first time, and after new migrations
pnpm nx run admin-portal:dev:full           # Next.js on 3001 against Postgres
```

`scripts/with-dev-env.ts` runs any command with `.env.docker` loaded and fills in `DATABASE_URL` for localhost (from `POSTGRES_*`), `OLLAMA_URL`, and `OPENAI_API_KEY` from `ADMIN_PORTAL_OPENAI_API_KEY`. Variables already set win, so native services on other hosts or ports work by setting `DATABASE_URL` in `.env.docker` or the shell. `dev:full` is `with-dev-env next dev --port 3001 --hostname ${DEV_HOST:-127.0.0.1}`. Use `with-dev-env` for anything that talks to the database or the AI provider (`db:*`, `ai:smoke`); admin E2E doesn't need it: its Playwright `webServer` runs `dev:lite`. `lint`, `check-types`, `test` and `build` never need it.

Host requirements for the full stack: `pnpm exec playwright install chromium` (or `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`) for URL scraping.

### Commands

```bash
# Lint — NX runs `biome check .` in every package, plus `lint:root` for root-level config files
pnpm lint
pnpm lint:fix

# Type checking — NX runs `tsc --noEmit` in admin-portal, website and @repo/ui
# (the website's check-types depends on prebuild:posts, which NX runs first;
# admin-portal's runs `next typegen` first, which writes the gitignored
# next-env.d.ts and the .next/types route types without a build)
pnpm check-types

pnpm test     # Vitest in admin-portal and website
pnpm build

# One target in one project, and NX inspection commands
pnpm exec nx run website:build
pnpm exec nx show project website       # targets, inputs, outputs
pnpm exec nx show projects --affected --base=main
pnpm exec nx run-many -t test --skip-nx-cache
pnpm exec nx reset                      # clear the cache

# One test file
pnpm --filter admin-portal exec vitest run lib/rag/chunker.test.ts

# E2E (website: Playwright + axe against wrangler dev, no services needed;
# admin-portal: no services either: its webServer runs dev:lite with sign-in on,
# a fresh .pglite/e2e database and AI calls sent to a stub OpenAI server, test/fake-openai)
pnpm --filter website test:e2e
pnpm --filter admin-portal test:e2e

# Database (from apps/admin-portal, against the full stack)
pnpm with-dev-env pnpm db:generate
pnpm with-dev-env pnpm db:migrate
pnpm with-dev-env pnpm db:studio
pnpm with-dev-env pnpm db:seed-admin    # the admin account (needs ADMIN_EMAIL)
# Build a fresh in-memory PGlite database from drizzle/ and smoke-test it (also
# fails if the schema has drifted from the latest migration). No services needed; CI runs this
pnpm db:check-fresh
```

**Migrations** start from one baseline (`drizzle/0000_baseline.sql`, generated from `lib/db/schema`), which replaced a history that couldn't build a fresh database. A new, empty database (a fresh `postgres_data` volume) only needs `db:migrate`. A database built before the baseline (with `drizzle-kit push` or the old migrations) needs the baseline recorded once, or `db:migrate` fails with "already exists". `db:mark-baseline` is non-destructive: it refuses unless every schema table and column exists, never drops anything, and with `--apply` only inserts one row into `drizzle.__drizzle_migrations` (from `apps/admin-portal`):

```bash
pnpm with-dev-env pnpm db:mark-baseline          # dry run
pnpm with-dev-env pnpm db:mark-baseline --apply  # record it
pnpm with-dev-env pnpm db:migrate                # then later migrations
```

### Environment variables

The website needs none. The admin portal's settings live in **`.env.docker`** (root of repo, gitignored; the name predates host development). Copy `.env.docker.example` to `.env.docker` to set up. Two things read it: Docker Compose, for the `${POSTGRES_PASSWORD}` that sets up the database container (export `COMPOSE_ENV_FILES=../../.env.docker` in `apps/admin-portal` first, or every `docker compose` command there fails with "required variable POSTGRES_PASSWORD is missing a value"), and `with-dev-env` / `dev:full` on the host. `dev:lite` and `dev:demo` don't read it: they take their settings from the shell. Do **not** create `.env` or `.env.local` files in app directories: Next.js would load them into every command, builds included.

Key vars (see `.env.docker.example` for full list):
- `DATABASE_URL` — Postgres connection string; `with-dev-env` builds it for localhost from the `POSTGRES_*` values
- `AI_PROVIDER` — `openai` (default), `anthropic` or `gemini`
- `AI_MODEL` — Model ID (default `gpt-4.1-mini`; the demo uses `gpt-4.1-nano`). Spend only counts towards the daily caps for models priced in `lib/ai/pricing.ts`
- `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` — API keys for chosen provider
- `AUTH_SECRET` — JWT signing secret for session auth (required for login/signup to work; if unset, middleware skips auth)
- `DB_DRIVER` — `postgres` (default, `DATABASE_URL`) or `pglite` (embedded Postgres in the Node process; in memory, or in `PGLITE_DATA_DIR`; `PGLITE_SNAPSHOT` seeds a new database from a `dumpDataDir()` tarball)
- `DEMO_MODE`, `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, `DEV_ACCESS_IDENTITY` — demo mode and Cloudflare Access (see Demo mode below)
- `AI_MAX_OUTPUT_TOKENS`, `AI_DAILY_BUDGET_USD`, `AI_USER_DAILY_BUDGET_USD`, `AI_USER_REQUESTS`, `AI_USER_WINDOW_MINUTES` — AI cost controls (see `.env.docker.example`)

### Services

| Service | App | Runs on | Port |
|---------|-----|---------|------|
| Website (dev, Vite SPA) | website | host | 3004 |
| Website (dev, wrangler Worker) | website | host | 3005 |
| Admin Portal (`dev`/`dev:lite` or `dev:full`) | admin-portal | host (127.0.0.1 unless `DEV_HOST`) | 3001 |
| Admin Portal (demo mode, `dev:demo`) | admin-portal | host (127.0.0.1 unless `DEV_HOST`) | 3003 |
| PostgreSQL 15 (pgvector) | admin-portal | `admin-portal-dev-postgres` | 5432 |
| Ollama (optional, `--profile ai`) | admin-portal | `admin-portal-dev-ollama` | 11434 |

DB user: `business_portal` (admin-portal). Password set via `POSTGRES_PASSWORD` in `.env.docker`.

## Architecture

**Monorepo** with pnpm workspaces + NX (23.3.0, pinned exactly).

### NX

- **No NX plugins.** Every target is the package's own `package.json` script. `nx.json` holds the task graph: `namedInputs` (`default`, `production` = default minus tests/specs/e2e/test configs, `sharedGlobals` = Node version, `biome`) and `targetDefaults` with explicit `inputs`, `outputs` and `dependsOn`. A new tool config that affects a task's result must be added to its inputs there.
- **Root scripts** (`pnpm lint`, `check-types`, `test`, `build`, `test:e2e`, `dev`) call `nx run-many -t …`. The root `package.json` is itself a project (`paulclarke.au`) that only exposes `lint:root` (`nx.includedScripts`), so root scripts can't recurse.
- **Website posts:** `prebuild:posts` is its own cached target (output `server/posts.generated.ts`); the website's `build` and `check-types` depend on it via `targetDefaults` entries filtered to `website`. The `website` scripts `build`/`check-types` no longer run it themselves, so build through NX (`nx run website:build`), as `deploy` and the Playwright `webServer` do. `dev` still runs it inline.
- **Cache:** local only. `neverConnectToCloud: true` and `analytics: false` in `nx.json`; CI sets `NX_NO_CLOUD=true`. NX 23 keeps the cache in `~/.nx/<repo-id>/cache`, shared by every checkout and worktree of the repo; `nx reset` clears it. Script targets hash all external dependencies, so any lockfile change invalidates every task.
- **CI:** pull requests run `nx affected` (base from `nrwl/nx-set-shas`); pushes to `main` run `nx run-many`, then deploy the website if it changed (see Production Builds). Admin E2E is its own job; the website deploy doesn't wait for it. Runners are pinned to `ubuntu-24.04`.
- **GitHub settings for `main`** (the "Protect main" ruleset): changes land only through a PR, merged by squash (the only merge method allowed), with zero approvals needed. Two checks are required: "Lint, type-check, test and build" and "Admin DB (fresh PGlite from migrations)". The E2E jobs (admin and website) run on every PR but **don't block the merge, by decision**: don't make them required checks again. Auto-merge is on, and head branches are deleted on merge.

### Apps

| App | Framework | Production | Dev | Role |
|-----|-----------|-----------|-----|------|
| `apps/website` | Vite SPA + Hono Worker | Cloudflare Workers (paulclarke.au) | Host (Vite 3004, wrangler 3005) | Developer portfolio: projects, assessment demo, writing |
| `apps/admin-portal` | Next.js 16 | Docker | Host (port 3001); Postgres optionally in Docker | Internal: workspace knowledge management, document processing, inbox routing, gap analysis |

### Packages

- **`@repo/ui`** — Shared React components (Button, Card, Badge, Input, etc.). Uses direct path exports: `import { Button } from '@repo/ui/button'` (no barrel file).
- **`@repo/tailwind-theme`** — CSS-only Tailwind v4 theme (`@repo/tailwind-theme/theme.css`): the `@theme` tokens, base body styles, the `:focus-visible` ring and the reduced-motion rule. Apps `@import` it right after `tailwindcss` and keep their own `@source` lines and app-specific CSS (the website's print stylesheet stays in `globals.css`). An app restyles itself by redefining tokens in a later `@theme` block.
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

- **Auth** — JWT-based session auth with bcryptjs password hashing. Middleware protects all routes except `/login`, `/signup`, and `/api/auth/*`. Tables: `admin_users`, `admin_sessions`. All major tables have `userId` foreign key. New accounts are `member`s; the only admin comes from `pnpm db:seed-admin` (needs `ADMIN_EMAIL`; no default password). Global settings need an admin. Auth helpers in `lib/auth/` — `requireAuth()` for pages, `requireAuthApi()` for API routes.
- **Demo mode** — `DEMO_MODE=true`, read at request time. `lib/demo.ts` lists every page and API route as `core` or a switched-off feature (a test fails if a route is missing), and the middleware returns 404 for switched-off ones and 403 for settings changes. The only way in is Cloudflare Access: the middleware verifies the `Cf-Access-Jwt-Assertion` JWT (`lib/auth/access.ts`; never the plain email header) and each verified email gets a `member` user. `DEV_ACCESS_IDENTITY` stands in for Access locally and is refused in production. Start-up checks (`lib/startup-checks.ts`) stop the process on bad config.
- **AI cost controls** — every model goes through `lib/ai/guard.ts` (via `getModel`/`getEmbeddingModel`): `maxOutputTokens` cap, daily spend caps in total and per user (priced from `lib/ai/pricing.ts`), and in demo mode no unattributed calls. Every API route that starts AI work calls `requireAiAllowance(user)` (per-user rate limit + budget); `lib/ai/allowance-coverage.test.ts` enforces it from the import graph. Tests fake models by mocking `@/lib/ai/providers`, so the guard still runs.
- **Demo seed** — each Access visitor is seeded on first sign-in, in the same transaction as their user row (`findOrCreateAccessUser` → `lib/demo-seed/seed.ts`): Getting Started plus a fictional Cairns bakery (Harbourside Bakery) with workspaces and version history, clients, jobs, todos, a processed and routed inbox document and saved gap reports. Hand-written content is in `lib/demo-seed/content.ts`; the AI-made parts are in `generated.json`, built once by `pnpm demo:build-seed` (paid: it runs the real pipeline with `OPENAI_API_KEY`; re-run it after changing the content and commit the result). Sample files for visitors to upload are in `public/demo/`. A visitor can have 20 documents of their own on top of the seeded one (`lib/document-processing/demo-upload-limit.ts`, counted from the database).
- **Onboarding** — New users get a "Getting Started" workspace seeded on signup (`lib/onboarding/seed-default-workspace.ts`) with example sections for each template type. Guide page at `/guide` explains all features.
- **Workspaces** — Structured knowledge base with typed sections (prose, cards, table, checklist, kv-pairs). Version history per section. Tables prefixed `admin_*`. Pages live under `app/(authenticated)/` route group.
- **Inbox** — File upload drop zone → document processing pipeline (PDF/DOCX/CSV/MD parsing, chunking, embedding) → AI-powered workspace routing, on the in-process job queue.
- **AI Editing** — Inline text selection → floating toolbar → AI rewrite → diff preview → accept/reject.
- **Gap Analysis** — Rule-based + AI checks for missing content, health badges, "Fix with AI".
- **RAG Search** — pgvector embeddings (1536d via OpenAI `text-embedding-3-small`), vector similarity search.
- **Chat** — Workspace-scoped floating panel, full section context fed to LLM.

### Infrastructure

- **Database**: PostgreSQL 15 with pgvector extension, Drizzle ORM. Used by admin-portal. `DB_DRIVER=pglite` swaps in PGlite (Postgres compiled to WASM, with pgvector) for the single-instance demo; `lib/db/index.ts` is the one place the client is created, lazily, so `next build` never connects.
- **Queue**: in-process. Document processing, workspace routing and the three research-agent queues (`lib/agents/queue/`) use the `JobQueue` interface (`lib/queue/`), whose one implementation is `InProcessQueue`; the interface stays as the test seam (`lib/queue/contract.test.ts`). Rate limits are in memory too (`lib/rate-limit/`). The app is single-instance by design: queued jobs are lost on restart, and boot recovery (`lib/queue/recover.ts`) re-queues documents and inbox items and fails interrupted agent runs. Redis, BullMQ, feeds, backups, agent cron schedules and the live run-log stream were removed (the full version is at the `full-stack-v1` tag); the feed tables (`admin_feeds`, `admin_feed_items`) and the `'feed'` document source stay for existing databases.
- **AI**: Vercel AI SDK (`ai@^6`, 6.0.x installed) with configurable provider (Anthropic, OpenAI, Gemini or Ollama) for admin-portal. The research agents (`lib/agents/`) run on the AI SDK's own tool loop (`ToolLoopAgent`, tools built with `defineTool`, which validates input); Mastra was replaced in 2026-10. The folder is still `lib/agents/mastra/`, because a protected test imports from it.
- **Storage**: Local filesystem (`./uploads/`) via `StorageProvider` abstraction (admin-portal only).
- **Cloudflare Workers**: Website deployed as a single Worker with the Static Assets binding. No backend services — contact uses `mailto:`, assessment results download as PDF via `window.print()`.
- **Docker**: Admin-portal production image only (`Dockerfile`, `node:22-alpine`). In development, `apps/admin-portal/docker-compose.yml` is a services-only stack (Postgres, optional Ollama); the apps run on the host. The website has no container: production is `wrangler deploy`.

## Code Style & Conventions

- **Biome 2.4.4** for linting and formatting. Single quotes, semicolons, 2-space indent, 100-char line width, ES5 trailing commas.
- **Tailwind v4** — Uses CSS `@import "tailwindcss"` syntax. No plugin system. Apps include `@source` directive to scan `@repo/ui`. Shared tokens come from `@repo/tailwind-theme`. Dark theme with lime green accent.
- **Drizzle schema** uses `admin_` table prefix and camelCase column names in PostgreSQL (Drizzle maps JS prop names directly).
- **No pre-commit hooks** — there is no Husky or lint-staged setup. Run `pnpm lint` before committing.
- Dependency versions managed via pnpm catalog in `pnpm-workspace.yaml`.

## Tests

Tests are the spec. Changing one changes what the code is promised to do, so test edits get reviewed on their own.

- **A failing test is a question, not an obstacle.** Before touching it, decide whether the code or the test is wrong. If the code is wrong, fix the code. If the test is out of date because behaviour changed on purpose, update it and say so in your summary.
- **Never weaken a test to get it passing.** Don't delete or loosen assertions, change expected values or snapshots to match new output, widen matchers (`toBeTruthy()`, `expect.anything()`, `toBeDefined()` in place of a real value), add `.skip`/`.only`/`.todo`, wrap assertions in `try`/`catch` or `if`, or mock away the code under test. If a test can't pass without one of these, stop and report it.
- **Every test change goes in the summary and the PR body:** each test added, changed or deleted, with one line on why. "Updated test to match" is not a reason; name the behaviour that changed.
- **Add tests only for behaviour the change introduces or fixes.** Extend the existing test file for that module rather than starting a new one. Test through the public interface, not private helpers or call counts. Don't add tests that only check a mock returns what it was told to.
- **Skips need a reason.** Biome's `noSkippedTests` and `noFocusedTests` are errors in test files. A skip that is genuinely conditional (a Playwright project, a missing service) gets a `biome-ignore` comment saying why. A test must fail, not skip, when the feature it tests is broken. The admin E2E specs have no skips: AI calls go to a stub OpenAI server (`test/fake-openai/server.ts`; see TESTING.md), and a request it doesn't recognise fails the run.
- **`pnpm test:diff [base] [head]`** (defaults: `origin/main`, `HEAD`) prints test files added, changed and deleted, assertion lines removed and added, and new skips. CI writes it to the PR's job summary and warns on each file that loses assertions. Run it before opening a PR and read the test diff first.

## Change tiers

Scale the process to the risk. Decide the tier before starting, and say which in the first line of the PR.

**Full gate.** Dependency upgrades; anything touching a protected test (test guide §3, `docs/audit/test-guide.md`), sign-in or middleware, the AI spend guard or pricing, the job queue, upload validation, or the Dockerfile. Follow "Rules for every agent" and "The gate" in `docs/audit/dependency-updates.md`. Open a draft PR and wait for Paul to merge.

**E2E, either tier:** don't run the E2E suites locally. CI's admin and website E2E jobs are the check, on every PR. Run one locally only to debug a CI failure, once, with `--workers=2`. Skip the Docker build unless the Dockerfile itself changes.

**Fast path.** Everything else: UI, copy, aria-labels, docs, test tidy-ups, small bug fixes. Branch from main, make the change, run `pnpm lint`, `pnpm check-types` and the affected Vitest once. Push, open a PR with `gh pr create --fill`, then `gh pr merge --squash --auto`, and move on. CI runs E2E; if it goes red, fix forward. Batch small related changes into one PR. Don't wait for Paul.

When unsure, ask in one line, then default to the fast path.
