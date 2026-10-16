# Status

**Last checked at #45** (`main` at `54bb336`, 2026-10-16), against GitHub, the repo and the local machine.

One snapshot of where things stand, not a log: git history and the PRs hold the history. If this file and another doc disagree, this one wins; CLAUDE.md wins over both on how the repo works.

**Other files here:**

- `dependency-updates.md`: the upgrade plan, steps and gate.
- `test-guide.md`: the test standard; its §3 is the protected-test list CLAUDE.md "Change tiers" points to.
- `test-prune-backlog.md`: the full-gate test prune still to do.
- `TEST_AUDIT.md`: the classification the prune works from; goes in the prune PR.
- `test-audit-report.md`: the audit against the test guide (snapshot at `425d3f4`); its §8 "After upgrades" table is still open.
- `IMPORT_PLAN.md`: jobquest J0–J9.
- `SPIKE_PGLITE.md`: measurements and conditions for hosting the admin demo; delete once hosting is decided.
- `INTERVIEW_NOTES.md`: finished phases, condensed (up to #17).
- `role-fit.local.md`: local only, gitignored.

## Where work happens

Only in `~/Projects/paulclarke.au` → `github.com/pabloplico/paulclarke.au` (public). `~/Projects/business-portal` (private) is a frozen archive; its hashes exist only there (squashed into the public repo's first commit `79caa3a`). Each change is a PR from `main`, on the tier in CLAUDE.md "Change tiers".

**`main` is protected:** ruleset "Protect main" (id 25048249, no bypass actors). PRs only, squash merge only, 0 approvals, auto-merge on, head branches deleted on merge. Two required checks: `Lint, type-check, test and build` and `Admin DB (fresh PGlite from migrations)`. Website E2E and admin E2E run on every PR but don't block the merge, by decision. `Deploy website` never runs on PRs. CI has no path filters on purpose, so required checks always report.

## In flight

- **Dependency updates** (`dependency-updates.md`): steps 0–3 and the admin E2E prerequisite are done (#34, #35, #36, #41, #45). `pnpm audit --prod` after #45: 1 critical, 19 high, 48 moderate, 6 low (was 4/55/66/10). Next: 3a (Playwright 1.64), then 4 (drizzle 0.45) and 5 (Mastra 1.78), which should land before admin hosting.
- **Test prune** (`test-prune-backlog.md`): a full-gate PR, redone from `main`, with PGlite replacements for the isolation and `inbox/[id]/approve` route tests alongside. Not started.
- **jobquest J1** (`IMPORT_PLAN.md`): next after J0 (#14). Not started.

## Recently merged (for context)

- #18 test guardrails (Biome `noSkippedTests`/`noFocusedTests`, `pnpm test:diff`, CLAUDE.md "Tests").
- #19, #20 version restore scoped to its section; cross-user isolation and session tests, which found and fixed the contacts write and same-second session tokens.
- #22 unit tests pass in any order (shuffled CI run); #33 `enterAiUser` can't leak on first use.
- #23 default to a priced OpenAI model.
- #24–#28 feeds and backups removed, research agents on the `JobQueue` seam, PGlite in UTC, Redis and BullMQ removed (full version at the `full-stack-v1` tag).
- #29, #30 Mastra tool tests; limits on what agent tools reach with model-chosen inputs.
- #34, #37, #40 admin E2E without bare skips or fixed waits, on `dev:lite`, in CI, with a stub OpenAI server.
- #38 chat resume race; #39 accessible names for icon-only controls.
- #31, #32, #35, #36, #41, #45 dependency steps (Vite 8, react-markdown 10, hono, Next 16.4, unused deps, in-range batch).
- #42–#44 docs: change tiers, `docs/` tracked, shorter README with `docs/decisions.md`.

## Decisions (from Paul)

- The website is a developer portfolio only. The consulting business is closed.
- Two demo apps: admin-portal and jobquest (pet-local dropped 2026-10-15: too tied to Next.js, Vercel and Supabase). Both end up in this monorepo, each on its own subdomain of paulclarke.au, gated with Cloudflare Access (one-time email PIN; allow lists of emails or company domains). The portfolio stays public.
- Demos are fully functional: real AI with per-user rate limits, a daily spend cap and a provider hard limit. The admin demo stays multi-user (#20).
- **jobquest:** front end rebuilt in Vue 3, server on a Vite + Hono + D1 Worker. Details and A5 decisions in `IMPORT_PLAN.md`.
- **admin-portal demo:** PGlite + in-process queues, one instance, 2 GiB, snapshot baked into the image. Redis and BullMQ are gone (#28). Host still open (below).
- Vue 3 comes through the jobquest rebuild; the Vue assessment port is deferred.
- Portfolio on Cloudflare Workers, deployed by CI. Don't also enable Workers Builds in the dashboard.
- CRM features (communications, email templates, outreach, ABN/Places lookups) stay through the redesign.
- PDF support stays (pdf-parse 2 is dependency step 8, after real-fixture tests).
- M1 (credential revocation) is optional.

## Open: admin-portal demo hosting (Paul undecided)

Cloud Run stands until Paul decides. Conditions and measurements for any host are in `SPIKE_PGLITE.md`.

- **Cloud Run (current plan).** `--max-instances=1`, instance-based billing (processing runs after the response), 2 GiB, boot from the snapshot, scheduled trigger for resets. Access needs a **proxied** Cloudflare record in front of Cloud Run (the apex is DNS-only today); domain mapping vs a rewrite to `run.app` is undecided. `--no-default-url` is defence in depth and may conflict with a `run.app` rewrite. Demo key as `OPENAI_API_KEY` from Secret Manager.
- **Cloudflare Containers.** Same Docker image, started by a small Worker; one provider, no Access-in-front-of-Cloud-Run problem. Needs Workers Paid (US$5/month); basic 1 GiB is too small, standard-1 (4 GiB) ≈ US$26/month extra if never asleep; custom instance types may allow 2 GiB. Next step if pursued: a spike measuring memory, cold start and Access sign-in.
- **Self-host** behind a Cloudflare Tunnel, for an always-warm demo. Concerns: down when the machine sleeps or the connection drops; a public AI-calling app on a home network (mitigate: Access, non-root container, no host mounts); ISP terms.

**Part 4b to-do whichever host:** dependency steps 3a–5, container image with the snapshot baked in, deploy job, reset trigger, Access app and subdomain. The provider's hard limit is the real spend cap (in-app counters reset on restart).

## Production

- Website on Workers since 2026-10-14 (`paulclarke.au` and `www.paulclarke.au`, both serve the site; CSP from `public/_headers`).
- **Delete the old Cloud Run service** from about 2026-10-21 (a week of stable DNS).

## Paul's to-dos

- **Copy to approve:** meta description; card summaries and the "This site" card + stack tags (`projects.ts`); 404 texts; assessment live-region text "Readiness score 38 out of 100: Developing." (#13).
- Set the OpenAI demo project's hard limit (unverified whether done).
- Local clean-up: the old `admin-portal-dev_node_modules`, `admin-portal-dev_pnpm_store` and (since #28) `admin-portal-dev_redis_data` volumes, an orphan anonymous volume, old images, and the unused `.pnpm-store/` in the repo root.
- jobquest J3 (when it comes): create the D1 database, the Access app and the custom domain.

## Backlog

Done items are gone; see `INTERVIEW_NOTES.md` and the PRs for what was done.

| Item | State |
|---|---|
| S1 portfolio gaps | `CV_URL = null` (`HeroSection.tsx`); 2 `href: null` links and 3 `image: null` in `projects.ts` |
| S5 Biome a11y | website on; admin off |
| S9 showcase polish | loading, empty and error states on inbox upload → routing and section AI editing; a 60-second GIF for the README |
| C2 i18n | not started: typed string catalogue + locale-aware formatting |
| C3 Storybook/Ladle for `@repo/ui` | not started |
| C4 Lighthouse CI | code split done; no Lighthouse CI |
| C5 admin responsive pass | not started |
| C6 `middleware.ts` → `proxy.ts` | not started |
| M1 revoke old creds | optional: `.env.docker` still holds CLOUDFLARE_*_TUNNEL_TOKEN, SMTP_PASS, TURNSTILE_SECRET_KEY, NEXTAUTH_SECRET, SORTA_GEMINI_API_KEY, jobquest keys (never in the public repo) |

**Test gaps** (numbered as in the test audit, `TEST_AUDIT.md` §3 before it was trimmed; 1–3 and 7 are done):

- **4. AI spend cap at the exact boundary.** `>=` → `>` in `lib/ai/guard.ts`'s two cap checks isn't caught: each test overshoots the cap. Test: cap equal to the first call's priced cost, second call refused.
- **5. Document deletion.** Deleting a document should remove its chunks and stored file (the isolation test covers other users' access, not the clean-up). Test on PGlite with a temp `UPLOADS_DIR`. `documents/batch` and `documents/export` have no tests.
- **6. Real PDF and DOCX parsing.** Both parser tests mock the library. Committed fixtures parsed for real; needed before dependency step 8.
- **8. Cookie-auth middleware and headers, by behaviour.** Untested: production without `AUTH_SECRET` returns 500, a page request without a session redirects to `/login`, a tampered cookie is refused (only `security.test.ts`'s source greps cover these). Admin headers: call `nextConfig.headers()`. Website: nothing checks the CSP in `public/_headers` or watches for `securitypolicyviolation`.
- **9. Workspace delete cascade.** Delete a workspace, then count sections, versions, dependencies and gap reports.
- **Isolation, ids in the body.** Extend `test/isolation.integration.test.ts` to routes that take ids in the body (workspace merge/split/organise, gap analysis, export, search, chat, `kb-chunks`, section dependencies). Before the admin deploy.
- **Admin E2E DELETE set.** 8 specs classified DELETE in `TEST_AUDIT.md` are still there (backups went in #25). Not part of the unit-test prune.
- **After upgrades:** the table in `test-audit-report.md` §8 (PGlite route tests, shared fixtures, Vitest projects, catalog the test deps, title clean-up, fake timers, component tests). Admin E2E in CI is done (#37, #40).

**Bugs found, not fixed:**

- **Scraper source dedupe ignores the workspace.** `lib/agents/mastra/tools/scraper.ts` checks `adminResearchSources.url` across every workspace and user before saving a scraped page as a source, though its comment says "for this workspace". Fix: add `workspaceId` (and `userId`) to the lookup. (Found in #29.)
- **A repeated finding keeps its first run.** `save-finding` (`lib/agents/mastra/tools/db-writer.ts`) upserts on `(workspaceId, contentHash)` and only updates `confidenceScore` and `foundAt`, so a later run's `findingsCount` (counted by `agentRunId`) leaves out findings it re-found. Decide whether it should count them, then update `agentRunId` or count differently. (Found in #29.)
- **Same-day posts have no stable order (website).** `getAllPosts` in `apps/website/server/index.ts` sorts with `a.date > b.date ? -1 : 1`, which never returns 0. Fix: return 0 for equal dates, break ties on the slug, add a same-day case to `server/index.test.ts`. (Found in review of #32.)
- **The admin standalone output traces the whole project** (`app/`, `components/`, `e2e/`, `test/`, `scripts/`, about 150 MB) because of dynamic filesystem access in `lib/storage/index.ts` (`uploadsDir()`). Fix: `/*turbopackIgnore: true*/` on those calls, or a statically scoped path, then compare image size. Side effect: after a local `pnpm build`, `pnpm test` also runs the copies in `.next/standalone`; add `.next/**` to the admin Vitest `exclude` in the same fix. (Found in #36.)

**Follow-ups:**

- Security: `validateUrl` follows redirects and misses ranges; the PDF parser bundles a 2017 pdf.js (CVE-2024-4367; dependency step 8); DOCX unzip has no size limit. For the demo: PDF and DOCX uploads off, sample docs in Markdown.
- Admin demo (from 4a): chat panel refusal toast; Postgres seeding race untested; the PGlite seed transaction blocks other queries (measure in 4b); the checklist parser turns a suggestion's heading and paragraph lines into checklist items.
- Config: `BUSINESS_PORTAL_URL` (`app/api/content-audit/route.ts`) defaults to `:3000`, which matches no dev port; "business-portal" is still in a comment and an error message there, and a comment in `lib/db/schema/base.ts`; CLAUDE.md isn't Prettier-clean.
- Docs: `test-guide.md` still describes Redis and BullMQ (§2 driver-integration and admin E2E rows, §4 row 7, §7 feeds and research journeys, T-MOCK-2, §9); update it for #28 and #37.
- NX: drop `^lint` from the lint target's `dependsOn`; consider `actions/cache` for the NX cache.
- Before any snapshot or new public repo: `git ls-files -ci --exclude-standard` must print nothing.

## Placeholders

- Possible second Vue app: AutoProspector, analysis after jobquest J9.
