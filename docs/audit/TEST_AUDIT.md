# Test suite pruning audit (2026-10-16)

Read-only audit. No source or test file was changed. Mutation checks ran in a throwaway worktree that has been removed; the main checkout is clean. Branch `chore/test-audit` (from `main` at `5367ffd`, Vitest 5.0.5).

**Planned changes this audit assumes (from Paul):** website UI redesign; admin-portal UI redesign; admin data model and API changes; shared packages changing, a new Vue app (jobquest) added, and packages updated to latest. So almost nothing is "stable". A test is only KEEP if it checks pure logic, or security or money behaviour at a boundary that survives a redesign.

---

## 1. Baseline

| Suite | Files | Tests | Pass | Fail | Skipped | Wall time | Flaky (2 runs) |
|---|---|---|---|---|---|---|---|
| Admin unit (Vitest) | 107 | 1,094 | 1,078 | 0 | 16 | 20.3 s / 20.3 s | none |
| Website unit (Vitest) | 4 | 53 | 53 | 0 | 0 | 2.8 s / 2.8 s | none |
| Website E2E (Playwright, desktop + mobile, against `wrangler dev`) | 4 | 66 | 64 | 0 | 2 | 28.8 s / 27.5 s | none |
| Admin E2E (Playwright) | 19 + setup | 124 | not run | | | | |
| **Total** | **135** | **1,337** | | | | | |

- **Flakes:** none. Per-test results were identical across both runs of each suite. The only difference in the website E2E logs was a `workerd` broken-pipe line at server shutdown, which isn't a test result.
- **The 16 admin skips** are the Redis halves of `lib/queue/contract.test.ts` and `lib/rate-limit/contract.test.ts`, gated on `TEST_REDIS_URL`. CI provides Redis, so they aren't permanently skipped. I ran them once against a throwaway `redis:7-alpine` on 127.0.0.1:56379: 32/32 passed.
- **The 2 website E2E skips** are `test.skip(!isMobile)` on two mobile-menu tests in the desktop project. They're skipped on purpose.
- **Admin E2E was not run.** Its `webServer` is `dev:full`, which reads `.env.docker` and the dev Postgres/Redis volumes, and those are off limits for audits. It isn't in CI either. I reviewed it by reading.
- **Coverage:** no coverage run. `@vitest/coverage-v8` isn't installed and I didn't add it. Gaps in §3 come from reading the code and mapping routes to tests.
- **Where the time goes:** a few files set the wall time, not the test count. Run alone: `access-user` 8.1 s, `seed-admin` 6.1 s (bcrypt cost 12), `document-flow.integration` 5.1 s, `redis-free` 5.0 s, `auth/index` 4.9 s (bcrypt), `demo-seed/seed` 4.1 s, `db/pglite` 4.0 s. Each PGlite file applies the migrations in its own process.

## 2. Classification

### Totals

| | Files | Tests | Share |
|---|---|---|---|
| **KEEP** | 65 unit + 3 website E2E (+1 test of the 4th) | 723 unit + 52 E2E = **775** | 58% |
| **REWRITE LATER** | 22 unit + 10 admin E2E (+ parts of 2 website E2E) | 246 unit + 87 E2E = **333** | 25% |
| **DELETE** | 24 unit + 9 admin E2E | 178 unit + 51 E2E = **229** | 17% |

Within KEEP files, 18 individual tests should go (listed after the table). The counts above don't subtract them.

### How I judged

- **KEEP:** the code under test runs for real. The only fakes are at the edge (network `fetch`, the AI provider via `test/fake-ai.ts`, or the clock), and the behaviour survives a redesign.
- **DELETE:** mostly one pattern. 23 of the 31 route test files replace `drizzle-orm` operators and `@/lib/db` with hand-built fakes (`eq: (col, val) => ({ col, val })`). The other 8 (find-source, inbox, the 4 lookups, settings, ai-edit) mock the libraries they compose. Their checks then hold whatever the fake returns, or the shape of the `where` argument. A wrong query still passes. A switch to the relational query API, or a `drizzle-orm` upgrade that changes call chains, fails them with nothing broken.
- **REWRITE LATER:** the behaviour matters, but the test is one of those mock-wired files and sits on code being redesigned. Each one names what to rebuild, against PGlite plus the fake AI, as `document-flow.integration` already does.

### Unit and integration tests (Vitest)

`a/` = `apps/admin-portal/`, `w/` = `apps/website/`.

