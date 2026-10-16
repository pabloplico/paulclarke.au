# Spike: admin-portal on PGlite + an in-process queue

- **Date:** 2026-10-12, on branch `spike/pglite` in the private `~/Projects/business-portal` archive (not merged; the real implementation is PR #3 in the public repo).
- **Trimmed on 2026-10-16** to the measurements (§4) and the recommendation with its hosting conditions (§6), which still matter for the open admin-portal hosting decision (STATUS). §1–3 and §5 (migrations, end-to-end flow, BullMQ inventory, jobquest) were done or superseded and are gone; the migration bugs were fixed with the baseline migration and `db:check-fresh`.
- **Options compared:**
  - **A:** PGlite plus an in-process queue, on one Cloud Run instance.
  - **B:** Neon plus Upstash (managed Postgres and Redis), keeping BullMQ.
- **Since then:** option A was chosen and built (#3). Condition 6 below (port the inbox routing queue) is done. Redis and BullMQ are gone: feeds and backups were removed (#25), the research agents run on the in-process `JobQueue` (#26), and Redis went in #28, so the in-process queue is the only one (no `QUEUE_DRIVER`). Option B's managed Redis is no longer needed. Jobquest is no longer file-based: it moves to D1 (`IMPORT_PLAN.md`), which fixes its counter-reset problem.

## 4. Measurements

- **Setup:** host Node 22.23, Linux. Docker Postgres is `pgvector/pgvector:pg15` on tmpfs; Redis is `redis:7-alpine`. All throwaway containers on spare ports; the dev volumes weren't touched.
- **How:** two runs each. AI is OpenAI `gpt-4o-mini` + `text-embedding-3-small`.
- **Comparable rows:** only the production `next start` rows compare like with like. The `tsx` script figures include TypeScript compile time.

### Cold start (to first API response)

| Setup | Time | Notes |
|---|---|---|
| A: `next start`, PGlite from snapshot (schema + demo seed) | **3.6 s** | Snapshot is 4.9 MB gzipped. Seeding (user + Getting Started workspace) takes 174 ms, once, at snapshot build time |
| A: script, PGlite from empty + `pushSchema` | 7.2 s | 2.7 s is PGlite boot; about 3.2 s is just loading `drizzle-kit/api` |
| A: PGlite from an existing `dataDir` (`PGlite.create` only) | 0.43 s | Versus 2.7–3.0 s for a fresh in-memory database or `dataDir` |
| B (local stand-in): Docker Postgres container to vector-ready | 1.4 s | Includes `init.sql` |
| … + `drizzle-kit push` | +1.6 s | The migrations couldn't build a fresh database then (fixed since) |
| … + `next start` to first API response | +2.7 s | **About 5.7 s in total** from nothing; 2.7 s when the database is already up, which is the managed-database case |

### Memory (RSS)

| Setup | Idle | After the flow |
|---|---|---|
| A: `next start` + PGlite (snapshot) | **603–635 MB** | **702–736 MB** |
| B: `next start` (postgres-js + BullMQ) | 298–300 MB | 433–454 MB |
| B: plus the Postgres container | +72 MB | +88–105 MB |
| B: plus the Redis container | +7 MB | +7 MB |
| A in dev (`next dev`, Turbopack) | | 1,477 MB |
| Script with `pushSchema` at boot | | about 1,100 MB. **Don't load `drizzle-kit` at runtime** |

Where PGlite's memory goes:

| Part | RSS |
|---|---|
| In-memory engine and extensions | about +420 MB |
| From snapshot or `dataDir` | about +200–370 MB |
| Loading `drizzle-kit/api` | about +300–450 MB |

A Cloud Run instance for A needs **at least 1 GiB, and 2 GiB to be safe**. Cloud Run's filesystem is in-memory and counts against that limit, so uploads also use RAM. B needs about **1 GiB**: 433–454 MB after a single document makes 512 MiB too tight.

### Flow timing

| Stage | PGlite | Postgres |
|---|---|---|
| Load + extract + clean + chunk/insert | 23 ms | 24 ms |
| Embed + store (OpenAI call + 5 row updates) | 280–600 ms | 270–310 ms |
| AI metadata (`gpt-4o-mini`) | 8.7–14.3 s | 8.7–10.3 s |
| Upload → `ready`, via `next start` | 8.7–11.3 s | 11.2–11.6 s |
| `find-source` (query embedding + vector search) | 194–275 ms | 183–209 ms |

The AI call dominates, so end-to-end runs are within noise of each other.

### Database work alone (`scripts/spike/bench-db.ts`, 200 chunks, 1536-dimension vectors, no index)

| Operation | PGlite | Postgres | Ratio |
|---|---|---|---|
| Insert 200 chunks | 40 ms | 31–38 ms | about 1.2× |
| Embedding update, per row (the worker does one `UPDATE` per chunk) | 5.2 ms | 1.9–2.0 ms | about 2.7× |
| Vector search, per query (sequential scan) | 14.3 ms | 4.9–5.3 ms | about 2.8× |

## 6. Recommendation: option A for the demo, keeping B's shape for production

**For option A:**

- It works today for the showcase flow, with no managed services: no Neon or Upstash accounts, bills or connection limits.
- One Cloud Run service per demo, matching the other two demos.
- **Reset is cheap.** The demo boots from a 4.9 MB golden snapshot, so every restart is a clean reset. That replaces M10's drop-and-reseed job.
  - With `--min-instances=1` an instance can run for days, so something still has to trigger the reset. Options: a scheduled redeploy or restart (Cloud Scheduler), or an admin-only endpoint that closes PGlite and reloads the snapshot.
- **Per-user rate limits are simple.** With one instance, the in-memory per-user limiter applies to everyone.
  - **The daily spend cap doesn't survive a restart.** It resets on every restart, deploy or crash. A counter in PGlite resets too, because the database is rebuilt from the snapshot.
  - On option A, only the **provider's hard monthly limit** survives restarts. Rely on that as the real cap, or keep the daily counter outside the instance (a Cloud Storage object or Firestore document).
- **The performance cost doesn't matter here:** about 3 ms more per database round trip, against 9–14 s of AI time per document.

**Conditions for A (blocking):**

1. **One instance:** `--max-instances=1`. The docs say the cap "can be exceeded for a brief period"; a second instance would just be a separate empty demo that resets, which is acceptable.
2. **CPU outside requests:**
   - The docs say CPU is allocated *"when instances are processing requests"* by default.
   - Document processing runs after the upload response returns, so it needs **instance-based billing**.
   - This applies to option B too, because the BullMQ workers run in the same process.
   - `--min-instances=1` also needs instance-based billing, and it avoids a 3.6 s cold start for the first visitor. This is the main ongoing cost; price it.
3. **Memory:** 2 GiB. RSS is about 740 MB after one document, and uploads also sit in RAM.
4. **Snapshot boot only.** Never load `drizzle-kit` at runtime: it costs about 3 s and about 400 MB. Build the snapshot in CI or at Docker build time and **copy it into the image**. The spike's `build-snapshot.ts` stayed on the archive branch; the repo has `PGLITE_SNAPSHOT` support (`lib/db/pglite.ts`) but no script that builds one yet (Part 4b).
5. ~~**Fix the migrations**~~ Done (baseline migration, `db:check-fresh` in CI).
6. **Port the inbox routing queue,** because flow 1 in the audit is "upload → route into a workspace". Then either port or hide (as the audit already says) feeds, backups, agent schedules and agent log streaming. A missed BullMQ import doesn't fail loudly: it hangs or spams `ECONNREFUSED`.
7. **SIGTERM:** Cloud Run gives 10 seconds. In-flight jobs are lost; acceptable for a demo that resets.

**Where B still wins** (keep it as the production path through `DB_DRIVER` and `QUEUE_DRIVER`):

- Visitors' work survives restarts and deploys.
- It can scale past one instance.
- It uses about half the memory.
- No WASM Postgres to upgrade.

The costs of B to check before choosing it:

- Neon's free-tier limits and cold starts.
- Upstash's command-based pricing against BullMQ's background polling (inferred risk, not measured).
- Two more accounts and their secrets.

**Risks of A:**

- **Packaging:**
  - PGlite is at 0.x, and `pglite-pgvector` is pinned to the exact PGlite version (peer `0.5.8`). In 0.5 the vector extension moved to its own package, so upgrades can break imports.
  - The PGlite path is also a second database path to keep tested.
- **Concurrency:**
  - PGlite serves one connection, so queries from concurrent requests queue behind each other, and a long transaction blocks everyone. There are 3 `db.transaction` call sites (not load-tested).
  - Vector search without an index is a sequential scan, which is fine at demo size.

**Mix:**

- Option A for the admin-portal demo now.
- Keep option B (managed Postgres + Redis) for anything that needs persistence later.
- The `JobQueue` and `DB_DRIVER` switches make that a configuration change, not a rewrite.
- Jobquest moves to D1 (`IMPORT_PLAN.md`); pet-local is dropped.
