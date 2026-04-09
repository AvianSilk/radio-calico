/**
 * @jest-environment jsdom
 *
 * Player feature tests: formatTime, setStatus, setPlaying, audio event
 * listeners, volume slider, play/pause button, and elapsed timer.
 *
 * main.js is loaded once via window.eval (indirect eval) so that function
 * declarations land on global/window and are callable from test code.
 * Internal closure state (loaded, hls, timerInterval, startedAt) is NOT
 * directly accessible, so tests interact via the same DOM events and button
 * clicks a real user would trigger.
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

// Reusable handle to the HLS instance that initHls() creates.
let hlsMockInstance;

// ── One-time setup ────────────────────────────────────────────────────────────

beforeAll(() => {
  document.body.innerHTML = MINIMAL_HTML;

  window.HTMLMediaElement.prototype.play  = jest.fn().mockResolvedValue(undefined);
  window.HTMLMediaElement.prototype.pause = jest.fn();

  // Hls mock: isSupported() → true; constructor returns a controllable instance.
  hlsMockInstance = {
    loadSource:  jest.fn(),
    attachMedia: jest.fn(),
    on:          jest.fn(),
    destroy:     jest.fn(),
  };
  global.Hls = jest.fn().mockReturnValue(hlsMockInstance);
  global.Hls.isSupported = jest.fn().mockReturnValue(true);
  global.Hls.Events      = { MANIFEST_PARSED: 'hlsManifestParsed', ERROR: 'hlsError' };

  // Default fetch: non-ok so the initial fetchMetadata() call is a no-op.
  global.fetch = jest.fn().mockResolvedValue({ ok: false });

  // Freeze macrotask timers; microtasks (Promises) still resolve normally.
  jest.useFakeTimers();

  const script = fs.readFileSync(
    path.join(__dirname, '../public/js/main.js'),
    'utf8'
  );
  window.eval(script); // eslint-disable-line no-eval
});

afterEach(() => {
  // clearAllMocks preserves mock implementations (Hls constructor, isSupported)
  // while resetting call records for clean per-test assertions.
  jest.clearAllMocks();
  global.fetch.mockResolvedValue({ ok: false });

  // Reset timer state via the public stopTimer function so startedAt / interval
  // are null going into the next test.
  global.stopTimer();

  // Reset status and visualizer to a neutral starting point.
  const statusEl = document.getElementById('status');
  statusEl.textContent = 'Stopped';
  statusEl.className   = 'topnav-status';
  document.getElementById('visualizer').classList.remove('playing');
  document.getElementById('iconPlay').style.display  = '';
  document.getElementById('iconPause').style.display = 'none';

  // Restore audio.paused to its default jsdom behaviour (returns true).
  Object.defineProperty(document.getElementById('audio'), 'paused', {
    get:          () => true,
    configurable: true,
  });
});

// ── formatTime ────────────────────────────────────────────────────────────────

describe('formatTime', () => {
  test('0 seconds → "0:00"',  () => expect(global.formatTime(0)).toBe('0:00'));
  test('59 seconds → "0:59"', () => expect(global.formatTime(59)).toBe('0:59'));
  test('60 seconds → "1:00"', () => expect(global.formatTime(60)).toBe('1:00'));
  test('90 seconds → "1:30"', () => expect(global.formatTime(90)).toBe('1:30'));
  test('pads single-digit minutes and seconds', () =>
    expect(global.formatTime(3660)).toBe('1:01:00'));
  test('3600 seconds (1 hour) → "1:00:00"', () =>
    expect(global.formatTime(3600)).toBe('1:00:00'));
  test('3661 seconds → "1:01:01"', () =>
    expect(global.formatTime(3661)).toBe('1:01:01'));
  test('7199 seconds → "1:59:59"', () =>
    expect(global.formatTime(7199)).toBe('1:59:59'));
});

// ── setStatus ─────────────────────────────────────────────────────────────────

describe('setStatus', () => {
  test('sets textContent and base class with no extra class', () => {
    global.setStatus('Stopped');
    const el = document.getElementById('status');
    expect(el.textContent).toBe('Stopped');
    expect(el.className).toBe('topnav-status');
  });

  test('appends the provided class name', () => {
    global.setStatus('Live', 'live');
    const el = document.getElementById('status');
    expect(el.textContent).toBe('Live');
    expect(el.className).toBe('topnav-status live');
  });

  test('replaces a previous class when called again', () => {
    global.setStatus('Buffering…', 'loading');
    global.setStatus('Live', 'live');
    expect(document.getElementById('status').className).toBe('topnav-status live');
  });
});

// ── setPlaying ────────────────────────────────────────────────────────────────

describe('setPlaying', () => {
  test('true → hides play icon, shows pause icon, adds visualizer class', () => {
    global.setPlaying(true);
    expect(document.getElementById('iconPlay').style.display).toBe('none');
    expect(document.getElementById('iconPause').style.display).toBe('');
    expect(document.getElementById('visualizer').classList.contains('playing')).toBe(true);
  });

  test('false → shows play icon, hides pause icon, removes visualizer class', () => {
    global.setPlaying(true);  // set first
    global.setPlaying(false); // then clear
    expect(document.getElementById('iconPlay').style.display).toBe('');
    expect(document.getElementById('iconPause').style.display).toBe('none');
    expect(document.getElementById('visualizer').classList.contains('playing')).toBe(false);
  });
});

// ── audio event listeners ─────────────────────────────────────────────────────

describe('audio event listeners', () => {
  const audio = () => document.getElementById('audio');

  test('"playing" sets status to "Live" with class "live"', () => {
    audio().dispatchEvent(new Event('playing'));
    expect(document.getElementById('status').textContent).toBe('Live');
    expect(document.getElementById('status').className).toContain('live');
  });

  test('"playing" adds "playing" class to visualizer', () => {
    audio().dispatchEvent(new Event('playing'));
    expect(document.getElementById('visualizer').classList.contains('playing')).toBe(true);
  });

  test('"waiting" sets status to "Buffering…"', () => {
    audio().dispatchEvent(new Event('waiting'));
    expect(document.getElementById('status').textContent).toBe('Buffering…');
    expect(document.getElementById('status').className).toContain('loading');
  });

  test('"pause" sets status to "Stopped"', () => {
    audio().dispatchEvent(new Event('pause'));
    expect(document.getElementById('status').textContent).toBe('Stopped');
  });

  test('"pause" removes "playing" class from visualizer', () => {
    audio().dispatchEvent(new Event('playing')); // add it first
    audio().dispatchEvent(new Event('pause'));
    expect(document.getElementById('visualizer').classList.contains('playing')).toBe(false);
  });
});

// ── volume slider ─────────────────────────────────────────────────────────────

describe('volume slider', () => {
  const slider = () => document.getElementById('volume');
  const audio  = () => document.getElementById('audio');

  test('input event sets audio.volume to the slider value', () => {
    slider().value = '0.5';
    slider().dispatchEvent(new Event('input'));
    expect(audio().volume).toBeCloseTo(0.5);
  });

  test('setting slider to 0 mutes the audio', () => {
    slider().value = '0';
    slider().dispatchEvent(new Event('input'));
    expect(audio().volume).toBe(0);
  });

  test('setting slider to 1 restores full volume', () => {
    slider().value = '0';
    slider().dispatchEvent(new Event('input'));
    slider().value = '1';
    slider().dispatchEvent(new Event('input'));
    expect(audio().volume).toBe(1);
  });
});

// ── playBtn ───────────────────────────────────────────────────────────────────

describe('playBtn', () => {
  test('click when stopped sets status to "Connecting…"', () => {
    // audio.paused is true (default), loaded is false → calls initHls
    document.getElementById('playBtn').click();
    expect(document.getElementById('status').textContent).toBe('Connecting…');
    expect(document.getElementById('status').className).toContain('loading');
  });

  test('click when stopped calls Hls.loadSource with the stream URL', () => {
    document.getElementById('playBtn').click();
    expect(hlsMockInstance.loadSource).toHaveBeenCalledWith(
      'https://d3d4yli4hf5bmh.cloudfront.net/hls/live.m3u8'
    );
  });

  test('click when stopped calls Hls.attachMedia with the audio element', () => {
    document.getElementById('playBtn').click();
    expect(hlsMockInstance.attachMedia).toHaveBeenCalledWith(
      document.getElementById('audio')
    );
  });

  test('click when playing pauses audio and shows "Stopped"', () => {
    // Simulate the audio element being in a playing state.
    Object.defineProperty(document.getElementById('audio'), 'paused', {
      get: () => false, configurable: true,
    });

    document.getElementById('playBtn').click();

    expect(document.getElementById('audio').pause).toHaveBeenCalled();
    expect(document.getElementById('status').textContent).toBe('Stopped');
  });

  test('click when playing calls hls.destroy()', () => {
    // Give hls something to destroy by clicking play first (loads hls instance).
    Object.defineProperty(document.getElementById('audio'), 'paused', {
      get: () => true, configurable: true,
    });
    document.getElementById('playBtn').click(); // → initHls

    jest.clearAllMocks();
    global.fetch.mockResolvedValue({ ok: false });

    // Now simulate playing and click again.
    Object.defineProperty(document.getElementById('audio'), 'paused', {
      get: () => false, configurable: true,
    });
    document.getElementById('playBtn').click();

    expect(hlsMockInstance.destroy).toHaveBeenCalled();
  });
});

// ── elapsed timer ─────────────────────────────────────────────────────────────

describe('elapsed timer', () => {
  test('elapsed display starts at "0:00"', () => {
    expect(document.getElementById('elapsed').textContent).toBe('0:00');
  });

  test('startTimer resets elapsed display to "0:00"', () => {
    document.getElementById('elapsed').textContent = '5:00';
    global.startTimer();
    expect(document.getElementById('elapsed').textContent).toBe('0:00');
  });

  test('stopTimer resets elapsed display to "0:00"', () => {
    global.startTimer();
    document.getElementById('elapsed').textContent = '1:23';
    global.stopTimer();
    expect(document.getElementById('elapsed').textContent).toBe('0:00');
  });

  test('timer ticks update elapsed display via setInterval', () => {
    // Pin performance.now: startedAt gets 0, later calls return elapsed ms.
    const mockNow = jest.spyOn(performance, 'now');
    mockNow.mockReturnValueOnce(0);      // captured by startTimer → startedAt = 0
    mockNow.mockReturnValue(5000);       // returned by totalElapsed in the interval

    global.startTimer();
    jest.advanceTimersByTime(1000);      // fire the 1-second interval once

    expect(document.getElementById('elapsed').textContent).toBe('0:05');
    mockNow.mockRestore();
  });

  test('pauseTimerDisplay stops the timer from ticking', () => {
    const mockNow = jest.spyOn(performance, 'now');
    mockNow.mockReturnValueOnce(0);
    mockNow.mockReturnValue(3000);

    global.startTimer();
    jest.advanceTimersByTime(1000); // elapsed = "0:03"

    global.pauseTimerDisplay();

    // Freeze current display text.
    const frozenText = document.getElementById('elapsed').textContent;
    jest.advanceTimersByTime(5000); // interval should NOT fire
    expect(document.getElementById('elapsed').textContent).toBe(frozenText);

    mockNow.mockRestore();
  });
});
