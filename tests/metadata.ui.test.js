/**
 * @jest-environment jsdom
 *
 * Metadata feature tests: fetchMetadata (URL shape, album-art cache-busting,
 * error handling) and updateMetadata edge cases (missing or partial fields).
 *
 * The updateMetadata happy-path and song-change / ratings integration are
 * already covered in tests/ratings.ui.test.js; this file covers only the
 * gaps: field-level fallback rendering and fetchMetadata behaviour.
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

// ── One-time setup ────────────────────────────────────────────────────────────

beforeAll(() => {
  document.body.innerHTML = MINIMAL_HTML;

  window.HTMLMediaElement.prototype.play  = jest.fn().mockResolvedValue(undefined);
  window.HTMLMediaElement.prototype.pause = jest.fn();

  global.Hls = { isSupported: () => false, Events: {} };

  // Default fetch: non-ok so the initial fetchMetadata() call is a no-op.
  global.fetch = jest.fn().mockResolvedValue({ ok: false });

  jest.useFakeTimers();

  const script = fs.readFileSync(
    path.join(__dirname, '../public/js/main.js'),
    'utf8'
  );
  window.eval(script); // eslint-disable-line no-eval
});

// resetAllMocks drains any unconsumed mockResolvedValueOnce queue entries so
// they cannot leak from one test into another.
afterEach(() => {
  jest.resetAllMocks();
  global.fetch.mockResolvedValue({ ok: false });

  document.getElementById('meta-title').textContent  = '';
  document.getElementById('meta-artist').textContent = '';
  document.getElementById('meta-album').textContent  = '';
  document.getElementById('album-art').src           = '';
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Minimal metadata object – only the fields relevant to the test need values. */
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

// ── fetchMetadata ─────────────────────────────────────────────────────────────

describe('fetchMetadata', () => {
  test('requests the metadata URL with a cache-busting ?t= timestamp', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false });
    await global.fetchMetadata();
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/metadatav2\.json\?t=\d+/)
    );
  });

  test('timestamp in the fetch URL is a recent Unix ms value', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false });
    const before = Date.now();
    await global.fetchMetadata();
    const url = global.fetch.mock.calls[0][0];
    const ts  = Number(url.match(/\?t=(\d+)/)[1]);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(Date.now() + 100);
  });

  test('updates album art src with a matching timestamp on a successful response', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => meta() });
    // Also consume the fetchRatings call triggered by updateMetadata.
    global.fetch.mockResolvedValue({ ok: false });

    await global.fetchMetadata();

    const artSrc = document.getElementById('album-art').src
      || document.getElementById('album-art').getAttribute('src');
    expect(artSrc).toMatch(/cover\.jpg\?t=\d+/);
  });

  test('album art timestamp matches the metadata request timestamp', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => meta() });
    global.fetch.mockResolvedValue({ ok: false });

    await global.fetchMetadata();

    const fetchUrl = global.fetch.mock.calls[0][0];
    const fetchTs  = fetchUrl.match(/\?t=(\d+)/)[1];

    const artSrc = document.getElementById('album-art').src
      || document.getElementById('album-art').getAttribute('src');
    expect(artSrc).toContain(`?t=${fetchTs}`);
  });

  test('does not update the DOM when the response is not ok', async () => {
    document.getElementById('meta-title').textContent = 'Old Title';
    global.fetch.mockResolvedValueOnce({ ok: false });

    await global.fetchMetadata();

    expect(document.getElementById('meta-title').textContent).toBe('Old Title');
  });

  test('resolves without throwing on a network error', async () => {
    global.fetch.mockRejectedValueOnce(new Error('network error'));
    await expect(global.fetchMetadata()).resolves.toBeUndefined();
  });
});

// ── updateMetadata — field rendering edge cases ───────────────────────────────

describe('updateMetadata — missing / partial fields', () => {
  // Each test uses a unique artist+title to ensure currentSongKey changes so
  // fetchRatings is triggered (and consumed by the default { ok: false } mock).
  let counter = 0;
  function uniq(overrides = {}) {
    counter++;
    return meta({ artist: `Artist${counter}`, title: `Title${counter}`, ...overrides });
  }

  test('missing title falls back to "—"', () => {
    global.updateMetadata(uniq({ title: '' }));
    expect(document.getElementById('meta-title').textContent).toBe('—');
  });

  test('missing artist falls back to "—"', () => {
    global.updateMetadata(uniq({ artist: '' }));
    expect(document.getElementById('meta-artist').textContent).toBe('—');
  });

  test('album and date are joined with " · "', () => {
    global.updateMetadata(uniq({ album: 'Kind of Blue', date: '1959' }));
    expect(document.getElementById('meta-album').textContent).toBe('Kind of Blue · 1959');
  });

  test('album without date shows album only (no separator)', () => {
    global.updateMetadata(uniq({ album: 'Solo Album', date: '' }));
    expect(document.getElementById('meta-album').textContent).toBe('Solo Album');
  });

  test('date without album shows date only (no separator)', () => {
    global.updateMetadata(uniq({ album: '', date: '2001' }));
    expect(document.getElementById('meta-album').textContent).toBe('2001');
  });

  test('missing album and date leaves the field empty', () => {
    global.updateMetadata(uniq({ album: '', date: '' }));
    expect(document.getElementById('meta-album').textContent).toBe('');
  });

  test('missing sample_rate shows "—" for kHz portion', () => {
    global.updateMetadata(uniq({ sample_rate: null, bit_depth: 16 }));
    expect(document.getElementById('stream-quality').textContent).toContain('—');
  });

  test('missing bit_depth shows "—" for bit portion', () => {
    global.updateMetadata(uniq({ sample_rate: 44100, bit_depth: null }));
    expect(document.getElementById('stream-quality').textContent).toContain('—');
  });
});

