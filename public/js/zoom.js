'use strict';

// Pan + zoom for the play image, working with mouse (wheel + drag), touch
// (pinch + drag) and buttons. Because we transform the stage with CSS, the
// image's getBoundingClientRect() already reflects the zoom/pan, so callers can
// keep computing normalized click coordinates the usual way.
//
//   const zoom = createZoom({ viewport, stage, img, onTap });
//   zoom.zoomIn(); zoom.zoomOut(); zoom.reset();
window.createZoom = function ({ viewport, stage, img, onTap, onChange }) {
  const MIN = 1, MAX = 6, TAP_MOVE = 6;
  let scale = 1, tx = 0, ty = 0;
  let baseW = 0, baseH = 0;

  function apply() {
    stage.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    if (onChange) onChange(scale);
  }

  // Keep the image inside the viewport: center it when smaller, clamp when larger.
  function clamp() {
    const vw = viewport.clientWidth, vh = viewport.clientHeight;
    const sw = baseW * scale, sh = baseH * scale;
    tx = sw <= vw ? (vw - sw) / 2 : Math.min(0, Math.max(vw - sw, tx));
    ty = sh <= vh ? (vh - sh) / 2 : Math.min(0, Math.max(vh - sh, ty));
  }

  // Size the image to fit the viewport at scale 1.
  function fit() {
    const vw = viewport.clientWidth, vh = viewport.clientHeight;
    const nw = img.naturalWidth, nh = img.naturalHeight;
    if (!nw || !nh || !vw || !vh) return;
    const s = Math.min(vw / nw, vh / nh);
    baseW = nw * s; baseH = nh * s;
    img.style.width = baseW + 'px';
    img.style.height = baseH + 'px';
    scale = 1; clamp(); apply();
  }

  // Zoom toward a focal point given in client (viewport) coordinates.
  function zoomTo(newScale, cx, cy) {
    const rect = viewport.getBoundingClientRect();
    newScale = Math.min(MAX, Math.max(MIN, newScale));
    if (cx == null) { cx = rect.left + rect.width / 2; cy = rect.top + rect.height / 2; }
    const px = (cx - rect.left - tx) / scale;
    const py = (cy - rect.top - ty) / scale;
    scale = newScale;
    tx = cx - rect.left - px * scale;
    ty = cy - rect.top - py * scale;
    clamp(); apply();
  }
  function zoomBy(f, cx, cy) { zoomTo(scale * f, cx, cy); }

  // ----- gesture handling -----
  const pts = new Map();
  let last = null, startDist = 0, startScale = 1;
  let moved = false, pinched = false;

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  viewport.addEventListener('pointerdown', (e) => {
    if (pts.size === 0) { moved = false; pinched = false; }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) {
      last = { x: e.clientX, y: e.clientY };
    } else if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      startDist = dist(a, b); startScale = scale;
    }
    viewport.setPointerCapture && viewport.setPointerCapture(e.pointerId);
  });

  viewport.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pts.size >= 2) {
      pinched = true;
      const [a, b] = [...pts.values()];
      if (startDist > 0) {
        const m = mid(a, b);
        zoomTo(startScale * dist(a, b) / startDist, m.x, m.y);
      }
    } else if (pts.size === 1) {
      const dx = e.clientX - last.x, dy = e.clientY - last.y;
      if (Math.abs(dx) > TAP_MOVE || Math.abs(dy) > TAP_MOVE) moved = true;
      if (scale > 1) { tx += dx; ty += dy; last = { x: e.clientX, y: e.clientY }; clamp(); apply(); }
      else last = { x: e.clientX, y: e.clientY };
    }
  });

  function onUp(e) {
    if (!pts.has(e.pointerId)) return;
    const x = e.clientX, y = e.clientY;
    pts.delete(e.pointerId);
    if (pts.size === 0) {
      if (!moved && !pinched && onTap) onTap(x, y); // it was a tap → find
    } else if (pts.size === 1) {
      const p = [...pts.values()][0];
      last = { x: p.x, y: p.y };
      startDist = 0;
    }
  }
  viewport.addEventListener('pointerup', onUp);
  viewport.addEventListener('pointercancel', onUp);

  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX, e.clientY);
  }, { passive: false });

  window.addEventListener('resize', () => fit());

  return {
    fit,
    zoomIn: () => zoomBy(1.5),
    zoomOut: () => zoomBy(1 / 1.5),
    reset: () => { scale = 1; clamp(); apply(); },
    getScale: () => scale,
  };
};
