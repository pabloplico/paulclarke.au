# Test suite pruning audit: classification (2026-10-16)

Read-only audit of `main` at `5367ffd` (Vitest 5.0.5), kept only for its classification, which `test-prune-backlog.md` works from. **Delete this file in the prune PR.**

Trimmed on 2026-10-16 (last checked at #44). Dropped: the baseline (§1), the gaps and mutation sample (§3), the recommendation (§4), the proposed `test:core` command (§5), the pending list (§6) and the progress log. Gaps 1–3 were fixed in #19 and #20, and the admin E2E red flags in #34; the gaps still open are in `STATUS.md` "Backlog". The rest is in git history. Some rows below name files that have since gone (feeds, backups: #25) or changed: check `test-prune-backlog.md` for each file's status against `main`. "§3 gap N" in the rows below means test-audit gap N, which keeps its number in `STATUS.md`.

**Planned changes this audit assumes (from Paul):** website UI redesign; admin-portal UI redesign; admin data model and API changes; shared packages changing, a new Vue app (jobquest) added, and packages updated to latest. So almost nothing is "stable". A test is only KEEP if it checks pure logic, or security or money behaviour at a boundary that survives a redesign. CRM features are staying (Paul, 2026-10-16), so their KEEP lib tests stay KEEP.

---

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
