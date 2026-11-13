// What the house hides of the outside. From inside a room the yard, the trees, the road and the barn can only be seen through a window, an
// outside door, or a way into another room that has one, and only in the part of the view those openings cover. Found from your room
// through the open ways whose openings are in the view (each opening's rectangle on the screen, cut down by the ones before it on the
// way), the meshes that lie wholly outside the house and outside every one of those rectangles are left out of that one draw. Most of
// the triangles the game draws are out there: a room with its door shut or its window behind you draws a fraction of what it did, and
// the hall draws the trees in the living room's window and not the rest of the property behind the walls.
//
// It only ever leaves out what the walls hide, and when unsure it draws: the camera outside a room, near a wall, below the floor or up
// in the roof, any outside door (they have glass or a gap round the leaf), a door open the least bit, all count as ways out. Only the game's
// own camera is culled: the shadow maps (an unseen tree still throws its shadow through a window), the bathroom mirror, the dark window's
// reflection and any other camera see everything. A mesh is hidden just for the scene's own pass through the scene graph and shown again
// before the shadow maps and the draws, so nothing that reads `visible` (the game, the raycasts, the gaze checks) ever sees it hidden.
// What a mesh is (outside or not) is worked out again whenever it moves, so a thing carried in from the yard is drawn at once.
import * as THREE from 'three';
import { ROOMS, H, SX, SZ, roomAt } from './world.js';
import { GAPS } from './lights.js';

const NEAR_WALL = 0.25;   // a camera this close to its room's wall line could see past the wall's face at the corners of the near plane
const MARGIN = 0.6;       // a mesh this close to a room's rectangle (eaves, sills, trim, the porch) counts as part of the house
const ROOF_Y = H + 0.25;  // above the ceilings: the roof and chimney, seen only from outside

