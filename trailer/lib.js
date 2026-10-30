// Shared helpers for the trailer cuts: camera maths, deterministic noise, the DOM overlays (cards, captions, camcorder, black, flash) and the
// game-state helpers that put the house, the family and the thing where a shot needs them. Everything goes through window.__game.
import * as THREE from 'three';

export const V3 = THREE.Vector3;
export const EYE_KID = 1.2;              // a child's eye height (the game's own is 1.32)
export const BATH_I = 95;                // the hall reveal spotlight, same as main.js
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, k) => a + (b - a) * k;
export const ease = {
  inOut: (k) => k * k * (3 - 2 * k), out: (k) => 1 - (1 - k) * (1 - k), in: (k) => k * k,
  outCubic: (k) => 1 - Math.pow(1 - k, 3),
};
export const mix3 = (a, b, k, out = new V3()) => out.set(lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k));
// a point as [x, y, z], whether it came as an array or a Vector3
export const xyz = (p) => (p.isVector3 ? [p.x, p.y, p.z] : p);
// game yaw/pitch for a camera at `from` looking at `to` (the game: forward = (-sin yaw, -cos yaw), pitch up is positive)
export function aim(from, to) {
  from = xyz(from); to = xyz(to);
  const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
}
export const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
export const lerpAngle = (a, b, k) => a + angDiff(a, b) * k;
// a smooth, deterministic wobble in -1..1 (sums of incommensurate sines; `s` picks a different curve)
export function wobble(t, s = 0) {
  const o = s * 1.7;
  return (Math.sin(t * 1.31 + o) * 0.5 + Math.sin(t * 2.73 + o * 2.1 + 0.7) * 0.3 + Math.sin(t * 0.47 + o * 0.6 + 2.2) * 0.2);
}
// a seeded random (mulberry32)
export function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// a catmull-rom path through points [[x,y,z],...]; at(k) -> V3, tangent(k) -> V3
export function path(pts) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new V3(...p)), false, 'centripetal');
  return { at: (k, out = new V3()) => curve.getPointAt(clamp(k, 0, 1), out), tangent: (k) => curve.getTangentAt(clamp(k, 0, 1)) };
}

// ---------- DOM overlays ----------
const CSS = `
#hud, #card, #flash, #loading, #title, #pause, #death, #end, #touch { display: none !important; }
#blanket, #pod, #fade, #vignette { transition: none !important; }
#grain { animation: none !important; }
#fade { opacity: 0 !important; }
.tr { position: fixed; inset: 0; pointer-events: none; }
#tr-black { z-index: 58; background: #000; opacity: 0; }
#tr-flash { z-index: 59; background: #fff; opacity: 0; }
#tr-lb { z-index: 56; display: none; }
#tr-lb i { position: absolute; left: 0; right: 0; background: #000; }
#tr-cards { z-index: 60; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 0 6vw; opacity: 0; }
#tr-cards .big { font-family: 'Special Elite', 'Courier Prime', monospace; font-weight: 400; color: #e9e2d0; letter-spacing: 0.12em; text-shadow: 0 0 40px rgba(0,0,0,1), 0 0 2px #000; line-height: 1.1; }
#tr-cards .small { font-family: 'Courier Prime', ui-monospace, monospace; color: #a59d8b; letter-spacing: 0.3em; text-transform: uppercase; margin-top: 1.2vh; }
#tr-cards .line { font-family: 'Special Elite', 'Courier Prime', monospace; color: #e9e2d0; letter-spacing: 0.06em; line-height: 1.35; }
#tr-cap { z-index: 60; display: flex; align-items: flex-end; justify-content: center; opacity: 0; }
#tr-cap div { font-family: 'Special Elite', 'Courier Prime', monospace; color: #f3eee2; text-align: center; text-shadow: 0 2px 6px #000, 0 0 2px #000, 0 0 18px rgba(0,0,0,0.9); line-height: 1.3; max-width: 84%; background: rgba(0,0,0,0.28); padding: 0.35em 0.6em; border-radius: 0.12em; }
#tr-cam { z-index: 57; display: none; }
#tr-cards canvas.kid { display: none; }
#tr-quilt { z-index: 4; display: none; }
#tr-acc { z-index: 1; display: none; }
/* the portrait cut: the camcorder's own text sits under the grain like the picture; captions and the end card stay crisp on top.
   the grain is overlaid, not laid over: it rides on the picture without lifting black to grey */
.tr-portrait #grain { z-index: 58 !important; mix-blend-mode: overlay; }
.tr-portrait #tr-black { z-index: 5; }
.tr-portrait #tr-cap div { position: absolute; left: 8%; width: 70%; top: 58%; transform: translateY(-50%); max-width: none; box-sizing: border-box; padding: 0; background: none; border-radius: 0;
  font-family: 'Helvetica Neue', Arial, 'Liberation Sans', sans-serif; font-weight: 700; color: #fff; line-height: 1.2; white-space: pre-line; letter-spacing: 0;
  -webkit-text-stroke: 0.1em #000; paint-order: stroke fill; text-shadow: 0 0.05em 0.25em rgba(0,0,0,0.75); }
/* a line in the kid's own red crayon, the hand on the drawing and the title */
.tr-portrait #tr-cap div.kid { font-family: 'Gloria Hallelujah', 'Comic Sans MS', sans-serif; font-weight: 400; color: #ff5546; line-height: 1.15;
  -webkit-text-stroke: 0.09em #000; }
.tr-portrait #tr-cards .line { font-family: 'Helvetica Neue', Arial, 'Liberation Sans', sans-serif; font-weight: 700; color: #fff; letter-spacing: 0; line-height: 1.25; margin-top: 2.2vh;
  -webkit-text-stroke: 0.08em #000; paint-order: stroke fill; }
/* the one-line description, smaller, over the call to action */
.tr-portrait #tr-cards .line .kick { display: block; font-size: 0.6em; color: #d9d3c6; margin-bottom: 0.25em; }
`;