| File | Tests | Category | Reason |
|---|---|---|---|
| a/app/api/auth/login/route.test.ts | 11 | KEEP | 400/401/429 and the session cookie are real route logic; the DB fake is shallow. Drop "updates lastLoginAt" (mock call) |
| a/app/api/auth/signup/route.test.ts | 18 | KEEP | Password rules, "member, never admin", rate limit: security. Drop "calls seedDefaultWorkspace" (mock call) |
| a/app/api/chat/route.test.ts | 15 | REWRITE LATER | 10 modules mocked; asserts prompt strings. Rebuild: 404 for another user's conversation, 400s |
| a/app/api/clients/route.test.ts | 15 | REWRITE LATER | TC-011 tests check the `where` shape from fake operators. They are the only check that lists are scoped to the user (mutation confirmed), so rebuild as a PGlite isolation test (§3 gap 2). Keep the 400/trim/default behaviours |
| a/app/api/clients/[id]/route.test.ts | 7 | REWRITE LATER | Same pattern; rebuild 404-for-other-user and metadata merge on PGlite |
| a/app/api/communications/route.test.ts | 15 | DELETE | Fake `where` shapes plus "filters by X" against a fake that returns everything; feature is off in the demo |
| a/app/api/communications/[id]/route.test.ts | 6 | DELETE | Mock-only CRUD |
| a/app/api/email-templates/route.test.ts | 10 | DELETE | Mock-only CRUD; feature off in demo |
| a/app/api/email-templates/[id]/route.test.ts | 4 | DELETE | Mock-only CRUD |
| a/app/api/find-source/route.test.ts | 8 | REWRITE LATER | Grouping/sorting logic is real but the API is being redesigned |
| a/app/api/inbox/[id]/approve/route.test.ts | 28 | REWRITE LATER | High value: per-template merge regressions from 4a. Mocked DB; rebuild on PGlite (one case per template plus status transitions) |
| a/app/api/inbox/[id]/skip/route.test.ts | 7 | REWRITE LATER | Status transitions matter; mocked DB |
| a/app/api/inbox/route.test.ts | 5 | KEEP | Demo upload restrictions (no URL fetch, no PDF, oversized body refused): money and security |
| a/app/api/jobs/route.test.ts | 13 | REWRITE LATER | Same as clients (jobs are `core` in the demo and seeded) |
| a/app/api/jobs/[id]/route.test.ts | 9 | REWRITE LATER | `completedAt` on stage change is real logic; mocked DB |
| a/app/api/lookup/abn/route.test.ts | 6 | DELETE | Composes mocked libs; lib tests cover the parsing; demo-off paid feature |
| a/app/api/lookup/address/route.test.ts | 3 | DELETE | Same |
| a/app/api/lookup/company/route.test.ts | 7 | DELETE | Same |
| a/app/api/lookup/place-details/route.test.ts | 3 | DELETE | Same |
| a/app/api/outreach/personalise/route.test.ts | 8 | DELETE | Asserts prompt text with a mocked model; demo-off feature |
| a/app/api/settings/route.test.ts | 3 | KEEP | Members can't change global settings: security |
| a/app/api/workspaces/route.test.ts | 11 | REWRITE LATER | Mocked CRUD; slug normalising and template seeding are worth rebuilding |
| a/app/api/workspaces/[id]/route.test.ts | 10 | REWRITE LATER | Mocked CRUD; archive/delete behaviour worth rebuilding on PGlite |
| a/app/api/workspaces/categories/route.test.ts | 3 | DELETE | Mock returns the answer |
| a/app/api/workspaces/[id]/sections/route.test.ts | 5 | REWRITE LATER | Slug suffixing is real logic; mocked DB |
| a/app/api/workspaces/[id]/sections/[sectionId]/route.test.ts | 8 | REWRITE LATER | Slug suffix, reparent; mocked DB |
| a/app/api/workspaces/[id]/sections/[sectionId]/content/route.test.ts | 5 | REWRITE LATER | Version numbering; mocked DB |
| a/app/api/workspaces/[id]/sections/[sectionId]/split/route.test.ts | 5 | REWRITE LATER | Split point logic is real; mocked transaction |
| a/app/api/workspaces/[id]/sections/merge/route.test.ts | 7 | REWRITE LATER | Cross-workspace/parent validation is security-adjacent; mocked DB |
| a/app/api/workspaces/[id]/sections/[sectionId]/ai-edit/route.test.ts | 15 | REWRITE LATER | Fidelity 422 and truncation matter; 10 modules mocked |
| a/app/api/workspaces/[id]/sections/[sectionId]/suggest-rules/route.test.ts | 7 | DELETE | Mock wiring; "loads config via loadConfig" is an implementation detail |
| a/lib/ai/allowance-coverage.test.ts | 2 | KEEP | Every AI route calls `requireAiAllowance` (caught mutation 13) |
| a/lib/ai/allowance.test.ts | 2 | KEEP | Budget refusal becomes a 429 |
| a/lib/ai/config-check.test.ts | 5 | KEEP | Demo refuses mismatched provider, model or key |
| a/lib/ai/guard.test.ts | 14 | KEEP | Spend caps, demo attribution. Strengthen: exact-cap boundary (mutations 1 and 2 not caught) |
| a/lib/ai/pricing.test.ts | 3 | KEEP | Money |
| a/lib/ai/providers.test.ts | 11 | KEEP | Provider selection and fallback. Drop "logs model selection on first call only" |
| a/lib/ai/semantic-fidelity.test.ts | 27 | KEEP | Pure thresholds; the 17 TC-016 boundary cases could fold into one `it.each` |
| a/lib/ai/style-coverage.test.ts | 20 | KEEP | Australian English instruction on every AI call site (policy) |
| a/lib/ai/tokens.test.ts | 22 | KEEP | Budget truncation is pure logic |
| a/lib/ai/usage-logger.test.ts | 18 | DELETE | Pins log JSON fields and prefixes; the guard does the real accounting |
| a/lib/api/resolve-params.test.ts | 11 | REWRITE LATER | Ownership resolution is security, but mocked (`passes Number(sectionId) to the eq call`). Rebuild in the PGlite isolation test |
| a/lib/api/safe-json.test.ts | 7 | KEEP | Pure |
| a/lib/auth/access.test.ts | 14 | KEEP | Access JWT verification: real keys, real `jose` |
| a/lib/auth/access-user.test.ts | 3 | KEEP | PGlite: one member per visitor, seed rollback. Fixtures change with the schema |
| a/lib/auth/index.test.ts | 26 | KEEP | bcrypt and JWT are real. The DB-session half is mocked (mutations 10 and 11 not caught): see §3 gap 3. Drop "calls bcrypt.compare with (plain, hash) argument order" |
| a/lib/auth/rate-limiter.test.ts | 3 | KEEP | Client IP extraction |
| a/lib/auth/seed-admin.test.ts | 5 | KEEP | No default admin password |
| a/lib/auth/server.test.ts | 14 | KEEP | Role gates (401/403, redirect) run for real |
| a/lib/auth/validation.test.ts | 17 | KEEP | Pure password rules |
| a/lib/config.server.test.ts | 14 | KEEP | Settings overlay with type checks; only the settings read is faked |
| a/lib/db/backup.test.ts | 13 | KEEP | Keep 09–13 (path traversal, retention); drop 01–08 (pg_dump args and listing via mocked fs) |
| a/lib/db/backup-worker.test.ts | 4 | DELETE | bullmq mocked; asserts call order |
| a/lib/db/pglite.test.ts | 3 | KEEP | The demo's database driver |
| a/lib/demo-seed/seed.test.ts | 6 | KEEP | PGlite: per-visitor seed. Fixtures change with the schema |
| a/lib/demo.test.ts | 8 | KEEP | Every route classified; fails closed |
| a/lib/document-processing/chunk-analysis.test.ts | 5 | DELETE | Batch vs parallel call counts on a mocked model; the integration test covers the pipeline |
| a/lib/document-processing/citations.test.ts | 14 | KEEP | Pure |
| a/lib/document-processing/cleaner.test.ts | 6 | KEEP | Pure |
| a/lib/document-processing/demo-upload-limit.test.ts | 2 | KEEP | 20-upload cap (caught the off-by-one) |
| a/lib/document-processing/errors.test.ts | 18 | DELETE | Constructor and field checks on two error classes; the worker tests already rely on `permanent` |
| a/lib/document-processing/metadata.test.ts | 3 | DELETE | Mocked model; asserts prompt contents; 1.8 s |
| a/lib/document-processing/parsers/csv.test.ts | 4 | KEEP | Pure |
| a/lib/document-processing/parsers/docx.test.ts | 11 | DELETE | `mammoth` mocked: 11 tests of pass-through. Replace with a real fixture (§3 gap 6) |
| a/lib/document-processing/parsers/index.test.ts | 4 | KEEP | MIME routing |
| a/lib/document-processing/parsers/markdown.test.ts | 3 | KEEP | Pure |
| a/lib/document-processing/parsers/pdf.test.ts | 3 | DELETE | `pdf-parse` mocked. Replace with a real fixture |
| a/lib/document-processing/parsers/text.test.ts | 2 | KEEP | Pure |
| a/lib/document-processing/quality-gates.test.ts | 17 | KEEP | Pure |
| a/lib/document-processing/queue.test.ts | 2 | DELETE | Asserts a mocked queue's job ID; the queue contract covers dedupe |
| a/lib/document-processing/upload-validation.test.ts | 22 | KEEP | Size and type limits, demo limits |
| a/lib/document-processing/url-fetcher.test.ts | 30 | KEEP | SSRF guard |
| a/lib/document-processing/worker.test.ts | 19 | REWRITE LATER | 16 modules mocked. Behaviour worth keeping: permanent error discards, transient retries, page limit, quality flags. Rebuild on the integration harness |
| a/lib/drivers.test.ts | 4 | KEEP | Driver config fails on unknown values |
| a/lib/external-apis/abn-lookup.test.ts | 13 | KEEP | Response parsing with `fetch` stubbed at the edge. Delete with the feature if the CRM lookups go |
| a/lib/external-apis/abn-validation.test.ts | 6 | KEEP | Pure checksum |
| a/lib/external-apis/brave-search.test.ts | 8 | KEEP | Same as abn-lookup |
| a/lib/external-apis/google-places.test.ts | 16 | KEEP | Same as abn-lookup |
| a/lib/feeds/fetcher.test.ts | 6 | KEEP | Change detection; drop TC-06 (pins a 30000 ms timeout value) |
| a/lib/feeds/ingest.test.ts | 9 | REWRITE LATER | Dedupe and gap matching matter; mocked DB |
| a/lib/feeds/rss-parser.test.ts | 10 | KEEP | Pure |
| a/lib/feeds/worker.test.ts | 4 | DELETE | bullmq mocked; aggregation is trivial |
| a/lib/gap-analysis/check-rules.test.ts | 37 | KEEP | Pure |
| a/lib/gap-analysis/content-hash.test.ts | 21 | KEEP | Pure; drop TC-014-A5 (pins that key order changes the hash, a quirk) |
| a/lib/instrumentation-node.test.ts | 2 | KEEP | Demo starts no backup, feed or agent workers |
| a/lib/onboarding/seed-default-workspace.test.ts | 13 | DELETE | "calls db.insert exactly 5 times"; `demo-seed/seed` covers Getting Started on PGlite |
| a/lib/queue/contract.test.ts | 20 | KEEP | Same contract for both queue drivers |
| a/lib/queue/recover.test.ts | 1 | KEEP | Restart recovery for in-process queues |
| a/lib/rag/chunker.test.ts | 31 | KEEP | Pure |
| a/lib/rag/embeddings.test.ts | 11 | KEEP | Keep batching (TC-105–111); drop TC-101–104 (pass-through of a mocked `embed`) |
| a/lib/rag/search.test.ts | 9 | DELETE | Mocked DB, "builds vector literal"; the integration test's "finds the right passage by meaning" runs real pgvector on PGlite |
| a/lib/rate-limit/contract.test.ts | 12 | KEEP | Same contract for both drivers |
| a/lib/rate-limit/memory.test.ts | 1 | KEEP | Pruning |
| a/lib/redis-free.test.ts | 4 | KEEP | Demo opens no Redis connection |
| a/lib/security.test.ts | 14 | REWRITE LATER | Greps source text instead of running code. `next.config.ts` half (7): rewrite to call the exported `headers()` and check the values; nothing else checks headers. Middleware half (7): rewrite as behaviour cases in `middleware.test.ts`, which doesn't cover the cookie-auth path's fail-closed cases (§3 gap 8). Delete each grep only once its behaviour test exists |
| a/lib/settings.test.ts | 13 | DELETE | Mocked DB CRUD ("calls db.select().from(adminSettings)") |
| a/lib/startup-checks.test.ts | 7 | KEEP | Bad demo config stops the process |
| a/lib/storage/index.test.ts | 11 | KEEP | Path traversal |
| a/lib/workspace-routing/queue.test.ts | 3 | DELETE | Mocked queue job IDs and retry config |
| a/lib/workspace-routing/router.test.ts | 13 | REWRITE LATER | TC-010 (drops suggestions for sections outside the map) is security-adjacent; rebuild with fake AI on PGlite |
| a/lib/workspace-routing/worker.test.ts | 12 | REWRITE LATER | Keep the "spent AI budget is discarded, not retried" behaviour; the rest is mock wiring |
| a/lib/workspaces/completeness.test.ts | 25 | KEEP | Pure (will change if section types change) |
| a/lib/workspaces/parse-structured.test.ts | 7 | KEEP | Pure; approve-merge regressions |
| a/lib/workspaces/section-tree.test.ts | 13 | KEEP | Depth and cycle rules |
| a/lib/workspaces/staleness.test.ts | 8 | KEEP | Pure |
| a/middleware.test.ts | 11 | KEEP | Access, demo 404s, CSRF via `Sec-Fetch-Site`, fail-closed. Path changes if `middleware.ts` becomes `proxy.ts` (C6) |
| a/test/document-flow.integration.test.ts | 5 | KEEP | The one real upload → process → route → search flow, plus spend attribution |
| w/src/hooks/useAssessment.test.tsx | 9 | KEEP | Assessment state; answers survive unmount |
| w/src/lib/assessment-content.test.ts | 25 | KEEP | Scoring and level ranges |
| w/src/lib/legacy-hash.test.ts | 15 | KEEP | Old hash URLs still redirect |
| w/src/lib/mailto.test.ts | 4 | KEEP | Contact form output |

