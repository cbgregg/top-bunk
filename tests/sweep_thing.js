// The thing against the house: nothing of its body clips unless on purpose (law 9), at every pose it is put in and on every edge of the
// graph it walks. The game is loaded headless (window.__norender, the loop frozen) and the thing is driven a frame at a time; every
// eighth skinned vertex of its body (and its skull) is put through the skeleton and tested.
//   node tests/sweep_thing.js [--port N] [--only dump,edges,poses,player,catch] [--json out.json]
// The steps:
//   dump     the bone dump of design 6.2/6.4: in the crawl the planted hands, the knees and the feet on the boards and the crown under a
//            door's rail; the crumple's hands on the floor; the catch's root on the floor
//   edges    the thing on every nav edge both ways, at a walk (1.55 m/s) and at a hunt (3.6 m/s), doors open (on all fours through the
//            laundry): no vertex under its floor, over 2.68 m above it, inside a wall, a door head, a fixture's dome, the laundry's joists
//            or a piece of furniture by more than 2 cm; its crown 1.95 m or lower in every doorway (the duck)
//   poses    the same tests for each pose it is put in by a scene: the crumple, standing, the peek (scale 0.72), lying on the bottom bunk,
//            sitting at the kitchen table (reported with collide.fits: the pose ships only if it fits), night one's bedside, the finale,
//            the paralysis; and the unfold's five keys
//   player   the player driven into it (the crumple, the crawl, the peek, lying, the loom at a hiding place's door, the frozen stalk):
//            the body stops outside the pose's extent and the eye's five rays never come within 2 cm of its skin
//   catch    the catch's three frames from the player's eye: only the third brings its face through the near plane
// Each finding is printed as step, scene, part, what, where; exit 1 when there are any.
const http = require('http'), fs = require('fs'), path = require('path');
const { Readable } = require('stream');
const ROOT = path.resolve(__dirname, '..');
const serve = require(path.join(ROOT, 'desktop', 'static'));
const ARGV = process.argv.slice(2);
const opt = (k, d) => { const i = ARGV.indexOf(k); return i >= 0 && ARGV[i + 1] ? ARGV[i + 1] : d; };
const PORT = +opt('--port', 10040), JSON_OUT = opt('--json', '');
const ONLY = opt('--only', '') ? new Set(opt('--only', '').split(',')) : null;
const want = (n) => !ONLY || ONLY.has(n);