// ---------- the camcorder's on-screen text: a 5x7 dot font like the chip in a 2004 camcorder draws, so no font file is involved ----------
const GLYPH = {
  0: '.###.#...##..###.#.###..##...#.###.', 1: '..#...##....#....#....#....#...###.', 2: '.###.#...#....#...#...#...#...#####', 3: '#####...#...#.....#....##...#.###.',
  4: '...#...##..#.#.#..#.#####...#....#.', 5: '######....####.....#....##...#.###.', 6: '..##..#...#....####.#...##...#.###.', 7: '#####....#...#...#...#....#....#...',
  8: '.###.#...##...#.###.#...##...#.###.', 9: '.###.#...##...#.####....#...#..##..',
  A: '.###.#...##...#######...##...##...#', B: '####.#...##...#####.#...##...#####.', C: '.###.#...##....#....#....#...#.###.', D: '###..#..#.#...##...##...##..#.###..',
  E: '######....#....####.#....#....#####', F: '######....#....####.#....#....#....', G: '.###.#...##....#.####...##...#.####', H: '#...##...##...#######...##...##...#',
  I: '.###...#....#....#....#....#...###.', J: '..###...#....#....#....##..#..##...', K: '#...##..#.#.#..##...#.#..#..#.#...#', L: '#....#....#....#....#....#....#####',
  M: '#...###.###.#.##.#.##...##...##...#', N: '#...##...###..##.#.##..###...##...#', O: '.###.#...##...##...##...##...#.###.', P: '####.#...##...#####.#....#....#....',
  R: '####.#...##...#####.#.#..#..#.#...#', S: '.#####....#.....###.....#....#####.', T: '#####..#....#....#....#....#....#..', U: '#...##...##...##...##...##...#.###.',
  V: '#...##...##...##...##...#.#.#...#..', W: '#...##...##...##.#.##.#.##.#..#.#..', Y: '#...##...#.#.#...#....#....#....#..', x: '..........#...#.#.#...#...#.#.#...#',
  ':': '......##...##.........##...##......', '.': '.........................##...##...', '-': '...............#####...............', ' ': '...................................',
  '<': '....#...##..###.####..###...##....#',   // the rewind arrow
};
// one line of dot text with a black edge, as the camcorder keys it over the picture; p = the size of one dot in px. Returns the width.
// the tape smears its colour a little to each side of the white, as composite video does
function dots(g, text, x, y, p, align = 'left', color = '#f1f1e6') {
  const w = text.length * 6 * p - p; if (align === 'right') x -= w;
  for (const [fill, grow, dx] of [['rgba(0,0,0,0.85)', 0.5, 0], ['rgba(255,70,50,0.32)', 0.06, 0.45], ['rgba(50,200,255,0.28)', 0.06, -0.45], [color, 0.06, 0]]) {
    g.fillStyle = fill;
    for (let i = 0; i < text.length; i++) {
      const gl = GLYPH[text[i]] || GLYPH[' '];
      for (let k = 0; k < 35; k++) if (gl[k] === '#') g.fillRect(x + (i * 6 + (k % 5) + dx) * p - grow * p, y + Math.floor(k / 5) * p - grow * p, p * (1 + grow * 2), p * (1 + grow * 2));
    }
  }
  return w;
}

