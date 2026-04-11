/**
 * @jest-environment jsdom
 *
 * Frontend tests for the ratings feature in public/js/main.js.
 *
 * Strategy: the script is loaded once via an indirect eval (window.eval),
 * which runs it in the window/global scope so that function declarations
 * (songKey, applyRatingUI, fetchRatings, submitRating, updateMetadata) are
 * accessible as globals.  DOM elements must exist before the eval because
 * main.js binds them at the top level.
 *
 * Test-order dependency: "submitRating (null guard)" runs before any
 * updateMetadata call that would set currentSongKey.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── DOM fixture ───────────────────────────────────────────────────────────────

const MINIMAL_HTML = `
  <audio id="audio"></audio>
  <button id="playBtn"></button>
  <span   id="iconPlay"></span>
  <span   id="iconPause" style="display:none"></span>
  <span   id="status" class="topnav-status"></span>
  <div    id="visualizer"></div>
  <input  id="volume" type="range" value="1" />
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

// ── One-time setup ────────────────────────────────────────────────────────────

beforeAll(() => {
  document.body.innerHTML = MINIMAL_HTML;

  // jsdom does not implement HTMLMediaElement methods.
  window.HTMLMediaElement.prototype.play  = jest.fn().mockResolvedValue(undefined);
  window.HTMLMediaElement.prototype.pause = jest.fn();

  // Hls is loaded from CDN at runtime; provide a minimal stub.
  global.Hls = { isSupported: () => false, Events: {} };

  // Default fetch: non-ok, so the fetchMetadata() call at script load time
  // is a no-op and does not change any state.
  global.fetch = jest.fn().mockResolvedValue({ ok: false });

  // Suppress console noise from error-path tests (e.g. "submitRating: no
  // current song key", "fetchRatings: Error: network error"). No test asserts
  // on console output; resetAllMocks() in afterEach clears the implementation
  // but keeps the spy, so calls continue to be intercepted silently.
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});

  // Prevent setInterval(fetchMetadata, 10000) from ticking during tests.
  jest.useFakeTimers();

  // Load main.js via indirect eval so function declarations land on window/global.
  const script = fs.readFileSync(
    path.join(__dirname, '../public/js/main.js'),
    'utf8'
  );
  window.eval(script); // eslint-disable-line no-eval
});

// Reset fetch mock and counts between tests.
// resetAllMocks() (not clearAllMocks) is essential: it also drains the
// mockResolvedValueOnce queue, preventing unconsumed entries from one test
// from bleeding into the next.
afterEach(() => {
  jest.resetAllMocks();
  global.fetch.mockResolvedValue({ ok: false }); // restore harmless default

  document.getElementById('count-likes').textContent    = '0';
  document.getElementById('count-dislikes').textContent = '0';
  document.getElementById('btn-like').className         = '';
  document.getElementById('btn-dislike').className      = '';
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a metadata object. Only artist/title are required for ratings logic. */
function meta(artist, title, extras = {}) {
  return {
    artist, title, album: 'Test Album', date: '2024',
    is_new: false, is_summer: false, is_vidgames: false,
    sample_rate: 44100, bit_depth: 16,
    ...extras,
  };
}

/** Mock a successful ratings API response. */
function ratingsResponse(data) {
  return { ok: true, json: async () => data };
}

// ── songKey ───────────────────────────────────────────────────────────────────

describe('songKey', () => {
  test('joins artist and title with the ||| separator', () => {
    expect(global.songKey('Pink Floyd', 'Comfortably Numb'))
      .toBe('Pink Floyd|||Comfortably Numb');
  });

  test('handles empty strings without throwing', () => {
    expect(global.songKey('', '')).toBe('|||');
  });

  test('preserves special characters in both fields', () => {
    expect(global.songKey('Artist & Co.', 'Song (Live)'))
      .toBe('Artist & Co.|||Song (Live)');
  });
});

// ── applyRatingUI ─────────────────────────────────────────────────────────────

