# Turn a folder of source photos into the gallery's files: AVIF + JPEG at 1400px and 600px, plus photos.js with blur-up placeholders.
# Usage: python3 optimize.py SRC_DIR [credits.json]   (credits.json: {"file.jpg": {"title":..,"place":..,"collection":..}})
#    or: python3 optimize.py selection.json   (the photos picked in tools/picker, in their order, with their credits)
# Camera, focal length, ISO, shutter and aperture come from each file's EXIF; credits.json can fill in or override them.
import sys, os, io, json, base64, shutil
from PIL import Image, ImageOps
from fractions import Fraction

IMAGES = ('.jpg', '.jpeg', '.png', '.webp')

def exposure(img):
    e = img.getexif(); x = e.get_ifd(0x8769)
    num = lambda v: float(v) if v else None
    make, model = (e.get(0x010F) or '').strip(), (e.get(0x0110) or '').strip()
    cam = model if model.lower().startswith(make.split(' ')[0].lower()) else f'{make} {model}'.strip()
    mm, iso, t, fn = num(x.get(0xA405) or x.get(0x920A)), x.get(0x8827), num(x.get(0x829A)), num(x.get(0x829D))
    iso = iso[0] if isinstance(iso, tuple) else iso
    ss = (f'1/{round(1 / t)}' if t < 1 else f'{t:g}') if t else ''
    return dict(camera=cam, mm=round(mm) if mm else None, iso=iso or None, shutter=ss, f=round(fn, 1) if fn else None)
def sources(src, info):
    """List (path, credits) for each photo: every image in a folder, or the photos picked in a selection.json."""
    if src.lower().endswith('.json'):
        sel = json.load(open(src, encoding='utf-8'))
        return [(os.path.join(sel['root'], p['path']), p) for p in sel['photos']]
    return [(os.path.join(src, f), info.get(f, {})) for f in sorted(os.listdir(src)) if f.lower().endswith(IMAGES)]
src = sys.argv[1]; info = json.load(open(sys.argv[2])) if len(sys.argv) > 2 else {}
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'p'); shutil.rmtree(out, ignore_errors=True); os.makedirs(out)
meta = []
for n, (path, d) in enumerate(sources(src, info)):
    raw = Image.open(path); ex = exposure(raw)
    im = ImageOps.exif_transpose(raw).convert('RGB')
    im.thumbnail((1400, 1400), Image.LANCZOS); i = f'{n + 1:02d}'
    im.save(f'{out}/{i}.jpg', quality=80, optimize=True, progressive=True); im.save(f'{out}/{i}.avif', quality=55, speed=6)
    s = im.copy(); s.thumbnail((600, 600), Image.LANCZOS)
    s.save(f'{out}/{i}-s.jpg', quality=76, optimize=True, progressive=True); s.save(f'{out}/{i}-s.avif', quality=55, speed=6)
    t = im.copy(); t.thumbnail((16, 16)); b = io.BytesIO(); t.save(b, 'JPEG', quality=50)
    r, g, bl = [int(sum(c) / len(c)) for c in zip(*t.get_flattened_data())]
    meta.append(dict(id=i, w=im.width, h=im.height, title=d.get('title') or os.path.splitext(os.path.basename(path))[0], place=d.get('place', ''),
                     **{k: d.get(k) or v for k, v in ex.items()}, exif='', collection=d.get('collection') or 'Work',
                     color=f'#{r:02x}{g:02x}{bl:02x}', lqip='data:image/jpeg;base64,' + base64.b64encode(b.getvalue()).decode()))
open(os.path.join(os.path.dirname(out), 'photos.js'), 'w', encoding='utf-8').write('window.PHOTOS = ' + json.dumps(meta, indent=1, ensure_ascii=False) + ';\n')
print(len(meta), 'photos')
