'use strict';

// Reusable rectangle-marking tool for defining hidden objects on an image.
// Works with mouse and touch via Pointer Events, and supports zooming in for
// precise selection: zoom buttons, Ctrl/Cmd+wheel, and two-finger pinch.
// Panning while zoomed in uses the surrounding container's native scrolling,
// so a single-finger drag stays reserved for drawing a box.
//
//   const tool = createMarkerTool({ stage, img, list, count });
//   tool.getObjects();           // -> [{ label, x, y, w, h }]  (normalized 0..1)
//   tool.setObjects(existing);   // load existing marks
//   tool.clear();
//   tool.fit();                  // reset zoom to fit the container (call after a new image loads)
//   tool.zoomIn(); tool.zoomOut(); tool.zoomReset();
window.createMarkerTool = function ({ stage, img, list, count, wrap }) {
  const container = wrap || stage.parentElement;
  const MIN_SCALE = 1, MAX_SCALE = 6;

  let objects = [];
  let drawing = null;
  let scale = 1;
  let baseWidth = 0;

  function render() {
    if (count) count.textContent = objects.length;

    // Draw boxes over the image.
    stage.querySelectorAll('.obj-box').forEach((n) => n.remove());
    objects.forEach((o, i) => {
      const box = document.createElement('div');
      box.className = 'obj-box';
      Object.assign(box.style, {
        left: o.x * 100 + '%', top: o.y * 100 + '%',
        width: o.w * 100 + '%', height: o.h * 100 + '%',
      });
      box.innerHTML = `<span class="obj-index">${i + 1}</span>`;
      stage.appendChild(box);
    });

    if (!list) return;
    list.innerHTML = '';
    if (!objects.length) {
      list.innerHTML = '<li class="hint" style="justify-content:flex-start;">No objects marked yet.</li>';
      return;
    }
    objects.forEach((o, i) => {
      const li = document.createElement('li');

      const fields = document.createElement('div');
      fields.className = 'obj-fields';
      fields.innerHTML = `<strong class="obj-num">#${i + 1}</strong>`;

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.placeholder = 'Optional name (shown on the marker once found)';
      nameInput.value = o.label || '';
      nameInput.addEventListener('input', () => { o.label = nameInput.value; });

      const hintInput = document.createElement('input');
      hintInput.type = 'text';
      hintInput.placeholder = 'Optional hint (shown to players who ask)';
      hintInput.value = o.hint || '';
      hintInput.addEventListener('input', () => { o.hint = hintInput.value; });

      fields.appendChild(nameInput);
      fields.appendChild(hintInput);

      const del = document.createElement('button');
      del.className = 'del';
      del.textContent = '✕ Remove';
      del.addEventListener('click', () => { objects.splice(i, 1); render(); });

      li.appendChild(fields);
      li.appendChild(del);
      list.appendChild(li);
    });
  }

  // ---------- zoom ----------

  function computeBaseWidth() {
    const nw = img.naturalWidth;
    if (!nw) return;
    const containerWidth = container.clientWidth || nw;
    baseWidth = Math.min(nw, containerWidth);
  }

  function applyScale() {
    if (!baseWidth) return;
    img.style.maxWidth = 'none';
    img.style.width = Math.round(baseWidth * scale) + 'px';
    img.style.height = 'auto';
  }

  // Zoom while keeping the given viewport point visually anchored, by
  // resizing the image (so the container's native scroll can pan it) and
  // compensating scroll position for the size change.
  function zoomTo(newScale, clientX, clientY) {
    newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, newScale));
    if (newScale === scale) return;
    const rect = container.getBoundingClientRect();
    if (clientX == null) { clientX = rect.left + rect.width / 2; clientY = rect.top + rect.height / 2; }
    const beforeX = container.scrollLeft + (clientX - rect.left);
    const beforeY = container.scrollTop + (clientY - rect.top);
    const ratio = newScale / scale;
    scale = newScale;
    applyScale();
    container.scrollLeft = beforeX * ratio - (clientX - rect.left);
    container.scrollTop = beforeY * ratio - (clientY - rect.top);
  }

  function fit() {
    computeBaseWidth();
    scale = 1;
    applyScale();
  }

  img.addEventListener('load', fit);
  window.addEventListener('resize', () => { computeBaseWidth(); applyScale(); });

  // Desktop: hold Ctrl/Cmd + wheel to zoom (matches the trackpad-pinch
  // convention); plain wheel scrolls the container normally, so panning a
  // zoomed-in image still works without a modifier.
  container.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    zoomTo(scale * (e.deltaY < 0 ? 1.2 : 1 / 1.2), e.clientX, e.clientY);
  }, { passive: false });

  // ---------- drawing + pinch-to-zoom ----------
  // A single active pointer draws a box (existing behavior). A second pointer
  // cancels any in-progress box and switches to pinch-zoom until pointers lift.

  const pts = new Map();
  let pinchDist = 0, pinchScale = 1;

  function norm(e) {
    const r = img.getBoundingClientRect();
    return {
      x: Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1),
      y: Math.min(Math.max((e.clientY - r.top) / r.height, 0), 1),
    };
  }
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  function cancelDraw() {
    if (!drawing) return;
    drawing.el.remove();
    drawing = null;
  }

  img.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) {
      const p = norm(e);
      const el = document.createElement('div');
      el.className = 'draw-box';
      stage.appendChild(el);
      drawing = { sx: p.x, sy: p.y, el, box: null };
    } else if (pts.size === 2) {
      cancelDraw();
      const [a, b] = [...pts.values()];
      pinchDist = dist(a, b);
      pinchScale = scale;
    }
  });

  window.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pts.size >= 2) {
      const [a, b] = [...pts.values()];
      if (pinchDist > 0) {
        const m = mid(a, b);
        zoomTo(pinchScale * dist(a, b) / pinchDist, m.x, m.y);
      }
      return;
    }
    if (!drawing) return;
    const p = norm(e);
    const x = Math.min(drawing.sx, p.x);
    const y = Math.min(drawing.sy, p.y);
    const w = Math.abs(p.x - drawing.sx);
    const h = Math.abs(p.y - drawing.sy);
    Object.assign(drawing.el.style, {
      left: x * 100 + '%', top: y * 100 + '%',
      width: w * 100 + '%', height: h * 100 + '%',
    });
    drawing.box = { x, y, w, h };
  });

  function finishDraw() {
    if (!drawing) return;
    const box = drawing.box;
    drawing.el.remove();
    drawing = null;
    if (box && box.w > 0.01 && box.h > 0.01) {
      objects.push({ label: '', hint: '', ...box });
      render();
    }
  }

  function onPointerUp(e) {
    pts.delete(e.pointerId);
    if (pts.size === 0) {
      pinchDist = 0;
      finishDraw();
    } else if (pts.size === 1) {
      // Dropped from a pinch to one finger — don't resume drawing mid-gesture.
      pinchDist = 0;
    }
  }
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);

  return {
    getObjects: () => objects,
    setObjects: (arr) => {
      objects = (arr || []).map((o) => ({
        label: o.label || '', hint: o.hint || '', x: o.x, y: o.y, w: o.w, h: o.h,
      }));
      render();
    },
    clear: () => { objects = []; render(); },
    render,
    fit,
    zoomIn: () => zoomTo(scale * 1.5),
    zoomOut: () => zoomTo(scale / 1.5),
    zoomReset: () => zoomTo(1),
  };
};
