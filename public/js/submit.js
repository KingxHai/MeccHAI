'use strict';

const submitter = localStorage.getItem('nickname') || '';

const els = {
  name: document.getElementById('levelName'),
  fileInput: document.getElementById('fileInput'),
  uploadBtn: document.getElementById('uploadBtn'),
  uploadMsg: document.getElementById('uploadMsg'),
  emptyState: document.getElementById('emptyState'),
  stage: document.getElementById('stage'),
  img: document.getElementById('markImage'),
  objCount: document.getElementById('objCount'),
  objList: document.getElementById('objList'),
  submitBtn: document.getElementById('submitBtn'),
  clearBtn: document.getElementById('clearBtn'),
  submitMsg: document.getElementById('submitMsg'),
};

let imageUrl = '';
const tool = createMarkerTool({
  stage: els.stage, img: els.img, list: els.objList, count: els.objCount,
});
tool.render();

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
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed.');
    imageUrl = data.imageUrl;
    tool.clear();
    els.img.src = imageUrl;
    els.stage.style.display = 'inline-block';
    els.emptyState.style.display = 'none';
    els.uploadMsg.textContent = 'Uploaded! Now drag rectangles over the hidden objects.';
    els.uploadMsg.className = 'msg ok';
  } catch (err) {
    els.uploadMsg.textContent = err.message;
    els.uploadMsg.className = 'msg error';
  }
});

els.clearBtn.addEventListener('click', () => {
  if (tool.getObjects().length && confirm('Remove all marked objects?')) tool.clear();
});

els.submitBtn.addEventListener('click', async () => {
  const name = els.name.value.trim();
  const objects = tool.getObjects();
  if (!name) { els.submitMsg.textContent = 'Please name your level.'; els.submitMsg.className = 'msg error'; return; }
  if (!imageUrl) { els.submitMsg.textContent = 'Upload an image first.'; els.submitMsg.className = 'msg error'; return; }
  if (!objects.length) { els.submitMsg.textContent = 'Mark at least one hidden object.'; els.submitMsg.className = 'msg error'; return; }

  els.submitMsg.textContent = 'Submitting…';
  els.submitMsg.className = 'msg';
  try {
    const res = await fetch('/api/levels/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, imageUrl, objects, submitter }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Submit failed.');
    els.submitBtn.disabled = true;
    els.clearBtn.disabled = true;
    els.submitMsg.innerHTML = '✅ Submitted! An admin will review your level. <a href="/browse.html">Back to levels</a>';
    els.submitMsg.className = 'msg ok';
  } catch (err) {
    els.submitMsg.textContent = err.message;
    els.submitMsg.className = 'msg error';
  }
});
