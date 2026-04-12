# Radio Calico

A web-based radio player for a live lossless HLS audio stream.

![Radio Calico](RadioCalicoLogoTM.png)

## Features

- Live HLS stream playback (lossless 16-bit / 44.1 kHz)
- Now-playing metadata: track title, artist, album, year, and category tags
- Album art, updated in sync with each track change
- Recently played — last 5 tracks
- Like / dislike rating per song, persisted per user (by IP address)
- Animated visualizer and elapsed time display

## Stack

| Layer | Technology |
|---|---|
| Web server | nginx 1.29 (static files + reverse proxy) |
| API server | Node.js v22, Express v5 |
| Database | PostgreSQL via `pg` |
| Frontend | Vanilla JS, HLS.js (lazy-loaded from CDN on first play), no build step |
| Fonts | Montserrat + Open Sans (self-hosted WOFF2 in `public/fonts/`) |

## Getting started

### With Docker (recommended)

Use the Make targets for day-to-day workflow:

| Command | When to use it |
|---|---|
| `make prod` | Deploy and run the full production stack. Starts Docker Desktop automatically if it isn't running. Builds fresh images for the Express app and nginx, then starts postgres + app + nginx in the background. Visit **http://localhost:80**. |
| `make dev` | Active development. Starts Docker Desktop automatically if needed. Starts Express with nodemon (hot-reload on save) and postgres. Source files are bind-mounted into the container so edits take effect immediately. nginx is not used — the app is available directly at **http://localhost:3000**. Runs attached; press `Ctrl+C` to stop. |
| `make stop` | Stop all running containers (prod or dev). |
| `make stop VOLUMES=1` | Stop all containers **and delete the postgres data volume**. Use this to reset the database to a clean state. |
| `make test` | Run the full Jest test suite locally. No Docker or running database needed — the API tests use an in-memory Postgres instance. |
| `make audit` | Run `npm audit` at the high/critical threshold. Exits non-zero if any high or critical vulnerability is found in npm dependencies. |
| `make scan` | Full four-stage security scan: npm audit → Docker image CVE scan (trivy) → SAST (semgrep) → secrets detection (gitleaks). All stages run before reporting; exits non-zero if any findings are detected. Requires built images — run `make prod` first. |

#### Changing the port

Set the `PORT` environment variable before any target:

```bash
PORT=8080 make prod    # nginx listens on :8080 instead of :80
PORT=4000 make dev     # Express listens on :4000 instead of :3000
```

#### Traffic flow (production)

```
browser → nginx:80 → public/  (static files served directly)
                   → app:3000  (/api/* proxied to Express)
```

The Express port is internal to Docker and never reachable from the host in production.

### Without Docker

Requires a running PostgreSQL instance. Set `DATABASE_URL` before starting:

```bash
export DATABASE_URL=postgresql://user:password@localhost:5432/radiocalico
npm install
npm run dev      # http://localhost:3000  (nodemon, auto-restarts on save)
npm start        # http://localhost:3000  (plain node, production)
```

Note: without Docker, Express serves the API only — open `public/index.html` directly in a browser, or temporarily add `express.static` to `server.js` for local testing.

## API

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/ratings?song_key=` | Like/dislike counts + current user's vote |
| POST | `/api/ratings` | Submit or toggle a rating `{ song_key, rating: 1 \| -1 }` |

Song keys are formatted as `artist|||title`.

## Tests

```bash
make test  # or: npm test
```

Runs the full Jest suite (99 tests across 4 files, ~0.6 s). No Docker or running database required — the API tests use `pg-mem` (in-memory Postgres).

| File | Scope |
|---|---|
| `tests/ratings.api.test.js` | `GET /api/ratings`, `POST /api/ratings` — pg-mem in-memory Postgres, no I/O |
| `tests/ratings.ui.test.js` | `songKey`, `applyRatingUI`, `fetchRatings`, `submitRating`, `updateMetadata` |
| `tests/player.ui.test.js` | `formatTime`, audio events, volume slider, play/pause button, elapsed timer |
| `tests/metadata.ui.test.js` | `fetchMetadata` (URL, album art, error handling), `updateMetadata` edge cases |
| `tests/helpers/ui-setup.js` | Shared DOM fixture, `beforeAll` setup helper, and metadata object builder used by the frontend suites |

## Docker details

| File | Purpose |
|---|---|
| `Dockerfile` | Multi-stage build: `deps-prod`, `deps-all`, `dev`, `prod` (Express — npm stripped at runtime), `nginx` |
| `docker-compose.yml` | `postgres` + `app` (Express, internal only) + `nginx` (public) + `dev` (profile: `dev`) |
| `nginx/nginx.conf` | nginx server block: static files from `public/`, `/api/*` proxied to `app:3000` |
| `Makefile` | `make prod`, `make dev`, `make stop`, `make test`, `make audit`, `make scan` — the primary way to run the project |
| `.github/workflows/ci.yml` | CI pipeline: `test` job (Jest) and `security` job (npm audit + trivy + semgrep + gitleaks) run in parallel on every push and PR |
| `.trivyignore` | Suppressed trivy CVEs — OS-level findings in the Alpine base image that are pending upstream fixes |

The `DATABASE_URL` environment variable is set automatically inside containers. When running locally without Docker, set it yourself (see above).

## Stream sources

| Resource | URL |
|---|---|
| HLS stream | `https://d3d4yli4hf5bmh.cloudfront.net/hls/live.m3u8` |
| Now-playing metadata | `https://d3d4yli4hf5bmh.cloudfront.net/metadatav2.json` |
| Album art | `https://d3d4yli4hf5bmh.cloudfront.net/cover.jpg` |
