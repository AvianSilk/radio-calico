---
name: RadioCalico Architecture Constraints
description: Architectural constraints that affect where extracted code can live — no bundler, single-file client JS, no-bundler frontend
type: project
---

This is a Node.js/Express radio player app with a vanilla JS frontend and no build step.

**Key architectural constraints for refactoring:**
- `public/js/main.js` is a single flat script loaded directly by the browser with no bundler. All client-side extractions must stay within this one file — creating a second JS module would require a bundler or explicit script tag, which is out of scope.
- Server-side code follows a `routes/` + `db/` module split. New shared utilities for the backend can live in a `lib/` or `utils/` folder and be required normally.
- The three frontend test files (`ratings.ui.test.js`, `player.ui.test.js`, `metadata.ui.test.js`) each load `public/js/main.js` via `window.eval` in a `beforeAll`. They share a large `MINIMAL_HTML` DOM fixture and nearly identical `beforeAll` boilerplate. A shared `tests/helpers/ui-setup.js` module could centralize these — Jest's `require` works normally across test files.

**Why:** Helps future sessions avoid proposing cross-file extractions for the frontend (not possible without bundler) and correctly scopes test deduplication to a shared helper file.

**How to apply:** When proposing extractions in `public/js/main.js`, always consolidate within the file. For test deduplication, propose a `tests/helpers/` shared module. For server-side, a `lib/` module is appropriate.