**Tests to drop inside KEEP files (18):** login "updates lastLoginAt"; signup "calls seedDefaultWorkspace after user creation"; providers "logs model selection on first call only"; auth/index "calls bcrypt.compare with (plain, hash) argument order"; backup TC-01–08; content-hash TC-014-A5; embeddings TC-101–104; fetcher TC-06.

### End-to-end tests

| File | Tests | Category | Reason |
|---|---|---|---|
| w/e2e/accessibility.spec.ts | 20 | KEEP | axe on every page; mostly selector-free, so it survives a redesign |
| w/e2e/navigation.spec.ts | 26 | KEEP | Deep links, 404s, old hash redirects, Back/Forward: the Worker/SPA contract. Exception: "project cards are labelled articles…" (2) is REWRITE LATER |
| w/e2e/contact.spec.ts | 6 | KEEP | mailto journey |
| w/e2e/assessment.spec.ts | 14 | REWRITE LATER | Plan cards, star widgets and keyboard details are the UI being redesigned. Exception: "completing the quick assessment produces a score and a 90-day plan" (2) is KEEP, the critical journey |
| a/e2e/auth.setup.ts | 1 | REWRITE LATER | Needed by whatever replaces the suite |
| a/e2e/auth.spec.ts | 11 | REWRITE LATER | Sign up, log in, log out, redirect when signed out: critical journey. Rebuild on `dev:lite` |
| a/e2e/inbox-workflow.spec.ts | 2 | REWRITE LATER | Note → routing → approve → workspace updated: the showcase flow |
| a/e2e/document-upload.spec.ts | 5 | REWRITE LATER | Showcase flow; 3 silent skips |
| a/e2e/search.spec.ts | 7 | REWRITE LATER | Showcase flow; 5 fixed sleeps |
| a/e2e/workspace-chat.spec.ts | 6 | REWRITE LATER | Showcase flow; 1 silent skip |
| a/e2e/ai-inline-editing.spec.ts | 5 | REWRITE LATER | Showcase flow; 6 silent skips (every test can skip) |
| a/e2e/gap-analysis.spec.ts | 8 | REWRITE LATER | Showcase flow; 6 silent skips, 4 sleeps |
| a/e2e/workspace-crud.spec.ts | 11 | REWRITE LATER | Create from template is core; 4 silent skips |
| a/e2e/section-management.spec.ts | 10 | REWRITE LATER | Editing a section is the app's core action; 4 silent skips |
| a/e2e/version-history.spec.ts | 7 | REWRITE LATER | Restore is core (and has the bug in §3); 9 silent skips: every test can skip |
| a/e2e/backups.spec.ts | 5 | DELETE | Admin-only, demo-off; 2 silent skips |
| a/e2e/document-actions.spec.ts | 12 | DELETE | UI-coupled; replace deletion with the unit-level gap 5 |
| a/e2e/error-states.spec.ts | 11 | DELETE | Mostly API checks that belong in route tests; the "no JS errors" checks fold into the rebuilt smoke |
| a/e2e/guide.spec.ts | 4 | DELETE | Static page |
| a/e2e/inbox.spec.ts | 3 | DELETE | Duplicates inbox-workflow; 2 silent skips |
| a/e2e/knowledge-base.spec.ts | 4 | DELETE | 6 silent skips; low value |
| a/e2e/settings.spec.ts | 5 | DELETE | Admin-only, demo-off |
| a/e2e/workspace-export.spec.ts | 3 | DELETE | 5 silent skips across 3 tests |
| a/e2e/workspaces.spec.ts | 4 | DELETE | Duplicates workspace-crud and search |

