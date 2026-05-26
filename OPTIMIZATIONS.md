# Optimization Audit — ManCon

**Audit Date:** 2026-03-07  
**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · SQLite (better-sqlite3) · Tailwind CSS 4  
**Scope:** Full codebase — backend, API routes, DB layer, enrichment queue, scraper, frontend  

---

## 1) Optimization Summary

### Current Health
The codebase is in reasonable shape for a personal/single-user tool. Core correctness is solid — transactions are used, migrations are idempotent, Zod validates all inputs. The biggest category of pain is a single repeated pattern: **`SELECT *` pulling up-to-6 MB cover image BLOBs from SQLite on every read path**, including list queries, update operations, and backups. This compounds across polling, batch imports, and every backup creation.

### Top 3 Highest-Impact Improvements

1. **Exclude `cover_image_blob` from all non-cover SELECT queries** — `listSeries`, `getSeriesById`, `updateSeries`, and backup creation all load the full BLOB into Node.js heap unnecessarily. One fix eliminates the largest memory pressure across the entire write path. _(Critical)_

2. **Eliminate the `updateSeries → getSeriesById` read-before-write** — Every PATCH to a series does a full SELECT (including blob) just to merge fields before the UPDATE. Replace with direct COALESCE-based UPDATE from request payload. _(High)_

3. **Batch the `hasPendingLikeJob` check in `enqueueImportEnrichmentJobs`** — Currently issues one SELECT per series ID in a loop. For a 500-entry MAL import this is 500+ sequential DB queries in a hot path. Replace with a single `WHERE series_id IN (...)` query. _(Medium/High)_

### Biggest Risk If Nothing Is Done
Memory pressure from BLOB loading will grow proportionally with library size. A user with 500 entries × average 200 KB cover = ~100 MB heap churn per list request, per poll tick, and per backup. This will become noticeable on constrained VPS/container deployments (the stated deployment target in `docker-compose.yml`).

---

## 2) Findings (Prioritized)

---

### F-01 — `SELECT *` Loads cover_image_blob on Every List/Update Path

- **Category:** DB / Memory  
- **Severity:** Critical  
- **Impact:** Eliminates large heap allocations per request; reduces SQLite I/O per query  
- **Evidence:**  
  - `src/lib/series-repository.ts` line 430: `"SELECT * FROM series"` in `listSeries`  
  - `src/lib/series-repository.ts` line 443: `"SELECT * FROM series WHERE id = ?"` in `getSeriesById`  
  - `src/lib/series-repository.ts` line 732: `"SELECT * FROM series WHERE LOWER(title) = LOWER(?)"` in `findSeriesByTitle`  
  - `src/lib/series-repository.ts` line 748: `SET s.*` pull via LEFT JOIN in `findSeriesByCanonicalSource`  
  - `src/lib/backup-service.ts` line 22: `listSeries({})` inside `createBackup` loads blobs into heap only to JSON-serialize objects that omit the blob  
- **Why it's inefficient:** `cover_image_blob` can be up to 6 MB per row (enforced in `cover-image.ts`). Every `listSeries` call loads this full BLOB for every series into Node.js heap. `mapSeriesRow` immediately converts it to a boolean (`hasCoverImage`) and throws the buffer away, but the SQLite page cache and Node.js allocator still have to handle the raw data. With 200 series × 200 KB average = 40 MB of transient heap per request. `createBackup` calls `listSeries({})` and the snapshot JSON doesn't include the blob, so the entire allocation is pure waste.
- **Recommended fix:** Replace all `SELECT *` list/find queries with an explicit column list that excludes `cover_image_blob`. The dedicated cover endpoint (`/api/series/[id]/cover` → `getSeriesCoverById`) already does a targeted `SELECT cover_image_blob, cover_image_mime_type` — that pattern is correct.

  ```sql
  -- Before
  SELECT * FROM series WHERE ...
  
  -- After (exclude the BLOB column from list/lookup queries)
  SELECT id, title, total_chapters, chapters_read, start_date, finish_date,
         rating, description, personal_notes, status, reread, total_rereads,
         reread_sessions, novel_to_read, follow_updates, preferred_source_type,
         cover_image_mime_type, cover_image_fetched_at, metadata_fetched_at,
         metadata_source_url, metadata_source_site, metadata_source_canonical_id,
         metadata_source_updated_at, created_at, updated_at,
         (cover_image_blob IS NOT NULL AND LENGTH(cover_image_blob) > 0) AS has_cover_image
  FROM series WHERE ...
  ```

  Update `SeriesRow` type to swap `cover_image_blob: Uint8Array | null` for `has_cover_image: number`, and update `mapSeriesRow` accordingly.

- **Tradeoffs / Risks:** Requires updating the `SeriesRow` type and all callers of `mapSeriesRow`. The cover delivery endpoint is unaffected. Needs a migration-free schema change (just a query change). Low regression risk.
- **Expected impact estimate:** 60–95% reduction in heap churn per list call depending on library size and average cover size. Most significant on backup creation.
- **Removal Safety:** Safe (query-only change, no schema changes)
- **Reuse Scope:** service-wide (`listSeries`, `getSeriesById`, `findSeriesByTitle`, `findSeriesByCanonicalSource`, backup creation)

---

### F-02 — `updateSeries` Reads Full Row (Including Blob) Before Every Write

