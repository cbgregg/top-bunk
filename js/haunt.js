// The house's own restlessness. While you are not looking, ordinary things change: a chair is out from the table and turned to face your
// room (later it stands in your room, facing the bunk), a door that was shut is ajar and one that was open is shut, your toys are in a
// row in the hall pointing at your door, a photograph hangs crooked and then all of them do, the pantry stands open, the bear sits on the
// floor facing where you were, a light is on in a room nobody is in. Now and then, on the night's budget, something moves while you
// watch: a ball rolls out of a dark doorway, a cup slides off the kitchen table and breaks, a chair scrapes a hand's width, a cupboard
// door swings open slowly.
//
// How it is paced. The night has a number of changes to spend (three on night two, a dozen by the end) and spends them along the clock,
// faster while you are frightened and just after the thing has been out. A change is only made where gaze.unseen() says you are not
// looking and have not just looked, more than two metres from you, never while the thing is in the world, and it makes a small sound
// where it happens. Changes cluster round the thing's lair (hunter.lairPos: where it is keeping while it is away, and where it comes
// from), so the restless end of the house is the end to watch. The ones made in view go through the night engine's own gate
// (events.mayFire: the quiet curve and the tier caps) and count against it. Everything stays where it was put until dawn (or until the
// night is started again), then goes home: the reset is on the engine's cleanup list.
//
// Nothing is put through anything: a thing set down on a floor is tested against the boundaries (collide.probe) with room to spare, kept
// off the lines the thing and the parents walk (the graph's edges) and out of every doorway, and has a footprint of its own once it
// stands there. Every draw comes from a generator seeded by the run and the night.
//   start(plan, n) / tick(dt) / reset()     the night's hooks (js/nights.js)
//   stir(at)                                make the change nearest a point now, or a knock there (the thing's bait)
//   force(id) / forceView(id)               make one by name, whatever the pacing says (the tests); H the state, DEFS the table
import * as THREE from 'three';
import { NODES, ADJ } from './nav.js';
import { ROOMS } from './world.js';
import { probe, bodies, PLAYER_R } from './collide.js';
import { loadProp } from './props.js';
import { rng, weighted, shuffle } from './rng.js';
import * as log from './log.js';
import * as events from './events.js';

const clamp = THREE.MathUtils.clamp;
const DOORS = ['kid', 'bath', 'room2', 'spare'], DOOR_ROOM = { kid: 'bed', bath: 'bath', room2: 'room2', spare: 'spare' };
const QUIET_TYPES = new Set(['poltergeist', 'vigil', 'car', 'finale']);   // nights with a scene of their own that the house keeps out of
// how many changes a night has to spend, and how many of them may be made in front of you
export const changesFor = (n) => (n < 2 ? 0 : clamp(Math.round(1.5 + 1.15 * n), 3, 13));
export const inViewFor = (n) => (n < 2 ? 0 : n < 4 ? 1 : n < 7 ? 2 : 3);
const EDGE_TALL = 0.45, EDGE_LOW = 0.3;   // what a thing set down keeps clear of a walked line, beyond its own half-width
const _v = new THREE.Vector3(), _ax = new THREE.Vector3();

