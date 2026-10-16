# Decisions

Design decisions in this repo, with the alternative considered and the trade-off. Setup details are in [CLAUDE.md](../CLAUDE.md).

## Cloudflare Workers for the website

Context: the website is a static SPA with a read-only blog API. Running it as a container (on Cloud Run) meant paying for and managing a server that does very little.

Choice: one Cloudflare Worker serves the assets through the Static Assets binding and runs the blog API. There is no container image or region to manage, and it costs nothing at this traffic.

Trade-off: local development needs `workerd`, which ships glibc-only binaries, so `wrangler dev` doesn't run on Alpine (musl) hosts. Page navigations are served as static assets without running the Worker, so security headers live in `apps/website/public/_headers` rather than in Worker code.

## `mailto:` instead of a form backend

Context: the contact form gets little traffic. A hosted email API with a CAPTCHA would need secrets, a paid plan at volume and spam handling.

Choice: the form builds a pre-filled `mailto:` link and opens the visitor's mail client. There is no backend, no secret and no endpoint for bots to post to, and the visitor keeps a copy in their sent mail.

Trade-off: it relies on the visitor having a mail client, so the confirmation screen also shows the address to copy. The assessment's "Download as PDF" follows the same approach: it uses the browser's print dialog and a print stylesheet instead of a PDF service.

## NX rather than Turborepo, with no plugins

Context: Turborepo gives cached, dependency-aware tasks. NX gives the same, plus a project graph, `nx affected` (so CI checks only what a change can break) and `nx graph`.

Choice: NX runs the tasks. Each target is the package's own `package.json` script, with no NX plugins, so every target is a plain script you can read. `nx.json` declares each target's `inputs`, `outputs` and `dependsOn`. A `production` input excludes tests and specs, so editing a test doesn't invalidate a build. The cache is local only: Nx Cloud is turned off and CI uses no remote cache. Pull requests run `nx affected` against their merge base with `main`; pushes to `main` run every task, then deploy the website if it was affected.

Trade-off: plugins (`@nx/vite`, `@nx/next`, `@nx/playwright`) would infer targets from tool configs, but they replace the package scripts and bring their own dependencies. Without them, cache inputs and outputs are written by hand, so a new tool's config file has to be added to `nx.json`.

## Admin portal demo mode

Context: the admin portal is meant to run as a public demo with real AI calls, without demo passwords, unbounded spend or external services. Demo mode is built and tested in the code, but the demo isn't deployed yet, so Access sign-in isn't live either: there is no deploy job or hosting set up, and the host is still being decided.

Choice: `DEMO_MODE=true` switches the app into demo mode at request time, so one image serves both modes.

- Sign-in is through Cloudflare Access only. The middleware verifies the signed `Cf-Access-Jwt-Assertion` token on every request, never the plain email header, and gives each verified email its own member account.
- Each visitor gets their own seeded copy of a fictional bakery's workspaces, with a document already processed and routed and saved gap reports. The AI-generated parts were produced once by the real pipeline and stored in `apps/admin-portal/lib/demo-seed/generated.json`, so seeding makes no AI calls.
- Every model call goes through one guard (`apps/admin-portal/lib/ai/guard.ts`) with an output-token cap and daily spend caps, in total and per user. Every API route that starts AI work also applies a per-user rate limit, and a test checks that from the import graph.
- `apps/admin-portal/lib/demo.ts` lists every page and API route as core or as a feature demo mode switches off, such as settings, research agents and password accounts. A test fails if a route is missing from the list.
- Uploads are limited to small Markdown, text and CSV files, because the PDF and DOCX parsers have known security issues.
- The database runs inside the Node process (`DB_DRIVER=pglite`), and the job queues always do, so the demo is one container on one instance. Postgres remains the default, behind the same interface.

Trade-off: the in-app spend counters are kept in memory and reset on restart, so the AI provider's hard spend limit is the final backstop. One instance means queued jobs are lost on restart; on boot the app re-queues unfinished documents and inbox items.

## Allow-list `COPY` in the Dockerfile

Context: `.dockerignore` patterns match from the repo root, so a `COPY . .` sent nested `node_modules`, `.next`, `uploads`, local database dumps and a service-account key into the build context. The context was over 720 MB, and the build failed reading a root-owned folder.

Choice: the Dockerfile copies only the root manifests, `packages/` and `apps/admin-portal/`, and `.dockerignore` uses `**/` patterns.

Trade-off: a new top-level file the build needs has to be added to the Dockerfile by name. In return the context is about 6 MB, and a new secret file is left out by default.

## The full-stack version

The admin portal runs as a single process with in-process queues and no Redis. A version with more infrastructure is kept at the git tag [`full-stack-v1`](https://github.com/pabloplico/paulclarke.au/tree/full-stack-v1). It has Redis and BullMQ job queues, RSS and news feeds ingested on a schedule, scheduled `pg_dump` backups with a page to manage them, the research agents on cron schedules, and a live research run log streamed over Redis pub/sub.
