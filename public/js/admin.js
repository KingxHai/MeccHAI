'use strict';

const els = {
  loginScreen: document.getElementById('loginScreen'),
  loginForm: document.getElementById('loginForm'),
  password: document.getElementById('password'),
  loginMsg: document.getElementById('loginMsg'),
  adminPanel: document.getElementById('adminPanel'),
  logoutBtn: document.getElementById('logoutBtn'),

  pendingCount: document.getElementById('pendingCount'),
  pendingList: document.getElementById('pendingList'),
  approvedList: document.getElementById('approvedList'),

  editorCard: document.getElementById('editorCard'),
  editorTitle: document.getElementById('editorTitle'),
  name: document.getElementById('levelName'),
  fileInput: document.getElementById('fileInput'),
  uploadBtn: document.getElementById('uploadBtn'),
  uploadMsg: document.getElementById('uploadMsg'),
  emptyState: document.getElementById('emptyState'),
  stage: document.getElementById('stage'),
  img: document.getElementById('markImage'),
  objCount: document.getElementById('objCount'),
  objList: document.getElementById('objList'),
  createBtn: document.getElementById('createBtn'),
  clearBtn: document.getElementById('clearBtn'),
  cancelEditBtn: document.getElementById('cancelEditBtn'),
  createMsg: document.getElementById('createMsg'),
};

let password = sessionStorage.getItem('adminPassword') || '';
let imageUrl = '';
let tool = null;
let editingId = null; // set while editing an existing level
let allLevels = [];   // last fetched full level list (admin view)

