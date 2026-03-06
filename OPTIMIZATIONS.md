# Optimization Report

**Date:** 2026-03-06  
**Auditor:** GitHub Copilot (Claude Sonnet 4.6)  
**Scope:** Full codebase — `src/lib/`, `src/app/api/`, `src/app/page.tsx`, `src/app/series/[id]/page.tsx`

---

## 1) Optimization Summary

### Current Health

The codebase is well-structured for a personal-scale self-hosted app, but carries several high-impact inefficiencies that will noticeably degrade responsiveness even at modest library sizes (100–500 series). The single most damaging pattern is the N+1 query in `attachSources`, which multiplies DB round-trips linearly with library size on every list request. Combined with a "backup-on-every-mutation" policy, each `+1 chapter` button click triggers dozens of SQLite queries plus a synchronous full-library disk write.

### Top 3 Highest-Impact Improvements

1. **Fix the N+1 query in `attachSources`** — single batched JOIN replaces N individual source lookups.  
2. **Guard the daily backup check in memory** — avoid one DB query per GET request to `/api/series`.  
3. **Deduplicate shared frontend code into a shared module** — eliminates type and logic drift across both pages.

### Biggest Risk if No Changes Are Made

At ~300+ series the list page will noticeably lag (hundreds of milliseconds blocked on SQLite) due to the N+1 pattern. The "backup-on-change" flood will write dozens of full-library snapshots per minute during active reading sessions (e.g., bulk chapter updates), filling disk and dragging every mutation response.

---

## 2) Findings (Prioritized)

---

### F-01: N+1 Query in `attachSources`

- **Category:** DB / Algorithm
- **Severity:** Critical
- **Impact:** List-page latency, SQLite I/O, CPU
- **Evidence:** [`src/lib/series-repository.ts` — `attachSources` + `getSources`](src/lib/series-repository.ts)

```ts
// Queries DB once per series row — O(N) queries for N series
function attachSources(rows: SeriesRow[]): Series[] {
  return rows.map((row) => {
    const mapped = mapSeriesRow(row);
    return { ...mapped, sources: getSources(mapped.id) }; // ← 1 SELECT per row
  });
}
```

- **Why it's inefficient:** For 100 series, listing the library runs 101 SQLite statements: 1 to fetch series rows, then 1 per row to fetch sources. Each `prepare().all()` call creates a Statement object and issues a full round-trip to SQLite even though it's synchronous.
- **Recommended fix:** Fetch all source rows in a single query with `IN (...)`, then group them in JavaScript by `series_id` before mapping.

```ts
function attachSourcesBatched(rows: SeriesRow[]): Series[] {
  if (rows.length === 0) return [];
  const db = getDb();
  const ids = rows.map((r) => r.id);
  const placeholders = ids.map(() => "?").join(", ");
  const sourceRows = db
    .prepare(`SELECT id, series_id, type, url FROM series_sources WHERE series_id IN (${placeholders})`)
    .all(...ids) as Array<{ id: string; series_id: string; type: SourceType; url: string }>;

  const bySeriesId = new Map<string, Series["sources"]>();
  for (const s of sourceRows) {
    const list = bySeriesId.get(s.series_id) ?? [];
    list.push({ id: s.id, seriesId: s.series_id, type: s.type, url: s.url });
    bySeriesId.set(s.series_id, list);
  }

  return rows.map((row) => ({
    ...mapSeriesRow(row),
    sources: bySeriesId.get(row.id) ?? [],
  }));
}
```

- **Tradeoffs / Risks:** Slightly more complex query construction. With very large IN lists (>999 items) SQLite has a variable limit; for a personal library this is not a realistic concern, but a `LIMIT 1000` on the top-level series query would keep it safe.
- **Expected impact estimate:** **~80–95% reduction** in query count for list operations. For 200 series: 201 queries → 2 queries.
- **Removal Safety:** Safe (equivalent results)
- **Reuse Scope:** `series-repository.ts`

---

### F-02: Backup Created on Every Single Mutation

- **Category:** I/O / DB / Cost
- **Severity:** High
- **Impact:** Response latency, disk usage, filesystem I/O, SQLite load
- **Evidence:** [`src/app/api/series/route.ts`](src/app/api/series/route.ts), [`src/app/api/series/[id]/route.ts`](src/app/api/series/%5Bid%5D/route.ts)

```ts
// POST /api/series
const created = createSeries(payload);
createBackup("change"); // ← full library dump on every add

// PATCH /api/series/[id]  
const updated = updateSeries(id, payload);
createBackup("change"); // ← full library dump on every chapter +1/-1

// DELETE /api/series/[id]
deleteSeries(id);
createBackup("change"); // ← full library dump on every delete
```

`createBackup` internally calls `listSeries({})` (which itself has the N+1 issue), `JSON.stringify(snapshot, null, 2)`, two `randomUUID()` calls, a `fs.writeFileSync`, a DB insert, and `rotateBackups()` (which does N `fs.statSync` calls). This runs on every `+1 chapter` click.

