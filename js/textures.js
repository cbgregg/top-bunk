// Procedural canvas textures — no external image assets needed.
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

// 1 texture tile = 2m
export function woodFloor(base = 26) {
  const S = 512, [c, g] = mk(S), r = rng(7 + base);
  const rows = 8, ph = S / rows;
  for (let i = 0; i < rows; i++) {
    let x = -r() * S * 0.5;
    while (x < S) {
      const len = S * (0.35 + r() * 0.5);
      g.fillStyle = `hsl(${base + r() * 8},${30 + r() * 14}%,${20 + r() * 11}%)`;
      g.fillRect(x, i * ph, len, ph);
      for (let k = 0; k < 12; k++) {
        g.strokeStyle = `rgba(35,18,8,${0.08 + r() * 0.14})`; g.lineWidth = 0.6 + r() * 1.3;
        g.beginPath(); const y = i * ph + 3 + r() * (ph - 6); g.moveTo(x, y);
        for (let xx = x; xx < x + len; xx += 16) g.lineTo(xx, y + Math.sin(xx * 0.03 + k) * 1.4 + (r() - 0.5));
        g.stroke();
      }
      if (r() < 0.35) { g.fillStyle = 'rgba(30,15,6,0.5)'; g.beginPath(); g.ellipse(x + r() * len, i * ph + ph / 2, 5 + r() * 5, 3, 0, 0, 7); g.fill(); }
      g.fillStyle = 'rgba(12,6,3,0.9)'; g.fillRect(x, i * ph, 2, ph);
      x += len;
    }
    g.fillStyle = 'rgba(10,5,2,0.9)'; g.fillRect(0, i * ph, S, 2);
  }
  g.fillStyle = 'rgba(12,6,3,0.9)'; for (let i = 0; i < rows; i++) g.fillRect(0, i * ph, 2, ph);
  stains(g, S, r, 6, 'rgba(20,10,4,0.18)', 90);
  grain(g, S, S, 16, r);
  return toTex(c, { repeat: 0.5 });
}

// 1 tile = 1.6m
export function wallpaper() {
  const S = 512, [c, g] = mk(S), r = rng(11);
  g.fillStyle = '#8b866a'; g.fillRect(0, 0, S, S);
  for (let x = 0; x < S; x += 128) {
    g.fillStyle = 'rgba(228,218,182,0.2)'; g.fillRect(x + 10, 0, 44, S);
    g.fillStyle = 'rgba(55,50,32,0.28)'; g.fillRect(x + 62, 0, 3, S); g.fillRect(x + 70, 0, 1.5, S);
  }
  for (let y = 0; y < S; y += 64) for (let x = 0; x < S; x += 128) {
    const ox = (x + 32 + ((y / 64) % 2) * 64) % S, oy = y + 32;
    wrapDraw(S, S, (dx, dy) => {
      g.fillStyle = 'rgba(70,60,38,0.38)';
      g.beginPath(); g.ellipse(ox + dx, oy + dy - 4, 4, 10, 0, 0, 7); g.fill();
      g.beginPath(); g.ellipse(ox + dx - 8, oy + dy + 2, 7, 3, 0.6, 0, 7); g.fill();
      g.beginPath(); g.ellipse(ox + dx + 8, oy + dy + 2, 7, 3, -0.6, 0, 7); g.fill();
    });
  }
  stains(g, S, r, 10, 'rgba(70,50,20,0.16)', 110);
  stains(g, S, r, 6, 'rgba(30,25,15,0.12)', 50);
  grain(g, S, S, 14, r);
  return toTex(c, { repeat: 1 / 1.6 });
}

