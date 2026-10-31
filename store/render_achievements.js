#!/usr/bin/env node
'use strict';
// Renders the Steam achievement icons from the live game: for every achievement in js/achievements.js, a 64x64 JPG for when it is
// unlocked and a greyed-out copy for when it is not, into store/achievements/ (<ID>.jpg and <ID>_locked.jpg).
//
//   node store/render_achievements.js                         -> store/achievements/*.jpg
//   node store/render_achievements.js --only NIGHT,GRANDPA    -> some of them (prefix match on the id)
//   node store/render_achievements.js --sheet DIR/sheet.png   -> also a contact sheet: each icon at 2x, 1x and locked, with its id
//   node store/render_achievements.js --port 8802 --quality high --size 256 --frames 3 --out DIR
//
// Each icon starts as a small square render of the game, set up the way store/shots.js sets up a screenshot (a phase, a camera, the
// thing posed somewhere, through window.__game), then it is framed and shrunk to 64x64 in the page. The ten nights share one render of
// the dawn window and get their number typed over it. The vigil and the drive run the game's own scripted scenes, which can't be wound
// back, so each of those gets a fresh page of its own.
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ARGS = process.argv.slice(2);
const opt = (name, def) => { const i = ARGS.indexOf('--' + name); return i >= 0 && ARGS[i + 1] && !ARGS[i + 1].startsWith('--') ? ARGS[i + 1] : def; };

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
  '.wav': 'audio/wav', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.hdr': 'application/octet-stream', '.woff2': 'font/woff2', '.md': 'text/markdown' };
function serve(port) {
  return new Promise((res) => {
    const s = http.createServer((q, r) => {
      let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0].split('#')[0]));
      if (!f.startsWith(ROOT)) { r.writeHead(403); r.end(); return; }
      if (f.endsWith(path.sep)) f += 'index.html';
      fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(d); } });
    }).listen(port, '127.0.0.1', () => res(s));
  });
}

