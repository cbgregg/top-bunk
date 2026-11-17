#!/usr/bin/env node
'use strict';
// The jumps, the quiet ones and the night's dressing (js/scares.js), headless in Chromium:
//   table     every beat of js/scares.js is on the night engine's table, none of them before night two or after night nine, the nine jumps
//             are presence or loud beats (the engine's caps and the fifteen seconds after a reveal are theirs), a loud one says its noise
//   nightone  night one: no dressing out (no scratched face, no footprint, the drawing its own), and nothing of this file can arm
//   dressing  nights two to nine on one seed: the scratched faces and the figures in the drawing never go down from one night to the
//             next, footprints only from night four, and the same night twice is the same house
//   jumps     each jump, on night six: armed out of view, nothing loud before its reveal, revealed by what the player does (a door
//             opened, a look, a step, a photograph, a light switch, the telephone picked up), paid off once, and the house put back
//             after (the doors, the television, the telephone, the thing hidden and back on its own layer, the hand off the rail).
//             While the door swings in front of the face its head stays clear of the leaf; the hand's joints are outside the rail
//   spacing   after one jump no other may arm for seventy seconds, and the last one never again until another has been
//   quiet     each quiet beat armed and revealed by the player's own action, paid off once, and undone
//   sounds    the three sounds made here (a hummed note, a music box tooth, the scream down the line) play without an error
//   node tests/scares.js [--port N] [--only table,nightone,dressing,jumps,spacing,quiet,sounds]
const http = require('http');
const path = require('path');
const { Readable } = require('stream');
const serve = require('../desktop/static');