export function kidWallpaper() {
  const S = 512, [c, g] = mk(S), r = rng(23);
  g.fillStyle = '#5f7184'; g.fillRect(0, 0, S, S);
  const star = (x, y, R) => { g.beginPath(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, rr = i % 2 ? R * 0.45 : R; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fill(); };
  for (let i = 0; i < 46; i++) {
    const x = r() * S, y = r() * S, R = 5 + r() * 9;
    wrapDraw(S, S, (dx, dy) => {
      g.fillStyle = `rgba(232,220,170,${0.35 + r() * 0.2})`;
      if (r() < 0.8) star(x + dx, y + dy, R);
      else { g.beginPath(); g.arc(x + dx, y + dy, R, 0, 7); g.fill(); g.fillStyle = '#5f7184'; g.beginPath(); g.arc(x + dx + R * 0.45, y + dy - 2, R, 0, 7); g.fill(); }
    });
  }
  stains(g, S, r, 10, 'rgba(60,45,25,0.2)', 120);
  grain(g, S, S, 14, r);
  return toTex(c, { repeat: 1 / 1.6 });
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
  const S = 256, [c, g] = mk(S), r = rng(91 + seed);
  g.fillStyle = '#ad8352'; g.fillRect(0, 0, S, S);
  stains(g, S, r, 5, 'rgba(90,60,30,0.3)', 60);
  g.fillStyle = 'rgba(205,175,120,0.75)'; g.fillRect(S / 2 - 22, 0, 44, S);
  g.save(); g.translate(S / 2, S * 0.68); g.rotate((r() - 0.5) * 0.25);
  g.fillStyle = '#1b1612'; g.font = 'bold 30px "Permanent Marker", "Comic Sans MS", cursive'; g.textAlign = 'center';
  g.fillText(label, 0, 0); g.restore();
  grain(g, S, S, 14, r);
  return toTex(c, { wrap: false });
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

export function runner() {
  const W = 128, Hh = 512, [c, g] = mk(W, Hh), r = rng(121);
  g.fillStyle = '#5a1f1c'; g.fillRect(0, 0, W, Hh);
  g.fillStyle = '#2a1a14'; g.fillRect(0, 0, 10, Hh); g.fillRect(W - 10, 0, 10, Hh);
  g.fillStyle = '#9a7a4a'; g.fillRect(14, 0, 4, Hh); g.fillRect(W - 18, 0, 4, Hh);
  for (let y = 0; y < Hh; y += 64) {
    g.fillStyle = '#8a6a3a'; g.beginPath(); g.moveTo(W / 2, y + 8); g.lineTo(W - 34, y + 32); g.lineTo(W / 2, y + 56); g.lineTo(34, y + 32); g.closePath(); g.fill();
    g.fillStyle = '#2a3a4a'; g.beginPath(); g.arc(W / 2, y + 32, 8, 0, 7); g.fill();
  }
  grain(g, W, Hh, 26, r);
  return toTex(c, { repeat: [1, 9] });
}

// Crayon drawing left by the previous kid. v=0 day, v=1 night (it changed).
export function drawing(v = 0) {
  const W = 512, Hh = 384, [c, g] = mk(W, Hh), r = rng(v ? 99 : 42);
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
  g.font = 'bold 40px "Comic Sans MS", cursive'; g.fillStyle = '#b3201c';
  let x = v ? 30 : 190;
  for (const ch of words) {
    g.save(); g.translate(x, 375 - (v ? 0 : 0)); g.rotate((r() - 0.5) * 0.35);
    g.globalAlpha = 0.85; g.fillText(ch, 0, -(r() * 6)); g.restore(); x += ch === ' ' ? 14 : 27;
  }
  g.globalAlpha = 1;
  grain(g, W, Hh, 12, r);
  const t = toTex(c, { wrap: false }); return t;
}

export function painting(kind = 0) {
  const W = 256, Hh = 320, [c, g] = mk(W, Hh), r = rng(131 + kind);
  const gr = g.createLinearGradient(0, 0, 0, Hh);
  gr.addColorStop(0, kind ? '#2a2018' : '#3a3a30'); gr.addColorStop(1, '#14100c');
  g.fillStyle = gr; g.fillRect(0, 0, W, Hh);
  if (kind === 0) {
    g.fillStyle = '#23241c'; g.fillRect(0, 210, W, 110);
    g.fillStyle = '#4a1e18'; g.fillRect(60, 150, 120, 70);
    g.beginPath(); g.moveTo(52, 150); g.lineTo(120, 105); g.lineTo(188, 150); g.fill();
    g.fillStyle = '#0d0b08'; g.fillRect(105, 180, 30, 40);
    g.fillStyle = 'rgba(220,210,170,0.6)'; g.beginPath(); g.arc(200, 60, 14, 0, 7); g.fill();
  } else {
    // stern couple, faces worn away
    for (const [x, s] of [[85, 1], [170, 1.1]]) {
      g.fillStyle = '#16120e'; g.beginPath(); g.ellipse(x, 250 - s * 10, 45 * s, 90, 0, 0, 7); g.fill();
      g.fillStyle = '#8a7a62'; g.beginPath(); g.ellipse(x, 120 - s * 10, 26 * s, 32 * s, 0, 0, 7); g.fill();
      g.fillStyle = 'rgba(20,15,10,0.85)'; g.fillRect(x - 22 * s, 110 - s * 10, 44 * s, 10);
    }
  }
  stains(g, W, r, 6, 'rgba(0,0,0,0.35)', 80);
  grain(g, W, Hh, 18, r);
  return toTex(c, { wrap: false });
}

export function windowTex(phase) {
  const W = 256, Hh = 320, [c, g] = mk(W, Hh), r = rng(141);
  const gr = g.createLinearGradient(0, 0, 0, Hh);
  if (phase === 'night') { gr.addColorStop(0, '#0b1426'); gr.addColorStop(1, '#1c2c48'); }
  else if (phase === 'morning') { gr.addColorStop(0, '#f6d7a8'); gr.addColorStop(1, '#fff3dc'); }
  else { gr.addColorStop(0, '#9fc0e0'); gr.addColorStop(1, '#e6eef4'); }
  g.fillStyle = gr; g.fillRect(0, 0, W, Hh);
  if (phase === 'night') {
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.6})`; g.fillRect(r() * W, r() * Hh * 0.6, 1.5, 1.5); }
    const mg = g.createRadialGradient(180, 70, 0, 180, 70, 60); mg.addColorStop(0, 'rgba(220,230,255,0.9)'); mg.addColorStop(0.2, 'rgba(200,215,255,0.5)'); mg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = mg; g.fillRect(0, 0, W, Hh);
  }
  if (phase === 'morning') { const sg = g.createRadialGradient(60, 260, 0, 60, 260, 200); sg.addColorStop(0, 'rgba(255,240,200,1)'); sg.addColorStop(1, 'rgba(255,200,120,0)'); g.fillStyle = sg; g.fillRect(0, 0, W, Hh); }
  // tree line
  g.fillStyle = phase === 'night' ? '#05070c' : phase === 'morning' ? '#5a5040' : '#3a4a32';
  g.beginPath(); g.moveTo(0, Hh);
  for (let x = 0; x <= W; x += 8) g.lineTo(x, Hh - 50 - Math.abs(Math.sin(x * 0.09)) * 40 - r() * 20);
  g.lineTo(W, Hh); g.fill();
  // bare branches
  const branch = (x, y, a, len, w) => {
    if (len < 6) return;
    const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
    g.strokeStyle = phase === 'night' ? '#020305' : 'rgba(40,35,30,0.7)'; g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
    branch(x2, y2, a - 0.4 - r() * 0.3, len * 0.72, w * 0.7);
    branch(x2, y2, a + 0.3 + r() * 0.3, len * 0.68, w * 0.7);
  };
  branch(-5, 40, 0.15, 70, 7);
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
