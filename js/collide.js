// Bodies, capsules and the sweeps: nothing clips unless on purpose.
// One boundary module for the player, the camera, the thing's body, Mom and Dad, the door leaves and the props. The world stays the
// 2-D list of axis-aligned boxes in W.colliders (each with a floor range minY..maxY, so a body counts a box only on its own floor), and
// on top of it every mover is a vertical capsule { pos, r, h } on the feet:
//   bodies             the registered capsules (the player, the thing, Mom, Dad); addBody(b) / removeBody(id)
//   resolveCircle(b)   push b out of everything: furniture boxes on its floor, then the door leaves, then the other bodies, then the
//                      walls last (a push from a body can never end with the eye in a jamb)
//   sweepCircle(b, dx, dz)   move b by (dx, dz) and stop at the first contact; { t, hit }
//   sweepLeaf(d, da)   the leaf's arc from d.a toward d.a + da against every body: the angle it can reach and the body it meets
//   headClear(x, z, y0, r)   the lowest overhang over a circle at (x, z): door heads, fixtures, joists, the arch, the ceiling
//   eyeClear(camera)   five short rays from the eye (the centre and the four near-plane corners) against the walls, the leaves, the
//                      fixtures and the other bodies; pulls the camera back along its own forward until none enters anything
//   fits(pose, x, z, yaw)    a pose from POSES (the thing's extents; the creature package fills the table) stands clear at (x, z)
// Colliders may carry { night: true } (counted only at night), { when: fn } (counted while fn() is true), { id } (removeSolid), { maxY }
// and { armWhenClear: true } (a box that would snap on round a body waits until the body has left it).
import * as THREE from 'three';

const S = { colliders: [], doors: {}, isNight: () => false, groundAt: () => 0 };
export const bodies = [];
export const NEAR = 0.13;        // how close the eye may come to anything (the near plane's corner reach at 70 degrees, 16:9)
export const PLAYER_R = 0.28, PLAYER_H = 1.6;
const LEAF_T = 0.03;             // half the leaf's thickness plus a hair: a body touching a shut door's strip (0.32 from the wall line) does not count as hit
// the thing's extents by pose: the radius round the root and the height of its highest point, measured from its skinned vertices
// (tests/sweep_thing.js). The low and lying poses reach well ahead of or behind the root, so they are given as circles along it
// ([ahead, radius], ahead in the root's own frame, turned by yaw) instead of one circle round the root
export const POSES = {
  idle: { r: 0.76, h: 2.66 }, walk: { r: 0.86, h: 2.66 }, run: { r: 1.06, h: 2.63 },   // standing, the long arms hang 0.75 out
  crumple: { r: 0.72, h: 1.27, circles: [[0.3, 0.72]] },                            // knees under it, hands on the floor beside them: 0.92 ahead, 0.31 behind, 0.68 to a side
  crawl: { r: 0.62, h: 1.0, circles: [[1.05, 0.62], [0, 0.5], [-0.75, 0.45]] },     // hands 1.66 ahead, feet 1.12 behind, elbows 0.7 out above the hands, the crown under 0.95
  unfold: { r: 0.62, h: 1.72, circles: [[0.3, 0.72], [1.05, 0.62], [-0.75, 0.45]] },
  peek: { r: 0.42, h: 1.92 },                                                        // at 0.72 scale, behind a jamb, leaning out
  lie: { r: 0.5, h: 0.75, circles: [[-0.85, 0.45], [0.15, 0.5]] },                  // on its back, knees up: the crown 1.4 behind the root
  sit: { r: 0.65, h: 1.95 },
  crouch: { r: 0.75, h: 1.95 },                                                      // the duck held all the way (crown 1.95)
};
// what hangs over the floor: boxes { minX, maxX, minZ, maxZ, y0, y1, id } (door heads, joists, the arch, the ceilings) and spheres
// { x, y, z, r, id } (the light fixtures' domes)
export const overheads = [], spheres = [];