// ── updateMetadata — play history ─────────────────────────────────────────────

describe('updateMetadata — play history', () => {
  let counter = 100; // offset to avoid clashes with the describe above
  function uniq(overrides = {}) {
    counter++;
    return meta({ artist: `HistArtist${counter}`, title: `HistTitle${counter}`, ...overrides });
  }

  test('renders up to five history items in order', () => {
    global.updateMetadata(uniq({
      prev_artist_1: 'A1', prev_title_1: 'T1',
      prev_artist_2: 'A2', prev_title_2: 'T2',
      prev_artist_3: 'A3', prev_title_3: 'T3',
      prev_artist_4: 'A4', prev_title_4: 'T4',
      prev_artist_5: 'A5', prev_title_5: 'T5',
    }));

    const items = document.querySelectorAll('#history-list .history-item');
    expect(items).toHaveLength(5);
    expect(items[0].querySelector('.hist-artist').textContent).toBe('A1');
    expect(items[4].querySelector('.hist-artist').textContent).toBe('A5');
  });

  test('skips slots where both artist and title are absent', () => {
    global.updateMetadata(uniq({
      prev_artist_1: 'A1', prev_title_1: 'T1',
      // slot 2 absent
      prev_artist_3: 'A3', prev_title_3: 'T3',
    }));

    const items = document.querySelectorAll('#history-list .history-item');
    expect(items).toHaveLength(2);
  });

  test('shows "—" for artist when only title is present in a slot', () => {
    global.updateMetadata(uniq({
      prev_artist_1: '', prev_title_1: 'Only Title',
    }));

    const items = document.querySelectorAll('#history-list .history-item');
    expect(items).toHaveLength(1);
    expect(items[0].querySelector('.hist-artist').textContent).toBe('—');
    expect(items[0].querySelector('.hist-title').textContent).toBe('Only Title');
  });

  test('clears previous history when new metadata arrives', () => {
    // First call: 3 items
    global.updateMetadata(uniq({
      prev_artist_1: 'Old1', prev_title_1: 'OldT1',
      prev_artist_2: 'Old2', prev_title_2: 'OldT2',
      prev_artist_3: 'Old3', prev_title_3: 'OldT3',
    }));

    // Second call with a different song and only 1 history item
    global.updateMetadata(uniq({
      prev_artist_1: 'New1', prev_title_1: 'NewT1',
    }));

    const items = document.querySelectorAll('#history-list .history-item');
    expect(items).toHaveLength(1);
    expect(items[0].querySelector('.hist-artist').textContent).toBe('New1');
  });
});

// ── updateMetadata — category tags ───────────────────────────────────────────

describe('updateMetadata — category tags', () => {
  let counter = 200;
  function uniq(overrides = {}) {
    counter++;
    return meta({ artist: `TagArtist${counter}`, title: `TagTitle${counter}`, ...overrides });
  }

  test.each([
    ['is_new',      'tag-new'],
    ['is_summer',   'tag-summer'],
    ['is_vidgames', 'tag-vidgames'],
  ])('%s:true shows the corresponding tag', (field, id) => {
    global.updateMetadata(uniq({ [field]: true }));
    expect(document.getElementById(id).style.display).not.toBe('none');
  });

  test.each([
    ['is_new',      'tag-new'],
    ['is_summer',   'tag-summer'],
    ['is_vidgames', 'tag-vidgames'],
  ])('%s:false hides the corresponding tag', (field, id) => {
    global.updateMetadata(uniq({ [field]: false }));
    expect(document.getElementById(id).style.display).toBe('none');
  });

  test('tags update independently of each other', () => {
    global.updateMetadata(uniq({ is_new: true, is_summer: false, is_vidgames: true }));
    expect(document.getElementById('tag-new').style.display).not.toBe('none');
    expect(document.getElementById('tag-summer').style.display).toBe('none');
    expect(document.getElementById('tag-vidgames').style.display).not.toBe('none');
  });
});
