// Lock-in test: the doors out of the house at night, the pocket behind it, and the routes a disobedient player can take (js/doors.js).
//   node tests/lockin.js [--port N] [--only hunted,blackout,night1,night10,trap,n9,forest,leash,nav]
// Each scene loads the game headless (window.__norender), starts the night from its debug jump and checks:
//   hunted   #night3&type=hunted: the front, back, basement and garage doors prompt "Try the door" and stay shut with their strips on;
//            a flood fill from the bunk never leaves the house
//   blackout #night3&type=blackout: once the lights go the back door opens; the flood fill reaches the pocket and the garage and nothing
//            else; the kid refuses once at the pocket's edge; with the breaker thrown and the player back in, the back door locks again
//   night1   #night1: every door out is locked; the front door's chain opens the leaf 8 cm with a clink, it goes to when you step back
//            and the knob turns back once; Mom's and Dad's lines through the wall
//   night10  #night10: every door out is locked
//   trap     #night6: after doors.trap() the back door stands open and the flood fill from the stoop reaches the gate gap (-27, -16), the
//            track and the road's shoulder with no night strip on
//   n9       #night9: after doors.n9(true) the flood fill reaches the barn's front and (-50, -18); the track's edges carry no collider;
//            a step off the track gets the refusal once, the kid's breath up and the flashlight at half
//   forest   a catch in the trees: the night starts over with the back door open and doors.fences(n) 'open'
//   leash    the player put on the porch (3.1, -5.6) on night three: within 2 s the thing is 0.6 m outside the front door facing them,
//            then it hunts
//   nav      the outside nodes and edges are clear for the thing's body, joined only when the night is out there
// Exit 1 on any failure. A scene that cannot load is a failure, not a skip.
const http = require('http'), fs = require('fs'), path = require('path');
const { Readable } = require('stream');
const ROOT = path.resolve(__dirname, '..');
const serve = require(path.join(ROOT, 'desktop', 'static'));
const ARGV = process.argv.slice(2);
const opt = (k, d) => { const i = ARGV.indexOf(k); return i >= 0 && ARGV[i + 1] ? ARGV[i + 1] : d; };
const PORT = +opt('--port', 10031);
const ONLY = opt('--only', '') ? new Set(opt('--only', '').split(',')) : null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function ok(cond, msg) { if (!cond) throw new Error(msg); }