function lib() {
  const g = window.__game, W = g.W, C = g.collide, P = g.P, E = g.E, camera = g.camera, F = g.F, DT = 1 / 60;
  return import('/js/nav.js').then((nav) => {
    const findings = [], notes = {};
    const find = (step, scene, part, what, p) => findings.push({ step, scene, part, what, point: p ? [+p[0].toFixed(2), +p[1].toFixed(2), +p[2].toFixed(2)] : null });
    const V = camera.position.constructor;
    // the skinned vertices, one in eight, in the world; each with the bone that carries most of it
    const meshes = () => { const out = []; E.root.traverse((o) => { if (o.isSkinnedMesh && o.visible) out.push(o); }); return out; };
    const verts = (step = 8) => {
      const out = [], v = new V(); E.root.updateMatrixWorld(true);
      for (const m of meshes()) {
        m.skeleton.update(); const Pp = m.geometry.attributes.position, SI = m.geometry.attributes.skinIndex, SW = m.geometry.attributes.skinWeight;
        for (let i = 0; i < Pp.count; i += step) {
          v.fromBufferAttribute(Pp, i); m.applyBoneTransform(i, v); v.applyMatrix4(m.matrixWorld);
          let bi = 0, bw = -1; for (let c = 0; c < 4; c++) if (SW.getComponent(i, c) > bw) { bw = SW.getComponent(i, c); bi = SI.getComponent(i, c); }
          out.push([v.x, v.y, v.z, m.skeleton.bones[bi].name.replace(/^Bip01_?/, '')]);
        }
      }
      return out;
    };
    const ground = (x, z, y) => (W.groundAt ? W.groundAt(x, z, y) : 0);
    const nameOf = (c) => c.id || c.prop || (c.wall ? 'wall' : c.door ? 'door strip ' + c.door : 'furniture');
    // what a vertex at (x, y, z) is inside of by more than 2 cm (null when nothing); floor: the floor the body stands on
    const TOL = 0.02;
    function inside(x, y, z, floor, near) {
      if (y < ground(x, z, floor + 0.5) - TOL && Math.abs(ground(x, z, floor + 0.5) - floor) < 0.6) return 'under the floor by ' + (ground(x, z, floor + 0.5) - y).toFixed(3);
      if (y > floor + 2.68) return 'over 2.68 m (' + (y - floor).toFixed(3) + ')';
      for (const c of near) {
        if (!(c.wall || c.door) && (c.minY ?? 0) > floor + 1.2) continue;   // furniture on the floor above (the laundry is under Mom and Dad's room)
        const d = Math.min(x - c.minX, c.maxX - x, z - c.minZ, c.maxZ - z); if (d <= TOL) continue;
        const y0 = c.wall || c.door ? (c.minY ?? -0.3) : (c.minY ?? floor), y1 = c.wall || c.door ? (c.maxY ?? 3) : (c.maxY ?? floor + 1.0);
        if (y > y0 + TOL && y < y1 - TOL) return `${nameOf(c)} by ${Math.min(d, y - y0, y1 - y).toFixed(3)}`;
      }
      for (const o of C.overheads) {
        if (o.when && !o.when()) continue;
        if (x > o.minX + TOL && x < o.maxX - TOL && z > o.minZ + TOL && z < o.maxZ - TOL && y > o.y0 + TOL && y < o.y1) return `${o.id || 'overhead'} by ${(y - o.y0).toFixed(3)}`;
      }
      for (const s of C.spheres) { const d = Math.hypot(x - s.x, y - s.y, z - s.z); if (d < s.r - TOL) return `${s.id || 'fixture'} by ${(s.r - d).toFixed(3)}`; }
      return null;
    }
    // the bunk is an open frame, not a block: its two colliders (the player's footprint) are swapped for its parts, from the bottom
    // bunk's bedding (W.lowerBunk) out: the two mattresses, the rails along both sides, the end boards, the guard rails
    const BUNK = (() => {
      const lb = W.lowerBunk; if (!lb || !lb.quilt) return null; lb.quilt.updateMatrixWorld(true); lb.quilt.geometry.computeBoundingBox();
      const q = lb.quilt.geometry.boundingBox.clone().applyMatrix4(lb.quilt.matrixWorld), x0 = q.min.x - 0.17, x1 = q.max.x + 0.21, z0 = q.min.z - 0.12, z1 = q.max.z + 0.11;
      const b = (a, bb, c, d, e, f, id) => ({ minX: a, maxX: bb, minZ: c, maxZ: d, minY: e, maxY: f, id, on: true });
      return [b(q.min.x, q.max.x, q.min.z, q.max.z, 0.34, lb.top + 0.12, 'bottom mattress'), b(q.min.x, q.max.x, q.min.z, q.max.z, 1.48, 1.8, 'top mattress'),
        b(x0, x1, z0, z0 + 0.06, 0.25, 0.4, 'bunk rail'), b(x0, x1, z1 - 0.06, z1, 0.25, 0.4, 'bunk rail'), b(x0, x1, z0, z0 + 0.06, 1.42, 1.58, 'bunk rail'), b(x0, x1, z1 - 0.06, z1, 1.42, 1.95, 'bunk rail'),
        b(x0, x0 + 0.08, z0, z1, 0.25, 2.0, 'bunk head board'), b(x1 - 0.08, x1, z0, z1, 0.25, 1.95, 'bunk foot board'), b(x0, x0 + 0.7, z0, z0 + 0.06, 1.8, 1.92, 'bunk guard rail')];
    })();
    notes.bunk = BUNK && BUNK.slice(0, 1).map((c) => [c.minX, c.maxX, c.minZ, c.maxZ].map((v) => +v.toFixed(2)));
    // every vertex against the house; returns the highest vertex over the floor
    function bodyCheck(step, scene, { skip = null, ceiling = false } = {}) {
      const p = E.root.position, floor = p.y;
      const near = W.colliders.filter((c) => C.active(c) && c.minX < p.x + 3 && c.maxX > p.x - 3 && c.minZ < p.z + 3 && c.maxZ > p.z - 3 && (c.maxY ?? 3) > floor - 0.3 && (c.minY ?? -0.3) < floor + 2.8 && !(skip && skip(c)) && (c.wall || c.door || !c.dressing) && !(BUNK && /^bunk$/.test(nameOf(c))));
      if (BUNK) near.push(...BUNK.filter((c) => c.minX < p.x + 3 && c.maxX > p.x - 3 && c.minZ < p.z + 3 && c.maxZ > p.z - 3 && !(skip && skip(c))));
      let top = -9, n = 0;
      for (const [x, y, z, bone] of verts()) {
        top = Math.max(top, y - floor);
        let why = inside(x, y, z, floor, near);
        if (why && ceiling && /^over 2\.68/.test(why)) why = null;   // hanging from the ceiling: its hands are on it (the ceiling's own box still counts)
        if (why && n < 3) { find(step, scene, bone, why, [x, y, z]); n++; }
      }
      return top;
    }
    const setDoors = (open) => { for (const k in W.doors) W.setDoor(k, open, true); for (let i = 0; i < 200; i++) W.tick(0.05); };
    const crownY = () => E.head.localToWorld(new V(0, 0.264, 0)).y;
    const reset = () => { E.visible = true; E.root.scale.setScalar(1); E.mode = 'idle'; E.standUp(); E.lean = 0; E.reach = 0; E.tilt = 0; E.leanSide = 0; E.snap = 0; E.flinch = 0; E.stun = 0; E.catchPose = null; E.duckHold = null; E.post = null; E.crawlSpeed = 0; E.lungeOut = 0; E.gait = null; E.sneak = false; E.lookTarget = camera.position; E.ground = W.groundAt; E.cling = null; };
    window.__ST = { g, W, C, P, E, F, camera, nav, DT, V, findings, find, notes, verts, bodyCheck, setDoors, crownY, reset, ground };
  });
}

