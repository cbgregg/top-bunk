'use strict';
// The hunter's contract (design 6.2, 6.7): what the other parts of the game may rely on the thing for, driven a frame at a time in a live
// night with the loop frozen (no drawing). Law 2's refusal in place/sight, the sight options (stays while looked at, crawls after
// lookTime), the free crawl round colliders with no graph, the catch by contact only (its head within 0.9 m and a line to you), the
// crawl giving up out of sight, no stopwatch catch left in nights.js or hunter.js, dt-scaled turning, the stalkFrozen and podPassed
// rows, the crumple stage reaching hunter.crawl; and revision 4's running and hiding: it listens 4-7 s where it lost you, a door shut
// behind you holds it at the leaf, it opens a place it saw you get into, one survived loom in twenty opens anyway (seeded, with its
// guards, telegraphed), the aimed torch makes it flinch and the flash stuns it once a chase, and it hears a sprint but not a far walk.
// Loaded by tests/smoke.js as a numbered check ("--only thing").
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

// the stopwatch the crawl used to catch you on: a 3.2 compared against a clock
const STOPWATCH = /(time\(\)|now\(\)|\bt0\b|\.t0\b|\bnow\b)[^;\n]{0,40}3\.2\b|3\.2\b[^;\n]{0,20}(time\(\)|now\(\))/;

function lib() {
  const g = window.__game, N = g.nights, H = N.hunter, E = g.E, P = g.P, F = g.F, W = g.W, gz = N.stage.gaze, NODES = window.__NODES, DT = 1 / 60;
  window.__freeze = true;
  N.director.stop();
  const reset = () => {
    H.reset(); H.S.cool = 0; H.setLevel(4); F.dead = false; F.live = true; F.cutscene = false; F.script = false; F.flashOn = false; F.flashAimed = false; F.breathCheck = false; F.chase = false; F.flicker = false;
    P.mode = 'walk'; P.pod = null; P.sprinting = false; P.vel.set(0, 0, 0); g.UI.pod(null);
    for (const k in W.doors) { const d = W.doors[k]; if (d.slide || k === 'front') continue; W.setDoor(k, true, true); }
    E.visible = false; E.mode = 'idle'; E.catchPose = null; E.flinch = 0; E.stun = 0; E.standUp();
  };
  const stand = (x, z, tx, tz) => { P.pos.set(x, W.groundAt ? W.groundAt(x, z, 0) : 0, z); P.vel.set(0, 0, 0); if (tx !== undefined) { P.yaw = Math.atan2(-(tx - x), -(tz - z)); P.pitch = 0; } g.updateCamera(0); };
  const face = (tx, tz, ty = null) => { P.yaw = Math.atan2(-(tx - P.pos.x), -(tz - P.pos.z)); P.pitch = ty === null ? 0 : Math.atan2(ty - 1.32, Math.hypot(tx - P.pos.x, tz - P.pos.z)); g.updateCamera(0); };
  // one frame of what matters here: the gaze, the hunter (or the whole stage), the timers, the doors, the body, the eye
  const frame = (o = {}) => { if (o.move) o.move(DT); if (o.stage) N.stage.tick(DT); else gz.update(DT); if (F.live && !F.dead) H.update(DT); g.stepTimers(DT); W.tick(DT); E.update(DT); g.updateCamera(DT); };
  // (async: a frame at a time with the promise queue let through, so the scripts' waits and tweens move on with the clock)
  const run = async (sec, o = {}) => { const n = Math.max(1, Math.round(sec / DT)); for (let i = 0; i < n; i++) { frame(o); await null; if (o.until && o.until()) return (i + 1) * DT; } return sec; };
  // the player along waypoints at a speed (m/s), turned to where they go; returns a move function
  const walker = (pts, speed, { sprint = false, look = true } = {}) => { let i = 0; return (dt) => {
    P.sprinting = sprint; if (i >= pts.length) { P.sprinting = false; return; }
    const [x, z] = pts[i], dx = x - P.pos.x, dz = z - P.pos.z, d = Math.hypot(dx, dz), st = speed * dt;
    if (look && d > 0.05) P.yaw = Math.atan2(-dx, -dz);
    if (d <= st) { P.pos.x = x; P.pos.z = z; i++; } else { P.pos.x += dx / d * st; P.pos.z += dz / d * st; }
  }; };
  const node = (k) => ({ x: NODES[k][0], z: NODES[k][1], y: NODES[k][2] || 0 });
  const rows = (id) => N.D.log.entries().filter((e) => e.id === id);
  const headD = () => { const h = E.headWorld(new (g.camera.position.constructor)()); return Math.hypot(h.x - P.pos.x, h.z - P.pos.z); };
  window.__T = { g, N, H, E, P, F, W, gz, NODES, DT, reset, stand, face, frame, run, walker, node, rows, headD };
}

