# Dependency updates: plan

How to bring the remaining dependencies up to date, in what order, and how to check each step. Each step can be handed to a coding agent with the prompt template below.

Re-audited 2026-10-16 on `main` at `8cc1107` (#33), with `pnpm outdated -r`, `pnpm audit --prod` and the npm registry. This replaces the first plan (written on `5367ffd`). Done since then: Vite 8 (#31), react-markdown 10 with `diff` pinned to `^8.0.3` (#32). Redis, BullMQ, feeds and backups are gone (#25, #28), so their upgrade step and coverage rows are gone too. Re-run `pnpm outdated -r` and `pnpm audit --prod` before each step, because versions move.

---

## What changed since the first plan

- **Security decides the order now.** `pnpm audit --prod` reports **135 advisories: 4 critical, 55 high, 66 moderate, 10 low.** Almost all come from three places: Next 16.2.1, Mastra 1.16's dependencies, and mammoth's XML parser. See "Advisories" below.
- **No new majors for Next, React or drizzle.** Next 17 isn't out (`latest` 16.4.2, canary 16.5), React is at 19.3.1, and drizzle 1.0 is still a release candidate (`rc` tag 1.0.0-rc.4, `latest` 0.45.4). For these three, this round means minors.
- **AI SDK 7 is unblocked.** `@mastra/core` 1.47 and later ship the AI SDK 7 provider types (`@ai-sdk/provider-v7`), and 1.78's types include `MastraLanguageModelV4`. So the order is Mastra first, then AI SDK 7.
- **TypeScript 7 is possible.** Next 16.3 and later type-check through the `tsc` CLI by default (`experimental.useTypeScriptCli: true`), so TypeScript 7's missing compiler API doesn't block `next build`.
- **Four admin dependencies are unused:** `@mastra/ai-sdk`, `@tanstack/react-query`, `fast-xml-parser` and `recharts`. Nothing imports them (checked in ts/tsx/js/mjs/cjs/json, and `pnpm why` shows them only as direct deps). `fast-xml-parser` is a feeds leftover and carries a high advisory.

## Advisories

From `pnpm audit --prod` on `8cc1107`, grouped by where they come from.

| Source | Advisories | Fixed by | Real exposure |
|---|---|---|---|
| `next` 16.2.1, plus its `sharp`, `postcss`, `nanoid`, `source-map-js` | 3 critical, 13 high, 12 moderate, 3 low (`next` alone); 9 high in the others | `next` ≥ 16.3.8 (16.4.2 is in range) | **High.** Several highs are middleware/proxy bypasses, and admin sign-in lives in `middleware.ts`. The criticals are Image Optimisation (AVIF), `next/og` and Windows hosting. The admin portal isn't hosted yet, so this must land **before Part 4b**, not as an incident. |
| `@mastra/core` 1.16's dependencies (`proxy-addr`, `fast-uri`, `ws`, `path-to-regexp`, `js-yaml`, `picomatch`, `ip-address`, `@modelcontextprotocol/sdk`, `@hono/node-server`, `qs`, `uuid`, `body-parser`) | 1 critical, 17 high, plus moderates | `@mastra/core` 1.78 (step 5) | Medium. These sit in Mastra's server and MCP code, which the research agents mostly don't use, but they ship in the image. |
| `mammoth` → `@xmldom/xmldom` | 13 high, 2 moderate | `mammoth` 1.13.0 (in range) | Medium off the demo. DOCX parsing reads user uploads. In demo mode, `upload-validation.ts` accepts only Markdown, plain text and CSV, so DOCX and PDF never reach a parser. |
| `hono` 4.12.8 (website, **live**) | 1 high, 28 moderate, 2 low | ≥ 4.13.7 (4.13.13 is in range) | Low. The high is `cors()` reflecting any origin. Ours only runs when `ENVIRONMENT === 'development'` (`server/index.ts:12-13`) and sends no credentials. Most others are in helpers we don't use (JSX, cookies, Lambda, `toSSG`). |
| `drizzle-orm` 0.44.7 | 1 high (SQL injection through `sql.identifier()` / `sql.as()`) | ≥ 0.45.2 (**needs a range change**: `^0.44.2` excludes 0.45) | Nil today: neither function is used anywhere. Still worth taking. |
| `fast-xml-parser` → `fast-xml-builder` | 1 high, 1 moderate | Remove the dependency (step 1) | Nil: unused. |
| `csv-parse` 6.2.1 | 1 moderate | ≥ 7.0.2 (major) | Low. Parses user CSV uploads. |
| `@ai-sdk/provider-utils` | 2 low | In range | Low. |

**What's likely to be left.** A throwaway npm lockfile of the target versions (Next 16.4.2, Mastra 1.78, mammoth 1.13, AI SDK 7, drizzle 0.45.4, csv-parse 7) audited at 0 critical, 0 high and 6 moderate. That's a fresh npm resolution, though. pnpm keeps old transitive versions in the existing lockfile, so **measure each PR with `pnpm audit --prod`** and don't assume this result.

**Accepted for now** (no `pnpm.overrides`; wait for upstream): `sprintf-js` (no fixed version, via Mastra → `gray-matter` → `js-yaml` → `argparse`), and the moderate `js-yaml`/`argparse` chain through `gray-matter` and `mammoth`. List anything else accepted here, with the date.

---

## Decisions (Paul, 2026-10-16)

- `hono` 4.13 goes first, as a one-line PR (step 0).
- Admin E2E must be able to fail before it counts as a gate (prerequisite before step 2).
- Playwright gets its own PR (step 3a), not the batch.
- AI SDK 7 needs a chat-route test with a streaming mock first (step 6).
- PDF support stays. `pdf-parse` 2 needs real PDF fixtures and a golden test first (step 8).
- `next dev`'s `AGENTS.md` is ignored in `.gitignore` (step 2).
- `@types/node` → `^22` (step 12).

---

## The gate

Run it for every step, and paste the summary into the PR.

```bash
pnpm install                 # read the peer-dependency warnings
pnpm audit --prod            # before and after counts go in the PR
pnpm lint
pnpm check-types
pnpm test
pnpm build
pnpm --filter website test:e2e
pnpm --filter admin-portal db:check-fresh
# admin, when the step touches Next, the database, the queue, AI or Mastra
# (CI runs it on every PR that affects the admin portal; no services, dev:lite):
pnpm --filter admin-portal test:e2e        # --workers=2 is the config default
# when the step touches Next, or anything in serverExternalPackages (pdf-parse, playwright):
docker build -t admin-portal -f apps/admin-portal/Dockerfile .   # standalone trace + prune-standalone.mjs
```

The gate is only as good as the tests. An agent that "fixes" an upgrade by weakening a test has switched the gate off (CLAUDE.md "Tests"; `pnpm test:diff`).

### Coverage the risky steps rely on

From the Step 0 baseline (`425d3f4`). Tests added since (#29 Mastra tools, #30 tool limits) raise the Mastra numbers. Re-measure before steps 5, 6 and 8.

| Area | File | Lines | Branches |
|---|---|---|---|
| Guard and pricing | `lib/ai/guard.ts` | 92.5% | 78.1% |
| | `lib/ai/pricing.ts` | 100% | 100% |
| | `lib/ai/allowance.ts` | 78.6% | 64.3% |
| | `lib/ai/providers.ts` | 73.0% | 68.4% |
| Streaming chat | `app/api/chat/unified/route.ts` | **0%** | **0%** |
| Mastra | `lib/agents/mastra/provider.ts` | 11.8% | 14.3% |
| | `lib/agents/mastra/agents/create.ts` | 0% | — |
| PDF | `lib/document-processing/parsers/pdf.ts` | 100%, **against a mocked `pdf-parse`** | 100% |
| | `lib/agents/mastra/tools/file-parser.ts` | 6.7% | 0% |

---

## Rules for every agent

These rules apply to full-gate changes (CLAUDE.md, Change tiers). Fast-path changes don't use them.

Paste these with every task.

- Branch from an up-to-date `main`; never push to `main`. One PR per step, one commit per logical change (conventional commits), draft PR with `gh`.
- **Never weaken a test to get an upgrade through**: no `skip`/`todo`, loosened assertions, extra mocks or deleted cases. If a test fails, either the code needs migrating or the test checked an implementation detail that legitimately changed. Say which in the PR, and list every test change with one line on why.
- No `--force`, `pnpm.overrides`, `resolutions`, `@ts-ignore`/`@ts-expect-error` or new `biome-ignore` to get green, and no overrides to silence `pnpm audit`. If one is truly needed, stop and ask.
- Don't hand-edit `pnpm-lock.yaml`. Change ranges, then `pnpm install`.
- Read the migration guides **before** changing code (every major in between, not just the last), and list the breaking changes that affect this repo in the PR, with the files each touched.
- Resolve the peer-dependency warnings from `pnpm install`, or explain in the PR why they're harmless.
- Run the full gate and paste the summary. Say plainly what was skipped (for example admin E2E without the full stack).
- Australian spelling in comments, docs, commits and PR text.
- Touch only the packages the step names. Note other problems in the PR; don't fix them.

### Prompt template

```
Read docs/audit/dependency-updates.md (all of it) and CLAUDE.md.
Do step <N>: <title>. Follow "Rules for every agent".
Before writing code, list: current → target versions, the migration guides you read,
and the breaking changes that apply to this repo with the files affected. Then upgrade,
run the gate, and open a draft PR.
```

---

## Steps

In order. Each merges before the next starts, so a failure points at one change.

- **Steps 0–5, with the admin E2E prerequisite, should land before the admin portal is hosted (Part 4b).** They're expected to clear every critical and high advisory that `pnpm audit` can see. That expectation comes from the npm probe, so confirm it with `pnpm audit --prod` after each step.
- The pdf.js bundled inside `pdf-parse` 1 isn't counted by the audit. Step 8 can wait only because demo mode refuses PDF and DOCX uploads (`upload-validation.ts`) and research is off in the demo. If either changes, move step 8 into the before-hosting set. The "Was" column maps to the first plan's step numbers.

| # | Step | Packages | Risk | Was |
|---|---|---|---|---|
| 0 | ✅ hono 4.13 (website, live) — #35, 2026-10-16; the admin portal's hono 4.12.8 via `@mastra/core` stays until step 5 | `hono` 4.12.8 → 4.13.13, a one-line PR | Low | part of 1 |
| 1 | ✅ Remove unused admin deps — #41, 2026-10-16; audit 1/33/52/7 → 1/32/51/7, `fast-xml-parser` advisories → 0 | `@mastra/ai-sdk`, `@tanstack/react-query` (admin only; the website uses it), `fast-xml-parser`, `recharts` | Low | new (backlog S8) |
| P | **Prerequisite: admin E2E can fail** | none (tests only) | — | new (test-audit-report §8 item 7) |
| 2 | ✅ Next 16.4 — #36, 2026-10-16; audit 4/55/66/10 → 1/33/52/7 (critical/high/moderate/low), `next` advisories 31 → 0 | `next` 16.2.1 → 16.4.2 | Med | part of 1 |
| 3 | ✅ In-range batch — 2026-10-16, PR pending; audit 1/32/51/7 → 1/19/48/6, `mammoth`/`xmldom` advisories → 0 | everything in range **except** Mastra, `hono` and Playwright | Low–med | 1 |
| 3a | Playwright 1.64 | `playwright` + `@playwright/test` 1.58.2 → 1.64.1 | Low–med | part of 1 |
| 4 | drizzle 0.45 | `drizzle-orm` 0.44.7 → 0.45.4, `drizzle-kit` 0.31.11 | Low–med | part of 1 |
| 5 | Mastra 1.78 | `@mastra/core` 1.16 → 1.78 | Med–high | 4 |
| 6 | AI SDK 7 | `ai` 6 → 7, `@ai-sdk/*` 3 → 4 | High | 8 |
| 7 | Small runtime majors | `csv-parse` 6 → 7, `diff` 8 → 9 | Med | 5 (rest) |
| 8 | pdf-parse 2 (PDF support kept) | `pdf-parse` 1.1.4 → 2.4.5, drop `@types/pdf-parse` | High | 6 |
| 9 | Biome 2.5 | `@biomejs/biome` 2.4.4 → 2.5.15 | Low–med | 2 |
| 10 | 0.x and tooling | `lucide-react` 0.536 → 1.57, `prettier-plugin-tailwindcss` 0.7 → 0.8, `concurrently` 9 → 10 | Low–med | 3 |
| 11 | TypeScript 7 | `typescript` 5.9 → 7.0 | High | 10 |
| 12 | `@types/node` → `^22` (decided) | `@types/node` 24 → 22 | Low | 11 |
| 13 | Keep it current | Renovate | Low | 12 |

### 0. hono 4.13 (decided: goes first)

- A one-line range bump in `apps/website/package.json`, to `^4.13.13`, then `pnpm install`.
- It clears the live website's 31 `hono` advisories. The real exposure is low (see Advisories), but the change is tiny and it ships to production.
- Gate: the website suite, `pnpm --filter website test:e2e` and `pnpm run deploy:dry-run` from `apps/website`. CI deploys it on merge.

### 1. Remove unused admin deps

- Delete the four from `apps/admin-portal/package.json`, then `pnpm install`. Confirm again first: `pnpm why <pkg>` from `apps/admin-portal`, and grep including `.json`, `.cjs` and the `serverExternalPackages` list in `next.config.ts`.
- Gate, with `pnpm build` (the standalone trace) and the audit count (expect the `fast-xml-*` advisories to go).
- It's small, and doing it first means the batch doesn't bump packages that are about to go.

### Prerequisite (before step 2): admin E2E can fail

- Until this merges, the admin E2E suite **isn't a gate**: it passes by skipping.
- Do test-audit-report §8 item 7:
  - Replace the 53 bare `test.skip()` calls with assertions, or `test.fixme('reason')` for known breakage.
  - Replace the 25 `waitForTimeout` calls with web-first assertions.
- Steps 2, 5 and 6 lean on admin E2E (middleware sign-in, research runs, AI flows), so this comes before step 2. Steps 0 and 1 don't need it.
- Every test change gets listed in the PR, as CLAUDE.md "Tests" requires.

### 2. Next 16.4 (security)

- On its own, not in the batch: it fixes the criticals and the middleware-bypass highs, and a Next minor can shift the standalone output.
- The 16.3 and 16.4 release posts list no breaking changes. New defaults to check:
  - **Turbopack's disk cache is on for `next build`.** Check that NX outputs and the Docker build still behave.
  - **`next dev` writes a version-matched `AGENTS.md` block.** Decided: ignore it. Add `AGENTS.md` to `.gitignore` in this PR (check where Next writes it: the repo root or `apps/admin-portal`).
  - **`experimental.agentUpgrade` defaults to `'security'` reminders.** These are harmless, but note them.
- Next vendors its own React for the App Router. Leave `react`/`react-dom` for step 3.
- Gate: admin E2E (the sign-in and middleware paths), `dev:demo` sign-in via `DEV_ACCESS_IDENTITY`, and the Docker build. `npx next@canary upgrade --agent=latest` exists and can prepare guides and codemods, but review what it changes.
- `middleware.ts` → `proxy.ts` (backlog C6) stays a separate PR.

### 3. In-range batch

- **Range trap:** `@mastra/core: ^1.16.0` already allows 1.78, so a plain `pnpm update -r` would pull 62 Mastra releases into the "low-risk" PR. Exclude it, and Playwright (step 3a): try `pnpm up -r '!@mastra/*' '!playwright' '!@playwright/test'` (pnpm 10.28). If the negation doesn't work on `update`, name the packages instead. Check the lockfile diff for Mastra and Playwright before committing.
- Includes:
  - `mammoth` 1.13 (xmldom)
  - React 19.3.1 with `@types/react`/`@types/react-dom` 19.3
  - Radix, TanStack, Tailwind 4.3, `zod` 4.6, `jose`, `postgres`
  - `wrangler` 4.151
  - `ai` 6.x and `@ai-sdk/*` 3.x latest
  - `prettier` 3.9, `postcss`, `tailwind-merge`, `zustand`, `papaparse`
- **PGlite** is pinned exactly on purpose. `@electric-sql/pglite-pgvector` 0.0.11 depends on `@electric-sql/pglite` 0.5.10 exactly, so move both pins together (0.5.8 → 0.5.10, 0.0.9 → 0.0.11). Run `db:check-fresh` and the PGlite tests.
- For `wrangler`, also run `pnpm run deploy:dry-run` from `apps/website`.
- If the gate fails, bisect (`ncu --doctor` or by hand) and move the culprit to its own step.

### 3a. Playwright 1.64

- Its own PR, because it changes the browser both E2E suites run in, and a failure there shouldn't be mixed up with the batch.
- Move `playwright` and `@playwright/test` together in the catalog. They must resolve to the same exact version, so check the lockfile.
- Run `pnpm exec playwright install chromium`, then both E2E suites, the website's with `--repeat-each=3` to catch new flakiness.
- `playwright` is also an admin runtime dependency (URL scraping, `serverExternalPackages`). Check a scrape under `dev:full` and the Docker build with `INSTALL_PLAYWRIGHT=true`.

### 4. drizzle 0.45

- Change the range to `^0.45.4`. The 0.45.0–0.45.4 notes are small: subqueries in select fields, `$onUpdate` with `SQL` values, pg-native pool detection, the `sql.identifier()`/`sql.as()` escaping fix, and postgres-js prepared names.
- Check that `pnpm with-dev-env pnpm db:generate` (or the `db:check-fresh` drift check) produces **no new migration**, plus the PGlite tests and `test/document-flow.integration.test.ts`.
- **drizzle 1.0:** don't take the RC. Read its migration guide when 1.0 reaches `latest`, and plan it as its own step.

### 5. Mastra 1.78

- 62 releases. Read the changelog for `Agent`, `createTool` and `agent.generate` options.
- Known so far:
  - **Node:** engines need Node ≥ 22.13. Local is 22.23.3; CI's `node-version: 22` and `node:22-alpine` resolve to the latest 22.x.
  - **Cancel hook:** `onStepFinish` is deprecated in favour of `onStepEnd`. `lib/agents/queue/run-control.ts:29` is the cancel hook, so move it and test that cancelling still stops the agent.
  - **Tools:** `createTool` still exists.
  - **Model cast:** check whether the `toMastraModel` cast in `lib/agents/mastra/agents/create.ts` is still needed.
- Manual check: under `dev:lite` with a real key, start a research run and cancel another.
- Expect most transitive advisories to clear. Record what's left in "Accepted for now".

### 6. AI SDK 7

**First, on AI SDK 6, in its own commit (or PR): a test for `app/api/chat/unified/route.ts`.** The route has 0% coverage and it's the only streaming path.
- Drive it with a streaming mock model that emits a few text deltas and a finish part with known usage. The fakes in `test/fake-ai.ts` only implement `doGenerate` today, so add a streaming one there.
- Assert the **response body**: the streamed text the client receives.
- Assert that **usage is recorded**: the spend ledger and usage log entries for that user, with the mock's token counts.
- Mock only the model, through `@/lib/ai/providers` as the other tests do, so the guard still runs.
- It must pass before the upgrade. After the upgrade it must still pass, with only the mock moved to V4 and **no changes to its assertions**.

`ai` 7.0.0 shipped 2026-06-25 (now 7.0.142); `@ai-sdk/*` 4.x. Guide: ai-sdk.dev "Migration guide 7.0". Codemod: `npx @ai-sdk/codemod v7` (codemod 4.0.3). The core risk is the spend guard, and **`check-types` can't see it**: `guard.ts:249,254` cast the model `as never`, and `create.ts` casts it `as unknown as MastraModelConfig`, so a V3/V4 mismatch type-checks clean.

What applies here:
- **Middleware spec:** `guard.ts:197,234` declare `specificationVersion: 'v3'`. v7 middleware is `LanguageModelV4Middleware`/`EmbeddingModelV4Middleware`. The V4 usage shape is the same as V3 (`inputTokens.{total,noCache,cacheRead,cacheWrite}`), so `guard.ts:207,221` should carry over. Check it, don't assume.
- **Fake models:** `test/fake-ai.ts` uses `MockLanguageModelV3`/`MockEmbeddingModelV3`. Move to the V4 mocks, or the guard tests pass against the wrong spec. This is a test-infrastructure change, so list it in the PR.
- **`system` → `instructions`:** deprecated, not removed, at about 12 call sites (`router.ts`, `metadata.ts`, `chunk-analysis.ts`, `suggest-sources.ts`, `gap-to-inbox.ts`, the organise, content-audit, clean and batch routes). The codemod does it.
- **Google provider rename:** `createGoogleGenerativeAI` → `createGoogle` (`lib/agents/mastra/provider.ts:2`, and wherever else it's imported).
- **ESM-only:** the admin `package.json` has no `"type": "module"`. Check that `next build`, Vitest and the `tsx` scripts (`ai:smoke`, `demo:build-seed`) still load `ai`. Add the field only if needed.
- **System messages:** these are rejected inside `messages` by default. The chat route sends history as user/assistant rows (`route.ts:211`) and the system prompt separately. The new chat-route test covers it.
- **Multi-step usage:** `usage` now totals all steps, and `totalUsage` is deprecated. Our `generateObject` calls are single-step, and Mastra runs its own loop. Spend is counted in the guard per model call, so it isn't affected. Check anyway.
- **The admin E2E stub OpenAI server (`test/fake-openai/`, item 6 of the 2026-10-16 plan):** the E2E suite's AI calls go through the real `@ai-sdk/openai` provider to a stub of `/v1/responses` (plain and streamed) and `/v1/embeddings`. If v7 or `@ai-sdk/openai` 4 changes the endpoint, the request shape or the streaming events, the stub stops matching and the AI tests go red. That's the gate working: run `test/fake-openai/server.test.ts` to confirm it's the stub, then update the stub. It doesn't replace the chat-route test above.
- **Gate:**
  - `allowance-coverage.test.ts`, the guard tests and the new chat-route test pass **without changes to their assertions**.
  - `pnpm with-dev-env pnpm ai:smoke` runs against a real provider.
  - One research run is started and one cancelled.
  - Don't rerun `demo:build-seed` (it's paid) unless the seed output must change.

### 7. Small runtime majors

`csv-parse` 7 (fixes the moderate advisory) and `diff` 9, one commit each. Behaviour tests for CSV upload parsing and the section diff view first, if they're missing.

### 8. pdf-parse 2 (decided: keep PDF support)

The code change is small. The work is in the fixtures, the golden test and the packaging.

**First, on pdf-parse 1, in its own commit:**
- **Fixtures:** commit 2–3 real PDFs under `apps/admin-portal/test/fixtures/`. `public/demo/` holds only Markdown and CSV, and `pdf.test.ts` mocks `pdf-parse`, so nothing tests the real parser today.
  - Make the PDFs yourself so they're safe in a public repo: small, no personal data.
  - Cover a plain text PDF, a multi-page one and one with a table or columns.
- **Golden test:** write it against the real parser, and record the extracted text as the expected output. It needs its own file, because `vi.mock('pdf-parse')` in `pdf.test.ts` applies to the whole file. Say so in the PR, since CLAUDE.md prefers extending the existing file.
- **After the upgrade,** the golden test must pass unchanged. If the extracted text differs, show the diff in the PR and let Paul decide whether the new output is acceptable. Don't just update the expected text.

**Then upgrade:**
- The API is now class-based. Two call sites:
  - `lib/document-processing/parsers/pdf.ts`
  - `lib/agents/mastra/tools/file-parser.ts:47-50`
- The mapping:
  - `pdfParse(buffer)` → `const parser = new PDFParse({ data: buffer })`, with `await parser.destroy()` in a `finally`.
  - `data.text` → `(await parser.getText()).text`.
  - `data.numpages` → `.total` on that result.
  - `data.info.{Title,Author,Creator}` → `parser.getInfo()`. Check the field names in its `InfoResult` type.
- `pdf.test.ts` mocks the v1 default export, so its mock has to change shape. That's a test change: list it, and keep its assertions. It brings `pdfjs-dist` 5.4.296, which fixes the 2017 pdf.js CVE-2024-4367 in STATUS's follow-ups, and ships its own types, so `@types/pdf-parse` goes.
- It adds **native `@napi-rs/canvas`** 0.1.80 and needs Node ≥ 22.3. Alpine prebuilds exist (`linux-x64-musl` and `linux-arm64-musl`). `pdf-parse` stays in `serverExternalPackages`, so check that the native binary and pdf.js's worker file survive the standalone trace and `prune-standalone.mjs`. The gate includes running the Docker image and parsing a fixture PDF inside it, not just building it. Its README has a worker troubleshooting page for Node and serverless.
- **Follow-up, not part of this step:** the reason demo mode refuses PDFs (`upload-validation.ts:8`, the 2017 pdf.js) goes away with this upgrade. Turning PDF uploads back on in the demo is a separate decision for Paul.
- It's used in:
  - `lib/document-processing/parsers/pdf.ts`
  - `lib/document-processing/upload-validation.ts`
  - `lib/agents/mastra/tools/file-parser.ts`
  - `next.config.ts`
- Also upload one of the fixture PDFs through the inbox under `dev:lite`, end to end.
- `pdf-parse`'s last release was 2025-10-20. Compare with calling `pdfjs-dist` directly, and decide in the PR.

### 9. Biome 2.5

Update the pinned version in CLAUDE.md. Run `biome migrate`, then `pnpm lint:fix` in a **separate commit**.

### 10. 0.x and tooling

Lucide renames icons; `check-types` finds them, and then look at the pages for icons that changed shape.

### 11. TypeScript 7

- Only after step 2. Next 16.4 type-checks with the `tsc` CLI by default. Don't set `useTypeScriptCli: false`, because `typescript@7`'s main export is only `lib/version.cjs`, with no compiler API.
- Grepping the installed dist folders of `drizzle-kit` 0.31.9, `tsx` and `wrangler` 4.85 found no direct `typescript` imports. Re-check on the versions installed by then, plus Vitest and the Next typegen.
- Read the TypeScript 6.0 notes as well as 7.0. **No tsconfig in the repo sets `types`**, so if a default changed there, global `@types/node` could drop out. Check `@repo/typescript-config` against both sets of notes.
- If any tool isn't ready, defer the step and write down why here.

### 12. `@types/node`

Decided: set the catalog's `@types/node` to `^22`, to match the runtime (engines, CI, `node:22-alpine`). It's on 24 today. Fix whatever `check-types` finds, which would be code using Node 24-only APIs. Moving the runtime to 24 LTS is a separate decision for later.

### 13. Keep it current

- Renovate is recommended, but **Paul decides** between it and Dependabot. Renovate supports pnpm catalogs; check Dependabot's catalog support before choosing it. With Renovate:
  - Group patches and minors weekly per ecosystem, and open majors one per PR.
  - Auto-merge dev-tool patches only.
  - `minimumReleaseAge` about 3 days.
  - Vulnerability alerts on.
- Add a line to CLAUDE.md saying how updates arrive.
- Monthly: `pnpm outdated -r` and `pnpm audit --prod`.

**Optional tidy-up (any time after step 3):** move shared, separately declared packages into the catalog (`@tanstack/react-query`, `@radix-ui/*`, `hono` if jobquest uses it) so the apps can't drift apart.

---

## When a step goes wrong

- **The cause is clear from the guide:** migrate the code and list it in the PR.
- **It isn't clear:** bisect (go back to the old version of all but one package). If it's still unclear, stop and write up what you found in the PR rather than working around it.
- **A peer conflict can't be resolved:** close the PR, record the blocker and the date in the step above, and move on.
- **Behaviour changed but the tests pass:** that's a gap in the tests. Note it for the test audit, and add a test only if the step needs one.
