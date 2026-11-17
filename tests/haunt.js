#!/usr/bin/env node
'use strict';
// The house's restlessness (js/haunt.js) and the thing's mind (js/hunter.js), headless in Chromium, a frame at a time with the loop frozen:
//   source   neither file draws from Math.random for anything of its own (the mind's and the haunting's draws are seeded)
//   haunt    night five: nothing changes in view; out of view every change on the table can be made; what is set down stands clear of
//            the boundaries and of every line somebody walks, and no walked line is newly blocked; a door left ajar lets go when your
//            hand is on it; things stay put; a look finds them (the ledger row turns seen); the night's cleanup puts everything home;
//            the same seed makes the same changes; a late night makes more of them than an early one
//   view     the four made while you watch: the chair scrapes a hand's width, the cup goes over and breaks on the floor, the pantry
//            swings open, the ball comes out of the dark doorway and stops clear of the way; none of them with your back turned
//   mind     it starts from behind you more often than not; a hiding place used is remembered in the run's save and searched first;
//            it stands at the closet that saved you twice (once a night); it watches from a doorway and is gone when stared at; the
//            flash stops it for less each time; a door you work is heard; watched with a corner behind it, it steps back out of sight;
//            eyes off it, it comes on quicker; a loom at a remembered place is still shorter than a held breath
//   node tests/haunt.js [--port N] [--only source,haunt,view,mind]
const http = require('http');
const fs = require('fs');
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
async function section(name, fn, ms = 900e3) {
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
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error') w.console.push(t); else if (m.type() === 'warning' && /\b(haunt|event|cleanup) .*(failed|could not)/.test(t)) w.console.push(t); });
  return w;
}
const clean = (w) => { const p = [...w.errors.map((s) => `page error: ${s}`), ...w.console.map((s) => `console: ${s}`)]; ok(p.length === 0, `${p.length} problem(s): ${p.slice(0, 3).join(' | ')}`); };
async function nightPage(browser, hash) {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await ctx.newPage(), w = watch(page);
  await page.addInitScript(() => { window.__norender = true; });
  await page.goto(BASE + '/index.html' + hash, { waitUntil: 'load', timeout: 180e3 });
  await page.waitForFunction(() => window.__game && document.getElementById('loading').classList.contains('done'), null, { timeout: 180e3, polling: 250 });
  await page.evaluate(() => { const g = window.__game; g.renderer.compileAsync = async () => {}; g.gfx.render = () => {}; g.startGame(); });
  const n = hash.match(/night(\d+)/)[1];
  await page.waitForFunction((n) => window.__game.F.stage === 'n' + n && window.__game.F.live, n, { timeout: 240e3, polling: 150 });
  await page.evaluate(async () => {
    try { window.__game.weather.lock('clear'); } catch (e) { /* no weather */ }
    window.__NAV = await import('/js/nav.js'); window.__C = await import('/js/collide.js'); window.__EV = await import('/js/events.js'); window.__LOG = await import('/js/log.js');
    window.__HAUNT = await import('/js/haunt.js'); window.__HUNTER = await import('/js/hunter.js'); window.__WORLD = await import('/js/world.js');
  });
  await page.waitForFunction(() => window.__game.nights.haunt.toys.every((t) => t.ready) && window.__game.nights.haunt.cup.g.visible, null, { timeout: 60e3, polling: 200 });
  await page.evaluate(lib);
  return { page, w, ctx };
}

