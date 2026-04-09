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
| Database | SQLite via `better-sqlite3` |
| Frontend | Vanilla JS, HLS.js (CDN), no build step |
| Fonts | Montserrat + Open Sans (Google Fonts) |

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
```

`npm run dev` uses nodemon and auto-restarts on file changes. Use `npm start` for production (plain node, no watching).

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

| File | Scope |
|---|---|
| `tests/ratings.api.test.js` | `GET /api/ratings`, `POST /api/ratings` — in-memory SQLite, no file I/O |
| `tests/ratings.ui.test.js` | `songKey`, `applyRatingUI`, `fetchRatings`, `submitRating`, `updateMetadata` |
| `tests/player.ui.test.js` | `formatTime`, audio events, volume slider, play/pause button, elapsed timer |
| `tests/metadata.ui.test.js` | `fetchMetadata` (URL, album art, error handling), `updateMetadata` edge cases |

## Stream sources

| Resource | URL |
|---|---|
| HLS stream | `https://d3d4yli4hf5bmh.cloudfront.net/hls/live.m3u8` |
| Now-playing metadata | `https://d3d4yli4hf5bmh.cloudfront.net/metadatav2.json` |
| Album art | `https://d3d4yli4hf5bmh.cloudfront.net/cover.jpg` |
