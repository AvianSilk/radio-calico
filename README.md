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
| Server | Node.js v22, Express v5 |
| Database | PostgreSQL via `pg` |
| Frontend | Vanilla JS, HLS.js (CDN), no build step |
| Fonts | Montserrat + Open Sans (Google Fonts) |

## Getting started

### With Docker (recommended)

```bash
./start.sh          # build + start production (http://localhost:3000)
./start-dev.sh      # build + start dev with hot-reload
./stop.sh           # stop all containers
./stop.sh --volumes # stop and delete the postgres data volume
```

A `PORT` env var overrides the default port:

```bash
PORT=8080 ./start.sh
```

### Without Docker

Requires a running PostgreSQL instance. Set `DATABASE_URL` before starting:

```bash
export DATABASE_URL=postgresql://user:password@localhost:5432/radiocalico
npm install
npm run dev      # http://localhost:3000  (nodemon, auto-restarts on save)
npm start        # http://localhost:3000  (plain node, production)
```

## API

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/ratings?song_key=` | Like/dislike counts + current user's vote |
| POST | `/api/ratings` | Submit or toggle a rating `{ song_key, rating: 1 \| -1 }` |

Song keys are formatted as `artist|||title`.

## Tests

```bash
npm test   # runs the full Jest suite (99 tests across 4 files, ~0.6 s)
```

The API test suite uses `pg-mem` (in-memory Postgres) — no running database required.

| File | Scope |
|---|---|
| `tests/ratings.api.test.js` | `GET /api/ratings`, `POST /api/ratings` — pg-mem in-memory Postgres, no I/O |
| `tests/ratings.ui.test.js` | `songKey`, `applyRatingUI`, `fetchRatings`, `submitRating`, `updateMetadata` |
| `tests/player.ui.test.js` | `formatTime`, audio events, volume slider, play/pause button, elapsed timer |
| `tests/metadata.ui.test.js` | `fetchMetadata` (URL, album art, error handling), `updateMetadata` edge cases |

## Docker details

| File | Purpose |
|---|---|
| `Dockerfile` | Multi-stage build with `dev` and `prod` targets |
| `docker-compose.yml` | `prod` service (default) + `dev` service (profile: `dev`) + shared `postgres` |
| `start.sh` | Build and start prod in the background |
| `start-dev.sh` | Build and start dev attached (Ctrl+C to stop) |
| `stop.sh` | Stop all containers; pass `--volumes` to also wipe the DB |

The `DATABASE_URL` environment variable is set automatically inside containers. When running locally without Docker, set it yourself (see above).

## Stream sources

| Resource | URL |
|---|---|
| HLS stream | `https://d3d4yli4hf5bmh.cloudfront.net/hls/live.m3u8` |
| Now-playing metadata | `https://d3d4yli4hf5bmh.cloudfront.net/metadatav2.json` |
| Album art | `https://d3d4yli4hf5bmh.cloudfront.net/cover.jpg` |
