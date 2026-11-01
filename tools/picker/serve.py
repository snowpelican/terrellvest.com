# /// script
# requires-python = ">=3.11,<3.14"
# dependencies = ["pillow", "pillow-heif", "rawpy"]
# ///
"""Browse the photo folder and choose the photos for each gallery collection.

Usage: uv run tools/picker/serve.py [--port 8094] [--root PHOTO_FOLDER]
Then open http://localhost:8094/picker/
The choices save to _src/photography/collections.json as you make them. "Update gallery" runs update_gallery.py.
The photo folder is read only: this server never moves, copies into, renames or edits anything in it.
The server answers only this machine.
"""
import argparse
import hashlib
import json
import subprocess
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from photo_files import is_photo, open_photo, refuse_inside

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
SITE = REPO / '_dist'
COLLECTIONS = REPO / '_src' / 'photography' / 'collections.json'
UPDATE = HERE / 'update_gallery.py'
PREVIEWS = HERE / '.previews'
MOUNT = '/picker'
# Lightroom keeps its catalog and previews in folders with these endings; they hold no photos to choose
HIDDEN_ENDINGS = ('.lrdata', '.lrcat-data')
SIZES = {'thumb': 480, 'large': 2000}
MAX_BODY = 4 * 1024 * 1024
ROOT = Path.home() / 'Pictures' / 'Fenrose'


def inside_root(path):
    """Return the absolute path for a path in ROOT (absolute or relative), or None if it is outside ROOT."""
    full = (ROOT / (path or '')).resolve()
    return full if full == ROOT or ROOT in full.parents else None


def list_folder(folder):
    """List the subfolders (relative to ROOT) and the photos (absolute) in one folder, sorted by name."""
    folders, photos = [], []
    for entry in sorted(folder.iterdir(), key=lambda p: p.name.lower()):
        if entry.name.startswith('.') or entry.name.endswith(HIDDEN_ENDINGS):
            continue
        if entry.is_dir():
            folders.append(entry.relative_to(ROOT).as_posix())
        elif is_photo(entry):
            photos.append(entry.as_posix())
    return {'folders': folders, 'photos': photos}


def preview(photo, size):
    """Return a JPEG preview of the photo, cached in this repo, at most size pixels on its long side."""
    stamp = f'{photo}|{photo.stat().st_mtime_ns}|{size}'
    cached = refuse_inside(PREVIEWS / (hashlib.sha1(stamp.encode()).hexdigest() + '.jpg'), ROOT)
    if not cached.exists():
        PREVIEWS.mkdir(exist_ok=True)
        open_photo(photo, size).save(cached, quality=82)
    return cached.read_bytes()


def update_gallery():
    """Run update_gallery.py. Return its output, or raise with it when it fails."""
    run = subprocess.run([sys.executable, str(UPDATE)], capture_output=True, text=True, cwd=HERE)
    log = (run.stdout + run.stderr).strip()
    if run.returncode:
        raise RuntimeError(log)
    return log


class Handler(SimpleHTTPRequestHandler):
    """Serves /picker/ from this folder, the photo and collection APIs, and every other path from _dist."""

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
        routes = {'/api/list': self.send_list, '/api/photo': self.send_photo, '/api/collections': self.send_collections}
        if url.path not in routes:
            return super().do_GET()
        try:
            routes[url.path](query)
        except Exception as err:
            self.reply(500, {'error': str(err)})

    def do_POST(self):
        path = urlsplit(self.path).path
        if path == '/api/update':
            try:
                return self.reply(200, {'log': update_gallery()})
            except Exception as err:
                return self.reply(500, {'error': str(err)})
        if path != '/api/collections':
            return self.reply(404, {'error': 'Not found'})
        self.save_collections()

    def send_list(self, query):
        folder = inside_root(query.get('dir'))
        if not folder or not folder.is_dir():
            return self.reply(404, {'error': 'No such folder'})
        self.reply(200, list_folder(folder))

    def send_photo(self, query):
        photo = inside_root(query.get('path'))
        if not photo or not photo.is_file() or not is_photo(photo):
            return self.reply(404, {'error': 'No such photo'})
        self.reply_bytes(200, 'image/jpeg', preview(photo, SIZES.get(query.get('size'), SIZES['thumb'])))

    def send_collections(self, query):
        saved = json.loads(COLLECTIONS.read_text(encoding='utf-8')) if COLLECTIONS.exists() else None
        self.reply(200, {'root': ROOT.as_posix(), 'saved': saved})

    def save_collections(self):
        """Write the posted collections to collections.json, with the photo folder recorded as root."""
        size = int(self.headers.get('Content-Length') or 0)
        if not 0 < size <= MAX_BODY:
            return self.reply(413, {'error': 'The collections are empty or too large'})
        try:
            body = json.loads(self.rfile.read(size))
        except json.JSONDecodeError as err:
            return self.reply(400, {'error': f'Not valid JSON: {err}'})
        saved = {'root': ROOT.as_posix(), 'collections': body.get('collections', [])}
        target = refuse_inside(COLLECTIONS, ROOT)
        target.write_text(json.dumps(saved, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
        self.reply(200, {'saved': str(target)})

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
    args = argparse.ArgumentParser(description='Choose the photos for each gallery collection.')
    args.add_argument('--port', type=int, default=8094)
    args.add_argument('--root', type=Path, default=ROOT, help='the photo folder to browse (read only)')
    opts = args.parse_args()
    ROOT = opts.root.resolve()
    if not ROOT.is_dir():
        sys.exit(f'No photo folder at {ROOT}. Give one with --root.')
    refuse_inside(REPO, ROOT)
    server = ThreadingHTTPServer(('127.0.0.1', opts.port), Handler)
    print(f'Photo picker: http://localhost:{opts.port}{MOUNT}/')
    print(f'Browsing {ROOT} (read only)')
    print(f'Saves choices to {COLLECTIONS}')
    server.serve_forever()


if __name__ == '__main__':
    main()