function authHeaders(extra = {}) {
  return { 'x-admin-password': password, ...extra };
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// ---------- login ----------

async function tryLogin(pw) {
  const res = await fetch('/api/admin/login', { method: 'POST', headers: { 'x-admin-password': pw } });
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

function enterPanel() {
  els.loginScreen.classList.add('hidden');
  els.adminPanel.classList.remove('hidden');
  tool = createMarkerTool({ stage: els.stage, img: els.img, list: els.objList, count: els.objCount });
  tool.render();
  loadLevels();
}

(async () => { if (password && (await tryLogin(password))) enterPanel(); })();

// ---------- level lists ----------

async function loadLevels() {
  let levels = [];
  try {
    const res = await fetch('/api/admin/levels', { headers: authHeaders() });
    levels = await res.json();
  } catch { /* ignore */ }
  allLevels = levels;

  const pending = levels.filter((l) => l.status === 'pending');
  const approved = levels.filter((l) => l.status === 'approved');
  els.pendingCount.textContent = pending.length;

  els.pendingList.innerHTML = pending.length
    ? pending.map((l) => card(l, true)).join('')
    : '<p class="hint">No submissions waiting.</p>';

  els.approvedList.innerHTML = approved.length
    ? approved.map((l) => card(l, false)).join('')
    : '<p class="hint">No live levels yet.</p>';

  bindActions();
}

function card(l, isPending) {
  const by = l.createdBy && l.createdBy !== 'admin' ? ` · by ${escapeHtml(l.createdBy)}` : '';
  const actions = isPending
    ? `<button class="btn-success" data-approve="${l.id}">Approve</button>
       <button class="btn-danger" data-reject="${l.id}">Reject</button>`
    : `<button class="btn-secondary" data-edit="${l.id}">✏️ Edit</button>
       <button class="btn-secondary" data-reset="${l.id}">Reset scores</button>
       <button class="btn-danger" data-delete="${l.id}">Delete</button>`;
  return `<div class="admin-card">
    <div class="admin-thumb"><img src="${escapeHtml(l.imageUrl)}" loading="lazy" alt="" /></div>
    <div class="admin-info">
      <div class="admin-title">${escapeHtml(l.name)}</div>
      <div class="hint">${l.objectCount} object(s) · ${l.playCount} play(s)${by}</div>
    </div>
    <div class="admin-actions">${actions}</div>
  </div>`;
}

function bindActions() {
  const call = async (url, method = 'POST') => {
    await fetch(url, { method, headers: authHeaders() });
    loadLevels();
  };
  els.adminPanel.querySelectorAll('[data-approve]').forEach((b) =>
    b.addEventListener('click', () => call('/api/admin/levels/' + b.dataset.approve + '/approve')));
  els.adminPanel.querySelectorAll('[data-reject]').forEach((b) =>
    b.addEventListener('click', () => { if (confirm('Reject and delete this submission?')) call('/api/admin/levels/' + b.dataset.reject + '/reject'); }));
  els.adminPanel.querySelectorAll('[data-delete]').forEach((b) =>
    b.addEventListener('click', () => { if (confirm('Delete this level and its scores?')) call('/api/admin/levels/' + b.dataset.delete, 'DELETE'); }));
  els.adminPanel.querySelectorAll('[data-reset]').forEach((b) =>
    b.addEventListener('click', () => { if (confirm('Clear this level\'s scoreboard?')) call('/api/admin/reset-scoreboard?level=' + b.dataset.reset); }));
  els.adminPanel.querySelectorAll('[data-edit]').forEach((b) =>
    b.addEventListener('click', () => {
      const level = allLevels.find((l) => l.id === b.dataset.edit);
      if (level) enterEditMode(level);
    }));
}

// ---------- create / edit a level ----------

function enterEditMode(level) {
  editingId = level.id;
  imageUrl = level.imageUrl;
  els.name.value = level.name;
  tool.setObjects(level.objects);
  els.img.src = level.imageUrl;
  els.stage.style.display = 'inline-block';
  els.emptyState.style.display = 'none';
  els.editorTitle.textContent = `✏️ Editing "${level.name}"`;
  els.createBtn.textContent = '💾 Save changes';
  els.cancelEditBtn.classList.remove('hidden');
  els.createMsg.textContent = '';
  els.uploadMsg.textContent = '';
  els.editorCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function exitEditMode() {
  editingId = null;
  imageUrl = '';
  els.name.value = '';
  tool.clear();
  els.stage.style.display = 'none';
  els.emptyState.style.display = 'block';
  els.editorTitle.textContent = '➕ Create a level (auto-approved)';
  els.createBtn.textContent = '💾 Create level';
  els.cancelEditBtn.classList.add('hidden');
  els.fileInput.value = '';
  els.uploadMsg.textContent = '';
  els.createMsg.textContent = '';
}

els.cancelEditBtn.addEventListener('click', exitEditMode);

els.uploadBtn.addEventListener('click', async () => {
  const file = els.fileInput.files[0];
  if (!file) { els.uploadMsg.textContent = 'Pick an image file first.'; els.uploadMsg.className = 'msg error'; return; }
  const isHeic = /\.(heic|heif)$/i.test(file.name);
  els.uploadMsg.textContent = isHeic ? 'Uploading & converting HEIC…' : 'Uploading…';
  els.uploadMsg.className = 'msg';
  const fd = new FormData();
  fd.append('image', file);
  try {
    const res = await fetch('/api/upload', { method: 'POST', headers: authHeaders(), body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed.');
    imageUrl = data.imageUrl;
    tool.clear();
    els.img.src = imageUrl;
    els.stage.style.display = 'inline-block';
    els.emptyState.style.display = 'none';
    els.uploadMsg.textContent = 'Uploaded! Drag rectangles over the hidden objects.';
    els.uploadMsg.className = 'msg ok';
  } catch (err) {
    els.uploadMsg.textContent = err.message;
    els.uploadMsg.className = 'msg error';
  }
});

els.clearBtn.addEventListener('click', () => {
  if (tool.getObjects().length && confirm('Remove all marked objects?')) tool.clear();
});

els.createBtn.addEventListener('click', async () => {
  const name = els.name.value.trim();
  const objects = tool.getObjects();
  if (!name) { els.createMsg.textContent = 'Name the level first.'; els.createMsg.className = 'msg error'; return; }
  if (!imageUrl) { els.createMsg.textContent = 'Upload an image first.'; els.createMsg.className = 'msg error'; return; }
  if (!objects.length) { els.createMsg.textContent = 'Mark at least one hidden object.'; els.createMsg.className = 'msg error'; return; }

  const isEdit = !!editingId;
  els.createMsg.textContent = isEdit ? 'Saving changes…' : 'Saving…';
  els.createMsg.className = 'msg';
  try {
    const res = await fetch(isEdit ? '/api/admin/levels/' + editingId : '/api/admin/levels', {
      method: isEdit ? 'PUT' : 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ name, imageUrl, objects }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Save failed.');
    if (isEdit) {
      exitEditMode();
      els.createMsg.textContent = `Saved changes to "${name}".`;
    } else {
      els.name.value = '';
      imageUrl = '';
      tool.clear();
      els.stage.style.display = 'none';
      els.emptyState.style.display = 'block';
      els.fileInput.value = '';
      els.uploadMsg.textContent = '';
      els.createMsg.textContent = `Created "${name}"! It's live now.`;
    }
    els.createMsg.className = 'msg ok';
    loadLevels();
  } catch (err) {
    els.createMsg.textContent = err.message;
    els.createMsg.className = 'msg error';
  }
});