describe('applyRatingUI', () => {
  test('updates like and dislike counts in the DOM', () => {
    global.applyRatingUI({ likes: 5, dislikes: 3, user_rating: null });
    expect(document.getElementById('count-likes').textContent).toBe('5');
    expect(document.getElementById('count-dislikes').textContent).toBe('3');
  });

  test('adds active-like class when user_rating is 1', () => {
    global.applyRatingUI({ likes: 1, dislikes: 0, user_rating: 1 });
    expect(document.getElementById('btn-like').classList.contains('active-like')).toBe(true);
    expect(document.getElementById('btn-dislike').classList.contains('active-dislike')).toBe(false);
  });

  test('adds active-dislike class when user_rating is -1', () => {
    global.applyRatingUI({ likes: 0, dislikes: 1, user_rating: -1 });
    expect(document.getElementById('btn-like').classList.contains('active-like')).toBe(false);
    expect(document.getElementById('btn-dislike').classList.contains('active-dislike')).toBe(true);
  });

  test('clears both active classes when user_rating is null', () => {
    global.applyRatingUI({ likes: 1, dislikes: 0, user_rating: 1 }); // set first
    global.applyRatingUI({ likes: 0, dislikes: 0, user_rating: null }); // then clear
    expect(document.getElementById('btn-like').classList.contains('active-like')).toBe(false);
    expect(document.getElementById('btn-dislike').classList.contains('active-dislike')).toBe(false);
  });
});

// ── submitRating — null guard (must run before any updateMetadata call) ───────
//
// currentSongKey starts as null when the script is first loaded.  This block
// intentionally runs before the describe blocks that call updateMetadata.

