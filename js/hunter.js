// The thing that lives in the house. It is put somewhere you are not looking, shows itself, creeps toward you, hunts you through the
// house (shoving shut doors open on the way), loses you when you break its line of sight, listens where it last saw you, searches, and
// checks the places you might hide. States:
//   away    not in the world
//   sight   standing somewhere you will see it (then gone, or after it, by `then`)
//   stalk   walks toward you, frozen while you look at it
//   hunt    runs at you while it can see you; when it cannot, to where it last did
//   crawl   comes at you on all fours: on the graph indoors, straight at you round the trunks outdoors (free); it catches by contact only
//   search  stands and listens where it last saw you, then looks round the places near it
//   loom    stands over your hiding place while you hold your breath
//   open    opens your hiding place: it saw you get in, or one loom in twenty it opens the place anyway
//   leave   walks away and fades from the world
// The contract the other parts of the game read (design 6.2, 6.7):
//   place(node) / sight(node, opts) refuse a node on screen or seen in the last 2 s and return false, leaving E as it was (law 2);
//   sight opts: dur, facing, turnDist, chase, stab, tilt, vanishOnLook, lookTime, then: 'hunt' | 'crawl' | 'vanish', chaseDist;
//   crawl(from, { free, speed, sprintSpeed, chaseDist }); stalk / hunt / vanish(flicker); the log rows stalkFrozen, podPassed, flinch,
//   flashStun, loomSurvived, loomOpened.
import * as THREE from 'three';
import { SLAM } from './audio.js';
import { NODES, path as navPath, nearestNode, dist as navDist, edgeDoor, pathLength, LOW, crawlEdge } from './nav.js';
import { active as colliderOn, onFloor as colliderOnFloor, leafOf, segNear } from './collide.js';
import { rng } from './rng.js';
import * as log from './log.js';

const V3 = THREE.Vector3;
const clamp = THREE.MathUtils.clamp;
// how long it stands and listens where it lost you (7 s on the first nights down to 4 s by level 9), how long a shut door holds it
export const listenFor = (level) => clamp(7 - (level - 1) * 0.375, 4, 7);
export const doorHoldFor = (level) => clamp(2.0 - (level - 1) * 0.1, 1.2, 2.0);
// what it hears of your feet: a sprint within 8 m, a walk within 3 m, half as far through a wall; standing still, nothing
export const HEAR = { sprint: 8, walk: 3, wall: 0.5 };
// the loom that opens the place anyway: exactly one in twenty of the looms you would have lived through, seeded so a replayed seed
// opens the same ones, and never on night one, never on the run's first survived loom (the first one teaches the rule), never twice
// in a row, never while a scripted beat owns the loom
export const LOOM_OPEN_P = 0.05;
export function loomRoll(seed, n, index) { return rng(`${seed}:loom:${n}:${index}`)(); }
export function loomOpens({ seed, n, index, firstSurvived, lastOpened, owned }) {
  if (n <= 1 || firstSurvived || lastOpened || owned) return false;
  return loomRoll(seed, n, index) < LOOM_OPEN_P;
}

