'use strict';

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const heicConvert = require('heic-convert');

// Apple HEIC/HEIF files (the default iPhone photo format) can't be displayed
// by most browsers, so we transcode them to JPEG on upload. Quality is kept
// very high to preserve the fine detail needed to hide objects.
const HEIC_JPEG_QUALITY = 0.92;

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';

const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const LEVELS_FILE = path.join(DATA_DIR, 'levels.json');
const SCORE_FILE = path.join(DATA_DIR, 'scoreboard.json');
const LEGACY_GAME_FILE = path.join(DATA_DIR, 'game.json');

for (const dir of [DATA_DIR, UPLOAD_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ---------- storage helpers ----------

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function genId(prefix) {
  return prefix + '_' + crypto.randomBytes(6).toString('hex');
}

function getLevels() {
  return readJSON(LEVELS_FILE, []);
}
function saveLevels(levels) {
  writeJSON(LEVELS_FILE, levels);
}
function getScores() {
  return readJSON(SCORE_FILE, []);
}
function saveScores(scores) {
  writeJSON(SCORE_FILE, scores);
}

// One-time migration: fold a legacy single-game config into the levels list.
(function migrate() {
  if (fs.existsSync(LEVELS_FILE)) return;
  const levels = [];
  const legacy = readJSON(LEGACY_GAME_FILE, null);
  if (legacy && legacy.imageUrl) {
    const id = genId('lvl');
    levels.push({
      id,
      name: 'Level 1',
      imageUrl: legacy.imageUrl,
      objects: Array.isArray(legacy.objects) ? legacy.objects : [],
      status: 'approved',
      createdBy: 'admin',
      createdAt: new Date().toISOString(),
    });
    const scores = getScores();
    let changed = false;
    for (const s of scores) {
      if (!s.levelId) { s.levelId = id; changed = true; }
      if (s.misses == null) { s.misses = 0; changed = true; }
    }
    if (changed) saveScores(scores);
  }
  saveLevels(levels);
})();

// Clamp object rectangles to 0..1 and assign ids.
function cleanObjects(objects) {
  return (Array.isArray(objects) ? objects : []).map((o, i) => ({
    id: 'o' + (i + 1),
    label: String(o.label || '').slice(0, 60),
    hint: String(o.hint || '').slice(0, 200),
    x: Math.min(Math.max(Number(o.x) || 0, 0), 1),
    y: Math.min(Math.max(Number(o.y) || 0, 0), 1),
    w: Math.min(Math.max(Number(o.w) || 0, 0), 1),
    h: Math.min(Math.max(Number(o.h) || 0, 0), 1),
  })).filter((o) => o.w > 0 && o.h > 0);
}

// Public list entry — deliberately omits object coordinates AND the count,
// so players don't see how many objects there are before finishing.
function publicLevelSummary(level) {
  return { id: level.id, name: level.name, imageUrl: level.imageUrl };
}

// Best run per nickname for a level (fixes duplicate/replayed rows), sorted
// by time then misses.
function levelScoreboard(levelId) {
  const best = new Map();
  for (const s of getScores()) {
    if (s.levelId !== levelId) continue;
    const cur = best.get(s.nickname);
    const better =
      !cur ||
      s.timeMs < cur.timeMs ||
      (s.timeMs === cur.timeMs && (s.misses || 0) < (cur.misses || 0));
    if (better) best.set(s.nickname, s);
  }
  return [...best.values()]
    .sort((a, b) => a.timeMs - b.timeMs || (a.misses || 0) - (b.misses || 0))
    .slice(0, 50)
    .map((s) => ({ nickname: s.nickname, timeMs: s.timeMs, misses: s.misses || 0 }));
}

function removeUpload(imageUrl) {
  if (!imageUrl) return;
  const file = path.join(UPLOAD_DIR, path.basename(imageUrl));
  fs.unlink(file, () => {});
}

// ---------- middleware ----------

app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, 'public')));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
    cb(null, crypto.randomBytes(8).toString('hex') + ext);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const isHeic = ext === '.heic' || ext === '.heif';
    if (/^image\//.test(file.mimetype) || isHeic) cb(null, true);
    else cb(new Error('Only image files are allowed.'));
  },
});

function requireAdmin(req, res, next) {
  const provided = req.get('x-admin-password') || req.query.password || '';
  if (provided !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid admin password.' });
  }
  next();
}

