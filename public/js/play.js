'use strict';

const nickname = localStorage.getItem('nickname');
if (!nickname) window.location.href = '/index.html';

const levelId = new URLSearchParams(location.search).get('level');
if (!levelId) window.location.href = '/browse.html';

const els = {
  viewport: document.getElementById('viewport'),
  stage: document.getElementById('stage'),
  img: document.getElementById('gameImage'),
  foundCount: document.getElementById('foundCount'),
  totalCount: document.getElementById('totalCount'),
  timer: document.getElementById('timer'),
  missCount: document.getElementById('missCount'),
  levelName: document.getElementById('levelName'),
  hintBtn: document.getElementById('hintBtn'),
  hintBanner: document.getElementById('hintBanner'),
  zoomTip: document.getElementById('zoomTip'),
  zoomInBtn: document.getElementById('zoomInBtn'),
  zoomOutBtn: document.getElementById('zoomOutBtn'),
  zoomResetBtn: document.getElementById('zoomResetBtn'),
  boardBtn: document.getElementById('boardBtn'),
  boardOverlay: document.getElementById('boardOverlay'),
  boardContent: document.getElementById('boardContent'),
  closeBoard: document.getElementById('closeBoard'),
  winOverlay: document.getElementById('winOverlay'),
  winName: document.getElementById('winName'),
  winTime: document.getElementById('winTime'),
  winMiss: document.getElementById('winMiss'),
  winMsg: document.getElementById('winMsg'),
  winBoard: document.getElementById('winBoard'),
  replayBtn: document.getElementById('replayBtn'),
};

els.replayBtn.href = '/play.html?level=' + encodeURIComponent(levelId);

const state = { total: 0, found: new Set(), misses: 0, startTime: null, timerId: null, finished: false };

function fmtTime(ms) {
  const t = Math.floor(ms / 1000);
  const h = String(Math.floor(t / 3600)).padStart(2, '0');
  const m = String(Math.floor((t % 3600) / 60)).padStart(2, '0');
  const s = String(t % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function startTimer() {
  state.startTime = Date.now();
  state.timerId = setInterval(() => {
    els.timer.textContent = fmtTime(Date.now() - state.startTime);
  }, 250);
}
function stopTimer() { clearInterval(state.timerId); }

function updateScore() {
  els.foundCount.textContent = state.found.size;
  els.totalCount.textContent = state.found.size >= state.total ? String(state.total) : '?';
  els.missCount.textContent = state.misses;
}

function addMarker(box) {
  const m = document.createElement('div');
  m.className = 'marker';
  m.style.left = box.x * 100 + '%';
  m.style.top = box.y * 100 + '%';
  m.style.width = box.w * 100 + '%';
  m.style.height = box.h * 100 + '%';
  els.stage.appendChild(m);
}
function showMiss(nx, ny) {
  const dot = document.createElement('div');
  dot.className = 'miss';
  dot.style.left = nx * 100 + '%';
  dot.style.top = ny * 100 + '%';
  els.stage.appendChild(dot);
  setTimeout(() => dot.remove(), 500);
}

// A tap on the image (from the zoom controller) → check for a hidden object.
async function handleTap(clientX, clientY) {
  if (state.finished || !state.startTime) return;
  const rect = els.img.getBoundingClientRect();
  const nx = (clientX - rect.left) / rect.width;
  const ny = (clientY - rect.top) / rect.height;
  if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return; // tapped outside the image
  try {
    const res = await fetch('/api/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ levelId, x: nx, y: ny }),
    });
    const data = await res.json();
    if (data.hit) {
      if (state.found.has(data.id)) return;
      state.found.add(data.id);
      addMarker(data.box);
      updateScore();
      if (state.found.size >= state.total) finish();
    } else {
      state.misses += 1;
      updateScore();
      showMiss(nx, ny);
    }
  } catch {
    showMiss(nx, ny);
  }
}

let zoom = null;

async function loadLevel() {
  let level;
  try {
    const res = await fetch('/api/levels/' + encodeURIComponent(levelId));
    if (!res.ok) throw new Error();
    level = await res.json();
  } catch {
    alert('This level is not available.');
    window.location.href = '/browse.html';
    return;
  }
  state.total = level.objectCount;
  els.levelName.textContent = level.name;
  document.title = level.name + ' | Hidden Object Hunt';
  updateScore();

  zoom = createZoom({ viewport: els.viewport, stage: els.stage, img: els.img, onTap: handleTap });
  els.img.addEventListener('load', () => {
    zoom.fit();
    startTimer();
    setTimeout(() => els.zoomTip.classList.add('hidden'), 4000);
  }, { once: true });
  els.img.src = level.imageUrl;
}

// ----- hint -----
async function showHint() {
  els.hintBtn.disabled = true;
  try {
    const res = await fetch('/api/hint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ levelId, foundIds: [...state.found] }),
    });
    const data = await res.json();
    if (data.hasHint) {
      els.hintBanner.textContent = '💡 ' + data.hint;
    } else {
      els.hintBanner.textContent = state.found.size >= state.total
        ? '💡 All found!'
        : '💡 No hints available for the remaining objects.';
    }
  } catch {
    els.hintBanner.textContent = '💡 Could not load a hint.';
  }
  els.hintBanner.classList.remove('hidden');
  clearTimeout(showHint._t);
  showHint._t = setTimeout(() => els.hintBanner.classList.add('hidden'), 6000);
  els.hintBtn.disabled = false;
}