export function createHunter(ctx) {
  const { E, W, sfx, P, F, camera } = ctx;
  const S = {
    state: 'away', path: [], pi: 0, node: 'hallE', speed: 0, level: 1, cool: 0,
    lastSeen: null, lostT: 0, replan: 0, doorWait: 0, doorName: null, doorHeldT: 0,
    sightT: 0, sightDur: 4, seenT: 0, sightOpts: {}, frozen: false, lookT: 0, frozenT: 0, frozenLogged: false,
    searchList: [], searchWait: 0, searchT: 0, forcePod: null, heard: 0, checks: {}, passed: false,
    lurkT: 0, loomT: 0, loomDur: 5, loomPod: null, loomOpen: false, loomTwitched: false, stepAcc: 0, hb: 0, leaveT: 0, startedAt: 0,
    crawl: null, hold: 0, flinchT: 0, stunT: 0, flinchUsed: false, stunUsed: false, lastFlash: undefined, steps: { x: 0, z: 0, acc: 0 }, openT: 0,
  };
  const tmp = new V3(), dirv = new V3(), head = new V3();
  E.ground = W.groundAt || null; E.colliders = W.colliders;
  const gaze = () => (ctx.gaze ? ctx.gaze() : null);
  const logRow = (id, extra = {}) => { try { log.push({ id, seen: true, p: { x: +E.root.position.x.toFixed(2), z: +E.root.position.z.toFixed(2) }, ...extra }); } catch (e) { /* no ledger yet */ } };

  // ---- sight lines ----
  function los(ax, az, bx, bz, ay = 0, by = 0) {
    if (Math.abs(ay - by) > 1.2) return false;   // another floor: the laundry lies under Mom and Dad's room
    for (const c of W.colliders) {
      if (!c.on || !(c.wall || c.door)) continue;
      let t0 = 0, t1 = 1;
      const dx = bx - ax, dz = bz - az;
      for (const [o, d, lo, hi] of [[ax, dx, c.minX, c.maxX], [az, dz, c.minZ, c.maxZ]]) {
        if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) { t1 = -1; break; } continue; }
        let a = (lo - o) / d, b = (hi - o) / d; if (a > b) [a, b] = [b, a];
        t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) break;
      }
      if (t1 >= t0 && t1 > 0) return false;
    }
    return true;
  }
  const ep = () => E.root.position;
  const settle = () => { if (W.groundAt) ep().y = W.groundAt(ep().x, ep().z, ep().y); };   // on the stairs and in the laundry it stands on the floor there
  const gap = () => Math.hypot(P.pos.x - ep().x, P.pos.z - ep().z);
  // light gives you away: standing in a lit room it sees you from half as far again
  const litBoost = () => (ctx.lit ? 1 + 0.5 * ctx.lit(P.pos.x, P.pos.z, P.pos.y) : 1);
  const sees = (maxD = 14) => !hidden() && gap() < maxD * litBoost() && los(ep().x, ep().z, P.pos.x, P.pos.z, ep().y, P.pos.y);
  const hidden = () => ctx.hidden();
  const playerNode = () => nearestNode(P.pos.x, P.pos.z, (k) => los(P.pos.x, P.pos.z, NODES[k][0], NODES[k][1], P.pos.y, NODES[k][2] || 0), P.pos.y) || nearestNode(P.pos.x, P.pos.z, null, P.pos.y);
  const doorClosed = (name) => W.doors[name] && W.doors[name].target === 0;
  // is the player looking toward a point (cos threshold) with nothing in between?
  function looking(x, z, cos = 0.8, y = 1.2) {
    camera.getWorldDirection(dirv);
    tmp.set(x - camera.position.x, y - camera.position.y, z - camera.position.z); const d = tmp.length(); if (d < 0.1) return true;
    return tmp.divideScalar(d).dot(dirv) > cos && los(camera.position.x, camera.position.z, x, z);
  }
  const inView = (x, z, cos = 0.55) => looking(x, z, cos);
  const headPos = () => E.headWorld(head);

  // ---- placing and moving ----
  // law 2: it is never put where you are looking or were looking a moment ago (the lights out of a flicker are the one cover)
  function refused(node) {
    const g = gaze(); if (!g || !NODES[node] || F.flicker) return false;
    const [x, z, y = 0] = NODES[node], p = { x, z, y };
    return g.onScreen(p, 1.15) || g.sawRecently(p, 2);
  }
  function place(node, { force = false } = {}) {
    if (!NODES[node]) return false;
    if (!force && !E.visible && refused(node)) return false;
    const [x, z, y = 0] = NODES[node]; E.root.position.set(x, y, z); S.node = node; E.visible = true;
    E.lookTarget = camera.position; E.mode = 'idle'; E.lean = 0; E.reach = 0; E.tilt = 0.3; E.smileScale = 1; E.speed = 1; E.sneak = false;
    E.flinch = 0; E.stun = 0; E.duckHold = null; E.catchPose = null;
    return true;
  }
  function planTo(node, from = null) {
    const start = from || S.node || nearestNode(ep().x, ep().z, null, ep().y);
    const p = navPath(start, node, doorClosed); if (!p) return false;
    S.path = p; S.pi = 0; S.thru = -1;
    // already between the first two nodes of the new path (a replan while it walks): carry on to the second rather than turning back to the first
    if (p.length > 1) {
      const [ax, az] = NODES[p[0]], [bx, bz] = NODES[p[1]], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
      const t = ((ep().x - ax) * dx + (ep().z - az) * dz) / l2, px = ax + dx * t - ep().x, pz = az + dz * t - ep().z;
      if (t > 0.02 && t < 1 && Math.hypot(px, pz) < 0.5) S.pi = 1;
      else if (Math.hypot(ax - ep().x, az - ep().z) < 0.2) S.pi = 1;
    }
    return true;
  }
  // the edge of the light: it will not walk into a lit room while you are watching it. It stops in the dark just short of the light and
  // waits, looking at you (ctx.onEdge hears how long, and may take the light away); look away, or lose the light, and it comes on
  function edgeHold(dt) {
    if (!ctx.lit || S.pi >= S.path.length || !E.visible) { S.edge = 0; return false; }
    const [tx, tz] = NODES[S.path[S.pi]], dx = tx - ep().x, dz = tz - ep().z, d = Math.hypot(dx, dz) || 1, a = Math.min(0.75, d);
    const ax = ep().x + dx / d * a, az = ep().z + dz / d * a;
    if (ctx.lit(ax, az, ep().y) < 0.45 || ctx.lit(ep().x, ep().z, ep().y) > 0.3 || !looking(ep().x, ep().z, 0.6, 1.6)) { S.edge = 0; return false; }
    S.edge = (S.edge || 0) + dt; E.mode = 'idle'; E.speed = 0.3; E.faceTowards(P.pos.x, P.pos.z, Math.min(1, dt * 5)); E.lookTarget = camera.position;
    if (ctx.onEdge) ctx.onEdge(S.edge, ax, az);
    return true;
  }
  // a shut door in its way: it stops at the leaf (1.2-2 s, less the higher the level), then shoves it open (it never turns a knob): the
  // door slams back, placed at the door, and shakes you if you are within 6 m. Then it waits a moment outside the swing while the leaf opens
  function doorTick(dt) {
    if (S.doorWait <= 0) return false;
    S.doorWait -= dt; S.doorHeldT += dt; E.mode = 'idle'; E.crawlSpeed = 0;
    if (S.doorWait <= 0 && S.doorName) {
      const d = W.doors[S.doorName], at = { x: d.mid.x, y: (d.y0 || 0) + 1.1, z: d.mid.z };
      W.setDoor(S.doorName, true);
      if (!sfx.pick('door_slam', { gain: 1, at, wet: 0.35 })) sfx.slamFar(ctx.panFor(tmp.set(at.x, at.y, at.z)));
      if (Math.hypot(P.pos.x - at.x, P.pos.z - at.z) < 6) ctx.addShake(0.45);
      S.lastShove = { door: S.doorName, held: S.doorHeldT };
      S.doorName = null; S.doorWait = 0.45;
    }
    return true;
  }
  // along S.path by `dist` metres; returns true on arrival. turn: how fast it turns to its heading
  function advance(dist, turn, crawling = false) {
    let remaining = dist, moved = 0;
    while (remaining > 1e-4 && S.pi < S.path.length) {
      const id = S.path[S.pi]; let [tx, tz] = NODES[id], viaDoor = false;
      if (S.pi > 0) {   // a shut door on the way into this node?
        const d = edgeDoor(S.path[S.pi - 1], id);
        if (d && doorClosed(d)) {
          S.doorName = d; S.doorWait = doorHoldFor(S.level); S.doorHeldT = 0; E.faceTowards(tx, tz, 1);
          const m = W.doors[d].mid; sfx.pick('breath', { gain: 0.55, at: { x: m.x, y: 1.5, z: m.z }, rate: 0.6, wet: 0.3 });
          return false;
        }
        // through the middle of the doorway, not wherever the straight line between the nodes crosses it: the jambs are close
        if (d && S.thru !== S.pi) { const m = W.doors[d].mid; if (Math.hypot(m.x - ep().x, m.z - ep().z) > 0.06) { tx = m.x; tz = m.z; viaDoor = true; } else S.thru = S.pi; }
      }
      const dx = tx - ep().x, dz = tz - ep().z, d = Math.hypot(dx, dz);
      if (viaDoor && d <= remaining) { ep().x = tx; ep().z = tz; remaining -= d; moved += d; S.thru = S.pi; continue; }
      if (S.pi < S.path.length - 1 && d < 0.32 && !viaDoor) { S.node = id; S.pi++; continue; }   // cut the corner: head for the next node before reaching this one
      // the crawl does not step through a wall or a piece of furniture to keep to its line (the last guard)
      const step = Math.min(d, remaining), nx = ep().x + (d > 1e-6 ? dx / d * step : 0), nz = ep().z + (d > 1e-6 ? dz / d * step : 0);
      if (crawling && blockedAt(nx, nz, 0.3) && !blockedAt(ep().x, ep().z, 0.3)) break;
      if (!crawling && d > 0.04) E.faceTowards(tx, tz, turn);
      ep().x = nx; ep().z = nz; remaining -= step; moved += step;
      if (step >= d - 1e-6 && !viaDoor) { S.node = id; S.pi++; }
    }
    settle();
    return { arrived: S.pi >= S.path.length, moved };
  }
  function follow(dt, spd) {
    if (edgeHold(dt)) return false;
    if (doorTick(dt)) return false;
    if (S.hold > 0) { E.mode = 'idle'; return false; }   // the light in its face, the flash
    // level 5 on: it drops onto all fours to come through a doorway (and the laundry, with its low ceiling, is crawled at any level)
    const low = lowHere();
    if (low) {
      if (E.mode !== 'crawl') { E.mode = 'crawl'; E.snap = 1; E.lungeOut = 0; }
      E.crawlSpeed = spd; E.lookTarget = camera.position;
      const d = E.lungeOut; E.lungeOut = 0;
      const r = advance(d, 0, true); crawlFace(dt);
      return r.arrived;
    }
    if (E.mode === 'crawl') { E.mode = 'idle'; E.standUp(); }
    const r = advance(spd * dt, Math.min(1, dt * (spd > 2.6 ? 8 : 4.5)));
    E.mode = !r.moved ? 'idle' : spd > 2.6 ? 'run' : 'walk'; E.speed = spd / 3;
    if (r.moved) {
      S.stepAcc += r.moved;
      if (S.stepAcc > (E.mode === 'run' ? 1.05 : 0.85)) { S.stepAcc = 0; sfx.heavyStep(clamp(1.3 / (1 + gap() * 0.28), 0.06, 1), ctx.panFor(ep())); }
    }
    return r.arrived;
  }
  // on all fours: the laundry's own edges at any level (2.04 m under its joists: design 6.3; it comes through its door bent double and
  // goes down at the first node inside), and from level 5 every doorway
  function lowHere() {
    const a = S.pi > 0 ? S.path[S.pi - 1] : S.node, b = S.path[S.pi];
    if (b ? crawlEdge(a, b) : LOW.has(a)) return true;
    if (S.level < 5) return false;
    for (const k in W.doors) { const d = W.doors[k]; if (Math.abs((d.y0 || 0) - ep().y) < 1 && Math.hypot(d.mid.x - ep().x, d.mid.z - ep().z) < (E.mode === 'crawl' ? 1.5 : 1.1)) return true; }
    return false;
  }
  // in the laundry, under its joists (its node one of the laundry's own, on that floor)
  const lowSpot = () => ep().y < -1 && LOW.has(S.node);
  // the crawl's heading: toward a point 0.9 m further along its path (so the head and the hands keep to the path at a corner), or at you
  function crawlFace(dt, target = null) {
    let tx, tz;
    if (target) { tx = target.x; tz = target.z; }
    else {
      let left = 0.9, x = ep().x, z = ep().z;
      for (let i = S.pi; i < S.path.length && left > 0; i++) {
        const [nx, nz] = NODES[S.path[i]], d = Math.hypot(nx - x, nz - z);
        if (d >= left) { x += (nx - x) / d * left; z += (nz - z) / d * left; left = 0; break; }
        left -= d; x = nx; z = nz;
      }
      if (Math.hypot(x - ep().x, z - ep().z) < 0.05) { x = P.pos.x; z = P.pos.z; }
      tx = x; tz = z;
    }
    E.faceTowards(tx, tz, Math.min(1, dt * 12));
  }
  // what the crawl's body would run into at (x, z): the furniture and the walls on its floor and the door leaves; not the bodies (it
  // catches you by contact, it is not stopped by you)
  function blockedAt(x, z, r = 0.38) {
    const y0 = ep().y, h = 1.0;
    for (const c of W.colliders) {
      if (!colliderOn(c) || c.dressing || !colliderOnFloor(c, y0, h)) continue;
      const dx = Math.max(c.minX - x, 0, x - c.maxX), dz = Math.max(c.minZ - z, 0, z - c.maxZ);
      if (dx * dx + dz * dz < r * r) return true;
    }
    for (const k in W.doors) { const s = leafOf(W.doors[k]); if (!s || s.y1 < y0 || s.y0 > y0 + h) continue; if (segNear(s, x, z).d < r + s.t) return true; }
    return false;
  }
  function setState(s) { S.state = s; S.startedAt = ctx.now(); }
  const huntSpeed = () => clamp(2.95 + S.level * 0.14, 3.0, 4.15);
  const crawlSpeed = () => 3.2 + 0.3 * S.level;

  // ---- what it hears: your feet. A step is a stride of ground covered; a heard one is where it thinks you are ----
  function hearSteps(dt) {
    const st = S.steps, dx = P.pos.x - st.x, dz = P.pos.z - st.z, d = Math.hypot(dx, dz);
    st.x = P.pos.x; st.z = P.pos.z;
    if (d > 1.5 || P.mode !== 'walk' || hidden()) { st.acc = 0; return; }   // a jump (a placement), or not on its feet
    st.acc += d; if (st.acc < (P.sprinting ? 1.1 : 0.75)) return; st.acc = 0;
    const range = (P.sprinting ? HEAR.sprint : HEAR.walk) * (los(ep().x, ep().z, P.pos.x, P.pos.z, ep().y, P.pos.y) ? 1 : HEAR.wall);
    if (gap() < range) { S.lastSeen = { x: P.pos.x, z: P.pos.z }; S.heardAt = ctx.now(); }
  }
  // the light in its face: the aimed beam on its head within 4 m makes it flinch, once a chase; the camera's flash within 5 m stuns it
  // for 1.5 s, once a chase. Either holds it where it is
  function lightTick(dt) {
    if (S.flinchT > 0) { S.flinchT -= dt; E.flinch = clamp(S.flinchT / 0.2, 0, 1) * clamp((0.8 - S.flinchT) / 0.12 + 0.3, 0, 1); if (S.flinchT <= 0) E.flinch = 0; }
    if (S.stunT > 0) { S.stunT -= dt; E.stun = clamp(S.stunT / 0.35, 0, 1) * clamp((1.5 - S.stunT) / 0.1, 0, 1); if (S.stunT <= 0) E.stun = 0; }
    S.hold = Math.max(S.flinchT, S.stunT, 0);
    if (!E.visible || !['hunt', 'stalk', 'crawl', 'search', 'sight'].includes(S.state)) return;
    headPos();
    const dh = Math.hypot(head.x - camera.position.x, head.y - camera.position.y, head.z - camera.position.z);
    if (!S.flinchUsed && F.flashOn && ctx.aimed && ctx.aimed() && dh < 4 && looking(head.x, head.z, 0.97, head.y)) {
      S.flinchUsed = true; S.flinchT = 0.8; E.crawlSpeed = 0;
      sfx.pick('rattle', { gain: 0.6, at: { x: head.x, y: head.y, z: head.z }, rate: 1.15 });
      logRow('flinch');
    }
    const fl = ctx.flashAt ? ctx.flashAt() : null;
    if (fl !== S.lastFlash) {   // (the first look only notes what the last flash was)
      const fresh = S.lastFlash !== undefined; S.lastFlash = fl;
      if (fl !== null && fl !== undefined && fresh && !S.stunUsed && dh < 5 && looking(head.x, head.z, 0.82, head.y)) {
        S.stunUsed = true; S.stunT = 1.5; S.flinchT = 0; E.flinch = 0; E.crawlSpeed = 0;
        sfx.pick('bone_crack', { gain: 0.7, at: { x: head.x, y: head.y, z: head.z } }); sfx.pick('rattle', { gain: 0.9, at: { x: head.x, y: head.y, z: head.z }, rate: 0.8 });
        logRow('flashStun');
      }
    }
  }
  const newChase = () => { S.flinchUsed = false; S.stunUsed = false; };

  // ---- public actions ----
  function vanish(flicker = true) {
    if (S.state === 'away') return;
    E.visible = false; E.mode = 'idle'; E.lookTarget = null; E.lean = 0; E.tilt = 0; E.flinch = 0; E.stun = 0; E.sneak = false; E.onStep = null; E.crawlSpeed = 0; E.catchPose = null;
    if (E.standUp) E.standUp();
    setState('away'); F.breathCheck = false; ctx.onVanish(flicker); S.crawl = null; S.hold = 0; S.flinchT = 0; S.stunT = 0;
    S.path = []; S.cool = Math.max(S.cool, 8);
  }
  // it is simply there, somewhere you will see it (never somewhere you are looking: law 2, returns false)
  function sight(node, opts = {}) {
    if (!place(node)) return false;
    setState('sight');
    S.sightT = 0; S.sightDur = opts.dur ?? 4; S.seenT = 0; S.sightOpts = opts; E.tilt = opts.tilt ?? 0.4; S.turned = false; S.stung = false; S.slammed = false;
    if (opts.facing) { E.lookTarget = null; E.faceTowards(opts.facing[0], opts.facing[1], 1); }
    // the sting lands the instant it is in front of you, not when it appears somewhere behind a wall (see update); until then, a small wrongness
    if (opts.stab !== false && inView(ep().x, ep().z, 0.7) && gap() < 18) sting(); else sfx.creak(0.12, ctx.panFor(ep()));
    F.fear = Math.max(F.fear, 0.5);
    return true;
  }
  function sting() {
    if (S.stung) return; S.stung = true;
    S.slammed = true; sfx.appear(); ctx.flicker(0.5); ctx.addShake(0.6); F.fear = Math.max(F.fear, 0.85);
  }
  // the jolt of a hunt: when it comes into view, not when it starts somewhere out of sight
  function huntJolt() {
    if (S.jolted) return; S.jolted = true;
    sfx.jolt(0.85); sfx.pianoSlam(SLAM.jolt); ctx.flicker(0.6); ctx.addShake(0.9);
  }
  function stalk(node) {
    if (!place(node)) return false;
    setState('stalk'); S.frozen = false; S.lookT = 0; S.frozenT = 0; S.frozenLogged = false; S.replan = 0; E.sneak = true;
    sfx.tension(0.04, 2); F.fear = Math.max(F.fear, 0.4);
    return true;
  }
  function hunt(node = null) {
    if (S.state === 'away' || node) { if (!place(node || pickSpawn(8) || 'hallW', { force: E.visible })) return false; }
    setState('hunt'); S.lostT = 0; S.lastSeen = { x: P.pos.x, z: P.pos.z }; S.replan = 0; S.listened = false; newChase();
    E.tilt = 0.2; E.smileScale = 1.1; E.sneak = false; S.jolted = false;
    if (sfx.tensionDrone) sfx.tensionDrone(0.7, 0.3); sfx.bed('music/chase', 0.55, 0.6); sfx.bed('music/night', 0, 1.5); sfx.drone(0.17, 0.5);
    F.fear = 1; F.chase = true;
    if (inView(ep().x, ep().z, 0.6) && sees()) huntJolt();
    ctx.onHunt();
    return true;
  }
  // on all fours at you. from: a node, or a point it already is at (the crumple that unfolded); free: no graph (outdoors), straight at
  // you round the trunks. It catches only with its head within 0.9 m and a line to you; out of sight 2 s and it stops, holds a frame
  // facing where you were, and is gone on the next flicker
  function crawl(from, opts = {}) {
    if (typeof from === 'string') { if (!E.visible || S.state === 'away') { if (!place(from)) return false; } }
    else if (from && !E.visible) { E.root.position.set(from.x, W.groundAt ? W.groundAt(from.x, from.z, P.pos.y) : P.pos.y, from.z); E.visible = true; }
    if (!E.visible) return false;
    setState('crawl'); newChase();
    // from a point: the folded one the flash woke, which comes at the flash chase's pace (4.8 m/s, 7.2 if you run)
    const flash = from && typeof from === 'object';
    S.crawl = { free: !!opts.free, speed: opts.speed ?? (flash ? 4.8 : crawlSpeed()), sprintSpeed: opts.sprintSpeed ?? (flash ? 7.2 : null), chaseLeft: opts.chaseDist ?? Infinity, lost: 0, stop: 0, first: true, breathT: 0.4, rattleT: 1.5 };
    S.lastSeen = { x: P.pos.x, z: P.pos.z }; S.replan = 0; S.path = []; S.pi = 0; S.node = nearestNode(ep().x, ep().z, null, ep().y) || S.node;
    if (E.mode !== 'unfold') { if (E.mode !== 'crawl') { E.mode = 'crawl'; E.snap = 0; } }
    E.lookTarget = camera.position; E.lungeOut = 0; E.crawlSpeed = 0; E.onStep = crawlStep;
    F.fear = 1; F.chase = true;
    return true;
  }
  // its body on the boards: a slap for each hand put down, cloth dragged for each knee, a crack every third step (all placed where they happen)
  function crawlStep(k, limb, at, lunge) {
    if (!at) return;
    const p = { x: at.x, y: at.y + 0.05, z: at.z };
    if (limb[1] === 'H') sfx.pick('floor_slap', { gain: 0.55, at: p, lp: 500, wet: 0.12, jitter: 0.08 });
    else sfx.pick('cloth', { gain: 0.5, at: p, rate: 0.8, wet: 0.1 });
    if (k % 3 === 0) sfx.pick('bone_crack', { gain: 0.42, at: p, wet: 0.1, maxLen: 1.2 });
    if (lunge && S.crawl && S.crawl.first) { S.crawl.first = false; sfx.jolt(0.6); sfx.pianoSlam(SLAM.jolt); ctx.addShake(0.5); }   // the first lunge: the loudest thing in it
  }
  function startSearch(fromHunt = true, { listen = false } = {}) {
    setState('search'); S.searchT = 0; S.heard = 0; S.forcePod = null; S.passed = false; S.listen = listen;
    if (E.mode === 'crawl' || E.mode === 'unfold') { E.mode = 'idle'; E.standUp(); }
    const ls = S.lastSeen ? nearestNode(S.lastSeen.x, S.lastSeen.z, null, ep().y) : S.node;
    S.searchList = [ls]; const near = Object.keys(NODES).filter((k) => navDist(k, ls) < 6 && k !== ls && Math.abs((NODES[k][2] || 0) - (NODES[ls][2] || 0)) < 1);
    for (let i = 0; i < 2 + (S.level > 4 ? 1 : 0) && near.length; i++) S.searchList.push(near.splice((Math.random() * near.length) | 0, 1)[0]);
    // it listens where it lost you: standing at the last place it saw (or heard) you for 4-7 s before it looks anywhere else
    S.searchWait = listen && S.lastSeen && Math.hypot(S.lastSeen.x - ep().x, S.lastSeen.z - ep().z) < 1.6 ? listenFor(S.level) : 0;
    if (S.searchWait > 0) S.listenedAt = { x: ep().x, z: ep().z, t: ctx.now() };
    F.chase = false; sfx.bed('music/chase', 0, 1.5); sfx.bed('music/night', 0.35, 2);
    planTo(S.searchList[0]); E.tilt = 0.45;
    if (hidden() && !S.hinted) { S.hinted = true; ctx.hint(); }   // shows the breath meter and key the first time it looks while you hide
  }
  function pickSpawn(minPath = 7, prefer = null) {
    const pn = playerNode(), c = [];
    for (const k of Object.keys(NODES)) {
      if (los(P.pos.x, P.pos.z, NODES[k][0], NODES[k][1]) && Math.hypot(NODES[k][0] - P.pos.x, NODES[k][1] - P.pos.z) < 16) continue;   // never pop into view
      if (refused(k)) continue;
      const p = navPath(pn, k, doorClosed); if (!p || pathLength(p) < minPath) continue;
      c.push([k, 1 + (prefer && prefer.includes(k) ? 3 : 0)]);
    }
    if (!c.length) return null;
    let t = 0; for (const [, w] of c) t += w; let x = Math.random() * t; for (const [k, w] of c) { if ((x -= w) <= 0) return k; }
    return c[0][0];
  }
  // the run's looms (RUN.story when the story keeps one; this run's own count otherwise): how many, how many survived, whether the last opened
  const looms = () => { const R = ctx.run ? ctx.run() : null; if (!R) return { n: 0, survived: 0, lastOpened: false }; return (R.looms ||= { n: 0, survived: 0, lastOpened: false }); };
  const lastOpened = () => { const R = ctx.run ? ctx.run() : null; return !!((R && R.story && R.story.lastLoomOpened) ?? looms().lastOpened); };
  const setLastOpened = (v) => { const R = ctx.run ? ctx.run() : null; looms().lastOpened = v; if (R && R.story) R.story.lastLoomOpened = v; };
  // it came to the place you are hiding
  function loom(podId) {
    S.loomPod = podId; setState('loom'); S.loomT = 0; S.loomTwitched = false; S.giggled = false;
    S.loomDur = S.loomBase = clamp(4.4 + S.level * 0.3, 4.4, 6.8);
    const pod = ctx.pods[podId]; place(pod.node, { force: true }); E.mode = 'idle';
    E.root.position.x = NODES[pod.node][0]; E.root.position.z = NODES[pod.node][1]; E.faceTowards(pod.look[0], pod.look[1], 1);
    // one loom in twenty that you would live through, it opens the place anyway: longer, its breathing out loud, the leaf twitching first
    const L = looms(), R = ctx.run ? ctx.run() : {}, n = F.night || 1;
    S.loomIndex = L.n++;
    S.loomOpen = loomOpens({ seed: (R && R.seed) || 'run', n, index: S.loomIndex, firstSurvived: L.survived === 0, lastOpened: lastOpened(), owned: !!(ctx.loomOwned && ctx.loomOwned()) });
    if (S.loomOpen) S.loomDur += 2.5 + loomRoll((R && R.seed) || 'run', n, S.loomIndex + 0.5) * 1.0;
    if (sfx.tensionDrone) sfx.tensionDrone(1, 0.4); sfx.tension(0.05, 1); sfx.whisper(ctx.panFor(ep()), 0.16);
    F.breathCheck = true; F.grace = 2.2; if (P.breath < 0.9) P.breath = 0.9; ctx.hint();   // it never finds you with the meter already empty
  }
  // you just got into a hiding place: did it see you do it? Then it goes straight there and opens it
  function notifyPod(podId) {
    if ((S.state === 'hunt' || S.state === 'stalk' || S.state === 'crawl') && gap() < 9 && los(ep().x, ep().z, P.pos.x, P.pos.z, ep().y, P.pos.y)) {
      S.sawEnter = podId;
      if (E.mode === 'crawl' || E.mode === 'unfold') { E.mode = 'idle'; E.standUp(); }
      startSearch(); S.forcePod = podId; S.searchWait = 0; planTo(ctx.pods[podId].node);
      return true;
    }
    return false;
  }
  // it opens your hiding place: slowly (0.8 s), its face in the gap, and the catch (ctx.openPod does the door and the catch)
  function openPod(podId, why) {
    setState('open'); S.openT = 0; S.loomPod = podId; F.breathCheck = false;
    const pod = ctx.pods[podId]; if (pod && pod.look) E.faceTowards(pod.look[0], pod.look[1], 1);
    if (why === 'loom') { setLastOpened(true); logRow('loomOpened', { pod: podId }); }
    if (ctx.openPod) ctx.openPod(podId, { why }); else ctx.caught();
  }
  // it arrives already looking for you (you are hiding when it begins)
  function searchFrom(node) {
    if (!place(node)) return false;
    S.lastSeen = { x: P.pos.x, z: P.pos.z };
    if (sfx.tensionDrone) sfx.tensionDrone(0.5, 1.5); F.fear = Math.max(F.fear, 0.7);
    startSearch();
    return true;
  }
  function dismiss() { if (S.state !== 'away') vanish(false); F.chase = false; F.breathCheck = false; S.cool = 30; }

  // ---- per frame ----
  function update(dt) {
    tick(dt); lowGuard();
  }
  function tick(dt) {
    if (S.cool > 0) S.cool -= dt;
    if (S.state === 'away') { S.steps.x = P.pos.x; S.steps.z = P.pos.z; return; }
    const g = gap(), podId = hidden();
    lightTick(dt);
    if (['hunt', 'search', 'stalk', 'crawl', 'leave'].includes(S.state)) hearSteps(dt);
    // heartbeat, fear and light stutter grow with closeness
    if (E.visible && S.state !== 'sight') {
      F.fear = Math.max(F.fear, clamp(1 - g / 11, 0, 0.95));
      S.hb -= dt; if (S.hb <= 0) { sfx.heartbeat(clamp(0.3 + (1 - g / 12) * 0.5, 0.3, 0.8)); S.hb = clamp(0.28 + g * 0.05, 0.3, 0.9); }
    }
    // while it stalks or hunts, a voice you can barely hear, from where it is and louder the nearer it gets
    if (S.state === 'stalk' || S.state === 'hunt') {
      S.lurkT -= dt;
      if (S.lurkT <= 0) { S.lurkT = S.state === 'hunt' ? 1.7 : 2.3; sfx.lurk(ctx.panFor(ep()), clamp(1 - g / 14, 0.03, 1), 1.4); }
    }
    switch (S.state) {
      case 'sight': {
        S.sightT += dt;
        const o = S.sightOpts;
        if (o.facing && !S.turned) {   // it has its back to you, watching something else, until you come close
          if (o.stab !== false && inView(ep().x, ep().z, 0.7) && g < 18) sting();
          if (g < (o.turnDist ?? 3.4) && !podId) { S.turned = true; E.lookTarget = camera.position; sfx.giggle(ctx.panFor(ep())); ctx.onTurn(); if (o.chase) { hunt(); break; } }
          else if (S.sightT > S.sightDur) { vanish(); break; }
          else break;
        }
        E.faceTowards(P.pos.x, P.pos.z, Math.min(1, dt * 4));
        const seen = inView(ep().x, ep().z, 0.7) && g < 18;
        if (seen) { if (o.stab !== false) sting(); else if (!S.slammed) { S.slammed = true; sfx.pianoSlam(SLAM.full); } S.seenT += dt; }
        // chase (the old trigger): it comes for you once you are within chaseDist (4 m); with `then` set chaseDist is how far it chases instead
        if (o.chase && !o.then && g < (o.chaseDist ?? 4)) { hunt(); break; }
        const then = () => { if (o.then === 'hunt') hunt(); else if (o.then === 'crawl') crawl(null, { free: o.free ?? !nearestNode(ep().x, ep().z, (k) => Math.hypot(NODES[k][0] - ep().x, NODES[k][1] - ep().z) < 3, ep().y), chaseDist: o.chaseDist }); else vanish(); };
        // looked at for lookTime: `then` (or gone, unless it stays while looked at); out of its time unseen: gone quietly
        if (S.seenT > (o.lookTime ?? 0.9)) { if (o.then) { then(); break; } if (o.vanishOnLook !== false) { vanish(); break; } }
        if (S.sightT > S.sightDur) { if (o.then && o.then !== 'vanish' && S.seenT > 0) then(); else vanish(); }
        break;
      }
      case 'stalk': {
        const watched = inView(ep().x, ep().z, 0.72) && g < 16 && !podId;
        S.frozen = watched && (S.level < 6 || g > 3.25);
        if (S.frozen) {
          E.mode = 'idle'; E.faceTowards(P.pos.x, P.pos.z, Math.min(1, dt * 6)); S.lookT += dt; S.frozenT += dt;
          if (S.frozenT >= 3 && !S.frozenLogged) { S.frozenLogged = true; logRow('stalkFrozen', { t: +S.frozenT.toFixed(1) }); }
          if (S.lookT > 7) vanish();
          break;
        }
        S.frozenT = 0;
        S.replan -= dt; if (S.replan <= 0) { S.replan = 0.7; planTo(playerNode()); }
        const arrived = follow(dt, 0.95 + S.level * 0.05);
        if (!podId && g < 4.2 && sees()) { if (S.level >= 3 || S.sightOpts.chase) hunt(); else vanish(); }
        else if (podId && g < 3.5) { startSearch(); S.forcePod = podId; planTo(ctx.pods[podId].node); }
        else if (arrived) vanish();
        break;
      }
      case 'hunt': {
        if (!S.jolted && inView(ep().x, ep().z, 0.6) && sees()) huntJolt();
        const seen = sees();
        if (seen) { S.lastSeen = { x: P.pos.x, z: P.pos.z }; S.lostT = 0; } else S.lostT += dt;
        // it chases what it sees; out of sight it does not home on you: it goes to the last place it saw (or heard) you, and listens there
        S.replan -= dt;
        if (S.replan <= 0) { S.replan = 0.35; planTo(seen ? playerNode() : nearestNode(S.lastSeen.x, S.lastSeen.z, null, ep().y)); }
        const arrived = follow(dt, huntSpeed());
        if (sees(2.0) && g < 0.95 && !podId && S.hold <= 0) { ctx.caught(); break; }
        if (!seen && (arrived || Math.hypot(S.lastSeen.x - ep().x, S.lastSeen.z - ep().z) < 0.5)) {
          // the last stretch off the graph: to the very spot, then still
          const dx = S.lastSeen.x - ep().x, dz = S.lastSeen.z - ep().z, d = Math.hypot(dx, dz);
          if (d > 0.15 && !blockedAt(ep().x + dx / d * 0.2, ep().z + dz / d * 0.2, 0.3)) {
            if (lowSpot()) {   // (under the laundry's joists, on all fours: by its lunges)
              if (E.mode !== 'crawl') { E.mode = 'crawl'; E.snap = 1; E.lungeOut = 0; }
              E.crawlSpeed = huntSpeed(); const st = Math.min(d, E.lungeOut); E.lungeOut = 0;
              ep().x += dx / d * st; ep().z += dz / d * st; crawlFace(dt, S.lastSeen); settle();
            } else { const st = Math.min(d, huntSpeed() * dt); ep().x += dx / d * st; ep().z += dz / d * st; E.faceTowards(S.lastSeen.x, S.lastSeen.z, Math.min(1, dt * 8)); E.mode = 'run'; settle(); }
          }
          else startSearch(true, { listen: true });
        } else if (S.lostT > 12) startSearch(true, { listen: false });
        break;
      }
      case 'crawl': {
        const c = S.crawl;
        if (E.mode === 'unfold') { E.faceTowards(P.pos.x, P.pos.z, Math.min(1, dt * 12)); break; }   // still getting up off its knees
        if (c.stop > 0) { c.stop += dt; if (c.stop > 0.05) { F.fear = 1; ctx.flicker(0.6); vanish(false); } break; }   // one held frame, then the flicker takes it
        const seen = sees(14);
        if (seen) { c.lost = 0; S.lastSeen = { x: P.pos.x, z: P.pos.z }; E.snap = Math.min(1, (E.snap || 0) + dt / 0.12); }
        else c.lost += dt;
        F.fear = 1;
        if (c.lost > 2 || c.chaseLeft <= 0) { c.stop = 1e-6; E.crawlSpeed = 0; E.faceTowards(S.lastSeen.x, S.lastSeen.z, 1); break; }
        if (S.hold > 0) { E.crawlSpeed = 0; E.lungeOut = 0; break; }
        const spd = c.sprintSpeed && P.sprinting ? c.sprintSpeed : c.speed;
        E.crawlSpeed = seen ? spd : spd * 0.6;
        const d = E.lungeOut; E.lungeOut = 0;
        if (c.free) {
          // straight at you (or at where it lost you), round whatever stands in the way: the step turned aside until it is clear
          const tx = seen ? P.pos.x : S.lastSeen.x, tz = seen ? P.pos.z : S.lastSeen.z;
          crawlFace(dt, { x: tx, z: tz });
          if (d > 0) {
            const yaw = E.root.rotation.y;
            for (const off of [0, 0.5, -0.5, 1.0, -1.0, 1.5, -1.5]) {
              const a = yaw + off, nx = ep().x + Math.sin(a) * d, nz = ep().z + Math.cos(a) * d;
              if (!blockedAt(nx, nz) && !blockedAt(nx + Math.sin(a) * 0.9, nz + Math.cos(a) * 0.9, 0.3)) { ep().x = nx; ep().z = nz; c.chaseLeft -= d; break; }
            }
            settle();
          }
        } else {
          S.replan -= dt;
          if (S.replan <= 0) { S.replan = 0.3; planTo(seen ? playerNode() : nearestNode(S.lastSeen.x, S.lastSeen.z, null, ep().y)); }
          if (doorTick(dt)) break;
          const r = advance(d, 0, true); crawlFace(dt, S.pi >= S.path.length && seen ? P.pos : null); c.chaseLeft -= r.moved;
        }
        // its breath while it comes, wet and slow, and the rattle in its throat now and then
        headPos(); const hp = { x: head.x, y: head.y, z: head.z };
        c.breathT -= dt; if (c.breathT <= 0 && E.crawlSpeed > 0) { c.breathT = 1.4; sfx.pick('breath', { gain: 0.5, at: hp, rate: 0.6, wet: 0.15 }); }
        c.rattleT -= dt; if (c.rattleT <= 0) { c.rattleT = 2.6 + Math.random() * 1.5; sfx.pick('rattle', { gain: 0.6, at: hp, wet: 0.12 }); }
        // the catch: its head at you, and nothing between
        if (seen && Math.hypot(head.x - P.pos.x, head.z - P.pos.z) < 0.9) { E.crawlSpeed = 0; if (ctx.crawlCaught) ctx.crawlCaught(); else ctx.caught(); }
        break;
      }
      case 'search': {
        S.searchT += dt;
        // it can hear you if you are close and not holding your breath
        if (podId && g < 3.6) { if (!ctx.holding()) S.heard += dt; else S.heard = Math.max(0, S.heard - dt * 0.5); }
        // standing still where it lost you it listens, its head cocked, and it is all but blind: it sees you only right beside it (so a
        // player who walks, quietly, to a hiding place out of its reach gets in unseen; one who runs is heard, design 6.7)
        const listening = S.listen && S.searchWait > 0 && S.listenedAt;
        if (!podId && sees(listening ? 1.5 : 5.5)) { hunt(); break; }
        if (S.searchWait > 0) {   // looking round, listening, where it stands
          if (S.hold > 0) break;
          S.searchWait -= dt; E.mode = 'idle'; E.tilt = 0.45 + Math.sin(S.searchT * 1.7) * 0.4;
          E.faceTowards(ep().x + Math.sin(S.searchT * 0.8) * 3, ep().z + Math.cos(S.searchT * 0.6) * 3, Math.min(1, dt * 2));
          // heard you since: it goes to the sound
          if (S.heardAt && ctx.now() - S.heardAt < 0.1 && S.lastSeen && Math.hypot(S.lastSeen.x - ep().x, S.lastSeen.z - ep().z) > 1.5) { S.searchWait = 0; S.listenedAt = null; S.searchList = [nearestNode(S.lastSeen.x, S.lastSeen.z, null, ep().y)]; planTo(S.searchList[0]); break; }
          if (S.searchWait <= 0) { S.listenedFor = S.listenedAt ? ctx.now() - S.listenedAt.t : 0; S.listenedAt = null; S.searchList.shift(); if (!S.searchList.length) { endSearch(); break; } planTo(S.searchList[0]); }
          break;
        }
        const arrived = follow(dt, S.forcePod ? huntSpeed() * 0.8 : 1.55 + S.level * 0.05);
        // it passes the place you are hiding (within a step of its door) without stopping: written down once a search
        if (podId && podId !== 'bunk' && !S.passed && ctx.pods[podId] && !S.forcePod) {
          const [px, pz] = NODES[ctx.pods[podId].node];
          if (Math.hypot(px - ep().x, pz - ep().z) < 1.2 && S.searchList[0] !== ctx.pods[podId].node) { S.passed = true; logRow('podPassed', { pod: podId }); }
        }
        if (arrived) {
          const here = S.searchList[0];
          // it saw you get in: it opens the place
          if (S.forcePod && podId === S.forcePod && ctx.pods[podId].node === here) { openPod(podId, 'seen'); break; }
          // is this the door to the place you are hiding?
          if (podId && ctx.pods[podId].node === here) {
            const chance = clamp(0.3 + S.level * 0.07 + (S.checks[podId] || 0) * 0.25 + S.heard * 0.35, 0.3, 0.97);
            if (S.forcePod === podId || S.heard > 1.4 || Math.random() < chance) { S.checks[podId] = (S.checks[podId] || 0) + 1; loom(podId); break; }
            if (!S.passed && podId !== 'bunk') { S.passed = true; logRow('podPassed', { pod: podId }); }
          }
          S.searchWait = 1.6 + Math.random() * 1.6;
        }
        if (S.searchT > 26 + (S.listen ? listenFor(S.level) : 0)) endSearch();
        // sometimes it walks over to check the place you are hiding even though it never saw you go in
        if (podId && !S.searchList.includes(ctx.pods[podId].node) && Math.random() < dt * 0.05 * (1 + S.level * 0.2) && navDist(S.node, ctx.pods[podId].node) < 9) { S.searchList.splice(1, 0, ctx.pods[podId].node); }
        break;
      }
      case 'loom': {
        S.loomT += dt; E.tilt = -0.4 + Math.sin(S.loomT * 2.2) * 0.7; E.lean = Math.min(0.35, S.loomT * 0.2); E.smileScale = 1 + Math.min(0.35, S.loomT * 0.08);
        E.faceTowards(ctx.pods[S.loomPod].look[0], ctx.pods[S.loomPod].look[1], Math.min(1, dt * 6));
        F.fear = 1;
        if (S.loomT > 2.2 && !S.giggled) { S.giggled = true; sfx.giggle(ctx.panFor(ep())); }
        if (S.loomOpen && S.loomT > S.loomBase) {
          // the long one: its breathing out loud at the door, the leaf moving a centimetre and back, and then it opens the place
          headPos(); S.breathT = (S.breathT ?? 0) - dt;
          if (S.breathT <= 0) { S.breathT = 1.1; sfx.pick('breath', { gain: 0.9, at: { x: head.x, y: head.y, z: head.z }, rate: 0.62, wet: 0.2 }); }
          if (!S.loomTwitched && S.loomT > S.loomDur - 1.0) { S.loomTwitched = true; if (ctx.twitchPod) ctx.twitchPod(S.loomPod); }
        }
        if (S.loomT > S.loomDur) {
          if (S.loomOpen) { openPod(S.loomPod, 'loom'); break; }
          F.breathCheck = false; S.giggled = false; E.lean = 0;
          if (sfx.tensionDrone) sfx.tensionDrone(0, 0.05); sfx.ceilingThump(); ctx.survived();
          const L = looms(); L.survived++; setLastOpened(false); logRow('loomSurvived', { pod: S.loomPod });
          setState('leave'); S.leaveT = 0; E.smileScale = 1;
          const far = pickSpawn(9) || 'hallW'; planTo(far);
        }
        break;
      }
      case 'open': { S.openT += dt; F.fear = 1; break; }   // ctx.openPod plays it out and the catch ends it
      case 'leave': {
        S.leaveT += dt; E.tilt = 0.2;
        const arrived = follow(dt, 1.4);
        if (arrived || S.leaveT > 14 || (S.leaveT > 3 && !los(ep().x, ep().z, P.pos.x, P.pos.z) && g > 5)) vanish();
        break;
      }
    }
  }
  // under the laundry's joists it is never on its feet: standing still there (listening, at a shut door, held by the light) it stays down
  function lowGuard() {
    if (!E.visible || S.state === 'away' || E.mode !== 'idle' || !lowSpot() || E.catchPose) return;
    E.mode = 'crawl'; E.snap = 1; E.crawlSpeed = 0; E.lungeOut = 0;
  }
  function endSearch() {   // gave up: walks off
    setState('leave'); S.leaveT = 0; sfx.bed('music/chase', 0, 2); if (sfx.tensionDrone) sfx.tensionDrone(0, 2); sfx.drone(0.085, 3);
    const far = pickSpawn(9) || 'hallW'; planTo(far);
  }

  return {
    S, update, sight, stalk, hunt, crawl, vanish, dismiss, notifyPod, loom, openPod, pickSpawn, los, looking, playerNode, startSearch, searchFrom, place, refused, blockedAt,
    get state() { return S.state; }, get busy() { return S.state !== 'away'; }, get cool() { return S.cool; },
    setLevel(n) { S.level = n; E.level = n; }, reset() { vanish(false); S.cool = 0; S.checks = {}; S.hinted = false; S.lastFlash = undefined; F.chase = false; },
    gap, sees,
  };
}
