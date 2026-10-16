# Test audit against the test architecture guide (2026-10-16)

Read-only audit of `origin/main` at `425d3f4` (#18 merged, Vitest 5.0.5, Biome 2.4.4, Playwright 1.58.2, NX 23.3.0), checked against `docs/audit/testauditinstruct.md`, with each rule ID used as a checklist item.

**Scope and method**

- The audit ran in a throwaway detached worktree in the session scratchpad. No repo code, config or test was changed. The only files written in the repo are this report and the corrections to `testauditinstruct.md` (listed in §9).
- `@vitest/coverage-v8@5.0.5` was added **in that worktree only** to run coverage. The repo still has no coverage provider.
- No real AI provider was called, and `ai:smoke` wasn't run. Every Vitest run had `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `REDIS_URL`, `DATABASE_URL`, `TEST_REDIS_URL` and `TEST_DATABASE_URL` unset. No services were started.
- **Admin E2E was skipped.** Postgres and Redis are running (the dev compose stack), but nothing is serving on 3001. Its `webServer` is `dev:full`, which reads `.env.docker`, so the AI specs would call the real provider and the specs would write into the dev Postgres volume. I reviewed it by reading the code.
- **The 16 Redis-gated contract tests were skipped locally.** I didn't point `TEST_REDIS_URL` at the dev Redis. CI runs them on every PR: the `check` job has a `redis:7-alpine` service.
- **Not audited:**
  - `test/isolation.integration.test.ts` and `lib/auth/session.test.ts`. Both were uncommitted on `test/isolation-and-sessions` when I started and aren't on `main`. They look like protected-test candidates (§3).
  - `test/prune-delete-set`, which another session checked out in the main checkout during the audit. It deletes 24 test files and trims 8. Where it changes a finding, I say so ("prune branch").
- **Scoring:** a rule is passed only when it is PASS. PARTIAL counts as not passed. Mechanical rules were checked with `grep`, a TypeScript-AST scan (if/switch inside `it`/`test` bodies, `let` reassigned in hooks or tests, `setTimeout` sleeps, snapshot matchers, `as any`/`as never` casts), and a trial Biome run with the guide's §8 overrides.

---

## 1. Summary

**Score: 13 of 50 applicable rules pass (26%).** 19 are PARTIAL, 18 FAIL and 4 are N/A. Counting each PARTIAL as half a pass gives 22.5 of 50.

The Vitest suites are fast and mostly sound at the lowest layer: the AI guard, the `JobQueue` contract, PGlite integration and the website's logic. The weak spots are the four areas the upgrade plan most depends on, plus order dependence in the unit suite and an admin E2E suite that can't fail.

**Top 5 risks, ranked by how much they weaken the upgrade gate**

1. **Steps 4 (Mastra) and 8 (AI SDK 7) have almost no gate.**
   - Coverage of Mastra code (`lib/agents/**`): 0–24% lines per file, with no test of any tool, agent or worker.
   - The streaming route `app/api/chat/unified/route.ts` has 0% coverage.
   - 8 test files replace the `ai` module with hand-written fakes and mock `@/lib/ai/models`, which bypasses the guard. An AI SDK 7 API change passes in those files whatever happens.
   - `allowance-coverage.test.ts` can't see `agent.generate(` calls.
2. **Step 6 (pdf-parse 1 → 2) has no gate.**
   - The only PDF test mocks `pdf-parse` completely: `pdf.ts` shows 100% coverage, but the parser never runs.
   - The repo holds no PDF at all. The guide and step 6 both assumed PDFs in `public/demo/`, which holds Markdown only.
   - The Mastra `file-parser.ts` is at 7%.
   - The prune branch deletes `pdf.test.ts`.
3. **Step 7 (BullMQ + ioredis) only guards half the BullMQ surface.**
   - `JobQueue` has a real two-driver contract suite, which runs against Redis in CI.
   - Feeds, backups and the research agents bypass `JobQueue`. Their tests mock `bullmq` and `ioredis`, or there are none.
   - The prune branch deletes `feeds/worker.test.ts` and `db/backup-worker.test.ts`. That leaves no test that touches them.
4. **Admin E2E can't fail, and isn't in CI.**
   - 53 bare `test.skip()` calls turn missing UI into a skip, not a failure.
   - A concrete case: `auth.setup.ts` creates the E2E user through `/api/auth/signup`, which always makes a `member`. But `/backups` calls `requireAdmin()` (`app/(authenticated)/backups/page.tsx:8`), which redirects a member to `/workspaces`, and `/api/backups` calls `requireAdminApi()`. So with auth on (which `auth.spec.ts` assumes), `backups.spec.ts` never reaches the page it tests. Its create and download tests skip through their `isVisible` guards. "Backups page loads" passes only if some text on `/workspaces` matches `/backup/i`; the sidebar's Backups link is `adminOnly`. This is from reading the code: admin E2E wasn't run. **Update:** moot since #25, which deletes `backups.spec.ts` with the backups feature. The general point about admin-only specs still stands.
   - Other weaknesses: 25 fixed waits, 4 serial chains, 65 layout-tied selectors, and tautological assertions such as `toBeGreaterThanOrEqual(0)` and `a || b || c`.
   - Any step touching Next.js, React or the admin UI (steps 1, 3 and 10) leaves the admin UI effectively untested.
5. **Order-dependent Vitest tests.** `--sequence.shuffle` fails 13 or 22 tests (seed-dependent) in 8 of 107 admin files. Every one reproduces with the file run alone.
   - The main cause: `vi.clearAllMocks()` in `beforeEach` keeps a `mockImplementation` or `mockResolvedValue` set by an earlier test.
   - The others: PGlite rows shared within a file, and one staged integration journey.
   - The suite only passes in declaration order, so a Vitest or worker-pool change in any step could turn it red with nothing broken.
   - The 33 route test files that mock `drizzle-orm` operators make it worse. The drizzle 0.45 bump in step 1 can break them with correct code, or pass them with wrong queries.

---

## 2. Current state

### Workspaces and test setup

| Workspace | Unit / integration | E2E | Notes |
|---|---|---|---|
| `apps/admin-portal` | Vitest 5, `vitest.config.ts`: `environment: 'node'`, excludes `e2e/**`, alias `@`; no projects, no setup file, no coverage provider. 106 colocated `*.test.ts` (31 `app/api/**/route.test.ts`, 74 in `lib/`, `middleware.test.ts`) + `test/document-flow.integration.test.ts` | Playwright, `playwright.config.ts`: `testDir: ./e2e`, `fullyParallel: false`, `retries: 0`, no `forbidOnly`, `trace: on-first-retry`; projects `setup` (`auth.setup.ts`, writes `e2e/.auth/user.json`), `auth-tests` (`auth.spec.ts`), `tests` (`storageState`); `webServer: pnpm dev:full`, `baseURL` from `PLAYWRIGHT_BASE_URL`. 19 specs + setup | Shared helpers: `test/fake-ai.ts` (`MockLanguageModelV3`/`MockEmbeddingModelV3` from `ai/test`, bag-of-words embeddings), `test/fixtures/harbourside-bakery-handbook.md`. PGlite set-up is copied into 8 files. |
| `apps/website` | Vitest 5, `vitest.config.ts`: `jsdom`, `include: src/**/*.test.{ts,tsx}`, `restoreMocks: true`, React plugin. 4 files (`useAssessment.test.tsx`, `assessment-content`, `legacy-hash`, `mailto`) | Playwright: `fullyParallel: true`, `forbidOnly: isCI`, `retries: isCI ? 1 : 0`, `trace: on-first-retry`, desktop + Pixel 7 projects; `webServer` = `nx run website:build` + `wrangler dev` on 127.0.0.1:8788 (production build in workerd). 4 specs + `a11y.ts` helper (axe, WCAG 2.1 A/AA) | No tests for `server/index.ts` (Hono), `scripts/build-posts.mjs` or the Writing components. |
| `packages/ui`, `tailwind-theme`, `biome-config`, `prettier-config`, `typescript-config` | none | none | `@repo/ui` has `lint` and `check-types` only. |

- **Snapshots:** none (no `__snapshots__`, `toMatchSnapshot` or `toHaveScreenshot`).
- **Task runner:** NX 23.3.0, no plugins. Root `pnpm test` = `nx run-many -t test`. The `test` target is cached, with inputs `default`, `^production`, and env `TEST_REDIS_URL`, `TEST_DATABASE_URL`, `FLOW_DRIVERS`. `test:e2e` isn't cached and depends on `^build`.
- **CI (`.github/workflows/ci.yml`)**, PRs `nx affected`, pushes `run-many`:
  - `check`: Redis service; test-diff summary on PRs; lint; check-types; `test` with `TEST_REDIS_URL`; build.
  - `admin-db`: `db:check-fresh`.
  - `website-e2e`: Chromium, `test:e2e --exclude='*,!website'`, report uploaded on failure.
  - `deploy-website`: on `main`.
  - Admin E2E: not run ("skipped for now: it needs Postgres and Redis"). No nightly workflow.
- **Biome:**
  - `packages/biome-config/base.json` sets `noFocusedTests: error` and `noSkippedTests: error` for `**/*.test.ts(x)` and `**/*.spec.ts(x)`.
  - The root `biome.json` lowers `noSkippedTests` to `warn` for `apps/admin-portal/e2e/**`.
  - No Playwright nursery rules or GritQL plugin.
  - `apps/website/biome.json` adds a11y rules.

---

## 3. Rule table

| Rule ID | Status | Violations | Notes |
|---|---|---|---|
| T-LAYER-1 | PARTIAL | 72 of 103 route handlers have no Vitest test; `/api/search` and workspace export are covered only by E2E | Most logic is in `lib/` and is unit-tested |
| T-LAYER-2 | PARTIAL | 3 specs outside §7 (`error-states`, `guide`, `settings`) | Measured against the corrected §7 |
| T-LAYER-3 | PARTIAL | Signup and login validation asserted in Vitest, `auth.spec.ts` and `error-states.spec.ts` | |
| T-LAYER-4 | PARTIAL | 31 of 103 routes tested directly; 23 of those against a fake DB | `document-flow.integration` is the model to follow |
| T-PROT-1 | PARTIAL | Nothing marks the protected files; `scripts/test-diff-summary.sh` treats them like any test | CLAUDE.md "Tests" rules apply generally |
| T-PROT-2 | PARTIAL | Table has 4 entries; 8 candidates below | |
| T-UPG-1 | FAIL | Steps 4, 6, 7 and 8 don't meet §4, and no gap is recorded in `dependency-updates.md` | See §5 |
| T-WS-1 | PASS | — | `pnpm test` → `nx run-many -t test` covers both apps |
| T-WS-2 | PASS | — | `NX_RUN=affected` on PRs |
| T-WS-3 | FAIL | PGlite boot copied in 8 files; fake `db` and `drizzle-orm` in 33; auth mock in 25 | `test/fake-ai.ts` is the one shared helper |
| T-WS-4 | PARTIAL | `@testing-library/{dom,react,user-event}`, `jsdom` and `@axe-core/playwright` not in the catalog | All are `devDependencies`. `playwright` is an admin runtime dependency (URL scraping), which is correct |
| T-WS-5 | PARTIAL | Catalog has `^1.58.2` for both | The lockfile resolves both to 1.58.2; not pinned exactly |
| T-CFG-1 | PARTIAL | `apps/admin-portal/playwright.config.ts:9` `fullyParallel: false` | Website: true |
| T-CFG-2 | PASS | — | `setup` project writes `storageState`. Only `auth.spec.ts` logs in through the UI. The one stored user is a `member`, so admin-only specs can't reach their pages (risk 4) |
| T-CFG-3 | PASS | — | Admin 0; website 0 locally, 1 in CI |
| T-CFG-4 | PASS | — | With `retries: 0`, admin never records a trace. `retain-on-failure` would |
| T-CFG-5 | PARTIAL | Admin config has no `forbidOnly` | Biome `noFocusedTests` partly covers it |
| T-CFG-6 | PASS | — | Website E2E runs the production build in `wrangler dev` |
| T-CFG-7 | PARTIAL | `apps/website/playwright.config.ts:3-4` hard-codes port 8788 and `baseURL` | Specs use relative paths |
| T-VIT-1 | PASS | — | No `sequential`, `singleThread` or `fileParallelism` settings |
| T-VIT-2 | PARTIAL | No Vitest projects; driver tests are gated by env vars only | `document-flow.integration` runs in the unit run |
| T-FIX-1 | FAIL | 3 `beforeAll` assignments to module `let`s; 72 `beforeEach` reassignments; no `test.extend` anywhere | |
| T-FIX-2 | PARTIAL | 4 E2E helpers hide `expect` calls | No page objects at all |
| T-LOC-1 | FAIL | 65 class, XPath, parent-traversal or icon-class locators in 13 admin specs, plus `#email`/`#password` | Website: `main h1`, `#mobile-menu` (structural, minor) |
| T-LOC-2 | N/A | — | No `data-testid` in source or specs |
| T-WAIT-1 | FAIL | 25 `waitForTimeout` calls in 13 admin specs | |
| T-WAIT-2 | PASS | — | None |
| T-WAIT-3 | PASS | — | None |
| T-WAIT-4 | PASS | — | All Playwright calls awaited; Biome `noPlaywrightMissingAwait` trial found 0 |
| T-WAIT-5 | FAIL | 6 real-timer sleeps in 3 files | |
| T-DATA-1 | FAIL | Fresh PGlite per file, but rows are shared across tests in 3 files | |
| T-DATA-2 | FAIL | Admin E2E has no fixtures and no teardown, and shares `e2e-test-workspace` | |
| T-DATA-3 | PARTIAL | `Date.now()` suffixes (16) but no `workerIndex`; fixed names in `auth.setup.ts:10,39` and `auth.spec.ts:30` | |
| T-DATA-4 | FAIL | `workspace-crud`, `section-management` and `knowledge-base` set up later tests through the UI | |
| T-DATA-5 | FAIL | 4 serial blocks, none with a comment | |
| T-DATA-6 | FAIL | 8 Vitest files fail under shuffle; E2E serial chains | Proven by shuffle runs (§6) |
| T-MOCK-1 | PARTIAL | No real AI call found, but 8 files hand-fake `ai` | No global network guard either |
| T-MOCK-2 | PARTIAL | 4 files mock `@/lib/queue` instead of using the memory driver | Feeds and backups mock `bullmq` because no memory driver exists for them |
| T-MOCK-3 | FAIL | 33 files mock `drizzle-orm`; 35 mock `@/lib/db`; 8 mock `@/lib/ai/models` (guard bypassed) | |
| T-MOCK-4 | FAIL | 153 `as any`/`as never` casts in 23 files; fake results typed `unknown[]` | |
| T-MOCK-5 | FAIL | `@/lib/db` (35), `@/lib/db/schema` (34), `drizzle-orm` (33), `@/lib/auth/server` (25) mocked inline | |
| T-SNAP-1 | N/A | — | No snapshots |
| T-SNAP-2 | N/A | — | No snapshots |
| T-HYG-1 | PASS | — | No `.only`, `page.pause()` or `$eval` (`page.evaluate` in `a11y.ts` and `assessment.spec.ts` is fine) |
| T-HYG-2 | FAIL | 87 if/switch in test bodies (76 E2E, 11 Vitest) | |
| T-HYG-3 | PASS | — | No commented-out tests |
| T-HYG-4 | FAIL | 53 bare `test.skip()` in admin E2E | Website's 2 skips have reasons and a `biome-ignore`; contract skips explained in the file header |
| T-HYG-5 | PARTIAL | 193 titles carry `TC-…` ids (21 files); 14 titles start with "calls …" | |
| T-HYG-6 | FAIL | 9 US spellings in titles or comments | |
| T-LINT-1 | PARTIAL | §8 nursery rules and the serial-mode plugin are not enabled | Skip and focus rules are on (#18) |
| T-LINT-2 | N/A | — | Applies at dependency step 2 |
| T-CI-1 | PASS | — | Service containers only |
| T-CI-2 | PARTIAL | Website CI retries once; a retried pass is only a "flaky" line in the log; the HTML report is uploaded on failure only | |
| T-CI-3 | FAIL | Not recorded in `dependency-updates.md` step 0 | Numbers ready in §6 |

---

## 4. Violations by rule

`a/` = `apps/admin-portal/`, `w/` = `apps/website/`.

### T-LAYER-1, T-LAYER-3, T-LAYER-4

- `a/app/api/search/route.ts`: tested only by `a/e2e/search.spec.ts`. Fix: add a PGlite route test for ranking and user scoping, then cut the E2E to one search.
- The workspace export logic is tested only by `a/e2e/workspace-export.spec.ts:45-98`. Fix: a route test asserting the exported JSON and Markdown.
- `a/e2e/error-states.spec.ts:41-93` re-asserts API 400s and 404s already covered in `signup/route.test.ts` and `login/route.test.ts`. Fix: delete the API cases from E2E, or move any that are missing into Vitest.
- `a/e2e/auth.spec.ts:91-110`: the short-password case duplicates `signup/route.test.ts`. Fix: keep one invalid-password case in E2E.
- Route handlers: 31 of 103 `route.ts` have a direct test, and 23 of those run on a fake DB (see T-MOCK-3). Fix: after the upgrades, follow `test/document-flow.integration.test.ts` (PGlite + fake AI).

### T-LAYER-2

- `a/e2e/error-states.spec.ts`: validation permutations. Fix: move them to Vitest.
- `a/e2e/guide.spec.ts` and `a/e2e/settings.spec.ts`: static renders. Fix: fold them into one "admin pages load" smoke test, or justify them in the PR.

### T-PROT-1, T-PROT-2

- `scripts/test-diff-summary.sh`: protected files aren't flagged. Fix: list the §3 files in the script and print a "protected test changed" warning.
- §3 table: add the candidates in §5 below, with Paul's sign-off.

### T-UPG-1

- `docs/audit/dependency-updates.md` steps 4, 6, 7 and 8: gaps not recorded. Fix: paste the §7 rows of this report into those steps' Notes.
- Step 6 also says "Test with real PDFs from `public/demo/`", but none exist. Fix: point it at new fixtures under `a/test/fixtures/`.

### T-WS-3, T-MOCK-5

- PGlite boot (`process.env.DB_DRIVER = 'pglite'`, `delete PGLITE_DATA_DIR`, dynamic imports, `ensurePgliteReady`, `getPglite().close()`) is copied into:
  - `a/lib/db/pglite.test.ts:6-19`
  - `a/lib/redis-free.test.ts:9-54`
  - `a/lib/demo-seed/seed.test.ts:7-39`
  - `a/lib/auth/seed-admin.test.ts:4-19`
  - `a/lib/document-processing/demo-upload-limit.test.ts:3-42`
  - `a/lib/queue/recover.test.ts:4-23`
  - `a/lib/auth/access-user.test.ts:8-43`
  - `a/test/document-flow.integration.test.ts:29-120`

  Fix: an `a/test/pglite.ts` helper that exports a Vitest `test.extend` fixture.
- `@/lib/auth/server` is mocked inline in 25 files. Fix: an `a/test/auth.ts` with `mockSignedInUser(user)`.

### T-WS-4, T-WS-5

- `w/package.json:43-45`: `@testing-library/dom`, `react` and `user-event` are outside the catalog. Fix: move them to the catalog (with `jsdom`).
- `pnpm-workspace.yaml`: `playwright: ^1.58.2` and `@playwright/test: ^1.58.2`. Fix: pin both to the same exact version.

### T-CFG-1, T-CFG-5, T-CFG-7

- `a/playwright.config.ts:9` `fullyParallel: false`. Fix: set it to `true` once T-DATA-2 to T-DATA-5 are fixed.
- `a/playwright.config.ts`: no `forbidOnly`. Fix: add `forbidOnly: !!process.env.CI`.
- `w/playwright.config.ts:3-4`: the port is a literal. Fix: `const PORT = Number(process.env.E2E_PORT ?? 8788)`.

### T-VIT-2

- `a/vitest.config.ts`: no projects. Fix: define `unit` (default), `integration` (`test/**`, PGlite files) and `driver` (`contract.test.ts` with Redis) projects, so CI can choose.

### T-FIX-1, T-DATA-6 (Vitest)

- Module `let` assigned in `beforeAll`:
  - `a/lib/demo-seed/seed.test.ts:34` (`userId`)
  - `a/lib/document-processing/demo-upload-limit.test.ts:34` (`userId`)
  - `a/middleware.test.ts:19` (`validToken`)

  Fix: a `test.extend` fixture that returns the value.
- The fake-DB route tests reassign result `let`s in `beforeEach` (72 places). The worst is `a/app/api/inbox/[id]/approve/route.test.ts`, with 9 hooks and 120 in-test assignments. Fix: replace them with PGlite (after upgrades).
- The order-dependent files are listed with their fixes in §6.

### T-FIX-2

Helpers that hide `expect` calls. Fix: return locators, and assert in the test.

- `a/e2e/document-actions.spec.ts:5-33` (`gotoReadyDocDetail`, `openDropdown`)
- `a/e2e/gap-analysis.spec.ts:20-33` (`runGapAnalysis`)
- `a/e2e/section-management.spec.ts:14-24` (`openAddSectionDialog`, also with `waitForTimeout`)

### T-LOC-1

Fix for all: `getByRole`, `getByLabel` or `getByText`, and accessible names for icon buttons (which also helps a11y).

- `a/e2e/document-actions.spec.ts:7` (XPath `ancestor::div[contains(@class,"flex w-full")]`), `:14` (`.relative > button`)
- `a/e2e/gap-analysis.spec.ts:24,53,72,73,97,129,152,171,187,203,225,240,260,275` (`[class*="rounded-lg"][class*="border-border"]`, `[class*="space-y-3"]`, `svg.lucide-refresh-cw`)
- `a/e2e/workspace-chat.spec.ts:26,36,55,66,73,82,94,103,129,138,151`
- `a/e2e/section-management.spec.ts:22,47,64,78,92,106,134,167,196,228` (`button.border-dashed`, `.fixed.inset-0`)
- `a/e2e/search.spec.ts:39,61,86,108,109,111,131` (`[class*="absolute"][class*="shadow-lg"]`, `..` traversal, `svg.lucide-x`)
- `a/e2e/version-history.spec.ts:66,150,152,170`
- `a/e2e/workspace-crud.spec.ts:129,159,203,236`
- `a/e2e/auth.spec.ts:39,88,106,133` (`.bg-destructive\/10`)
- `a/e2e/inbox-workflow.spec.ts:83,154,214`
- `a/e2e/knowledge-base.spec.ts:87,90`
- `a/e2e/workspace-export.spec.ts:25,28`
- `a/e2e/ai-inline-editing.spec.ts:24`
- `a/e2e/settings.spec.ts:49`
- `a/e2e/auth.setup.ts:24-25` and `a/e2e/auth.spec.ts` (`#email`, `#password`). Fix: `getByLabel('Email')`.

### T-WAIT-1

Fix for all: wait on the result, using web-first `expect(...).toBeVisible()`, `toHaveURL` or `waitForResponse`.

- `a/e2e/workspaces.spec.ts:73`
- `a/e2e/workspace-crud.spec.ts:170,222`
- `a/e2e/document-upload.spec.ts:44,94`
- `a/e2e/auth.spec.ts:103`
- `a/e2e/section-management.spec.ts:17,151`
- `a/e2e/knowledge-base.spec.ts:54,121`
- `a/e2e/inbox.spec.ts:39`
- `a/e2e/gap-analysis.spec.ts:168,200,238,273`
- `a/e2e/search.spec.ts:36,59,84,129,151`
- `a/e2e/error-states.spec.ts:103,119`
- `a/e2e/version-history.spec.ts:128`
- `a/e2e/inbox-workflow.spec.ts:106,219`

The trial Biome run also found 90 `waitForLoadState('networkidle')` calls across 20 admin files (`noPlaywrightNetworkidle`). That is the same smell, though the guide doesn't name it.

### T-WAIT-5

- `a/lib/queue/contract.test.ts:125,140,214` and `a/lib/rate-limit/contract.test.ts:68` sleep 200–250 ms to prove that nothing happened or that a window expired. Fix: for the memory drivers, use fake timers; for the Redis half, keep the real wait but use `vi.waitFor` with a deadline.
- `a/lib/queue/contract.test.ts:48` has a 10 ms polling helper. Fix: `vi.waitFor`.
- `a/lib/rate-limit/memory.test.ts:12`: 100 ms sleep. Fix: `vi.useFakeTimers()` + `advanceTimersByTime`.
- `a/lib/api/resolve-params.test.ts:214`: `setTimeout(…, 0)` builds a deferred promise. That's acceptable.

### T-DATA-1

Fix for all three: give each test its own rows (create its user in the test, or through a fixture).

- `a/lib/db/pglite.test.ts:44-50`: the transaction test reads the user inserted by the previous test.
- `a/lib/auth/seed-admin.test.ts:51-54`: "leaves an existing account alone" needs the account made in `:29-43`.
- `a/test/document-flow.integration.test.ts:128-207`: five tests are one journey through describe-scope `documentId` and `inboxItemId` (`:125-126,145-146`). Fix: one `it` with `expect.soft` steps, or `describe(name, { shuffle: false }, …)` with a comment saying why (not `describe.sequential`, which controls concurrency, not order).

### T-DATA-2, T-DATA-3, T-DATA-4, T-DATA-5 (admin E2E)

- No `test.extend` and no teardown in any spec. `auth.setup.ts:30-46` creates the shared `e2e-test-workspace`, which 5 specs use. Nothing deletes created workspaces, knowledge bases, notes or documents. Fix: fixtures that create through `page.request` (the APIs exist) and delete in teardown.
- Names use `Date.now()` without `workerIndex`:
  - `workspace-crud.spec.ts:11`
  - `knowledge-base.spec.ts:11`
  - `auth.spec.ts:11`
  - `inbox-workflow.spec.ts:13,184`

  Fix: `${testInfo.workerIndex}-${Date.now()}`.
- UI-driven setup:
  - `workspace-crud.spec.ts:148-252`: archive, delete and cancel act on workspaces created by earlier tests through the UI.
  - `knowledge-base.spec.ts:58-126` uses the KB created in `:23-56`.

  Fix: create them through `/api/workspaces` in a fixture.
- Serial mode with no comment:
  - `document-actions.spec.ts:36`
  - `workspace-crud.spec.ts:14`
  - `knowledge-base.spec.ts:14`
  - `auth.spec.ts:16`

  Fix: make each test independent, then remove the serial mode.

### T-MOCK-1, T-MOCK-3, T-MOCK-4

- `vi.mock('ai')` plus `vi.mock('@/lib/ai/models')`, which skips the guard against CLAUDE.md's rule:
  - `a/lib/rag/embeddings.test.ts:6,11`
  - `a/lib/workspace-routing/router.test.ts:14,32`
  - `a/lib/document-processing/chunk-analysis.test.ts:4,8`
  - `a/lib/document-processing/metadata.test.ts:3,7`
  - `a/app/api/workspaces/[id]/sections/[sectionId]/ai-edit/route.test.ts:22,28`
  - `…/suggest-rules/route.test.ts:14,19`
  - `a/app/api/chat/route.test.ts:86,91`
  - `a/app/api/outreach/personalise/route.test.ts:36,45`

  Fix: mock `@/lib/ai/providers` with `test/fake-ai.ts`, as `document-flow.integration` does. The prune branch deletes 4 of these files.
- `vi.mock('drizzle-orm', () => ({ eq: (col, val) => ({ col, val }) … }))` appears in 33 files, for example `a/app/api/jobs/[id]/route.test.ts:11-14`. Fix: PGlite (after upgrades). TEST_AUDIT.md classifies each file.
- `as any`/`as never`: 153 casts. The most are in `a/lib/api/resolve-params.test.ts` (18), `a/app/api/workspaces/[id]/route.test.ts` (15), `…/sections/merge/route.test.ts` (13), `a/app/api/workspaces/route.test.ts` (12), `a/lib/workspace-routing/router.test.ts` (11) and `a/lib/rag/embeddings.test.ts` (11). Fix: type fakes as `typeof adminWorkspaces.$inferSelect` and similar, and use `satisfies`.
- `a/lib/document-processing/parsers/pdf.test.ts:3,13,33,49` casts `pdf-parse` to `vi.fn` and makes up its result shape. Fix: the golden test in §7.

### T-MOCK-2

`vi.mock('@/lib/queue')` appears in:

- `a/lib/document-processing/queue.test.ts:5`
- `a/lib/workspace-routing/queue.test.ts:8`
- `a/lib/document-processing/worker.test.ts:18`
- `a/lib/workspace-routing/worker.test.ts:13`

Fix: use `InProcessQueue`, and assert on the job it runs.

### T-HYG-2

Fix for all: split the test, or use `test.each`. For the E2E ones, the condition is usually "skip if the element is missing", which should be a failing assertion instead.

- E2E:
  - `a/e2e/ai-inline-editing.spec.ts:39,58,73,82,104,130,143,146,164`
  - `version-history.spec.ts:23,37,53,75,89,112,121,141,162`
  - `knowledge-base.spec.ts:30,43,64,81,94,97,102,117`
  - `workspace-export.spec.ts:19,31,39,49,62,72,84`
  - `gap-analysis.spec.ts:100,133,156,191,229,264`
  - `workspace-crud.spec.ts:36,93,161,182,205,238`
  - `section-management.spec.ts:42,128,162,190,220`
  - `workspaces.spec.ts:21,37,59,64,70`
  - `backups.spec.ts:37,61,70,80`
  - `document-upload.spec.ts:36,70,88,123`
  - `settings.spec.ts:52,62,72`
  - `document-actions.spec.ts:54,217`
  - `inbox.spec.ts:17,30`
  - `error-states.spec.ts:91`
  - `guide.spec.ts:50`
  - `inbox-workflow.spec.ts:171`
  - `search.spec.ts:113`
  - `workspace-chat.spec.ts:111`
  - `w/e2e/navigation.spec.ts:59` (helper branch on `isVisible()`)
- Vitest:
  - `a/lib/document-processing/upload-validation.test.ts:80,95,113`: `if (!result.valid)` narrowing. Fix: `expect(result).toMatchObject({ valid: false, error: expect.stringContaining('25MB') })`.
  - `a/lib/ai/style-coverage.test.ts:37`
  - `a/lib/db/pglite.test.ts:50`
  - `a/lib/demo.test.ts:70`
  - `a/lib/rag/chunker.test.ts:245`
  - `w/src/hooks/useAssessment.test.tsx:45,58`
  - `w/src/lib/assessment-content.test.ts:70,80`

### T-HYG-4

53 bare `test.skip()` calls. Fix: replace each with an assertion. Where the precondition is genuinely optional, use `test.skip(cond, 'reason')` with a `biome-ignore`.

- `ai-inline-editing.spec.ts:40,59,83,105,131,147`
- `backups.spec.ts:38,62`
- `document-actions.spec.ts:55,218`
- `document-upload.spec.ts:37,89,124`
- `gap-analysis.spec.ts:101,134,157,192,230,265`
- `guide.spec.ts:51`
- `inbox.spec.ts:18,31`
- `knowledge-base.spec.ts:31,44,65,82,103,108`
- `section-management.spec.ts:129,163,191,221`
- `version-history.spec.ts:24,38,54,76,90,113,122,142,163`
- `workspace-chat.spec.ts:112`
- `workspace-crud.spec.ts:162,183,206,239`
- `workspace-export.spec.ts:20,32,40,63,85`
- `workspaces.spec.ts:22,38`

Related weak assertions, which pass whatever happens. Fix: assert the real outcome.

- `a/e2e/backups.spec.ts:29` (`toBeGreaterThanOrEqual(0)`)
- `a/e2e/settings.spec.ts:38` (`a || b || c > 0`)
- `a/e2e/error-states.spec.ts:23`
- `a/e2e/workspace-export.spec.ts:45-98` (download promise `.catch(() => null)`, then `if (download)`)
- `a/e2e/backups.spec.ts:66-73` (the same pattern)

### T-HYG-5

- 193 titles start with `TC-…` ids, for example `a/lib/feeds/worker.test.ts:149` and `a/lib/ai/usage-logger.test.ts:35-394`. Fix: drop the ids, and keep the behaviour.
- Implementation-style titles. Fix: name the behaviour, or delete the test (most are mock-call checks):
  - `a/lib/settings.test.ts:87` "calls db.select().from(adminSettings)"
  - `a/lib/auth/index.test.ts:111,244`
  - `a/lib/onboarding/seed-default-workspace.test.ts:96`
  - `a/app/api/auth/signup/route.test.ts:223`
  - `a/app/api/outreach/personalise/route.test.ts:131`
  - `…/suggest-rules/route.test.ts:105`
  - `a/lib/api/resolve-params.test.ts:78`

### T-HYG-6

Fix: Australian spelling ("normalises", "summarises", "behaviour", "recognised", "analysed").

- `a/app/api/auth/signup/route.test.ts:209` "normalizes"
- `a/app/api/workspaces/route.test.ts:352` "normalizes"
- `a/lib/document-processing/cleaner.test.ts:30` "normalizes"
- `…/suggest-rules/route.test.ts:162` "summarizes"
- `a/app/api/inbox/[id]/skip/route.test.ts:38` "recognized"
- `a/lib/gap-analysis/check-rules.test.ts:378` "unrecognized"
- `a/lib/ai/providers.test.ts:119` "behavior"
- `a/lib/workspaces/section-tree.test.ts:6` "behavior"
- `a/lib/document-processing/chunk-analysis.test.ts:156` "analyzed"

### T-LINT-1

- Root `biome.json`: add the §8 override (corrected paths) and `tools/lint/no-serial-mode.grit`. I trialled it on copies of the e2e folders with Biome 2.4.4. It flags 25 `noPlaywrightWaitForTimeout` calls and 4 serial-mode diagnostics. 0 for `waitForSelector`, `force`, `pause` and `$eval`.
- Biome 2.4.4 also has `noPlaywrightMissingAwait` (0 hits today) and `noPlaywrightNetworkidle` (90 hits). Both are worth adding: the first at `error`, the second at `warn` until fixed. That would add rules, so I left it out of the guide.

### T-CI-2, T-CI-3

- `.github/workflows/ci.yml:163-169`: the report is uploaded only on failure. Fix: upload on `always()`, or add a step that greps the Playwright JSON reporter for `flaky` and writes it to the job summary.
- `dependency-updates.md` step 0: no baseline recorded. Fix: paste §6.

---

## 5. Protected tests (§3)

### The four listed tests: present and passing

| Test | Exists | What it asserts | Weak points |
|---|---|---|---|
| `a/lib/ai/allowance-coverage.test.ts` | Yes, 2 tests | Walks the import graph from every `app/api/**/route.ts`. A route "starts AI work" if it reaches a file that calls `generateText`/`generateObject`/`streamText`/`streamObject`/`embedMany`/`embed(` and imports from `'ai'`, or one of 3 enqueue modules. Asserts more than 20 AI routes are found (including `inbox`, `ai-edit` and `find-source`), and that each non-exempt route's source contains `requireAiAllowance(` (one exemption: the research-run cancel route). | It is regex-based. Mastra's `agent.generate(` (`a/lib/agents/queue/{research,ingestion,analysis}-queue.ts:75,65,281`) doesn't match, so a new route that runs an agent inline wouldn't be caught. The string check passes if `requireAiAllowance(` appears only in a comment. |
| `a/lib/ai/guard.test.ts` | Yes, 14 tests | `maxOutputTokens` cap (lower one kept); per-call pricing recorded against the user; per-user and total daily caps refuse the next call; demo-mode default caps; unattributed call refused in demo only; `enterAiUser` scoping; streamed calls recorded on finish; embeddings recorded; provider `insufficient_quota` and `project_spend_limit_exceeded` 429s become `AiBudgetError` with no SDK retries; ordinary 429s still retry. Coverage of `guard.ts`: 92.5% lines, 78.1% branches. | It builds `MockLanguageModelV3` and `MockEmbeddingModelV3` and v3 stream parts inline. If AI SDK 7 renames these, step 8 has to edit a protected test (see §7, step 8). |
| `a/lib/ai/pricing.test.ts` | Yes, 3 tests | Dated snapshots price like the base model (and a non-date suffix doesn't); cached input at the cached rate (gpt-4.1-nano, $0.50 per 1M+1M; $0.025 cached); an unknown model gives `undefined`. Coverage 100% lines and branches. | Only one of 8 priced models is checked. A wrong price for the embedding model, or for `gpt-5-mini`, would pass. Nothing ties `MODEL_PRICES` to the default models (`lib/agents/mastra/provider.ts:9` defaults to `gpt-4o`, which has no price, so outside demo mode the guard would record no spend for research agents, only a one-time warning: `lib/ai/guard.ts:172-176`). |
| `db:check-fresh` (`a/scripts/db/check-fresh-db.ts`) | Yes; CI job `admin-db` | Schema has no drift from the latest migration snapshot; migrations apply to an empty PGlite; `drizzle-kit` introspection finds no difference; every expected table and column exists and nothing extra; pgvector installed with a 1536-d cosine search; document → chunk cascade; a second migrate is a no-op. | None found. It is a script, not a Vitest test, so `pnpm test` doesn't run it. The gate in `dependency-updates.md` lists it separately, which is correct. |

### Proposed additions, with reasons

| Candidate | Guards | Why protect it |
|---|---|---|
| `a/lib/auth/access.test.ts` + `a/middleware.test.ts` | Demo sign-in only through a verified Cloudflare Access JWT, never the plain email header | Security: the demo's only way in. An upgrade of `jose` or Next middleware could quietly loosen it. |
| `a/lib/demo.test.ts` | Every page and API route is classified; switched-off features return 404 and settings changes 403 in demo mode | Security: stops an unreviewed route being exposed to visitors. |
| `a/app/api/auth/signup/route.test.ts` "creates the account as a member, never an admin" + `a/lib/auth/seed-admin.test.ts` "never uses admin123" | Privilege: no self-made admins, no default password | Security invariant, small and stable. |
| `a/lib/document-processing/upload-validation.test.ts` "demo uploads" block + `rejectOversizedDemoRequest` + `demo-upload-limit.test.ts` | Demo refuses PDF/DOCX (CVE-2024-4367 mitigation), files over 2 MB, unknown-length bodies, and more than 20 uploads | Security and cost. Step 6 touches exactly this file. |
| `a/test/document-flow.integration.test.ts` "counted the AI spend against the uploader" | Worker jobs attribute AI spend to the uploader through the guard | Money: the per-user cap only works if background jobs are attributed. |
| `a/lib/startup-checks.test.ts` + `a/lib/ai/config-check.test.ts` | Demo refuses to start with a bad config or an unpriced model | Money: the spend cap can't count an unpriced model. |
| `a/lib/rate-limit/contract.test.ts` (both drivers) | Per-user AI request limit and login throttling behave the same on memory and Redis | Money and security. Step 7 touches ioredis. |
| `test/isolation.integration.test.ts`, `lib/auth/session.test.ts` (on `test/isolation-and-sessions`, not on `main`) | Users can't read each other's data; session handling | Data isolation is the most important data invariant. TEST_AUDIT.md gap 2 says the only current check is a mock `where`-shape test. Protect it once it merges. |

---

## 6. Stability baseline (ready to paste into dependency step 0)

Measured 2026-10-16 on `425d3f4`, on the host (12 cores, load average about 2), with Node 22, each suite run on its own. Vitest was run directly (`pnpm exec vitest run`, not through NX), so no run was a cache replay. AI keys and Redis/DB URLs were unset.

| Suite | Command | Result | Duration |
|---|---|---|---|
| Admin Vitest | `vitest run` | 107 files, 1,094 tests: 1,078 passed, 16 skipped (Redis halves of the two contract suites; `TEST_REDIS_URL` unset) | 21.2 s (22.5 s wall) |
| Admin Vitest, shuffled | `vitest run --sequence.shuffle --sequence.seed=20261016` | **13 failed** in 8 files, 1,065 passed, 16 skipped | 21.0 s (22.3 s wall) |
| Admin Vitest, shuffled | `vitest run --sequence.shuffle --sequence.seed=4242` | **22 failed** in 8 files, 1,056 passed, 16 skipped | 21.1 s (22.4 s wall) |
| Website Vitest | `vitest run`, then shuffled with seeds 20261016 and 4242 | 4 files, 53 tests, all passed in all three runs | 1.6–1.7 s (2.8–3.0 s wall) |
| Website E2E | `playwright test` (default workers) | 64 passed, 2 skipped (mobile-only tests in the desktop project) | 24.7 s (27.0 s wall, build cached) |
| Website E2E, repeated | `playwright test --repeat-each=3 --workers=4` | 192 passed, 6 skipped, 0 failed, 0 flaky | 1.2 min (74.6 s wall, includes build) |
| Admin E2E | — | **Not run** (see Scope) | — |
| `db:check-fresh` | — | Not run here; it's a CI job, and the protected-test review read its source | — |

**Classification of every failure**

- **Flaky** (passed and failed in the same order): none.
- **Genuinely broken** (fails in declaration order): none.
- **Order-dependent**: 8 admin files. Each one reproduces with the file run alone under both seeds, and passes alone unshuffled. So they depend on test order within the file, not on other files: Vitest isolates each file in its own worker.

| File | Fails under shuffle | Root cause | Fix (effort) |
|---|---|---|---|
| `a/app/api/auth/signup/route.test.ts` | Up to 9 tests (429 instead of 400/201/500) | `:249` sets `ipLimiter.check.mockResolvedValue({ allowed: false })`; `vi.clearAllMocks()` in `beforeEach` (`:91`) doesn't undo it | `mockResolvedValueOnce`, or `vi.resetAllMocks()` / `mockReset: true` (S) |
| `a/app/api/jobs/[id]/route.test.ts` | "updates job fields", "returns 404 when not found" | `mockDb.update.mockImplementation` at `:118,137,156` leaks; `beforeEach` only resets the result arrays | Same fix (S) |
| `a/app/api/communications/[id]/route.test.ts` | "returns 404 when not found" | `mockImplementation` at `:88,108` leaks | Same fix (S). The prune branch deletes this file |
| `a/lib/settings.test.ts` | 4 `getSetting`/`updateSettings` tests | `mockDb.select.mockImplementation` at `:144` leaks | Same fix (S). The prune branch deletes this file |
| `a/lib/instrumentation-node.test.ts` | "starts every worker in development on BullMQ" | The two queue workers' import is only recorded by whichever test runs first (the comment at `:62-63` admits it) | Record the starts in a `vi.fn` reset per test, or assert in a single test (S) |
| `a/lib/auth/seed-admin.test.ts` | "generates a random password…", "leaves an existing account alone" | Shared PGlite rows: the second needs the first's account; the first fails if the account already exists | Each test uses its own email and creates what it needs (S) |
| `a/lib/db/pglite.test.ts` | "commits and rolls back transactions" | Reads the user inserted by the previous test (`:44-50`) | Insert its own user (S) |
| `a/test/document-flow.integration.test.ts` | "routes the inbox item…", "counted the AI spend…", "finds the right passage…" | Staged journey sharing `documentId` and `inboxItemId` across `it`s | One `it` with `expect.soft` steps, or `describe(name, { shuffle: false }, …)` plus a comment (S). (Corrected: `describe.sequential` controls concurrency, not order, so it doesn't stop shuffling.) |

The admin Vitest config doesn't set `restoreMocks`, `mockReset` or `clearMocks`. I measured both options with a throwaway config (`mergeConfig` over `a/vitest.config.ts`) in the scratch worktree:

- **`mockReset: true` fixes all four mock-leak files** (`signup`, `jobs/[id]`, `communications/[id]`, `settings`): 46 of 46 tests pass under both seeds and unshuffled.
- **On the full admin suite, `mockReset: true` breaks nothing**: 1,078 passed unshuffled. Shuffled, only the other four files still fail (6 tests with seed 4242, 5 with seed 20261016): `seed-admin`, `pglite`, `instrumentation-node` and `document-flow`.
- **`restoreMocks: true` does not fix them.** `settings.test.ts` still fails under both seeds. In Vitest 5 it only restores `vi.spyOn` spies, not `vi.fn()` implementations.

So one config line fixes four files, and the other four need the local fixes above. It is still a config change, so it gets its own PR.

**Coverage baseline**

| §4 area | File | Lines | Branches |
|---|---|---|---|
| Guard and pricing | `lib/ai/guard.ts` | 92.5% (74/80) | 78.1% (50/64) |
| | `lib/ai/pricing.ts` | 100% (9/9) | 100% (10/10) |
| | `lib/ai/allowance.ts` | 78.6% | 64.3% |
| | `lib/ai/providers.ts` | 73.0% | 68.4% |
| | `lib/ai/usage-logger.ts` | 91.4% | 92.3% |
| Streaming route | `app/api/chat/unified/route.ts` | 0% (0/85) | 0% (0/58) |
| Mastra | `lib/agents/mastra/provider.ts` | 11.8% | 14.3% |
| | `lib/agents/mastra/agents/create.ts` | 0% | — |
| | `lib/agents/mastra/tools/*` (6 files) | 0–16.7% each | 0% each |
| | `lib/agents/queue/*` (9 files) | 0–23% each (analysis-queue 1.4% of 148 lines) | 0–11% |
| | `lib/agents/*` (embeddings, suggest-sources, settings, source-directory) | 0% | 0% |
| pdf-parse | `lib/document-processing/parsers/pdf.ts` | 100% (2/2), but **against a mocked `pdf-parse`** | 100% |
| | `lib/document-processing/upload-validation.ts` | 100% (34/34) | 94.1% |
| | `lib/agents/mastra/tools/file-parser.ts` | 6.7% | 0% |
| BullMQ + ioredis | `lib/redis.ts` | 43.8% | 71.4% |
| | `lib/queue/bullmq.ts` | 3.0% locally (Redis halves skipped; CI runs them) | 0% locally |
| | `lib/queue/in-process.ts` | 100% | 96.2% |
| | `lib/queue/recover.ts`, `index.ts` | 100% | 100% / 50% |
| | `lib/feeds/worker.ts` | 93.3% (against mocked `bullmq`) | 75% |
| | `lib/feeds/queue.ts` | 33.3% | — |
| | `lib/db/backup-worker.ts` | 84.2% (against mocked `bullmq`) | 50% |
| react-markdown | `w/src/components/sections/posts/PostDetail.tsx` | 0% | 0% |
| | `w/src/components/sections/posts/PostList.tsx` | 0% | 0% |
| | `w/src/lib/api/posts.ts` | 0% | 0% |
| | `w/server/index.ts` | 0% | 0% |
| | `w/scripts/build-posts.mjs` | 0% | 0% |

Method: the full admin suite was run with `--coverage.include` limited to these paths, so code reached through `document-flow.integration` counts. The website suite was scoped the same way.

**Website bundle (for step 9), `dist/client/assets` from `nx run website:build`**

| File | Raw | gzip -9 |
|---|---|---|
| `index-*.js` | 379,142 B | 120,306 B |
| `post.lazy-*.js` (react-markdown) | 119,183 B | 36,481 B |
| `assessment.lazy-*.js` | 65,265 B | 18,344 B |
| `fileRoute-*.js` | 590 B | 315 B |
| `index-*.css` | 72,376 B | 12,723 B |
| **JS total** | 564,180 B | 174,796 B (concatenated) |

---

## 7. Upgrade readiness (T-UPG-1)

| Step | Status | Tests today, and what they actually assert | Write first | Effort |
|---|---|---|---|---|
| **4 Mastra** | **Blocked** | None for Mastra. `allowance-coverage` only reaches research work through `lib/agents/queue/trigger.ts`. Coverage is in §6. | (1) Each tool's `execute()`: `file-parser` on a CSV fixture, `source-scorer`, `db-writer` on PGlite, `web-search`/`api-fetcher`/`scraper` with `fetch` stubbed. (2) An agent smoke test: `createAgents` with `MockLanguageModelV3` through `getModel()` (guarded), `agent.generate()` returns text, and `spendLedger` records the call. That proves the Mastra path still hits the guard. (3) One research-queue processor test with the agent faked at the provider. (4) Make `allowance-coverage` treat `.generate(` and `.stream(` on agents as AI calls. | M |
| **5 react-markdown** | **Ready with gaps** | E2E: a post opens from the list and deep link, the `<h1>` title (from the header, not the Markdown) and axe. Nothing asserts the rendered body. | A component test rendering `PostDetail`, or `<ReactMarkdown>` on both real posts, asserting headings, links (`href`), ordered and unordered lists and paragraphs. Add a code block and a table to a test fixture if posts may use them. A unit test for `build-posts.mjs` (front matter, slug, date sort). | S |
| **6 pdf-parse** | **Blocked** | `pdf.test.ts` mocks `pdf-parse`, so it only checks the field mapping. `upload-validation` (100%) checks size and type rules, not parsing. No PDF in the repo. The prune branch deletes `pdf.test.ts`. | Commit 2–3 small PDFs under `a/test/fixtures/`: text, multi-page with metadata, and corrupt or encrypted. A golden test calling the real `parsePdf`: text hash, `pageCount`, metadata, and a throw on corrupt input. The same fixture through the Mastra `file-parser` tool. One run through `document-flow` with a PDF (the full app accepts PDFs; demo mode refuses them). | S–M |
| **7 BullMQ + ioredis** | **Blocked** | `JobQueue` (document processing and routing) is well covered: `lib/queue/contract.test.ts`: 10 behaviours × 2 drivers (attempt numbering, early jobs, retry until success, give up after N, discard, dedupe by id, id reuse, concurrency, `drained()`, `close()`). The BullMQ half runs in CI. `rate-limit/contract.test.ts`: 6 × 2. `redis-free.test.ts`: demo mode opens no connection. Feeds and backup worker tests mock `bullmq` and only check the call shapes. Research: none. | Driver-integration tests on Redis (gated by `TEST_REDIS_URL`, so CI runs them): feeds and backups register their job scheduler (`upsertJobScheduler`) and process one tick; one research run publishes to the log channel. `lib/redis.ts`: connection options and `closeRedis`. Don't merge the prune branch's deletion of the feeds and backup worker tests until these exist. | M |
| **8 AI SDK 7** | **Blocked** (after 4; needs Mastra's support) | Guard (§5) and `fake-ai.ts` use real `ai/test` mocks; `document-flow` runs `generateObject` and `embed` through the guard. Nothing tests `streamText` to an HTTP response or tool calls. 8 files replace `ai` with hand-written fakes. | (1) A test for `app/api/chat/unified/route.ts` with a streaming `MockLanguageModelV3`: asserts the text stream body and that usage is recorded. (2) A tool-call shape test: a mock model emitting a tool call through `generateText({ tools })` or a Mastra agent. (3) Convert the 8 `vi.mock('ai')` files to `@/lib/ai/providers` + `fake-ai.ts`, so they run the real SDK. (4) Agree with Paul in advance that a rename of `MockLanguageModelV3`/`V3` stream parts in `guard.test.ts` counts as mechanical, not a weakened protected test. Or move the mock construction into `test/fake-ai.ts` first. | M |
| **9 Vite 8** | **Ready** | Website E2E covers every public route, deep links, 404s, the assessment and contact journeys, and axe on every page. It ran 192 of 192 at `--repeat-each=3`. Bundle sizes are recorded in §6. | Nothing blocking. Run `pnpm run deploy:dry-run` before and after (not run in this audit), and compare sizes with §6. | — |

---

## 8. Remediation plan

Effort: **S** = up to 2 hours, **M** = half a day to a day, **L** = more than a day.

### Before upgrades

**Lint and config**

1. Add the §8 Biome override (corrected paths) and `tools/lint/no-serial-mode.grit`. Add `noPlaywrightMissingAwait: error` and `noPlaywrightNetworkidle: warn`. The 25 waits and 4 serial blocks then fail lint, so do this together with item 7 or with an interim `warn`. (S)
2. Admin `playwright.config.ts`: `forbidOnly: !!process.env.CI` and `trace: 'retain-on-failure'`. Keep `fullyParallel: false` until item 7. (S)
3. Admin `vitest.config.ts`: `mockReset: true`. Measured in §6: it fixes the four mock-leak files and breaks nothing. `restoreMocks` doesn't fix them. (S)

**Order-dependent tests (no flaky ones to quarantine)**

4. Fix the 8 order-dependent files in §6. Item 3 covers four of them; the other four need local fixes. Add a shuffled run to CI: `vitest run --sequence.shuffle` with a printed seed, as a non-blocking step at first. (S–M)

**Protected tests**

5. Paul signs off the §5 candidates into the guide's §3. Mark the protected files in `scripts/test-diff-summary.sh`. Add pricing invariants: every default model, demo model and embedding model has a price, and `cachedInput <= input` for each. Teach `allowance-coverage` to recognise `agent.generate(`. (S each)

**Upgrade-critical gaps (one PR per step, against current versions)**

6. Write the step 4, 6, 7 and 8 tests in §7, and the step 5 component test. Record any gap left in `dependency-updates.md`, and correct its step 6 note about PDFs in `public/demo/`. Paste §6 into step 0. (Step 6 S–M, step 5 S, step 7 M, step 4 M, step 8 M)

**Admin E2E: stop it passing by skipping**

7. Do this before steps 1, 3 and 10 rely on it:
   - Replace the 53 bare `test.skip()` calls with assertions, or `test.fixme('reason')` for known breakage.
   - Replace the 25 `waitForTimeout` calls with web-first assertions.
   - Fix the tautological assertions.

   The structural rewrite waits until after the upgrades. Running it in CI also has to wait: it needs Postgres and Redis service containers, and a decision on AI calls under `dev:full`, because the real provider is configured. (M)

### During upgrades

- Nothing structural.
- Each step runs the gate plus two shuffled Vitest runs, with the seeds printed in the PR, and `--repeat-each=3` for the website E2E on steps 5 and 9.
- Compare durations and coverage with §6.
- Protected tests change only with sign-off (T-PROT-1).
- Any behaviour change that passes the tests gets noted for the next audit, not patched in the step.

### After upgrades

| Item | Rules | Effort |
|---|---|---|
| Replace the 23–33 fake-DB route tests with PGlite route tests (TEST_AUDIT.md's REWRITE LATER list), starting with user isolation and `inbox/[id]/approve` | T-MOCK-3, T-MOCK-4, T-LAYER-4, T-FIX-1 | L |
| Shared helpers: `a/test/pglite.ts` (`test.extend` fixture with a fresh DB and a user), `a/test/auth.ts`, typed DB factories from `$inferInsert` | T-WS-3, T-MOCK-5, T-FIX-1 | M |
| Admin E2E rewrite: a second setup project that signs in an admin (from `db:seed-admin`) and saves its own `storageState` for the admin-only specs (backups, settings changes), plus fixtures that create and delete through the API with `workerIndex` names, role and label locators (and accessible names for icon buttons), no serial chains, then `fullyParallel: true` | T-DATA-2…5, T-LOC-1, T-FIX-2, T-CFG-1 | L |
| Admin E2E in CI: Postgres + Redis service containers, a faked AI provider or a capped key, on admin-portal PRs and nightly; flaky report in the job summary | §9 CI, T-CI-2 | M |
| Move `error-states.spec.ts` API cases and the duplicate auth validation into Vitest; add route tests for `/api/search` and export, then cut those specs to one journey each | T-LAYER-1…3 | M |
| Vitest projects (`unit`, `integration`, `driver`) and a nightly driver run including `FLOW_DRIVERS=postgres` | T-VIT-2 | S |
| Catalog `@testing-library/*`, `jsdom` and `@axe-core/playwright`; pin `playwright` and `@playwright/test` exactly | T-WS-4, T-WS-5 | S |
| Titles: drop the 193 `TC-` prefixes, rename the implementation-style titles, fix 9 US spellings; split the 11 Vitest `if`s with `test.each` or `toMatchObject` | T-HYG-2, T-HYG-5, T-HYG-6 | S |
| Real-timer sleeps → fake timers or `vi.waitFor` | T-WAIT-5 | S |
| Component tests for `@repo/ui` and admin client components (the AI-edit diff, inbox cards) | Pyramid | M |

---

## 9. Edits made to `testauditinstruct.md`

No rule's text or intent changed. Every edit corrects a path, location or list to match the repo.

1. **Intro (line 3).** `admin-portal` → `apps/admin-portal`, and NX 23 named as the task runner.
2. **Intro (line 7).** "the first audit should correct it" → a note that this audit corrected the guide on 2026-10-16 against `425d3f4`, with the rules unchanged.
3. **§2 layer table, "Lives in" and "Runs" columns.**
   - Real colocated paths for unit tests.
   - Component tests exist only in the website (admin and `@repo/ui` have none).
   - Integration tests are colocated PGlite files plus `apps/admin-portal/test/` (with `fake-ai.ts` and `fixtures/`).
   - Driver integration is gated by env vars, not a tag: the Redis halves of the two `contract.test.ts` files run on every PR in CI, and `FLOW_DRIVERS=postgres` runs by hand only.
   - E2E folders are `apps/website/e2e/` and `apps/admin-portal/e2e/`.
   - Admin E2E is not in CI yet (the target stays "PRs touching admin-portal, nightly").
4. **§3 table.** Real file paths for the four protected tests, and where `db:check-fresh` lives and runs. Same four entries.
5. **§4 table, "Area" column and one coverage cell.**
   - Real paths for the AI, Mastra (`lib/agents/mastra/`, `lib/agents/queue/`) and streaming route files.
   - pdf-parse also lists `next.config.ts`. "the real PDFs in `public/demo/`" became "real PDFs", with a note that the repo has none and fixtures go in `apps/admin-portal/test/fixtures/`.
   - BullMQ names the workers that bypass `JobQueue` (feeds, backups, research). The note says `lib/queue/contract.test.ts` is the two-driver suite for `JobQueue`, and that the BullMQ-only workers need their own Redis tests (the required coverage is the same).
   - Vite 8 and react-markdown name the real files, and note that `<ReactMarkdown>` has no plugins or custom components.
6. **§7 journeys.** Replaced the draft with the journeys the apps actually have, each naming the spec that covers it or saying it isn't covered.
   - Website: navigation, axe, Writing, assessment, contact.
   - Admin: auth, workspaces, sections and versions, AI on a workspace, inbox, documents, search and export, knowledge base, backups, feeds, research agents, allowance refusal, demo mode.
   - Notes that the UI has no AI-usage display.
   - Lists the three specs outside the list.
7. **§8 Biome.**
   - `includes` corrected to `["apps/website/e2e/**", "apps/admin-portal/e2e/**"]`.
   - Notes that every rule name and `plugins`-in-`overrides` was checked against Biome 2.4.4's schema and trialled.
   - Describes what #18 already set. The snippet keeps `noFocusedTests: "error"`, which also covers `auth.setup.ts` and `a11y.ts`, the files base.json's `*.test`/`*.spec` pattern misses. `noSkippedTests: "warn"` was dropped from the snippet: repeating it would have lowered the website e2e folder from `error` to `warn`, and the admin folder already has it at `warn`.
   - Notes that `tools/lint/` is a new folder, and that the grit pattern matches single-quoted `'serial'`.

**Outside my remit, to correct in `dependency-updates.md`:** step 6 "Test with real PDFs from `public/demo/`". No PDFs exist there, and demo mode refuses PDF uploads, so the step needs committed fixtures and a non-demo run.
