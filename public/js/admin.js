'use strict';

const els = {
  loginScreen: document.getElementById('loginScreen'),
  loginForm: document.getElementById('loginForm'),
  password: document.getElementById('password'),
  loginMsg: document.getElementById('loginMsg'),
  adminPanel: document.getElementById('adminPanel'),
  logoutBtn: document.getElementById('logoutBtn'),

  fileInput: document.getElementById('fileInput'),
  uploadBtn: document.getElementById('uploadBtn'),
  uploadMsg: document.getElementById('uploadMsg'),

  emptyState: document.getElementById('emptyState'),
  stage: document.getElementById('stage'),
  img: document.getElementById('adminImage'),
  objCount: document.getElementById('objCount'),
  objList: document.getElementById('objList'),
  saveBtn: document.getElementById('saveBtn'),
  clearBtn: document.getElementById('clearBtn'),
  resetBoardBtn: document.getElementById('resetBoardBtn'),
  saveMsg: document.getElementById('saveMsg'),
};

let password = sessionStorage.getItem('adminPassword') || '';
let imageUrl = '';
let objects = []; // { label, x, y, w, h } normalized

function authHeaders(extra = {}) {
  return { 'x-admin-password': password, ...extra };
}

// ---------- login ----------

async function tryLogin(pw) {
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'x-admin-password': pw },
  });
  return res.ok;
}

els.loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const pw = els.password.value;
  els.loginMsg.textContent = 'Checking…';
  els.loginMsg.className = 'msg';
  if (await tryLogin(pw)) {
    password = pw;
    sessionStorage.setItem('adminPassword', pw);
    enterPanel();
  } else {
    els.loginMsg.textContent = 'Wrong password.';
    els.loginMsg.className = 'msg error';
  }
});

els.logoutBtn.addEventListener('click', () => {
  sessionStorage.removeItem('adminPassword');
  location.reload();
});

async function enterPanel() {
  els.loginScreen.classList.add('hidden');
  els.adminPanel.classList.remove('hidden');
  await loadExisting();
}

// Restore session on reload.
(async () => {
  if (password && (await tryLogin(password))) enterPanel();
})();

// ---------- load existing game ----------

async function loadExisting() {
  try {
    const res = await fetch('/api/admin/game', { headers: authHeaders() });
    if (!res.ok) return;
    const game = await res.json();
    if (game && game.imageUrl) {
      imageUrl = game.imageUrl;
      objects = (game.objects || []).map((o) => ({
        label: o.label || '', x: o.x, y: o.y, w: o.w, h: o.h,
      }));
      showImage();
      renderObjects();
    }
  } catch { /* no existing game */ }
}

// ---------- upload ----------

