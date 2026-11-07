// where the player has been looking: scares are staged in the blind spot and revealed by the player's own turn, and taken away again
// when the player looks off. Nothing is ever put where it can be seen being put there.
//   behind(min, max, opts)       a floor spot behind the player, in the same room, out of view now and (strict) in view a moment ago
//   inView(p, margin)            p is on screen and nothing stands between the eye and it
//   whenLookAt(p, fn, minDot)    fn once the player looks straight at p (facing within acos(minDot)); returns a cancel function
//   whenLookAway(p, fn, hold)    fn once p has been out of view for hold seconds
//   glanceTime(p)                how long p has been in view, summed over the night (spots are keyed to a 0.5 m grid)
//   looking(p, minDot)           faced and on screen, without the line-of-sight test (things seen through a window)
// The gates the night engine's events test themselves against (each is a question about what the player just did, never a clock):
//   leftRoom(name, within?) / enteredRoom(name, within?)   seconds since the player left / came into that room (Infinity if not), or,
//                                with `within`, whether it was inside that many seconds; a change of room counts after 0.4 s in the new one
//   openedDoor(name, within)     the player opened that door inside `within` seconds (openedAt(name) the time); noteDoor(name, by) tells it
//   flipped(room, on, within)    the player flipped that room's switch (noteFlip is chained from lights.onFlip); flippedAt(room, on)
//   flashOff(sec)                the flashlight has been off that long          still(sec)   the player has not moved or turned that long
//   settled(gap)                 free, not sprinting, the last fright worn off, `gap` seconds since the last beat ended (markEnd) and three
//                                since anything sudden
//   heard(p, within, sec)        a sound was placed near p inside `sec` seconds while the player stood within `within` metres of it
//   homeLight()                  the house's light is in sight (the forest's rule): true until setHomeLight(fn) hands over the real test
//   inBunkFor()                  seconds the player has lain in the bunk without getting up (law 8's bunk fallback reads it)
import * as THREE from 'three';
import { active } from './collide.js';

