#!/usr/bin/env node
'use strict';
// The parents at night (js/parents.js), headless in Chromium:
//   dad     night three, you in the kitchen, the ledger pushed past 0.8 from there: the light shows under their shut door, the barn door
//           slides open, Dad gets up, takes his torch and walks to you without his body ever entering anything (the worst depth on the way is
//           read every step), arrives within 25 s of getting up, finds you (woke[0].found, RUN.story.blamed === 1), the thing (shown in
//           the house beforehand) is gone before he comes into your room, and the walk is in the log ('dadWalk')
//   bunk    night three, you in your bunk: he looks in on you and goes back to bed; nobody is blamed, woke[0].found is false
//   pod     night three, you hidden in your closet: he passes; woke[0].hiddenInPod
//   mom     night five, you hidden in the spare room's closet: Mom gets up with no light (W.dadTorch.visible stays false), goes to your door
//           first, searches calling only mom/n5_g and mom/n5_h, and after forty seconds of you hidden sits on your bottom bunk and says
//           mom/n5_f once; when you come out she takes you to their bed: P.mode 'lie', the eye clear of every surface by 0.13 m
//   rules   the same parent never gets up twice in a night before night seven; after a wake the thresholds are x1.3 (night seven: 0.9
//           does not get him up again, 1.2 does); the thing goes without a flicker (hunter.vanish(false)) when Dad's beam comes within
//           four metres of it; parents.js reaches the frame only through js/hooks.js: main.js's update() is the one F0 wrote, line for
//           line, and parents.js never mentions the thing's lure lines (mom/n1_call_*)
//   bed     night two, three minutes of them asleep at __clockMul 1: each turns over at least once and Dad's arm comes out once; the quilt's
//           rise over each of them moves with the body (within 3 cm); two renders from their door two seconds apart differ at the ridge
// Each night is played as the quiet type (#nightN&type=quiet), so no night's own scene takes the house while the parents are measured.
//   node tests/parents.js [--port N] [--only dad,bunk,pod,mom,rules,bed] [--base <rev>]   (--base: the revision whose update() is F0's)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { Readable } = require('stream');
const serve = require('../desktop/static');

