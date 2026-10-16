# Queue decoupling: removing Redis and BullMQ from admin-portal (2026-10-16)

This is a read-only investigation. No code was changed. The repo was read at `origin/main` `91d7d1d` (#20) with `git show` and `git grep`, so the working checkout, which is on another session's branch, was not touched.

**Goal (from Paul):**

- Remove Redis and BullMQ from `apps/admin-portal`.
- Keep the Mastra research agents, running on the in-process `JobQueue`.
- Park the feeds and database backup features.

All paths below are relative to `apps/admin-portal/` unless they start with a repo-root name (`.github/`, `docs/`, `CLAUDE.md`, and so on).

---

## Summary

- **Redis has five uses:**
  1. The `JobQueue` BullMQ driver.
  2. Three agent queues that use BullMQ directly.
  3. Two repeatable-job schedulers: feeds and backups.
  4. One pub/sub channel for the live research log.
  5. The optional Redis rate limiter.

  Everything goes through `lib/redis.ts`, the only file that imports `ioredis`.
- **None of the 9 files in `lib/agents/queue/` uses `JobQueue` today.**
  - Three create BullMQ `Queue`s and `Worker`s.
  - One registers BullMQ repeatable jobs.
  - One publishes to Redis.
  - The other four are glue (`init.ts`, `trigger.ts`, `log-channel.ts`) or Redis-free (`log-tool-calls.ts`).
- **The live research log has no browser consumer.**
  - Nothing in the UI opens the SSE route `agent-runs/[runId]/logs`.
  - The research toolbar already shows the log by polling `GET …/agent-runs?status=started` every 3 s and reading the `log` JSONB that `run-logger.ts` writes to `admin_agent_runs`.
  - So the "database plus polling" replacement already exists. The Redis half (publish, channel, SSE route) can simply be deleted.
- **No UI exposes cron schedules.**
  - The column `admin_agent_tasks.cronSchedule` can only be set through the agent-task API.
  - It is synced into BullMQ only at process start.
  - The `/scheduler` page just redirects to `/todos`.
  - The "default cron schedule" setting is shown in Settings, but nothing reads it.
- **Defects found that matter for the move** (details in §2):
  - The agent workers never attribute AI spend to a user (no `enterAiUser`).
  - Cancel doesn't stop a running agent, which then overwrites `cancelled` with `completed`.
  - A run left `started` by a restart blocks its task for good, because `trigger` refuses while a run is `started`.

---

## 1. Every file that imports `bullmq`, `ioredis` or `lib/redis.ts`

| File | Imports | Uses | Why |
|---|---|---|---|
| `lib/redis.ts:1` | `ioredis` | Connection factory: `getRedis()` shared connection (`:28-31`), `createDedicatedRedis()` for subscribers (`:37-43`), `closeRedis()` (`:46-51`). Throws `RedisDisabledError` when `QUEUE_DRIVER=memory` (`:19-20`) | The only place a Redis connection is opened. Uses `maxRetriesPerRequest: null` because BullMQ workers require it (`:21-24`) |
| `lib/queue/bullmq.ts:1-2` | `bullmq` (`Queue`, `Worker`, `Job`), `getRedis` | `Queue` with exponential backoff and `removeOnComplete`/`removeOnFail` (`:20-31`); dedupe by clearing a finished job with the same id (`:33-44`); `Worker` (`:46-70`); `drained()` polls `getJobCounts` every 100 ms (`:72-79`) | The BullMQ implementation of `JobQueue`, picked by `lib/queue/index.ts:19-21` when `QUEUE_DRIVER=bullmq` |
| `lib/agents/queue/research-queue.ts:1,6` | `bullmq`, `getRedis` | `Queue` `mr-research` (`:19-30`: 2 attempts, 5 min exponential backoff); `Worker` with concurrency 1 (`:35-155`); `completed`/`failed` listeners (`:158-163`) | Research agent jobs, bypassing `JobQueue` |
| `lib/agents/queue/ingestion-queue.ts:1,6` | `bullmq`, `getRedis` | `Queue` `mr-ingestion` (`:25-36`: 2 attempts, 1 min backoff); `Worker` (`:41-121`) | Ingestion agent jobs (PDF/CSV into findings) |
| `lib/agents/queue/analysis-queue.ts:1,13` | `bullmq`, `getRedis` | `Queue` `mr-analysis` (`:24-34`: 2 attempts, 5 min backoff); `Worker` (`:175-449`) | Analysis agent jobs (findings into workspace sections) |
| `lib/agents/queue/run-logger.ts:6` | `getRedis` | Pub/sub **publish** on `agent-run-log:<runId>` (`:15-25`); a no-op when Redis is off (`:16`) | Live run log; the same entries also go to the DB (`:36-48`, `:71-82`) |
| `app/api/workspaces/[id]/research/agent-runs/[runId]/logs/route.ts:7` | `createDedicatedRedis` | Pub/sub **subscribe** (`:43`, `:79-91`), streamed as SSE with a 30 s heartbeat and a 10 min timeout (`:11-12`, `:57-104`); 503 without Redis (`:38-40`) | Live log stream. No client uses it (§4) |
| `lib/feeds/queue.ts:1,3` | `bullmq` (`Queue`), `getRedis` | `Queue` `feed-monitor`, with options from `config.queue.feedMonitor` (`:8-19`) | Holds the feed scheduler |
| `lib/feeds/worker.ts:1,6` | `bullmq` (`Worker`), `getRedis` | **Job scheduler** `upsertJobScheduler('feed-check', { pattern: '*/15 * * * *' })` (`:21-25`); `Worker` that fetches every enabled feed (`:27-94`) | Scheduled RSS/page polling |
| `lib/db/backup-worker.ts:1-2` | `bullmq` (`Queue`, `Worker`), `getRedis` | **Job scheduler** `db-backup-schedule` at `0 8,20 * * *` (`:17-25`); `Worker` running `createBackup` + `pruneOldBackups` (`:27-48`) | Twice-daily `pg_dump` |
| `lib/rate-limit/redis.ts:2` | `getRedis` | Sorted-set sliding window: `zremrangebyscore`/`zcard`/`zrange` (`:22-27`), `zadd`/`pexpire` (`:41-44`), `del` (`:49`) | `RATE_LIMIT_DRIVER=redis`, so several instances share limits |
| `lib/rate-limit/index.ts:3` | `./redis` (`RedisRateLimiter`) | Picks the driver (`:17-18`) | Default is memory |
| `lib/queue/contract.test.ts:2` | `closeRedis` | Redis half of the `JobQueue` contract suite, gated by `TEST_REDIS_URL` | Test |
| `lib/rate-limit/contract.test.ts:2,4` | `closeRedis`, `RedisRateLimiter` | Redis half of the limiter contract, gated by `TEST_REDIS_URL` | Test |
| `test/document-flow.integration.test.ts:116` | `closeRedis` (dynamic) | Teardown when `FLOW_DRIVERS=postgres` (`:19-27`) | Test |
| `lib/db/backup-worker.test.ts:56`, `lib/feeds/worker.test.ts:153` | `bullmq` (dynamic, mocked) | Assert `Worker` and `upsertJobScheduler` call shapes | Test |
| `lib/redis-free.test.ts:16-22` (mocks) | `vi.mock('ioredis')`, `vi.mock('bullmq')` | Proves nothing connects under `QUEUE_DRIVER=memory`; imports the 16 Redis-adjacent modules (`:34-49`) | Test |

**Indirect dependants.** These don't import Redis themselves but exist because of it:

- `lib/drivers.ts:32-46` (`queueDriver`, `redisEnabled`, `rateLimitDriver`).
- `lib/queue/index.ts:19-21`.
- `lib/instrumentation-node.ts:17-46`.
- `app/api/workspaces/[id]/research/agent-runs/[runId]/cancel/route.ts:50-74`, which calls BullMQ `getJobs` and `remove` on the three agent queues.
- `lib/agents/queue/scheduler.ts:13-37`, which calls BullMQ `getRepeatableJobs`, `removeRepeatableByKey` and `add({ repeat })`.

---

## 2. `lib/agents/queue/`: all 9 files

None of them goes through `lib/queue`'s `JobQueue`.

| File | Today | What it needs for `InProcessQueue` |
|---|---|---|
| `init.ts` | Starts the 3 BullMQ workers and `syncSchedules()` (`:12-23`). Called only when Redis is on (`lib/instrumentation-node.ts:43-46`, after the `redisEnabled()` and demo returns at `:27-38`) | Register the three `JobQueue` processors. Move the call above the `!redisEnabled()` return in `instrumentation-node.ts`, or that return goes away with Redis. Decide whether research stays off in demo mode (`lib/demo.ts:22`, `:70`). Drop `syncSchedules`, or replace it (see `scheduler.ts`) |
| `trigger.ts` | `getXQueue().add(name, data, { jobId: '<type>-<taskId>-<Date.now()>' })`, returns `job.id!` (`:5-36`). The id is unique per call, so it never dedupes | `createJobQueue(...).add()` returns `void` (`lib/queue/types.ts:45`). Build the id before calling `add` and return it. Callers only echo it in JSON (`…/agent-tasks/[taskId]/trigger/route.ts:63-74`, `generate-report/route.ts:45`, `ingest/route.ts:75`) |
| `research-queue.ts` | Direct BullMQ `Queue` + `Worker`. The processor returns `{ runId, findingsCount }` (`:141`), which only BullMQ stores | Replace with `createJobQueue<ResearchJobData>('mr-research', { attempts: 2, backoffDelayMs: 300_000 })` plus `process(handler, { concurrency: 1 })`. Drop the return value. Call `enterAiUser(userId)` at the start of the handler (see **Attribution** below). Note: each attempt inserts a new `admin_agent_runs` row (`:53-57`), so a retry leaves a `failed` run plus a new one. That's the same as today |
| `ingestion-queue.ts` | Same pattern; `mr-ingestion`, 1 min backoff (`:25-36`) | Same changes. The handler reads `filePath` from the uploads dir, which is unaffected |
| `analysis-queue.ts` | Same pattern; `mr-analysis`, 5 min backoff (`:24-34`). Returns `{ sectionsWritten }` (`:243`, `:438`) | Same changes. 462 lines, but only `:1`, `:13`, `:21-34`, `:172-177` and `:449-460` are BullMQ |
| `scheduler.ts` | BullMQ repeatable jobs from `admin_agent_tasks.cronSchedule` (§3) | `JobQueue` has no repeat (`lib/queue/types.ts:7-9`). Drop it (recommended, §3), or add a small in-process cron |
| `run-logger.ts` | DB append to `admin_agent_runs.log` (`:36-48`, `:71-82`) **plus** Redis publish (`:15-25`, `:51`, `:84`, `:91`) | Delete `publish()` and `publishRunComplete`'s body, and the `getRedis`/`redisEnabled`/`log-channel` imports. The DB writes stay. `publishRunComplete` is also called by the cancel route (`cancel/route.ts:47`) |
| `log-channel.ts` | Builds the Redis channel name (`:5-7`) | Delete |
| `log-tool-calls.ts` | Turns Mastra steps into `publishToolCall` entries (`:8-53`). No Redis | No change |

### Changes the move needs beyond swapping the queue

- **Attribution (money).**
  - `enterAiUser` is called only in the document and routing workers (`lib/document-processing/worker.ts:49`, `lib/workspace-routing/worker.ts:20`). None of the agent workers call it.
  - Outside demo mode, agent AI calls are therefore priced but not counted against the user's daily cap.
  - In demo mode the guard refuses unattributed calls, so the agents would fail if research were ever enabled there.
  - Mastra's model does go through the guard: `lib/agents/mastra/provider.ts:19-22` wraps it in `guardLanguageModel`.
- **Cancel** (`…/agent-runs/[runId]/cancel/route.ts`).
  - It marks the run `cancelled` (`:40-43`), then tries to `remove()` BullMQ jobs with the same `taskId` (`:50-68`). BullMQ can't remove an active, locked job, and the agent keeps running.
  - The workers then set `status: 'completed'` or `'failed'` at the end (`research-queue.ts:107-115`, `:144-147`), overwriting `cancelled`.
  - `InProcessQueue` has no remove or inspect API. The simplest correct version is cooperative: the handler checks the run's status between steps, or passes an `AbortSignal` to `agent.generate()`, and only writes `completed` when the run is still `started`.
- **Restart recovery.**
  - `lib/queue/recover.ts:31-56` re-queues only documents and inbox items. An agent run interrupted by a restart stays `started` forever.
  - The trigger route then answers 429 for that task (`…/trigger/route.ts:47-50`), so it can never run again.
  - Add a boot step that marks `started` runs `failed` ("interrupted by restart"). Don't re-run them: an agent run spends money.
- **Retry delay.** Five-minute in-memory backoff timers are lost on restart, along with the job. That's acceptable once recovery marks the run failed.
- **Tests.** There are none for `lib/agents/**` today (see `test-audit-report.md` §6: 0–24% lines per file). Characterisation tests should come before this move (§7).

---

## 3. `scheduler.ts`: cron schedules

**Storage.**

- `admin_agent_tasks.cronSchedule varchar(100)`, nullable (`lib/db/schema/research.ts:84`), next to `status` (`:83`; `paused` skips it).
- There's also an unused default: `marketResearch.defaultCronSchedule` (`lib/config.ts:71`, default `'0 2 * * *'` at `:154`). It's stored in research settings (`lib/db/schema/research.ts:180`), returned by `lib/agents/settings.ts:27`, and editable on the Settings page (`app/(authenticated)/settings/settings-view.tsx:93`, `:273-274`). Nothing applies it to a task.

**Creation.** `syncSchedules()`, `lib/agents/queue/scheduler.ts:11-41`:

1. Removes every repeatable job on `mr-research` and `mr-analysis` (`:13-18`).
2. Loads tasks with a non-null `cronSchedule` (`:21-24`), skipping `paused` ones (`:27`).
3. Adds a repeatable job with `repeat: { pattern }` and `jobId: 'scheduled-<taskId>'` (`:30-37`).

Ingestion tasks are never scheduled.

**When it runs.** Only at start-up (`lib/agents/queue/init.ts:17`), and only under BullMQ outside demo mode. The doc comment says "whenever task schedules change" (`scheduler.ts:9`), but nothing calls it from the task routes. A schedule edit takes effect only after a restart.

**UI and API exposure.**

- **API:**
  - `POST /api/workspaces/[id]/research/agent-tasks` accepts `cronSchedule` (`…/agent-tasks/route.ts:43`, `:65`).
  - `PATCH …/agent-tasks/[taskId]` sets it (`…/[taskId]/route.ts:27`, `:34`).
  - Neither validates the cron string.
- **UI:**
  - None. No component sends `cronSchedule`. The research toolbar creates tasks with only `{ agentType, name }` (`components/research/research-toolbar.tsx:93-97`).
  - `/scheduler` (`app/(authenticated)/scheduler/page.tsx`) is a redirect to `/todos`, although `lib/demo.ts:27,61` lists it as "Agent schedules".

**Recommendation.** Drop scheduling when the agents move.

- Keep the column. Removing it is a migration, and it holds data.
- Stop reading it, and remove `scheduler.ts` and `syncSchedules`.
- Optionally hide the unused Settings field.

If schedules are wanted later, a small in-process scheduler would do:

- `croner` or `setInterval` over the tasks, re-read whenever a task is created or patched.
- It runs in a single process only, which `InProcessQueue` already requires.

---

## 4. The live research log

**Publish side.**

- `lib/agents/queue/run-logger.ts`: `publishRunLog` (`:28-52`) and `publishToolCall` (`:55-85`) each do two things:
  1. Append an entry to `admin_agent_runs.log` (JSONB `COALESCE(log, '[]') || entry`).
  2. `PUBLISH` it on `agent-run-log:<runId>` (`log-channel.ts:5-7`).
- `publishRunComplete` (`:87-92`) only publishes `{ done, status }`.
- Callers: the three workers, `log-tool-calls.ts:36,46`, and the cancel route (`cancel/route.ts:46-47`).

**Subscribe side.**

- `app/api/workspaces/[id]/research/agent-runs/[runId]/logs/route.ts`:
  - Checks workspace ownership (`:26-34`).
  - Opens a dedicated subscriber (`:43`) and forwards each message as `data: …` SSE (`:79-91`).
  - Closes on `done` (`:84-87`), with a 30 s heartbeat (`:71-77`) and a 10 min timeout (`:59-69`).
  - Returns 503 without Redis (`:38-40`).

**Browser side.**

- **No consumer.** No `EventSource` in the admin app, and no fetch of `/logs`. The only reference to the route outside it is `lib/demo.test.ts:85` and `lib/redis-free.test.ts:48`.
- What the user actually sees comes from polling: `components/research/research-toolbar.tsx:57-81` fetches `GET /api/workspaces/[id]/research/agent-runs?status=started` every 3 s while runs are active (10 s otherwise).
- That route selects the full run rows (`…/agent-runs/route.ts:31-34`), including `log`.
- The toolbar shows the newest entry (`:166-169`) and the last 5 per run (`:317-319`).

**Options.**

| Option | Work | Trade-offs |
|---|---|---|
| **DB log rows + polling (recommended)** | Already built. Delete `publish()`, `log-channel.ts`, the `logs` SSE route and its demo and test entries | Up to 3 s latency, which the UI has today anyway. Survives restarts and works for any number of tabs. Appending to the JSONB rewrites the row on each entry; fine at tens of entries per run. Only `started` runs are polled, and history stays available through `GET …/agent-runs/[runId]` |
| In-memory `EventEmitter` + SSE | Keep the route, swap Redis for a process-wide emitter on `globalThis` (as `lib/queue/index.ts:11` does for queues), and add a client `EventSource` | Sub-second updates, but there's no client today, so it adds a UI change as well. Lost on restart, and single-process only. Two sources of truth for the same log |

**Recommendation.** DB plus polling. It's what the UI already uses. The removal is pure deletion, and the result is restart-safe, which the in-process queue isn't.

---

## 5. Feeds and backups: everything involved

### Feeds

| Kind | Items |
|---|---|
| Pages | `app/(authenticated)/feeds/page.tsx`, `feeds-view.tsx`, `add-feed-dialog.tsx` |
| API routes | `app/api/feeds/route.ts` (GET, POST), `app/api/feeds/[id]/route.ts` (GET, PATCH, DELETE), `app/api/feeds/[id]/check/route.ts` (POST: fetches and ingests inline, with no queue: `:7-8`, `:42-43`) |
| Nav | `components/layout/Sidebar.tsx:36` (`Feeds`, `/feeds`). Persisted nav order filters out stale entries (`:59-62`), so removing the item is safe |
| Library | `lib/feeds/fetcher.ts`, `rss-parser.ts`, `ingest.ts` (creates `admin_documents` with `source: 'feed'`, inbox items and feed items, then `queueDocument`: `:11`, `:56`, `:75`, `:90`, `:100`), `types.ts`, `queue.ts`, `worker.ts` |
| Worker and schedule | `lib/feeds/worker.ts:21-25` (every 15 min, for every enabled feed; the per-feed `intervalMinutes` is stored and shown but ignored), started from `lib/instrumentation-node.ts:42,45` |
| Tests | `lib/feeds/fetcher.test.ts`, `ingest.test.ts`, `rss-parser.test.ts`, `worker.test.ts`; mentions in `lib/redis-free.test.ts:38-39`, `lib/instrumentation-node.test.ts:26-31`, `lib/demo.test.ts:53-55`, `middleware.test.ts:79`. No E2E |
| Config | `lib/config.ts:62-68` (type), `:144-150` (defaults), `:197-201` (settable keys `queue.feedMonitor.*`); `lib/config.server.test.ts:64` |
| Demo switch | `lib/demo.ts:21` (feature), `:58` (`/feeds/**`), `:87` (`/api/feeds/**`) |
| Schema | `admin_feeds` and `admin_feed_items` (`lib/db/schema/research.ts:193-228`; `drizzle/0000_baseline.sql:329`, `:340`, FKs `:548-551`, index `:612`) |
| Shared with core | `admin_documents.source = 'feed'` is handled in `lib/document-processing/worker.ts:75,88`, `app/api/documents/[id]/retry/route.ts:44`, `documents/batch/route.ts:56` and `documents/reprocess-all/route.ts:44`. Keep these while feed documents exist in any database |
| Env vars | None specific |

### Backups

| Kind | Items |
|---|---|
| Pages | `app/(authenticated)/backups/page.tsx` (`requireAdmin()`, `:8`), `backups-view.tsx` |
| API routes | `app/api/backups/route.ts` (GET list, POST create; `requireAdminApi`), `app/api/backups/[filename]/route.ts` (GET download, DELETE) |
| Nav | `components/layout/Sidebar.tsx:48` (`Backups`, `adminOnly`) |
| Library | `lib/db/backup.ts`: `pg_dump` into `BACKUP_DIR = ../../backups` (`:8`), keeps 14 (`:9`), needs `DATABASE_URL` (`:34-35`), passes `PGPASSWORD` (`:68`); doesn't work on PGlite |
| Worker and schedule | `lib/db/backup-worker.ts:17-25` (08:00 and 20:00), started from `lib/instrumentation-node.ts:41,44` |
| Tests | `lib/db/backup.test.ts`, `lib/db/backup-worker.test.ts`, `e2e/backups.spec.ts` (runs as a `member`, so it can't reach the page: `test-audit-report.md` risk 4); mentions in `lib/redis-free.test.ts:40`, `lib/instrumentation-node.test.ts:20-25`, `lib/demo.test.ts:72,80-81`, `middleware.test.ts:79` |
| Demo switch | `lib/demo.ts:20`, `:57`, `:86` |
| Build | `next.config.ts:30-33` (excludes `../../backups/**` from tracing), `scripts/prune-standalone.mjs:4,21,37-38,56` (prunes `backups/` from the standalone output) |
| Schema | None: backups are files |
| Env vars | `DATABASE_URL` (shared). Host needs `pg_dump` 15+ (CLAUDE.md) |
| Not a backup | `app/api/workspaces/export/route.ts:62` names its JSON export `workspaces-backup-<date>.json`. That's the workspace export, which stays |

**Parking options.**

- **(a) Recommended: delete the pages, routes, nav items, workers, instrumentation calls, config keys, demo entries and tests.** **Done in #25** (after tagging `full-stack-v1` at `492cd46`). Follow-up: `fast-xml-parser` is now unused in `apps/admin-portal/package.json`.
  - Keep `admin_feeds` and `admin_feed_items`, and the `'feed'` document-source handling.
  - Git history keeps the code.
- **(b) Keep the code behind a flag.** It still needs a scheduler without Redis, so it doesn't save the work.

Dropping the two tables can be a later migration, once Paul decides.

---

## 6. Everything else that needs Redis

| Area | Where | What changes |
|---|---|---|
| Driver selection | `lib/drivers.ts:7-11,18-19,32-46` (`QUEUE_DRIVER`, `redisEnabled`, `RATE_LIMIT_DRIVER`); `lib/drivers.test.ts` (18 refs) | `queueDriver` and `redisEnabled` go, or become constants. `RATE_LIMIT_DRIVER` goes |
| Rate limiting | `lib/rate-limit/redis.ts`, `index.ts:1-3,17-18`, `types.ts:3`, `contract.test.ts` (Redis half), `memory.test.ts:4` (comment) | Memory only. Limits become per process, which is right for a single instance |
| Queue seam | `lib/queue/bullmq.ts`, `index.ts:2,19-21`, `types.ts:1-10,29-31` (`removeOnComplete`/`removeOnFail` are BullMQ-only), `in-process.ts:6`, `recover.ts:19` (comments), `contract.test.ts` (Redis half) | Keep the `JobQueue` interface with a single implementation (it keeps the test seam) |
| Start-up | `lib/instrumentation-node.ts:17,27-46` | Always run `recoverInterruptedJobs()`; register agent processors; no feed or backup workers |
| Start-up checks | `lib/startup-checks.ts` | No Redis references. A misconfigured `QUEUE_DRIVER` currently throws in `lib/drivers.ts:25`, not here |
| Redis-free proof | `lib/redis-free.test.ts` (whole file) | Becomes moot. Delete it, or keep a smaller "no `ioredis`/`bullmq` in the bundle" check |
| Instrumentation test | `lib/instrumentation-node.test.ts:20-36,43-44` | Rewrite for the new start-up |
| Integration test | `test/document-flow.integration.test.ts:12-27,114-117` (`FLOW_DRIVERS=postgres` needs `TEST_REDIS_URL`) | Postgres-only variant without Redis |
| Isolation test | `test/isolation.integration.test.ts:16` sets `QUEUE_DRIVER=memory` | Remove the line |
| Worker test | `lib/document-processing/worker.test.ts:709` (comment about BullMQ job ids) | Comment only |
| Dev scripts | `scripts/with-dev-env.ts:10,30,33` (builds `REDIS_URL`); `scripts/dev-lite.ts:2,11,24`, `dev-demo.ts:26`, `demo/build-seed.ts:23` (set `QUEUE_DRIVER=memory`) | Remove the Redis lines |
| Docker compose | `docker-compose.yml:2,5,9,41-53,71` (`redis` service, `REDIS_PASSWORD`, `redis_data` volume) | Remove the service and volume. `dev:full` becomes Postgres (+ optional Ollama) |
| Dockerfile | No Redis references | — |
| Package | `package.json:39` `bullmq`, `:45` `ioredis`; `next.config.ts:38-39` (`serverExternalPackages`) | Remove all of them |
| E2E | `playwright.config.ts:35` (comment), `e2e/inbox-workflow.spec.ts:8-9`, `e2e/document-upload.spec.ts:10-11` (pre-condition comments) | Comments |
| CI | `.github/workflows/ci.yml:36-48` (Redis service), `:91` (`TEST_REDIS_URL`), `:93` (comment) | Remove them. Admin E2E in CI then needs only Postgres |
| NX | `nx.json:80` (`TEST_REDIS_URL` input of `test`) | Remove |
| Env example | `.env.docker.example:9,17-21,34,38,127-131` | Remove `REDIS_PASSWORD`, `QUEUE_DRIVER` and `RATE_LIMIT_DRIVER` |
| CLAUDE.md | Lines 8, 47, 70, 74-80, 84, 90, 95, 98, 157, 163-164, 177, 199, 225, 234, 238 | Rewrite the "doesn't run under memory" section, Services table, env list and Infrastructure |
| README.md | Lines 111-117, 124, 147, 192 | Same |
| TESTING.md | Lines 71, 79, 82-91, 111 | Same |
| Website copy | `apps/website/src/lib/data/projects.ts:51` (stack tag `Redis/BullMQ`) | User-facing copy: Paul approves the new wording |
| `docs/audit/dependency-updates.md` | `:44` (bullmq + ioredis group), `:136` (step 4: "Research agents only run under `dev:full` (BullMQ)"), `:139` (step 7: the whole BullMQ + ioredis step) | Step 7 disappears. Step 4's note changes |
| Other audit docs | `testauditinstruct.md` §2 driver-integration row, §4 BullMQ row; `test-audit-report.md` §6 and §7 (step 7) | Update once the plan is decided |

---

## 7. Effort estimates

S = up to 2 hours, M = half a day to a day, L = more than a day.

| Step | Effort | Contents |
|---|---|---|
| **Phase 0: test fixes** | **S** (plus **M** for agent tests) | (1) `mockReset: true` in `vitest.config.ts`, which fixes 4 order-dependent files (measured in `test-audit-report.md` §6), plus local fixes in `seed-admin`, `pglite`, `instrumentation-node` and `document-flow`: S. **Done in #22.** (2) Characterisation tests for the three agent workers, with `MockLanguageModelV3` through the guard: run row created, log entries written, findings counted, status `completed`/`failed`. There are none today, and they are the gate for the agents move: M. **Done in #24** (`lib/agents/queue/workers.test.ts`; `lib/agents/**` 4.1% → 56.2% lines). The MOVE assertions there are the move's checklist: flip the attribution assertion, and turn the two `test.fails` (cancel, restart recovery) into `it` |
| **Park feeds and backups** | **M** | Mostly deletion: 25 files (§5: feeds 16, backups 9) plus edits to `Sidebar.tsx`, `demo.ts`/`demo.test.ts`, `middleware.test.ts`, `instrumentation-node(.test).ts`, `redis-free.test.ts`, `config.ts`/`config.server.test.ts`, `next.config.ts` and `prune-standalone.mjs`. No migration. `demo.test.ts` checks every route is classified, so the route list and the files must change together **Done in #25.** |
| **Move the agents to `JobQueue`** | **M** (L with in-process cron) | Three queues on `createJobQueue`, `trigger.ts` ids, `enterAiUser` in each handler, cooperative cancel that doesn't overwrite `cancelled`, boot recovery for `started` runs, delete the publish and SSE path (§4), drop `scheduler.ts` (§3), and register the processors in `instrumentation-node.ts`. A decision for Paul: research stays off in demo mode (`lib/demo.ts:22`)? **Done in #26** (draft). Found there: on PGlite in a non-UTC time zone, `startedAt` (`timestamp` without time zone, `defaultNow()`) reads back hours ahead, so the trigger cooldown refuses a task for ~10 h in AEST. Fixed in #27 (PGlite starts with TimeZone=UTC; timestamptz migration after the upgrades). Also: the allowance-coverage `EXEMPT` entry for the cancel route is stale (protected; needs sign-off). |
| **Remove Redis and BullMQ** | **M** | **Done in #28.** `lib/redis.ts`, `lib/queue/bullmq.ts`, `lib/rate-limit/redis.ts`, the driver switches, the Redis halves of both contract suites, `redis-free.test.ts`, compose, scripts, CI, NX, env example, packages, `next.config.ts`, and CLAUDE.md/README/TESTING.md/dependency plan (§6). The docs are about half of the work. The website stack tag needs Paul's copy approval |

**Order.** Phase 0, then parking feeds and backups, then moving the agents, then removing Redis. After the agents move, nothing but the `JobQueue` driver and the rate limiter uses Redis, so the last step is mechanical.

**Consequence to record.** After the change the admin portal is single-instance by design:

- in-process queue;
- per-process rate limits;
- queued jobs are lost on restart (recovery covers documents, inbox items and, once added, agent runs).

That matches the current demo plan: one Cloud Run instance, `--max-instances=1`.

---

## Backlog

Found while writing the Mastra tool tests (#29). Not fixed yet.

- **Scraper source dedupe ignores the workspace.** `lib/agents/mastra/tools/scraper.ts` checks `adminResearchSources.url` across every workspace and user before saving a scraped page as a source, though its comment says "for this workspace". If any workspace saved the URL first, scraping it from another workspace saves no source there. Fix: add `workspaceId` (and `userId`) to the lookup.
- **A repeated finding keeps its first run.** `save-finding` (`lib/agents/mastra/tools/db-writer.ts`) upserts on `(workspaceId, contentHash)` and only updates `confidenceScore` and `foundAt`. A later run that finds the same content leaves `agentRunId` on the first run, so the later run's `findingsCount` (counted by `agentRunId`) doesn't include it. Decide whether a run should count findings it re-found, then either update `agentRunId` or count differently.
- **`lib/ai/guard.test.ts` depends on test order (protected test).** With `--sequence.shuffle --sequence.seed=604522109`, "refuses an unattributed call in demo mode" and "attributes with enterAiUser … without leaking to the caller" fail: they get `AiBudgetError` where they expect `AiAttributionError`. It reproduces on `main` (react-markdown 9.1.0), and even when the failing test runs first. Found while gating #32; CI's shuffled step is non-blocking, so it went unseen. Needs Paul's sign-off to change.
- **Posts from the same day have no stable order (website).** `getAllPosts` in `apps/website/server/index.ts` sorts with `a.date > b.date ? -1 : 1`, which never returns 0. Two posts with the same `date` can swap places on `/writing` between builds, depending on file order. The posts API test (#32) only uses distinct dates. Fix: return 0 for equal dates and break ties on something fixed, such as the slug, then add a same-day case to `server/index.test.ts`. Found by the code review of #32.
- **The admin standalone output traces the whole project** (`app/`, `components/`, `e2e/`, `test/`, `scripts/`, about 150 MB) because of dynamic filesystem access in `lib/storage/index.ts:13,20` (`uploadsDir()`). It was already so on Next 16.2.1 and is still so on 16.4.2. Fix: `/*turbopackIgnore: true*/` on those calls, or a statically scoped path. Then compare image size and contents. Found in #36. Side effect: after a local `pnpm build`, `.next/standalone` holds copies of every test file, and `pnpm test` runs them too (19 failing files). CI isn't affected, because it tests before it builds. Add `.next/**` to the admin Vitest `exclude` in the same fix.
