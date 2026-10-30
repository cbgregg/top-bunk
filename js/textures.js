// Procedural canvas textures: the drawing, the grin, the floral fabric, and the stand-ins until (or unless) the assets/pbr sets load (js/pbr.js).
import * as THREE from 'three';

export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
function mk(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function toTex(c, { srgb = true, wrap = true, repeat = 1 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (wrap) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  if (Array.isArray(repeat)) t.repeat.set(repeat[0], repeat[1]); else t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  return t;
}
function grain(g, w, h, amt, r) {
  const d = g.getImageData(0, 0, w, h);
  for (let i = 0; i < d.data.length; i += 4) {
    const n = (r() - 0.5) * amt;
    d.data[i] += n; d.data[i + 1] += n; d.data[i + 2] += n;
  }
  g.putImageData(d, 0, 0);
}
function wrapDraw(w, h, fn) { for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) fn(ox, oy); }
// web fonts are often not ready when the world is built (and iOS swaps `cursive` for a script face): draw with the fallback now, redraw once the font loads
function redrawWhenFont(tex, fonts, paint) {
  if (!document.fonts || !document.fonts.load) return;
  if (fonts.every((f) => document.fonts.check(f))) return;
  Promise.all(fonts.map((f) => document.fonts.load(f).catch(() => null))).then(() => { paint(); tex.needsUpdate = true; });
}
function stains(g, S, r, n, color, maxR) {
  for (let i = 0; i < n; i++) {
    const x = r() * S, y = r() * S, rad = maxR * (0.3 + r() * 0.7);
    wrapDraw(S, S, (ox, oy) => {
      const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
      gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
    });
  }
}

export function plaster() {
  const S = 256, [c, g] = mk(S), r = rng(5);
  g.fillStyle = '#bab2a1'; g.fillRect(0, 0, S, S);
  stains(g, S, r, 5, 'rgba(110,85,45,0.2)', 70);
  grain(g, S, S, 22, r);
  return toTex(c, { repeat: 0.5 });
}

// 1 tile texture = 1m, 8x8 tiles
export function tile() {
  const S = 512, [c, g] = mk(S), r = rng(31), n = 8, ts = S / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const l = 80 + r() * 6 - (r() < 0.06 ? 14 : 0);
    g.fillStyle = `hsl(45,8%,${l}%)`; g.fillRect(i * ts, j * ts, ts, ts);
  }
  g.fillStyle = '#6f695d';
  for (let i = 0; i <= n; i++) { g.fillRect(i * ts - 1.5, 0, 3, S); g.fillRect(0, i * ts - 1.5, S, 3); }
  stains(g, S, r, 8, 'rgba(90,75,40,0.18)', 80);
  grain(g, S, S, 10, r);
  return toTex(c, { repeat: 1 });
}

export function siding() {
  const S = 512, [c, g] = mk(S), r = rng(41), bh = 32;
  for (let y = 0; y < S; y += bh) {
    const gr = g.createLinearGradient(0, y, 0, y + bh);
    gr.addColorStop(0, '#d9d5c9'); gr.addColorStop(0.85, '#c3bfb2'); gr.addColorStop(1, '#6b675d');
    g.fillStyle = gr; g.fillRect(0, y, S, bh);
  }
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(80,70,55,${0.04 + r() * 0.08})`; g.fillRect(r() * S, 0, 2 + r() * 6, S); }
  stains(g, S, r, 6, 'rgba(70,65,45,0.15)', 90);
  grain(g, S, S, 14, r);
  return toTex(c, { repeat: 0.5 });
}

export function grass() {
  const S = 512, [c, g] = mk(S), r = rng(51);
  g.fillStyle = '#3f5226'; g.fillRect(0, 0, S, S);
  stains(g, S, r, 30, 'rgba(90,100,40,0.35)', 80);
  stains(g, S, r, 20, 'rgba(25,40,15,0.35)', 60);
  for (let i = 0; i < 5000; i++) {
    const x = r() * S, y = r() * S;
    g.strokeStyle = `hsla(${70 + r() * 30},${35 + r() * 25}%,${18 + r() * 22}%,0.7)`;
    g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 4, y - 4 - r() * 6); g.stroke();
  }
  grain(g, S, S, 12, r);
  return toTex(c, { repeat: 0.25 });
}

export function dirt() {
  const S = 256, [c, g] = mk(S), r = rng(61);
  g.fillStyle = '#5a4733'; g.fillRect(0, 0, S, S);
  stains(g, S, r, 20, 'rgba(40,30,20,0.4)', 40);
  stains(g, S, r, 15, 'rgba(120,100,70,0.25)', 30);
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${150 + r() * 60},${130 + r() * 50},${100 + r() * 40},0.5)`; g.fillRect(r() * S, r() * S, 1.5, 1.5); }
  grain(g, S, S, 20, r);
  return toTex(c, { repeat: 0.33 });
}