**Admin E2E red flags (Confirmed by grep):**
- 53 `test.skip()` calls behind `if (!(await el.isVisible().catch(() => false)))`, so a missing button shows as "skipped", not "failed".
- 25 `waitForTimeout` sleeps.
- `retries: 0` with no CI run, so nothing has checked whether it passes.
- Treat its 124 tests as giving no protection today.

## 3. Gaps: critical behaviour with no test

Ranked by risk. The refactor is most likely to break 2, 3 and 5.

1. **Version restore crosses users. Bug, Confirmed from the code.**
   - Where: `app/api/workspaces/[id]/sections/[sectionId]/versions/[versionId]/restore/route.ts:15-18`.
   - What it does: checks that the caller owns the workspace and section in the URL, then loads the version by `versionId` alone. It inserts the restored version into `sourceVersion.sectionId` and returns it with a 201.
   - The effect: a user who passes another user's version ID writes a new version into that user's section and gets its content back. Version IDs are sequential integers. The sibling `versions/[versionId]` GET scopes correctly (`and(id, sectionId, workspaceId)`).
   - Exposure: the admin demo isn't hosted yet (Part 4 not started), so nothing is exposed today. In the demo every visitor is a `member` on one shared instance, so fix it before Part 4.
   - Scan: a grep of all `app/api/**/route.ts` for ID-only lookups found 17. I read each one: the other 16 run a `userId`-scoped select (or a workspace-ownership check) earlier in the same handler. Confirmed.
   - Minimum test: two users on PGlite. User B posts a restore with A's `versionId` under B's own workspace and section. Expect 404, and no new version on A's section.
