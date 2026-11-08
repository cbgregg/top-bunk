#!/usr/bin/env node
'use strict';
// The story's tests: a loader over tests/story/*.js. Each file there is one section and exports
//   { name, run(browser, helpers), timeout?, browser? }
// run gets a Chromium of its own (closed after it) and the same helpers tests/smoke.js hands its per-package checks (alone, openGame,
// nightPage, stand, hold, tap, until, playFor, prompt, climbDown, ok, sleep, clean, watch, Skip, roomAt, newContext, PAD, base). It
// returns a line saying what it showed, throws to fail, or throws helpers.Skip to skip. A section that exports browser: false runs with
// no browser (run(null, helpers)). The sections run in file order; one PASS / FAIL / SKIP line each, exit 1 on any FAIL.
//   node tests/story.js [--port N] [--only stance,composer] [--list] [--dir <folder of sections>]
// The sections are the story's own (stance.js: the stance and the night types, the save) and those of the packages that write to it (the
// morning composer, the spine, the endings), each in a file of its own so no two of them edit the same one.
// Needs Playwright's Chromium (`npm install`, then `npx playwright install chromium`). The pages draw nothing (window.__norender).
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const serve = require('../desktop/static');

const ROOT = path.join(__dirname, '..');
const ARGV = process.argv.slice(2);
const opt = (name, def) => { const i = ARGV.indexOf(name); return i >= 0 && ARGV[i + 1] !== undefined ? ARGV[i + 1] : def; };
const PORT = +opt('--port', process.env.SMOKE_PORT || 0);
const DIR = path.resolve(opt('--dir', path.join(__dirname, 'story')));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- the sections ----------
const SECTIONS = (() => {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR).filter((f) => /\.js$/.test(f)).sort().map((f) => {
    const file = path.join(DIR, f), base = f.replace(/\.js$/, '');
    try {
      const mod = require(file);
      if (!mod || typeof mod.run !== 'function') return { name: (mod && mod.name) || base, file: f, error: `${f} exports no run(browser, helpers)` };
      return { name: typeof mod.name === 'string' && mod.name ? mod.name : base, file: f, mod };
    } catch (e) { return { name: base, file: f, error: `${f} did not load: ${String((e && e.message) || e).split('\n')[0]}` }; }
  });
})();
if (ARGV.includes('--list')) { for (const s of SECTIONS) console.log(`${s.name}\t${s.file}${s.error ? '\t(' + s.error + ')' : ''}`); process.exit(0); }
const ONLY = opt('--only', '') ? opt('--only', '').split(',').map((t) => t.trim()).filter(Boolean) : null;
if (ONLY) {
  const unknown = ONLY.filter((n) => !SECTIONS.some((s) => s.name === n));
  if (unknown.length) { console.error(`--only: no section named ${unknown.join(', ')} (the sections: ${SECTIONS.map((s) => s.name).join(', ') || 'none'})`); process.exit(2); }
}
const chosen = SECTIONS.filter((s) => !ONLY || ONLY.includes(s.name));