- **Category:** DB / Memory  
- **Severity:** High  
- **Impact:** Eliminates a full SELECT (including BLOB load) before every PATCH operation  
- **Evidence:** `src/lib/series-repository.ts` line 570 — `updateSeries` calls `getSeriesById(id)` to load `existing`, then merges fields from `input` onto `existing` before running an UPDATE. `getSeriesById` does `SELECT *` and also calls `getSources()` and `attachEnrichmentStates()`.
- **Why it's inefficient:** The read-before-write pattern is used here to fill in unset optional fields (partial update semantics). This is correct behavior, but the implementation loads: the full BLOB (F-01 above), all sources (a second JOIN query), and enrichment states (a third query) — only to use the merged field values in an UPDATE. The BLOB load is particularly wasteful here since the final UPDATE ignores it except for `COALESCE(?, cover_image_blob)`.
- **Recommended fix:**  
  Option A (Minimal fix): Apply F-01 first; the BLOB load is eliminated but the extra SELECT+JOIN still happens.  
  Option B (Full fix): Change the UPDATE to use `COALESCE` for every nullable field directly from the incoming payload, avoiding the pre-read entirely for most partial updates. Fall back to a targeted SELECT that excludes the BLOB for fields not in the payload.

  ```sql
  UPDATE series SET
    title = COALESCE(?, title),
    cover_image_blob = COALESCE(?, cover_image_blob),
    ...
  WHERE id = ?
  ```

  Sources can be updated only when `input.sources` is explicitly provided.
- **Tradeoffs / Risks:** Requires changing update semantics slightly; the current `merged = { ...existing, ...input }` approach is readable and safe. Full refactor increases complexity. Option A is the immediate win.
- **Expected impact estimate:** 30–50% latency reduction per PATCH request when F-01 is also applied.
- **Removal Safety:** Needs Verification (logic change)
- **Reuse Scope:** module (series-repository)

---

### F-03 — Puppeteer Spawns a New Browser Process Per Scrape Request

- **Category:** CPU / Reliability  
- **Severity:** High  
- **Impact:** Eliminates 0.5–3 s of browser startup on every blocked-domain scrape; reduces OS process overhead  
- **Evidence:** `src/lib/scrapers/fetch-page.ts` — `fetchWithPuppeteer` calls `puppeteer.default.launch(...)` and `browser.close()` on every invocation. This is called as the fallback when HTTP returns a 403/429/503 or a Cloudflare response.
- **Why it's inefficient:** Chromium browser startup is expensive (~0.5–2 s, ~100 MB RAM). Creating a disposable browser per request is the simplest pattern but the most costly. For a user adding or scraping multiple series in sequence, each call serializes a full launch/teardown cycle.
- **Recommended fix:**  
  Use a singleton browser with page-per-request and idle-timeout teardown:
  
  ```typescript
  let sharedBrowser: Browser | null = null;
  
  async function getOrCreateBrowser(): Promise<Browser> {
    if (!sharedBrowser || !sharedBrowser.connected) {
      const puppeteer = await import("puppeteer");
      sharedBrowser = await puppeteer.default.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
    }
    return sharedBrowser;
  }
  
  async function fetchWithPuppeteer(url: string, timeoutMs: number) {
    const browser = await getOrCreateBrowser();
    const page = await browser.newPage();
    try {
      await page.setUserAgent("...");
      await page.goto(url, { waitUntil: "networkidle2", timeout: timeoutMs });
      const html = await page.content();
      return { finalUrl: page.url(), html };
    } finally {
      await page.close(); // close page, not the browser
    }
  }
  ```
  
  Add a `process.on("exit")` handler (or use `beforeExit`) to close the browser cleanly.

- **Tradeoffs / Risks:** Persistent browser holds ~100 MB RSS permanently. For a VPS deployment this is acceptable. Need to handle browser crashes (detect `!browser.connected` and re-launch). Concurrent requests to the same URL could open multiple pages — safe since `page.close()` is in a `finally` block.
- **Expected impact estimate:** 80–95% latency reduction per Puppeteer-fallback scrape; meaningful for multi-step "scrape TR + scrape EN" workflows.
- **Removal Safety:** Likely Safe
- **Reuse Scope:** local file (scrapers/fetch-page.ts)

---

### F-04 — `enqueueImportEnrichmentJobs` Has N+1 DB Queries