2. **Per-user data isolation against a real database.**
   - Today the only checks are the mocked TC-011 `where` shapes (clients, jobs, communications) and the mocked `resolve-params`. Mutation 12 showed TC-011 does catch a dropped `userId` condition, but only for the exact query shape.
   - Minimum test: one PGlite test with two seeded users that calls GET/PATCH/DELETE by ID as the other user, parametrised over workspaces, sections, versions, documents, inbox items, clients, jobs, todos, conversations and knowledge bases. Expect 404 for each.
   - This one test replaces most of the REWRITE LATER route files' security value and survives the API redesign if it calls route handlers by path.
3. **Server-side session checks.**
   - `verifySession`'s DB filters (session row exists, belongs to the user, not expired) can be removed without a failure: mutations 10 and 11.
   - So logout revoking a still-valid JWT is untested.
   - Minimum test (PGlite): create a session, destroy it, and expect `verifySession(token)` to be null. Then expire the row and expect null again.
4. **AI spend cap at the exact boundary.** `>=` → `>` in `guard.ts:138` and `:143` isn't caught: each test overshoots the cap. Minimum test: set the cap equal to the first call's priced cost and expect the second call refused.
5. **Document deletion and file download.**
   - `documents/[id]` DELETE, `documents/[id]/file`, `documents/batch`, `documents/export` and `retry` have no tests.
   - Deletion should remove chunks and the stored file; download is an ownership check on a file read.
   - Minimum test (PGlite + temp `UPLOADS_DIR`): upload, delete, then expect no chunks, no file on disk, and a 404 for the other user's download.
