#!/usr/bin/env node
'use strict';
// The night engine's own tests (js/events.js, js/gaze.js, js/log.js and the beats on the table), headless in Chromium:
//   lint      every registered event has every field, its reveal is never a clock, a loud one declares its noise, its morning id is a
//             real line, and events.get / events.defs answer for it
//   headless  for each event (night four for the beats of nights two to nine, night one for its own): arm refused with its anchor on
//             screen; armed out of view with no payoff; the payoff only after its reveal (the player's own turn where they stand, a step
//             in for a beat that wants you nearer, by hand failing both), every sound in it placed; undo() puts the house back (doors,
//             chairs, the bear, the lights, the drawing, the thing, the TV, the quilt); a catch mid-beat leaves no mesh in the house that
//             was not there before. A beat that declines to arm from every spot is reported, not failed: its own arm said no
//   pace      six minutes of night three (seed F3PC-0005) at __clockMul 1 with a scripted walk (hall -> bath -> bunk, facing each door):
//             a presence-tier arm, a reveal, never two loud reveals back to back, no reveal of a beat armed while the house was not
//             settled; the same six minutes still in the bunk: an arm from the bunk's own chain and no payoff the player did not make
//   crumple   the crawl catches by contact only (crawlCatch: the slam, the fade, the crawled nightmare): out of its sight it never
//             catches and gives up after two seconds; in front of it, it has you
//   node tests/events.js [--port N] [--only lint,headless,pace,crumple]
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

