# Testing

| Layer         | Tool                                                                | Website                                                              | Admin portal                          |
| ------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------- |
| Unit          | [Vitest](https://vitest.dev/)                                       | 52 tests (jsdom + Testing Library)                                   | 1042 tests (node)                     |
| E2E           | [Playwright](https://playwright.dev/)                               | 32 tests × 2 viewports (2 mobile-only), against the production build | 19 spec files, needs Postgres + Redis |
| Accessibility | [`@axe-core/playwright`](https://github.com/dequelabs/axe-core-npm) | Every page and key UI state, WCAG 2.1 A/AA                           | Not yet                               |
| Lint          | [Biome](https://biomejs.dev/)                                       | Includes the a11y rule group                                         | a11y rules off (planned)              |

CI (`.github/workflows/ci.yml`) runs lint, type-check, unit tests and build on every pull request and push to `main`, plus two parallel jobs: the website E2E suite, and **Admin DB**, which builds a fresh PGlite database from the migrations and smoke-tests it (`pnpm db:check-fresh`). The unit-test step has a Redis service so the BullMQ and Redis contract runs (below) execute too. Admin-portal E2E isn't in CI yet because it needs database services.

## Quick start

```bash
pnpm test                               # all unit tests, via NX
pnpm --filter website test              # website unit tests only
pnpm --filter website test:e2e          # website E2E + axe (builds, then serves with wrangler dev)
pnpm --filter admin-portal test:e2e     # admin E2E (needs the admin dev stack running)
pnpm exec nx run-many -t test --skip-nx-cache   # ignore the NX cache
```

## Website

### Unit tests (`apps/website/src/**/*.test.ts(x)`)

Run in jsdom (`vitest.config.ts`) so hooks and components can render.

| File                                 | What it covers                                                                                                                                                                                                                                            |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/assessment-content.test.ts` | Scoring: level boundaries (and that they match the ranges shown to users), dimension scores, null states, maturity-only scores, star ratings overriding maturity, dimension weighting, recommendation caps and ordering, industry benchmarks, determinism |
| `src/hooks/useAssessment.test.tsx`   | The assessment hook with its provider: results appear once inputs are complete, patches merge, ratings rescore, restart clears and scrolls, answers survive the page unmounting, clear error outside the provider                                         |
| `src/lib/legacy-hash.test.ts`        | Old `/#section` URLs map to the new paths; in-page anchors like `#main` are left alone                                                                                                                                                                    |
| `src/lib/mailto.test.ts`             | The contact form's `mailto:` URL: recipient, subject, body layout, optional company, encoding                                                                                                                                                             |

### E2E tests (`apps/website/e2e/*.spec.ts`)

`playwright.config.ts` builds the site and serves it with `wrangler dev` (Cloudflare's `workerd` runtime). The tests therefore exercise the real Worker API, the SPA deep-link fallback and the `_headers` file, with no database or secrets. Every test runs on a desktop viewport and on a Pixel 7.

| File                    | What it covers                                                                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `navigation.spec.ts`    | Nav links, page titles, focus moving to the new `h1`, `aria-current`, Back/Forward, deep links to every page and a post, not-found pages, legacy hash redirects, project cards, mobile menu state |
| `assessment.spec.ts`    | Demo banner, quick assessment to results, keyboard-only detailed analysis (switch + star buttons), three-pain-point limit, answers kept across navigation, download (print) and restart           |
| `contact.spec.ts`       | Labelled fields, required-field validation, confirmation and reset                                                                                                                                |
| `accessibility.spec.ts` | axe on every page, a post, the 404, the filled-in assessment with all panels open, and the open mobile menu; fails on any serious or critical violation                                           |

The `mailto:` hand-off to the operating system can't be observed from a browser test, so the URL's exact contents are covered by the unit test instead.

**Checking the checks:** the axe test was verified by reintroducing a fixed contrast bug (footer links back to `text-white/40`). It failed and named the rule and elements. Removing the star buttons' names also fails, because role-based locators such as `getByRole('button', { name: '3 of 4' })` stop matching.

## Admin portal

### Unit tests (`apps/admin-portal/**/*.test.ts`)

Co-located with their source files. Pure-function tests need no mocking; modules with external dependencies (DB, AI SDK, env vars) use `vi.mock` / `vi.hoisted`. A selection:

| File                                        | What it covers                                                                                                |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `lib/config.server.test.ts`                 | `loadConfig` + `setNested`: nested key overrides, DB failure fallback, immutability between calls             |
| `lib/settings.test.ts`                      | `getSettings`, `getSetting`, `updateSettings` (insert/upsert/multi-key), with Drizzle mocked via `vi.hoisted` |
| `lib/ai/models.test.ts`                     | Provider selection (Anthropic/OpenAI/Gemini), fallback when a key is missing, log-once behaviour              |
| `lib/gap-analysis/check-rules.test.ts`      | Rule engine: min_length, required_headings, min_items, severity levels, unknown rule types                    |
| `lib/workspaces/completeness.test.ts`       | Workspace completeness scoring across rule combinations                                                       |
| `lib/workspaces/section-tree.test.ts`       | Section nesting depth and cycle checks, with trees built from `MAX_SECTION_DEPTH`                             |
| `lib/document-processing/cleaner.test.ts`   | Header/footer stripping, page numbers, whitespace normalisation                                               |
| `lib/rag/chunker.test.ts`                   | Section splitting, code/table preservation, overlap                                                           |
| `lib/document-processing/parsers/*.test.ts` | Parser routing by MIME type and extension; CSV, text, markdown and other parsers                              |
| `app/api/**/route.test.ts`                  | API routes (29 files), e.g. sections CRUD including slug de-duplication, AI rule suggestions                  |

### Drivers: contract and integration tests

The admin portal runs on two sets of backends: Postgres + BullMQ + Redis (dev, the default) and PGlite + in-process queues (the single-instance demo). These tests keep the two interchangeable:

| File                                     | What it covers                                                                                                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `lib/queue/contract.test.ts`             | One behaviour suite for both `JobQueue` drivers: data and attempt numbers, retries with backoff, giving up, `discard()`, job-id deduplication, concurrency, `drained()`, `close()`   |
| `lib/rate-limit/contract.test.ts`        | One suite for both `RateLimiter` drivers: limits, separate keys, the sliding window, reset                                                                                           |
| `lib/db/pglite.test.ts`                  | The real PGlite driver built from `drizzle/`, through the lazy `db` proxy: query builder, `db.query`, transactions                                                                   |
| `lib/queue/recover.test.ts`              | On boot with in-process queues, interrupted documents and inbox items are queued again, and finished ones aren't                                                                     |
| `lib/redis-free.test.ts`                 | With PGlite + in-process queues, importing the modules that used to connect to Redis, and booting through `instrumentation.ts`, never constructs a Redis connection or BullMQ object |
| `test/document-flow.integration.test.ts` | The inbox flow through the real route handlers, workers and database: upload, parse, chunk, embed, analyse, route, then search                                                       |

The memory runs always happen. The BullMQ and Redis runs need a Redis to talk to, and are skipped (shown as skipped) without one:

```bash
TEST_REDIS_URL=redis://localhost:6379 pnpm --filter admin-portal test
```

The integration test fakes only the AI models and the signed-in user. `test/fake-ai.ts` has a deterministic bag-of-words embedding and a chat model that answers `generateObject` with the smallest object the requested JSON schema allows; tests inject them with `vi.mock('@/lib/ai/models')`, so the app has no fake provider to select. By default the test runs on PGlite with in-process queues. To run the same flow on the dev backends, point it at an empty throwaway database:

```bash
FLOW_DRIVERS=postgres TEST_DATABASE_URL=postgres://… TEST_REDIS_URL=redis://… \
  pnpm --filter admin-portal exec vitest run test/document-flow.integration.test.ts
```

### Demo mode and cost controls

| File                                | What it covers                                                                                                                                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/demo.test.ts`                  | Walks `app/` and fails if any page or API route isn't classified as core or a switched-off feature; segment matching; which routes the demo switches off and keeps                                |
| `lib/auth/access.test.ts`           | Cloudflare Access JWT verification with locally signed tokens: valid, plus wrong audience, wrong issuer, expired, unknown key, `alg: none`, HS256 key confusion, no email, the plain email header |
| `middleware.test.ts`                | Demo mode: 401 without a verified token, 404 for switched-off routes, 403 for settings changes, 500 on missing config; the dev bypass is blocked in production                                    |
| `lib/auth/access-user.test.ts`      | Simultaneous first visits create one member; demo mode never reports an admin                                                                                                                     |
| `lib/ai/guard.test.ts`              | `maxOutputTokens` cap, spend priced and recorded per user, per-user and total daily caps, unattributed calls refused in demo mode, streams and embeddings counted                                 |
| `lib/ai/allowance-coverage.test.ts` | From the import graph: every API route that can start AI work calls `requireAiAllowance`                                                                                                          |
| `lib/ai/config-check.test.ts`       | Provider, model family and key line up; demo mode needs OpenAI and a priced model                                                                                                                 |
| `lib/startup-checks.test.ts`        | The configurations that stop the server at start-up                                                                                                                                               |
| `app/api/inbox/route.test.ts`       | Demo uploads: URLs refused, PDFs refused, Markdown accepted, oversized bodies refused before they are read                                                                                        |

### E2E tests (`apps/admin-portal/e2e/*.spec.ts`)

These need the admin dev stack (`cd apps/admin-portal && docker compose up -d`). `playwright.config.ts` targets `http://localhost:3001` and starts `pnpm dev` if nothing is running. Selected specs:

| File                           | What it covers                                              |
| ------------------------------ | ----------------------------------------------------------- |
| `e2e/workspaces.spec.ts`       | Workspace list, create from template, view sections, search |
| `e2e/inbox.spec.ts`            | Inbox page, file upload drop zone, dismiss items            |
| `e2e/inbox-workflow.spec.ts`   | Inbox approval flow, suggestion routing                     |
| `e2e/document-actions.spec.ts` | Document archive, delete, reprocess, re-clean, AI cleanup   |
| `e2e/gap-analysis.spec.ts`     | Gap analysis detection, "Fix with AI" flows                 |

## Mocking patterns (admin portal)

### Drizzle DB (`vi.hoisted`)

Drizzle's chainable query API (`db.select().from().where().limit()`) needs a mock that returns the right shape at each step. `vi.hoisted()` defines mock state that `vi.mock` factories can see, because those factories are hoisted above all other declarations:

```ts
const { selectResult, mockDb } = vi.hoisted(() => {
  const selectResult = { current: [] as unknown[] };
  const mockDb = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve(selectResult.current)),
        })),
        then: (resolve: (v: unknown) => void) => resolve(selectResult.current),
      })),
    })),
    // insert, update similarly...
  };
  return { selectResult, mockDb };
});

vi.mock("@/lib/db", () => ({ db: mockDb }));
```

When a route runs several queries, return results based on what each query selects, not on call order. Call-order mocks break silently when a new query is added (see `app/api/workspaces/[id]/sections/route.test.ts`).

### Module-level state (`vi.resetModules`)

For modules with top-level state (e.g. `let logged = false` in `models.ts`), call `vi.resetModules()` in `beforeEach` and use a dynamic `import()` in each test to get a fresh module instance:

```ts
beforeEach(() => {
  vi.resetModules();
});

it("uses Anthropic when key is set", async () => {
  process.env.ANTHROPIC_API_KEY = "sk-test";
  const { getModel } = await import("./models");
  getModel(cfg);
});
```

### Environment variables

Save and restore `process.env` around tests that change it:

```ts
const originalEnv = { ...process.env };
afterEach(() => {
  process.env = { ...originalEnv };
});
```