- **Why it's inefficient:** A "change" backup is semantically meant to capture state before/after important mutations. Triggering it on every incremental chapter update floods the backup directory and makes every quick-action button on the card slow. With 60 backups rotating, a user doing 60 chapter increments will have deleted all pre-edit snapshots anyway.
- **Recommended fix (two options):**
  1. **Debounce/throttle** — only create a "change" backup if the last backup is older than N minutes (e.g., 15 minutes). Track last backup time in memory.
  2. **Selective backup** — only backup on create/delete, not on PATCH (or only backup on PATCH when major fields like `status` change, not `chaptersRead`).

```ts
// Option 1: throttle in memory
let lastChangedBackupAt = 0;
const CHANGE_BACKUP_COOLDOWN_MS = 15 * 60 * 1000; // 15 min

export function createChangeBackupIfNeeded(): void {
  const now = Date.now();
  if (now - lastChangedBackupAt < CHANGE_BACKUP_COOLDOWN_MS) return;
  lastChangedBackupAt = now;
  createBackup("change");
}
```

- **Tradeoffs / Risks:** Slightly looser backup granularity. The daily backup already covers "last known state". A 15-minute cooldown still provides good coverage without flooding disk.
- **Expected impact estimate:** **~90% reduction** in backup writes during active sessions. Saves full disk write + N+1 query chain on every mutation.
- **Removal Safety:** Safe (more efficient, not less correct)
- **Reuse Scope:** `backup-service.ts`, all three API mutation routes

---

### F-03: `rotateBackups()` Issues `fs.statSync` Per File

- **Category:** I/O
- **Severity:** High
- **Impact:** Backup creation latency, filesystem I/O
- **Evidence:** [`src/lib/backup-service.ts` — `rotateBackups`](src/lib/backup-service.ts)

```ts
.map((file) => {
  const fullPath = path.join(dataPaths.backupsDir, file);
  return {
    file,
    fullPath,
    mtimeMs: fs.statSync(fullPath).mtimeMs, // ← 1 syscall per backup file
  };
})
```

With MAX_BACKUPS=60, this does 60 `statSync` syscalls every time a backup is created, which is every mutation (see F-02).

- **Why it's inefficient:** The backup filenames already embed an ISO 8601 timestamp (`backup-2026-03-06T09-56-27-614Z-*.json`). Lexicographic sort on filenames gives the same chronological order as mtime, without any syscalls.
- **Recommended fix:**

```ts
function rotateBackups(): void {
  const files = fs
    .readdirSync(dataPaths.backupsDir)
    .filter((f) => f.endsWith(".json"))
    .sort()  // ISO timestamp prefix → lexicographic = chronological
    .reverse();

  const limit = maxBackups();
  for (const file of files.slice(limit)) {
    fs.unlinkSync(path.join(dataPaths.backupsDir, file));
  }
}
```

- **Tradeoffs / Risks:** Relies on filenames being consistently prefixed with `backup-<ISO>`. The current `createBackup` function always generates this pattern, so this is safe.
- **Expected impact estimate:** Eliminates 60 `statSync` calls per backup — **100% reduction** in per-backup I/O overhead.
- **Removal Safety:** Safe
- **Reuse Scope:** `backup-service.ts`

---

### F-04: Daily Backup Guard Queries DB on Every GET Request

- **Category:** DB / Reliability
- **Severity:** High
- **Impact:** GET `/api/series` latency, unnecessary DB reads
- **Evidence:** [`src/app/api/series/route.ts`](src/app/api/series/route.ts)

```ts
export async function GET(request: NextRequest) {
  runDailyBackupIfNeeded(); // ← DB query on EVERY list request
  ...
}
```

`runDailyBackupIfNeeded` prepares and runs a SELECT against `backups` table on every call. The main page re-fetches on every user interaction (query change, flag filter change). This means every keystroke in the search box issues a backup check DB query.

- **Why it's inefficient:** The "has today's backup been done?" check should be in-memory once per process day, not a DB query per HTTP request.
- **Recommended fix:**

```ts
let dailyBackupCheckedDate = "";

export function runDailyBackupIfNeeded(): { created: boolean; fileName?: string } {
  const today = new Date().toISOString().slice(0, 10);
  if (dailyBackupCheckedDate === today) return { created: false };

  runMigrations();
  const db = getDb();
  const existing = db
    .prepare(`SELECT id FROM backups WHERE reason = 'daily' AND substr(created_at, 1, 10) = ? LIMIT 1`)
    .get(today) as { id: string } | undefined;

  if (existing) {
    dailyBackupCheckedDate = today;
    return { created: false };
  }

  const backup = createBackup("daily");
  dailyBackupCheckedDate = today;
  return { created: true, fileName: backup.fileName };
}
```

- **Tradeoffs / Risks:** In a multi-process environment the flag would be per-process. For this single-process local app, this is a strict improvement. If the process restarts mid-day, it will recheck the DB once (correct behavior).
- **Expected impact estimate:** Eliminates 1 DB query per search keystroke. For a user typing a 5-character query, that's 5 avoided DB queries.
- **Removal Safety:** Safe
- **Reuse Scope:** `backup-service.ts`

---

### F-05: Missing Database Indexes

- **Category:** DB
- **Severity:** High
- **Impact:** Query latency as library grows, full-table scans
- **Evidence:** [`src/lib/migrations.ts`](src/lib/migrations.ts) — no indexes defined

The following queries run without covering indexes:

