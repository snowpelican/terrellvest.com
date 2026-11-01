// Photo picker. Browse the photo folder, click photos to pick them, and set their order and credits.
// The picks save to tools/picker/selection.json through serve.py. "Build gallery" runs optimize.py on them.
const $ = (id) => document.getElementById(id);
const PREFS = 'picker.prefs';
const DEFAULT_COLLECTION = 'Work';
const state = { dir: '', folders: [], photos: [], picks: [], viewing: -1 };
let saveTimer = 0, dragFrom = -1;

function photoUrl(path, size) {
  return `/api/photo?size=${size}&path=${encodeURIComponent(path)}`;
}

function baseName(path) {
  return path.split('/').pop();
}

function pickIndex(path) {
  return state.picks.findIndex((p) => p.path === path);
}

async function getJson(url) {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) throw new Error(body && body.error || res.statusText);
  return body;
}

async function openFolder(dir) {
  try {
    Object.assign(state, await getJson(`/api/list?dir=${encodeURIComponent(dir)}`));
  } catch (err) {
    if (dir) return openFolder('');
    $('gridNote').textContent = `Could not open the folder (${err.message}). Is serve.py running?`;
    return;
  }
  try { localStorage.setItem(PREFS, JSON.stringify({ dir: state.dir })); } catch {}
  showCrumbs();
  showFolders();
  showGrid();
}

function showCrumbs() {
  const parts = state.dir ? state.dir.split('/') : [];
  const nav = $('crumbs');
  nav.replaceChildren();
  ['Photos', ...parts].forEach((name, i) => {
    if (i) nav.append(Object.assign(document.createElement('span'), { textContent: '/' }));
    const b = Object.assign(document.createElement('button'), { textContent: name });
    b.onclick = () => openFolder(parts.slice(0, i).join('/'));
    nav.append(b);
  });
}

function showFolders() {
  const list = $('folderList');
  list.replaceChildren();
  if (state.dir) list.append(folderItem('↑ Up', state.dir.split('/').slice(0, -1).join('/')));
  for (const name of state.folders) list.append(folderItem(`▸ ${name}`, state.dir ? `${state.dir}/${name}` : name));
}

function folderItem(label, dir) {
  const li = document.createElement('li');
  const b = Object.assign(document.createElement('button'), { textContent: label, title: dir || 'Photos' });
  b.onclick = () => openFolder(dir);
  li.append(b);
  return li;
}

function showGrid() {
  const grid = $('grid');
  grid.replaceChildren(...state.photos.map(photoTile));
  const n = state.photos.length;
  $('gridNote').textContent = n ? `${n} photo${n === 1 ? '' : 's'} in this folder` : 'No photos in this folder. Open a subfolder.';
  markPicked();
}

function photoTile(path, i) {
  const li = Object.assign(document.createElement('li'), { className: 'tile', tabIndex: 0, title: path });
  li.dataset.path = path;
  const img = Object.assign(document.createElement('img'), { loading: 'lazy', alt: baseName(path), src: photoUrl(path, 'thumb') });
  const name = Object.assign(document.createElement('span'), { className: 'name', textContent: baseName(path) });
  const zoom = Object.assign(document.createElement('button'), { className: 'zoom', textContent: '⤢', title: 'View large' });
  zoom.onclick = (e) => { e.stopPropagation(); openViewer(i); };
  li.append(img, name, zoom);
  li.onclick = () => togglePick(path);
  li.ondblclick = () => openViewer(i);
  li.onkeydown = (e) => {
    if (state.viewing >= 0) return;
    if (e.key === ' ') { e.preventDefault(); togglePick(path); }
    if (e.key === 'Enter') openViewer(i);
  };
  return li;
}

function markPicked() {
  for (const tile of $('grid').children) {
    const n = pickIndex(tile.dataset.path);
    tile.classList.toggle('picked', n >= 0);
    tile.dataset.n = n + 1;
  }
}

function togglePick(path) {
  const n = pickIndex(path);
  if (n >= 0) state.picks.splice(n, 1);
  else state.picks.push({ path, title: '', place: '', collection: lastCollection() });
  changed();
}

function lastCollection() {
  const last = state.picks[state.picks.length - 1];
  return last ? last.collection : DEFAULT_COLLECTION;
}

function changed() {
  markPicked();
  showPicks();
  showViewer();
  saveSoon();
}

function showPicks() {
  $('pickCount').textContent = `(${state.picks.length})`;
  $('pickList').replaceChildren(...state.picks.map(pickRow));
}

function pickRow(pick, i) {
  const li = Object.assign(document.createElement('li'), { className: 'pick', draggable: true });
  const img = Object.assign(document.createElement('img'), { loading: 'lazy', alt: '', src: photoUrl(pick.path, 'thumb'), title: 'Drag to move' });
  const fields = Object.assign(document.createElement('div'), { className: 'fields' });
  fields.append(
    Object.assign(document.createElement('div'), { className: 'path', textContent: `${i + 1}. ${pick.path}`, title: pick.path }),
    textField(pick, 'title', baseName(pick.path).replace(/\.[^.]+$/, '')),
    textField(pick, 'place', 'Place'),
    textField(pick, 'collection', DEFAULT_COLLECTION),
  );
  const tools = Object.assign(document.createElement('div'), { className: 'tools' });
  tools.append(
    toolButton('↑', 'Move up', () => movePick(i, i - 1), i === 0),
    toolButton('↓', 'Move down', () => movePick(i, i + 1), i === state.picks.length - 1),
    toolButton('×', 'Take out', () => togglePick(pick.path)),
  );
  li.append(img, fields, tools);
  addDrag(li, i);
  return li;
}

