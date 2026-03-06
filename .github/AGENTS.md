# AGENTS.md

## Must-follow constraints

* This project is a **self-hosted manhwa/manga tracking service** designed to run inside **CasaOS via Docker**.

* The application **must run without any external cloud dependency** except optional **Google Drive backup**.

* **Database must be SQLite** by default.

  * Reason: simple backup, easy migration, minimal setup for self-hosting.
  * Do NOT introduce PostgreSQL/MySQL unless explicitly requested.

* **All user data must be stored locally** in `/data` volume inside the container.

  * This directory must include:
  * database
  * backups
  * import/export files

* **Backups must never overwrite previous backups.**
  Backup rotation must respect a configurable `MAX_BACKUPS` limit.

* **All backup files must be portable JSON or SQLite dumps.**
  Proprietary formats are not allowed.

* Importers must support:

  * **MyAnimeList export**
  * **AniList export**

* Export must support:

  * full database export
  * MAL-compatible export format

* The system must support **offline operation**.
  External APIs must only be used during **optional import or metadata enrichment**.

---

## Validation before finishing

Agents must ensure the following commands succeed before completing a change:

```
npm run build
npm run lint
npm run test
```

If tests fail, the change is incomplete.

---

## Repo-specific conventions

Tracked series must support the following fields:

Required tracking fields:

* title
* total_chapters
* chapters_read
* start_date
* finish_date
* rating (1-10)
* personal_notes

Extended reread fields:

* `total_rereads` (integer)
* `reread_sessions` (JSON array of optional start/finish date pairs)

Custom tracking flags:

* `reread`
* `novel_to_read`
* `follow_updates`

Series must support **multiple source links**, for example:

* Turkish translation site
* English update site

These must be stored as:

```
sources: [
  { type: "TR", url: "" },
  { type: "EN", url: "" }
]
```

Filtering must support:

* reading
* completed
* plan_to_read
* reread
* follow_updates
* novel_to_read

---

## Important locations

Persistent storage:

```
/data
/data/database
/data/backups
/data/imports
```

Backup service:

```
src/lib/backup-service.ts
```

Importers:

```
src/lib/importers/mal.ts
src/lib/importers/anilist.ts
```

---

## Change safety rules

Do NOT introduce changes that break:

* existing database schema
* export format
* backup compatibility

If schema changes are required:

* a migration must be created
* existing databases must upgrade automatically

---

## Known gotchas

* MAL and AniList exports use **different ID systems**.
  Never assume IDs are interchangeable.

* Some manhwa sites change URLs frequently.
  Source links must not be used as primary identifiers.

* Chapter counts often differ between sources.
  `chapters_read` must remain user-controlled and never auto-synced.

---
