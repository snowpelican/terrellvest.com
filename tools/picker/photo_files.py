"""Read photo files of any supported type into upright RGB images, without ever writing to them.

Every function here opens the photo file in read-only binary mode. Nothing in this module saves, moves or edits a photo.
"""
import io
from pathlib import Path

import rawpy
from PIL import Image, ImageOps
from pillow_heif import register_heif_opener

register_heif_opener()

PLAIN = ('.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.heic', '.heif')
RAW = ('.nef', '.arw', '.dng', '.cr2', '.cr3', '.raf', '.orf', '.rw2')
PHOTOS = PLAIN + RAW


def refuse_inside(path, photo_root):
    """Stop with an error if path is inside the photo folder. Call it before every write."""
    path, photo_root = Path(path).resolve(), Path(photo_root).resolve()
    if path == photo_root or photo_root in path.parents:
        raise PermissionError(f'Refusing to write inside the photo folder: {path}')
    return path


def is_photo(path):
    """Tell if the file has a photo type that this module can read."""
    return Path(path).suffix.lower() in PHOTOS


def open_photo(path, size):
    """Return the photo as an upright RGB image, at most size pixels on its long side.

    A RAW file uses its embedded camera JPEG when that is large enough, else LibRaw develops the raw data.
    """
    path = Path(path)
    img = open_raw(path, size) if path.suffix.lower() in RAW else open_plain(path, size)
    img.thumbnail((size, size), Image.LANCZOS)
    return img


def open_plain(path, size):
    """Read a JPEG, PNG, WebP, TIFF or HEIC file."""
    with open(path, 'rb') as f:
        img = Image.open(io.BytesIO(f.read()))
    img.draft('RGB', (size, size))
    return ImageOps.exif_transpose(img).convert('RGB')


def open_raw(path, size):
    """Read a camera RAW file: its embedded JPEG if large enough, else the developed raw data."""
    with open(path, 'rb') as f, rawpy.imread(f) as raw:
        preview = embedded_jpeg(raw)
        if preview and max(preview.size) >= size:
            return preview
        try:
            return Image.fromarray(raw.postprocess(use_camera_wb=True, output_bps=8))
        except rawpy.LibRawError:
            # LibRaw cannot develop some files, such as merged HDR DNGs; their embedded JPEG is the best there is
            if preview:
                return preview
            raise


def embedded_jpeg(raw):
    """Return the camera JPEG inside a RAW file as an upright image, or None when it has none."""
    try:
        thumb = raw.extract_thumb()
    except rawpy.LibRawError:
        return None
    if thumb.format != rawpy.ThumbFormat.JPEG:
        return None
    return ImageOps.exif_transpose(Image.open(io.BytesIO(thumb.data))).convert('RGB')


def read_exif(path):
    """Return the EXIF tags of a photo, or empty tags when the file has none that Pillow can read."""
    path = Path(path)
    try:
        with open(path, 'rb') as f:
            exif = Image.open(io.BytesIO(f.read())).getexif()
    except Exception:
        exif = Image.Exif()
    if not exif and path.suffix.lower() in RAW:
        exif = raw_thumb_exif(path)
    return exif


def raw_thumb_exif(path):
    """Return the EXIF tags of the JPEG inside a RAW file."""
    try:
        with open(path, 'rb') as f, rawpy.imread(f) as raw:
            thumb = raw.extract_thumb()
            return Image.open(io.BytesIO(thumb.data)).getexif() if thumb.format == rawpy.ThumbFormat.JPEG else Image.Exif()
    except Exception:
        return Image.Exif()


def exposure(path):
    """Return the camera, focal length, ISO, shutter speed and aperture from a photo's EXIF."""
    e = read_exif(path)
    x = e.get_ifd(0x8769)
    make, model = (e.get(0x010F) or '').strip(), (e.get(0x0110) or '').strip()
    camera = model if model.lower().startswith(make.split(' ')[0].lower()) else f'{make} {model}'.strip()
    mm, iso, t, fn = number(x.get(0xA405) or x.get(0x920A)), x.get(0x8827), number(x.get(0x829A)), number(x.get(0x829D))
    iso = iso[0] if isinstance(iso, tuple) else iso
    shutter = (f'1/{round(1 / t)}' if t < 1 else f'{t:g}') if t else ''
    return dict(camera=camera, mm=round(mm) if mm else None, iso=iso or None, shutter=shutter, f=round(fn, 1) if fn else None)


def number(value):
    """Return an EXIF number as a float, or None when it is missing or zero."""
    try:
        return float(value) or None
    except (TypeError, ValueError, ZeroDivisionError):
        return None