module.exports = {
  name: 'thing',
  timeout: 900e3,
  async run(browser, Hh) {
    const { alone, nightPage, ok, clean } = Hh;
    const notes = [];
    // ---- the source: no stopwatch catch, turning scaled by the frame's dt, no strings in the hunter or the body
    {
      const hunter = fs.readFileSync(path.join(ROOT, 'js', 'hunter.js'), 'utf8'), nights = fs.readFileSync(path.join(ROOT, 'js', 'nights.js'), 'utf8'), entity = fs.readFileSync(path.join(ROOT, 'js', 'entity.js'), 'utf8');
      for (const [f, src] of [['hunter.js', hunter], ['nights.js', nights]]) {
        const bad = src.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => STOPWATCH.test(l));
        ok(!bad.length, `${f}: a 3.2 s timer: ${bad.map(([i, l]) => i + ': ' + l.trim().slice(0, 90)).join(' | ')}`);
      }
      // every faceTowards in the hunter turns by the frame's share (Math.min(1, dt * k)) or snaps (1) at a placement
      const turns = (hunter.match(/faceTowards\([^;]*\)/g) || []).filter((c) => !/,\s*(1|Math\.min\(1,\s*dt\s*\*[^)]*\)|turn)\s*\)$/.test(c));
      ok(!turns.length, `hunter.js turns not scaled by dt: ${turns.join(' | ')}`);
      const crawlCode = nights.slice(nights.indexOf('async function crawlAt'), nights.indexOf('function photoTaken'));
      for (const [f, src] of [['hunter.js', hunter], ['entity.js', entity], ['the crawl code', crawlCode]]) ok(!/sfx\.(violins|scream)\(/.test(src), `${f} still calls sfx.violins or sfx.scream`);
      for (const k of ['floor_slap', 'cloth', 'bone_crack', 'breath', 'rattle']) ok(new RegExp(`'${k}'`).test(hunter), `the crawl does not play ${k}`);
      notes.push('source: no stopwatch, dt turns, no strings, the crawl set');
    }
    await alone(browser, async (c) => {
      const { page, w } = await nightPage(c, '#night4');
      await page.evaluate(async () => { window.__NODES = (await import('/js/nav.js')).NODES; });
      await page.evaluate(lib);
      const E = (fn, arg) => page.evaluate(fn, arg);

      // ---- 1. law 2: place/sight refuse a node on screen or seen in the last 2 s, and leave E as it was
      const law2 = await E(async () => {
        const { reset, stand, face, run, H, E: Ent, node } = window.__T; reset();
        stand(5.48, -0.42, 10.16, -0.42);   // hallW, looking east down the hall at hallM
        await run(0.3);
        const r = { onPlace: H.place('hallM'), visA: Ent.visible, onSight: H.sight('hallM', {}), visB: Ent.visible };
        face(1.98, -0.9); await run(0.2);                         // turned away: seen a moment ago
        r.recent = H.sight('hallM', {}); r.visC = Ent.visible;
        await run(2.3);                                            // 2.3 s since: free again
        r.later = H.sight('hallM', {}); r.visD = Ent.visible; r.state = H.state; H.dismiss();
        return r;
      });
      ok(law2.onPlace === false && law2.onSight === false && !law2.visA && !law2.visB, `law 2 on screen: ${JSON.stringify(law2)}`);
      ok(law2.recent === false && !law2.visC, `law 2 seen 0.2 s ago: ${JSON.stringify(law2)}`);
      ok(law2.later === true && law2.visD && law2.state === 'sight', `sight 2.3 s after looking away: ${JSON.stringify(law2)}`);
      notes.push('law 2 refusal');

      // ---- 2. sight(node, { vanishOnLook: false, lookTime: 1.4, then: 'crawl', chaseDist: 6 }) stays while looked at, crawls after 1.4 s
      const sightCrawl = await E(async () => {
        const { reset, stand, face, run, H, E: Ent } = window.__T; reset();
        stand(10.16, -0.42, 12, -0.42); await run(2.5);           // hallE, facing the end wall; hallW behind
        const okSight = H.sight('hallW', { vanishOnLook: false, lookTime: 1.4, then: 'crawl', chaseDist: 6, stab: false });
        face(5.48, -0.42, 1.0);
        const s = []; for (let i = 0; i < 6; i++) { await run(0.3); s.push([+(0.3 * (i + 1)).toFixed(1), H.state, Ent.visible, Ent.mode]); }
        H.dismiss(); return { okSight, s };
      });
      ok(sightCrawl.okSight, `sight refused: ${JSON.stringify(sightCrawl)}`);
      ok(sightCrawl.s.slice(0, 4).every((r) => r[1] === 'sight' && r[2]), `it did not stay while looked at: ${JSON.stringify(sightCrawl.s)}`);
      ok(sightCrawl.s.slice(5).every((r) => r[1] === 'crawl'), `it did not crawl after 1.4 s: ${JSON.stringify(sightCrawl.s)}`);
      notes.push('sight then crawl');

      // ---- 3. crawl(from, { free: true }) goes round what is in the way with no graph; 4. it catches only with its head within 0.9 m
      const free = await E(async () => {
        const { reset, stand, run, H, E: Ent, F, P, headD } = window.__T; reset();
        // out in the front yard, a crate-sized block (put there for this) between them; it starts on the far side
        const W = window.__T.W, block = { minX: -2.0, maxX: -1.0, minZ: -12.8, maxZ: -11.8, on: true, id: 'testBlock' }; W.colliders.push(block);
        stand(-1.5, -10.0, -1.5, -14.6); await run(0.5);
        Ent.visible = true; Ent.root.position.set(-1.5, 0, -14.6); Ent.faceTowards(-1.5, -10.0, 1); Ent.mode = 'crawl'; Ent.snap = 1;
        const started = H.crawl(null, { free: true, speed: 2.5 });
        const track = []; let caughtAt = null, minHead = 9, inside = 0;
        for (let i = 0; i < 60 * 8 && !F.dead; i++) {
          await run(1 / 60); const p = Ent.root.position; if (H.blockedAt(p.x, p.z, 0.25)) inside++;
          minHead = Math.min(minHead, headD()); if (i % 30 === 0) track.push([+p.x.toFixed(2), +p.z.toFixed(2)]);
          if (F.dead && caughtAt === null) caughtAt = headD();
        }
        W.colliders.splice(W.colliders.indexOf(block), 1);
        const r = { started, track, pathLen: H.S.path.length, caught: F.dead, caughtAt, minHead, inside };
        await run(2.0);   // the catch plays out (its three frames, the black) before the next scene
        return r;
      });
      ok(free.started, `crawl free did not start: ${JSON.stringify(free)}`);
      ok(free.pathLen === 0, `the free crawl used the graph: ${JSON.stringify(free)}`);
      ok(free.inside === 0, `the free crawl's root went into something ${free.inside} frames: ${JSON.stringify(free.track)}`);
      ok(free.caught && free.caughtAt !== null && free.caughtAt < 0.95, `the free crawl did not catch by contact: ${JSON.stringify(free)}`);
      notes.push(`free crawl round the block, caught at head ${free.caughtAt && free.caughtAt.toFixed(2)} m`);

      // ---- 4b. no line to you: no catch however close; 5. out of sight 2 s it stops and the next flicker takes it
      const lost = await E(async () => {
        const { reset, stand, run, H, E: Ent, F, P, node } = window.__T; reset();
        stand(7.63, -0.42, 5.48, -0.42); await run(0.5);
        Ent.visible = true; Ent.root.position.set(4.5, 0, -0.42); Ent.faceTowards(7.63, -0.42, 1); Ent.mode = 'crawl'; Ent.snap = 1;
        H.crawl(null, { speed: 1.6 });
        await run(0.5);
        // the player is suddenly somewhere it has no line to (Mom and Dad's room, through the walls)
        const W = window.__T.W; stand(-5.4, 2.95, -5.4, 4);
        const states = []; let goneAt = null, deadAt = null;
        for (let i = 0; i < 60 * 3.5; i++) { await run(1 / 60); if (i % 15 === 0) states.push([+(i / 60).toFixed(2), H.state, Ent.visible, +Ent.root.position.x.toFixed(2), +Ent.root.position.z.toFixed(2), H.sees(14)]); if (goneAt === null && !Ent.visible) goneAt = i / 60; if (deadAt === null && F.dead) deadAt = i / 60; }
        return { states, goneAt, deadAt, dead: F.dead, flicker: F.flicker };
      });
      ok(!lost.dead, `it caught with no line to you: ${JSON.stringify(lost)}`);
      ok(lost.goneAt !== null && lost.goneAt >= 1.95 && lost.goneAt < 2.4, `it was not gone ~2 s after losing you: ${JSON.stringify(lost)}`);
      notes.push(`lost for 2 s, gone at ${lost.goneAt}`);

      // ---- 7. a stalk frozen 3 s writes stalkFrozen; 8. a search passing an occupied pod writes podPassed
      const rowsA = await E(async () => {
        const { reset, stand, face, run, H, E: Ent, rows, N, P, node, NODES } = window.__T; reset();
        stand(10.16, -0.42, 12, -0.42); await run(2.5);
        const st = H.stalk('hallW'); face(5.48, -0.42, 1.0);
        await run(3.4); const frozen = rows('stalkFrozen').length; H.dismiss();
        reset(); H.S.cool = 0;
        // in the office's closet; a search that goes to the middle of the office passes its door
        P.mode = 'hide'; P.pod = 'closet_room2'; const c = N.PODS.closet_room2.cam; P.pos.set(c[0], 0, c[2]);
        H.place('r2In', { force: true }); H.S.lastSeen = { x: NODES.r2In[0], z: NODES.r2In[1] }; H.startSearch(); H.S.searchList = ['r2Mid']; H.S.searchWait = 0; H.S.forcePod = null; H.S.checks = {};
        H.S.path = ['r2In', 'r2Alc', 'r2Mid']; H.S.pi = 0;
        await run(3);
        const passed = rows('podPassed').length; H.dismiss(); P.mode = 'walk'; P.pod = null;
        return { st, frozen, passed };
      });
      ok(rowsA.st && rowsA.frozen >= 1, `no stalkFrozen row: ${JSON.stringify(rowsA)}`);
      ok(rowsA.passed >= 1, `no podPassed row: ${JSON.stringify(rowsA)}`);
      notes.push('stalkFrozen, podPassed');

      // ---- 9. the crumple stage reaches hunter.crawl (F3's stageTick no longer takes its straight-line fallback)
      const stage = await E(async () => {
        const { reset, stand, face, run, H, E: Ent, N, P, F } = window.__T; reset();
        // looked down the living room, then turned to the kitchen wall: the floor behind is the blind spot (with room there for it, and
        // for the crawl it unfolds into, or it is not staged at all)
        stand(1.2, -0.2, 1.2, -3.0); await run(1.2); face(1.2, 1.0); await run(0.3);
        let st = null;
        for (let i = 0; i < 12 && !st; i++) { if (N.stage.SCARES.crumple.run()) st = N.stage.ST.on; else { face(1.2 + Math.sin(i) * 1.5, -3.0); await run(0.5); face(1.2, 1.0); await run(0.2); } }
        if (!st) return { staged: false };
        face(st.p.x, st.p.z, 0.4); await run(0.5, { stage: true });
        N.stage.crawlAt(st);
        await run(1.5, { stage: true });
        const r = { staged: true, seen: !!st.seen, via: st.crawl && st.crawl.via, state: H.state, mode: Ent.mode };
        N.stage.endStage(); H.dismiss(); return r;
      });
      ok(stage.staged, `the crumple could not be staged: ${JSON.stringify(stage)}`);
      ok(stage.via === true && (stage.state === 'crawl' || stage.state === 'open' || stage.state === 'away'), `stageTick did not reach hunter.crawl: ${JSON.stringify(stage)}`);
      notes.push(`crumple -> hunter.crawl (${stage.state}, ${stage.mode})`);

      // ---- revision 4 (1): broken line of sight at the arch: it goes where it last saw you and stands there listening at least 4 s
      const arch = await E(async () => {
        const { reset, stand, run, H, E: Ent, F, P, walker, node } = window.__T; reset(); H.setLevel(4);
        stand(2.88, -0.36, -1.5, -0.36); await run(2.5);   // at the arch, its back to the hall
        const began = H.hunt('hallW'); await run(0.2);
        // the player runs through the arch into the kitchen; once round its edge they are out of its sight for good (put in Mom and
        // Dad's room, through the walls), so what it does next is what it does with nothing to go on
        const move = walker([[2.88, 1.03], [2.75, 1.9]], 4.4, { sprint: true });
        let lostAt = null, held = 0, heldAt = null, maxHeld = 0, ls = null, gone = false;
        for (let i = 0; i < 60 * 16; i++) {
          await run(1 / 60, { move }); if (F.dead) break;
          if (!gone && Math.hypot(P.pos.x - 2.75, P.pos.z - 1.9) < 0.05) { gone = true; lostAt = i / 60; stand(-5.4, 2.95, -5.4, 4); }
          if (H.state === 'search' && H.S.searchWait > 0 && H.S.listenedAt) { if (!heldAt) { heldAt = { x: Ent.root.position.x, z: Ent.root.position.z }; ls = { ...H.S.lastSeen }; } const d = Math.hypot(Ent.root.position.x - heldAt.x, Ent.root.position.z - heldAt.z); if (d < 0.3) { held += 1 / 60; maxHeld = Math.max(maxHeld, held); } }
          else if (heldAt) break;
        }
        const r = { began, lostAt, maxHeld: +maxHeld.toFixed(2), heldAt, lastSeen: ls, dead: F.dead, state: H.state }; H.dismiss(); return r;
      });
      ok(arch.began, `the arch chase did not begin: ${JSON.stringify(arch)}`);
      ok(!arch.dead && arch.maxHeld >= 4, `it did not hold 4 s where it lost you at the arch: ${JSON.stringify(arch)}`);
      ok(arch.heldAt && arch.lastSeen && Math.hypot(arch.heldAt.x - arch.lastSeen.x, arch.heldAt.z - arch.lastSeen.z) < 1.6, `it did not listen at the last-seen point: ${JSON.stringify(arch)}`);
      notes.push(`arch: held ${arch.maxHeld} s`);

      // ---- revision 4 (1b): the player who breaks its line of sight and walks 2.5 s to a hiding place is not seen getting in
      const hide = await E(async () => {
        const { reset, stand, run, H, E: Ent, F, P, N, walker } = window.__T; reset(); H.setLevel(4);
        H.setLevel(1);
        stand(4.5, -0.42, 12, -0.42); await run(2.5);   // at the living room's mouth, its back to the room
        const began = H.hunt('livFar'); await run(0.2); const chased = H.state === 'hunt' && H.sees();
        // a player who runs well: down the hall and into your room, the door pulled shut behind, out of its sight; then a walk (not a
        // run) to your closet, and in at 2.5 s
        const move = walker([[9.95, -0.3], [9.95, 0.9]], 4.4, { sprint: true });
        let t = 0; while (t < 4 && (H.sees() || P.pos.z < 0.85)) { await run(1 / 60, { move }); t += 1 / 60; }
        const lostAt = t; window.__T.W.setDoor('kid', false);
        const walk = walker([[9.2, 1.2], [8.15, 1.3]], 2.0); let walked = 0; const track = [];
        for (let i = 0; i < 150; i++) { await run(1 / 60, { move: walk }); walked += 1 / 60; if (i % 20 === 0) track.push([H.state, +Ent.root.position.x.toFixed(2), +Ent.root.position.z.toFixed(2), H.S.lastSeen && +H.S.lastSeen.x.toFixed(2), H.S.lastSeen && +H.S.lastSeen.z.toFixed(2), +H.S.searchWait.toFixed(1)]); }
        window.__hideTrack = track;
        const seenThen = H.sees(30);
        N.enterPod('closet_kid'); await run(1.2, { until: () => P.mode === 'hide' });
        const r = { began, chased, track: window.__hideTrack, lostAt, walked: +walked.toFixed(2), seenThen, sawEnter: H.S.sawEnter || null, state: H.state, forcePod: H.S.forcePod, dead: F.dead, tPos: [+Ent.root.position.x.toFixed(2), +Ent.root.position.z.toFixed(2)] };
        H.dismiss(); P.mode = 'walk'; P.pod = null; return r;
      });
      ok(hide.began && hide.chased, `the chase did not begin: ${JSON.stringify(hide)}`);
      ok(!hide.dead && !hide.sawEnter && !hide.forcePod, `it saw the player get into the closet: ${JSON.stringify(hide)}`);
      notes.push(`hid unseen after a ${hide.walked} s walk (it was at ${hide.tPos}, ${hide.state})`);

      // ---- revision 4 (2): a door shut behind you holds it at the leaf at least 1.2 s, then it shoves it open
      const door = await E(async () => {
        const { reset, stand, face, run, H, E: Ent, F, W, P, walker } = window.__T; reset(); H.setLevel(4);
        stand(7.63, -0.42, 12, -0.42); await run(2.5);
        const began = H.hunt('hallW'); await run(0.3);
        const move = walker([[9.95, -0.42], [9.95, 1.39], [9.4, 2.4]], 4.4, { sprint: true });
        let shut = false, t = 0;
        for (let i = 0; i < 60 * 9 && !F.dead; i++) {
          await run(1 / 60, { move }); t += 1 / 60;
          if (!shut && P.pos.z > 1.2) { shut = true; W.setDoor('kid', false, true); }
          if (H.S.lastShove) break;
        }
        const r = { began, shove: H.S.lastShove || null, open: W.doors.kid.target, dead: F.dead }; H.dismiss(); return r;
      });
      ok(door.began, `the door chase did not begin: ${JSON.stringify(door)}`);
      ok(door.shove && door.shove.door === 'kid' && door.shove.held >= 1.2 && door.open === 1, `the shut door did not hold it 1.2 s: ${JSON.stringify(door)}`);
      notes.push(`door held ${door.shove && door.shove.held.toFixed(2)} s`);

      // ---- revision 4 (3): getting into a hiding place while it can see you within 9 m: it opens that place (the catch)
      const seenIn = await E(async () => {
        const { reset, stand, run, H, E: Ent, F, N, P } = window.__T; reset(); H.setLevel(1);
        stand(8.1, 1.25, 7.0, 3.0); await run(2.5);   // beside your closet; it comes in from the hall, through your open door
        H.hunt('hallE'); await run(0.1);
        N.enterPod('closet_kid'); await run(1.2, { until: () => P.mode === 'hide' });
        let opened = false;
        for (let i = 0; i < 60 * 8 && !F.dead; i++) { await run(1 / 60); if (H.state === 'open') opened = true; }
        const r = { sawEnter: H.S.sawEnter || null, opened, dead: F.dead, state: H.state, tPos: [+Ent.root.position.x.toFixed(2), +Ent.root.position.z.toFixed(2)] }; return r;
      });
      ok(seenIn.sawEnter === 'closet_kid' && seenIn.opened && seenIn.dead, `seen getting in, it did not open the closet: ${JSON.stringify(seenIn)}`);
      notes.push('seen getting in: opened');
      clean(w);
    });

    // a fresh page for the rest (the last scene ended in a catch)
    await alone(browser, async (c) => {
      const { page, w } = await nightPage(c, '#night4');
      await page.evaluate(async () => { window.__NODES = (await import('/js/nav.js')).NODES; });
      await page.evaluate(lib);
      const E = (fn, arg) => page.evaluate(fn, arg);

      // ---- revision 4 (4): 10 000 seeded rolls with every guard satisfied open 5 % +- 0.6 %; with a guard, never
      const rolls = await E(async () => {
        const { loomOpens } = await import('/js/hunter.js');
        let open = 0, guarded = 0; const seed = 'a fixed seed for the count';   // (fixed, so the count is the same every run)
        for (let i = 0; i < 10000; i++) {
          if (loomOpens({ seed, n: 2 + (i % 8), index: i, firstSurvived: false, lastOpened: false, owned: false })) open++;
          for (const g of [{ n: 1 }, { firstSurvived: true }, { lastOpened: true }, { owned: true }]) if (loomOpens({ seed, n: 3, index: i, firstSurvived: false, lastOpened: false, owned: false, ...g })) guarded++;
        }
        return { open, freq: open / 10000, guarded };
      });
      ok(Math.abs(rolls.freq - 0.05) <= 0.006, `loom rolls opened ${rolls.freq}`);
      ok(rolls.guarded === 0, `a guarded loom opened ${rolls.guarded} times`);
      notes.push(`loom rolls ${(rolls.freq * 100).toFixed(2)} %`);

      // ---- (4b): an opening loom lasts 2.5-3.5 s longer, its breathing is heard, the leaf twitches once, then it opens and catches
      const longLoom = await E(async () => {
        const { reset, run, H, E: Ent, F, P, N, g } = window.__T; reset();
        const { loomRoll } = await import('/js/hunter.js');
        const R = g.RUN, n = F.night || 4; let idx = 0; while (loomRoll(R.seed, n, idx) >= 0.05) idx++;
        R.looms = { n: idx, survived: 1, lastOpened: false }; if (R.story) R.story.lastLoomOpened = false;
        P.mode = 'hide'; P.pod = 'closet_kid'; const c = N.PODS.closet_kid.cam; P.pos.set(c[0], 0, c[2]);
        const picks = []; const pick0 = g.sfx.pick.bind(g.sfx); g.sfx.pick = (k, o) => { picks.push([k, +(H.S.loomT || 0).toFixed(2)]); return pick0(k, o); };
        H.loom('closet_kid');
        const base = H.S.loomBase, dur = H.S.loomDur, open = H.S.loomOpen;
        let twitches = 0, was = false, openedAt = null;
        for (let i = 0; i < 60 * 14 && !F.dead; i++) { await run(1 / 60); if (H.S.loomTwitched && !was) { twitches++; was = true; } if (openedAt === null && H.state === 'open') openedAt = H.S.loomT; }
        g.sfx.pick = pick0;
        const breaths = picks.filter(([k, t]) => k === 'breath' && t > base).length;
        const r = { idx, open, base: +base.toFixed(2), extra: +(dur - base).toFixed(2), twitches, breaths, openedAt: openedAt && +openedAt.toFixed(2), dead: F.dead, last: R.looms.lastOpened };
        return r;
      });
      ok(longLoom.open && longLoom.extra >= 2.5 && longLoom.extra <= 3.5, `the opening loom was not 2.5-3.5 s longer: ${JSON.stringify(longLoom)}`);
      ok(longLoom.twitches === 1 && longLoom.breaths >= 1, `no twitch or breathing before it opened: ${JSON.stringify(longLoom)}`);
      ok(longLoom.dead && longLoom.last === true, `it did not open the place and catch: ${JSON.stringify(longLoom)}`);
      notes.push(`loom +${longLoom.extra} s, opened`);
      clean(w);
    });

    await alone(browser, async (c) => {
      const { page, w } = await nightPage(c, '#night4');
      await page.evaluate(async () => { window.__NODES = (await import('/js/nav.js')).NODES; });
      await page.evaluate(lib);
      const E = (fn, arg) => page.evaluate(fn, arg);
      // ---- revision 4 (5): the aimed beam on its head within 4 m flinches it 0.8 s, once a chase; the flash within 5 m stuns it 1.5 s, once a chase
      const light = await E(async () => {
        const { reset, stand, face, run, H, E: Ent, F, N, rows } = window.__T; reset(); H.setLevel(4);
        stand(10.16, -0.42, 12, -0.42); await run(2.5);
        H.place('hallM', { force: true }); H.hunt('hallM'); H.S.replan = 99; H.S.path = []; Ent.root.position.set(7.4, 0, -0.42);
        const hd = Ent.headWorld(new (window.__game.camera.position.constructor)()); face(hd.x, hd.z, hd.y);
        F.flashOn = true; F.flashAimed = true;
        let flinchT = 0; for (let i = 0; i < 90; i++) { await run(1 / 60); const h2 = Ent.headWorld(hd); face(h2.x, h2.z, h2.y); if (Ent.flinch > 0.01) flinchT += 1 / 60; }
        const f1 = rows('flinch').length;
        F.flashAimed = false; await run(0.3); F.flashAimed = true; await run(1.0);
        const f2 = rows('flinch').length;
        // the flash: a photo (the hands' flash mark when they have one, else the photo this file hears)
        F.flashAimed = false; F.flashOn = false;
        const hands = window.__game.hands; const fire = () => { if (hands && hands.flashAt !== undefined) hands.flashAt = window.__game.gameTime + Math.random(); else N.stage.photoTaken(); };
        await run(0.1); fire(); let stunT = 0; for (let i = 0; i < 150; i++) { await run(1 / 60); if (Ent.stun > 0.01) stunT += 1 / 60; const h2 = Ent.headWorld(hd); face(h2.x, h2.z, h2.y); }
        const s1 = rows('flashStun').length; fire(); await run(0.5); const s2 = rows('flashStun').length;
        H.dismiss();
        return { flinchT: +flinchT.toFixed(2), f1, f2, stunT: +stunT.toFixed(2), s1, s2, hd: [hd.x, hd.y, hd.z].map((v) => +v.toFixed(2)) };
      });
      ok(light.f1 === 1 && light.f2 === 1 && light.flinchT > 0.5 && light.flinchT <= 0.85, `the flinch: ${JSON.stringify(light)}`);
      ok(light.s1 === 1 && light.s2 === 1 && light.stunT > 1.2 && light.stunT <= 1.55, `the stun: ${JSON.stringify(light)}`);
      notes.push(`flinch ${light.flinchT} s, stun ${light.stunT} s`);

      // ---- revision 4 (6): a sprint within 8 m moves the last-seen point; a walk beyond 3 m does not
      const ears = await E(async () => {
        const { reset, stand, run, H, E: Ent, F, walker } = window.__T; reset(); H.setLevel(4);
        stand(10.16, -0.42, 12, -0.42); await run(0.2);
        H.place('hallW', { force: true }); H.S.lastSeen = { x: 5.48, z: -0.42 }; H.startSearch(); H.S.searchWait = 30; H.S.path = []; Ent.root.position.set(4.6, 0, -0.42);
        // a walk 6 m off (with a line to it, too far for it to see in the dark): not heard
        stand(10.6, -0.42); const w1 = walker([[10.6, -0.9], [10.6, -0.2], [10.6, -0.9]], 1.8); await run(2.5, { move: w1 });
        const afterWalk = { ...H.S.lastSeen };
        // a sprint 6 m off: heard, and where it thinks you are is where you ran
        stand(10.6, -0.42); const w2 = walker([[10.6, -0.9], [10.6, -0.2], [10.6, -0.9]], 4.4, { sprint: true }); await run(1.5, { move: w2 });
        const afterSprint = { ...H.S.lastSeen }; const r = { afterWalk, afterSprint, state: H.state }; H.dismiss(); return r;
      });
      ok(Math.hypot(ears.afterWalk.x - 5.48, ears.afterWalk.z + 0.42) < 0.01, `a walk 6 m off was heard: ${JSON.stringify(ears)}`);
      ok(ears.afterSprint.x > 10, `a sprint 6 m off was not heard: ${JSON.stringify(ears)}`);
      notes.push('hears a sprint, not a far walk');
      clean(w);
    });
    return notes.join('; ');
  },
};
