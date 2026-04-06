const STREAM_URL   = 'https://d3d4yli4hf5bmh.cloudfront.net/hls/live.m3u8';
const METADATA_URL = 'https://d3d4yli4hf5bmh.cloudfront.net/metadatav2.json';

// ── DOM refs ─────────────────────────��────────────────────────────────────

const audio          = document.getElementById('audio');
const playBtn        = document.getElementById('playBtn');
const iconPlay       = document.getElementById('iconPlay');
const iconPause      = document.getElementById('iconPause');
const statusEl       = document.getElementById('status');
const visualizer     = document.getElementById('visualizer');
const volumeSlider   = document.getElementById('volume');
const elapsedEl      = document.getElementById('elapsed');
const albumArtEl     = document.getElementById('album-art');
const metaTitleEl    = document.getElementById('meta-title');
const metaArtistEl   = document.getElementById('meta-artist');
const metaAlbumEl    = document.getElementById('meta-album');
const tagNewEl       = document.getElementById('tag-new');
const tagSummerEl    = document.getElementById('tag-summer');
const tagVgEl        = document.getElementById('tag-vidgames');
const qualityEl      = document.getElementById('stream-quality');
const historyListEl  = document.getElementById('history-list');
const btnLike        = document.getElementById('btn-like');
const btnDislike     = document.getElementById('btn-dislike');
const countLikesEl   = document.getElementById('count-likes');
const countDislikesEl = document.getElementById('count-dislikes');

// ── Player ────────────────────────────────────────────────────────────────

let hls       = null;
let loaded    = false;
let timerInterval = null;
let startedAt = null;

function formatTime(s) {
  const h   = Math.floor(s / 3600);
  const m   = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function totalElapsed() {
  return Math.floor((performance.now() - startedAt) / 1000);
}

function startTimer() {
  clearInterval(timerInterval);
  startedAt = performance.now();
  elapsedEl.textContent = '0:00';
  timerInterval = setInterval(() => {
    elapsedEl.textContent = formatTime(totalElapsed());
  }, 1000);
}

function pauseTimerDisplay() {
  clearInterval(timerInterval);
  timerInterval = null;
}

function resumeTimerDisplay() {
  clearInterval(timerInterval);
  elapsedEl.textContent = formatTime(totalElapsed());
  timerInterval = setInterval(() => {
    elapsedEl.textContent = formatTime(totalElapsed());
  }, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
  startedAt = null;
  elapsedEl.textContent = '0:00';
}

function setStatus(text, cls) {
  statusEl.textContent = text;
  statusEl.className = 'topnav-status' + (cls ? ' ' + cls : '');
}

function setPlaying(playing) {
  iconPlay.style.display  = playing ? 'none' : '';
  iconPause.style.display = playing ? ''     : 'none';
  visualizer.classList.toggle('playing', playing);
}

function initHls() {
  if (Hls.isSupported()) {
    hls = new Hls({ lowLatencyMode: true });
    hls.loadSource(STREAM_URL);
    hls.attachMedia(audio);
    hls.on(Hls.Events.MANIFEST_PARSED, () => { loaded = true; audio.play(); });
    hls.on(Hls.Events.ERROR, (_, data) => {
      if (data.fatal) { setStatus('Error', 'error'); setPlaying(false); stopTimer(); loaded = false; }
    });
  } else if (audio.canPlayType('application/vnd.apple.mpegurl')) {
    audio.src = STREAM_URL;
    loaded = true;
    audio.play();
  } else {
    setStatus('Unsupported browser', 'error');
  }
}

function destroyHls() {
  if (hls) { hls.destroy(); hls = null; }
  audio.src = '';
  loaded = false;
}

playBtn.addEventListener('click', () => {
  if (audio.paused) {
    if (!loaded) { setStatus('Connecting…', 'loading'); initHls(); } else { audio.play(); }
    if (startedAt === null) startTimer(); else resumeTimerDisplay();
  } else {
    pauseTimerDisplay();
    audio.pause();
    destroyHls();
    setStatus('Stopped');
    setPlaying(false);
  }
});

audio.addEventListener('playing', () => { setStatus('Live', 'live'); setPlaying(true); });
audio.addEventListener('waiting', () => setStatus('Buffering…', 'loading'));
audio.addEventListener('pause',   () => { setStatus('Stopped'); setPlaying(false); });

volumeSlider.addEventListener('input', () => { audio.volume = volumeSlider.value; });

// ── Ratings ───────────────────────────────────────────────────────────────

let currentSongKey = null;

function songKey(artist, title) {
  return `${artist}|||${title}`;
}

function applyRatingUI({ likes, dislikes, user_rating }) {
  countLikesEl.textContent    = likes;
  countDislikesEl.textContent = dislikes;
  btnLike.classList.toggle('active-like',       user_rating === 1);
  btnDislike.classList.toggle('active-dislike', user_rating === -1);
}

async function fetchRatings(key) {
  try {
    const res = await fetch(`/api/ratings?song_key=${encodeURIComponent(key)}`);
    if (res.ok) applyRatingUI(await res.json());
  } catch (e) { console.error('fetchRatings:', e); }
}

async function submitRating(rating) {
  if (!currentSongKey) { console.warn('submitRating: no current song key'); return; }
  try {
    const res = await fetch('/api/ratings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ song_key: currentSongKey, rating })
    });
    if (res.ok) applyRatingUI(await res.json());
    else console.error('submitRating: server returned', res.status, await res.text());
  } catch (e) { console.error('submitRating:', e); }
}

btnLike.addEventListener('click',    () => submitRating(1));
btnDislike.addEventListener('click', () => submitRating(-1));

// ── Metadata ──────────────────────────────────────────────────────────────

function updateMetadata(d) {
  metaTitleEl.textContent  = d.title  || '—';
  metaArtistEl.textContent = d.artist || '—';

  const albumParts = [d.album, d.date].filter(Boolean);
  metaAlbumEl.textContent = albumParts.join(' · ');

  tagNewEl.style.display    = d.is_new      ? '' : 'none';
  tagSummerEl.style.display = d.is_summer   ? '' : 'none';
  tagVgEl.style.display     = d.is_vidgames ? '' : 'none';

  const khz = d.sample_rate ? (d.sample_rate / 1000).toFixed(1) + ' kHz' : '—';
  const bit = d.bit_depth   ? d.bit_depth + '-bit'                        : '—';
  qualityEl.textContent = `${khz} · ${bit}`;

  historyListEl.innerHTML = '';
  for (let i = 1; i <= 5; i++) {
    const artist = d[`prev_artist_${i}`];
    const title  = d[`prev_title_${i}`];
    if (!artist && !title) continue;
    const li = document.createElement('li');
    li.className = 'history-item';
    li.innerHTML = `<span class="hist-artist">${artist || '—'}</span>
                    <span class="hist-title">${title || '—'}</span>`;
    historyListEl.appendChild(li);
  }

  const key = songKey(d.artist || '', d.title || '');
  if (key !== currentSongKey) {
    currentSongKey = key;
    fetchRatings(key);
  }
}

async function fetchMetadata() {
  try {
    const t = Date.now();
    const res = await fetch(`${METADATA_URL}?t=${t}`);
    if (!res.ok) return;
    updateMetadata(await res.json());
    albumArtEl.src = `https://d3d4yli4hf5bmh.cloudfront.net/cover.jpg?t=${t}`;
  } catch (e) { console.error('fetchMetadata:', e); }
}

fetchMetadata();
setInterval(fetchMetadata, 10000);
