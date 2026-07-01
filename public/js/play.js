'use strict';

const nickname = localStorage.getItem('nickname');
if (!nickname) {
  // No nickname yet -> back to the landing page.
  window.location.href = '/index.html';
}

const els = {
  stage: document.getElementById('stage'),
  img: document.getElementById('gameImage'),
  foundCount: document.getElementById('foundCount'),
  totalCount: document.getElementById('totalCount'),
  timer: document.getElementById('timer'),
  playerName: document.getElementById('playerName'),
  boardBtn: document.getElementById('boardBtn'),
  boardOverlay: document.getElementById('boardOverlay'),
  boardContent: document.getElementById('boardContent'),
  closeBoard: document.getElementById('closeBoard'),
  winOverlay: document.getElementById('winOverlay'),
  winName: document.getElementById('winName'),
  winTime: document.getElementById('winTime'),
  winMsg: document.getElementById('winMsg'),
  winBoard: document.getElementById('winBoard'),
};

els.playerName.textContent = nickname;

const state = {
  total: 0,
  found: new Set(),
  startTime: null,
  timerId: null,
  finished: false,
};

function fmtTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = String(Math.floor(totalSec / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
  const s = String(totalSec % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function startTimer() {
  state.startTime = Date.now();
  state.timerId = setInterval(() => {
    els.timer.textContent = fmtTime(Date.now() - state.startTime);
  }, 250);
}

function stopTimer() {
  clearInterval(state.timerId);
}

function updateScore() {
  els.foundCount.textContent = state.found.size;
  // Total stays a "?" until every object has been found.
  els.totalCount.textContent =
    state.found.size >= state.total ? String(state.total) : '?';
}

async function loadGame() {
  const res = await fetch('/api/game');
  const game = await res.json();
  if (!game || !game.imageUrl || !game.objectCount) {
    alert('No hunt is set up right now.');
    window.location.href = '/index.html';
    return;
  }
  state.total = game.objectCount;
  updateScore();
  els.img.src = game.imageUrl;
  els.img.addEventListener('load', () => startTimer(), { once: true });
}

function addMarker(box, label) {
  const m = document.createElement('div');
  m.className = 'marker';
  m.style.left = box.x * 100 + '%';
  m.style.top = box.y * 100 + '%';
  m.style.width = box.w * 100 + '%';
  m.style.height = box.h * 100 + '%';
  if (label) {
    const tag = document.createElement('span');
    tag.className = 'marker-tag';
    tag.textContent = label;
    m.appendChild(tag);
  }
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

els.img.addEventListener('click', async (e) => {
  if (state.finished || !state.startTime) return;
  const rect = els.img.getBoundingClientRect();
  const nx = (e.clientX - rect.left) / rect.width;
  const ny = (e.clientY - rect.top) / rect.height;

  try {
    const res = await fetch('/api/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x: nx, y: ny }),
    });
    const data = await res.json();
    if (data.hit) {
      if (state.found.has(data.id)) return; // already found
      state.found.add(data.id);
      addMarker(data.box, data.label);
      updateScore();
      if (state.found.size >= state.total) finish();
    } else {
      showMiss(nx, ny);
    }
  } catch {
    showMiss(nx, ny);
  }
});

async function finish() {
  state.finished = true;
  stopTimer();
  const elapsed = Date.now() - state.startTime;
  els.winName.textContent = nickname;
  els.winTime.textContent = fmtTime(elapsed);

  try {
    const res = await fetch('/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname, timeMs: elapsed, found: state.found.size }),
    });
    const data = await res.json();
    els.winMsg.textContent = data.ok ? 'Your time was added to the scoreboard!' : (data.error || '');
  } catch {
    els.winMsg.textContent = 'Could not save your score (offline?).';
  }

  await renderBoard(els.winBoard, elapsed);
  els.winOverlay.classList.remove('hidden');
}

async function renderBoard(target, myTimeMs) {
  try {
    const res = await fetch('/api/scoreboard');
    const scores = await res.json();
    if (!scores.length) {
      target.innerHTML = '<p class="hint">No scores yet — be the first!</p>';
      return;
    }
    let myMarked = false;
    const rows = scores.map((s, i) => {
      const isMe = !myMarked && myTimeMs != null &&
        s.nickname === nickname && s.timeMs === myTimeMs;
      if (isMe) myMarked = true;
      return `<tr class="${isMe ? 'me' : ''}">
        <td class="rank">${i + 1}</td>
        <td>${escapeHtml(s.nickname)}</td>
        <td>${fmtTime(s.timeMs)}</td>
      </tr>`;
    }).join('');
    target.innerHTML = `<table class="scoreboard">
      <thead><tr><th class="rank">#</th><th>Nickname</th><th>Time</th></tr></thead>
      <tbody>${rows}</tbody></table>`;
  } catch {
    target.innerHTML = '<p class="hint">Could not load scoreboard.</p>';
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

els.boardBtn.addEventListener('click', async () => {
  await renderBoard(els.boardContent, null);
  els.boardOverlay.classList.remove('hidden');
});
els.closeBoard.addEventListener('click', () => els.boardOverlay.classList.add('hidden'));
els.boardOverlay.addEventListener('click', (e) => {
  if (e.target === els.boardOverlay) els.boardOverlay.classList.add('hidden');
});

loadGame();