6. **Real PDF and DOCX parsing with packages updated to latest.** Both parsers are only tested with the library mocked, so an upgrade that breaks parsing passes. Minimum test: tiny committed fixtures (one-page PDF, short DOCX) parsed for real and checked for a known sentence. (The bundled 2017 pdf.js and CVE-2024-4367 are noted in STATUS.)
7. **Admin end to end: none in practice.** The E2E suite isn't in CI, needs the full stack, and skips silently. Minimum: one Playwright smoke against `dev:lite`, with the fake AI if possible:
   - load workspaces
   - create from a template
   - edit a prose section
   - restore an older version
   - add an inbox note and approve its routing (if AI can be faked through the server)

   Rebuild this after the admin UI redesign, not before.
8. **Cookie-auth middleware and security headers, by behaviour.**
   - Outside demo mode, `middleware.test.ts` only checks that `/login` passes and `/api/inbox` returns 401. Untested by behaviour: production with no `AUTH_SECRET` returns 500 (`middleware.ts:43-47`), a page request without a session redirects to `/login`, and a tampered cookie JWT is refused. Today only `security.test.ts`'s source greps guard these. Minimum: three cases in `middleware.test.ts`.
   - Admin: only source greps (`security.test.ts`). Minimum: call `nextConfig.headers()` and check the values.
   - Website: the CSP in `public/_headers` isn't checked. A redesign that adds fonts, scripts or inline styles can break it silently. Minimum: one website E2E assertion that the page response carries the CSP and that no `securitypolicyviolation` events fire on the home page and the assessment.