- **Category:** DB / Algorithm  
- **Severity:** Medium/High  
- **Impact:** Reduces a batch of 500 import enqueue calls from ~500 SELECT queries to 1  
- **Evidence:** `src/lib/import-enrichment-queue.ts` lines 74–83 — for each `seriesId` in the input array, calls `hasPendingLikeJob(seriesId, source)` (one SELECT) then optionally `enqueueJob(seriesId, source)` (one SELECT + one INSERT inside `enqueueJob`). With `import-handler.ts` calling this after a 500-entry MAL import, this is a tight loop of DB queries.
- **Why it's inefficient:** `hasPendingLikeJob` fires `SELECT id FROM import_enrichment_jobs WHERE series_id = ? AND source = ? AND status IN (...) LIMIT 1` for each ID individually. SQLite handles this quickly due to the composite index `idx_import_enrichment_jobs_series_source`, but the round-trip overhead (statement prep, execution, result fetch) for 500 separate calls is still measurably slower than a single batched query.
- **Recommended fix:**
  ```typescript
  export function enqueueImportEnrichmentJobs(source: ImportSource, seriesIds: string[]): number {
    if (seriesIds.length === 0) return 0;
    const db = getDb();
    const uniqueIds = [...new Set(seriesIds)];
    const placeholders = uniqueIds.map(() => "?").join(", ");
    
    // Find which IDs already have a pending/running job
    const existingRows = db
      .prepare(
        `SELECT series_id FROM import_enrichment_jobs
         WHERE series_id IN (${placeholders}) AND source = ? AND status IN ('pending', 'running')`
      )
      .all(...uniqueIds, source) as Array<{ series_id: string }>;
    
    const alreadyQueued = new Set(existingRows.map(r => r.series_id));
    const toQueue = uniqueIds.filter(id => !alreadyQueued.has(id));
    
    if (toQueue.length === 0) {
      startEnrichmentWorker();
      return 0;
    }
    
    const now = nowIso();
    const insert = db.prepare(
      `INSERT INTO import_enrichment_jobs
       (id, series_id, source, status, attempts, next_retry_at, last_error, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', 0, ?, NULL, ?, ?)`
    );
    const batchInsert = db.transaction(() => {
      for (const id of toQueue) {
        insert.run(randomUUID(), id, source, now, now, now);
      }
    });
    batchInsert();
    startEnrichmentWorker();
    return toQueue.length;
  }
  ```
- **Tradeoffs / Risks:** Slightly more complex. The `IN (...)` placeholder approach with spread `...uniqueIds` is fine for `better-sqlite3` and safe for typical import sizes (≤1000). For very large imports (>999 on some SQLite builds), split into chunks of 500.
- **Expected impact estimate:** ~500x fewer queries for a typical MAL import; measurable as request latency (100–800 ms reduction on a slow disk).
- **Removal Safety:** Safe
- **Reuse Scope:** local file (import-enrichment-queue.ts)

---

### F-05 — Dashboard Enrichment Polling Causes `useEffect` Interval Churn

- **Category:** Frontend / Concurrency  
- **Severity:** Medium  
- **Impact:** Eliminates redundant interval teardown/setup on every poll tick; prevents potential poll acceleration  
- **Evidence:** `src/app/page.tsx` line 1523 — the polling `useEffect` depends on `[items, query, statusFilter, flagFilter]`. Every time a poll resolves and `setItems(result.items)` is called, `items` changes, which re-runs the effect: the interval is `clearInterval`'d, a new `hasPendingEnrichment` check runs, and a new `setInterval` is created. This means the 5-second interval restarts from zero after each fire.
- **Why it's inefficient:** This is a correctness bug as much as an efficiency issue. The intent is "while any item is enriching, poll every 5s." The current pattern drifts the interval on each resolution, causing polling to always restart the timer rather than fire on a fixed cadence. For rapid state updates this could cause polling to be delayed indefinitely ("interval livelock").
- **Recommended fix:**
  ```typescript
  // Use a ref to read current items without re-running the effect
  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);
  
  // Polling effect depends only on filters (not items)
  useEffect(() => {
    const id = setInterval(() => {
      const hasPending = itemsRef.current.some(
        item => item.enrichmentStatus === "pending" || item.enrichmentStatus === "running"
      );
      if (!hasPending) {
        clearInterval(id);
        return;
      }
      void (async () => {
        const [result, statsRes] = await Promise.all([
          fetchSeriesList(query, statusFilter, flagFilter),
          fetch("/api/import/enrichment/stats"),
        ]);
        setItems(result.items);
        setStatusCounts(result.statusCounts);
        if (statsRes.ok) {
          const json = (await statsRes.json()) as { data: EnrichmentStats };
          setEnrichmentStats(json.data);
        }
      })();
    }, 5000);
    
    return () => clearInterval(id);
  }, [query, statusFilter, flagFilter]);
  ```
- **Tradeoffs / Risks:** Requires adding a `itemsRef`. The self-canceling pattern (`clearInterval(id)` inside the callback) stops polling when no items are pending without relying on effect re-runs.
- **Expected impact estimate:** Fixes interval restart bug; negligible direct perf gain but prevents subtle timing regression.
- **Removal Safety:** Likely Safe
- **Reuse Scope:** local file (app/page.tsx)

---

### F-06 — `listSeries` + `getStatusCounts` Run Separately with Identical WHERE Clauses

- **Category:** DB  
- **Severity:** Medium  
- **Impact:** Eliminates one redundant DB round-trip per GET /api/series call  
- **Evidence:** `src/app/api/series/route.ts` lines 33–41 — `GET` calls both `listSeries(filters)` and `getStatusCounts(filters)` with identical filter objects. Each compiles its own WHERE clause and runs it independently.
- **Why it's inefficient:** Two sequential `db.prepare().all()` calls hit the same `series` table with the same predicate. SQLite's page cache means the second query mostly hits cache, but statement compilation, row iteration, and function-call overhead are duplicated.
- **Recommended fix:**  
  Use a single query with conditional count via `SUM(CASE WHEN status = 'x' THEN 1 ELSE 0 END)` appended to the list query, or have `listSeries` return status counts as a side-effect. Alternatively, combine with a CTE:
  ```sql
  WITH filtered AS (
    SELECT * FROM series WHERE <filters>
  )
  SELECT * FROM filtered
  UNION ALL
  SELECT NULL, status, COUNT(*) AS count FROM filtered GROUP BY status
  ```
  A simpler approach: have `listSeries` accept an option to return counts alongside data and make a single repository call.
- **Tradeoffs / Risks:** Couples the list and count queries — acceptable since they're always called together at this endpoint. If status counts are needed elsewhere independently, keep `getStatusCounts` but don't call both separately here.
- **Expected impact estimate:** Saves ~1 DB query per page load; low absolute value but clean.
- **Removal Safety:** Safe
- **Reuse Scope:** module (series-repository + series/route.ts)

---

### F-07 — Title Search Uses `LOWER(title) LIKE '%q%'` (Leading Wildcard, No Index Benefit)

- **Category:** DB / Algorithm  
- **Severity:** Medium  
- **Impact:** Proper FTS would reduce title-search latency from O(N) scan to O(log N) or O(result)  
- **Evidence:** `src/lib/series-repository.ts` lines 403–404 — `LOWER(title) LIKE ?` where `params.push('%query%')`. The `idx_series_lower_title` index exists but cannot be used for `LIKE '%x%'` patterns (leading wildcard forces full scan). The `idx_series_updated_at` index will also be skipped once a WHERE clause is added.
- **Why it's inefficient:** SQLite must read every row in the `series` table and apply `LOWER()` + `LIKE` to each one. At small library sizes (< 1000 rows) this isn't noticeable. At scale or when combined with backup/restore operations it adds latency.
- **Recommended fix:**  
  Use SQLite FTS5:
  ```sql
  -- In a migration:
  CREATE VIRTUAL TABLE IF NOT EXISTS series_fts
    USING fts5(title, content='series', content_rowid='rowid');
  
  -- Triggers to keep it in sync:
  CREATE TRIGGER series_ai AFTER INSERT ON series BEGIN
    INSERT INTO series_fts(rowid, title) VALUES (new.rowid, new.title);
  END;
  CREATE TRIGGER series_au AFTER UPDATE OF title ON series BEGIN
    INSERT INTO series_fts(series_fts, rowid, title) VALUES ('delete', old.rowid, old.title);
    INSERT INTO series_fts(rowid, title) VALUES (new.rowid, new.title);
  END;
  CREATE TRIGGER series_ad AFTER DELETE ON series BEGIN
    INSERT INTO series_fts(series_fts, rowid, title) VALUES ('delete', old.rowid, old.title);
  END;
  
  -- Query:
  SELECT s.* FROM series s
  JOIN series_fts ON series_fts.rowid = s.rowid
  WHERE series_fts MATCH ?
  ```
  For a personal tracker, this is a "nice to have" rather than urgent.
- **Tradeoffs / Risks:** FTS5 triggers add a small overhead to writes. The virtual table takes additional space. The MATCH query has different tokenization semantics than LIKE. For non-ASCII/CJK titles the built-in FTS tokenizer may need configuration.
- **Expected impact estimate:** 10–50x faster title search at >500 entries.
- **Removal Safety:** Needs Verification (semantic change in search behavior)
- **Reuse Scope:** module (series-repository + migrations)

---

### F-08 — `updateSeries` Always Deletes + Reinserts All Sources

- **Category:** DB  
- **Severity:** Medium  
- **Impact:** Eliminates unnecessary DELETE + N×INSERT on every series update when sources are unchanged  
- **Evidence:** `src/lib/series-repository.ts` lines 667–683 — inside every `updateSeries` transaction, `DELETE FROM series_sources WHERE series_id = ?` is run unconditionally, then all sources (including unchanged ones) are re-inserted with new UUIDs.
- **Why it's inefficient:** Every chapter-count bump, status change, or note edit triggers a delete-all + reinsert-all for sources, even when sources were not part of the PATCH payload. This generates unnecessary write WAL entries and invalidates the source UUID IDs on every update.
- **Recommended fix:**  
  Only update sources when `input.sources` is explicitly provided in the incoming payload:
  ```typescript
  if (input.sources !== undefined) {
    db.prepare("DELETE FROM series_sources WHERE series_id = ?").run(id);
    for (const src of sourceEntries) {
      db.prepare(`INSERT INTO series_sources ...`).run(...);
    }
  }
  ```
  The `updateSeriesSchema` uses `.partial()` so `input.sources` being `undefined` is a valid "not provided" signal.
- **Tradeoffs / Risks:** Requires distinguishing "sources not in payload" from "sources intentionally set to empty array." A sentinel check `input.sources !== undefined` is clear and unambiguous.
- **Expected impact estimate:** Eliminates 1 DELETE + N INSERT per non-source update (e.g., every chapter +1 click from the dashboard).
- **Removal Safety:** Likely Safe
- **Reuse Scope:** local file (series-repository.ts)

---

### F-09 — `findSeriesByCanonicalSource` Uses LEFT JOIN + OR (Potential Index Miss)

- **Category:** DB  
- **Severity:** Medium  
- **Impact:** Faster canonical-source lookup during imports  
- **Evidence:** `src/lib/series-repository.ts` lines 748–760 — query uses `LEFT JOIN series_sources ON ... WHERE (ss.site = ? AND ss.canonical_id = ?) OR (s.metadata_source_site = ? AND s.metadata_source_canonical_id = ?)`. SQLite's query planner may not pick both `idx_series_sources_site_canonical` and the direct column lookup optimally when they're OR'd together across a join boundary.
- **Why it's inefficient:** SQLite can struggle to use multiple indexes for OR predicates spanning different tables in the same query. One branch of the OR may cause a full scan of `series_sources`.
- **Recommended fix:**  
  Replace with a UNION of two targeted queries:
  ```sql
  SELECT s.* FROM series s
  JOIN series_sources ss ON ss.series_id = s.id
  WHERE ss.site = ? AND ss.canonical_id = ?
  ORDER BY s.updated_at DESC LIMIT 1
  
  UNION
  
  SELECT * FROM series
  WHERE metadata_source_site = ? AND metadata_source_canonical_id = ?
  ORDER BY updated_at DESC LIMIT 1
  ```
  Execute both and return the first non-null result.
- **Tradeoffs / Risks:** Two queries instead of one, but both are index-optimal. Only called during import/scrape operations (low frequency) — medium priority.
- **Expected impact estimate:** Likely minor at current library sizes; more relevant for imports with many canonical matches.
- **Removal Safety:** Safe
- **Reuse Scope:** local file (series-repository.ts)

---

### F-10 — `db.prepare()` Called Inside Loops (Statements Not Cached)

- **Category:** DB / Algorithm  
- **Severity:** Medium  
- **Impact:** Eliminates repeated SQL compilation overhead inside tight loops  
- **Evidence:**  
  - `src/lib/series-repository.ts` line 518 — `db.prepare(INSERT INTO series_sources ...)` inside the source loop within `createSeries`  
  - `src/lib/series-repository.ts` line 669 — same inside `updateSeries`  
  - `src/lib/backup-service.ts` line 307, 318 — `db.prepare(INSERT INTO series ...)` and `db.prepare(INSERT INTO series_sources ...)` inside the `for (const item of loaded.snapshot.series)` loop in `restoreByBackupId`  
- **Why it's inefficient:** `better-sqlite3`'s `db.prepare()` parses and compiles the SQL string on every call. While `better-sqlite3` is fast, calling `prepare()` 500 times for the same SQL string during a large restore is wasteful. The returned `Statement` object should be created once and reused.
- **Recommended fix:**  
  Hoist `db.prepare()` calls outside loops — define statements before the transaction:
  ```typescript
  const insertSource = db.prepare(`INSERT INTO series_sources (id, ...) VALUES (?, ...)`);
  const tx = db.transaction(() => {
    for (const src of sourceEntries) {
      insertSource.run(...);
    }
  });
  tx();
  ```
- **Tradeoffs / Risks:** None. `better-sqlite3` statements are reusable and thread-safe (Node.js is single-threaded). The compiled statement is valid as long as the DB instance is valid.
- **Expected impact estimate:** 5–15% speedup on batch imports/restores; negligible for single-item operations.
- **Removal Safety:** Safe
- **Reuse Scope:** module (series-repository.ts, backup-service.ts)

---

### F-11 — `enrichImportedItems` is Dead Code (Exported but Never Imported)

- **Category:** Dead Code  
- **Severity:** Low  
- **Impact:** Removes ~75 lines of unused code; eliminates maintenance burden and confusion about the enrichment flow  
- **Evidence:** `src/lib/import-metadata.ts` line 468 — `export async function enrichImportedItems(...)` is exported but has zero importers in the codebase. Confirmed by grep: no file imports `enrichImportedItems`. This was the former synchronous enrichment path before the background queue was introduced.
- **Why it's inefficient:** Dead code increases cognitive load and future maintenance risk (someone might incorrectly revive or reference it). Its presence implies the synchronous enrichment path is still live when it isn't.
- **Recommended fix:** Remove the `enrichImportedItems` function and its internal `enrichOne` helper (~75 lines). Also verify `tryDownloadCoverImage` is still used by the queue worker (`applyEnrichment` in `import-enrichment-queue.ts`) before removing any cover-image imports.
- **Tradeoffs / Risks:** Ensure no test file references it (the test file `import-handler.test.ts` or `importers.test.ts` should be checked).
- **Expected impact estimate:** Build artifact size reduction (minor); clarity improvement.
- **Removal Safety:** Needs Verification (check test files)
- **Reuse Scope:** local file (import-metadata.ts)

---

### F-12 — Duplicate `sleep` Function and `ENRICH_MIN_CONFIDENCE` Constant

- **Category:** Dead Code / Code Reuse  
- **Severity:** Low  
- **Impact:** Single source of truth; eliminates risk of divergence  
- **Evidence:**  
  - `src/lib/import-enrichment-queue.ts` line 30 and `src/lib/import-metadata.ts` line 30: identical `function sleep(ms: number): Promise<void>`  
  - `src/lib/import-enrichment-queue.ts` line 26 and `src/lib/import-metadata.ts` line 28: both read `Number(process.env.ENRICH_MIN_CONFIDENCE || 0.72)` independently. If the default value or env var name ever changes, one copy will drift.
- **Why it's inefficient:** Duplicated constants and utilities are a maintenance risk. Both files are in `src/lib/` — there's no architectural reason for the duplication.
- **Recommended fix:**  
  - Extract `sleep` to a shared module-level utility (e.g., `src/lib/async-utils.ts`) or inline `await new Promise(r => setTimeout(r, ms))` where used (it's only one line when inlined).  
  - Extract enrichment-related env config to a single `enrichment-config.ts` module that both files import from.
- **Tradeoffs / Risks:** Creates a new module dependency. Small refactor but worthwhile.
- **Expected impact estimate:** No runtime impact; removes future bug surface.
- **Removal Safety:** Safe
- **Reuse Scope:** module (import-enrichment-queue.ts + import-metadata.ts)

---

### F-13 — Next.js Config is Empty — No Image Optimization or Bundle Configuration

- **Category:** Build / Frontend  
- **Severity:** Low  
- **Impact:** Better bundle analysis; correct image optimization pipeline setup  
- **Evidence:**  
  - `next.config.ts` is entirely empty (`const nextConfig: NextConfig = {}`)  
  - `src/app/page.tsx` uses `<Image ... unoptimized />` on cover images. The `unoptimized` prop disables all Next.js image optimization (format conversion, responsive sizing, CDN caching).  
  - No bundle analyzer configured, so bundle size regressions go undetected.
- **Why it's inefficient:** `unoptimized` is used because images are served from `/api/series/[id]/cover` (a dynamic endpoint), which Next.js's image optimizer cannot pre-process. This is actually the correct choice for dynamically served BLOBs. However, there are no `remotePatterns` configured, which blocks optimization for any future static cover URLs (e.g., from scrapers). Also, no `output: 'standalone'` is set for the Docker deployment, which means the container includes dev dependencies unnecessarily.
- **Recommended fix:**
  ```typescript
  const nextConfig: NextConfig = {
    output: "standalone", // for Docker: excludes node_modules from the image
    experimental: {
      // Enable if needed for future optimizations
    },
  };
  ```
  `unoptimized` on the BLOB-served covers is acceptable and should be documented as intentional.
- **Tradeoffs / Risks:** `output: "standalone"` changes the build output structure — `docker-compose.yml` may need updating to reference `.next/standalone/server.js`. Test with existing Docker setup.
- **Expected impact estimate:** Smaller Docker image; no runtime perf change.
- **Removal Safety:** Needs Verification (Docker build change)
- **Reuse Scope:** service-wide (build config)

---

### F-14 — `batchMergeSeriesByTitle` / `batchMergeSeriesByCanonicalOrTitle` Are Not Truly Batched

- **Category:** DB / Algorithm  
- **Severity:** Medium  
- **Impact:** Reduces per-item round-trips during MAL/AniList content imports  
- **Evidence:** `src/lib/series-repository.ts` lines 830–864 — `batchMergeSeriesByTitle` wraps individual `mergeSeriesByTitle` calls in one SQLite transaction. Each `mergeSeriesByTitle` calls `findSeriesByTitle` (SELECT) + either `createSeries` or `updateSeries` (which itself calls `getSeriesById` = another SELECT + sources SELECT + enrichment SELECT, plus the UPDATE).  
  For a 500-item import: up to 500 × 4 SELECT queries + 500 × 1 INSERT/UPDATE = ~2500 DB operations all within one transaction.
- **Why it's inefficient:** The outer transaction is correct (atomicity) but the inner per-item logic does a SELECT-per-item for title lookup. A single `SELECT id, title FROM series` (all rows) at the start of the batch, built into a Map, would eliminate 500 individual lookups.
- **Recommended fix:**  
  Pre-fetch all existing series titles (and canonical IDs) into a Map before the loop:
  ```typescript
  const existing = db.prepare("SELECT id, LOWER(title) as ltitle FROM series").all() as ...;
  const byTitle = new Map(existing.map(r => [r.ltitle, r.id]));
  
  for (const item of items) {
    const existingId = byTitle.get(item.title.trim().toLowerCase());
    // use existingId to branch to insert or update (with cached statements)
  }
  ```
  This trades N individual SELECT queries for 1 bulk SELECT.
- **Tradeoffs / Risks:** Requires restructuring the batch functions — higher refactor effort. The existing outer-transaction approach correctly prevents interleaving. The main tradeoff is complexity vs. performance.
- **Expected impact estimate:** 4–10× speedup for large batch imports (500 items: ~2500 queries → ~500 queries).
- **Removal Safety:** Needs Verification (logic refactor)
- **Reuse Scope:** module (series-repository.ts)

---

### F-15 — `daily backup check` runs on every `GET /api/series`

- **Category:** DB / Reliability  
- **Severity:** Low  
- **Impact:** Negligible individually, cumulative with high polling frequency  
- **Evidence:** `src/app/api/series/route.ts` line 16 — `runDailyBackupIfNeeded()` is called on every GET request to `/api/series`. With the 5-second polling interval active (F-05), this means up to 12 DB lookups-per-minute checking for the daily backup record, even though the module-level `dailyBackupCheckedDate` guard prevents the actual DB query after the first check per day. The guard (`dailyBackupCheckedDate === today`) is a module-level `let` — safe in a single-process Node.js server, but means the first check each day always hits the DB.
- **Why it's inefficient:** The function's own guard makes this cheap (one module-level string comparison per call after the first DB hit). However, this is an `undefined → today` day boundary case: when the server starts or the date rolls over, the next call to `GET /api/series` (possibly a polling tick) creates a backup that calls `listSeries({})` (loading all BLOBs — see F-01).
- **Recommended fix:** No code change needed once F-01 is applied. The guard is correct and efficient. Document the design.
- **Expected impact estimate:** Near zero once F-01 is applied.
- **Removal Safety:** Safe (no change needed)
- **Reuse Scope:** local (backup-service.ts)

---

### F-16 — `exportMalCompatibleXml` Calls `listSeries({})` Independently

- **Category:** DB / Dead Code  
- **Severity:** Low  
- **Impact:** Minor — eliminates one redundant full-table scan if export is called alongside other list operations  
- **Evidence:** `src/lib/exporters.ts` lines 9, 11 — both `exportFullDatabase()` and `exportMalCompatibleXml()` each call `listSeries({})`. They are called from different API routes (`/api/export/...`) so they don't run together in practice. However, `exportMalCompatibleXml` also triggers a BLOB load per row (same F-01 issue).
- **Recommended fix:** Apply F-01. The export functions will then be fast regardless. No structural change needed.
- **Expected impact estimate:** Low standalone value; fixed as side-effect of F-01.
- **Removal Safety:** Safe
- **Reuse Scope:** local (exporters.ts)

---

### F-17 — Zod Schema Parsed Inside Tight Row-Mapping Loops

- **Category:** CPU / Algorithm  
- **Severity:** Low  
- **Impact:** Minor CPU reduction in list endpoints with many sources  
- **Evidence:**  
  - `src/lib/series-repository.ts` line 166 — `parseRereadSessions` calls `z.array(rereadSessionSchema).parse(parsed)` for every series row  
  - `src/lib/series-repository.ts` line 222 — `parseSourceError` calls `z.object(...).parse(parsed)` for every source row  
- **Why it's inefficient:** Zod schema compilation and validation is not free. For a library of 500 series with 2 sources each, `parseSourceError` is called ~1000 times per list request. The schemas are simple objects, but Zod internally creates new validators on each call if not cached.
- **Recommended fix:**  
  - `parseSourceError`: Replace with plain JSON.parse + property checks (the schema is trivially simple: `{ message: string, timestamp: string }`):
    ```typescript
    function parseSourceError(raw: string | null): SourceErrorInfo | null {
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (typeof parsed !== "object" || !parsed) return null;
        const { message, timestamp } = parsed as Record<string, unknown>;
        if (typeof message !== "string" || typeof timestamp !== "string") return null;
        return { message, timestamp };
      } catch { return null; }
    }
    ```
  - `parseRereadSessions`: Similarly, Zod is used defensively here but plain parsing with type guards is sufficient since the data round-tripped through `JSON.stringify` from the repo itself.
- **Tradeoffs / Risks:** Removes Zod validation on trusted internal data (data read from SQLite that was written by the same application). Acceptable tradeoff.
- **Expected impact estimate:** 5–15% reduction in CPU time for large list calls. Low priority.
- **Removal Safety:** Likely Safe
- **Reuse Scope:** local file (series-repository.ts)

---

### F-18 — `vitest.config.ts` Not Reviewed for Coverage Scope / Performance

- **Category:** Build  
- **Severity:** Low  
- **Impact:** Faster CI feedback if test scope is well-defined  
- **Evidence:** `vitest.config.ts` exists but was not read during this audit.  
- **Recommended action:** Verify test isolation — particularly that `import-handler.test.ts` and `importers.test.ts` don't spin up a real SQLite connection on every test run. If they do, using an in-memory database (`":memory:"`) would speed up test execution.
- **Expected impact estimate:** Unknown without reading the test config.
- **Removal Safety:** Needs Verification

---

## 3) Quick Wins (Do First)

These changes are low-effort, high-impact, and can be done in isolation:

| Priority | Finding | Estimated Effort | Impact |
|----------|---------|-----------------|--------|
| 1 | **F-01**: Replace `SELECT *` with explicit columns excluding `cover_image_blob` | 1–2 h | Critical — memory |
| 2 | **F-04**: Batch `hasPendingLikeJob` into single IN-query | 30 min | High — MAL import latency |
| 3 | **F-08**: Skip DELETE+INSERT sources when `input.sources` not provided | 20 min | Medium — every PATCH |
| 4 | **F-10**: Hoist `db.prepare()` outside loops in batch restore and create/update | 30 min | Medium — batch ops |
| 5 | **F-05**: Fix enrichment polling `useEffect` deps with `useRef` | 30 min | Medium — correctness |
| 6 | **F-11**: Remove dead `enrichImportedItems` function | 15 min | Low — clarity |
| 7 | **F-12**: Deduplicate `sleep` and `ENRICH_MIN_CONFIDENCE` | 20 min | Low — maintainability |

---

## 4) Deeper Optimizations (Do Next)

These are more invasive but worth doing as the library grows:

1. **F-02 — Eliminate read-before-write in `updateSeries`**: Refactor to use SQL `COALESCE`-based partial update directly from the payload. Biggest win when combined with F-01.

2. **F-03 — Puppeteer singleton browser**: Replace per-request browser spawn with a singleton + idle-timeout teardown. Required if scraping becomes a frequent workflow.

3. **F-07 — SQLite FTS5 for title search**: Add a migration creating an `fts5` virtual table with sync triggers. Future-proofs the title search as the library grows past 1000 entries.

4. **F-06 — Merge `listSeries` + `getStatusCounts` into one query**: Moderate refactor — consider once F-01 is complete to ensure the combined query is also BLOB-clean.

5. **F-14 — True batch mode for `batchMergeSeriesByTitle`**: Pre-fetch all titles into a Map before the loop. High effort, high impact for large imports. Required if import sizes exceed 1000 entries consistently.

6. **F-09 — Replace LEFT JOIN+OR in `findSeriesByCanonicalSource` with UNION**: Low frequency but conceptually cleaner.

---

## 5) Validation Plan

### Before/After Metrics to Collect

```
# Memory: Node.js heap before and after a listSeries call
node --inspect next start
# Use Chrome DevTools > Memory > Heap Snapshot
# Compare heap after GET /api/series with 100 series (10 with cover images)
```

```
# SQLite query count: wrap db.prepare().all() with a counter
# or enable SQLite query logging via the trace pragma:
db.pragma("wal_autocheckpoint = 1000");
db.on("trace", (sql: string) => console.log("[SQL]", sql));
```

### Benchmarks

| Scenario | Current Baseline | Target After F-01 |
|----------|-----------------|-------------------|
| `GET /api/series` (100 series, 50% with covers) | Measure heap delta | < 5 MB |
| `POST /api/import/mal` (500 entries) | Measure wall-clock time | < 2 s |
| `createBackup` (100 series) | Measure wall-clock time | < 200 ms |
| Dashboard polling tick (5s interval) | Measure heap delta | Near zero |

### Correctness Tests to Run After Each Change

- Run `npm test` (vitest) after every change; current test suite covers import-handler and importers.
- For F-01: Manually verify cover images still load after applying the column exclusion (the `/cover` endpoint is unchanged but `hasCoverImage` computation moves to a SQL expression).
- For F-04: Import a 500-entry MAL list and verify all enrichment jobs are enqueued correctly.
- For F-05: Open the dashboard during an active enrichment run and observe that status badges update within ~5–10s without console errors.
- For F-08: Run a chapter +1 update and verify sources are unchanged in the DB.

---

## 6) Optimized Code Patches

### Patch A — F-01: Explicit SELECT excluding `cover_image_blob`

Replace the `SeriesRow` type and list/find queries in `src/lib/series-repository.ts`:

```typescript
// BEFORE
type SeriesRow = {
  // ...
  cover_image_blob: Uint8Array | null;
  // ...
};