describe('submitRating (no current song)', () => {
  test('does not call fetch when no song is loaded yet', async () => {
    await global.submitRating(1);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

// ── fetchRatings ──────────────────────────────────────────────────────────────

describe('fetchRatings', () => {
  test('calls fetch with a URL-encoded song_key query param', async () => {
    const key = 'Artist A|||Song Title';
    global.fetch.mockResolvedValueOnce(ratingsResponse({ likes: 0, dislikes: 0, user_rating: null }));
    await global.fetchRatings(key);
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/ratings?song_key=${encodeURIComponent(key)}`
    );
  });

  test('updates the DOM when the response is ok', async () => {
    global.fetch.mockResolvedValueOnce(ratingsResponse({ likes: 7, dislikes: 2, user_rating: 1 }));
    await global.fetchRatings('A|||B');
    expect(document.getElementById('count-likes').textContent).toBe('7');
    expect(document.getElementById('count-dislikes').textContent).toBe('2');
    expect(document.getElementById('btn-like').classList.contains('active-like')).toBe(true);
  });

  test('does not update the DOM when the response is not ok', async () => {
    document.getElementById('count-likes').textContent = '99';
    global.fetch.mockResolvedValueOnce({ ok: false });
    await global.fetchRatings('A|||B');
    expect(document.getElementById('count-likes').textContent).toBe('99');
  });

  test('resolves without throwing on a network error', async () => {
    global.fetch.mockRejectedValueOnce(new Error('network error'));
    await expect(global.fetchRatings('A|||B')).resolves.toBeUndefined();
  });
});

// ── submitRating (with a current song) ───────────────────────────────────────

describe('submitRating', () => {
  // A fresh counter ensures every beforeEach produces a unique song key.
  // Without this, updateMetadata would find key === currentSongKey on the
  // second run and skip fetchRatings, leaving a mockResolvedValueOnce entry
  // unconsumed — which would then be returned for the wrong fetch call in
  // the test body, corrupting assertions.
  let songCount = 0;

  beforeEach(async () => {
    songCount++;
    // afterEach already called resetAllMocks() so the queue is empty and
    // global.fetch.mockResolvedValue({ ok: false }) is the active default.
    global.updateMetadata(meta(`Submit Artist ${songCount}`, `Submit Song ${songCount}`));
    // Wait for the fetchRatings promise chain (2 micro-task ticks):
    //   tick 1 – fetch() resolves → ok:false, tick 2 – async fn returns
    await Promise.resolve();
    await Promise.resolve();
    jest.clearAllMocks(); // clear call records; queue is already empty
    global.fetch.mockResolvedValue({ ok: false }); // restore default
  });

  test('POSTs the current song_key and rating to /api/ratings', async () => {
    global.fetch.mockResolvedValueOnce(ratingsResponse({ likes: 1, dislikes: 0, user_rating: 1 }));
    await global.submitRating(1);
    expect(global.fetch).toHaveBeenCalledWith('/api/ratings', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ song_key: `Submit Artist ${songCount}|||Submit Song ${songCount}`, rating: 1 }),
    }));
  });

  test('applies UI after a successful like', async () => {
    global.fetch.mockResolvedValueOnce(ratingsResponse({ likes: 1, dislikes: 0, user_rating: 1 }));
    await global.submitRating(1);
    expect(document.getElementById('count-likes').textContent).toBe('1');
    expect(document.getElementById('btn-like').classList.contains('active-like')).toBe(true);
  });

  test('applies UI after a successful dislike', async () => {
    global.fetch.mockResolvedValueOnce(ratingsResponse({ likes: 0, dislikes: 1, user_rating: -1 }));
    await global.submitRating(-1);
    expect(document.getElementById('count-dislikes').textContent).toBe('1');
    expect(document.getElementById('btn-dislike').classList.contains('active-dislike')).toBe(true);
  });

  test('does not update the DOM when the server returns an error status', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'Internal Error' });
    document.getElementById('count-likes').textContent = '3';
    await global.submitRating(1);
    expect(document.getElementById('count-likes').textContent).toBe('3');
  });

  test('resolves without throwing on a network error', async () => {
    global.fetch.mockRejectedValueOnce(new Error('network error'));
    await expect(global.submitRating(1)).resolves.toBeUndefined();
  });
});

// ── updateMetadata ────────────────────────────────────────────────────────────

describe('updateMetadata', () => {
  // Each test uses a unique artist to guarantee currentSongKey changes and
  // fetchRatings is called, avoiding cross-test interference on shared state.
  let counter = 0;
  function uniqueMeta(extras = {}) {
    counter += 1;
    return meta(`Unique Artist ${counter}`, `Unique Title ${counter}`, extras);
  }

  beforeEach(() => {
    global.fetch.mockResolvedValue(ratingsResponse({ likes: 0, dislikes: 0, user_rating: null }));
  });

  test('updates the title, artist, and album/date display', () => {
    global.updateMetadata(meta('Miles Davis', `Kind of Blue ${++counter}`));
    expect(document.getElementById('meta-title').textContent).toBe(`Kind of Blue ${counter}`);
    expect(document.getElementById('meta-artist').textContent).toBe('Miles Davis');
    expect(document.getElementById('meta-album').textContent).toContain('Test Album');
    expect(document.getElementById('meta-album').textContent).toContain('2024');
  });

  test('calls fetchRatings (fetch) when the song changes', () => {
    const m = uniqueMeta();
    global.updateMetadata(m);
    const expectedKey = encodeURIComponent(`${m.artist}|||${m.title}`);
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining(expectedKey));
  });

  test('does not call fetchRatings again when the song is unchanged', () => {
    const m = uniqueMeta();
    global.updateMetadata(m);           // key changes → fetchRatings called
    global.fetch.mockClear();
    global.updateMetadata(m);           // same key → fetchRatings NOT called
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('shows the "new" tag when is_new is true', () => {
    global.updateMetadata(uniqueMeta({ is_new: true }));
    expect(document.getElementById('tag-new').style.display).not.toBe('none');
  });

  test('hides the "new" tag when is_new is false', () => {
    global.updateMetadata(uniqueMeta({ is_new: false }));
    expect(document.getElementById('tag-new').style.display).toBe('none');
  });

  test('shows/hides summer and vidgames tags independently', () => {
    global.updateMetadata(uniqueMeta({ is_summer: true, is_vidgames: false }));
    expect(document.getElementById('tag-summer').style.display).not.toBe('none');
    expect(document.getElementById('tag-vidgames').style.display).toBe('none');
  });

  test('renders stream quality as kHz and bit-depth', () => {
    global.updateMetadata(uniqueMeta({ sample_rate: 96000, bit_depth: 24 }));
    expect(document.getElementById('stream-quality').textContent).toBe('96.0 kHz · 24-bit');
  });

  test('renders play-history items for the previous tracks', () => {
    global.updateMetadata(uniqueMeta({
      prev_artist_1: 'Prev Artist 1', prev_title_1: 'Prev Song 1',
      prev_artist_2: 'Prev Artist 2', prev_title_2: 'Prev Song 2',
    }));
    const items = document.querySelectorAll('#history-list .history-item');
    expect(items).toHaveLength(2);
    expect(items[0].querySelector('.hist-artist').textContent).toBe('Prev Artist 1');
    expect(items[0].querySelector('.hist-title').textContent).toBe('Prev Song 1');
    expect(items[1].querySelector('.hist-artist').textContent).toBe('Prev Artist 2');
  });

  test('omits history items when prev fields are absent', () => {
    global.updateMetadata(uniqueMeta()); // no prev_artist_N / prev_title_N
    const items = document.querySelectorAll('#history-list .history-item');
    expect(items).toHaveLength(0);
  });
});