| Query | Table | Missing Index |
|---|---|---|
| `WHERE series_id = ?` | `series_sources` | `(series_id)` |
| `ORDER BY updated_at DESC` | `series` | `(updated_at DESC)` |
| `WHERE reason = 'daily' AND substr(created_at, 1, 10) = ?` | `backups` | `(reason, created_at)` |
| `WHERE LOWER(title) = LOWER(?)` | `series` | `(LOWER(title))` — expression index |
| `LOWER(title) LIKE ?` | `series` | Cannot use index for leading-wildcard LIKE; document this |

- **Why it's inefficient:** Without an index on `series_sources.series_id`, every `getSources` call scans the entire table. With 500 series averaging 2 sources each = 1000 rows scanned per lookup instead of a direct key lookup.
- **Recommended fix:** Add a migration (version 3):

```sql
-- Migration v3
CREATE INDEX IF NOT EXISTS idx_series_sources_series_id ON series_sources(series_id);
CREATE INDEX IF NOT EXISTS idx_series_updated_at ON series(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_backups_reason_created_at ON backups(reason, created_at);
CREATE INDEX IF NOT EXISTS idx_series_lower_title ON series(LOWER(title));
```

- **Tradeoffs / Risks:** Slightly slower writes (index maintenance), negligible at this scale. Index on `LOWER(title)` requires SQLite 3.8.9+ (ships with Node.js LTS, not a concern).
- **Expected impact estimate:** `getSources` improves from O(N_sources) scan → O(1) lookup. `ORDER BY updated_at` avoids full sort. Daily backup check becomes an index seek.
- **Removal Safety:** Safe
- **Reuse Scope:** DB schema / `migrations.ts`

---

### F-06: Status Filter Applied Client-Side While API Supports Server-Side Filtering

- **Category:** Algorithm / Network / Frontend
- **Severity:** High
- **Impact:** Network payload size, frontend memory, filter latency
- **Evidence:** [`src/app/page.tsx`](src/app/page.tsx)

```ts
// The effect only reacts to query and flagFilter — NOT statusFilter
useEffect(() => {
  ...fetchSeriesList(query, flagFilter)...
}, [query, flagFilter]);  // statusFilter not here

// Status filtering is done client-side in useMemo
const visibleItems = useMemo(() => {
  if (statusFilter === "all") return items;
  return items.filter((item) => item.status === statusFilter); // ← JS filter on full list
}, [items, statusFilter]);
```

The API already supports `?status=` but it is never used from the main page. The full library is always fetched and filtered in the browser.

- **Why it's inefficient:** For a library of 500 series, switching to "Completed" tab fetches (and serializes/transmits) all 500, then filters to e.g. 120 in JS. The server could return only the 120. Additionally, summary counts become inaccurate when a flag filter is active (they reflect only the flag-filtered subset, not the full library).
- **Recommended fix:** Either push `statusFilter` into the `useEffect` dependency and the API call, or (better for the tab UX) maintain a separate stats query. Since the tab counters need full-library counts, the cleanest fix is to always pass all filters including status to the server:

```ts
// include statusFilter in the effect deps and fetchSeriesList signature
async function fetchSeriesList(
  activeQuery: string,
  activeStatus: Status | "all",
  activeFlag: "none" | "reread" | "novel" | "follow"
) {
  const params = new URLSearchParams();
  if (activeQuery.trim()) params.set("query", activeQuery.trim());
  if (activeStatus !== "all") params.set("status", activeStatus);
  if (activeFlag === "reread") params.set("reread", "true");
  if (activeFlag === "novel") params.set("novelToRead", "true");
  if (activeFlag === "follow") params.set("followUpdates", "true");
  ...
}

useEffect(() => {
  ...fetchSeriesList(query, statusFilter, flagFilter)...
}, [query, statusFilter, flagFilter]);
```

Note: The tab `tabCount()` function currently uses `items.filter(...)` which relies on the full list being present. If you push status filtering server-side, tab counts should come from a separate `/api/series/counts` endpoint or use summary stats returned in the list response.

- **Tradeoffs / Risks:** Requires separating summary stats from filtered results, which is slightly more work. Alternatively, keep client-side filtering but also push it to the server to reduce payload — both approaches reduce wasted work.
- **Expected impact estimate:** **50–80% reduction** in response payload size when a status filter is active. Eliminates the full-list JS scan on every tab click.
- **Removal Safety:** Needs Verification (requires coordinated frontend + API changes)
- **Reuse Scope:** `page.tsx`, `api/series/route.ts`

---

### F-07: `updateSeries` Fetches the Existing Record Then Fetches Again After Write

- **Category:** DB
- **Severity:** Medium
- **Impact:** Extra DB round-trips on every update
- **Evidence:** [`src/lib/series-repository.ts` — `updateSeries`](src/lib/series-repository.ts)

```ts
export function updateSeries(id: string, payload: unknown): Series | null {
  ...
  const existing = getSeriesById(id);   // ← fetch 1 (SELECT + getSources)
  ...
  tx();
  return getSeriesById(id);             // ← fetch 2 (SELECT + getSources) after write
}
```

`getSeriesById` itself calls `getSources`, so each call is 2 queries. `updateSeries` runs 4 queries before the actual UPDATE. `createSeries` has the same pattern — inserts then immediately fetches back.

