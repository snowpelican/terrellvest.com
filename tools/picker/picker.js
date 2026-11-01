// Photo picker. Browse the photo folder as a tree, and click photos to add them to the open collection.
// Every change saves to _src/photography/collections.json through serve.py. "Update gallery" runs update_gallery.py.
const $ = (id) => document.getElementById(id);
const PREFS = 'picker.prefs';
const state = { root: '', dir: '', photos: [], collections: [], active: 0, viewing: -1 };
let saveTimer = 0, dragFrom = -1;

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function photoUrl(file, size) {
  return `/api/photo?size=${size}&path=${encodeURIComponent(file)}`;
}

function baseName(path) {
  return path.split('/').pop();
}

function activeCollection() {
  return state.collections[state.active];
}

function positionIn(collection, file) {
  return collection ? collection.photos.findIndex((p) => p.file === file) : -1;
}

async function getJson(url) {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) throw new Error(body && body.error || res.statusText);
  return body;
}

function remember() {
  try { localStorage.setItem(PREFS, JSON.stringify({ dir: state.dir, active: state.active })); } catch {}
}

function recall() {
  try { return JSON.parse(localStorage.getItem(PREFS)) || {}; } catch { return {}; }
}

function treeNode(dir) {
  const li = el('li', { role: 'treeitem' });
  const caret = el('span', { className: 'caret', textContent: '▸' });
  const label = el('button', { title: dir || state.root }, caret, dir ? baseName(dir) : 'Fenrose');
  label.dataset.dir = dir;
  label.onclick = () => toggleNode(li, caret, dir);
  li.append(label);
  return li;
}

async function toggleNode(li, caret, dir) {
  await openFolder(dir);
  const kids = li.querySelector(':scope > ul');
  if (kids) {
    kids.hidden = !kids.hidden;
    caret.textContent = kids.hidden ? '▸' : '▾';
    return;
  }
  const { folders } = await getJson(`/api/list?dir=${encodeURIComponent(dir)}`);
  li.append(el('ul', { role: 'group' }, ...folders.map(treeNode)));
  caret.textContent = folders.length ? '▾' : '·';
}

async function openFolder(dir) {
  try {
    state.photos = (await getJson(`/api/list?dir=${encodeURIComponent(dir)}`)).photos;
  } catch (err) {
    $('gridNote').textContent = `Could not open the folder (${err.message}). Is serve.py running?`;
    return;
  }
  state.dir = dir;
  remember();
  for (const b of document.querySelectorAll('.tree button')) b.classList.toggle('here', b.dataset.dir === dir);
  showGrid();
}

function showGrid() {
  const n = state.photos.length;
  $('grid').replaceChildren(...state.photos.map(photoTile));
  $('gridNote').textContent = `${state.dir || 'Fenrose'}: ` + (n ? `${n} photo${n === 1 ? '' : 's'}` : 'no photos here. Open a subfolder.');
  markTiles();
}

function photoTile(file, i) {
  const li = el('li', { className: 'tile', tabIndex: 0, title: file },
    el('img', { loading: 'lazy', alt: baseName(file), src: photoUrl(file, 'thumb') }),
    el('span', { className: 'name', textContent: baseName(file) }),
    el('span', { className: 'chips' }));
  const zoom = el('button', { className: 'zoom', textContent: '⤢', title: 'View large (Enter)' });
  zoom.onclick = (e) => { e.stopPropagation(); openViewer(i); };
  li.append(zoom);
  li.dataset.file = file;
  li.onclick = () => togglePhoto(file);
  li.onkeydown = (e) => {
    if (state.viewing >= 0) return;
    if (e.key === ' ') { e.preventDefault(); togglePhoto(file); }
    if (e.key === 'Enter') openViewer(i);
  };
  return li;
}

function markTiles() {
  for (const tile of $('grid').children) {
    const file = tile.dataset.file;
    const n = positionIn(activeCollection(), file);
    tile.classList.toggle('picked', n >= 0);
    tile.dataset.n = n + 1;
    const names = state.collections.filter((c) => positionIn(c, file) >= 0).map((c) => c.name);
    tile.querySelector('.chips').replaceChildren(...names.map((name) => el('span', { textContent: name })));
  }
}

function togglePhoto(file) {
  const collection = activeCollection();
  if (!collection) return alert('Make a collection first.');
  const n = positionIn(collection, file);
  if (n >= 0) collection.photos.splice(n, 1);
  else collection.photos.push({ file, title: '', place: '' });
  changed();
}

function changed() {
  markTiles();
  showCollections();
  showViewer();
  saveSoon();
}

function showCollections() {
  $('collections').replaceChildren(...state.collections.map(collectionBox));
}

function collectionBox(collection, ci) {
  const open = ci === state.active;
  const name = el('input', { value: collection.name, title: 'Collection name', className: 'cname' });
  name.oninput = () => { collection.name = name.value.trim(); markTiles(); saveSoon(); };
  const head = el('div', { className: 'chead' },
    el('button', { className: 'icon', textContent: open ? '▾' : '▸', title: open ? 'Open' : 'Open this collection', onclick: () => setActive(ci) }),
    name,
    el('span', { className: 'muted', textContent: collection.photos.length }),
    el('button', { className: 'icon', textContent: '×', title: 'Delete this collection', onclick: () => deleteCollection(ci) }));
  const box = el('section', { className: open ? 'collection open' : 'collection' }, head);
  if (open) box.append(el('ol', {}, ...collection.photos.map((photo, i) => photoRow(collection, photo, i))));
  return box;
}

