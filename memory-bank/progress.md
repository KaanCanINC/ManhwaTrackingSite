# Progress

## Completed
- Next.js project bootstrapped.
- SQLite setup + migrations implemented.
- Series repository CRUD + filtering + title-based merge flow implemented.
- API routes for series, backup, import, export implemented.
- Initial dashboard UI implemented.
- Docker and compose files added for CasaOS deployment.
- Importer unit tests added.
- Tailwind-based UI overhaul applied to library and detail pages.
- Removed `UI-example/` folder after approved integration.
- Fixed tab count bug by calculating tab counts from unfiltered list and applying status filter client-side.
- Fixed malformed escaped icon text by using icon components/text rendering.
- Rating controls converted from numeric input to dropdown with labeled scale (1-10).
- Added reread tracking fields: `totalRereads` + per-reread optional date ranges.
- Migration + repository updated for new reread fields and merge preservation.
- Fixed runtime hook-order error in `SeriesDetailPage`.
- Fixed lint issue related to `react-hooks/set-state-in-effect` in dashboard data loading.
- Updated PostCSS config export style to remove anonymous-default-export warning.
- Enforced detail page structure to strict left-cover/right-details layout to prevent oversized cover rendering.
- Revalidated quality gates after fixes (`npm run lint`, `npm run build`).
- Added DB migration foundation for persistent metadata storage in `series` (description + cover BLOB fields).
- Added DB/source model foundation for scraper metadata in `series_sources` (site/canonical/error/meta fields).
- Extended repository schemas/mapping to read and write metadata fields safely.
- Added binary cover endpoint `GET /api/series/[id]/cover` for serving stored cover blobs.
- Added scraper foundation modules (`src/lib/scrapers`) including domain registry and parser contracts.
- Implemented initial parser adapters for Asura/Manhua domains (`asuracomic.net`, `manhuaus.com`, `asurascans.com.tr`).
- Implemented fetch strategy with Puppeteer fallback for blocked pages.
- Added website import API route and wired scraper output into import pipeline.
- Implemented canonical-id-first merge fallback path for website imports.
- Implemented cover URL download and BLOB persistence during website imports.
- Added source-level metadata scrape route (`/api/scrape/website`) for manual form-based enrichment.
- Added independent TR/EN metadata fetch actions in add/edit screens.
- Added per-series preferred source choice for library card source behavior.
- Added alternative title and tag extraction/presentation from scraper metadata.
- Revalidated quality gates after metadata foundation changes (`npm run lint`, `npm run test`, `npm run build`).
- Revalidated quality gates after website import wiring (`npm run lint`, `npm run test`, `npm run build`).
- Revalidated quality gates after manual source scrape UX changes (`npm run lint`, `npm run test`, `npm run build`).

## Remaining
- Expand automated tests for backup rotation and repository edge cases.
- Add dedicated import/export UI workflow with file uploads.
- Add optional Google Drive backup integration in v2.