export function init({ colliders, doors, isNight, groundAt }) {
  if (colliders) S.colliders = colliders;
  if (doors) S.doors = doors;
  if (isNight) S.isNight = isNight;
  if (groundAt) S.groundAt = groundAt;
}
export function install(game) {}   // reached from js/hooks.js's convention; the module is set up by init() from main.js
export function addBody(b) {
  const body = { kind: 'npc', r: 0.3, h: 1.7, active: () => true, ...b };
  const i = bodies.findIndex((o) => o.id === body.id); if (i >= 0) bodies.splice(i, 1);
  bodies.push(body); return body;
}
export const body = (id) => bodies.find((b) => b.id === id) || null;
export function removeBody(id) { const i = bodies.findIndex((b) => b.id === id); if (i >= 0) bodies.splice(i, 1); }
const isOn = (b) => !b.active || b.active();

// a collider counts now: on, and if it is a night fence it is night, and if it has a condition the condition holds
export const active = (c) => c.on !== false && (!c.night || S.isNight()) && (!c.when || c.when());
// a collider counts for a body standing at y0 that is h tall: its floor range overlaps the body's
export const onFloor = (c, y0, h = PLAYER_H) => (c.maxY ?? 3) >= y0 && (c.minY ?? -0.3) <= y0 + h;
const sameFloor = (a, b) => Math.abs(a - b) < 1.2;

// ---------- the door leaves as capsules ----------
// the leaf of door d at opening a (0 shut .. 1 open): a segment from ax,az to bx,az on the floor, t thick each side, y0..y1 tall
export function leafAt(d, a = d.a) {
  if (!d.g) return null;
  const y0 = d.y0 || 0;
  if (d.slide) {   // a sliding leaf travels along the wall it hangs on; its centre line hangs d.slide.off out from the hinge line
    const s = d.slide, cx = d.hx + s.open[0] * s.travel * a, cz = d.hz + s.open[1] * s.travel * a, ux = s.open[0], uz = s.open[1];
    return { ax: cx + s.off * uz - ux * s.half, az: cz - s.off * ux - uz * s.half, bx: cx + s.off * uz + ux * s.half, bz: cz - s.off * ux + uz * s.half, t: s.t ?? 0.06, y0, y1: y0 + (s.height ?? 2.1), door: d };
  }
  const ang = d.rotC + angDiff(d.rotC, d.rotO) * a, w = d.w || 0.81;
  return { ax: d.hx, az: d.hz, bx: d.hx + Math.cos(ang) * w, bz: d.hz - Math.sin(ang) * w, t: LEAF_T, y0, y1: y0 + 2.03, door: d };
}
export const leafOf = (d) => leafAt(d, d.a);
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
// the nearest point of segment s to (x, z) and the distance to it
function segNear(s, x, z) {
  const dx = s.bx - s.ax, dz = s.bz - s.az, l2 = dx * dx + dz * dz;
  const t = l2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / l2));
  const nx = s.ax + dx * t, nz = s.az + dz * t;
  return { nx, nz, d: Math.hypot(x - nx, z - nz), t };
}
const leafOnFloor = (s, y0, h) => s.y1 >= y0 && s.y0 <= y0 + h;

