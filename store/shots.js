#!/usr/bin/env node
'use strict';
// Renders the Steam store screenshots from the live game, headless. The page is the real index.html served from the repo root; each
// shot drives window.__game (see the last line of js/main.js): a phase, a camera, the thing posed somewhere, the HUD hidden.
//
//   node store/shots.js                      -> store/screenshots/01..08 at 1920x1080 (a minute or so per frame under SwiftShader)
//   node store/shots.js --extra              -> also the capsule sources (store/capsules/src/: the 3840x1240 hero, a portrait)
//   node store/shots.js --preview            -> 960x540 framing passes, quality "medium", into --out (default: a temp folder)
//   node store/shots.js --only 03,05 --port 8801 --quality high --frames 3 --out DIR
//
// Rendering is skipped (window.__norender) while a shot is set up, so the game loop settles at full speed; then exactly --frames
// frames are rendered and the page is captured. Nothing here touches the game's files.
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ARGS = process.argv.slice(2);
const opt = (name, def) => { const i = ARGS.indexOf('--' + name); return i >= 0 && ARGS[i + 1] && !ARGS[i + 1].startsWith('--') ? ARGS[i + 1] : def; };
const flag = (name) => ARGS.includes('--' + name);
const PREVIEW = flag('preview');
const PORT = +opt('port', 8800);
const QUALITY = opt('quality', PREVIEW ? 'medium' : 'high');
const FRAMES = +opt('frames', PREVIEW ? 2 : 3);
const ONLY = (opt('only', '') || '').split(',').filter(Boolean);
const OUT = path.resolve(opt('out', PREVIEW ? path.join(os.tmpdir(), 'top-bunk-preview') : path.join(__dirname, 'screenshots')));
const SRC = path.resolve(opt('src', path.join(__dirname, 'capsules', 'src')));
const SIZE = PREVIEW ? [960, 540] : [1920, 1080];
const SCALE = PREVIEW ? 0.5 : 1;

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

