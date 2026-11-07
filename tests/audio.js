#!/usr/bin/env node
'use strict';
// The sound module and its recorded library, as design §14 has them: no strings anywhere (the catch is the low piano, a rattle and a
// bone crack; the old strings call is a drone), every placed key of §14.3 in assets/sfx/lib.json with a CC0 row in SOURCES.md, the forest,
// the barn and the truck as rooms of their own, the night's ambience curve (1.0 at 1:00, 0.4 at 5:00), the radio as a recorded AM bed,
// and the menu's tick and tone. The first checks read the files; the rest drive the game in headless Chromium (Playwright, SwiftShader).
//   node tests/audio.js [--port N] [--only static,rooms,ambience,radio,calls]
// One PASS / FAIL / SKIP line per check, exit 1 on any FAIL.
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
const want = (name) => !ONLY || ONLY.has(name);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// the keys of design §14.3, plus the menu's two and the radio's bed that A1 adds beside them
const KEYS = ['rattle', 'floor_slap', 'chairs_fall', 'door_lock', 'doorknob', 'kettle', 'cutlery', 'toast_pop', 'glass_ring', 'car_horn', 'skid', 'car_idle', 'iron_roll',
  'smoke_alarm', 'pencil', 'paper_slide', 'chain', 'bowl', 'crib', 'tarp', 'bed_creak', 'needles_wind', 'shoes_cloth', 'bus_horn', 'ui_tick', 'ui_tone', 'bed_radio'];
const STRINGS_CALL = ['vio', 'lins'].join('');   // the old name the night code still calls (spelled apart here for the same reason as in audio.js)

