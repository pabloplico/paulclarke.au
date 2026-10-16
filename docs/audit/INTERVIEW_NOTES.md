# Interview notes

Condensed on 2026-10-14 from `PHASE1–3B_NOTES.md` (deleted); later work added on 2026-10-16 from STATUS and `REPO_AUDIT.md` (deleted). Commit hashes for Phases 1–3 were in the private archive repo only; the public repo starts at `79caa3a`. Measurements for the PGlite spike are in `SPIKE_PGLITE.md`.

## Phase 1: green build

- **What:** took the monorepo from a broken build to every CI step passing in a clean checkout, and added CI (GitHub Actions on PRs and `main`).
- **Numbers:** admin `next build` type error fixed; unit tests 908/915 → 919/919; Biome errors 13 → 0 (117 warnings left on purpose); `check-types` went from running 0 tasks to 3 packages; Docker build context 720 MB+ (failed before any step) → 6.2 MB, image 398 MB.
- **Talking point:** "green" scripts that ran nothing (`check-types` with 0 tasks) are worse than red ones; I checked what each script actually ran.

## Phase 2: consulting site → developer portfolio

- **Scope change:** the consulting business closed, so I removed Services, Insights and every consulting call to action, and rebuilt the order as Home, Projects, Assessment, About, Writing, Contact. Done before the a11y and routing work so no effort went on sections about to be deleted.
- **Accessibility:** Lighthouse accessibility 94–95 → 100 on all 8 routes; axe serious/critical violations → 0 (contrast on every page, 40 unnamed buttons in the assessment); Biome a11y rules switched on with 0 errors.
- **Type safety:** website `strict` + `noUncheckedIndexedAccess`, 0 errors, 0 non-null assertions.
- **Routing:** TanStack Router + Query; the back button works and every page has its own URL. Assessment and posts lazy-loaded: main bundle −20% (−16% gzip) despite adding the router.
- **Tests:** website 0 → 51 unit and 62 E2E (desktop + mobile, Playwright + axe) in CI.
- **Privacy claim checked, not assumed:** the assessment scores in the browser, has no fetch, storage or cookies, the Worker has no POST route and the CSP sets `connect-src 'self'`. So "sends no data to a server" is true.

## Phase 3: the public snapshot

- **How:** `git archive` of the reviewed `main` into a new repo with one commit (`79caa3a`), tree hash checked identical. Ignored files (env files, keys, backups, `docs/`) can't come along because they were never in Git, and there's no history for forks or caches to hold.
- **Two bugs only a from-scratch build found:**
  1. An unanchored `backups/` ignore rule also matched two source folders. They were tracked from before the rule, so nobody noticed; a fresh `git add -A` dropped 4 files and the build would have failed. Fix: `/backups/`. Check before any snapshot: `git ls-files -ci --exclude-standard` prints nothing.
  2. `check-types` needed a gitignored generated posts file; every earlier "clean" run had a leftover copy. CI would have gone red on its first run.
- **Talking point:** clone-based testing can't catch problems that only exist when a repo is created from scratch.
- Also: self-hosted fonts, MIT licence, EXIF stripped from the headshot, Gitleaks clean.

## Phase 3b: Turborepo → NX (PR #1)

- **What:** moved the task runner to NX 23. Script names, task graph and checks stayed the same; CI now checks only the projects a PR can affect (`nx affected` + `nx-set-shas`), and runners are pinned to `ubuntu-24.04`.
- **Why NX:** a project graph gives `affected`, an inspectable graph, and a path to plugins and boundary rules as more apps join.
- **Key decision, no plugins:** plugins infer cache inputs but replace the scripts and pull in heavy dependencies (`@nx/next` brings webpack and ESLint tooling into a Biome repo). Keeping scripts meant only the runner changed, easy to review and revert. The cost is hand-written inputs and outputs, so I proved them by editing files and recording what re-ran.
- **Things to call out:**
  - Turbo's implicit dependency hashing doesn't exist in NX; a UI change only re-checks the apps because I added `^production` as an input.
  - Moving posts generation into its own cached target made it visible, but anything that builds the website must go through NX; I found and fixed the three callers.
  - NX 23 shares its cache across checkouts in `~/.nx`, which nearly invalidated my benchmark (so did Turbo's worktree cache sharing).
  - CI token permissions stayed read-only; I read `nx-set-shas`'s source to confirm it doesn't call the API on PRs.
- **Measured:** cold runs the same (about 60 s); cached about 2.4 s with the daemon, 1 s slower without it (CI).

## Admin demo: PGlite, in-process queues, demo mode (PRs #2–#4, #8, #9)

- **Spike first (45 minutes of a 2-hour time-box):** PGlite + an in-process queue vs Neon + Upstash. PGlite ran every migration, pgvector, and upload → embed → search through the standalone server. Costs measured, not guessed: about 300 MB more RAM, database work about 2.7× slower, hidden behind 9–14 s AI calls. Details in `SPIKE_PGLITE.md`.
- **Found along the way:** the migrations couldn't build a fresh database on any engine, including real Postgres. Fixed with one baseline migration and `db:check-fresh` in CI (a required check), so it can't come back.
- **Design:** `DB_DRIVER` and `QUEUE_DRIVER` switches behind a `JobQueue` interface, so the demo and a persistent production setup are configuration, not a fork.
- **Demo mode:** Cloudflare Access JWT verified in middleware (never the plain email header); every route listed as core or switched off, with a test that fails if one is missing; real AI behind a guard with an output-token cap, daily spend caps in total and per user, and a test that checks every AI route calls `requireAiAllowance` from the import graph.
- **Seed:** each visitor gets a fictional Cairns bakery, built once by the real pipeline for US$0.0056 and committed, so a visitor's first page costs nothing.
- **Talking point:** the mocked-AI plan from the audit became real AI with caps once the caps were testable; a demo that fakes the interesting part doesn't show anything.

## Website to Workers (cutover 2026-10-14), deployed by CI (PR #11)

- Cut over from Cloud Run to one Worker with Static Assets; CSP in `public/_headers`; deep links via `not_found_handling: single-page-application`.
- CI deploys on `main` after every required check, only when NX says the website is affected. Chosen over Cloudflare Workers Builds, which doesn't wait for CI.

## Developer experience (PRs #15–#17)

- **Docker optional:** the app containers went; everything runs on the host with Node 22 + pnpm. `dev:lite` (PGlite, in-process jobs, sign-in off) needs nothing installed or running; `dev:full` loads the same env file onto the host against Postgres + Redis.
- **Safer defaults:** admin dev servers on 127.0.0.1 unless `DEV_HOST` opts in to the LAN.
- **Vitest 5:** upgraded with the same test counts; three test files needed constructor mocks as classes.

## Numbers (main CI, 2026-10-14)

Unit: admin 1,046 (102 files), website 52 (4 files) = 1,098. Website E2E 64 (62 pass, 2 skipped). Admin E2E 124 (not in CI). Lint warnings: admin 102, website 15.
