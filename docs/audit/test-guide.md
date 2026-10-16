# Test architecture guide

The standard for how tests are structured, written and run in this repo. It covers both apps (`apps/website` and `apps/admin-portal`) and the shared packages, in a pnpm workspace with a catalog, NX 23 as the task runner, Vitest 5, Playwright and Biome.

It is also the checklist for test audits. Rules carry IDs so audits and PR reviews can cite them. **MUST** rules are required. **SHOULD** rules are the default unless a comment or PR explains the exception.

Written 2026-10-16. Paths, layer locations, §4 areas and the §7 journeys were corrected against the repo by the first audit the same day (`origin/main` at `425d3f4`; see `test-audit-report.md`). The rules themselves are unchanged.

---

## 1. Principles

- **The tests are the upgrade gate.** `docs/audit/dependency-updates.md` relies on them to say whether an upgrade is safe. A weak or flaky test is a hole in that gate.
- **Pyramid, not ice-cream cone.** Most coverage lives in fast Vitest tests. Playwright covers critical journeys only.
- **Deterministic by default.** Tests don't call real AI providers, real Redis or external services unless they are explicitly tagged to.
- **Parallel by default.** Any test must be able to run alongside any other, in any order, on any worker.
- **Lean.** No arbitrary waits, no UI-driven setup, no coverage duplicated across layers.

---

## 2. Test layers

