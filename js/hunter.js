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
// What it knows (the mind, further down): it has a place in the house while it is away (the lair, which drifts from room to room and is
// where it comes from), it keeps to the side you are not facing, it steps back behind a corner when your eyes come round to it and has
// moved when they leave it, it remembers where you hid and which way you ran (RUN.mind, kept with the run), the flash and the torch stop
// it for less each time, it hears a door as it hears a sprint, and an encounter the night has budgeted may become one of its own
// (think): watching from a doorway, standing at the closet that saved you twice, a knock in one room and its feet from another.
// The contract the other parts of the game read (design 6.2, 6.7):
//   place(node) / sight(node, opts) refuse a node on screen or seen in the last 2 s and return false, leaving E as it was (law 2);
//   sight opts: dur, facing, turnDist, chase, stab, tilt, vanishOnLook, lookTime, then: 'hunt' | 'crawl' | 'vanish', chaseDist;
//   crawl(from, { free, speed, sprintSpeed, chaseDist }); stalk / hunt / vanish(flicker); the log rows stalkFrozen, podPassed, flinch,
//   flashStun, loomSurvived, loomOpened, and the mind's: pulledBack, relocated, watching, podGuard, podWait, bait, cutOff.
import * as THREE from 'three';
import { SLAM } from './audio.js';
import { NODES, ADJ, path as navPath, nearestNode, dist as navDist, edgeDoor, pathLength, LOW, crawlEdge } from './nav.js';
import { active as colliderOn, onFloor as colliderOnFloor, leafOf, segNear, probe as probeAt } from './collide.js';
import { rng } from './rng.js';
import * as log from './log.js';