function photoRow(collection, photo, i) {
  const last = collection.photos.length - 1;
  const li = el('li', { className: 'photo', draggable: true },
    el('img', { loading: 'lazy', alt: '', src: photoUrl(photo.file, 'thumb'), title: 'Drag to move' }),
    el('div', { className: 'fields' },
      el('div', { className: 'path', textContent: `${i + 1}. ${photo.file}`, title: photo.file }),
      textField(photo, 'title', baseName(photo.file).replace(/\.[^.]+$/, '')),
      textField(photo, 'place', 'Place')),
    el('div', { className: 'tools' },
      toolButton('↑', 'Move up', () => movePhoto(collection, i, i - 1), i === 0),
      toolButton('↓', 'Move down', () => movePhoto(collection, i, i + 1), i === last),
      toolButton('×', 'Take out', () => togglePhoto(photo.file))));
  addDrag(li, collection, i);
  return li;
}

function textField(photo, key, placeholder) {
  const input = el('input', { value: photo[key] || '', placeholder, title: key[0].toUpperCase() + key.slice(1) });
  input.oninput = () => { photo[key] = input.value.trim(); saveSoon(); };
  return input;
}

function toolButton(label, title, action, disabled = false) {
  const b = el('button', { textContent: label, title, disabled, onclick: action });
  b.setAttribute('aria-label', title);
  return b;
}

function movePhoto(collection, from, to) {
  if (to < 0 || to >= collection.photos.length || from === to) return;
  collection.photos.splice(to, 0, collection.photos.splice(from, 1)[0]);
  changed();
}

function addDrag(li, collection, i) {
  li.ondragstart = (e) => {
    if (e.target.tagName === 'INPUT') return e.preventDefault();
    dragFrom = i;
    li.classList.add('dragging');
  };
  li.ondragend = () => li.classList.remove('dragging');
  li.ondragover = (e) => { e.preventDefault(); li.classList.add('over'); };
  li.ondragleave = () => li.classList.remove('over');
  li.ondrop = (e) => { e.preventDefault(); movePhoto(collection, dragFrom, i); };
}

function setActive(ci) {
  state.active = ci;
  remember();
  markTiles();
  showCollections();
  showViewer();
}

function addCollection() {
  const name = prompt('Name of the new collection:');
  if (!name || !name.trim()) return;
  state.collections.push({ name: name.trim(), photos: [] });
  state.active = state.collections.length - 1;
  remember();
  changed();
}

function deleteCollection(ci) {
  const c = state.collections[ci];
  if (c.photos.length && !confirm(`Delete "${c.name}" and its ${c.photos.length} chosen photos? The photo files stay as they are.`)) return;
  state.collections.splice(ci, 1);
  state.active = Math.min(state.active, Math.max(0, state.collections.length - 1));
  remember();
  changed();
}

function openViewer(i) {
  state.viewing = i;
  $('viewer').hidden = false;
  showViewer();
}

function showViewer() {
  if (state.viewing < 0) return;
  const file = state.photos[state.viewing];
  const collection = activeCollection();
  const picked = positionIn(collection, file) >= 0;
  $('viewerImg').src = photoUrl(file, 'large');
  $('viewerName').textContent = `${baseName(file)}  ·  ${state.viewing + 1} of ${state.photos.length}`;
  $('viewerPick').textContent = collection ? (picked ? `In ${collection.name} ✓` : `Add to ${collection.name}`) : 'No collection';
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
    ' ': () => togglePhoto(state.photos[state.viewing]) };
  if (!keys[e.key]) return;
  e.preventDefault();
  keys[e.key]();
}

function saveSoon() {
  $('saveState').textContent = 'Saving…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 300);
}

async function save() {
  const body = JSON.stringify({ collections: state.collections });
  try {
    const res = await fetch('/api/collections', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    if (!res.ok) throw new Error((await res.json()).error || res.statusText);
    $('saveState').textContent = `Saved at ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  } catch (err) {
    $('saveState').textContent = `Not saved (${err.message}). Is serve.py running?`;
  }
}

async function updateGallery() {
  clearTimeout(saveTimer);
  await save();
  $('update').disabled = true;
  $('updateClose').disabled = true;
  $('updateText').textContent = 'Updating… each photo takes a second or two.';
  $('updateLog').showModal();
  try {
    const res = await fetch('/api/update', { method: 'POST' });
    const body = await res.json();
    $('updateText').textContent = res.ok
      ? `${body.log}\n\nlayouts.js names photos by number. The numbers follow the order of the collections here.`
      : `The update failed. The gallery is unchanged.\n\n${body.error}`;
  } catch (err) {
    $('updateText').textContent = `The update failed: ${err.message}`;
  }
  $('update').disabled = false;
  $('updateClose').disabled = false;
}

async function start() {
  const { root, saved } = await getJson('/api/collections');
  const prefs = recall();
  state.root = root;
  state.collections = saved && saved.collections || [{ name: 'Work', photos: [] }];
  state.active = Math.min(prefs.active || 0, state.collections.length - 1);
  $('root').textContent = root;
  $('tree').append(treeNode(''));
  $('addCollection').onclick = addCollection;
  $('viewerPrev').onclick = () => stepViewer(-1);
  $('viewerNext').onclick = () => stepViewer(1);
  $('viewerClose').onclick = closeViewer;
  $('viewerPick').onclick = () => togglePhoto(state.photos[state.viewing]);
  $('update').onclick = updateGallery;
  document.addEventListener('keydown', viewerKeys);
  showCollections();
  await $('tree').querySelector('button').onclick();
  if (prefs.dir) openFolder(prefs.dir);
}

start();