// ---------- the shots ----------
// Each setup runs in the page with g = window.__game and S = window.__shot (helpers injected below). `after` runs once the loop has
// settled, just before the frames render (for anything the game loop would otherwise undo). Positions are world metres from js/world.js:
// your room x 5..8.1, z -0.3..3.6 (bunk along the back wall, head at x 5, ladder at x 7.2); the hall z -1.5..-0.3 running from the
// living room (x 3.3) to the dead end (x 8.1); the living room TV at (2.95, 0.55, -3.2) facing -x; the front door at (1.9, 0, -4.5).
const SHOTS = [
  { id: '01_porch_night', what: 'The porch at night, from the yard, and something standing in the porch light',
    setup: () => { const g = window.__game, S = window.__shot;
      g.setPhase('title'); g.W.porchLight.intensity = 9; g.W.porchBulb.material.emissiveIntensity = 4;
      S.look([2.7, 1.32, -9.4], [1.75, 1.45, -4.8]);
      S.thing([1.9, 0.14, -5.05], [2.7, -9.4], { tilt: 0.35, smile: 1.1, reach: 0.3 }); } },
  { id: '02_kid_room_bunk', what: 'Your room on the first night: the bunk, the boxes, the bear, the flashlight',
    setup: () => { const g = window.__game, S = window.__shot;
      g.setPhase('night'); S.flash(true); S.boxesOnBunk(); g.W.moveTeddy(5.75, 1.8, 3.15); g.W.setDoor('kid', true, true);
      S.look([7.55, 1.32, 0.75], [6.1, 1.25, 3.0]); } },   // (from the room's east side, so the closet's side panel is not an arm's length from the lens)
  { id: '03_hall_drawing', what: 'The crayon drawing taped to the hall wall ("HE WATCHES"), by flashlight',
    setup: () => { const g = window.__game, S = window.__shot;
      g.setPhase('night'); S.flash(true, 8); g.W.drawingMat.map = g.W.T.drawing0; g.W.drawingMat.needsUpdate = true;   // (the moving-day drawing, not the night one)
      S.look([6.2, 1.25, -1.15], [5.55, 1.08, -0.38]); } },
  { id: '04_under_covers', what: 'Under the covers on the top bunk while it leans over the rail (with the hold-your-breath HUD)', hud: true,
    setup: () => { const g = window.__game, S = window.__shot;
      g.setPhase('night'); g.nlMult(0.3, false);
      g.P.mode = 'hide'; g.P.pod = null; g.P.podYaw = 0; g.P.cam.copy(g.BUNK_LIE); g.P.yaw = 0.06; g.P.pitch = 0.4; g.F.cutscene = false;
      g.UI.blanket(true); S.thing([6.03, 0, 1.55], [6.03, 3.02], { lean: 0.4, tilt: -0.35, smile: 1.18 });
      g.F.breathUI = true; g.UI.objective('Stay quiet.'); g.UI.hint('Hold <b>Space</b> to hold your breath', 600); },
    after: () => { const g = window.__game; window.__freeze = true; g.UI.breath(0.27, true, true); } },
  { id: '05_end_of_hall', what: 'The thing at the far end of the hall, lit from behind by the living room',
    setup: () => { const g = window.__game, S = window.__shot;
      g.setPhase('night'); g.W.setDoor('kid', true, true); g.W.setDoor('bath', true, true);
      g.W.bathSpot.intensity = g.BATH_I * 0.8; g.F.flicker = true;
      S.thing([3.7, 0, -0.9], [8, -0.9], { tilt: 0.3 }); S.look([7.35, 1.32, -0.9], [3.7, 1.55, -0.9]); } },
  { id: '06_breakfast', what: 'Breakfast: Mom at the stove, Dad at the sink, nobody believing you',
    setup: () => { const g = window.__game, S = window.__shot;
      g.setPhase('morning'); g.sleepers(false);
      for (const [p, x, z, ry] of [[g.mom, 2.0, 1.33, Math.PI / 2], [g.dad, 0.9, 2.3, Math.PI]]) {
        p.group.visible = true; p.busy = false; p.sleeping = false; p.pose = null; p.group.rotation.order = 'XYZ'; p.group.rotation.set(0, ry, 0); p.group.position.set(x, 0, z);
        if (p.rig) p.rig.play('idle', { fade: 0, speed: 1 });
      }
      g.P.pos.set(0.95, 0, 0.6); S.look([0.95, 1.3, 0.45], [1.45, 1.22, 1.85]); } },
  { id: '07_closet_louvers', what: 'Hiding in the closet: the room through the louvers, and it has come looking',
    setup: () => { const g = window.__game, S = window.__shot;
      // the game's closet camera sits inside the closet box (the leaves are solid, the louvers are the overlay), so this one stands a hand's
      // width outside the leaves and the overlay does the slats. The slats and the overlay's inset shadow eat most of the light, so its face
      // is a metre away, dead centre and lit by the flashlight; `after` aims at its head. A cine camera, because hide mode clamps the pitch
      // at 0.4 and the face would sit in the overlay's dark border.
      g.setPhase('night'); S.nightLights(4); g.W.hemi.intensity = 0.9; g.renderer.toneMappingExposure = 1.6;
      S.look([5.95, 1.75, 0.52], [6.05, 2.35, 1.45]); S.flash(true, 12); g.UI.pod('louvers');
      S.thing([6.05, 0, 1.45], [5.95, 0.5], { tilt: 0.35, smile: 1.25, lean: 0.1 }); },
    after: () => { const g = window.__game, h = g.E.head.getWorldPosition(g.E.root.position.clone()), c = g.P.cam;
      g.P.yaw = Math.atan2(-(h.x - c.x), -(h.z - c.z)); g.P.pitch = Math.atan2(h.y - c.y, Math.hypot(h.x - c.x, h.z - c.z)); } },
  { id: '08_tv_static', what: 'The living room TV turned itself on, and someone who looks like Dad is standing in front of it',
    setup: () => { const g = window.__game, S = window.__shot;
      g.setPhase('night'); g.W.tvFx.set(true); g.W.tvFx.figure = 1;
      const d = g.dad; g.mom.group.visible = true; d.sleeping = false; d.busy = true; d.pose = null; d.lookAt = null; d.group.rotation.order = 'XYZ';
      d.group.rotation.set(0, Math.atan2(2.95 - 2.0, -3.2 + 3.65), 0); d.group.position.set(2.0, 0, -3.65); d.group.visible = true;   // (a step to the side of his spot in the game, so the screen shows past him)
      if (d.rig) d.rig.play('idle', { fade: 0, speed: 0.6 }); g.W.bedSleepers.one('dad', false);
      g.P.pos.set(-30, 0, -30);   // (far away, so he does not turn his head to you)
      S.look([1.3, 1.25, -1.95], [2.75, 1.0, -3.25]); } },   // (back far enough that his head is in the frame)
];
// capsule sources (not Steam screenshots): the hero banner and a portrait, both of the thing in the hall
const EXTRA = [
  { id: 'hero_3840x1240', size: [3840, 1240], fov: 52, what: 'Library hero source: the hall, wide',
    setup: () => { const g = window.__game, S = window.__shot;
      g.setPhase('night'); g.W.setDoor('kid', true, true); g.W.setDoor('bath', true, true); g.W.bathSpot.intensity = g.BATH_I * 0.8; g.F.flicker = true;
      S.thing([3.9, 0, -0.9], [8, -0.9], { tilt: 0.3 }); S.look([7.5, 1.32, -0.9], [3.9, 1.5, -0.9]); } },
  { id: 'portrait_1000x1400', size: [1000, 1400], what: 'Vertical capsule source: the hall, tall',
    setup: () => { const g = window.__game, S = window.__shot;
      g.setPhase('night'); g.W.setDoor('kid', true, true); g.W.setDoor('bath', true, true); g.W.bathSpot.intensity = g.BATH_I * 0.8; g.F.flicker = true;
      S.thing([3.9, 0, -0.9], [8, -0.9], { tilt: 0.3 }); S.look([7.2, 1.32, -0.9], [3.9, 1.6, -0.9]); } },
];