export function createHaunt(ctx) {
  const { W, P, F, E, sfx, gaze, hunter } = ctx;
  const H = { on: false, n: 0, plan: null, r: () => 0.5, heat: 0, clock: 0, acc: 0, tryAt: 0, t: 0, done: [], anims: [], counts: {}, inView: 0, lastIn: -99, ajar: {}, built: false };
  const lights = () => (ctx.lights ? ctx.lights() : null);
  const dist = (p) => Math.hypot(P.pos.x - p.x, P.pos.z - p.z);
  const playerRoom = () => gaze.roomOf({ x: P.pos.x, z: P.pos.z, y: P.pos.y });
  const hid = (p, min = 2.2) => dist(p) > min && gaze.unseen({ x: p.x, z: p.z, y: 0 }, 2.5);
  const watched = (p, lo = 1.8, hi = 7.5) => { const d = dist(p); return d > lo && d < hi && gaze.inView({ x: p.x, z: p.z, y: Math.max(0, (p.y || 0) - 0.6) }, 0.75) && gaze.facing(p) > 0.8; };
  const free = () => F.live && !F.dead && !F.script && !F.cutscene && !F.pause && P.mode !== 'cine' && !hunter.busy && !events.NIGHT.suspended;
  // (a door off the hall is also held, all four at once, by the beat that is waiting behind one or about to shut one: js/scares.js)
  const held = (name) => events.RES.isHeld(name) || events.RES.isHeld('n1') || (name.startsWith('door:') && events.RES.isHeld('hallDoors'));
  const snd = (key, at, gain = 0.35, o = {}) => {
    const muffle = !hunter.los(P.pos.x, P.pos.z, at.x, at.z, P.pos.y, 0);
    return sfx.pick(key, { gain, at: { x: at.x, y: at.y ?? 0.6, z: at.z }, wet: 0.3, muffle, ...o });
  };
  const placed = (at) => sfx.place(0, { x: at.x, y: at.y ?? 0.6, z: at.z });

  // ---- where a thing may stand ----
  const clearAt = (x, z, r, h = 1.0) => probe(x, z, r + 0.04, 0, h).pen <= 0;
  const segDist = (px, pz, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1, t = clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1); return Math.hypot(px - ax - dx * t, pz - az - dz * t); };
  // clear of every line somebody walks (the graph's edges on this floor) by `gap`, and of every doorway (door: how far from its middle)
  function offWays(x, z, gap, door = gap + 0.75) {
    for (const a in ADJ) {
      if (NODES[a][2]) continue;
      for (const e of ADJ[a]) { if (NODES[e.to][2] || e.to < a) continue; if (segDist(x, z, NODES[a][0], NODES[a][1], NODES[e.to][0], NODES[e.to][1]) < gap) return false; }
    }
    for (const k in W.doors) { const d = W.doors[k]; if (!(d.y0 || 0) && Math.hypot(d.mid.x - x, d.mid.z - z) < door) return false; }
    return true;
  }
  // the spot in a room nearest `want` where something of half-width r can be set down unseen
  function findSpot(room, want, r, edge, { minPlayer = 2.2, keep = null } = {}) {
    const R = ROOMS[room]; if (!R) return null;
    let best = null, bd = 1e9;
    for (let x = R[0] + 0.35; x <= R[1] - 0.35; x += 0.2) {
      for (let z = R[2] + 0.35; z <= R[3] - 0.35; z += 0.2) {
        const d = Math.hypot(x - want.x, z - want.z); if (d >= bd) continue;
        if (keep && !keep(x, z)) continue;
        if (!clearAt(x, z, r) || !offWays(x, z, r + edge) || !hid({ x, z }, minPlayer)) continue;
        best = { x, z }; bd = d;
      }
    }
    return best;
  }

  // ---- the things it keeps of its own: three toys, a cup and what is left of it ----
  const toys = [], cup = { g: null, shards: [], broken: false, home: null, top: 0.75 };
  let tableHolder = null, tableC = null;
  function build() {
    if (H.built) return; H.built = true;
    // the toys: the ball (kept by its middle, so it can roll), the duck, the football; each with a footprint while it is on a floor
    for (const [name, s, mid] of [['d_ball', 1.6, true], ['d_duck', 0.4, false], ['d_football', 0.5, false]]) {
      const g = new THREE.Group(); g.visible = false; g.userData.noWarp = true; W.house.add(g);
      const toy = { name, g, r: 0.1, h: 0.2, y: 0, ready: false, busy: false }; toys.push(toy);
      loadProp(name).then((m0) => {
        const m = m0.scene.clone(true); m.scale.setScalar(s); m.updateMatrixWorld(true);
        const b = new THREE.Box3().setFromObject(m, true);
        toy.r = Math.max(b.max.x - b.min.x, b.max.z - b.min.z) / 2; toy.h = b.max.y - b.min.y; toy.y = mid ? toy.h / 2 : 0;
        m.position.set(-(b.min.x + b.max.x) / 2, mid ? -(b.min.y + b.max.y) / 2 : -b.min.y, -(b.min.z + b.max.z) / 2); g.add(m);
        if (W.follow) W.follow(g, toy.r, toy.r, { maxY: toy.h, id: 'haunt:' + name, onFloor: (o) => o.visible && !toy.busy });
        toy.ready = true;
      }).catch(() => {});
    }
    // the cup: a blue enamel mug on the kitchen table, and six pieces of it for the floor
    const white = new THREE.MeshStandardMaterial({ color: 0x27468a, roughness: 0.3 });
    const body = new THREE.Mesh(new THREE.LatheGeometry([[0.0, 0.0], [0.03, 0.0], [0.036, 0.008], [0.038, 0.085], [0.034, 0.085], [0.031, 0.012], [0.0, 0.012]].map(([x, y]) => new THREE.Vector2(x, y)), 18), white);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 6, 12, Math.PI), white); handle.rotation.z = -Math.PI / 2; handle.position.set(0.036, 0.045, 0);
    cup.g = new THREE.Group(); cup.g.add(body, handle); cup.g.visible = false; cup.g.userData.noWarp = true; W.house.add(cup.g);
    const piece = new THREE.TetrahedronGeometry(0.038, 0);
    for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(piece, white); m.visible = false; m.userData.noWarp = true; W.house.add(m); cup.shards.push(m); }
    tableHolder = W.house.children.find((o) => o.userData && o.userData.prop === 'table_round') || null;
    if (W.chairs && W.chairs.length) { tableC = { x: 0, z: 0 }; for (const c of W.chairs) { tableC.x += c.x / W.chairs.length; tableC.z += c.z / W.chairs.length; } }
    // the ball and the duck the room already has: a footprint for when they are on the floor
    for (const name of ['d_ball', 'd_duck']) {
      const rec = decorItem(name); if (!rec || !rec.box || !W.follow) continue;
      const hx = (rec.box[1] - rec.box[0]) / 2, hz = (rec.box[5] - rec.box[4]) / 2;
      W.follow(rec.holder, hx, hz, { maxY: rec.box[3] - rec.box[2], id: 'haunt:decor:' + name, onFloor: (o) => o.position.y < 0.2 });
    }
  }
  const decorItem = (name) => (W.decor && W.decor.items ? W.decor.items.find((i) => i.name === name && i.holder && i.kind === 'on') : null);
  function tableTop() {
    if (!tableHolder || !tableC || !tableHolder.children.length) return null;
    const b = new THREE.Box3().setFromObject(tableHolder, true); if (!isFinite(b.max.y)) return null;
    return { y: b.max.y, r: Math.min(b.max.x - b.min.x, b.max.z - b.min.z) / 2 };
  }
  function setCup() {
    cup.broken = false; for (const s of cup.shards) s.visible = false;
    const t = tableTop(); if (!t || !cup.g) { if (cup.g) cup.g.visible = false; return; }
    cup.top = t.y; cup.r = t.r; cup.home = { x: tableC.x + 0.16, z: tableC.z - 0.1 };
    cup.g.position.set(cup.home.x, t.y, cup.home.z); cup.g.rotation.set(0, 2.2, 0); cup.g.visible = true;
  }

  // ---- the chairs ----
  const chairHome = (i) => { const c = W.chairs[i]; return Math.hypot(c.holder.position.x - c.x, c.holder.position.z - c.z) < 0.02 && Math.abs(c.holder.rotation.y - c.rot) < 0.02; };
  const chairsFree = () => !held('table') && W.chairs && W.chairs.length && tableC;
  // may chair i stand at (x, z)? Asked with the chair itself lifted out of the way, so its own footprint does not answer
  function chairFits(i, x, z, edge = EDGE_TALL) {
    const c = W.chairs[i], was = [c.holder.position.x, c.holder.position.z, c.holder.rotation.y];
    W.moveChair(i, 90, 90, was[2]);
    const ok = clearAt(x, z, 0.3, 1.0) && offWays(x, z, 0.3 + edge);
    W.moveChair(i, was[0], was[1], was[2]);
    return ok;
  }
  const kidDoorDir = (x, z) => { const m = W.doors.kid ? W.doors.kid.mid : { x: 9.79, z: 0.3 }; return Math.atan2(m.x - x, m.z - z); };

  // ---- the table of changes made out of view. find() -> { at, apply() -> undo, sound() } or null ----
  const DEFS = [
    // a chair out from the table, turned round to face the way to your room
    { id: 'chairTurn', minN: 2, max: 2, w: 3, find() {
      if (!chairsFree()) return null;
      for (const i of shuffle(H.r, W.chairs.map((_, k) => k))) {
        if (!chairHome(i)) continue;
        const c = W.chairs[i], ox = c.x - tableC.x, oz = c.z - tableC.z, ol = Math.hypot(ox, oz) || 1, x = c.x + ox / ol * 0.45, z = c.z + oz / ol * 0.45;
        if (!hid({ x: c.x, z: c.z }) || !hid({ x, z }) || !chairFits(i, x, z)) continue;
        return { at: { x, z, y: 0.5 }, apply: () => { W.moveChair(i, x, z, kidDoorDir(x, z)); return () => W.moveChair(i, c.x, c.z, c.rot); }, sound: (k) => snd('chair_scrape', { x, z, y: 0.3 }, 0.3 * k) };
      }
      return null;
    } },
    // a chair from the kitchen in your room, facing the bunk
    { id: 'chairBunk', minN: 4, max: 1, w: 2.5, find() {
      if (!chairsFree() || playerRoom() === 'bed' || P.mode !== 'walk' || held('bunk')) return null;
      const i = W.chairs.findIndex((_, k) => chairHome(k)); if (i < 0) return null;
      const c = W.chairs[i], bunk = NODES.kidBunk, look = { x: bunk[0], z: bunk[1] + 1.1 };
      if (!hid({ x: c.x, z: c.z })) return null;
      const s = findSpot('bed', { x: bunk[0] + 1.5, z: bunk[1] + 0.3 }, 0.3, EDGE_TALL, { keep: (x, z) => Math.hypot(x - bunk[0], z - bunk[1]) > 1.2 && Math.hypot(x - look.x, z - look.z) > 1.3 && Math.hypot(x - bunk[0] - 0.8, z - bunk[1]) > 1.25 });   // (clear of the bunk and of the foot of its ladder)
      if (!s) return null;
      return { at: { x: s.x, z: s.z, y: 0.5 }, apply: () => { W.moveChair(i, s.x, s.z, Math.atan2(look.x - s.x, look.z - s.z)); return () => W.moveChair(i, c.x, c.z, c.rot); }, sound: (k) => snd('chair_scrape', { x: s.x, z: s.z, y: 0.3 }, 0.3 * k) };
    } },
    // a door that was shut stands ajar
    { id: 'doorAjar', minN: 2, max: 2, w: 3, find() {
      for (const name of shuffle(H.r, DOORS)) {
        const d = W.doors[name]; if (!d || d.target !== 0 || d.a > 0.02 || held('door:' + name) || H.ajar[name] !== undefined) continue;
        const at = { x: d.mid.x, z: d.mid.z, y: 1.0 }; if (!hid(at, 2.6)) continue;
        return { at, apply: () => { d.max = 0.2 + H.r() * 0.1; H.ajar[name] = true; W.setDoor(name, true, true); return () => { d.max = 1; if (H.ajar[name]) W.setDoor(name, false, true); delete H.ajar[name]; }; }, sound: (k) => snd('door_creak', at, 0.3 * k, { rate: 1.1 }) };
      }
      return null;
    } },
    // a door that was open is shut
    { id: 'doorShut', minN: 2, max: 2, w: 3, find() {
      for (const name of shuffle(H.r, DOORS)) {
        const d = W.doors[name]; if (!d || d.target !== 1 || d.a < 0.9 || (d.max ?? 1) < 1 || held('door:' + name)) continue;
        const at = { x: d.mid.x, z: d.mid.z, y: 1.0 }; if (!hid(at, 2.6)) continue;
        if (bodies.some((b) => (!b.active || b.active()) && Math.hypot(b.pos.x - at.x, b.pos.z - at.z) < 1.5)) continue;   // nobody in its swing
        return { at, apply: () => { W.setDoor(name, false, true); return () => { if (W.doors[name].target === 0) W.setDoor(name, true, true); }; }, sound: (k) => snd('door_close', at, 0.32 * k) };
      }
      return null;
    } },
    // your toys in a row along the hall wall, pointing at your door
    { id: 'toys', minN: 3, max: 1, w: 2.5, find() {
      const d = W.doors.kid, R = ROOMS.hall; if (!d || !R || toys.some((t) => !t.ready || t.g.visible) || playerRoom() === 'hall') return null;
      const side = d.mid.z > (R[2] + R[3]) / 2 ? 1 : -1, wall = side > 0 ? R[3] : R[2], spots = [];
      for (let i = 0; i < toys.length; i++) {
        // (beside the door, not in it: the nearest is a step past the jamb, each a hand off the wall)
        const t = toys[i], x = d.mid.x - 0.85 - i * 0.36, z = wall - side * (0.1 + t.r + 0.05);
        if (!clearAt(x, z, t.r, 0.4) || !offWays(x, z, t.r + EDGE_LOW, 0.75) || !hid({ x, z })) return null;
        spots.push({ x, z });
      }
      const at = { x: spots[1].x, z: spots[1].z, y: 0.1 };
      return { at, apply: () => { toys.forEach((t, i) => { t.g.position.set(spots[i].x, t.y, spots[i].z); t.g.rotation.set(0, Math.PI / 2, 0); t.g.visible = true; }); return () => toys.forEach((t) => { t.g.visible = false; }); }, sound: (k) => snd('toy_squeak', at, 0.22 * k) };
    } },
    // a photograph in the hall hangs crooked; later all of them do
    { id: 'frame', minN: 2, max: 1, w: 3, find() {
      const fr = (W.frames || []).filter((g) => !g.rotation.z); if (!fr.length) return null;
      const lair = hunter.lairPos() || P.pos, g = fr.slice().sort((a, b) => Math.hypot(a.position.x - lair.x, a.position.z - lair.z) - Math.hypot(b.position.x - lair.x, b.position.z - lair.z))[0];
      const at = { x: g.position.x, z: g.position.z, y: g.position.y }; if (!hid(at)) return null;
      const tilt = (H.r() < 0.5 ? -1 : 1) * (0.1 + H.r() * 0.1);
      return { at, apply: () => { g.rotation.z = tilt; return () => { g.rotation.z = 0; }; }, sound: (k) => snd('wall_knock', at, 0.16 * k, { rate: 1.4 }) };
    } },
    { id: 'frames', minN: 4, max: 1, w: 2, after: 'frame', find() {
      const fr = W.frames || []; if (fr.length < 2 || playerRoom() === 'hall' || fr.some((g) => !hid({ x: g.position.x, z: g.position.z }))) return null;
      const tilts = fr.map(() => (H.r() < 0.5 ? -1 : 1) * (0.08 + H.r() * 0.14)), mid = fr[(fr.length / 2) | 0], at = { x: mid.position.x, z: mid.position.z, y: mid.position.y };
      return { at, apply: () => { fr.forEach((g, i) => { g.rotation.z = tilts[i]; }); if (W.hallFrame && !W.hallFrame.fallen) W.hallFrame.tilt(0.13); return () => { fr.forEach((g) => { g.rotation.z = 0; }); if (W.hallFrame && !W.hallFrame.fallen) W.hallFrame.tilt(0); }; }, sound: (k) => snd('wall_knock', at, 0.2 * k, { rate: 1.3 }) };
    } },
    // the pantry stands open
    { id: 'cupboard', minN: 2, max: 2, w: 2.5, find() {
      for (const c of shuffle(H.r, W.cupboards || [])) {
        if (c.k > 0 || c.busy) continue;
        const at = { x: c.at.x, z: c.at.z - 0.3, y: 1.2 }; if (!hid(at, 2.4) || !clearAt(at.x, at.z - 0.1, 0.3, 1.9)) continue;
        const k1 = 0.72 + H.r() * 0.2;
        return { at, apply: () => { c.open(k1); return () => c.open(0); }, sound: (k) => snd('cabinet', at, 0.4 * k) };
      }
      return null;
    } },
    // your bear, off the bunk, on the floor, facing where you are
    { id: 'teddy', minN: 3, max: 1, w: 2.5, find() {
      const b = W.teddy; if (!b || !b.visible || b.sim || !b.rest || (H.plan && H.plan.type === 'teddy') || held('bunk') || held('teddy')) return null;
      if (b.position.distanceTo(b.rest.pos) > 0.05 || !hid({ x: b.position.x, z: b.position.z }, 1.2)) return null;
      const d = W.doors.kid, inRoom = playerRoom() === 'bed' || P.mode !== 'walk';
      const s = d ? findSpot(inRoom ? 'hall' : 'bed', { x: d.mid.x + (inRoom ? 0.9 : 0.6), z: d.mid.z + (inRoom ? -0.6 : 1.5) }, 0.2, EDGE_LOW) : null; if (!s) return null;
      return { at: { x: s.x, z: s.z, y: 0.2 }, apply: () => { b.setDown(s.x, 0.004, s.z, { facing: Math.atan2(P.pos.x - s.x, P.pos.z - s.z), settle: false }); return () => { if (!b.sim) b.reset(); }; }, sound: (k) => snd('cloth', { x: s.x, z: s.z, y: 0.1 }, 0.25 * k) };
    } },
    // a light on in a room nobody is in
    { id: 'light', minN: 3, max: 1, w: 2, find() {
      const L = lights(); if (!L || F.blackout) return null;
      const here = playerRoom();
      for (const room of shuffle(H.r, ['bath', 'spare', 'room2', 'kitchen', 'living'])) {
        const R = ROOMS[room]; if (!R || room === here || L.isOn(room)) continue;
        const at = { x: (R[0] + R[1]) / 2, z: (R[2] + R[3]) / 2, y: 1.2 };
        if (!hid(at, 3) || hunter.los(P.pos.x, P.pos.z, at.x, at.z, P.pos.y, 0)) continue;
        return { at, apply: () => { const on = L.set(room, true, { by: 'house' }); return () => { if (on && L.isOn(room)) L.set(room, false, { by: 'house', silent: true }); }; }, sound: () => {} };
      }
      return null;
    } },
    // the ball off its shelf, the duck off the tub: on the floor, in the middle of the room
    { id: 'small', minN: 2, max: 2, w: 2.5, find() {
      for (const [name, room, node] of shuffle(H.r, [['d_ball', 'bed', 'kidMid'], ['d_duck', 'bath', 'bathMid']])) {
        const rec = decorItem(name); if (!rec || !rec.box || rec.holder.position.y < 0.2) continue;
        const h = rec.holder, was = h.position.clone(), rot = h.rotation.y, r = Math.max(rec.box[1] - rec.box[0], rec.box[5] - rec.box[4]) / 2;
        if (!hid({ x: was.x, z: was.z }, 1.5)) continue;
        const s = findSpot(room, { x: NODES[node][0] + 0.5, z: NODES[node][1] + 0.5 }, r, EDGE_LOW); if (!s) continue;
        const d = W.doors[room === 'bed' ? 'kid' : 'bath'];
        return { at: { x: s.x, z: s.z, y: 0.1 }, apply: () => { h.position.set(s.x, 0, s.z); h.rotation.y = d ? Math.atan2(d.mid.x - s.x, d.mid.z - s.z) : rot; return () => { h.position.copy(was); h.rotation.y = rot; }; }, sound: (k) => snd(name === 'd_duck' ? 'toy_squeak' : 'wall_knock', { x: s.x, z: s.z, y: 0.1 }, 0.2 * k, { rate: name === 'd_duck' ? 0.9 : 1.6 }) };
      }
      return null;
    } },
  ];

  // ---- the ones made while you watch. find() -> { at, run() } or null; run() starts it and returns nothing ----
  const anim = (dur, step, end) => { H.anims.push({ t: 0, dur, step, end }); };
  const VIEW = [
    // a ball rolls out of a dark doorway, across the hall, and stops against the far wall
    { id: 'roll', find() {
      const ball = toys[0], L = lights(); if (!ball || !ball.ready || ball.g.visible) return null;
      for (const name of shuffle(H.r, DOORS)) {
        const d = W.doors[name]; if (!d || d.a < 0.9 || d.target !== 1 || held('door:' + name) || playerRoom() === DOOR_ROOM[name] || playerRoom() !== 'hall') continue;
        // out of the room: across the wall line, away from the room's middle (and watched: the floor a step out from the doorway is)
        const m = d.mid, R = ROOMS[DOOR_ROOM[name]], nz = Math.sign(m.z - (R[2] + R[3]) / 2) || 1, sx = m.x, sz = m.z - nz * 0.9;
        if (!watched({ x: m.x, z: m.z + nz * 0.4, y: 0.3 }, 2.2, 8)) continue;
        if (L && L.levelAt(sx, sz, 0) > 0.2) continue;
        if (!clearAt(sx, sz, ball.r, 0.4)) continue;
        // straight out, or a little to one side: as far as it can roll, to stop against something, clear of the walked lines and of
        // the doorway opposite
        let run = null;
        for (const drift of shuffle(H.r, [0, 0.55, -0.55, 0.3, -0.3])) {
          const tx = drift, tz = nz * 2.3, tl = Math.hypot(tx, tz), ux = tx / tl, uz = tz / tl;
          let len = 0; while (len < 3.2 && clearAt(sx + ux * (len + 0.05), sz + uz * (len + 0.05), ball.r, 0.4)) len += 0.05;
          const ex = sx + ux * (len - 0.02), ez = sz + uz * (len - 0.02);
          if (Math.abs(ez - m.z) < 0.8 || Math.sign(ez - m.z) !== nz || !offWays(ex, ez, ball.r + EDGE_LOW, 0.6)) continue;
          run = { ux, uz, len: len - 0.02, ex, ez }; break;
        }
        if (!run) continue;
        const at = { x: m.x, z: m.z + nz * 0.4, y: 0.2 };
        return { at, run: () => {
          ball.busy = true; ball.g.position.set(sx, ball.y, sz); ball.g.rotation.set(0, 0, 0); ball.g.visible = true;
          sfx.noiseHit({ dur: 1.7, type: 'lowpass', f: 240, gain: 0.3, attack: 0.25, wet: 0.2, pan: placed(at) });
          let was = 0;
          anim(2.0, (k) => { const e = 1 - (1 - k) * (1 - k), d = e * run.len; ball.g.position.set(sx + run.ux * d, ball.y, sz + run.uz * d); ball.g.rotateOnWorldAxis(_ax.set(run.uz, 0, -run.ux), (d - was) / Math.max(0.03, ball.h / 2)); was = d; },
            () => { ball.busy = false; snd('wall_knock', { x: run.ex, z: run.ez, y: 0.1 }, 0.25, { rate: 1.7 }); });
          return () => { ball.g.visible = false; ball.busy = false; };
        } };
      }
      return null;
    } },
    // the cup on the kitchen table slides to the edge, goes over, and breaks on the floor
    { id: 'cup', find() {
      if (!cup.g || !cup.g.visible || cup.broken || !cup.home || held('table')) return null;
      const at = { x: cup.home.x, z: cup.home.z, y: cup.top }; if (!watched(at, 1.8, 6.5)) return null;
      let best = null, bs = -1;
      for (const [dx, dz] of [[0.707, 0.707], [0.707, -0.707], [-0.707, 0.707], [-0.707, -0.707]]) {
        const lx = tableC.x + dx * (cup.r + 0.16), lz = tableC.z + dz * (cup.r + 0.16);
        // (onto the floor between two chairs: the table's own box on the plan is square, and its corner is not in the way of a cup)
        if (W.chairs.some((c) => Math.hypot(c.holder.position.x - lx, c.holder.position.z - lz) < 0.5) || Math.hypot(lx - P.pos.x, lz - P.pos.z) < 1.2) continue;
        // where you will see it land: in view, and on your side of the table rather than behind it
        if (!gaze.inView({ x: lx, z: lz, y: 0 }, 0.85)) continue;
        const s = 1 / (1 + Math.hypot(lx - P.pos.x, lz - P.pos.z)); if (s > bs) { bs = s; best = [dx, dz, lx, lz]; }
      }
      if (!best) return null;
      const [dx, dz, lx, lz] = best, ex = tableC.x + dx * (cup.r - 0.02), ez = tableC.z + dz * (cup.r - 0.02), sx = cup.home.x, sz = cup.home.z;
      return { at, run: () => {
        sfx.noiseHit({ dur: 1.25, type: 'bandpass', f: 2600, q: 1.4, gain: 0.07, attack: 0.2, wet: 0.15, pan: placed(at) });
        anim(1.3, (k) => { const e = k * k; cup.g.position.set(sx + (ex - sx) * e, cup.top, sz + (ez - sz) * e); }, () => {
          const fall = Math.sqrt(2 * cup.top / 9.8);
          anim(fall, (k) => { const t = k * fall; cup.g.position.set(ex + (lx - ex) * k, Math.max(0.03, cup.top - 4.9 * t * t), ez + (lz - ez) * k); cup.g.rotation.x = k * 1.9 * dz; cup.g.rotation.z = -k * 1.9 * dx; }, () => {
            cup.broken = true; cup.g.visible = false;
            const p = { x: lx, y: 0.05, z: lz };
            cup.shards.forEach((m, i) => { const a = H.r() * 6.283, d = 0.03 + H.r() * 0.2; m.position.set(lx + Math.cos(a) * d, 0.012, lz + Math.sin(a) * d); m.rotation.set(H.r() * 0.3, a, H.r() * 0.3); m.scale.set(0.8 + H.r() * 0.9, 0.32, 0.7 + H.r() * 0.8); m.visible = true; });
            if (!sfx.pick('glass_ring', { gain: 0.9, at: p, rate: 1.3, wet: 0.25 })) sfx.tone({ f: 2400, f2: 1800, dur: 0.3, gain: 0.2, pan: placed(p) });
            sfx.pick('bowl', { gain: 0.8, at: p, rate: 1.5, wet: 0.25 });
            for (let i = 0; i < 4; i++) sfx.noiseHit({ dur: 0.05 + i * 0.03, type: 'highpass', f: 3200 + i * 900, gain: 0.3 - i * 0.05, delay: i * 0.035, wet: 0.25, pan: placed(p) });
            if (ctx.addShake) ctx.addShake(0.2); F.fear = Math.max(F.fear, 0.7);
          });
        });
        return () => {};
      } };
    } },
    // a chair at the table scrapes a hand's width back
    { id: 'scrape', find() {
      if (!chairsFree()) return null;
      for (const i of shuffle(H.r, W.chairs.map((_, k) => k))) {
        if (!chairHome(i)) continue;
        const c = W.chairs[i], at = { x: c.x, z: c.z, y: 0.5 }; if (!watched(at, 2, 7)) continue;
        const ox = c.x - tableC.x, oz = c.z - tableC.z, ol = Math.hypot(ox, oz) || 1, x = c.x + ox / ol * 0.12, z = c.z + oz / ol * 0.12;
        if (!chairFits(i, x, z)) continue;
        return { at, run: () => {
          if (!sfx.pick('chair_scrape', { gain: 0.8, at: { x: c.x, y: 0.2, z: c.z }, wet: 0.25 })) sfx.scrape(placed(at));
          anim(0.45, (k) => { const e = k * (2 - k); W.moveChair(i, c.x + (x - c.x) * e, c.z + (z - c.z) * e, c.rot); });
          return () => W.moveChair(i, c.x, c.z, c.rot);
        } };
      }
      return null;
    } },
    // a pantry door swings open, slowly
    { id: 'swing', find() {
      for (const c of shuffle(H.r, W.cupboards || [])) {
        if (c.k > 0 || c.busy) continue;
        const at = { x: c.at.x, z: c.at.z, y: 1.2 }; if (!watched(at, 2, 6.5) || !clearAt(at.x, at.z - 0.4, 0.3, 1.9)) continue;
        return { at, run: () => {
          c.busy = true; snd('door_creak', at, 0.6, { rate: 1.3 });
          anim(2.6, (k) => c.open(0.8 * k * k * (3 - 2 * k)), () => { c.busy = false; });
          return () => { c.busy = false; c.open(0); };
        } };
      }
      return null;
    } },
  ];

  // ---- making one ----
  const near = (at) => { const l = hunter.lairPos(); if (!l) return 1; const d = Math.hypot(at.x - l.x, at.z - l.z); return 1 + 3 / (1 + (d / 3.5) * (d / 3.5)); };
  const count = (id) => H.counts[id] || 0;
  const eligible = (d) => H.n >= d.minN && count(d.id) < d.max && (!d.after || count(d.after) > 0);
  function make(def, plan, loud = 1) {
    const undo = plan.apply(); try { plan.sound(loud); } catch (e) { /* no sound */ }
    H.counts[def.id] = count(def.id) + 1;
    const row = log.push({ id: 'haunt:' + def.id, seen: false, how: 'unseen', room: gaze.roomOf(plan.at), p: { x: +plan.at.x.toFixed(2), z: +plan.at.z.toFixed(2) } });
    H.done.push({ id: def.id, at: plan.at, undo, row, found: false });
    return true;
  }
  function tryChange() {
    const c = [];
    for (const def of DEFS) { if (!eligible(def)) continue; const plan = def.find(); if (plan) c.push([[def, plan], def.w * near(plan.at)]); }
    if (!c.length) return false;
    const [def, plan] = weighted(H.r, c);
    return make(def, plan);
  }
  function tryView() {
    if (H.inView >= inViewFor(H.n) || H.t - H.lastIn < 60 || P.mode !== 'walk' || P.sprinting || F.fear > 0.5 || hunter.cool > 0 || ctx.hidden()) return false;
    if (!events.mayFire('wrong', { reveal: true })) return false;
    for (const v of shuffle(H.r, VIEW)) { const plan = v.find(); if (plan) return view(v, plan); }
    return false;
  }
  function view(v, plan) {
    const undo = plan.run();
    H.inView++; H.lastIn = H.t; H.counts[v.id] = count(v.id) + 1;
    events.noteLegacy('haunt:' + v.id, 'wrong');   // (the engine writes the row; what it was and where is added to it)
    const rec = log.night(), row = rec && rec.log.length ? rec.log[rec.log.length - 1] : null;
    if (row) Object.assign(row, { seen: true, how: 'watch', noise: v.id === 'cup' ? 0.5 : 0.15, room: gaze.roomOf(plan.at), p: { x: +plan.at.x.toFixed(2), z: +plan.at.z.toFixed(2) } });
    H.done.push({ id: v.id, at: plan.at, undo, row, found: true });
    F.fear = Math.max(F.fear, 0.5);
    return true;
  }
  // the thing's bait: the change nearest `at` made now (louder than it would be), or failing that a knock there
  function stir(at) {
    if (!H.on) return false;
    let best = null, bd = 6;
    for (const def of DEFS) { if (!eligible(def)) continue; const plan = def.find(); if (!plan) continue; const d = Math.hypot(plan.at.x - at.x, plan.at.z - at.z); if (d < bd) { bd = d; best = [def, plan]; } }
    if (best) make(best[0], best[1], 2.2);
    if (!best || best[0].id === 'light') { if (!sfx.pick('wall_knock', { gain: 0.9, at, wet: 0.3 })) sfx.knock(ctx.panFor ? ctx.panFor(_v.set(at.x, at.y || 1, at.z)) : 0, 0.3); }
    return true;
  }

  // ---- the night ----
  function reset() {
    for (const a of H.anims.splice(0)) { try { if (a.end) a.end(); } catch (e) { /* gone */ } }
    for (const d of H.done.splice(0).reverse()) { try { if (d.undo) d.undo(); } catch (e) { console.warn('haunt: could not put back', d.id, e); } }
    for (const name in H.ajar) { const d = W.doors[name]; if (d) d.max = 1; delete H.ajar[name]; }
    for (const t of toys) { t.g.visible = false; t.busy = false; }
    if (cup.g) cup.g.visible = false; for (const s of cup.shards) s.visible = false; cup.broken = false;
    H.on = false; H.counts = {}; H.inView = 0; H.heat = 0;
  }
  function start(plan, n) {
    reset(); build();
    H.plan = plan; H.n = n; H.t = 0; H.acc = 0; H.tryAt = 0; H.lastIn = -99;
    if (!plan || n < 2 || QUIET_TYPES.has(plan.type)) return;
    const R = ctx.run ? ctx.run() : null;
    H.r = rng(`haunt:${(R && R.seed) || 'run'}:${n}`); H.on = true; H.heat = 0.5; H.clock = F.clock || plan.clock0 || 0;
    setCup();
    events.NIGHT.cleanup.push(reset);
  }
  function tick(dt) {
    if (!H.on) return;
    H.t += dt;
    for (let i = H.anims.length - 1; i >= 0; i--) {
      const a = H.anims[i]; a.t += dt; const k = Math.min(1, a.t / a.dur);
      a.step(k, dt); if (k >= 1) { H.anims.splice(i, 1); if (a.end) a.end(); }
    }
    H.acc += dt; if (H.acc < 0.5) return;
    H.acc = 0;
    if (!cup.g.visible && !cup.broken && !count('cup')) setCup();   // (the table's model came late)
    // a door left ajar: let go once your hand has been on it, and opened out of the way of anybody else who comes to it
    for (const name in H.ajar) {
      const d = W.doors[name];
      if (d.target !== 1) { d.max = 1; H.ajar[name] = false; continue; }
      if ((d.max ?? 1) < 1 && bodies.some((b) => b.kind !== 'player' && (!b.active || b.active()) && Math.hypot(b.pos.x - d.mid.x, b.pos.z - d.mid.z) < 2.2)) { d.max = 1; H.ajar[name] = false; }
    }
    // what you have found
    for (const d of H.done) {
      if (d.found || dist(d.at) > 9 || !gaze.inView({ x: d.at.x, z: d.at.z, y: Math.max(0, (d.at.y || 0) - 0.6) }, 0.8) || gaze.facing(d.at) < 0.75) continue;
      d.found = true; if (d.row) { d.row.seen = true; d.row.how = 'look'; d.row.at = Math.round(log.now() * 10) / 10; }   // (seen now: the chain the thing ends starts here)
      F.fear = Math.max(F.fear, Math.min(0.6, 0.3 + 0.03 * H.n));
    }
    if (!free()) { H.clock = F.clock; return; }
    const span = Math.max(60, 352 - (H.plan.clock0 || 0)), mood = (H.plan.type === 'quiet' ? 0.5 : 1) * (0.7 + 0.9 * clamp(F.fear, 0, 1) + (hunter.cool > 0 ? 0.5 : 0));
    H.heat = Math.min(2, H.heat + Math.max(0, F.clock - H.clock) / span * changesFor(H.n) * mood); H.clock = F.clock;
    if (H.t < H.tryAt) return;
    H.tryAt = H.t + 2.5;
    if (H.heat >= 1 && tryChange()) { H.heat -= 1; return; }
    tryView();
  }
  // by name, whatever the pacing says (the tests): an unseen change, or one made in view
  const force = (id) => { const def = DEFS.find((d) => d.id === id), plan = def ? def.find() : null; return plan ? make(def, plan) : false; };
  const forceView = (id) => { const v = VIEW.find((d) => d.id === id), plan = v ? v.find() : null; return plan ? view(v, plan) : false; };

  return { H, DEFS, VIEW, start, tick, reset, stir, force, forceView, toys, cup, findSpot, offWays, clearAt, get on() { return H.on; }, get moved() { return H.done.map((d) => ({ id: d.id, at: d.at, found: d.found })); } };
}