const STEPS = {
  // ---- the bone dump
  dump: (page) => page.evaluate(() => {
    const { E, V, reset, crownY, find, camera, W } = window.__ST, out = {};
    const y = (n) => E.rig.bones[n].getWorldPosition(new V()).y;
    reset(); camera.position.set(3.3, 1.32, -0.9); E.root.position.set(1.0, 0, -0.9); E.faceTowards(3.3, -0.9, 1); E.mode = 'crawl'; E.snap = 1;
    // a planted frame: the crawl standing still, its step clock between steps (each contact down)
    // (still, it shifts a hand or a knee now and then: the dump is taken on a frame with both hands down)
    for (let i = 0; i < 90; i++) E.update(1 / 60);
    for (let i = 0; i < 240 && E.gait.swing && E.gait.swing[1] === 'H' && (E.gait.t - E.gait.k) >= 0.72 || i < 1; i++) E.update(1 / 60);
    let guard = 0; while (guard++ < 400 && (E.gait.swing && E.gait.swing[1] === 'H')) E.update(1 / 60);
    const g = E.gait, planted = (L) => !g.swing || g.swing !== L || ((g.t - g.k) < 0.72);
    const c = { hands: [y('L_Hand'), y('R_Hand')], knees: [y('L_Calf'), y('R_Calf')], feet: [y('L_Foot'), y('R_Foot')], crown: crownY() };
    out.crawl = Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Array.isArray(v) ? v.map((x) => +x.toFixed(3)) : +v.toFixed(3)]));
    if (planted('LH') && planted('RH') && Math.max(...c.hands) > 0.07) find('dump', 'crawl', 'hands', `planted hands at ${c.hands.map((v) => v.toFixed(3))}`, null);
    if (Math.max(...c.knees) > 0.2) find('dump', 'crawl', 'knees', `knees at ${c.knees.map((v) => v.toFixed(3))}`, null);
    if (Math.max(...c.feet) > 0.075) find('dump', 'crawl', 'feet', `feet at ${c.feet.map((v) => v.toFixed(3))}`, null);
    if (c.crown >= 0.95) find('dump', 'crawl', 'crown', `crown at ${c.crown.toFixed(3)}`, null);
    // the crawl coming at you (looking up at a standing eye 1.2 m off): the crown stays under 0.95
    let crownMax = 0; E.crawlSpeed = 2.5; camera.position.set(3.6, 1.32, -0.9);
    for (let i = 0; i < 120; i++) { E.update(1 / 60); const d = E.lungeOut; E.lungeOut = 0; E.root.position.x = Math.min(2.2, E.root.position.x + d); crownMax = Math.max(crownMax, crownY()); }
    out.crawlComing = { crownMax: +crownMax.toFixed(3) }; if (crownMax >= 0.95) find('dump', 'crawl coming', 'crown', `crown up to ${crownMax.toFixed(3)}`, null);
    reset(); camera.position.set(3.1, 1.32, -0.9); E.root.position.set(1.0, 0, -0.9); E.faceTowards(3.1, -0.9, 1); E.mode = 'crumple'; E.side = 1;
    for (let i = 0; i < 30; i++) E.update(1 / 60);
    out.crumple = { hands: [+y('L_Hand').toFixed(3), +y('R_Hand').toFixed(3)] };
    if (Math.min(...out.crumple.hands) < 0.02) find('dump', 'crumple', 'hands', `crumple hands at ${out.crumple.hands}`, null);
    // the catch: its root stays on the floor in all three frames
    reset(); camera.position.set(7.63, 1.32, -0.42); camera.lookAt(9, 1.32, -0.42); camera.updateMatrixWorld(true); E.root.position.set(8.6, 0, -0.42);
    out.catch = [];
    for (const f of [1, 2, 3]) { E.catchPose = { frame: f, cam: camera }; for (let i = 0; i < 3; i++) E.update(1 / 60); const r = E.root.position.y, gy = W.groundAt(E.root.position.x, E.root.position.z, 0); out.catch.push([f, +r.toFixed(3), +gy.toFixed(3)]); if (r < gy - 1e-3) find('dump', 'catch ' + f, 'root', `root at ${r.toFixed(3)} under the floor ${gy.toFixed(3)}`, null); }
    reset(); E.visible = false;
    return out;
  }),
  // ---- every nav edge, both ways, at two speeds
  edges: (page) => page.evaluate(() => {
    const { E, C, nav, W, setDoors, reset, bodyCheck, crownY, find, ground } = window.__ST, out = { edges: 0, frames: 0, doorways: 0, crownMax: 0 };
    setDoors(true);
    const N = nav.NODES, seen = new Set(), edges = [];
    for (const a in nav.ADJ) for (const e of nav.ADJ[a]) { const k = [a, e.to].sort().join('|'); if (!seen.has(k)) { seen.add(k); edges.push([a, e.to]); } }
    const mids = Object.entries(W.doors).map(([k, d]) => ({ k, x: d.mid.x, z: d.mid.z, y: d.y0 || 0 }));
    for (const [spd, label] of [[1.55, 'walk'], [3.6, 'hunt']]) {
      for (const [a0, b0] of edges) for (const [a, b] of [[a0, b0], [b0, a0]]) {
        const [ax, az, ay = 0] = N[a], [bx, bz] = N[b], door = nav.edgeDoor(a, b), dm = door && W.doors[door].mid;
        reset(); E.lookTarget = null; E.root.position.set(ax, ground(ax, az, ay), az); E.faceTowards(bx, bz, 1);
        const low = false;   // (it walks every edge on its feet below level 5, the laundry bent double under the joists)
        E.mode = low ? 'crawl' : spd > 2.6 ? 'run' : 'walk'; E.speed = spd / 3; E.snap = 1; E.crawlSpeed = spd;
        for (let i = 0; i < 30; i++) E.update(1 / 60);   // into its stride
        // (as the hunter walks it: a doorway is gone through at its middle)
        const pts = [[ax, az], ...(dm ? [[dm.x, dm.z]] : []), [bx, bz]], legs = []; let len = 0;
        for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); legs.push(l); len += l; }
        const at = (s) => { for (let i = 0; i < legs.length; i++) { if (s <= legs[i] || i === legs.length - 1) { const k = legs[i] ? Math.min(1, s / legs[i]) : 1; return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k, pts[i + 1]]; } s -= legs[i]; } };
        const scene = `${a} -> ${b} at a ${label}${low ? ' (crawling)' : ''}`;
        let s = 0, f = 0;
        while (s < len) {
          // a frame as the game runs it: the hunter moves the root (by the lunge the crawl made last frame), then the body is posed there,
          // then the frame is what is drawn and checked
          let d = spd / 60; if (low) { d = E.lungeOut; E.lungeOut = 0; }
          // (and, as the hunter does, it turns toward where it is going only while it is not there: at the node itself there is no way to face)
          s = Math.min(len, s + d); const p = E.root.position, [x, z, to] = at(s); p.x = x; p.z = z; p.y = ground(p.x, p.z, p.y); if (Math.hypot(to[0] - x, to[1] - z) > 0.04) E.faceTowards(to[0], to[1], Math.min(1, 8 / 60));
          E.update(1 / 60);
          f++; out.frames++;
          if (f % 4 === 0) {
            const top = bodyCheck('edges', scene);
            const door = mids.find((m) => Math.abs(m.y - p.y) < 1 && Math.hypot(m.x - p.x, m.z - p.z) < 0.3);
            if (door && !low) { out.doorways++; const cr = crownY() - p.y; out.crownMax = Math.max(out.crownMax, +cr.toFixed(3)); if (cr > 1.95) find('edges', scene, 'crown', `crown ${cr.toFixed(3)} in the ${door.k} doorway (duck ${E.duck.toFixed(2)})`, [p.x, crownY(), p.z]); }
          }
          if (f > 3000) break;
        }
        out.edges++;
      }
    }
    reset(); E.visible = false;
    return out;
  }),
  // ---- the poses scenes put it in
  poses: (page) => page.evaluate(() => {
    const { g, E, W, C, camera, reset, bodyCheck, find, setDoors, V } = window.__ST, out = {};
    setDoors(true);
    const settle = (n = 40) => { for (let i = 0; i < n; i++) E.update(1 / 60); };
    // a pose a scene puts it in: it must stand clear (collide.fits, the check the scenes make) and then nothing of it may clip; a pose
    // that does not fit is not used by any scene, and is reported
    const pose = (name, fn, { fitsAs = null, fitsYaw = null, skip = null, held = false, ceiling = false } = {}) => {
      reset(); fn(); if (!held) settle();
      const p = E.root.position, fit = fitsAs ? C.fits(fitsAs, p.x, p.z, fitsYaw ?? E.root.rotation.y, { y: p.y }) : true;
      out[name] = { at: [+p.x.toFixed(2), +p.z.toFixed(2)], fits: fit };
      if (!fit) { out[name].note = 'does not fit here: not used'; return; }
      out[name].top = +bodyCheck('poses', name, { skip, ceiling }).toFixed(3);
    };
    camera.position.set(3.1, 1.32, -0.9);
    pose('crumple', () => { camera.position.set(3.1, 1.32, -1.6); E.root.position.set(1.2, 0, -1.6); E.faceTowards(3.1, -1.6, 1); E.mode = 'crumple'; E.side = 1; }, { fitsAs: 'crumple' });
    pose('crumple in the hall', () => { camera.position.set(9.5, 1.32, -0.42); E.root.position.set(7.0, 0, -0.42); E.faceTowards(9.5, -0.42, 1); E.mode = 'crumple'; E.side = -1; }, { fitsAs: 'crumple' });
    pose('stand', () => { camera.position.set(3.1, 1.32, -1.6); E.root.position.set(1.2, 0, -1.6); E.faceTowards(3.1, -1.6, 1); }, { fitsAs: 'idle' });
    pose('stand in your room', () => { camera.position.set(8.4, 1.32, 2.0); E.root.position.set(10.3, 0, 3.0); E.faceTowards(8.4, 2.0, 1); }, { fitsAs: 'idle' });
    // the peek: at each inside door, leaning out from behind the near jamb toward a player down the hall (nights.js SCARES.peek's own
    // placement, which now asks fits('peek') first: a door where it does not fit is skipped by the scare)
    for (const [name, px, pz] of [['kid', 7.0, -0.42], ['bath', 8.5, -0.42], ['room2', 8.5, -0.42], ['spare', 7.0, -0.42], ['parents', 1.0, -0.6]]) pose(`peek at the ${name} door`, () => {
      const d = W.doors[name], m = d.mid; camera.position.set(px, 1.32, pz);
      let ax = m.x - d.hx, az = m.z - d.hz; const al = Math.hypot(ax, az) || 1; ax /= al; az /= al; if (ax * (px - m.x) + az * (pz - m.z) < 0) { ax = -ax; az = -az; }
      let nx = -az, nz = ax; if (nx * (m.x - px) + nz * (m.z - pz) < 0) { nx = -nx; nz = -nz; }
      const x = m.x + nx * 0.28 + ax * 0.6, z = m.z + nz * 0.28 + az * 0.6;
      E.root.scale.setScalar(0.72); E.root.position.set(x, 0, z); E.faceTowards(x - nx * 3, z - nz * 3, 1);
      const ry = E.root.rotation.y, lx = Math.cos(ry), lz = -Math.sin(ry); E.leanSide = ((-ax) * lx + (-az) * lz > 0 ? -1 : 1) * 0.85; E.lean = 0.3;
    }, { fitsAs: window.__peekNoFits ? null : 'peek', fitsYaw: 0 });
    // lying on its back on the bottom bunk, knees up under the slats
    // (the bottom bunk's mattress: its top from the bedding the world keeps, its head end at the pillow; the top bunk's slats 1.42 m up)
    pose('lie', () => { camera.position.set(8.5, 1.32, 1.6); const lb = W.lowerBunk, top = lb ? lb.top : 0.527; E.root.position.set(8.66, top, 3.86); E.root.rotation.y = Math.PI / 2; E.mode = 'lie'; }, { skip: (c) => c.id === 'bottom mattress' });
    if (out.lie && out.lie.top + (W.lowerBunk ? W.lowerBunk.top : 0.527) > 1.40) find('poses', 'lie', 'knees', `${(out.lie.top + 0.527).toFixed(3)} m: up into the top bunk's slats (1.42)`, null);
    // sitting at the kitchen table
    pose('sit', () => { camera.position.set(3.0, 1.32, 3.5); const s = g.sitSpot ? null : null; E.root.position.set(1.9, 0, 2.6); E.faceTowards(1.9, 3.6, 1); E.mode = 'sit'; E.tableH = 0.76; }, { fitsAs: 'sit' });
    // night one's bedside: at the side of the bunk, bent over it, its head kept 0.88 m off your eye under the cloth
    pose('bedside', () => {
      const BS = g.FN.bedside, eye = g.BUNK_LIE.clone(); camera.position.copy(eye);
      E.root.position.set(8.25, 0, 3.08); E.faceTowards(8.38, 4.0, 1); E.lean = 0.95; E.lookTarget = camera.position;
      E.post = BS.post(E); BS.set({ clear: { eye: eye.clone(), r: 0.88 } });
    }, { skip: (c) => /bunk/.test(c.id || '') });
    E.post = null; g.FN.bedside.set({ clear: null });
    pose('finale', () => { camera.position.copy(g.BUNK_SEAT); E.root.position.set(8.81, 0, 2.43); E.faceTowards(8.28, 4.0, 1); E.reach = 0.5; E.smileScale = 1.6; E.tilt = 0.4; }, { fitsAs: 'idle' });
    // (by the bunk the colliders are its footprint for the player, so the scene is checked vertex by vertex, without fits)
    for (const x of [10.3, 10.2, 10.12, 10.06, 10.0]) pose(`paralysis at ${x}`, () => { camera.position.set(8.38, 1.9, 4.0); E.root.position.set(x, 0, 3.6); E.root.rotation.y = -Math.PI / 2; E.tilt = 0.5; });
    // the unfold's five keys, one held frame each
    for (let k = 1; k <= 5; k++) pose(`unfold key ${k}`, () => {
      camera.position.set(3.4, 1.32, -1.6); E.root.position.set(0.9, 0, -1.6); E.faceTowards(3.4, -1.6, 1); E.mode = 'crumple'; E.side = 1; E.snap = 1;
      for (let i = 0; i < 10; i++) E.update(1 / 60); E.mode = 'unfold'; E.unfoldT = 0; for (let i = 0; i < Math.round((k * 0.09 - 0.012) * 60); i++) E.update(1 / 60);
    }, { held: true, fitsAs: 'unfold', fitsYaw: null });
    // the ceiling cling: the crumple turned over onto the hall's ceiling
    pose('cling', () => { camera.position.set(3.1, 1.32, -1.6); E.root.position.set(1.2, 0, -1.6); E.faceTowards(3.1, -1.6, 1); E.mode = 'crumple'; E.side = 1; E.cling = 2.7; }, { ceiling: true, fitsAs: 'crumple' });
    // the crouch (the duck held all the way)
    pose('crouch', () => { camera.position.set(3.1, 1.32, -1.6); E.root.position.set(1.2, 0, -1.6); E.faceTowards(3.1, -1.6, 1); E.duckHold = 1; }, { fitsAs: 'crouch' });
    // the crawl, still, in the hall and in the living room
    pose('crawl in the hall', () => { camera.position.set(9.9, 1.32, -0.42); E.root.position.set(7.2, 0, -0.42); E.faceTowards(9.9, -0.42, 1); E.mode = 'crawl'; E.snap = 1; }, { fitsAs: 'crawl' });
    pose('crawl in the living room', () => { camera.position.set(3.4, 1.32, -1.6); E.root.position.set(0.6, 0, -1.6); E.faceTowards(3.4, -1.6, 1); E.mode = 'crawl'; E.snap = 1; }, { fitsAs: 'crawl' });
    reset(); E.visible = false;
    return out;
  }),
  // ---- the player into it
  player: (page) => page.evaluate(() => {
    const { g, E, W, C, P, F, camera, reset, verts, find, setDoors, DT, V } = window.__ST, out = {};
    setDoors(true);
    const PB = g.PB, things = () => C.bodies.filter((b) => b.kind === 'thing' && (!b.active || b.active()));
    const eyePts = () => { const f = new V(); camera.getWorldDirection(f); const hh = Math.tan(camera.fov * Math.PI / 360), hw = hh * camera.aspect, pts = [camera.position.clone().addScaledVector(f, C.NEAR)]; for (const sx of [-1, 1]) for (const sy of [-1, 1]) pts.push(camera.position.clone().addScaledVector(new V(sx * hw, sy * hh, -1).normalize().applyQuaternion(camera.quaternion), C.NEAR)); return pts; };
    const segD = (p, a, b) => { const ab = b.clone().sub(a), t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / ab.lengthSq())); return a.clone().addScaledVector(ab, t).distanceTo(p); };
    const stand = (x, z, tx, tz) => { P.pos.set(x, W.groundAt(x, z, 0), z); P.vel.set(0, 0, 0); P.mode = 'walk'; P.pod = null; F.cutscene = false; F.dead = false; P.pitch = -0.15; P.yaw = Math.atan2(-(tx - x), -(tz - z)); g.updateCamera(0); };
    const drive = (scene, tx, tz, maxT = 3.5) => {
      let worstBody = 0, worstEye = 9;
      for (let t = 0; t < maxT; t += DT) {
        const dx = tx - P.pos.x, dz = tz - P.pos.z; P.yaw = Math.atan2(-dx, -dz); g.keys.KeyW = true;
        g.input.poll(); g.movePlayer(DT); W.tick(DT); E.update(DT); g.updateCamera(DT);
        for (const b of things()) { const d = Math.hypot(P.pos.x - b.pos.x, P.pos.z - b.pos.z) - (b.r + PB.r); worstBody = Math.min(worstBody, d); if (d < -0.01) find('player', scene, 'body', `${d.toFixed(3)} m into ${b.id}`, [P.pos.x, P.pos.y, P.pos.z]); }
        if (Math.round(t / DT) % 3 === 0) {
          const pts = eyePts(), vs = verts(8);
          for (const [x, y, z, bone] of vs) { const v = new V(x, y, z); for (const p of pts) { const d = segD(v, camera.position, p); worstEye = Math.min(worstEye, d); if (d < 0.02) { find('player', scene, 'eye', `the eye's ray ${d.toFixed(3)} m from its ${bone}`, [x, y, z]); break; } } }
        }
      }
      g.keys.KeyW = false; g.input.poll();
      out[scene] = { body: +worstBody.toFixed(3), eye: +worstEye.toFixed(3), stop: [+P.pos.x.toFixed(2), +P.pos.z.toFixed(2)] };
    };
    const settle = () => { for (let i = 0; i < 40; i++) E.update(DT); };
    reset(); E.root.position.set(7.0, 0, -0.42); E.faceTowards(9.6, -0.42, 1); E.mode = 'crumple'; E.side = 1; settle(); stand(9.6, -0.42, 7.0, -0.42); drive('into the crumple', 7.0, -0.42);
    reset(); E.root.position.set(6.6, 0, -0.42); E.faceTowards(9.6, -0.42, 1); E.mode = 'crawl'; E.snap = 1; settle(); stand(9.6, -0.42, 6.6, -0.42); drive('into the crawl', 6.6, -0.42);
    reset(); { const d = W.doors.kid, m = d.mid; E.root.scale.setScalar(0.72); E.root.position.set(m.x + 0.35, 0, m.z + 0.5); E.faceTowards(m.x - 2, m.z + 0.5, 1); E.leanSide = 0.85; E.lean = 0.3; settle(); stand(9.8, -0.42, m.x, m.z + 0.3); drive('into the peek', m.x + 0.2, m.z + 0.6); }
    reset(); E.root.position.set(1.5, 0, -0.9); E.root.rotation.y = Math.PI / 2; E.mode = 'lie'; settle(); stand(3.6, -0.9, 1.5, -0.9); drive('into it lying on the floor', 1.0, -0.9);
    reset(); { const pod = g.nights.PODS.closet_kid, [nx, nz] = window.__ST.nav.NODES[pod.node]; E.root.position.set(nx, 0, nz); E.faceTowards(pod.look[0], pod.look[1], 1); E.lean = 0.35; E.tilt = 0.3; E.smileScale = 1.35; settle();
      // from inside the closet: the eye at the hiding place's camera, looking out through the louvres
      camera.position.set(...pod.cam); camera.rotation.set(0, pod.yaw, 0); camera.updateMatrixWorld(true);
      const pts = eyePts(); let worst = 9; for (const [x, y, z, bone] of verts(8)) { const v = new V(x, y, z); for (const p of pts) { const d = segD(v, camera.position, p); worst = Math.min(worst, d); if (d < 0.02) find('player', 'the loom at your closet', 'eye', `the eye's ray ${d.toFixed(3)} m from its ${bone}`, [x, y, z]); } }
      out['the loom at your closet'] = { eye: +worst.toFixed(3) }; }
    reset(); E.root.position.set(6.4, 0, -0.42); E.faceTowards(9.6, -0.42, 1); E.sneak = true; settle(); stand(9.6, -0.42, 6.4, -0.42); drive('into the frozen stalk', 6.4, -0.42);
    reset(); E.visible = false; P.pitch = 0;
    return out;
  }),
  // ---- the catch's three frames
  catch: (page) => page.evaluate(() => {
    const { g, E, camera, reset, find, V } = window.__ST, out = {};
    const headVerts = () => { const out = [], v = new V(); E.root.updateMatrixWorld(true); E.root.traverse((o) => { if (!o.isMesh || !o.visible) return; const inHead = o.name === 'creatureHead' || o.name === 'eyes' || o.name === 'teeth'; if (!inHead) return; const Pp = o.geometry.attributes.position; if (o.isSkinnedMesh) o.skeleton.update(); for (let i = 0; i < Pp.count; i += 4) { v.fromBufferAttribute(Pp, i); if (o.isSkinnedMesh) o.applyBoneTransform(i, v); v.applyMatrix4(o.matrixWorld); out.push(v.clone()); } }); return out; };
    for (const [scene, pos, at] of [['in the hall', [7.63, 1.32, -0.42], [9.5, 1.32, -0.42]], ['from the closet', g.nights.PODS.closet_kid.cam, null], ['on the bunk', [8.28, 2.24, 4.0], [8.28, 2.0, 2.0]]]) {
      reset(); camera.position.set(...pos); if (at) camera.lookAt(...at); else camera.rotation.set(0, g.nights.PODS.closet_kid.yaw, 0); camera.updateMatrixWorld(true);
      const f0 = new V(); camera.getWorldDirection(f0); E.root.position.set(pos[0] + f0.x * 1.2, 0, pos[2] + f0.z * 1.2);
      out[scene] = [];
      for (const f of [1, 2, 3]) {
        E.catchPose = { frame: f, cam: camera }; for (let i = 0; i < 3; i++) E.update(1 / 60);
        // how near the face comes to the lens: the nearest point of its head in front of the camera, along the view
        let near = 9; const inv = camera.matrixWorldInverse; camera.updateMatrixWorld(true);
        for (const p of headVerts()) { const c = p.clone().applyMatrix4(inv); if (c.z < 0) near = Math.min(near, -c.z); }
        out[scene].push([f, +near.toFixed(3)]);
        if (f < 3 && near <= camera.near + 0.05) find('catch', `${scene}, frame ${f}`, 'face', `the face ${near.toFixed(3)} m from the lens (near plane ${camera.near})`, null);
        if (f === 3 && near > camera.near) find('catch', `${scene}, frame 3`, 'face', `the face stops ${near.toFixed(3)} m short of the near plane`, null);
      }
    }
    reset(); E.visible = false;
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
  await page.evaluate(() => { const g = window.__game; g.start(); window.__freeze = true; g.setPhase('night', true); g.E.visible = false; g.P.mode = 'walk'; g.mom.group.visible = g.dad.group.visible = false; });
  await page.evaluate(lib);
  const results = {}, t0 = Date.now();
  for (const n of ['dump', 'edges', 'poses', 'player', 'catch']) {
    if (!want(n)) continue;
    const t = Date.now();
    try { results[n] = await STEPS[n](page); } catch (e) { results[n] = { error: String(e && e.message || e).split('\n')[0] }; }
    const found = await page.evaluate(() => window.__ST.findings.length);
    console.log(`step ${n}: ${results[n] && results[n].error ? 'ERROR ' + results[n].error : 'done'}, ${found} findings so far (${((Date.now() - t) / 1000).toFixed(1)} s)`);
  }
  const findings = await page.evaluate(() => window.__ST.findings);
  await browser.close(); server.close();
  for (const n of Object.keys(results)) console.log(`step ${n} ${JSON.stringify(results[n])}`);
  if (errs.length) console.log('page errors:', errs.slice(0, 5).join(' | '));
  for (const f of findings) console.log(`FAIL ${f.step} ${f.scene}: ${f.part} ${f.what}${f.point ? ` at (${f.point.join(', ')})` : ''}`);
  console.log(findings.length ? `${findings.length} findings` : 'clean', `(${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify({ results, findings, errs }, null, 1));
  process.exit(findings.length || errs.length || Object.values(results).some((r) => r && r.error) ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