// ---------- the pushes ----------
// a circle of radius r at p pushed out of box c; true when it was inside
function pushBox(p, r, c) {
  const cx = Math.max(c.minX, Math.min(c.maxX, p.x)), cz = Math.max(c.minZ, Math.min(c.maxZ, p.z));
  const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return false;
  if (d2 > 1e-9) { const d = Math.sqrt(d2); p.x = cx + (dx / d) * r; p.z = cz + (dz / d) * r; }
  else {   // the centre is inside the box: out through the nearest face
    const l = p.x - c.minX, rr = c.maxX - p.x, b = p.z - c.minZ, t = c.maxZ - p.z, m = Math.min(l, rr, b, t);
    if (m === l) p.x = c.minX - r; else if (m === rr) p.x = c.maxX + r; else if (m === b) p.z = c.minZ - r; else p.z = c.maxZ + r;
  }
  return true;
}
function pushSeg(p, r, s) {
  const n = segNear(s, p.x, p.z);
  if (n.d >= r) return false;
  if (n.d > 1e-6) { p.x = n.nx + (p.x - n.nx) / n.d * r; p.z = n.nz + (p.z - n.nz) / n.d * r; }
  else { const dx = s.bx - s.ax, dz = s.bz - s.az, l = Math.hypot(dx, dz) || 1; p.x = n.nx + (-dz / l) * r; p.z = n.nz + (dx / l) * r; }   // on the line itself: off to one side
  return true;
}
function pushCircle(p, r, o) {
  const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz);
  if (d >= r) return false;
  if (d > 1e-6) { p.x = o.x + dx / d * r; p.z = o.z + dz / d * r; } else p.x = o.x + r;
  return true;
}
// a box that was meant to come on round a body waits for the body to leave (a door's strip, a chair moved onto you, a box set down)
export function armPending() {
  for (const c of S.colliders) {
    if (!c.armWhenClear) continue;
    if (!bodies.some((b) => isOn(b) && onFloor(c, b.pos.y, b.h) && boxPen(c, b.pos.x, b.pos.z, b.r) > 0)) { c.on = true; c.armWhenClear = false; }
  }
}
// turn c on now, or once nobody stands in it
export function armOrOn(c) { c.on = false; c.armWhenClear = true; armPending(); }
const boxPen = (c, x, z, r) => r - Math.hypot(Math.max(c.minX - x, 0, x - c.maxX), Math.max(c.minZ - z, 0, z - c.maxZ));

// b out of everything on its floor: furniture, then the leaves, then the other bodies, then the walls (and the door strips) last
export function resolveCircle(b) {
  const p = b.pos, r = b.r, y0 = p.y, h = b.h;
  let hit = null;
  for (const c of S.colliders) { if (c.wall || c.door || !active(c) || !onFloor(c, y0, h)) continue; if (pushBox(p, r, c) && !hit) hit = c; }
  for (const k in S.doors) { const s = leafOf(S.doors[k]); if (!s || !leafOnFloor(s, y0, h)) continue; if (pushSeg(p, r + s.t, s) && !hit) hit = s; }
  for (const o of bodies) { if (o === b || !isOn(o) || !sameFloor(o.pos.y, y0)) continue; if (pushCircle(p, r + o.r, o.pos) && !hit) hit = o; }
  for (const c of S.colliders) { if (!(c.wall || c.door) || !active(c) || !onFloor(c, y0, h)) continue; if (pushBox(p, r, c) && !hit) hit = c; }
  armPending();
  return hit;
}
// how deep a circle (x, z, r) standing at y0, h tall, sits in anything (0 when clear), and what; skip: a body not to count (itself)
export function probe(x, z, r, y0 = 0, h = PLAYER_H, skip = null) {
  let worst = 0, what = null;
  const note = (pen, o) => { if (pen > worst) { worst = pen; what = o; } };
  for (const c of S.colliders) { if (!active(c) || !onFloor(c, y0, h)) continue; const pen = boxPen(c, x, z, r); if (pen > 0) note(pen, c); }
  for (const k in S.doors) { const s = leafOf(S.doors[k]); if (!s || !leafOnFloor(s, y0, h)) continue; const pen = r + s.t - segNear(s, x, z).d; if (pen > 0) note(pen, s); }
  for (const o of bodies) { if (o === skip || !isOn(o) || !sameFloor(o.pos.y, y0)) continue; const pen = r + o.r - Math.hypot(x - o.pos.x, z - o.pos.z); if (pen > 0) note(pen, o); }
  return { pen: worst, hit: what };
}
export const penetration = (b) => probe(b.pos.x, b.pos.z, b.r, b.pos.y, b.h, b);
// move b by (dx, dz) and stop where it first touches something: t is how much of the step it took
export function sweepCircle(b, dx, dz, { step = 0.04 } = {}) {
  const L = Math.hypot(dx, dz); if (L < 1e-6) return { t: 1, hit: null };
  const n = Math.max(1, Math.ceil(L / step)), x0 = b.pos.x, z0 = b.pos.z;
  for (let i = 1; i <= n; i++) {
    const t = i / n, pr = probe(x0 + dx * t, z0 + dz * t, b.r, b.pos.y, b.h, b);
    if (pr.pen > 0.002) { const tb = (i - 1) / n; b.pos.x = x0 + dx * tb; b.pos.z = z0 + dz * tb; return { t: tb, hit: pr.hit }; }
  }
  b.pos.x = x0 + dx; b.pos.z = z0 + dz;
  return { t: 1, hit: null };
}
// the body a leaf at opening a would stand in, or null
export function leafHits(d, a) {
  const s = leafAt(d, a); if (!s) return null;
  for (const o of bodies) { if (!isOn(o) || !leafOnFloor(s, o.pos.y, o.h)) continue; if (segNear(s, o.pos.x, o.pos.z).d < o.r + s.t - 0.004) return o; }
  return null;
}
export function sweepLeaf(d, da) {
  if (!d.g || !da) return { a: d.a, hit: null };
  const a0 = d.a, n = Math.max(1, Math.ceil(Math.abs(da) / 0.01));   // under a degree a step on a quarter turn
  let reach = a0, hit = null;
  for (let i = 1; i <= n; i++) {
    const a = a0 + da * i / n, o = leafHits(d, a);
    if (o) { hit = o; break; }
    reach = a;
  }
  return { a: reach, hit };
}