// what the checks drive: the gaze, the haunting, the hunter, the timers, the doors and the body, a frame at a time
function lib() {
  const g = window.__game, N = g.nights, h = N.haunt, W = g.W, P = g.P, F = g.F, H = N.hunter, E = g.E, gz = N.stage.gaze, DT = 1 / 60;
  const { NODES, ADJ } = window.__NAV, C = window.__C, ROOMS = window.__WORLD.ROOMS;
  window.__freeze = true; N.director.stop();
  const stand = (x, z, tx, tz, settle = 2.6) => {
    P.pos.set(x, 0, z); P.vel.set(0, 0, 0); P.mode = 'walk'; P.pod = null; P.sprinting = false; F.cutscene = false; F.script = false;
    P.yaw = Math.atan2(-(tx - x), -(tz - z)); P.pitch = 0; g.updateCamera(0);
    for (let i = 0; i < settle * 60; i++) gz.update(DT);
  };
  const face = (tx, tz) => { P.yaw = Math.atan2(-(tx - P.pos.x), -(tz - P.pos.z)); P.pitch = 0; g.updateCamera(0); };
  const run = (s, o = {}) => { for (let i = 0; i < Math.round(s * 60); i++) { gz.update(DT); if (o.haunt !== false) h.tick(DT); if (o.hunter !== false && F.live && !F.dead) H.update(DT); g.stepTimers(DT); W.tick(DT); E.update(DT); g.updateCamera(DT); } };
  const away = () => stand(-1.7, -3.2, -1.7, -6);   // the living room's far corner, facing the front wall: nothing east of it is in view
  const rows = (id) => window.__LOG.entries().filter((e) => e.id === id);
  const house = new Set(['hall', 'bath', 'bed', 'room2', 'spare', 'living', 'kitchen', 'dining']);
  const inHouse = (k) => !(NODES[k][2] || 0) && house.has(gz.roomOf({ x: NODES[k][0], z: NODES[k][1], y: 0 }));
  // every walked line of the house, sampled a hand apart: the samples a body the player's size cannot stand on (a shut or an ajar door's
  // doorway does not count: a door opens)
  const blocked = () => {
    const out = new Set();
    for (const a in ADJ) for (const e of ADJ[a]) {
      if (e.to < a || !inHouse(a) || !inHouse(e.to)) continue;
      const [ax, az] = NODES[a], [bx, bz] = NODES[e.to], n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.1);
      for (let i = 0; i <= n; i++) {
        const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n;
        if (Object.values(W.doors).some((d) => Math.hypot(d.mid.x - x, d.mid.z - z) < 0.95)) continue;
        if (C.probe(x, z, C.PLAYER_R - 0.03, 0, 1.6, C.body('player')).pen > 0) out.add(`${a}>${e.to}:${i}`);
      }
    }
    return out;
  };
  const edgeGap = (x, z) => { let m = 9; for (const a in ADJ) for (const e of ADJ[a]) { if (e.to < a || NODES[a][2] || NODES[e.to][2]) continue; const [ax, az] = NODES[a], [bx, bz] = NODES[e.to], dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1))); m = Math.min(m, Math.hypot(x - ax - dx * t, z - az - dz * t)); } return m; };
  const state = () => ({
    chairs: W.chairs.map((c) => [c.holder.position.x, c.holder.position.z, c.holder.rotation.y]),
    home: W.chairs.every((c) => Math.hypot(c.holder.position.x - c.x, c.holder.position.z - c.z) < 1e-6 && Math.abs(c.holder.rotation.y - c.rot) < 1e-6),
    frames: W.frames.map((f) => f.rotation.z), cups: W.cupboards.map((c) => c.k),
    doors: Object.fromEntries(['kid', 'bath', 'room2', 'spare'].map((k) => [k, [W.doors[k].target, W.doors[k].max ?? 1, +W.doors[k].a.toFixed(2)]])),
    teddy: W.teddy ? [W.teddy.position.x, W.teddy.position.y, W.teddy.position.z] : null, teddyHome: W.teddy ? W.teddy.position.distanceTo(W.teddy.rest.pos) < 1e-3 : true,
    toys: h.toys.map((t) => [t.g.visible, t.g.position.x, t.g.position.y, t.g.position.z]), cup: [h.cup.g.visible, h.cup.broken, h.cup.shards.filter((s) => s.visible).length],
  });
  window.__T = { g, N, h, W, P, F, H, E, gz, DT, NODES, ADJ, C, ROOMS, stand, face, run, away, rows, blocked, edgeGap, state };
}
const T = (page, fn, arg) => page.evaluate(fn, arg);