- **Why it's inefficient:** For `createSeries`, the inserted values are known — there's no need to re-query; just assemble the return value from `input` and `id`. For `updateSeries`, the merged value is also computed in memory (`merged`), so the return value can be constructed without a second SELECT.
- **Recommended fix:** Construct the return `Series` from the in-memory `merged` + `id` + `now` instead of calling `getSeriesById` again. The existing record check can remain as-is (needed to verify existence).
- **Tradeoffs / Risks:** If triggers or other DB-level logic modify the row after a write, the in-memory construction would diverge. For this schema with no triggers, it's safe.
- **Expected impact estimate:** Removes 2 queries from every create/update path. Combined with F-01 fix, each mutation goes from ~4 queries → 2 queries.
- **Removal Safety:** Safe (no triggers or computed columns in schema)
- **Reuse Scope:** `series-repository.ts`

---

### F-08: `runMigrations()` Called Redundantly on Every Repository Function

- **Category:** Algorithm / Reliability
- **Severity:** Medium
- **Impact:** Redundant function call overhead, code noise
- **Evidence:** Every exported function in `series-repository.ts` and `backup-service.ts`

```ts
export function listSeries(filters: SeriesFilters = {}): Series[] {
  runMigrations(); // ← called here
  ...
}
export function createSeries(payload: unknown): Series {
  runMigrations(); // ← and here
  ...
}
// backup-service.ts
export function createBackup(reason: string) {
  runMigrations(); // ← calls listSeries which also calls runMigrations
  ...
  const snapshot = { series: listSeries({}) }; // ← duplicate runMigrations call
}
```

- **Why it's inefficient:** The module-level `migrated` flag in `migrations.ts` makes subsequent calls instant (just a boolean check), so this is low-overhead. However it's architecturally noisy—migrations should be run once at application startup in `db.ts` or in the first `getDb()` call, not scattered across every repository function.
- **Recommended fix:** Call `runMigrations()` once inside `getDb()` on first initialization, and remove it from all repository functions.

```ts
// db.ts
export function getDb(): Database.Database {
  if (dbInstance) return dbInstance;
  ensureDataDirs();
  const dbPath = path.join(dataPaths.databaseDir, "tracker.sqlite");
  dbInstance = new Database(dbPath);
  dbInstance.pragma("journal_mode = WAL");
  dbInstance.pragma("foreign_keys = ON");
  runMigrations(); // ← single point of initialization
  return dbInstance;
}
```

Note: This introduces a circular import (`db.ts` → `migrations.ts` → `db.ts`). Resolve by either: (a) passing the `db` instance into `runMigrations`, or (b) calling migrations in `getDb` after checking `migrated` inline.

- **Tradeoffs / Risks:** Requires refactoring the circular import. The current approach is safe but architecturally messy.
- **Expected impact estimate:** No runtime improvement (guard is fast), but eliminates 8+ redundant function call stacks per request.
- **Removal Safety:** Needs Verification (circular import resolution required)
- **Reuse Scope:** `db.ts`, `series-repository.ts`, `backup-service.ts`

---

### F-09: `ensureDataDirs()` Called on Every Backup and Export

- **Category:** I/O
- **Severity:** Medium
- **Impact:** Unnecessary `mkdirSync` calls on hot paths
- **Evidence:** [`src/lib/backup-service.ts`](src/lib/backup-service.ts), [`src/app/api/export/full/route.ts`](src/app/api/export/full/route.ts), [`src/app/api/export/mal/route.ts`](src/app/api/export/mal/route.ts)

```ts
export function createBackup(reason: string) {
  runMigrations();
  ensureDataDirs(); // ← 3x mkdirSync on every backup
  ...
}
```

- **Why it's inefficient:** `mkdirSync` with `{ recursive: true }` is a syscall that checks directory existence and creates if missing — three times per backup creation. Directories are created once at startup and rarely disappear.
- **Recommended fix:** Call `ensureDataDirs()` once during `getDb()` / startup (already present there via `db.ts`). Remove subsequent calls from `createBackup` and export routes.
- **Tradeoffs / Risks:** If a directory is accidentally removed while the process is running, the next backup/export will fail without auto-recovery. This is an acceptable tradeoff for a local app.
- **Expected impact estimate:** Eliminates 3 `mkdirSync` syscalls per backup. Marginal but cumulative with other I/O savings.
- **Removal Safety:** Likely Safe
- **Reuse Scope:** `backup-service.ts`, export API routes

---

### F-10: `changeChapter` Triggers Full List Re-fetch After Every Increment

- **Category:** Network / Frontend
- **Severity:** Medium
- **Impact:** Unnecessary API round-trip, re-render cost
- **Evidence:** [`src/app/page.tsx` — `changeChapter`](src/app/page.tsx)

```ts
async function changeChapter(id: string, delta: number) {
  const item = items.find((i) => i.id === id);
  if (!item) return;
  const next = clampInt(item.chaptersRead + delta);
  await fetch(`/api/series/${id}`, { method: "PATCH", ... });
  await refresh(); // ← re-fetches entire library list
}
```

