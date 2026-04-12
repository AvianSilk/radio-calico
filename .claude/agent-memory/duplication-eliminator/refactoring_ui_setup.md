---
name: Test Helper ui-setup.js
description: MINIMAL_HTML constant and setupMainJs() function extracted to tests/helpers/ui-setup.js; player.ui.test.js intentionally left out
type: project
---

`tests/helpers/ui-setup.js` now exports two things:

- `MINIMAL_HTML` — the canonical DOM fixture string (complete form: volume slider has min/max/step, status span pre-populated with "Stopped")
- `setupMainJs()` — shared beforeAll body: sets innerHTML, stubs HTMLMediaElement.play/pause, sets global.Hls to `{ isSupported: () => false, Events: {} }`, sets global.fetch to a jest.fn() returning `{ ok: false }`, spies on console.error/warn, calls jest.useFakeTimers(), then window.eval's main.js

`ratings.ui.test.js` and `metadata.ui.test.js` both call `setupMainJs()` inside their `beforeAll`.

**Why:** player.ui.test.js uses a full Hls constructor mock (jest.fn() returning a controllable instance with loadSource/attachMedia/on/destroy) — it cannot share the simple `{ isSupported: () => false }` stub without breaking its own tests. It is intentionally excluded from this helper.

**How to apply:** If a new frontend test file needs the standard setup, import from `./helpers/ui-setup` and call `setupMainJs()` in `beforeAll`. If it needs a custom Hls mock, write its own `beforeAll` like player.ui.test.js does.
