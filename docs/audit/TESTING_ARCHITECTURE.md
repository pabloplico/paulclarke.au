# Test Architecture Guide

This guide sets the standard for how tests are structured, written and run in this repository. It applies to all apps and libraries in the Nx monorepo (Vue 3, TypeScript, Vite, TanStack, Vitest, Playwright, Biome).

Rules are tagged with IDs so reviews and audits can reference them. **MUST** rules are required. **SHOULD** rules are the default unless there is a documented reason to deviate.

---

## 1. Principles

- **Pyramid, not ice-cream cone.** Most coverage lives in fast Vitest tests. Playwright E2E covers critical customer journeys only.
- **Deterministic by default.** PR pipelines run against typed mocks. Real backends are touched only by a small, tagged smoke layer.
- **Parallel by default.** Every test must be able to run alongside any other test, in any order, on any worker.
- **Lean.** No arbitrary waits, no UI-driven setup, no duplicated coverage across layers.
- **Scales with the monorepo.** CI time should stay roughly flat as projects are added, through `nx affected` and task distribution.

---

## 2. Test layers

| Layer | Tool | Lives in | Covers | Runs |
|---|---|---|---|---|
| Unit | Vitest | Colocated `*.spec.ts` next to source | Pure logic, composables, validators (VLAN, ASN, speed tiers, pricing), stores, TanStack Query hooks with mocked fetch | Every PR, affected only |
| Component | Vitest (Vue Test Utils or browser mode) | Colocated `*.spec.ts` | Design-system and feature components in isolation: props, emits, slots, states, a11y roles | Every PR, affected only |
| API / contract | Playwright `request` (or Postman/Newman) | `apps/*-e2e/tests/api/` or a dedicated `*-api-tests` project | Response shapes, status codes, auth, error contracts the UI depends on | Every PR against mocks or ephemeral env; nightly against staging |
| E2E (mocked) | Playwright | `apps/*-e2e/tests/` | Critical user journeys through the real UI with network stubbed at the boundary | Every PR, affected only |
| E2E (smoke) | Playwright, tagged `@smoke` | `apps/*-e2e/tests/smoke/` | A thin set of journeys against a real environment | Post-deploy and nightly |

- **T-LAYER-1 (MUST):** Logic that can be tested in Vitest MUST NOT be tested only through Playwright.
- **T-LAYER-2 (MUST):** Each E2E spec MUST map to a named critical journey (see §6). Edge cases and validation permutations belong in unit or component tests.
- **T-LAYER-3 (SHOULD):** Any single behaviour SHOULD be asserted in one layer only. Higher layers prove wiring, not every branch.

---

## 3. Nx structure

```
apps/
  portal/                     # Vue app, colocated *.spec.ts (Vitest)
  portal-e2e/
    fixtures/                 # test.extend: api client, auth, data factories, mocks
    components/               # thin component objects
    mocks/                    # typed API stubs (shared with Vitest/MSW)
    tests/
      <journey>/*.spec.ts     # mocked E2E, grouped by journey
      api/                    # API/contract tests
      smoke/                  # @smoke, real environment
    playwright.config.ts
libs/
  api-types/                  # shared API types used by app, mocks and tests
  test-utils/                 # shared factories, builders, render helpers
```

- **T-NX-1 (MUST):** Each deployable app with a UI MUST have a sibling `<app>-e2e` project using `@nx/playwright`.
- **T-NX-2 (MUST):** CI MUST run tests through `nx affected` (for example `nx affected -t test e2e`), not by running every project.
- **T-NX-3 (SHOULD):** E2E SHOULD use the `@nx/playwright` plugin's atomized CI target (for example `e2e-ci`) so each spec file becomes its own cacheable, distributable task.
- **T-NX-4 (MUST):** Test projects MUST declare correct `implicitDependencies` or import real libs so the affected graph includes them when their app changes.
- **T-NX-5 (SHOULD):** Shared test helpers SHOULD live in a `libs/test-utils` library, not be copied between e2e projects.

---

## 4. Playwright configuration

- **T-CFG-1 (MUST):** `fullyParallel: true`.
- **T-CFG-2 (MUST):** Authentication MUST use a `setup` project that writes `storageState`, which dependent projects reuse. Tests MUST NOT log in through the UI individually (except a dedicated login journey test).
- **T-CFG-3 (MUST):** `retries` MUST be `0` locally and at most `2` in CI.
- **T-CFG-4 (MUST):** `trace: 'on-first-retry'` (or `retain-on-failure`). Screenshots and video on failure only.
- **T-CFG-5 (MUST):** `forbidOnly: !!process.env.CI`.
- **T-CFG-6 (SHOULD):** `baseURL` and environment-specific values SHOULD come from environment variables, not be hardcoded in specs.
- **T-CFG-7 (SHOULD):** Smoke and mocked suites SHOULD be separate Playwright projects (or selected by `--grep @smoke` / `--grep-invert @smoke`) so they can run on different triggers.
- **T-CFG-8 (SHOULD):** A flaky-test report SHOULD be produced in CI (retried-then-passed tests are surfaced, not hidden).

---

## 5. Writing tests

### 5.1 Fixtures over inheritance

- **T-FIX-1 (MUST):** Shared setup MUST be provided through `test.extend` fixtures, not `beforeAll` blocks that mutate module-level variables.
- **T-FIX-2 (MUST):** Page or component objects MUST be thin: locators plus intent-level actions. No assertions hidden inside them, no deep inheritance chains (`BasePage → AuthedPage → PortalPage …`).
- **T-FIX-3 (SHOULD):** Component objects SHOULD mirror real Vue components (`serviceCard`, `orderDrawer`, `vxcForm`) rather than whole pages, so they compose across journeys.

