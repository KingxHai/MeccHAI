'use strict';

// Reusable rectangle-marking tool for defining hidden objects on an image.
// Works with mouse and touch via Pointer Events.
//
//   const tool = createMarkerTool({ stage, img, list, count });
//   tool.getObjects();           // -> [{ label, x, y, w, h }]  (normalized 0..1)
//   tool.setObjects(existing);   // load existing marks
//   tool.clear();
window.createMarkerTool = function ({ stage, img, list, count }) {
  let objects = [];
  let drawing = null;

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
      nameInput.placeholder = 'Optional name (only you see this)';
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

  function norm(e) {
    const r = img.getBoundingClientRect();
    return {
      x: Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1),
      y: Math.min(Math.max((e.clientY - r.top) / r.height, 0), 1),
    };
  }

  img.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const p = norm(e);
    const el = document.createElement('div');
    el.className = 'draw-box';
    stage.appendChild(el);
    drawing = { sx: p.x, sy: p.y, el, box: null };
  });

  window.addEventListener('pointermove', (e) => {
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
  window.addEventListener('pointerup', finishDraw);
  window.addEventListener('pointercancel', finishDraw);

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
  };
};