// ---------- the scenes ----------
// Same shape as the shots in store/shots.js: `setup` runs in the page with g = window.__game and S = window.__shot, `after` once the loop
// has settled, just before the frames render. `fov` narrows the lens (most icons are a close crop of something small). `fresh` scenes
// get a page of their own. World positions are metres from js/world.js (shots.js lists the main ones).
const SCENES = [
  { id: 'box', fov: 40, what: 'A moving box in the yard, the truck behind it',
    setup: () => { const g = window.__game, S = window.__shot;
      g.setPhase('day'); S.look([0.7, 0.95, -11.35], [1.32, 0.24, -12.3]); } },
  { id: 'dawn', fov: 50, what: 'Your window at first light, from the middle of your room',
    setup: () => { const g = window.__game, S = window.__shot;
      g.setPhase('morning'); S.look([6.6, 1.45, 1.6], [8.1, 1.45, 2.85]); } },
  { id: 'drawing', fov: 40, what: 'The crayon drawing in the hall, by flashlight',
    setup: () => { const g = window.__game, S = window.__shot;
      g.setPhase('night'); S.flash(true, 1.2); g.W.drawingMat.map = g.W.T.drawing0; g.W.drawingMat.needsUpdate = true;
      S.look([5.6, 1.1, -1.0], [5.6, 1.08, -0.32]); } },
  { id: 'covers', fov: 56, what: 'Looking out from under the covers on the top bunk, at the open door',
    // (the blanket's peephole is sized for a wide screen; here it is opened up to fill a square)
    css: `#blanket{background:radial-gradient(ellipse 42% 36% at 50% 50%,rgba(0,0,0,0) 0%,rgba(0,0,0,0) 55%,rgba(16,20,36,0.96) 100%),
      repeating-linear-gradient(0deg,rgba(120,24,24,0.16) 0 9px,rgba(0,0,0,0) 9px 26px),repeating-linear-gradient(90deg,rgba(120,24,24,0.16) 0 9px,rgba(0,0,0,0) 9px 26px);
      background-color:rgba(12,15,28,0.97);-webkit-mask:radial-gradient(ellipse 42% 36% at 50% 50%,transparent 60%,#000 100%);mask:radial-gradient(ellipse 42% 36% at 50% 50%,transparent 60%,#000 100%)}`,
    setup: () => { const g = window.__game, S = window.__shot;
      g.setPhase('night'); g.UI.blanket(true); g.W.setDoor('kid', true, true); g.W.bathSpot.intensity = g.BATH_I * 0.8;
      S.look([6.13, 1.9, 3.02], [7.05, 1.3, -0.3]); } },
  { id: 'closet', fov: 60, what: 'From inside your closet, through the louvres, the thing standing in your room',
    // (the slats scaled down to the square, with a gap across the middle where its eyes are)
    css: '#pod.louvers{background:repeating-linear-gradient(180deg,rgba(7,7,9,0.985) 0 12px,rgba(7,7,9,0) 12px 24px);background-position:0 -6px;box-shadow:inset 0 0 50px 14px #000}',
    setup: () => { const g = window.__game, S = window.__shot;
      g.setPhase('night'); g.UI.pod('louvers'); S.thing([5.95, 0, 1.9], [5.85, 0.04], { tilt: 0.25, lean: 0.2 });
      S.look([5.85, 1.05, 0.04], [5.93, 2.15, 1.9]); } },
  { id: 'breath', fov: 60, hud: true, what: 'Under the covers, holding your breath, the meter run red',
    css: '#breath{bottom:12%} #breath span{font-size:22px;letter-spacing:5px} #breath div{width:200px;height:16px}',
    setup: () => { const g = window.__game, S = window.__shot;
      g.setPhase('night'); g.nlMult(0.3, false); g.UI.blanket(true);
      S.thing([6.03, 0, 1.55], [6.03, 3.02], { lean: 0.4, tilt: -0.35, smile: 1.18 }); S.look([6.13, 1.9, 3.02], [6.05, 2.4, 1.6]); g.F.breathUI = true; },
    after: () => { const g = window.__game; window.__freeze = true; g.UI.breath(0.2, true, true); } },
  { id: 'stare', fov: 40, what: 'It creeping up the hall toward you, in the flashlight',
    setup: () => { const g = window.__game, S = window.__shot;
      g.setPhase('night'); S.flash(true, 12);
      S.thing([5.3, 0, -0.9], [7.9, -0.9], { tilt: 0.4, lean: 0.5 }); S.look([7.9, 1.35, -0.9], [5.3, 1.55, -0.9]); } },
  { id: 'photo', fov: 40, what: 'The photo in the hall coming off the wall',
    setup: () => { const g = window.__game, S = window.__shot;
      g.setPhase('night'); S.flash(true, 4); if (g.W.hallFrame) g.W.hallFrame.pose(0.55);
      S.look([5.45, 1.25, -0.55], [4.85, 1.2, -1.3]); } },
  { id: 'tv', fov: 40, what: 'The living room TV on by itself, and someone like Dad in front of it',
    setup: () => { const g = window.__game, S = window.__shot;
      g.setPhase('night'); g.W.tvFx.set(true); g.W.tvFx.figure = 1;
      const d = g.dad; g.mom.group.visible = true; d.sleeping = false; d.busy = true; d.pose = null; d.lookAt = null; d.group.rotation.order = 'XYZ';
      d.group.rotation.set(0, Math.PI / 2, 0); d.group.position.set(2.3, 0, -3.5); d.group.visible = true;
      if (d.rig) d.rig.play('idle', { fade: 0, speed: 0.6 }); g.W.bedSleepers.one('dad', false);
      g.P.pos.set(-30, 0, -30); S.look([0.5, 1.35, -2.75], [2.7, 1.05, -3.3]); } },
  { id: 'bear', fov: 38, what: 'The bear on the bottom bunk in the morning',
    setup: () => { const g = window.__game, S = window.__shot;
      g.setPhase('morning'); g.W.moveTeddy(5.75, 0.55, 3.15); S.look([6.4, 0.95, 2.1], [5.78, 0.72, 3.12]); } },
  { id: 'reach', fov: 72, what: 'Caught: it lunges, arms out, and the screen goes red',
    css: '#flash{display:block !important;background:rgb(150,0,0) !important;opacity:0.16 !important;transition:none !important}',
    // (placed the way caught() in main.js places it: its head at your eye height, an arm's length away)
    setup: () => { const g = window.__game, S = window.__shot;
      g.setPhase('night'); S.flash(true, 16); S.look([6.5, 1.32, 2.4], [6.5, 1.25, 1.0]);
      S.thing([6.5, 1.32 - 2.4, 0.5], [6.5, 2.4], { reach: 1, lean: 0.12, smile: 1.3, tilt: 0.3 }); } },
  { id: 'taken', fov: 50, what: 'Night ten: it reaches for Dad outside their door',
    setup: () => { const g = window.__game, S = window.__shot;
      g.setPhase('night'); g.W.setDoor('parents', true, true); g.W.bathSpot.intensity = g.BATH_I * 0.8; g.sleepers(false);
      const d = g.dad; d.group.visible = true; d.busy = true; d.lookAt = null; d.pose = null; d.group.rotation.order = 'XYZ'; d.group.rotation.set(0, -Math.PI / 2, 0); d.group.position.set(6.85, 0, -0.9);
      if (d.rig) d.rig.play('idle', { fade: 0, speed: 1 });
      S.thing([7.5, 0, -0.9], [5.0, -0.9], { reach: 1, lean: 0.35, smile: 1.45, tilt: 0.6 }); S.flash(true, 8); S.look([5.0, 1.45, -0.9], [7.1, 1.65, -0.9]); } },
  { id: 'alone', fov: 52, what: 'Night ten, nobody coming: it at the foot of the top bunk',
    setup: () => { const g = window.__game, S = window.__shot;
      g.setPhase('night'); S.thing([6.4, 0, 1.6], [6.03, 3.02], { reach: 0.5, smile: 1.6, tilt: 0.4 });
      S.look([6.03, 2.24, 3.02], [6.35, 2.2, 1.6]); } },
  { id: 'porch', fov: 30, what: 'The last morning: it stands on the porch and waves',
    setup: () => { const g = window.__game, S = window.__shot;
      g.setPhase('morning'); g.W.frontDoor.setOpen(false);
      S.thing([1.9, 0.14, -5.6], [2.3, -10], { reach: 0.6, tilt: 0.4, smile: 1.25 }); S.look([2.25, 1.3, -10.5], [1.95, 1.5, -5.6]); } },
  { id: 'grin', fov: 26, what: 'Its face in the dark, nothing else',
    setup: () => { const g = window.__game, S = window.__shot;
      g.setPhase('night'); g.nlMult(0, false); S.thing([6.5, -0.85, 0.6], [6.5, 2.0], { smile: 1.35, tilt: 0.15 }); S.look([6.5, 1.55, 2.0], [6.5, 1.55, 0.6]); } },
  { id: 'grandpa', fresh: true, fov: 40, what: 'The vigil: grandpa in his chair, turned round with the thing\'s face',
    setup: async () => { const g = window.__game, before = new Set(g.scene.children);
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      g.setPhase('night'); g.F.live = true; g.nights.TYPE_RUN.vigil(g.nights.plan(5), 0);
      // walk up to him the way you would in the game: he talks, then turns round with the thing's eyes and grin, which glow
      const set = g.scene.children.find((o) => !before.has(o) && o.isGroup);
      const turned = () => { let on = false; if (set) set.traverse((o) => { const m = o.material; if (m && m.emissiveMap && m.emissive && m.emissive.r > 0.5) on = true; }); return on; };
      await sleep(5000);
      Object.assign(g.P, { yaw: Math.PI / 2, pitch: 0, mode: 'walk' }); g.P.pos.set(4.4, 0, -0.95); g.F.cutscene = false;
      for (const t0 = performance.now(); !turned() && performance.now() - t0 < 90000;) await sleep(50);
      if (!turned()) console.warn('grandpa never turned round; rendering him from behind');
      for (const t0 = g.gameTime; g.gameTime < t0 + 0.4;) await sleep(20);   // (the last of the turn)
      window.__freeze = true; } },
  { id: 'glove', fresh: true, fov: 62, what: 'The drive: the front seats, the glove box, the road through the windscreen',
    css: '#game canvas{filter:brightness(3.2) contrast(1.15)}',
    setup: async () => { const g = window.__game, plan = g.nights.plan(4);
      Object.assign(g.F, { clock: plan.clock0 + 11, cutscene: false, script: false, live: true }); g.nights.TYPE_RUN.car(plan, 0);
      // the drive runs in game time; wait for the empty front seats, then climb over
      await new Promise((res) => { const t = setInterval(() => { const p = g.F.carPrompt; if (p && /front/i.test(p.label)) { clearInterval(t); res(); } }, 250); });
      await g.F.carPrompt.act(); },
    after: () => { const g = window.__game; g.P.yaw = 0.08; g.P.pitch = -0.42; g.cam(); window.__freeze = true; } },
];