| Layer | Tool | Lives in | Covers | Runs |
|---|---|---|---|---|
| Unit | Vitest | Colocated `*.test.ts` (admin-portal: `lib/**`, `app/api/**/route.test.ts`, `middleware.test.ts`; website: `src/**`) | Pure logic: AI guard and pricing, parsers, validation (zod schemas), auth helpers (jose), utilities | Every PR (`pnpm test`; the `check` job in `.github/workflows/ci.yml`) |
| Component | Vitest + Testing Library (jsdom) | Colocated `*.test.tsx` (website only today, e.g. `src/hooks/useAssessment.test.tsx`; admin-portal and `@repo/ui` have none) | React components in isolation: states, roles, user events | Every PR |
| Integration | Vitest | Colocated (the files that start PGlite: `lib/db/pglite.test.ts`, `lib/queue/recover.test.ts`, `lib/auth/access-user.test.ts`…) or `apps/admin-portal/test/` (`document-flow.integration.test.ts`, with the shared `test/fake-ai.ts` and `test/fixtures/`) | Database queries against PGlite, the `JobQueue` memory driver, route handlers and server actions called directly, Mastra tools with mocked models | Every PR |
| Driver integration | Vitest, gated by env vars rather than a tag | The Redis halves of `lib/queue/contract.test.ts` and `lib/rate-limit/contract.test.ts` (`TEST_REDIS_URL`); `test/document-flow.integration.test.ts` with `FLOW_DRIVERS=postgres` (`TEST_DATABASE_URL` + `TEST_REDIS_URL`) | The BullMQ `JobQueue` driver against real Redis, real Postgres where PGlite differs | Redis halves: every PR (CI's `check` job has a Redis service). Postgres flow: by hand only |
| E2E: website | Playwright + axe | `apps/website/e2e/` (`*.spec.ts`, helper `a11y.ts`) | Public pages, Writing pages, navigation, accessibility | Every PR (the `website-e2e` job; `nx affected` makes it a no-op when the website isn't affected) |
| E2E: admin | Playwright | `apps/admin-portal/e2e/` (`*.spec.ts`, `auth.setup.ts`) | Critical admin journeys (§7), full stack | Not in CI yet (needs Postgres + Redis); locally against `dev:full`. Target: PRs touching admin-portal, nightly |
| AI smoke | `pnpm with-dev-env pnpm ai:smoke` | Script | One real call per provider | Manually, and in upgrade steps touching AI |

- **T-LAYER-1 (MUST):** Logic that can be tested in Vitest MUST NOT be tested only through Playwright.
- **T-LAYER-2 (MUST):** Every E2E spec MUST map to a journey in §7. Edge cases and validation permutations belong in unit or component tests.
- **T-LAYER-3 (SHOULD):** A behaviour SHOULD be asserted in one layer only. Higher layers prove the wiring, not every branch.
- **T-LAYER-4 (SHOULD):** Next.js route handlers and server actions SHOULD be tested by calling them directly in Vitest. E2E proves they're reachable, not their logic.

---

## 3. Protected tests

Some tests guard money, data or security. Their assertions change only with Paul's explicit sign-off in the PR, never to get an upgrade or refactor green.

| Test | Guards |
|---|---|
| `apps/admin-portal/lib/ai/allowance-coverage.test.ts` | Every AI call path is covered by an allowance |
| `apps/admin-portal/lib/ai/guard.test.ts` | Token caps and spend accounting |
| `apps/admin-portal/lib/ai/pricing.test.ts` | Cost calculation per model |
| `db:check-fresh` (`apps/admin-portal/scripts/db/check-fresh-db.ts` + `expected-schema.ts`; CI job `admin-db`) | Migrations match the schema |

- **T-PROT-1 (MUST):** A PR that changes an assertion, removes a case, adds a mock or adds a skip in a protected test MUST say so in its description and request review.
- **T-PROT-2 (SHOULD):** Add new money, data-loss or security invariants to this table when they're written. Audits should propose candidates.

---

## 4. Upgrade-critical coverage

The dependency plan's high-risk steps depend on these areas being well tested **before** the upgrade starts. If coverage is thin, add tests first in their own PR, against the current version, so the upgrade PR is judged by tests that already passed.

| Dependency step | Area | Coverage needed |
|---|---|---|
| 4 Mastra, 8 AI SDK | `apps/admin-portal/lib/ai/guard.ts`, `lib/ai/pricing.ts`, `lib/ai/providers.ts`; Mastra in `lib/agents/mastra/` (`provider.ts`, `agents/create.ts`, `tools/*.ts`) and the workers that call `agent.generate()` in `lib/agents/queue/*-queue.ts`; the streaming route `app/api/chat/unified/route.ts` | Guard and pricing invariants (protected). Tools tested with the AI SDK's mock language models. Streaming and tool-call shapes asserted, since these change between AI SDK majors. |
| 6 pdf-parse | `apps/admin-portal/lib/document-processing/parsers/pdf.ts`, `upload-validation.ts`, Mastra `lib/agents/mastra/tools/file-parser.ts`, `next.config.ts` (`serverExternalPackages`) | Golden-output tests using real PDFs: extracted text (or a normalised hash), page count, and rejection of invalid or oversized files. The repo has no PDF yet (`public/demo/` holds Markdown only), so the first test PR commits small fixtures under `apps/admin-portal/test/fixtures/`. |
| 7 BullMQ + ioredis | `apps/admin-portal/lib/redis.ts`, `JobQueue` (`lib/queue/bullmq.ts` and `in-process.ts`), and the BullMQ-only workers that bypass `JobQueue`: feeds (`lib/feeds/queue.ts`, `worker.ts`), backups (`lib/db/backup-worker.ts`), research agents (`lib/agents/queue/`) | One shared contract suite that runs against both drivers: enqueue, process, retry, failure, completion events (`lib/queue/contract.test.ts` is that suite for `JobQueue`). Covers document processing and routing through `JobQueue`; feeds, backups and research jobs (repeatable jobs, pub/sub) need their own tests against real Redis. |
| 9 Vite 8 | Website build (`apps/website`: `vite.config.ts`, `wrangler.jsonc`, `dist/client`) | Website E2E + axe, `deploy:dry-run`, recorded bundle sizes to compare. |
| 5 react-markdown | Website Writing pages (`apps/website/src/components/sections/posts/PostDetail.tsx`, posts from `content/posts/*.md` via `scripts/build-posts.mjs` and `server/index.ts`) | Rendered-output tests for headings, links, lists, code blocks and any custom components or plugins (none today: `<ReactMarkdown>` runs with defaults). |

- **T-UPG-1 (MUST):** Before starting dependency steps 4, 6, 7, 8 or 9, the areas above MUST meet the coverage listed, or the gap MUST be recorded in the step's row in `dependency-updates.md`.

---

## 5. Workspace and runner setup

- **T-WS-1 (MUST):** Each app's tests run from its own `package.json` scripts, and `pnpm test` at the root runs every workspace's unit and integration tests.
- **T-WS-2 (SHOULD):** CI SHOULD run only the affected workspaces (the task runner's affected mode, or `pnpm --filter "...[origin/main]"`).
- **T-WS-3 (SHOULD):** Shared test helpers (factories, PGlite setup, mock models, render helpers) SHOULD live in one shared package or one folder per app, not be copied between files.
- **T-WS-4 (MUST):** Test-only dependencies MUST be `devDependencies`, and shared ones (`vitest`, `@playwright/test`, `@testing-library/*`) MUST come from the catalog.
- **T-WS-5 (MUST):** `playwright` and `@playwright/test` MUST be the same exact version.

### Playwright configuration

- **T-CFG-1 (MUST):** `fullyParallel: true`.
- **T-CFG-2 (MUST):** Admin authentication MUST use a `setup` project that writes `storageState`. Tests MUST NOT log in through the UI individually, except a dedicated login journey test.
- **T-CFG-3 (MUST):** `retries` is `0` locally and at most `2` in CI.
- **T-CFG-4 (MUST):** `trace: 'on-first-retry'` (or `retain-on-failure`). Screenshots and video on failure only.
- **T-CFG-5 (MUST):** `forbidOnly: !!process.env.CI`.
- **T-CFG-6 (SHOULD):** The website E2E SHOULD run against a production build (`vite preview` or equivalent), not the dev server.
- **T-CFG-7 (SHOULD):** `baseURL` and environment values come from environment variables, not literals in specs.

### Vitest configuration

- **T-VIT-1 (MUST):** Tests run in parallel by default. Any file-level `sequential` or single-thread setting MUST have a comment saying why.
- **T-VIT-2 (SHOULD):** Unit, integration and driver-integration tests SHOULD be separable (Vitest projects, or file naming plus include patterns) so CI can run them on different triggers.

---

## 6. Writing tests

### 6.1 Fixtures over shared state

- **T-FIX-1 (MUST):** Shared setup is provided through Playwright `test.extend` fixtures or Vitest `test.extend` / setup helpers, not `beforeAll` blocks that reassign module-level variables.
- **T-FIX-2 (MUST):** Page or component objects are thin: locators plus intent-level actions. No assertions hidden inside them, and no deep inheritance chains.

### 6.2 Locators and waiting (Playwright)

- **T-LOC-1 (MUST):** Use `getByRole`, `getByLabel`, `getByText` or `getByTestId`. No CSS or XPath selectors tied to layout or Tailwind classes.
- **T-LOC-2 (MUST):** Test IDs are static string literals, unique within their component.
- **T-WAIT-1 (MUST):** No `page.waitForTimeout()`.
- **T-WAIT-2 (MUST):** No `page.waitForSelector()`. Use locator actions and web-first assertions, which wait automatically.
- **T-WAIT-3 (MUST):** No `{ force: true }`.
- **T-WAIT-4 (MUST):** Every Playwright promise is awaited.
- **T-WAIT-5 (MUST):** Vitest tests don't use real timers with `setTimeout` sleeps to wait for async work. Use fake timers, `vi.waitFor`, or await the actual promise.

### 6.3 Data and isolation

- **T-DATA-1 (MUST):** Each Vitest worker gets its own database: a fresh PGlite instance per file or worker (with pgvector loaded where needed), or a transaction rolled back after each test. No test depends on rows another test created.
- **T-DATA-2 (MUST):** Admin E2E creates its own data through the API, a seed helper or direct DB calls inside a fixture, and cleans it up in that fixture's teardown. No reliance on shared pre-seeded records beyond the base demo seed.
- **T-DATA-3 (MUST):** Created records use unique names (including `testInfo.workerIndex` or a random suffix) so parallel workers never collide.
- **T-DATA-4 (MUST):** Setup isn't done by clicking through the UI when an API, action or DB helper exists for it.
- **T-DATA-5 (MUST NOT):** `test.describe.serial`, `test.describe.configure({ mode: 'serial' })` or `workers: 1` is not used without an inline comment explaining why the journey is inherently sequential.
- **T-DATA-6 (MUST):** No shared mutable state between tests: no module-level `let` reassigned in hooks, no order-dependent tests.

### 6.4 Mocking and external services

- **T-MOCK-1 (MUST):** No test calls a real AI provider except `ai:smoke` and tests explicitly tagged for it. Use the AI SDK's mock language models from its test utilities, not hand-written fakes of SDK internals.
- **T-MOCK-2 (MUST):** Queue work in unit and integration tests uses the `JobQueue` memory driver. Real Redis is used only in driver-integration tests.
- **T-MOCK-3 (MUST):** Mock at boundaries: the model, the queue driver, the network (`page.route` or MSW), the clock. Don't mock the module under test or its internal helpers.
- **T-MOCK-4 (MUST):** Mock payloads are typed against the real types (zod schemas, Drizzle inferred types, AI SDK types), so an API or schema change breaks the build instead of passing silently.
- **T-MOCK-5 (SHOULD):** A mock that's needed in more than two files SHOULD move to the shared helpers.

### 6.5 Snapshots

- **T-SNAP-1 (MUST):** Snapshots (`toMatchSnapshot`, `toMatchInlineSnapshot`, Playwright screenshots) are never regenerated with `-u` or `--update-snapshots` to get a failing build green. An updated snapshot needs a sentence in the PR explaining why the new output is correct.
- **T-SNAP-2 (SHOULD):** Prefer explicit assertions over large snapshots. A snapshot SHOULD be small enough to review in a diff.

### 6.6 Hygiene

- **T-HYG-1 (MUST):** No committed `test.only`, `describe.only`, `page.pause()` or `page.$eval()`.
- **T-HYG-2 (SHOULD):** No `if`/`switch` inside test bodies. Split the test or parameterise it (`test.each`).
- **T-HYG-3 (SHOULD):** No commented-out tests. Delete them, or use `test.fixme` with a reason.
- **T-HYG-4 (MUST):** Every `skip`, `todo` or `fixme` carries a reason.
- **T-HYG-5 (SHOULD):** Test titles describe behaviour ("rejects a PDF over the size limit"), not implementation.
- **T-HYG-6 (MUST):** Comments, titles and docs use Australian spelling.

---

## 7. Critical journeys

E2E coverage is limited to these journeys. An E2E spec outside this list needs a sentence of justification in its PR. The list was rewritten by the first audit (2026-10-16) from the routes the apps actually have. The bracket after each journey names the spec that covers it today, or says it isn't covered.

**Website** (`apps/website/e2e/`)

- Home and main navigation: nav links, Back/Forward, deep links, old hash URLs, the not-found pages and the mobile menu (`navigation.spec.ts`)
- Every public page, a Writing post, the not-found page, the filled-in assessment and the open mobile menu have no serious or critical axe violations (`accessibility.spec.ts`)
- Writing: the index lists posts, and a post opens from the list and from a deep link (`navigation.spec.ts`; the rendered post body isn't asserted)
- Assessment: quick and detailed paths produce a score and a plan, work by keyboard alone, keep answers across navigation, and download (print dialog) and restart (`assessment.spec.ts`)
- Contact: labelled fields, required-field blocking, and submit opens the email client (`contact.spec.ts`)

**Admin portal** (`apps/admin-portal/e2e/`)

- Sign up, sign in, sign out, and a redirect to `/login` when signed out (`auth.spec.ts`). Session expiry: not covered. Admin-only pages (`/settings`, `/backups`) refusing a `member`: not covered
- Workspaces: create from a template, archive, delete (`workspace-crud.spec.ts`, `workspaces.spec.ts`)
- Sections: add, edit, version history and restore (`section-management.spec.ts`, `version-history.spec.ts`)
- AI on a workspace (under `dev:full` these call the provider configured in `.env.docker`): inline edit with diff, accept or reject (`ai-inline-editing.spec.ts`); chat panel (`workspace-chat.spec.ts`); gap analysis and "Fix with AI" (`gap-analysis.spec.ts`)
- Inbox: upload a file or add a note, see it processed and routed, then approve or dismiss (`document-upload.spec.ts`, `inbox.spec.ts`, `inbox-workflow.spec.ts`)
- Documents: list, filter and act on a document (`document-actions.spec.ts`)
- Search and export a workspace (`search.spec.ts`, `workspace-export.spec.ts`)
- Knowledge base: create and delete (`knowledge-base.spec.ts`)
- Backups, admin only: trigger and download. `backups.spec.ts` exists but runs as the `member` that `auth.setup.ts` signs up, so with auth on it can't reach `/backups` (`requireAdmin()` redirects); it needs an admin `storageState`. Needs `pg_dump` 15+
- Feeds: add, refresh, view. Not covered; runs only under `dev:full` (BullMQ)
- Research agents: run one and see the result. Not covered; runs only under `dev:full` (BullMQ)
- AI allowance refusal: an AI action refused by the rate limit or budget shows its error. Not covered; the UI has no usage display, so the guard and allowance Vitest tests carry this
- Demo mode: a Cloudflare Access visitor lands on the seeded demo, and switched-off features return 404. Not covered in E2E (the middleware and demo-seed Vitest tests cover the logic)

Specs outside this list today: `error-states.spec.ts` (API validation permutations, which belong in Vitest per T-LAYER-2), `guide.spec.ts` and `settings.spec.ts` (static page renders).

---

## 8. Linting

Biome (pinned at 2.4.4 in CLAUDE.md) runs on all test files. Biome's Playwright rules have existed since 2.4.2, in the nursery group, so they can be enabled on the current version. Their default severity is information only, so set them to `error`. (Checked 2026-10-16 against the installed 2.4.4: every rule name below is in its `configuration_schema.json`, and `plugins` is allowed inside `overrides`. A trial run on copies of both e2e folders flagged 25 `waitForTimeout` calls and 4 serial blocks, as expected.)

What's already in place (#18): `packages/biome-config/base.json` sets `noFocusedTests` and `noSkippedTests` to `error` for `**/*.test.ts(x)` and `**/*.spec.ts(x)`, and the root `biome.json` lowers `noSkippedTests` to `warn` for `apps/admin-portal/e2e/**` until its bare `test.skip()` calls are fixed. Add the override below to the root `biome.json` after that one. Overrides apply in order, so it must not set `noSkippedTests` back to `warn` for the website e2e folder, where it is an error today.

```jsonc
{
  "overrides": [
    {
      // The repo's two Playwright folders. auth.setup.ts in the admin folder is matched too
      "includes": ["apps/website/e2e/**", "apps/admin-portal/e2e/**"],
      "linter": {
        "rules": {
          // noSkippedTests is already set (error in base.json, warn for admin e2e); don't
          // repeat it here. noFocusedTests also covers auth.setup.ts and a11y.ts
          "suspicious": { "noFocusedTests": "error" },
          "nursery": {
            "noPlaywrightWaitForTimeout": "error",
            "noPlaywrightWaitForSelector": "error",
            "noPlaywrightForceOption": "error",
            "noPlaywrightPagePause": "error",
            "noPlaywrightEval": "error"
          }
        }
      },
      "plugins": ["./tools/lint/no-serial-mode.grit"]
    }
  ]
}
```

`tools/lint/no-serial-mode.grit` (a new file at the repo root; `tools/` doesn't exist yet). The double-quoted `"serial"` also matches the single-quoted `'serial'` the specs use:

```grit
language js
or {
  `test.describe.serial($args)`,
  `test.describe.configure({ mode: "serial" })`
} as $call where {
  register_diagnostic(span = $call, message = "Serial mode blocks parallel workers. See T-DATA-5.")
}
```

- **T-LINT-1 (MUST):** Biome runs in CI over test files with the overrides above.
- **T-LINT-2 (SHOULD):** Check these nursery rule names when upgrading Biome (dependency step 2). Nursery rules can be renamed or promoted.

---

## 9. CI

1. **PR:** lint, `check-types`, unit + component + integration (affected workspaces), website E2E when the website is affected.
2. **PR touching admin-portal:** add admin E2E, and driver integration if the change touches queues or Redis.
3. **Nightly:** everything, including driver integration and admin E2E, with a flaky report.
4. **Upgrade PRs:** the full gate from `dependency-updates.md` Part 1.

- **T-CI-1 (MUST):** PR pipelines don't depend on a shared long-lived environment.
- **T-CI-2 (SHOULD):** Retried-then-passed tests are reported, not hidden.
- **T-CI-3 (SHOULD):** Record unit and E2E durations at baseline (dependency step 0) so regressions are visible.

---

## 10. Definition of done for a test change

- [ ] Lowest possible layer chosen
- [ ] No arbitrary waits, forced actions or committed debug calls
- [ ] Passes in parallel and repeated (`--repeat-each=3` for Playwright, `--sequence.shuffle` for Vitest)
- [ ] Data created and cleaned up via fixtures, uniquely named
- [ ] No real AI provider or Redis outside tagged tests
- [ ] Mocks typed against real types
- [ ] No protected test weakened, and no snapshot regenerated without explanation
- [ ] Biome passes