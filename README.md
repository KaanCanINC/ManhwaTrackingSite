# Manhwa Tracking Site

Self-hosted manhwa/manga tracking app built with Next.js + SQLite.

## Storage Model

The app keeps all persistent data on disk and supports a root data directory plus per-folder overrides.

- `DATA_DIR`: root directory for persistent files.
- `DB_DIR`: SQLite directory (defaults to `${DATA_DIR}/database`).
- `BACKUPS_DIR`: backup JSON directory (defaults to `${DATA_DIR}/backups`).
- `IMPORTS_DIR`: raw import archive directory (defaults to `${DATA_DIR}/imports`).
- `MAX_BACKUPS`: maximum number of backup snapshots kept.

If override variables are not set, the app is backward compatible and uses `DATA_DIR` children.

## Local Development

```bash
npm ci
npm run dev
```

Default local storage is `<project>/data` unless you set `DATA_DIR`.

Example with custom storage root:

```bash
DATA_DIR=/tmp/manhwa-tracker-data npm run dev
```

## Self-Hosted (Docker Compose)

The provided `docker-compose.yml` is configured for persistent host paths and non-root execution.

Default host mount targets:

- `/var/lib/casaos/appdata/manhwa-tracker/database` -> `/data/database`
- `/var/lib/casaos/appdata/manhwa-tracker/backups` -> `/data/backups`
- `/var/lib/casaos/appdata/manhwa-tracker/imports` -> `/data/imports`

Start:

```bash
docker compose up -d --build
```

You can override host paths without editing compose:

```bash
HOST_DB_DIR=/mnt/storage/manhwa/database \
HOST_BACKUPS_DIR=/mnt/storage/manhwa/backups \
HOST_IMPORTS_DIR=/mnt/storage/manhwa/imports \
docker compose up -d --build
```

Optional UID/GID override:

```bash
PUID=1000 PGID=1000 docker compose up -d --build
```

## Migration from `./data` (Old Layout)

If you previously used `./data:/data` mount, migrate once:

1. Stop container.
2. Create target dirs on host.
3. Copy old files.
4. Fix ownership.
5. Start with new compose config.

Example:

```bash
docker compose down
sudo mkdir -p /var/lib/casaos/appdata/manhwa-tracker/{database,backups,imports}
sudo cp -a ./data/database/. /var/lib/casaos/appdata/manhwa-tracker/database/
sudo cp -a ./data/backups/. /var/lib/casaos/appdata/manhwa-tracker/backups/
sudo cp -a ./data/imports/. /var/lib/casaos/appdata/manhwa-tracker/imports/
sudo chown -R 1000:1000 /var/lib/casaos/appdata/manhwa-tracker
docker compose up -d --build
```

## Quality Checks

```bash
npm run lint
npm run test -- --run
npm run build
```