// achievement id -> scene, and what goes over it
const ICONS = {
  MOVING_DAY: { scene: 'box' },
  NIGHT_1: { scene: 'dawn', mark: '1' }, NIGHT_2: { scene: 'dawn', mark: '2' }, NIGHT_3: { scene: 'dawn', mark: '3' }, NIGHT_4: { scene: 'dawn', mark: '4' },
  NIGHT_5: { scene: 'dawn', mark: '5' }, NIGHT_6: { scene: 'dawn', mark: '6' }, NIGHT_7: { scene: 'dawn', mark: '7' }, NIGHT_8: { scene: 'dawn', mark: '8' },
  NIGHT_9: { scene: 'dawn', mark: '9' }, NIGHT_10: { scene: 'dawn', mark: '10' },
  ENDING_TAKEN: { scene: 'taken' },
  ENDING_ALONE: { scene: 'alone' },
  ENDING_BELIEVED: { scene: 'porch' },
  THE_DRAWING: { scene: 'drawing' },
  UNDER_THE_COVERS: { scene: 'covers' },
  HIDING_PLACE: { scene: 'closet' },
  HOLD_BREATH: { scene: 'breath' },
  STARE_DOWN: { scene: 'stare' },
  PHOTO_FELL: { scene: 'photo' },
  NOT_DAD: { scene: 'tv' },
  GRANDPA: { scene: 'grandpa' },
  GLOVE_BOX: { scene: 'glove' },
  FIRST_TRY: { scene: 'bear' },
  TRY_AGAIN: { scene: 'stare', mark: '13' },
  FLAWLESS: { scene: 'grin' },
};

