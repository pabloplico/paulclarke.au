# Status (2026-10-16)

One snapshot of where things stand, not a log: git history and the PRs hold the history. Rewritten on 2026-10-16 from the stacked 10-14/10-15 updates; checked against `main` (`5367ffd`), GitHub and the local machine that day. If this file and another doc disagree, this one wins.

**Other files here:** `INTERVIEW_NOTES.md` (finished phases, condensed), `IMPORT_PLAN.md` (jobquest J0–J9), `SPIKE_PGLITE.md` (measurements and conditions for hosting the admin demo), `dependency-updates.md` (upgrade approach and sprint plan), `testauditinstruct.md` (instructions for the test audit; delete once `TEST_AUDIT.md` exists). `REPO_AUDIT.md` was deleted on 2026-10-16; its open items are in "Backlog" below.

## Where work happens

Only in `~/Projects/paulclarke.au` → `github.com/pabloplico/paulclarke.au` (public). One PR per step, branched from `main`. `~/Projects/business-portal` (private) is a frozen archive; its hashes exist only there (squashed into the public repo's first commit `79caa3a`).

**`main` is protected:** ruleset "Protect main" (id 25048249, no bypass actors). PRs only, squash merge only, linear history, no force push or deletion, conversations resolved, 0 approvals. Required checks: `Lint, type-check, test and build`, `Website E2E (Playwright + axe)`, `Admin DB (fresh PGlite from migrations)`. `Deploy website` isn't required (it never runs on PRs). CI has no path filters on purpose, so required checks always report.

## In flight

- **PR #18** (`chore/test-guardrails`, draft, required checks green): Biome `noSkippedTests`/`noFocusedTests`, CI test-diff summary (`pnpm test:diff`), CLAUDE.md "Tests" section. **The CLAUDE.md wording awaits Paul's approval.**
- **Test audit** (branch `chore/test-audit`): report written to `docs/audit/TEST_AUDIT.md` (2026-10-16, read-only, by a separate session). Next: Paul reviews it and approves the fix PRs. Known going in: 53 runtime `test.skip()` calls in admin E2E that hide failures (warning-level until fixed).
- **jobquest J1** next (`IMPORT_PLAN.md`). J0 is merged (#14) and Vitest 5 is in (#17), so J1 uses `getPlatformProxy()` for D1 route tests. jobquest's local commits are pushed (`main` level with `origin/main`).
- **Dependency updates:** Vite 8 (#31) and react-markdown 10 (#32) done. Plan re-audited 2026-10-16 on `8cc1107` (`dependency-updates.md`): `pnpm audit --prod` shows 135 advisories (4 critical, 55 high), mostly Next 16.2.1, Mastra 1.16's dependencies and mammoth. Next: step 0 (`hono` 4.13, one line), step 1 (remove 4 unused admin deps), then the admin E2E prerequisite (test-audit §8 item 7) before Next 16.4. Steps 0–5 should land before admin hosting (Part 4b). PDF support stays (pdf-parse 2 is step 8, after golden tests on real fixtures).

## Recently merged (for context)

#13 assessment a11y (`96b4892`), #14 `@repo/tailwind-theme` (`b5fc99c`), #15 Docker optional (`efb9883`), #16 one-command dev, 127.0.0.1 by default (`eac96a0`), #17 Vitest 5 (`5367ffd`). CI deployed the website on `main` for #13, #14, #15 and #17 (the "Build and deploy" step ran) and skipped it for #16, which didn't touch the website, so the CI deploy path is proven.

## Decisions (from Paul)

- The website is a developer portfolio only. The consulting business is closed.
- Two demo apps: admin-portal and jobquest (pet-local dropped 2026-10-15: too tied to Next.js, Vercel and Supabase). Both end up in this monorepo, each on its own subdomain of paulclarke.au, gated with Cloudflare Access (one-time email PIN; allow lists of emails or company domains). The portfolio stays public.
- Demos are fully functional: real AI with per-user rate limits, a daily spend cap and a provider hard limit.
- **jobquest:** front end rebuilt in Vue 3, server on a Vite + Hono + D1 Worker. Details and A5 decisions in `IMPORT_PLAN.md`.
- **admin-portal demo:** PGlite + in-process queues (option A, built in #3), one instance, 2 GiB, snapshot baked into the image. Fallback Neon + Upstash. Host still open (below).
- Vue 3 comes through the jobquest rebuild; the Vue assessment port is deferred.
- Portfolio on Cloudflare Workers, deployed by CI. Don't also enable Workers Builds in the dashboard.
- M1 (credential revocation) is optional.

## Open: admin-portal demo hosting (Paul undecided)

Cloud Run stands until Paul decides. Conditions and measurements for any host are in `SPIKE_PGLITE.md`.

- **Cloud Run (current plan).** `--max-instances=1`, instance-based billing (processing runs after the response), 2 GiB, boot from the snapshot, scheduled trigger for resets. Access needs a **proxied** Cloudflare record in front of Cloud Run (the apex is DNS-only today); domain mapping vs a rewrite to `run.app` is undecided. `--no-default-url` is defence in depth and may conflict with a `run.app` rewrite. Demo key as `OPENAI_API_KEY` from Secret Manager.
- **Cloudflare Containers.** Same Docker image, started by a small Worker; one provider, no Access-in-front-of-Cloud-Run problem. Needs Workers Paid (US$5/month); basic 1 GiB is too small, standard-1 (4 GiB) ≈ US$26/month extra if never asleep; custom instance types may allow 2 GiB. Next step if pursued: a spike measuring memory, cold start and Access sign-in.
- **Self-host** behind a Cloudflare Tunnel, for an always-warm demo. Concerns: down when the machine sleeps or the connection drops; a public AI-calling app on a home network (mitigate: Access, non-root container, no host mounts); ISP terms.

**Part 4b to-do whichever host:** container image with the snapshot baked in, deploy job, reset trigger, Access app and subdomain. The provider's hard limit is the real spend cap (in-app counters reset on restart).

## Production

- Website on Workers since 2026-10-14 (`paulclarke.au` and `www.paulclarke.au`, both serve the site; CSP from `public/_headers`).
- **Delete the old Cloud Run service** from about 2026-10-21 (a week of stable DNS).

## Paul's to-dos

- **Copy to approve:** PR #18 CLAUDE.md Tests wording; README copy from #15; PR #5 Decisions entry; meta description; card summaries and the "This site" card + stack tags (`projects.ts`); 404 texts; assessment live-region text "Readiness score 38 out of 100: Developing." (#13).
- `.env.docker`: `AI_PROVIDER=gemini` with no `AI_MODEL` → set `openai` + `gpt-4.1-nano`; add `ADMIN_EMAIL`.
- Set the OpenAI demo project's hard limit (unverified whether done).
- Host `pg_dump` is 14.24; backups against the Postgres 15 server need 15+.
- Local clean-up: the old `admin-portal-dev_node_modules` and `admin-portal-dev_pnpm_store` volumes, an orphan anonymous volume, old images, and the unused `.pnpm-store/` in the repo root.
- jobquest J3 (when it comes): create the D1 database, the Access app and the custom domain.

## Backlog

From the original audit (§11, REPO_AUDIT, deleted) and later findings. Done items are gone; see `INTERVIEW_NOTES.md` for what was done.

| Item | State |
|---|---|
| S1 portfolio gaps | `CV_URL = null`; 2 `href: null` links; 3 `image: null` |
| S5 Biome a11y | website on; admin off |
| S6 admin E2E in CI | 124 tests, 20 files, not in CI (needs Postgres + Redis service containers) |
| S8 trim deps | the 7 unused deps from the audit are still declared; put research agents and feeds behind a flag |
| S9 showcase polish | loading, empty and error states on inbox upload → routing and section AI editing; a 60-second GIF for the README |
| C2 i18n | not started: typed string catalogue + locale-aware formatting |
| C3 Storybook/Ladle for `@repo/ui` | not started |
| C4 Lighthouse CI | code split done; no Lighthouse CI |
| C5 admin responsive pass | not started |
| C6 `middleware.ts` → `proxy.ts` | not started |
| M1 revoke old creds | optional: `.env.docker` still holds CLOUDFLARE_*_TUNNEL_TOKEN, SMTP_PASS, TURNSTILE_SECRET_KEY, NEXTAUTH_SECRET, SORTA_GEMINI_API_KEY, jobquest keys (never in the public repo) |

**Follow-ups:**

- Security: `validateUrl` follows redirects and misses ranges; the PDF parser bundles a 2017 pdf.js (CVE-2024-4367); DOCX unzip has no size limit. For the demo: PDF and DOCX uploads off, sample docs in Markdown.
- Admin demo (from 4a): chat panel refusal toast; Postgres seeding race untested; the PGlite seed transaction blocks other queries (measure in 4b); the checklist parser turns a suggestion's heading and paragraph lines into checklist items.
- Config: `lib/agents/mastra/provider.ts` defaults to openai/`gpt-4o` while `lib/config.ts` defaults to anthropic; `BUSINESS_PORTAL_URL` default `:3000` matches no dev port; "business-portal" still in two code comments; CLAUDE.md isn't Prettier-clean.
- NX: drop `^lint`; consider `actions/cache` for the NX cache.
- Before any snapshot or new public repo: `git ls-files -ci --exclude-standard` must print nothing.

## Placeholders

- Possible second Vue app: AutoProspector, analysis after jobquest J9.
