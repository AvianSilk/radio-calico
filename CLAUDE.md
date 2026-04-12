# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A web-based radio player for a live HLS audio stream. Users can listen to the stream, see now-playing metadata, and like/dislike the currently playing song.

## Commands

```bash
# Preferred — Docker via Make
make prod          # build images + start postgres/app/nginx in background (http://localhost:80)
make dev           # build dev image + start Express/postgres attached, hot-reload (http://localhost:3000)
make stop          # stop all containers
make stop VOLUMES=1  # stop all containers and wipe the postgres data volume
make test          # run Jest suite (no Docker needed)
make audit         # npm audit at high/critical threshold
make scan          # full 4-stage security scan: npm audit + trivy (image CVEs) + semgrep (SAST) + gitleaks (secrets); requires built images

# Without Docker (requires DATABASE_URL set)
npm run dev        # development — nodemon auto-restarts on file save (http://localhost:3000)
npm start          # production — plain node, no watching (http://localhost:3000)
npm test           # run Jest suite
```

**Stopping a foreground process**: `Ctrl+C`, or `lsof -i :3000` → `kill <PID>` if backgrounded.

## Architecture

In Docker, nginx is the public-facing web server (port 80). It serves `public/` statically and proxies `/api/*` to the Express app on port 3000 (internal Docker network, never exposed). Express has no `express.static` — it handles API routes only.

All server-side logic lives in `server.js` (Express entry point) and `routes/`. The database connection is initialised in `db/database.js` on startup — import that module wherever DB access is needed; never open a second connection.

All client-side logic is in one file: `public/js/main.js`. It handles HLS playback, metadata polling, and ratings in a single flat script with no build step. The page is a single HTML file served statically by nginx.

The metadata endpoint (`metadatav2.json`) is polled every 10 seconds from the client. It is never proxied through Express or nginx.

## External services

| Resource | URL |
|---|---|
| HLS stream | `https://d3d4yli4hf5bmh.cloudfront.net/hls/live.m3u8` |
| Now-playing metadata | `https://d3d4yli4hf5bmh.cloudfront.net/metadatav2.json` |
| Album art | `https://d3d4yli4hf5bmh.cloudfront.net/cover.jpg` |

Metadata fields: `artist, title, album, date, bit_depth, sample_rate, is_new, is_summer, is_vidgames`, plus `prev_artist_1`–`prev_title_5` for the last 5 tracks. Album art is cache-busted with `?t=<timestamp>` on each metadata poll.

## API routes

| Method | Path | Description |
|---|---|---|
| GET | `/api/ratings?song_key=` | Like/dislike counts + current user's vote |
| POST | `/api/ratings` | Submit/update a rating `{ song_key, rating: 1 \| -1 }`. Same rating twice removes it. |

Song keys are `artist|||title`. Users are identified by IP address (`X-Forwarded-For` → socket address).

## Database

PostgreSQL. Connection string via `DATABASE_URL` env var (required when running without Docker).

Default used by Docker Compose: `postgresql://radiocalico:radiocalico@postgres:5432/radiocalico`

**ratings** — `id, user_id, song_key, rating (1|-1), created_at, updated_at` — unique on `(user_id, song_key)`.

Schema is created automatically on startup via `CREATE TABLE IF NOT EXISTS` in `db/database.js`.

## Docker

| File | Purpose |
|---|---|
| `Dockerfile` | Five stages: `deps-prod`, `deps-all`, `dev` (nodemon), `prod` (Express API — npm/npx/corepack stripped at runtime), `nginx` (static + proxy) |
| `docker-compose.yml` | `postgres` + `app` (Express, internal `expose: 3000`) + `nginx` (public `ports: 80`) + `dev` (profile: `dev`) |
| `nginx/nginx.conf` | Serves `public/` directly; proxies `/api/*` to `http://app:3000` |
| `Makefile` | `prod`/`dev`: auto-start Docker Desktop if needed, then build + run; `stop`: `--profile dev down`; `test`: `npm test`; `audit`: `npm audit`; `scan`: 4-stage security scan |
| `.github/workflows/ci.yml` | CI: `test` job (Jest) + `security` job (npm audit, trivy, semgrep, gitleaks) run in parallel on push/PR |
| `.trivyignore` | Suppressed trivy CVEs — OS-level findings in Alpine pending upstream fixes; remove entries once the base image includes the patched versions |

