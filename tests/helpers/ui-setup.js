'use strict';

const fs   = require('fs');
const path = require('path');

// ── Shared DOM fixture ────────────────────────────────────────────────────────
//
// The more complete form is used here: the volume slider includes min/max/step
// attributes and the status span is pre-populated with "Stopped".  This is
// valid for all three frontend test suites.

const MINIMAL_HTML = `
  <audio id="audio"></audio>
  <button id="playBtn"></button>
  <span   id="iconPlay"></span>
  <span   id="iconPause" style="display:none"></span>
  <span   id="status" class="topnav-status">Stopped</span>
  <div    id="visualizer"></div>
  <input  id="volume" type="range" min="0" max="1" step="0.01" value="1" />
  <span   id="elapsed">0:00</span>
  <img    id="album-art" />
  <span   id="meta-title"></span>
  <span   id="meta-artist"></span>
  <span   id="meta-album"></span>
  <span   id="tag-new"      style="display:none"></span>
  <span   id="tag-summer"   style="display:none"></span>
  <span   id="tag-vidgames" style="display:none"></span>
  <span   id="stream-quality"></span>
  <ul     id="history-list"></ul>
  <button id="btn-like"></button>
  <button id="btn-dislike"></button>
  <span   id="count-likes">0</span>
  <span   id="count-dislikes">0</span>
`;

// ── Shared beforeAll setup for ratings and metadata test suites ───────────────
//
// Call this inside beforeAll() in any frontend test file that needs main.js
// loaded with the standard stub environment.  Do NOT use this in
// player.ui.test.js — that file needs a full Hls constructor mock.

function setupMainJs() {
  document.body.innerHTML = MINIMAL_HTML;

  // jsdom does not implement HTMLMediaElement methods.
  window.HTMLMediaElement.prototype.play  = jest.fn().mockResolvedValue(undefined);
  window.HTMLMediaElement.prototype.pause = jest.fn();

  // Hls is loaded from CDN at runtime; provide a minimal stub.
  global.Hls = { isSupported: () => false, Events: {} };

  // Default fetch: non-ok, so the fetchMetadata() call at script load time
  // is a no-op and does not change any state.
  global.fetch = jest.fn().mockResolvedValue({ ok: false });

  // Suppress console noise from error-path tests.  resetAllMocks() in afterEach
  // clears the implementation but keeps the spy, so calls continue to be
  // intercepted silently.
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});

  // Prevent setInterval(fetchMetadata, 10000) from ticking during tests.
  jest.useFakeTimers();

  // Load main.js via indirect eval so function declarations land on window/global.
  const script = fs.readFileSync(
    path.join(__dirname, '../../public/js/main.js'),
    'utf8'
  );
  window.eval(script); // eslint-disable-line no-eval
}

/** Build a metadata object with sensible defaults. Pass overrides to specialise. */
function meta(overrides = {}) {
  return {
    artist: 'Default Artist',
    title:  'Default Title',
    album:  'Default Album',
    date:   '2024',
    is_new: false, is_summer: false, is_vidgames: false,
    sample_rate: 44100, bit_depth: 16,
    ...overrides,
  };
}

module.exports = { MINIMAL_HTML, setupMainJs, meta };
