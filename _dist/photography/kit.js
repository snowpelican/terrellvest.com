// Shared gallery kit: blur-up images, pinch/double-tap zoom, full-screen viewer, concept notes sheet.
(function () {
  const P = window.PHOTOS;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const css = `
  .kp picture,.kv-slide picture{display:contents}
  .kp{position:relative;overflow:hidden;background:var(--kp-c,#777) center/cover no-repeat;max-width:100%}
  .kp::before{content:"";position:absolute;inset:0;background:inherit;filter:blur(14px);transform:scale(1.15)}
  .kp img{position:relative;display:block;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .45s ease}
  .kp img.in{opacity:1}
  .kv{position:fixed;inset:0;z-index:100;color:#fff;touch-action:none}
  .kv-bg{position:absolute;inset:0;background:#000}
  .kv-track{position:absolute;inset:0;display:flex;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;overscroll-behavior:contain;scrollbar-width:none}
  .kv-track::-webkit-scrollbar{display:none}
  .kv-track.locked{overflow:hidden}
  .kv-slide{position:relative;flex:0 0 100%;height:100%;scroll-snap-align:center;scroll-snap-stop:always;display:grid;place-items:center;overflow:hidden;touch-action:pan-x;margin:0}
  .kv-slide.zoomed{touch-action:none}
  .kv-slide img{max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;transform-origin:0 0;will-change:transform;user-select:none;-webkit-user-drag:none}
  .kv-top,.kv-cap{position:absolute;left:0;right:0;display:flex;align-items:center;gap:12px;transition:opacity .25s;
    padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
  .kv-top{top:0;padding-top:calc(env(safe-area-inset-top,0px) + 10px);padding-bottom:24px;background:linear-gradient(#0009,#0000);justify-content:space-between}
  .kv-cap{bottom:0;padding-bottom:calc(env(safe-area-inset-bottom,0px) + 16px);padding-top:40px;background:linear-gradient(#0000,#000a);flex-direction:column;align-items:flex-start;gap:2px}
  .kv-top,.kv-cap{pointer-events:none}.kv-btn{pointer-events:auto}
  .kv.bare .kv-top,.kv.bare .kv-cap{opacity:0}
  .kv-btn{appearance:none;border:0;background:#ffffff26;color:#fff;width:36px;height:36px;border-radius:50%;display:grid;place-items:center;-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);cursor:pointer}
  .kv-btn:focus-visible,.kn-pill:focus-visible{outline:2px solid #fff;outline-offset:2px}
  .kv-count{font:500 13px/1 system-ui,-apple-system,sans-serif;font-variant-numeric:tabular-nums;opacity:.85}
  .kv-t{font:600 17px/1.3 system-ui,-apple-system,sans-serif}
  .kv-m{font:400 13px/1.4 system-ui,-apple-system,sans-serif;opacity:.75}
  .kv-x{font:400 12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;opacity:.6;margin-top:4px}
  ::view-transition-group(hero){animation-duration:.38s;animation-timing-function:cubic-bezier(.2,.8,.2,1)}
  ::view-transition-old(root),::view-transition-new(root){animation-duration:.3s}
  .kn-pill{position:fixed;z-index:90;right:max(12px,env(safe-area-inset-right,0px));bottom:calc(env(safe-area-inset-bottom,0px) + var(--kn-bottom,16px));
    appearance:none;border:0;border-radius:999px;padding:9px 14px;font:600 12px/1 system-ui,-apple-system,sans-serif;letter-spacing:.02em;
    background:#111c;color:#fff;-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);box-shadow:0 4px 18px #0003;cursor:pointer}
  .kn-scrim{position:fixed;inset:0;z-index:200;background:#0007;opacity:0;transition:opacity .3s}
  .kn-sheet{position:fixed;z-index:201;left:0;right:0;bottom:0;max-height:82dvh;overflow:auto;background:#fbfbfa;color:#1b1c1e;border-radius:16px 16px 0 0;
    padding:8px max(20px,env(safe-area-inset-right,0px)) calc(env(safe-area-inset-bottom,0px) + 24px) max(20px,env(safe-area-inset-left,0px));
    transform:translateY(100%);transition:transform .38s cubic-bezier(.2,.8,.2,1);font:15px/1.5 system-ui,-apple-system,sans-serif;max-width:640px;margin:0 auto;overscroll-behavior:contain}
  .kn-open .kn-scrim{opacity:1}.kn-open .kn-sheet{transform:none}
  .kn-grab{width:38px;height:5px;border-radius:3px;background:#0002;margin:0 auto 14px}
  .kn-sheet h2{font-size:22px;margin:0 0 2px;text-wrap:balance;letter-spacing:-.01em}
  .kn-sheet .kn-k{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#6b6f76;margin:0}
  .kn-sheet p{margin:8px 0 0;color:#3b3e44}
  .kn-sheet ul{margin:12px 0 0;padding:0;list-style:none;display:grid;gap:10px}
  .kn-sheet li{padding-left:14px;position:relative;color:#2b2e33}
  .kn-sheet li::before{content:"";position:absolute;left:0;top:.62em;width:5px;height:5px;border-radius:50%;background:#9aa0a8}
  .kn-sheet li b{font-weight:600;color:#111}
  .kn-best{margin-top:16px;padding:12px 14px;border-radius:12px;background:#eef0f2;font-size:14px}
  body:has(.kv:not([hidden])) .kn-pill{display:none}
  @media (prefers-reduced-motion: reduce){.kp img,.kn-sheet,.kn-scrim{transition:none}}`;
  document.head.insertAdjacentHTML('beforeend', `<style>${css}</style>`);

  // AVIF first (about 60% smaller), JPEG for browsers without it. Wraps img in <picture>.
  function wrap(img, p, large) {
    const pc = document.createElement('picture'), s = document.createElement('source');
    s.type = 'image/avif'; s.srcset = `p/${p.id}${large ? '' : '-s'}.avif`;
    pc.append(s, img); img.src = `p/${p.id}${large ? '' : '-s'}.jpg`; return pc;
  }
  const avifOK = new Promise(r => { const i = new Image(); i.onload = () => r(true); i.onerror = () => r(false);
    i.src = 'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADrbWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAAAAAAAOcGl0bQAAAAAAAQAAAB5pbG9jAAAAAEQAAAEAAQAAAAEAAAETAAAAIQAAAChpaW5mAAAAAAABAAAAGmluZmUCAAAAAAEAAGF2MDFDb2xvcgAAAABqaXBycAAAAEtpcGNvAAAAFGlzcGUAAAAAAAAAAQAAAAEAAAAQcGl4aQAAAAADCAgIAAAADGF2MUOBAAwAAAAAE2NvbHJuY2x4AAEADQAGgAAAABdpcG1hAAAAAAAAAAEAAQQBAoMEAAAAKW1kYXQSAAoIGAAGiAhoNCAyExlHh4Yhh5555oAAAJBAyRxgimo='; });
  // Only after the visitor has touched the page: before that, Chrome blocks vibrate() and logs a warning (e.g. a scroll on load turning a page)
  const haptic = (ms = 8) => { try { if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(ms); } catch (e) {} };

  // Blur-up picture: tiny inline placeholder painted instantly, real file fades in when decoded.
  function pic(p, opts = {}) {
    const d = document.createElement('div');
    d.className = 'kp ' + (opts.cls || '');
    d.style.backgroundImage = `url(${p.lqip})`;
    d.style.setProperty('--kp-c', p.color);
    if (opts.ratio !== false) d.style.aspectRatio = `${p.w} / ${p.h}`;
    const img = new Image();
    img.alt = `${p.title}, ${p.place}`;
    img.decoding = 'async';
    if (opts.eager) img.fetchPriority = 'high'; else img.loading = 'lazy';
    const show = () => img.classList.add('in');
    img.complete ? show() : img.addEventListener('load', show, { once: true });
    d.appendChild(wrap(img, p, opts.large));
    return d;
  }

  // Pinch + double-tap zoom with pan. onState(zoomed) lets the parent lock its scroller.
  function zoomable(box, img, onState, onTap) {
    let s = 1, x = 0, y = 0, pts = new Map(), start = null, lastTap = 0, tapTimer = 0, moved = false;
    const apply = (anim) => {
      img.style.transition = anim && !reduce ? 'transform .3s cubic-bezier(.2,.8,.2,1)' : 'none';
      img.style.transform = `translate(${x}px,${y}px) scale(${s})`;
    };
    const clamp = () => {
      const b = box.getBoundingClientRect();
      const w = img.offsetWidth * s, h = img.offsetHeight * s, bx = img.offsetLeft, by = img.offsetTop;
      const minX = Math.min(0, b.width - bx - w) , maxX = Math.max(0, -bx);
      const minY = Math.min(0, b.height - by - h), maxY = Math.max(0, -by);
      if (w <= b.width) x = (b.width - w) / 2 - bx; else x = Math.min(maxX, Math.max(minX, x));
      if (h <= b.height) y = (b.height - h) / 2 - by; else y = Math.min(maxY, Math.max(minY, y));
    };
    const set = (ns, cx, cy, anim) => {
      const lx = cx - box.getBoundingClientRect().left - img.offsetLeft, ly = cy - box.getBoundingClientRect().top - img.offsetTop;
      const k = ns / s; x = lx - (lx - x) * k; y = ly - (ly - y) * k; s = ns;
      if (s <= 1.01) { s = 1; x = 0; y = 0; } else clamp();
      apply(anim); box.classList.toggle('zoomed', s > 1); onState && onState(s > 1);
    };
    box.addEventListener('pointerdown', e => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = false;
      if (pts.size === 2) { const [a, b] = [...pts.values()]; start = { d: Math.hypot(a.x - b.x, a.y - b.y), s, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; }
      else start = { px: e.clientX, py: e.clientY, x, y };
    });
    box.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2 && start.d) {
        const [a, b] = [...pts.values()]; moved = true;
        set(Math.min(5, Math.max(1, start.s * Math.hypot(a.x - b.x, a.y - b.y) / start.d)), start.cx, start.cy, false);
      } else if (pts.size === 1 && s > 1 && start.px != null) {
        x = start.x + e.clientX - start.px; y = start.y + e.clientY - start.py; moved = true; clamp(); apply(false);
      } else if (Math.abs(e.clientX - (start.px ?? e.clientX)) + Math.abs(e.clientY - (start.py ?? e.clientY)) > 8) moved = true;
    });
    const up = e => {
      if (!pts.has(e.pointerId)) return; pts.delete(e.pointerId);
      if (pts.size === 1) { const [a] = [...pts.values()]; start = { px: a.x, py: a.y, x, y }; return; }
      if (e.type !== 'pointerup' || moved) return;
      const now = Date.now();
      if (now - lastTap < 280) { clearTimeout(tapTimer); lastTap = 0; haptic(); set(s > 1 ? 1 : 2.5, e.clientX, e.clientY, true); }
      else { lastTap = now; tapTimer = setTimeout(() => onTap && onTap(e), 280); }
    };
    box.addEventListener('pointerup', up); box.addEventListener('pointercancel', up);
    box.addEventListener('dblclick', e => e.preventDefault());
    return { reset: () => { s = 1; x = 0; y = 0; apply(false); box.classList.remove('zoomed'); onState && onState(false); }, get zoomed() { return s > 1; } };
  }

  // Full-screen viewer: native horizontal paging (scroll-snap), swipe down to dismiss, back button closes.
  function viewer(list, opts = {}) {
    const el = document.createElement('div');
    el.className = 'kv'; el.hidden = true;
    el.innerHTML = `<div class="kv-bg"></div><div class="kv-track"></div>
      <div class="kv-top"><button class="kv-btn" aria-label="Close"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3l10 10M13 3L3 13"/></svg></button><span class="kv-count"></span><span style="width:36px"></span></div>
      <div class="kv-cap"><div class="kv-t"></div><div class="kv-m"></div><div class="kv-x"></div></div>`;
    document.body.appendChild(el);
    const track = el.querySelector('.kv-track'), bg = el.querySelector('.kv-bg');
    let idx = 0, zooms = [], isOpen = false;
    list.forEach((p, i) => {
      const f = document.createElement('figure'); f.className = 'kv-slide';
      const img = new Image(); img.alt = p.title; img.decoding = 'async'; img.loading = 'lazy';
      img.width = p.w; img.height = p.h;
      img.style.background = `url(${p.lqip}) center/cover`;
      f.appendChild(wrap(img, p, true)); track.appendChild(f);
      // Tap on the photo toggles the captions; tap anywhere outside it closes the viewer.
      zooms.push(zoomable(f, img, z => track.classList.toggle('locked', z), e => {
        const r = img.getBoundingClientRect();
        const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        inside || zooms[i].zoomed ? el.classList.toggle('bare') : close();
      }));
      // vertical drag to dismiss
      let sy = null, sx = 0, dy = 0, t0 = 0, vertical = null;
      f.addEventListener('pointerdown', e => { if (zooms[i].zoomed || !e.isPrimary) return; sy = e.clientY; sx = e.clientX; t0 = Date.now(); vertical = null; dy = 0; });
      f.addEventListener('pointermove', e => {
        if (sy == null || zooms[i].zoomed) return;
        const ddx = e.clientX - sx, ddy = e.clientY - sy;
        if (vertical == null && Math.abs(ddx) + Math.abs(ddy) > 10) vertical = Math.abs(ddy) > Math.abs(ddx);
        if (!vertical) return;
        dy = ddy; const k = Math.min(1, Math.abs(dy) / 400);
        img.style.transition = 'none'; img.style.transform = `translateY(${dy}px) scale(${1 - k * .25})`;
        bg.style.opacity = 1 - k; el.classList.add('bare');
      });
      const end = () => {
        if (sy == null) return; sy = null;
        if (!vertical) return;
        const v = Math.abs(dy) / Math.max(1, Date.now() - t0);
        if (Math.abs(dy) > 110 || v > .6) close();
        else { img.style.transition = 'transform .3s cubic-bezier(.2,.8,.2,1)'; img.style.transform = ''; bg.style.transition = 'opacity .3s'; bg.style.opacity = 1; el.classList.remove('bare'); setTimeout(() => bg.style.transition = '', 300); }
      };
      f.addEventListener('pointerup', end); f.addEventListener('pointercancel', end);
    });
    const label = () => {
      const p = list[idx];
      el.querySelector('.kv-count').textContent = `${idx + 1} of ${list.length}`;
      el.querySelector('.kv-t').textContent = p.title;
      el.querySelector('.kv-m').textContent = p.place;
      el.querySelector('.kv-x').textContent = [p.camera, p.exif.replace(/\s+/g, ' ')].filter(Boolean).join(' · ');
    };
    track.addEventListener('scroll', () => {
      const n = Math.round(track.scrollLeft / track.clientWidth);
      if (n !== idx && n >= 0 && n < list.length) { zooms[idx].reset(); idx = n; label(); haptic(4); }
    }, { passive: true });
    el.querySelector('.kv-btn').onclick = () => close();
    addEventListener('keydown', e => {
      if (!isOpen) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') track.scrollBy({ left: track.clientWidth, behavior: 'smooth' });
      if (e.key === 'ArrowLeft') track.scrollBy({ left: -track.clientWidth, behavior: 'smooth' });
    });
    addEventListener('popstate', () => { if (isOpen) close(true); });

    const vt = (fn) => (document.startViewTransition && !reduce) ? document.startViewTransition(fn) : (fn(), null);
    const slideImg = i => track.children[i].querySelector('img');

    function open(i, fromEl) {
      idx = i; label();
      const show = () => {
        el.hidden = false; el.classList.remove('bare'); bg.style.opacity = 1;
        track.scrollLeft = i * track.clientWidth;
        slideImg(i).style.transform = '';
        if (fromEl) { fromEl.style.viewTransitionName = ''; slideImg(i).style.viewTransitionName = 'hero'; }
        document.documentElement.style.overflow = 'hidden';
      };
      if (fromEl) fromEl.style.viewTransitionName = 'hero';
      const t = vt(show);
      if (!t) { el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: reduce ? 0 : 220 }); }
      else t.finished.finally(() => slideImg(i).style.viewTransitionName = '');
      isOpen = true; haptic();
      try { history.pushState({ kv: 1 }, ''); } catch (e) {}
    }
    function close(fromPop) {
      if (!isOpen) return; isOpen = false;
      zooms[idx].reset();
      const target = opts.thumbFor ? opts.thumbFor(idx) : null;
      const img = slideImg(idx);
      const hide = () => {
        el.hidden = true; document.documentElement.style.overflow = '';
        img.style.viewTransitionName = ''; if (target) target.style.viewTransitionName = 'hero';
        img.style.transform = '';
      };
      if (target && document.startViewTransition && !reduce) {
        target.scrollIntoView({ block: 'nearest' });
        img.style.viewTransitionName = 'hero';
        document.startViewTransition(hide).finished.finally(() => { target.style.viewTransitionName = ''; });
      } else {
        el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: reduce ? 0 : 200 }).onfinish = hide;
      }
      opts.onClose && opts.onClose(idx);
      if (!fromPop) { try { history.state && history.state.kv && history.back(); } catch (e) {} }
    }
    return { open, close, get index() { return idx; } };
  }

  // "Concept notes" pill + bottom sheet (drag the sheet down to dismiss).
  function notes(n) {
    const pill = document.createElement('button');
    pill.className = 'kn-pill'; pill.textContent = `Concept ${n.num} · Notes`;
    const wrap = document.createElement('div'); wrap.hidden = true;
    wrap.innerHTML = `<div class="kn-scrim"></div><div class="kn-sheet" role="dialog" aria-label="Concept notes"><div class="kn-grab"></div>
      <p class="kn-k">Concept ${n.num} of 5 · ${n.layout}</p><h2>${n.name}</h2><p>${n.idea}</p>
      <ul>${n.native.map(x => `<li>${x}</li>`).join('')}</ul><div class="kn-best">${n.best}</div></div>`;
    document.body.append(pill, wrap);
    const sheet = wrap.querySelector('.kn-sheet');
    const openS = () => { wrap.hidden = false; requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('kn-open'))); };
    const closeS = () => { wrap.classList.remove('kn-open'); sheet.style.transform = ''; setTimeout(() => wrap.hidden = true, 380); };
    pill.onclick = openS; wrap.querySelector('.kn-scrim').onclick = closeS;
    let sy = null, dy = 0;
    sheet.addEventListener('touchstart', e => { if (sheet.scrollTop <= 0) { sy = e.touches[0].clientY; sheet.style.transition = 'none'; } }, { passive: true });
    sheet.addEventListener('touchmove', e => { if (sy == null) return; dy = Math.max(0, e.touches[0].clientY - sy); sheet.style.transform = `translateY(${dy}px)`; }, { passive: true });
    sheet.addEventListener('touchend', () => { if (sy == null) return; sy = null; sheet.style.transition = ''; if (dy > 90) closeS(); else sheet.style.transform = ''; dy = 0; });
    return pill;
  }

  window.Kit = { P, pic, wrap, avifOK, zoomable, viewer, notes, haptic, reduce };
})();
