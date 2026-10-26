// Fingerprints, on touch screens only. Each tap leaves a faint print where the finger was, as if the page were glossy photo
// paper. The prints are drawn once, on the first tap, in a few shapes from a small model of a fingertip's ridges. Each tap
// then shows one of them, turned and sized a little differently. A longer press leaves a darker print. A tap that turns
// into a scroll or a swipe leaves nothing. Each print stays for STAY ms, then slowly fades away; if more than MAX_PRINTS
// are showing, the oldest fades early. The prints take the page's ink colour (--ink), so they suit light and dark themes.
(() => {
  // W, H: a print's size (CSS px, about a fingertip). SCALE: drawing detail. SHAPES: how many different prints to draw.
  const W = 63, H = 85, SCALE = 3, SHAPES = 3, MAX_PRINTS = 14, STAY = 3000;
  let masks = null, layer = null, down = null;

  // A small seeded random number source, so each print shape is the same every visit
  function seeded(seed) {
    return () => {
      seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  // Smooth random values over a grid of cells: noise(u, v) for u and v from 0 to 1, values from 0 to 1
  function noise(rand, cells) {
    const n = cells + 1, g = Array.from({ length: n * n }, rand), ease = t => t * t * (3 - 2 * t);
    return (u, v) => {
      const fx = u * cells, fy = v * cells, i = Math.min(cells - 1, fx | 0), j = Math.min(cells - 1, fy | 0);
      const a = ease(fx - i), b = ease(fy - j), at = (x, y) => g[(j + y) * n + i + x];
      return (at(0, 0) * (1 - a) + at(1, 0) * a) * (1 - b) + (at(0, 1) * (1 - a) + at(1, 1) * a) * b;
    };
  }
  const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

  // One print, as an image whose transparency carries the ridges. Ridges circle a core in the upper part of the pad and
  // flatten into arches toward the joint. Noise bends them, breaks them into short runs, and makes the pressure uneven,
  // and the print fades out toward the rim of the pad.
  function bake(seed) {
    const rand = seeded(seed), cw = W * SCALE, ch = H * SCALE;
    const bend = noise(rand, 4), gaps = noise(rand, 26), pressure = noise(rand, 3);
    const core = { x: (rand() - .5) * .3, y: -.25 + (rand() - .5) * .2 }, twist = rand() * Math.PI, period = .075 + rand() * .015;
    const canvas = document.createElement('canvas');
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext('2d'), img = ctx.createImageData(cw, ch);
    for (let py = 0; py < ch; py++) {
      for (let px = 0; px < cw; px++) {
        const u = px / cw, v = py / ch, x = u * 2 - 1, y = v * 2 - 1;
        const rim = smooth(1, .45, x * x + y * y);
        if (!rim) continue;
        const dx = x - core.x, dy = (y - core.y) * H / W, below = smooth(0, .9, dy);
        const d = Math.hypot(dx * (1 - .75 * below), dy * 1.15) + .05 * Math.sin(2 * Math.atan2(dy, dx) + twist) + .14 * (bend(u, v) - .5);
        const ridge = smooth(.3, .85, .5 + .5 * Math.cos(2 * Math.PI * d / period));
        const broken = gaps(u, v) > .28 ? 1 : .3;
        img.data[(py * cw + px) * 4 + 3] = 255 * rim * ridge * broken * (.35 + .65 * pressure(u, v));
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas.toDataURL();
  }
  // The layer that holds the prints: it covers nothing and catches no taps, and scrolls with the page
  function makeLayer() {
    const style = document.createElement('style');
    style.textContent = `.fingerprints{position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;z-index:5}
      .fingerprints i{position:absolute;left:${-W / 2}px;top:${-H / 2}px;width:${W}px;height:${H}px;background:var(--ink);opacity:0;
      -webkit-mask:var(--print) center/100% 100% no-repeat;mask:var(--print) center/100% 100% no-repeat}`;
    document.head.append(style);
    const el = document.createElement('div');
    el.className = 'fingerprints';
    el.setAttribute('aria-hidden', 'true');
    document.body.append(el);
    return el;
  }
  // Leave a print at a point on the page. held: how long the finger was down (ms); up to half a second makes it darker.
  // Fingers come in at a slant, mostly from the lower right, so the prints lean a little.
  function leave(at, held) {
    masks = masks || Array.from({ length: SHAPES }, (_, k) => bake(11 + k * 97));
    layer = layer || makeLayer();
    const p = document.createElement('i'), turn = -20 + Math.random() * 50, size = .9 + Math.random() * .2;
    p.style.setProperty('--print', `url(${masks[Math.floor(Math.random() * SHAPES)]})`);
    p.style.transform = `translate(${at.x}px,${at.y}px) rotate(${turn.toFixed(1)}deg) scale(${size.toFixed(2)})`;
    layer.append(p);
    p.animate([{ opacity: 0 }, { opacity: .077 + .066 * Math.min(1, held / 500) }], { duration: 450, easing: 'ease-out', fill: 'forwards' });
    p.timer = setTimeout(() => fade(p), STAY);
    if (layer.children.length > MAX_PRINTS) fade(layer.firstElementChild);
  }
  // The print dries away, slowly at first
  function fade(p) {
    clearTimeout(p.timer);
    p.animate([{ opacity: getComputedStyle(p).opacity }, { opacity: 0 }], { duration: 1800, easing: 'ease-in', fill: 'forwards' }).onfinish = () => p.remove();
  }

  addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch' && e.isPrimary) down = { x: e.pageX, y: e.pageY, t: performance.now(), id: e.pointerId };
  }, { passive: true });
  addEventListener('pointerup', e => {
    if (!down || e.pointerId !== down.id) return;
    leave(down, performance.now() - down.t);
    down = null;
  }, { passive: true });
  addEventListener('pointercancel', () => { down = null; }, { passive: true });
})();