// ---------- results ----------
const results = [];
class Skip extends Error {}
function ok(cond, msg) { if (!cond) throw new Error(msg); }
function within(ms, p, what) { let t; return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`timed out after ${ms / 1000} s: ${what}`)), ms); })]).finally(() => clearTimeout(t)); }
async function section(name, fn, ms) {
  const t0 = Date.now(); let status = 'PASS', detail = '';
  try { detail = (await within(ms, Promise.resolve().then(fn), name)) || ''; } catch (e) { status = e instanceof Skip ? 'SKIP' : 'FAIL'; detail = String((e && e.message) || e).split('\n')[0]; }
  results.push({ name, status });
  console.log(`${status} ${name}: ${detail}${detail ? ' ' : ''}(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}

// ---------- the server: the repo root, as the desktop shell serves it (desktop/static.js) ----------
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

// ---------- the helpers, as tests/smoke.js has them ----------
const LOCAL = new Set(['127.0.0.1', 'localhost']);
const IGNORE = [/Ignored attempt to cancel a touchstart event/];   // chromium's touch emulation says this on its own
const GAME_WARNINGS = /\b(nightmare|night type|grandpa model|morning composer) failed/;   // the game catches these and warns instead of throwing
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
const problems = (w) => [...w.errors.map((s) => `page error: ${s}`), ...w.console.map((s) => `console error: ${s}`), ...w.failed.map((s) => `request failed: ${s}`), ...w.bad.map((s) => `HTTP ${s}`), ...((w.ctx && w.ctx.blocked) || []).map((s) => `tried the network: ${s}`)];
const clean = (w) => { const p = problems(w); ok(p.length === 0, `${p.length} problem(s): ${p.slice(0, 3).join(' | ')}`); };
const PAD = () => {
  window.__pad = { connected: true, id: 'story pad', index: 0, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  navigator.getGamepads = () => [window.__pad];
};
async function openGame(ctx, url, { render = false, clock = 0, pad = false } = {}) {
  const page = await ctx.newPage(), w = watch(page, ctx), t0 = Date.now();
  if (!render) await page.addInitScript(() => { window.__norender = true; });
  if (clock) await page.addInitScript((m) => { window.__clockMul = m; }, clock);
  if (pad) await page.addInitScript(PAD);
  await page.goto(BASE + url, { waitUntil: 'load', timeout: 180e3 });
  await page.waitForFunction(() => window.__game && document.getElementById('loading').classList.contains('done'), null, { timeout: 180e3, polling: 250 });
  return { page, w, readyIn: (Date.now() - t0) / 1000 };
}
const until = (page, fn, arg, ms = 120e3) => page.waitForFunction(fn, arg, { timeout: ms, polling: 200 });
async function playFor(page, s, ms = 240e3) {
  const t0 = await page.evaluate(() => window.__game.gameTime);
  await until(page, (t) => window.__game.gameTime >= t, t0 + s, ms);
  return t0;
}
async function nightPage(ctx, hash, opts = {}) {
  const A = await openGame(ctx, '/index.html' + hash, opts), n = hash.match(/night(\d+)/)[1];
  await A.page.evaluate(() => { const g = window.__game; g.renderer.compileAsync = async () => {}; g.startGame(); });
  await until(A.page, (n) => window.__game.F.stage === 'n' + n && window.__game.F.live, n, 240e3);
  return A;
}
async function climbDown(page) {
  await until(page, () => { const g = window.__game; return g.P.mode === 'bunk' && !g.F.cutscene && !g.F.script; }, null, 60e3);
  await page.keyboard.press('KeyE');
  await until(page, () => { const g = window.__game; return g.P.mode === 'walk' && !g.F.cutscene; }, null, 60e3);
}
const stand = (page, x, z, tx, tz, y = 0) => page.evaluate(([x, z, tx, tz, y]) => {
  const g = window.__game; g.P.pos.set(x, y, z); g.P.vel.set(0, 0, 0);
  if (tx !== undefined) { g.P.yaw = Math.atan2(-(tx - x), -(tz - z)); g.P.pitch = 0; }
}, [x, z, tx, tz, y]);
const hold = async (page, key, ms) => { await page.keyboard.down(key); await sleep(ms); await page.keyboard.up(key); };
const tap = async (page, i) => {
  await page.evaluate((i) => { window.__pad.buttons[i].pressed = true; }, i); await sleep(150);
  await page.evaluate((i) => { window.__pad.buttons[i].pressed = false; }, i); await sleep(150);
};
const prompt = (page) => page.evaluate(() => document.getElementById('prompt').textContent.replace(/\s+/g, ' ').trim());
const roomAt = (page, x, z, y) => page.evaluate(async ([x, z, y]) => (await import('/js/world.js')).roomAt(x, z, y), [x, z, y]);
async function alone(browser, fn, opts) { const c = await newContext(browser, opts); try { return await fn(c); } finally { await c.close(); } }
const helpers = { alone, openGame, nightPage, stand, hold, tap, until, playFor, prompt, climbDown, ok, sleep, clean, watch, Skip, roomAt, newContext, PAD, base: () => BASE };

(async () => {
  if (!chosen.length) { console.log(`PASS story: no sections in ${path.relative(ROOT, DIR) || DIR}`); process.exit(0); }
  let chromium = null;
  try { ({ chromium } = require('playwright')); } catch (e) { /* reported per section */ }
  const server = await startServer();
  BASE = `http://127.0.0.1:${server.address().port}`;
  const launch = () => chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  for (const s of chosen) {
    if (s.error) { await section(s.name, () => { throw new Error(s.error); }, 10e3); continue; }
    const needs = s.mod.browser !== false;
    await section(s.name, async () => {
      if (!needs) return s.mod.run(null, helpers);
      if (!chromium) throw new Error('Playwright is not installed (npm install && npx playwright install chromium)');
      const b = await launch();
      try { return await s.mod.run(b, helpers); } finally { await b.close().catch(() => {}); }
    }, s.mod.timeout || 900e3);
  }
  server.close();
  const fail = results.filter((r) => r.status === 'FAIL').length, skip = results.filter((r) => r.status === 'SKIP').length;
  console.log(`${fail ? 'FAIL' : 'PASS'} story: ${results.length - fail - skip} passed, ${fail} failed, ${skip} skipped`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log(`FAIL story: ${(e && e.stack) || e}`); process.exit(1); });