let BASE = '', browser = null;
async function page(hash, { clock = 0 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
  const pg = await ctx.newPage(), errs = [];
  pg.on('pageerror', (e) => errs.push(String((e && e.stack) || e).split('\n').slice(0, 2).join(' / ')));
  pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.addInitScript(() => { window.__norender = true; });
  if (clock) await pg.addInitScript((m) => { window.__clockMul = m; }, clock);
  await pg.goto(BASE + '/index.html' + hash, { waitUntil: 'load', timeout: 300e3 });
  await pg.waitForFunction(() => window.__game && document.getElementById('loading').classList.contains('done'), null, { timeout: 400e3, polling: 250 });
  return { ctx, pg, errs };
}
const until = (pg, fn, arg, ms = 120e3) => pg.waitForFunction(fn, arg, { timeout: ms, polling: 100 });
async function night(hash, opts = {}) {
  const P = await page(hash, opts), n = +hash.match(/night(\d+)/)[1];
  await P.pg.evaluate(() => { const g = window.__game; g.renderer.compileAsync = async () => {}; g.startGame(); });
  await until(P.pg, (n) => window.__game.F.stage === 'n' + n && window.__game.F.live, n, 300e3);
  return P;
}
// nothing else tonight: the director and the engine stop, so a scene's checks are not a hunt's
const quiet = (pg) => pg.evaluate(() => { const g = window.__game; g.nights.director.stop(); if (g.nights.D.events && g.nights.D.events.suspend) g.nights.D.events.suspend(true); });
async function climbDown(pg) {
  await until(pg, () => { const g = window.__game; return g.P.mode === 'bunk' && !g.F.cutscene && !g.F.script; }, null, 90e3);
  await pg.keyboard.press('KeyE');
  await until(pg, () => { const g = window.__game; return g.P.mode === 'walk' && !g.F.cutscene; }, null, 60e3);
}
const stand = (pg, x, z, tx, tz, y = 0) => pg.evaluate(([x, z, tx, tz, y]) => {
  const g = window.__game; g.P.pos.set(x, y, z); g.P.vel.set(0, 0, 0);
  if (tx !== undefined && tx !== null) { g.P.yaw = Math.atan2(-(tx - x), -(tz - z)); g.P.pitch = 0; }
}, [x, z, tx, tz, y]);
const hold = async (pg, key, ms) => { await pg.keyboard.down(key); await sleep(ms); await pg.keyboard.up(key); };
const prompt = (pg) => pg.evaluate(() => document.getElementById('prompt').textContent.replace(/\s+/g, ' ').trim());
const playFor = async (pg, s) => { const t0 = await pg.evaluate(() => window.__game.gameTime); await until(pg, (t) => window.__game.gameTime >= t, t0 + s, 120e3); };
const doorsState = (pg) => pg.evaluate(async () => (await import('/js/doors.js')).test.state);

// ---------- the library, in the page: the doors set by the rules and the player's circle flood-filled ----------
function lib() {
  return Promise.all([import('/js/doors.js'), import('/js/world.js'), import('/js/nav.js')]).then(([doors, Wm, nav]) => {
    const g = window.__game, W = g.W, C = g.collide, PB = g.PB;
    // every door as a hand on the house side would leave it: a door out of the house open if its rule says so, else shut; the inside doors
    // open, Mom and Dad's shut at night (it is locked)
    function setByRule() {
      const out = {};
      for (const k in W.doors) {
        const d = W.doors[k], r = doors.EXITS.includes(k) ? doors.rule(k) : k === 'parents' && g.F.phase === 'night' ? 'locked' : 'open', open = r === 'open';
        d.target = open ? 1 : 0; d.a = open ? Math.min(1, d.max ?? 1) : 0; d.apply(); out[k] = r;
      }
      return out;
    }
    // the player's circle from (sx, sz, sy) over a G grid inside the box; returns a lookup of what it reached
    function flood(sx, sz, sy, [X0, X1, Z0, Z1], G = 0.25) {
      const R = 0.28, NX = Math.round((X1 - X0) / G), NZ = Math.round((Z1 - Z0) / G), reach = new Map();
      const key = (i, j, f) => (i * NZ + j) * 2 + f, cx = (i) => X0 + (i + 0.5) * G, cz = (j) => Z0 + (j + 0.5) * G;
      const si = Math.floor((sx - X0) / G), sj = Math.floor((sz - Z0) / G), sf = sy < -1 ? 1 : 0, stack = [[si, sj, sf]];
      reach.set(key(si, sj, sf), sy);
      const saved = [g.mom.group.visible, g.dad.group.visible, g.E.visible]; g.mom.group.visible = g.dad.group.visible = g.E.visible = false;
      while (stack.length) {
        const [i, j, f] = stack.pop(), y = reach.get(key(i, j, f));
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= NX || b >= NZ) continue;
          const x = cx(a), z = cz(b), ny = W.groundAt(x, z, y), nf = ny < -1 ? 1 : 0, k = key(a, b, nf);
          if (reach.has(k) || Math.abs(ny - y) > 0.5) continue;
          if (C.probe(x, z, R, ny, 1.6, PB).pen > 0) continue;
          reach.set(k, ny); stack.push([a, b, nf]);
        }
      }
      [g.mom.group.visible, g.dad.group.visible, g.E.visible] = saved;
      const cells = [];
      for (const [k, y] of reach) { const f = k % 2, ij = (k - f) / 2; cells.push([cx(Math.floor(ij / NZ)), cz(ij % NZ), y]); }
      const near = (x, z, rad = G * 1.5) => cells.some((c) => Math.hypot(c[0] - x, c[1] - z) <= rad);
      return { cells, near, n: cells.length };
    }
    // the free cells (not inside anything) of a rect, for "the reach covers it"
    function free([X0, X1, Z0, Z1], G = 0.25, y = 0) {
      const out = []; for (let x = X0 + G / 2; x < X1; x += G) for (let z = Z0 + G / 2; z < Z1; z += G) if (C.probe(x, z, 0.28, y, 1.6, PB).pen === 0) out.push([x, z]); return out;
    }
    const HOUSE = [-8.3, 11.5, -4.7, 4.8], GARAGE = Wm.PLACES.garage, POCKET = [[-9.85, -0.25, 4.55, 7.45], [-9.85, -7.95, -3.95, 4.7], [-9.85, -7.55, -7.15, -3.7]];
    const inR = (r, x, z, m = 0) => x > r[0] - m && x < r[1] + m && z > r[2] - m && z < r[3] + m;
    window.__lock = { doors, Wm, nav, setByRule, flood, free, HOUSE, GARAGE, POCKET, inR };
  });
}