function isAdmin(req) {
  return (req.get('x-admin-password') || '') === ADMIN_PASSWORD;
}

// Convert a freshly uploaded HEIC file to JPEG in place; returns the public URL.
async function finalizeUpload(file) {
  const ext = path.extname(file.filename).toLowerCase();
  if (ext !== '.heic' && ext !== '.heif') {
    return '/uploads/' + file.filename;
  }
  const inputBuffer = fs.readFileSync(file.path);
  const outputBuffer = await heicConvert({
    buffer: inputBuffer,
    format: 'JPEG',
    quality: HEIC_JPEG_QUALITY,
  });
  const jpgName = path.basename(file.filename, ext) + '.jpg';
  fs.writeFileSync(path.join(UPLOAD_DIR, jpgName), Buffer.from(outputBuffer));
  fs.unlinkSync(file.path);
  return '/uploads/' + jpgName;
}

// ---------- public API ----------

// Approved levels for the browse screen (no coordinates, no object count).
app.get('/api/levels', (req, res) => {
  const levels = getLevels().filter((l) => l.status === 'approved');
  res.json(levels.map(publicLevelSummary));
});

// A single approved level for playing. objectCount is included because the
// client needs it to know when the hunt is complete, but the UI keeps it
// hidden ("?") until the player finds them all.
app.get('/api/levels/:id', (req, res) => {
  const level = getLevels().find((l) => l.id === req.params.id && l.status === 'approved');
  if (!level) return res.status(404).json({ error: 'Level not found.' });
  res.json({
    id: level.id,
    name: level.name,
    imageUrl: level.imageUrl,
    objectCount: level.objects.length,
  });
});

// Check a click for a level. Body: { levelId, x, y } normalized 0..1.
app.post('/api/check', (req, res) => {
  const level = getLevels().find((l) => l.id === req.body.levelId && l.status === 'approved');
  if (!level || !level.objects.length) {
    return res.status(404).json({ error: 'Level not found.' });
  }
  const x = Number(req.body.x);
  const y = Number(req.body.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return res.status(400).json({ error: 'Invalid coordinates.' });
  }
  for (const obj of level.objects) {
    if (x >= obj.x && x <= obj.x + obj.w && y >= obj.y && y <= obj.y + obj.h) {
      return res.json({ hit: true, id: obj.id, box: { x: obj.x, y: obj.y, w: obj.w, h: obj.h } });
    }
  }
  res.json({ hit: false });
});

// Submit a finished run. Body: { levelId, nickname, timeMs, found, misses }.
app.post('/api/score', (req, res) => {
  const level = getLevels().find((l) => l.id === req.body.levelId && l.status === 'approved');
  if (!level) return res.status(404).json({ error: 'Level not found.' });

  const nickname = String(req.body.nickname || '').trim().slice(0, 30);
  const timeMs = Number(req.body.timeMs);
  const found = Number(req.body.found);
  const misses = Math.max(0, Math.floor(Number(req.body.misses) || 0));
  const total = level.objects.length;

  if (!nickname) return res.status(400).json({ error: 'Nickname is required.' });
  if (!Number.isFinite(timeMs) || timeMs < 0) return res.status(400).json({ error: 'Invalid time.' });
  if (found !== total || total === 0) return res.status(400).json({ error: 'Run not complete.' });

  const scores = getScores();
  scores.push({
    levelId: level.id,
    nickname,
    timeMs,
    misses,
    found,
    total,
    date: new Date().toISOString(),
  });
  saveScores(scores);
  res.json({ ok: true });
});

app.get('/api/scoreboard/:levelId', (req, res) => {
  res.json(levelScoreboard(req.params.levelId));
});

// Ask for a hint. Body: { levelId, foundIds: [] }. Returns the hint text for a
// random not-yet-found object that has one. Kept server-side so hints aren't all
// exposed up front.
app.post('/api/hint', (req, res) => {
  const level = getLevels().find((l) => l.id === req.body.levelId && l.status === 'approved');
  if (!level) return res.status(404).json({ error: 'Level not found.' });
  const found = new Set(Array.isArray(req.body.foundIds) ? req.body.foundIds : []);
  const candidates = level.objects.filter((o) => !found.has(o.id) && o.hint && o.hint.trim());
  if (!candidates.length) return res.json({ hasHint: false });
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  res.json({ hasHint: true, hint: pick.hint, remaining: candidates.length });
});

