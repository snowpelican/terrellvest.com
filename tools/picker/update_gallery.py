# /// script
# requires-python = ">=3.11,<3.14"
# dependencies = ["pillow", "pillow-heif", "rawpy"]
# ///
"""Make the gallery from the photos chosen in the photo picker.

Usage: uv run tools/picker/update_gallery.py
It reads _src/photography/collections.json, and for each chosen photo writes AVIF and JPEG files at 1400px
and 600px into _dist/photography/p/, then writes _dist/photography/photos.js.
It only reads the photo files. Every write goes to this repo, and a check refuses any write inside the photo folder.
"""
import base64
import io
import json
import shutil
import sys
from pathlib import Path

from photo_files import exposure, open_photo, refuse_inside

REPO = Path(__file__).resolve().parent.parent.parent
COLLECTIONS = REPO / '_src' / 'photography' / 'collections.json'
GALLERY = REPO / '_dist' / 'photography'
# File name ending: (long side in pixels, JPEG quality). The 600px files are for phones and the grid.
SIZES = {'': (1400, 80), '-s': (600, 76)}
AVIF_QUALITY = 55
SMALL_WARNING = 1000


def chosen_photos(saved):
    """List (collection name, photo entry) for every chosen photo, in collection order."""
    return [(c['name'], p) for c in saved['collections'] for p in c['photos']]


def write_sizes(img, folder, photo_id):
    """Write the AVIF and JPEG files of each size. Return the large image."""
    large = None
    for ending, (side, quality) in SIZES.items():
        copy = img.copy()
        copy.thumbnail((side, side))
        copy.save(folder / f'{photo_id}{ending}.jpg', quality=quality, optimize=True, progressive=True)
        copy.save(folder / f'{photo_id}{ending}.avif', quality=AVIF_QUALITY, speed=6)
        large = large or copy
    return large


def placeholder(img):
    """Return the average colour and a tiny blurred JPEG that shows while the photo loads."""
    tiny = img.copy()
    tiny.thumbnail((16, 16))
    data = io.BytesIO()
    tiny.save(data, 'JPEG', quality=50)
    r, g, b = [sum(c) // len(c) for c in zip(*tiny.get_flattened_data())]
    return f'#{r:02x}{g:02x}{b:02x}', 'data:image/jpeg;base64,' + base64.b64encode(data.getvalue()).decode()


def photo_record(photo_id, path, collection, entry, large):
    """Return the photos.js entry for one photo."""
    color, lqip = placeholder(large)
    return dict(id=photo_id, w=large.width, h=large.height, title=entry.get('title') or path.stem,
                place=entry.get('place', ''), **exposure(path), exif='', collection=collection, color=color, lqip=lqip)


def build(saved, folder):
    """Process every chosen photo into folder. Return the photos.js entries and any warnings."""
    records, warnings = [], []
    for n, (collection, entry) in enumerate(chosen_photos(saved), start=1):
        path, photo_id = Path(entry['file']), f'{n:02d}'
        print(f'{photo_id}  {collection}  {path}', flush=True)
        img = open_photo(path, SIZES[''][0])
        if max(img.size) < SMALL_WARNING:
            warnings.append(f'{path.name} is only {img.width}x{img.height}. Export a larger JPEG of it.')
        records.append(photo_record(photo_id, path, collection, entry, write_sizes(img, folder, photo_id)))
    return records, warnings


def publish(staging, records, photo_root):
    """Replace the gallery's images and photos.js with the new ones."""
    target = refuse_inside(GALLERY / 'p', photo_root)
    shutil.rmtree(target, ignore_errors=True)
    staging.rename(target)
    script = refuse_inside(GALLERY / 'photos.js', photo_root)
    script.write_text('window.PHOTOS = ' + json.dumps(records, indent=1, ensure_ascii=False) + ';\n', encoding='utf-8')


def main():
    saved = json.loads(COLLECTIONS.read_text(encoding='utf-8'))
    photo_root = saved['root']
    staging = refuse_inside(GALLERY / 'p.new', photo_root)
    shutil.rmtree(staging, ignore_errors=True)
    staging.mkdir(parents=True)
    try:
        records, warnings = build(saved, staging)
    except Exception:
        shutil.rmtree(staging, ignore_errors=True)
        raise
    if not records:
        shutil.rmtree(staging)
        sys.exit('No photos are chosen. The gallery is unchanged.')
    publish(staging, records, photo_root)
    print(f'Updated the gallery: {len(records)} photos in {GALLERY}')
    for line in warnings:
        print('Warning:', line)


if __name__ == '__main__':
    main()