// ---------- the scenes ----------
const SCENES = {
  // the four doors out on a hunted night, and the house as a box
  async hunted() {
    const { pg, ctx, errs } = await night('#night3&type=hunted');
    try {
      await quiet(pg); await climbDown(pg); await pg.evaluate(lib);
      const out = {};
      // the cellar and garage doors are tried from the pocket, where the leash would come: a beat of the night holds the thing meanwhile
      await pg.evaluate(() => window.__game.nights.D.RES.hold('E', 'lockin'));
      // each door from its house side, within reach of the handle, facing it
      const SPOTS = { front: [3.1, -3.75, -0.0], back: [-1.6, 3.95, 0], basement: [-6.76, 5.35, -2.4], garage: [-8.3, -6.3, 0] };
      for (const [name, [x, z, y]] of Object.entries(SPOTS)) {
        const m = await pg.evaluate((n) => { const d = window.__game.W.doors[n]; return [d.mid.x, d.mid.z]; }, name);
        await stand(pg, x, z, m[0], m[1], y); await sleep(450);
        const pr = await prompt(pg);
        ok(pr === 'E Try the door', `${name}: prompt "${pr}" (want "E Try the door")`);
        await pg.keyboard.press('KeyE'); await sleep(700);
        const d = await pg.evaluate((n) => { const d = window.__game.W.doors[n]; return { target: d.target, a: +d.a.toFixed(3), on: d.col.on, max: d.max }; }, name);
        if (name === 'front') ok(d.a <= 0.0401 && d.a > 0.03 && d.on, `front: the chain should hold the leaf at 0.04 with its strip on: ${JSON.stringify(d)}`);
        else ok(d.target === 0 && d.a === 0 && d.on, `${name}: should stay shut with its strip on: ${JSON.stringify(d)}`);
        out[name] = d;
        await stand(pg, 0.5, -1.0); await sleep(1500);   // back in the living room, away from the door (the chain lets go)
      }
      // the house as a box: from the bunk's ladder, every door shut by its rule
      const f = await pg.evaluate(() => {
        const L = window.__lock, g = window.__game, rules = L.setByRule();
        const r = L.flood(g.LADDER_FLOOR.x, g.LADDER_FLOOR.z, 0, [-16, 16, -16, 12], 0.2);
        const outside = r.cells.filter((c) => !L.inR(L.HOUSE, c[0], c[1]));
        return { rules, n: r.n, outside: outside.length, sample: outside.slice(0, 3).map((c) => c.map((v) => +v.toFixed(2))) };
      });
      ok(f.n > 800, `the flood fill from the bunk reached only ${f.n} cells`);
      ok(f.outside === 0, `the flood fill left the house at ${JSON.stringify(f.sample)} (${f.outside} cells); rules ${JSON.stringify(f.rules)}`);
      ok(!errs.length, `page errors: ${errs.slice(0, 2).join(' | ')}`);
      return `four doors "Try the door" (front chained at ${out.front.a}), ${f.n} cells reached, none outside the house; rules ${JSON.stringify(f.rules)}`;
    } finally { await ctx.close(); }
  },

  // the blackout: the back door opens, the pocket and the garage, the refusal, and the lock behind you
  async blackout() {
    const { pg, ctx, errs } = await night('#night3&type=blackout', { clock: 6 });
    try {
      await climbDown(pg); await pg.evaluate(lib);
      await until(pg, () => window.__game.F.blackout, null, 150e3);
      await pg.evaluate(() => { const g = window.__game; g.nights.director.stop(); g.nights.hunter.dismiss(); });
      await stand(pg, -1.6, 3.95, -1.6, 4.67); await sleep(450);
      let pr = await prompt(pg);
      ok(pr === 'E Open the door', `back door in the blackout: prompt "${pr}"`);
      const rules = await pg.evaluate(async () => { const d = window.__lock.doors; return { back: d.rule('back'), basement: d.rule('basement'), garage: d.rule('garage'), front: d.rule('front'), fences: d.fences() }; });
      ok(rules.back === 'open' && rules.garage === 'open' && rules.front === 'chain' && rules.fences === 'closed', `blackout rules ${JSON.stringify(rules)}`);
      // the reach: the house, the pocket and the garage, and nothing else; most of the pocket's free ground is reached
      const f = await pg.evaluate(() => {
        const L = window.__lock, g = window.__game; L.setByRule();
        const r = L.flood(g.LADDER_FLOOR.x, g.LADDER_FLOOR.z, 0, [-16, 16, -16, 12], 0.2);
        const where = (c) => (L.inR(L.HOUSE, c[0], c[1]) && c[2] > -1 ? 'house' : c[2] < -1 ? 'down' : L.POCKET.some((p) => L.inR(p, c[0], c[1])) ? 'pocket' : L.inR(L.GARAGE, c[0], c[1]) ? 'garage' : 'beyond');
        const by = {}; for (const c of r.cells) { const w = where(c); by[w] = (by[w] || 0) + 1; }
        const beyond = r.cells.filter((c) => where(c) === 'beyond').slice(0, 3).map((c) => c.map((v) => +v.toFixed(2)));
        let freeN = 0, got = 0; for (const p of L.POCKET) for (const [x, z] of L.free(p, 0.2)) { freeN++; if (r.near(x, z, 0.15)) got++; }
        return { by, beyond, pocketFree: freeN, pocketGot: got };
      });
      ok(!f.by.beyond, `the reach went past the pocket: ${JSON.stringify(f.beyond)} (${JSON.stringify(f.by)})`);
      ok(f.by.garage > 40 && f.by.pocket > 100, `the pocket and the garage: ${JSON.stringify(f.by)}`);
      ok(f.pocketGot >= f.pocketFree * 0.95, `the pocket's free ground reached: ${f.pocketGot} of ${f.pocketFree}`);
      // the refusal: walk into the strip beyond the yard behind the house, twice; one line, the breath up
      await pg.evaluate(() => { const L = window.__lock; for (const k of ['back', 'basement', 'garage']) { const d = window.__game.W.doors[k]; d.target = 1; d.a = 1; d.apply(); } });
      const sub0 = await pg.evaluate(() => { window.__subs = 0; const el = document.getElementById('subtitle'); new MutationObserver(() => { if (/Not out there/.test(el.textContent)) window.__subs++; }).observe(el, { childList: true, characterData: true, subtree: true }); return el.textContent; });
      await stand(pg, -4.5, 6.6, -4.5, 9); await hold(pg, 'KeyW', 1400);
      const r1 = await pg.evaluate(async () => { const rf = (await import('/js/doors.js')).test.log().find((e) => e.what === 'refuse'); return { z: window.__game.P.pos.z, fear: rf ? rf.fear : window.__game.F.fear, subs: window.__subs, text: document.getElementById('subtitle').textContent }; });
      await stand(pg, -9.3, 2.0, -12, 2.0); await hold(pg, 'KeyW', 1400);
      const r2 = await pg.evaluate(async () => ({ x: window.__game.P.pos.x, subs: window.__subs, refuse: (await import('/js/doors.js')).test.log().filter((e) => e.what === 'refuse').length }));
      ok(r1.z < 7.4 - 0.27 && r2.x > -9.8 + 0.27, `the strips held: z ${r1.z.toFixed(2)} (strip at 7.4), x ${r2.x.toFixed(2)} (strip at -9.8)`);
      ok(/Not out there/.test(r1.text) && r1.fear >= 0.6, `the refusal: "${r1.text}", fear ${r1.fear.toFixed(2)}`);
      ok(r2.refuse === 1 && r2.subs === 1, `the refusal fired ${r2.refuse} times (${r2.subs} subtitles), want once`);
      // the breaker (the garage's side door shut, as the night left it: its handle is beside the panel), then back inside: the back door
      // locks behind you
      await pg.evaluate(() => { const d = window.__game.W.doors.garage; d.target = 0; d.a = 0; d.apply(); });
      await until(pg, () => /breaker/.test(document.getElementById('objective').textContent), null, 60e3);   // the panel is there once the night says so
      await stand(pg, -9.68, -8.0, -9.68, -7.1); await sleep(500);
      pr = await prompt(pg);
      if (pr !== 'E Flip the breaker') { const dbg = await pg.evaluate(() => { const g = window.__game; return { p: [g.P.pos.x, g.P.pos.z], cam: g.camera.position.toArray().map((v) => +v.toFixed(2)), mode: g.P.mode, live: g.F.live, dead: g.F.dead, stage: g.F.stage, blackout: g.F.blackout, objOk: g.F.objOk, clock: g.F.clock, hunter: g.nights.hunter.state, shown: document.getElementById("prompt").classList.contains("show"), cut: g.F.cutscene, script: g.F.script, doors: Object.fromEntries(Object.entries(g.W.doors).map(([k, d]) => [k, [d.target, +d.a.toFixed(2), +Math.hypot(d.mid.x - g.P.pos.x, d.mid.z - g.P.pos.z).toFixed(2)]])) }; }); ok(false, `breaker prompt "${pr}" ${JSON.stringify(dbg)}`); }
      await pg.keyboard.press('KeyE');
      await until(pg, () => !window.__game.F.blackout, null, 20e3);
      await playFor(pg, 3.2); await pg.evaluate(() => window.__game.nights.hunter.dismiss());   // the hunt the breaker starts
      const mid = await pg.evaluate(async () => (await import('/js/doors.js')).rule('back'));
      ok(mid === 'open', `with the breaker thrown and the player still out, the back door rule is "${mid}" (want open until they are in)`);
      await stand(pg, -2.0, 2.4, -2.0, 0); await playFor(pg, 2.5);
      const end = await pg.evaluate(async () => { const d = window.__game.W.doors.back, m = await import('/js/doors.js'); return { target: d.target, rule: m.rule('back'), garage: m.rule('garage'), relock: m.test.log().filter((e) => e.what === 'relock').length }; });
      ok(end.target === 0 && end.rule === 'locked' && end.garage === 'locked' && end.relock === 1, `back inside after the blackout: ${JSON.stringify(end)}`);
      ok(!errs.length, `page errors: ${errs.slice(0, 2).join(' | ')}`);
      return `rules ${JSON.stringify(rules)}; reach ${JSON.stringify(f.by)}, pocket ${f.pocketGot}/${f.pocketFree}; refused once (fear ${r1.fear.toFixed(2)}); relocked behind you`;
    } finally { await ctx.close(); }
  },

  // night one: all locked; the chain, the knob from outside once, Mom and Dad through the wall
  async night1() {
    const { pg, ctx, errs } = await night('#night1');
    try {
      await pg.evaluate(lib);
      const rules = await pg.evaluate(() => { const d = window.__lock.doors; return Object.fromEntries(d.EXITS.map((k) => [k, d.rule(k)])); });
      ok(rules.front === 'chain' && rules.back === 'locked' && rules.basement === 'locked' && rules.garage === 'locked', `night one rules ${JSON.stringify(rules)}`);
      await until(pg, () => { const g = window.__game; return g.P.mode === 'bunk' && !g.F.cutscene && !g.F.script; }, null, 120e3);
      await pg.evaluate(() => { const g = window.__game; g.F.cutscene = false; g.P.mode = 'walk'; });
      await stand(pg, 3.1, -3.75, 3.1, -4.5); await sleep(500);
      ok((await prompt(pg)) === 'E Try the door', `front prompt "${await prompt(pg)}"`);
      await pg.keyboard.press('KeyE'); await playFor(pg, 0.6);
      const a = await pg.evaluate(() => { const d = window.__game.W.doors.front; return { a: +d.a.toFixed(3), max: d.max, on: d.col.on, target: d.target }; });
      ok(Math.abs(a.a - 0.04) < 1e-3 && a.max === 0.04 && a.on, `the chain: ${JSON.stringify(a)}`);
      await stand(pg, 3.1, -2.6); await playFor(pg, 6.5);
      const b = await pg.evaluate(async () => { const d = window.__game.W.doors.front, m = await import('/js/doors.js'); return { a: d.a, target: d.target, log: m.test.log().map((e) => e.what + (e.id ? ':' + e.id : '')) }; });
      ok(b.target === 0 && b.a === 0, `let go and the door goes to: ${JSON.stringify(b)}`);
      ok(b.log.filter((e) => e === 'knob').length === 1, `the knob turns back once: ${b.log.join(', ')}`);
      ok(b.log.includes('line:mom/door_a') && b.log.includes('line:dad/door_a'), `Mom and Dad through the wall: ${b.log.join(', ')}`);
      // a second try: the chain again, no second knob
      await stand(pg, 3.1, -3.75, 3.1, -4.5); await sleep(300); await pg.keyboard.press('KeyE'); await playFor(pg, 0.5); await stand(pg, 3.1, -2.6); await playFor(pg, 4);
      const c = await pg.evaluate(async () => (await import('/js/doors.js')).test.log().filter((e) => e.what === 'knob').length);
      ok(c === 1, `the knob turned ${c} times in the night`);
      const chain = await pg.evaluate(() => window.__game.RUN.nights && window.__game.RUN.nights[1] && window.__game.RUN.nights[1].log.some((e) => e.id === 'frontChain'));
      ok(chain, 'the ledger has no frontChain row for the journal');
      ok(!errs.length, `page errors: ${errs.slice(0, 2).join(' | ')}`);
      return `rules ${JSON.stringify(rules)}; chain a ${a.a}; ${b.log.join(', ')}`;
    } finally { await ctx.close(); }
  },

  async night10() {
    const { pg, ctx, errs } = await night('#night10');
    try {
      await pg.evaluate(lib);
      const rules = await pg.evaluate(() => { const d = window.__lock.doors; return Object.fromEntries(d.EXITS.map((k) => [k, d.rule(k)])); });
      ok(rules.front === 'chain' && rules.back === 'locked' && rules.basement === 'locked' && rules.garage === 'locked', `night ten rules ${JSON.stringify(rules)}`);
      ok(!errs.length, `page errors: ${errs.slice(0, 2).join(' | ')}`);
      return `rules ${JSON.stringify(rules)}`;
    } finally { await ctx.close(); }
  },

  // night six's trap: the back door open, the yard, the gate, the track and the road
  async trap() {
    const { pg, ctx, errs } = await night('#night6&type=hunted');
    try {
      await quiet(pg); await climbDown(pg); await pg.evaluate(lib);
      const before = await pg.evaluate(() => window.__lock.doors.rule('back'));
      ok(before === 'locked', `before the trap the back door is "${before}"`);
      await pg.evaluate(() => window.__lock.doors.trap());
      await until(pg, () => window.__game.W.doors.back.a === 1, null, 10e3);
      const s = await pg.evaluate(() => { const g = window.__game, L = window.__lock; return { rule: L.doors.rule('back'), fences: L.doors.fences(6), target: g.W.doors.back.target, night: g.W.colliders.filter((c) => c.night).map((c) => ({ id: c.id, on: g.collide.active(c) })) }; });
      ok(s.rule === 'open' && s.fences === 'open' && s.target === 1, `after the trap: ${JSON.stringify(s)}`);
      ok(s.night.length >= 4 && s.night.every((c) => !c.on), `a night strip is on after the trap: ${JSON.stringify(s.night)}`);
      const f = await pg.evaluate(() => {
        const L = window.__lock; L.setByRule();
        const r = L.flood(-1.6, 5.4, 0, [-62, 15, -36, 12], 0.3);
        return { n: r.n, gate: r.near(-27, -16, 0.5), track: r.near(-40, -15, 0.5), shoulder: r.near(2.3, -27.0, 0.5), road: r.near(-10, -30, 0.5) };
      });
      ok(f.gate && f.track && f.shoulder, `the flood fill from the stoop: ${JSON.stringify(f)}`);
      ok(!errs.length, `page errors: ${errs.slice(0, 2).join(' | ')}`);
      return `back open, fences open, no night strip on; from the stoop ${JSON.stringify(f)}`;
    } finally { await ctx.close(); }
  },

  // night nine: the track to the barn, its soft edges
  async n9() {
    const { pg, ctx, errs } = await night('#night9&type=hunted');
    try {
      await quiet(pg); await climbDown(pg); await pg.evaluate(lib);
      await pg.evaluate(() => window.__lock.doors.n9(true));
      await until(pg, () => window.__game.W.doors.back.a === 1, null, 10e3);
      const f = await pg.evaluate(() => {
        const L = window.__lock, g = window.__game; L.setByRule();
        const r = L.flood(-1.6, 5.4, 0, [-62, 15, -36, 12], 0.3);
        // the track's two edges, either side, at five places along it
        const edges = []; for (const x of [-30, -35, -40, -45, -50]) for (const z of [-22, -8]) edges.push({ x, z, inside: r.near(x, z + (z < -15 ? 0.6 : -0.6), 0.45), outside: r.near(x, z + (z < -15 ? -0.6 : 0.6), 0.45) });
        // nothing that stops a body on the edge lines themselves but the trees' own trunks
        const onEdge = g.W.colliders.filter((c) => g.collide.active(c) && c.minX < -27.3 && c.maxX > -56 && ((c.minZ <= -22 && c.maxZ >= -22) || (c.minZ <= -8 && c.maxZ >= -8))).map((c) => g.collide.describe(c));
        return { n: r.n, barn: r.near(-57.6, -12, 0.5), forestEdge: r.near(-50, -18, 0.5), edges, onEdge, fences: L.doors.fences(9), rule: L.doors.rule('back') };
      });
      ok(f.barn && f.forestEdge, `the flood fill from the stoop: barn front ${f.barn}, (-50, -18) ${f.forestEdge}`);
      ok(f.fences === 'open' && f.rule === 'open', `night nine at 2:30: fences ${f.fences}, back ${f.rule}`);
      const hard = f.edges.filter((e) => !(e.inside && e.outside));
      ok(hard.length <= 1, `the track's edges are not soft at ${JSON.stringify(hard)}`);
      ok(f.onEdge.every((d) => /trunk|tree/.test(d)), `colliders on the track's edges: ${f.onEdge.join('; ')}`);
      // the step off: on the track by its north edge with the flashlight on, a step into the trees
      await pg.evaluate(() => { const g = window.__game; for (const k in g.W.doors) { const d = g.W.doors[k]; if (k === 'back') continue; } if (!g.F.flashOn) g.toggleLight(); });
      await stand(pg, -40, -9.0, -40, -4); await playFor(pg, 0.5);
      const base = await pg.evaluate(() => window.__game.camera.children.find((o) => o.isSpotLight).intensity);
      await hold(pg, 'KeyW', 1100); await playFor(pg, 0.3);
      const r = await pg.evaluate(async () => { const g = window.__game, m = await import('/js/doors.js'), rf = m.test.log().find((e) => e.what === 'refuse'); return { z: g.P.pos.z, text: document.getElementById('subtitle').textContent, fear: rf ? rf.fear : g.F.fear, torch: g.camera.children.find((o) => o.isSpotLight).intensity, refuse: m.test.log().filter((e) => e.what === 'refuse').length, hunter: g.nights.hunter.state, leash: m.test.state.lastLeash }; });
      ok(r.z > -8, `the step off the track reached only z ${r.z.toFixed(2)}`);
      ok(/Not out there/.test(r.text) && r.fear >= 0.6, `off the track: "${r.text}", fear ${r.fear.toFixed(2)}`);
      ok(base > 0 && Math.abs(r.torch - base * 0.5) < base * 0.06, `the flashlight at half: ${r.torch.toFixed(1)} of ${base.toFixed(1)}`);
      ok(!r.leash && r.hunter === 'away', `nothing comes for a kid on the way to the barn: hunter ${r.hunter}, leash ${JSON.stringify(r.leash)}`);
      await stand(pg, -40, -9.0, -40, -4); await hold(pg, 'KeyW', 1100); await stand(pg, -44, -21, -44, -26); await hold(pg, 'KeyW', 1100);
      const again = await pg.evaluate(async () => (await import('/js/doors.js')).test.log().filter((e) => e.what === 'refuse').length);
      ok(again === 1, `the refusal fired ${again} times`);
      ok(!errs.length, `page errors: ${errs.slice(0, 2).join(' | ')}`);
      return `barn front and (-50, -18) reached; edges soft at ${f.edges.length - hard.length}/${f.edges.length}; off the track: refused once, fear ${r.fear.toFixed(2)}, torch ${r.torch.toFixed(1)}/${base.toFixed(1)}`;
    } finally { await ctx.close(); }
  },

  // a catch in the trees, and the night again with the back door open
  async forest() {
    const { pg, ctx, errs } = await night('#night6&type=hunted');
    try {
      await quiet(pg); await climbDown(pg); await pg.evaluate(lib);
      await stand(pg, -45, 5, -50, 5); await playFor(pg, 1.5);
      const pre = await pg.evaluate(async () => { const m = await import('/js/doors.js'); return { leash: m.test.state.lastLeash, forest: m.inForest(-45, 5) }; });
      ok(pre.forest && !pre.leash, `in the trees: ${JSON.stringify(pre)} (the trees are the forest's, not the leash's)`);
      await pg.evaluate(() => window.__game.caught());
      await until(pg, () => !document.getElementById('death').classList.contains('hidden'), null, 30e3);
      const caughtN = await pg.evaluate(() => window.__game.RUN.forestCaught);
      ok(caughtN === 6, `the catch in the trees was not noted (RUN.forestCaught ${caughtN})`);
      await pg.evaluate(() => document.getElementById('retry').click());
      await until(pg, () => window.__game.F.stage === 'n6' && window.__game.F.live && !window.__game.F.dead, null, 120e3);
      const s = await pg.evaluate(async () => { const g = window.__game, m = await import('/js/doors.js'), d = g.W.doors.back; return { a: d.a, target: d.target, on: d.col.on, rule: m.rule('back'), fences: m.fences(6) }; });
      ok(s.a === 1 && s.target === 1 && !s.on && s.rule === 'open' && s.fences === 'open', `the night again after the trees: ${JSON.stringify(s)}`);
      ok(!errs.length, `page errors: ${errs.slice(0, 2).join(' | ')}`);
      return `caught in the trees on night six; the night again: ${JSON.stringify(s)}`;
    } finally { await ctx.close(); }
  },

  // the leash: put on the porch on night three, facing the road
  async leash() {
    const { pg, ctx, errs } = await night('#night3&type=hunted');
    try {
      await quiet(pg); await climbDown(pg); await pg.evaluate(lib);
      await stand(pg, 3.1, -5.6, 3.1, -12);
      await until(pg, () => !!window.__lock.doors.test.state.lastLeash, null, 30e3);
      const L = await pg.evaluate(() => { const g = window.__game, d = g.W.doors.front; return { ...window.__lock.doors.test.state.lastLeash, front: [d.mid.x, d.mid.z] }; });
      await until(pg, () => { const g = window.__game; return g.nights.hunter.state === 'hunt' || g.F.dead; }, null, 15e3);
      const after = await pg.evaluate(() => ({ state: window.__game.nights.hunter.state, dead: window.__game.F.dead }));
      const want = [L.front[0], L.front[1] - 0.6], f = L;
      ok(L.out <= 2.0, `the leash took ${L.out.toFixed(2)} s outside`);
      ok(Math.hypot(f.e[0] - want[0], f.e[2] - want[1]) < 0.05, `the thing at (${f.e[0].toFixed(2)}, ${f.e[2].toFixed(2)}), want 0.6 m outside the front door (${want[0].toFixed(2)}, ${want[1].toFixed(2)})`);
      ok(Math.abs(f.e[1] - 0.14) < 0.005, `the thing should stand on the front step's top (0.14 m), not in it: y ${f.e[1].toFixed(3)}`);
      const face = Math.atan2(f.player.x - f.e[0], f.player.z - f.e[2]); let dy = face - f.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
      ok(Math.abs(dy) < 0.2 && f.visible, `facing the player: off by ${dy.toFixed(2)} rad, visible ${f.visible}`);
      ok(L.door === 'front' && L.state === 'sight', `the leash: by the ${L.door} door, the thing in "${L.state}" (want sight)`);
      ok(after.state === 'hunt' || after.dead, `then the hunt: ${JSON.stringify(after)}`);
      ok(!errs.length, `page errors: ${errs.slice(0, 2).join(' | ')}`);
      return `placed after ${L.out.toFixed(2)} s outside, at (${f.e[0].toFixed(2)}, ${f.e[1].toFixed(2)}, ${f.e[2].toFixed(2)}) on the step facing the player (${dy.toFixed(2)} rad); sight, then ${after.dead ? 'the hunt caught them' : 'hunt'}`;
    } finally { await ctx.close(); }
  },

  // the outside graph: clear for the thing's body, joined only when the night is out there
  async nav() {
    const { pg, ctx, errs } = await night('#night3&type=hunted');
    try {
      await quiet(pg); await pg.evaluate(lib);
      const r = await pg.evaluate(() => {
        const L = window.__lock, g = window.__game, C = g.collide, nav = L.nav, bad = [];
        const barnBlock = g.W.colliders.some((c) => c.id === 'barnBlock');
        const intoBarn = (x, z) => barnBlock && x < -58.6 + 0.35 && x > -69.4 - 0.35 && z > -19.2 - 0.35 && z < -4.8 + 0.35;
        // the pocket's night strips (the thing is not kept in by the kid's refusal), and on an edge through a door that door's own leaf and
        // strip (it opens it on its way, as it does the house's: the barn's sliding door is shut at night)
        const skip = (c, own) => c.fence || (!!own && !!c.door && (c.door === own || c.door.name === own));
        const pen = (x, z, y, own = null) => { const p = C.probe(x, z, 0.35, y, 2.6, g.PB); return p.hit && skip(p.hit, own) ? 0 : p.pen; };
        g.mom.group.visible = g.dad.group.visible = false;
        for (const [id, [x, z, y = 0]] of Object.entries(nav.OUTSIDE)) { if (intoBarn(x, z) || y > 1) continue; const p = pen(x, z, y); if (p > 0) bad.push(`node ${id}: ${C.describe(C.probe(x, z, 0.35, y, 2.6, g.PB).hit)} ${p.toFixed(2)}`); }
        for (const [a, b, door] of nav.OUTSIDE_EDGE_LIST) {
          const [ax, az, ay = 0] = nav.NODES[a], [bx, bz, by = 0] = nav.NODES[b], L2 = Math.hypot(bx - ax, bz - az), n = Math.ceil(L2 / 0.2);
          if (Math.abs(ay - by) > 1) continue;   // the loft's ladder
          for (let i = 0; i <= n; i++) { const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = g.W.groundAt(x, z, ay + (by - ay) * t); if (intoBarn(x, z)) continue; const p = pen(x, z, y, door); if (p > 0.01) { bad.push(`edge ${a}-${b} at (${x.toFixed(2)}, ${z.toFixed(2)}): ${C.describe(C.probe(x, z, 0.35, y, 2.6, g.PB).hit)} ${p.toFixed(2)}`); break; } }
        }
        const was = nav.outsideJoined();
        nav.outside(false); const off = { mailbox: !!nav.path('kidBunk', 'mailbox'), barn: !!nav.path('kidBunk', 'barnDoor') };
        nav.outside(true); const on = { mailbox: !!nav.path('kidBunk', 'mailbox'), barn: !!nav.path('kidBunk', 'barnDoor'), porch: !!nav.path('hallW', 'porch') };
        nav.outside(was);
        return { bad, off, on, was, barnBlock };
      });
      ok(!r.was, 'the outside edges are joined on a night spent in the bunk');
      ok(!r.off.mailbox && !r.off.barn, `parted, the outside is still reachable: ${JSON.stringify(r.off)}`);
      ok(r.on.mailbox && r.on.barn && r.on.porch, `joined, the outside is not reachable: ${JSON.stringify(r.on)}`);
      ok(!r.bad.length, `the thing's body would stand in something: ${r.bad.slice(0, 4).join(' | ')}`);
      ok(!errs.length, `page errors: ${errs.slice(0, 2).join(' | ')}`);
      return `every outside node and edge clear for a 0.35 m body${r.barnBlock ? ' (the barn inside skipped: it is still one block)' : ''}; parted ${JSON.stringify(r.off)}, joined ${JSON.stringify(r.on)}`;
    } finally { await ctx.close(); }
  },
};

(async () => {
  const { chromium } = require('playwright');
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const r = await serve.respond(ROOT, new Request(url.href, { method: req.method, headers: req.headers.range ? { range: req.headers.range } : {} }));
      res.writeHead(r.status, Object.fromEntries(r.headers));
      if (r.body) Readable.fromWeb(r.body).on('error', () => res.destroy()).pipe(res); else res.end();
    } catch (e) { if (!res.headersSent) res.writeHead(500); res.end(String(e)); }
  });
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  BASE = `http://127.0.0.1:${PORT}`;
  browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  for (const [name, fn] of Object.entries(SCENES)) {
    if (ONLY && !ONLY.has(name)) continue;
    const t0 = Date.now(); let status = 'PASS', detail = '';
    try { detail = await fn(); } catch (e) { status = 'FAIL'; detail = String((e && e.message) || e).split('\n')[0]; }
    results.push({ name, status });
    console.log(`${status} ${name}: ${detail} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  }
  await browser.close(); server.close();
  const failed = results.filter((r) => r.status !== 'PASS');
  console.log(`${results.length - failed.length} passed, ${failed.length} failed`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
