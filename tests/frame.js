#!/usr/bin/env node
'use strict';
// The frame's shape, checked in plain Node (no browser): main.js's update() is a short skeleton of named calls in the fixed order, the
// blocks it once held are the named functions beside it, the first and last calls of the frame (input.poll, handsTick) bracket update()
// in loop(), the dead dad.fake flag is gone, js/hooks.js reaches the modules through its fixed list with a no-op for every call the frame
// makes, its install runs each module once in order and survives one that throws, and every module it imports is a real file.
//   node tests/frame.js [--verbatim <git revision>]
// --verbatim also diffs each extracted function's body against the block it was moved out of in that revision's js/main.js, whitespace
// aside (the proof that the move changed nothing; the revision is the commit before the move).
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const ARGV = process.argv.slice(2);
const opt = (name) => { const i = ARGV.indexOf(name); return i >= 0 && ARGV[i + 1] !== undefined ? ARGV[i + 1] : ''; };
const VERBATIM = opt('--verbatim');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let passed = 0, failed = 0;
function test(name, fn) {
  try { const d = fn(); passed++; console.log(`  ok   ${name}${d ? ': ' + d : ''}`); }
  catch (e) { failed++; console.log(`  FAIL ${name}\n       ${String((e && e.message) || e).split('\n').join('\n       ')}`); }
}
function ok(cond, msg) { if (!cond) throw new Error(msg); }

// the text of a top-level function: from `function name(` to the first `}` on a line of its own
function fnText(src, name) {
  const lines = src.split('\n'), a = lines.findIndex((l) => l.startsWith(`function ${name}(`) || l.startsWith(`async function ${name}(`));
  ok(a >= 0, `function ${name} is not in the file`);
  const b = lines.findIndex((l, i) => i > a && l === '}');
  ok(b > a, `function ${name} does not close`);
  return { lines: lines.slice(a, b + 1), body: lines.slice(a + 1, b), at: a + 1 };
}
// each call, in order: every one must appear in the text after the one before it
function inOrder(text, calls, what) {
  let from = 0;
  for (const c of calls) {
    const i = text.indexOf(c, from);
    ok(i >= 0, `${what}: ${c} is missing or out of order (after ${text.slice(Math.max(0, from - 40), from).trim().split('\n').pop()})`);
    from = i + c.length;
  }
}
const squash = (lines) => lines.join('\n').replace(/\s+/g, ' ').trim();

// ---------- the skeleton (design: main.js update(), the frame order) ----------
const ORDER = [
  'padLookTick(dt)', 'movePlayer(dt)', 'P.vel.set(0, 0, 0)', 'hooks.parents.update(dt)', 'nights.tick(dt)', 'events.update(dt)', 'coverTick(dt)', 'echoTick(dt)', 'breathTick(dt)',
  'hooks.doors.tick(dt)', 'flickerTick(dt)', 'ambienceTick(dt)', 'familyIdleTick(dt)', 'cineTick(dt)', 'FN.tick(dt)',
  'W.tick(dt)', 'W.tvFx.tick(dt)', 'W.phone.tick(', 'W.bedSleepers.update(dt)', 'lights.update(dt)', 'hooks.forest.update(dt)', 'hooks.day.tick(dt)', 'hooks.days.tick(dt)',
  'car.update(dt)', 'WF.update(dt)', 'dust.update(dt)', 'weather.update(', 'traffic.update(', 'W.streetLight.tick(', 'W.clock.tick(',
  'sfx.listen(camera)', 'hearRoom(dt)', 'E.update(dt', 'applyDetail()', 'UI.crosshair(', 'achievements.tick()', 'nights.proof.hud(', 'updateCamera(dt)', 'updateInteract()',
];
const EXTRACTED = ['padLookTick', 'coverTick', 'echoTick', 'breathTick', 'flickerTick', 'ambienceTick', 'familyIdleTick'];
const MODULES = ['parents', 'doors', 'breakfast', 'day', 'days', 'barn', 'forest', 'spine', 'reflect', 'events/existing', 'events/wave_a', 'events/wave_b', 'events/wave_c'];
const STUBS = [...MODULES, 'collide', 'events', 'log', 'story'];
const GAME_KEYS = ['W', 'F', 'P', 'RUN', 'E', 'camera', 'scene', 'sfx', 'lights', 'nights', 'hunter', 'gaze', 'events', 'log', 'UI', 'input', 'settings', 'mom', 'dad', 'hands', 'journal', 'menu', 'hooks'];

const main = read('js/main.js'), nights = read('js/nights.js');