9. **Workspace delete cascade.** Deleting a workspace should remove sections, versions, dependencies and gap reports. Fold into gap 2's fixture: delete, then count rows.
10. **Shared packages and the new Vue app.**
    - `@repo/ui` and `@repo/tailwind-theme` have no tests of their own. Today the website E2E plus axe is the only guard, and that's enough as long as the website stays on them.
    - jobquest will need its own core (Hono route tests via `getPlatformProxy()`, per PR #17) from J1. It isn't a gap in this suite.
11. Lower: research agents (`lib/agents`) have no tests, but they're Redis-only and switched off in the demo. `db:check-fresh` (CI) already guards migrations and schema drift and belongs in the stability core alongside Vitest.

### Mutation sample (14 breaks, one at a time, in a throwaway worktree)

| # | Break | Caught by |
|---|---|---|
| 1 | guard: per-user cap `>=` → `>` | **not caught** (gap 4) |
| 2 | guard: total cap `>=` → `>` | **not caught** (gap 4) |
| 3 | guard: demo allows unattributed AI calls | guard.test |
| 4 | access: audience not checked | access.test |
| 5 | access: also accept HS256 | not caught, but harmless: `jose` won't use an RSA JWKS key for HS256, and the existing "rejects an HS256 token…" test covers the attack |
| 6 | demo upload limit `<` → `<=` | demo-upload-limit.test |
| 7 | demo: settings PATCH allowed | demo.test, middleware.test |
| 8 | demo: paid lookups switched on | demo.test |
| 9 | middleware: same-site (sibling subdomain) writes allowed | middleware.test |
| 10 | session: DB expiry not checked | **not caught** (gap 3; the JWT's own expiry partly covers it) |
| 11 | session: DB user ID not checked | **not caught** (gap 3) |
| 12 | clients list not scoped to user | clients/route.test (TC-011-A4) |
| 13 | `requireAiAllowance` removed from workspace chat | allowance-coverage.test |
| 14 | assessment: strategy weight 1.2 → 1.0 | not caught; the test checks that strategy and implementation outweigh the others, and implementation still does. Acceptable |

## 4. Recommendation: (c), close to (a)

**Don't wipe.**
- 775 of 1,337 tests (58%) are KEEP. They run real code, and they hold the security and money core: Access, middleware, demo switches, AI guard, upload limits, SSRF, path traversal.
- KEEP files caught 8 of the 14 mutations, and two of the misses are harmless. A ninth (12, a list not scoped to the user) was caught only by `clients/route.test.ts`, which is REWRITE LATER. That's why REWRITE LATER files shouldn't be removed before their replacements exist.
- A rebuild would spend days recreating exactly these tests, which were written on purpose in Parts 3–4a.

**Do this instead:**
1. **Before the refactor:** fix the restore bug, with its test (gap 1). Add gaps 2 and 3 (one PGlite isolation test, one session test). These protect the behaviour the data model and API refactor is most likely to break, and they replace the security value of the mocked route tests.
2. **Delete the DELETE set now:** 24 unit files (178 tests), 9 admin E2E specs (51 tests), and the 18 individual tests listed under the unit table. Nothing real is lost, and they'd fail on harmless refactors and library upgrades.
3. **Don't park REWRITE LATER as a block.** Leave those 22 unit files running; they pass and cost about nothing. In the PR that touches the code a file covers, delete that file and add its PGlite or fake-AI replacement. A blanket park would remove the only checks (weak as they are) on the inbox approve merge and section split/merge before anything replaces them.
4. **Admin E2E:** delete the 9, leave the other 10 unrun as they are today, and after the admin UI redesign rebuild them as gap 7's single smoke test on `dev:lite`, in CI.

**Run time, measured twice each:**
- **Full KEEP set (admin):** 670 tests in 19.4 s, against 20.3 s for the whole suite. Pruning barely changes speed: seven PGlite and bcrypt files set the wall time, not the test count.
- **Fast tier:** 617 tests in 6.9 s (admin) plus 53 in 2.8 s (website). This is the KEEP set minus those seven files and `queue/recover`.
- **Day to day:** run the fast tier while refactoring, and the full suite in CI.

## 5. Proposed command (not created)

Two tiers, both explicit file lists in a separate config. Explicit lists, so a new test file doesn't join the core by accident.

- `apps/admin-portal/vitest.core.config.ts`: a standalone `defineConfig` with the same `environment` and `@` alias as `vitest.config.ts`, and `test.include` set to the 53 fast KEEP files.
  - Write it standalone rather than with `mergeConfig`. Vite's `mergeConfig` concatenates arrays, so an `include` merged onto a base that sets one keeps the base globs too. The website config does set one.
- `apps/admin-portal/package.json`:
  - `"test:core": "vitest run --config vitest.core.config.ts"`: about 7 s
  - `"test:core:full": "CORE_FULL=1 vitest run --config vitest.core.config.ts"`: about 19 s. The config adds the 8 slow KEEP files to `include` when `CORE_FULL` is set. Command-line file filters can't do this, because they only narrow `include`. If NX runs it, add `CORE_FULL` to the target's env inputs.
- `apps/website/package.json`: `"test:core": "vitest run"`, since every website unit test is KEEP.
- Root `package.json`: `"test:core": "nx run-many -t test:core"`.
- `nx.json`: a `targetDefaults["test:core"]` with the same `inputs` as `test` (`default`, `^production`, the three env inputs) and `cache: true`. CLAUDE.md requires every new task config to be in its inputs.
- **Website E2E core:** add a Playwright `grep` tag, `@core`, to the KEEP tests (accessibility, navigation, contact, and the one assessment journey), plus `"test:e2e:core": "playwright test --grep @core"`. That's about 52 tests, a little under the full 28 s.
- **CI stays as it is.** `pnpm test` runs everything that remains, and `db:check-fresh` stays a required check.

## 6. Pending (needs Paul's approval)

- Approve the classification, or say which rows to move.
- Fix PR for gap 1 (restore). Separate from the pruning, and first.
- PR order suggestion:
  1. Restore fix + test
  2. PGlite isolation and session tests (gaps 2 and 3)
  3. Delete the DELETE set (unit files plus the 18 single tests)
  4. Delete the 9 admin E2E specs
  5. `test:core` config, scripts and NX target
  6. Guard boundary, real-parser fixtures, and the middleware and headers rewrite (gaps 4, 6, 8)
- Add a STATUS.md line pointing here (not done, because the brief said no edits before approval).
- Open question: are the CRM features (communications, email templates, outreach, ABN/Places lookups) staying through the redesign? If not, their KEEP lib tests go with them.

## Progress

- **2026-10-16: PR 1 (gap 1), restore ownership.** Local branch `fix/version-restore-ownership`, commit `4276e6a`, not pushed.
  - The new PGlite test failed against the old route (`expected 201 to be 404`) and passes after the fix.
  - The route now looks the version up by id, section and workspace (inner join, as the sibling GET does).
  - Admin unit: 1,080 passed / 16 skipped (Redis-gated), 108 files. `check-types` and `pnpm lint` clean.
- **2026-10-16: CRM features are staying (Paul).** Their KEEP lib tests stay KEEP; the route-test DELETE rows stand as classified.
- **2026-10-16: PR 2 (gaps 2 and 3), stopped at a second bug.** Local branch `test/isolation-and-sessions`, stacked on PR 1; nothing committed.
  - `test/isolation.integration.test.ts` (new, uncommitted): two demo-seeded users on PGlite. The second calls 43 by-id routes on the first's resources (handlers loaded by path) and 8 list routes, then checks the first user's row counts.
  - 50 of 52 pass. Fixing the test itself took two corrections: `documents/[id]/clean` needs a `{ mode }` body, and the jobs list wraps rows as `{ job, clientName }`.
  - **Bug found (Confirmed by the test):** `POST /api/clients/[id]/contacts` never checks that the client belongs to the caller. Another user's request returns 201 and adds a contact on the first user's client (`contacts: 0 → 1`). Every read of contacts filters by the reader's `userId`, so nothing leaks. It's a write into another user's record: the planted row hangs off their client and is deleted with it. Clients are `core` in the demo. Not fixed, per the brief.
  - Not started yet: the session test (gap 3; the function is `validateSession`, not `verifySession`) and the re-run of mutations 10–12.
- **2026-10-16: PR 2, contacts fixed (Paul: fix inside PR 2); stopped at a third bug.**
  - `clients/[id]/contacts`: GET and POST now look up the caller's own client first and return 404 otherwise. The isolation test gained a GET contacts case and an owner check (Bob can still read his workspace and add and list his own contact). 54/54 pass.
  - `lib/auth/session.test.ts` (new, PGlite): covers new session valid; destroyed session refused; expired row refused; row belonging to another user refused.
  - **Bug found (Confirmed):** `createSession` (`lib/auth/index.ts:24-40`) signs a JWT with only `sub`, `iat` and `exp`, all in whole seconds, so two sessions for one user in the same second get the identical token. The insert then fails on `admin_sessions_token_unique`. `login/route.ts:67` doesn't catch it, so the second of two logins in one second (double submit, two tabs) is a 500. The session test hit it: 3 of 4 tests failed at the insert. Not fixed.
  - Still to do: the mutation re-run (10–12), the full suite, and the commit.
- **2026-10-16: PR 2 done.** Local branch `test/isolation-and-sessions`, stacked on PR 1, commits `0ea55e2` and `ab47f82`, not pushed.
  - Paul decided to keep the multi-user demo and fix the session token in this PR. Each token now carries a random `jti`.
  - The session test fails without the fix (4 of 5) and passes with it.
  - Mutations re-run in a throwaway worktree, now removed:
    - 10 (DB expiry): caught by session.test
    - 11 (DB user id): caught by session.test
    - 12 (clients list unscoped): caught by isolation's "GET clients" and by the old TC-011-A4
  - Admin unit: 1,139 passed / 16 skipped, 110 files, 24.6 s. `check-types` and `pnpm lint` clean.
  - Follow-up before the Part 4 deploy: extend the isolation test to routes that take ids in the body (workspace merge/split/organise, gap analysis, export, search, chat, `kb-chunks`, section dependencies).
- **2026-10-16: PRs pushed as drafts.** #19 (restore fix, base `main`) and #20 (isolation and session tests, base `fix/version-restore-ownership`, stacked).
  - #19 squash-merges into `main` with a new hash, so #20 then needs rebasing onto `main` (dropping `4276e6a`) and retargeting.
- **2026-10-16: CI green on #19 and #20** (all 3 required checks).
- **2026-10-16: PR 3 (delete the DELETE set, unit tests).** Local branch `test/prune-delete-set` from `main` (`425d3f4`), commits `2ed11db` (24 files, 178 tests) and `f553b16` (17 single tests), not pushed.
  - One deviation from the approved list: backup TC-08 ("removes file with valid filename") stays. It's the positive control for TC-09's path-traversal check, so 17 single tests go, not 18.
  - Cleanup: removed the mocks, helpers and imports only the deleted tests used, plus an empty `describe` in `providers.test.ts`.
  - `pnpm test:diff`: 24 deleted, 8 changed, 441 assertion lines removed, 0 added, 0 new skips.
  - Admin unit: 899 passed / 16 skipped, 83 files (1,094 − 178 − 17), 18.9 s, so pruning saves about a second, as measured in §4. `check-types` and `pnpm lint` clean.