export function createGaze({ camera, P, los, roomAt, colliders, F = null, W = null }) {
  const hist = [], watchers = [], glance = new Map(), _p = new THREE.Vector3(), _f = new THREE.Vector3();
  let t = 0, acc = 0;
  const key = (p) => Math.round(p.x * 2) + ',' + Math.round(p.z * 2);
  const hfov = () => 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.aspect);
  const fwd = () => { camera.getWorldDirection(_f); const l = Math.hypot(_f.x, _f.z) || 1; return { x: _f.x / l, z: _f.z / l, y: _f.y }; };
  const eyeY = () => camera.position.y;
  // something standing at p: its feet and its head both count, so a figure half off-screen still counts as seen
  function onScreen(p, margin = 0.9) {
    for (const dy of [0.1, 1.2]) {
      _p.set(p.x, (p.y || 0) + dy, p.z).project(camera);
      if (_p.z < 1 && Math.abs(_p.x) < margin && Math.abs(_p.y) < margin) return true;
    }
    return false;
  }
  const clear = (p) => los(camera.position.x, camera.position.z, p.x, p.z, P.pos.y, p.y || 0);
  const inView = (p, margin = 0.9) => onScreen(p, margin) && clear(p);
  // how squarely the player faces p (1 straight at it)
  const facing = (p) => { const f = fwd(), dx = p.x - camera.position.x, dz = p.z - camera.position.z, d = Math.hypot(dx, dz) || 1; return (dx * f.x + dz * f.z) / d; };
  // seen within the last sec seconds: some recent facing put p inside the field of view (sideways, and up or down: what lies right under
  // the bunk you are on was never in view), with a clear line
  const vfov = () => THREE.MathUtils.degToRad(camera.fov);
  function sawRecently(p, sec = 3) {
    const half = hfov() / 2 * 0.85, halfV = vfov() / 2 * 0.95;
    for (let i = hist.length - 1; i >= 0; i--) {
      const h = hist[i]; if (t - h.t > sec) break;
      const dx = p.x - h.x, dz = p.z - h.z, d = Math.hypot(dx, dz) || 1, cos = (dx * h.fx + dz * h.fz) / d;
      if (cos <= Math.cos(half)) continue;
      // the pitch to the middle of a standing thing at p against the pitch the camera had
      const dy = (p.y || 0) + 0.8 - h.y, pitchTo = Math.atan2(dy, d), had = Math.atan2(h.fy, Math.hypot(h.fx0, h.fz0) || 1e-6);
      if (Math.abs(pitchTo - had) > halfV) continue;
      if (los(h.x, h.z, p.x, p.z, P.pos.y, p.y || 0)) return true;
    }
    return false;
  }
  // a box counts as the boundaries count it (collide.active: switched on, and its night or `when` condition holding; the vigil's chair
  // stands in the hall mouth only while the vigil runs)
  const free = (x, z, r = 0.4) => !colliders.some((c) => active(c) && !c.wall && x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r)
    && !colliders.some((c) => active(c) && c.wall && x > c.minX - 0.25 && x < c.maxX + 0.25 && z > c.minZ - 0.25 && z < c.maxZ + 0.25);
  // a spot behind the player: candidates fan out round the direction opposite the facing, nearest to straight behind first
  function behind(min = 1.6, max = 3.6, { strict = true, sameRoom = true, y = P.pos.y } = {}) {
    const f = fwd(), back = Math.atan2(-f.x, -f.z), room = roomAt(P.pos.x, P.pos.z, P.pos.y), out = [];
    for (const da of [0, 0.25, -0.25, 0.5, -0.5, 0.8, -0.8, 1.1, -1.1]) {
      for (let k = 0; k <= 4; k++) {
        const d = min + (max - min) * (k / 4), a = back + da, p = { x: P.pos.x + Math.sin(a) * d, z: P.pos.z + Math.cos(a) * d, y };
        if (sameRoom && roomAt(p.x, p.z, y) !== room) continue;
        if (!free(p.x, p.z) || !los(P.pos.x, P.pos.z, p.x, p.z, y, y)) continue;
        if (onScreen(p, 1.15)) continue;
        if (strict && !sawRecently(p)) continue;
        out.push({ p, s: Math.abs(da) * 2 + Math.abs(d - (min + max) / 2) * 0.3 });
      }
    }
    out.sort((a, b) => a.s - b.s);
    return out.length ? out[0].p : null;
  }
  function whenLookAt(p, fn, minDot = 0.9) { const w = { p, fn, kind: 'at', minDot }; watchers.push(w); return () => { w.dead = true; }; }
  function whenLookAway(p, fn, hold = 0.25) { const w = { p, fn, kind: 'away', hold, off: 0 }; watchers.push(w); return () => { w.dead = true; }; }
  const glanceTime = (p) => glance.get(key(p)) || 0;
  // looking at p through glass: on screen and faced, with no line-of-sight test (the wall the window is in would block it)
  const looking = (p, minDot = 0.8, margin = 0.95) => onScreen(p, margin) && facing(p) > minDot;

  // ---- the gates ----
  const rooms = { cur: null, pend: null, pendT: 0, left: {}, entered: {} };
  const opened = {}, doorWas = {}, flips = [], sounds = [];
  let flashOffAt = 0, stillAt = 0, lastBusy = -99, lastEnd = -99, bunkT = 0, homeLightFn = () => true;
  const still0 = { x: 0, z: 0, yaw: 0, pitch: 0 };
  const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
  const freeNow = () => !F || (!F.script && !F.cutscene && !F.dead && P.mode !== 'cine');
  const inBunk = () => P.mode === 'bunk' || (P.mode === 'hide' && !P.pod);
  function gatesTick(dt) {
    // the room, debounced: a doorway crossed and crossed back does not count
    const r = roomAt(P.pos.x, P.pos.z, P.pos.y);
    if (r !== rooms.cur) {
      if (rooms.pend !== r) { rooms.pend = r; rooms.pendT = 0; }
      rooms.pendT += dt;
      if (rooms.pendT >= 0.4) { const prev = rooms.cur; rooms.cur = r; rooms.pend = null; if (prev) rooms.left[prev] = t; rooms.entered[r] = t; }
    } else rooms.pend = null;
    // the flashlight
    if (F) { if (F.flashOn) flashOffAt = -1; else if (flashOffAt < 0) flashOffAt = t; }
    // moving or turning
    const moved = Math.hypot(P.pos.x - still0.x, P.pos.z - still0.z) > 0.05 || Math.abs(angDiff(still0.yaw, P.yaw)) > 0.08 || Math.abs((P.pitch || 0) - still0.pitch) > 0.08;
    if (moved) { stillAt = t; still0.x = P.pos.x; still0.z = P.pos.z; still0.yaw = P.yaw; still0.pitch = P.pitch || 0; }
    // lying in the bunk
    bunkT = inBunk() ? bunkT + dt : 0;
    // anything sudden
    if (P.sprinting || (F && F.fear > 0.6)) lastBusy = t;
    // doors the player opened: a door whose target just went to open with the player at its handle and no scene running counts as theirs
    // (noteDoor(name, by) is the explicit hook for a door opened by a hand the game knows about)
    if (W && W.doors) for (const name in W.doors) {
      const d = W.doors[name], was = doorWas[name];
      if (was !== undefined && was === 0 && d.target === 1 && freeNow() && Math.hypot(P.pos.x - d.mid.x, P.pos.z - d.mid.z) < 1.8) opened[name] = t;
      doorWas[name] = d.target;
    }
    while (flips.length && t - flips[0].t > 20) flips.shift();
    while (sounds.length && t - sounds[0].t > 12) sounds.shift();
  }
  const sinceOr = (at, within) => (at === undefined ? (within === undefined ? Infinity : false) : within === undefined ? t - at : t - at <= within);
  function leftRoom(name, within) {
    const at = rooms.left[name];
    if (at === undefined || rooms.cur === name || (rooms.entered[name] !== undefined && rooms.entered[name] > at)) return within === undefined ? Infinity : false;
    return sinceOr(at, within);
  }
  function enteredRoom(name, within) {
    const at = rooms.entered[name];
    if (at === undefined || rooms.cur !== name) return within === undefined ? Infinity : false;
    return sinceOr(at, within);
  }
  const noteDoor = (name, by = 'player') => { if (by === 'player') opened[name] = t; };
  const openedAt = (name) => (opened[name] === undefined ? -1 : opened[name]);
  const openedDoor = (name, within = 2) => opened[name] !== undefined && t - opened[name] <= within;
  const noteFlip = (room, on, by = 'player') => { if (by === 'player') flips.push({ room, on: !!on, t }); };
  const flippedAt = (room, on) => { for (let i = flips.length - 1; i >= 0; i--) { const f = flips[i]; if ((room === undefined || f.room === room) && (on === undefined || f.on === !!on)) return f.t; } return -1; };
  const flipped = (room, on, within = 2) => { const at = flippedAt(room, on); return at >= 0 && t - at <= within; };
  const flashOff = (sec) => flashOffAt >= 0 && t - flashOffAt >= sec;
  const still = (sec) => t - stillAt >= sec;
  const settled = (gap) => freeNow() && !P.sprinting && (!F || F.fear < 0.45) && t - lastEnd >= gap && t - lastBusy >= 3;
  const markEnd = () => { lastEnd = t; };
  const markBusy = () => { lastBusy = t; };
  const notePlaced = (at, key = '') => { if (!at) return; sounds.push({ x: at.x, y: at.y || 0, z: at.z, t, px: P.pos.x, pz: P.pos.z, key }); };
  const heard = (p, within = 6, sec = 4) => sounds.some((s) => t - s.t <= sec && Math.hypot(s.x - p.x, s.z - p.z) < 1.5 && Math.hypot(s.px - s.x, s.pz - s.z) <= within);
  const homeLight = () => { try { return !!homeLightFn(); } catch (e) { return true; } };
  const setHomeLight = (fn) => { homeLightFn = typeof fn === 'function' ? fn : () => true; };
  const inBunkFor = () => bunkT;
  const room = () => rooms.cur;

  function update(dt) {
    t += dt; acc += dt;
    if (acc > 0.08) { acc = 0; const f = fwd(); hist.push({ t, x: camera.position.x, y: camera.position.y, z: camera.position.z, fx: f.x, fz: f.z, fy: f.y, fx0: _f.x, fz0: _f.z }); while (hist.length && t - hist[0].t > 4.5) hist.shift(); }
    gatesTick(dt);
    for (let i = watchers.length - 1; i >= 0; i--) {
      const w = watchers[i];
      if (w.dead) { watchers.splice(i, 1); continue; }
      const seen = inView(w.p, 0.8);
      if (seen) glance.set(key(w.p), glanceTime(w.p) + dt);
      if (w.kind === 'at' && seen && facing(w.p) > w.minDot) { watchers.splice(i, 1); w.fn(); }
      else if (w.kind === 'away') { w.off = seen ? 0 : w.off + dt; if (w.off >= w.hold) { watchers.splice(i, 1); w.fn(); } }
    }
  }
  const clearAll = () => { for (const w of watchers) w.dead = true; watchers.length = 0; };
  return {
    update, behind, inView, onScreen, facing, looking, sawRecently, whenLookAt, whenLookAway, glanceTime, clearAll, free, eyeY,
    leftRoom, enteredRoom, openedDoor, openedAt, noteDoor, flipped, flippedAt, noteFlip, flashOff, still, settled, markEnd, markBusy,
    heard, notePlaced, homeLight, setHomeLight, inBunkFor, room, get now() { return t; },
  };
}
