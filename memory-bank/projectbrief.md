# Project Brief

Self-hosted manhwa tracking service for CasaOS.

## Core Goals
- Replace browser-tab based backlog tracking with a structured local app.
- Support tracking fields: title, total_chapters, chapters_read, start_date, finish_date, rating (1-10), personal_notes.
- Support flags: reread, novel_to_read, follow_updates.
- Support multiple sources per series (TR, EN).
- Keep data local under /data and SQLite-first.
- Provide import/export for MAL and AniList formats.
- Provide non-overwriting backups with rotation via MAX_BACKUPS.
