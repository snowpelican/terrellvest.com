# Personal Website

The source of terrellvest.com: a home page and a photography gallery, in plain HTML, CSS and JavaScript.

## Development Notes

There is no build step. Cloudflare serves the `_dist/` folder as it is (see `wrangler.jsonc`). `vercel.json` turns off Vercel deployments from GitHub.

To see the site on this machine or on another device in your Tailscale network, run:
```sh
./serve.sh [port]
```

## Home page (`/`)

`_dist/index.html` is a standalone page (plain HTML and CSS). It shares its fonts, colours, logo and light/dark rules with `/photography`. Edit it directly.

## Photography (`/photography`)

A standalone gallery served from `_dist/photography/` (plain HTML/JS).

- `index.html` is the page; `photos.js` lists the photos; `kit.js` is the shared UI helpers; `p/` holds the images.
- To add your own photos, run `python3 _src/photography/optimize.py SRC_DIR [credits.json]` and copy the generated `p/` folder and `photos.js` into `_dist/photography/`. Camera, focal length, ISO, shutter and aperture are read from each file's EXIF; anything missing shows as "Settings not recorded".
- To choose the photos, run `uv run tools/picker/serve.py` and open http://localhost:8094/picker/. It browses `~/Pictures/Fenrose` as a folder tree (give another folder with `--root`). Click a photo to add it to the open collection. Each change saves to `_src/photography/collections.json`, which lists the path of each chosen photo.
- Click "Update gallery" (or run `uv run tools/picker/update_gallery.py`) to make AVIF and JPEG files at 1400px and 600px from the chosen photos, and write them and `photos.js` into `_dist/photography/`. It reads JPEG, PNG, WebP, TIFF, HEIC and camera RAW files.
- The picker and the update script only read the photo folder. Every write goes to this repo, and a check refuses any write inside the photo folder.
- `layouts.js` sets which photos share each page, per collection and screen size (see the comments at its top).

## Icons

The site icons are in `_dist/assets/images/site-wide/`.