export function createCull({ renderer, scene, camera, W }) {
  const self = { enabled: true, stats: { hidden: 0, outside: false, at: null } };
  const rooms = Object.entries(ROOMS);
  let ways = null, list = [], frame = 0, hidden = [];
  const pm = new THREE.Matrix4(), tmp = new THREE.Box3();

  // the ways between the rooms and out of them: [roomA, roomB, box, open()] with 'out' for anything that is not a room
  const room = (x, y, z) => { const k = roomAt(x, z, y); return k in ROOMS ? k : 'out'; };
  function build() {
    const w = [];
    const sides = (x, y, z, alongX) => [room(x + (alongX ? 0 : 0.35), y, z + (alongX ? 0.35 : 0)), room(x - (alongX ? 0 : 0.35), y, z - (alongX ? 0.35 : 0))];
    for (const k in W.doors) {
      const d = W.doors[k], c = d.col, alongX = c.maxX - c.minX > c.maxZ - c.minZ, y0 = d.y0 || 0;
      const [a, b] = sides(d.mid.x, y0 + 1, d.mid.z, alongX);
      if (a === b) continue;
      const always = a === 'out' || b === 'out' || d.slide;   // a way out (the back door's glass, the gap round a shut leaf) and the barn door, which hangs off its wall: always open
      w.push([a, b, new THREE.Box3(new THREE.Vector3(c.minX - 0.15, y0 - 0.05, c.minZ - 0.15), new THREE.Vector3(c.maxX + 0.15, y0 + 2.3, c.maxZ + 0.15)), always ? () => true : () => d.a > 0.002 || d.target > 0]);
    }
    for (const g of GAPS) {   // the openings that are always there
      if (g.door) continue;
      let b;
      if (g.c !== undefined) b = [SX(g.c) - g.w / 2, SZ(g.z) - 0.15, SX(g.c) + g.w / 2, SZ(g.z) + 0.15];
      else if (Array.isArray(g.x)) b = [SX(g.x[0]), SZ(g.z) - 0.15, SX(g.x[1]), SZ(g.z) + 0.15];
      else b = [SX(g.x) - 0.15, SZ(g.z[0]), SX(g.x) + 0.15, SZ(g.z[1])];
      w.push([g.rooms[0], g.rooms[1], new THREE.Box3(new THREE.Vector3(b[0] - 0.1, -0.05, b[1] - 0.1), new THREE.Vector3(b[2] + 0.1, H + 0.05, b[3] + 0.1)), () => true]);
    }
    for (const win of W.windows || []) {
      if (!win.pane) continue;
      const bx = new THREE.Box3().setFromObject(win.pane).expandByScalar(0.15), p = bx.getCenter(new THREE.Vector3());
      const [a, b] = sides(p.x, p.y, p.z, win.alongX);
      if (a !== b) w.push([a, b, bx, () => true]);
    }
    return w;
  }

  // The part of the view each way out can be seen through: from your room, through every open way whose opening is in the view, the
  // screen rectangle that the opening's box covers, cut down by the rectangles of the ways before it (what can be seen through a doorway
  // and then a window is inside both). null: the camera is not surely in a room clear of its walls, so everything is drawn. Otherwise the
  // rectangles (in the view's -1..1 coordinates) the outside can show in; none, and nothing outside can be in the picture.
  const FULL = [-1, 1, -1, 1], corner = new THREE.Vector3();
  const view = new THREE.Frustum();
  function rectOf(bx, cam) {
    if (!view.intersectsBox(bx)) return null;   // not in the view at all
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < 8; i++) {
      corner.set(i & 1 ? bx.max.x : bx.min.x, i & 2 ? bx.max.y : bx.min.y, i & 4 ? bx.max.z : bx.min.z).applyMatrix4(cam.matrixWorldInverse);
      if (corner.z > -cam.near) return FULL;   // a corner at or behind the lens: the whole view
      corner.applyMatrix4(cam.projectionMatrix);
      x0 = Math.min(x0, corner.x); x1 = Math.max(x1, corner.x); y0 = Math.min(y0, corner.y); y1 = Math.max(y1, corner.y);
    }
    return [x0 - 0.01, x1 + 0.01, y0 - 0.01, y1 + 0.01];
  }
  const cut = (a, b) => { const r = [Math.max(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.min(a[3], b[3])]; return r[0] < r[1] && r[2] < r[3] ? r : null; };
  const inside = (a, b) => a[0] >= b[0] && a[1] <= b[1] && a[2] >= b[2] && a[3] <= b[3];
  function outsideRects(cam) {
    const p = cam.position, k = room(p.x, p.y, p.z);
    if (k === 'out' || p.y < 0.02 || p.y > H - 0.05) return null;
    const r = ROOMS[k];
    if (p.x - r[0] < NEAR_WALL || r[1] - p.x < NEAR_WALL || p.z - r[2] < NEAR_WALL || r[3] - p.z < NEAR_WALL) return null;
    pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); view.setFromProjectionMatrix(pm);
    const rect = ways.map((w) => w[3]() ? rectOf(w[2], cam) : null), seen = { [k]: [FULL] }, out = [], q = [[k, FULL]];
    for (let n = 0; q.length; n++) {
      if (n > 400) return null;   // (a guard: never more than a few dozen steps in this house)
      const [cur, cr] = q.pop();
      ways.forEach(([a, b], i) => {
        const nx = a === cur ? b : b === cur ? a : null; if (!nx || !rect[i]) return;
        const nr = cut(cr, rect[i]); if (!nr) return;
        if (nx === 'out') { if (!out.some((o) => inside(nr, o))) out.push(nr); return; }
        const list = seen[nx] || (seen[nx] = []);
        if (list.some((o) => inside(nr, o))) return;   // seen through a wider way already
        list.push(nr); q.push([nx, nr]);
      });
    }
    return out;
  }
  // the view narrowed to a rectangle of it, as a frustum
  const sm4 = new THREE.Matrix4(), frusta = [];
  function frustaFor(rects, cam) {
    while (frusta.length < rects.length) frusta.push(new THREE.Frustum());
    rects.forEach(([x0, x1, y0, y1], i) => {
      sm4.set(2 / (x1 - x0), 0, 0, -(x0 + x1) / (x1 - x0), 0, 2 / (y1 - y0), 0, -(y0 + y1) / (y1 - y0), 0, 0, 1, 0, 0, 0, 0, 1);
      pm.multiplyMatrices(sm4, cam.projectionMatrix).multiply(cam.matrixWorldInverse); frusta[i].setFromProjectionMatrix(pm);
    });
    return rects.length;
  }

  // the meshes that may be left out: leaves of the graph (nothing hangs off them, no light), not skinned, not following the view, with
  // nothing to do before they are drawn (or flagged as safe to skip). Found again every couple of seconds; a mesh added since is drawn
  const ok = (o) => o.isMesh && !o.isSkinnedMesh && o.children.length === 0 && o.frustumCulled !== false && (o.onBeforeRender === THREE.Object3D.prototype.onBeforeRender || o.userData.cullOk);
  function collect() {
    const old = new Map(list.map((e) => [e.o, e])); list = [];
    scene.traverse((o) => { if (ok(o)) list.push(old.get(o) || { o, m: new Float64Array(16).fill(NaN), v: -1, out: false, box: new THREE.Box3() }); });
  }
  // is it wholly outside the house (clear of every room by MARGIN, or above the ceilings)? Its box in the world is kept in e.box
  function classify(e) {
    const o = e.o, g = o.geometry, box = e.box; if (!g || !g.attributes.position) return false;
    if (o.isInstancedMesh) {   // (over every copy, not the share of them drawn at the moment, and wide enough for the grass to lean in the wind)
      const n = o.count; o.count = o.instanceMatrix.count; o.computeBoundingBox(); o.count = n;
      box.copy(o.boundingBox).applyMatrix4(o.matrixWorld); if (o.userData.cullOk) box.expandByScalar(0.5);
    }
    else { if (!g.boundingBox || e.v >= 0) g.computeBoundingBox(); box.copy(g.boundingBox).applyMatrix4(o.matrixWorld); }
    if (box.isEmpty() || !Number.isFinite(box.min.x + box.max.x + box.min.y + box.max.y)) return false;
    if (box.min.y > ROOF_Y) return true;
    for (const [, r] of rooms) { tmp.min.set(r[0] - MARGIN, -Infinity, r[2] - MARGIN); tmp.max.set(r[1] + MARGIN, Infinity, r[3] + MARGIN); if (tmp.intersectsBox(box)) return false; }
    return true;
  }
  // moved, or its vertices or copies changed, since it was last looked at
  // (a model's attributes are interleaved: the version is its buffer's; read off the attribute it is undefined, and NaN equals nothing)
  const version = (o) => { const a = o.geometry.attributes.position; return ((a.isInterleavedBufferAttribute ? a.data.version : a.version) || 0) + (o.isInstancedMesh ? o.instanceMatrix.version * 4096 : 0); };
  const changed = (e) => {
    const a = e.o.matrixWorld.elements, m = e.m, v = e.o.geometry && e.o.geometry.attributes.position ? version(e.o) : 0; let c = v !== e.v;
    for (let i = 0; i < 16 && !c; i++) if (a[i] !== m[i]) c = true;
    if (c) { m.set(a); e.v = v; }
    return c;
  };

  function apply(cam) {
    if (!self.enabled || cam !== camera || hidden.length) return;
    if (!ways) ways = build();
    if (frame++ % 120 === 0) collect();
    const rects = outsideRects(cam); self.stats.outside = rects ? rects.length : -1;
    if (!rects) { self.stats.hidden = 0; return; }
    const n = frustaFor(rects, cam);
    for (const e of list) {
      if (changed(e)) e.out = classify(e);
      if (!e.out || !e.o.visible) continue;
      let seen = false; for (let i = 0; i < n && !seen; i++) seen = frusta[i].intersectsBox(e.box);
      if (!seen) { e.o.visible = false; hidden.push(e.o); }
    }
    self.stats.hidden = hidden.length;
  }
  function restore() { for (const o of hidden) o.visible = true; hidden.length = 0; }
  self.restore = restore;

  // the scene's pass through the graph comes after onBeforeRender and before the shadow maps; everything is shown again there
  const sm = renderer.shadowMap, render = sm.render;
  sm.render = function (...a) { restore(); return render.apply(this, a); };
  scene.onBeforeRender = (r, s, cam) => apply(cam);
  scene.onAfterRender = restore;
  return self;
}
