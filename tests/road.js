// Road test: the road out front, the silo, the fences, the ditch, the boundary and the cars. The game is loaded headless (window.__norender,
// the loop frozen) and checked in place, then the traffic is driven a frame at a time.
//   node tests/road.js [--port N] [--json out.json]
// The checks:
//   road        no collider, fence, post or pole in x -260..260 x z -34..-27 but the boundary slabs (and the cars' own moving boxes)
//   lanes       both lanes (where a car is drawn) and the car dream's path (z -28.8, x -190..190, with the dream's road showing) meet no
//               collider and no solid mesh
//   ditch       groundAt(0, -36.6) is -0.6, 0 at the ditch's edges, and the ditch's own ground lies on that line (2 cm under it, as the
//               slabs round it do)
//   bases       every model out of doors has its base within 0.05 m of groundAt (less what tests/sunk/*.json allows it), the cars on both
//               lanes included
//   silo        behind the barn at (-74, -14), off the road, clear of the barn's footprint; its pipe's pivot swings along and out, never in;
//               no tree within reach of it
//   fences      the fence down x 40 leaves the road and its ditch open (z -39..-24), both field fences and the gate are solid, no tree
//               stands in a fence line
//   boundary    the invisible walls at x -95 and z -80 (and x 60, z 30)
//   treeline    firs across the road at both ends, behind the last place a car is drawn; gone while the dream drives through
//   palette     no yellow in either car palette (a yellow car would read as the school bus)
//   rain        the rain's roofs are W.rainDiscard's: the house (the kid's room included), the garage, the silo, the truck's box
//   surface     the footsteps on the asphalt, the shoulder and the drive
//   dream       the car dream starts at x -60
//   night       after dark a car that meets the player calls caught({ unseen: true }) with the horn and the skid
//   day         by day a car within 12 m of a player on the asphalt brakes to a stop short of them with its horn, never touching; it
//               drives on once they are off the road
//   stop        traffic.stop(4.7) brings a car to a stop at the mailbox and it drives on after its hold
//   bus         traffic.busHorn() plays the bus's horn at (0, 1.5, -30) and draws nothing
//   beam        the one headlight beam is on the nearest lit car at night and dark by day
//   body        a car standing in the road is a box the player cannot walk into
// Exit 1 when any check fails.
const http = require('http'), fs = require('fs'), path = require('path');
const { Readable } = require('stream');
const ROOT = path.resolve(__dirname, '..');
const serve = require(path.join(ROOT, 'desktop', 'static'));
const ARGV = process.argv.slice(2);
const opt = (k, d) => { const i = ARGV.indexOf(k); return i >= 0 && ARGV[i + 1] ? ARGV[i + 1] : d; };
const PORT = +opt('--port', 10060), JSON_OUT = opt('--json', '');

// the sink allowances, merged as tests/placement.js merges them
const SUNK = {};
{
  const dir = path.join(__dirname, 'sunk');
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
    const rows = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const k in rows) if (!k.startsWith('_')) SUNK[k] = +rows[k] || 0;
  }
}
// the palettes, from the source (cars.js keeps its own list inside createCar)
const hexes = (src, re) => { const m = src.match(re); return m ? [...m[1].matchAll(/0x([0-9a-f]{6})/gi)].map((h) => parseInt(h[1], 16)) : null; };
const PALETTES = {
  traffic: hexes(fs.readFileSync(path.join(ROOT, 'js', 'traffic.js'), 'utf8'), /export const COLORS = \[([^\]]*)\]/),
  cars: hexes(fs.readFileSync(path.join(ROOT, 'js', 'cars.js'), 'utf8'), /const colors = \[([^\]]*)\]/),
};
const yellow = (hex) => {   // hue 40..70 degrees, saturated, not dark: what reads as a school bus
  const r = (hex >> 16 & 255) / 255, g = (hex >> 8 & 255) / 255, b = (hex & 255) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (d < 1e-6) return false;
  const s = d / (1 - Math.abs(2 * l - 1)); let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360;
  return h >= 40 && h <= 70 && s > 0.35 && l > 0.25;
};
const MAIN = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');