// ---------- under the covers: the checked quilt right in front of the lens, out of focus, lit only through the gap ----------
function quiltFabric(W, H) {
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'), r = rng(5150);
  const cell = W * 0.15;
  // slanted gingham, bowed along the folds
  const img = g.createImageData(W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x * 0.94 + y * 0.34 + Math.sin(y / H * 5.2 + x / W * 1.3) * W * 0.05, v = y * 0.94 - x * 0.34 + Math.sin(x / W * 4.1 + 0.8) * W * 0.06;
    const cu = Math.floor(u / cell) & 1, cv = Math.floor(v / cell) & 1, check = cu + cv;   // 0, 1 or 2: the gingham's three tones
    const fold = 0.62 + 0.38 * Math.sin(x / W * 7.5 + y / H * 3.1 + Math.sin(y / H * 6) * 1.4);
    const weave = ((x + y) & 1 ? 0.92 : 1.0) * (0.9 + 0.1 * Math.sin(x * 2.1) * Math.sin(y * 2.3));
    const base = [175, 92, 24][check] * fold * weave, i = (y * W + x) * 4;
    d[i] = base * 0.92; d[i + 1] = base * 0.95; d[i + 2] = base * 1.08; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // fuzz: loose fibres catching the light
  g.globalAlpha = 0.18; g.fillStyle = '#9aa3b8';
  for (let i = 0; i < W * H / 900; i++) g.fillRect(r() * W, r() * H, 1 + r() * 2, 1);
  g.globalAlpha = 1;
  return c;
}
// the slit the kid holds open to film through: the blanket hangs in a wavy edge across the top, the ridge over the chest crosses below it,
// and the two meet in a point on the left. Neither edge is smooth: cloth folds and bunches. lift raises the ridge (the chest breathing)
const slitTop = (x, W, H) => H * (0.215 + 0.022 * Math.sin(x / W * 5.1 + 1.2) + 0.011 * Math.sin(x / W * 13 + 0.4) + 0.03 * Math.exp(-((((x / W) - 0.86) / 0.06) ** 2)));   // (a fold hangs lower on the right)
const slitBot = (x, W, H, o) => H * (0.5 + 0.02 * Math.sin(x / W * 6.3 + 0.5) + 0.01 * Math.sin(x / W * 15 + 1.7) - (o.lift || 0));
const SLIT_TIP = [0.12, 0.39];
function quiltGap(g, W, H, o) {
  const x0 = W * SLIT_TIP[0], y0 = H * SLIT_TIP[1], x1 = W * 0.3, step = W * 0.015;
  g.beginPath(); g.moveTo(x0, y0);
  g.quadraticCurveTo(W * 0.2, slitTop(x1, W, H) + H * 0.02, x1, slitTop(x1, W, H));
  for (let x = x1; x <= W * 1.05; x += step) g.lineTo(x, slitTop(x, W, H));
  for (let x = W * 1.05; x >= x1; x -= step) g.lineTo(x, slitBot(x, W, H, o));
  g.quadraticCurveTo(W * 0.2, slitBot(x1, W, H, o) - H * 0.01, x0, y0);
  g.closePath();
}
// loose fibres standing off both edges of the slit, lit by the glow coming through it (fixed per position, so they ride with the cloth)
function fringe(g, W, H, o, glow) {
  const r = rng(808), n = 150;
  g.save(); g.lineCap = 'round'; g.filter = `blur(${(W * 0.0018).toFixed(2)}px)`;
  for (let i = 0; i < n; i++) {
    const top = i % 2 === 0, x = W * (0.16 + r() * 0.9), y = top ? slitTop(x, W, H) : slitBot(x, W, H, o);
    if (x < W * 0.3 && (top ? y > H * 0.33 : y < H * 0.45)) continue;
    const len = W * (0.006 + r() * 0.022), a = (top ? 1 : -1) * (Math.PI / 2 + (r() - 0.5) * 1.3);
    g.strokeStyle = `rgba(${150 + r() * 60 | 0},${160 + r() * 55 | 0},${190 + r() * 50 | 0},${(0.25 + r() * 0.45) * glow})`; g.lineWidth = W * (0.0012 + r() * 0.002);
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + (r() - 0.5) * len, y + Math.sin(a) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
  }
  g.restore();
}
function drawQuilt(cv, o) {
  const W = cv.width, H = cv.height, g = cv.getContext('2d');
  cv._fab ??= quiltFabric(W, H);
  cv._tmp ??= Object.assign(document.createElement('canvas'), { width: W, height: H });
  const t = cv._tmp.getContext('2d'), glow = o.glow ?? 1, v = (k) => Math.round(k * (0.55 + 0.45 * glow));
  t.globalCompositeOperation = 'source-over'; t.clearRect(0, 0, W, H); t.drawImage(cv._fab, 0, 0);
  // the cloth is right against the lens, so it is out of focus and nearly black: only the weave nearest the slit catches the glow
  const lg = t.createRadialGradient(W * 0.6, H * 0.36, W * 0.12, W * 0.6, H * 0.38, W * 0.72);
  lg.addColorStop(0, `rgb(${v(120)},${v(124)},${v(140)})`); lg.addColorStop(0.35, `rgb(${v(52)},${v(54)},${v(64)})`); lg.addColorStop(1, 'rgb(8,8,11)');
  t.globalCompositeOperation = 'multiply'; t.fillStyle = lg; t.fillRect(0, 0, W, H);
  t.globalCompositeOperation = 'destination-out'; quiltGap(t, W, H, o); t.fill();
  t.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, W, H);
  g.save(); g.filter = `blur(${(W * 0.009).toFixed(1)}px)`; g.drawImage(cv._tmp, 0, 0); g.restore();
  // the very edge of the cloth: a thin lit rim, then the fibres off it
  g.save(); g.beginPath(); g.rect(0, 0, W, H); quiltGap(g, W, H, o); g.clip('evenodd');
  g.filter = `blur(${(W * 0.004).toFixed(1)}px)`; g.strokeStyle = `rgba(175,185,215,${0.42 * glow})`; g.lineWidth = W * 0.007; quiltGap(g, W, H, o); g.stroke();
  g.restore();
  fringe(g, W, H, o, glow);
}

