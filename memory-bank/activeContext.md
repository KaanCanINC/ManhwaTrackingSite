# Active Context

## Current Focus
- Keep dashboard/detail UX stable after Tailwind migration.
- Preserve strict two-column detail layout (left cover, right metadata/editor).
- Maintain lint/build/test clean status while iterating on tracking features.
- Implement persistent scraped metadata so title/description/cover survive source-site downtime.

## Recent Decisions
- Stack: Next.js full-stack, SQLite.
- Auth: single-user, no login.
- Backup strategy: change-triggered + daily.
- UI language: English-first.
- Import conflicts: merge by title while preserving personal progress/rating/notes.
- Removed `UI-example/` folder after integration approval to avoid project confusion.
- Replaced escaped icon text with real icon components in modals/cards.
- Changed rating inputs to semantic dropdown labels (`1 Appalling` ... `10 Masterpiece`).
- Added `totalRereads` (integer) and `rereadSessions` (optional start/finish date pairs) to series model and UI.
- Fixed `SeriesDetailPage` hook-order runtime error by removing conditional hook usage.
- Refactored list loading flow to satisfy `react-hooks/set-state-in-effect` lint rule.
- Enforced detail page as fixed two-column layout via flex (`left cover` + `right details/form`).
- Added schema/repository foundation for durable metadata storage (`description`, cover BLOB, metadata timestamps).
- Added source-level scraper metadata fields (`site`, `canonical_id`, `scraped_at`, `scraper_name`, `last_error`, `meta`).
- Added binary cover delivery endpoint: `GET /api/series/[id]/cover`.
- Added scraper module scaffold under `src/lib/scrapers` with domain registry and metadata extraction helpers.
- Added first domain parsers for `asuracomic.net`, `manhuaus.com`, `asurascans.com.tr`.
- Added direct HTTP fetch with automatic Puppeteer fallback for blocked/Cloudflare-like responses.
- Added website import API endpoint: `POST /api/import/website`.
- Wired scraper output into import pipeline with canonical-id-first merge and title fallback.
- Added cover image download step (`cover URL -> BLOB`) during website imports.
- Added manual source scrape endpoint for form workflows: `POST /api/scrape/website`.
- Added per-source fetch buttons in add/edit forms (TR and EN independently).
- Added preferred source selection for library display (`TR` or `EN`) and surfaced alternative titles under card/title.
- Added backup browsing workflow in UI (open modal, list backups, create manual backup, download by id).
- Expanded import modal to support file uploads (MAL XML + AniList JSON/XML).
- Added AniList import endpoint XML fallback by reusing MAL XML parser.
- Expanded MAL parser compatibility for official `manga_*` fields and stronger status normalization.
- Switched library/detail cover rendering to `next/image` to remove plain-img warnings.
- Started self-hosted storage realignment implementation:
- Added directory-level storage overrides (`DB_DIR`, `BACKUPS_DIR`, `IMPORTS_DIR`) on top of `DATA_DIR`.
- Updated docker compose to mount host-persistent per-folder paths instead of repo-local `./data`.
- Updated runtime container to run as non-root (`node`) and keep storage envs explicit.
- Replaced README with project-specific storage and migration documentation.
- Removed browser-native alert/confirm usage from key flows and replaced with in-app styled notices/modals.
- Added import preview-selection flow so users can choose exactly which entries are imported.
- Added import preview API endpoint: `POST /api/import/preview`.
- Added one-time metadata enrichment for MAL/AniList imports via provider APIs, including source URL/canonical metadata and optional cover fetch.
- Extended preferred source model to include imported providers (`MAL`, `ANILIST`) for imported series.
- Added focused `import-handler` unit tests for preview mapping, selected-index filtering, and MAL enrichment call sequencing.