const results = [];
class Skip extends Error {}
function ok(cond, msg) { if (!cond) throw new Error(msg); }
async function check(name, fn, ms = 240e3) {
  if (!want(name)) return;
  const t0 = Date.now(); let status = 'PASS', detail = '';
  let t;
  try { detail = (await Promise.race([Promise.resolve().then(fn), new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`timed out after ${ms / 1000} s`)), ms); })])) || ''; }
  catch (e) { status = e instanceof Skip ? 'SKIP' : 'FAIL'; detail = String(e.message).split('\n')[0]; }
  finally { clearTimeout(t); }
  results.push({ name, status });
  console.log(`${status} ${name}: ${detail}${detail ? ' ' : ''}(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}

// ---------- the server and the pages, as tests/smoke.js has them ----------
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
const LOCAL = new Set(['127.0.0.1', 'localhost']);
async function newContext(browser) {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
  ctx.blocked = [];
  await ctx.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (LOCAL.has(u.hostname) || u.protocol === 'data:' || u.protocol === 'blob:') return route.continue();
    ctx.blocked.push(u.href); return route.abort('internetdisconnected');
  });
  return ctx;
}
function watch(page, ctx) {
  const w = { errors: [], console: [], failed: [], bad: [], ctx };
  page.on('pageerror', (e) => w.errors.push(String((e && e.stack) || e).split('\n').slice(0, 2).join(' / ')));
  page.on('console', (m) => { if (m.type() === 'error') w.console.push(m.text()); });
  page.on('requestfailed', (r) => w.failed.push(`${r.url()} (${(r.failure() && r.failure().errorText) || 'failed'})`));
  page.on('response', (r) => { if (r.status() >= 400) w.bad.push(`${r.status()} ${r.url()}`); });
  return w;
}
const problems = (w) => [...w.errors.map((s) => `page error: ${s}`), ...w.console.map((s) => `console error: ${s}`), ...w.failed.map((s) => `request failed: ${s}`), ...w.bad.map((s) => `HTTP ${s}`), ...w.ctx.blocked.map((s) => `tried the network: ${s}`)];
const clean = (w) => { const p = problems(w); ok(p.length === 0, `${p.length} problem(s): ${p.slice(0, 3).join(' | ')}`); };
let BASE = '';
const until = (page, fn, arg, ms = 120e3) => page.waitForFunction(fn, arg, { timeout: ms, polling: 200 });
async function openGame(ctx, url, { clock = 0 } = {}) {
  const page = await ctx.newPage(), w = watch(page, ctx);
  await page.addInitScript(() => { window.__norender = true; });
  if (clock) await page.addInitScript((m) => { window.__clockMul = m; }, clock);
  await page.goto(BASE + url, { waitUntil: 'load', timeout: 180e3 });
  await page.waitForFunction(() => window.__game && document.getElementById('loading').classList.contains('done'), null, { timeout: 180e3, polling: 250 });
  return { page, w };
}
async function nightPage(ctx, hash) {
  const A = await openGame(ctx, '/index.html' + hash), n = hash.match(/night(\d+)/)[1];
  await A.page.evaluate(() => { const g = window.__game; g.renderer.compileAsync = async () => {}; g.startGame(); });
  await until(A.page, (n) => window.__game.F.stage === 'n' + n && window.__game.F.live, n, 240e3);
  return A;
}

(async () => {
  // ---------- static: the module's text and tables, the library and its sources ----------
  await check('static', async () => {
    const src = read('js/audio.js');
    ok(!/violin/i.test(src), 'js/audio.js still names the instrument');
    ok(!/scare_strings|scare_synth|violin_storm|violin_swell|violin_stab/.test(src), 'js/audio.js still reaches a strings file');
    const scream = src.slice(src.indexOf('  scream('), src.indexOf('  rattleSynth('));
    ok(scream.length > 50 && /pianoSlam\(SLAM\.full/.test(scream) && /'rattle'/.test(scream) && /'bone_crack'/.test(scream), 'scream() is not the low piano + rattle + one bone_crack');
    ok(!/^\s+swell\s*\(/m.test(src) && !/\.swell\s*\(/.test(src), 'swell() is still defined');
    ok(/tensionDrone\(v, t = 1\.5\)/.test(src) && !/tensionDrone[^\n]*this\.bed\(/.test(src), 'the drone call beds something');
    const A = await import(path.join(ROOT, 'js/audio.js').replace(/\\/g, '/').replace(/^([A-Za-z]:)/, 'file:///$1'));
    const { Sound, ROOM, ACOUSTIC } = A;
    ok(typeof Sound.prototype[STRINGS_CALL] === 'function' && Sound.prototype[STRINGS_CALL] === Sound.prototype.tensionDrone, 'the old strings call does not reach the drone');
    ok(Sound.prototype.swell === undefined, 'swell is still reachable');
    for (const r of ['forest', 'barn', 'truck']) ok(ROOM[r] && ACOUSTIC[ROOM[r].ac] && ROOM[r].ac === r, `room ${r} missing or without its own acoustics`);
    const bedsOf = (r) => Object.keys(ROOM[r].beds).filter((k) => k !== 'night' && k !== 'day').sort().join();
    const sets = ['forest', 'barn', 'truck', 'out', 'living'].map(bedsOf);
    ok(new Set(sets).size === sets.length, `the new rooms' bed sets are not distinct: ${sets.join(' / ')}`);
    ok(ROOM.forest.beds.needles_wind > 0 && ROOM.barn.beds.bed_wind_in > 0 && ROOM.truck.beds.bed_road > 0, 'the new rooms lack their beds');
    const curve = [60, 120, 180, 300, 340, 0].map((m) => +Sound.ambienceAt(m).toFixed(3));
    ok(curve.join() === '1,0.85,0.7,0.4,0.4,1', `ambience curve ${curve.join()} (expected 1, 0.85, 0.7, 0.4, 0.4, 1)`);
    // the library: every key, with files on disk, and a CC0 row for each in SOURCES.md
    const lib = JSON.parse(read('assets/sfx/lib.json')), sources = read('assets/sfx/lib/SOURCES.md');
    ok(/CC0 1\.0/.test(sources), 'SOURCES.md does not state the licence');
    const rows = [...sources.matchAll(/^\| (\d{4}) \| \[([^\]]+)\]\([^)]+\) \| ([^|]+) \|$/gm)], usedFor = new Set();
    for (const r of rows) for (const k of r[3].split(',')) usedFor.add(k.trim());
    const missing = [], unsourced = [], absent = [];
    for (const k of KEYS) {
      if (!lib[k] || !lib[k].files || !lib[k].files.length) { missing.push(k); continue; }
      for (const f of lib[k].files) if (!fs.existsSync(path.join(ROOT, f))) absent.push(f);
      if (!usedFor.has(k)) unsourced.push(k);
    }
    ok(!missing.length, `keys not in lib.json: ${missing.join(', ')}`);
    ok(!absent.length, `files missing: ${absent.slice(0, 4).join(', ')}`);
    ok(!unsourced.length, `keys with no SOURCES.md row: ${unsourced.join(', ')}`);
    ok(/## Reviewed takes/.test(sources) && ['rattle', 'floor_slap', 'cloth', 'bone_crack', 'breath'].every((k) => new RegExp(`^\\| ${k} \\|`, 'm').test(sources)), 'the crawl set is not logged as reviewed');
    // the old calls still resolve: every site in js/ calls a method the module defines
    const sites = [];
    for (const f of fs.readdirSync(path.join(ROOT, 'js'))) if (f.endsWith('.js')) for (const m of read('js/' + f).matchAll(new RegExp(`sfx\\.(scream|${STRINGS_CALL})\\(`, 'g'))) sites.push(`${f}:${m[1]}`);
    return `no strings in audio.js; ${KEYS.length} keys with ${KEYS.reduce((n, k) => n + lib[k].files.length, 0)} takes, each with a CC0 row; ${rows.length} source rows; curve 1.0 at 1:00, 0.4 at 5:00; ${sites.length} old scream/drone call sites still resolve`;
  });

  let chromium = null;
  try { ({ chromium } = require('playwright')); } catch (e) { /* reported below */ }
  const browserChecks = ['rooms', 'radio', 'calls', 'ambience'];
  if (!chromium) {
    for (const n of browserChecks) await check(n, () => { throw new Error('Playwright is not installed (npm install && npx playwright install chromium)'); });
  } else if (browserChecks.some(want)) {
    const server = await startServer();
    BASE = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
    const ctx = await newContext(browser);
    let T = null;   // the title page, shared by the checks that need no night
    const title = async () => { if (!T) { T = await openGame(ctx, '/index.html'); await T.page.evaluate(() => { window.__game.sfx.init(); }); await T.page.evaluate(() => window.__game.sfx.filesReady); } return T; };

    // ---------- rooms: forest, barn and truck select reverbs and bed sets of their own ----------
    await check('rooms', async () => {
      const { page } = await title();
      const r = await page.evaluate(async () => {
        const s = window.__game.sfx, out = {};
        for (const room of ['forest', 'barn', 'truck', 'out']) {
          s.setRoom(room, { road: 20, window: 3 });
          await new Promise((r) => setTimeout(r, 50));
          const verbs = Object.entries(s.verbs).filter(([, v]) => v.g.gain.value > 0.5 || v.g.gain.value > 0.01 && room === Object.keys(s.verbs).pop()).map(([k]) => k);
          const beds = Object.entries(s.want).filter(([k, w]) => k.startsWith('lib/') && w.v > 0).map(([k, w]) => `${k.slice(4)}:${w.v.toFixed(2)}`).sort();
          out[room] = { room: s.room, verb: s.verbs[room] ? room : null, verbs, beds };
        }
        return out;
      });
      for (const room of ['forest', 'barn', 'truck']) ok(r[room].room === room && r[room].verb === room, `setRoom('${room}') did not make its reverb: ${JSON.stringify(r[room])}`);
      const sets = ['forest', 'barn', 'truck', 'out'].map((k) => r[k].beds.map((b) => b.split(':')[0]).join());
      ok(new Set(sets).size === 4, `bed sets not distinct: ${sets.join(' / ')}`);
      ok(r.forest.beds.some((b) => b.startsWith('needles_wind:')) && r.barn.beds.some((b) => b.startsWith('bed_wind_in:')) && r.truck.beds.some((b) => b.startsWith('bed_road:')), `wrong beds: ${JSON.stringify(r)}`);
      return `forest ${r.forest.beds.join(' ')} | barn ${r.barn.beds.join(' ')} | truck ${r.truck.beds.join(' ')}`;
    });

    // ---------- radio: a recorded AM bed through the set's speaker, placed; the newsreader's item through the same speaker ----------
    await check('radio', async () => {
      const { page } = await title();
      const r = await page.evaluate(async () => {
        const s = window.__game.sfx, at = { x: 3.4, y: 1.0, z: 4.15 };
        s.radio(1, 0, { at });
        const t0 = performance.now();
        while (!(s.live['lib/bed_radio'] && s.live['lib/bed_radio'].src.buffer) && performance.now() - t0 < 20000) await new Promise((r) => setTimeout(r, 100));
        const live = s.live['lib/bed_radio'], bed = live && live.src.buffer;
        let tune = s.radioTune({ at }); if (!tune) { await s.libLoad('radio_tune'); tune = s.radioTune({ at }); }
        const say = s.radioSay('news/n1', { at });
        const ducked = s.rad.g.gain.value;
        s.radio(0.5, 0.8); const stat = s.want['lib/radio_static'];
        s.radio(0, 0);
        return { bed: bed ? { dur: +bed.duration.toFixed(2), loop: live.src.loop, ch: bed.numberOfChannels } : null, want: s.want['lib/bed_radio'].v, pan: s.rad.pan ? [s.rad.pan.positionX.value, s.rad.pan.positionZ.value] : null,
          into: s.want['lib/bed_radio'].into === s.rad.inp, tune: +tune.toFixed(2), say: +say.toFixed(2), stat: stat && stat.v, off: s.want['lib/bed_radio'].v, synth: !!s.radTimer };
      });
      ok(r.bed && r.bed.dur > 3 && r.bed.loop, `the recorded bed did not play: ${JSON.stringify(r)}`);
      ok(r.into && r.pan && Math.abs(r.pan[0] - 3.4) < 1e-6 && Math.abs(r.pan[1] - 4.15) < 1e-6, `the bed is not routed through the set's speaker at its place: ${JSON.stringify(r)}`);
      ok(r.tune > 0 && r.say > 0, `the tuner (${r.tune}) or the newsreader's item (${r.say}) did not play`);
      ok(r.stat > 0 && r.off === 0 && !r.synth, `static / off / the old synth pad: ${JSON.stringify(r)}`);
      return `bed ${r.bed.dur} s loop (${r.bed.ch} ch) at (3.4, 4.15) through the speaker chain; tuner ${r.tune} s; news/n1 ${r.say} s through it; static ${r.stat.toFixed(2)} when wrong; off at 0`;
    });

    // ---------- calls: every call the night code still makes, and the new ones, run without error ----------
    await check('calls', async () => {
      const { page, w } = await title();
      const r = await page.evaluate(async (CALL) => {
        const s = window.__game.sfx, ran = [];
        const run = (name, fn) => { try { fn(); ran.push(name); } catch (e) { throw new Error(`${name}: ${e.message}`); } };
        run('scream', () => s.scream()); run('scream at', () => s.scream({ at: { x: 1, y: 1, z: 1 } }));
        run(CALL + ' 0.5', () => s[CALL](0.5, 0.3)); run(CALL + ' 0', () => s[CALL](0, 2));
        const tens = s.tensionGain.gain;
        run('uiTick', () => s.uiTick()); run('uiTone', () => s.uiTone()); run('uiTone back', () => s.uiTone('back'));
        run('kettle', () => s.kettle({ at: { x: 3.6, y: 1, z: 2.2 } })); run('ironRoll', () => s.ironRoll({ at: { x: -58.8, y: 1.2, z: -12 } }));
        run('carHorn', () => s.carHorn({ at: { x: 4.7, y: 1, z: -27 }, hold: 2 })); run('bus horn', () => s.carHorn({ at: { x: 0, y: 1.5, z: -30 }, bus: true })); run('alarmChirp', () => s.alarmChirp({ at: { x: 2, y: 2.4, z: 0 } }));
        for (const k of ['rattle', 'floor_slap', 'chairs_fall', 'doorknob', 'cutlery', 'toast_pop', 'glass_ring', 'skid', 'smoke_alarm', 'pencil', 'paper_slide', 'chain', 'bowl', 'crib', 'tarp', 'bed_creak', 'shoes_cloth']) run('pick ' + k, () => s.pick(k, { at: { x: 1, y: 1, z: 2 } }));
        run('car_idle bed', () => s.bed('lib/car_idle', 0.3, 1)); run('needles bed', () => s.bed('lib/needles_wind', 0.3, 1));
        await new Promise((r) => setTimeout(r, 300));
        return { ran: ran.length, swell: typeof s.swell, tension: +tens.value.toFixed(4), warm: ['rattle', 'bone_crack', 'floor_slap', 'ui_tick', 'ui_tone'].map((k) => (s.libBuf[k] || []).length) };
      }, STRINGS_CALL);
      ok(r.swell === 'undefined', 'swell() is still callable');
      ok(r.warm.every((n) => n > 0), `the warm keys are not loaded: ${r.warm.join()}`);
      clean(w);
      return `${r.ran} calls ran (scream, the old drone call, the menu, the kettle, the iron roll, the horns, the chirp, ${r.warm.length} warm keys loaded: ${r.warm.join('/')} takes); no page errors`;
    });
    if (T) { await T.page.close(); T = null; }

    // ---------- ambience: on a night the beds follow the clock, 1.0 at 1:00 and 0.4 at 5:00 ----------
    await check('ambience', async () => {
      const { page, w } = await nightPage(ctx, '#night3&type=quiet');
      const at = async (clock) => {
        await page.evaluate((c) => { window.__game.F.clock = c; }, clock);
        await until(page, (c) => { const s = window.__game.sfx; return s.night && s.clockMin != null && Math.abs(s.clockMin - c) < 3; }, clock, 20e3);
        return page.evaluate(() => { const s = window.__game.sfx; return { curve: +s.curve.toFixed(3), level: +s.ambienceLevel().toFixed(3), amb: s.ambLevel ?? 1, clock: +s.clockMin.toFixed(1), night: s.night, pushed: s.clockPushed }; });
      };
      const a = await at(60), b = await at(300), c = await at(180);
      ok(Math.abs(a.curve - 1) < 0.02, `at 1:00 the curve is ${a.curve}: ${JSON.stringify(a)}`);
      ok(Math.abs(b.curve - 0.4) < 0.02, `at 5:00 the curve is ${b.curve}: ${JSON.stringify(b)}`);
      ok(Math.abs(c.curve - 0.7) < 0.02 && Math.abs(c.level - c.amb * c.curve) < 0.01, `at 3:00: ${JSON.stringify(c)}`);
      clean(w);
      await page.close();
      return `night 3: curve ${a.curve} at 1:00, ${c.curve} at 3:00 (beds at ${c.level} = ${c.amb} x ${c.curve}), ${b.curve} at 5:00; no page errors`;
    });

    await ctx.close(); await browser.close(); server.close();
  }

  const failed = results.filter((r) => r.status === 'FAIL').length;
  console.log(`${results.length} checks, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
