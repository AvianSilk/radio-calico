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

No test runner is configured (`npm test` is a no-op stub).

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

## Stack

- Node.js v22, Express v5, `better-sqlite3`, nodemon (dev only)
- Frontend: vanilla JS + HLS.js (CDN), no bundler
- Fonts: Montserrat + Open Sans via Google Fonts
- Brand assets: `RadioCalicoLogoTM.png`, `RadioCalico_Style_Guide.txt` in project root
