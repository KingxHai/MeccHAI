# 🔍 Hidden Object Hunt

A small full-stack website for hosting a "find the hidden objects" game with
**multiple levels**.

- **Admins** (and players) upload a picture in **full quality**, name it, and mark
  rectangular regions where objects are hidden — each image is its own **level**.
- **Players** enter a nickname, **browse the levels**, and hunt for the objects
  against a live timer.
- Each level has its own **scoreboard** ranking everyone who finds them all.

Everything (images, object markers, and scoreboards) is stored on the server, so
it's shared across all visitors and devices.

## Features

### Player UI
- **Browse levels** — a grid of levels to pick from. The number of objects is
  **not** revealed up front.
- **Score `0/?`** — the left number counts objects found and updates live; the
  right side stays a `?` until *every* object is found (the total is never shown
  early, to keep the challenge).
- **Timer** in `HH:MM:SS` (`00:00:00`) that starts when the image loads.
- **Misclicks** are counted and shown live.
- **Zoom & pan** — zoom buttons plus mouse wheel (desktop) and pinch (mobile),
  and drag to pan when zoomed in. Tapping still finds objects accurately at any
  zoom level.
- **Hint button** — asks the server for a clue for the next not-yet-found
  object, in marking order (object 1, then 2, ...), skipping ones already
  found (only objects the creator gave a hint have one).
- **Per-level scoreboard** showing `nickname · found/total · time · misses ·
  hints used`. Completed runs rank first (fastest, ties broken by fewest
  misses then hints); gave-up runs rank below them (most found first) with a
  red **FAILED** tag in place of a time. Keeps only each player's best run —
  a completion always outranks a give-up — with your own run highlighted.
- Clicking a hidden object drops a green marker with its name, faded so it
  doesn't clutter the hunt — hover (or tap, on touch) a name to bring it to full
  opacity. Clicking empty space shows a small "miss" ripple.
- **Give up** — ends the run early (with an in-app confirmation prompt),
  reveals every object you hadn't found yet in a **red** box, and shows your
  final score (found/total). The results card can be **minimized** to a small
  "Show results" button so you can freely inspect the revealed board (zoom
  included) before reopening it. Gave-up runs are still added to the
  scoreboard as a **failed attempt** — ranked below completed runs, showing
  `found/total` and a red **FAILED** tag instead of a time.

### Create a level (`/submit.html`)
Any player can create a level: upload an image, name it, and drag rectangles over
the hidden objects. Each object can also have an optional **hint** (shown to
players who press the Hint button). Submissions are held for **admin approval**
before they appear in the browse list. Marking works with mouse and touch, and
can be **zoomed in** for precise selection (buttons, Ctrl/Cmd + scroll, or
pinch on touch — scroll/drag the scrollbar to pan while zoomed in).

### Admin UI (`/admin.html`)
- Password-protected.
- **Approve / reject** pending player submissions.
- **Create levels** directly (auto-approved): upload, name, and mark objects
  — zoomable for precise selection, same as the submission form.
- **Edit** any live level — click it to change its name, image, and hidden
  objects/hints, or add/remove objects.
- **Delete** any level, or **reset** an individual level's scoreboard.
- Images are stored full quality; Apple **HEIC/HEIF** photos (the default iPhone
  format) are automatically converted to high-quality JPEG on upload, since most
  browsers can't display HEIC.

### Anti-cheat
Object coordinates and the object count are **never** sent to the player's
browser up front. Each click is verified server-side (`POST /api/check`), and
only a found object's location and name are returned — so players can't read
the remaining answers (or how many objects are left) from the network or
devtools.

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
server.js            Express server + JSON API (levels, upload, check, score)
public/
  index.html         Landing page — nickname entry
  browse.html        Level picker (grid of approved levels)
  play.html          The game (HUD: score, timer, misses; scoreboard overlay)
  submit.html        Player level creation (upload, name, mark) — pending approval
  admin.html         Admin panel — approve/reject, create, delete levels
  css/style.css      Shared styles
  js/marker.js       Reusable drag-to-mark tool (mouse + touch + zoom)
  js/zoom.js         Pan + zoom controller for the play image
  js/play.js         Gameplay logic
  js/submit.js       Player submission logic
  js/admin.js        Admin logic (approve/reject/create/delete)
uploads/             Uploaded images (gitignored)
data/                levels.json + scoreboard.json (gitignored)
```

## API reference

| Method | Endpoint                            | Auth  | Description                                       |
| ------ | ----------------------------------- | ----- | ------------------------------------------------ |
| GET    | `/api/levels`                       | —     | Approved levels for browsing (no object count)   |
| GET    | `/api/levels/:id`                   | —     | One level to play (image + count for game logic) |
| POST   | `/api/check`                        | —     | Check a normalized `{levelId,x,y}` click         |
| POST   | `/api/score`                        | —     | Submit a completed run (incl. misses)            |
| GET    | `/api/scoreboard/:levelId`          | —     | Best run per player for a level                  |
| POST   | `/api/hint`                         | —     | Get a hint for an unfound object (if one exists) |
| POST   | `/api/give-up`                      | —     | Reveal all not-yet-found objects (ends the run)  |
| POST   | `/api/upload`                       | —     | Upload an image (handles HEIC)                    |
| POST   | `/api/levels/submit`                | —     | Submit a player-made level (pending approval)    |
| POST   | `/api/admin/login`                  | admin | Verify the admin password                        |
| GET    | `/api/admin/levels`                 | admin | All levels incl. pending + coordinates           |
| POST   | `/api/admin/levels`                 | admin | Create a level (auto-approved)                   |
| PUT    | `/api/admin/levels/:id`             | admin | Edit a level's name, image, and/or objects       |
| POST   | `/api/admin/levels/:id/approve`     | admin | Approve a pending submission                     |
| POST   | `/api/admin/levels/:id/reject`      | admin | Reject (delete) a pending submission             |
| DELETE | `/api/admin/levels/:id`             | admin | Delete a level (and its scores/image)            |
| POST   | `/api/admin/reset-scoreboard?level=`| admin | Clear one level's scores (or all)                |

Admin requests authenticate with an `x-admin-password` header.
