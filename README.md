# Personal Website

This is a newly redesigned and simplified version of terrellvest.com. I moved away from a wordpress.org setup and theme to a personally designed and developed site.

I wrote a unique build process in node.js that allows me to maintain both a portfolio and blog with posts composed in markdown.

For more info on the development of this site, view [the writeup](https://terrellvest.com/portfolio/personal-website/).

## Development Notes

To build this site use either of the commands listed below. The gulp task will build the entire site, and start the development server. Deployed to Cloudflare as a static site: `wrangler.jsonc` serves the prebuilt `_dist/` folder with no build step. Vercel deployments are turned off in `vercel.json`.
```sh
npm run dev
```
or
```sh
gulp
```

## Home page (`/`)

`_dist/index.html` is a standalone page (plain HTML and CSS). It shares its fonts, colours, logo and light/dark rules with `/photography`. Edit it directly. Do not run the gulp build without first removing the home page from it: the build writes `_dist/index.html` from `_src/index.jade` and would overwrite it.

## Photography (`/photography`)

A standalone gallery served from `_dist/photography/` (plain HTML/JS, not part of the gulp build).

- `index.html` is the page; `photos.js` lists the photos; `kit.js` is the shared UI helpers; `p/` holds the images.
- To add your own photos, run `python3 _src/photography/optimize.py SRC_DIR [credits.json]` and copy the generated `p/` folder and `photos.js` into `_dist/photography/`. Camera, focal length, ISO, shutter and aperture are read from each file's EXIF; anything missing shows as "Settings not recorded".
- `layouts.js` sets which photos share each page, per collection and screen size (see the comments at its top).
