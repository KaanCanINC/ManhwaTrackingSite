# ManCon

Self-hosted manhwa/manga tracking app built with Next.js + SQLite

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
DATA_DIR=/tmp/mancon-data npm run dev
```

## Self-Hosted (Docker Compose)

The provided `docker-compose.yml` is configured for persistent host paths and non-root execution.

Default host mount targets:

- `/var/lib/casaos/appdata/mancon/database` -> `/data/database`
- `/var/lib/casaos/appdata/mancon/backups` -> `/data/backups`
- `/var/lib/casaos/appdata/mancon/imports` -> `/data/imports`

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

You can set the image path explicitly (recommended for GitHub packages):

```bash
IMAGE=ghcr.io/<github-user-or-org>/<repo>:latest docker compose up -d
```

## GitHub Push + GHCR Release Flow

1. Ensure your default branch is `main` and this workflow exists:
	- `.github/workflows/docker.yml`
2. Push code to GitHub:

```bash
git add .
git commit -m "release: prepare casaos deployment"
git push origin main
```

3. The workflow builds and pushes image tags to GHCR automatically:
	- `latest` for default branch
	- `sha-<commit>` for traceable immutable images
	- `v*` tags when you create version tags

Optional version release:

```bash
git tag v1.0.0
git push origin v1.0.0
```

4. In GitHub, verify package visibility if needed:
	- Repository -> Packages -> container image
	- Set visibility according to your usage (`public` for easy pull)

## CasaOS Install Steps

1. In CasaOS terminal, create project folder and copy files:

```bash
mkdir -p /DATA/AppData/mancon
cd /DATA/AppData/mancon
```

2. Place these files in that folder:
	- `docker-compose.yml`
	- `.env` (based on `.env.example`)

3. Create and edit `.env`:

```bash
cp .env.example .env
```

Required values to review:
	- `IMAGE` (your GHCR path)
	- `HOST_DB_DIR`, `HOST_BACKUPS_DIR`, `HOST_IMPORTS_DIR`
	- `PUID`, `PGID`
	- `PORT`

4. Start service:

```bash
docker compose up -d
```

5. Update to newest image later:

```bash
docker compose pull
docker compose up -d
```

6. Check health:

```bash
docker ps
docker logs -f mancon
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
sudo mkdir -p /var/lib/casaos/appdata/mancon/{database,backups,imports}
sudo cp -a ./data/database/. /var/lib/casaos/appdata/mancon/database/
sudo cp -a ./data/backups/. /var/lib/casaos/appdata/mancon/backups/
sudo cp -a ./data/imports/. /var/lib/casaos/appdata/mancon/imports/
sudo chown -R 1000:1000 /var/lib/casaos/appdata/mancon
docker compose up -d --build
```

## Quality Checks

```bash
npm run lint
npm run test -- --run
npm run build
```