export function shingles() {
  const S = 512, [c, g] = mk(S), r = rng(71), rh = 32, tw = 48;
  for (let y = 0, row = 0; y < S; y += rh, row++) {
    for (let x = -(row % 2) * tw / 2; x < S; x += tw) {
      g.fillStyle = `hsl(210,6%,${14 + r() * 9}%)`; g.fillRect(x + 1, y, tw - 2, rh);
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x + 1, y + rh - 4, tw - 2, 4);
    }
  }
  stains(g, S, r, 8, 'rgba(60,80,40,0.25)', 80);
  grain(g, S, S, 18, r);
  return toTex(c, { repeat: 0.5 });
}

export function barnBoards() {
  const S = 512, [c, g] = mk(S), r = rng(81), bw = 48;
  for (let x = 0; x < S; x += bw) {
    g.fillStyle = `hsl(${4 + r() * 6},${45 + r() * 15}%,${22 + r() * 8}%)`; g.fillRect(x, 0, bw, S);
    g.fillStyle = 'rgba(15,5,3,0.8)'; g.fillRect(x, 0, 2, S);
  }
  for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(200,190,170,${0.05 + r() * 0.1})`; g.fillRect(r() * S, r() * S, 2 + r() * 10, 10 + r() * 80); }
  grain(g, S, S, 22, r);
  return toTex(c, { repeat: 0.33 });
}

export function cardboard(label = 'KIDS ROOM', seed = 1) {
  const S = 256, [c, g] = mk(S);
  const paint = () => {
    const r = rng(91 + seed);
    g.globalAlpha = 1; g.fillStyle = '#ad8352'; g.fillRect(0, 0, S, S);
    stains(g, S, r, 5, 'rgba(90,60,30,0.3)', 60);
    g.fillStyle = 'rgba(205,175,120,0.75)'; g.fillRect(S / 2 - 22, 0, 44, S);
    g.save(); g.translate(S / 2, S * 0.68); g.rotate((r() - 0.5) * 0.25);
    g.fillStyle = '#1b1612'; g.font = 'bold 30px "Permanent Marker", "Comic Sans MS", "Marker Felt", sans-serif'; g.textAlign = 'center';
    g.fillText(label, 0, 0); g.restore();
    grain(g, S, S, 14, r);
  };
  paint();
  const t = toTex(c, { wrap: false });
  redrawWhenFont(t, ['bold 30px "Permanent Marker"'], paint);
  return t;
}

export function plaid() {
  const S = 256, [c, g] = mk(S), r = rng(101);
  g.fillStyle = '#1e2a44'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < S; i += 64) {
    g.fillStyle = 'rgba(150,30,30,0.75)'; g.fillRect(i, 0, 22, S); g.fillRect(0, i, S, 22);
    g.fillStyle = 'rgba(220,200,150,0.35)'; g.fillRect(i + 40, 0, 3, S); g.fillRect(0, i + 40, S, 3);
  }
  grain(g, S, S, 18, r);
  return toTex(c, { repeat: 2 });
}

export function rug() {
  const S = 512, [c, g] = mk(S), r = rng(111);
  const cols = ['#6b2e2a', '#a0703f', '#3d4a5c', '#7d6a4a', '#5b3a2a'];
  for (let rad = S / 2; rad > 4; rad -= 14) {
    g.fillStyle = cols[Math.floor(r() * cols.length)];
    g.beginPath(); g.arc(S / 2, S / 2, rad, 0, 7); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 2; g.stroke();
  }
  grain(g, S, S, 20, r);
  const t = toTex(c, { wrap: false });
  return t;
}

// Crayon drawing left by the previous kid. v=0 day, v=1 night (it changed).
export function drawing(v = 0) {
  const W = 512, Hh = 384, [c, g] = mk(W, Hh);
  const paint = () => {
    const r = rng(v ? 99 : 42);
    g.globalAlpha = 1;
    g.fillStyle = '#ece4cf'; g.fillRect(0, 0, W, Hh);
    stains(g, W, r, 4, 'rgba(150,120,60,0.2)', 80);
    const crayon = (pts, color, width = 6, passes = 3) => {
      g.strokeStyle = color; g.lineCap = 'round'; g.lineJoin = 'round';
      for (let p = 0; p < passes; p++) {
        g.lineWidth = width * (0.6 + r() * 0.6); g.globalAlpha = 0.55 + r() * 0.35;
        g.beginPath();
        pts.forEach(([x, y], i) => { const jx = x + (r() - 0.5) * 4, jy = y + (r() - 0.5) * 4; i ? g.lineTo(jx, jy) : g.moveTo(jx, jy); });
        g.stroke();
      }
      g.globalAlpha = 1;
    };
    const fillRow = (x0, x1, y, color) => crayon([[x0, y], [x1, y + (r() - 0.5) * 5]], color, 6, 1);
    // ground
    crayon([[10, 345], [500, 340]], '#3f8a3a', 9);
    // bunk bed (right)
    const bx0 = 320, bx1 = 480;
    crayon([[bx0, 345], [bx0, 150]], '#7a4a22', 8); crayon([[bx1, 345], [bx1, 150]], '#7a4a22', 8);
    crayon([[bx0, 300], [bx1, 300]], '#7a4a22', 10); crayon([[bx0, 215], [bx1, 215]], '#7a4a22', 10);
    crayon([[bx0 + 10, 290], [bx1 - 10, 290]], '#3a5aa0', 12); crayon([[bx0 + 10, 205], [bx1 - 10, 205]], '#3a5aa0', 12);
    if (!v) {
      // kid asleep on top bunk
      g.fillStyle = '#e8b890'; g.beginPath(); g.arc(bx0 + 30, 188, 12, 0, 7); g.fill();
      crayon([[bx0 + 42, 192], [bx1 - 30, 192]], '#c33', 7);
    } else {
      // kid falling off the top bunk
      g.fillStyle = '#e8b890'; g.beginPath(); g.arc(275, 225, 12, 0, 7); g.fill();
      crayon([[280, 236], [262, 280]], '#c33', 7);
      crayon([[270, 260], [245, 250]], '#c33', 4); crayon([[270, 260], [290, 280]], '#c33', 4);
      crayon([[262, 280], [240, 300]], '#c33', 4); crayon([[262, 280], [280, 305]], '#c33', 4);
      crayon([[300, 200], [312, 192]], '#555', 3); crayon([[300, 215], [314, 210]], '#555', 3);
    }
    // the tall one
    const fx = v ? 230 : 95, top = 40;
    for (let y = top + 70; y < 260; y += 4) { const w = 28 + Math.sin((y - top) / 60) * 6; fillRow(fx - w, fx + w, y, '#111'); }
    for (let y = 260; y < 342; y += 4) { fillRow(fx - 26, fx - 12, y, '#111'); fillRow(fx + 12, fx + 26, y, '#111'); }
    if (v) {
      crayon([[fx + 28, 130], [fx + 80, 180], [fx + 105, 205]], '#111', 9);
      crayon([[fx - 28, 130], [fx + 30, 190], [fx + 95, 225]], '#111', 9);
    } else {
      crayon([[fx - 30, 125], [fx - 44, 220], [fx - 46, 300]], '#111', 8);
      crayon([[fx + 30, 125], [fx + 44, 220], [fx + 46, 300]], '#111', 8);
    }
    for (let y = top; y < top + 78; y += 3) { const dy = y - (top + 39); const w = Math.sqrt(Math.max(0, 39 * 39 - dy * dy)) * 0.95; fillRow(fx - w, fx + w, y, '#111'); }
    g.fillStyle = '#fff';
    g.beginPath(); g.ellipse(fx - 14, top + 30, 11, 13, 0, 0, 7); g.fill();
    g.beginPath(); g.ellipse(fx + 14, top + 30, 11, 13, 0, 0, 7); g.fill();
    g.fillStyle = '#000';
    g.beginPath(); g.arc(fx - 14 + (v ? 3 : 0), top + 32, 7, 0, 7); g.fill();
    g.beginPath(); g.arc(fx + 14 + (v ? 3 : 0), top + 32, 7, 0, 7); g.fill();
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(fx - 32, top + 46); g.quadraticCurveTo(fx, top + 82, fx + 32, top + 46); g.quadraticCurveTo(fx, top + 62, fx - 32, top + 46); g.fill();
    g.strokeStyle = '#111'; g.lineWidth = 1.5;
    for (let i = -24; i <= 24; i += 6) { g.beginPath(); g.moveTo(fx + i, top + 52); g.lineTo(fx + i, top + 66 - Math.abs(i) * 0.3); g.stroke(); }
    // words
    const words = v ? 'HE PUSHES' : 'HE WATCHES';
    g.font = 'bold 40px "Gloria Hallelujah", "Comic Sans MS", "Marker Felt", sans-serif'; g.fillStyle = '#b3201c';
    let x = v ? 30 : 190;
    for (const ch of words) {
      g.save(); g.translate(x, 375 - (v ? 0 : 0)); g.rotate((r() - 0.5) * 0.35);
      g.globalAlpha = 0.85; g.fillText(ch, 0, -(r() * 6)); g.restore(); x += ch === ' ' ? 14 : 27;
    }
    g.globalAlpha = 1;
    grain(g, W, Hh, 12, r);
  };
  paint();
  const t = toTex(c, { wrap: false });
  redrawWhenFont(t, ['bold 40px "Gloria Hallelujah"'], paint);
  return t;
}

// a pastel floral still life, shown in a frame until its photograph loads
export function painting() {
  const W = 256, Hh = 256, [c, g] = mk(W, Hh), r = rng(302);
  g.fillStyle = '#e9d9c3'; g.fillRect(0, 0, W, Hh);
  g.fillStyle = '#a9b9a0'; g.fillRect(0, 170, W, 86);
  g.fillStyle = '#5b7fa6'; g.beginPath(); g.moveTo(98, 250); g.quadraticCurveTo(80, 190, 108, 160); g.lineTo(148, 160); g.quadraticCurveTo(176, 190, 158, 250); g.fill();
  for (let i = 0; i < 16; i++) { const a = r() * 6.28, d = 20 + r() * 55; g.fillStyle = ['#c25a6e', '#e8b0b8', '#f4e6c0', '#9a5aa0'][i % 4]; g.beginPath(); g.arc(128 + Math.cos(a) * d, 110 + Math.sin(a) * d * 0.7, 14 + r() * 8, 0, 7); g.fill(); }
  g.strokeStyle = '#6d8461'; g.lineWidth = 5; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(128, 160); g.quadraticCurveTo(128 + (i - 2.5) * 22, 130, 128 + (i - 2.5) * 34, 90); g.stroke(); }
  grain(g, W, Hh, 10, r);
  return toTex(c, { wrap: false });
}

export function mattress() {
  const S = 128, [c, g] = mk(S), r = rng(151);
  g.fillStyle = '#d7d2c4'; g.fillRect(0, 0, S, S);
  for (let x = 0; x < S; x += 12) { g.fillStyle = 'rgba(70,90,130,0.45)'; g.fillRect(x, 0, 3, S); }
  stains(g, S, r, 3, 'rgba(140,110,50,0.3)', 30);
  grain(g, S, S, 10, r);
  return toTex(c, { repeat: 1 });
}

export function smile() {
  // Huge grin, white on transparent. Corners hook up toward the eyes.
  const W = 1024, Hh = 256, [c, g] = mk(W, Hh), r = rng(666);
  const L = 18, R = W - 18;
  const tt = (x) => (x - L) / (R - L);
  const hook = (t) => Math.pow(Math.abs(t - 0.5) * 2, 7);
  const top = (x) => { const t = tt(x); return 22 + Math.sin(t * Math.PI) * 78 - hook(t) * 18; };
  const bot = (x) => { const t = tt(x); return 22 + Math.sin(t * Math.PI) * 205 - hook(t) * 18; };
  const outline = () => { g.beginPath(); g.moveTo(L, top(L)); for (let x = L; x <= R; x += 3) g.lineTo(x, top(x)); for (let x = R; x >= L; x -= 3) g.lineTo(x, bot(x)); g.closePath(); };
  outline(); g.fillStyle = '#f4f1ea'; g.fill();
  g.save(); outline(); g.clip();
  const mid = (x) => top(x) * 0.45 + bot(x) * 0.55;
  // gap between the rows of teeth
  g.fillStyle = '#050505';
  g.beginPath(); for (let x = L; x <= R; x += 3) x === L ? g.moveTo(x, mid(x) - 3) : g.lineTo(x, mid(x) - 3); for (let x = R; x >= L; x -= 3) g.lineTo(x, mid(x) + 3); g.closePath(); g.fill();
  // narrow, uneven teeth
  for (let x = L + 8; x < R; x += 17 + r() * 6) {
    const w = 2.5 + r() * 2;
    g.beginPath(); g.moveTo(x - w, top(x) - 2); g.lineTo(x + w, top(x) - 2); g.lineTo(x + 0.6, mid(x) - 4); g.closePath(); g.fill();
    const x2 = x + 9;
    g.beginPath(); g.moveTo(x2 - w, bot(x2) + 2); g.lineTo(x2 + w, bot(x2) + 2); g.lineTo(x2 - 0.6, mid(x2) + 4); g.closePath(); g.fill();
  }
  const gg = g.createLinearGradient(0, 0, 0, Hh); gg.addColorStop(0, 'rgba(0,0,0,0.05)'); gg.addColorStop(1, 'rgba(40,30,20,0.3)');
  g.fillStyle = gg; g.fillRect(0, 0, W, Hh);
  g.restore();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// what the nights leave on the house, one quarter each on a transparent sheet: claw marks gouged through white paint (top left), a long wet
// bare footprint (top right), a sooty handprint with fingers far too long (bottom left), black crayon on a wall (bottom right).
// world.js maps each decal's uvs to its quarter, so everything stays inside its own 512 px with a margin.
export function marks() {
  const S = 1024, Q = 512, [c, g] = mk(S), r = rng(1313);
  // claws: four ragged furrows, pale wood in the middle and dirty at the edges
  for (let i = 0; i < 4; i++) {
    const x0 = 96 + i * 78 + r() * 14, y0 = 30 + i * 10 + r() * 20, len = 330 + r() * 50, bend = 30 + r() * 20;
    const at = (t) => [x0 + bend * Math.sin(t * 1.4) + t * 70, y0 + t * len];
    for (const [w, col] of [[15, 'rgba(46,34,24,0.85)'], [8, 'rgba(206,182,140,0.95)'], [3, 'rgba(120,92,62,0.8)']]) {
      g.beginPath();
      for (let k = 0; k <= 40; k++) { const t = k / 40, [x, y] = at(t), ww = w * Math.sin(Math.min(1, t * 1.3) * Math.PI) * (0.75 + r() * 0.5); g.lineTo(x - ww, y); }
      for (let k = 40; k >= 0; k--) { const t = k / 40, [x, y] = at(t), ww = w * Math.sin(Math.min(1, t * 1.3) * Math.PI) * (0.75 + r() * 0.5); g.lineTo(x + ww, y); }
      g.closePath(); g.fillStyle = col; g.fill();
    }
    g.fillStyle = 'rgba(206,182,140,0.8)';
    for (let k = 0; k < 6; k++) { const [x, y] = at(0.2 + r() * 0.6); g.fillRect(x + (r() - 0.5) * 30, y, 2 + r() * 3, 1.5); }   // flakes of paint
  }
  // a bare foot: heel, a narrow arch, the ball, and five long toes
  g.save(); g.translate(Q, 0); g.shadowColor = 'rgba(8,6,5,0.9)'; g.shadowBlur = 10; g.fillStyle = 'rgba(8,6,5,0.78)';
  g.beginPath(); g.ellipse(256, 400, 52, 70, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(214, 380); g.quadraticCurveTo(196, 260, 222, 170); g.lineTo(312, 170); g.quadraticCurveTo(296, 270, 300, 380); g.closePath(); g.fill();
  g.beginPath(); g.ellipse(262, 168, 66, 46, 0.1, 0, Math.PI * 2); g.fill();
  for (const [x, y, l, a] of [[214, 104, 70, -0.25], [242, 92, 76, -0.1], [268, 92, 72, 0.02], [292, 100, 62, 0.15], [314, 114, 50, 0.3]]) {
    g.beginPath(); g.ellipse(x + Math.sin(a) * l * 0.5, y - l * 0.5, 11, l * 0.55, a, 0, Math.PI * 2); g.fill();
  }
  g.restore();
  // a hand: the palm, then fingers half again too long, smudged
  g.save(); g.translate(0, Q); g.shadowColor = 'rgba(14,11,9,0.9)'; g.shadowBlur = 14; g.fillStyle = 'rgba(14,11,9,0.82)';
  g.beginPath(); g.ellipse(256, 380, 70, 84, 0, 0, Math.PI * 2); g.fill();
  for (const [x, a, l] of [[196, -0.3, 190], [232, -0.1, 230], [268, 0.04, 236], [302, 0.18, 206]]) {
    g.beginPath(); g.moveTo(x - 13, 330); g.quadraticCurveTo(x + Math.sin(a) * l * 0.5 - 14, 330 - l * 0.5, x + Math.sin(a) * l, 330 - l); g.quadraticCurveTo(x + Math.sin(a) * l * 0.5 + 14, 330 - l * 0.5, x + 13, 330); g.fill();
  }
  g.beginPath(); g.moveTo(320, 400); g.quadraticCurveTo(390, 360, 430, 290); g.lineTo(444, 300); g.quadraticCurveTo(410, 380, 330, 430); g.fill();   // the thumb
  g.restore();
  // crayon: a tall figure with long arms, white eyes and a wide smile, standing over a little bunk bed
  g.save(); g.translate(Q, Q); g.lineCap = 'round'; g.lineJoin = 'round';
  const wax = (pts, w = 7) => { for (let pass = 0; pass < 3; pass++) { g.strokeStyle = `rgba(12,12,14,${0.45 + pass * 0.15})`; g.lineWidth = w - pass * 2; g.beginPath(); pts.forEach(([x, y], k) => { const jx = x + (r() - 0.5) * 4, jy = y + (r() - 0.5) * 4; if (k) g.lineTo(jx, jy); else g.moveTo(jx, jy); }); g.stroke(); } };
  g.fillStyle = 'rgba(12,12,14,0.85)'; g.beginPath(); g.ellipse(200, 110, 46, 56, 0, 0, Math.PI * 2); g.fill();
  for (let k = 0; k < 30; k++) wax([[176 + r() * 48, 160], [172 + r() * 56, 330]], 6);   // the body, scribbled solid
  wax([[180, 330], [160, 460]]); wax([[220, 330], [244, 460]]);
  wax([[176, 190], [110, 300], [96, 420]]); wax([[224, 190], [300, 290], [330, 380]]);
  g.fillStyle = '#fff'; g.globalCompositeOperation = 'destination-out';
  for (const x of [184, 216]) { g.beginPath(); g.ellipse(x, 100, 9, 13, 0, 0, Math.PI * 2); g.fill(); }
  g.lineWidth = 5; g.strokeStyle = '#fff'; g.beginPath(); g.arc(200, 118, 26, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
  g.globalCompositeOperation = 'source-over';
  wax([[330, 470], [330, 360], [460, 360], [460, 470]], 6); wax([[330, 420], [460, 420]], 6);   // the bunk
  wax([[390, 360], [390, 330]], 5); g.beginPath(); g.arc(392, 320, 12, 0, Math.PI * 2); g.stroke();   // you, on top
  g.restore();
  return toTex(c, { wrap: false });
}

// dense fir needles: a tileable mat of short strokes in several greens
export function needles() {
  const S = 256, [c, g] = mk(S), r = rng(91);
  g.fillStyle = '#183020'; g.fillRect(0, 0, S, S);
  const cols = ['#27502b', '#173019', '#336a38', '#10231a', '#2d5a30', '#3d7440'];
  for (let i = 0; i < 2800; i++) {
    const x = r() * S, y = r() * S, a = r() * Math.PI, l = 6 + r() * 14;
    g.strokeStyle = cols[(r() * cols.length) | 0]; g.lineWidth = 0.8 + r() * 1.4;
    wrapDraw(S, S, (ox, oy) => { g.beginPath(); g.moveTo(x + ox, y + oy); g.lineTo(x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l); g.stroke(); });
  }
  return toTex(c, { repeat: [2, 2] });
}

// 90s floral print for the quilt and curtains: scattered roses with leaves on a faint stripe. 1 tile = 0.9 m.
export function floral(bg = '#c9a3a0', rose = '#a4505f', leaf = '#6d8461', seed = 41) {
  const S = 512, [c, g] = mk(S), r = rng(seed);
  g.fillStyle = bg; g.fillRect(0, 0, S, S);
  g.fillStyle = 'rgba(255,255,255,0.10)'; for (let x = 0; x < S; x += 64) g.fillRect(x, 0, 22, S);
  g.fillStyle = 'rgba(0,0,0,0.07)'; for (let x = 0; x < S; x += 64) g.fillRect(x + 30, 0, 3, S);
  const bloom = (x, y, R) => wrapDraw(S, S, (dx, dy) => {
    g.fillStyle = leaf; for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.7; g.beginPath(); g.ellipse(x + dx + Math.cos(a) * R * 1.35, y + dy + Math.sin(a) * R * 1.35, R * 0.75, R * 0.3, a, 0, 7); g.fill(); }
    for (let k = 0; k < 4; k++) { g.fillStyle = k % 2 ? rose : 'rgba(255,240,235,0.55)'; g.beginPath(); g.arc(x + dx, y + dy, R * (1 - k * 0.2), 0, 7); g.fill(); g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.arc(x + dx + R * 0.1, y + dy + R * 0.1, R * (0.8 - k * 0.2), 0.2, 2.6); g.fill(); }
  });
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) bloom((i + 0.5 * (j % 2)) * 128 + 24, j * 128 + 40, 20 + r() * 6);
  stains(g, S, r, 8, 'rgba(70,50,20,0.14)', 100);
  grain(g, S, S, 12, r);
  return toTex(c, { repeat: 1 / 0.9 });
}
