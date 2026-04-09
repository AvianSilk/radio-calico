# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Session

**To resume the most recent session**: `claude --resume ca8722bd-abdd-4df1-af0f-c28dc8c85a96`

At the end of every session, update the session ID above with the current session's ID. The session ID can be found by running: `ls ~/.claude/projects/-Users-venkataadapala-General-Code-radiocalico/`

## What this is

A web-based radio player for a live HLS audio stream. Users can listen to the stream, see now-playing metadata, and like/dislike the currently playing song.

## Commands

```bash
npm run dev   # development — nodemon auto-restarts on file save
npm start     # production — plain node, no watching
```

Server runs at `http://localhost:3000`. Override with `PORT` env var.

**Stopping**: `Ctrl+C` in the terminal, or `lsof -i :3000` → `kill <PID>` if backgrounded.

Run tests with `npm test` (Jest). All test files live in `tests/`.

## Architecture

All server-side logic lives in `server.js` (Express entry point) and `routes/`. The database connection and schema are both initialised in `db/database.js` on startup — import that module wherever DB access is needed; never open a second connection.

All client-side logic is in one file: `public/js/main.js`. It handles HLS playback, metadata polling, and ratings in a single flat script with no build step. The page is a single HTML file served statically.

The metadata endpoint (`metadatav2.json`) is polled every 10 seconds from the client. It is never proxied through the Express server.

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

SQLite at `db/radiocalico.db` (auto-created on first run, WAL mode, foreign keys on).

**ratings** — `id, user_id, song_key, rating (1|-1), created_at, updated_at` — unique on `(user_id, song_key)`.

## Tests

| File | What it covers |
|---|---|
| `tests/ratings.api.test.js` | Backend — supertest suite for `GET /api/ratings` and `POST /api/ratings`. `db/database` is replaced with an in-memory SQLite instance via `jest.mock` so no file is touched. DB is wiped in `afterEach`. |
| `tests/ratings.ui.test.js` | Frontend — jsdom suite for `songKey`, `applyRatingUI`, `fetchRatings`, `submitRating`, and `updateMetadata` (happy path, tag/history/quality rendering, song-change detection). |
| `tests/player.ui.test.js` | Frontend — jsdom suite for `formatTime`, `setStatus`, `setPlaying`, audio event listeners (`playing`/`waiting`/`pause`), volume slider, play/pause button (both states), and elapsed timer (`startTimer`, `stopTimer`, `pauseTimerDisplay`). |
| `tests/metadata.ui.test.js` | Frontend — jsdom suite for `fetchMetadata` (URL shape, cache-bust timestamp, album-art update, non-ok/error handling) and `updateMetadata` edge cases (missing title/artist/album/date, partial history slots, tag independence). |

All frontend test files share the same loading strategy: `window.eval(script)` in `beforeAll` (indirect eval — function declarations land on `global`), `Hls` / `fetch` / `HTMLMediaElement` mocked, `jest.useFakeTimers()` to freeze the metadata polling interval.

**Key gotchas to keep in mind:**
- `afterEach` must call `jest.resetAllMocks()` (not just `clearAllMocks`) to drain the `mockResolvedValueOnce` queue; leftover entries corrupt subsequent fetch calls.
- The `submitRating` describe uses an incrementing counter to generate a unique song key in each `beforeEach`, ensuring `updateMetadata` always changes `currentSongKey` and triggers `fetchRatings` (consuming the mock). Using a static key causes `updateMetadata` to skip `fetchRatings` on repeat runs, leaving mocks unconsumed.
- Player tests use `clearAllMocks()` (not `reset`) so the Hls constructor mock and `isSupported` implementation are preserved across tests.
- Timer tests mock `performance.now` via `jest.spyOn` — provide the value captured by `startTimer` as `mockReturnValueOnce(0)`, then `mockReturnValue(elapsedMs)` for the interval callback.
- supertest v7 requires `.set()` to be chained after the HTTP method (e.g. `.get(url).set(...)`), not before.

## GitHub

Always assign **AvianSilk** as the assignee on every pull request (`--add-assignee AvianSilk`).

## Stack

- Node.js v22, Express v5, `better-sqlite3`, nodemon (dev only)
- Frontend: vanilla JS + HLS.js (CDN), no bundler
- Fonts: Montserrat + Open Sans via Google Fonts
- Brand assets: `RadioCalicoLogoTM.png`, `RadioCalico_Style_Guide.txt` in project root
