# Test prune backlog (from `test/prune-delete-set`)

Written 2026-10-16. Status checked against `main` at `2e063f4`, after #42.

## Where this came from

- **The branch:** `test/prune-delete-set` was never pushed and never had a PR. It is kept as the tag `archive/prune-delete-set`, at `f553b16`. Its base is `425d3f4`.
- **Commit `2ed11db`:** "delete 24 test files that check mocks, not behaviour" (178 tests). These are the DELETE set in `TEST_AUDIT.md` §2.
- **Commit `f553b16`:** "drop 17 single tests that pin implementation details", from 8 files the audit marked KEEP.
- **Reasons:** each one-line reason below is from the branch's commit messages, or the `TEST_AUDIT.md` row they cite.

**Status, against `main`:**
- **still-exists:** unchanged since `425d3f4`.
- **changed-since:** the file has been edited since `425d3f4`.
- **already-gone:** the file was deleted on `main` since.

To see exactly what the branch did: `git show archive/prune-delete-set~1` (the deletions) and `git show archive/prune-delete-set` (the single tests).

## This becomes a full-gate PR, redone from main

- **Don't rebase or cherry-pick the archived branch.** Redo the change from current `main`. Two files have changed and four are gone since it was cut, and the commit message counts (178 tests, 17 singles) are out of date.
- **Full gate:** it deletes tests, so it follows CLAUDE.md "Change tiers".
  - "Rules for every agent" and "The gate" in `dependency-updates.md` apply.
  - Draft PR, and wait for Paul to merge.
  - Every deleted test is listed in the PR body with its reason. `pnpm test:diff` will show the assertion loss.
  - None of the files below is a protected test (`testauditinstruct.md` §3).