// ---------- page-side helpers ----------
function installHelpers(quality) {
  const g = window.__game;
  g.gfx.auto = false; g.gfx.setQuality(quality, { save: false }); g.gfx.setRes(1);
  g.start();   // (the test mode: the loop runs, no title screen, no story, no achievements)
  window.__frames = 0; const render = g.gfx.render.bind(g.gfx); g.gfx.render = (dt) => { render(dt); window.__frames++; };
  window.__norender = true;
  const style = document.createElement('style'); document.head.appendChild(style);
  // the page's own grain and vignette are left off: the grade pass has both, and the icon frame adds its own vignette
  const base = '#vignette,#grain,#card,#achv,#flash{display:none}';
  const yawTo = (a, b) => Math.atan2(-(b[0] - a[0]), -(b[2] - a[2]));
  const pitchTo = (a, b) => Math.atan2(b[1] - a[1], Math.hypot(b[0] - a[0], b[2] - a[2]));
  const nlBase = g.W.nightLights.map((n) => n.base), fov0 = g.camera.fov;
  window.__shot = {
    reset() {
      window.__freeze = false; const E = g.E;
      g.W.nightLights.forEach((n, i) => { n.base = nlBase[i]; n.dead = false; });
      E.visible = false; E.lean = 0; E.reach = 0; E.tilt = 0; E.smileScale = 1; E.mode = 'idle'; E.lookTarget = null; E.root.scale.setScalar(1);
      g.UI.blanket(false); g.UI.pod(null); g.UI.hint(null); g.UI.objective(null); g.UI.subtitle(null); g.UI.prompt(null); g.UI.breath(1, false); g.UI.clock(null); g.UI.fade(0, 0);
      Object.assign(g.F, { breathUI: false, breathCheck: false, flicker: false, fear: 0, blackout: false, live: false, chase: false, cutscene: true, dead: false, scare: false, flashOn: false });
      g.P.pod = null; g.P.mode = 'cine'; g.P.breath = 1; g.P.roll = 0;
      g.W.tvFx.set(false); g.W.bathSpot.intensity = 0; g.W.porchLight.intensity = 0; this.flash(false);
      for (const k in g.W.doors) g.W.setDoor(k, false, true);
      if (g.W.hallFrame) g.W.hallFrame.reset();
      g.W.moveTeddy(6.83, 0.55, 3.0); g.W.drawingMat.map = g.W.T.drawing0; g.W.drawingMat.needsUpdate = true;
      g.camera.fov = fov0; g.camera.updateProjectionMatrix();
      this.hud(false); this.css('');
    },
    look(pos, at) { g.P.mode = 'cine'; g.P.cam.set(pos[0], pos[1], pos[2]); g.P.yaw = yawTo(pos, at); g.P.pitch = pitchTo(pos, at); g.P.roll = 0; g.F.cutscene = true; },
    flash(on, intensity = 26) { const l = g.camera.children.find((c) => c.isSpotLight); if (l) l.intensity = on ? intensity : 0; g.F.flashOn = on; },
    thing(pos, faceAt, o = {}) {
      const E = g.E; E.visible = true; E.mode = 'idle'; E.root.position.set(pos[0], pos[1], pos[2]); E.root.scale.setScalar(1);
      if (faceAt) E.faceTowards(faceAt[0], faceAt[1], 1);
      E.lean = o.lean || 0; E.reach = o.reach || 0; E.tilt = o.tilt || 0; E.smileScale = o.smile || 1; E.lookTarget = o.look === false ? null : g.camera.position;
    },
    hud(on) {
      document.getElementById('hud').style.visibility = on ? '' : 'hidden';
      for (const id of ['objective', 'prompt', 'hint', 'subtitle', 'stamina', 'clock', 'crosshair']) document.getElementById(id).style.visibility = on ? 'hidden' : '';
    },
    css(extra) { style.textContent = base + (extra || ''); },
  };
  window.__shot.css('');
}