// ---------- overhead ----------
// the lowest overhang over a circle (x, z, r) above y0: Infinity under the open sky
export function headClear(x, z, y0 = 0, r = 0.3) {
  let low = Infinity;
  for (const o of overheads) {
    if (o.y0 <= y0 || o.y0 >= low) continue;
    if (x + r < o.minX || x - r > o.maxX || z + r < o.minZ || z - r > o.maxZ) continue;
    if (o.when && !o.when()) continue;
    low = o.y0;
  }
  for (const s of spheres) {
    const bottom = s.y - s.r; if (bottom <= y0 || bottom >= low) continue;
    if (Math.hypot(x - s.x, z - s.z) > r + s.r) continue;
    low = bottom;
  }
  return low;
}
headClear.add = (o) => { overheads.push(o); return o; };
headClear.sphere = (s) => { spheres.push(s); return s; };
headClear.remove = (id) => { for (const list of [overheads, spheres]) for (let i = list.length - 1; i >= 0; i--) if (list[i].id === id) list.splice(i, 1); };

// ---------- the eye ----------
const _f = new THREE.Vector3(), _c = new THREE.Vector3(), _e = new THREE.Vector3(), _q = new THREE.Vector3();
// the five eye points: the eye itself and the four near-plane corners pushed out to `near`
function eyePoints(camera, near, out) {
  camera.getWorldDirection(_f);
  const hh = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2), hw = hh * camera.aspect;
  out[0].copy(camera.position).addScaledVector(_f, near);
  let i = 1;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    _c.set(sx * hw, sy * hh, -1).normalize().applyQuaternion(camera.quaternion);   // the corner's direction in the world
    out[i++].copy(camera.position).addScaledVector(_c, near);
  }
  return out;
}
const EP = [0, 1, 2, 3, 4].map(() => new THREE.Vector3());
// the distance from a point to a box with a floor range
function boxDist3(c, p) {
  const dx = Math.max(c.minX - p.x, 0, p.x - c.maxX), dz = Math.max(c.minZ - p.z, 0, p.z - c.maxZ), dy = Math.max((c.minY ?? -0.3) - p.y, 0, p.y - (c.maxY ?? 3));
  return Math.hypot(dx, dy, dz);
}
const capDist3 = (s, p) => { const n = segNear(s, p.x, p.z), dy = Math.max(s.y0 - p.y, 0, p.y - s.y1); return Math.hypot(n.d, dy) - s.t; };
const bodyDist3 = (o, p) => { const d = Math.hypot(p.x - o.pos.x, p.z - o.pos.z), dy = Math.max(o.pos.y - p.y, 0, p.y - (o.pos.y + o.h)); return Math.hypot(d, dy) - o.r; };
// the deepest intrusion of the eye points into anything that is not the player's own (0 when clear) and what it is
export function eyeProbe(camera, { near = NEAR, mode = 'walk', self = null } = {}) {
  const pts = eyePoints(camera, near, EP);
  let worst = 0, what = null;
  const check = (d, o) => { if (d < 0 && -d > worst) { worst = -d; what = o; } };
  const eye = camera.position, furniture = mode === 'walk';
  for (const c of S.colliders) {
    if (!active(c)) continue;
    if (!(c.wall || c.door)) {   // furniture only while walking, and never a box the eye stands inside of (the bunk, the chair, the tub, a closet)
      if (!furniture || (c.maxX - c.minX) > 40) continue;
      if (eye.x > c.minX - 0.05 && eye.x < c.maxX + 0.05 && eye.z > c.minZ - 0.05 && eye.z < c.maxZ + 0.05) continue;
    }
    if (boxDist3(c, eye) > near + 0.01) continue;
    for (const p of pts) check(boxDist3(c, p), c);
  }
  for (const k in S.doors) { const s = leafOf(S.doors[k]); if (!s) continue; if (capDist3(s, eye) > near + 0.01) continue; for (const p of pts) check(capDist3(s, p), s); }
  for (const s of spheres) { const d = Math.hypot(eye.x - s.x, eye.y - s.y, eye.z - s.z) - s.r; if (d > near + 0.01) continue; for (const p of pts) check(Math.hypot(p.x - s.x, p.y - s.y, p.z - s.z) - s.r, s); }
  if (mode !== 'cine') for (const o of bodies) { if (o === self || o.kind === 'player' || !isOn(o)) continue; if (bodyDist3(o, eye) > near + 0.01) continue; for (const p of pts) check(bodyDist3(o, p), o); }
  return { pen: worst, hit: what };
}
// pull the camera back along its own forward until the five eye points are clear; returns how far it moved
export function eyeClear(camera, opts = {}) {
  const maxBack = opts.maxBack ?? 0.45;
  let back = 0;
  for (let i = 0; i < 10; i++) {
    const { pen } = eyeProbe(camera, opts); if (pen <= 1e-4) break;
    const step = Math.min(pen + 0.004, maxBack - back); if (step <= 0) break;
    camera.getWorldDirection(_f); camera.position.addScaledVector(_f, -step); back += step;
  }
  return back;
}

