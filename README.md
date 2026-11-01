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
- To choose photos by eye, run `uv run tools/picker/serve.py` and open http://localhost:8094/picker/. It browses `~/Pictures/Fenrose` (give another folder with `--root`). Click photos to pick them, set their order and credits, then click "Build gallery". The picks save to `tools/picker/selection.json`, and `optimize.py tools/picker/selection.json` builds from them.
- `layouts.js` sets which photos share each page, per collection and screen size (see the comments at its top).

## Icons

The site icons are in `_dist/assets/images/site-wide/`.