const ROOT = path.join(__dirname, '..');
const ARGV = process.argv.slice(2);
const opt = (name, def) => { const i = ARGV.indexOf(name); return i >= 0 && ARGV[i + 1] !== undefined ? ARGV[i + 1] : def; };
const PORT = +opt('--port', process.env.SMOKE_PORT || 0);
const ONLY = opt('--only', '') ? new Set(opt('--only', '').split(',')) : null;
const BASE_REV = opt('--base', 'overhaul');
const want = (n) => !ONLY || ONLY.has(n);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function ok(cond, msg) { if (!cond) throw new Error(msg); }
async function section(name, fn, ms = 900e3) {
  if (!want(name)) return;
  const t0 = Date.now(); let status = 'PASS', detail = '';
  let timer;
  try { detail = (await Promise.race([Promise.resolve().then(fn), new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`timed out after ${ms / 1000} s`)), ms); })])) || ''; }
  catch (e) { status = 'FAIL'; detail = String(e && e.message || e).split('\n')[0]; }
  finally { clearTimeout(timer); }
  results.push({ name, status });
  console.log(`${status} ${name}: ${detail} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}

// ---------- the server and the pages ----------
function startServer() {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const r = await serve.respond(ROOT, new Request(url.href, { method: req.method, headers: req.headers.range ? { range: req.headers.range } : {} }));
      res.writeHead(r.status, Object.fromEntries(r.headers));
      if (r.body) Readable.fromWeb(r.body).on('error', () => res.destroy()).pipe(res); else res.end();
    } catch (e) { if (!res.headersSent) res.writeHead(500); res.end(String(e)); }
  });
  return new Promise((resolve, reject) => { server.once('error', reject); server.listen(PORT, '127.0.0.1', () => resolve(server)); });
}
let BASE = '';
function watch(page) {
  const w = { errors: [], console: [] };
  page.on('pageerror', (e) => w.errors.push(String((e && e.stack) || e).split('\n').slice(0, 2).join(' / ')));
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error') w.console.push(t); else if (m.type() === 'warning' && /parents:|failed/.test(t)) w.console.push(t); });
  return w;
}
const clean = (w) => { const p = [...w.errors.map((s) => `page error: ${s}`), ...w.console.map((s) => `console: ${s}`)]; ok(p.length === 0, `${p.length} problem(s): ${p.slice(0, 3).join(' | ')}`); };
const until = (page, fn, arg, ms = 120e3) => page.waitForFunction(fn, arg, { timeout: ms, polling: 150 });
async function nightPage(browser, hash, { render = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await ctx.newPage(), w = watch(page);
  if (!render) await page.addInitScript(() => { window.__norender = true; });
  await page.goto(BASE + '/index.html' + hash, { waitUntil: 'load', timeout: 180e3 });
  await page.waitForFunction(() => window.__game && document.getElementById('loading').classList.contains('done'), null, { timeout: 240e3, polling: 250 });
  await page.evaluate((render) => { const g = window.__game; if (!render) { g.renderer.compileAsync = async () => {}; g.gfx.render = () => {}; } g.startGame(); }, render);
  const n = hash.match(/night(\d+)/)[1];
  await until(page, (n) => window.__game.F.stage === 'n' + n && window.__game.F.live && window.__game.mom.rig && window.__game.dad.rig, n, 240e3);
  await page.evaluate(() => { try { window.__game.weather.lock('clear'); } catch (e) { /* no weather */ } });
  return { page, w, ctx, n: +n };
}
// page code with the parents module (par) and the game (g)
const P = (page, fn, arg) => page.evaluate(async ([src, arg]) => { const par = (await import('/js/hooks.js')).hooks.parents; const g = window.__game; return (new Function('par', 'g', 'arg', `return (${src})(par, g, arg)`))(par, g, arg); }, [fn.toString(), arg]);
// keep the engine's own beats off the table while a scene is measured (their sounds and their thing would muddy it)
const quiet = (page) => page.evaluate(async () => { const ev = await import('/js/events.js'); ev.suspend(true); const g = window.__game; g.nights.director && g.nights.director.stop && g.nights.director.stop(); });
// stand the player somewhere, walking, facing a point
const stand = (page, x, z, tx, tz) => page.evaluate(([x, z, tx, tz]) => {
  const g = window.__game; g.P.mode = 'walk'; g.F.cutscene = false; g.P.pod = null; g.P.pos.set(x, 0, z); g.P.vel.set(0, 0, 0);
  g.P.yaw = Math.atan2(-(tx - x), -(tz - z)); g.P.pitch = 0;
}, [x, z, tx, tz]);
// sample the parents every quarter second until done() says so (or the time is up): what was seen on the way
async function follow(page, done, ms = 120e3) {
  const t0 = Date.now(), seen = { strip: false, door: false, eAtUp: null, eAfterUp: false, torchOnMom: false, samples: 0 };
  for (;;) {
    const s = await P(page, (par, g) => {
      const d = g.W.doors.parents, t = par.test.stats;
      return { strip: g.lights.rooms.parents.out > 0.4 && d.a < 0.08, door: d.a > 0.8, up: !!t.up, eVis: g.E.visible, dad: par.state('dad'), mom: par.state('mom'), torch: g.W.dadTorch.visible, live: g.F.live };
    });
    seen.samples++;
    if (s.strip) seen.strip = true; if (s.door) seen.door = true;
    if (s.up && seen.eAtUp === null) seen.eAtUp = s.eVis;
    if (s.up && s.eVis) seen.eAfterUp = true;
    if (s.mom !== 'asleep' && s.mom !== 'day' && s.torch) seen.torchOnMom = true;
    if (await P(page, done)) break;
    if (Date.now() - t0 > ms) throw new Error('timed out following the parents: ' + JSON.stringify(s));
    await sleep(250);
  }
  return seen;
}
const nightRec = (page, n) => page.evaluate((n) => { const r = window.__game.RUN.nights && window.__game.RUN.nights[n]; return r ? { woke: r.woke, noticed: r.noticed, log: r.log.filter((e) => /Walk$/.test(e.id)) } : null; }, n);

// ---------- the scenes ----------
async function dadKitchen(browser) {
  const { page, w, ctx } = await nightPage(browser, '#night3&type=quiet');
  try {
    await quiet(page);
    await stand(page, 1.5, 2.6, 0.5, 1.0);
    // the thing in the house beforehand (it must be gone before he comes into your room)
    await P(page, (par, g) => { g.E.root.position.set(3.6, 0, 3.9); g.E.visible = true; g.E.mode = 'idle'; });
    await P(page, (par) => par.noise(6, { x: 1.5, z: 2.6 }, 'test'));
    const seen = await follow(page, (par) => { const t = par.test.stats; return t.foundAt != null || (t.up && par.state('dad') === 'asleep'); }, 150e3);
    await P(page, (par) => new Promise((res) => { const t0 = Date.now(), poll = () => (par.test.stats.said.includes('dad/n3_e') || Date.now() - t0 > 15000 ? res() : setTimeout(poll, 200)); poll(); }));
    const st = await P(page, (par, g) => { const t = par.test.stats; return { up: t.up, foundAt: t.foundAt, arrivedAt: t.arrivedAt, maxPen: t.maxPen, penAt: t.penAt, entered: t.enteredAt, blamed: g.RUN.story && g.RUN.story.blamed, said: t.said, states: t.states, eVis: g.E.visible }; });
    const rec = await nightRec(page, 3);
    ok(seen.strip, 'the light never showed under their shut door');
    ok(seen.door, 'their barn door never slid open');
    ok(st.up && st.up.who === 'dad', 'Dad never got up: ' + st.states.join(' > '));
    ok(st.maxPen <= 0.002, `Dad's route entered something: ${(st.maxPen * 100).toFixed(1)} cm at ${JSON.stringify(st.penAt)}`);
    ok(st.foundAt != null, 'he never found you: ' + st.states.join(' > '));
    const took = st.foundAt - st.up.at; ok(took <= 25, `he took ${took.toFixed(1)} s to reach you`);
    ok(rec && rec.woke[0] && rec.woke[0].found === true, 'woke[0].found is not true: ' + JSON.stringify(rec && rec.woke));
    ok(st.blamed === 1, 'RUN.story.blamed is ' + st.blamed);
    // the thing (shown in the kitchen beforehand) gone from the moment he got up, so it was gone before he came anywhere near your room
    ok(!seen.eAfterUp, 'the thing was showing while he was up');
    ok(!st.entered || st.entered.eVisible === false, 'the thing was showing when he came into your room: ' + JSON.stringify(st.entered));
    ok(rec.log.some((e) => e.id === 'dadWalk'), "the log has no 'dadWalk'");
    ok(st.said.includes('dad/n3_b'), 'he said nothing to you: ' + st.said.join(','));
    clean(w);
    return `found in ${took.toFixed(1)} s, worst depth ${(st.maxPen * 100).toFixed(2)} cm, said ${st.said.join(' ')}, the thing gone from his getting up (${seen.samples} samples)`;
  } finally { await ctx.close(); }
}
async function dadBunk(browser) {
  const { page, w, ctx } = await nightPage(browser, '#night3&type=quiet');
  try {
    await quiet(page);
    await until(page, () => window.__game.P.mode === 'bunk', null, 30e3);
    await P(page, (par) => par.noise(9, { x: 8.42, z: 3.72 }, 'test'));
    await follow(page, (par) => { const t = par.test.stats; return t.up && par.state('dad') === 'asleep'; }, 200e3);
    const st = await P(page, (par, g) => ({ looked: par.test.stats.lookedIn, blamed: (g.RUN.story && g.RUN.story.blamed) || 0, states: par.test.stats.states, maxPen: par.test.stats.maxPen, mode: g.P.mode }));
    const rec = await nightRec(page, 3);
    ok(st.looked >= 1, 'he never looked in on you: ' + st.states.join(' > '));
    ok(st.blamed === 0, 'you were blamed in your bunk: ' + st.blamed);
    ok(rec.woke[0] && rec.woke[0].found === false && rec.woke[0].inBunk === true, 'woke[0]: ' + JSON.stringify(rec.woke[0]));
    ok(st.maxPen <= 0.002, `his route entered something: ${(st.maxPen * 100).toFixed(1)} cm`);
    clean(w);
    return `looked in ${st.looked}x and went back to bed, blamed 0`;
  } finally { await ctx.close(); }
}
async function dadPod(browser) {
  const { page, w, ctx } = await nightPage(browser, '#night3&type=quiet');
  try {
    await quiet(page);
    await stand(page, 8.14, 1.6, 8.14, 0.8);
    await page.evaluate(() => window.__game.nights.enterPod('closet_kid'));
    await until(page, () => window.__game.P.mode === 'hide' && window.__game.P.pod === 'closet_kid', null, 20e3);
    await P(page, (par) => par.noise(9, { x: 8.0, z: 1.2 }, 'test'));
    await follow(page, (par) => { const t = par.test.stats; return t.up && par.state('dad') === 'asleep'; }, 200e3);
    const rec = await nightRec(page, 3), st = await P(page, (par, g) => ({ blamed: (g.RUN.story && g.RUN.story.blamed) || 0, states: par.test.stats.states, mode: g.P.mode, pod: g.P.pod }));
    ok(rec.woke[0] && rec.woke[0].hiddenInPod === true, 'woke[0].hiddenInPod is not true: ' + JSON.stringify(rec.woke[0]));
    ok(rec.woke[0].found === false && st.blamed === 0, 'he found you in the closet');
    clean(w);
    return 'he passed you in the closet: ' + JSON.stringify(rec.woke[0]);
  } finally { await ctx.close(); }
}
async function momNight5(browser) {
  const { page, w, ctx } = await nightPage(browser, '#night5&type=quiet');
  try {
    await quiet(page);
    await stand(page, 10.46, -3.0, 10.46, -3.9);
    await page.evaluate(() => window.__game.nights.enterPod('closet_spare'));
    await until(page, () => window.__game.P.mode === 'hide' && window.__game.P.pod === 'closet_spare', null, 20e3);
    await P(page, (par) => par.noise(14, { x: -2.2, z: 1.14 }, 'test'));
    // she gets up, goes to your door, searches, and sits on your bunk
    const seen = await follow(page, (par) => par.test.stats.momSat != null || (par.test.stats.up && par.state('mom') === 'asleep'), 300e3);
    let st = await P(page, (par) => { const t = par.test.stats; return { up: t.up, first: t.firstGoal, atDoor: t.momAtDoor, sat: t.momSat, said: t.said.slice(), states: t.states }; });
    ok(st.up && st.up.who === 'mom', 'Mom did not get up: ' + JSON.stringify(st.up) + ' ' + st.states.join(' > '));
    ok(!seen.torchOnMom, 'a torch was lit while Mom was up');
    ok(st.first && st.first.door === 'kid' && st.atDoor != null, 'she did not go to your door first');
    ok(st.sat != null, 'she never sat on your bunk: ' + st.states.join(' > '));
    await sleep(4000);
    st = await P(page, (par) => ({ said: par.test.stats.said.slice() }));
    const calls = st.said.filter((id) => /^mom\/(n5_g|n5_h|n1_call)/.test(id));
    ok(calls.length >= 2 && calls.every((id) => id === 'mom/n5_g' || id === 'mom/n5_h'), 'her calls: ' + calls.join(','));
    ok(st.said.filter((id) => id === 'mom/n5_f').length === 1, 'mom/n5_f said ' + st.said.filter((id) => id === 'mom/n5_f').length + ' times');
    // you come out: she looks past you, the same line, their bed
    await page.evaluate(() => window.__game.nights.exitHide());
    await until(page, () => window.__game.P.mode === 'lie', null, 60e3);
    await sleep(2500);
    const eye = await P(page, async (par, g) => {
      const THREE = await import('three'), collide = await import('/js/collide.js');
      g.cam && g.cam();
      const cam = g.camera, probe = collide.eyeProbe(cam, { mode: 'lie' });
      // the real surfaces: rays from the eye every way, against every mesh near it (the people's skin by their bones)
      const ray = new THREE.Raycaster(); ray.near = 0; ray.far = 0.13; let hit = null;
      const shown = (o) => { for (let n = o; n; n = n.parent) if (!n.visible) return false; return true; };
      const near = []; g.scene.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh && shown(o) && o.geometry && o.geometry.boundingSphere !== undefined) { o.geometry.computeBoundingSphere(); const s = o.geometry.boundingSphere.clone().applyMatrix4(o.matrixWorld); if (s.distanceToPoint(cam.position) < 0.13) near.push(o); } });
      for (let i = 0; i < 200 && !hit; i++) { const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, d = new THREE.Vector3(Math.sqrt(1 - u * u) * Math.cos(a), u, Math.sqrt(1 - u * u) * Math.sin(a)); ray.set(cam.position, d); const h = ray.intersectObjects(near, false)[0]; if (h) { let n = h.object, path = []; for (let i = 0; n && i < 4; i++, n = n.parent) path.push(n.name || n.type); hit = { what: h.object.geometry.type + ' in ' + path.join('/'), d: h.distance }; } }
      let bone = Infinity; for (const p of [g.mom, g.dad]) p.rig.root.traverse((b) => { if (b.isBone) { const r = /Head/.test(b.name) ? 0.1 : /Spine|Pelvis/.test(b.name) ? 0.13 : 0.05; bone = Math.min(bone, b.getWorldPosition(new THREE.Vector3()).distanceTo(cam.position) - r); } });
      return { mode: g.P.mode, pen: probe.pen, hit, bone, said: par.test.stats.said.slice(-3), mom: par.state('mom') };
    });
    ok(eye.mode === 'lie', 'P.mode is ' + eye.mode);
    ok(eye.pen === 0 && !eye.hit, 'the eye is within 0.13 m of something: ' + JSON.stringify(eye));
    ok(eye.bone >= 0.13, `the eye is ${eye.bone.toFixed(3)} m from a body`);
    clean(w);
    return `to your door first, ${calls.length} calls (${[...new Set(calls)].join(', ')}), n5_f once, their bed with the eye ${eye.bone.toFixed(2)} m from the nearest body`;
  } finally { await ctx.close(); }
}
async function rules(browser) {
  // the source: main.js's update() as F0 left it, and parents.js's own text
  const src = fs.readFileSync(path.join(ROOT, 'js/main.js'), 'utf8'), pj = fs.readFileSync(path.join(ROOT, 'js/parents.js'), 'utf8');
  const body = (s) => { const i = s.indexOf('function update(dt) {'); if (i < 0) return null; let d = 0, j = s.indexOf('{', i); for (; j < s.length; j++) { if (s[j] === '{') d++; else if (s[j] === '}' && --d === 0) break; } return s.slice(i, j + 1); };
  let base = null; try { base = execFileSync('git', ['show', `${BASE_REV}:js/main.js`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { base = null; }
  ok(body(src) && body(src).includes('hooks.parents.update(dt)'), "main.js's update() does not call hooks.parents.update(dt)");
  if (base) ok(body(base) === body(src), "main.js's update() is not the one F0 wrote");
  ok(!/n1_call/.test(pj), 'parents.js names the lure lines (mom/n1_call_*)');
  ok(!/\bfunction update\(dt\)[^]*?main\.js/.test('') && !/from '\.\/main\.js'/.test(pj) && !/__game/.test(pj), 'parents.js reaches into main.js');
  // night three: one wake, then nothing past 0.8 gets him up again
  let { page, w, ctx } = await nightPage(browser, '#night3&type=quiet');
  let out = '';
  try {
    await quiet(page);
    await until(page, () => window.__game.P.mode === 'bunk', null, 30e3);
    await P(page, (par) => par.test.wake('dad', { x: 9.6, z: -0.4 }));
    await until(page, () => window.__game && window.__game.F.live, null, 10e3);
    await follow(page, (par) => par.test.stats.up && par.state('dad') === 'asleep', 200e3);
    const m1 = await P(page, (par) => ({ mult: par.test.PAR.dad.mult, woke: par.test.PAR.dad.woke }));
    ok(m1.mult === 1.3 && m1.woke === 1, 'after a wake: ' + JSON.stringify(m1));
    await P(page, (par) => { par.test.stats.up = null; par.test.PAR.dad.stirCool = 0; par.noise(9, { x: 9.6, z: -0.4 }, 'test'); });
    await sleep(12000);
    const again = await P(page, (par) => ({ st: par.state('dad'), up: par.test.stats.up }));
    ok(!again.up && ['asleep', 'sitting', 'light'].includes(again.st), 'he got up a second time on night three: ' + JSON.stringify(again));
    clean(w); out += 'one wake on night three; ';
  } finally { await ctx.close(); }
  // night seven: x1.3 after a wake (0.9 is not enough, 1.2 is), and the thing gone from his beam without a flicker
  ({ page, w, ctx } = await nightPage(browser, '#night7&type=quiet'));
  try {
    await quiet(page);
    await until(page, () => window.__game.P.mode === 'bunk', null, 30e3);
    await P(page, (par) => par.test.wake('dad', { x: 9.6, z: -0.4 }));
    // while he walks: the thing put four metres down his beam (the hunter's own sight), and it must go at once and without a flicker
    await until(page, () => { const g = window.__game; return g.W.dadTorch.visible && g.W.dadTorch.held && g.dad.group.position.x > -2; }, null, 120e3);
    const v = await P(page, async (par, g) => {
      const H = g.nights.hunter, d = g.dad.group.position, a = par.test.PAR.dad.aim, x = d.x + a.x * 3.2, z = d.z + a.z * 3.2;
      g.F.flicker = false;
      const flicks = []; const f0 = H.vanish; H.vanish = (fl = true) => { flicks.push(fl); return f0(fl); };
      H.sight('livC', { dur: 30, stab: false, vanishOnLook: false }); g.E.root.position.set(x, 0, z); g.E.visible = true; g.E.mode = 'idle';
      await new Promise((r) => setTimeout(r, 400));
      H.vanish = f0;
      return { visible: g.E.visible, flicker: g.F.flicker, flicks, busy: H.busy };
    });
    ok(!v.visible, 'the thing stayed in his beam');
    ok(!v.flicker && v.flicks.length >= 1 && v.flicks.every((f) => f === false), 'it did not go by hunter.vanish(false): ' + JSON.stringify(v));
    await follow(page, (par) => par.test.stats.up && par.state('dad') === 'asleep', 200e3);
    // (Mom kept out of it: from night five she is the first up past 0.9, and here it is Dad's thresholds that are measured)
    await P(page, (par) => { par.test.PAR.mom.mult = 2; par.test.stats.up = null; par.test.PAR.dad.stirCool = 0; par.test.set(0.9); });
    await sleep(9000);
    const low = await P(page, (par) => ({ up: par.test.stats.up, st: par.state('dad'), N: par.ledger() }));
    ok(!low.up, 'at 0.9 he got up again after a wake (his thresholds are not x1.3): ' + JSON.stringify(low));
    await until(page, async () => true, null, 1000);
    for (let i = 0; i < 80 && (await P(page, (par) => par.state('dad'))) !== 'asleep'; i++) await sleep(250);
    await P(page, (par) => { par.test.PAR.dad.stirCool = 0; par.test.set(1.25); });
    await sleep(11000);
    const high = await P(page, (par) => ({ up: par.test.stats.up, st: par.state('dad') }));
    ok(high.up && high.up.who === 'dad', 'at 1.25 on night seven he did not get up a second time: ' + JSON.stringify(high));
    clean(w); out += 'night seven x1.3 (0.9 no, 1.25 yes), the thing gone without a flicker; main.js update() untouched';
  } finally { await ctx.close(); }
  return out;
}
async function bed(browser) {
  // three minutes of night two at __clockMul 1, the frame running: the roll-overs, the arm, the quilt following each body
  const { page, w, ctx } = await nightPage(browser, '#night2&type=quiet');
  try {
    await quiet(page);
    await until(page, () => window.__game.P.mode === 'bunk', null, 30e3);
    await P(page, (par) => { par.test.force = true; window.__clockMul = 1; });
    // each side of the quilt against its body: the middle of that side's rise across the bed (where world.js puts it, the rest place plus
    // its shift) against the body's own place across the bed at the chest, and the quilt's top over the chest against the chest's top
    const sample = () => P(page, (par, g) => {
      const b = g.W.bedSleepers, out = {}, REST = { mom: 0.23, dad: -0.21 };
      for (const who of ['dad', 'mom']) {
        const p = par.test.PAR[who], r = g[who].rig, V = r.bones.Spine1.getWorldPosition(new (g.camera.position.constructor)()); b.toLocal(V);
        const C = r.bones.Spine2.getWorldPosition(new (g.camera.position.constructor)()); b.toLocal(C);
        out[who] = { body: V.x, ridge: REST[who] + b.sides[who].dx, cover: b.heightAt(C.x, C.z) - (C.y + 0.12), roll: p.roll, sit: p.sit, inBed: p.inBed };
      }
      return out;
    });
    const t0 = await page.evaluate(() => window.__game.gameTime);
    let worst = 0, bare = 0, n = 0;
    while ((await page.evaluate(() => window.__game.gameTime)) - t0 < 180) {
      await sleep(1500);
      const s = await sample(); n++;
      for (const who of ['dad', 'mom']) { const d = Math.abs(s[who].ridge - s[who].body); if (d > worst) worst = d; if (s[who].sit < 0.05 && -s[who].cover > bare) bare = -s[who].cover; }
    }
    const st = await P(page, (par) => ({ rolls: par.test.stats.rolls, arms: par.test.stats.armOuts, states: par.test.stats.states }));
    ok(st.rolls.dad >= 1 && st.rolls.mom >= 1, 'not both turned over in three minutes: ' + JSON.stringify(st.rolls));
    ok(st.arms.dad >= 1, "Dad's arm never came out in three minutes");
    ok(worst <= 0.03, `the quilt's rise lagged its body by ${(worst * 100).toFixed(1)} cm`);
    ok(bare <= 0.01, `a chest came up through the quilt by ${(bare * 100).toFixed(1)} cm`);
    clean(w);
    await ctx.close();
    // two renders two seconds apart differ at the quilt's ridge (a page that draws, the frame stopped and stepped by hand)
    const diff = await renderDiff(browser);
    ok(diff.changed >= 20, `the quilt did not move between the renders (${diff.changed} pixels changed in ${JSON.stringify(diff.box)})`);
    return `rolls Dad ${st.rolls.dad}, Mom ${st.rolls.mom}; Dad's arm out ${st.arms.dad}; each side of the quilt within ${(worst * 100).toFixed(1)} cm of its body and over its chest at ${n} samples; renders 2 s apart differ in ${diff.changed} pixels of the quilt`;
  } finally { await ctx.close().catch(() => {}); }
}
async function renderDiff(browser) {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } }), page = await ctx.newPage();
  try {
    await page.goto(BASE + '/index.html#shot', { waitUntil: 'load', timeout: 180e3 });
    await page.waitForFunction(() => window.__game && document.getElementById('loading').classList.contains('done') && window.__game.mom.rig && window.__game.dad.rig, null, { timeout: 300e3, polling: 250 });
    await page.evaluate(async () => {
      const g = window.__game, THREE = await import('three'), par = (await import('/js/hooks.js')).hooks.parents;
      g.start(); window.__freeze = true; for (const id of ['title', 'hud', 'mobile']) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
      g.gfx.setQuality('low', { save: false }); g.F.night = 2; g.setPhase('night', true); g.F.phase = 'night'; par.test.force = true; g.P.mode = 'cine';
      g.lights.set('parents', true, { silent: true }); for (let i = 0; i < 30; i++) g.lights.update(1 / 30);
      let T = 0; const step = (sec) => { for (let i = 0; i < sec * 60; i++) { T += 1 / 60; par.update(1 / 60); g.mom.update(T, 1 / 60); g.dad.update(T, 1 / 60); g.W.bedSleepers.update(1 / 60); } g.scene.updateMatrixWorld(true); };
      step(1);
      // from the foot of the bed, low, down Dad's side: the ridge of the quilt over his chest stands against the headboard
      const cam = g.camera, b = g.W.bedSleepers;
      const sp = g.dad.rig.bones.Spine1.getWorldPosition(new THREE.Vector3()), loc = b.toLocal(sp.clone()); loc.y = b.heightAt(loc.x, loc.z);
      const ridge = b.group.localToWorld(loc.clone()), eye = b.group.localToWorld(new THREE.Vector3(loc.x, loc.y + 0.06, -1.75));
      cam.fov = 50; cam.updateProjectionMatrix(); cam.position.copy(eye); cam.lookAt(ridge); cam.updateMatrixWorld(true);
      // the quilt's box on screen (from its vertices as they are now: the geometry's own box is the shape it was built with): the pixels
      // inside it that changed (by 4 levels or more) between the two frames, drawn without the two of them (their breath is not the quilt's)
      const box = new THREE.Box3().setFromObject(b.quilt, true), pts = []; for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) pts.push(new THREE.Vector3(x, y, z).project(cam));
      const c = document.querySelector('#game canvas'), cl = (v, a, z) => Math.max(a, Math.min(z, v));
      const X0 = cl(Math.floor((Math.min(...pts.map((q) => q.x)) + 1) / 2 * c.width), 0, c.width), X1 = cl(Math.ceil((Math.max(...pts.map((q) => q.x)) + 1) / 2 * c.width), 0, c.width);
      const Y0 = cl(Math.floor((1 - Math.max(...pts.map((q) => q.y))) / 2 * c.height), 0, c.height), Y1 = cl(Math.ceil((1 - Math.min(...pts.map((q) => q.y))) / 2 * c.height), 0, c.height);
      const grab = () => {
        // (drawn twice: in the software renderer the first frame drawn after a change of shape can still show the shape before it)
        g.mom.group.visible = g.dad.group.visible = false; g.gfx.render(0.016); g.gfx.render(0.016); g.mom.group.visible = g.dad.group.visible = true;
        const cv = document.createElement('canvas'); cv.width = c.width; cv.height = c.height; const x = cv.getContext('2d'); x.drawImage(c, 0, 0); return x.getImageData(X0, Y0, X1 - X0, Y1 - Y0).data;
      };
      window.__rd = { grab, step, a: grab(), box: [X0, X1, Y0, Y1] };
    });
    // (the second frame in a task of its own: the canvas is read back once the first has been shown)
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
    return await page.evaluate(() => {
      const { grab, step, a, box } = window.__rd; step(2); const c2 = grab();
      let changed = 0; for (let i = 0; i < a.length; i += 4) if (Math.max(Math.abs(a[i] - c2[i]), Math.abs(a[i + 1] - c2[i + 1]), Math.abs(a[i + 2] - c2[i + 2])) >= 4) changed++;
      return { changed, box };
    });
  } finally { await ctx.close(); }
}

(async () => {
  let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.error('Playwright is not installed'); process.exit(2); }
  const server = await startServer(); BASE = `http://127.0.0.1:${server.address().port}`;
  const launch = () => chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  // each scene in a browser of its own (the software renderer is happier fresh)
  const run = async (name, fn) => { if (!want(name)) return; const b = await launch(); try { await section(name, () => fn(b)); } finally { await b.close(); } };
  await run('dad', dadKitchen);
  await run('bunk', dadBunk);
  await run('pod', dadPod);
  await run('mom', momNight5);
  await run('rules', rules);
  await run('bed', bed);
  server.close();
  const bad = results.filter((r) => r.status !== 'PASS');
  console.log(`${results.length - bad.length}/${results.length} passed`);
  process.exit(bad.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