const ROOT = path.join(__dirname, '..');
const ARGV = process.argv.slice(2);
const opt = (name, def) => { const i = ARGV.indexOf(name); return i >= 0 && ARGV[i + 1] !== undefined ? ARGV[i + 1] : def; };
const PORT = +opt('--port', process.env.SMOKE_PORT || 0);
const ONLY = opt('--only', '') ? new Set(opt('--only', '').split(',')) : null;
const want = (n) => !ONLY || ONLY.has(n);
const results = [];
function ok(cond, msg) { if (!cond) throw new Error(msg); }
async function section(name, fn, ms = 600e3) {
  if (!want(name)) return;
  const t0 = Date.now(); let status = 'PASS', detail = '', timer;
  try { detail = (await Promise.race([Promise.resolve().then(fn), new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`timed out after ${ms / 1000} s`)), ms); })])) || ''; }
  catch (e) { status = 'FAIL'; detail = String(e && e.message || e).split('\n')[0]; }
  finally { clearTimeout(timer); }
  results.push({ name, status });
  console.log(`${status} ${name}: ${detail} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}

// ---------- the server and the page (as tests/events.js has them) ----------
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
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error') w.console.push(t); else if (m.type() === 'warning' && /\b(event|cleanup|nightmare|night type) .*failed/.test(t)) w.console.push(t); });
  return w;
}
const clean = (w) => { const p = [...w.errors.map((s) => `page error: ${s}`), ...w.console.map((s) => `console: ${s}`)]; ok(p.length === 0, `${p.length} problem(s): ${p.slice(0, 3).join(' | ')}`); };
const until = (page, fn, arg, ms = 60e3) => page.waitForFunction(fn, arg, { timeout: ms, polling: 100 });
async function nightPage(browser, hash) {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await ctx.newPage(), w = watch(page);
  await page.addInitScript(() => { window.__norender = true; });
  await page.goto(BASE + '/index.html' + hash, { waitUntil: 'load', timeout: 180e3 });
  await page.waitForFunction(() => window.__game && document.getElementById('loading').classList.contains('done'), null, { timeout: 180e3, polling: 250 });
  await page.evaluate(() => { const g = window.__game; g.renderer.compileAsync = async () => {}; g.gfx.render = () => {}; g.startGame(); });
  const n = hash.match(/night(\d+)/)[1];
  await until(page, (n) => window.__game.F.stage === 'n' + n && window.__game.F.live, n, 240e3);
  await page.evaluate(() => { try { window.__game.weather.lock('clear'); } catch (e) { /* no weather */ } window.__clockMul = 0.001; });   // a dry night, and one that does not end while the test is in it
  // the test's own hands in the page: the engine, the player put somewhere, game seconds waited
  await page.evaluate(async () => {
    const g = window.__game, events = await import('/js/events.js'), P = g.P;
    const T = window.T = { events, sc: g.nights.scares };
    T.sleep = (s) => new Promise((r) => { const t0 = g.gameTime; const f = () => (g.gameTime - t0 >= s ? r() : setTimeout(f, 30)); f(); });
    T.wait = async (fn, s = 8) => { const t0 = g.gameTime; while (g.gameTime - t0 < s) { if (fn()) return true; await new Promise((r) => setTimeout(r, 20)); } return !!fn(); };
    T.stand = (x, z, tx, tz, pitch = 0) => { P.mode = 'walk'; P.pos.set(x, 0, z); P.vel.set(0, 0, 0); P.yaw = Math.atan2(-(tx - x), -(tz - z)); P.pitch = pitch; };
    T.bunk = (yaw = 0.2, pitch = 0) => { P.mode = 'bunk'; P.pos.set(g.BUNK_SEAT.x, 0, g.BUNK_SEAT.z); P.cam.copy(g.BUNK_SEAT); P.yaw = yaw; P.pitch = pitch; };
    T.door = (k, open) => { const d = g.W.doors[k]; d.a = d.target = open ? 1 : 0; d.apply(); };
    T.clear = () => { events.suspend(true); for (const a of events.test.active()) events.test.undo(a.id); g.nights.stage.endStage(); g.F.script = false; g.F.cutscene = false; g.F.fear = 0; };
    // (Mom and Dad's door is theirs: a loud beat can wake them, and whoever gets up opens it)
    T.house = () => ({ doors: Object.fromEntries(Object.entries(g.W.doors).filter(([k]) => k !== 'parents').map(([k, d]) => [k, d.target])), tv: !!g.W.tvFx.on, ring: !!g.W.phone.ringing, off: !!g.W.phone.off, E: !!g.E.visible, layer: g.E.root.layers.mask, hand: g.nights.scares.hand.g.visible, mirror: g.W.mirrorFx.plane.visible, chair: g.W.chairs.map((c) => [c.holder.position.x, c.holder.position.z, c.holder.rotation.y, c.holder.rotation.z].map((v) => Math.round(v * 100) / 100).join()).join(' ') });
    // one beat through: put the player where it arms, arm it, check nothing has paid off, let `act` reveal it as the player would, and undo it
    T.run = async (id, { setup, act, during, restore, settle = 0.8, after = 2.5 }) => {
      T.clear(); await setup(); await T.sleep(2.4);
      const r = { id, before: T.house() }, p0 = events.test.payoffs()[id] || 0;
      r.arm = events.test.arm(id); if (r.arm !== 'armed') return r;
      await T.sleep(settle); r.armed = events.test.state(id); r.early = (events.test.payoffs()[id] || 0) - p0;
      if (during) r.during = await during();
      await act(); r.revealed = await T.wait(() => events.test.state(id) !== 'armed', 8);
      r.how = (events.test.active().find((a) => a.id === id) || {}).how || (events.test.stats().reveals.filter((x) => x.id === id).pop() || {}).how || null;
      await T.sleep(after); r.pay = (events.test.payoffs()[id] || 0) - p0;
      events.test.undo(id); if (restore) restore(); await T.sleep(0.4); r.after = T.house();   // (restore: what the player's own hand changed on the way)
      return r;
    };
  });
  await until(page, () => { const g = window.__game; return g.P.mode === 'bunk' && !g.F.cutscene && !g.F.script; }, null, 60e3);
  await page.evaluate(() => { window.__game.nights.director.stop(); window.T.events.suspend(true); });
  return { page, w, ctx };
}
const same = (r) => JSON.stringify(r.before) === JSON.stringify(r.after);
const diff = (r) => Object.keys(r.before).filter((k) => JSON.stringify(r.before[k]) !== JSON.stringify(r.after[k])).map((k) => `${k}: ${JSON.stringify(r.before[k])} -> ${JSON.stringify(r.after[k])}`).join(', ');
function check(r, hows) {
  ok(r.arm === 'armed', `${r.id}: would not arm (${r.arm})`);
  ok(r.armed === 'armed' && !r.early, `${r.id}: ${r.early ? 'paid off before its reveal' : 'not armed after the arm (' + r.armed + ')'}`);
  ok(r.revealed, `${r.id}: the player's own action did not reveal it`);
  ok(hows.includes(r.how), `${r.id}: revealed by ${r.how}, not by ${hows.join(' or ')}`);
  ok(r.pay === 1, `${r.id}: payoff ran ${r.pay} times`);
  ok(same(r), `${r.id}: undo left ${diff(r)}`);
}