// ---------- page-side framing: the render in, the two 64x64 JPEGs out ----------
async function composeIcon({ src, mark, size = 64 }) {
  const W = size * 4, img = new Image(); img.src = src; await img.decode();
  const cv = (n) => { const c = document.createElement('canvas'); c.width = c.height = n; return c; };
  const big = cv(W), x = big.getContext('2d');
  const s = Math.min(img.width, img.height);
  x.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, W, W);
  // a soft vignette, so every icon has the same dark edge to sit in
  const v = x.createRadialGradient(W / 2, W / 2, W * 0.28, W / 2, W / 2, W * 0.74);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.6)'); x.fillStyle = v; x.fillRect(0, 0, W, W);
  if (mark) {
    await document.fonts.load(`${W}px "Special Elite"`);
    const px = mark.length > 1 ? W * 0.5 : W * 0.6;
    x.font = `${px}px "Special Elite", monospace`; x.textAlign = 'right'; x.textBaseline = 'alphabetic';
    x.shadowColor = 'rgba(0,0,0,0.95)'; x.shadowBlur = W * 0.06; x.shadowOffsetY = W * 0.01;
    x.fillStyle = '#e9e2d0'; x.fillText(mark, W * 0.9, W * 0.9);
    x.shadowColor = 'transparent';
  }
  // the frame: a black edge, and a faint paper-coloured line just inside it
  x.strokeStyle = '#000'; x.lineWidth = 8; x.strokeRect(0, 0, W, W);
  x.strokeStyle = 'rgba(233,226,208,0.28)'; x.lineWidth = 4; x.strokeRect(10, 10, W - 20, W - 20);
  // halve twice: smoother than one big step down
  const half = cv(W / 2), hx = half.getContext('2d'); hx.imageSmoothingQuality = 'high'; hx.drawImage(big, 0, 0, W / 2, W / 2);
  const out = cv(size), ox = out.getContext('2d'); ox.imageSmoothingQuality = 'high'; ox.drawImage(half, 0, 0, size, size);
  // locked: the same picture with the colour drained out and the light turned down
  const off = cv(size), fx = off.getContext('2d'); fx.drawImage(out, 0, 0);
  const d = fx.getImageData(0, 0, size, size), p = d.data;
  for (let i = 0; i < p.length; i += 4) { const l = (0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]) * 0.42 + 6; p[i] = l; p[i + 1] = l; p[i + 2] = l * 1.04; }
  fx.putImageData(d, 0, 0);
  return { on: out.toDataURL('image/jpeg', 0.92), off: off.toDataURL('image/jpeg', 0.92) };
}

