#!/usr/bin/env node
'use strict';
// `npm test`: the whole game in headless Chromium with the network cut off (only this machine answers), walked through the title and its
// options, a day, a night, the trailer hook and a phone-sized touch screen; then the desktop shell's own smoke run if Electron is installed.
// Further checks drive the game as a player would, with a faked gamepad, typed keys and the debug jumps (#night4&type=hunted, #night10&proof=4 ...):
// title to pause, getting caught, the three endings, a night survived and Continue, the vigil, each nightmare, the breaker, the doors, brightness, a typed seed.
// One PASS / FAIL / SKIP line per check, exit 1 on any FAIL; --only picks checks.
//   node tests/smoke.js [--port N] [--only 0,3,7 | --only load,gamepad]
// Needs Playwright's Chromium (`npm install`, then `npx playwright install chromium`). The pages use SwiftShader, so after the first load
// each one stops drawing (window.__norender, see js/main.js) and only the game's logic runs.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { Readable } = require('stream');
const serve = require('../desktop/static');

const ROOT = path.join(__dirname, '..');
const ARGV = process.argv.slice(2);
const opt = (name, def) => { const i = ARGV.indexOf(name); return i >= 0 && ARGV[i + 1] !== undefined ? ARGV[i + 1] : def; };
const PORT = +opt('--port', process.env.SMOKE_PORT || 0);
// the checks by name, so --only takes either 10 or gamepad
const NAMES = { modules: 0, load: 1, fonts: 2, title: 3, day: 4, night: 5, evidence: 6, trailer: 7, phone: 8, desktop: 9, gamepad: 10, death: 11, endings: 12, dawn: 13, vigil: 14, nightmares: 15, breaker: 16, doors: 17, brightness: 18, seed: 19 };
const ONLY = opt('--only', '') ? new Set(opt('--only', '').split(',').map((t) => (t in NAMES ? NAMES[t] : Number(t)))) : null;
if (ONLY && [...ONLY].some(Number.isNaN)) { console.error('--only takes check numbers or names: ' + Object.keys(NAMES).join(', ')); process.exit(2); }
const want = (...ns) => !ONLY || ns.some((n) => ONLY.has(n));
const LOCAL = new Set(['127.0.0.1', 'localhost']);
const FAMILIES = ['Special Elite', 'Courier Prime', 'Permanent Marker', 'Gloria Hallelujah'];
const IGNORE = [/Ignored attempt to cancel a touchstart event/];   // chromium's touch emulation says this on its own
const GAME_WARNINGS = /\b(nightmare|night type|grandpa model) failed/;   // the game catches these and warns instead of throwing
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- results ----------
const results = [];
class Skip extends Error {}
function ok(cond, msg) { if (!cond) throw new Error(msg); }
function within(ms, p, what) { let t; return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`timed out after ${ms / 1000} s: ${what}`)), ms); })]).finally(() => clearTimeout(t)); }
async function check(n, name, fn, ms = 240e3) {
  if (!want(n)) return;
  const t0 = Date.now(); let status = 'PASS', detail = '';
  try { detail = (await within(ms, Promise.resolve().then(fn), name)) || ''; } catch (e) { status = e instanceof Skip ? 'SKIP' : 'FAIL'; detail = e.message.split('\n')[0]; }
  results.push({ n, name, status });
  console.log(`${status} ${n} ${name}: ${detail}${detail ? ' ' : ''}(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}

// ---------- the server: the repo root, as the desktop shell serves it (desktop/static.js) ----------
function startServer() {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      if ((url.pathname === '/' || url.pathname === '/index.html') && url.searchParams.get('trailer')) {   // the live trailer hook, added the way trailer/render.js --serve adds it
        const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace('</body>', '  <script type="module" src="trailer/boot.js"></script>\n</body>');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' }); res.end(html); return;
      }
      const r = await serve.respond(ROOT, new Request(url.href, { method: req.method, headers: req.headers.range ? { range: req.headers.range } : {} }));
      res.writeHead(r.status, Object.fromEntries(r.headers));
      if (r.body) Readable.fromWeb(r.body).on('error', () => res.destroy()).pipe(res); else res.end();
    } catch (e) { if (!res.headersSent) res.writeHead(500); res.end(String(e)); }
  });
  return new Promise((resolve, reject) => { server.once('error', reject); server.listen(PORT, '127.0.0.1', () => resolve(server)); });
}

// ---------- pages ----------
async function newContext(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 }, ...opts });
  ctx.blocked = [];
  await ctx.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (LOCAL.has(u.hostname) || u.protocol === 'data:' || u.protocol === 'blob:') return route.continue();
    ctx.blocked.push(u.href); return route.abort('internetdisconnected');
  });
  return ctx;
}
// everything that went wrong on a page: errors thrown, console errors, failed or refused requests, and any attempt to reach the network
function watch(page, ctx) {
  const w = { errors: [], console: [], failed: [], bad: [], requests: 0, ctx };
  page.on('pageerror', (e) => w.errors.push(String((e && e.stack) || e).split('\n').slice(0, 2).join(' / ')));
  page.on('console', (m) => {
    const text = m.text();
    if (m.type() === 'error' && !IGNORE.some((re) => re.test(text))) w.console.push(text);
    else if (m.type() === 'warning' && GAME_WARNINGS.test(text)) w.console.push(text);
  });
  page.on('request', () => { w.requests++; });
  page.on('requestfailed', (r) => w.failed.push(`${r.url()} (${(r.failure() && r.failure().errorText) || 'failed'})`));
  page.on('response', (r) => { if (r.status() >= 400) w.bad.push(`${r.status()} ${r.url()}`); });
  return w;
}
const problems = (w) => [...w.errors.map((s) => `page error: ${s}`), ...w.console.map((s) => `console error: ${s}`), ...w.failed.map((s) => `request failed: ${s}`), ...w.bad.map((s) => `HTTP ${s}`), ...w.ctx.blocked.map((s) => `tried the network: ${s}`)];
const clean = (w) => { const p = problems(w); ok(p.length === 0, `${p.length} problem(s): ${p.slice(0, 3).join(' | ')}`); };
// a gamepad that is always connected: the game reads window.__pad.buttons[i].pressed on each frame
const PAD = () => {
  window.__pad = { connected: true, id: 'smoke pad', index: 0, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  navigator.getGamepads = () => [window.__pad];
};
async function openGame(ctx, url, { render = false, clock = 0, pad = false } = {}) {
  const page = await ctx.newPage(), w = watch(page, ctx), t0 = Date.now();
  if (!render) await page.addInitScript(() => { window.__norender = true; });
  if (clock) await page.addInitScript((m) => { window.__clockMul = m; }, clock);   // the night's clock runs m times faster
  if (pad) await page.addInitScript(PAD);
  await page.goto(BASE + url, { waitUntil: 'load', timeout: 180e3 });
  await page.waitForFunction(() => window.__game && document.getElementById('loading').classList.contains('done'), null, { timeout: 180e3, polling: 250 });
  return { page, w, readyIn: (Date.now() - t0) / 1000 };
}
const until = (page, fn, arg, ms = 120e3) => page.waitForFunction(fn, arg, { timeout: ms, polling: 200 });
// game seconds, not wall seconds: waits until the game clock has moved on by s
async function playFor(page, s, ms = 240e3) {
  const t0 = await page.evaluate(() => window.__game.gameTime);
  await until(page, (t) => window.__game.gameTime >= t, t0 + s, ms);
  return t0;
}

// a night from its debug jump, started and live; no drawing and no shader warm-up
async function nightPage(ctx, hash, opts = {}) {
  const A = await openGame(ctx, '/index.html' + hash, opts), n = hash.match(/night(\d+)/)[1];
  await A.page.evaluate(() => { const g = window.__game; g.renderer.compileAsync = async () => {}; g.startGame(); });
  await until(A.page, (n) => window.__game.F.stage === 'n' + n && window.__game.F.live, n, 240e3);
  return A;
}
// out of the bunk by its own prompt (E), onto the floor
async function climbDown(page) {
  await until(page, () => { const g = window.__game; return g.P.mode === 'bunk' && !g.F.cutscene && !g.F.script; }, null, 60e3);
  await page.keyboard.press('KeyE');
  await until(page, () => { const g = window.__game; return g.P.mode === 'walk' && !g.F.cutscene; }, null, 60e3);
}
// the player at (x, z), at height y, looking at (tx, tz)
const stand = (page, x, z, tx, tz, y = 0) => page.evaluate(([x, z, tx, tz, y]) => {
  const g = window.__game; g.P.pos.set(x, y, z); g.P.vel.set(0, 0, 0);
  if (tx !== undefined) { g.P.yaw = Math.atan2(-(tx - x), -(tz - z)); g.P.pitch = 0; }
}, [x, z, tx, tz, y]);
const hold = async (page, key, ms) => { await page.keyboard.down(key); await sleep(ms); await page.keyboard.up(key); };
const tap = async (page, i) => {   // a press of gamepad button i
  await page.evaluate((i) => { window.__pad.buttons[i].pressed = true; }, i); await sleep(150);
  await page.evaluate((i) => { window.__pad.buttons[i].pressed = false; }, i); await sleep(150);
};
const prompt = (page) => page.evaluate(() => document.getElementById('prompt').textContent.replace(/\s+/g, ' ').trim());
const roomAt = (page, x, z, y) => page.evaluate(async ([x, z, y]) => (await import('/js/world.js')).roomAt(x, z, y), [x, z, y]);
// each of these checks gets a browser context of its own, so saves and settings never leak from one to the next
async function alone(browser, fn, opts) { const c = await newContext(browser, opts); try { return await fn(c); } finally { await c.close(); } }

let BASE = '';
(async () => {
  // ---------- 0: every module parses (node stops at the bare 'three' import, which only the browser's import map resolves) ----------
  await check(0, 'modules', () => {
    const files = fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js')).sort(), bad = [];
    for (const f of files) {
      const r = spawnSync(process.execPath, ['--no-warnings', '--input-type=module', '-e', `import('./js/${f}').then(() => {}, (e) => { console.error(String(e && e.message)); process.exit(1); })`], { cwd: ROOT, encoding: 'utf8' });
      if (r.status !== 0 && !/Cannot find package 'three'/.test(r.stderr)) bad.push(`${f}: ${(r.stderr || '').trim().split('\n')[0]}`);
    }
    ok(!bad.length, bad.join(' | '));
    return `${files.length} files in js/ import cleanly`;
  });

  let chromium = null;
  try { ({ chromium } = require('playwright')); } catch (e) { /* reported below */ }
  const browserChecks = [1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
  if (!chromium) {
    for (const n of browserChecks) await check(n, 'browser', () => { throw new Error('Playwright is not installed (npm install && npx playwright install chromium)'); });
  } else if (want(...browserChecks)) {
    const server = await startServer();
    BASE = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
    const ctx = await newContext(browser);

    // ---------- 1-3: the title ----------
    if (want(1, 2, 3)) {
      let A = null;
      await check(1, 'load', async () => {
        A = await openGame(ctx, '/index.html', { render: true });
        const { page, w } = A;
        await until(page, () => { const g = window.__game; return g.E.rig && g.mom.rig && g.dad.rig; }, null, 180e3);
        await until(page, () => window.__game.renderer.info.render.frame > 0, null, 180e3);
        const gl = await page.evaluate(() => { const g = window.__game, c = g.renderer.getContext(); return { err: c.getError(), w: c.drawingBufferWidth, h: c.drawingBufferHeight, lost: c.isContextLost() }; });
        await page.waitForLoadState('networkidle', { timeout: 120e3 }).catch(() => {});
        await page.evaluate(() => { window.__norender = true; });
        ok(!gl.lost && gl.err === 0 && gl.w > 0, `WebGL ${JSON.stringify(gl)}`);
        clean(w);
        return `window.__game in ${A.readyIn.toFixed(1)} s, models loaded, ${w.requests} local requests, a frame drawn (${gl.w}x${gl.h}, glError 0), no errors, nothing fetched from the network`;
      });
      const needA = async () => { if (!A && !want(1)) A = await openGame(ctx, '/index.html'); if (!A) throw new Error('the title page did not load'); return A; };

      await check(2, 'fonts', async () => {
        const { page } = await needA();
        const r = await page.evaluate(async (fams) => {
          await document.fonts.ready;
          const out = {};
          for (const f of fams) {
            const faces = [...document.fonts].filter((x) => x.family.replace(/["']/g, '') === f), before = faces.map((x) => x.status);
            await Promise.all(faces.map((x) => x.load().catch(() => {})));
            out[f] = { n: faces.length, before, after: faces.map((x) => x.status), check: document.fonts.check(`16px "${f}"`) };
          }
          return out;
        }, FAMILIES);
        const bad = FAMILIES.filter((f) => !(r[f].n > 0 && r[f].after.every((s) => s === 'loaded') && r[f].check));
        ok(!bad.length, `not loaded: ${bad.map((f) => `${f} ${JSON.stringify(r[f])}`).join(' | ')}`);
        return FAMILIES.map((f) => `${f} ${r[f].n} face${r[f].n > 1 ? 's' : ''}${r[f].before.every((s) => s === 'loaded') ? '' : ' (some loaded on demand)'}`).join(', ');
      });

      await check(3, 'title menu, options, settings, audio', async () => {
        const { page, w } = await needA();
        const title = await page.evaluate(() => ({ shown: !document.getElementById('title').classList.contains('hidden'), state: window.__game.menu.state, items: [...document.querySelectorAll('#title-menu .mi .ml')].map((e) => e.textContent) }));
        ok(title.shown && title.state.open.join() === 'title', `title menu not open: ${JSON.stringify(title.state)}`);
        const expect = ['New game', 'Options', 'Achievements', 'Credits', 'Controls'];
        ok(title.items.join('|') === expect.join('|'), `title entries ${JSON.stringify(title.items)}, expected ${JSON.stringify(expect)}`);
        await page.click('#title-menu [data-entry="options"]');
        await until(page, () => !document.getElementById('menu').classList.contains('hidden'), null, 10e3);
        const opts = await page.evaluate(() => ({ h: document.querySelector('#menu h2').textContent, state: window.__game.menu.state, rows: [...document.querySelectorAll('#menu [data-entry]')].map((e) => e.dataset.entry), started: window.__game.F.phase !== 'title' }));
        const rows = ['master', 'music', 'sfx', 'voice', 'sensitivity', 'invertY', 'fov', 'headBob', 'quality', 'subtitles', 'reduceFlashing', 'defaults', 'back'];
        ok(opts.h === 'Options' && opts.state.open.join() === 'title,options' && !opts.started, `options panel: ${JSON.stringify(opts)}`);
        ok(rows.every((r) => opts.rows.includes(r)), `options rows ${JSON.stringify(opts.rows)}`);
        const fov0 = await page.evaluate(() => window.__game.settings.get('fov'));
        await page.click(`#menu [data-entry="fov"] .ma[aria-label="${fov0 < 100 ? 'More' : 'Less'}"]`);
        const fov1 = await page.evaluate(() => window.__game.settings.get('fov'));
        ok(Math.abs(fov1 - fov0) === 1, `the FOV arrow did not change it (${fov0} -> ${fov1})`);
        const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('topbunk.settings') || '{}').fov);
        ok(stored === fov1, `topbunk.settings.fov is ${stored}, expected ${fov1}`);
        await page.keyboard.press('Escape');
        await until(page, () => window.__game.menu.state.open.join() === 'title' && document.getElementById('menu').classList.contains('hidden'), null, 10e3);
        await page.reload({ waitUntil: 'load', timeout: 180e3 });
        await until(page, () => window.__game && document.getElementById('loading').classList.contains('done'), null, 180e3);
        await page.evaluate(() => { window.__norender = true; });
        const after = await page.evaluate(() => window.__game.settings.get('fov'));
        ok(after === fov1, `after a reload FOV is ${after}, expected ${fov1}`);
        // the three buses: each set by its own setting, all into the master
        const a = await page.evaluate(async () => {
          const g = window.__game, s = g.sfx; s.init();
          const gains = () => Object.fromEntries(['music', 'sfx', 'voice'].map((b) => [b, +s.buses[b].gain.value.toFixed(3)]));
          const out = { ctx: !!s.ctx, buses: ['music', 'sfx', 'voice'].filter((b) => s.buses && s.buses[b] instanceof GainNode && s.sends[b] instanceof GainNode), master: +s.master.gain.value.toFixed(3), masterSetting: g.settings.get('master') };
          g.settings.set('music', 0.4); g.settings.set('voice', 0.6); out.set = gains();
          g.settings.set('music', 1); g.settings.set('voice', 1); out.back = gains();
          out.kinds = [s.kindOf('vo/dad/welcome'), s.kindOf('music/night'), s.kindOf('sfx/car_pass')];
          g.settings.set('fov', g.settings.defaults.fov);
          return out;
        });
        ok(a.ctx && a.buses.length === 3, `audio buses missing: ${JSON.stringify(a)}`);
        ok(a.master === +a.masterSetting.toFixed(3), `master gain ${a.master} vs setting ${a.masterSetting}`);
        ok(a.set.music === 0.4 && a.set.voice === 0.6 && a.set.sfx === 1 && a.back.music === 1 && a.back.voice === 1, `bus gains do not follow the settings: ${JSON.stringify(a)}`);
        ok(a.kinds.join() === 'voice,music,sfx', `bus routing ${a.kinds}`);
        await page.waitForLoadState('networkidle', { timeout: 120e3 }).catch(() => {});
        clean(w);
        await page.close();
        return `entries ${title.items.join(' | ')}; Options opens over the title (${opts.rows.length} rows); FOV ${fov0} -> ${fov1} by its arrow, still ${after} after a reload; music, sfx and voice buses follow their settings; audio files loaded with no errors`;
      });
    }

    // ---------- 4: a day ----------
    await check(4, 'day', async () => {
      const { page, w } = await openGame(ctx, '/index.html');
      ok(await page.evaluate(() => window.__game.RUN.night === 1), 'expected a fresh run at night 1');
      await page.evaluate(() => { window.__game.startGame(); });   // resolves only when the game ends: not awaited
      await until(page, () => window.__game.F.stage === 'day' && window.__game.F.phase === 'day', null, 240e3);
      const t0 = await playFor(page, 5);
      const s = await page.evaluate(() => { const g = window.__game; return { t: g.gameTime, mode: g.P.mode, obj: document.getElementById('objective').textContent, x: g.P.pos.x, z: g.P.pos.z, fov: g.camera.fov, set: g.settings.get('fov') }; });
      ok(s.mode === 'walk', `P.mode is ${s.mode}`);
      ok(/Carry your boxes/.test(s.obj), `objective is "${s.obj}"`);
      await page.keyboard.down('KeyW'); await playFor(page, 1.5, 60e3); await page.keyboard.up('KeyW');
      const moved = await page.evaluate(([x, z]) => Math.hypot(window.__game.P.pos.x - x, window.__game.P.pos.z - z), [s.x, s.z]);
      ok(moved > 0.5, `holding W moved the player only ${moved.toFixed(2)} m`);
      clean(w);
      await page.close();
      return `startGame reached the day; game clock ${t0.toFixed(1)} -> ${s.t.toFixed(1)} s; objective "${s.obj.replace(/\s+/g, ' ')}"; W walked ${moved.toFixed(1)} m; no errors`;
    });

    // ---------- 5-6: a night ----------
    if (want(5, 6)) {
      let C = null;
      await check(5, 'night, pause, achievements', async () => {
        C = await openGame(ctx, '/index.html#night');
        const { page, w } = C;
        await page.evaluate(() => { window.__game.startGame(); });
        await until(page, () => window.__game.F.stage === 'n1' && window.__game.F.live, null, 240e3);
        const t0 = await playFor(page, 20);
        const st = await page.evaluate(() => { const g = window.__game; return { t: g.gameTime, dead: g.F.dead, phase: g.F.phase, night: g.F.night, clock: g.F.clock }; });
        ok(st.phase === 'night' && st.night === 1, `not on night 1: ${JSON.stringify(st)}`);
        ok(!st.dead, 'caught while lying still in the bunk on night 1');
        ok(await page.evaluate(() => typeof window.__game.setPause === 'function'), 'window.__game.setPause is missing');
        await page.evaluate(() => window.__game.setPause(true));
        const p = await page.evaluate(() => ({ shown: !document.getElementById('pause').classList.contains('hidden'), state: window.__game.menu.state, items: [...document.querySelectorAll('#pause-menu .mi .ml')].map((e) => e.textContent), t: window.__game.gameTime }));
        ok(p.shown && p.state.open.join() === 'pause' && p.state.focus === 'resume', `pause menu: ${JSON.stringify(p)}`);
        const expect = ['Resume', 'Options', 'Achievements', 'Controls', 'Restart night', 'Quit to title'];
        ok(p.items.join('|') === expect.join('|'), `pause entries ${JSON.stringify(p.items)}`);
        await sleep(1500);
        const frozen = await page.evaluate((t) => window.__game.gameTime - t, p.t);
        ok(frozen === 0, `the game clock ran ${frozen.toFixed(3)} s while paused`);
        // an unlock: the card shows (a paused game is calm), it is saved, and the saved list is what the module loads. A debug jump (#night)
        // earns nothing, so first that is checked, then the jump is let off for the one unlock.
        const a = await page.evaluate(async () => {
          const ach = window.__game.achievements, jumped = ach.unlock('GLOVE_BOX');
          ach.bind({ test: () => false });
          const first = ach.unlock('GLOVE_BOX'), again = ach.unlock('GLOVE_BOX');
          ach.bind({ test: () => true });
          const t0 = performance.now(); let el = null;
          while (performance.now() - t0 < 3000) { el = document.querySelector('#achv.show'); if (el) break; await new Promise((r) => setTimeout(r, 100)); }
          const fresh = await import(`./js/achievements.js?smoke=${Date.now()}`);
          return { jumped, first, again, card: el ? [...el.children].map((c) => c.textContent).join(' / ') : null, stored: Object.keys(JSON.parse(localStorage.getItem('topbunk.achievements') || '{}')), reloaded: fresh.has('GLOVE_BOX'), has: ach.has('GLOVE_BOX') };
        });
        ok(a.jumped === false, `a debug jump unlocked an achievement: ${JSON.stringify(a)}`);
        ok(a.first === true && a.again === false && a.has, `unlock(): ${JSON.stringify(a)}`);
        ok(a.card && /Eyes on the road/.test(a.card), `no achievement card: ${JSON.stringify(a)}`);
        ok(a.stored.includes('GLOVE_BOX') && a.reloaded, `not saved: ${JSON.stringify(a)}`);
        await page.evaluate(() => window.__game.setPause(false));
        const r = await page.evaluate(() => ({ hidden: document.getElementById('pause').classList.contains('hidden'), open: window.__game.menu.state.open }));
        ok(r.hidden && r.open.length === 0, `still paused: ${JSON.stringify(r)}`);
        await playFor(page, 0.5, 30e3);
        clean(w);
        return `#night reached night 1 live; game clock ${t0.toFixed(1)} -> ${st.t.toFixed(1)} s with drawing off; setPause(true) shows ${p.items.length} entries and stops the clock, setPause(false) resumes it; GLOVE_BOX card "${a.card}" shown, saved, read back by a fresh module`;
      }, 360e3);

      await check(6, 'evidence', async () => {
        if (!C && want(5)) throw new Error('the night page did not load');
        const { page, w } = C || await openGame(ctx, '/index.html#night');   // run on its own: the proof API is there before the night starts
        const e = await page.evaluate(() => {
          const g = window.__game, pr = g.nights.proof, kinds = {};
          for (let n = 1; n <= 10; n++) kinds[n] = pr.kindsFor(g.nights.plan(n));
          g.UI.objective('Smoke test <span>1 / 2</span>');
          const el = document.getElementById('objective'), set = { text: el.textContent, shown: el.classList.contains('show') };
          g.UI.objective(null);
          return {
            evidence: Array.isArray(g.RUN.evidence) ? g.RUN.evidence.length : null, total: pr.total, count: pr.count(), kinds, set, cleared: !el.classList.contains('show'),
            proofLine: !!document.getElementById('proof'), finale: typeof g.finaleFor === 'function' ? [0, 2, 3, 4, 6, 7, 8, 10].map((n) => [n, g.finaleFor(n)]) : null,
          };
        });
        ok(e.evidence !== null, 'RUN.evidence is not an array');
        ok(e.total === 12 && e.count === e.evidence, `proof: total ${e.total}, count ${e.count}, RUN.evidence ${e.evidence}`);
        ok(e.kinds[1].length === 0 && e.kinds[10].length === 0, `nights 1 and 10 should leave no proof: ${JSON.stringify([e.kinds[1], e.kinds[10]])}`);
        const mid = [2, 3, 4, 5, 6, 7, 8, 9].filter((n) => e.kinds[n].length > 0);
        ok(mid.length > 0, 'no night from 2 to 9 can leave proof on this seed');
        ok(e.set.shown && e.set.text === 'Smoke test 1 / 2' && e.cleared, `objective: ${JSON.stringify(e.set)}, cleared ${e.cleared}`);
        ok(e.proofLine, 'no #proof line under the objective');
        if (!e.finale) throw new Skip('window.__game.finaleFor is not exposed, so the ending choice was not checked');
        const want3 = { 0: 'ENDING_ALONE', 2: 'ENDING_ALONE', 3: 'ENDING_TAKEN', 4: 'ENDING_TAKEN', 6: 'ENDING_TAKEN', 7: 'ENDING_BELIEVED', 8: 'ENDING_BELIEVED', 10: 'ENDING_BELIEVED' };
        const wrong = e.finale.filter(([n, v]) => v !== want3[n]);
        ok(!wrong.length, `finaleFor: ${JSON.stringify(wrong)}`);
        clean(w);
        await page.close();
        return `RUN.evidence holds ${e.evidence}, ${e.total} kinds; proof possible on nights ${mid.join(',')} and none on 1 or 10; objective set and cleared; finaleFor 0/4/8 -> ${e.finale.filter(([n]) => [0, 4, 8].includes(n)).map(([, v]) => v).join(', ')}`;
      });
    }

    // ---------- 7: the trailer hook ----------
    await check(7, 'trailer', async () => {
      const page = await ctx.newPage(), w = watch(page, ctx);
      await page.addInitScript(() => { window.__norender = true; });
      // the soundtrack is not under test and not in git: an empty file and boot.js plays on silent
      await page.route('**/trailer/music/**', (route) => route.fulfill({ status: 200, contentType: 'audio/wav', body: '' }));
      await page.goto(BASE + '/index.html?trailer=1', { waitUntil: 'load', timeout: 180e3 });
      await until(page, () => window.__game && document.getElementById('loading').classList.contains('done'), null, 180e3);
      // boot.js's player runs each shot from the game's render call: keep the call, drop the drawing
      await page.evaluate(() => { const g = window.__game; g.renderer.render = () => {}; g.renderer.compileAsync = async () => {}; window.__norender = false; });
      const go = page.getByText(/click to play/i);   // boot.js's start overlay: it shows once the player is attached
      await go.waitFor({ timeout: 180e3 });
      const s = await page.evaluate(async () => {
        const m = await import('./trailer/trailer.js');
        const bad = (list) => list.filter((x, i) => !(x.id && typeof x.setup === 'function' && typeof x.update === 'function' && x.dur > 0 && typeof x.t === 'number' && (i === 0 || Math.abs(x.t - (list[i - 1].t + list[i - 1].dur)) < 1e-3))).map((x) => x.id);
        const end = (list) => { const l = list[list.length - 1]; return +(l.t + l.dur).toFixed(3); };
        const first = m.SHOTS[0], setup = first.setup;
        first.setup = function (c) { window.__smokeShot = 'running'; const r = setup.call(this, c); window.__smokeShot = 'done'; return r; };
        return { n: m.SHOTS.length, first: first.id, bad: bad(m.SHOTS), end: end(m.SHOTS), dur: m.LANDSCAPE_DURATION, pn: m.PORTRAIT_SHOTS.length, pbad: bad(m.PORTRAIT_SHOTS), pend: end(m.PORTRAIT_SHOTS), pdur: m.PORTRAIT_DURATION };
      });
      ok(s.n > 0 && !s.bad.length, `landscape SHOTS: ${JSON.stringify(s)}`);
      ok(s.pn > 0 && !s.pbad.length, `PORTRAIT_SHOTS: ${JSON.stringify(s)}`);
      ok(Math.abs(s.end - s.dur) < 0.5, `landscape shots end at ${s.end} s, the cut is ${s.dur} s`);
      await go.click();
      await until(page, () => window.__smokeShot === 'done' && window.__game.P.mode === 'cine' && window.__game.F.cutscene, null, 120e3);
      await sleep(1000);
      clean(w);
      await page.close();
      // then every shot of both cuts, stepped the way trailer/render.js steps them (its frozen clock) without drawing a frame
      const { INIT } = require('../trailer/render.js'), cuts = {};
      for (const aspect of ['landscape', 'portrait']) {
        const p = await ctx.newPage(), pw = watch(p, ctx);
        await p.addInitScript(INIT);
        await p.goto(BASE + '/index.html', { waitUntil: 'load', timeout: 180e3 });
        await until(p, () => { const g = window.__game; return g && g.E.rig && g.mom.rig && g.dad.rig; }, null, 180e3);
        cuts[aspect] = await p.evaluate(async (aspect) => {
          const g = window.__game, fps = 6, before = localStorage.getItem('topbunk.achievements');
          g.renderer.render = () => {}; g.renderer.compileAsync = async () => {};
          const m = await import('./trailer/trailer.js'), player = m.attach(g, { aspect, fps });
          await player.begin({ quality: 'low' });
          const seen = new Set();
          for (let i = 0, n = Math.ceil(player.duration * fps); i < n; i++) seen.add(player.frame(i, false).shot);
          return { shots: player.SHOTS.length, seen: seen.size, unlocked: localStorage.getItem('topbunk.achievements') !== before, card: !!document.querySelector('#achv.show') };
        }, aspect);
        clean(pw);
        await p.close();
        const c = cuts[aspect];
        ok(c.seen === c.shots, `${aspect}: stepped through ${c.seen} of ${c.shots} shots`);
        ok(!c.unlocked && !c.card, `${aspect}: the trailer unlocked an achievement or showed its card`);
      }
      return `boot.js attached the player; ${s.n} landscape shots end at ${s.end} s (cut ${s.dur} s), ${s.pn} portrait shots at ${s.pend} s; first shot "${s.first}" set up and drove the camera; every shot of both cuts steps with no errors and no achievement (nothing drawn)`;
    }, 300e3);

    await ctx.close();

    // ---------- 8: a phone ----------
    await check(8, 'phone', async () => {
      const pctx = await newContext(browser, { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      try {
        const { page, w } = await openGame(pctx, '/index.html');
        await page.evaluate(() => { window.__game.renderer.compileAsync = async () => {}; });
        const t = await page.evaluate(() => {
          const vw = innerWidth, vh = innerHeight, inside = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.left >= -1 && r.top >= -1 && r.right <= vw + 1 && r.bottom <= vh + 1; };
          const items = [...document.querySelectorAll('#title-menu .mi')];
          return {
            vw, vh, coarse: matchMedia('(pointer: coarse)').matches, scheme: document.body.dataset.scheme, touchOn: document.getElementById('touch').classList.contains('on'), begin: document.getElementById('begin').textContent,
            h1: inside(document.querySelector('#title h1')), items: items.map((e) => [e.textContent.trim(), inside(e), Math.round(e.getBoundingClientRect().height)]), overflowX: document.documentElement.scrollWidth - vw,
            buttons: ['t-act', 't-run', 't-light', 't-pause', 't-breath', 't-cover'].filter((id) => document.getElementById(id)),
          };
        });
        ok(t.coarse && t.scheme === 'touch' && t.touchOn && t.begin === 'Tap to begin', `touch scheme not on: ${JSON.stringify(t)}`);
        ok(t.h1 && t.items.length >= 4 && t.items.every(([, i]) => i) && t.overflowX <= 0, `title does not fit ${t.vw}x${t.vh}: ${JSON.stringify(t)}`);
        ok(t.items.every(([, , h]) => h >= 30), `title entries smaller than a thumb: ${JSON.stringify(t.items)}`);
        ok(t.buttons.length === 6, `touch buttons: ${t.buttons}`);
        await page.tap('#title-menu [data-entry="new"]');   // New game opens its panel (the seed), and Start begins the run
        await until(page, () => window.__game.menu.state.open.join() === 'title,newgame', null, 10e3);
        await page.tap('#menu [data-entry="start"]');
        await until(page, () => document.getElementById('title').classList.contains('hidden') && window.__game.F.stage === 'day', null, 120e3);
        const b = await page.evaluate(() => {
          const vw = innerWidth, vh = innerHeight, vis = getComputedStyle(document.getElementById('touch')).visibility;
          return { vis, on: ['t-act', 't-run', 't-light', 't-pause'].map((id) => { const el = document.getElementById(id), r = el.getBoundingClientRect(), cs = getComputedStyle(el); return [id, cs.display !== 'none' && r.width > 30 && r.left >= 0 && r.top >= 0 && r.right <= vw && r.bottom <= vh, Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; }) };
        });
        ok(b.vis === 'visible' && b.on.every(([, v]) => v), `touch buttons in play: ${JSON.stringify(b)}`);
        const [, , px, py] = b.on.find(([id]) => id === 't-pause');
        await page.touchscreen.tap(px, py);
        await until(page, () => !document.getElementById('pause').classList.contains('hidden'), null, 10e3);
        await sleep(600);   // a tap that resumed straight away would show here
        const pz = await page.evaluate(() => { const vh = innerHeight, items = [...document.querySelectorAll('#pause-menu .mi')]; return { paused: !document.getElementById('pause').classList.contains('hidden'), n: items.length, fit: items.every((e) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= vh + 1; }) }; });
        ok(pz.paused && pz.n >= 5 && pz.fit, `pause on a phone: ${JSON.stringify(pz)}`);
        clean(w);
        return `844x390 touch: ${t.items.length} title entries on screen (${Math.min(...t.items.map(([, , h]) => h))} px or taller), "Tap to begin"; New game then Start by tap starts the day; USE, RUN, LIGHT and II on screen; II pauses and the ${pz.n}-entry pause menu fits`;
      } finally { await pctx.close(); }
    });

    // ---------- 10: a gamepad through the title, options, start and pause ----------
    await check(10, 'gamepad', () => alone(browser, async (c) => {
      const { page, w } = await openGame(c, '/index.html', { pad: true });
      await page.evaluate(() => { window.__game.renderer.compileAsync = async () => {}; });
      const ms = () => page.evaluate(() => window.__game.menu.state);
      await tap(page, 13);   // d-pad down
      let m = await ms();
      ok(m.open.join() === 'title' && m.focus === 'options', `down on the title: ${JSON.stringify(m)}`);
      ok(await page.evaluate(() => document.body.dataset.scheme) === 'pad', 'the pad did not become the input scheme');
      await tap(page, 0);   // A
      m = await ms();
      ok(m.open.join() === 'title,options', `A on Options: ${JSON.stringify(m)}`);
      await tap(page, 13);
      ok((await ms()).focus === 'music', `down inside Options: ${JSON.stringify(await ms())}`);
      await tap(page, 1);   // B
      m = await ms();
      ok(m.open.join() === 'title' && m.focus === 'options', `B out of Options: ${JSON.stringify(m)}`);
      await tap(page, 12);   // up
      await tap(page, 0);
      m = await ms();
      ok(m.open.join() === 'title,newgame' && m.focus === 'start', `A on New game: ${JSON.stringify(m)}`);
      await tap(page, 0);   // Start of the new game panel
      await until(page, () => window.__game.F.stage === 'day' && window.__game.F.phase === 'day', null, 240e3);
      const t0 = await playFor(page, 1, 60e3);
      ok(await page.evaluate(() => document.getElementById('title').classList.contains('hidden')), 'the title is still up');
      await tap(page, 9);   // Start pauses
      m = await ms();
      const p = await page.evaluate(() => ({ shown: !document.getElementById('pause').classList.contains('hidden'), t: window.__game.gameTime, info: document.getElementById('pauseinfo').textContent }));
      ok(p.shown && m.open.join() === 'pause' && m.focus === 'resume', `pause by Start: ${JSON.stringify([p, m])}`);
      await sleep(800);
      ok(await page.evaluate((t) => window.__game.gameTime - t, p.t) === 0, 'the game clock ran while paused');
      await tap(page, 13); await tap(page, 12);   // down and up inside the pause menu
      await tap(page, 0);   // A on Resume
      const r = await page.evaluate(() => ({ hidden: document.getElementById('pause').classList.contains('hidden'), open: window.__game.menu.state.open }));
      ok(r.hidden && r.open.length === 0, `A on Resume: ${JSON.stringify(r)}`);
      await playFor(page, 0.5, 30e3);
      clean(w);
      return `title, options, pause and resume by pad (${p.info.replace(/\s+/g, ' ')})`;
    }), 300e3);

    // ---------- 11: getting caught, and Try again by pad ----------
    await check(11, 'death and Try again', () => alone(browser, async (c) => {
      const { page, w } = await nightPage(c, '#night2&type=hunted', { pad: true });
      await page.evaluate(() => { window.__game.nights.director.stop(); });
      // caught the way a failed breath check catches you: hiding, a check on, and the breath not held
      await page.evaluate(() => { const g = window.__game; g.P.mode = 'hide'; g.F.breathCheck = true; g.F.grace = 0; });
      await until(page, () => !document.getElementById('death').classList.contains('hidden'), null, 60e3);
      const d = await page.evaluate(() => { const g = window.__game; return { dead: g.F.dead, live: g.F.live, deaths: g.RUN.deaths, stage: g.F.stage, h: document.querySelector('#death h2').textContent, b: document.getElementById('retry').textContent }; });
      ok(d.dead && !d.live && d.deaths === 1 && d.b === 'Try again', `death screen: ${JSON.stringify(d)}`);
      await tap(page, 0);   // A
      await until(page, () => document.getElementById('death').classList.contains('hidden') && !window.__game.F.dead && window.__game.F.live && window.__game.F.stage === 'n2', null, 120e3);
      const a = await page.evaluate(() => { const g = window.__game; return { stage: g.F.stage, mode: g.P.mode, night: g.F.night, deaths: g.RUN.deaths }; });
      ok(a.stage === 'n2' && a.night === 2 && a.mode === 'bunk' && a.deaths === 1, `after Try again: ${JSON.stringify(a)}`);
      await playFor(page, 1, 60e3);
      clean(w);
      return `caught screen "${d.h}", then night 2 again (deaths ${a.deaths})`;
    }), 300e3);

    // ---------- 12: the three end screens, by the finale path with proof 0, 4 and 8 ----------
    await check(12, 'endings', () => alone(browser, async (c) => {
      const want = { 0: ['They never believed you.', 'proof 0 / 12'], 4: ['They saw it.', 'proof 4 / 12'], 8: ['They believed you.', 'proof 8 / 12'] };
      const runs = [];   // one after the other: pages side by side starve each other of frames
      for (const proof of Object.keys(want)) {
        const { page, w } = await openGame(c, `/index.html#night10&proof=${proof}`, { clock: 30 });   // not faster: the night's clock must not step past dawn before the finale starts
        await page.evaluate(() => { const g = window.__game; g.renderer.compileAsync = async () => {}; g.startGame(); });
        await until(page, () => window.__game.F.stage === 'n10' && window.__game.F.live, null, 240e3);
        await page.evaluate(() => { window.__game.nights.director.stop(); });   // nothing hunts you before the end: the finale is what is under test
        try { await until(page, () => !document.getElementById('end').classList.contains('hidden'), null, 200e3); } catch (err) {
          const st = await page.evaluate(() => { const g = window.__game; return { stage: g.F.stage, clock: Math.round(g.F.clock), mode: g.P.mode, live: g.F.live, script: g.F.script, cut: g.F.cutscene, over: g.F.over, dead: g.F.dead, death: !document.getElementById('death').classList.contains('hidden'), seed: g.RUN.seed }; }).catch(() => null);
          throw new Error(`proof ${proof}: no end screen after 200 s: ${JSON.stringify(st)} ${w.errors.concat(w.console).slice(0, 2).join(' | ')}`);
        }
        const e = await page.evaluate(() => ({ title: document.getElementById('endtitle').textContent, info: document.getElementById('endinfo').textContent, red: document.getElementById('endtitle').classList.contains('red'), menu: [...document.querySelectorAll('#end-menu .mi .ml')].map((x) => x.textContent), run: localStorage.getItem('topbunk.run'), mode: window.__game.F.over }));
        clean(w); await page.close();
        runs.push([proof, e]);
      }
      for (const [proof, e] of runs) {
        ok(e.title === want[proof][0], `proof ${proof}: end title "${e.title}", expected "${want[proof][0]}"`);
        ok(e.info.includes(want[proof][1]), `proof ${proof}: end info "${e.info}"`);
        ok(e.red === (proof !== '8') && e.menu.join('|') === 'Play again|Main menu' && e.run === null && e.mode, `proof ${proof}: ${JSON.stringify(e)}`);
      }
      return runs.map(([proof, e]) => `proof ${proof} -> "${e.title}"`).join('; ') + '; each with Play again / Main menu, the saved run cleared, no errors';
    }), 420e3);

    // ---------- 13: a night survived to dawn, then Continue after a reload ----------
    await check(13, 'dawn and Continue', () => alone(browser, async (c) => {
      const page = await c.newPage(), w = watch(page, c);
      await page.addInitScript(() => {
        window.__norender = true; window.__clockMul = 300;
        if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('topbunk.run', JSON.stringify({ seed: 'SMKE-0001', night: 1, deaths: 0, dayDone: true, started: 1, evidence: [], evidenceAt: {}, objDone: {} })); }   // a run that has done moving day
      });
      const load = async () => {
        await page.goto(BASE + '/index.html', { waitUntil: 'load', timeout: 180e3 });
        await until(page, () => window.__game && document.getElementById('loading').classList.contains('done'), null, 180e3);
        await page.evaluate(() => { window.__game.renderer.compileAsync = async () => {}; });
        return page.evaluate(() => ({ items: [...document.querySelectorAll('#title-menu .mi .ml')].map((e) => e.textContent), info: document.getElementById('runinfo').textContent }));
      };
      let t = await load();
      ok(t.items[0] === 'Continue · Night 1' && /night 1 of 10.*SMKE-0001/.test(t.info), `title before: ${JSON.stringify(t)}`);
      await page.click('#title-menu [data-entry="continue"]');
      await until(page, () => window.__game.F.stage === 'n1' && window.__game.F.live, null, 240e3);
      await until(page, () => window.__game.RUN.night === 2, null, 240e3);
      const d = await page.evaluate(() => ({ ach: Object.keys(JSON.parse(localStorage.getItem('topbunk.achievements') || '{}')), run: JSON.parse(localStorage.getItem('topbunk.run')), night: window.__game.RUN.night }));
      ok(d.run.night === 2 && d.run.seed === 'SMKE-0001', `saved run after dawn: ${JSON.stringify(d.run)}`);
      ok(d.ach.includes('NIGHT_1') && d.ach.includes('FIRST_TRY'), `achievements after dawn: ${JSON.stringify(d.ach)}`);
      t = await load();
      ok(t.items[0] === 'Continue · Night 2' && /night 2 of 10.*SMKE-0001/.test(t.info), `title after the reload: ${JSON.stringify(t)}`);
      await page.click('#title-menu [data-entry="continue"]');
      await until(page, () => window.__game.F.stage === 'n2', null, 240e3);
      const n = await page.evaluate(() => ({ night: window.__game.F.night, type: window.__game.F.typeName, seed: window.__game.RUN.seed }));
      ok(n.night === 2 && n.seed === 'SMKE-0001', `Continue: ${JSON.stringify(n)}`);
      clean(w);
      return `dawn saves night 2; Continue after a reload plays it (${n.type}, seed ${n.seed})`;
    }), 420e3);

    // ---------- 14: the vigil, with grandpa's rig loaded ----------
    await check(14, 'vigil', () => alone(browser, async (c) => {
      const { page, w } = await nightPage(c, '#night5&type=vigil');
      const model = [];
      page.on('response', (r) => { if (/grandpa\.glb/.test(r.url())) model.push(r.status()); });
      await climbDown(page);
      await until(page, () => { let n = 0; window.__game.scene.traverse((o) => { if (o.isSkinnedMesh && o.material && o.material.name === 'm004_head') n++; }); return n > 0 && window.__game.F.blackout; }, null, 90e3);
      const g = await page.evaluate(() => {
        let head = null; window.__game.scene.traverse((o) => { if (o.isSkinnedMesh && o.material && o.material.name === 'm004_head') head = o; });
        const p = head.getWorldPosition(head.position.clone());
        return { bones: head.skeleton.bones.length, names: [/head/i, /spine/i, /eye/i].filter((re) => head.skeleton.bones.some((b) => re.test(b.name))).length, x: p.x, z: p.z, type: window.__game.F.typeName };
      });
      ok(g.type === 'The Vigil' && g.bones > 20 && g.names === 3, `grandpa's rig: ${JSON.stringify(g)}`);
      ok(Math.hypot(g.x - 3.5, g.z + 0.65) < 0.5, `grandpa is not in the chair: ${JSON.stringify(g)}`);
      await stand(page, 4.3, -0.7, 3.5, -0.65);   // at the end of the hall, the way the vigil waits for you
      await until(page, () => window.__game.P.mode === 'cine', null, 60e3);
      await until(page, () => { const g = window.__game; return g.P.mode === 'bunk' && !g.F.cutscene && !g.F.script; }, null, 150e3);
      const e = await page.evaluate(() => { const g = window.__game; return { ok: g.F.objOk, dead: g.F.dead, body: document.body.classList.contains('nightmare'), blackout: g.F.blackout }; });
      ok(e.ok && !e.dead && !e.body, `after the vigil: ${JSON.stringify(e)}`);
      ok(model.length === 0 || model.every((s) => s === 200), `grandpa.glb answered ${model}`);
      clean(w);
      return `vigil plays through to the bunk (grandpa rig: ${g.bones} bones)`;
    }), 360e3);

    // ---------- 15: each nightmare, driven through its own trigger ----------
    await check(15, 'nightmares', () => alone(browser, async (c) => {
      const { page, w } = await nightPage(c, '#night5&type=hunted');
      await page.evaluate(() => { window.__game.nights.director.stop(); });
      const begin = async (kind) => {
        await climbDown(page);
        await page.evaluate((k) => { const g = window.__game; g.F.nmDone = false; window.__nmDone = false; g.nights.D.nightmare(k).then(() => { window.__nmDone = true; }); }, kind);
        await sleep(500);
      };
      const finish = async (kind) => {
        const t0 = Date.now();
        await until(page, () => window.__nmDone, null, 120e3);
        const e = await page.evaluate(() => { const g = window.__game; return { mode: g.P.mode, script: g.F.script, cut: g.F.cutscene, body: document.body.classList.contains('nightmare'), dead: g.F.dead, live: g.F.live }; });
        ok(e.mode === 'bunk' && !e.script && !e.cut && !e.body && !e.dead && e.live, `${kind} ended in a bad state: ${JSON.stringify(e)}`);
        return ((Date.now() - t0) / 1000).toFixed(0);
      };
      const times = {};
      await begin('shadow');   // it stands in the darkest corner of the living room: go up to it
      const sp = await page.evaluate(() => { let r = null; window.__game.W.house.children.forEach((o) => { if (o.userData && o.userData.mat && o.visible) r = [o.position.x, o.position.z]; }); return r; });
      ok(sp, 'no shadow figure in the living room');
      await stand(page, sp[0] - 0.6, sp[1] + 0.2); times.shadow = await finish('shadow');
      await begin('hall');   // the hall turns you round three times, the fourth it ends
      for (let i = 0; i < 4; i++) { await stand(page, 3.8, -0.9); await sleep(900); }
      times.hall = await finish('hall');
      await begin('basement');   // down in the laundry
      await stand(page, -7.0, 0.5, undefined, undefined, -2.4); times.basement = await finish('basement');
      await begin('mirror');   // at the bathroom mirror, then moving
      await stand(page, 4.2, 0.9); await sleep(500); await hold(page, 'KeyS', 1500); times.mirror = await finish('mirror');
      clean(w);
      return `all four end awake in the bunk (${Object.entries(times).map(([k, v]) => `${k} ${v} s`).join(', ')})`;
    }), 420e3);

    // ---------- 16: the garage breaker objective ----------
    await check(16, 'garage breaker', () => alone(browser, async (c) => {
      const { page, w } = await nightPage(c, '#night3&type=blackout', { clock: 6 });
      await climbDown(page);
      await until(page, () => /breaker/.test(document.getElementById('objective').textContent), null, 150e3);
      const o = await page.evaluate(() => { const g = window.__game; return { shown: document.getElementById('objective').classList.contains('show'), blackout: g.F.blackout, ok: g.F.objOk, text: document.getElementById('objective').textContent }; });
      ok(o.shown && o.blackout && !o.ok, `the blackout objective: ${JSON.stringify(o)}`);
      ok(/detached garage/.test(o.text), `objective text "${o.text}"`);
      await stand(page, -9.68, -8.0, -9.68, -7.1);   // inside the garage, facing the panel by the side door
      await sleep(500);
      ok((await prompt(page)) === 'E Flip the breaker', `prompt "${await prompt(page)}"`);
      await page.keyboard.press('KeyE');
      await until(page, () => window.__game.F.objOk, null, 30e3);
      await until(page, () => !window.__game.F.blackout, null, 10e3);
      await sleep(3200);
      const a = await page.evaluate(() => { const g = window.__game; return { shown: document.getElementById('objective').classList.contains('show'), blackout: g.F.blackout, ok: g.F.objOk, hunter: g.nights.hunter.state }; });
      ok(a.ok && !a.blackout && !a.shown, `after the breaker: ${JSON.stringify(a)}`);
      clean(w);
      return `the breaker brings the lights back (hunter ${a.hunter})`;
    }), 300e3);

    // ---------- 17: the back door, the basement door and the parents' door ----------
    await check(17, 'doors', () => alone(browser, async (c) => {
      const { page, w } = await nightPage(c, '#night3&type=hunted');
      await page.evaluate(() => { window.__game.nights.director.stop(); });
      await climbDown(page);
      const door = (n) => page.evaluate((n) => { const d = window.__game.W.doors[n]; return { target: d.target, a: d.a, on: d.col.on }; }, n);
      // the parents' door is locked at night: the handle does not turn, and you cannot walk through it
      await stand(page, 7.5, -0.9, 7.5, -1.5); await sleep(400);
      ok((await prompt(page)) === 'E Try the handle', `parents' door prompt "${await prompt(page)}"`);
      await page.keyboard.press('KeyE'); await sleep(500);
      await hold(page, 'KeyW', 2500);
      let d = await door('parents'), z = await page.evaluate(() => window.__game.P.pos.z);
      ok(d.target === 0 && d.a === 0 && d.on && z > -1.4, `the parents' door at night: ${JSON.stringify(d)}, z ${z}`);
      // the back door opens, and you walk out through it onto the stoop
      await stand(page, -2.3, 3.0, -2.3, 3.6); await sleep(400);
      ok((await prompt(page)) === 'E Open the door', `back door prompt "${await prompt(page)}"`);
      await page.keyboard.press('KeyE');
      await until(page, () => window.__game.W.doors.back.a === 1, null, 10e3);
      d = await door('back'); ok(d.target === 1 && !d.on, `back door: ${JSON.stringify(d)}`);
      await hold(page, 'KeyW', 1800);
      z = await page.evaluate(() => window.__game.P.pos.z);
      ok(z > 4.2, `walking through the open back door reached only z ${z.toFixed(2)}`);
      // from the stoop west down the outside stairs to the foot, then the basement door
      await stand(page, -2.3, 5.0, -4.3, 4.2);
      await hold(page, 'KeyW', 3600);
      const f = await page.evaluate(() => ({ x: window.__game.P.pos.x, y: window.__game.P.pos.y }));
      ok(f.y < -2.2 && f.x < -6.5, `the outside stairs: ${JSON.stringify(f)}`);
      await page.evaluate(() => { window.__game.P.yaw = 0; window.__game.P.pitch = 0; }); await sleep(500);
      ok((await prompt(page)) === 'E Open the door', `basement door prompt "${await prompt(page)}"`);
      await page.keyboard.press('KeyE');
      await until(page, () => window.__game.W.doors.basement.a === 1, null, 10e3);
      await hold(page, 'KeyW', 1800);
      const p = await page.evaluate(() => ({ x: window.__game.P.pos.x, y: window.__game.P.pos.y, z: window.__game.P.pos.z }));
      const room = await roomAt(page, p.x, p.z, p.y);
      ok(room === 'laundry' && p.z < 3.3, `through the basement door: ${JSON.stringify(p)} in ${room}`);
      clean(w);
      return `parents' door stays shut; back door to z ${z.toFixed(1)}, stairs down to y ${f.y.toFixed(1)}, into the ${room}`;
    }), 300e3);

    // ---------- 18: brightness changes the exposure ----------
    await check(18, 'brightness', () => alone(browser, async (c) => {
      const { page, w } = await openGame(c, '/index.html');
      const exposure = () => page.evaluate(() => window.__game.renderer.toneMappingExposure);
      const e0 = await exposure();
      await page.click('#title-menu [data-entry="options"]');
      await until(page, () => !document.getElementById('menu').classList.contains('hidden'), null, 10e3);
      const arrow = (dir) => page.click(`#menu [data-entry="brightness"] .ma[aria-label="${dir}"]`);
      for (let i = 0; i < 5; i++) await arrow('More');
      const up = await page.evaluate(() => window.__game.settings.get('brightness')), e1 = await exposure();
      ok(Math.abs(up - 0.5) < 0.01 && Math.abs(e1 / e0 - 2 ** up) < 0.01, `brightness ${up}: exposure ${e0} -> ${e1}, expected x${(2 ** up).toFixed(3)}`);
      for (let i = 0; i < 10; i++) await arrow('Less');
      const down = await page.evaluate(() => window.__game.settings.get('brightness')), e2 = await exposure();
      ok(Math.abs(down + 0.5) < 0.01 && Math.abs(e2 / e0 - 2 ** down) < 0.01 && e2 < e0 && e0 < e1, `brightness ${down}: exposure ${e2}`);
      const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('topbunk.settings') || '{}').brightness);
      ok(Math.abs(stored - down) < 0.01, `topbunk.settings.brightness is ${stored}`);
      await page.reload({ waitUntil: 'load', timeout: 180e3 });
      await until(page, () => window.__game && document.getElementById('loading').classList.contains('done'), null, 180e3);
      const e3 = await exposure();
      ok(Math.abs(e3 - e2) < 0.01, `after a reload exposure is ${e3}, expected ${e2}`);
      clean(w);
      return `exposure ${e0.toFixed(2)} -> ${e1.toFixed(2)} up, ${e2.toFixed(2)} down; ${e3.toFixed(2)} after a reload`;
    }), 240e3);

    // ---------- 19: a typed seed starts a run ----------
    await check(19, 'typed seed', () => alone(browser, async (c) => {
      const { page, w } = await openGame(c, '/index.html');
      await page.evaluate(() => { window.__game.renderer.compileAsync = async () => {}; });
      await page.click('#title-menu [data-entry="new"]');
      await until(page, () => window.__game.menu.state.open.join() === 'title,newgame', null, 10e3);
      const field = '#menu [data-entry="seed"] input';
      await page.click(field); await page.fill(field, 'k7qx29md');
      const typed = await page.inputValue(field);
      ok(typed === 'K7QX-29MD', `the seed field shows "${typed}"`);
      await page.click('#menu [data-entry="start"]');
      await until(page, () => window.__game.F.stage === 'day', null, 240e3);
      const r = await page.evaluate(() => { window.__game.setPause(true); const g = window.__game; return { seed: g.RUN.seed, info: document.getElementById('pauseinfo').textContent, plan: [2, 3, 4].map((n) => g.nights.plan(n).type) }; });
      ok(r.seed === 'K7QX-29MD' && r.info.includes('K7QX-29MD'), `the run is on seed ${r.seed}; pause says "${r.info}"`);
      // the same seed plans the same nights, in a page of its own
      const o = await openGame(c, '/index.html#seed=K7QX-29MD&night=2');
      const again = await o.page.evaluate(() => [2, 3, 4].map((n) => window.__game.nights.plan(n).type));
      ok(again.join() === r.plan.join(), `seed K7QX-29MD plans ${r.plan} here and ${again} again`);
      clean(w); clean(o.w);
      return `typed seed ${typed} replays as ${r.seed}, nights 2-4: ${r.plan.join(', ')}`;
    }), 300e3);

    await browser.close();
    server.close();
  }

  // ---------- 9: the desktop shell ----------
  await check(9, 'desktop', async () => {
    let electron = null;
    try { electron = require.resolve('electron', { paths: [ROOT] }); } catch (e) { /* not installed */ }
    if (!electron || !fs.existsSync(path.join(ROOT, 'node_modules', 'electron'))) throw new Skip('node_modules/electron is not installed (npm install), so the desktop shell was not started');
    const out = await new Promise((resolve) => {
      const child = spawn(process.execPath, [path.join(ROOT, 'desktop', 'smoke.js')], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
      let s = ''; child.stdout.on('data', (d) => { s += d; }); child.stderr.on('data', () => {});
      child.on('exit', (code) => resolve({ code, s }));
    });
    const line = (out.s.match(/^SMOKE_(OK|FAIL)\b.*$/m) || [''])[0];
    ok(out.code === 0 && /^SMOKE_OK/.test(line), line || `desktop/smoke.js exited ${out.code} without a verdict`);
    return line;
  }, 200e3);

  const fail = results.filter((r) => r.status === 'FAIL').length, skip = results.filter((r) => r.status === 'SKIP').length;
  console.log(`${fail ? 'FAIL' : 'PASS'} smoke: ${results.length - fail - skip} passed, ${fail} failed, ${skip} skipped`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log(`FAIL smoke: ${e.stack || e}`); process.exit(1); });