- **Why it's inefficient:** After incrementing one chapter, the client fetches every series again. The PATCH response already contains the updated series object.
- **Recommended fix:** Apply an optimistic (or response-based) update to local state instead of re-fetching:

```ts
async function changeChapter(id: string, delta: number) {
  const item = items.find((i) => i.id === id);
  if (!item) return;
  const next = clampInt(item.chaptersRead + delta);
  const res = await fetch(`/api/series/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chaptersRead: next }),
  });
  if (res.ok) {
    const json = (await res.json()) as { data: Series };
    setItems((prev) => prev.map((i) => (i.id === id ? json.data : i)));
  }
}
```

- **Tradeoffs / Risks:** If the server mutates other fields (e.g., auto-status derived fields), the local update would be stale until next refresh. For the current schema, only `chaptersRead` and `updatedAt` change, so using the response body is safe.
- **Expected impact estimate:** Eliminates one full-list GET per chapter increment. For rapid clicking, this is significant.
- **Removal Safety:** Safe
- **Reuse Scope:** `page.tsx`

---

### F-11: `handleSave` in Detail Page Has No Error Handling

- **Category:** Reliability
- **Severity:** Medium
- **Impact:** Silent data loss on network error or server validation failure
- **Evidence:** [`src/app/series/[id]/page.tsx` — `handleSave`](src/app/series/%5Bid%5D/page.tsx)

```ts
async function handleSave() {
  ...
  await fetch(`/api/series/${series.id}`, { method: "PATCH", ... });
  setSaving(false);
  router.push("/"); // ← always navigates away, even if fetch failed
}
```

- **Why it's inefficient/risky:** If the request fails (network error, 400 validation, 500 server error), the user is silently redirected home and their edits are lost with no indication of failure.
- **Recommended fix:**

```ts
async function handleSave() {
  if (!series || !form) return;
  setSaving(true);
  try {
    const res = await fetch(`/api/series/${series.id}`, { method: "PATCH", ... });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setError(`Save failed: ${JSON.stringify(err)}`);
      return;
    }
    router.push("/");
  } catch {
    setError("Network error — changes not saved.");
  } finally {
    setSaving(false);
  }
}
```

- **Tradeoffs / Risks:** None — pure reliability improvement.
- **Expected impact estimate:** Prevents silent data loss.
- **Removal Safety:** Safe
- **Reuse Scope:** `series/[id]/page.tsx`

---

### F-12: Duplicated Type Definitions and Utility Functions Across Both Pages

- **Category:** Maintainability / Dead Code / Reuse
- **Severity:** Medium
- **Impact:** Maintenance cost, bug surface area, bundle size
- **Evidence:** [`src/app/page.tsx`](src/app/page.tsx) and [`src/app/series/[id]/page.tsx`](src/app/series/%5Bid%5D/page.tsx)

The following are defined independently in both files:

| Symbol | page.tsx | series/[id]/page.tsx |
|---|---|---|
| `Status` type | ✓ | ✓ |
| `SourceType` type | ✓ | ✓ |
| `RereadSession` type | ✓ | ✓ |
| `Series` type | ✓ | ✓ |
| `RereadSessionForm` type | ✓ | ✓ |
| `RATING_OPTIONS` array | ✓ | ✓ |
| `STATUS_OPTIONS` array | ✓ (with `bg`) | ✓ (without `bg`) |
| `clampInt()` | ✓ | ✓ |
| `normalizeRereadSessions()` | ✓ | ✓ |
| `ensureSessionCount()` | ✓ | ✓ |
| `todayStr()` | ✓ | ✓ |
| `coverGradient()` | ✓ | ✓ |
| `FormState` type | ✓ (with title) | ✓ (without title) |

- **Why it's inefficient:** Any bug fix (e.g., `clampInt` edge case, `coverGradient` hash formula) must be applied in two places. Types already diverge slightly (`STATUS_OPTIONS` has `bg` in `page.tsx` but not in `series/[id]/page.tsx`). The `Series` frontend type duplicates `src/lib/types.ts` server types.
- **Recommended fix:** Extract to `src/lib/ui-types.ts` (shared types) and `src/lib/ui-utils.ts` (shared utilities). Consider whether the frontend `Series` type can import/re-export from the server `types.ts` (it can in a Next.js app since both are TypeScript).
- **Tradeoffs / Risks:** Reorganization effort. Requires verifying the slight divergence in `STATUS_OPTIONS` is intentional or a bug.
- **Expected impact estimate:** Maintenance improvement; small bundle deduplication from tree-shaking.
- **Removal Safety:** Needs Verification
- **Reuse Scope:** Both client pages

---

### F-13: Import API Routes Are Near-Identical (Reuse Opportunity)

- **Category:** Maintainability / Dead Code / Reuse
- **Severity:** Medium
- **Impact:** Maintenance cost, future divergence risk
- **Evidence:** [`src/app/api/import/mal/route.ts`](src/app/api/import/mal/route.ts) and [`src/app/api/import/anilist/route.ts`](src/app/api/import/anilist/route.ts)

Both routes are ~50 lines of identical logic: parse body, validate, save to disk, loop `mergeSeriesByTitle`, insert into `imports` table, return counts. The only differences are the parser function and the `source` string.

- **Why it's inefficient:** Any shared logic changes (e.g., adding error wrapping, changing the import table schema) must be duplicated. A bug in one is likely present in both.
- **Recommended fix:** Extract a shared `runImport(source: string, content: string, parser: (c: string) => ImportSeriesInput[])` function in a shared module (e.g., `src/lib/import-handler.ts`), then each route becomes a 5-line wrapper.
- **Tradeoffs / Risks:** Minor refactor, purely upside.
- **Expected impact estimate:** Cuts 40+ lines of duplicated code; single point of truth for import logic.
- **Removal Safety:** Safe
- **Reuse Scope:** Both import API routes

---

### F-14: Export Routes Write Files to Disk on Every Request Without Cleanup

- **Category:** I/O / Cost
- **Severity:** Low
- **Impact:** Disk accumulation over time
- **Evidence:** [`src/app/api/export/full/route.ts`](src/app/api/export/full/route.ts), [`src/app/api/export/mal/route.ts`](src/app/api/export/mal/route.ts)

```ts
const fileName = `full-export-${Date.now()}.json`;
const outputPath = path.join(dataPaths.importsDir, fileName);
fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), "utf8");
```

Every export click writes a timestamped file to `data/imports/` with no rotation or cleanup. Over time (especially if a user exports frequently), this directory fills up.

- **Why it's inefficient:** The full export writes a pretty-printed JSON to disk and then transmits the same data in the HTTP response body. The disk copy is redundant unless it serves an audit trail purpose. The MAL export correctly streams the file in the response body, but also writes to disk unnecessarily.
- **Recommended fix:** Either (a) remove the disk write from exports (the HTTP response is the deliverable), or (b) apply the same rotation logic from `rotateBackups` to export files (keep last N). If disk persistence is desired for audit purposes, document this intention.
- **Tradeoffs / Risks:** If the disk file is intended as a "last known export" artifact, removal would change behavior. But no code reads these files back, so they appear to be unused artifacts.
- **Expected impact estimate:** Prevents unbounded export file accumulation.
- **Removal Safety:** Likely Safe (no reader code found)
- **Reuse Scope:** Both export routes

---

### F-15: `JSON.stringify(snapshot, null, 2)` in Backups Wastes Disk and CPU

- **Category:** I/O / Memory
- **Severity:** Low
- **Impact:** Backup file size, serialization time
- **Evidence:** [`src/lib/backup-service.ts`](src/lib/backup-service.ts)

```ts
fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), "utf8");
```

The `null, 2` argument produces human-readable but larger JSON (~30–50% larger than compact JSON). Backups are machine-generated files, not designed to be hand-edited.

- **Why it's inefficient:** For 500 series with sources and reread sessions, a pretty-printed backup might be 500 KB vs. 350 KB compact. Multiplied by 60 backups in rotation = 9 MB vs. 6 MB. Also, V8's `JSON.stringify` with indentation is measurably slower.
- **Recommended fix:** Use `JSON.stringify(snapshot)` (no indentation). If human readability is desired, document it as intentional.
- **Tradeoffs / Risks:** Backup files become harder to read manually. Functionally identical on import.
- **Expected impact estimate:** ~30% smaller backup files; faster serialization.
- **Removal Safety:** Safe
- **Reuse Scope:** `backup-service.ts`

---

### F-16: No `busy_timeout` Set on SQLite Connection

- **Category:** Reliability
- **Severity:** Low
- **Impact:** Occasional SQLITE_BUSY errors under concurrent access
- **Evidence:** [`src/lib/db.ts`](src/lib/db.ts)

```ts
dbInstance.pragma("journal_mode = WAL");
dbInstance.pragma("foreign_keys = ON");
// missing: dbInstance.pragma("busy_timeout = 5000");
```

- **Why it's inefficient:** Without `busy_timeout`, SQLite returns `SQLITE_BUSY` immediately when a write lock is held by another connection (e.g., SQLite CLI, Docker volume mount, another process). WAL mode reduces this risk but doesn't eliminate it.
- **Recommended fix:**

```ts
dbInstance.pragma("busy_timeout = 5000"); // wait up to 5s before failing
```

- **Tradeoffs / Risks:** Requests may hang for up to 5 seconds under extreme lock contention. For a single-process local app, this is almost never triggered.
- **Expected impact estimate:** Prevents rare but hard-to-debug SQLITE_BUSY crashes.
- **Removal Safety:** Safe
- **Reuse Scope:** `db.ts`

---

### F-17: `mergeSeriesByTitle` Has `findSeriesByTitle` + `updateSeries` Pattern That Repeats `getSeriesById`

- **Category:** DB / Algorithm
- **Severity:** Low
- **Impact:** Extra DB queries during bulk import
- **Evidence:** [`src/lib/series-repository.ts` — `mergeSeriesByTitle`](src/lib/series-repository.ts)

```ts
export function mergeSeriesByTitle(payload: unknown) {
  const existing = findSeriesByTitle(parsed.title); // SELECT + getSources (2 queries)
  if (!existing) {
    return { type: "added", series: createSeries(parsed) }; // INSERT + SELECT + getSources (3 queries)
  }
  const updated = updateSeries(existing.id, nextPayload); // SELECT + getSources + UPDATE + SELECT + getSources (5 queries)
  ...
}
```

For a 500-item MAL import, this runs the N+1 pattern 500 times. Each `mergeSeriesByTitle` alone can be 7 queries in the update branch.

- **Why it's inefficient:** Bulk imports are prime candidates for batch operations. All title lookups could be done in one `IN` query upfront, then creates/updates could be batched into a single transaction.
- **Recommended fix:** For large imports, add a batch variant of `mergeSeriesByTitle` that pre-fetches all existing titles in one query and wraps all inserts/updates in a single transaction.
- **Tradeoffs / Risks:** More complex implementation. For typical MAL imports (100–500 items) the current approach takes a second or two but is not catastrophic.
- **Expected impact estimate:** For 300-item import: ~2100 queries → ~3 queries + 300 individual writes in one transaction. Import time drops from potential multi-second to sub-100ms.
- **Removal Safety:** Needs Verification
- **Reuse Scope:** `series-repository.ts`, both import routes

---

## 3) Quick Wins (Do First)

Ordered by impact-to-effort ratio:

| # | Finding | Effort | Impact |
|---|---|---|---|
| 1 | **F-03**: Replace `statSync` loop with filename sort in `rotateBackups` | 5 min | High |
| 2 | **F-04**: Add in-memory guard to `runDailyBackupIfNeeded` | 10 min | High |
| 3 | **F-16**: Add `busy_timeout` pragma to `getDb` | 2 min | Low (reliability) |
| 4 | **F-15**: Remove pretty-printing from `JSON.stringify` in backups | 1 min | Low |
| 5 | **F-11**: Add error handling to `handleSave` in detail page | 15 min | Medium (reliability) |
| 6 | **F-10**: Update `changeChapter` to use PATCH response instead of full refresh | 15 min | Medium |
| 7 | **F-02**: Add backup throttle/cooldown for "change" backups | 20 min | High |

---

## 4) Deeper Optimizations (Do Next)

1. **F-01 — N+1 Fix:** Rewrite `attachSources` to use a batched IN query. This is the highest-ROI structural DB change and requires a careful test of the `listSeries` → `getSeriesById` → `createSeries` → `updateSeries` call graph.

2. **F-05 — Add DB Indexes:** Add a migration v3 with all missing indexes. Run `EXPLAIN QUERY PLAN` on the key SELECT statements before and after to confirm index usage.

3. **F-06 — Server-Side Status Filter:** Push `statusFilter` to the API. Requires a separate stats/counts endpoint or embedding counts in the list response to keep the tab bar accurate. Consider adding a `GET /api/series/counts` endpoint returning status group counts without transferring full series objects.

4. **F-12 — Shared Frontend Module:** Extract `src/lib/ui-types.ts` and `src/lib/ui-utils.ts`. This prevents type drift, reduces bundle size marginally, and centralizes form logic for future pages.

5. **F-13 — Shared Import Handler:** Extract a generic `runImport` helper to eliminate the near-duplicate import routes. This is a low-risk refactor with high maintenance benefit.

6. **F-17 — Batch Import Transaction:** Wrap the import loop in a single SQLite transaction and pre-fetch all existing titles in one query. This is the most complex change but dramatically improves large import performance.

7. **F-07 + F-08 — Eliminate Redundant Post-Write SELECTs / Centralize Migration Init:** Construct return values from in-memory state after writes. Move `runMigrations()` into `getDb()` with circular import resolution (pass db reference into migrations).

---

## 5) Validation Plan

### Benchmarks

1. **Baseline list latency** — Time `GET /api/series` (no filters) with 100, 300, 500 series using `curl -w "%{time_total}"`. Record before and after F-01 fix.

2. **Mutation + backup latency** — Time `PATCH /api/series/:id` (chapter +1) before/after F-02 + F-03 fixes with 60 backup files in the directory.

3. **Import throughput** — Time a 300-item MAL import before/after F-17 batch fix.

### Profiling Strategy

```bash
# Instrument SQLite query count — add a counter to db.ts:
# globalThis.__queryCount = 0;
# wrap db.prepare() to increment counter