### 5.2 Locators and waiting

- **T-LOC-1 (MUST):** Use `getByRole`, `getByLabel`, `getByText` or `getByTestId`. No CSS or XPath selectors tied to layout or Tailwind classes.
- **T-LOC-2 (MUST):** Test IDs MUST be static string literals in components, unique within their component.
- **T-WAIT-1 (MUST):** No `page.waitForTimeout()`.
- **T-WAIT-2 (MUST):** No `page.waitForSelector()`. Use locator actions and web-first assertions (`await expect(locator).toBeVisible()`), which auto-wait.
- **T-WAIT-3 (MUST):** No `{ force: true }`. Fix the actionability issue instead.
- **T-WAIT-4 (MUST):** Every Playwright promise MUST be awaited.

### 5.3 Data and isolation

- **T-DATA-1 (MUST):** Tests against a real backend MUST create their own data through the API inside a fixture, and clean it up in that fixture's teardown. No reliance on pre-seeded shared records.
- **T-DATA-2 (MUST):** Created resources MUST use unique names (for example including `testInfo.workerIndex` and a random suffix) so parallel workers never collide.
- **T-DATA-3 (MUST):** Setup MUST NOT be performed by clicking through the UI when an API exists for it.
- **T-DATA-4 (MUST):** No shared mutable state between tests: no module-level `let` reassigned in hooks, no order-dependent specs.
- **T-DATA-5 (MUST NOT):** `test.describe.serial`, `test.describe.configure({ mode: 'serial' })` or `workers: 1` MUST NOT be used without an inline comment explaining why the journey is inherently sequential.

### 5.4 Mocking

- **T-MOCK-1 (MUST):** Mocked E2E MUST stub at the network boundary (`page.route` or MSW), not by patching app internals.
- **T-MOCK-2 (MUST):** Mock payloads MUST be typed against `libs/api-types` (or generated API types) so a contract change breaks the build, not silently passes.
- **T-MOCK-3 (SHOULD):** Mock builders SHOULD be shared between Vitest and Playwright.
- **T-MOCK-4 (MUST):** Provisioning flows that would create billable or real network resources (Ports, VXCs, MCRs, cloud connections) MUST be mocked in PR pipelines. Only `@smoke` tests may hit real provisioning, against non-production environments.

### 5.5 Structure and hygiene

- **T-HYG-1 (MUST):** No committed `test.only`, `describe.only`, `page.pause()` or `page.$eval()`.
- **T-HYG-2 (SHOULD):** No conditional logic (`if`/`switch`) inside test bodies. Split into separate tests or parameterise.
- **T-HYG-3 (SHOULD):** No commented-out tests. Delete or `test.fixme` with a ticket reference.
- **T-HYG-4 (SHOULD):** `test.skip` MUST carry a reason and ticket reference.
- **T-HYG-5 (SHOULD):** Test titles describe behaviour from the user's perspective ("orders a 1 Gbps port in Sydney"), not implementation.

---

## 6. Critical journeys

E2E coverage is limited to journeys on this list. Adding an E2E spec outside it needs a short justification in the PR.

- Login, logout, session expiry
- Order a Port
- Create a VXC to a cloud provider (AWS, Azure, Google Cloud)
- Create and configure an MCR
- Modify a service (speed change, rename, cancel)
- View services list and service details
- Billing and invoice views
- User and company management (invite user, roles)

Keep this list current. It is the contract for what E2E is allowed to own.

---

## 7. Tags

| Tag | Meaning |
|---|---|
| `@smoke` | Runs against a real environment post-deploy |
| `@critical` | Must pass before release; blocks deploy |
| `@slow` | Known long-running; candidates for optimisation |

- **T-TAG-1 (MUST):** Use Playwright's `tag` option (`test('…', { tag: '@smoke' }, …)`), not tags embedded in titles.

---

## 8. Linting

Biome enforces formatting and general lint. Test files additionally enable:

```jsonc
{
  "overrides": [
    {
      "includes": ["apps/*-e2e/**"],
      "linter": {
        "rules": {
          "suspicious": { "noFocusedTests": "error", "noSkippedTests": "warn" },
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

`tools/lint/no-serial-mode.grit`:

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
- **T-LINT-2 (SHOULD):** For rules Biome lacks (for example missing-await, no-conditional-in-test), run Oxlint with `eslint-plugin-playwright` via `jsPlugins` scoped to `apps/*-e2e/**`.

Biome's Playwright rules are in the nursery group and may change between versions. Check rule names when upgrading Biome.

---

## 9. CI pipeline

1. **PR:** `nx affected -t lint test` → `nx affected -t e2e-ci` (mocked only, distributed).
2. **Merge to main:** same as PR, plus API/contract tests.
3. **Post-deploy (staging):** `@smoke` suite against the deployed environment.
4. **Nightly:** full E2E + smoke + API against staging; flaky report published.

- **T-CI-1 (MUST):** PR pipelines MUST NOT depend on a shared long-lived environment.
- **T-CI-2 (SHOULD):** PR E2E wall-clock time SHOULD stay under 10 minutes. Exceeding it is a signal to push coverage down the pyramid or distribute further.

---

## 10. Definition of done for a test change

- [ ] Lowest possible layer chosen
- [ ] No arbitrary waits, forced actions or committed debug calls
- [ ] Runs in parallel with the rest of the suite (`--repeat-each=3 --workers=4` passes locally)
- [ ] Data created and cleaned up via fixtures, uniquely named
- [ ] Mocks typed against shared API types
- [ ] Biome passes