// ----- end of game -----
async function finish() {
  state.finished = true;
  stopTimer();
  const elapsed = Date.now() - state.startTime;
  els.winName.textContent = nickname;
  els.winTime.textContent = fmtTime(elapsed);
  els.winMiss.textContent = state.misses;
  try {
    const res = await fetch('/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ levelId, nickname, timeMs: elapsed, found: state.found.size, misses: state.misses }),
    });
    const data = await res.json();
    els.winMsg.textContent = data.ok ? 'Your time was added to the scoreboard!' : (data.error || '');
  } catch {
    els.winMsg.textContent = 'Could not save your score (offline?).';
  }
  await renderBoard(els.winBoard, { timeMs: elapsed, misses: state.misses });
  els.winOverlay.classList.remove('hidden');
}

async function renderBoard(target, myRun) {
  try {
    const res = await fetch('/api/scoreboard/' + encodeURIComponent(levelId));
    const scores = await res.json();
    if (!scores.length) { target.innerHTML = '<p class="hint">No scores yet — be the first!</p>'; return; }
    let myMarked = false;
    const rows = scores.map((s, i) => {
      const isMe = !myMarked && myRun && s.nickname === nickname && s.timeMs === myRun.timeMs && s.misses === myRun.misses;
      if (isMe) myMarked = true;
      return `<tr class="${isMe ? 'me' : ''}">
        <td class="rank">${i + 1}</td>
        <td>${escapeHtml(s.nickname)}</td>
        <td>${fmtTime(s.timeMs)}</td>
        <td>${s.misses}</td>
      </tr>`;
    }).join('');
    target.innerHTML = `<table class="scoreboard">
      <thead><tr><th class="rank">#</th><th>Nickname</th><th>Time</th><th>Misses</th></tr></thead>
      <tbody>${rows}</tbody></table>`;
  } catch {
    target.innerHTML = '<p class="hint">Could not load scoreboard.</p>';
  }
}

// ----- wiring -----
els.hintBtn.addEventListener('click', showHint);
els.zoomInBtn.addEventListener('click', () => zoom && zoom.zoomIn());
els.zoomOutBtn.addEventListener('click', () => zoom && zoom.zoomOut());
els.zoomResetBtn.addEventListener('click', () => zoom && zoom.reset());

els.boardBtn.addEventListener('click', async () => {
  await renderBoard(els.boardContent, null);
  els.boardOverlay.classList.remove('hidden');
});
els.closeBoard.addEventListener('click', () => els.boardOverlay.classList.add('hidden'));
els.boardOverlay.addEventListener('click', (e) => { if (e.target === els.boardOverlay) els.boardOverlay.classList.add('hidden'); });

loadLevel();