// ---------- scripted placements ----------
// does `pose` (a key of POSES) stand clear at (x, z) on its floor, with headroom for its crown? yaw is kept for the fuller shapes to come
export function fits(pose, x, z, yaw = 0, { y, skip = null } = {}) {
  const ext = POSES[pose] || POSES.idle, y0 = y ?? S.groundAt(x, z, 0);
  // (the thing's own bodies never count against it)
  const self = (b) => b === skip || b.kind === 'thing';
  for (const [ahead, r] of ext.circles || [[0, ext.r]]) {
    const cx = x + Math.sin(yaw) * ahead, cz = z + Math.cos(yaw) * ahead;
    for (const c of S.colliders) { if (!active(c) || !onFloor(c, y0, ext.h)) continue; if (boxPen(c, cx, cz, r) > 0) return false; }
    for (const k in S.doors) { const s = leafOf(S.doors[k]); if (!s || !leafOnFloor(s, y0, ext.h)) continue; if (r + s.t - segNear(s, cx, cz).d > 0) return false; }
    for (const o of bodies) { if (self(o) || !isOn(o) || !sameFloor(o.pos.y, y0)) continue; if (r + o.r - Math.hypot(cx - o.pos.x, cz - o.pos.z) > 0) return false; }
    if (headClear(cx, cz, y0, Math.min(r, 0.3)) < y0 + ext.h) return false;
  }
  return true;
}

// a name for a shape in a report
export function describe(o) {
  if (!o) return 'nothing';
  if (o.door && o.ax !== undefined) return `leaf of the ${o.door.name} door`;
  if (o.pos && o.r !== undefined) return `the ${o.id || o.kind}`;
  if (o.wall) return `wall ${o.minX.toFixed(2)}..${o.maxX.toFixed(2)} x ${o.minZ.toFixed(2)}..${o.maxZ.toFixed(2)}`;
  if (o.door) return `the ${o.door} door's strip`;
  return `${o.id || o.prop || (o.dressing ? 'dressing' : 'furniture')} ${o.minX.toFixed(2)}..${o.maxX.toFixed(2)} x ${o.minZ.toFixed(2)}..${o.maxZ.toFixed(2)}`;
}
export { angDiff, segNear };
