#!/usr/bin/env node
'use strict';
// The pure moves out of js/main.js, checked line for line: js/day.js holds moving day's code and js/breakfast.js the mornings' as they were
// in main.js at the revision before the move, and main.js changed nowhere else (the moved lines gone, the two import lines and the two
// bind() calls in boot() added, window.__game the same line). In plain Node; with --port the browser half runs too: the old scripts
// (main.js and every file in js/ as they were at that revision, served in place of the new ones) and the new ones play moving day and the
// first morning on the same seed, the same random numbers and the same game clock, stepped a frame at a time, and every sample of the
// family, the player, the props, the colliders and the prompts must be the same; window.__game has the same keys in the same order.
//   node tests/moves.js [--base <git revision>] [--port <n>] [--keep <dir>]
// --base is the commit the move was made from (default: the one it was made from); --keep writes both traces there.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const ARGV = process.argv.slice(2);
const opt = (name, def = '') => { const i = ARGV.indexOf(name); return i >= 0 && ARGV[i + 1] !== undefined ? ARGV[i + 1] : def; };
const BASE = opt('--base', '6bb899da136db266a96b2999957029126c795bc9');
const PORT = +opt('--port', 0);
const KEEP = opt('--keep', '');

let passed = 0, failed = 0;
function test(name, fn) {
  try { const d = fn(); passed++; console.log(`  ok   ${name}${d ? ': ' + d : ''}`); }
  catch (e) { failed++; console.log(`  FAIL ${name}\n       ${String((e && e.message) || e).split('\n').join('\n       ')}`); }
}
function ok(cond, msg) { if (!cond) throw new Error(msg); }
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
function gitShow(rel) {
  const r = spawnSync('git', ['show', `${BASE}:${rel}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`git show ${BASE}:${rel}: ${(r.stderr || '').trim()}`);
  return r.stdout;
}

// ---------- the text, in top-level units ----------
// A unit is a statement that starts at the left margin, with every indented line and closing bracket after it (a blank line inside a
// function belongs to it); a comment at the margin and a blank line between statements are units of their own.
function units(lines, offset = 0) {
  const out = []; let cur = null;
  const close = () => { cur = null; };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^[}\])]/.test(l) && cur) cur.lines.push(l);
    else if (/^\s+\S/.test(l) && cur) cur.lines.push(l);
    else if (l.trim() === '') {
      let j = i + 1; while (j < lines.length && lines[j].trim() === '') j++;
      if (cur && j < lines.length && /^(\s+\S|[}\])])/.test(lines[j])) cur.lines.push(l);
      else { close(); out.push({ kind: 'blank', at: i + offset, lines: [l] }); }
    } else if (/^\/\//.test(l)) { close(); out.push({ kind: 'comment', at: i + offset, lines: [l] }); }
    else { cur = { kind: 'code', at: i + offset, lines: [l] }; out.push(cur); }
  }
  for (const u of out) u.end = u.at + u.lines.length - 1;
  return out;
}
const squash = (s) => s.replace(/\s+/g, ' ').trim();
// main.js's own variables that change under the moved code: there, they are read and set through the getters bind() is given
const LIVE = ['gameTime', 'waiters', 'uiMode', 'nlBase', 'lieYaw'];
const LIVE_RE = new RegExp(`\\bmain\\.(${LIVE.join('|')})\\b`, 'g');

// ---------- the old main.js: the two regions and what stays ----------
const oldMain = gitShow('js/main.js').split('\n');
const newMain = read('js/main.js').split('\n');
const OLD = units(oldMain);
const firstCode = (re) => { const u = OLD.find((x) => x.kind === 'code' && re.test(x.lines[0])); if (!u) throw new Error(`not in ${BASE}:js/main.js: ${re}`); return u; };
// moving day: from the chores' state to Mom's camera; the mornings: from faceParent to the photos on the table
const REGIONS = {
  day: [firstCode(/^const chore = /).at, firstCode(/^async function cameraGift\(/).end],
  breakfast: [firstCode(/^function faceParent\(/).at, firstCode(/^async function photoBeat\(/).end],
};
// what stays in main.js, though it sits inside the day's lines (design: walkTo, the knob, the cartoon, the lying yaw, the ramp)
const STAYS = [/^const rampY = /, /^async function walkTo\(/, /^const cartoon = createCartoon\(/, /^const LIE = /, /^let lieYaw = /, /^function knobOf\(/, /^function atKnob\(/];
const regionOf = (u) => Object.keys(REGIONS).find((k) => u.at >= REGIONS[k][0] && u.end <= REGIONS[k][1]);
const MOVED = OLD.filter((u) => u.kind === 'code' && regionOf(u) && !STAYS.some((re) => re.test(u.lines[0])));
const KEPT = OLD.filter((u) => u.kind === 'code' && regionOf(u) && STAYS.some((re) => re.test(u.lines[0])));
const FILES = { day: 'js/day.js', breakfast: 'js/breakfast.js' };

// ---------- the new modules: their top-level units and the units of their bind() ----------
function moduleUnits(rel) {
  const lines = read(rel).split('\n'), top = units(lines);
  const bind = top.find((u) => u.kind === 'code' && /^export function bind\(game\) \{/.test(u.lines[0]));
  let inner = [];
  if (bind) {
    const body = bind.lines.slice(1, -1).map((l) => l.replace(/^ {2}/, ''));
    inner = units(body, bind.at + 1).map((u) => ({ ...u, inBind: true }));
  }
  return { lines, top, bind, inner };
}
const MODS = { day: moduleUnits(FILES.day), breakfast: moduleUnits(FILES.breakfast) };
// a unit as compared: the export keyword off, main.js's live variables back to their plain names, the whitespace squashed; a statement
// in bind() is the old top-level one without its const (it needs the world, so it is set when bind runs)
function normNew(u) {
  let text = u.lines.join('\n'), subs = 0;
  text = text.replace(/^export /, '');
  text = text.replace(LIVE_RE, (m, name) => { subs++; return name; });
  return { text: squash(text), subs };
}
const normOld = (u, inBind) => squash(u.lines.join('\n').replace(inBind ? /^const / : /^$/, ''));

console.log(`\nthe moved code against ${BASE.slice(0, 10)}:js/main.js`);
test('the two regions are where the move took them from', () => {
  for (const k of Object.keys(REGIONS)) ok(REGIONS[k][1] > REGIONS[k][0], `${k} region is empty`);
  ok(KEPT.length === STAYS.length, `found ${KEPT.length} of the ${STAYS.length} statements that stay: ${KEPT.map((u) => u.lines[0].slice(0, 30)).join(' | ')}`);
  return `day ${REGIONS.day[0] + 1}-${REGIONS.day[1] + 1}, breakfast ${REGIONS.breakfast[0] + 1}-${REGIONS.breakfast[1] + 1}; ${MOVED.length} statements move, ${KEPT.length} stay`;
});
const used = { day: new Set(), breakfast: new Set() }, subsBy = [];
for (const k of Object.keys(FILES)) {
  test(`every statement of the ${k} region is in ${FILES[k]}, byte for byte (whitespace and export aside)`, () => {
    const mine = MOVED.filter((u) => regionOf(u) === k), cands = [...MODS[k].top, ...MODS[k].inner].filter((u) => u.kind === 'code');
    const missing = [];
    for (const u of mine) {
      const hit = cands.find((c) => !used[k].has(c) && normNew(c).text === normOld(u, !!c.inBind));
      if (!hit) { missing.push(u); continue; }
      used[k].add(hit);
      const s = normNew(hit).subs; if (s) subsBy.push(`${u.lines[0].match(/[\w$]+(?=\()|(?<=^(?:const|let) )[\w$]+/)?.[0] || u.lines[0].slice(0, 20)} ${s}`);
    }
    if (missing.length) {
      const u = missing[0], name = (u.lines[0].match(/(?:function|const|let)\s+([\w$]+)/) || [])[1] || u.lines[0].slice(0, 40);
      const like = (c) => c.lines[0].includes(name) || (name.length > 8 && c.lines.join(' ').includes(name));
      const near = cands.find((c) => !used[k].has(c) && !/^(export )?let /.test(c.lines[0]) && like(c)) || cands.find(like);
      throw new Error(`${missing.length} not found; the first, ${BASE.slice(0, 7)} line ${u.at + 1}:\n  was: ${normOld(u, !!(near && near.inBind)).slice(0, 400)}\n  now: ${near ? normNew(near).text.slice(0, 400) : '(nothing like it)'}`);
    }
    return `${mine.length} statements (${mine.filter((u) => /^(async )?function /.test(u.lines[0])).length} functions), ${[...used[k]].filter((c) => c.inBind).length} of them in bind()`;
  });
  test(`${FILES[k]} adds nothing of its own but the imports, the declarations of what it is handed, bind(), install() and tick()`, () => {
    const extra = MODS[k].top.filter((u) => u.kind === 'code' && !used[k].has(u)).filter((u) => !(
      /^import \{ [\w$, ]+ \} from '\.\/(day|breakfast)\.js';$/.test(u.lines[0]) && u.lines.length === 1 ||
      /^(export )?let [\w$, ]+;(\s+\/\/.*)?$/.test(u.lines[0]) && u.lines.length === 1 ||
      /^let main = null;$/.test(u.lines[0]) ||
      u === MODS[k].bind ||
      /^export function (install\(game\)|tick\(dt\)) \{\}$/.test(u.lines[0])));
    ok(!extra.length, `new code at line ${extra[0] && extra[0].at + 1}: ${extra[0] && extra[0].lines[0].slice(0, 120)}`);
    const innerExtra = MODS[k].inner.filter((u) => u.kind === 'code' && !used[k].has(u)).filter((u) => !/^main = game;$/.test(u.lines[0]) && !/^\(\{ [\w$, \n]+ \} = game\);$/.test(u.lines.join(' ').replace(/\s+/g, ' ')));
    ok(!innerExtra.length, `new code in bind() at line ${innerExtra[0] && innerExtra[0].at + 1}: ${innerExtra[0] && innerExtra[0].lines[0].slice(0, 120)}`);
  });
  test(`the comments of the ${k} region came with it`, () => {
    const have = new Set(MODS[k].lines.map((l) => l.trim()));
    const lost = OLD.filter((u) => u.kind === 'comment' && regionOf(u) === k && !newMain.includes(u.lines[0]) && !have.has(u.lines[0].trim()));
    ok(!lost.length, `${lost.length} lost, the first at ${BASE.slice(0, 7)} line ${lost[0] && lost[0].at + 1}: ${lost[0] && lost[0].lines[0]}`);
  });
}
test(`the only change inside the moved code: main.js's live variables (${LIVE.join(', ')}) read as main.<name>`, () => {
  for (const k of Object.keys(FILES)) {
    const other = MODS[k].lines.join('\n').match(/\bmain\.(?!js\b)[\w$]+/g) || [];
    const bad = other.filter((m) => !LIVE.includes(m.slice(5)));
    ok(!bad.length, `${FILES[k]} reads ${bad.join(', ')} through main`);
    // and none of them is left bare in the code, where it would be a name the module does not have (the comments aside)
    const bare = MODS[k].lines.map((l) => l.replace(/(^|\s)\/\/.*$/, '')).join('\n').match(new RegExp(`(?<![\\w$.])(${LIVE.join('|')})(?![\\w$])`, 'g')) || [];
    ok(!bare.length, `${FILES[k]} reads ${bare.join(', ')} bare`);
  }
  return subsBy.join(', ');
});
// with a parser at hand (acorn and eslint-scope, when installed): every name the two modules read is their own, imported, or the
// browser's, so none of the moved code can reach a name main.js kept to itself
let acorn = null, escope = null;
try { acorn = require('acorn'); escope = require('eslint-scope'); } catch (e) { /* not installed: skipped */ }
const GLOBALS = new Set(['Math', 'Promise', 'Infinity', 'NaN', 'undefined', 'window', 'document', 'Object', 'Array', 'JSON', 'Number', 'String', 'Boolean', 'Map', 'Set', 'console', 'setTimeout', 'clearTimeout', 'performance']);
for (const k of Object.keys(FILES)) {
  if (!acorn || !escope) { console.log(`  skip every name ${FILES[k]} reads is its own (acorn and eslint-scope are not installed)`); continue; }
  test(`every name ${FILES[k]} reads is its own, imported, or the browser's`, () => {
    const ast = acorn.parse(read(FILES[k]), { ecmaVersion: 'latest', sourceType: 'module', ranges: true, locations: true });
    const mod = escope.analyze(ast, { ecmaVersion: 2022, sourceType: 'module' }).scopes.find((s) => s.type === 'module');
    const free = [...new Set(mod.through.map((r) => r.identifier.name))], bad = free.filter((n) => !GLOBALS.has(n));
    ok(!bad.length, `reads names it does not have: ${bad.join(' ')}`);
    // a name it is handed and never reads would only mean the bind list is longer than it needs to be: reported, not failed
    const idle = mod.variables.filter((v) => v.defs[0] && v.defs[0].type === 'Variable' && v.defs[0].parent.kind === 'let' && !v.references.some((r) => r.isRead())).map((v) => v.name);
    return `${mod.variables.length} names of its own, the browser's ${free.join(' ')}${idle.length ? `; handed but never read: ${idle.join(' ')}` : ''}`;
  });
}

// ---------- what each module is handed: main.js's bind call against the names the module declares ----------
function bindCall(fn) {
  const i = newMain.findIndex((l) => l.startsWith(`  ${fn}({`)); ok(i >= 0, `no ${fn}({ in main.js`);
  let j = i; while (j < newMain.length && !/\} \}\);$|\}\);$/.test(newMain[j])) j++;
  return { at: i, end: j, text: newMain.slice(i, j + 1).join(' ') };
}
const BINDS = { day: bindCall('bindDay'), breakfast: bindCall('bindBreakfast') };
for (const k of Object.keys(FILES)) test(`main.js hands ${FILES[k]} exactly the names it declares, each by its own name, and a getter for each live variable it reads`, () => {
  const call = BINDS[k].text, getters = [...call.matchAll(/\bget ([\w$]+)\(\) \{ return \1; \}/g)].map((m) => m[1]), setters = [...call.matchAll(/\bset ([\w$]+)\(v\) \{ \1 = v; \}/g)].map((m) => m[1]);
  const plain = call.replace(/^\s*\w+\(\{/, '').replace(/\}\);$/, '').replace(/\b(get|set) [\w$]+\([^)]*\) \{[^}]*\}/g, '').split(',').map((s) => s.trim()).filter(Boolean);
  ok(plain.every((s) => /^[\w$]+$/.test(s)), `not every name is handed over as itself: ${plain.filter((s) => !/^[\w$]+$/.test(s)).join(' | ')}`);
  const destr = squash(MODS[k].inner.filter((u) => u.kind === 'code').map((u) => u.lines.join(' ')).find((t) => /^\(\{/.test(t)) || '');
  const taken = destr.replace(/^\(\{/, '').replace(/\} = game\);$/, '').split(',').map((s) => s.trim()).filter(Boolean);
  const declared = MODS[k].top.filter((u) => u.kind === 'code' && /^let (?!main\b)[\w$, ]+;/.test(u.lines[0]) && u.at < MODS[k].bind.at).flatMap((u) => u.lines[0].replace(/^let /, '').replace(/;.*$/, '').split(',').map((s) => s.trim()));
  const handed = new Set(plain), take = new Set(taken);
  const diff = (a, b) => [...a].filter((x) => !b.has(x));
  ok(!diff(handed, take).length && !diff(take, handed).length, `handed but not taken: ${diff(handed, take).join(' ') || '-'}; taken but not handed: ${diff(take, handed).join(' ') || '-'}`);
  const decl = new Set(declared), set = MODS[k].inner.filter((u) => u.kind === 'code' && used[k].has(u)).flatMap((u) => [...u.lines.join(' ').matchAll(/(?:^|, )([\w$]+) = /g)].map((m) => m[1]));
  for (const n of set) decl.delete(n);   // the world's places, assigned in bind() (declared in their own let)
  ok(!diff(take, decl).length && !diff(decl, take).length, `taken but not declared: ${diff(take, decl).join(' ') || '-'}; declared but never handed: ${diff(decl, take).join(' ') || '-'}`);
  const reads = new Set([...MODS[k].lines.join('\n').matchAll(LIVE_RE)].map((m) => m[1])), writes = new Set([...MODS[k].lines.join('\n').matchAll(/\bmain\.([\w$]+) = /g)].map((m) => m[1]));
  ok(diff(reads, new Set(getters)).length === 0, `read without a getter: ${diff(reads, new Set(getters)).join(' ')}`);
  ok(diff(writes, new Set(setters)).length === 0, `set without a setter: ${diff(writes, new Set(setters)).join(' ')}`);
  return `${handed.size} names, getters ${getters.join(' ')}${setters.length ? ', setters ' + setters.join(' ') : ''}`;
});

