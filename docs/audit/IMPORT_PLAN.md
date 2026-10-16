# Import plan: jobquest into the NX monorepo as Vue 3 + Hono + D1

> **Status (2026-10-16).** Plan decided on 2026-10-15 (A5). J0 is merged (#14); J1 is next. Trimmed on 2026-10-16: the original morning analysis (old Part B: React import, pet-local, the `nx import` spike) was superseded or dropped and is gone, except the jobquest facts and follow-ups kept in "Background" at the end. pet-local was dropped on 2026-10-15 (too tied to Next.js, Vercel and Supabase); its repo stays private and unchanged. A test password leaked in its private history: change it anywhere it's reused.

## A1. Summary

- **What changes:**
  - The 5.6k lines of React UI (`App.tsx`, 20 components) are rewritten as Vue 3 SFCs, not imported.
  - The ~800-line Express server is rewritten as a TypeScript Hono Worker on D1.
  - The pure code is ported, not rewritten: `utils/skillMatcher.ts`, `types.ts`, `components/jobSearchTypes.ts`, and `server/jobSources.js` / `jobAgent.js` / `models.js` move to TS.
- **Order:**
  1. Shared theme.
  2. Scaffold.
  3. **Job list (clickable locally).**
  4. **Access + deploy (clickable online).**
  5. Skills, add job, gap.
  6. Analytics and taxonomy.
  7. Server-side AI with caps.
  8. The Find Jobs agent.
  9. Help pages, then the portfolio card.
- **Estimate: 14–20.5 working days over 10 PRs** (was 15–21; dropping the profile picker saves about half a day in J2). (Importing the React UI as is was estimated at 5–9 days; the Vue rebuild adds about 10–12.)
  - Clickable locally after about 3.5–5.5 days (J2).
  - Clickable online behind Access after about 4.5–7 days (J3).
- **Top risks:**
  1. **Workers CPU limit on the agent route.** The tool loop and stream parsing run in the Worker. The Free plan's per-request CPU allowance may be too small; measure it in J7 before building the UI on top.
  2. **AI SDK version split.** jobquest needs `ai` 7 / `@ai-sdk/vue` 4, while the catalog pins `ai` ^6 for admin-portal. Decided (A5.2): jobquest pins its own versions outside the catalog, with a comment saying why; admin-portal upgrades later, separately.
  3. **Chart rewrite.** Recharts' `RadarChart` and `Treemap` are React-only. The Vue replacement needs its own accessible data-table fallback.

## A2. Feature map: React → Vue 3

### Libraries (each used only where jobquest needs it)

| Library | Use it? | Why (interview line) |
|---|---|---|
| **Vue Router 5** | Yes | 9 views, deep links, a "first unfinished step" landing redirect, ownership 404s and a working Back button. Today the tab state lives in `App.tsx` and the URL never changes. |
| **TanStack Vue Query 5** | Yes | Real server state: 6 resources (the visitor's profile, jobs, skills, taxonomy, search prefs, chats) shared across views, plus mutations. It replaces the whole-array POSTs and the `jobsRef` workaround for saving after async extraction. |
| **Pinia** | No | Server state lives in Query. The little UI state left (toast, the agent chat, confirm dialogs) fits composables with provide/inject. |
| **`@ai-sdk/vue` 4** (`Chat`, `useChat`) | Yes, J7 | The Find Jobs chat. Checked in 4.0.141: exports `Chat`, `useChat`, `useObject`, `useCompletion`. |
| **vue-echarts** (tree-shaken `echarts/core`: Radar, Treemap, SVG renderer, aria) | Yes, J5, lazy route | The only option with both a radar and a treemap. Alternatives: d3-hierarchy + hand-made SVG (smaller, about 1 more day) or Chart.js (no treemap). |
| **`@heroicons/vue`** | Yes | The same icon set as the React UI, so no redesign. |
| **markdown-it** (`html: false`) | Yes, J7 | Replaces `react-markdown` for agent replies. Raw HTML stays off, so it's safe under the CSP. |
| zod 4 | Yes | Shared schemas: Hono validators and form checks use the same definitions. |
| Form library | No | `v-model` / `defineModel` + zod is enough for these 8 forms. |

### Routes and views

| React today (`TabType` / component) | Vue route | Data (Vue Query) | Notes |
|---|---|---|---|
| `Root.tsx` + `ProfilePicker` (localStorage `job_quest_current_user`) | none (removed) | — | **No picker and no `:profileId` in URLs** (A5.3: one profile per visitor). The server resolves the profile from the Access identity (`DEV_ACCESS_IDENTITY` locally) on every `/api/*` request; the client never sends a profile id. |
| `HelpPage`, `TechGuidePage` | `/help`, `/under-the-hood` | none | TechGuide copy is rewritten for the new architecture (needs Paul's approval). |
| `App.tsx` shell + sidebar `NAV_ITEMS` | root layout, `<RouterView>`; `/` redirects | `me` (`GET /api/me`), `jobs`, `skills`, `taxonomy` prefetched in the guard | `/` redirects to the first unfinished step (no skills → `/skills`, no jobs → `/find`, else `/analytics`), as `App.tsx` does after loading. |
| `GapAnalysis` + `SkillBuilder` | `/skills` | `skills` (+ `jobs`, `taxonomy` for demand) | Add/edit/remove skill forms; AI "generate for role" arrives in J6. |
| `JobSearchAgent` + `JobResultsPanel` + `SearchPreferencesBar` | `/find` | `chats`, `searchPrefs` | See "Agent chat" below. |
| `DataEntryUI` | `/jobs/new` | `createJob` mutation | Manual form in J4; paste-and-extract in J6. |
| `JobListView` | `/jobs` | `jobs`, `updateJob`, `deleteJob` | Filter, sort and search state in the URL query; inline edit; `InlineDeleteConfirm`; "Re-analyse all" in J6. |
| `JobDetailView` (`selectedJobId` state + `onBack`) | `/jobs/:jobId` | `job` (seeded from the `jobs` cache) | Match % from `useSkillMatch`; the browser's Back button works. |
| `SkillDashboard` (Recharts) | `/analytics` (lazy) | `jobs`, `taxonomy` | Radar + treemap + a "Show as table" toggle. |
| `TaxonomyManager` | `/taxonomy` | `taxonomy`, `saveTaxonomy` | Merge and rename in J5; AI generation in J6. |
| `Toast`, `ConfirmDialog`, `ProgressModal` | Components + `useToast()` / `useConfirm()` (provide/inject) | — | Native `<dialog>` + `showModal()` for focus trapping. |

### Composables

- **`useProfile()`:** the `me` query (`GET /api/me`); the server picks the profile from the identity, so there's no route param.
- **`useJobs()`, `useSkills()`, `useTaxonomy()`:** thin wrappers over the queries and mutations.
- **`useSkillMatch()`:** `computed` over jobs, skills and taxonomy.
  - It replaces `configureTaxonomy`'s module-level state, which is why React needed `<App key={user.id}>`. `skillMatcher` becomes pure functions that take the taxonomy as an argument, and it gets unit tests (it has none today).
- **`useFindJobsChat()`:** see "Agent chat" below.
- **`useReanalyse()`:** sequential extraction mutations with progress and an `AbortController` to cancel.

### Agent chat (must keep streaming on other tabs)

- **React today:** `JobSearchAgent` stays mounted with a `hidden` class.
- **Vue:** the `Chat` instance from `@ai-sdk/vue` lives in a composable provided by the root layout, not in the view. Leaving `/find` unmounts the view but not the chat, so the stream continues.
- The layout `watch`es `chat.status` for the sidebar busy dot and the "reply finished" toast. "New search" and History create a new `Chat` keyed by chat id.
- Result sets are a `computed` over the messages (as `collectResultSets` does now).
- Unverified until J7: exactly how `Chat` state is reactive in Vue. Read `@ai-sdk/vue`'s source then; the bundled AI SDK docs only show `useChat`.

### Data flows that change

- **Whole-document POSTs become per-row endpoints on D1:**
  - `POST /jobs`, `PATCH /jobs/:id`, `DELETE /jobs/:id`, and the same shape for skills.
  - This removes the "client overwrites the whole array" rule, the race behind `jobsRef`, and the reason the agent may not write jobs itself.
  - Mutations update the cache optimistically and invalidate on settle.
- **AI calls move to the server:**
  - Extraction, taxonomy generation and skills-for-role become Hono routes using AI SDK 7 structured output with zod schemas.
  - Keys become Worker secrets. The `vite.config.ts` `define` keys, `@google/genai`, `openai` and the browser provider toggle all go.
  - Ollama is local development only, through `wrangler dev`.
- **The AI spend counters move to D1.** They now survive restarts and deploys, which fixes the reset problem the in-memory counters had. JSearch is off in the hosted demo (A5.6), so it needs no quota counter there.
- **Identity is Cloudflare Access:**
  - Hono middleware verifies `Cf-Access-Jwt-Assertion`, reusing admin-portal's `lib/auth/access.ts`. It's `jose` only, with no Node imports, so it runs on Workers.
  - One profile per Access email, created and seeded on first sign-in (A5.3). Paul's own `data/` is never imported (A5.4).

### Forms (7)

| Form | Fields | Behaviour |
|---|---|---|
| Add job | title, company, raw text, seniority, category, subcategory, salary, URL, notes, skills / software / requirements | Paste-and-extract fills it in J6 |
| Job inline edit | as add job | |
| Skill add | name, proficiency 1–5, category | |
| Skill builder | role | AI in J6 |
| Taxonomy | merge, rename, groups | |
| Search preferences | location, country, distance, salary, posted within, full-time, remote | |
| Agent prompt | free text | |

Each form has one zod schema in `apps/jobquest/shared/`, used by both the Hono validator and the form (7 forms: the profile-create form went with the picker). Errors show inline next to the field, as jobquest does now: no `alert` or `confirm`.

## A3. What carries over from the Vue assessment spike (2026-10-15; that plan file no longer exists, and these are its findings)

- **`check-types`: `vue-tsc --noEmit`,** with `noUnusedLocals`.
  - The tsconfig needs `types: ["vite/client", "node"]` plus `@types/node`, or `vite.config.ts` fails with TS2307.
  - The Worker gets its own tsconfig with `@cloudflare/workers-types` (or `wrangler types`), so DOM and Workers types don't mix.
- **Biome:** `"html": { "experimentalFullSupportEnabled": true }` in `apps/jobquest/biome.json` only.
  - Known gaps: `v-for` without `:key`, clickable non-buttons, `<li>` outside a list.
  - Covered by `vue-tsc` `noUnusedLocals`, axe in E2E and review. **Decided (Paul, 2026-10-15): no ESLint;** the gap is accepted.
- **Component tests: `@testing-library/vue` + `@testing-library/user-event` + jsdom.** `vitest.config.ts` must repeat the `@` alias (the spike failed without it).
- **Hosting pattern:**
  - `wrangler.jsonc` with `assets.directory: dist/client`, `not_found_handling: "single-page-application"`, and **`run_worker_first: ["/api/*"]` with `main: server/index.ts`**, as the website has.
  - Deep links fall back to `index.html` (verified). `public/_headers` copies the website's CSP; Vue's runtime build ran under `script-src 'self'` with no errors (verified).
  - On a subdomain, `jobquest.paulclarke.au`: path hosting can't do deep links (verified).
- **`@repo/tailwind-theme`:** exists since J0 (#14); jobquest overrides its tokens (A5.1).
- **Versions:** catalog-aligned (Vite 6.4, Vitest 5 since PR #17 (was 3.2.4), TS 5.9.3, Tailwind 4.2, Biome 2.4.4), except the AI SDK: `ai` ^7 / `@ai-sdk/*` ^4 pinned in `apps/jobquest/package.json` outside the catalog, with a comment saying why (A5.2).
- **CI:** the E2E job's `--exclude='*,!website'` filter must add `jobquest`. `deploy-website` only deploys the website, so jobquest needs its own step with its own affected check.

## A4. PR list (one PR per row, each branched from `main` after the previous merges)

| PR | Title | Changes | Acceptance | Size (days) |
|---|---|---|---|---|
| **J0** | `refactor(website): move the Tailwind theme into @repo/tailwind-theme` | CSS-only package (`./theme.css`: `@theme` tokens, base body, focus ring, reduced-motion rule; print rules stay in the website). The website imports it. Token names allow per-app overrides. | The website's built CSS is unchanged (diff `dist/client/assets/*.css`); website E2E + axe green | S (0.5–1) |
| **J1** | `feat(jobquest): scaffold the Vue 3 app and Hono Worker on D1` | `apps/jobquest`: Vue 3.5 + Vite 6 + Vue Router + Vue Query; Hono Worker (`server/`), D1 binding, Drizzle schema (profiles keyed by identity email, jobs, skills, taxonomy, search_prefs, chats, usage) with SQL migrations applied by `wrangler d1 migrations apply`. Pure `skillMatcher` + shared types/zod ported, with unit tests. Targets: `dev` (Vite 3000 + wrangler 3002, the ports already reserved for jobquest), `build`, `lint`, `check-types`, `test`, `deploy`, `deploy:dry-run`. CLAUDE.md, apps table and ports updated. | `nx run jobquest:{lint,check-types,test,build}` green; `wrangler deploy --dry-run`; migrations apply locally; required checks green. Hono route tests against a local D1 through wrangler's `getPlatformProxy()` with plain Vitest (decided 2026-10-16: `@cloudflare/vitest-pool-workers` 0.23.0 needs Vitest ^4.1, and the repo is on Vitest 5 after PR #17) | M (1.5–2) |
| **J2** | `feat(jobquest): the job list` | **First clickable milestone (local).** `GET /api/me`: the server resolves the profile from the identity, `DEV_ACCESS_IDENTITY` locally (Access verification comes in J3); no picker, no `:profileId` in URLs. Root layout with sidebar (unbuilt tabs hidden); `/jobs` (filter, sort, search in the URL query, inline edit, delete) and `/jobs/:jobId`; per-row job endpoints scoped to the resolved profile. A local dev profile for `DEV_ACCESS_IDENTITY`, seeded with fictional pre-extracted jobs (SQL seed, never Paul's data). Playwright + axe harness against `wrangler dev` + seeded local D1 (desktop + Pixel 7); the website's `a11y.ts` moved to a small shared package; CI E2E filter widened. | Unit + component tests for list filtering and edit; API test: a job id from another profile returns 404; E2E: open `/jobs` → edit → delete → detail → Back; axe 0 serious/critical; "Website E2E (Playwright + axe)" covers jobquest | M (1.5–2.5) |
| **J3** | `feat(jobquest): deploy behind Cloudflare Access` | **Clickable online.** Access middleware (admin's `access.ts` reused; extract to `packages/access-auth` now there are two users, with admin's tests passing) replaces J2's dev-only identity lookup; one profile per Access email, created and seeded on the visitor's first request (D1 batch, same fictional seed as J2's dev profile); `DEV_ACCESS_IDENTITY` stays for local and is refused in production; deploy step in CI with its own affected check and D1 migrations before `wrangler deploy`. **Paul:** create the D1 database, the Access app and the custom domain. | Without an Access JWT the API returns 401; with a forged email header still 401; two identities see only their own jobs; a second first request doesn't seed twice; deep link 200 with CSP; a manual CI run deploys. **Check:** whether the CI token can apply D1 migrations (may need D1 edit permission) | M (1–1.5) |
| **J4** | `feat(jobquest): skills, gap analysis and adding jobs` | Skills API; My Skills & Gaps (add/edit/remove, demand via `countSkillDemand`, matched/missing); manual Add Job form; match % on job detail; landing-redirect guard. | Component tests for each form and the guard; E2E: an identity with no skills lands on `/skills` → add skill → add job → match % shows | M (1.5–2) |
| **J5** | `feat(jobquest): analytics and taxonomy` | Lazy analytics route with vue-echarts (radar + treemap, `aria` on) and a "Show as table" toggle; Taxonomy manager (merge, rename, groups) feeding `useSkillMatch`. | Unit tests: a taxonomy merge changes the skill counts; axe on analytics in both chart and table mode; analytics chunk size recorded | M–L (2–3) |
| **J6** | `feat(jobquest): server-side AI with spend caps` | Hono routes for extraction, taxonomy generation and skills-for-role (AI SDK 7 structured output, zod); OpenAI demo key as the only Worker secret (`gpt-4.1-nano`, provider hard limit; no Gemini in production, A5.5; Gemini/Ollama stay local-only options); per-user rate limit + daily spend caps in D1 (port admin's `guard.ts` / `pricing.ts` ideas); a mock provider (`ai/test`) for tests and E2E. Vue: paste-and-extract on Add Job, SkillBuilder generate, taxonomy generate, "Re-analyse all" with progress + cancel. | A test fails if the built bundle contains a key-shaped string; caps tested (429 with the reason → toast); E2E with the mock provider; real-key smoke test by hand | M–L (2–3) |
| **J7** | `feat(jobquest): Find Jobs agent on Workers` | Port `jobAgent` + `jobSources` to TS; `createAgentUIStreamResponse` (in `ai` 7.0.141) from Hono; save the chat on finish through `executionCtx.waitUntil`, and abort on `request.signal`; Adzuna + Jooble only in the hosted demo (JSearch off, A5.6; it stays usable locally with a key); chats list/history/delete; search prefs form; Vue `Chat` in the layout composable; results panel; save a job from the results (extraction → `createJob`, so no whole-array race). **Starts with a measurement:** CPU time of one real agent turn (`wrangler tail` / observability). **Report the numbers to Paul before deciding on Workers Paid** (A5.7). | Unit tests for source parsing (mocked `fetch`) and `collectKnownJobs`; E2E with a mocked stream: send → chips → results tab → switch tab and back while streaming → saved in History; axe on chat and results | L (3–4) |
| **J8** | `feat(jobquest): onboarding and help pages` | "How it works" (on the landing view, no picker), Help, Under the hood (rewritten for Vue + Hono + D1 + Access). **Copy needs Paul's approval.** | axe on each page; the tab labels come from one list (no more keeping three copies in sync) | S (0.5–1) |
| **J9** | `feat(website): add the jobquest card and app README` | `projects.ts` card (copy for approval); `apps/jobquest/README.md`: problem → solution → impact, "React → Vue: what changed and why", architecture, test numbers. Afterwards: archive `pabloplico/jobquest`, stop the `jobquest` systemd unit, rotate the old Gemini/OpenAI keys ("Before and after" below). | Website E2E + axe green; links resolve | S (0.5) |

**Total: 14–20.5 days.** Sum of the ranges: J0 0.5–1, J1 1.5–2, J2 1.5–2.5, J3 1–1.5, J4 1.5–2, J5 2–3, J6 2–3, J7 3–4, J8 0.5–1, J9 0.5.

**Dropped from the original React-import plan:**
- J1 (React import), J2 (strict TS for the React code) and J5 (Tailwind v3 → v4 for the React UI) no longer apply.
- Importing jobquest's git history is moot for the front end: it's new code. Import commit messages still name `pabloplico/jobquest@<sha>` for the ported pure files.

## A5. Decisions (Paul, 2026-10-15; were questions)

1. **Theme:** (b) keep jobquest's light indigo look through token overrides on `@repo/tailwind-theme`. J0's token names must allow that.
2. **AI SDK version:** (a) jobquest pins `ai` ^7 / `@ai-sdk/*` ^4 outside the catalog, with a comment explaining why. admin-portal's upgrade comes later, as its own PR.
3. **Profiles under Access:** (b) one profile per visitor, seeded on first sign-in. No profile picker and no `:profileId` in URLs; the server resolves the profile from the Access identity (`DEV_ACCESS_IDENTITY` locally). A2 and J2–J4 are revised to match.
4. **Your own data:** never import `data/`. The LAN version keeps running until J9.
5. **Providers in production:** the OpenAI demo key only, with a hard limit. No Gemini in production (removed from J6's Worker secrets).
6. **Job sources in the hosted demo:** JSearch off; Adzuna and Jooble only.
7. **Workers plan:** decide after J7's CPU measurement. Report the numbers first.

# Background

## The jobquest source today (checked 2026-10-15)

`~/Projects/jobquest` → `pabloplico/jobquest` (private), `main` level with `origin/main` (pushed by 2026-10-16). 26+ commits; history scanned clean (regex scan and Gitleaks: 0 findings). `data/` and `dist/` were never committed.

| Area | Finding |
|---|---|
| Front end | React 19.2, no router (view state in `App.tsx`), plain `fetch` through `services/api.ts`, `@ai-sdk/react` `useChat` for the agent, recharts 3. About 7,100 lines in total. Not `strict`: 54 errors under the workspace's `strict` + `noUncheckedIndexedAccess`. |
| Styling | Tailwind Play CDN (v3 runtime), Google Fonts and an esm.sh importmap (AI Studio leftovers), all blocked by the site's CSP. |
| Server | Express 5 `server.js` + `server/{jobAgent,jobSources,models}.js`. Job APIs (Adzuna, Jooble, JSearch via RapidAPI) are server-side. |
| Secrets | **Skill extraction calls Gemini/OpenAI/Ollama from the browser:** `vite.config.ts` `define` bakes `GEMINI_API_KEY` and `OPENAI_API_KEY` into the bundle. That's why it runs LAN-only today (systemd unit `jobquest`, port 3002, ufw). **Bug:** `.env.local` sets `RAPIDAI_KEY` but the code reads `RAPIDAPI_KEY`, so JSearch is silently off. |
| Data | JSON files under `data/` (gitignored) with real profiles: never imported (A5.4). No auth: anyone on the LAN picks a profile. |
| Tests | None. |
| Lint | ESLint 10, clean. Under the workspace Biome config: 75 errors, 52 warnings; 97 a11y findings (61 `useButtonType`). Moot for the Vue rewrite, but the same a11y issues must not come back. |

## Monorepo conventions jobquest must match (refreshed 2026-10-16)

CLAUDE.md is the full reference; these are the ones an imported app trips on.

- **Targets:** `build`, `check-types`, `lint`, `test`, `test:e2e`, `dev`, as `package.json` scripts. CI runs exactly these names, so an app without `check-types` or `test` is silently never checked. No NX plugins, no `project.json`, no inferred targets.
- **Dependencies:** shared ones come from the pnpm catalog (`catalog:`); app-only ones use their own ranges. One root lockfile: delete any nested `pnpm-lock.yaml` or `pnpm-workspace.yaml`. Exception by decision: jobquest's `ai` ^7 / `@ai-sdk/*` ^4 (A5.2).
- **TypeScript:** extend `@repo/typescript-config` (`vite.json` for the client); `strict` + `noUncheckedIndexedAccess` from the base.
- **Lint and format:** Biome 2.4.4 extending `@repo/biome-config`, not ESLint; a11y rules on (as the website has).
- **Styling:** Tailwind v4 CSS-first, importing `@repo/tailwind-theme/theme.css`, with token overrides in a later `@theme` block.
- **Tests:** Vitest; Playwright + `@axe-core/playwright` E2E, desktop + Pixel 7, and the CI E2E filter widened to include the app.
- **Ports:** 3000 (Vite) and 3002 (wrangler) are reserved for jobquest.

## Before and after

- **Before J1:** ~~push jobquest's local commits~~ (done).
- **Credentials (after J6, when keys are server-side):** rotate the old `GEMINI_API_KEY` and `OPENAI_API_KEY` (they've been in LAN bundles); fix `RAPIDAI_KEY` → `RAPIDAPI_KEY` for local use.
- **Shared code:** extract a package only when jobquest actually consumes it (Access verification in J3; the AI guard ideas in J6). `@repo/ui` doesn't fit jobquest's look; don't force it.
- **After J9:** archive `pabloplico/jobquest` on GitHub (private, read-only) with a README pointing at `apps/jobquest`; don't delete it, it's the history record. Stop and remove the `jobquest` systemd unit. Update CLAUDE.md, README and STATUS for the new app (ports, targets, CI jobs).
- **Lockfile changes mark every project affected,** so each jobquest PR that touches dependencies also redeploys the website on merge (harmless, expected).