// ---------- the title in the kid's own hand: the same red crayon lettering as the drawing on the wall ----------
// upTo: how many letters are down so far (it is written on a letter at a time); the portrait title keeps clear of the platform's right-hand buttons
function kidTitle(cv, text, W, upTo = Infinity, portrait = false) {
  const S = Math.round(W * (portrait ? 0.175 : 0.2)); cv.width = Math.round(W * (portrait ? 0.82 : 0.92)); cv.height = Math.round(S * 1.7);
  const g = cv.getContext('2d'), r = rng(31337);
  g.clearRect(0, 0, cv.width, cv.height); g.font = `bold ${S}px "Gloria Hallelujah", "Comic Sans MS", sans-serif`; g.textBaseline = 'middle';
  const adv = [...text].map((ch) => (ch === ' ' ? S * 0.32 : g.measureText(ch).width * 0.9)), total = adv.reduce((a, b) => a + b, 0);
  let x = (cv.width - total) / 2;
  [...text].forEach((ch, i) => {
    if (ch !== ' ') {
      const dy = (r() - 0.5) * S * 0.12, rot = (r() - 0.5) * 0.3;   // (drawn or not, so the skips below come out the same as letters appear)
      if (i >= upTo) { x += adv[i]; return; }
      g.save(); g.translate(x + adv[i] / 2, cv.height * 0.52 + dy); g.rotate(rot);
      g.fillStyle = '#c8261c'; g.globalAlpha = 0.9; g.textAlign = 'center'; g.fillText(ch, 0, 0);
      g.globalAlpha = 0.35; g.fillText(ch, S * 0.02, S * 0.015);   // pressed twice, like a crayon
      g.restore();
    }
    x += adv[i];
  });
  // the wax skips on the paper
  g.globalCompositeOperation = 'destination-out'; g.globalAlpha = 1;
  for (let i = 0; i < cv.width * cv.height / 70; i++) { const w = 1 + r() * S * 0.05; g.fillRect(r() * cv.width, r() * cv.height, w, Math.max(1, w * 0.25)); }
  g.globalCompositeOperation = 'source-over';
}
export function makeOverlays(portrait) {
  if (document.getElementById('tr-black')) return overlayApi(portrait);
  const st = document.createElement('style'); st.id = 'tr-style'; st.textContent = CSS; document.head.appendChild(st);
  const mk = (id, html = '') => { const d = document.createElement('div'); d.id = id; d.className = 'tr'; d.innerHTML = html; document.body.appendChild(d); return d; };
  mk('tr-lb', '<i style="top:0"></i><i style="bottom:0"></i>');
  const canvas = (id) => { const c = document.createElement('canvas'); c.id = id; c.className = 'tr'; c.width = innerWidth; c.height = innerHeight; c.style.width = '100%'; c.style.height = '100%'; document.body.appendChild(c); return c; };
  canvas('tr-acc'); canvas('tr-quilt'); canvas('tr-cam');
  if (portrait) document.body.classList.add('tr-portrait');
  mk('tr-black'); mk('tr-flash');
  mk('tr-cards', '<canvas class="kid"></canvas><div class="big"></div><div class="small"></div><div class="line"></div>');
  mk('tr-cap', '<div></div>');
  // a blur along one axis, for a whip pan or a fall: the few exposures of a smeared frame run together into one streak instead of stacked copies
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.style.position = 'absolute';
  svg.innerHTML = '<filter id="tr-streak" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="0 0" edgeMode="duplicate"/></filter>';
  document.body.appendChild(svg);
  return overlayApi(portrait);
}
// the TV model's texture carries a real maker's badge (front panel and down the side): paint it out with the plastic around it
export function plainTv(scene) {
  let done = 0;
  scene.traverse((o) => {
    if (!o.isMesh || done) return;
    let p = o; while (p && !(p.userData && p.userData.prop === 'tv')) p = p.parent;
    const map = p && o.material && o.material.map, img = map && map.image;
    if (!img || !img.width) return;
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; const g = cv.getContext('2d'), k = img.width / 1024;
    g.drawImage(img, 0, 0);
    g.fillStyle = 'rgb(181,180,178)'; g.fillRect(381 * k, 710 * k, 95 * k, 21 * k);
    g.fillStyle = 'rgb(51,50,49)'; g.fillRect(509 * k, 747 * k, 30 * k, 80 * k);
    map.image = cv; map.needsUpdate = true; done = 1;
  });
  return !!done;
}
function overlayApi(portrait) {
  const $ = (id) => document.getElementById(id), W = () => innerWidth, H = () => innerHeight;
  const black = $('tr-black'), flash = $('tr-flash'), cards = $('tr-cards'), cap = $('tr-cap'), cam = $('tr-cam'), lb = $('tr-lb'), grain = $('grain'), quilt = $('tr-quilt'), acc = $('tr-acc');
  const big = cards.querySelector('.big'), small = cards.querySelector('.small'), line = cards.querySelector('.line'), kid = cards.querySelector('.kid'), capText = cap.firstElementChild;
  // sizes in px from the viewport (so a 360-wide preview and a 1080-wide render look the same)
  const px = (f) => Math.round((portrait ? W() : H()) * f) + 'px';
  big.style.fontSize = px(portrait ? 0.13 : 0.19); big.style.letterSpacing = px(0.012); small.style.fontSize = px(portrait ? 0.028 : 0.032); line.style.fontSize = px(portrait ? 0.084 : 0.07);
  const capSize = px(portrait ? 0.064 : 0.047), kidCapSize = px(0.074);
  capText.style.fontSize = capSize; if (!portrait) cap.style.paddingBottom = Math.round(H() * 0.12) + 'px';
  cam.style.filter = `blur(${(W() / 900).toFixed(2)}px)`;
  let kidText = '';
  const api = {
    black: (o) => { black.style.opacity = clamp(o, 0, 1); },
    flash: (o) => { flash.style.opacity = clamp(o, 0, 1); },
    // a centred title card: {big, small, line, alpha}; kid: a title in the kid's crayon lettering instead of type, written on as reveal goes 0..1
    card: (o) => {
      if (!o) { cards.style.opacity = 0; return; }
      const upTo = o.reveal === undefined ? Infinity : Math.ceil(clamp(o.reveal, 0, 1) * (o.kid || '').length), key = o.kid + '|' + upTo;
      if (o.kid && key !== kidText) { kidTitle(kid, o.kid, W(), upTo, portrait); kidText = key; }
      kid.style.display = o.kid ? 'block' : 'none';
      big.textContent = o.big || ''; small.textContent = o.small || ''; line.innerHTML = o.line || '';
      big.style.display = o.big ? '' : 'none'; small.style.display = o.small ? '' : 'none'; line.style.display = o.line ? '' : 'none';
      cards.style.opacity = clamp(o.alpha ?? 1, 0, 1);
    },
    // y: where the caption sits, as a share of the height (each shot puts it in the empty part of its own frame)
    // o: {left, w, align} to set it beside the subject instead of centred over it; kid: in the kid's red crayon instead of type
    caption: (text, alpha = 1, y = 0.58, o = {}) => {
      if (!text) { cap.style.opacity = 0; return; }
      capText.textContent = text; capText.style.top = (y * 100).toFixed(1) + '%'; cap.style.opacity = clamp(alpha, 0, 1);
      if (portrait) {
        capText.style.left = ((o.left ?? 0.08) * 100).toFixed(1) + '%'; capText.style.width = ((o.w ?? 0.7) * 100).toFixed(1) + '%'; capText.style.textAlign = o.align || 'center';
        capText.classList.toggle('kid', !!o.kid); capText.style.fontSize = o.kid ? kidCapSize : capSize;
      }
    },
    // the camcorder's on-screen text: {rec, blink, counter: '0:31:12', stamp: 'OCT 20 2004\n3:12:40 AM', zoom: 'x2.0', rew, search, tracking}
    // only the date and time on a story take (it is what tells the ten nights); REC and the counter where the recording itself matters
    // (kept clear of the platform's own buttons and text: nothing above 12% or below 75% of the height)
    camcorder: (o) => {
      if (!o) { cam.style.display = 'none'; return; }
      cam.style.display = 'block';
      const g = cam.getContext('2d'), w = cam.width, h = cam.height, p = w * 0.0046, x0 = w * 0.08, y0 = h * 0.125, lh = p * 11;
      g.clearRect(0, 0, w, h);
      if (o.rew) dots(g, '<< ' + (o.counter || ''), x0, y0, p);
      else {
        if (o.rec) {
          g.fillStyle = `rgba(226,38,27,${o.blink === false ? 0.12 : 1})`; g.beginPath(); g.arc(x0 + 2.5 * p, y0 + 3.5 * p, 2.7 * p, 0, Math.PI * 2); g.fill();
          dots(g, 'REC', x0 + 8 * p, y0, p); if (o.counter) dots(g, o.counter, x0 + 32 * p, y0, p);
        }
        if (o.zoom) dots(g, o.zoom, x0, o.rec ? y0 + lh : y0, p);
        const [d1, d2] = (o.stamp || '').split('\n'); if (d1) dots(g, d1, w * 0.92, y0, p, 'right'); if (d2) dots(g, d2, w * 0.92, y0 + lh, p, 'right');
      }
      // rewind-search: the picture plays fast backwards under bands of noise that roll down the frame (o.search: seconds into the search)
      if (o.search !== undefined) {
        const r = rng(Math.floor(o.search * 97) + 5);
        for (let b = 0; b < 3; b++) {
          const by = ((b * 0.37 + o.search * 1.9) % 1.15 - 0.08) * h, bh = h * (0.025 + r() * 0.03);
          for (let y = by; y < by + bh; y += Math.max(1, p * 0.55)) {
            let x = -r() * w * 0.1;
            while (x < w) { const len = w * (0.02 + r() * 0.18); g.fillStyle = `rgba(${r() < 0.6 ? '225,228,235' : '8,8,10'},${0.3 + r() * 0.5})`; g.fillRect(x, y, len, Math.max(1, p * 0.5)); x += len + r() * w * 0.06; }
          }
        }
      }
      // a tracking error across a splice: a band of torn lines (o.tracking: 0..1)
      if (o.tracking > 0) {
        const r = rng(Math.floor(o.trackSeed || 1)), by = h * (0.3 + r() * 0.45), bh = h * 0.05;
        for (let y = by; y < by + bh; y += Math.max(1, p * 0.6)) {
          let x = -r() * w * 0.2;
          while (x < w) { const len = w * (0.03 + r() * 0.25); g.fillStyle = `rgba(${r() < 0.5 ? '235,235,235' : '10,10,10'},${(0.25 + r() * 0.5) * o.tracking})`; g.fillRect(x, y, len, Math.max(1, p * 0.5)); x += len + r() * w * 0.12; }
        }
      }
    },
    // the streak blur: [sx, sy] in px at 360 wide; returns the css filter that applies it ('' for none)
    streak: (s) => {
      if (!s || (Math.abs(s[0]) < 0.3 && Math.abs(s[1]) < 0.3)) return '';
      const k = W() / 360; document.querySelector('#tr-streak feGaussianBlur').setAttribute('stdDeviation', `${(Math.abs(s[0]) * k).toFixed(2)} ${(Math.abs(s[1]) * k).toFixed(2)}`);
      return 'url(#tr-streak)';
    },
    // the quilt in front of the lens (p_bunk): {lift, glow} or null
    quilt: (o) => { if (!o) { quilt.style.display = 'none'; return; } quilt.style.display = 'block'; drawQuilt(quilt, o); },
    // motion blur: the exposures of one frame averaged over the picture (overlays stay on top, sharp)
    acc: { clear() { acc.style.display = 'none'; acc._n = 0; },
      add(src, filter) { const g = acc.getContext('2d'); acc._n = (acc._n || 0) + 1; g.globalAlpha = 1 / acc._n; g.drawImage(src, 0, 0, acc.width, acc.height); g.globalAlpha = 1; acc.style.filter = filter || 'none'; },
      show() { acc.style.display = 'block'; } },
    letterbox: (on) => { lb.style.display = on ? 'block' : 'none'; const h = Math.round(H() * (1 - (W() / H()) / 2.39) / 2); for (const i of lb.children) i.style.height = h + 'px'; },
    grain: (x, y, alpha = 0.55) => { if (grain) { grain.style.transform = `translate(${x}%, ${y}%)`; grain.style.opacity = alpha; } },
    hideFade: () => { const f = $('fade'); if (f) { f.style.transition = 'none'; f.style.opacity = '0'; } },
  };
  return api;
}