- **Replace, don't just delete, the fake-DB route tests for user isolation and for `inbox/[id]/approve`.** They get PGlite replacements in the same PR, per `test-audit-report.md` §8 "After upgrades": "Replace the 23–33 fake-DB route tests with PGlite route tests (TEST_AUDIT.md's REWRITE LATER list), starting with user isolation and `inbox/[id]/approve`".
  - **User isolation:** `app/api/clients/route.test.ts` (TC-011 `where`-shape checks, the only check that lists are scoped to the user) and `lib/api/resolve-params.test.ts` (ownership resolution, mocked). Extend `test/isolation.integration.test.ts` (on `main` since #20) rather than starting a new file.
  - **`app/api/inbox/[id]/approve/route.test.ts`** (28 tests, mocked DB): rebuild on PGlite, with one case per section template plus the status transitions.
  - None of these three was in the archived branch. They're REWRITE LATER in `TEST_AUDIT.md`. The rule here is that this PR doesn't remove fake-DB coverage of isolation or approve without its PGlite replacement landing alongside.
- **Two more replacements to keep in view:**
  - `parsers/pdf.test.ts` and `parsers/docx.test.ts` mock `pdf-parse` and `mammoth`. `TEST_AUDIT.md` says to replace them with real fixtures (§3 gap 6).
  - Dependency step 8 (pdf-parse 2) relies on PDF coverage, so the PDF fixture test must exist before the mocked one goes.
- **Timing:** step 4 (drizzle) leans on PGlite tests rather than the fake-operator route tests, so the PGlite replacements are worth having before step 4, not only before this prune.

## Files deleted (24, commit `2ed11db`)

Paths are relative to `apps/admin-portal/`. "Tests" is the count on `main` today.

| File | Tests | Reason | Status |
|---|---:|---|---|
| `app/api/communications/route.test.ts` | 15 | Fake `where` shapes plus "filters by X" against a fake that returns everything | still-exists |
| `app/api/communications/[id]/route.test.ts` | 6 | Mock-only CRUD | still-exists |
| `app/api/email-templates/route.test.ts` | 10 | Mock-only CRUD | still-exists |
| `app/api/email-templates/[id]/route.test.ts` | 4 | Mock-only CRUD | still-exists |
| `app/api/lookup/abn/route.test.ts` | 6 | Composes mocked libs; the lib tests cover the parsing | still-exists |
| `app/api/lookup/address/route.test.ts` | 3 | Composes mocked libs; the lib tests cover the parsing | still-exists |
| `app/api/lookup/company/route.test.ts` | 7 | Composes mocked libs; the lib tests cover the parsing | still-exists |
| `app/api/lookup/place-details/route.test.ts` | 3 | Composes mocked libs; the lib tests cover the parsing | still-exists |
| `app/api/outreach/personalise/route.test.ts` | 8 | Asserts prompt text with a mocked model | still-exists |
| `app/api/workspaces/categories/route.test.ts` | 3 | The mock returns the answer | still-exists |
| `app/api/workspaces/[id]/sections/[sectionId]/suggest-rules/route.test.ts` | 7 | Mock wiring; "loads config via loadConfig" is an implementation detail | still-exists |
| `lib/ai/usage-logger.test.ts` | 18 | Pins log JSON fields and prefixes; the guard does the real accounting | still-exists |
| `lib/db/backup-worker.test.ts` | — | BullMQ mocked; asserts call order | already-gone (#25, backups removed) |
| `lib/document-processing/chunk-analysis.test.ts` | 5 | Batch vs parallel call counts on a mocked model; the integration test covers the pipeline | still-exists |
| `lib/document-processing/errors.test.ts` | 18 | Constructor and field checks on two error classes; the worker tests already rely on `permanent` | still-exists |
| `lib/document-processing/metadata.test.ts` | 3 | Mocked model; asserts prompt contents | still-exists |
| `lib/document-processing/parsers/docx.test.ts` | 11 | `mammoth` mocked: pass-through only. Replace with a real fixture | still-exists |
| `lib/document-processing/parsers/pdf.test.ts` | 3 | `pdf-parse` mocked. Replace with a real fixture (before dependency step 8) | still-exists |
| `lib/document-processing/queue.test.ts` | 2 | Asserts a mocked queue's job ID; the queue contract covers dedupe | changed-since (#28 dropped its BullMQ lines; it now tests the in-process queue's job IDs) |
| `lib/feeds/worker.test.ts` | — | BullMQ mocked; the aggregation is trivial | already-gone (#25, feeds removed) |
| `lib/onboarding/seed-default-workspace.test.ts` | 13 | "calls db.insert exactly 5 times"; `demo-seed/seed` covers Getting Started on PGlite | still-exists |
| `lib/rag/search.test.ts` | 9 | Mocked DB, "builds vector literal"; the integration test runs real pgvector on PGlite | still-exists |
| `lib/settings.test.ts` | 13 | Mocked DB CRUD ("calls db.select().from(adminSettings)") | still-exists |
| `lib/workspace-routing/queue.test.ts` | 3 | Mocked queue job IDs and retry config | changed-since (#28 dropped its BullMQ lines; check whether the retry-policy test still means anything) |

The two **changed-since** files still exist, but the reason was written against their BullMQ versions. Re-read them before deleting.

## Single tests dropped (17, commit `f553b16`)

From 8 files that otherwise stay. "Still there" means the test name is still in the file on `main`.

| File | Test | Reason | Status |
|---|---|---|---|
| `app/api/auth/login/route.test.ts` | "updates lastLoginAt" | Asserted a mocked `db.update` call | still-exists |
| `app/api/auth/signup/route.test.ts` | "calls seedDefaultWorkspace after user creation" | Asserted a mock call ("returns 201 even when seedDefaultWorkspace throws" stays) | still-exists |
| `lib/ai/providers.test.ts` | "logs model selection on first call only" | Pinned log output | still-exists |
| `lib/auth/index.test.ts` | "calls bcrypt.compare with (plain, hash) argument order" | Checked a call; the real `verifyPassword` tests stay | still-exists |
| `lib/db/backup.test.ts` | TC-01 | pg_dump arguments and directory listing through mocked `child_process` and `fs` | already-gone (#25, whole file) |
| `lib/db/backup.test.ts` | TC-02 | Same as TC-01 | already-gone (#25) |
| `lib/db/backup.test.ts` | TC-03 | Same | already-gone (#25) |
| `lib/db/backup.test.ts` | TC-04 | Same | already-gone (#25) |
| `lib/db/backup.test.ts` | TC-05 | Same | already-gone (#25) |
| `lib/db/backup.test.ts` | TC-06 | Same | already-gone (#25) |
| `lib/db/backup.test.ts` | TC-07 | Same (TC-08 was to stay as the positive control for TC-09's path-traversal check) | already-gone (#25) |
| `lib/gap-analysis/content-hash.test.ts` | TC-014-A5 | Pinned that key order changes the hash, a quirk | still-exists |
| `lib/rag/embeddings.test.ts` | TC-101 | `generateEmbedding` passing through a mocked `embed()`; the batching tests stay | still-exists |
| `lib/rag/embeddings.test.ts` | TC-102 | Same as TC-101 | still-exists |
| `lib/rag/embeddings.test.ts` | TC-103 | Same | still-exists |
| `lib/rag/embeddings.test.ts` | TC-104 | Same | still-exists |
| `lib/feeds/fetcher.test.ts` | TC-06 | Pinned a 30000 ms timeout value | already-gone (#25, whole file) |

## What's left to do

- **Files:** 20 still-exist and 2 changed-since. 2 are already gone (`backup-worker`, `feeds/worker`).
- **Single tests:** 9 still-exist (login, signup, providers, auth/index, content-hash TC-014-A5, embeddings TC-101 to TC-104). 8 are already gone (backup TC-01 to TC-07 and feeds TC-06, whose files were removed in #25).
- **Also already gone:** `TEST_AUDIT.md` listed backup TC-08 for dropping, but the branch kept it, and it's gone too, with the rest of `backup.test.ts`.