els.uploadBtn.addEventListener('click', async () => {
  const file = els.fileInput.files[0];
  if (!file) {
    els.uploadMsg.textContent = 'Pick an image file first.';
    els.uploadMsg.className = 'msg error';
    return;
  }
  const isHeic = /\.(heic|heif)$/i.test(file.name);
  els.uploadMsg.textContent = isHeic ? 'Uploading & converting HEIC… (may take a few seconds)' : 'Uploading…';
  els.uploadMsg.className = 'msg';
  const fd = new FormData();
  fd.append('image', file);
  try {
    const res = await fetch('/api/admin/upload', {
      method: 'POST',
      headers: authHeaders(),
      body: fd,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed.');
    imageUrl = data.imageUrl;
    objects = []; // new image -> fresh marks
    showImage();
    renderObjects();
    els.uploadMsg.textContent = 'Uploaded! Now drag rectangles over the hidden objects.';
    els.uploadMsg.className = 'msg ok';
  } catch (err) {
    els.uploadMsg.textContent = err.message;
    els.uploadMsg.className = 'msg error';
  }
});

function showImage() {
  els.img.src = imageUrl;
  els.stage.style.display = 'inline-block';
  els.emptyState.style.display = 'none';
}

// ---------- drawing boxes ----------

let drawing = null; // { startX, startY, el }

els.img.addEventListener('mousedown', (e) => {
  e.preventDefault();
  const rect = els.img.getBoundingClientRect();
  const startX = (e.clientX - rect.left) / rect.width;
  const startY = (e.clientY - rect.top) / rect.height;
  const el = document.createElement('div');
  el.className = 'draw-box';
  els.stage.appendChild(el);
  drawing = { startX, startY, el };
});

window.addEventListener('mousemove', (e) => {
  if (!drawing) return;
  const rect = els.img.getBoundingClientRect();
  let curX = (e.clientX - rect.left) / rect.width;
  let curY = (e.clientY - rect.top) / rect.height;
  curX = Math.min(Math.max(curX, 0), 1);
  curY = Math.min(Math.max(curY, 0), 1);
  const x = Math.min(drawing.startX, curX);
  const y = Math.min(drawing.startY, curY);
  const w = Math.abs(curX - drawing.startX);
  const h = Math.abs(curY - drawing.startY);
  Object.assign(drawing.el.style, {
    left: x * 100 + '%', top: y * 100 + '%',
    width: w * 100 + '%', height: h * 100 + '%',
  });
  drawing.box = { x, y, w, h };
});

window.addEventListener('mouseup', () => {
  if (!drawing) return;
  const box = drawing.box;
  drawing.el.remove();
  drawing = null;
  // Ignore tiny accidental drags.
  if (!box || box.w < 0.01 || box.h < 0.01) return;
  objects.push({ label: '', ...box });
  renderObjects();
});

// ---------- render ----------

function renderObjects() {
  els.objCount.textContent = objects.length;

  // Boxes on the image.
  els.stage.querySelectorAll('.obj-box').forEach((n) => n.remove());
  objects.forEach((o, i) => {
    const box = document.createElement('div');
    box.className = 'obj-box';
    Object.assign(box.style, {
      left: o.x * 100 + '%', top: o.y * 100 + '%',
      width: o.w * 100 + '%', height: o.h * 100 + '%',
    });
    box.innerHTML = `<span class="obj-index">${i + 1}</span>`;
    els.stage.appendChild(box);
  });

  // List with labels + delete.
  els.objList.innerHTML = '';
  if (!objects.length) {
    els.objList.innerHTML = '<li class="hint" style="justify-content:flex-start;">No objects marked yet.</li>';
    return;
  }
  objects.forEach((o, i) => {
    const li = document.createElement('li');
    const left = document.createElement('div');
    left.className = 'row';
    left.style.gap = '10px';
    left.innerHTML = `<strong>#${i + 1}</strong>`;
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Optional name (e.g. golden key)';
    input.value = o.label || '';
    input.style.minWidth = '240px';
    input.addEventListener('input', () => { o.label = input.value; });
    left.appendChild(input);

    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '✕ Remove';
    del.addEventListener('click', () => {
      objects.splice(i, 1);
      renderObjects();
    });

    li.appendChild(left);
    li.appendChild(del);
    els.objList.appendChild(li);
  });
}

// ---------- save / clear / reset ----------

els.saveBtn.addEventListener('click', async () => {
  if (!imageUrl) {
    els.saveMsg.textContent = 'Upload an image first.';
    els.saveMsg.className = 'msg error';
    return;
  }
  if (!objects.length) {
    els.saveMsg.textContent = 'Mark at least one hidden object.';
    els.saveMsg.className = 'msg error';
    return;
  }
  els.saveMsg.textContent = 'Saving…';
  els.saveMsg.className = 'msg';
  try {
    const res = await fetch('/api/admin/game', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ imageUrl, objects }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Save failed.');
    els.saveMsg.textContent = `Saved! Players can now find ${objects.length} object(s).`;
    els.saveMsg.className = 'msg ok';
  } catch (err) {
    els.saveMsg.textContent = err.message;
    els.saveMsg.className = 'msg error';
  }
});

els.clearBtn.addEventListener('click', () => {
  if (!objects.length) return;
  if (confirm('Remove all marked objects?')) {
    objects = [];
    renderObjects();
  }
});

els.resetBoardBtn.addEventListener('click', async () => {
  if (!confirm('Clear the entire scoreboard? This cannot be undone.')) return;
  try {
    const res = await fetch('/api/admin/reset-scoreboard', {
      method: 'POST',
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error('Reset failed.');
    els.saveMsg.textContent = 'Scoreboard cleared.';
    els.saveMsg.className = 'msg ok';
  } catch (err) {
    els.saveMsg.textContent = err.message;
    els.saveMsg.className = 'msg error';
  }
});
