'use strict';

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';

const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const GAME_FILE = path.join(DATA_DIR, 'game.json');
const SCORE_FILE = path.join(DATA_DIR, 'scoreboard.json');

// Ensure storage directories exist.
for (const dir of [DATA_DIR, UPLOAD_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ---------- helpers ----------

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

function getGame() {
  return readJSON(GAME_FILE, null);
}

function getScores() {
  return readJSON(SCORE_FILE, []);
}

// Public view of the game: never expose object coordinates to the client,
// otherwise players could read them from the network/devtools and cheat.
function publicGame(game) {
  if (!game) return null;
  return {
    imageUrl: game.imageUrl,
    objectCount: Array.isArray(game.objects) ? game.objects.length : 0,
    updatedAt: game.updatedAt,
  };
}

function requireAdmin(req, res, next) {
  const provided = req.get('x-admin-password') || req.query.password || '';
  if (provided !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid admin password.' });
  }
  next();
}

// ---------- middleware ----------

app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, 'public')));

// Store uploads at full quality (no re-encoding), keep original extension.
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
    const name = crypto.randomBytes(8).toString('hex') + ext;
    cb(null, name);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB to allow full-quality photos
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are allowed.'));
  },
});

// ---------- public API ----------

// Current game (no coordinates).
app.get('/api/game', (req, res) => {
  res.json(publicGame(getGame()));
});

// Check a click. Body: { x, y } normalized 0..1 relative to the image.
// Returns whether an object was hit and, if so, its id + box so the client
// can render the reveal. Coordinates are only sent back for objects actually found.
app.post('/api/check', (req, res) => {
  const game = getGame();
  if (!game || !Array.isArray(game.objects) || game.objects.length === 0) {
    return res.status(404).json({ error: 'No game configured.' });
  }
  const x = Number(req.body.x);
  const y = Number(req.body.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return res.status(400).json({ error: 'Invalid coordinates.' });
  }

  for (const obj of game.objects) {
    if (x >= obj.x && x <= obj.x + obj.w && y >= obj.y && y <= obj.y + obj.h) {
      return res.json({
        hit: true,
        id: obj.id,
        label: obj.label || '',
        box: { x: obj.x, y: obj.y, w: obj.w, h: obj.h },
      });
    }
  }
  res.json({ hit: false });
});

// Submit a finished run to the scoreboard.
app.post('/api/score', (req, res) => {
  const game = getGame();
  if (!game) return res.status(404).json({ error: 'No game configured.' });

  const nickname = String(req.body.nickname || '').trim().slice(0, 30);
  const timeMs = Number(req.body.timeMs);
  const found = Number(req.body.found);
  const total = Array.isArray(game.objects) ? game.objects.length : 0;

  if (!nickname) return res.status(400).json({ error: 'Nickname is required.' });
  if (!Number.isFinite(timeMs) || timeMs < 0) {
    return res.status(400).json({ error: 'Invalid time.' });
  }
  // Only completed runs (all objects found) make the scoreboard.
  if (found !== total || total === 0) {
    return res.status(400).json({ error: 'Run not complete.' });
  }

  const scores = getScores();
  scores.push({
    nickname,
    timeMs,
    found,
    total,
    date: new Date().toISOString(),
  });
  scores.sort((a, b) => a.timeMs - b.timeMs);
  writeJSON(SCORE_FILE, scores.slice(0, 100));
  res.json({ ok: true });
});

app.get('/api/scoreboard', (req, res) => {
  const scores = getScores().sort((a, b) => a.timeMs - b.timeMs).slice(0, 50);
  res.json(scores);
});

// ---------- admin API ----------

// Verify password (used by the admin login screen).
app.post('/api/admin/login', requireAdmin, (req, res) => {
  res.json({ ok: true });
});

// Full game config including coordinates (admin only, for editing).
app.get('/api/admin/game', requireAdmin, (req, res) => {
  res.json(getGame());
});

// Upload a full-quality image.
app.post('/api/admin/upload', requireAdmin, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded.' });
  res.json({ imageUrl: '/uploads/' + req.file.filename });
});

// Save the game (image + marked objects). This replaces the active game.
app.post('/api/admin/game', requireAdmin, (req, res) => {
  const imageUrl = String(req.body.imageUrl || '');
  const objects = Array.isArray(req.body.objects) ? req.body.objects : [];
  if (!imageUrl) return res.status(400).json({ error: 'imageUrl is required.' });

  const cleaned = objects.map((o, i) => ({
    id: 'o' + (i + 1),
    label: String(o.label || '').slice(0, 60),
    x: Math.min(Math.max(Number(o.x) || 0, 0), 1),
    y: Math.min(Math.max(Number(o.y) || 0, 0), 1),
    w: Math.min(Math.max(Number(o.w) || 0, 0), 1),
    h: Math.min(Math.max(Number(o.h) || 0, 0), 1),
  }));

  const game = { imageUrl, objects: cleaned, updatedAt: new Date().toISOString() };
  writeJSON(GAME_FILE, game);
  res.json({ ok: true, game });
});

// Reset the scoreboard (e.g. when publishing a fresh hunt).
app.post('/api/admin/reset-scoreboard', requireAdmin, (req, res) => {
  writeJSON(SCORE_FILE, []);
  res.json({ ok: true });
});

// Friendly multer/error handler.
app.use((err, req, res, next) => {
  if (err) return res.status(400).json({ error: err.message || 'Upload failed.' });
  next();
});

app.listen(PORT, () => {
  console.log(`Hidden-object game running at http://localhost:${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin.html  (password: ${ADMIN_PASSWORD})`);
});