// ---------- page-side helpers ----------
function installHelpers(quality) {
  const g = window.__game;
  g.gfx.auto = false; g.gfx.setQuality(quality, { save: false }); g.gfx.setRes(1);
  g.start();   // (the test mode: the loop runs, no title screen, no story)
  window.__frames = 0; const render = g.gfx.render.bind(g.gfx); g.gfx.render = (dt) => { render(dt); window.__frames++; };
  window.__norender = true;
  const yawTo = (a, b) => Math.atan2(-(b[0] - a[0]), -(b[2] - a[2]));
  const pitchTo = (a, b) => Math.atan2(b[1] - a[1], Math.hypot(b[0] - a[0], b[2] - a[2]));
  const nlBase = g.W.nightLights.map((n) => n.base);
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
      this.hud(false);
    },
    look(pos, at) { g.P.mode = 'cine'; g.P.cam.set(pos[0], pos[1], pos[2]); g.P.yaw = yawTo(pos, at); g.P.pitch = pitchTo(pos, at); g.P.roll = 0; g.F.cutscene = true; },
    flash(on, intensity = 26) { const l = g.camera.children.find((c) => c.isSpotLight); if (l) l.intensity = on ? intensity : 0; g.F.flashOn = on; },
    nightLights(k) { g.W.nightLights.forEach((n, i) => { n.base = nlBase[i] * k; }); },
    thing(pos, faceAt, o = {}) {
      const E = g.E; E.visible = true; E.mode = 'idle'; E.root.position.set(pos[0], pos[1], pos[2]); E.root.scale.setScalar(1);
      if (faceAt) E.faceTowards(faceAt[0], faceAt[1], 1);
      E.lean = o.lean || 0; E.reach = o.reach || 0; E.tilt = o.tilt || 0; E.smileScale = o.smile || 1; E.lookTarget = o.look === false ? null : g.camera.position;
    },
    hud(on) { document.getElementById('hud').style.visibility = on ? '' : 'hidden'; },
    boxesOnBunk() { g.W.pickups.forEach((b, i) => { g.W.house.add(b); const s = g.W.dropSpots[i]; b.position.set(s.x, s.y + 0.22, s.z); b.rotation.set(0, (i - 1) * 0.3, 0); }); },
  };
}

