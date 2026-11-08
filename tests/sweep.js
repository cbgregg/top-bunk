// Sweep test: nothing clips unless on purpose. The game is loaded headless (window.__norender, the loop frozen) and driven a frame at a time.
//   node tests/sweep.js [--port N] [--only 0,1,2,4,6,8,9] [--shots dir] [--json out.json]
// The steps:
//   0  the contract: W.plugin's context and a plugin's solid live at once (the barn block removed), every door's max clamp (the front
//      door's chain at 0.04), a strip that never snaps on round the player, and the kid door opened onto a player in its arc
//   1  reachability: the player's circle flood-fills a 0.1 m grid with every door open and with every door shut; every room and place
//      is reachable in the open case and no room has a pocket (free cells == reached cells)
//   2  the eye vs the world: at every reachable cell and y 1.285, 1.32, 1.355 the nearest opaque triangle is 0.13 m or more away
//   3  the camera tweens at 60 Hz: the climb up and down, the covers, the chair, every hiding place in and out, the lean over the rail,
//      the bedtime pose, the bunk seat and the car's two seats; every frame's eye is 0.09 m or more from the nearest triangle
//   4  driven routes: the player walks every nav edge both ways (its door opened), the drive and the ramp, the front door; each frame
//      the body is in nothing and the eye is clear; and each hinged door is shut on a player standing in its arc (the leaf stops against
//      them and finishes once they move; the strip never snaps on round them)
//   6  door sweeps: every hinged door swung shut-to-open and open-to-shut with the player on a 0.1 m grid of spots inside the arc, the thing
//      at its inside node and Dad at the knob; the leaf never stands in a body, and stops when one is in its way
//   8  tests/placement.js with the tests/sunk/*.json allowances
//   9  the player vs the thing: driven into it at walk and sprint speed in the hall and through the open kid door, and standing while it
//      comes; the body stops 0.63 m from its root and the eye never enters its capsule
// (5, the thing on its graph, lives in tests/sweep_thing.js; 7, the parents' walks, in tests/parents.js.)
// Each finding is printed as step, scene, frame, part, object, world point; exit 1 when there are any. --shots renders each failing frame.
const http = require('http'), fs = require('fs'), path = require('path');
const { Readable } = require('stream');
const { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const serve = require(path.join(ROOT, 'desktop', 'static'));
const ARGV = process.argv.slice(2);
const opt = (k, d) => { const i = ARGV.indexOf(k); return i >= 0 && ARGV[i + 1] ? ARGV[i + 1] : d; };
const PORT = +opt('--port', 10010), JSON_OUT = opt('--json', ''), SHOTS = opt('--shots', '');
const ONLY = opt('--only', '') ? new Set(opt('--only', '').split(',').map(Number)) : null;
const want = (n) => !ONLY || ONLY.has(n);
// clips that are known and not this test's to fix: printed with their owner, not counted. Each is a step, a scene prefix and the reason
const KNOWN = [
  [3, /^(into|out of) closet_/, 'the hiding places are entered and left straight through their closed closet doors (nights.js enterPod/exitHide; the louvre overlay comes up only once inside)'],
  [3, /^car front$/, "the front seat's eye sits 5 cm from the headrest (cars.js; outside the 4 cm near plane, inside this test's 9 cm)"],
];
const known = (f) => KNOWN.find(([s, re]) => f.step === s && re.test(f.scene));

// ---------- the library, in the page ----------
function sweepLib() {
  const g = window.__game;
  return Promise.all([import('three'), import('/js/nav.js'), import('/js/world.js')]).then(([THREE, nav, Wm]) => {
    const V3 = THREE.Vector3, W = g.W, C = g.collide, P = g.P, E = g.E, camera = g.camera, PB = g.PB;
    const EYE = g.EYE, R = g.R, DT = 1 / 60;
    const findings = [];
    const find = (step, scene, frame, part, object, p) => findings.push({ step, scene, frame, part, object, point: p ? [+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)] : null });
    const vis = (o) => { for (let n = o; n; n = n.parent) if (!n.visible) return false; return true; };
    const under = (o, roots) => { for (let n = o; n; n = n.parent) if (roots.includes(n)) return true; return false; };
    const matName = new Map(); for (const k in W.M) if (W.M[k] && W.M[k].uuid) matName.set(W.M[k].uuid, k);
    const nameOf = (o) => { for (let n = o, i = 0; n && i < 6; n = n.parent, i++) { const t = n.name || (n.userData && (n.userData.prop || n.userData.tag)); if (t && !/^(Scene|Group|Object3D)$/.test(t)) return t; } const m = [].concat(o.material)[0]; return 'mat:' + (matName.get(m.uuid) || m.name || m.type); };
    const opaque = (o) => [].concat(o.material).every((m) => m && !m.transparent && m.depthWrite !== false && m.blending !== THREE.AdditiveBlending && m.opacity !== 0);
    // the opaque triangles of a region, binned in 0.5 m cells, from every visible unskinned mesh under `roots` (the scene by default)
    function triBins({ x0, x1, z0, z1, y0 = -3, y1 = 4, roots = [g.scene], skip = [E.root, g.mom.group, g.dad.group] }) {
      const BIN = 0.5, bins = new Map(), tris = [], a = new V3(), b = new V3(), c = new V3();
      g.scene.updateMatrixWorld(true);
      const take = (o) => {
        if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || o.isSprite || !o.geometry || !o.geometry.attributes.position || !vis(o) || under(o, skip) || !opaque(o)) return;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        const wb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
        if (wb.max.x < x0 || wb.min.x > x1 || wb.max.z < z0 || wb.min.z > z1 || wb.max.y < y0 || wb.min.y > y1) return;
        const Pp = o.geometry.attributes.position, I = o.geometry.index, n = I ? I.count : Pp.count, nm = nameOf(o);
        for (let t = 0; t < n; t += 3) {
          const i0 = I ? I.getX(t) : t, i1 = I ? I.getX(t + 1) : t + 1, i2 = I ? I.getX(t + 2) : t + 2;
          a.fromBufferAttribute(Pp, i0).applyMatrix4(o.matrixWorld); b.fromBufferAttribute(Pp, i1).applyMatrix4(o.matrixWorld); c.fromBufferAttribute(Pp, i2).applyMatrix4(o.matrixWorld);
          if (Math.max(a.y, b.y, c.y) < y0 || Math.min(a.y, b.y, c.y) > y1) continue;
          const id = tris.length; tris.push([a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, nm]);
          const bx0 = Math.floor(Math.min(a.x, b.x, c.x) / BIN), bx1 = Math.floor(Math.max(a.x, b.x, c.x) / BIN), bz0 = Math.floor(Math.min(a.z, b.z, c.z) / BIN), bz1 = Math.floor(Math.max(a.z, b.z, c.z) / BIN), by0 = Math.floor(Math.min(a.y, b.y, c.y) / BIN), by1 = Math.floor(Math.max(a.y, b.y, c.y) / BIN);
          if ((bx1 - bx0 + 1) * (bz1 - bz0 + 1) * (by1 - by0 + 1) > 900) continue;   // the field and the road: nothing at eye height
          for (let x = bx0; x <= bx1; x++) for (let z = bz0; z <= bz1; z++) for (let y = by0; y <= by1; y++) { const k = x + ',' + y + ',' + z; let l = bins.get(k); if (!l) bins.set(k, l = []); l.push(id); }
        }
      };
      for (const r of roots) r.traverse(take);
      const T = new THREE.Triangle(), Pq = new V3(), Cq = new V3();
      const nearest = (x, y, z, rad) => {
        let best = rad, bt = null; const cx = Math.floor(x / BIN), cy = Math.floor(y / BIN), cz = Math.floor(z / BIN), seen = new Set();
        for (let i = cx - 1; i <= cx + 1; i++) for (let j = cy - 1; j <= cy + 1; j++) for (let k = cz - 1; k <= cz + 1; k++) {
          const l = bins.get(i + ',' + j + ',' + k); if (!l) continue;
          for (const id of l) { if (seen.has(id)) continue; seen.add(id); const t = tris[id]; T.a.set(t[0], t[1], t[2]); T.b.set(t[3], t[4], t[5]); T.c.set(t[6], t[7], t[8]); T.closestPointToPoint(Pq.set(x, y, z), Cq); const d = Cq.distanceTo(Pq); if (d < best) { best = d; bt = id; } }
        }
        if (bt === null) return null;
        const t = tris[bt]; return { d: best, name: t[9], at: { x: (t[0] + t[3] + t[6]) / 3, y: (t[1] + t[4] + t[7]) / 3, z: (t[2] + t[5] + t[8]) / 3 } };
      };
      return { nearest, count: tris.length };
    }
    let house = null;   // the house and the near yard, built once
    const houseTris = () => house || (house = triBins({ x0: -16, x1: 14, z0: -31, z1: 9 }));
    // every door open or shut at once (the strips follow; the sweeps are not involved)
    const setDoors = (open, except = []) => { for (const k in W.doors) { const d = W.doors[k]; if (except.includes(k)) continue; d.target = open ? 1 : 0; d.a = Math.min(d.target, d.max); d.apply(); } };
    const setDoor = (k, open) => { const d = W.doors[k]; d.target = open ? 1 : 0; d.a = Math.min(d.target, d.max); d.apply(); };
    // the player, standing: on the floor at (x, z), facing (tx, tz)
    const stand = (x, z, tx, tz) => { P.pos.set(x, W.groundAt(x, z, P.pos.y), z); P.vel.set(0, 0, 0); P.mode = 'walk'; P.pod = null; g.F.cutscene = false; g.F.dead = false; P.pitch = 0; if (tx !== undefined) P.yaw = Math.atan2(-(tx - x), -(tz - z)); };
    const clearKeys = () => { for (const k in g.keys) g.keys[k] = false; };
    // one frame of the player's movement, the doors and the camera (what update() does for them, with the loop frozen). The keys
    // reach movePlayer through input.poll (the move and sprint actions), which loop() runs before update(), so the frame polls first
    const frame = (dt = DT) => { g.input.poll(); if (P.mode === 'walk') g.movePlayer(dt); W.tick(dt); E.update(dt); g.updateCamera(dt); };
    // the eye against the triangles and the boundaries; the body against the boundaries
    function checks(step, scene, n, { near = C.NEAR, body = true, tris = houseTris() } = {}) {
      const t = tris.nearest(camera.position.x, camera.position.y, camera.position.z, near);
      if (t) find(step, scene, n, 'eye', `${t.name} (${t.d.toFixed(3)} m)`, camera.position);
      const ep = C.eyeProbe(camera, { mode: P.mode }); if (ep.pen > 0.002) find(step, scene, n, 'eye', `${C.describe(ep.hit)} (${ep.pen.toFixed(3)} m into the near plane)`, camera.position);
      if (body) { const pen = C.penetration(PB); if (pen.pen > 0.01) find(step, scene, n, 'body', `${C.describe(pen.hit)} (${pen.pen.toFixed(3)} m)`, P.pos); }
    }
    // drive the player along waypoints with the keys, steering each frame; stuck for 1.5 s is a finding (unless the scene expects it)
    function drive(step, scene, pts, { sprint = false, maxT = 20, onFrame = null, stuckOk = false } = {}) {
      let n = 0, stuckT = 0, best = Infinity, t = 0;
      for (const [x, z] of pts) {
        best = Infinity; stuckT = 0;
        while (t < maxT) {
          const dx = x - P.pos.x, dz = z - P.pos.z, d = Math.hypot(dx, dz);
          if (d < 0.12) break;
          P.yaw = Math.atan2(-dx, -dz); g.keys.KeyW = true; g.keys.ShiftLeft = sprint; P.stamina = 1; P.exhausted = false;
          frame(); n++; t += DT;
          checks(step, scene, n);
          if (onFrame) onFrame(n);
          if (d < best - 0.004) { best = d; stuckT = 0; } else { stuckT += DT; if (stuckT > 1.5) { if (!stuckOk) find(step, scene, n, 'body', `stuck ${d.toFixed(2)} m short of (${x}, ${z})`, P.pos); break; } }
        }
      }
      clearKeys(); g.keys.ShiftLeft = false; frame();
      return n;
    }
    window.__sweep = { THREE, V3, nav, Wm, W, C, P, E, PB, camera, EYE, R, DT, findings, find, triBins, houseTris, setDoors, setDoor, stand, clearKeys, frame, checks, drive };
  });
}