const V3 = THREE.Vector3;
const clamp = THREE.MathUtils.clamp;
// how long it stands and listens where it lost you (7 s on the first nights down to 4 s by level 9), how long a shut door holds it
export const listenFor = (level) => clamp(7 - (level - 1) * 0.375, 4, 7);
export const doorHoldFor = (level) => clamp(2.0 - (level - 1) * 0.1, 1.2, 2.0);
// what it hears of your feet: a sprint within 8 m, a walk within 3 m, half as far through a wall; standing still, nothing. A door you
// open or shut it hears from 9 m
export const HEAR = { sprint: 8, walk: 3, wall: 0.5, door: 9 };
// the light in its face stops it for less each time it has been used on it this run: the torch's flinch from 0.8 s down to 0.45, the
// flash's stun from 1.5 s down to 0.7, and the step back it takes afterwards from a second down to none
export const flinchFor = (times) => clamp(0.8 - 0.07 * times, 0.45, 0.8);
export const stunFor = (times) => clamp(1.5 - 0.2 * times, 0.7, 1.5);
export const recoilFor = (times) => clamp(1.0 - 0.25 * times, 0, 1.0);
// the rooms it keeps to while it is away (never Mom and Dad's, the cellar or the yard)
const LAIR_ROOMS = new Set(['hall', 'bath', 'bed', 'room2', 'spare', 'living', 'kitchen', 'dining']);
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
    // the mind: its own generator, where it is while away, what it is in the middle of
    mr: null, lair: null, lairT: 0, guarded: {}, bait: null, after: null, wait: null, peek: null, cover: null, coverCool: 0, wasWatched: false,
    surge: 0, moved: false, retreat: 0, flinchDur: 0.8, stunDur: 1.5, roomWas: null, routed: false, cut: null, lingerLook: null,
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
  const doorClosed = (name) => W.doors[name] && (W.doors[name].target === 0 || (W.doors[name].max ?? 1) < 0.85);   // (one left ajar is in its way too)
  // is the player looking toward a point (cos threshold) with nothing in between?
  function looking(x, z, cos = 0.8, y = 1.2) {
    camera.getWorldDirection(dirv);
    tmp.set(x - camera.position.x, y - camera.position.y, z - camera.position.z); const d = tmp.length(); if (d < 0.1) return true;
    return tmp.divideScalar(d).dot(dirv) > cos && los(camera.position.x, camera.position.z, x, z);
  }
  const inView = (x, z, cos = 0.55) => looking(x, z, cos);
  const headPos = () => E.headWorld(head);

  // ---- what it knows ----
  // The run's memory of you (RUN.mind): pods { id: { used, saved } } the places you have hidden in and the times each one saved you (it
  // stood over it, or looked for you, and left), routes { 'from>to': n } the doorways you went through with it after you, flash and
  // torch how many times each has stopped it. Its own draws come from a generator seeded by the run and the night, apart from the plan's
  const mind = () => { const R = ctx.run ? ctx.run() : null, m = R ? (R.mind ||= {}) : (S.mindOwn ||= {}); m.pods ||= {}; m.routes ||= {}; m.flash ||= 0; m.torch ||= 0; return m; };
  const podMem = (id) => (mind().pods[id] ||= { used: 0, saved: 0 });
  const keep = () => { if (ctx.save) ctx.save(); };
  const mr = () => { if (!S.mr) { const R = ctx.run ? ctx.run() : null; S.mr = rng(`mind:${(R && R.seed) || 'run'}:${F.night || 1}`); } return S.mr(); };
  const roomOf = (x, z, y = 0) => { const g = gaze(); return g && g.roomOf ? g.roomOf({ x, z, y }) : null; };
  const nodeRoom = (k) => roomOf(NODES[k][0], NODES[k][1], NODES[k][2] || 0);
  const indoor = (k) => !(NODES[k][2] || 0) && LAIR_ROOMS.has(nodeRoom(k));
  // the room you most often ran into from the one you are in, with it after you (twice at least before it counts)
  function habit(from = null) {
    const g = gaze(), a = from || (g && g.room ? g.room() : null); if (!a || S.level < 3) return null;
    let best = null; const R = mind().routes;
    for (const k in R) { const [f, t] = k.split('>'); if (f === a && R[k] >= 2 && (!best || R[k] > best.n)) best = { from: f, to: t, n: R[k] }; }
    return best;
  }
  function noteRoute() {
    const g = gaze(), r = g && g.room ? g.room() : null; if (!r) return;
    if (S.roomWas && S.roomWas !== r && !hidden()) { const k = S.roomWas + '>' + r, R = mind().routes; R[k] = (R[k] || 0) + 1; S.routed = true; }
    S.roomWas = r;
  }
  // where it is while it is not in the world: a node of the house it drifts from, a room at a time, nearer you as the nights go on (but
  // never into the room you are in). It comes from there, and the house is restless round it (js/haunt.js reads lairPos)
  function lairTick(dt) {
    if (!gaze()) return;
    if (!S.lair || !NODES[S.lair]) {
      const far = Object.keys(NODES).filter((k) => indoor(k) && Math.hypot(NODES[k][0] - P.pos.x, NODES[k][1] - P.pos.z) > 6);
      S.lair = far.length ? far[(mr() * far.length) | 0] : 'livFar'; S.lairT = 20 + mr() * 20; return;
    }
    S.lairT -= dt; if (S.lairT > 0) return;
    S.lairT = 26 + mr() * 30;
    const adj = ADJ[S.lair].map((e) => e.to).filter(indoor); if (!adj.length) return;
    const pn = playerNode(), toward = adj.slice().sort((a, b) => navDist(a, pn) - navDist(b, pn))[0];
    const next = mr() < 0.2 + S.level * 0.05 ? toward : adj[(mr() * adj.length) | 0];
    if (Math.hypot(NODES[next][0] - P.pos.x, NODES[next][1] - P.pos.z) > 3.5) S.lair = next;
  }
  const lairPos = () => (E.visible && S.state !== 'away' ? { x: ep().x, z: ep().z, y: ep().y } : S.lair && NODES[S.lair] ? { x: NODES[S.lair][0], z: NODES[S.lair][1], y: 0 } : null);
  // the node one step back along its way that you cannot see from where you stand: the corner it steps behind
  function coverNode() {
    if (S.pi < 1 || S.pi > S.path.length) return null;
    const k = S.path[S.pi - 1], next = S.path[S.pi]; if (!k || !NODES[k]) return null;
    const [x, z, y = 0] = NODES[k];
    if (Math.hypot(x - ep().x, z - ep().z) > 1.7 || los(P.pos.x, P.pos.z, x, z, P.pos.y, y)) return null;
    if (next && edgeDoor(k, next) && doorClosed(edgeDoor(k, next))) return null;
    return k;
  }
  // the neighbouring node furthest from you: where it backs off to
  function backNode() {
    const from = S.node && NODES[S.node] ? S.node : nearestNode(ep().x, ep().z, null, ep().y); if (!from) return null;
    let best = null, bd = Math.hypot(ep().x - P.pos.x, ep().z - P.pos.z);
    for (const e of ADJ[from]) {
      if ((e.door && doorClosed(e.door)) || Math.abs((NODES[e.to][2] || 0) - ep().y) > 1) continue;
      const d = Math.hypot(NODES[e.to][0] - P.pos.x, NODES[e.to][1] - P.pos.z); if (d > bd) { bd = d; best = e.to; }
    }
    return best;
  }
  // gone from where you left it: somewhere behind you instead, out of view, and creeping again from there
  function relocate() {
    const g = gaze(); if (!g || g.onScreen({ x: ep().x, z: ep().z, y: ep().y }, 1.15)) return false;
    const k = pickSpawn(4.5, null, { behind: 4 }); if (!k) return false;
    const f = g.facingDir(), dx = NODES[k][0] - P.pos.x, dz = NODES[k][1] - P.pos.z;
    if (dx * f.x + dz * f.z > 0) return false;
    E.root.position.set(NODES[k][0], NODES[k][2] || 0, NODES[k][1]); S.node = k; S.path = []; S.pi = 0; S.replan = 0;
    logRow('relocated', { seen: false });
    return true;
  }

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
    E.flinch = 0; E.stun = 0; E.duckHold = null; E.catchPose = null; E.leanSide = 0; E.root.scale.setScalar(1);
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
      d.max = 1; W.setDoor(S.doorName, true);
      if (!sfx.pick('door_slam', { gain: 1, at, wet: 0.35 })) sfx.slamFar(ctx.panFor(tmp.set(at.x, at.y, at.z)));
      if (Math.hypot(P.pos.x - at.x, P.pos.z - at.z) < 6) ctx.addShake(0.45);
      S.lastShove = { door: S.doorName, held: S.doorHeldT, at: ctx.now() };
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
  // a door you opened or shut within its hearing: where it thinks you are (a door it has just shoved itself is its own noise)
  function hearDoors() {
    const g = gaze(), dn = g && g.doorNoise ? g.doorNoise() : null; if (!dn || dn.t === S.doorHeard) return;
    S.doorHeard = dn.t; if (g.now - dn.t > 0.5 || hidden()) return;
    if (S.lastShove && S.lastShove.door === dn.name && ctx.now() - (S.lastShove.at || 0) < 1.5) return;
    // (the latch is at your hand: the line is to where you stood, and that is where it thinks you are)
    const d = Math.hypot(dn.x - ep().x, dn.z - ep().z);
    if (d >= HEAR.door * (los(ep().x, ep().z, dn.px, dn.pz, ep().y, P.pos.y) ? 1 : HEAR.wall)) return;
    S.lastSeen = { x: dn.px, z: dn.pz }; S.heardAt = ctx.now();
    if (S.state === 'stalk') S.surge = Math.max(S.surge, 2);   // it comes on quicker for a noise
  }
  // the light in its face: the aimed beam on its head within 4 m makes it flinch, once a chase; the camera's flash within 5 m stuns it
  // for 1.5 s, once a chase (each for less the more it has been done to it this run: flinchFor, stunFor). Either holds it where it is
  function lightTick(dt) {
    const held = S.hold > 0;
    if (S.flinchT > 0) { S.flinchT -= dt; E.flinch = clamp(S.flinchT / 0.2, 0, 1) * clamp((S.flinchDur - S.flinchT) / 0.12 + 0.3, 0, 1); if (S.flinchT <= 0) E.flinch = 0; }
    if (S.stunT > 0) { S.stunT -= dt; E.stun = clamp(S.stunT / 0.35, 0, 1) * clamp((S.stunDur - S.stunT) / 0.1, 0, 1); if (S.stunT <= 0) E.stun = 0; }
    S.hold = Math.max(S.flinchT, S.stunT, 0);
    // the light off its face: it backs away from where it was stopped before it comes on again (less each time, and then not at all)
    if (held && S.hold <= 0 && (S.state === 'stalk' || S.state === 'hunt')) {
      const m = mind(), back = recoilFor(m.flash + m.torch - 1), k = back > 0 ? backNode() : null;
      if (k && planTo(k)) S.retreat = back;
    }
    if (!E.visible || !['hunt', 'stalk', 'crawl', 'search', 'sight'].includes(S.state)) return;
    headPos();
    const dh = Math.hypot(head.x - camera.position.x, head.y - camera.position.y, head.z - camera.position.z);
    if (!S.flinchUsed && F.flashOn && ctx.aimed && ctx.aimed() && dh < 4 && looking(head.x, head.z, 0.97, head.y)) {
      const m = mind(); S.flinchUsed = true; S.flinchT = S.flinchDur = flinchFor(m.torch); m.torch++; E.crawlSpeed = 0;
      sfx.pick('rattle', { gain: 0.6, at: { x: head.x, y: head.y, z: head.z }, rate: 1.15 });
      logRow('flinch');
    }
    const fl = ctx.flashAt ? ctx.flashAt() : null;
    if (fl !== S.lastFlash) {   // (the first look only notes what the last flash was)
      const fresh = S.lastFlash !== undefined; S.lastFlash = fl;
      if (fl !== null && fl !== undefined && fresh && !S.stunUsed && dh < 5 && looking(head.x, head.z, 0.82, head.y)) {
        const m = mind(); S.stunUsed = true; S.stunT = S.stunDur = stunFor(m.flash); m.flash++; keep(); S.flinchT = 0; E.flinch = 0; E.crawlSpeed = 0;
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
    if (S.peek) { E.leanSide = 0; E.root.scale.setScalar(1); S.peek = null; }
    if (S.routed) { S.routed = false; keep(); }
    // where it went away is where it is now
    { const k = nearestNode(ep().x, ep().z, null, ep().y); if (k && indoor(k)) { S.lair = k; S.lairT = 30; } }
    setState('away'); F.breathCheck = false; ctx.onVanish(flicker); S.crawl = null; S.hold = 0; S.flinchT = 0; S.stunT = 0;
    S.path = []; S.cool = Math.max(S.cool, 8); S.wait = null; S.cover = null; S.retreat = 0; S.surge = 0;
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
    S.cover = null; S.coverCool = 0; S.wasWatched = true; S.surge = 0; S.moved = false; S.retreat = 0;
    sfx.tension(0.04, 2); F.fear = Math.max(F.fear, 0.4);
    return true;
  }
  function hunt(node = null) {
    if (S.state === 'away' || node) { if (!place(node || pickSpawn(8) || 'hallW', { force: E.visible })) return false; }
    setState('hunt'); S.lostT = 0; S.lastSeen = { x: P.pos.x, z: P.pos.z }; S.replan = 0; S.listened = false; newChase();
    S.retreat = 0; { const g = gaze(); S.roomWas = g && g.room ? g.room() : null; }
    if (S.cut && node && nodeRoom(node) === S.cut.to) logRow('cutOff', { seen: false, from: S.cut.from, to: S.cut.to });
    S.cut = null;
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
    // it remembers: the places you have hidden in this run come first (the ones that saved you before the others), and from the
    // third night the room you usually run to
    const fl = NODES[ls][2] || 0, m = mind(), score = (id) => m.pods[id].saved * 2 + m.pods[id].used;
    const known = Object.keys(m.pods).filter((id) => id !== 'bunk' && ctx.pods[id] && m.pods[id].used > 0 && Math.abs((NODES[ctx.pods[id].node][2] || 0) - fl) < 1 && navDist(ctx.pods[id].node, ls) < 9)
      .sort((a, b) => score(b) - score(a)).slice(0, 1 + (S.level > 3 ? 1 : 0));
    for (const id of known) if (!S.searchList.includes(ctx.pods[id].node)) S.searchList.push(ctx.pods[id].node);
    if (fromHunt && S.lastSeen) {
      const h = habit(roomOf(S.lastSeen.x, S.lastSeen.z, fl)), k = h ? nearestNode(P.pos.x, P.pos.z, (q) => nodeRoom(q) === h.to, fl) : null;
      if (k && !S.searchList.includes(k) && navDist(k, ls) < 12) S.searchList.push(k);
    }
    S.lingerLook = null;
    for (let i = 0; i < 2 + (S.level > 4 ? 1 : 0) && near.length; i++) { const k = near.splice((Math.random() * near.length) | 0, 1)[0]; if (!S.searchList.includes(k)) S.searchList.push(k); }
    // it listens where it lost you: standing at the last place it saw (or heard) you for 4-7 s before it looks anywhere else
    S.searchWait = listen && S.lastSeen && Math.hypot(S.lastSeen.x - ep().x, S.lastSeen.z - ep().z) < 1.6 ? listenFor(S.level) : 0;
    if (S.searchWait > 0) S.listenedAt = { x: ep().x, z: ep().z, t: ctx.now() };
    F.chase = false; sfx.bed('music/chase', 0, 1.5); sfx.bed('music/night', 0.35, 2);
    planTo(S.searchList[0]); E.tilt = 0.45;
    if (hidden() && !S.hinted) { S.hinted = true; ctx.hint(); }   // shows the breath meter and key the first time it looks while you hide
  }
  // where it starts from. Never in view; and of the places left, rather behind you than ahead, rather in the dark than under a lit
  // bulb, rather near where it has been keeping (the lair), and rather in the room you usually run to (the cut-off: S.cut says so)
  function pickSpawn(minPath = 7, prefer = null, { behind = 1 } = {}) {
    const pn = playerNode(), c = [], g = gaze(), f = g && g.facingDir ? g.facingDir() : null, cut = habit(), lair = S.lair && NODES[S.lair];
    for (const k of Object.keys(NODES)) {
      const [x, z, y = 0] = NODES[k], dx = x - P.pos.x, dz = z - P.pos.z, d = Math.hypot(dx, dz) || 1;
      if (los(P.pos.x, P.pos.z, x, z) && d < 16) continue;   // never pop into view
      if (refused(k)) continue;
      const p = navPath(pn, k, doorClosed); if (!p || pathLength(p) < minPath) continue;
      let w = 1 + (prefer && prefer.includes(k) ? 3 : 0);
      if (f && (dx * f.x + dz * f.z) / d < -0.2) w *= 1 + 1.2 * behind;
      if (ctx.lit) { const l = ctx.lit(x, z, y); w *= l > 0.45 ? 0.5 : l < 0.15 ? 1.4 : 1; }
      if (lair) w *= 1 + 2 / (1 + Math.hypot(x - lair[0], z - lair[1]) / 3);
      if (cut && nodeRoom(k) === cut.to) w *= 1 + Math.min(3, cut.n);
      c.push([k, w]);
    }
    S.cut = null;
    if (!c.length) return null;
    let t = 0; for (const [, w] of c) t += w;
    let x = mr() * t, out = c[0][0]; for (const [k, w] of c) { if ((x -= w) <= 0) { out = k; break; } }
    if (cut && nodeRoom(out) === cut.to) S.cut = cut;
    return out;
  }
  // the run's looms (RUN.story when the story keeps one; this run's own count otherwise): how many, how many survived, whether the last opened
  const looms = () => { const R = ctx.run ? ctx.run() : null; if (!R) return { n: 0, survived: 0, lastOpened: false }; return (R.looms ||= { n: 0, survived: 0, lastOpened: false }); };
  const lastOpened = () => { const R = ctx.run ? ctx.run() : null; return !!((R && R.story && R.story.lastLoomOpened) ?? looms().lastOpened); };
  const setLastOpened = (v) => { const R = ctx.run ? ctx.run() : null; looms().lastOpened = v; if (R && R.story) R.story.lastLoomOpened = v; };
  // it came to the place you are hiding
  function loom(podId) {
    S.loomPod = podId; setState('loom'); S.loomT = 0; S.loomTwitched = false; S.giggled = false;
    // (at a place that has saved you before it stays a little longer each time, 1.2 s at most: a full breath still outlasts it)
    S.loomDur = S.loomBase = clamp(4.4 + S.level * 0.3, 4.4, 6.8) + (podId === 'bunk' ? 0 : Math.min(1.2, 0.4 * podMem(podId).saved));
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
    if (F.live && ctx.pods[podId]) { podMem(podId).used++; keep(); }
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
  function dismiss() { if (S.state !== 'away') vanish(false); F.chase = false; F.breathCheck = false; S.cool = 30; S.bait = null; S.after = null; }

  // ---- what it does with an encounter ----
  // It watches: from the other side of an open doorway that is out of your view, beside the jamb nearer you, where the wall hides its
  // body, leant over sideways and forward so that its head and a shoulder are out in the opening (the stage's peek, held: nights.js).
  // It is in a room off the hall looking out at you, or in the hall looking into the room you are in. Looked straight at for longer than
  // a glance, or walked up to, it draws back behind the wall and is gone. spot: where it would stand at that door, or null (you are too
  // square to the door for the wall to hide it, the leaf or the furniture is where it would stand, or you could not come to see it)
  const PEEK = { lat: 0.31, dep: 0.38, lean: 1.25, side: 0.85, scale: 0.72 };
  const HALL_DOOR = { bed: 'kid', bath: 'bath', room2: 'room2', spare: 'spare' };
  function watchSpot(name, T = PEEK) {
    const d = W.doors[name], g = gaze(); if (!d || !g || d.slide || d.a < 0.85 || d.target !== 1 || (d.max ?? 1) < 1 || (d.y0 || 0) !== 0) return null;
    const m = d.mid, here = g.room ? g.room() : null; if (!here || Math.abs(P.pos.y) > 0.5) return null;
    let ax = m.x - d.hx, az = m.z - d.hz; const al = Math.hypot(ax, az) || 1; ax /= al; az /= al;
    // which side it stands on, and where you will see it from: from where you are, if your side of the door is the room you are in; from
    // your own doorway, if you are in a room off the hall with its door open and it is in another room off the hall
    let nx = -az, nz = ax, v = null;
    for (const s of [1, -1]) {
      const its = roomOf(m.x + nx * s * 0.6, m.z + nz * s * 0.6), mine = roomOf(m.x - nx * s * 0.6, m.z - nz * s * 0.6);
      if (here === its) continue;
      if (mine === here) v = { x: P.pos.x, z: P.pos.z };
      else if (mine === 'hall' && HALL_DOOR[here] && HALL_DOOR[here] !== name && W.doors[HALL_DOOR[here]].target === 1) { const o = W.doors[HALL_DOOR[here]].mid; v = { x: o.x - nx * s * 0.5, z: o.z - nz * s * 0.5 }; }
      if (v) { nx *= s; nz *= s; break; }
    }
    if (!v) return null;
    const dist = Math.hypot(m.x - v.x, m.z - v.z), along = ax * (v.x - m.x) + az * (v.z - m.z);
    if (dist < 3.2 || dist > 12 || Math.abs(along) < 1 || Math.hypot(m.x - P.pos.x, m.z - P.pos.z) < 3.2) return null;
    if (along < 0) { ax = -ax; az = -az; }
    const x = m.x + nx * T.dep + ax * T.lat, z = m.z + nz * T.dep + az * T.lat, hp = { x: m.x + ax * 0.2 - nx * 0.16, z: m.z + az * 0.2 - nz * 0.16, y: 0.4 };
    if (g.onScreen({ x: m.x, z: m.z, y: 0 }, 1.15) || g.sawRecently({ x: m.x, z: m.z, y: 0 }, 2) || g.sawRecently(hp, 2)) return null;
    // the wall is between there and where it stands (its middle and its far side), and nothing is where it stands
    for (const o of [0, 0.22]) if (los(v.x, v.z, x + ax * o, z + az * o) || los(P.pos.x, P.pos.z, x + ax * o, z + az * o)) return null;
    if (probeAt(x, z, 0.2, P.pos.y, 1.9).pen > 0 || blockedAt(x, z, 0.22)) return null;
    return { x, z, ax, az, nx, nz, hp };
  }
  function watch(door = null, T = PEEK) {
    if (S.state !== 'away' || E.visible || hidden() || P.mode !== 'walk') return false;
    const lair = lairPos(), far = (n) => (lair ? Math.hypot(W.doors[n].mid.x - lair.x, W.doors[n].mid.z - lair.z) : 0);
    const names = door ? [door] : ['kid', 'bath', 'room2', 'spare'].filter((n) => W.doors[n]).sort((a, b) => far(a) - far(b));
    for (const name of names) {
      const sp = watchSpot(name, T); if (!sp) continue;
      E.root.scale.setScalar(T.scale); E.root.position.set(sp.x, P.pos.y, sp.z); E.faceTowards(sp.x - sp.nx * 3, sp.z - sp.nz * 3, 1);
      E.mode = 'idle'; E.lookTarget = camera.position; E.sneak = false; E.reach = 0; E.tilt = 0.25; E.smileScale = 1; E.flinch = 0; E.stun = 0; E.catchPose = null;
      const ry = E.root.rotation.y, lx = Math.cos(ry), lz = -Math.sin(ry);   // its left, in the world
      const lean = ((-sp.ax) * lx + (-sp.az) * lz > 0 ? -1 : 1) * T.side;
      E.leanSide = lean; E.lean = T.lean; E.visible = true;
      setState('sight'); S.sightT = 0; S.seenT = 0; S.sightOpts = { peek: true, stab: false }; S.node = nearestNode(sp.x, sp.z, null, P.pos.y) || S.node;
      S.peek = { door: name, mp: sp.hp, lean, fwd: T.lean, seen: 0, out: 0, noted: false, dur: 22 + mr() * 18 };
      return true;
    }
    return false;
  }
  function peekTick(dt) {
    const k = S.peek, g = gaze(); if (!k || !g) { vanish(false); return; }
    if (k.out > 0) {   // drawing back: upright again behind the wall, then not there
      k.out += dt; const u = Math.min(1, k.out / 0.26); E.leanSide = k.lean * (1 - u); E.lean = k.fwd * (1 - u);
      if (u >= 1) {
        const seen = k.seen > 0, door = k.door; vanish(false); S.cool = Math.max(S.cool, 12);
        // from the fifth night, having been caught looking, it may come round by that door a few seconds later
        if (seen && S.level >= 5 && mr() < 0.4) S.after = { t: 2.5 + mr() * 2.5, door };
      }
      return;
    }
    if (g.stared(k.mp, 0.93)) {
      k.seen += dt;
      if (!k.noted) { k.noted = true; logRow('watching', { door: k.door }); F.fear = Math.max(F.fear, 0.65); if (ctx.reveal) ctx.reveal(); }
    }
    if (k.seen > 0.45 || gap() < 2.4 || S.sightT > k.dur || hidden() || W.doors[k.door].target !== 1) {
      k.out = 1e-6;
      if (k.seen > 0) { sfx.whoosh(ctx.panFor(ep())); sfx.lurk(ctx.panFor(ep()), 0.5, 0.8); }
    }
  }
  // It stands at the place that has saved you twice: at its door, its back to the room, until you come near (then it turns; from the
  // fourth night it comes after you). Once a night for each place
  function guard(podId) {
    const pod = ctx.pods[podId]; if (!pod || !pod.node || S.guarded[podId]) return false;
    if (Math.hypot(NODES[pod.node][0] - P.pos.x, NODES[pod.node][1] - P.pos.z) < 4.5) return false;
    if (!sight(pod.node, { facing: pod.look, dur: 28 + mr() * 10, turnDist: 2.6, chase: S.level >= 4, stab: false, guard: podId })) return false;
    S.guarded[podId] = true; logRow('podGuard', { seen: false, pod: podId });
    return true;
  }
  // It baits: a knock somewhere ahead of you (and whatever the house can stir there: ctx.stir), and a moment later its creep from behind
  function bait() {
    const g = gaze(); if (!g) return false;
    const f = g.facingDir(), ahead = [];
    for (const k in NODES) {
      if (!indoor(k)) continue;
      const dx = NODES[k][0] - P.pos.x, dz = NODES[k][1] - P.pos.z, d = Math.hypot(dx, dz);
      if (d > 3.5 && d < 10 && (dx * f.x + dz * f.z) / d > 0.5) ahead.push(k);
    }
    if (!ahead.length) return false;
    const a = ahead[(mr() * ahead.length) | 0], node = pickSpawn(6, null, { behind: 5 }); if (!node) return false;
    if ((NODES[node][0] - P.pos.x) * f.x + (NODES[node][1] - P.pos.z) * f.z > 0) return false;   // only from behind
    const at = { x: NODES[a][0], y: 1.0, z: NODES[a][1] };
    if (!(ctx.stir && ctx.stir(at))) { if (!sfx.pick('wall_knock', { gain: 0.9, at, wet: 0.3 })) sfx.knock(ctx.panFor(tmp.set(at.x, at.y, at.z)), 0.3); }
    S.bait = { node, t: 1.3 + mr() * 1.2 }; logRow('bait', { seen: false, p: { x: +at.x.toFixed(2), z: +at.z.toFixed(2) } });
    return true;
  }
  // An encounter the night has budgeted (js/director.js) is about to begin: what it makes of it is its own business. true: it has
  // taken it (it watches, it stands at your closet, it baits); false leaves the encounter as it was planned. The first nights it only
  // watches
  function think(kind) {
    if (S.state !== 'away' || E.visible || hidden() || P.mode !== 'walk' || kind === 'hunt') return false;
    const m = mind();
    const burnt = Object.keys(m.pods).filter((id) => id !== 'bunk' && m.pods[id].saved >= 2 && ctx.pods[id] && !S.guarded[id]).sort((a, b) => m.pods[b].saved - m.pods[a].saved)[0];
    if (burnt && mr() < 0.7 && guard(burnt)) return true;
    if (kind === 'sight' && S.level >= 2 && mr() < 0.5 && watch()) return true;
    if (kind === 'stalk' && S.level >= 3 && mr() < 0.5 && bait()) return true;
    return false;
  }
  // while it is away: the lair drifts, a bait comes due, the watcher caught looking comes round
  function awayTick(dt) {
    lairTick(dt);
    if (S.bait) {
      S.bait.t -= dt;
      if (S.bait.t <= 0) { const b = S.bait; S.bait = null; if (!E.visible && !hidden() && F.live && !F.dead && !F.script && !F.cutscene) stalk(b.node); }
    }
    if (S.after) {
      S.after.t -= dt;
      if (S.after.t <= 0) {
        const a = S.after; S.after = null;
        if (!E.visible && !hidden() && F.live && !F.dead && !F.script && !F.cutscene) {
          const m = W.doors[a.door].mid, k = nearestNode(m.x, m.z, (q) => !los(P.pos.x, P.pos.z, NODES[q][0], NODES[q][1], P.pos.y, NODES[q][2] || 0), 0);
          if (k && Math.hypot(NODES[k][0] - m.x, NODES[k][1] - m.z) < 4) stalk(k);
        }
      }
    }
  }

  // ---- per frame ----
  function update(dt) {
    tick(dt); lowGuard();
  }
  function tick(dt) {
    if (S.cool > 0) S.cool -= dt;
    if (S.state === 'away') { S.steps.x = P.pos.x; S.steps.z = P.pos.z; awayTick(dt); return; }
    const g = gap(), podId = hidden();
    lightTick(dt);
    if (['hunt', 'search', 'stalk', 'crawl', 'leave'].includes(S.state)) { hearSteps(dt); hearDoors(); }
    if (S.state === 'hunt' || S.state === 'crawl') noteRoute();
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
        if (o.peek) { peekTick(dt); break; }
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
        // the light just came off its face: it backs away before it comes on again
        if (S.retreat > 0) { S.retreat -= dt; follow(dt, 1.5); if (S.retreat <= 0) S.replan = 0; break; }
        // your eyes came round to it with a corner one step behind it: it steps back out of sight, waits there, and comes again
        S.coverCool -= dt;
        if (watched && !S.wasWatched && !S.cover && S.level >= 3 && S.coverCool <= 0) {
          const c = coverNode();
          if (c && planTo(c)) { S.cover = { t: 1.2 + mr() * 1.6, life: 0 }; S.coverCool = 9; logRow('pulledBack'); }
        }
        S.wasWatched = watched;
        if (S.cover) {
          S.cover.life += dt;
          if (follow(dt, 2.3)) { E.mode = 'idle'; S.cover.t -= dt; if (S.cover.t <= 0) { S.cover = null; S.replan = 0; } }
          else if (S.cover.life > 4) { S.cover = null; S.replan = 0; }   // (something in its way: it gives the corner up)
          break;
        }
        S.frozen = watched && (S.level < 6 || g > 3.25);
        if (S.frozen) {
          E.mode = 'idle'; E.faceTowards(P.pos.x, P.pos.z, Math.min(1, dt * 6)); S.lookT += dt; S.frozenT += dt;
          if (S.frozenT >= 3 && !S.frozenLogged) { S.frozenLogged = true; logRow('stalkFrozen', { t: +S.frozenT.toFixed(1) }); }
          if (S.lookT > 7) vanish();
          break;
        }
        // your eyes left it: it has that moment. It comes on quicker than it creeps, and from the fourth night, once a stalk, it may not
        // be where you left it at all
        if (S.frozenT > 0.8 && S.level >= 2) {
          S.surge = Math.max(S.surge, 1.2 + Math.min(1.2, S.frozenT * 0.3));
          if (S.level >= 4 && !S.moved && S.frozenT > 1.5 && mr() < 0.4 && relocate()) { S.moved = true; S.frozenT = 0; break; }
        }
        S.frozenT = 0; if (S.surge > 0) S.surge -= dt;
        S.replan -= dt; if (S.replan <= 0) { S.replan = 0.7; planTo(playerNode()); }
        const arrived = follow(dt, Math.min(2.5, (0.95 + S.level * 0.05) * (S.surge > 0 ? 1.9 : 1)));
        if (!podId && g < 4.2 && sees()) { if (S.level >= 3 || S.sightOpts.chase) hunt(); else vanish(); }
        else if (podId && g < 3.5) { startSearch(); S.forcePod = podId; planTo(ctx.pods[podId].node); }
        else if (arrived) vanish();
        break;
      }
      case 'hunt': {
        if (!S.jolted && inView(ep().x, ep().z, 0.6) && sees()) huntJolt();
        if (S.retreat > 0) { S.retreat -= dt; follow(dt, 1.5); if (S.retreat <= 0) { S.path = []; S.pi = 0; } break; }   // the light just came off its face
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
          if (S.lingerLook) E.faceTowards(S.lingerLook[0], S.lingerLook[1], Math.min(1, dt * 3));   // at a place you have hidden in: it looks at its door
          else E.faceTowards(ep().x + Math.sin(S.searchT * 0.8) * 3, ep().z + Math.cos(S.searchT * 0.6) * 3, Math.min(1, dt * 2));
          // heard you since: it goes to the sound
          if (S.heardAt && ctx.now() - S.heardAt < 0.1 && S.lastSeen && Math.hypot(S.lastSeen.x - ep().x, S.lastSeen.z - ep().z) > 1.5) { S.searchWait = 0; S.listenedAt = null; S.searchList = [nearestNode(S.lastSeen.x, S.lastSeen.z, null, ep().y)]; planTo(S.searchList[0]); break; }
          if (S.searchWait <= 0) { S.listenedFor = S.listenedAt ? ctx.now() - S.listenedAt.t : 0; S.listenedAt = null; S.lingerLook = null; S.searchList.shift(); if (!S.searchList.length) { endSearch(); break; } planTo(S.searchList[0]); }
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
            const mem = podMem(podId), chance = clamp(0.3 + S.level * 0.07 + (S.checks[podId] || 0) * 0.25 + S.heard * 0.35 + Math.min(0.3, 0.08 * mem.used + 0.1 * mem.saved), 0.3, 0.97);
            if (S.forcePod === podId || S.heard > 1.4 || Math.random() < chance) { S.checks[podId] = (S.checks[podId] || 0) + 1; loom(podId); break; }
            if (!S.passed && podId !== 'bunk') { S.passed = true; logRow('podPassed', { pod: podId }); }
          }
          S.searchWait = 1.6 + Math.random() * 1.6;
          // a place you have hidden in before: it stays at it longer, facing its door
          const known = Object.keys(ctx.pods).find((id) => id !== 'bunk' && ctx.pods[id].node === here && mind().pods[id] && mind().pods[id].used > 0);
          if (known) { S.searchWait += Math.min(2.5, 0.8 * mind().pods[known].used); S.lingerLook = ctx.pods[known].look; }
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
          const mem = podMem(S.loomPod); mem.saved++; keep();
          setState('leave'); S.leaveT = 0; E.smileScale = 1;
          // the place has saved you twice: from the fourth night it may not go far. It stands a few steps off, out of sight of the door,
          // and waits for it to open (you can hear it breathe, and your heart still knows it is near)
          const pod = ctx.pods[S.loomPod], near = S.loomPod !== 'bunk' && S.level >= 4 && mem.saved >= 2 && mr() < 0.6 && pod.front
            ? Object.keys(NODES).filter((k) => { const p = navPath(pod.node, k, doorClosed), l = p ? pathLength(p) : 99; return l > 2.2 && l < 5.5 && !los(NODES[k][0], NODES[k][1], pod.front[0], pod.front[2], NODES[k][2] || 0, 0); }) : [];
          if (near.length && planTo(near[(mr() * near.length) | 0])) { S.wait = { t: 0, dur: 6 + mr() * 4, at: false, seen: 0, breathT: 1, look: pod.stand || pod.look }; logRow('podWait', { seen: false, pod: S.loomPod }); break; }
          const far = pickSpawn(9) || 'hallW'; planTo(far);
        }
        break;
      }
      case 'open': { S.openT += dt; F.fear = 1; break; }   // ctx.openPod plays it out and the catch ends it
      case 'leave': {
        S.leaveT += dt; E.tilt = 0.2;
        if (S.wait) {
          const w = S.wait;
          if (!w.at) { if (follow(dt, 1.4) || S.leaveT > 7) w.at = true; break; }
          w.t += dt; E.mode = 'idle'; E.faceTowards(w.look[0], w.look[1], Math.min(1, dt * 3));
          headPos(); w.breathT -= dt; if (w.breathT <= 0) { w.breathT = 2.6; sfx.pick('breath', { gain: 0.6, at: { x: head.x, y: head.y, z: head.z }, rate: 0.62, wet: 0.2 }); }
          // you came out and it is looking at you: a held second, and it is gone on the flicker (from the seventh night it comes)
          if (!podId && sees(7)) {
            if (!w.seen) { E.lookTarget = camera.position; sfx.giggle(ctx.panFor(ep())); ctx.onTurn(); }
            w.seen += dt; E.faceTowards(P.pos.x, P.pos.z, Math.min(1, dt * 6));
            if (w.seen > 1.1) { S.wait = null; if (S.level >= 7) hunt(); else { ctx.flicker(0.6); vanish(); } }
          } else if (w.t > w.dur) { S.wait = null; vanish(); }
          break;
        }
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
    { const id = hidden(); if (id && id !== 'bunk' && ctx.pods[id]) { podMem(id).saved++; keep(); } }
    setState('leave'); S.leaveT = 0; sfx.bed('music/chase', 0, 2); if (sfx.tensionDrone) sfx.tensionDrone(0, 2); sfx.drone(0.085, 3);
    const far = pickSpawn(9) || 'hallW'; planTo(far);
  }

  return {
    S, update, sight, stalk, hunt, crawl, vanish, dismiss, notifyPod, loom, openPod, pickSpawn, los, looking, playerNode, startSearch, searchFrom, place, refused, blockedAt,
    think, watch, guard, bait, lairPos, get mind() { return mind(); }, get lair() { return S.lair; },
    get state() { return S.state; }, get busy() { return S.state !== 'away'; }, get cool() { return S.cool; },
    setLevel(n) { S.level = n; E.level = n; }, reset() { vanish(false); S.cool = 0; S.checks = {}; S.hinted = false; S.lastFlash = undefined; F.chase = false; S.mr = null; S.lair = null; S.lairT = 0; S.guarded = {}; S.bait = null; S.after = null; S.cut = null; S.roomWas = null; },
    gap, sees,
  };
}