const JUMPS = ['doorFace', 'doorSlam', 'bunkHand', 'flashFigure', 'hallSprint', 'mirrorLight', 'lightningFace', 'tvRoom', 'phoneScream'];
const QUIET = ['doorBreath', 'knockBack', 'wallScratch', 'breathHeld', 'stepsAbove', 'ventHum', 'whisperWalk', 'musicBox', 'chairRock'];
const HASH = '#night6&seed=F3PC-0001&type=hunted';

(async () => {
  let chromium = null;
  try { ({ chromium } = require('playwright')); } catch (e) { console.error('Playwright is not installed'); process.exit(2); }
  const server = await startServer();
  BASE = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  let main = null;
  const page6 = async () => (main ||= await nightPage(browser, HASH));

  await section('table', async () => {
    const { page } = await page6();
    const defs = await page.evaluate(() => window.T.events.defs().map((d) => ({ id: d.id, tier: d.tier, minN: d.minN, maxN: d.maxN, noise: d.noise, once: d.once })));
    const mine = defs.filter((d) => JUMPS.includes(d.id) || QUIET.includes(d.id));
    const missing = [...JUMPS, ...QUIET].filter((id) => !mine.some((d) => d.id === id));
    ok(!missing.length, `not on the table: ${missing.join(' ')}`);
    const early = mine.filter((d) => d.minN < 2 || d.maxN > 9); ok(!early.length, `outside nights two to nine: ${early.map((d) => d.id).join(' ')}`);
    const soft = mine.filter((d) => JUMPS.includes(d.id) && !['presence', 'loud'].includes(d.tier)); ok(!soft.length, `a jump that is not a presence or a loud beat: ${soft.map((d) => d.id).join(' ')}`);
    const stung = mine.filter((d) => QUIET.includes(d.id) && !['whisper', 'wrong'].includes(d.tier)); ok(!stung.length, `a quiet beat in a loud tier: ${stung.map((d) => d.id).join(' ')}`);
    const mute = mine.filter((d) => d.tier === 'loud' && !(d.noise > 0)); ok(!mute.length, `loud with no noise: ${mute.map((d) => d.id).join(' ')}`);
    ok(mine.every((d) => d.once), 'a beat of this file may arm twice a night');
    const list = await page.evaluate(() => window.T.sc.jumps);
    ok(JSON.stringify(list.slice().sort()) === JSON.stringify(JUMPS.slice().sort()), `the module's list of jumps is ${list.join(' ')}`);
    // more of them can come every night or two
    const by = (n) => mine.filter((d) => d.minN <= n).length, counts = [2, 3, 4, 5, 6].map(by);
    ok(counts.every((c, i) => !i || c >= counts[i - 1]) && counts[4] > counts[0], `beats open by night: ${counts.join(' ')}`);
    return `${mine.length} beats (${JUMPS.length} jumps, ${QUIET.length} quiet), open by night two to six: ${counts.join(' ')}`;
  });

  await section('nightone', async () => {
    const { page, w, ctx } = await nightPage(browser, '#night1');
    const r = await page.evaluate(([ids]) => {
      const g = window.__game, T = window.T, sc = T.sc;
      return { finds: sc.finds.length, prints: sc.prints.grp.visible, scratched: sc.scratches.filter((s) => s.m.visible).length, drawing: g.W.drawingMat.map === g.W.T.drawing0 || g.W.drawingMat.map === g.W.T.drawing2,
        open: T.events.defs().filter((d) => ids.includes(d.id) && d.minN <= 1).map((d) => d.id), hand: sc.hand.g.visible, E: g.E.visible };
    }, [[...JUMPS, ...QUIET]]);
    ok(!r.finds && !r.prints && !r.scratched && r.drawing, `dressing out on night one: ${JSON.stringify(r)}`);
    ok(!r.open.length, `open on night one: ${r.open.join(' ')}`);
    ok(!r.hand && !r.E, 'the hand or the thing is showing as night one starts');
    clean(w); await ctx.close();
    return 'no dressing, nothing of this file open, the thing not shown';
  });

  await section('dressing', async () => {
    const { page } = await page6();
    const rows = await page.evaluate(() => {
      const g = window.__game, sc = window.T.sc, out = [], n0 = g.F.night;
      const snap = () => ({ faces: sc.scratches.filter((s) => s.m.visible).length, prints: sc.prints.grp.visible ? sc.prints.list.filter((m) => m.visible).length : 0, drawn: g.W.drawingMat.map !== g.W.T.drawing1, finds: sc.finds.map((f) => f.id).join() });
      for (let n = 2; n <= 9; n++) { sc.start(n); const a = snap(); sc.start(n); const b = snap(); out.push({ n, ...a, same: JSON.stringify(a) === JSON.stringify(b), tex: sc.drawingFor(n) ? sc.drawingFor(n).uuid : null }); }
      sc.start(n0); return { rows: out, hung: sc.scratches.length, inHouse: sc.scratches.filter((s) => { let p = s.m; while (p && p !== g.W.house) p = p.parent; return !!p; }).length };
    });
    const R = rows.rows;
    ok(rows.hung > 0, 'no photograph found to scratch');
    ok(R.every((r) => r.same), `a night's dressing differs between two starts: ${R.filter((r) => !r.same).map((r) => r.n).join(' ')}`);
    ok(R.every((r, i) => !i || r.faces >= R[i - 1].faces) && R[R.length - 1].faces > R[0].faces && R[0].faces >= 1, `scratched faces by night: ${R.map((r) => r.faces).join(' ')}`);
    ok(R.filter((r) => r.n < 4).every((r) => !r.prints) && R.filter((r) => r.n >= 8).every((r) => r.prints > 0), `footprints by night: ${R.map((r) => r.prints).join(' ')}`);
    ok(!R[0].drawn && R.slice(1).every((r) => r.drawn) && new Set(R.slice(1).map((r) => r.tex)).size === R.length - 1, 'the drawing does not gain something every night from the third');
    return `faces ${R.map((r) => r.faces).join(' ')}, footprints ${R.map((r) => r.prints).join(' ')}, a new drawing each night from the third`;
  });

  await section('jumps', async () => {
    const { page, w } = await page6();
    const notes = [];
    // the face at the door: the thing waits behind the shut door and is not seen; the door is opened from the hall; its head never comes
    // within reach of the leaf as it swings, and it only bends into the opening once the leaf is back against the wall
    let r = await page.evaluate(() => { const g = window.__game, T = window.T, W = g.W, E = g.E; let worst = 9, bentAt = null; return T.run('doorFace', {
      setup: () => T.stand(7.6, -0.42, 10.1, -0.42),
      during: () => ({ E: E.visible, shut: W.doors.room2.a, los: g.nights.hunter.los(g.P.pos.x, g.P.pos.z, E.root.position.x, E.root.position.z) }),
      act: async () => {
        T.stand(5.42, -0.2, 5.42, -1.14); await T.sleep(0.3); g.toggleDoor(W.doors.room2);
        const d = W.doors.room2, h = new g.P.pos.constructor();
        await T.wait(() => {   // the leaf as a segment from its hinge, the head as a point: the gap between them on the plan while the head is below the leaf's top
          E.headWorld(h); const ang = d.a * Math.PI / 2, tx = d.hx + Math.cos(ang) * d.w, tz = d.hz - Math.sin(ang) * d.w, vx = tx - d.hx, vz = tz - d.hz;
          const u = Math.max(0, Math.min(1, ((h.x - d.hx) * vx + (h.z - d.hz) * vz) / (vx * vx + vz * vz))), gap = Math.hypot(h.x - d.hx - vx * u, h.z - d.hz - vz * u);
          if (E.visible && h.y < 2.25) worst = Math.min(worst, gap); if (E.lean > 0.05 && bentAt === null) bentAt = d.a;
          return !E.visible && d.a > 0.99;
        }, 6);
      }, restore: () => T.door('room2', false) }).then((x) => ({ ...x, worst, bentAt })); });
    check(r, ['open']);
    ok(r.during.E && r.during.shut < 0.05 && !r.during.los, `doorFace: before the door is opened ${JSON.stringify(r.during)}`);
    ok(r.worst > 0.22, `doorFace: its head came within ${r.worst.toFixed(2)} m of the leaf`);
    ok(r.bentAt !== null && r.bentAt > 0.97, `doorFace: it bent into the doorway with the leaf at ${r.bentAt}`);
    notes.push(`doorFace head to leaf ${r.worst.toFixed(2)} m`);
    // a door shut in your face: you walk at an open door from the hall
    r = await page.evaluate(() => { const g = window.__game, T = window.T; return T.run('doorSlam', {
      setup: () => T.stand(7.9, -0.42, 5.4, -0.42), act: async () => { T.stand(9.55, -0.55, 9.79, 0.3); await T.wait(() => g.W.doors.kid.a < 0.01, 3); }, during: () => ({ a: g.W.doors.kid.a }), after: 0.5 }).then(async (x) => ({ ...x, shut: null })); });
    ok(r.arm === 'armed' && r.armed === 'armed' && !r.early && r.revealed && r.how === 'approach' && r.pay === 1, `doorSlam: ${JSON.stringify({ arm: r.arm, armed: r.armed, early: r.early, how: r.how, pay: r.pay })}`);
    ok(r.during.a > 0.9, 'doorSlam: the door moved before you came to it'); ok(same(r), `doorSlam: undo left ${diff(r)}`);
    // the hand on the rail: you look somewhere else, and then down at the rail
    r = await page.evaluate(() => { const g = window.__game, T = window.T, sc = T.sc; return T.run('bunkHand', {
      setup: () => T.bunk(1.9, 0.3), during: () => {
        // every joint of every finger outside the board (3 cm thick, its top at 1.743) by its own thickness, and over the quilt
        const bad = []; sc.hand.g.updateMatrixWorld(true);
        sc.hand.g.traverse((o) => { if (!o.isMesh || o.geometry.type !== 'SphereGeometry') return; const p = o.getWorldPosition(new g.P.pos.constructor()), r = Math.min(o.scale.x, o.scale.z);
          const dz = Math.max(3.286 - p.z, 0, p.z - 3.316), dy = Math.max(1.635 - p.y, 0, p.y - 1.743); if (Math.hypot(dz, dy) < r - 0.0005) bad.push([p.y.toFixed(3), p.z.toFixed(3), r.toFixed(3)].join('/')); });
        return { bad, shown: sc.hand.g.visible, x: sc.hand.g.position.x };
      },
      act: () => { const x = sc.hand.g.position.x; g.P.yaw = Math.atan2(-(x - 8.28), -(3.3 - 4.0)); g.P.pitch = -0.6; } }); });
    check(r, ['look']);
    ok(r.during.shown && !r.during.bad.length, `bunkHand: ${r.during.shown ? 'a joint inside the rail: ' + r.during.bad.join(' ') : 'the hand is not on the rail'}`);
    ok(r.during.x > 7.6 && r.during.x < 8.8, `bunkHand: at x ${r.during.x}, off the guard board`);
    // the photograph: the flash, and it is in front of the lens until the flash has gone
    r = await page.evaluate(() => { const g = window.__game, T = window.T; let seen = false; return T.run('flashFigure', {
      setup: () => T.stand(8.8, -0.42, 5.4, -0.42), during: () => ({ E: g.E.visible }),
      act: async () => { g.hands.flashAt = g.gameTime; await T.wait(() => (seen = seen || g.E.visible), 1); }, after: 1.2 }).then((x) => ({ ...x, seen })); });
    check(r, ['photo']); ok(!r.during.E && r.seen, `flashFigure: ${r.seen ? 'the thing stood there before the flash' : 'nothing in the flash'}`);
    // across the end of the hall
    r = await page.evaluate(() => { const g = window.__game, T = window.T, E = g.E; const tr = []; return T.run('hallSprint', {
      setup: () => T.stand(8.6, -0.42, 10.6, -0.42), during: () => ({ E: E.visible, seen: g.nights.stage.gaze.inView({ x: E.root.position.x, z: E.root.position.z, y: 0 }) }),
      act: async () => { T.stand(8.6, -0.42, 2.9, -0.42); await T.wait(() => { if (E.visible && E.mode === 'run') tr.push([E.root.position.x, E.root.position.z]); return tr.length && !E.visible; }, 4); }, after: 1 }).then((x) => ({ ...x, tr })); });
    check(r, ['look']);
    ok(r.during.E && !r.during.seen, 'hallSprint: it was in view before you turned');
    ok(r.tr.length >= 3 && r.tr.every(([x]) => x > 2.6 && x < 3.25) && r.tr[r.tr.length - 1][1] > r.tr[0][1], `hallSprint: its run ${JSON.stringify(r.tr.slice(0, 3))}`);
    // the mirror: the light put on by hand, the figure there, a look, and gone
    r = await page.evaluate(() => { const g = window.__game, T = window.T; let drawn = false; return T.run('mirrorLight', {
      setup: () => { g.lights.set('bath', false, { silent: true }); T.stand(5.7, 0.9, 5.7, -0.4); }, during: () => ({ shown: g.W.mirrorFx.plane.visible }),
      act: async () => { g.lights.toggle('bath', { by: 'player' }); await T.wait(() => (drawn = g.W.mirrorFx.plane.visible), 2); T.stand(5.6, 1.9, 6.6, 1.64, 0.3); }, after: 1.5 }).then((x) => { g.lights.set('bath', false, { silent: true }); return { ...x, drawn, on: true }; }); });
    ok(r.arm === 'armed' && !r.early && r.revealed && r.how === 'look' && r.pay === 1, `mirrorLight: ${JSON.stringify({ arm: r.arm, early: r.early, how: r.how, pay: r.pay })}`);
    ok(!r.during.shown && r.drawn && !r.after.mirror, `mirrorLight: the glass ${JSON.stringify({ before: r.during.shown, drawn: r.drawn, after: r.after.mirror })}`);
    // the window in the lightning: outside the glass, and only while the sky is lit
    r = await page.evaluate(() => { const g = window.__game, T = window.T, E = g.E; let at = null; return T.run('lightningFace', {
      setup: () => T.stand(9.4, 2.0, 7.5, 2.0), during: () => ({ E: E.visible }),
      act: async () => { T.stand(9.4, 2.0, 11.36, 3.83, 0.2); await T.wait(() => { if (E.visible) at = [E.root.position.x, E.root.position.z]; return !!at; }, 2); }, after: 1.2 }).then((x) => ({ ...x, at })); });
    check(r, ['look']); ok(!r.during.E && r.at && r.at[0] > 11.5, `lightningFace: ${r.at ? 'it stood at ' + r.at.map((v) => v.toFixed(2)).join(',') + ', not outside the glass' : 'nothing at the glass'}`);
    // the television: on behind you, and what it shows is never in the room (the thing is on the picture's own layer)
    r = await page.evaluate(() => { const g = window.__game, T = window.T, E = g.E; const masks = new Set(); return T.run('tvRoom', {
      setup: () => T.stand(1.0, -2.2, -1.5, -2.2), during: () => ({ tv: g.W.tvFx.on, E: E.visible }),
      act: async () => { T.stand(1.0, -2.2, 4.04, -3.11, -0.1); await T.wait(() => { if (E.visible) masks.add(E.root.layers.mask); return false; }, 1.6); }, after: 1.2 }).then((x) => ({ ...x, masks: [...masks] })); });
    check(r, ['look']); ok(r.during.tv && !r.during.E, 'tvRoom: the set did not come on at the arm');
    ok(r.masks.length === 1 && r.masks[0] === 32, `tvRoom: the thing was drawn on layers ${r.masks.join(' ')} (the room's own is 1)`);
    // the telephone: it rings, and you pick it up
    r = await page.evaluate(() => { const g = window.__game, T = window.T, ph = g.W.phone; return T.run('phoneScream', {
      setup: () => T.stand(1.0, -2.2, 3.5, -2.2), during: () => ({ ring: ph.ringing }),
      act: async () => { T.stand(ph.pos.x + 0.9, ph.pos.z, ph.pos.x, ph.pos.z, 0.1); await T.sleep(0.4); }, settle: 2.2, after: 0.2 }); });
    ok(r.arm === 'armed' && r.armed === 'armed' && !r.early && r.during.ring, `phoneScream: ${JSON.stringify({ arm: r.arm, armed: r.armed, early: r.early, ring: r.during.ring })}`);
    // (the press of the key is the page's own: the prompt is up, and E answers it)
    r = await page.evaluate(async () => { const g = window.__game, T = window.T, ph = g.W.phone; T.clear(); T.stand(1.0, -2.2, 3.5, -2.2); await T.sleep(2.4); const p0 = T.events.test.payoffs().phoneScream || 0; const before = T.house(); T.events.test.arm('phoneScream'); await T.sleep(1.0); T.stand(ph.pos.x + 0.9, ph.pos.z, ph.pos.x, ph.pos.z, 0.1); await T.sleep(0.5); return { before, p0 }; });
    await page.keyboard.press('KeyE');
    const ph = await page.evaluate(async (s) => { const g = window.__game, T = window.T; const revealed = await T.wait(() => T.events.test.state('phoneScream') !== 'armed', 3); const picked = g.W.phone.off; await T.sleep(4.2); const pay = (T.events.test.payoffs().phoneScream || 0) - s.p0, hung = !g.W.phone.off && !g.W.phone.ringing; T.events.test.undo('phoneScream'); await T.sleep(0.3); const now = T.house(); return { revealed, picked, pay, hung, same: JSON.stringify(s.before) === JSON.stringify(now), left: Object.keys(now).filter((k) => JSON.stringify(now[k]) !== JSON.stringify(s.before[k])).map((k) => k + ' ' + JSON.stringify(s.before[k]) + ' -> ' + JSON.stringify(now[k])).join(', ') }; }, r);
    ok(ph.revealed && ph.picked && ph.pay === 1 && ph.hung && ph.same, `phoneScream: ${JSON.stringify(ph)}`);
    clean(w);
    return `nine jumps armed unseen, revealed by the player and undone; ${notes.join(', ')}`;
  }, 900e3);

  await section('spacing', async () => {
    const { page } = await page6();
    const r = await page.evaluate(async () => {
      const g = window.__game, T = window.T, sc = T.sc, RUN = g.RUN; T.clear();
      // straight after a jump (the tests above left one): none may come, whichever it is
      const last = sc.lastJump, soon = sc.jumps.filter((id) => sc.mayJump(id));
      // seventy seconds on, every one but the last may
      const t0 = g.gameTime; while (g.gameTime - t0 < 72) await new Promise((r) => setTimeout(r, 200));
      const later = sc.jumps.filter((id) => sc.mayJump(id));
      RUN.lastJump = 'doorSlam'; const after = sc.jumps.filter((id) => sc.mayJump(id)); RUN.lastJump = last;
      return { last, soon, later, after, n: sc.jumps.length };
    });
    ok(r.last && r.soon.length === 0, `inside seventy seconds of ${r.last}: ${r.soon.join(' ') || 'none'} may arm`);
    ok(r.later.length === r.n - 1 && !r.later.includes(r.last), `seventy seconds on: ${r.later.join(' ')}`);
    ok(!r.after.includes('doorSlam') && r.after.includes(r.last), 'the last jump is not the one held back');
    return `none inside seventy seconds; after it every one but the last (${r.last})`;
  }, 400e3);

  await section('quiet', async () => {
    const { page, w } = await page6();
    const run = (id, body) => page.evaluate(`(async () => { const g = window.__game, T = window.T, P = g.P, W = g.W; return T.run(${JSON.stringify(id)}, ${body}); })()`);
    let r = await run('doorBreath', `{ setup: () => T.stand(6.6, -0.42, 8.6, -0.42), act: async () => { T.stand(5.42, -0.2, 5.42, -1.14); await T.sleep(0.3); g.toggleDoor(W.doors.room2); }, restore: () => T.door('room2', false) }`); check(r, ['open']);
    r = await run('knockBack', `{ setup: () => T.stand(9.6, -0.45, 9.79, 0.3), act: async () => { g.toggleDoor(W.doors.kid); }, restore: () => T.door('kid', true), after: 4.5 }`); check(r, ['hold']);
    r = await run('wallScratch', `{ setup: () => T.bunk(0.2, 0), settle: 1.2, act: () => { P.yaw = Math.atan2(-(7.75 - 8.28), -(4.62 - 4.0)); P.pitch = -0.25; }, after: 4.5 }`); check(r, ['look']);
    r = await run('stepsAbove', `{ setup: () => T.stand(7.6, -0.42, 10.1, -0.42), act: () => {}, settle: 0.3, after: 0.5 }`); check(r, ['hold']);
    r = await run('ventHum', `{ setup: () => T.stand(8.6, -0.42, 5.4, -0.42), act: () => { const v = T.events.test.point('ventHum'); T.stand(v.x + (v.x > 8 ? -0.9 : 0.9), v.z, v.x, v.z); }, after: 1 }`); check(r, ['approach']);
    r = await run('whisperWalk', `{ setup: () => T.stand(9.6, -0.42, 5.4, -0.42), act: async () => { for (let i = 0; i < 40; i++) { P.pos.x -= 0.08; await T.sleep(0.08); } }, after: 3.5 }`); check(r, ['hold']);
    r = await run('musicBox', `{ setup: () => T.stand(7.6, -0.42, 5.4, -0.42), act: () => { T.door('spare', true); T.stand(10.5, -2.2, 10.0, -2.9); }, restore: () => T.door('spare', false), after: 4 }`);
    ok(r.arm === 'armed' && !r.early && r.revealed && r.how === 'enterRoom' && r.pay === 1, `musicBox: ${JSON.stringify({ arm: r.arm, early: r.early, how: r.how, pay: r.pay })}`);
    r = await run('chairRock', `{ setup: () => T.stand(1.0, -2.2, 3.5, -2.2), during: () => ({ z: W.chairs[1].holder.rotation.z }), act: () => { const t = T.events.test.point('chairRock'); T.stand(2.88, 1.03, t.x, t.z, -0.3); }, settle: 1.1, after: 1 }`); check(r, ['look']);   // from the arch, the table in front of you
    ok(Math.abs(r.during.z) > 0.005, 'chairRock: the chair is not rocking when you come to it');
    // the breath held: the key the player holds their breath with
    await page.evaluate(async () => { const T = window.T; T.clear(); T.stand(7.6, -0.42, 10.1, -0.42); await T.sleep(2.4); window.__p0 = T.events.test.payoffs().breathHeld || 0; window.__arm = T.events.test.arm('breathHeld'); await T.sleep(0.6); });
    await page.keyboard.down('Space');
    const bh = await page.evaluate(async () => { const T = window.T; const revealed = await T.wait(() => T.events.test.state('breathHeld') !== 'armed', 4); return { arm: window.__arm, revealed, holding: !!window.__game.input.down('breath') }; });
    await page.keyboard.up('Space');
    const bh2 = await page.evaluate(async () => { const T = window.T; await T.sleep(1); const pay = (T.events.test.payoffs().breathHeld || 0) - window.__p0, st = T.events.test.state('breathHeld'); T.events.test.undo('breathHeld'); return { pay, st }; });
    ok(bh.arm === 'armed' && bh.revealed && bh2.pay === 1 && bh2.st === null, `breathHeld: ${JSON.stringify({ ...bh, ...bh2 })} (it is revealed by a held breath and stops when you breathe)`);
    clean(w);
    return `${QUIET.length} quiet beats armed, revealed by the player and undone`;
  }, 900e3);

  await section('sounds', async () => {
    const { page, w, ctx } = await page6();
    const r = await page.evaluate(() => { const s = window.__game.sfx, at = { x: 7.6, y: 1.2, z: -0.4 }; const have = ['hum', 'comb', 'lineScream'].filter((k) => typeof s[k] === 'function'); s.hum({ at, f: 440 }); s.comb({ at, f: 880 }); s.lineScream({ at, gain: 0.2 }); return { have, ctx: !!s.ctx }; });
    ok(r.have.length === 3, `the sound library has only ${r.have.join(' ')}`);
    await page.waitForTimeout(600); clean(w); await ctx.close();
    return `hum, comb and lineScream played (audio context ${r.ctx ? 'running' : 'absent: the calls are no-ops'})`;
  });

  await browser.close(); server.close();
  const failed = results.filter((r) => r.status === 'FAIL').length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