function textField(pick, key, placeholder) {
  const input = Object.assign(document.createElement('input'), { value: pick[key] || '', placeholder, title: key[0].toUpperCase() + key.slice(1) });
  if (key === 'collection') input.setAttribute('list', 'collections');
  input.oninput = () => { pick[key] = input.value.trim(); saveSoon(); };
  input.onchange = showCollections;
  return input;
}

function toolButton(label, title, action, disabled = false) {
  const b = Object.assign(document.createElement('button'), { textContent: label, title, disabled });
  b.setAttribute('aria-label', title);
  b.onclick = action;
  return b;
}

function showCollections() {
  const names = new Set([DEFAULT_COLLECTION, ...state.picks.map((p) => p.collection).filter(Boolean)]);
  let list = $('collections');
  if (!list) document.body.append(list = Object.assign(document.createElement('datalist'), { id: 'collections' }));
  list.replaceChildren(...[...names].map((value) => Object.assign(document.createElement('option'), { value })));
}

function movePick(from, to) {
  if (to < 0 || to >= state.picks.length || from === to) return;
  state.picks.splice(to, 0, state.picks.splice(from, 1)[0]);
  changed();
}

function addDrag(li, i) {
  li.ondragstart = (e) => {
    if (e.target.tagName === 'INPUT') return e.preventDefault();
    dragFrom = i;
    li.classList.add('dragging');
  };
  li.ondragend = () => li.classList.remove('dragging');
  li.ondragover = (e) => { e.preventDefault(); li.classList.add('over'); };
  li.ondragleave = () => li.classList.remove('over');
  li.ondrop = (e) => { e.preventDefault(); movePick(dragFrom, i); };
}

function openViewer(i) {
  state.viewing = i;
  $('viewer').hidden = false;
  showViewer();
}

function showViewer() {
  if (state.viewing < 0) return;
  const path = state.photos[state.viewing];
  const picked = pickIndex(path) >= 0;
  $('viewerImg').src = photoUrl(path, 'large');
  $('viewerName').textContent = `${baseName(path)}  ·  ${state.viewing + 1} of ${state.photos.length}`;
  $('viewerPick').textContent = picked ? 'Picked ✓' : 'Pick';
  $('viewerPick').classList.toggle('on', picked);
}

function stepViewer(by) {
  const n = state.photos.length;
  state.viewing = (state.viewing + by + n) % n;
  showViewer();
}

function closeViewer() {
  state.viewing = -1;
  $('viewer').hidden = true;
  $('viewerImg').removeAttribute('src');
}

function viewerKeys(e) {
  if (state.viewing < 0) return;
  const keys = { ArrowLeft: () => stepViewer(-1), ArrowRight: () => stepViewer(1), Escape: closeViewer,
    ' ': () => togglePick(state.photos[state.viewing]) };
  if (!keys[e.key]) return;
  e.preventDefault();
  keys[e.key]();
}

function saveSoon() {
  $('saveState').textContent = 'Saving…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 400);
}

async function save() {
  const body = JSON.stringify({ photos: state.picks, saved: new Date().toISOString() });
  try {
    const res = await fetch('/api/selection', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    if (!res.ok) throw new Error((await res.json()).error || res.statusText);
    $('saveState').textContent = `Saved at ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  } catch (err) {
    $('saveState').textContent = `Not saved (${err.message}). Is serve.py running?`;
  }
}

async function buildGallery() {
  if (!state.picks.length) return alert('Pick some photos first.');
  if (!confirm(`Replace the gallery's photos with these ${state.picks.length} picks?`)) return;
  clearTimeout(saveTimer);
  await save();
  $('build').disabled = true;
  $('buildText').textContent = 'Building… this takes a few seconds for each photo.';
  $('buildLog').showModal();
  try {
    const res = await fetch('/api/build', { method: 'POST' });
    const body = await res.json();
    $('buildText').textContent = res.ok ? `${body.log}\n\nCheck layouts.js: its pages name photos by number, and the numbers follow the order here.` : `Build failed:\n${body.error}`;
  } catch (err) {
    $('buildText').textContent = `Build failed: ${err.message}`;
  }
  $('build').disabled = false;
}

async function start() {
  const saved = await getJson('/api/selection').catch(() => null);
  state.picks = saved && saved.photos || [];
  let dir = '';
  try { dir = (JSON.parse(localStorage.getItem(PREFS)) || {}).dir || ''; } catch {}
  showCollections();
  showPicks();
  $('viewerPrev').onclick = () => stepViewer(-1);
  $('viewerNext').onclick = () => stepViewer(1);
  $('viewerClose').onclick = closeViewer;
  $('viewerPick').onclick = () => togglePick(state.photos[state.viewing]);
  $('build').onclick = buildGallery;
  document.addEventListener('keydown', viewerKeys);
  openFolder(dir);
}

start();