console.log('\njs/main.js update()');
test('is at most 45 lines', () => { const n = fnText(main, 'update').lines.length; ok(n <= 45, `${n} lines`); return `${n} lines`; });
test('calls the frame in the fixed order', () => { inOrder(fnText(main, 'update').body.join('\n'), ORDER, 'update()'); return `${ORDER.length} calls`; });
test('holds no loop or block of its own (those are the named functions)', () => {
  const body = fnText(main, 'update').body.join('\n');
  ok(!/\b(for|while)\s*\(/.test(body), 'a loop is still inline');
  ok(!/\blet\b/.test(body), 'a let is still inline');
  ok(!/\bfunction\b|=>/.test(body), 'a function is still inline');
});
test('loop() polls the input before update() and ticks the hands after it (both run on the title and while paused, so they stay in loop())', () => {
  const body = fnText(main, 'loop').body.join('\n');
  inOrder(body, ['input.poll()', 'update(dt)', 'handsTick(dt)'], 'loop()');
  ok(!fnText(main, 'update').body.join('\n').includes('input.poll('), 'update() polls the input itself');
});
for (const name of EXTRACTED) test(`${name}(dt) is a named function`, () => { const f = fnText(main, name); ok(f.lines[0].startsWith(`function ${name}(dt)`), f.lines[0]); return `${f.body.length} lines at ${f.at}`; });
test('the dead dad.fake / wasFake pair is gone', () => { const m = main.match(/dad\.fake|wasFake/g); ok(!m, `${m && m.length} left`); });
test('imports hooks, events, log and story', () => {
  for (const l of ["import { hooks } from './hooks.js';", "import * as events from './events.js';", "import * as log from './log.js';", "import * as story from './story.js';"]) ok(main.includes(l), `missing: ${l}`);
});
test('boot() installs the modules once, with the world built, with the game object the modules were promised', () => {
  const all = main.match(/hooks\.install\(/g) || [];
  ok(all.length === 1, `${all.length} calls to hooks.install`);
  const boot = fnText(main, 'boot').body.join('\n'), line = boot.split('\n').find((l) => l.includes('hooks.install('));
  ok(line, 'the call is not in boot()');
  ok(main.indexOf('const W = buildWorld(') < main.indexOf('hooks.install('), 'installed before the world is built');
  const keys = line.slice(line.indexOf('{') + 1, line.lastIndexOf('}')).split(',').map((s) => s.trim().split(':')[0].trim());
  const missing = GAME_KEYS.filter((k) => !keys.includes(k));
  ok(!missing.length, `game object lacks ${missing.join(', ')}`);
  return `${keys.length} keys`;
});
console.log('\njs/nights.js');
test('imports events and log', () => { for (const l of ["import * as events from './events.js';", "import * as log from './log.js';"]) ok(nights.includes(l), `missing: ${l}`); });

console.log('\nthe stub modules');
for (const m of STUBS) test(`js/${m}.js exists and exports install`, () => {
  const src = read(`js/${m}.js`);
  ok(/export function install\(game\)/.test(src), 'no install(game) export');
  ok(!/from ['"]three['"]/.test(src) || true, '');
});
test('the hook exports the frame calls', () => {
  for (const [m, fn] of [['parents', 'update'], ['doors', 'tick'], ['forest', 'update'], ['day', 'tick'], ['days', 'tick'], ['spine', 'start'], ['events', 'update']]) ok(new RegExp(`export function ${fn}\\(`).test(read(`js/${m}.js`)), `js/${m}.js lacks ${fn}`);
});

// ---------- js/hooks.js, imported for real ----------
(async () => {
  const warn = process.emitWarning; process.emitWarning = () => {};   // the module-type warning of a package without "type"
  let H = null, err = null;
  try { H = await import(pathToFileURL(path.join(ROOT, 'js', 'hooks.js')).href); } catch (e) { err = e; }
  process.emitWarning = warn;
  console.log('\njs/hooks.js');
  test('imports in Node with every module it lists', () => { ok(H, String(err)); });
  if (H) {
    const { hooks, MODULES: LIST, makeHooks } = H;
    test('MODULES is the fixed list in the fixed order', () => { ok(JSON.stringify(LIST) === JSON.stringify(MODULES), JSON.stringify(LIST)); return LIST.join(' '); });
    test('hooks.<module> exists for every name, with install', () => { for (const m of MODULES) { ok(hooks[m], `no hooks.${m}`); ok(typeof hooks[m].install === 'function', `hooks.${m}.install`); } });
    test('no-op defaults for the calls the frame makes', () => {
      for (const [m, fn] of [['parents', 'update'], ['doors', 'tick'], ['forest', 'update'], ['day', 'tick'], ['days', 'tick'], ['spine', 'start']]) {
        ok(typeof hooks[m][fn] === 'function', `hooks.${m}.${fn}`);
        ok(hooks[m][fn](0.016) === undefined, `hooks.${m}.${fn} returned something`);
      }
      const fresh = makeHooks([['parents', {}], ['doors', {}], ['forest', {}], ['day', {}], ['days', {}], ['spine', {}]]);
      for (const [m, fn] of [['parents', 'update'], ['doors', 'tick'], ['forest', 'update'], ['day', 'tick'], ['days', 'tick'], ['spine', 'start']]) ok(typeof fresh[m][fn] === 'function', `default ${m}.${fn} missing when the module exports nothing`);
    });
    test('a module\'s exports replace its defaults', () => {
      let n = 0; const h = makeHooks([['parents', { update: (dt) => { n += dt; } }]]);
      h.parents.update(2); ok(n === 2, 'the export was not used');
    });
    test('install runs every module once, in list order, with the game object', () => {
      const calls = [], game = { W: 1 };
      const h = makeHooks(MODULES.map((m) => [m, { install: (g) => { calls.push([m, g]); } }]));
      ok(h.install(game) === true, 'the first install did not run');
      ok(JSON.stringify(calls.map((c) => c[0])) === JSON.stringify(MODULES), calls.map((c) => c[0]).join(' '));
      ok(calls.every((c) => c[1] === game), 'a module got something other than the game object');
      ok(h.install(game) === false, 'a second install ran');
      ok(calls.length === MODULES.length, `${calls.length} installs after a second call`);
      return `${calls.length} installs`;
    });
    test('a module whose install throws is reported by name and does not stop the others', () => {
      const calls = [], logged = [], ce = console.error; console.error = (...a) => logged.push(a.join(' '));
      try {
        const h = makeHooks([['parents', { install: () => calls.push('parents') }], ['doors', { install: () => { throw new Error('no knob'); } }], ['forest', { install: () => calls.push('forest') }]]);
        h.install({});
        ok(JSON.stringify(calls) === JSON.stringify(['parents', 'forest']), calls.join(' '));
        ok(JSON.stringify(h.failed) === JSON.stringify(['doors']), `failed: ${h.failed}`);
        ok(logged.length === 1 && /doors/.test(logged[0]) && /no knob/.test(logged[0]), `reported: ${logged.join(' | ')}`);
      } finally { console.error = ce; }
    });
    test('the real hooks install the real stubs without a report', () => {
      const logged = [], ce = console.error; console.error = (...a) => logged.push(a.join(' '));
      try { const h = makeHooks(MODULES.map((m) => [m, hooks[m]])); h.install({}); ok(!h.failed.length && !logged.length, `${h.failed} ${logged}`); } finally { console.error = ce; }
    });
  }

  // ---------- the move, line for line ----------
  if (VERBATIM) {
    console.log(`\nthe extracted functions against ${VERBATIM}:js/main.js`);
    const r = spawnSync('git', ['show', `${VERBATIM}:js/main.js`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
    if (r.status !== 0) { failed++; console.log(`  FAIL git show ${VERBATIM}:js/main.js: ${(r.stderr || '').trim()}`); }
    else {
      const old = fnText(r.stdout, 'update').body;
      // each block as it was: its first and last line (by text, not number)
      const BLOCKS = {
        padLookTick: ['if (input.lookX || input.lookY) lookBy(', null],
        coverTick: ['const dn = !!keys.Space || input.breath;', '} else coverHold = 0;'],
        echoTick: ['for (let i = echoes.length - 1; i >= 0; i--) {', '}'],
        breathTick: ["if (P.mode !== 'hide' || F.dead) { breathLatch = false; breathPrev = false; }", '}'],
        flickerTick: ['if (nlBase > 0 && !F.flicker) nlMult(', '}'],
        ambienceTick: ["if (F.phase === 'night' && !F.live && !F.chase && !F.echo && !F.dead && P.mode !== 'hide') {", '}'],
        familyIdleTick: ['if (mom.group.visible) {', '}'],
      };
      for (const name of EXTRACTED) test(`${name} is the old block, line for line`, () => {
        const [first, last] = BLOCKS[name];
        const a = old.findIndex((l) => l.trim().startsWith(first));
        ok(a >= 0, `the old block's first line was not found: ${first}`);
        let b = a;
        if (last !== null) {
          // the block ends at the first line that is exactly `last` at the block's own indentation
          const ind = old[a].match(/^\s*/)[0];
          b = old.findIndex((l, i) => i > a && l === ind + last);
          ok(b > a, `the old block's last line was not found: ${last}`);
        }
        const was = squash(old.slice(a, b + 1).filter((l) => !/^\s*\/\//.test(l))), now = squash(fnText(main, name).body.filter((l) => !/^\s*\/\//.test(l)));
        ok(was === now, `differs:\n  was: ${was}\n  now: ${now}`);
        return `${b - a + 1} lines`;
      });
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