(async () => {
  const list = [...SHOTS, ...(flag('extra') ? EXTRA : [])].filter((s) => !ONLY.length || ONLY.some((o) => s.id.startsWith(o)));
  if (!list.length) { console.error('no shots match', ONLY); process.exit(1); }
  fs.mkdirSync(OUT, { recursive: true }); if (list.some((s) => s.size)) fs.mkdirSync(SRC, { recursive: true });
  const srv = await serve(PORT);
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: SIZE[0], height: SIZE[1] }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/GPU stall|ReadPixels|fonts/.test(m.text())) console.log('CONSOLE', m.text().slice(0, 400)); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const t0 = Date.now(), log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...a);
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load', timeout: 300000 });
  await page.waitForFunction(() => window.__game, null, { timeout: 300000 });   // (the models and shaders take minutes on a shared CPU)
  await page.evaluate(installHelpers, QUALITY);
  // the character models, the sky and the surface textures all stream in after the page is up
  await page.waitForFunction(() => { const g = window.__game; return g.E.rig && g.mom.rig && g.dad.rig; }, null, { timeout: 180000 }).catch(() => log('warning: character rigs did not load, the simple bodies will show'));
  await page.waitForFunction(() => { const g = window.__game; return g.gfx.env.night && g.gfx.env.day && g.gfx.daySky; }, null, { timeout: 180000 }).catch(() => log('warning: sky did not load'));
  await page.waitForLoadState('networkidle', { timeout: 180000 }).catch(() => {});
  await page.waitForTimeout(2000);
  log('game loaded, quality', QUALITY);

  for (const sh of list) {
    const size = sh.size ? sh.size.map((v) => Math.round(v * SCALE)) : SIZE;
    const out = path.join(sh.size ? SRC : OUT, `${sh.id}.png`);
    await page.setViewportSize({ width: size[0], height: size[1] });
    await page.evaluate(() => { window.__norender = true; window.__shot.reset(); });
    await page.evaluate(sh.setup);
    if (sh.hud) await page.evaluate(() => window.__shot.hud(true));
    await page.waitForTimeout(2500);   // doors swing, rigs blend, heads turn, the people face you
    if (sh.after) await page.evaluate(sh.after);
    if (sh.fov) await page.evaluate((fov) => { const g = window.__game; window.__freeze = true; g.camera.fov = fov; g.camera.updateProjectionMatrix(); }, sh.fov);
    await page.evaluate(() => { const g = window.__game; g.gfx.night = g.gfx.nightGoal; window.__frames = 0; window.__norender = false; });
    await page.waitForFunction((n) => window.__frames >= n, FRAMES, { timeout: 1800000, polling: 2000 });
    await page.screenshot({ path: out, type: 'png', timeout: 900000 });
    await page.evaluate(() => { window.__norender = true; window.__freeze = false; });
    log(sh.id, '->', out.startsWith(ROOT) ? path.relative(ROOT, out) : out, `${size[0]}x${size[1]}`);
  }
  await browser.close(); srv.close();
  log('done');
})().catch((e) => { console.error(e); process.exit(1); });