// Public image upload (used by both submission and admin flows). Handles HEIC.
app.post('/api/upload', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded.' });
  try {
    const imageUrl = await finalizeUpload(req.file);
    res.json({ imageUrl });
  } catch (err) {
    fs.unlink(req.file.path, () => {});
    res.status(400).json({ error: 'Could not process image: ' + err.message });
  }
});

// User-submitted level. Always created as pending until an admin approves.
app.post('/api/levels/submit', (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 60);
  const imageUrl = String(req.body.imageUrl || '');
  const objects = cleanObjects(req.body.objects);
  const submitter = String(req.body.submitter || '').trim().slice(0, 30) || 'anonymous';

  if (!name) return res.status(400).json({ error: 'Please give your level a name.' });
  if (!imageUrl) return res.status(400).json({ error: 'Please upload an image.' });
  if (!objects.length) return res.status(400).json({ error: 'Mark at least one hidden object.' });

  const levels = getLevels();
  levels.push({
    id: genId('lvl'),
    name,
    imageUrl,
    objects,
    status: 'pending',
    createdBy: submitter,
    createdAt: new Date().toISOString(),
  });
  saveLevels(levels);
  res.json({ ok: true });
});

// ---------- admin API ----------

app.post('/api/admin/login', requireAdmin, (req, res) => res.json({ ok: true }));

// All levels with full data (coordinates + status), pending first.
app.get('/api/admin/levels', requireAdmin, (req, res) => {
  const levels = getLevels().slice().sort((a, b) => {
    if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });
  const scores = getScores();
  res.json(levels.map((l) => ({
    ...l,
    objectCount: l.objects.length,
    playCount: scores.filter((s) => s.levelId === l.id).length,
  })));
});

// Admin creates a level directly (auto-approved).
app.post('/api/admin/levels', requireAdmin, (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 60);
  const imageUrl = String(req.body.imageUrl || '');
  const objects = cleanObjects(req.body.objects);
  if (!name) return res.status(400).json({ error: 'Name is required.' });
  if (!imageUrl) return res.status(400).json({ error: 'imageUrl is required.' });
  if (!objects.length) return res.status(400).json({ error: 'Mark at least one hidden object.' });

  const levels = getLevels();
  const level = {
    id: genId('lvl'),
    name,
    imageUrl,
    objects,
    status: 'approved',
    createdBy: 'admin',
    createdAt: new Date().toISOString(),
  };
  levels.push(level);
  saveLevels(levels);
  res.json({ ok: true, id: level.id });
});

app.post('/api/admin/levels/:id/approve', requireAdmin, (req, res) => {
  const levels = getLevels();
  const level = levels.find((l) => l.id === req.params.id);
  if (!level) return res.status(404).json({ error: 'Level not found.' });
  level.status = 'approved';
  saveLevels(levels);
  res.json({ ok: true });
});

// Reject (delete) a pending level, or delete any level entirely, plus its
// image and scores.
function deleteLevel(id) {
  const levels = getLevels();
  const level = levels.find((l) => l.id === id);
  if (!level) return false;
  saveLevels(levels.filter((l) => l.id !== id));
  saveScores(getScores().filter((s) => s.levelId !== id));
  removeUpload(level.imageUrl);
  return true;
}

app.post('/api/admin/levels/:id/reject', requireAdmin, (req, res) => {
  if (!deleteLevel(req.params.id)) return res.status(404).json({ error: 'Level not found.' });
  res.json({ ok: true });
});

app.delete('/api/admin/levels/:id', requireAdmin, (req, res) => {
  if (!deleteLevel(req.params.id)) return res.status(404).json({ error: 'Level not found.' });
  res.json({ ok: true });
});

// Reset the scoreboard for one level (or all if no level given).
app.post('/api/admin/reset-scoreboard', requireAdmin, (req, res) => {
  const levelId = req.query.level || req.body.levelId;
  if (levelId) {
    saveScores(getScores().filter((s) => s.levelId !== levelId));
  } else {
    saveScores([]);
  }
  res.json({ ok: true });
});

// Friendly upload/error handler.
app.use((err, req, res, next) => {
  if (err) return res.status(400).json({ error: err.message || 'Request failed.' });
  next();
});

app.listen(PORT, () => {
  console.log(`Hidden-object game running at http://localhost:${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin.html  (password: ${ADMIN_PASSWORD})`);
});
