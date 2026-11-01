// where the player has been looking: scares are staged in the blind spot and revealed by the player's own turn, and taken away again
// when the player looks off. Nothing is ever put where it can be seen being put there.
//   behind(min, max, opts)       a floor spot behind the player, in the same room, out of view now and (strict) in view a moment ago
//   inView(p, margin)            p is on screen and nothing stands between the eye and it
//   whenLookAt(p, fn, minDot)    fn once the player looks straight at p (facing within acos(minDot)); returns a cancel function
//   whenLookAway(p, fn, hold)    fn once p has been out of view for hold seconds
//   glanceTime(p)                how long p has been in view, summed over the night (spots are keyed to a 0.5 m grid)
import * as THREE from 'three';

export function createGaze({ camera, P, los, roomAt, colliders }) {
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
  // seen within the last sec seconds: some recent facing put p inside the horizontal field of view, with a clear line
  function sawRecently(p, sec = 3) {
    const half = hfov() / 2 * 0.85;
    for (let i = hist.length - 1; i >= 0; i--) {
      const h = hist[i]; if (t - h.t > sec) break;
      const dx = p.x - h.x, dz = p.z - h.z, d = Math.hypot(dx, dz) || 1, cos = (dx * h.fx + dz * h.fz) / d;
      if (cos > Math.cos(half) && los(h.x, h.z, p.x, p.z, P.pos.y, p.y || 0)) return true;
    }
    return false;
  }
  const free = (x, z, r = 0.4) => !colliders.some((c) => c.on !== false && !c.wall && x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r)
    && !colliders.some((c) => c.on !== false && c.wall && x > c.minX - 0.25 && x < c.maxX + 0.25 && z > c.minZ - 0.25 && z < c.maxZ + 0.25);
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
  function update(dt) {
    t += dt; acc += dt;
    if (acc > 0.08) { acc = 0; const f = fwd(); hist.push({ t, x: camera.position.x, z: camera.position.z, fx: f.x, fz: f.z }); while (hist.length && t - hist[0].t > 4.5) hist.shift(); }
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
  return { update, behind, inView, onScreen, facing, sawRecently, whenLookAt, whenLookAway, glanceTime, clearAll, free, eyeY };
}