function inPage(SUNK) {
  const g = window.__game, W = g.W, tr = g.traffic, P = g.P, F = g.F;
  return Promise.all([import('three'), import('/js/world.js'), import('/js/traffic.js'), import('/js/props.js')]).then(([THREE, Wm, T, props]) => Promise.all(['fir1', 'fir2', 'fir1_far', 'fir2_far', 'maple', 'tree_bare', 'grass1', 'grass2', 'shrub'].map((n) => props.loadProp(n).then((m) => [n, m]))).then((treeModels) => {
    const res = {}, V3 = THREE.Vector3;
    const ok = (name, pass, detail) => { res[name] = { pass: !!pass, detail }; };
    const ROAD = { x0: -260, x1: 260, z0: -34, z1: -27 };
    const hit = (b, r) => b.maxX > r.x0 && b.minX < r.x1 && b.maxZ > r.z0 && b.minZ < r.z1;
    const live = (c) => c.on !== false;
    const trafficRoot = tr.root, dreamCar = g.car.group;
    g.scene.updateMatrixWorld(true);
    const vis = (o) => { for (let n = o; n; n = n.parent) if (!n.visible) return false; return true; };
    const under = (o, roots) => { for (let n = o; n; n = n.parent) if (roots.includes(n)) return true; return false; };
    const nameOf = (o) => { for (let n = o, i = 0; n && i < 6; n = n.parent, i++) { const t = (n.userData && (n.userData.tag || n.userData.prop || n.userData.car)) || n.name; if (t && !/^(Scene|Group|Object3D)$/.test(t)) return t; } const m = [].concat(o.material)[0]; return 'mesh:' + (m && (m.name || m.type)); };
    const solidMat = (o) => [].concat(o.material).every((m) => m && m.opacity > 0.05 && m.blending !== THREE.AdditiveBlending && !(m.transparent && m.depthWrite === false));
    // every solid thing standing up out of the ground in the world, as world boxes (an instanced mesh: one box per copy)
    const things = (skip = []) => {
      const out = [], box = new THREE.Box3(), m4 = new THREE.Matrix4();
      g.scene.traverse((o) => {
        if (!o.isMesh || o.isSprite || !vis(o) || under(o, [trafficRoot, dreamCar, g.E.root, g.mom.group, g.dad.group, g.camera, ...skip]) || !solidMat(o)) return;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        const add = (b, i) => { if (b.max.y < 0.05) return; if (b.max.x - b.min.x > 200 || b.max.z - b.min.z > 200) return; out.push({ o, i, name: nameOf(o), minX: b.min.x, maxX: b.max.x, minY: b.min.y, maxY: b.max.y, minZ: b.min.z, maxZ: b.max.z }); };   // the ground, the field and the wire's span are not things on the road
        if (o.isInstancedMesh) { for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m4); m4.premultiply(o.matrixWorld); add(box.copy(o.geometry.boundingBox).applyMatrix4(m4), i); } }
        else add(box.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld), -1);
      });
      return out;
    };
    // a plant's copy (a tree, a tuft, a shrub) is tested by its own vertices, not its box: does any of them lie inside the volume
    const v0 = new V3(), mv = new THREE.Matrix4();
    const plantIn = (t, r, y0, y1) => {
      const p = t.o.geometry.attributes.position; if (t.i >= 0) { t.o.getMatrixAt(t.i, mv); mv.premultiply(t.o.matrixWorld); } else mv.copy(t.o.matrixWorld);
      for (let k = 0; k < p.count; k++) { v0.fromBufferAttribute(p, k).applyMatrix4(mv); if (v0.x > r.x0 && v0.x < r.x1 && v0.z > r.z0 && v0.z < r.z1 && v0.y > y0 && v0.y < y1) return true; }
      return false;
    };
    // the trees' copies as world boxes: every instanced mesh that draws one of the tree models (scatter shares the model's own geometry);
    // trunk: the copy's mesh is the model's narrowest (its trunk, not its crown)
    const treeBoxes = [], plantGeos = new Set();
    {
      const geos = new Map();
      for (const [name, g0] of treeModels) { g0.scene.traverse((o) => { if (o.isMesh) plantGeos.add(o.geometry); }); if (!/fir|maple|tree/.test(name)) continue; let narrow = null, w = Infinity; g0.scene.traverse((o) => { if (!o.isMesh) return; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox, s = Math.max(b.max.x - b.min.x, b.max.z - b.min.z); if (s < w) { w = s; narrow = o.geometry; } }); g0.scene.traverse((o) => { if (o.isMesh) geos.set(o.geometry, { name, trunk: o.geometry === narrow }); }); }
      const box = new THREE.Box3(), m4 = new THREE.Matrix4();
      g.scene.traverse((o) => {
        if (!o.isInstancedMesh || !geos.has(o.geometry) || !vis(o)) return;
        const t = geos.get(o.geometry); if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m4); m4.premultiply(o.matrixWorld); box.copy(o.geometry.boundingBox).applyMatrix4(m4); treeBoxes.push({ name: t.name, trunk: t.trunk, minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z, minY: box.min.y, maxY: box.max.y }); }
      });
    }
    // ---- road: colliders, fences, posts and poles off the asphalt ----
    {
      const cols = W.colliders.filter((c) => live(c) && c.id !== 'boundary' && c.id !== 'car' && hit(c, ROAD)).map((c) => `${c.id || 'collider'} x ${c.minX.toFixed(2)}..${c.maxX.toFixed(2)} z ${c.minZ.toFixed(2)}..${c.maxZ.toFixed(2)}`);
      const meshes = things([W.roadEnds.trees]).filter((b) => hit(b, ROAD) && b.minY < 2.5 && (!plantGeos.has(b.o.geometry) || plantIn(b, ROAD, 0.03, 2.5))).map((b) => `${b.name} x ${b.minX.toFixed(2)}..${b.maxX.toFixed(2)} z ${b.minZ.toFixed(2)}..${b.maxZ.toFixed(2)}`);
      ok('road', !cols.length && !meshes.length, { colliders: cols, meshes: meshes.slice(0, 12), boundary: W.colliders.filter((c) => c.id === 'boundary' && hit(c, ROAD)).length });
    }
    // ---- lanes and the dream's path ----
    {
      const SHOW = T.SHOW, lanes = [['near lane', W.ROAD.lanes.near, -SHOW, SHOW], ['far lane', W.ROAD.lanes.far, -SHOW, SHOW]];
      const vol = (z, x0, x1) => ({ x0, x1, z0: z - 1.05, z1: z + 1.05 });
      const probe = (label, z, x0, x1) => {
        const r = vol(z, x0, x1);
        const cols = W.colliders.filter((c) => live(c) && c.id !== 'boundary' && c.id !== 'car' && hit(c, r)).map((c) => `${c.id || 'collider'} x ${c.minX.toFixed(1)} z ${c.minZ.toFixed(1)}`);
        const meshes = things().filter((b) => hit(b, r) && b.minY < 1.9 && (!plantGeos.has(b.o.geometry) || plantIn(b, r, 0.03, 1.9))).map((b) => `${b.name} x ${b.minX.toFixed(1)}..${b.maxX.toFixed(1)} z ${b.minZ.toFixed(1)}..${b.maxZ.toFixed(1)}`);
        return { label, colliders: cols, meshes: meshes.slice(0, 10), n: cols.length + meshes.length };
      };
      const out = lanes.map(([l, z, a, b]) => probe(l, z, a, b));
      W.roadEnds.dream(true); g.scene.updateMatrixWorld(true);
      out.push(probe('dream path', -28.8, -190, 190));
      W.roadEnds.dream(false);
      ok('lanes', out.every((o) => o.n === 0), out);
    }
    // ---- the ditch ----
    {
      const at = (z) => +W.groundAt(0, z).toFixed(3), samples = { '-36.6': at(-36.6), '-37.95': at(-37.95), '-35.25': at(-35.25), '-37.25': at(-37.25), '-36.0': at(-36.0) };
      // the ditch's own ground: its strips' vertices lie on groundAt (2 cm under, as the slabs; the mud 6 mm over the grass)
      const off = [], strips = []; W.yard.traverse((o) => { if (o.isMesh && o.userData.tag === 'ditch') strips.push(o); });
      for (const o of strips) { const p = o.geometry.attributes.position, lift = o.material === W.M.dirt ? 0.006 : 0; for (let k = 0; k < p.count; k++) { const want = W.groundAt(p.getX(k) * 0.5, p.getZ(k)) - 0.02 + lift; if (Math.abs(p.getY(k) - want) > 0.002) off.push([p.getX(k), p.getZ(k), +p.getY(k).toFixed(3), +want.toFixed(3)]); } }
      if (strips.length !== 2) off.push(`${strips.length} ditch strips`);
      ok('ditch', Math.abs(samples['-36.6'] + 0.6) < 0.01 && Math.abs(samples['-37.95']) < 0.01 && Math.abs(samples['-35.25']) < 0.01 && !off.length, { samples, off: off.slice(0, 8) });
    }
    // ---- bases of the models out of doors, and of the cars on both lanes ----
    {
      const bad = [], seen = [];
      g.scene.traverse((o) => {
        if (!o.userData || !o.userData.prop || !o.children.length || !vis(o)) return;
        const b = new THREE.Box3().setFromObject(o); if (b.isEmpty()) return;
        const c = b.getCenter(new V3()); if (Wm.roomAt(c.x, c.z, b.min.y) !== 'out') return;
        const gr = W.groundAt(c.x, c.z, b.min.y), sunk = SUNK[o.userData.prop] || 0, d = b.min.y - gr;
        seen.push(o.userData.prop);
        if (d > 0.05 || d < -0.05 - sunk) bad.push(`${o.userData.prop} (${c.x.toFixed(1)}, ${c.z.toFixed(1)}): base ${b.min.y.toFixed(3)} vs ground ${gr.toFixed(3)}${sunk ? ` (sunk ${sunk})` : ''}`);
      });
      // the cars: each model on each lane, its lowest vertex against the ground under it
      const v = new V3(), cars = [];
      for (const c of tr.cars) for (const dir of [1, -1]) {
        c.on = true; c.dir = dir; c.z = dir > 0 ? W.ROAD.lanes.near : W.ROAD.lanes.far; c.x = -30 + cars.length * 5; c.g.position.set(c.x, 0, c.z); c.g.rotation.y = dir > 0 ? 0 : Math.PI; c.g.updateMatrixWorld(true);
        let lo = Infinity; c.g.traverse((o) => { if (!o.isMesh || o.isSprite) return; const p = o.geometry.attributes.position; for (let i = 0; i < p.count; i += 1) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); if (v.y < lo) lo = v.y; } });
        const gr = W.groundAt(c.x, c.z), d = lo - gr; cars.push(`${c.model} ${dir > 0 ? 'near' : 'far'} ${d.toFixed(3)}`);
        if (Math.abs(d) > 0.05) bad.push(`${c.model} on the ${dir > 0 ? 'near' : 'far'} lane: tyres ${lo.toFixed(3)} vs road ${gr.toFixed(3)}`);
        c.on = false; c.g.visible = false;
      }
      ok('bases', !bad.length && tr.cars.length === 6, { bad, models: [...new Set(seen)], cars });
    }
    // ---- the silo ----
    {
      const s = W.silo, barn = W.colliders.find((c) => c.id === 'barnBlock'), col = W.colliders.find((c) => c.id === 'silo' || (c.minX < -74 && c.maxX > -74 && c.minZ < -14 && c.maxZ > -14 && c.id !== 'boundary'));
      const pivot = s && s.chute, before = pivot ? [pivot.rotation.x, pivot.rotation.z] : null;
      let swingOk = false;
      if (s) {
        // swung along the wall and out from it, the pipe's foot stays further from the silo's axis than the wall and its hoops
        const foot = () => { pivot.updateMatrixWorld(true); const p = new V3(0, -s.pipeLength, 0).applyMatrix4(pivot.matrixWorld); return Math.hypot(p.x - s.pos.x, p.z - s.pos.z); };
        const r0 = foot(); s.swing(0.45, 0); const r1 = foot(); s.swing(-0.45, 0); const r2 = foot(); s.swing(0, 0.5); const r3 = foot(); s.swing(0, -1); const r4 = foot(); s.swing(5, 5);
        const clamped = Math.abs(pivot.rotation.z) <= 0.45 + 1e-9 && pivot.rotation.x >= -0.5 - 1e-9 && pivot.rotation.x <= 0;
        s.swing(0, 0); swingOk = [r0, r1, r2, r3, r4].every((r) => r > s.r + 0.12) && r3 > r0 && Math.abs(r4 - r0) < 1e-6 && clamped;
        res.siloSwing = { r0, r1, r2, r3, r4, clamped };
      }
      // trees: no fir, maple or dead tree whose copy (trunk or crown) reaches the staves
      const near = treeBoxes.filter((b) => { const dx = Math.max(b.minX - -74, 0, -74 - b.maxX), dz = Math.max(b.minZ - -14, 0, -14 - b.maxZ); return Math.hypot(dx, dz) < 2.3 + 0.05; }).map((b) => [+((b.minX + b.maxX) / 2).toFixed(1), +((b.minZ + b.maxZ) / 2).toFixed(1)]);
      const offRoad = col && !(col.maxZ > -34 && col.minZ < -27), clearBarn = col && barn && (col.maxX < barn.minX || col.minX > barn.maxX || col.maxZ < barn.minZ || col.minZ > barn.maxZ);
      ok('silo', s && Math.abs(s.pos.x + 74) < 0.01 && Math.abs(s.pos.z + 14) < 0.01 && offRoad && clearBarn && swingOk && col.maxY >= 12 && !near.length && before, { pos: s && [s.pos.x, s.pos.z], col: col && [col.minX, col.maxX, col.minZ, col.maxZ, col.maxY], barn: barn && [barn.minX, barn.maxX, barn.minZ, barn.maxZ], swing: res.siloSwing, trees: near.slice(0, 6) });
      delete res.siloSwing;
    }
    // ---- the field fences, the gap for the road, the gate; no tree in a fence line ----
    {
      const posts = [], m4 = new THREE.Matrix4(), p = new V3();
      W.yard.traverse((o) => { if (o.isInstancedMesh && o.userData.tag === 'fieldFence') for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m4); p.setFromMatrixPosition(m4); posts.push([p.x, p.z]); } });
      const inGap = posts.filter(([x, z]) => Math.abs(x - 40) < 0.2 && z > -38.5 && z < -24.5);
      const sol = W.colliders.filter((c) => c.id === 'fieldFence');
      const blocks = (x, z) => sol.some((c) => x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ);
      const solidOk = blocks(0, -48) && blocks(-59, -48) && blocks(40, -45) && blocks(40, 0) && blocks(40.2, -22) && !blocks(40, -30) && !blocks(40, -36.6);
      // no tree in a fence line or the gate: none of a tree copy's vertices under the top rail within 0.1 m of the line between its posts
      const lines = [{ x0: -60.1, x1: 60.1, z0: -48.1, z1: -47.9 }, { x0: 39.9, x1: 40.1, z0: -48, z1: -39 }, { x0: 39.9, x1: 40.3, z0: -24, z1: 20 }];
      const tufts = new Set(); for (const [name, g0] of treeModels) if (/grass/.test(name)) g0.scene.traverse((o) => { if (o.isMesh) tufts.add(o.geometry); });   // the grass grows under the bottom rail, round the posts' feet
      const trees = things().filter((b) => plantGeos.has(b.o.geometry) && lines.some((l) => hit(b, l) && plantIn(b, l, tufts.has(b.o.geometry) ? 0.5 : -0.1, 1.4))).map((b) => `${b.name} (${((b.minX + b.maxX) / 2).toFixed(1)}, ${((b.minZ + b.maxZ) / 2).toFixed(1)})`);
      ok('fences', posts.length > 40 && !inGap.length && solidOk && !trees.length, { posts: posts.length, inGap, solidOk, trees: trees.slice(0, 6) });
    }
    // ---- the boundary ----
    {
      const b = W.colliders.filter((c) => c.id === 'boundary');
      const has = (x0, x1, z0, z1) => b.some((c) => Math.abs(c.minX - x0) < 0.01 && Math.abs(c.maxX - x1) < 0.01 && Math.abs(c.minZ - z0) < 0.01 && Math.abs(c.maxZ - z1) < 0.01);
      ok('boundary', b.length === 4 && has(-97, -95, -82, 32) && has(-95, 60, -82, -80) && has(-95, 60, 30, 32) && has(60, 62, -82, 32), b.map((c) => [c.minX, c.maxX, c.minZ, c.maxZ]));
    }
    // ---- the treeline across the road at both ends ----
    {
      const E = W.roadEnds, m4 = new THREE.Matrix4(), p = new V3(), across = { '-1': 0, 1: 0 }; let first = Infinity;
      E.trees.traverse((o) => { if (o.isInstancedMesh) for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m4); p.setFromMatrixPosition(m4); if (p.z > -34 && p.z < -27) across[Math.sign(p.x)]++; first = Math.min(first, Math.abs(p.x)); } });
      const shown = E.trees.visible && !E.far.visible;
      g.car.road = true; g.car.show(true); const dreaming = !E.trees.visible && E.far.visible; g.car.show(false); g.car.road = false;
      const back = E.trees.visible && !E.far.visible;
      ok('treeline', across['-1'] >= 3 && across[1] >= 3 && first > T.SHOW + 2 && T.EDGE > first + 20 && shown && dreaming && back, { across, first: +first.toFixed(1), SHOW: T.SHOW, EDGE: T.EDGE, shown, dreaming, back });
    }
    // ---- the rain's roofs ----
    {
      const roofs = g.weather.roofs(), ids = W.rainDiscard.map((b) => b.id);
      const under = (x, y, z) => roofs.some((r) => x > r.lo[0] && y > r.lo[1] && z > r.lo[2] && x < r.hi[0] && y < r.hi[1] && z < r.hi[2]);
      ok('rain', ['house', 'garage', 'silo', 'truck'].every((k) => ids.includes(k)) && roofs.length === W.rainDiscard.length && under(10, 1.5, 2) && under(2.3, 1.8, -16) && under(-74, 6, -14) && !under(2.3, 1.5, -24) && !under(0, 1, -30), { ids, n: roofs.length });
    }
    // ---- the footsteps' surfaces ----
    {
      const heard = [], fs0 = g.sfx.footstep;
      g.sfx.footstep = (gain, pan, wet, surface) => { heard.push(surface); };
      const step = (x, z) => { P.mode = 'walk'; P.pos.set(x, W.groundAt(x, z), z); P.vel.set(0, 0, 0); P.stepAcc = 9; g.movePlayer(1 / 60); return heard[heard.length - 1]; };
      const got = { asphalt: step(-10, -30.5), shoulderNear: step(-10, -26.7), shoulderFar: step(-10, -34.5), apron: step(1.0, -26.8), drive: step(2.3, -24), ditch: step(-10, -36.6), lawn: step(-18, 10) };
      g.sfx.footstep = fs0;
      ok('surface', got.asphalt === 'asphalt' && got.shoulderNear === 'gravel' && got.shoulderFar === 'gravel' && got.apron === 'gravel' && got.drive === 'gravel' && got.ditch === 'grass' && got.lawn === 'grass', got);
    }

    // ---- the traffic, driven a frame at a time ----
    const DT = 1 / 60, calls = [], picks = [];
    const horn0 = g.sfx.carHorn, pick0 = g.sfx.pick;
    g.sfx.carHorn = function (o = {}) { calls.push({ bus: !!o.bus, at: o.at ? [o.at.x, o.at.y, o.at.z] : null }); return horn0.call(this, o); };
    g.sfx.pick = function (key, o = {}) { picks.push({ key, at: o.at ? [o.at.x, o.at.y, o.at.z] : null }); return pick0.call(this, key, o); };
    let caughtWith = [], notes = [];
    tr.bind({ caught: (o) => { caughtWith.push(o); }, note: (t) => notes.push(t) });
    tr.next = 1e9;   // no ordinary cars while these run
    const clear = () => { for (const c of tr.cars) { c.on = false; c.g.visible = false; c.park = null; c.state = 'gone'; if (c.col) c.col.on = false; } };
    const R = 0.28, touching = (c) => { const dx = Math.max(Math.abs(P.pos.x - c.x) - c.hl, 0), dz = Math.max(Math.abs(P.pos.z - c.z) - c.hw, 0); return dx * dx + dz * dz < R * R; };
    const stand = (x, z) => { P.mode = 'walk'; F.dead = false; P.pos.set(x, 0, z); P.vel.set(0, 0, 0); };
    // night: the car that meets you
    {
      g.setPhase('night', true); clear(); calls.length = picks.length = 0; caughtWith = []; notes = [];
      stand(0, W.ROAD.lanes.near); tr.update(DT, 'night');
      const c = tr.one(1, { x: -40, v: 14 }); let frames = 0, overlapAtCall = null;
      for (; frames < 600 && !caughtWith.length; frames++) { tr.update(DT, 'night'); if (caughtWith.length) overlapAtCall = touching(c); }
      const horn = calls.some((k) => !k.bus), skid = picks.some((k) => k.key === 'skid' && k.at);
      ok('night', c && caughtWith.length >= 1 && caughtWith[0].unseen === true && overlapAtCall && horn && skid && notes.includes('I was on the road.'), { frames, caught: caughtWith[0], overlapAtCall, horn, skid, notes });
      caughtWith = [];
    }
    // day: it brakes, horns and never touches; then drives on
    {
      g.setPhase('day', true); clear(); calls.length = picks.length = 0;
      const braked0 = tr.braked || 0, heardBrake = []; const off = tr.onBrake((e) => heardBrake.push(e));
      const tries = [];
      for (const [dir, x0, v] of [[1, -60, 16], [-1, 60, 15], [1, -18, 15]]) {   // from far, from the other end, and from close (a hard stop)
        clear(); stand(0, dir > 0 ? W.ROAD.lanes.near : W.ROAD.lanes.far); calls.length = 0;
        const c = tr.one(dir, { x: x0, v }); let touched = false, stoppedAt = null;
        for (let f = 0; f < 900; f++) { tr.update(DT, 'day'); if (touching(c)) touched = true; if (c.v < 0.01 && c.state === 'held' && stoppedAt === null) stoppedAt = (P.pos.x - c.x) * c.dir - c.hl - R; }
        const held = c.state === 'held';
        // off the road: it goes on, past where they stood
        P.pos.z = -24; let gone = false; for (let f = 0; f < 900 && !gone; f++) { tr.update(DT, 'day'); if ((c.x - 0) * c.dir > 8) gone = true; }
        tries.push({ dir, x0, touched, held, stoppedAt: stoppedAt === null ? null : +stoppedAt.toFixed(2), horn: calls.filter((k) => !k.bus).length, drove: gone });
      }
      off();
      ok('day', tries.every((t) => !t.touched && t.held && t.stoppedAt !== null && t.stoppedAt > 0.2 && t.horn >= 1 && t.drove) && (tr.braked || 0) - braked0 === 3 && heardBrake.length === 3 && !caughtWith.length, { tries, braked: (tr.braked || 0) - braked0, listeners: heardBrake.length });
    }
    // stop(x): a car stops at the mailbox, idles, drives on
    {
      g.setPhase('day', true); clear(); stand(2.3, -12);
      const h = tr.stop(4.7, { hold: 2 }); let f = 0, at = null;
      for (; f < 2400 && h && h.state !== 'stopped'; f++) tr.update(DT, 'day');
      if (h && h.state === 'stopped') at = +h.car.x.toFixed(3);
      const lane = h && h.car.z;
      let held = 0; while (h && h.state === 'stopped' && held < 600) { tr.update(DT, 'day'); held++; }
      let moved = false; for (let k = 0; k < 600 && h && !moved; k++) { tr.update(DT, 'day'); if (h.car.x > 4.7 + 3) moved = true; }
      ok('stop', h && at !== null && Math.abs(at - 4.7) < 0.15 && lane === W.ROAD.lanes.near && Math.abs(held * DT - 2) < 0.1 && moved, { frames: f, at, lane, held: +(held * DT).toFixed(2), moved, model: h && h.car.model });
    }
    // the bus: heard, never drawn
    {
      clear(); calls.length = 0; let n0 = 0; g.scene.traverse(() => n0++);
      const at = tr.busHorn(); let n1 = 0; g.scene.traverse(() => n1++);
      const c = calls[calls.length - 1], drawn = tr.cars.some((k) => k.on);
      ok('bus', c && c.bus && c.at && Math.abs(c.at[0]) < 1e-6 && Math.abs(c.at[1] - 1.5) < 1e-6 && Math.abs(c.at[2] + 30) < 1e-6 && n0 === n1 && !drawn, { call: c, objects: [n0, n1], drawn });
    }
    // the beam: on the nearest lit car at night, dark by day (and none on a phone)
    {
      g.setPhase('night', true); clear(); stand(2.3, -12);
      const c = tr.one(1, { x: -10, v: 0.01 }); c.v0 = 0.01; tr.update(DT, 'night');
      const b = tr.beam, night = b ? b.intensity : null, onCar = b ? Math.abs(b.position.x - (c.x + c.fit.front - 0.1)) < 0.3 && Math.abs(b.position.z - c.z) < 0.01 : null, ahead = b ? (b.target.position.x - b.position.x) > 5 : null;
      g.setPhase('day', true); tr.update(DT, 'day'); const day = b ? b.intensity : null;
      ok('beam', !b || (night > 0 && onCar && ahead && day === 0 && b.castShadow === false && b.distance === 35 && Math.abs(b.angle - 0.5) < 1e-6), { night, onCar, ahead, day });
    }
    // a car standing in the road is a box you cannot walk into
    {
      g.setPhase('day', true); clear();
      const c = tr.one(1, { x: 6, v: 0.01 }); c.v0 = 0; stand(-20, -24); tr.update(DT, 'day');
      P.pos.set(6, 0, c.z + 0.2); g.resolvePlayer(); const inside = touching(c) || (Math.abs(P.pos.x - c.x) < c.hl && Math.abs(P.pos.z - c.z) < c.hw);
      clear(); tr.update(DT, 'day'); P.pos.set(6, 0, W.ROAD.lanes.near + 0.2); g.resolvePlayer(); const freeAfter = Math.hypot(P.pos.x - 6, P.pos.z - (W.ROAD.lanes.near + 0.2)) < 1e-6;
      ok('body', !inside && freeAfter, { pushedTo: [+P.pos.x.toFixed(2), +P.pos.z.toFixed(2)], freeAfter });
    }
    g.sfx.carHorn = horn0; g.sfx.pick = pick0; clear();
    return res;
  }));
}

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
  const errs = [], failed = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('requestfailed', (r) => failed.push(r.url()));
  page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
  await page.addInitScript(() => { window.__norender = true; });
  await page.goto(`http://127.0.0.1:${PORT}/index.html#shot`, { waitUntil: 'load', timeout: 300e3 });
  await page.waitForFunction(() => window.__game && document.getElementById('loading').classList.contains('done'), null, { timeout: 400e3, polling: 500 });
  await page.waitForLoadState('networkidle', { timeout: 120e3 }).catch(() => {});
  await page.waitForFunction(() => { let n = 0; window.__game.scene.traverse((o) => { if (o.userData && o.userData.prop && !o.children.length) n++; }); return n === 0 && window.__game.traffic.cars.length > 0; }, null, { timeout: 120e3, polling: 500 }).catch(() => {});
  await page.evaluate(() => { const g = window.__game; g.start(); window.__freeze = true; g.E.visible = false; g.P.mode = 'walk'; });
  const res = await page.evaluate(inPage, SUNK);
  await browser.close(); server.close();
  // the checks that read the source
  res.palette = { pass: !!(PALETTES.traffic && PALETTES.cars) && ![...PALETTES.traffic, ...PALETTES.cars].some(yellow) && PALETTES.traffic.length >= 7 && PALETTES.cars.length >= 7, detail: { traffic: PALETTES.traffic && PALETTES.traffic.map((h) => h.toString(16)), cars: PALETTES.cars && PALETTES.cars.map((h) => h.toString(16)), yellow: [...(PALETTES.traffic || []), ...(PALETTES.cars || [])].filter(yellow).map((h) => h.toString(16)) } };
  { const m = MAIN.match(/async function carDream\(\) \{[\s\S]*?carDriveIn\(\{ road: true, x: (-?[\d.]+), z: (-?[\d.]+)/); res.dream = { pass: !!m && +m[1] === -60 && +m[2] === -28.8, detail: m ? { x: +m[1], z: +m[2] } : 'carDream has no road start' }; }
  res.load = { pass: !errs.length && !failed.length, detail: { errors: errs.slice(0, 5), failed: failed.slice(0, 5) } };
  let fails = 0;
  for (const [k, v] of Object.entries(res)) { if (!v.pass) fails++; console.log(`${v.pass ? 'ok  ' : 'FAIL'} ${k.padEnd(9)} ${JSON.stringify(v.detail)}`); }
  console.log(fails ? `${fails} failing` : 'clean');
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(res, null, 1));
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