// AFTER: replace cover_image_blob with computed boolean from SQL
type SeriesRow = {
  // ... all other fields identical ...
  has_cover_image: number;           // computed: (cover_image_blob IS NOT NULL AND LENGTH(cover_image_blob) > 0)
  cover_image_mime_type: string | null;
  // cover_image_blob removed
};
```

```diff
// mapSeriesRow
- hasCoverImage: Boolean(row.cover_image_blob && row.cover_image_blob.length > 0),
+ hasCoverImage: Boolean(row.has_cover_image),
```

```diff
// listSeries query
- "SELECT * FROM series",
+ `SELECT id, title, total_chapters, chapters_read, start_date, finish_date,
+          rating, description, personal_notes, status, reread, total_rereads,
+          reread_sessions, novel_to_read, follow_updates, preferred_source_type,
+          cover_image_mime_type, cover_image_fetched_at, metadata_fetched_at,
+          metadata_source_url, metadata_source_site, metadata_source_canonical_id,
+          metadata_source_updated_at, created_at, updated_at,
+          CASE WHEN cover_image_blob IS NOT NULL AND LENGTH(cover_image_blob) > 0 THEN 1 ELSE 0 END AS has_cover_image
+  FROM series`,
```

Apply the same column list to `getSeriesById`, `findSeriesByTitle`, and `findSeriesByCanonicalSource`.

---

### Patch B — F-04: Batched Enrichment Enqueue

Replace `enqueueImportEnrichmentJobs` in `src/lib/import-enrichment-queue.ts`:

```typescript
export function enqueueImportEnrichmentJobs(source: ImportSource, seriesIds: string[]): number {
  if (seriesIds.length === 0) return 0;

  const db = getDb();
  const uniqueIds = [...new Set(seriesIds)];
  const placeholders = uniqueIds.map(() => "?").join(", ");

  const existing = db
    .prepare(
      `SELECT series_id FROM import_enrichment_jobs
       WHERE series_id IN (${placeholders}) AND source = ? AND status IN ('pending', 'running')`,
    )
    .all(...uniqueIds, source) as Array<{ series_id: string }>;

  const alreadyQueued = new Set(existing.map((r) => r.series_id));
  const toQueue = uniqueIds.filter((id) => !alreadyQueued.has(id));

  if (toQueue.length > 0) {
    const now = nowIso();
    const insert = db.prepare(
      `INSERT INTO import_enrichment_jobs
       (id, series_id, source, status, attempts, next_retry_at, last_error, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', 0, ?, NULL, ?, ?)`,
    );
    const batch = db.transaction(() => {
      for (const id of toQueue) {
        insert.run(randomUUID(), id, source, now, now, now);
      }
    });
    batch();
  }

  startEnrichmentWorker();
  return toQueue.length;
}
```

---

### Patch C — F-08: Skip Source Upsert When Sources Not in Payload

In `updateSeries` transaction body (`src/lib/series-repository.ts`):

```diff
  // After the series UPDATE statement...
  
- db.prepare("DELETE FROM series_sources WHERE series_id = ?").run(id);
- for (const src of sourceEntries) {
-   db.prepare(`INSERT INTO series_sources ...`).run(...);
- }
+ if (input.sources !== undefined) {
+   db.prepare("DELETE FROM series_sources WHERE series_id = ?").run(id);
+   const insertSrc = db.prepare(`INSERT INTO series_sources
+     (id, series_id, type, url, site, canonical_id, scraped_at, scraper_name, last_error, meta, created_at)
+     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
+   for (const src of sourceEntries) {
+     insertSrc.run(src.id, src.seriesId, src.type, src.url, src.site, src.canonicalId,
+                   src.scrapedAt, src.scraperName,
+                   src.lastError ? JSON.stringify(src.lastError) : null,
+                   src.meta ? JSON.stringify(src.meta) : null, now);
+   }
+ }
```

Note: `merged.sources` will be `existing.sources` when `input.sources` is `undefined`, so the returned object should also prefer `existing.sources` in that case:

```diff
  return {
    ...merged,
-   sources: sourceEntries,
+   sources: input.sources !== undefined ? sourceEntries : existing.sources,
    updatedAt: now,
  };
```

---

*End of audit.*