// every pair on one sheet: the icon at 2x (pixels doubled), at 1x, locked at 1x, and the id
async function contactSheet(items) {
  await document.fonts.load('12px "Courier Prime"');
  const COLS = 4, CW = 128 + 64 + 64 + 40, CH = 128 + 30, M = 16;
  const rows = Math.ceil(items.length / COLS), c = document.createElement('canvas');
  c.width = COLS * CW + M; c.height = rows * CH + M;
  const x = c.getContext('2d'); x.fillStyle = '#1a1a1d'; x.fillRect(0, 0, c.width, c.height);
  const load = async (u) => { const i = new Image(); i.src = u; await i.decode(); return i; };
  for (let k = 0; k < items.length; k++) {
    const it = items[k], cx = M + (k % COLS) * CW, cy = M + Math.floor(k / COLS) * CH;
    const on = await load(it.on), off = await load(it.off);
    x.imageSmoothingEnabled = false; x.drawImage(on, cx, cy, 128, 128);
    x.drawImage(on, cx + 136, cy + 64); x.drawImage(off, cx + 208, cy + 64);
    x.fillStyle = '#d8d2c0'; x.font = '12px "Courier Prime", monospace'; x.fillText(it.id, cx, cy + 128 + 16);
  }
  return c.toDataURL('image/png');
}

// ---------- running ----------
async function openGame(browser, { port, size, quality }) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/GPU stall|ReadPixels|fonts|Failed to load resource/.test(m.text())) console.log('CONSOLE', m.text().slice(0, 400)); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load', timeout: 300000 });
  await page.waitForFunction(() => window.__game, null, { timeout: 300000 });
  await page.evaluate(installHelpers, quality);
  await page.waitForFunction(() => { const g = window.__game; return g.E.rig && g.mom.rig && g.dad.rig; }, null, { timeout: 180000 }).catch(() => console.log('warning: character rigs did not load, the simple bodies will show'));
  await page.waitForFunction(() => { const g = window.__game; return g.gfx.env.night && g.gfx.env.day && g.gfx.daySky; }, null, { timeout: 180000 }).catch(() => console.log('warning: sky did not load'));
  await page.waitForLoadState('networkidle', { timeout: 180000 }).catch(() => {});
  await page.waitForTimeout(1500);
  return page;
}

