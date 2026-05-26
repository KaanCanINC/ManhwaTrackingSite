# Tech Context

## Stack
- Next.js 16 + React 19 + TypeScript.
- better-sqlite3 for local database.
- fast-xml-parser for MAL import.
- zod for payload validation.
- swr for client-side data fetching and refresh/polling.
- vitest for tests.
- eslint + `react-hooks` rules enforced in CI/local checks.

## Runtime Constraints
- Data root configurable via DATA_DIR.
- Container uses /data with subdirs: database, backups, imports.
- MAX_BACKUPS controls rotation limit.

## Frontend Notes
- Detail screen must keep cover compact and pinned on the left, with all metadata/editor controls on the right.
- Avoid conditional hook calls and avoid effect patterns that trigger `react-hooks/set-state-in-effect`.