// ---------- the server and the pages (as tests/smoke.js has them) ----------
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
async function nightPage(browser, hash, { init = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await ctx.newPage(), w = watch(page);
  await page.addInitScript(() => { window.__norender = true; });
  if (init) await page.addInitScript(init);
  await page.goto(BASE + '/index.html' + hash, { waitUntil: 'load', timeout: 180e3 });
  await page.waitForFunction(() => window.__game && document.getElementById('loading').classList.contains('done'), null, { timeout: 180e3, polling: 250 });
  // nothing is drawn in these pages: the flash of a photo (takePhoto renders a frame for the print) would otherwise push the whole
  // never-warmed scene through the software renderer
  await page.evaluate(() => { const g = window.__game; g.renderer.compileAsync = async () => {}; g.gfx.render = () => {}; g.startGame(); });
  const n = hash.match(/night(\d+)/)[1];
  await until(page, (n) => window.__game.F.stage === 'n' + n && window.__game.F.live, n, 240e3);
  await page.evaluate(() => { try { window.__game.weather.lock('clear'); } catch (e) { /* no weather */ } });   // a dry night: no thunder in the sound window
  return { page, w, ctx, n: +n };
}
const until = (page, fn, arg, ms = 120e3) => page.waitForFunction(fn, arg, { timeout: ms, polling: 150 });
async function playFor(page, s, ms = 240e3) { const t0 = await page.evaluate(() => window.__game.gameTime); await until(page, (t) => window.__game.gameTime >= t, t0 + s, ms); }
async function climbDown(page) {
  await until(page, () => { const g = window.__game; return g.P.mode === 'bunk' && !g.F.cutscene && !g.F.script; }, null, 60e3);
  await page.keyboard.press('KeyE');
  await until(page, () => { const g = window.__game; return g.P.mode === 'walk' && !g.F.cutscene; }, null, 60e3);
}
const hold = async (page, key, ms) => { await page.keyboard.down(key); await sleep(ms); await page.keyboard.up(key); };
const stand = (page, x, z, tx, tz) => page.evaluate(([x, z, tx, tz]) => {
  const g = window.__game; g.P.pos.set(x, 0, z); g.P.vel.set(0, 0, 0);
  if (tx !== undefined) { g.P.yaw = Math.atan2(-(tx - x), -(tz - z)); g.P.pitch = 0; }
}, [x, z, tx, tz]);
// the engine, as the page sees it
const ev = (page, fn, arg) => page.evaluate(async ([src, arg]) => { const events = await import('/js/events.js'); const g = window.__game; return (new Function('events', 'g', 'arg', `return (${src})(events, g, arg)`))(events, g, arg); }, [fn.toString(), arg]);
const retry = async (page) => {
  await until(page, () => !document.getElementById('death').classList.contains('hidden'), null, 60e3);
  await page.evaluate(() => document.getElementById('retry').click());
  await until(page, () => { const g = window.__game; return !g.F.dead && g.F.live && document.getElementById('death').classList.contains('hidden'); }, null, 120e3);
};

// ---------- the lint ----------
const TIERS = ['whisper', 'wrong', 'presence', 'loud'], BYS = ['look', 'approach', 'open', 'flip', 'leaveRoom', 'enterRoom', 'lean', 'photo', 'hold', 'watch'];
function lineIds() {
  const ids = new Set(Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/audio/lines.json'), 'utf8'))));
  const walk = (o) => { if (typeof o === 'string') { if (/^[a-z]+\/[a-z0-9_]+$/.test(o)) ids.add(o); } else if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') Object.values(o).forEach(walk); };
  for (const f of [path.join(ROOT, 'tests/voice_ids.json'), path.join(ROOT, '..', 'overhaul', 'voice_ids.json')]) if (fs.existsSync(f)) walk(JSON.parse(fs.readFileSync(f, 'utf8')));
  return ids;
}
function lintDefs(defs) {
  const bad = [], ids = lineIds();
  const need = { id: 'string', tier: 'string', minN: 'number', maxN: 'number', w: 'number', once: 'boolean', uses: 'array', noise: 'number', pre: 'function', arm: 'function', reveal: 'object', payoff: 'function', after: 'object', max: 'number|function', undo: 'function' };
  for (const d of defs) {
    const miss = Object.entries(need).filter(([k, t]) => !(k in d) || (t === 'array' ? !Array.isArray(d[k]) : !t.split('|').includes(typeof d[k])));
    if (miss.length) bad.push(`${d.id}: missing or mistyped ${miss.map(([k]) => k).join(', ')}`);
    if (!('anchor' in d)) bad.push(`${d.id}: no anchor field`);
    if (!TIERS.includes(d.tier)) bad.push(`${d.id}: tier ${d.tier}`);
    if (d.reveal && (d.reveal.by === 'clock' || !BYS.includes(d.reveal.by))) bad.push(`${d.id}: reveal.by ${d.reveal.by}`);
    if (d.tier === 'loud' && !(d.noise > 0)) bad.push(`${d.id}: loud with no noise`);
    if (d.after && d.after.morning && !ids.has(d.after.morning)) bad.push(`${d.id}: morning id ${d.after.morning} is not a line`);
    if (d.after && d.after.proof && !d.after.log) bad.push(`${d.id}: leaves proof but no log row`);
  }
  return bad;
}
// a page's defs, with the functions marked by type (functions do not cross the page boundary)
const pageDefs = (page) => ev(page, (events) => events.defs().map((d) => { const o = {}; for (const k in d) o[k] = typeof d[k] === 'function' ? '<fn>' : d[k]; o.__fns = Object.keys(d).filter((k) => typeof d[k] === 'function'); return o; }));
const unmark = (defs) => defs.map((d) => { const o = { ...d }; for (const k of d.__fns) o[k] = () => {}; delete o.__fns; if (typeof d.max === 'string') o.max = () => 0; return o; });

// ---------- the headless harness ----------
// the sounds a payoff makes: pick/emit need `at`; the panned helpers need a pan from D.pan (a position); stings only on presence/loud
const SND = ['pick', 'emit', 'creak', 'knock', 'whisper', 'thump', 'slamFar', 'heavyStep', 'footstep', 'lurk', 'faucet', 'flush', 'scrape', 'doorClose', 'breath', 'ceilingThump', 'pianoSlam', 'jolt', 'stab', 'appear', 'noiseHit', 'tone', 'staticBurst', 'phoneRing', 'mumble', 'play', 'speaker', 'whoosh'];
const SENT = 0.123456;
// only the outermost call is recorded: the library's own helpers call this.play / this.pick / this.mumble underneath, and those are the
// same sound, not a second unplaced one
const recordOn = (page) => page.evaluate((names) => {
  const g = window.__game, D = g.nights.D, sfx = g.sfx; window.__rec = []; window.__orig = {}; let depth = 0;
  for (const k of ['pan', 'wallPan', 'behindPan', 'ceilingPan', 'doorPan', 'tapPan']) { window.__orig['D.' + k] = D[k]; D[k] = () => 0.123456; }
  for (const n of names) if (typeof sfx[n] === 'function') {
    window.__orig[n] = sfx[n];
    sfx[n] = function (...args) {
      if (depth === 0) window.__rec.push({ n, m: g.P.mode, args: args.map((a, i) => (a && typeof a === 'object' ? { at: !!a.at || (n === 'emit' && i === 1), pan: a.pan } : a)) });   // emit(key, at, o): its place is the second argument
      depth++; try { return window.__orig[n].apply(this, args); } finally { depth--; }
    };
  }
}, SND);
const recordOff = (page) => page.evaluate((names) => {
  const g = window.__game, D = g.nights.D, sfx = g.sfx, rec = window.__rec || [];
  for (const k of ['pan', 'wallPan', 'behindPan', 'ceilingPan', 'doorPan', 'tapPan']) if (window.__orig['D.' + k]) D[k] = window.__orig['D.' + k];
  for (const n of names) if (window.__orig[n]) sfx[n] = window.__orig[n];
  window.__rec = null; return rec;
}, SND);
// the house's own background sounds that can land inside the window (the grandfather clock's tick, a light switch the lights module
// clicks for its own beat): not the event's, so not its problem
const BACKGROUND = new Set(['clock_tick', 'clock_gear', 'clock_strike', 'switch', 'thunder']);
const PAN_AT = { footstep: 1, heavyStep: 1, creak: 1, faucet: 1 };   // where the helper takes its pan (audio.js); the rest take it first
function soundProblems(rec, tier) {
  const bad = [], sting = ['pianoSlam', 'jolt', 'stab', 'appear'], panned = ['creak', 'knock', 'whisper', 'slamFar', 'heavyStep', 'footstep', 'lurk', 'faucet', 'flush', 'scrape', 'doorClose', 'whoosh', 'staticBurst', 'phoneRing'];
  const isPos = (p) => Math.abs((p || 0) - SENT) < 1e-6;
  // a placed options object anywhere in the arguments ({ at } or a pan that came from a position)
  const placedObj = (a) => a.some((o) => o && typeof o === 'object' && (o.at || isPos(o.pan)));
  for (const c of rec) {
    const a = c.args;
    if ((c.n === 'pick' || c.n === 'emit') && BACKGROUND.has(a[0])) continue;
    if ((c.n === 'breath' || c.n === 'whoosh') && ['hide', 'bunk', 'cine'].includes(c.m)) continue;   // the player's own breath and the covers over their head, at the ear by design
    if (c.n === 'pick' || c.n === 'emit') { if (!(a[1] && a[1].at)) bad.push(`${c.n}(${a[0]}) without at`); }
    else if (panned.includes(c.n)) { const i = PAN_AT[c.n] || 0; if (!isPos(a[i])) bad.push(`${c.n} panned to ${a[i]} instead of a place`); }
    else if (c.n === 'thump' || c.n === 'ceilingThump' || c.n === 'breath') bad.push(`${c.n}() has no place`);
    else if (c.n === 'noiseHit' || c.n === 'tone' || c.n === 'mumble' || c.n === 'play' || c.n === 'speaker') { if (!placedObj(a)) bad.push(`${c.n}(${typeof a[0] === 'string' ? a[0] : ''}) without a placed pan`); }
    else if (sting.includes(c.n) && tier !== 'presence' && tier !== 'loud') bad.push(`${c.n} on a ${tier} beat`);
  }
  return bad;
}
const snapshot = (page) => page.evaluate(() => {
  const g = window.__game, W = g.W, r2 = (v) => Math.round(v * 100) / 100;
  const rooms = [...new Set(Object.values(W.bulbs || {}).map((b) => b.room))];
  return {
    doors: Object.fromEntries(Object.entries(W.doors).map(([k, d]) => [k, d.target])),
    chairs: W.chairs.map((c) => [r2(c.holder.position.x), r2(c.holder.position.z), r2(c.holder.rotation.y)]),
    teddy: W.teddy ? [r2(W.teddy.position.x), r2(W.teddy.position.y), r2(W.teddy.position.z), r2(W.teddy.rotation.y), !!W.teddy.visible] : null,
    lights: Object.fromEntries(rooms.map((r) => [r, g.lights.isOn(r)])), night: W.nightLights.map((n) => !!n.dead),
    drawing: g.F.drawingLevel || 0, drawn: !!g.F.drawn, E: !!g.E.visible, tv: !!W.tvFx.on, dent: r2(g.FN.dent.k), lift: r2(g.FN.covers.s.lift), frame: !!(W.hallFrame && W.hallFrame.fallen), script: !!g.F.script,
  };
});
function diffSnap(a, b) {
  const out = [];
  for (const k of Object.keys(a)) {
    if (k === 'dent') continue;
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out.push(`${k}: ${JSON.stringify(a[k])} -> ${JSON.stringify(b[k])}`);
  }
  return out;
}
// a spot `d` metres from p with a clear line to it, inside the house, free of furniture; faces p (or away from it)
const standNear = (page, p, d, away = false) => page.evaluate(([p, d, away]) => {
  const g = window.__game, gz = g.nights.stage.gaze, H = g.nights.hunter;
  const cands = [];
  for (let a = 0; a < 16; a++) {
    const ang = a / 16 * Math.PI * 2, x = p.x + Math.sin(ang) * d, z = p.z + Math.cos(ang) * d;
    cands.push({ x, z, ok: gz.free(x, z, 0.35) && H.los(x, z, p.x, p.z) });
  }
  const c = cands.find((q) => q.ok) || cands[0];
  g.P.pos.set(c.x, 0, c.z); g.P.vel.set(0, 0, 0); g.P.pitch = 0;
  g.P.yaw = Math.atan2(-(p.x - c.x), -(p.z - c.z)) + (away ? Math.PI : 0);
  return [c.x, c.z];
}, [p, d, away]);
const houseMeshes = (page) => page.evaluate(() => { const s = new Set(); window.__game.W.house.traverse((o) => { if (o.isMesh) s.add(o.uuid); }); return [...s]; });
// turn where you stand to face p
const turnTo = (page, p) => page.evaluate(([p]) => { const g = window.__game; g.P.yaw = Math.atan2(-(p.x - g.P.pos.x), -(p.z - g.P.pos.z)); g.P.pitch = 0; }, [p]);

async function headlessOne(page, d, night) {
  const r = { id: d.id, tier: d.tier, notes: [] };
  const fail = (m) => { r.fail = (r.fail ? r.fail + '; ' : '') + m; };
  // a clean table and a free player; then the house as the beat needs it (its test.setup: the door it wants shut, the prop it wants placed)
  await ev(page, (events, g) => { events.suspend(true); for (const a of events.test.active()) events.test.undo(a.id); g.nights.stage.endStage(); g.F.script = false; g.F.cutscene = false; g.F.fear = 0; if (g.P.mode !== 'walk') g.P.mode = 'walk'; g.F.photoHold = false; if (g.nights.D.N1) g.nights.D.N1.hold = true; });
  await ev(page, (events, g, id) => { const def = events.get(id); if (def && def.test && typeof def.test.setup === 'function') def.test.setup(g.nights.D); }, d.id);
  const pt = await ev(page, (events, g, id) => events.test.point(id), d.id);
  const watchBeat = d.reveal && d.reveal.by === 'watch';
  // 1. on screen: refused
  if (pt && !watchBeat) {
    await standNear(page, pt, 2.2); await playFor(page, 0.6);
    const a = await ev(page, (events, g, id) => events.test.arm(id), d.id);
    if (a === 'armed') { fail('armed with its anchor on screen'); await ev(page, (events, g, id) => events.test.undo(id), d.id); } else r.onScreen = a;
  } else r.onScreen = 'n/a';
  // 2. out of view: armed. Spots to try: facing away from the anchor; the hall after a look east; the living room; the bedroom
  const spots = pt ? [['away', pt]] : [];
  spots.push(['hall', [7.6, -0.42, 10.1, -0.42, 5.4, -0.42]], ['hallW', [7.6, -0.42, 5.4, -0.42, 10.1, -0.42]], ['living', [0.5, -2.4, 3.5, -2.4, -2.5, -2.4]], ['bed', [9.0, 1.8, 9.0, 4.2, 9.0, -0.3]]);
  if (d.test && d.test.mode === 'bunk') spots.unshift(['bunk', null]);
  let armed = null;
  for (const [kind, s] of spots) {
    if (kind === 'away') { await standNear(page, s, 2.2, true); await playFor(page, 2.6); }
    else if (kind === 'bunk') { await page.evaluate(() => { const g = window.__game; g.P.mode = 'bunk'; g.P.pos.set(g.BUNK_SEAT.x, 0, g.BUNK_SEAT.z); g.P.cam.copy(g.BUNK_SEAT); g.P.yaw = 0.2; g.P.pitch = 0; }); await playFor(page, 2.6); }   // long enough that the bunk is out of the gaze's memory (the last test may have ended facing it)
    else { await stand(page, s[0], s[1], s[2], s[3]); await playFor(page, 1.0); await stand(page, s[0], s[1], s[4], s[5]); await playFor(page, 0.4); }
    r.snap = await snapshot(page); r.meshes = await houseMeshes(page);
    const a = await ev(page, (events, g, id) => events.test.arm(id), d.id);
    if (a === 'armed') { armed = kind; break; }
    r.notes.push(`${kind}: ${a}`);
  }
  if (!armed) { r.declined = true; return r; }
  r.armedFrom = armed;
  // 3. no payoff before the reveal. A beat revealed by `hold` is found by where you are (within earshot of its sound, in its room), so
  // one that is already revealed here was found the moment it was placed: that is its reveal, made by the player's position
  await playFor(page, 0.8);
  const st = await page.evaluate(async (id) => {
    const events = await import('/js/events.js'), log = await import('/js/log.js');
    const row = log.entries().filter((e) => e.id === id && e.seen).pop();   // a kept beat found at once has already left the table: its row says how
    return { state: events.test.state(id), payoffs: events.test.payoffs()[id] || 0, how: (events.test.active().find((a) => a.id === id) || row || {}).how };
  }, d.id);
  const heardAtOnce = (st.state === 'revealed' || (st.state === null && st.payoffs === 1)) && d.reveal.by === 'hold' && st.how === 'hold';
  if ((st.state === 'revealed' || st.payoffs) && !heardAtOnce) fail(`paid off before any reveal (${st.state})`);
  if (st.state !== 'armed' && !heardAtOnce) fail(`not armed after the arm (${st.state})`);
  if (heardAtOnce) r.notes.push('heard where you stood');
  // 4. the reveal: first the player's own turn toward it where they stand (how a staged thing is meant to be found), then, for a beat
  // that wants you nearer, a step in; failing both, by hand
  const rp = await ev(page, (events, g, id) => events.test.point(id), d.id) || pt;
  await recordOn(page);
  let how = 'look', s = 'armed';
  const lookWait = night === 1 ? 26e3 : 6e3;
  const waitOff = async (ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const st = await ev(page, (events, g, id) => events.test.state(id), d.id); if (st !== 'armed') return st; await sleep(300); } return 'armed'; };
  if (rp && armed !== 'bunk') {
    await turnTo(page, rp); s = await waitOff(lookWait);
    if (s === 'armed' && (d.reveal.by === 'approach' || d.reveal.within)) { how = 'approach'; await standNear(page, rp, d.reveal.by === 'approach' ? 1.0 : Math.min(2.0, (d.reveal.within || 3) * 0.6)); s = await waitOff(lookWait / 2); }
  } else if (armed === 'bunk') {   // in the bunk: the covers up (a short press), a few of its breaths, then hold yours
    await hold(page, 'Space', 450); await sleep(3000); const holding = hold(page, 'Space', 3500); s = await waitOff(lookWait / 2); await holding;
    if (s !== 'armed') how = 'hold';
  }
  if (s === 'armed') { how = 'forced'; await ev(page, (events, g, id) => events.test.reveal(id), d.id); s = await ev(page, (events, g, id) => events.test.state(id), d.id); }
  await playFor(page, 1.5);
  const rec = await recordOff(page);
  const pay = await ev(page, (events, g, id) => events.test.payoffs()[id] || 0, d.id);
  // off the table with its payoff made is a beat that was revealed and then took itself down (a scare that ends on the look); off it
  // with no payoff is one that was dropped before any reveal
  if (s === null && pay === 0) fail('left the table before any reveal (dropped?)');
  else if (s === 'revealed' || s === null) { if (pay !== 1) fail(`payoff ran ${pay} times`); } else fail(`state after the reveal: ${s}`);
  r.how = how; r.sounds = rec.length;
  const sp = soundProblems(rec, d.tier); if (sp.length) fail('sounds: ' + sp.slice(0, 3).join(', '));
  // 5. undo puts the house back
  await ev(page, (events, g, id) => { events.test.undo(id); g.nights.stage.endStage(); }, d.id);
  await playFor(page, 0.4);
  const after = await snapshot(page);
  const diff = diffSnap(r.snap, after);
  if (after.dent > r.snap.dent + 0.05) { await playFor(page, 1.0); const later = await snapshot(page); if (!(later.dent < after.dent)) diff.push(`dent ${r.snap.dent} -> ${after.dent}`); }
  if (diff.length) fail('undo left: ' + diff.join(', '));
  // 6. a catch mid-beat leaves no stray mesh
  if (armed === 'bunk') await page.evaluate(() => { const g = window.__game; g.P.mode = 'bunk'; });
  else await standNear(page, pt || { x: 7.6, z: -0.42 }, 2.2, true);
  await playFor(page, 2.6);
  const again = await ev(page, (events, g, id) => events.test.arm(id), d.id);
  if (again === 'armed') {
    await playFor(page, 0.6);
    await page.evaluate(() => window.__game.caught());
    await until(page, () => window.__game.F.dead, null, 30e3); await playFor(page, 0.5);
    const m = await houseMeshes(page), before = new Set(r.meshes), stray = m.filter((u) => !before.has(u));
    if (stray.length) fail(`${stray.length} mesh(es) left in the house after a catch`);
    r.caught = true;
    await retry(page);
    await ev(page, (events, g) => { events.suspend(true); if (g.nights.D.N1) g.nights.D.N1.hold = true; });
    if (night === 1) await until(page, () => Array.isArray(window.__n1log), null, 60e3);
    await climbDown(page).catch(() => {});
  } else r.notes.push(`no second arm for the catch (${again})`);
  delete r.snap; delete r.meshes;
  return r;
}

(async () => {
  let chromium = null;
  try { ({ chromium } = require('playwright')); } catch (e) { console.error('Playwright is not installed'); process.exit(2); }
  const server = await startServer();
  BASE = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });

  // ---------- lint ----------
  await section('lint', async () => {
    const { page, w, ctx } = await nightPage(browser, '#night3');
    const defs = await pageDefs(page);
    ok(defs.length > 0, 'no events registered');
    const bad = lintDefs(unmark(defs));
    ok(!bad.length, bad.slice(0, 6).join(' | '));
    const api = await ev(page, (events) => ({ get: events.defs().every((d) => events.get(d.id) === d), none: events.get('no-such-event') === undefined, ids: events.defs().map((d) => d.id), dup: new Set(events.defs().map((d) => d.id)).size === events.defs().length }));
    ok(api.get && api.none && api.dup, `events.get / defs: ${JSON.stringify({ get: api.get, none: api.none, dup: api.dup })}`);
    clean(w); await ctx.close();
    return `${defs.length} events lint clean: ${api.ids.join(' ')}`;
  }, 300e3);

  // ---------- headless, per event ----------
  await section('headless', async () => {
    const out = [], fails = [];
    // night four for the beats of nights two to nine (every stage scare is in by then, Mom's double included), night one for its own;
    // a fixed seed and a hunted night four: its scene is an objective and nothing else takes the bunk or the thing (the type is named, as
    // the seed's own night four is whatever the story allows there)
    for (const [hash, nightN] of [['#night4&seed=F3PC-0001&type=hunted', 4], ['#night1', 1]]) {
      const { page, w, ctx } = await nightPage(browser, hash, { init: nightN === 1 ? () => { window.__n1fast = 0.3; } : null });
      if (nightN === 1) await until(page, () => Array.isArray(window.__n1log), null, 60e3);
      await climbDown(page);
      await ev(page, (events, g) => { g.nights.director.stop(); if (g.nights.D.N1) g.nights.D.N1.hold = true; });
      const defs = unmark(await pageDefs(page)).filter((d) => d.minN <= nightN && d.maxN >= nightN && (nightN === 1 ? d.maxN === 1 || d.id === 'breathUnder' : d.maxN > 1));
      for (const d of defs) {
        let r;
        try { r = await headlessOne(page, d, nightN); } catch (e) { r = { id: d.id, fail: `harness: ${String(e.message).split('\n')[0]}` }; }
        out.push(r);
        console.log(`  ${r.fail ? 'x' : r.declined ? '-' : 'ok'} ${r.id}${r.declined ? ' declined to arm from every spot (' + r.notes.join(', ') + ')' : ''}${r.fail ? ': ' + r.fail : ''}${r.armedFrom ? ` [from ${r.armedFrom}, reveal ${r.how}, ${r.sounds} sounds${r.caught ? ', catch clean' : ''}]` : ''}`);
        if (r.fail) fails.push(`${r.id}: ${r.fail}`);
      }
      clean(w); await ctx.close();
    }
    ok(!fails.length, fails.join(' | '));
    const ran = out.filter((r) => !r.declined).length, declined = out.filter((r) => r.declined).map((r) => r.id);
    return `${ran} of ${out.length} events armed, revealed, undone and caught clean${declined.length ? `; declined from every spot (their own arm said no): ${declined.join(' ')}` : ''}`;
  }, 2400e3);

  // ---------- pace: six minutes on night three, walking, then still ----------
  await section('pace', async () => {
    const SIX = 360, HASH = '#night3&seed=F3PC-0005&type=thirst';   // a fixed seed and a thirst night three, whose scene asks nothing of a player in the bunk
    // the walk
    const A = await nightPage(browser, HASH);
    await climbDown(A.page);
    await ev(A.page, (events, g) => { g.nights.director.plan.encounters.forEach((e) => { e.done = true; }); });   // the hunter stays out of the measurement
    const route = [];
    const line = (ax, az, bx, bz, n) => { for (let i = 0; i <= n; i++) route.push([ax + (bx - ax) * i / n, az + (bz - az) * i / n, bx + (bx - ax), bz + (bz - az)]); };
    line(9.0, 1.2, 9.0, 0.0, 3); route.push(['face', 7.05, -0.3]);
    line(9.0, -0.4, 5.0, -0.4, 10); route.push(['face', 3.9, -1.5]); route.push(['face', 4.15, -0.3]);
    line(5.0, -0.4, 4.15, 0.6, 3); line(4.15, 0.6, 5.5, 3.0, 4); route.push(['face', 6.59, 1.64]);
    line(5.5, 3.0, 4.15, 0.6, 4); line(4.15, 0.6, 5.0, -0.4, 3); route.push(['face', 7.5, -1.5]);
    line(5.0, -0.4, 9.0, -0.4, 10); route.push(['face', 7.05, -0.3]); line(9.0, -0.4, 9.0, 1.4, 3); line(9.0, 1.4, 8.6, 3.2, 3); route.push(['face', 8.4, 3.9]);
    const t0 = await A.page.evaluate(() => window.__game.gameTime);
    let i = 0, prev = [9.0, 1.2], caught = 0;
    for (;;) {
      const st = await A.page.evaluate(() => { const g = window.__game; return { t: g.gameTime, dead: g.F.dead, script: g.F.script, mode: g.P.mode }; });
      if (st.t - t0 >= SIX) break;
      if (st.dead) { caught++; await retry(A.page); await climbDown(A.page); continue; }
      if (!st.script && st.mode === 'walk') {
        const step = route[i++ % route.length];
        if (step[0] === 'face') { await stand(A.page, prev[0], prev[1], step[1], step[2]); await sleep(2000); }
        else { await stand(A.page, step[0], step[1], step[2], step[3]); prev = [step[0], step[1]]; await sleep(350); }
      } else await sleep(500);
    }
    const walk = await ev(A.page, (events) => events.test.stats());
    clean(A.w); await A.ctx.close();
    const presence = walk.arms.filter((a) => a.tier === 'presence' && !a.legacy), reveals = walk.reveals.filter((r) => r.how !== 'outside');
    const loudPairs = walk.reveals.some((r, k) => k > 0 && r.tier === 'loud' && walk.reveals[k - 1].tier === 'loud');
    const unsettled = reveals.filter((r) => r.settledAtArm === false);
    ok(presence.length >= 1, `no presence-tier arm in six minutes of walking (arms: ${walk.arms.map((a) => a.id).join(' ')})`);
    ok(reveals.length >= 1, `no reveal in six minutes of walking (arms: ${walk.arms.map((a) => a.id).join(' ')})`);
    ok(!loudPairs, 'two loud reveals back to back');
    ok(!unsettled.length, `reveals of beats armed while the house was not settled: ${unsettled.map((r) => r.id).join(' ')}`);
    // still in the bunk
    const B = await nightPage(browser, HASH);
    await ev(B.page, (events, g) => { g.nights.director.plan.encounters.forEach((e) => { e.done = true; }); });
    const t1 = await B.page.evaluate(() => window.__game.gameTime);
    for (;;) { const st = await B.page.evaluate(() => ({ t: window.__game.gameTime, dead: window.__game.F.dead })); if (st.dead) throw new Error('caught while still in the bunk'); if (st.t - t1 >= SIX) break; await sleep(1000); }
    const still = await ev(B.page, (events) => events.test.stats());
    clean(B.w); await B.ctx.close();
    const chain = still.arms.filter((a) => !a.legacy && ['breathUnder', 'dentReturn', 'underTheBunk'].includes(a.id));
    const forced = still.reveals.filter((r) => r.how !== 'outside' && !['look', 'lean', 'hold', 'open', 'flip', 'approach', 'photo', 'watch', 'leaveRoom', 'enterRoom'].includes(r.how));
    ok(chain.length >= 1, `no arm from the bunk chain in six minutes still in the bunk (arms: ${still.arms.map((a) => a.id).join(' ') || 'none'})`);
    ok(!forced.length, `a payoff the player did not make: ${forced.map((r) => r.id + '/' + r.how).join(' ')}`);
    const tableReveals = still.reveals.filter((r) => r.how !== 'outside');
    return `walk: ${walk.arms.length} arms (${walk.arms.map((a) => a.id + (a.legacy ? '*' : '')).join(' ')}), ${reveals.length} reveal(s) (${reveals.map((r) => r.id + '/' + r.how).join(' ')}), caught ${caught}x; still: ${still.arms.length} arm(s) (${still.arms.map((a) => a.id + (a.legacy ? '*' : '')).join(' ')}), ${tableReveals.length} table reveal(s)${tableReveals.length ? ' (' + tableReveals.map((r) => r.id + '/' + r.how).join(' ') + ')' : ''}`;
  }, 2700e3);   // twelve game minutes take longer than twelve minutes on a slow machine

  // ---------- the crumple's crawl: contact only ----------
  await section('crumple', async () => {
    const { page, w, ctx } = await nightPage(browser, '#night3');
    await climbDown(page);
    await ev(page, (events, g) => { g.nights.director.stop(); events.suspend(true); });
    // stage it: in the hall, a look east and then west puts the floor behind you in the gaze's memory. The crawl's catch is crawlCatch
    // (the slam, the fade and the crawled nightmare; it sets F.nmDone), not a death
    // The flash sets it off and half a second later it comes, at 4.8 m/s: where the player is when it comes is decided in the same call
    // as the flash (a teleport to `pose`, the doors as given), before a frame runs
    const setup = async (pose, doors) => {
      await ev(page, (events, g) => { g.nights.stage.endStage(); g.F.script = false; g.F.cutscene = false; g.P.mode = 'walk'; g.F.fear = 0; g.F.nmDone = false; });
      await stand(page, 7.2, -0.42, 10.1, -0.42); await playFor(page, 1.2); await stand(page, 7.2, -0.42, 4.5, -0.42); await playFor(page, 0.3);
      const staged = await page.evaluate(([pose, doors]) => {
        const g = window.__game, S = g.nights.stage; const okk = S.SCARES.crumple.run(); if (!okk) return null;
        const st = S.ST.on; st.seen = g.gameTime; S.crawlAt(st);
        for (const [name, open] of doors) g.W.setDoor(name, open, true);
        const [x, z, tx, tz] = pose; g.P.pos.set(x, 0, z); g.P.vel.set(0, 0, 0); g.P.yaw = Math.atan2(-(tx - x), -(tz - z)); g.P.pitch = 0;
        return [st.p.x, st.p.z];
      }, [pose, doors]);
      ok(staged, 'the crumple would not stage behind the player');
      return staged;
    };
    const state = () => page.evaluate(() => { const g = window.__game; return { dead: g.F.dead, caught: !!g.F.nmDone, staged: !!g.nights.stage.ST.on, E: g.E.visible, mode: g.E.mode }; });
    // A: out of its sight as it comes (behind the bath wall, the door shut): no catch, ever (the old 3.2 s clock is gone), and it gives up
    // after two seconds
    await setup([5.6, 3.2, 5.6, 4.0], [['bath', false]]);
    await playFor(page, 6.0);
    const a = await state();
    ok(!a.caught && !a.dead, `caught after leaving its line of sight: ${JSON.stringify(a)}`);
    ok(!a.staged, `the crawl did not give up after two seconds out of sight: ${JSON.stringify(a)}`);
    // B: in front of it with a line to you: contact
    await setup([7.2, -0.42, 10.1, -0.42], [['bath', true]]);
    await until(page, () => window.__game.F.nmDone, null, 8e3).catch(() => {});
    const b = await state();
    ok(b.caught, `in its sight at arm's length and not caught: ${JSON.stringify(b)}`);
    ok(!b.dead, 'the crawl\'s catch was a death');
    clean(w); await ctx.close();
    return 'out of sight: no catch and it gave up in two seconds; in its reach: caught by contact (the crawled nightmare)';
  }, 400e3);

  await browser.close(); server.close();
  const failed = results.filter((r) => r.status === 'FAIL').length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
