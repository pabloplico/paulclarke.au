# Status

**Last checked at #50** (2026-10-16). One snapshot of where things stand, not a log: git history and the PRs hold the history. CLAUDE.md wins on how the repo works; TESTING.md holds the protected tests and the full-gate rules.

**Other files:** `IMPORT_PLAN.md` (jobquest J0–J8) and `../decisions.md` (design decisions, linked from the README). Local only, gitignored: `*.local.md` (interview notes, role fit).

## Priority

Frontend first (Paul, 2026-10-16): the repo is a portfolio for a frontend role. Backend hardening only when a visible feature needs it.

## In flight

- **jobquest J4** (`IMPORT_PLAN.md`): next, help and "How it works". J1 (scaffold), J2 (jobs and skills, the first clickable milestone) and J3 (analytics and taxonomy) are done. Vue 3 rebuild, with TanStack Query and Table since J2.
- **Dependencies:** done for now. `pnpm audit --prod` is 0 critical, 0 high, 1 moderate (`sprintf-js` via `mammoth` → `argparse`, mammoth's command-line tool, not used; no fix exists), 0 low. Remaining majors (AI SDK 7, Biome 2.5, TypeScript 7, `lucide-react` 1, pdf-parse 2, `diff` 9) wait for a reason or for Renovate.

## Decisions (Paul)

- The website is a developer portfolio only.
- Two demo apps, admin-portal and jobquest, each on its own subdomain behind Cloudflare Access (email PIN). The portfolio stays public.
- Demos use real AI with per-user rate limits, a daily spend cap and the provider's hard limit. The admin demo stays multi-user.
- jobquest: front end in Vue 3, server on a Vite + Hono + D1 Worker (`IMPORT_PLAN.md` A5).
- admin-portal demo: PGlite + in-process queues, one instance. Host undecided (below).
- CRM features and PDF support stay.

## Open: admin demo hosting

Undecided between Cloud Run, Cloudflare Containers and self-hosting behind a Tunnel. Whichever host:

- **One instance**, with CPU outside requests (document processing runs after the response), and 2 GiB of memory.
- **Boot from a PGlite snapshot baked into the image.** Never run `drizzle-kit` at runtime: it costs about 3 s and 400 MB. A restart is then a clean reset; something has to trigger resets.
- **The provider's hard limit is the real spend cap:** the in-app daily counters reset on restart.
- Plus a deploy job, the Access app and the subdomain.

## Paul's to-dos

- **Copy to approve:** meta description; card summaries and the "This site" card + stack tags (`projects.ts`); 404 texts; assessment live-region text.
- Set the OpenAI demo project's hard limit (unverified).
- Delete the old Cloud Run service for the website (from about 2026-10-21).
- Local clean-up: old Docker volumes and images from the removed app container, and the unused `.pnpm-store/` in the repo root.

## Backlog (frontend first)

- **S1 portfolio gaps:** `CV_URL = null` (`HeroSection.tsx`); 2 `href: null` links and 3 `image: null` in `projects.ts`.
- **C3 Storybook (or Ladle) for `@repo/ui`.**
- **C2 i18n:** typed string catalogue and locale-aware formatting.
- **C4 Lighthouse CI.**
- **S5 admin a11y:** Biome a11y rules are off in the admin portal.
- **S9 showcase polish:** loading, empty and error states in the inbox and AI editing; a 60-second GIF for the README.
- **C5 admin responsive pass.**

**Backend, parked:**

- Test prune: the branch is kept at the `archive/prune-delete-set` tag. If it's redone, do it from `main` as a full-gate PR, with PGlite replacements for the user-isolation and `inbox/[id]/approve` route tests in the same PR.
- `lib/agents/mastra/` still has that name because the protected `pricing.test.ts` imports from it; renaming needs sign-off.
- Bugs: the scraper's source dedupe ignores the workspace (`tools/scraper.ts`); same-day blog posts have no stable order (`apps/website/server/index.ts`, `getAllPosts`); the admin standalone output traces the whole project, about 150 MB, because of `uploadsDir()` in `lib/storage/index.ts`.
- C6 `middleware.ts` → `proxy.ts`.