(async () => {
  const { chromium } = require('playwright');
  const server = await startServer(); BASE = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

  await section('source', () => {
    const haunt = fs.readFileSync(path.join(ROOT, 'js', 'haunt.js'), 'utf8'), hunter = fs.readFileSync(path.join(ROOT, 'js', 'hunter.js'), 'utf8');
    ok(!/Math\.random/.test(haunt), 'js/haunt.js draws from Math.random');
    const mind = hunter.slice(hunter.indexOf('// ---- what it knows ----'), hunter.indexOf('// ---- placing and moving ----')) + hunter.slice(hunter.indexOf('// ---- what it does with an encounter ----'), hunter.indexOf('// ---- per frame ----'));
    ok(mind.length > 2000 && !/Math\.random/.test(mind), 'the mind draws from Math.random');
    const spawn = hunter.slice(hunter.indexOf('function pickSpawn'), hunter.indexOf('// the run\'s looms'));
    ok(spawn.length > 200 && !/Math\.random/.test(spawn), 'pickSpawn draws from Math.random');
    return 'the haunting, the mind and the spawn draw from the seeded generators';
  });

  let hp = null;
  await section('haunt', async () => {
    hp = await nightPage(browser, '#night5&seed=HAUNT-0001&type=thirst');
    const { page, w } = hp, notes = [];
    // ---- the budget rises with the night
    const budget = await T(page, () => { const { changesFor, inViewFor } = window.__HAUNT; return { c: [1, 2, 5, 10].map(changesFor), v: [1, 2, 5, 10].map(inViewFor), on: window.__T.h.on, n: window.__T.h.H.n }; });
    ok(budget.on && budget.n === 5, `the haunting is not running on night five: ${JSON.stringify(budget)}`);
    ok(budget.c[0] === 0 && budget.c[1] >= 3 && budget.c[1] < budget.c[2] && budget.c[2] < budget.c[3] && budget.v[0] === 0 && budget.v[1] <= budget.v[2] && budget.v[2] <= budget.v[3], `the budget does not rise with the night: ${JSON.stringify(budget)}`);
    // ---- nothing in view: facing the table from the arch, no chair moves; facing the hall's photographs from its end, none tips
    const seen = await T(page, () => {
      const { h, stand } = window.__T;
      stand(3.0, 0.9, 1.18, 2.08); const chair = h.force('chairTurn'), cup = h.force('cupboard');
      stand(10.4, -0.42, 5, -0.42); const frame = h.force('frame'), frames = h.force('frames'), toys = h.force('toys');
      return { chair, cup, frame, frames, toys, done: h.moved.length };
    });
    ok(!seen.chair && !seen.frame && !seen.frames && !seen.toys && seen.done === 0, `something changed in view: ${JSON.stringify(seen)}`);
    notes.push('nothing changes in view');
    // ---- out of view: every change on the table
    const made = await T(page, () => {
      const { h, W, P, away, run, blocked, edgeGap, state, C, g, gz, ROOMS } = window.__T;
      away(); const before = blocked();
      const res = {}; for (const d of h.DEFS) res[d.id] = h.force(d.id);
      run(2.5, { hunter: false });
      const after = blocked(), fresh = [...after].filter((k) => !before.has(k));
      // what stands on a floor: clear of the boundaries (asked with its own footprint lifted away) and of the walked lines
      const set = [];
      W.chairs.forEach((c, i) => {
        const p = c.holder.position; if (Math.hypot(p.x - c.x, p.z - c.z) < 0.01) return;
        const was = [p.x, p.z, c.holder.rotation.y]; W.moveChair(i, 90, 90, was[2]); const pen = C.probe(was[0], was[1], 0.3, 0, 1).pen; W.moveChair(i, was[0], was[1], was[2]);
        set.push({ what: 'chair' + i, pen, gap: edgeGap(was[0], was[1]) - 0.3, room: gz.roomOf({ x: was[0], z: was[1], y: 0 }) });
      });
      for (const t of h.toys) if (t.g.visible) set.push({ what: t.name, pen: 0, gap: edgeGap(t.g.position.x, t.g.position.z) - t.r, y: t.g.position.y - t.y, room: gz.roomOf({ x: t.g.position.x, z: t.g.position.z, y: 0 }) });
      const bear = W.teddy.position; set.push({ what: 'teddy', pen: 0, gap: edgeGap(bear.x, bear.z) - 0.17, y: bear.y, room: gz.roomOf({ x: bear.x, z: bear.z, y: 0 }) });
      const ladder = g.LADDER_FLOOR, bunkChair = W.chairs.map((c) => c.holder.position).find((p) => gz.roomOf({ x: p.x, z: p.z, y: 0 }) === 'bed');
      return { res, fresh, set, st: state(), moved: h.moved, lit: ['bath', 'spare', 'room2', 'kitchen', 'living'].filter((r) => g.lights.isOn(r)), ladder: bunkChair ? Math.hypot(bunkChair.x - ladder.x, bunkChair.z - ladder.z) : null,
        cupBox: W.colliders.filter((c) => /^cupboard/.test(c.id || '')).map((c) => [c.on || !!c.armWhenClear, +(c.maxX - c.minX).toFixed(2), +(c.maxZ - c.minZ).toFixed(2)]) };
    });
    const no = Object.keys(made.res).filter((k) => !made.res[k]);
    ok(no.length === 0, `could not be made out of view: ${no.join(', ')}`);
    ok(made.fresh.length === 0, `a walked line is newly blocked: ${made.fresh.slice(0, 6).join(' ')}`);
    for (const s of made.set) ok(s.pen <= 0 && s.gap >= 0.28 && (s.y === undefined || Math.abs(s.y) < 0.02) && s.room !== 'out', `${s.what} is not set down clear: ${JSON.stringify(s)}`);
    ok(made.set.filter((s) => /^chair/.test(s.what)).length === 2 && made.set.some((s) => /^chair/.test(s.what) && s.room === 'bed'), `the chairs: ${JSON.stringify(made.set)}`);
    ok(made.ladder > 0.95, `the chair in your room stands at the foot of the ladder (${made.ladder})`);
    ok(made.st.toys.every((t) => t[0]) && made.st.frames.every((r) => Math.abs(r) > 0.05 && Math.abs(r) < 0.3), `toys or photographs: ${JSON.stringify([made.st.toys, made.st.frames])}`);
    const ajar = Object.entries(made.st.doors).filter(([, d]) => d[0] === 1 && d[1] < 1), shut = Object.entries(made.st.doors).filter(([, d]) => d[0] === 0 && d[2] === 0);
    ok(ajar.length === 1 && Math.abs(ajar[0][1][2] - ajar[0][1][1]) < 0.02 && ajar[0][1][1] < 0.35 && shut.length >= 1, `the doors: ${JSON.stringify(made.st.doors)}`);
    ok(made.st.cups.some((k) => k > 0.6) && made.cupBox.some((c) => c[0] && Math.max(c[1], c[2]) > 0.3), `the pantry: ${JSON.stringify([made.st.cups, made.cupBox])}`);
    ok(!made.st.teddyHome && made.lit.length === 1, `the bear or the light: ${JSON.stringify([made.st.teddy, made.lit])}`);
    notes.push(`${Object.keys(made.res).length} changes made unseen, all set down clear, no way blocked`);
    // ---- they stay; a look finds one; a hand on the ajar door lets it go
    const kept = await T(page, async (ajarName) => {
      const { h, W, P, run, stand, state, g, gz } = window.__T;
      const a = JSON.stringify(state()); run(6, { hunter: false }); const same = JSON.stringify(state()) === a;
      const m = h.moved.find((d) => d.id === 'chairTurn'), rowsBefore = window.__LOG.entries().filter((e) => e.id === 'haunt:chairTurn' && e.seen).length;
      stand(m.at.x + 1.6, m.at.z - 1.6, m.at.x, m.at.z, 0.2); run(1.2, { hunter: false });
      const found = h.moved.find((d) => d.id === 'chairTurn').found, rowsAfter = window.__LOG.entries().filter((e) => e.id === 'haunt:chairTurn' && e.seen).length;
      const d = W.doors[ajarName]; P.pos.set(d.mid.x, 0, d.mid.z + (d.mid.z > 0 ? -0.9 : 0.9)); g.toggleDoor(d); run(1.5, { hunter: false }); const shutNow = [d.target, d.max, +d.a.toFixed(2)];
      g.toggleDoor(d); run(1.5, { hunter: false });
      return { same, found, rowsBefore, rowsAfter, shutNow, open: [d.target, d.max, +d.a.toFixed(2)] };
    }, ajar[0][0]);
    ok(kept.same, 'what was moved did not stay where it was put');
    ok(kept.found && kept.rowsBefore === 0 && kept.rowsAfter === 1, `a look did not find the chair: ${JSON.stringify(kept)}`);
    ok(kept.shutNow[0] === 0 && kept.shutNow[1] === 1 && kept.open[0] === 1 && kept.open[2] > 0.95, `the ajar door did not let go: ${JSON.stringify(kept)}`);
    notes.push('they stay, a look finds them, the ajar door lets go');
    // ---- the night's cleanup (a catch, a restart, the dawn) puts everything home
    const home = await T(page, () => { const { state, h, g, W } = window.__T; window.__EV.cleanup(); const s = state(); return { s, on: h.on, lit: ['bath', 'spare', 'room2', 'kitchen', 'living'].filter((r) => g.lights.isOn(r)), box: W.colliders.filter((c) => /^cupboard/.test(c.id || '')).some((c) => c.on || c.armWhenClear) }; });
    ok(home.s.home && home.s.frames.every((r) => r === 0) && home.s.cups.every((k) => k === 0) && home.s.teddyHome && home.s.toys.every((t) => !t[0]) && !home.s.cup[0] && !home.on && !home.box && home.lit.length === 0, `not everything went home: ${JSON.stringify(home)}`);
    ok(Object.values(home.s.doors).every((d) => d[1] === 1), `a door is still held ajar: ${JSON.stringify(home.s.doors)}`);
    notes.push('cleanup puts everything home');
    // ---- the same seed makes the same changes; a late night makes more than an early one
    const seeded = await T(page, () => {
      const { h, F, away, run } = window.__T;
      const night = (n, minutes) => {
        window.__EV.cleanup(); const plan = { type: 'thirst', clock0: 30, n }; F.night = n; h.start(plan, n); away(); F.clock = 30;
        for (let i = 0; i < minutes * 4; i++) { F.clock += 0.25; run(0.6, { hunter: false }); }   // the clock run past the player, who stands in the corner
        return h.moved.map((d) => `${d.id}@${d.at.x.toFixed(2)},${d.at.z.toFixed(2)}`);
      };
      const a = night(5, 150), b = night(5, 150), early = night(2, 320), late = night(9, 320);
      window.__EV.cleanup(); F.night = 5;
      return { a, b, early: early.length, late: late.length };
    });
    ok(seeded.a.length >= 2 && JSON.stringify(seeded.a) === JSON.stringify(seeded.b), `the same seed did not make the same changes: ${JSON.stringify(seeded)}`);
    ok(seeded.early >= 1 && seeded.late > seeded.early, `a late night is not more restless than an early one: ${JSON.stringify(seeded)}`);
    notes.push(`seeded (${seeded.a.length} changes replayed); night two ${seeded.early}, night nine ${seeded.late}`);
    clean(w);
    return notes.join('; ');
  });

  await section('view', async () => {
    if (!hp) hp = await nightPage(browser, '#night5&seed=HAUNT-0001&type=thirst');
    const { page, w } = hp, notes = [];
    const v = await T(page, () => {
      const { h, W, P, F, g, stand, run, C, edgeGap, gz } = window.__T, out = {};
      window.__EV.cleanup(); F.night = 5; h.start({ type: 'thirst', clock0: 30, n: 5 }, 5);
      // your back to the table: nothing
      stand(3.0, 0.9, 6, 0.9); out.backScrape = h.forceView('scrape'); out.backCup = h.forceView('cup');
      // facing it
      stand(3.0, 0.9, 1.18, 2.08);
      out.scrape = h.forceView('scrape'); run(1.0, { hunter: false });
      out.scraped = W.chairs.map((c) => +Math.hypot(c.holder.position.x - c.x, c.holder.position.z - c.z).toFixed(3));
      out.arm = window.__EV.NIGHT.arms.some((a) => a.id === 'haunt:scrape'); out.row = window.__LOG.entries().some((e) => e.id === 'haunt:scrape' && e.seen);
      out.cup = h.forceView('cup'); run(0.6, { hunter: false }); out.sliding = h.cup.g.visible && !h.cup.broken && h.cup.g.position.y > 0.7;
      run(2.2, { hunter: false });
      out.broken = h.cup.broken && !h.cup.g.visible; out.shards = h.cup.shards.map((s) => [s.visible, +s.position.y.toFixed(3), +Math.min(...W.chairs.map((c) => Math.hypot(c.holder.position.x - s.position.x, c.holder.position.z - s.position.z))).toFixed(2)]);
      // the pantry, from the table's side
      stand(1.2, 1.2, W.cupboards[1].at.x, W.cupboards[1].at.z); out.swing = h.forceView('swing'); run(1.0, { hunter: false }); out.half = Math.max(...W.cupboards.map((c) => c.k)); run(2.2, { hunter: false }); out.open = Math.max(...W.cupboards.map((c) => c.k));
      // the ball, from down the hall, out of the bathroom with its light off
      W.setDoor('bath', true, true); run(1.5, { hunter: false });
      stand(8.6, -0.42, W.doors.bath.mid.x, W.doors.bath.mid.z - 0.4); out.roll = h.forceView('roll');
      run(0.5, { hunter: false }); const b = h.toys[0].g.position; out.mid = [b.x, b.z]; run(2.2, { hunter: false });
      out.ball = { vis: h.toys[0].g.visible, x: b.x, y: b.y - h.toys[0].y, z: b.z, room: gz.roomOf({ x: b.x, z: b.z, y: 0 }), gap: edgeGap(b.x, b.z) - h.toys[0].r, door: Math.min(...Object.values(W.doors).map((d) => Math.hypot(d.mid.x - b.x, d.mid.z - b.z))), box: W.colliders.some((c) => c.id === 'haunt:d_ball' && (c.on || c.armWhenClear)) };
      out.count = h.H.inView;
      window.__EV.cleanup();
      return out;
    });
    ok(!v.backScrape && !v.backCup, `made with your back turned: ${JSON.stringify(v)}`);
    ok(v.scrape && v.scraped.filter((d) => d > 0.1 && d < 0.14).length === 1 && v.scraped.filter((d) => d === 0).length === 3 && v.arm && v.row, `the chair did not scrape a hand's width: ${JSON.stringify(v)}`);
    ok(v.cup && v.sliding && v.broken && v.shards.every((s) => s[0] && s[1] < 0.03 && s[2] > 0.25), `the cup: ${JSON.stringify(v)}`);
    ok(v.swing && v.half > 0.05 && v.half < 0.6 && v.open > 0.75, `the pantry did not swing open slowly: ${JSON.stringify(v)}`);
    ok(v.roll && v.ball.vis && v.ball.room === 'hall' && Math.abs(v.ball.y) < 0.01 && v.ball.gap >= 0.28 && v.ball.door >= 0.6 && v.ball.box, `the ball: ${JSON.stringify(v)}`);
    ok(v.count === 4, `the in-view count: ${v.count}`);
    notes.push(`scrape ${v.scraped.find((d) => d > 0)} m, the cup in ${v.shards.length} pieces, the pantry to ${v.open.toFixed(2)}, the ball stopped ${v.ball.gap.toFixed(2)} m clear of the way`);
    clean(w);
    return notes.join('; ');
  });
  if (hp) { await hp.ctx.close(); hp = null; }

  await section('mind', async () => {
    const { page, w, ctx } = await nightPage(browser, '#night5&seed=MIND-0001&type=thirst');
    const notes = [];
    await T(page, () => { const { W, run, H } = window.__T; for (const k of ['kid', 'bath', 'room2', 'spare']) W.setDoor(k, true, true); run(1.5, { haunt: false, hunter: false }); H.reset(); H.setLevel(5); });
    // ---- it starts from behind you more often than not
    const spawn = await T(page, () => {
      const { H, stand, NODES, P } = window.__T, out = [];
      // from the living room and the kitchen, facing four ways: how often it starts behind you, against how often it would with no
      // leaning that way (the house's own share of what is out of view there)
      for (const [x, z] of [[1.98, -0.9], [2.75, 1.9], [-0.93, -1.02]]) for (const [fx, fz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        stand(x, z, x + fx * 5, z + fz * 5, 0.6);
        const share = (o) => { let b = 0, n = 0; for (let i = 0; i < 200; i++) { const k = H.pickSpawn(7, null, o); if (!k) continue; n++; const dx = NODES[k][0] - x, dz = NODES[k][1] - z; if ((dx * fx + dz * fz) / (Math.hypot(dx, dz) || 1) < -0.2) b++; } return n ? b / n : null; };
        const plain = share({ behind: 0 }), leant = share({});
        if (plain !== null && plain > 0.05 && plain < 0.95) out.push([+plain.toFixed(2), +leant.toFixed(2)]);
      }
      return out;
    });
    ok(spawn.length >= 3 && spawn.every(([p, l]) => l > p - 0.04) && spawn.filter(([p, l]) => l > p + 0.08).length >= spawn.length / 2, `it does not start from behind more often than chance: ${JSON.stringify(spawn)}`);
    notes.push(`from behind: ${spawn.map(([p, l]) => `${Math.round(l * 100)}% (chance ${Math.round(p * 100)}%)`).slice(0, 3).join(', ')}`);
    // ---- a hiding place is remembered with the run, and searched first
    const mem = await T(page, () => {
      const { H, g, N, NODES, stand } = window.__T;
      H.notifyPod('closet_kid'); H.notifyPod('closet_kid');
      const saved = JSON.parse(localStorage.getItem('topbunk.run') || '{}');
      stand(1.4, -0.9, -2, -0.9, 0.3);
      H.place('kidIn', { force: true }); H.S.lastSeen = { x: NODES.kidIn[0], z: NODES.kidIn[1] }; H.startSearch(true);
      const list = H.S.searchList.slice(); H.dismiss(); H.S.cool = 0;
      return { used: g.RUN.mind.pods.closet_kid.used, same: H.mind === g.RUN.mind, saved: saved.mind && saved.mind.pods && saved.mind.pods.closet_kid, list };
    });
    ok(mem.used === 2 && mem.same && mem.saved && mem.saved.used === 2, `the hiding place is not in the run's save: ${JSON.stringify(mem)}`);
    ok(mem.list[1] === 'kidCloset', `the remembered closet is not searched first: ${mem.list.join(' ')}`);
    notes.push('the closet is remembered and searched first');
    // ---- it stands at the closet that saved you twice, once a night
    const guard = await T(page, () => {
      const { H, E, g, N, NODES, stand, rows, run } = window.__T;
      g.RUN.mind.pods.closet_room2 = { used: 3, saved: 2 }; stand(1.4, -0.9, -2, -0.9, 0.3); H.S.cool = 0;
      let took = false; for (let i = 0; i < 12 && !took; i++) took = H.think('stalk');
      const at = [E.root.position.x, E.root.position.z], st = H.state, row = rows('podGuard').length, node = N.PODS.closet_room2.node;
      run(1, { haunt: false }); const still = H.state; H.vanish(false); H.S.cool = 0;
      return { took, st, still, row, d: Math.hypot(at[0] - NODES[node][0], at[1] - NODES[node][1]), again: H.guard('closet_room2'), hunt: H.think('hunt') };
    });
    ok(guard.took && guard.st === 'sight' && guard.still === 'sight' && guard.row === 1 && guard.d < 0.01 && !guard.again && !guard.hunt, `it does not stand at the closet: ${JSON.stringify(guard)}`);
    notes.push('it stands at the closet that saved you twice');
    // ---- it watches from a doorway; gone when stared at
    const peek = await T(page, () => {
      const { H, E, g, W, stand, face, run, rows } = window.__T, V = g.camera.position.constructor;
      H.S.cool = 0; stand(9.9, -0.42, 12, -0.42);
      const ok = H.watch('bath'), m = W.doors.bath.mid; run(1.5, { haunt: false });
      const hd = E.headWorld(new V()), body = [E.root.position.x - m.x, E.root.position.z - m.z], after = H.state, scale = E.root.scale.x;
      const hidden = !H.los(9.9, -0.42, E.root.position.x, E.root.position.z), headOut = H.los(9.9, -0.42, hd.x, hd.z);
      face(hd.x, hd.z); let t = 0; while (H.state !== 'away' && t < 3) { run(1 / 60, { haunt: false }); t += 1 / 60; }
      const square = (stand(5.9, -0.9, 9, -0.9, 0.5), H.S.cool = 0, H.watch('bath'));   // square on to the door, the wall hides nothing: it will not
      if (square) H.vanish(false);
      return { ok, after, scale, body, head: [hd.x - m.x, hd.y, hd.z - m.z], hidden, headOut, gone: +t.toFixed(2), row: rows('watching').length, end: [E.visible, E.root.scale.x, E.leanSide], square };
    });
    ok(peek.ok && peek.after === 'sight' && peek.scale < 0.8, `it does not watch from the bathroom doorway: ${JSON.stringify(peek)}`);
    ok(peek.hidden && peek.headOut && Math.abs(peek.head[0]) < 0.36 && peek.head[2] < 0 && peek.head[1] < 1.9, `its body is not behind the wall with its head out in the opening: ${JSON.stringify(peek)}`);
    ok(peek.gone > 0.4 && peek.gone < 1.2 && peek.row === 1 && !peek.end[0] && peek.end[1] === 1 && peek.end[2] === 0 && !peek.square, `stared at, it is not gone in a moment: ${JSON.stringify(peek)}`);
    notes.push(`watched from the doorway, gone ${peek.gone} s after the stare`);
    // ---- the light stops it for less each time; a loom at a remembered place is shorter than a held breath
    const bold = await T(page, () => {
      const { stunFor, flinchFor, recoilFor } = window.__HUNTER, { H, g, P, N } = window.__T;
      g.RUN.mind.pods.closet_kid = { used: 9, saved: 9 }; H.setLevel(10);
      P.mode = 'hide'; P.pod = 'closet_kid'; const c = N.PODS.closet_kid.cam; P.pos.set(c[0], 0, c[2]); H.loom('closet_kid'); const loom = H.S.loomDur - (H.S.loomOpen ? H.S.loomDur - H.S.loomBase : 0);
      H.dismiss(); H.S.cool = 0; P.mode = 'walk'; P.pod = null; g.UI.pod(null); H.setLevel(5); g.F.breathCheck = false;
      return { stun: [0, 1, 2, 9].map(stunFor), flinch: [0, 2, 9].map(flinchFor), recoil: [0, 2, 9].map(recoilFor), loom };
    });
    ok(bold.stun[0] === 1.5 && bold.stun[1] < 1.5 && bold.stun[3] >= 0.7 && bold.stun[3] < bold.stun[1] && bold.flinch[0] === 0.8 && bold.flinch[2] >= 0.45 && bold.recoil[0] === 1 && bold.recoil[2] === 0, `the light: ${JSON.stringify(bold)}`);
    ok(bold.loom <= 8.05 && bold.loom > 6.8, `a loom at a remembered place: ${bold.loom} s (a full breath is 9.9)`);
    notes.push(`stun ${bold.stun.join(' > ')} s; remembered loom ${bold.loom.toFixed(1)} s`);
    // ---- a door you work is heard
    const ears = await T(page, () => {
      const { H, E, g, W, P, stand, run } = window.__T;
      stand(10.6, -0.42, 12, -0.42, 0.3);
      H.place('hallW', { force: true }); H.S.lastSeen = { x: 5.48, z: -0.42 }; H.startSearch(); H.S.searchWait = 30; H.S.path = []; E.root.position.set(4.6, 0, -0.42);
      run(0.5, { haunt: false }); const before = { ...H.S.lastSeen };
      g.toggleDoor(W.doors.kid); run(0.3, { haunt: false }); const after = { ...H.S.lastSeen }, state = H.state;
      H.dismiss(); H.S.cool = 0; W.setDoor('kid', true, true); run(1.5, { haunt: false, hunter: false });
      return { before, after, mid: W.doors.kid.mid.x, state };
    });
    ok(Math.abs(ears.before.x - 5.48) < 0.01 && Math.abs(ears.after.x - 10.6) < 0.01 && ears.state === 'search', `the door was not heard: ${JSON.stringify(ears)}`);
    notes.push('it hears a door');
    // ---- watched with a corner one step behind it, it steps back out of sight; eyes off it after a stare, it comes on quicker
    const cover = await T(page, () => {
      const { H, E, stand, face, run, rows, P } = window.__T;
      stand(10.38, -0.42, 12, -0.42, 0.3);
      const st = H.stalk('hallW'); H.S.path = ['bathIn', 'hallW', 'hallM']; H.S.pi = 1; H.S.node = 'hallW'; H.S.replan = 99; H.S.wasWatched = false; E.root.position.set(5.55, 0, -0.2);
      face(5.55, -0.2); run(1.6, { haunt: false });
      const back = rows('pulledBack').length, seenNow = H.los(P.pos.x, P.pos.z, E.root.position.x, E.root.position.z), at = [E.root.position.x, E.root.position.z];
      H.dismiss(); H.S.cool = 0;
      // the surge
      stand(10.38, -0.42, 12, -0.42); const st2 = H.stalk('hallW'); H.S.replan = 99; face(5.48, -0.42); run(1.4, { haunt: false }); const frozen = H.S.frozenT;
      H.S.replan = 0; face(12, -0.42); const x0 = E.root.position.x; run(0.5, { haunt: false }); const surge = H.S.surge, went = E.root.position.x - x0;
      H.dismiss(); H.S.cool = 0;
      return { st, st2, back, seenNow, at, frozen, surge, went };
    });
    ok(cover.st && cover.back === 1 && !cover.seenNow && cover.at[1] > 0.4, `it did not step back behind the corner: ${JSON.stringify(cover)}`);
    ok(cover.st2 && cover.frozen > 1 && cover.surge > 0.8 && cover.went > 0.7, `it does not come on quicker with your eyes off it: ${JSON.stringify(cover)}`);
    notes.push('steps back behind the corner; surges when unwatched');
    // ---- the way you usually run is cut off; a knock ahead of you and its feet from behind
    const plans = await T(page, () => {
      const { H, g, gz, NODES, stand, run, rows, E, P } = window.__T;
      const share = () => { let b = 0, n = 0; for (let i = 0; i < 200; i++) { const k = H.pickSpawn(7); if (!k) continue; n++; if (gz.roomOf({ x: NODES[k][0], z: NODES[k][1], y: 0 }) === 'bed') b++; } return n ? b / n : 0; };
      stand(5.48, -0.42, 0, -0.42, 0.6); g.RUN.mind.routes = {}; const plain = share();
      g.RUN.mind.routes = { 'hall>bed': 3 }; const cut = share();
      let node = null; for (let i = 0; i < 40 && !(node && H.S.cut); i++) node = H.pickSpawn(7);
      const hunted = H.S.cut ? H.hunt(node) : false, row = rows('cutOff').length; H.dismiss(); H.S.cool = 0; g.RUN.mind.routes = {};
      // the bait, from the middle of the hall facing the living room
      stand(7.63, -0.42, 0, -0.42); const baited = H.bait(), pending = !!H.S.bait, at = rows('bait').slice(-1)[0];
      run(3, { haunt: false }); const st = H.state, behind = E.root.position.x > P.pos.x;
      H.dismiss(); H.S.cool = 0; window.__EV.cleanup();
      return { plain, cut, hunted, row, baited, pending, ahead: at && at.p.x < 7.63, st, behind };
    });
    ok(plans.cut > plans.plain + 0.15 && plans.hunted && plans.row === 1, `the way you run is not cut off: ${JSON.stringify(plans)}`);
    ok(plans.baited && plans.pending && plans.ahead && plans.st === 'stalk' && plans.behind, `the bait: ${JSON.stringify(plans)}`);
    notes.push(`cut off (${Math.round(plans.cut * 100)}% from your room, ${Math.round(plans.plain * 100)}% without the habit); baits`);
    // ---- the first nights it only watches: no bait before night three
    const early = await T(page, () => { const { H, stand, g } = window.__T; g.RUN.mind.pods = {}; H.setLevel(2); stand(7.63, -0.42, 0, -0.42, 0.3); let b = false; for (let i = 0; i < 10; i++) b = b || H.think('stalk'); const lair = H.lair; H.setLevel(5); return { b, lair, state: H.state }; });
    ok(!early.b && early.state === 'away', `a bait on night two: ${JSON.stringify(early)}`);
    clean(w);
    await ctx.close();
    return notes.join('; ');
  });

  await browser.close(); server.close();
  const failed = results.filter((r) => r.status !== 'PASS');
  console.log(failed.length ? `\n${failed.length} of ${results.length} failed` : `\nall ${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
