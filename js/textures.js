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

// the bare mat in a picture frame: off-white board with a little tooth, shown until the frame's photograph loads
export function matboard() {
  const W = 128, Hh = 128, [c, g] = mk(W, Hh), r = rng(302);
  g.fillStyle = '#d8d0c0'; g.fillRect(0, 0, W, Hh);
  grain(g, W, Hh, 6, r);
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

// ---------- the printed and woven things a family has about the house (js/decor.js) ----------
// One sheet for all of them: the rugs, the posters and prints, the calendar, book spines, magazines, cereal boxes, tape labels, the mail,
// the cork board. Every box, towel and book in the house is then drawn with the same material, a room's worth of them in one mesh.
// Each picture is a cell on the sheet; `uv` gives a cell's corners [u0, v0, u1, v1] (v0 its bottom). All of it is drawn here: no
// brand, band or character is anyone's but this game's.
export function decorSheet(small = false) {
  const S = 2048, [c, g] = mk(S), PAD = 8, cells = [];
  const cell = (name, w, h, paint) => cells.push({ name, w, h, paint });
  const MARK = '"Permanent Marker", "Comic Sans MS", "Marker Felt", sans-serif', HAND = '"Gloria Hallelujah", "Comic Sans MS", cursive', TYPE = '"Courier Prime", "Courier New", monospace', SLAB = 'Georgia, "Times New Roman", serif', SANS = '"Arial Narrow", Arial, Helvetica, sans-serif';
  // lines of print too small to read: grey bars of uneven length
  const bars = (x, y, w, n, lh, color, r, th = 0.5) => { g.fillStyle = color; for (let i = 0; i < n; i++) g.fillRect(x, y + i * lh, w * (i === n - 1 ? 0.35 + r() * 0.4 : 0.8 + r() * 0.2), Math.max(1, lh * th)); };
  const poly = (pts, fill) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fillStyle = fill; g.fill(); };
  const text = (s, x, y, font, fill, align = 'center', maxW) => { g.font = font; g.fillStyle = fill; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(s, x, y, maxW); };
  // (getImageData and putImageData take no transform: the grain is laid in the sheet's own coordinates, at the cell being painted)
  let cur = null;
  const noise = (x, y, w, h, amt, r) => { const d = g.getImageData(cur.x + x, cur.y + y, w, h); for (let i = 0; i < d.data.length; i += 4) { const n = (r() - 0.5) * amt; d.data[i] += n; d.data[i + 1] += n; d.data[i + 2] += n; } g.putImageData(d, cur.x + x, cur.y + y); };
  // a painted view: sky, far hills, a field, and what stands in it ('barn', 'lake', 'field')
  const land = (x, y, w, h, r, kind = 'barn', tone = 0) => {
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    const sky = g.createLinearGradient(0, y, 0, y + h * 0.6); sky.addColorStop(0, tone ? '#c9a878' : '#8fb0c4'); sky.addColorStop(1, tone ? '#ead9b0' : '#dfe4d6'); g.fillStyle = sky; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(255,255,255,0.5)'; for (let i = 0; i < 4; i++) { const cx = x + r() * w, cy = y + h * (0.08 + r() * 0.22); g.beginPath(); g.ellipse(cx, cy, w * (0.08 + r() * 0.1), h * 0.03, 0, 0, 7); g.fill(); }
    const ridge = (y0, amp, fill, n = 7) => { g.beginPath(); g.moveTo(x, y + h); for (let i = 0; i <= n; i++) g.lineTo(x + w * i / n, y + h * (y0 + (r() - 0.5) * amp)); g.lineTo(x + w, y + h); g.closePath(); g.fillStyle = fill; g.fill(); };
    if (kind === 'lake') {
      ridge(0.34, 0.2, '#6f7f8f', 9); ridge(0.44, 0.1, '#4f6657', 11);
      g.fillStyle = '#7f9aa6'; g.fillRect(x, y + h * 0.56, w, h * 0.3);
      g.fillStyle = 'rgba(60,80,70,0.45)'; g.fillRect(x, y + h * 0.56, w, h * 0.07);
      g.strokeStyle = 'rgba(235,240,235,0.5)'; g.lineWidth = 1; for (let i = 0; i < 14; i++) { const yy = y + h * (0.6 + r() * 0.24), xx = x + r() * w; g.beginPath(); g.moveTo(xx, yy); g.lineTo(xx + w * (0.05 + r() * 0.12), yy); g.stroke(); }
      ridge(0.9, 0.05, '#3f4f38', 9);
      for (let i = 0; i < 5; i++) { const tx = x + w * (0.05 + r() * 0.25 + (i > 2 ? 0.62 : 0)), th = h * (0.25 + r() * 0.15); poly([[tx, y + h * 0.9 - th], [tx - th * 0.16, y + h * 0.92], [tx + th * 0.16, y + h * 0.92]], '#24382a'); }
    } else {
      ridge(0.45, 0.08, '#8b9d86', 9); ridge(0.52, 0.05, '#6f8a5a', 8);
      g.fillStyle = tone ? '#b79a55' : '#93a05a'; g.fillRect(x, y + h * 0.58, w, h * 0.42);
      g.strokeStyle = 'rgba(70,80,40,0.35)'; g.lineWidth = Math.max(1, h * 0.012); for (let i = -6; i < 14; i++) { g.beginPath(); g.moveTo(x + w * (0.5 + i * 0.03), y + h * 0.58); g.lineTo(x + w * (0.5 + i * 0.16), y + h); g.stroke(); }
      if (kind === 'barn') {
        const bx = x + w * 0.56, by = y + h * 0.4, bw = w * 0.26, bh = h * 0.24;
        g.fillStyle = '#8a2f26'; g.fillRect(bx, by, bw, bh); poly([[bx - bw * 0.06, by], [bx + bw * 0.5, by - bh * 0.5], [bx + bw * 1.06, by]], '#4a4640');
        g.fillStyle = '#e8e0cc'; g.fillRect(bx + bw * 0.38, by + bh * 0.45, bw * 0.24, bh * 0.55); g.fillStyle = '#5c1f1a'; g.fillRect(bx + bw * 0.49, by + bh * 0.45, bw * 0.02, bh * 0.55);
        g.fillStyle = '#b9bcbc'; g.fillRect(bx + bw * 1.1, by - bh * 0.25, bw * 0.16, bh * 1.25); g.beginPath(); g.ellipse(bx + bw * 1.18, by - bh * 0.25, bw * 0.08, bh * 0.1, 0, Math.PI, 0); g.fill();
      }
      for (let i = 0; i < 3; i++) { const tx = x + w * (0.1 + i * 0.13 + r() * 0.04), ty = y + h * (0.5 + r() * 0.05), tr = h * (0.09 + r() * 0.04); g.fillStyle = '#4a3a28'; g.fillRect(tx - 1, ty, Math.max(2, w * 0.008), tr * 1.2); g.fillStyle = i % 2 ? '#3f5a34' : '#55703c'; g.beginPath(); g.ellipse(tx, ty, tr * 0.8, tr, 0, 0, 7); g.fill(); }
      g.strokeStyle = '#5a4a36'; g.lineWidth = Math.max(1, h * 0.008); for (let i = 0; i < 9; i++) { const fx = x + w * i / 8; g.beginPath(); g.moveTo(fx, y + h * 0.86); g.lineTo(fx, y + h * 0.95); g.stroke(); } g.beginPath(); g.moveTo(x, y + h * 0.89); g.lineTo(x + w, y + h * 0.89); g.stroke();
    }
    for (let i = 0; i < w * h / 500; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '255,250,235' : '40,35,25'},${0.03 + r() * 0.05})`; g.fillRect(x + r() * w, y + r() * h, 2 + r() * 8, 1 + r() * 2); }   // brush marks
    g.restore();
  };
  const crayon = (pts, color, width, r, passes = 2) => { g.strokeStyle = color; g.lineCap = 'round'; g.lineJoin = 'round'; for (let p = 0; p < passes; p++) { g.lineWidth = width * (0.6 + r() * 0.6); g.globalAlpha = 0.6 + r() * 0.3; g.beginPath(); pts.forEach(([x, y], i) => { const jx = x + (r() - 0.5) * 2, jy = y + (r() - 0.5) * 2; i ? g.lineTo(jx, jy) : g.moveTo(jx, jy); }); g.stroke(); } g.globalAlpha = 1; };

  cell('white', 16, 16, (w, h) => { g.fillStyle = '#fff'; g.fillRect(-4, -4, w + 8, h + 8); });
  // cloth's nap: near white, a faint weave (a towel, a shirt, a blanket take their colour from the mesh)
  cell('nap', 128, 128, (w, h, r) => { g.fillStyle = '#f2f2f2'; g.fillRect(-4, -4, w + 8, h + 8); g.fillStyle = 'rgba(0,0,0,0.05)'; for (let i = 0; i < w; i += 4) g.fillRect(i, 0, 1, h); for (let i = 0; i < h; i += 4) g.fillRect(0, i, w, 1); noise(0, 0, w, h, 22, r); });
  // the living room rug: a worn red field in a navy border, a lattice of small diamonds, a long diamond in the middle, fringed ends
  cell('rug', 512, 640, (w, h, r) => {
    g.fillStyle = '#c4b792'; g.fillRect(-4, -4, w + 8, h + 8);
    g.strokeStyle = 'rgba(120,105,70,0.6)'; g.lineWidth = 1; for (let x = 2; x < w; x += 5) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (r() - 0.5) * 3, 14); g.moveTo(x, h); g.lineTo(x + (r() - 0.5) * 3, h - 14); g.stroke(); }
    g.fillStyle = '#27324a'; g.fillRect(0, 14, w, h - 28); g.fillStyle = '#b8a67c'; g.fillRect(14, 28, w - 28, h - 56); g.fillStyle = '#27324a'; g.fillRect(18, 32, w - 36, h - 64);
    const dia = (cx, cy, rx, ry, fill) => poly([[cx, cy - ry], [cx + rx, cy], [cx, cy + ry], [cx - rx, cy]], fill);
    for (let i = 0; i < 13; i++) { dia(18 + 20 + i * (w - 76) / 12, 50, 9, 11, i % 2 ? '#a8853f' : '#8a3a30'); dia(18 + 20 + i * (w - 76) / 12, h - 50, 9, 11, i % 2 ? '#a8853f' : '#8a3a30'); }
    for (let i = 0; i < 15; i++) { dia(38, 84 + i * (h - 168) / 14, 11, 9, i % 2 ? '#8a3a30' : '#a8853f'); dia(w - 38, 84 + i * (h - 168) / 14, 11, 9, i % 2 ? '#8a3a30' : '#a8853f'); }
    g.fillStyle = '#b8a67c'; g.fillRect(58, 70, w - 116, h - 140); g.fillStyle = '#7a2f2a'; g.fillRect(62, 74, w - 124, h - 148);
    for (let j = 0; j < 13; j++) for (let i = 0; i < 9; i++) { const cx = 84 + i * (w - 168) / 8 + (j % 2 ? (w - 168) / 16 : 0), cy = 98 + j * (h - 196) / 12; if (cx > w - 80) continue; dia(cx, cy, 7, 9, (i + j) % 3 ? '#5e2320' : '#a8853f'); }
    dia(w / 2, h / 2, 118, 190, '#27324a'); dia(w / 2, h / 2, 108, 176, '#b8a67c'); dia(w / 2, h / 2, 100, 164, '#6a2824'); dia(w / 2, h / 2, 52, 88, '#27324a'); dia(w / 2, h / 2, 40, 70, '#a8853f'); dia(w / 2, h / 2, 22, 40, '#7a2f2a');
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { dia(w / 2 + sx * 128, h / 2 + sy * 196, 30, 40, '#27324a'); dia(w / 2 + sx * 128, h / 2 + sy * 196, 18, 26, '#b8a67c'); }
    g.fillStyle = 'rgba(205,190,150,0.10)'; for (let i = 0; i < 40; i++) g.fillRect(r() * w, 20 + r() * (h - 40), 30 + r() * 90, 8 + r() * 30);   // worn patches
    noise(0, 0, w, h, 26, r);
  });
  // the hall runner: a quarter of its length, drawn to repeat end to end
  cell('runner', 160, 384, (w, h, r) => {
    g.fillStyle = '#2f4034'; g.fillRect(-4, -4, w + 8, h + 8); g.fillStyle = '#b3a37a'; g.fillRect(12, -4, 4, h + 8); g.fillRect(w - 16, -4, 4, h + 8); g.fillStyle = '#6e2b28'; g.fillRect(22, -4, w - 44, h + 8);
    g.fillStyle = '#b3a37a'; g.fillRect(28, -4, 2, h + 8); g.fillRect(w - 30, -4, 2, h + 8);
    for (let k = 0; k < 4; k++) { const cy = (k + 0.5) * h / 4; poly([[w / 2, cy - 38], [w / 2 + 36, cy], [w / 2, cy + 38], [w / 2 - 36, cy]], '#2f4034'); poly([[w / 2, cy - 26], [w / 2 + 24, cy], [w / 2, cy + 26], [w / 2 - 24, cy]], '#b3a37a'); poly([[w / 2, cy - 14], [w / 2 + 13, cy], [w / 2, cy + 14], [w / 2 - 13, cy]], '#6e2b28');
      for (const s of [-1, 1]) { poly([[w / 2 + s * 46, cy - 48 - 8], [w / 2 + s * 53, cy - 48], [w / 2 + s * 46, cy - 48 + 8], [w / 2 + s * 39, cy - 48]], '#a8853f'); poly([[w / 2 + s * 46, cy + 48 - 8], [w / 2 + s * 53, cy + 48], [w / 2 + s * 46, cy + 48 + 8], [w / 2 + s * 39, cy + 48]], '#a8853f'); } }
    noise(0, 0, w, h, 24, r);
  });
  cell('doormat', 192, 128, (w, h, r) => { g.fillStyle = '#6b5234'; g.fillRect(-4, -4, w + 8, h + 8); g.strokeStyle = '#2e2418'; g.lineWidth = 6; g.strokeRect(9, 9, w - 18, h - 18); text('WELCOME', w / 2, h / 2 + 2, `bold 30px ${SLAB}`, '#2e2418', 'center', w - 40); noise(0, 0, w, h, 46, r); });
  // a rag rug for the kitchen sink: woven bands
  cell('ragrug', 192, 112, (w, h, r) => { const cols = ['#7b8a8f', '#a39274', '#6d4f48', '#8e9a7a', '#c0b59a', '#55606e']; let y = -4; while (y < h + 4) { const t = 5 + r() * 6; g.fillStyle = cols[(r() * cols.length) | 0]; g.fillRect(-4, y, w + 8, t + 1); y += t; } g.fillStyle = 'rgba(0,0,0,0.12)'; for (let x = 0; x < w; x += 6) g.fillRect(x, 0, 1, h); noise(0, 0, w, h, 30, r); });
  // the throw over the couch: a cream and brown plaid
  cell('throw', 256, 256, (w, h, r) => { g.fillStyle = '#c8b994'; g.fillRect(-4, -4, w + 8, h + 8); for (let i = -64; i < w + 64; i += 64) { g.fillStyle = 'rgba(110,70,45,0.55)'; g.fillRect(i, -4, 20, h + 8); g.fillRect(-4, i, w + 8, 20); g.fillStyle = 'rgba(60,70,60,0.5)'; g.fillRect(i + 34, -4, 6, h + 8); g.fillRect(-4, i + 34, w + 8, 6); g.fillStyle = 'rgba(240,232,210,0.5)'; g.fillRect(i + 48, -4, 2, h + 8); g.fillRect(-4, i + 48, w + 8, 2); } g.fillStyle = 'rgba(0,0,0,0.06)'; for (let i = 0; i < w; i += 3) g.fillRect(i, 0, 1, h); noise(0, 0, w, h, 24, r); });
  // your posters
  cell('p_dino', 320, 448, (w, h, r) => {
    const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#d9b36a'); bg.addColorStop(0.55, '#b9703c'); bg.addColorStop(1, '#3d2a1c'); g.fillStyle = bg; g.fillRect(-4, -4, w + 8, h + 8);
    poly([[0, 300], [40, 262], [78, 284], [120, 250], [170, 276], [215, 240], [262, 270], [320, 246], [320, 448], [0, 448]], '#5a3d26');
    for (let i = 0; i < 7; i++) { const x = 14 + i * 48 + r() * 14, y = 300 + r() * 14; poly([[x, y], [x - 16, y + 44], [x + 16, y + 44]], '#33402a'); poly([[x, y - 18], [x - 12, y + 16], [x + 12, y + 16]], '#33402a'); }
    const D = '#1f2a1e'; g.save(); g.translate(18, 96);   // the tyrant lizard, in one dark shape
    poly([[20, 232], [70, 196], [118, 176], [150, 170], [176, 140], [186, 96], [176, 66], [196, 44], [240, 38], [276, 48], [284, 66], [264, 72], [282, 80], [278, 94], [236, 100], [222, 112], [226, 150], [214, 190], [196, 216], [198, 250], [214, 288], [236, 294], [236, 304], [196, 304], [180, 262], [166, 236], [148, 240], [150, 280], [166, 294], [166, 304], [128, 304], [124, 250], [104, 226], [60, 232]], D);
    poly([[214, 128], [240, 138], [250, 132], [248, 144], [236, 148], [216, 142]], D);
    g.fillStyle = '#e9d9a8'; g.fillRect(248, 54, 6, 5); poly([[240, 96], [244, 104], [248, 96], [252, 104], [256, 96], [260, 103], [264, 95]], '#e9d9a8'); g.restore();
    g.fillStyle = '#3d2a1c'; g.fillRect(0, 0, w, 74); text('DINOSAURS', w / 2, 40, `34px ${MARK}`, '#ead9a6', 'center', w - 30);
    g.fillStyle = '#ead9a6'; g.fillRect(14, h - 34, w - 28, 2); bars(40, h - 24, w - 80, 2, 8, 'rgba(234,217,166,0.7)', r);
    noise(0, 0, w, h, 14, r);
  });
  cell('p_rocket', 320, 448, (w, h, r) => {
    const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#141c33'); bg.addColorStop(0.7, '#2c3f66'); bg.addColorStop(1, '#6a5a6e'); g.fillStyle = bg; g.fillRect(-4, -4, w + 8, h + 8);
    g.strokeStyle = 'rgba(230,230,210,0.7)'; g.lineWidth = 1.5; for (let i = 0; i < 16; i++) { const x = 10 + r() * (w - 20), y = 70 + r() * 250, s = 2 + r() * 3; g.beginPath(); g.moveTo(x - s, y); g.lineTo(x + s, y); g.moveTo(x, y - s); g.lineTo(x, y + s); g.stroke(); }
    g.fillStyle = '#8c8a80'; g.beginPath(); g.ellipse(w / 2, h + 40, w * 0.8, 110, 0, 0, 7); g.fill(); g.fillStyle = 'rgba(0,0,0,0.18)'; for (let i = 0; i < 6; i++) { g.beginPath(); g.ellipse(30 + r() * (w - 60), h - 30 + r() * 20, 14 + r() * 16, 4 + r() * 3, 0, 0, 7); g.fill(); }
    g.save(); g.translate(w / 2 + 6, 236); g.rotate(0.22);
    poly([[-14, 96], [0, 176], [14, 96]], '#e8a23a'); poly([[-8, 96], [0, 146], [8, 96]], '#f3e3a0');
    poly([[-30, 40], [-58, 104], [-30, 92]], '#a4342c'); poly([[30, 40], [58, 104], [30, 92]], '#a4342c');
    g.fillStyle = '#e4e0d4'; g.beginPath(); g.moveTo(0, -120); g.bezierCurveTo(44, -70, 38, 30, 30, 96); g.lineTo(-30, 96); g.bezierCurveTo(-38, 30, -44, -70, 0, -120); g.fill();
    g.fillStyle = '#a4342c'; g.beginPath(); g.moveTo(0, -120); g.bezierCurveTo(22, -96, 28, -80, 30, -66); g.lineTo(-30, -66); g.bezierCurveTo(-28, -80, -22, -96, 0, -120); g.fill();
    g.fillStyle = '#a4342c'; g.fillRect(-32, 64, 64, 10); g.fillStyle = '#31466e'; g.fillRect(-13, -40, 26, 30); g.fillStyle = '#9db4d0'; g.fillRect(-9, -36, 18, 22);
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(8, -60, 22, 156); g.restore();
    text('BLAST OFF', w / 2, 40, `34px ${MARK}`, '#ead9a6', 'center', w - 30); bars(60, h - 22, w - 120, 1, 8, 'rgba(234,217,166,0.6)', r);
    noise(0, 0, w, h, 14, r);
  });
  cell('p_car', 448, 320, (w, h, r) => {
    g.fillStyle = '#c9a23c'; g.fillRect(-4, -4, w + 8, h + 8); g.fillStyle = '#b5892f'; for (let i = 0; i < 12; i++) poly([[w * 0.5, h * 0.52], [w * (i / 6 - 0.5) * 2, -10], [w * ((i + 0.5) / 6 - 0.5) * 2, -10]], '#b5892f');
    g.fillStyle = '#3a3a3c'; g.fillRect(-4, h * 0.66, w + 8, h); g.fillStyle = '#d8d2c0'; for (let i = 0; i < 9; i++) g.fillRect(i * 56 - 10, h * 0.82, 30, 5);
    for (let i = 0; i < 28; i++) { g.fillStyle = i % 2 ? '#1c1c1c' : '#e9e4d6'; g.fillRect(i * 16, h * 0.66 - 16, 16, 8); g.fillStyle = i % 2 ? '#e9e4d6' : '#1c1c1c'; g.fillRect(i * 16, h * 0.66 - 8, 16, 8); }
    g.save(); g.translate(60, 122);   // a stock car, side on
    poly([[0, 78], [6, 52], [70, 44], [112, 14], [214, 12], [262, 44], [322, 52], [334, 78], [322, 92], [10, 92]], '#a8322a');
    poly([[122, 22], [206, 20], [238, 44], [96, 44]], '#26303c'); g.fillStyle = '#a8322a'; g.fillRect(162, 18, 7, 28);
    g.fillStyle = '#e9e4d6'; g.fillRect(8, 64, 322, 7); g.beginPath(); g.ellipse(168, 68, 22, 20, 0, 0, 7); g.fill(); text('7', 168, 70, `bold 30px ${SLAB}`, '#1c1c1c');
    for (const x of [76, 262]) { g.fillStyle = '#151515'; g.beginPath(); g.arc(x, 92, 30, 0, 7); g.fill(); g.fillStyle = '#8f8f8a'; g.beginPath(); g.arc(x, 92, 14, 0, 7); g.fill(); g.fillStyle = '#151515'; g.beginPath(); g.arc(x, 92, 5, 0, 7); g.fill(); }
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 3; for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(6, 150 + i * 14); g.lineTo(46 - i * 6, 150 + i * 14); g.stroke(); }
    text('SPEEDWAY', w / 2, 50, `44px ${MARK}`, '#7a221c', 'center', w - 40); bars(120, 84, w - 240, 1, 8, 'rgba(60,40,20,0.5)', r);
    noise(0, 0, w, h, 14, r);
  });
  cell('pennant', 320, 128, (w, h, r) => { g.fillStyle = '#6d2430'; g.fillRect(-4, -4, w + 8, h + 8); g.fillStyle = '#d9cfae'; g.fillRect(-4, -4, 26, h + 8); text('TIGERS', 132, h / 2 + 2, `bold 50px ${SLAB}`, '#d9cfae', 'center', 190); noise(0, 0, w, h, 26, r); });
  // the kitchen calendar: a farm view over the month
  cell('calendar', 256, 384, (w, h, r) => {
    g.fillStyle = '#f1ede2'; g.fillRect(-4, -4, w + 8, h + 8); land(8, 8, w - 16, 196, r, 'barn');
    g.fillStyle = '#31323a'; g.fillRect(0, 0, w, 6); text('OCTOBER', w / 2, 226, `bold 22px ${SLAB}`, '#7a2a26');
    g.strokeStyle = '#8a8a86'; g.lineWidth = 1; const gx = 14, gy = 246, cw = (w - 28) / 7, ch = 25;
    for (let i = 0; i <= 7; i++) { g.beginPath(); g.moveTo(gx + i * cw, gy); g.lineTo(gx + i * cw, gy + ch * 5); g.stroke(); } for (let j = 0; j <= 5; j++) { g.beginPath(); g.moveTo(gx, gy + j * ch); g.lineTo(gx + 7 * cw, gy + j * ch); g.stroke(); }
    for (let d = 1; d <= 31; d++) { const k = d + 1, i = k % 7, j = (k / 7) | 0; text(String(d), gx + i * cw + 4, gy + j * ch + 8, `9px ${SANS}`, '#3a3a3a', 'left'); }
    g.strokeStyle = '#a8322a'; g.lineWidth = 2; for (const d of [4, 11, 18]) { const k = d + 1, i = k % 7, j = (k / 7) | 0; g.beginPath(); g.moveTo(gx + i * cw + 6, gy + j * ch + 20); g.lineTo(gx + i * cw + cw - 5, gy + j * ch + 11); g.stroke(); }
    g.font = `11px ${HAND}`; g.fillStyle = '#2a3a7a'; g.textAlign = 'left'; g.fillText('move in', gx + 4 * cw + 2, gy + 2 * ch + 19, cw * 2 - 4);
  });
  // prints for the walls
  cell('pr_barn', 384, 288, (w, h, r) => { g.fillStyle = '#e9e2cf'; g.fillRect(-4, -4, w + 8, h + 8); land(0, 0, w, h, r, 'barn', 1); });
  cell('pr_lake', 448, 288, (w, h, r) => { g.fillStyle = '#e9e2cf'; g.fillRect(-4, -4, w + 8, h + 8); land(0, 0, w, h, r, 'lake'); });
  cell('pr_field', 288, 224, (w, h, r) => { g.fillStyle = '#e9e2cf'; g.fillRect(-4, -4, w + 8, h + 8); land(0, 0, w, h, r, 'field'); });
  cell('pr_sampler', 224, 288, (w, h, r) => {
    g.fillStyle = '#e4dcc4'; g.fillRect(-4, -4, w + 8, h + 8); g.fillStyle = 'rgba(120,100,60,0.08)'; for (let i = 0; i < w; i += 3) g.fillRect(i, 0, 1, h); for (let i = 0; i < h; i += 3) g.fillRect(0, i, w, 1);
    for (let i = 0; i < 17; i++) { const x = 14 + i * 12.2; poly([[x, 12], [x + 5, 18], [x, 24], [x - 5, 18]], i % 2 ? '#8a3a40' : '#4f6a50'); poly([[x, h - 24], [x + 5, h - 18], [x, h - 12], [x - 5, h - 18]], i % 2 ? '#8a3a40' : '#4f6a50'); }
    for (let i = 0; i < 20; i++) { const y = 30 + i * 12; poly([[14, y], [19, y + 5], [14, y + 10], [9, y + 5]], i % 2 ? '#4f6a50' : '#8a3a40'); poly([[w - 14, y], [w - 9, y + 5], [w - 14, y + 10], [w - 19, y + 5]], i % 2 ? '#4f6a50' : '#8a3a40'); }
    text('Home', w / 2, 66, `italic 34px ${SLAB}`, '#3d4f6a'); text('Sweet Home', w / 2, 104, `italic 26px ${SLAB}`, '#3d4f6a', 'center', w - 50);
    g.fillStyle = '#8a3a40'; g.fillRect(74, 172, 76, 56); poly([[66, 174], [112, 136], [158, 174]], '#5a4a40'); g.fillStyle = '#e4dcc4'; g.fillRect(104, 196, 16, 32); g.fillRect(82, 184, 14, 14); g.fillRect(128, 184, 14, 14);
    g.fillStyle = '#4f6a50'; g.fillRect(34, 228, w - 68, 6); for (const x of [46, 176]) { g.fillStyle = '#5a4a40'; g.fillRect(x - 2, 196, 4, 32); poly([[x, 160], [x - 16, 204], [x + 16, 204]], '#4f6a50'); }
    noise(0, 0, w, h, 12, r);
  });
  cell('pr_map', 384, 288, (w, h, r) => {
    g.fillStyle = '#d8c79a'; g.fillRect(-4, -4, w + 8, h + 8); g.strokeStyle = 'rgba(90,70,40,0.25)'; g.lineWidth = 1; for (let i = 1; i < 8; i++) { g.beginPath(); g.moveTo(i * w / 8, 0); g.lineTo(i * w / 8, h); g.stroke(); } for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(0, i * h / 6); g.lineTo(w, i * h / 6); g.stroke(); }
    const blob = (cx, cy, rr, n, fill) => { g.beginPath(); for (let i = 0; i <= n; i++) { const a = i / n * 6.283, k = rr * (0.6 + r() * 0.6); const x = cx + Math.cos(a) * k * 1.3, y = cy + Math.sin(a) * k; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath(); g.fillStyle = fill; g.fill(); g.strokeStyle = '#5a4630'; g.lineWidth = 1.5; g.stroke(); };
    blob(110, 120, 62, 18, '#b9b27a'); blob(270, 100, 48, 15, '#c2a878'); blob(290, 210, 34, 12, '#b9b27a'); blob(80, 230, 22, 9, '#c2a878');
    g.strokeStyle = '#7a2a26'; g.lineWidth = 1.5; g.setLineDash([5, 4]); g.beginPath(); g.moveTo(96, 132); g.lineTo(150, 170); g.lineTo(236, 122); g.lineTo(280, 196); g.stroke(); g.setLineDash([]);
    g.strokeStyle = '#5a4630'; g.lineWidth = 2; g.strokeRect(8, 8, w - 16, h - 16); g.strokeRect(13, 13, w - 26, h - 26);
    g.save(); g.translate(336, 54); g.strokeStyle = '#5a4630'; g.lineWidth = 1.5; for (let i = 0; i < 4; i++) { g.rotate(Math.PI / 2); poly([[0, -24], [5, 0], [-5, 0]], i % 2 ? '#5a4630' : '#d8c79a'); g.stroke(); } g.restore();
    stains(g, w, r, 4, 'rgba(110,80,40,0.16)', 70); noise(0, 0, w, h, 14, r);
  });
  cell('pr_cert', 288, 224, (w, h, r) => { g.fillStyle = '#efe8d2'; g.fillRect(-4, -4, w + 8, h + 8); g.strokeStyle = '#8a7340'; g.lineWidth = 3; g.strokeRect(10, 10, w - 20, h - 20); g.lineWidth = 1; g.strokeRect(16, 16, w - 32, h - 32); text('Certificate', w / 2, 52, `italic 26px ${SLAB}`, '#3a3428'); bars(60, 78, w - 120, 1, 9, '#6a6252', r); text('of Merit', w / 2, 104, `italic 16px ${SLAB}`, '#3a3428'); g.fillStyle = '#6a6252'; for (let i = 0; i < 3; i++) g.fillRect(44, 128 + i * 12, w - 88, 1.5); g.fillRect(40, 190, 80, 1.5); g.fillRect(w - 120, 190, 80, 1.5); poly([[w / 2 - 10, 168], [w / 2 + 10, 168], [w / 2 + 14, 204], [w / 2, 194], [w / 2 - 14, 204]], '#8a2a2a'); poly([[w / 2, 156], [w / 2 + 14, 170], [w / 2, 184], [w / 2 - 14, 170]], '#b8963c'); });
  // book spines, side by side; then brighter thin ones for your shelf
  cell('spines', 1024, 160, (w, h, r) => {
    const pal = ['#5a2326', '#27324a', '#2f4634', '#8a7a52', '#1e1c1c', '#b9ad8c', '#8a6a2c', '#35585c', '#6b3d2a', '#4a3a55', '#7a2a26', '#3d4a3a'];
    for (let i = 0; i < 32; i++) {
      const x = i * 32, col = pal[(r() * pal.length) | 0], light = col === '#b9ad8c' || col === '#8a7a52', ink = light ? '#2a2620' : r() < 0.5 ? '#c9ab5c' : '#ddd5c0';
      g.fillStyle = col; g.fillRect(x, -4, 32, h + 8);
      const sh = g.createLinearGradient(x, 0, x + 32, 0); sh.addColorStop(0, 'rgba(0,0,0,0.35)'); sh.addColorStop(0.25, 'rgba(255,255,255,0.08)'); sh.addColorStop(0.75, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.4)'); g.fillStyle = sh; g.fillRect(x, -4, 32, h + 8);
      g.fillStyle = ink; const k = (r() * 4) | 0;
      if (k !== 3) { g.fillRect(x + 4, 12, 24, 2); g.fillRect(x + 4, h - 16, 24, 2); } if (k === 1) { g.fillRect(x + 4, 18, 24, 1); g.fillRect(x + 4, h - 22, 24, 1); }
      const n = 1 + ((r() * 3) | 0), tw = 3 + r() * 2; for (let j = 0; j < n; j++) g.fillRect(x + 16 - (n * (tw + 3)) / 2 + j * (tw + 3), 34 + r() * 10, tw, 46 + r() * 30);
      g.fillRect(x + 11, h - 40, 10, 8 + r() * 6);
    }
    noise(0, 0, w, h, 12, r);
  });
  cell('kidspines', 384, 128, (w, h, r) => {
    const pal = ['#c2452f', '#e0b23c', '#3c76a8', '#4f9a58', '#e8e2d0', '#d9772e', '#7a4f9a', '#2f6f7a'];
    for (let i = 0; i < 16; i++) { const x = i * 24, col = pal[(i * 3 + ((r() * 3) | 0)) % pal.length]; g.fillStyle = col; g.fillRect(x, -4, 24, h + 8); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + 22, -4, 2, h + 8); g.fillStyle = col === '#e8e2d0' ? '#c2452f' : '#f4efdf'; g.fillRect(x + 9, 18 + r() * 8, 5, 50 + r() * 30); g.fillRect(x + 6, h - 22, 12, 8); }
    noise(0, 0, w, h, 10, r);
  });
  // covers of books lying flat
  cell('cv_cook', 128, 168, (w, h, r) => { g.fillStyle = '#e6dcc0'; g.fillRect(-4, -4, w + 8, h + 8); g.fillStyle = '#a8322a'; g.fillRect(0, 0, w, 44); text('HOME', w / 2, 16, `bold 15px ${SLAB}`, '#f1e9d2'); text('COOKING', w / 2, 32, `bold 15px ${SLAB}`, '#f1e9d2'); g.fillStyle = '#6b4a2c'; g.beginPath(); g.ellipse(w / 2, 104, 38, 24, 0, 0, 7); g.fill(); g.fillStyle = '#d9b46a'; g.beginPath(); g.ellipse(w / 2, 100, 32, 18, 0, 0, 7); g.fill(); g.fillStyle = '#a8322a'; for (let i = 0; i < 5; i++) { g.beginPath(); g.ellipse(w / 2 - 18 + i * 9, 98 + (i % 2) * 5, 5, 4, 0, 0, 7); g.fill(); } bars(24, 142, w - 48, 2, 8, '#6a6252', r); });
  cell('cv_kid', 128, 128, (w, h, r) => { g.fillStyle = '#3c76a8'; g.fillRect(-4, -4, w + 8, h + 8); g.fillStyle = '#4f9a58'; g.fillRect(0, 84, w, 44); g.fillStyle = '#e8e2d0'; g.beginPath(); g.ellipse(64, 78, 26, 16, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(88, 62, 12, 11, 0, 0, 7); g.fill(); g.fillRect(44, 86, 6, 18); g.fillRect(76, 86, 6, 18); poly([[92, 50], [98, 40], [100, 54]], '#6b4a2c'); g.fillStyle = '#1c1c1c'; g.fillRect(92, 60, 3, 3); text('The Farm Dog', w / 2, 20, `15px ${MARK}`, '#f4efdf', 'center', w - 12); });
  cell('cv_novel', 112, 168, (w, h, r) => { g.fillStyle = '#27324a'; g.fillRect(-4, -4, w + 8, h + 8); g.fillStyle = '#c9ab5c'; g.fillRect(12, 28, w - 24, 2); g.fillRect(12, 76, w - 24, 2); bars(20, 40, w - 40, 3, 11, '#c9ab5c', r, 0.6); g.fillStyle = '#6a2824'; g.fillRect(30, 100, w - 60, 40); bars(26, 150, w - 52, 1, 8, '#ddd5c0', r); });
  cell('cv_note', 112, 144, (w, h, r) => { g.fillStyle = '#4a6a8a'; g.fillRect(-4, -4, w + 8, h + 8); g.fillStyle = '#e8e2d0'; g.fillRect(22, 30, w - 44, 34); g.fillStyle = '#3a3a3a'; g.fillRect(28, 42, w - 56, 1); g.fillRect(28, 52, w - 56, 1); g.fillStyle = '#b9bcbc'; for (let y = 6; y < h; y += 9) g.fillRect(3, y, 7, 3); });
  // magazines and the paper
  const mag = (name, title, bgc, tc, kind) => cell(name, 128, 168, (w, h, r) => { g.fillStyle = bgc; g.fillRect(-4, -4, w + 8, h + 8); land(0, 34, w, h - 34, r, kind, name === 'mag_farm' ? 1 : 0); g.fillStyle = bgc; g.fillRect(0, 0, w, 36); text(title, w / 2, 19, `bold 22px ${SLAB}`, tc, 'center', w - 10); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, h - 44, 70, 44); bars(5, h - 38, 60, 4, 9, '#f1ede2', r, 0.55); g.fillStyle = '#d6b23c'; g.fillRect(w - 34, 42, 30, 16); });
  mag('mag_farm', 'COUNTRY', '#7a2a26', '#f1e9d2', 'barn'); mag('mag_out', 'OUTDOORS', '#2f4634', '#e9d9a8', 'lake'); mag('mag_home', 'HOME', '#e6dcc0', '#3d4f6a', 'field');
  cell('mag_tv', 128, 168, (w, h, r) => { g.fillStyle = '#d6b23c'; g.fillRect(-4, -4, w + 8, h + 8); g.fillStyle = '#a8322a'; g.fillRect(0, 0, w, 40); text('TV WEEK', w / 2, 21, `bold 24px ${SLAB}`, '#f4efdf', 'center', w - 10); g.fillStyle = '#27324a'; g.fillRect(14, 52, w - 28, 72); g.fillStyle = '#c9a98a'; g.beginPath(); g.ellipse(w / 2, 82, 17, 21, 0, 0, 7); g.fill(); g.fillStyle = '#4a3a28'; g.beginPath(); g.ellipse(w / 2, 68, 19, 12, 0, Math.PI, 0); g.fill(); g.fillStyle = '#7a2a26'; g.fillRect(w / 2 - 26, 104, 52, 20); bars(14, 134, w - 28, 3, 10, '#3a2a1c', r, 0.55); });
  cell('paper', 256, 176, (w, h, r) => { g.fillStyle = '#d9d5c6'; g.fillRect(-4, -4, w + 8, h + 8); text('The County Ledger', w / 2, 18, `bold 20px ${SLAB}`, '#1e1c1c', 'center', w - 20); g.fillStyle = '#1e1c1c'; g.fillRect(8, 32, w - 16, 2); g.fillRect(8, 36, w - 16, 1); g.fillStyle = '#2a2a2a'; g.fillRect(10, 44, 150, 9); g.fillRect(10, 57, 120, 9); g.fillStyle = '#8a8a84'; g.fillRect(172, 44, 74, 56); g.fillStyle = '#5c5c58'; g.fillRect(172, 78, 74, 22); for (let c2 = 0; c2 < 4; c2++) bars(10 + c2 * 61, c2 < 3 ? 74 : 108, 54, c2 < 3 ? 16 : 10, 6, '#5a5a56', r, 0.45); noise(0, 0, w, h, 10, r); });
  // cereal boxes (their fronts)
  const cereal = (name, a, b, bgc, tc, flake) => cell(name, 128, 184, (w, h, r) => { g.fillStyle = bgc; g.fillRect(-4, -4, w + 8, h + 8); g.save(); g.translate(w / 2, 40); g.rotate(-0.07); text(a, 0, -10, `26px ${MARK}`, tc, 'center', w - 12); text(b, 0, 18, `26px ${MARK}`, tc, 'center', w - 12); g.restore(); g.fillStyle = '#f4f1e8'; g.beginPath(); g.ellipse(w / 2, 132, 46, 26, 0, 0, 7); g.fill(); g.fillStyle = '#d8d4c8'; g.beginPath(); g.ellipse(w / 2, 140, 40, 16, 0, 0, Math.PI); g.fill(); g.fillStyle = '#fbfaf4'; g.beginPath(); g.ellipse(w / 2, 124, 40, 16, 0, 0, 7); g.fill(); for (let i = 0; i < 26; i++) { const a2 = r() * 6.283, k = Math.sqrt(r()); g.fillStyle = flake[(r() * flake.length) | 0]; g.save(); g.translate(w / 2 + Math.cos(a2) * 34 * k, 123 + Math.sin(a2) * 11 * k); g.rotate(r() * 3); g.fillRect(-4, -3, 8, 6); g.restore(); } g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(6, h - 18, 36, 12); bars(9, h - 15, 30, 2, 5, '#3a3a3a', r); });
  cereal('cer_corn', 'CORN', 'CRISPS', '#d9a426', '#7a221c', ['#e0b64a', '#c9952c', '#edc970']); cereal('cer_wheat', 'WHEAT', 'SQUARES', '#31507a', '#f1e9d2', ['#b8894a', '#a3743a', '#c9a060']); cereal('cer_oat', 'HONEY', 'OATS', '#8a4a26', '#f3dfa0', ['#d9b46a', '#c9a050', '#e6c88a']);
  // labels down the spines of the family's tapes, in whoever's hand; two bought ones
  cell('vhs', 384, 128, (w, h, r) => { g.fillStyle = '#17171a'; g.fillRect(-4, -4, w + 8, h + 8); const names = ['XMAS 98', 'CARTOONS', 'WEDDING', 'BIRTHDAY 7', 'FISHING TRIP', 'TAPE 4', 'DO NOT ERASE', 'SCHOOL PLAY']; names.forEach((s, i) => { const x = (i % 2) * 192, y = ((i / 2) | 0) * 32; g.fillStyle = '#17171a'; g.fillRect(x, y, 192, 32); g.fillStyle = i % 3 ? '#e9e5d8' : '#e3dcc0'; g.fillRect(x + 26, y + 6, 140, 20); g.fillStyle = ['#a8322a', '#31507a', '#2f4634'][i % 3]; g.fillRect(x + 26, y + 6, 140, 3); text(s, x + 96, y + 18, `13px ${i % 2 ? HAND : MARK}`, i % 2 ? '#1c2a6a' : '#1e1c1c', 'center', 128); }); });
  cell('vhs_toon', 96, 168, (w, h, r) => { g.fillStyle = '#e0b23c'; g.fillRect(-4, -4, w + 8, h + 8); g.fillStyle = '#3c76a8'; g.fillRect(0, 0, w, 40); text('CARTOON', w / 2, 13, `13px ${MARK}`, '#f4efdf', 'center', w - 8); text('PARADE', w / 2, 29, `13px ${MARK}`, '#f4efdf', 'center', w - 8); g.fillStyle = '#c2452f'; g.beginPath(); g.ellipse(w / 2, 96, 26, 30, 0, 0, 7); g.fill(); g.fillStyle = '#f4efdf'; g.fillRect(w / 2 - 14, 86, 9, 12); g.fillRect(w / 2 + 5, 86, 9, 12); g.fillStyle = '#1c1c1c'; g.fillRect(w / 2 - 10, 91, 4, 6); g.fillRect(w / 2 + 8, 91, 4, 6); g.strokeStyle = '#1c1c1c'; g.lineWidth = 3; g.beginPath(); g.arc(w / 2, 104, 12, 0.2, Math.PI - 0.2); g.stroke(); bars(12, 142, w - 24, 2, 9, '#5a3a1c', r); });
  cell('vhs_movie', 96, 168, (w, h, r) => { g.fillStyle = '#1c2230'; g.fillRect(-4, -4, w + 8, h + 8); land(6, 34, w - 12, 86, r, 'lake'); text('THE LONG', w / 2, 14, `bold 12px ${SLAB}`, '#d9c9a0', 'center', w - 8); text('ROAD HOME', w / 2, 27, `bold 12px ${SLAB}`, '#d9c9a0', 'center', w - 8); bars(12, 132, w - 24, 3, 9, '#8a8a84', r); });
  cell('vcr', 256, 56, (w, h, r) => { g.fillStyle = '#1b1b1d'; g.fillRect(-4, -4, w + 8, h + 8); g.fillStyle = '#0c0c0d'; g.fillRect(14, 10, 130, 20); g.fillStyle = '#2a2a2d'; g.fillRect(14, 10, 130, 3); g.fillStyle = '#06100a'; g.fillRect(162, 12, 52, 16); text('12:00', 188, 21, `bold 12px ${TYPE}`, '#3fae6a'); g.fillStyle = '#3a3a3e'; for (let i = 0; i < 5; i++) g.fillRect(162 + i * 17, 38, 12, 6); g.fillRect(224, 12, 20, 8); g.fillStyle = '#8a8a8c'; bars(16, 40, 60, 1, 6, '#6a6a6e', r); });
  cell('remote', 48, 160, (w, h, r) => { g.fillStyle = '#242426'; g.fillRect(-4, -4, w + 8, h + 8); g.fillStyle = '#a8322a'; g.fillRect(8, 8, 10, 7); g.fillStyle = '#5a5a5e'; for (let j = 0; j < 4; j++) for (let i = 0; i < 3; i++) g.fillRect(7 + i * 12, 26 + j * 11, 9, 6); g.fillStyle = '#7a7a80'; g.fillRect(14, 78, 20, 8); g.fillRect(14, 104, 20, 8); g.fillRect(6, 90, 9, 9); g.fillRect(33, 90, 9, 9); g.fillStyle = '#5a5a5e'; for (let i = 0; i < 3; i++) g.fillRect(7 + i * 12, 124, 9, 6); bars(10, 142, 28, 1, 5, '#8a8a8c', r); });
  // the post, a list, notes, what you drew at the old house
  cell('env', 128, 72, (w, h, r) => { g.fillStyle = '#ece8dc'; g.fillRect(-4, -4, w + 8, h + 8); bars(8, 8, 34, 3, 5, '#6a6a66', r); bars(44, 34, 54, 3, 7, '#3a3a3a', r, 0.4); g.fillStyle = '#7a2a26'; g.fillRect(w - 24, 6, 17, 20); g.strokeStyle = '#4a4a4a'; g.lineWidth = 1; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(w - 54, 10 + i * 5); g.lineTo(w - 28, 10 + i * 5); g.stroke(); } });
  cell('env2', 128, 72, (w, h, r) => { g.fillStyle = '#c9ab72'; g.fillRect(-4, -4, w + 8, h + 8); g.fillStyle = '#efeadc'; g.fillRect(30, 22, 70, 30); bars(36, 28, 56, 3, 7, '#3a3a3a', r, 0.4); });
  cell('flyer', 96, 128, (w, h, r) => { g.fillStyle = '#c2452f'; g.fillRect(-4, -4, w + 8, h + 8); g.fillStyle = '#f1dc8a'; g.fillRect(6, 34, w - 12, h - 40); text('PIZZA', w / 2, 13, `bold 18px ${SLAB}`, '#f1dc8a'); text('NIGHT', w / 2, 27, `bold 11px ${SLAB}`, '#f1dc8a'); poly([[w / 2, 46], [w / 2 + 26, 92], [w / 2 - 26, 92]], '#d98a2e'); g.fillStyle = '#a8322a'; g.fillRect(w / 2 - 6, 66, 6, 6); g.fillRect(w / 2 + 4, 78, 6, 6); g.fillRect(w / 2 - 12, 80, 6, 6); bars(12, 100, w - 24, 3, 7, '#5a2a1c', r); });
  cell('list', 80, 128, (w, h, r) => { g.fillStyle = '#f3efdf'; g.fillRect(-4, -4, w + 8, h + 8); g.strokeStyle = 'rgba(90,120,170,0.5)'; g.lineWidth = 1; for (let y = 22; y < h; y += 11) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } g.font = `10px ${HAND}`; g.fillStyle = '#1c2a6a'; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; ['milk', 'bread', 'eggs', 'light bulbs', 'batteries', 'night light', 'cereal', 'tape'].forEach((s, i) => g.fillText(s, 8, 20 + i * 11 + (r() - 0.5) * 2, w - 12)); });
  cell('sticky', 48, 48, (w, h, r) => { g.fillStyle = '#e8d66a'; g.fillRect(-4, -4, w + 8, h + 8); g.font = `10px ${HAND}`; g.fillStyle = '#2a2a2a'; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillText('call', 6, 16); g.fillText('Grandpa', 4, 30, 40); });
  cell('lined', 96, 128, (w, h, r) => { g.fillStyle = '#f4f1e6'; g.fillRect(-4, -4, w + 8, h + 8); g.strokeStyle = 'rgba(90,120,170,0.45)'; g.lineWidth = 1; for (let y = 18; y < h; y += 10) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } g.strokeStyle = 'rgba(190,80,80,0.5)'; g.beginPath(); g.moveTo(14, 0); g.lineTo(14, h); g.stroke(); });
  cell('draw_house', 160, 120, (w, h, r) => { g.fillStyle = '#efe9d6'; g.fillRect(-4, -4, w + 8, h + 8); crayon([[4, 104], [156, 102]], '#3f8a3a', 7, r); crayon([[46, 100], [46, 58], [104, 58], [104, 100]], '#b0452f', 5, r); crayon([[40, 60], [75, 30], [110, 60]], '#5a3a22', 5, r); crayon([[70, 100], [70, 78], [82, 78], [82, 100]], '#5a3a22', 4, r); crayon([[130, 24], [142, 24], [142, 36], [130, 36], [130, 24]], '#e0b23c', 6, r); for (const [x, y] of [[16, 86], [24, 62]]) crayon([[x, 100], [x, y]], '#5a3a22', 3, r); crayon([[10, 60], [30, 56], [34, 70], [12, 72], [10, 60]], '#3f8a3a', 6, r); });
  cell('draw_dog', 160, 120, (w, h, r) => { g.fillStyle = '#efe9d6'; g.fillRect(-4, -4, w + 8, h + 8); crayon([[6, 100], [154, 98]], '#3f8a3a', 7, r); crayon([[46, 80], [46, 58], [104, 56], [106, 80]], '#8a5a2c', 9, r, 3); crayon([[104, 56], [122, 40], [130, 52], [116, 62]], '#8a5a2c', 8, r, 3); crayon([[52, 80], [52, 98]], '#8a5a2c', 5, r); crayon([[98, 80], [98, 98]], '#8a5a2c', 5, r); crayon([[46, 58], [30, 44]], '#8a5a2c', 4, r); crayon([[20, 20], [60, 16]], '#3c76a8', 6, r); text('BUDDY', 110, 22, `14px ${MARK}`, '#b0452f'); });
  cell('snap', 96, 72, (w, h, r) => { land(-2, -2, w + 4, h + 4, r, 'field'); for (const [x, s, col] of [[34, 1, '#7a2a26'], [50, 1.1, '#31507a'], [64, 0.7, '#c2452f']]) { g.fillStyle = '#c9a98a'; g.beginPath(); g.arc(x, 40 - 8 * s, 4 * s, 0, 7); g.fill(); g.fillStyle = col; g.fillRect(x - 4 * s, 40 - 4 * s, 8 * s, 16 * s); } });
  // the cork board by the phone
  cell('cork', 384, 288, (w, h, r) => {
    g.fillStyle = '#b08a58'; g.fillRect(-4, -4, w + 8, h + 8); for (let i = 0; i < 2600; i++) { g.fillStyle = r() < 0.5 ? 'rgba(80,55,30,0.25)' : 'rgba(215,180,130,0.25)'; g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 2); }
    const pin = (x, y, col) => { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x - 2, y - 1, 6, 6); g.fillStyle = col; g.fillRect(x - 3, y - 3, 6, 6); };
    const sheet = (x, y, sw, sh, rot, fill, body) => { g.save(); g.translate(x, y); g.rotate(rot); g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(-sw / 2 + 3, -sh / 2 + 3, sw, sh); g.fillStyle = fill; g.fillRect(-sw / 2, -sh / 2, sw, sh); body(sw, sh); g.restore(); pin(x, y - sh / 2 + 7, '#a8322a'); };
    sheet(70, 96, 96, 130, -0.04, '#f3efdf', (sw, sh) => { text('SCHOOL', 0, -sh / 2 + 16, `bold 13px ${SLAB}`, '#31507a'); g.strokeStyle = '#8a8a86'; g.lineWidth = 1; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(-sw / 2 + 8, -sh / 2 + 30 + i * 16); g.lineTo(sw / 2 - 8, -sh / 2 + 30 + i * 16); g.stroke(); } for (let i = 1; i < 5; i++) { g.beginPath(); g.moveTo(-sw / 2 + 8 + i * 16, -sh / 2 + 30); g.lineTo(-sw / 2 + 8 + i * 16, -sh / 2 + 110); g.stroke(); } });
    sheet(186, 78, 84, 64, 0.05, '#e9e5d8', (sw, sh) => { land(-sw / 2 + 5, -sh / 2 + 5, sw - 10, sh - 10, r, 'lake'); });
    sheet(290, 104, 100, 132, 0.03, '#f1dc8a', (sw, sh) => { text('TAKE OUT', 0, -sh / 2 + 18, `bold 14px ${SLAB}`, '#a8322a'); bars(-sw / 2 + 10, -sh / 2 + 36, sw - 20, 9, 9, '#5a2a1c', r); });
    sheet(176, 190, 110, 82, -0.06, '#efe9d6', (sw, sh) => { crayon([[-44, 26], [44, 24]], '#3f8a3a', 5, r); crayon([[-10, 22], [-10, -6], [22, -6], [22, 22]], '#b0452f', 4, r); crayon([[-16, -4], [6, -24], [28, -4]], '#5a3a22', 4, r); crayon([[-40, -24], [-28, -24], [-28, -12], [-40, -12], [-40, -24]], '#e0b23c', 5, r); });
    sheet(66, 222, 50, 50, 0.08, '#e8d66a', (sw, sh) => { g.font = `10px ${HAND}`; g.fillStyle = '#2a2a2a'; g.textAlign = 'center'; g.fillText('dentist', 0, -4); g.fillText('thurs 3:30', 0, 10, 44); });
    sheet(300, 226, 72, 46, -0.03, '#ece8dc', (sw, sh) => { bars(-sw / 2 + 6, -sh / 2 + 10, sw - 12, 4, 8, '#4a4a4a', r); });
    noise(0, 0, w, h, 10, r);
  });
  // games on your shelf (the long sides of their boxes), your blocks, the crayons' box
  cell('games', 192, 144, (w, h, r) => { [['CHECKERS', '#a8322a', '#f1e9d2'], ['FARM BINGO', '#2f6f7a', '#f3dfa0'], ['WORD HUNT', '#e0b23c', '#3a2a1c']].forEach(([s, bgc, tc], i) => { g.fillStyle = bgc; g.fillRect(-4, i * 48 - (i ? 0 : 4), w + 8, 48 + (i === 2 ? 4 : 0)); text(s, w / 2, i * 48 + 25, `bold 22px ${SLAB}`, tc, 'center', w - 30); g.fillStyle = tc; g.fillRect(8, i * 48 + 8, 3, 32); g.fillRect(w - 11, i * 48 + 8, 3, 32); }); });
  cell('blocks', 192, 48, (w, h, r) => { ['A', 'B', 'C', '7'].forEach((s, i) => { g.fillStyle = '#d9c08a'; g.fillRect(i * 48 - (i ? 0 : 4), -4, 48 + 4, h + 8); g.strokeStyle = ['#c2452f', '#3c76a8', '#4f9a58', '#e0b23c'][i]; g.lineWidth = 5; g.strokeRect(i * 48 + 5, 5, 38, 38); text(s, i * 48 + 24, 26, `bold 28px ${SLAB}`, ['#c2452f', '#3c76a8', '#4f9a58', '#b0452f'][i]); }); });
  cell('crayons', 96, 128, (w, h, r) => { g.fillStyle = '#e0b23c'; g.fillRect(-4, -4, w + 8, h + 8); poly([[0, 34], [w / 2, 60], [w, 34], [w, 74], [w / 2, 100], [0, 74]], '#3f8a3a'); text('CRAYONS', w / 2, 20, `bold 16px ${SLAB}`, '#2a4a2a', 'center', w - 10); text('24', w / 2, 68, `bold 22px ${SLAB}`, '#f1dc8a'); });
  // the garage: the bench's perforated hardboard, an old plate, a tin sign; the laundry's soap powder
  // more for the walls: tulips in a jug, a boat on the lake, a bird on a branch; the quilt on the blanket chest; labels for jars
  cell('pr_flowers', 224, 288, (w, h, r) => {
    g.fillStyle = '#d9cfb2'; g.fillRect(-4, -4, w + 8, h + 8); g.fillStyle = '#8a6a4a'; g.fillRect(-4, h * 0.78, w + 8, h); g.fillStyle = 'rgba(0,0,0,0.12)'; g.beginPath(); g.ellipse(w / 2 + 14, h * 0.8, 52, 9, 0, 0, 7); g.fill();
    const stems = [[-58, 96], [-30, 62], [-4, 44], [26, 60], [54, 92], [10, 84], [-40, 108]];
    g.strokeStyle = '#4f6a44'; g.lineWidth = 3; g.lineCap = 'round'; for (const [dx, ty] of stems) { g.beginPath(); g.moveTo(w / 2 + dx * 0.15, h * 0.56); g.quadraticCurveTo(w / 2 + dx * 0.5, (h * 0.56 + ty) / 2, w / 2 + dx, ty + 16); g.stroke(); }
    for (const [dx, ty] of [[-44, 150], [38, 142], [-20, 128]]) poly([[w / 2 + dx * 0.3, h * 0.55], [w / 2 + dx, ty], [w / 2 + dx * 0.75, ty + 30]], '#5f7a4c');
    stems.forEach(([dx, ty], i) => { const x = w / 2 + dx, c2 = ['#a8322a', '#d9a426', '#c9566a', '#e6dcc0', '#a8322a', '#d9a426', '#c9566a'][i]; poly([[x - 12, ty], [x - 6, ty + 8], [x, ty - 2], [x + 6, ty + 8], [x + 12, ty], [x + 10, ty + 24], [x, ty + 30], [x - 10, ty + 24]], c2); g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x, ty + 2, 10, 26); });
    g.fillStyle = '#4f6f8a'; g.beginPath(); g.moveTo(w / 2 - 24, h * 0.54); g.lineTo(w / 2 + 24, h * 0.54); g.bezierCurveTo(w / 2 + 50, h * 0.64, w / 2 + 44, h * 0.78, w / 2 + 28, h * 0.8); g.lineTo(w / 2 - 28, h * 0.8); g.bezierCurveTo(w / 2 - 44, h * 0.78, w / 2 - 50, h * 0.64, w / 2 - 24, h * 0.54); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(w / 2 - 26, h * 0.6, 8, h * 0.14); g.fillStyle = '#e6dcc0'; g.fillRect(w / 2 - 34, h * 0.66, 68, 5);
    for (let i = 0; i < w * h / 500; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '255,250,235' : '40,35,25'},${0.03 + r() * 0.05})`; g.fillRect(r() * w, r() * h, 2 + r() * 8, 1 + r() * 2); }
  });
  cell('pr_boat', 288, 224, (w, h, r) => {
    land(0, 0, w, h, r, 'lake', 1);
    const bx = w * 0.52, by = h * 0.7; poly([[bx - 44, by], [bx + 46, by], [bx + 34, by + 14], [bx - 34, by + 14]], '#6a2824'); g.fillStyle = '#e9e2cf'; g.fillRect(bx - 44, by - 3, 90, 4);
    g.fillStyle = '#4a3a28'; g.fillRect(bx - 2, by - 92, 3, 92); poly([[bx + 4, by - 90], [bx + 4, by - 8], [bx + 48, by - 8]], '#efe9d8'); poly([[bx - 5, by - 78], [bx - 5, by - 8], [bx - 36, by - 8]], '#d9cfb2');
    g.fillStyle = 'rgba(235,240,235,0.35)'; g.fillRect(bx - 40, by + 16, 84, 3); g.fillRect(bx - 28, by + 23, 60, 2);
  });
  cell('pr_bird', 224, 224, (w, h, r) => {
    g.fillStyle = '#cfd6c4'; g.fillRect(-4, -4, w + 8, h + 8);
    g.strokeStyle = '#5a4630'; g.lineCap = 'round'; g.lineWidth = 9; g.beginPath(); g.moveTo(-4, 168); g.quadraticCurveTo(110, 140, w + 4, 158); g.stroke(); g.lineWidth = 4; g.beginPath(); g.moveTo(150, 151); g.lineTo(196, 112); g.moveTo(52, 158); g.lineTo(24, 128); g.stroke();
    for (const [x, y, a] of [[198, 106, -0.7], [20, 122, 0.8], [180, 128, -0.3]]) { g.save(); g.translate(x, y); g.rotate(a); poly([[0, -14], [8, 0], [0, 14], [-8, 0]], '#5f7a4c'); g.restore(); }
    poly([[66, 118], [34, 150], [48, 152], [78, 132]], '#3d4f6a');
    g.fillStyle = '#4f6f8a'; g.beginPath(); g.ellipse(100, 116, 40, 27, -0.25, 0, 7); g.fill(); g.fillStyle = '#b8562c'; g.beginPath(); g.ellipse(112, 124, 26, 18, -0.25, 0, 7); g.fill();
    g.fillStyle = '#4f6f8a'; g.beginPath(); g.arc(136, 90, 19, 0, 7); g.fill(); poly([[152, 84], [170, 90], [152, 96]], '#c9a23c'); g.fillStyle = '#1c1c1c'; g.fillRect(140, 84, 5, 5);
    poly([[74, 104], [116, 100], [104, 124], [70, 122]], '#3d4f6a'); g.strokeStyle = '#3a2a1c'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(102, 140); g.lineTo(102, 152); g.moveTo(114, 139); g.lineTo(114, 150); g.stroke();
    noise(0, 0, w, h, 14, r);
  });
  cell('quilt', 192, 192, (w, h, r) => { const cs = ['#7a3a3a', '#c9bfa8', '#3d4f6a', '#8e9a7a', '#b8863c', '#d9cfb2']; for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { const x = i * 48, y = j * 48, a = cs[(i * 3 + j * 5) % 6], b = cs[(i * 2 + j + 3) % 6]; g.fillStyle = a; g.fillRect(x - (i ? 0 : 4), y - (j ? 0 : 4), 52, 52); if ((i + j) % 2) poly([[x, y], [x + 48, y], [x, y + 48]], b); else poly([[x + 24, y + 6], [x + 42, y + 24], [x + 24, y + 42], [x + 6, y + 24]], b); } g.strokeStyle = 'rgba(240,235,220,0.5)'; g.lineWidth = 1; g.setLineDash([3, 3]); for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(i * 48, 0); g.lineTo(i * 48, h); g.moveTo(0, i * 48); g.lineTo(w, i * 48); g.stroke(); } g.setLineDash([]); noise(0, 0, w, h, 24, r); });
  cell('lbl', 192, 40, (w, h, r) => { ['NAILS', 'SCREWS', 'BOLTS'].forEach((s, i) => { g.fillStyle = '#d9cfa6'; g.fillRect(i * 64 - (i ? 0 : 4), -4, 68, h + 8); text(s, i * 64 + 32, h / 2 + 1, `15px ${MARK}`, '#2a2622', 'center', 56); }); noise(0, 0, w, h, 14, r); });
  cell('pegboard', 384, 192, (w, h, r) => { g.fillStyle = '#8a6a48'; g.fillRect(-4, -4, w + 8, h + 8); g.fillStyle = 'rgba(40,26,14,0.55)'; for (let y = 6; y < h; y += 12) for (let x = 6; x < w; x += 12) g.fillRect(x - 1, y - 1, 2.5, 2.5); stains(g, w, r, 5, 'rgba(60,40,20,0.2)', 80); noise(0, 0, w, h, 12, r); });
  cell('plate', 192, 96, (w, h, r) => { g.fillStyle = '#d9d6c6'; g.fillRect(-4, -4, w + 8, h + 8); g.strokeStyle = '#2f5a3a'; g.lineWidth = 4; g.strokeRect(5, 5, w - 10, h - 10); text('FARM 482', w / 2, 54, `bold 38px ${SANS}`, '#2f5a3a', 'center', w - 24); text('EVERGREEN', w / 2, 18, `bold 12px ${SANS}`, '#2f5a3a'); stains(g, w, r, 4, 'rgba(110,70,30,0.3)', 40); noise(0, 0, w, h, 12, r); });
  cell('tinsign', 256, 160, (w, h, r) => { g.fillStyle = '#b8862c'; g.fillRect(-4, -4, w + 8, h + 8); g.fillStyle = '#7a221c'; g.fillRect(10, 10, w - 20, h - 20); g.strokeStyle = '#e6d6a6'; g.lineWidth = 2; g.strokeRect(16, 16, w - 32, h - 32); text('FEED', w / 2, 56, `bold 46px ${SLAB}`, '#e6d6a6'); text('& SEED', w / 2, 104, `bold 34px ${SLAB}`, '#e6d6a6'); bars(70, 130, w - 140, 1, 8, '#e6d6a6', r); stains(g, w, r, 6, 'rgba(60,30,10,0.35)', 50); noise(0, 0, w, h, 14, r); });
  cell('suds', 128, 160, (w, h, r) => { g.fillStyle = '#2f5a9a'; g.fillRect(-4, -4, w + 8, h + 8); const pts = []; for (let i = 0; i < 24; i++) { const a = i / 24 * 6.283, k = i % 2 ? 56 : 40; pts.push([w / 2 + Math.cos(a) * k, 70 + Math.sin(a) * k * 0.8]); } poly(pts, '#e8792a'); text('SUDS', w / 2, 72, `34px ${MARK}`, '#fbf6e2'); bars(20, 128, w - 40, 2, 9, '#dfe6f2', r); });
  cells.sort((a, b) => b.h - a.h);
  const uv = {}; let px = 0, py = 0, rowH = 0;
  for (const k of cells) { if (px + k.w + PAD > S) { px = 0; py += rowH + PAD; rowH = 0; } k.x = px + PAD / 2; k.y = py + PAD / 2; px += k.w + PAD; rowH = Math.max(rowH, k.h); uv[k.name] = [(k.x + 0.5) / S, 1 - (k.y + k.h - 0.5) / S, (k.x + k.w - 0.5) / S, 1 - (k.y + 0.5) / S]; }
  if (py + rowH + PAD > S) console.warn('decor sheet overflows:', py + rowH);
  const paint = () => {
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.fillStyle = '#808080'; g.fillRect(0, 0, S, S);
    cells.forEach((k, i) => { cur = k; g.save(); g.beginPath(); g.rect(k.x - PAD / 2, k.y - PAD / 2, k.w + PAD, k.h + PAD); g.clip(); g.translate(k.x, k.y); g.globalAlpha = 1; g.setLineDash([]); k.paint(k.w, k.h, rng(700 + i * 13)); g.restore(); });
  };
  paint();
  // a phone holds the sheet at half size
  let out = c;
  if (small) { out = mk(S / 2)[0]; out.getContext('2d').drawImage(c, 0, 0, S / 2, S / 2); }
  const tex = new THREE.CanvasTexture(out); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  redrawWhenFont(tex, ['20px "Permanent Marker"', '12px "Gloria Hallelujah"', '12px "Courier Prime"'], () => { paint(); if (small) out.getContext('2d').drawImage(c, 0, 0, S / 2, S / 2); });
  return { tex, uv };
}