// ---------- the steps ----------
const STEPS = {
  // 0: the contract: W.plugin's context, a plugin's solid live at once and the barn block gone, every door's max clamp (the front door's
  // chain), and a door strip that never snaps on round the player
  0: (page) => page.evaluate(() => {
    const { W, C, P, PB, find, setDoors, setDoor, stand, frame, clearKeys } = window.__sweep, g = window.__game, out = {};
    const KEYS = ['solid', 'removeSolid', 'box', 'rbox', 'lbox', 'place', 'prop', 'std', 'M', 'T', 'TX', 'house', 'yard', 'doors', 'mkDoor', 'setDoor', 'colliders', 'rainDiscard', 'headClear', 'SX', 'SZ', 'groundAt', 'PLAN', 'W'];
    let ctx = null; W.plugin((c) => { ctx = c; });
    const missing = KEYS.filter((k) => !ctx || ctx[k] === undefined); if (missing.length) find(0, 'W.plugin', 0, 'ctx', `missing ${missing.join(', ')}`, null);
    if (ctx && ctx.W !== W) find(0, 'W.plugin', 0, 'ctx', 'ctx.W is not W', null);
    // a plugin's solid stops the player on the next step; the barn block goes
    const barn = W.colliders.filter((c) => c.id === 'barnBlock').length;
    W.plugin((c) => { c.solid(7.9, 8.1, -0.8, 0.0, { id: 'pluginWall', maxY: 2 }); c.removeSolid('barnBlock'); });
    if (W.colliders.filter((c) => c.id === 'barnBlock').length !== 0) find(0, 'W.plugin', 0, 'removeSolid', `the barn block: ${barn} before, ${W.colliders.filter((c) => c.id === 'barnBlock').length} after`, null);
    stand(7.3, -0.42, 10, -0.42); g.updateCamera(0); g.keys.KeyW = true; for (let i = 0; i < 90; i++) frame(); clearKeys();
    out.pluginWall = +P.pos.x.toFixed(3);
    if (P.pos.x > 7.9 - 0.28 + 0.01) find(0, 'W.plugin', 90, 'body', `walked through the plugin's wall to x ${P.pos.x.toFixed(2)}`, P.pos);
    W.removeSolid('pluginWall');
    // the front door's chain: max 0.04 stops the leaf at 0.04 whatever the target
    const f = W.doors.front; f.a = f.target = 0; f.apply(); f.max = 0.04; W.setDoor('front', true, true); for (let i = 0; i < 90; i++) W.tick(1 / 60);
    out.frontChain = +f.a.toFixed(3);
    if (Math.abs(f.a - 0.04) > 1e-6) find(0, 'front door chain', 90, 'leaf', `a ${f.a.toFixed(3)} with max 0.04`, null);
    f.max = 1; for (let i = 0; i < 90; i++) W.tick(1 / 60); if (f.a !== 1) find(0, 'front door chain', 180, 'leaf', `a ${f.a.toFixed(3)} once the chain is off`, null);
    W.frontDoor.setOpen(true);
    // a strip never snaps on round the player: the player stands in the shut kid door's line and the door is shut by force
    const d = W.doors.kid; setDoor('kid', true); stand(d.mid.x, d.mid.z, d.mid.x, d.mid.z + 1); g.updateCamera(0);
    d.a = d.target = 0; d.apply();
    out.stripOnPlayer = { on: d.col.on, waiting: !!d.col.armWhenClear };
    if (d.col.on) find(0, 'strip round the player', 0, 'strip', 'the kid door strip came on with the player standing in it', P.pos);
    for (let i = 0; i < 10; i++) frame(); if (C.penetration(PB).pen > 0.01) find(0, 'strip round the player', 10, 'body', `pushed: ${C.describe(C.penetration(PB).hit)}`, P.pos);
    stand(d.mid.x, d.mid.z + 1.2, d.mid.x, d.mid.z); for (let i = 0; i < 5; i++) frame();
    if (!d.col.on) find(0, 'strip round the player', 15, 'strip', 'the strip did not come on once the player left', P.pos);
    out.stripAfter = d.col.on;
    // standing in the kid door's swing arc and opening it: the leaf stops against the player (a < 1) and the eye stays 0.13 m from it
    setDoor('kid', false); const half = C.leafAt(d, 0.5); stand(half.bx - (half.bx - half.ax) * 0.15, half.bz - (half.bz - half.az) * 0.15, d.hx, d.hz); g.updateCamera(0);
    g.toggleDoor(d); let n = 0; for (; n < 120; n++) { frame(); const ep = C.eyeProbe(g.camera, { mode: 'walk' }); if (ep.pen > 0.002) find(0, 'kid door opened onto the player', n, 'eye', `${C.describe(ep.hit)} (${ep.pen.toFixed(3)} m)`, g.camera.position); }
    out.openedOntoPlayer = { a: +d.a.toFixed(3), target: d.target, blocked: !!d.blocked };
    if (!(d.target === 1 && d.a > 0.05 && d.a < 0.98)) find(0, 'kid door opened onto the player', n, 'leaf', `a ${d.a.toFixed(2)} target ${d.target}`, P.pos);
    const s = C.leafOf(d), sn = C.segNear(s, g.camera.position.x, g.camera.position.z); if (sn.d - s.t < 0.13) find(0, 'kid door opened onto the player', n, 'eye', `${(sn.d - s.t).toFixed(3)} m from the leaf`, g.camera.position);
    setDoors(true); stand(7.63, -0.42, 10, -0.42);
    return out;
  }),
  // 1: reachability and pockets
  1: (page) => page.evaluate(() => {
    const { Wm, W, C, P, PB, find, setDoors } = window.__sweep, g = window.__game, R = 0.28, G = 0.1, X0 = -16, X1 = 14, Z0 = -31, Z1 = 9, NX = Math.round((X1 - X0) / G), NZ = Math.round((Z1 - Z0) / G);
    const out = {}; g.mom.group.visible = g.dad.group.visible = false; g.E.visible = false;
    const fill = (sx, sz, label) => {
      const reach = new Map(), stack = [[Math.floor((sx - X0) / G), Math.floor((sz - Z0) / G), 0]];
      const key = (i, j, f) => (i * NZ + j) * 2 + f;
      reach.set(key(stack[0][0], stack[0][1], 0), 0);
      while (stack.length) {
        const [i, j, f] = stack.pop(), y = reach.get(key(i, j, f));
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= NX || b >= NZ) continue;
          const x = X0 + (a + 0.5) * G, z = Z0 + (b + 0.5) * G, ny = W.groundAt(x, z, y), nf = ny < -1 ? 1 : 0, k = key(a, b, nf);
          if (reach.has(k)) continue;
          if (Math.abs(ny - y) > 0.5) continue;   // no cliffs: the laundry's floor is reached by the stairs, not by a step off the parents' floor
          if (C.probe(x, z, R, ny, 1.6, PB).pen > 0) continue;
          reach.set(k, ny); stack.push([a, b, nf]);
        }
      }
      const byRoom = {};
      for (const [k, y] of reach) { const f = k % 2, ij = (k - f) / 2, i = Math.floor(ij / NZ), j = ij % NZ, x = X0 + (i + 0.5) * G, z = Z0 + (j + 0.5) * G, rm = Wm.roomAt(x, z, y); byRoom[rm] = (byRoom[rm] || 0) + 1; }
      // the free cells per room (not blocked at that room's floor), for the pockets
      const free = {};
      for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
        const x = X0 + (i + 0.5) * G, z = Z0 + (j + 0.5) * G;
        for (const [y, nm] of [[0, Wm.roomAt(x, z, 0)], [-2.4, Wm.roomAt(x, z, -2.4)]]) { if (nm === 'out' || (y < -1 && nm !== 'laundry') || (y === 0 && nm === 'laundry')) continue; if (C.probe(x, z, R, y, 1.6, PB).pen > 0) continue; free[nm] = (free[nm] || 0) + 1; }
      }
      out[label] = { cells: reach.size, byRoom, free };
      return { byRoom, free };
    };
    setDoors(true); const open = fill(3.1, -9.0, 'open');
    setDoors(false); const shut = fill(7.63, -0.42, 'shut');
    setDoors(true);
    const rooms = [...Object.keys(Wm.ROOMS), 'stoop', 'laundry', 'garage', 'out'];
    for (const r of rooms) if (!(open.byRoom[r] > 0)) find(1, 'doors open', 0, 'reach', `${r}: not reachable`, null);
    for (const r of rooms) if (r !== 'out' && open.byRoom[r] && open.free[r] && open.free[r] - open.byRoom[r] > 3) find(1, 'doors open', 0, 'reach', `${r}: ${open.free[r] - open.byRoom[r]} free cells not reachable (a pocket)`, null);
    for (const r of ['living', 'kitchen', 'dining', 'hall']) if (!(shut.byRoom[r] > 0)) find(1, 'doors shut', 0, 'reach', `${r}: not reachable from the hall`, null);
    for (const r of ['room2', 'spare', 'bath', 'bed', 'parents', 'stoop', 'laundry', 'garage', 'out']) if (shut.byRoom[r] > 0) find(1, 'doors shut', 0, 'reach', `${r}: reachable through a shut door (${shut.byRoom[r]} cells)`, null);
    return out;
  }),
  // 2: the standing eye vs the real triangles at every reachable cell
  2: (page) => page.evaluate(() => {
    const { Wm, W, C, P, PB, find, setDoors, houseTris, EYE } = window.__sweep, g = window.__game, R = 0.28, G = 0.1, X0 = -16, X1 = 14, Z0 = -31, Z1 = 9, NX = Math.round((X1 - X0) / G), NZ = Math.round((Z1 - Z0) / G);
    setDoors(true); g.mom.group.visible = g.dad.group.visible = false; g.E.visible = false;
    const tris = houseTris();
    const reach = new Map(), stack = [[Math.floor((3.1 - X0) / G), Math.floor((-9.0 - Z0) / G), 0]], key = (i, j, f) => (i * NZ + j) * 2 + f;
    reach.set(key(stack[0][0], stack[0][1], 0), 0);
    while (stack.length) {
      const [i, j, f] = stack.pop(), y = reach.get(key(i, j, f));
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= NX || b >= NZ) continue;
        const x = X0 + (a + 0.5) * G, z = Z0 + (b + 0.5) * G, ny = W.groundAt(x, z, y), nf = ny < -1 ? 1 : 0, k = key(a, b, nf);
        if (reach.has(k) || Math.abs(ny - y) > 0.5 || C.probe(x, z, R, ny, 1.6, PB).pen > 0) continue;
        reach.set(k, ny); stack.push([a, b, nf]);
      }
    }
    const clusters = new Map(); let cells = 0;
    for (const [k, y] of reach) {
      const f = k % 2, ij = (k - f) / 2, i = Math.floor(ij / NZ), j = ij % NZ, x = X0 + (i + 0.5) * G, z = Z0 + (j + 0.5) * G; cells++;
      for (const dy of [-0.035, 0, 0.035]) {
        const h = tris.nearest(x, y + EYE + dy, z, C.NEAR); if (!h) continue;
        const ck = h.name + '@' + Math.round(h.at.x) + ',' + Math.round(h.at.z), c = clusters.get(ck) || { name: h.name, d: 9, stand: null, near: null, n: 0 };
        c.n++; if (h.d < c.d) { c.d = h.d; c.stand = { x, y: y + EYE + dy, z }; c.near = h.at; }
        clusters.set(ck, c);
      }
    }
    for (const c of clusters.values()) find(2, 'standing eye', 0, 'eye', `${c.name} at ${c.d.toFixed(3)} m (${c.n} samples), nearest ${[c.near.x, c.near.y, c.near.z].map((v) => v.toFixed(2)).join(', ')}`, c.stand);
    return { cells, triangles: tris.count, clusters: clusters.size };
  }),
  // 3: the camera tweens, a frame at a time
  3: (page) => page.evaluate(async () => {
    const { V3, W, C, P, E, camera, find, setDoors, stand, frame, houseTris, triBins, DT } = window.__sweep, g = window.__game, MIN = 0.09, out = {};
    setDoors(true);
    const tris = houseTris();
    // run a tween with the timers stepped at 60 Hz, sampling the camera each frame; returns the closest frame
    const settle = () => new Promise((r) => setTimeout(r, 0));
    async function run(name, start, { frames = 90 } = {}) {
      g.F.cutscene = false; const p = start(); let worst = { d: 9, n: -1, at: null, cam: null }, done = !(p && p.then);
      if (!done) p.then(() => { done = true; });
      let n = 0;
      for (; n < frames; n++) {
        g.stepTimers(DT); await settle(); g.updateCamera(DT);
        const h = tris.nearest(camera.position.x, camera.position.y, camera.position.z, 0.6);
        if (h && h.d < worst.d) worst = { d: h.d, n, at: h.at, name: h.name, cam: camera.position.clone() };
        if (done && p && n > 2) break;
      }
      for (let i = 0; i < 400 && !done; i++) { g.stepTimers(DT); await settle(); }   // a tween longer than the frames sampled finishes off camera
      out[name] = worst.n >= 0 ? { closest: +worst.d.toFixed(3), frame: worst.n, of: n, to: worst.name, cam: worst.cam.toArray().map((v) => +v.toFixed(2)) } : null;
      if (worst.n >= 0 && worst.d < MIN) find(3, name, worst.n, 'eye', `${worst.name} (${worst.d.toFixed(3)} m)`, worst.cam);
      return worst;
    }
    const LF = g.LADDER_FLOOR;
    // the climb up (and under the covers in a chase), down, the covers from the seat, the lean over the rail, bedtime's pose, the seat
    stand(LF.x, LF.z, LF.x, LF.z + 1); g.updateCamera(0);
    await run('climb up', () => g.climbUp(), { frames: 60 });
    g.F.chase = false; P.mode = 'bunk'; P.cam.copy(g.BUNK_SEAT); P.yaw = 0; P.pitch = -0.1; g.updateCamera(0);
    await run('climb down', () => g.climbDown(), { frames: 60 });
    stand(LF.x, LF.z, LF.x, LF.z + 1); g.F.chase = true; g.updateCamera(0);
    await run('climb up, hiding', () => g.climbUp(), { frames: 60 }); g.F.chase = false;
    g.toBunk(); g.updateCamera(0);
    await run('under the covers', () => g.hideUnderCovers(), { frames: 50 });
    g.toBunk(); P.pitch = -1.2; P.yaw = 0;
    await run('lean over the rail', () => null, { frames: 120 });
    // and climb down and pull the covers up from the full lean (the head has to come back over the rail first)
    await run('climb down from the lean', () => g.climbDown(), { frames: 70 });
    g.toBunk(); P.pitch = -1.2; P.yaw = 0; for (let i = 0; i < 120; i++) g.updateCamera(DT);
    await run('under the covers from the lean', () => g.hideUnderCovers(), { frames: 70 });
    g.toBunk(); P.pitch = -0.18; g.F.leanK = 0;
    await run('bunk seat', () => null, { frames: 5 });
    P.mode = 'lie'; P.cam.copy(g.LIE); P.pitch = -0.14; P.roll = 0.1;
    await run('bedtime pose', () => null, { frames: 5 });
    P.roll = 0; g.toBunk(); P.mode = 'bunk';
    // the chair: in from the arch's side (the way in from the hall), and out
    stand(2.25, 1.45, 1.99, 2.08); g.updateCamera(0);
    await run('sit in the chair', () => g.sitInChair(), { frames: 70 });
    await run('stand up', () => { g.standUp(); return null; }, { frames: 5 });
    // every hiding place: in by the game's own line, out by exitHide
    const PODS = g.nights.PODS;
    for (const [id, pod] of Object.entries(PODS)) {
      if (!pod.cam) continue;
      stand(pod.front[0], pod.front[2], pod.cam[0], pod.cam[2]); g.updateCamera(0);
      // in: the game's own straight line from the eye to the pod's camera (nights.js enterPod), eased, 45 frames
      const from = camera.position.clone(), to = new V3(...pod.cam), y0 = P.yaw; P.mode = 'cine'; P.cam.copy(from);
      { let worst = { d: 9, n: -1 }; for (let n = 0; n <= 45; n++) { const k = n / 45, e = k * k * (3 - 2 * k); P.cam.lerpVectors(from, to, e); P.yaw = y0 + (pod.yaw - y0) * e; g.updateCamera(DT); const h = tris.nearest(camera.position.x, camera.position.y, camera.position.z, 0.6); if (h && h.d < worst.d) worst = { d: h.d, n, name: h.name, cam: camera.position.clone() }; } out['into ' + id] = { closest: +worst.d.toFixed(3), frame: worst.n, to: worst.name }; if (worst.d < MIN) find(3, 'into ' + id, worst.n, 'eye', `${worst.name} (${worst.d.toFixed(3)} m)`, worst.cam); }
      P.pos.set(to.x, 0, to.z); P.pod = id; P.podYaw = pod.yaw; P.mode = 'hide'; g.F.cutscene = false; g.updateCamera(0);
      await run('out of ' + id, () => g.nights.exitHide(), { frames: 50 });
      if (id === 'tub') W.curtainSee(false);
    }
    // the car's two seats (the car's own interior; it stands on the road for this)
    const car = g.car; car.place(0, -28.8, 0); car.apply(); car.show(true); g.scene.updateMatrixWorld(true);
    const carTris = triBins({ x0: -10, x1: 10, z0: -40, z1: -20, roots: [car.group] });
    for (const seat of ['back', 'front']) { car.setSeat(seat); const v = car.cameraWorld(new V3()); const h = carTris.nearest(v.x, v.y, v.z, 0.6); out['car ' + seat] = h ? { closest: +h.d.toFixed(3), to: h.name } : null; if (h && h.d < MIN) find(3, 'car ' + seat, 0, 'eye', `${h.name} (${h.d.toFixed(3)} m)`, v); }
    car.setSeat('back'); car.show(false);
    stand(7.63, -0.42, 10, -0.42);
    return out;
  }),
  // 4: driven routes and the leaf shut on a player in its arc
  4: (page) => page.evaluate(() => {
    const { nav, W, C, P, E, find, setDoors, setDoor, stand, frame, drive, clearKeys, DT } = window.__sweep, g = window.__game, out = { routes: 0, frames: 0 };
    setDoors(true); E.visible = false; g.mom.group.visible = g.dad.group.visible = false;
    const N = nav.NODES, seen = new Set();
    const edges = []; for (const a in nav.ADJ) for (const e of nav.ADJ[a]) { const k = [a, e.to].sort().join('|'); if (seen.has(k)) continue; seen.add(k); edges.push([a, e.to, e.door]); }
    for (const [a, b, door] of edges) {
      for (const [from, to] of [[a, b], [b, a]]) {
        const [fx, fz] = N[from], [tx, tz] = N[to];
        stand(fx, fz, tx, tz); P.pos.y = W.groundAt(fx, fz, N[from][2] || 0); g.updateCamera(0);
        if (door) setDoor(door, true);
        out.frames += drive(4, `${from} -> ${to}${door ? ` (${door} open)` : ''}`, [[tx, tz]], { maxT: 12 }); out.routes++;
      }
    }
    // the drive and the ramp, the front door both ways, the stoop round the stairwell
    for (const [name, pts] of [['the drive and up the ramp', [[3.1, -6.5], [2.3, -10.1], [2.3, -13.9], [2.3, -10.1]]], ['out the front door', [[3.1, -3.38], [3.1, -5.6]]], ['in the front door', [[3.1, -5.6], [3.1, -3.38]]], ['the stoop', [[-1.6, 5.37], [-2.5, 6.4], [-1.6, 5.37]]]]) {
      const [sx, sz] = pts[0]; stand(sx, sz, pts[1][0], pts[1][1]); g.updateCamera(0);
      out.frames += drive(4, name, pts.slice(1), { maxT: 16 }); out.routes++;
    }
    // each hinged door shut on a player standing in its arc: the leaf stops against them, the strip stays off, and it finishes once they go
    for (const k in W.doors) {
      const d = W.doors[k]; if (d.slide) continue;
      setDoor(k, true);
      const mid = C.leafAt(d, 0.5), sx = (mid.ax + mid.bx) / 2 * 0.3 + mid.bx * 0.7, sz = (mid.az + mid.bz) / 2 * 0.3 + mid.bz * 0.7;   // near the tip of the leaf's half-way line
      stand(sx, sz, d.hx, d.hz); P.pos.y = W.groundAt(sx, sz, d.y0 || 0); g.updateCamera(0);
      const pen0 = C.penetration(g.PB); if (pen0.pen > 0.01) { find(4, `${k} shut on the player`, 0, 'body', `the spot is not standable: ${C.describe(pen0.hit)}`, P.pos); continue; }
      W.setDoor(k, false, true);
      let n = 0, stopped = null;
      for (; n < 150; n++) {
        frame();
        const pen = C.penetration(g.PB); if (pen.pen > 0.005 && pen.hit && pen.hit.door) find(4, `${k} shut on the player`, n, 'body', `${C.describe(pen.hit)} (${pen.pen.toFixed(3)} m)`, P.pos);
        if (d.col.on) find(4, `${k} shut on the player`, n, 'strip', 'the strip came on round the player', P.pos);
        const ep = C.eyeProbe(g.camera, { mode: 'walk' }); if (ep.pen > 0.002) find(4, `${k} shut on the player`, n, 'eye', `${C.describe(ep.hit)} (${ep.pen.toFixed(3)} m)`, g.camera.position);
        if (d.blocked) stopped = d.a;
      }
      if (!(stopped > 0.02 && d.a > 0.02)) find(4, `${k} shut on the player`, n, 'leaf', `the leaf did not stop against the player (a ${d.a.toFixed(2)})`, P.pos);
      // the player steps away: the door finishes
      const away = C.leafAt(d, 1); const ax = away.bx + (away.bx - away.ax) * 1.2, az = away.bz + (away.bz - away.az) * 1.2; stand(ax, az, d.hx, d.hz); P.pos.y = W.groundAt(ax, az, d.y0 || 0);
      for (let i = 0; i < 150 && d.a > 0; i++) frame();
      if (d.a !== 0 || !d.col.on) find(4, `${k} shut on the player`, n, 'leaf', `the door did not finish once the player left (a ${d.a.toFixed(2)}, strip ${d.col.on})`, P.pos);
      setDoor(k, true);
    }
    clearKeys(); stand(7.63, -0.42, 10, -0.42);
    return out;
  }),
  // 6: door sweeps vs the player grid, the thing at its inside node, Dad at the knob
  6: (page) => page.evaluate(() => {
    const { nav, W, C, P, E, find, setDoors, setDoor, stand } = window.__sweep, g = window.__game, out = {};
    setDoors(true); E.visible = false; g.mom.group.visible = g.dad.group.visible = false;
    const INSIDE = { room2: 'r2In', spare: 'sIn', bath: 'bathIn', kid: 'kidIn', back: 'backIn', basement: 'lauIn', garage: 'garIn', front: null };
    // is a body (a circle of r at x, z) inside the sector the leaf sweeps between a0 and a1? (its near edge within the leaf's length, its
    // bearing from the hinge within the swept angles, widened by the body's own angular size)
    const inWay = (d, a0, a1, body, r) => {
      const w = d.w || 0.81, t = 0.03, reach = Math.hypot(body.x - d.hx, body.z - d.hz);
      if (reach - r - t >= w) return false;
      const dA = C.angDiff(d.rotC, d.rotO), from = dA * Math.min(a0, a1), to = dA * Math.max(a0, a1);   // the swept interval, relative to the shut leaf
      const rel = C.angDiff(d.rotC, Math.atan2(-(body.z - d.hz), body.x - d.hx)), m = Math.asin(Math.min(1, (r + t) / Math.max(reach, 1e-6)));
      return rel > Math.min(from, to) - m && rel < Math.max(from, to) + m;
    };
    // swing d from a0 to a1 in 60 steps with the bodies as they are: the leaf must never stand in a body, and must stop when one is in its way
    const swing = (d, a0, a1, scene, body, r) => {
      d.a = d.target = a0; d.apply();
      let a = a0, hit = null;
      for (let i = 1; i <= 60; i++) {
        const want = a0 + (a1 - a0) * i / 60, sw = C.sweepLeaf(d, want - a);
        if (C.leafHits(d, sw.a)) find(6, scene, i, 'leaf', `the leaf at ${sw.a.toFixed(3)} stands in the ${C.describe(C.leafHits(d, sw.a))}`, { x: body.x, y: 0, z: body.z });
        a = sw.a; d.a = a; d.apply(); if (sw.hit) { hit = sw.hit; break; }
      }
      if (!hit && inWay(d, a0, a1, body, r)) find(6, scene, 60, 'leaf', `the leaf swung ${a0} -> ${a1} through a body ${Math.hypot(body.x - d.hx, body.z - d.hz).toFixed(2)} m from the hinge without stopping`, { x: body.x, y: 0, z: body.z });
      return { a, hit };
    };
    for (const k in W.doors) {
      const d = W.doors[k]; if (d.slide) continue;
      const y0 = d.y0 || 0, w = d.w || 0.81, stats = { spots: 0, stops: 0, skipped: 0 };
      // the player on a 0.1 m grid in the quarter-disc the leaf sweeps (plus the body's radius), where the player can stand
      const rotC = d.rotC, dA = C.angDiff(d.rotC, d.rotO);
      for (let rr = 0.15; rr <= w + 0.28 + 0.1; rr += 0.1) for (let t = 0.05; t < 1; t += 0.1) {
        const ang = rotC + dA * t, x = d.hx + Math.cos(ang) * rr, z = d.hz - Math.sin(ang) * rr;
        d.a = d.target = 1; d.apply();
        stand(x, z, d.hx, d.hz); P.pos.y = W.groundAt(x, z, y0); if (y0 < -1) P.pos.y = y0;
        const pen = C.probe(x, z, 0.28, P.pos.y, 1.6, g.PB);
        if (pen.pen > 0.003 && !(pen.hit && pen.hit.door === d)) { stats.skipped++; continue; }   // not a standable spot (a wall, the furniture)
        stats.spots++;
        // shut to open with the player there: the leaf starts in the wall line, so a spot touching it is skipped for that direction
        if (!C.leafHits(d, 0)) { const r1 = swing(d, 0, 1, `${k} opening, player at (${x.toFixed(2)}, ${z.toFixed(2)})`, { x, z }, 0.28); if (r1.hit) stats.stops++; }
        if (!C.leafHits(d, 1)) { const r2 = swing(d, 1, 0, `${k} closing, player at (${x.toFixed(2)}, ${z.toFixed(2)})`, { x, z }, 0.28); if (r2.hit) stats.stops++; }
      }
      stand(7.63, -0.42, 10, -0.42);
      // the thing at its inside node, and Dad at the knob
      const node = INSIDE[k];
      if (node) {
        const [nx, nz, ny = 0] = nav.NODES[node]; E.root.position.set(nx, ny, nz); E.visible = true; E.mode = 'idle';
        const r1 = swing(d, 0, 1, `${k} opening, the thing at ${node}`, { x: nx, z: nz }, 0.35), r2 = swing(d, 1, 0, `${k} closing, the thing at ${node}`, { x: nx, z: nz }, 0.35);
        stats.thing = { opening: r1.hit ? `stops at ${r1.a.toFixed(2)}` : 'clear', closing: r2.hit ? `stops at ${r2.a.toFixed(2)}` : 'clear' };
        if (r1.hit || r2.hit) find(6, `${k}, the thing at ${node}`, 0, 'node', `the inside node is in the leaf's arc (opening ${stats.thing.opening}, closing ${stats.thing.closing})`, { x: nx, y: ny, z: nz });
        E.visible = false;
      }
      // (Dad up: asleep in bed his body is the bed's box, not a capsule at his feet, js/parents.js; the night phase has laid him down)
      if (d.fr) { const slept = g.dad.sleeping; g.dad.sleeping = false; d.a = d.target = 0; d.apply(); const k0 = g.atKnob(d); g.dad.group.position.copy(k0.stand); g.dad.group.position.y += y0; g.dad.group.visible = true;   // (atKnob's foot is on the door's own floor)
        const r1 = swing(d, 0, 1, `${k} opening, Dad at the knob`, { x: k0.stand.x, z: k0.stand.z }, 0.4);
        d.a = d.target = 1; d.apply(); const k1 = g.atKnob(d); g.dad.group.position.copy(k1.stand); g.dad.group.position.y += y0;
        const r2 = swing(d, 1, 0, `${k} closing, Dad at the knob`, { x: k1.stand.x, z: k1.stand.z }, 0.4);
        stats.dad = { opening: r1.hit ? `stops at ${r1.a.toFixed(2)}` : 'clear', closing: r2.hit ? `stops at ${r2.a.toFixed(2)}` : 'clear' };
        g.dad.group.visible = false; g.dad.sleeping = slept; }
      d.a = d.target = 1; d.apply();
      out[k] = stats;
    }
    stand(7.63, -0.42, 10, -0.42);
    return out;
  }),
  // 9: the player vs the thing
  9: (page) => page.evaluate(() => {
    const { nav, W, C, P, E, camera, find, setDoors, setDoor, stand, frame, drive, clearKeys, DT } = window.__sweep, g = window.__game, out = {};
    setDoors(true); g.mom.group.visible = g.dad.group.visible = false;
    const thing = C.body('thing'), N = nav.NODES;
    const place = (node, faceNode) => { const [x, z] = N[node], [fx, fz] = N[faceNode]; E.root.position.set(x, 0, z); E.visible = true; E.mode = 'idle'; E.lookTarget = null; E.faceTowards(fx, fz, 1); };
    const gapNow = () => Math.hypot(P.pos.x - E.root.position.x, P.pos.z - E.root.position.z);
    const watch = (scene) => (n) => {
      const gap = gapNow(); if (gap < 0.63 - 0.002) find(9, scene, n, 'body', `${gap.toFixed(3)} m from the thing's root`, P.pos);
      const ep = C.eyeProbe(camera, { mode: P.mode }); if (ep.hit === thing && ep.pen > 0) find(9, scene, n, 'eye', `the near plane in the thing's capsule (${ep.pen.toFixed(3)} m)`, camera.position);
    };
    for (const sprint of [false, true]) {
      const scene = `east from hallW into it at hallM, ${sprint ? 'sprinting' : 'walking'}`;
      place('hallM', 'hallW'); stand(N.hallW[0], N.hallW[1], N.hallM[0], N.hallM[1]); g.updateCamera(0);
      drive(9, scene, [[N.hallM[0], N.hallM[1]]], { sprint, maxT: 4, onFrame: watch(scene), stuckOk: true });
      out[scene] = { gap: +gapNow().toFixed(3) };
      if (gapNow() > 0.9) find(9, scene, 0, 'body', `the player never reached it (${gapNow().toFixed(2)} m)`, P.pos);
      const scene2 = `through the open kid door into it at kidIn, ${sprint ? 'sprinting' : 'walking'}`;
      setDoor('kid', true); place('kidIn', 'hallE'); stand(N.hallE[0], N.hallE[1], N.kidIn[0], N.kidIn[1]); g.updateCamera(0);
      drive(9, scene2, [[N.kidIn[0], N.kidIn[1]]], { sprint, maxT: 4, onFrame: watch(scene2), stuckOk: true });
      out[scene2] = { gap: +gapNow().toFixed(3) };
      if (gapNow() > 0.9) find(9, scene2, 0, 'body', `the player never reached it (${gapNow().toFixed(2)} m)`, P.pos);
    }
    // it comes to a standing player at 1.5 m/s: the player is pushed down the hall, never entered
    { const scene = 'it walks into a standing player'; stand(N.hallM[0], N.hallM[1], N.hallE[0], N.hallE[1]); E.root.position.set(N.hallM[0] + 1.6, 0, N.hallM[1]); E.visible = true; E.faceTowards(P.pos.x, P.pos.z, 1); clearKeys(); g.updateCamera(0);
      const x0 = P.pos.x; let n = 0;
      for (; n < 90; n++) { E.root.position.x -= 1.5 * DT; frame(); watch(scene)(n); }
      out[scene] = { pushed: +(x0 - P.pos.x).toFixed(3), gap: +gapNow().toFixed(3) };
      if (x0 - P.pos.x < 0.8) find(9, scene, n, 'body', `the player was not pushed (${(x0 - P.pos.x).toFixed(2)} m)`, P.pos); }
    E.visible = false; stand(7.63, -0.42, 10, -0.42);
    return out;
  }),
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
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 640, height: 360 } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.addInitScript(() => { window.__norender = true; });
  await page.goto(`http://127.0.0.1:${PORT}/index.html#shot`, { waitUntil: 'load', timeout: 300e3 });
  await page.waitForFunction(() => window.__game && document.getElementById('loading').classList.contains('done'), null, { timeout: 400e3, polling: 500 });
  await page.waitForFunction(() => { const g = window.__game; return g.E.rig && g.mom.rig && g.dad.rig; }, null, { timeout: 300e3, polling: 500 });
  await page.waitForLoadState('networkidle', { timeout: 120e3 }).catch(() => {});
  await page.waitForFunction(() => { let n = 0; window.__game.scene.traverse((o) => { if (o.userData && o.userData.prop && !o.children.length) n++; }); return n === 0; }, null, { timeout: 120e3, polling: 500 }).catch(() => {});
  await page.evaluate(() => { const g = window.__game; g.start(); window.__freeze = true; g.setPhase('night', true); g.E.visible = false; g.P.mode = 'walk'; });
  await page.evaluate(sweepLib);
  const results = {}, t0 = Date.now();
  for (const n of [0, 1, 2, 3, 4, 6, 9]) {
    if (!want(n)) continue;
    const t = Date.now();
    try { results[n] = await STEPS[n](page); } catch (e) { results[n] = { error: String(e && e.message || e).split('\n')[0] }; }
    const found = await page.evaluate(() => window.__sweep.findings.length);
    console.log(`step ${n}: ${results[n] && results[n].error ? 'ERROR ' + results[n].error : 'done'}, ${found} findings so far (${((Date.now() - t) / 1000).toFixed(1)} s)`);
  }
  const findings = await page.evaluate(() => window.__sweep.findings);
  // --shots: each failing scene's first frame is drawn from the player's eye
  if (SHOTS && findings.length) {
    fs.mkdirSync(SHOTS, { recursive: true });
    const seen = new Set();
    for (const f of findings) {
      const key = `${f.step}_${f.scene}`.replace(/[^a-z0-9]+/gi, '_').slice(0, 80); if (seen.has(key) || !f.point) continue; seen.add(key);
      const img = await page.evaluate(([p, part]) => { const g = window.__game; if (part === 'eye') g.camera.position.set(p[0], p[1], p[2]); else { g.P.pos.set(p[0], p[1], p[2]); g.updateCamera(0); } g.gfx.render(0.016); return document.querySelector('#game canvas').toDataURL('image/png'); }, [f.point, f.part]).catch(() => null);
      if (img) fs.writeFileSync(path.join(SHOTS, key + '.png'), Buffer.from(img.split(',')[1], 'base64'));
    }
  }
  await browser.close(); server.close();
  // 8: the placement audit with the sunk allowances
  let placement = null;
  if (want(8)) {
    const r = spawnSync(process.execPath, [path.join(__dirname, 'placement.js'), '--port', String(PORT + 1)], { cwd: ROOT, encoding: 'utf8', timeout: 600e3 });
    placement = { status: r.status, out: (r.stdout || '').trim().split('\n').slice(-6).join('\n') };
    console.log(`step 8: placement.js exit ${r.status}\n  ${placement.out.replace(/\n/g, '\n  ')}`);
    if (r.status !== 0) findings.push({ step: 8, scene: 'placement', frame: 0, part: 'model', object: `tests/placement.js exit ${r.status}`, point: null });
  }
  for (const n of Object.keys(results)) console.log(`step ${n} ${JSON.stringify(results[n])}`);
  if (errs.length) console.log('page errors:', errs.slice(0, 5).join(' | '));
  const fails = findings.filter((f) => !known(f)), knowns = findings.filter((f) => known(f));
  for (const f of knowns) console.log(`known step ${f.step} ${f.scene} frame ${f.frame}: ${f.part} vs ${f.object}${f.point ? ` at (${f.point.join(', ')})` : ''} -- ${known(f)[2]}`);
  for (const f of fails) console.log(`FAIL step ${f.step} ${f.scene} frame ${f.frame}: ${f.part} vs ${f.object}${f.point ? ` at (${f.point.join(', ')})` : ''}`);
  console.log(fails.length ? `${fails.length} findings` : 'clean', knowns.length ? `(${knowns.length} known, not counted)` : '', `(${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify({ results, findings, placement, errs }, null, 1));
  process.exit(fails.length || errs.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