// ---------- the game: what a shot can ask for ----------
export function gameHelpers(game) {
  const { F, P, W, E, UI, camera, scene, mom, dad, WF, nights } = game;
  const flash = camera.children.find((c) => c.isSpotLight) || null;
  let vigilOn = false;
  // what a shot may borrow and must give back: the hall spot (the day shot uses it as sun through the window), the eyes' glow, the smile
  const bs = W.bathSpot, bath0 = { pos: bs.position.clone(), target: bs.target.position.clone(), color: bs.color.clone(), angle: bs.angle, penumbra: bs.penumbra };
  const eyeMat = (E.head.children.find((m) => m.isMesh && m !== E.smile && m.material && m.material.toneMapped === false) || {}).material || null, eye0 = eyeMat ? eyeMat.color.clone() : null;
  const H = {
    // every shot starts from the same quiet house, so the order of shots never changes what a shot shows
    reset() {
      F.cutscene = true; P.mode = 'cine'; F.dead = false; F.chase = false; F.flicker = false; F.fear = 0; F.breathCheck = false; F.scare = false;
      if (vigilOn) H.vigil(false);
      F.blackout = false;
      bs.position.copy(bath0.pos); bs.target.position.copy(bath0.target); bs.target.updateMatrixWorld(); bs.color.copy(bath0.color); bs.angle = bath0.angle; bs.penumbra = bath0.penumbra;
      if (eyeMat) eyeMat.color.copy(eye0); E.smile.visible = true; E.root.rotation.set(0, E.root.rotation.y, 0);
      E.visible = false; E.mode = 'idle'; E.lean = 0; E.reach = 0; E.tilt = 0; E.smileScale = 1; E.speed = 1; E.lookTarget = camera.position; E.root.scale.setScalar(1);
      UI.blanket(false); UI.pod(null); W.tvFx.set(false); W.tvFx.figure = 0; W.mirrorFx.hide(); W.phone.setRinging(false);
      if (W.hallFrame) W.hallFrame.reset();
      WF.t = -1; WF.root.visible = false; W.faceLight.intensity = 0;
      H.flashlight(false); W.bathSpot.intensity = 0;
      W.setDoor('kid', true, true); W.setDoor('bath', true, true); W.setDoor('parents', false, true); W.setDoor('room2', false, true);
      W.moveTeddy(6.83, 0.55, 3.0); if (W.teddy) W.teddy.visible = true;
      mom.busy = dad.busy = true; mom.lookAt = dad.lookAt = null; mom.pose = dad.pose = null;
    },
    // lighting phases (setPhase recompiles shaders when the set of lights changes, so only call it on a change)
    phase(p) {
      if (F.phase !== p) game.setPhase(p, true);
      if (p === 'night') game.nlMult(1, false);
    },
    dusk() {   // the title lighting, warmed into a real dusk: a porch light on a blue evening
      H.phase('title');
      scene.fog = new THREE.FogExp2(0x0b1226, 0.02); scene.background = new THREE.Color(0x0b1226);
      W.hemi.intensity = 0.55; W.hemi.color.set(0x5c74b8); W.sun.intensity = 1.1; W.sun.color.set(0x7d8fd6); W.sun.position.set(-40, 30, 50);
      W.porchLight.intensity = 9; W.porchBulb.material.emissiveIntensity = 5;
      game.renderer.toneMappingExposure = 0.95;
    },
    night(o = {}) {
      H.phase('night');
      if (o.lights !== undefined) game.nlMult(o.lights, false);
      W.bathSpot.intensity = o.spot || 0; F.flicker = !!o.flicker;
    },
    flashlight(on) { if (flash) flash.intensity = on ? 26 : 0; F.flashOn = !!on; },
    // the thing: {x, z, face:[x, z] | yaw, mode, speed, tilt, lean, reach, smile}
    thing(o) {
      E.visible = true; E.mode = o.mode || 'idle'; E.speed = o.speed ?? 1;
      if (o.x !== undefined) E.root.position.set(o.x, o.y || 0, o.z);
      if (o.face) E.faceTowards(o.face[0], o.face[1], 1); else if (o.yaw !== undefined) E.root.rotation.y = o.yaw;
      E.tilt = o.tilt ?? 0.3; E.lean = o.lean ?? 0; E.reach = o.reach ?? 0; E.smileScale = o.smile ?? 1;
      E.lookTarget = o.look === false ? null : camera.position;
    },
    // the family
    person(who, { x, z, yaw = 0, visible = true, busy = true, look = null } = {}) {
      const p = who === 'mom' ? mom : dad;
      p.sleeping = false; p.group.rotation.order = 'XYZ'; p.group.rotation.set(0, yaw, 0); if (x !== undefined) p.group.position.set(x, 0, z);
      p.group.visible = visible; p.busy = busy; p.lookAt = look; p.pose = null; if (p.rig) p.rig.play('idle', { fade: 0.2, speed: 1 });
    },
    // the vigil (vigil.js is only reachable through the night type runner: with token 0 and F.live on, its wait never ends; nights.dawn() stops it cleanly)
    vigil(on) {
      if (on && !vigilOn) { vigilOn = true; F.live = true; F.dead = false; nights.TYPE_RUN.vigil({ type: 'vigil' }, 0); }
      else if (!on && vigilOn) { vigilOn = false; nights.dawn(0); F.script = false; F.live = false; F.blackout = false; }
    },
    windowFace(k = 0.2) { WF.face(); WF.t = k; },
    // look at p from this frame on, instead of turning there from wherever it last looked (a first frame has to be still)
    lookNow(p) { if (E.rig) { E.rig.look.set(p[0], p[1], p[2]); E.rig.lookW = 1; E.rig.hasLook = true; E.rig.yawNow = E.rig.pitchNow = undefined; } },
    // the eyes' brightness (1 as built): for eyes that switch on in the dark
    eyes(k) { if (eyeMat) eyeMat.color.copy(eye0).multiplyScalar(k); },
    // daylight through the kid's window: the hall spot, moved outside the glass and warmed
    sunPatch(i, at = [6.5, 0.3, 2.3]) { bs.position.set(7.95, 2.15, 2.85); bs.target.position.set(...at); bs.target.updateMatrixWorld(); bs.color.set(0xffd9a0); bs.angle = 0.5; bs.penumbra = 0.6; bs.intensity = i; },
    fear(v) { F.fear = Math.max(F.fear, v); },
    shake(v) { nights.D.shake(v); },
    door: (name, open) => W.setDoor(name, open, true),
  };
  return H;
}
