# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow"]
# ///
"""Browse a folder of photos, pick the ones for the gallery, and build the gallery from them.

Usage: uv run tools/picker/serve.py [--port 8094] [--root PHOTO_FOLDER]
Then open http://localhost:8094/picker/
The picks save to tools/picker/selection.json. The Build button runs optimize.py on them
and copies the result into _dist/photography/. The server answers only this machine.
"""
import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from PIL import Image, ImageOps

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
SITE = REPO / '_dist'
GALLERY = SITE / 'photography'
OPTIMIZE = REPO / '_src' / 'photography' / 'optimize.py'
SELECTION = HERE / 'selection.json'
THUMBS = HERE / '.thumbs'
MOUNT = '/picker'
IMAGES = ('.jpg', '.jpeg', '.png', '.webp')
# Lightroom keeps its catalog and previews in folders with these endings; they hold no photos to pick
HIDDEN_ENDINGS = ('.lrdata', '.lrcat-data')
SIZES = {'thumb': 480, 'large': 2000}
MAX_BODY = 4 * 1024 * 1024
ROOT = Path.home() / 'Pictures' / 'Fenrose'


def inside_root(rel):
    """Return the absolute path for a path relative to ROOT, or None if it points outside ROOT."""
    path = (ROOT / (rel or '')).resolve()
    return path if path == ROOT or ROOT in path.parents else None


def list_folder(folder):
    """List the subfolders and the photos in one folder, sorted by name."""
    folders, photos = [], []
    for entry in sorted(folder.iterdir(), key=lambda p: p.name.lower()):
        if entry.name.startswith('.') or entry.name.endswith(HIDDEN_ENDINGS):
            continue
        if entry.is_dir():
            folders.append(entry.name)
        elif entry.suffix.lower() in IMAGES:
            photos.append(entry.relative_to(ROOT).as_posix())
    rel = '' if folder == ROOT else folder.relative_to(ROOT).as_posix()
    return {'dir': rel, 'folders': folders, 'photos': photos}


def preview(photo, size):
    """Return a cached JPEG of the photo, at most size pixels on its long side."""
    stamp = f'{photo}|{photo.stat().st_mtime_ns}|{size}'
    cached = THUMBS / (hashlib.sha1(stamp.encode()).hexdigest() + '.jpg')
    if not cached.exists():
        THUMBS.mkdir(exist_ok=True)
        with Image.open(photo) as img:
            img.draft('RGB', (size, size))
            small = ImageOps.exif_transpose(img).convert('RGB')
            small.thumbnail((size, size), Image.LANCZOS)
            small.save(cached, quality=82)
    return cached.read_bytes()


def build():
    """Run optimize.py on the saved picks and copy its output into the gallery. Return the log text."""
    run = subprocess.run([sys.executable, str(OPTIMIZE), str(SELECTION)], capture_output=True, text=True)
    if run.returncode:
        raise RuntimeError(run.stderr.strip() or run.stdout.strip())
    made = OPTIMIZE.parent
    shutil.rmtree(GALLERY / 'p', ignore_errors=True)
    shutil.copytree(made / 'p', GALLERY / 'p')
    shutil.copy2(made / 'photos.js', GALLERY / 'photos.js')
    return run.stdout.strip() + f' copied to {GALLERY}'


class Handler(SimpleHTTPRequestHandler):
    """Serves /picker/ from this folder, the photo and selection APIs, and every other path from _dist."""

    def translate_path(self, path):
        """Map a URL path to a file in this folder or in _dist."""
        inside = path == MOUNT or path.startswith(MOUNT + '/')
        self.directory = str(HERE if inside else SITE)
        return super().translate_path(path[len(MOUNT):] if inside else path)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_GET(self):
        url = urlsplit(self.path)
        query = {k: v[0] for k, v in parse_qs(url.query).items()}
        routes = {'/api/config': self.send_config, '/api/list': self.send_list,
                  '/api/photo': self.send_photo, '/api/selection': self.send_selection}
        if url.path not in routes:
            return super().do_GET()
        try:
            routes[url.path](query)
        except (OSError, ValueError) as err:
            self.reply(400, {'error': str(err)})

    def do_POST(self):
        path = urlsplit(self.path).path
        if path == '/api/build':
            try:
                return self.reply(200, {'log': build()})
            except (OSError, RuntimeError) as err:
                return self.reply(500, {'error': str(err)})
        if path != '/api/selection':
            return self.reply(404, {'error': 'Not found'})
        size = int(self.headers.get('Content-Length') or 0)
        if not 0 < size <= MAX_BODY:
            return self.reply(413, {'error': 'The selection is empty or too large'})
        try:
            selection = json.loads(self.rfile.read(size))
        except json.JSONDecodeError as err:
            return self.reply(400, {'error': f'Not valid JSON: {err}'})
        selection['root'] = ROOT.as_posix()
        SELECTION.write_text(json.dumps(selection, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
        self.reply(200, {'saved': str(SELECTION)})

    def send_config(self, query):
        self.reply(200, {'root': str(ROOT)})

    def send_list(self, query):
        folder = inside_root(query.get('dir'))
        if not folder or not folder.is_dir():
            return self.reply(404, {'error': 'No such folder'})
        self.reply(200, list_folder(folder))

    def send_photo(self, query):
        photo = inside_root(query.get('path'))
        size = SIZES.get(query.get('size'), SIZES['thumb'])
        if not photo or not photo.is_file() or photo.suffix.lower() not in IMAGES:
            return self.reply(404, {'error': 'No such photo'})
        self.reply_bytes(200, 'image/jpeg', preview(photo, size))

    def send_selection(self, query):
        saved = json.loads(SELECTION.read_text(encoding='utf-8')) if SELECTION.exists() else None
        self.reply(200, saved)

    def reply(self, status, body):
        """Send a JSON response."""
        self.reply_bytes(status, 'application/json', json.dumps(body).encode())

    def reply_bytes(self, status, kind, data):
        """Send a response with the given content type."""
        self.send_response(status)
        self.send_header('Content-Type', kind)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def main():
    global ROOT
    args = argparse.ArgumentParser(description='Pick the photos for the gallery.')
    args.add_argument('--port', type=int, default=8094)
    args.add_argument('--root', type=Path, default=ROOT, help='the folder of photos to browse')
    opts = args.parse_args()
    ROOT = opts.root.resolve()
    if not ROOT.is_dir():
        sys.exit(f'No photo folder at {ROOT}. Give one with --root.')
    server = ThreadingHTTPServer(('127.0.0.1', opts.port), Handler)
    print(f'Photo picker: http://localhost:{opts.port}{MOUNT}/')
    print(f'Browsing {ROOT}')
    print(f'Saves picks to {SELECTION}')
    server.serve_forever()


if __name__ == '__main__':
    main()
