# 🔍 Hidden Object Hunt

A small full-stack website for hosting a "find the hidden objects" game.

- **Admins** upload a picture in **full quality** and mark rectangular regions where objects are hidden.
- **Players** enter a nickname, then hunt for the objects against a live timer.
- A shared **scoreboard** ranks everyone who finds them all, fastest first.

Everything (the image, the object markers, and the scoreboard) is stored on the
server, so it's shared across all visitors and devices.

## Features

### Player UI
- **Score `0/?`** — the left number counts objects found and updates live; the
  right side stays a `?` until *every* object is found, at which point it reveals
  the total (matching the number of objects the admin marked).
- **Timer** in `HH:MM:SS` (`00:00:00`) that starts when the image loads.
- **Scoreboard** showing `nickname — time`, fastest first, with your own run
  highlighted.
- Clicking a hidden object drops a green marker (with the admin's optional label);
  clicking empty space shows a small "miss" ripple.

### Admin UI (`/admin.html`)
- Password-protected.
- Upload an image — the original file is stored **as-is, no compression** (up to 50 MB).
- **Drag rectangles** directly on the image to mark each hidden object.
- Give each object an optional name, remove individual marks, or clear all.
- Save the hunt (replaces the active game) and reset the scoreboard.

### Anti-cheat
Object coordinates are **never** sent to the player's browser. Each click is
verified server-side (`POST /api/check`), and only a found object's location is
returned — so players can't read the answers from the network or devtools.

## Getting started

```bash
npm install
npm start
```

Then open:

- Game / player entry: <http://localhost:3000/>
- Admin panel: <http://localhost:3000/admin.html>

### Configuration

| Env var          | Default | Purpose                          |
| ---------------- | ------- | -------------------------------- |
| `PORT`           | `3000`  | Port to listen on                |
| `ADMIN_PASSWORD` | `admin` | Password for the admin panel     |

**Set a real `ADMIN_PASSWORD` before deploying:**

```bash
ADMIN_PASSWORD='your-strong-password' npm start
```

## Run with Docker

The whole app is a single container. Persistent data (uploaded images, game
config, scoreboard) lives in two mounted folders so nothing is lost on restart.

### Docker (one-liner)

```bash
docker run -d --name hidden-object-hunt \
  -p 3000:3000 \
  -e ADMIN_PASSWORD='your-strong-password' \
  -v "$PWD/data:/app/data" \
  -v "$PWD/uploads:/app/uploads" \
  --restart unless-stopped \
  ghcr.io/kingxhai/mecchai:latest
```

### Docker Compose

```bash
docker compose up -d      # edit ADMIN_PASSWORD in docker-compose.yml first
```

Build locally instead of pulling: `docker build -t mecchai .`

### Unraid

A ready-made Community-Applications template lives at
[`unraid/mecchai.xml`](unraid/mecchai.xml).

**Easiest:** in Unraid go to **Docker → Add Container**, and in the *Template*
field paste:

```
https://raw.githubusercontent.com/kingxhai/mecchai/main/unraid/mecchai.xml
```

Then just set the **Admin Password** and click **Apply**. It maps:

| Setting  | Container path | Default host path                    |
| -------- | -------------- | ------------------------------------ |
| Data     | `/app/data`    | `/mnt/user/appdata/mecchai/data`     |
| Uploads  | `/app/uploads` | `/mnt/user/appdata/mecchai/uploads`  |
| WebUI    | port `3000`    | choose any host port                 |

Open the WebUI at `http://<unraid-ip>:3000/`, and the admin panel at
`/admin.html`.

> The image is published to **GHCR** automatically by the
> [`docker-publish`](.github/workflows/docker-publish.yml) GitHub Action on
> every push to the default branch (and on version tags). Trigger it manually
> from the Actions tab, or merge to `main`, to produce `ghcr.io/kingxhai/mecchai:latest`.
> Make the package **public** once (repo → Packages → package → Package settings)
> so Unraid can pull it without a login.

## How to run a hunt

1. Go to `/admin.html` and log in.
2. Choose an image and click **Upload**.
3. Drag a rectangle over each hidden object (name them if you like).
4. Click **💾 Save hunt**.
5. Share the site's URL. Players enter a nickname and start hunting.

## Project layout

```
server.js            Express server + JSON API (upload, check, score)
public/
  index.html         Landing page — nickname entry
  play.html          The game (HUD: score, timer; scoreboard overlay)
  admin.html         Admin panel — upload + mark objects
  css/style.css      Shared styles
  js/play.js         Gameplay logic
  js/admin.js        Admin logic (upload, drag-to-mark, save)
uploads/             Uploaded images (gitignored)
data/                game.json + scoreboard.json (gitignored)
```

## API reference

| Method | Endpoint                        | Auth  | Description                                  |
| ------ | ------------------------------- | ----- | -------------------------------------------- |
| GET    | `/api/game`                     | —     | Public game info (image + object count only) |
| POST   | `/api/check`                    | —     | Check a normalized `{x,y}` click for a hit   |
| POST   | `/api/score`                    | —     | Submit a completed run to the scoreboard     |
| GET    | `/api/scoreboard`               | —     | Top scores, fastest first                    |
| POST   | `/api/admin/login`              | admin | Verify the admin password                    |
| GET    | `/api/admin/game`               | admin | Full game config incl. coordinates           |
| POST   | `/api/admin/upload`             | admin | Upload a full-quality image                  |
| POST   | `/api/admin/game`               | admin | Save image + marked objects                  |
| POST   | `/api/admin/reset-scoreboard`   | admin | Clear the scoreboard                         |

Admin requests authenticate with an `x-admin-password` header.
