# System Patterns

## Architecture
- Next.js App Router provides UI and API routes.
- SQLite persistence with migration bootstrap on demand.
- Repository layer encapsulates CRUD/filter/merge behavior.
- Backup service writes timestamped JSON snapshots and rotates old files.
- Importers parse MAL XML and AniList JSON into a normalized model.
- Website scraping pipeline now follows: domain resolve -> page fetch -> parser -> normalized import input.
- Page fetch uses direct HTTP first and falls back to Puppeteer when blocked (403/429/Cloudflare-like pages).
- Website import endpoint (`POST /api/import/website`) persists scrape artifacts and merges using canonical source match first (`site + canonical_id`), then title fallback.
- Manual scrape endpoint (`POST /api/scrape/website`) returns parsed metadata + optional cover BLOB (base64) without creating/merging a series.
- Cover images are persisted as BLOBs in SQLite and served through a dedicated binary endpoint (`/api/series/[id]/cover`) to keep JSON responses lightweight.
- Detail page uses a strict two-column UI pattern: fixed-width cover rail on the left, editable metadata/forms on the right.

## Data Model
- series: core tracking fields + custom flags + status + reread details (`total_rereads`, `reread_sessions`) + durable metadata (`description`, `cover_image_blob`, `cover_image_mime_type`, `cover_image_fetched_at`, `metadata_fetched_at`) + preferred source selector (`preferred_source_type`).
- series_sources: normalized source links (TR/EN) per series + scraper metadata (`site`, `canonical_id`, `scraped_at`, `scraper_name`, `last_error`, `meta`).
- backups/imports: operational audit records.