// ---------- main.js: nothing changed but the deletions, the imports and the two bind calls ----------
test('main.js changed nowhere else: the moved lines gone, two import lines, the two bind() calls in boot() before the modules install', () => {
  const movedLines = new Set(); for (const u of MOVED) for (let i = u.at; i <= u.end; i++) movedLines.add(i);
  const O = oldMain.map((l, i) => ({ l, i })).filter((x) => !movedLines.has(x.i));
  // a comment or a blank line of either region may go with the code it described
  const deletable = O.map((x) => (!!Object.values(REGIONS).find(([a, b]) => x.i >= a && x.i <= b) && (/^\/\//.test(x.l) || x.l.trim() === '')));
  const IMPORTS = [/^import \{ bind as bindDay, [\w$, ]+ \} from '\.\/day\.js';$/, /^import \{ bind as bindBreakfast, [\w$, ]+ \} from '\.\/breakfast\.js';$/];
  const boot = newMain.findIndex((l) => l === 'async function boot() {'), inst = newMain.findIndex((l, i) => i > boot && l.startsWith('  hooks.install({'));
  ok(boot >= 0 && inst > boot, 'boot() or its install line is missing');
  for (const k of Object.keys(BINDS)) ok(BINDS[k].at > boot && BINDS[k].end < inst, `the ${k} bind call is not in boot() before the modules install`);
  const insertable = newMain.map((l, i) => IMPORTS.some((re) => re.test(l)) || Object.values(BINDS).some((b) => i >= b.at && i <= b.end) || (i > boot && i < inst && /^ {2}\/\/ /.test(l) && i === Math.min(...Object.values(BINDS).map((b) => b.at)) - 1));
  ok(IMPORTS.every((re) => newMain.some((l) => re.test(l))), 'an import line is missing');
  // can the old lines (less the moved code) become the new ones by dropping region comments and adding only the allowed lines?
  const n = O.length, m = newMain.length, W = m + 1, can = new Uint8Array((n + 1) * W);
  can[n * W + m] = 1;
  for (let j = m - 1; j >= 0; j--) can[n * W + j] = insertable[j] && can[n * W + j + 1];
  for (let i = n - 1; i >= 0; i--) for (let j = m; j >= 0; j--) {
    can[i * W + j] = (j < m && O[i].l === newMain[j] && can[(i + 1) * W + j + 1]) || (deletable[i] && can[(i + 1) * W + j]) || (j < m && insertable[j] && can[i * W + j + 1]) ? 1 : 0;
  }
  if (!can[0]) {
    // where it goes wrong: walk the longest stretch that still matches
    let i = 0, j = 0;
    while (i < n || j < m) {
      if (j < m && i < n && O[i].l === newMain[j] && can[(i + 1) * W + j + 1]) { i++; j++; }
      else if (i < n && deletable[i] && can[(i + 1) * W + j]) i++;
      else if (j < m && insertable[j] && can[i * W + j + 1]) j++;
      else break;
    }
    let a = 0, b = 0; while (a < n && b < m && O[a].l === newMain[b]) { a++; b++; }
    throw new Error(`differs from ${BASE.slice(0, 7)} first at old line ${O[a] ? O[a].i + 1 : 'end'} / new line ${b + 1}:\n  was: ${O[a] ? O[a].l.slice(0, 160) : ''}\n  now: ${(newMain[b] || '').slice(0, 160)}`);
  }
  const gameLine = oldMain.find((l) => l.startsWith('window.__game = {'));
  ok(gameLine && newMain.includes(gameLine), 'the window.__game line changed');
  return `${movedLines.size} lines moved out, ${oldMain.length - newMain.length + insertable.filter(Boolean).length - movedLines.size} comment and blank lines with them, ${insertable.filter(Boolean).length} lines added`;
});

// ---------- the browser half: the old scripts and the new play the same day and the same morning ----------
async function browserHalf() {
  const http = require('http');
  const { Readable } = require('stream');
  const serve = require(path.join(ROOT, 'desktop', 'static'));
  const { chromium } = require('playwright');
  const OLD_JS = new Map();   // js/ as it was at BASE, served in place of the new files for the old run
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const r = await serve.respond(ROOT, new Request(url.href, { method: req.method, headers: req.headers.range ? { range: req.headers.range } : {} }));
      res.writeHead(r.status, Object.fromEntries(r.headers));
      if (r.body) Readable.fromWeb(r.body).on('error', () => res.destroy()).pipe(res); else res.end();
    } catch (e) { if (!res.headersSent) res.writeHead(500); res.end(String(e)); }
  });
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const oldJs = (rel) => {
    if (!OLD_JS.has(rel)) { const r = spawnSync('git', ['show', `${BASE}:${rel}`], { cwd: ROOT, maxBuffer: 1 << 26 }); OLD_JS.set(rel, r.status === 0 ? r.stdout : null); }
    return OLD_JS.get(rel);
  };
  // the page, with the random numbers seeded, the speech and the samples timed by the text rather than by what has loaded, nothing drawn
  async function open(which, hash) {
    const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
    if (which === 'old') await ctx.route(/\/js\/.*\.js(\?.*)?$/, (route) => {
      const rel = new URL(route.request().url()).pathname.replace(/^\//, ''), body = oldJs(rel);
      if (body === null) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body });
    });
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', (e) => errors.push(String((e && e.stack) || e).split('\n').slice(0, 2).join(' / ')));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.addInitScript(() => {
      window.__norender = true; window.__noCartoon = true;
      let s = 0x9e3779b9; Math.random = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    });
    await page.goto(`http://127.0.0.1:${PORT}/index.html${hash}`, { waitUntil: 'load', timeout: 300e3 });
    await page.waitForFunction(() => window.__game && document.getElementById('loading').classList.contains('done'), null, { timeout: 300e3, polling: 500 });
    await page.waitForFunction(() => { const g = window.__game; return g.mom.rig && g.dad.rig; }, null, { timeout: 300e3, polling: 500 });
    await page.waitForLoadState('networkidle', { timeout: 120e3 }).catch(() => {});
    const keys = await page.evaluate(() => Object.keys(window.__game));
    return { ctx, page, errors, keys };
  }
  // the scenario, in the page: the loop frozen, the clock stepped a sixtieth at a time with a task between steps (so every await in the
  // scripts resumes as it does between frames), a sample every half second
  const drive = (page, plan) => page.evaluate(async (plan) => {
    const g = window.__game, yieldTask = () => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });
    window.__freeze = true;
    g.sfx.say = () => 0; g.sfx.pick = () => 0; g.sfx.envelope = () => null; g.sfx.mumble = () => null;   // speech and samples last as long as their text, loaded or not
    const r6 = (v) => Math.round(v * 1e6) / 1e6;
    const ser = (v, d = 0) => {
      if (v === null || v === undefined || typeof v === 'boolean' || typeof v === 'string') return v;
      if (typeof v === 'number') return r6(v);
      if (typeof v === 'function') return 'fn';
      if (v.isVector3) return [r6(v.x), r6(v.y), r6(v.z)];
      if (v.isObject3D) return { obj: v.type, at: ser(v.position), vis: v.visible };
      if (d > 3) return '...';
      if (Array.isArray(v)) return v.map((x) => ser(x, d + 1));
      const o = {}; for (const k of Object.keys(v).sort()) o[k] = ser(v[k], d + 1); return o;
    };
    const who = (p) => ({ at: ser(p.group.position), yaw: r6(p.group.rotation.y), vis: p.group.visible, busy: !!p.busy, held: !!p.held, walking: r6(p.walking || 0), pose: ser(p.pose), sit: r6(p.sitNow || 0), seatAt: ser(p.seatAt) });
    const text = (id) => (document.getElementById(id)?.textContent || '').replace(/\s+/g, ' ').trim();
    const sample = () => ({
      t: r6(g.gameTime), stage: g.F.stage, phase: g.F.phase, boxes: g.F.boxes, flags: ['momReady', 'talkedMom', 'cutscene', 'talkCam', 'giftTaken', 'sleepy', 'doorCrack', 'morningReady', 'breakfastWait', 'birds'].map((k) => ser(g.F[k])),
      mom: who(g.mom), dad: who(g.dad), P: { pos: ser(g.P.pos), cam: ser(g.P.cam), yaw: r6(g.P.yaw), pitch: r6(g.P.pitch), roll: r6(g.P.roll), mode: g.P.mode }, seat: ser(g.seat),
      scene: g.scene.children.length, colliders: g.W.colliders.length, on: g.W.colliders.filter((c) => c.on).length, box4: g.FN.box.mesh.visible, kitchen: g.kitchen.run, things: g.kitchen.things.length,
      kid: r6(g.W.doors.kid.a), objective: text('objective'), subtitle: text('subtitle'), camera: !!g.RUN.hasCamera,
    });
    const trace = [];
    let t = 0;
    const step = async (secs, until) => {
      const n = Math.round(secs * 60);
      for (let i = 0; i < n; i++) {
        g.stepTimers(1 / 60); await yieldTask(); t++;
        if (t % 30 === 0) trace.push(sample());
        if (until && until()) return;
      }
    };
    g.startGame();
    for (const [what, arg] of plan) {
      if (what === 'step') await step(arg);
      else if (what === 'until') await step(arg[1], new Function('g', `return (${arg[0]})`).bind(null, g));
      else if (what === 'do') new Function('g', arg)(g);
      trace.push({ mark: what === 'do' ? arg : String(arg), ...sample() });
    }
    return trace;
  }, plan);
  const DAY = [
    ['until', ["g.F.stage === 'day' && g.F.phase === 'day'", 10]],
    ['step', 45],                                                // the chores: Dad's first box off the truck and unpacked, Mom at the kitchen box
    ['do', 'g.F.boxes = 2'],                                     // two of your boxes in, and you out of your room: the fourth box is put there
    ['step', 2],
    ['do', 'g.F.boxes = 3'],                                     // the third: Dad finishes the one he has, Mom is wanted, and "there are four"
    ['step', 3],
    ['do', 'g.F.talkedMom = true'],
    ['until', ['g.F.giftTaken === false', 200]],                 // Dad home, the talk, the camera held out
    ['step', 2],
    ['do', 'g.F.giftTaken = true'],
    ['until', ['g.F.sleepy', 120]],                              // the rest of the talk, the goodnight, the door drawn to
    ['step', 2],
    ['do', 'g.F.sleepy = false'],
    ['until', ['g.F.doorCrack', 60]],                            // asleep: the blinks (the cartoon is off)
  ];
  const MORNING = [
    ['until', ["g.F.stage === 'b1' && g.F.breakfastWait", 20]],
    ['step', 6],
    ['do', "g.P.mode = 'walk'; g.P.pos.set(2.75, 0, 2.08); g.P.yaw = Math.PI / 2; g.P.pitch = 0; g.cam(); g.sitInChair()"],   // (the eye put where you stand: the frozen loop leaves it where the title had it)
    ['until', ["g.P.mode === 'seat' && g.seat && !g.seat.tween", 5]],
    ['step', 9],
    ['do', 'g.standUp()'],                                       // up in the middle of it: they wait, Mom asks you to sit
    ['step', 6],
    ['do', 'g.cam(); g.sitInChair()'],
    ['until', ["g.F.stage !== 'b1'", 120]],
  ];
  const runs = {};
  try {
    for (const which of ['old', 'new']) {
      runs[which] = {};
      for (const [name, hash, plan] of [['day', '', DAY], ['morning', '#breakfast', MORNING]]) {
        const A = await open(which, hash);
        try { runs[which][name] = { keys: A.keys, trace: await drive(A.page, plan), errors: A.errors }; }
        finally { await A.ctx.close(); }
        console.log(`  ..   ${which} ${name}: ${runs[which][name].trace.length} samples, ${runs[which][name].errors.length} page errors`);
      }
    }
  } finally { await browser.close(); server.close(); }
  if (KEEP) { fs.mkdirSync(KEEP, { recursive: true }); for (const w of ['old', 'new']) fs.writeFileSync(path.join(KEEP, `${w}.json`), JSON.stringify(runs[w], null, 1)); }
  console.log('\nthe old scripts and the new, in the browser');
  test('window.__game has the same keys, in the same order', () => {
    const a = runs.old.day.keys, b = runs.new.day.keys;
    ok(JSON.stringify(a) === JSON.stringify(b), `old ${a.length} keys, new ${b.length}; missing: ${a.filter((k) => !b.includes(k)).join(' ') || '-'}; extra: ${b.filter((k) => !a.includes(k)).join(' ') || '-'}`);
    return `${b.length} keys`;
  });
  for (const name of ['day', 'morning']) test(`${name === 'day' ? 'moving day (the chores, the talk, the camera, the goodnight)' : 'the first morning (the kitchen, sitting down, standing up, the talk)'} plays the same, sample for sample`, () => {
    const a = runs.old[name], b = runs.new[name];
    ok(!b.errors.length, `the new scripts threw: ${b.errors.slice(0, 3).join(' | ')}`);
    ok(!a.errors.length, `the old scripts threw (the comparison means nothing): ${a.errors.slice(0, 3).join(' | ')}`);
    const n = Math.max(a.trace.length, b.trace.length);
    for (let i = 0; i < n; i++) {
      const x = JSON.stringify(a.trace[i]), y = JSON.stringify(b.trace[i]);
      if (x !== y) {
        const keys = Object.keys({ ...(a.trace[i] || {}), ...(b.trace[i] || {}) }).filter((k) => JSON.stringify((a.trace[i] || {})[k]) !== JSON.stringify((b.trace[i] || {})[k]));
        throw new Error(`sample ${i} of ${n} (t ${(a.trace[i] || b.trace[i]).t}) differs in ${keys.join(', ')}:\n  old: ${keys.map((k) => JSON.stringify((a.trace[i] || {})[k])).join(' | ').slice(0, 500)}\n  new: ${keys.map((k) => JSON.stringify((b.trace[i] || {})[k])).join(' | ').slice(0, 500)}`);
      }
    }
    const last = b.trace[b.trace.length - 1], marks = b.trace.filter((s) => s.mark).length;
    ok(name === 'day' ? last.flags[6] === true && last.camera && b.trace.some((s) => s.box4) : last.stage === 'n2', `the ${name} did not reach its end: ${JSON.stringify(last).slice(0, 300)}`);
    return `${n} samples over ${last.t.toFixed(1)} game seconds, ${marks} steps of the plan`;
  });
}

(async () => {
  if (PORT) {
    try { await browserHalf(); } catch (e) { failed++; console.log(`  FAIL the browser half: ${String((e && e.stack) || e).split('\n').slice(0, 3).join(' / ')}`); }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