async function renderScene(page, sc, frames) {
  await page.evaluate(() => { window.__norender = true; window.__shot.reset(); });
  await page.evaluate((css) => window.__shot.css(css), sc.css || '');
  await page.evaluate(sc.setup);
  if (sc.hud) await page.evaluate(() => window.__shot.hud(true));
  await page.waitForTimeout(2500);   // doors swing, rigs blend, heads turn
  if (sc.after) await page.evaluate(sc.after);
  await page.evaluate((fov) => { const g = window.__game; window.__freeze = true; if (fov) { g.camera.fov = fov; g.camera.updateProjectionMatrix(); } g.gfx.night = g.gfx.nightGoal; window.__frames = 0; window.__norender = false; }, sc.fov || 0);
  await page.waitForFunction((n) => window.__frames >= n, frames, { timeout: 900000, polling: 500 });
  const png = await page.screenshot({ type: 'png', timeout: 600000 });
  await page.evaluate(() => { window.__norender = true; window.__freeze = false; });
  return png;
}

async function main() {
  const PORT = +opt('port', 8802), SIZE = +opt('size', 256), QUALITY = opt('quality', 'high'), FRAMES = +opt('frames', 3);
  const OUT = path.resolve(opt('out', path.join(__dirname, 'achievements')));
  const SHEET = opt('sheet', '') && path.resolve(opt('sheet', ''));
  const ONLY = (opt('only', '') || '').split(',').filter(Boolean);
  const t0 = Date.now(), log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...a);

  const srv = await serve(PORT);
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  let page = await openGame(browser, { port: PORT, size: SIZE, quality: QUALITY });
  log('game loaded, quality', QUALITY);

  // the game's own list decides which icons there are
  const ids = (await page.evaluate(() => window.__game.achievements.ACHIEVEMENTS.map((a) => a.id))).filter((id) => !ONLY.length || ONLY.some((o) => id.startsWith(o)));
  const missing = ids.filter((id) => !ICONS[id] || !SCENES.some((s) => s.id === ICONS[id].scene));
  if (missing.length) { console.error('no icon set up for', missing.join(', ')); process.exit(1); }
  const want = SCENES.filter((s) => ids.some((id) => ICONS[id].scene === s.id));
  const shots = {};
  for (const sc of want.filter((s) => !s.fresh)) { shots[sc.id] = await renderScene(page, sc, FRAMES); log(sc.id); }
  for (const sc of want.filter((s) => s.fresh)) {   // one page each, after the rest
    await page.close(); page = await openGame(browser, { port: PORT, size: SIZE, quality: QUALITY });
    shots[sc.id] = await renderScene(page, sc, FRAMES); log(sc.id, '(own page)');
  }

  fs.mkdirSync(OUT, { recursive: true });
  const items = [];
  for (const id of ids) {
    const ic = ICONS[id], src = 'data:image/png;base64,' + shots[ic.scene].toString('base64');
    const r = await page.evaluate(composeIcon, { src, mark: ic.mark || null });
    const save = (url, f) => fs.writeFileSync(path.join(OUT, f), Buffer.from(url.split(',')[1], 'base64'));
    save(r.on, `${id}.jpg`); save(r.off, `${id}_locked.jpg`);
    items.push({ id, ...r });
  }
  log(`${items.length} icons ->`, path.relative(ROOT, OUT) || OUT);
  if (SHEET) {
    const url = await page.evaluate(contactSheet, items);
    fs.mkdirSync(path.dirname(SHEET), { recursive: true }); fs.writeFileSync(SHEET, Buffer.from(url.split(',')[1], 'base64'));
    log('contact sheet ->', SHEET);
  }
  await browser.close(); srv.close();
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { SCENES, ICONS, serve, openGame, renderScene, composeIcon, contactSheet };