# Then in a test:
GET /api/series  # record __queryCount before, after
# For N series: expected before = N+1, after = 2
```

### Metrics to Compare Before/After

| Metric | Before | Target |
|---|---|---|
| Queries per `GET /api/series` (N=200) | ~201 | 2 |
| Queries per `PATCH /api/series/:id` | ~7 | 3 |
| Backup files per 10 chapter increments | 10 | 0–1 |
| `rotateBackups` syscalls per rotation (60 files) | 60 statSync | 0 statSync |
| Daily backup check queries per search keystroke | 1 | 0 (memory guard) |

### Correctness Test Cases

- After F-01: verify `series.sources` on all returned items matches pre-fix output.
- After F-02: verify that a "change" backup IS created if the cooldown has elapsed, and is NOT created within the cooldown window.
- After F-03: verify old backup files are correctly deleted when limit is exceeded; new file is kept.
- After F-06: verify tab counts still reflect full-library totals (not just filtered subset counts).
- After F-17: verify that `mergeSeriesByTitle` still correctly preserves `chaptersRead`, `rating`, `personalNotes` from the existing record on merge.

---

## 6) Optimized Code / Patch

### Patch 1 — F-03: `rotateBackups` without statSync

**File:** `src/lib/backup-service.ts`

```ts
// BEFORE
function rotateBackups(): void {
  const files = fs
    .readdirSync(dataPaths.backupsDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => {
      const fullPath = path.join(dataPaths.backupsDir, file);
      return {
        file,
        fullPath,
        mtimeMs: fs.statSync(fullPath).mtimeMs,
      };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  const limit = maxBackups();
  if (files.length <= limit) {
    return;
  }

  for (const item of files.slice(limit)) {
    fs.unlinkSync(item.fullPath);
  }
}

// AFTER
function rotateBackups(): void {
  const files = fs
    .readdirSync(dataPaths.backupsDir)
    .filter((f) => f.endsWith(".json"))
    .sort()      // ISO timestamp prefix -> lexicographic order = chronological
    .reverse();  // newest first

  const limit = maxBackups();
  for (const file of files.slice(limit)) {
    fs.unlinkSync(path.join(dataPaths.backupsDir, file));
  }
}
```

---

### Patch 2 — F-04: In-memory guard for daily backup check

**File:** `src/lib/backup-service.ts`

```ts
// Add at module level:
let dailyBackupCheckedDate = "";

// REPLACE runDailyBackupIfNeeded:
export function runDailyBackupIfNeeded(): { created: boolean; fileName?: string } {
  const today = new Date().toISOString().slice(0, 10);
  if (dailyBackupCheckedDate === today) {
    return { created: false };
  }

  runMigrations();
  const db = getDb();
  const existing = db
    .prepare(
      `SELECT id FROM backups WHERE reason = 'daily' AND substr(created_at, 1, 10) = ? LIMIT 1`
    )
    .get(today) as { id: string } | undefined;

  if (existing) {
    dailyBackupCheckedDate = today;
    return { created: false };
  }

  const backup = createBackup("daily");
  dailyBackupCheckedDate = today;
  return { created: true, fileName: backup.fileName };
}
```

---

### Patch 3 — F-02: Throttle "change" backups

**File:** `src/lib/backup-service.ts`

```ts
// Add at module level:
let lastChangeBackupAt = 0;
const CHANGE_BACKUP_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes

// New export:
export function createChangeBackupIfCooledDown(): void {
  const now = Date.now();
  if (now - lastChangeBackupAt < CHANGE_BACKUP_COOLDOWN_MS) return;
  lastChangeBackupAt = now;
  createBackup("change");
}
```

Then in `src/app/api/series/route.ts`, `src/app/api/series/[id]/route.ts`:

```ts
// Replace createBackup("change") with:
createChangeBackupIfCooledDown();
```

---

### Patch 4 — F-01: Batched source loading

**File:** `src/lib/series-repository.ts`

```ts
// REPLACE attachSources:
function attachSources(rows: SeriesRow[]): Series[] {
  if (rows.length === 0) return [];
  const db = getDb();
  const ids = rows.map((r) => r.id);
  const placeholders = ids.map(() => "?").join(", ");
  const srcRows = db
    .prepare(
      `SELECT id, series_id, type, url FROM series_sources WHERE series_id IN (${placeholders})`
    )
    .all(...ids) as Array<{ id: string; series_id: string; type: SourceType; url: string }>;

  const byId = new Map<string, Series["sources"]>();
  for (const s of srcRows) {
    const arr = byId.get(s.series_id) ?? [];
    arr.push({ id: s.id, seriesId: s.series_id, type: s.type, url: s.url });
    byId.set(s.series_id, arr);
  }

  return rows.map((row) => ({
    ...mapSeriesRow(row),
    sources: byId.get(row.id) ?? [],
  }));
}
```

---

### Patch 5 — F-05: Missing indexes (Migration v3)

**File:** `src/lib/migrations.ts`

```ts
// Add after the existing version 2 block:
if (version.version < 3) {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_series_sources_series_id
      ON series_sources(series_id);
    CREATE INDEX IF NOT EXISTS idx_series_updated_at
      ON series(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_backups_reason_created_at
      ON backups(reason, created_at);
    CREATE INDEX IF NOT EXISTS idx_series_lower_title
      ON series(LOWER(title));
  `);
  db.prepare(
    "INSERT INTO schema_migrations(version, executed_at) VALUES (?, ?)"
  ).run(3, new Date().toISOString());
}
```

---

### Patch 6 — F-16: SQLite `busy_timeout`

**File:** `src/lib/db.ts`

```ts
dbInstance.pragma("journal_mode = WAL");
dbInstance.pragma("foreign_keys = ON");
dbInstance.pragma("busy_timeout = 5000"); // ← add this line
```

---

### Patch 7 — F-10: Use PATCH response in `changeChapter`

**File:** `src/app/page.tsx`

```ts
async function changeChapter(id: string, delta: number) {
  const item = items.find((i) => i.id === id);
  if (!item) return;
  const next = clampInt(item.chaptersRead + delta);
  const res = await fetch(`/api/series/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chaptersRead: next }),
  });
  if (res.ok) {
    const json = (await res.json()) as { data: Series };
    setItems((prev) => prev.map((i) => (i.id === id ? json.data : i)));
  }
}
```

---

*End of OPTIMIZATIONS.md*