The `dev` service bind-mounts the source directory; an anonymous volume at `/app/node_modules` prevents the host's modules from shadowing the container-compiled ones. nginx is not used in dev mode.

## Tests

| File | What it covers |
|---|---|
| `tests/ratings.api.test.js` | Backend — supertest suite for `GET /api/ratings` and `POST /api/ratings`. `db/database` is replaced with a `pg-mem` in-memory Postgres instance via `jest.mock`. DB is wiped in `afterEach`. |
| `tests/ratings.ui.test.js` | Frontend — jsdom suite for `songKey`, `applyRatingUI`, `fetchRatings`, `submitRating`, and `updateMetadata` (happy path, tag/history/quality rendering, song-change detection). |
| `tests/player.ui.test.js` | Frontend — jsdom suite for `formatTime`, `setStatus`, `setPlaying`, audio event listeners (`playing`/`waiting`/`pause`), volume slider, play/pause button (both states), and elapsed timer (`startTimer`, `stopTimer`, `pauseTimerDisplay`). |
| `tests/metadata.ui.test.js` | Frontend — jsdom suite for `fetchMetadata` (URL shape, cache-bust timestamp, album-art update, non-ok/error handling) and `updateMetadata` edge cases (missing title/artist/album/date, partial history slots, tag independence). |
| `tests/helpers/ui-setup.js` | Shared frontend test helpers: `MINIMAL_HTML` (canonical DOM fixture), `setupMainJs()` (common `beforeAll` setup sequence used by `ratings.ui` and `metadata.ui`), and `meta(overrides)` (metadata object builder). |

All frontend test files share the same loading strategy: `window.eval(script)` in `beforeAll` (indirect eval — function declarations land on `global`), `Hls` / `fetch` / `HTMLMediaElement` mocked, `jest.useFakeTimers()` to freeze the metadata polling interval. `ratings.ui.test.js` and `metadata.ui.test.js` delegate their `beforeAll` to `setupMainJs()`; `player.ui.test.js` keeps a custom `beforeAll` because it needs a full `jest.fn()` Hls constructor mock.

**Key gotchas to keep in mind:**
- `afterEach` must call `jest.resetAllMocks()` (not just `clearAllMocks`) to drain the `mockResolvedValueOnce` queue; leftover entries corrupt subsequent fetch calls.
- The `submitRating` describe uses an incrementing counter to generate a unique song key in each `beforeEach`, ensuring `updateMetadata` always changes `currentSongKey` and triggers `fetchRatings` (consuming the mock). Using a static key causes `updateMetadata` to skip `fetchRatings` on repeat runs, leaving mocks unconsumed.
- Player tests use `clearAllMocks()` (not `reset`) so the Hls constructor mock and `isSupported` implementation are preserved across tests.
- Timer tests mock `performance.now` via `jest.spyOn` — provide the value captured by `startTimer` as `mockReturnValueOnce(0)`, then `mockReturnValue(elapsedMs)` for the interval callback.
- supertest v7 requires `.set()` to be chained after the HTTP method (e.g. `.get(url).set(...)`), not before.
- The API test mock uses a closure (`let mockPool`) initialised in `beforeAll` — the jest.mock factory runs at require time but the closure is evaluated at call time, so `mockPool` is always defined when queries run. Jest requires the variable name to start with `mock` (case-insensitive) to allow out-of-scope access inside a mock factory.
- `console.error` and `console.warn` are silenced in `beforeAll` of the frontend test files via `jest.spyOn(console, 'error').mockImplementation(() => {})`. Error-path tests deliberately trigger those calls in production code; suppressing them keeps test output clean. After `jest.resetAllMocks()` runs in `afterEach`, the spy's implementation is cleared but the spy itself stays in place, so subsequent calls are still intercepted silently.

## GitHub

Always assign **AvianSilk** as the assignee on every pull request (`--add-assignee AvianSilk`).

## Stack

- nginx 1.29-alpine (web server / reverse proxy)
- Node.js v22, Express v5, `pg` (PostgreSQL client), nodemon (dev only)
- Frontend: vanilla JS + HLS.js (lazy-loaded from CDN on first play click), no bundler
- Fonts: Montserrat + Open Sans, self-hosted WOFF2 in `public/fonts/`
- Brand assets: `RadioCalicoLogoTM.png`, `RadioCalico_Style_Guide.txt` in project root
