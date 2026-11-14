// The house lived in: what a family has about the place a few days after moving in. Rugs, books, magazines, towels, posters, the mail,
// cereal on the counter, tools on the garage wall, a bike against the house.
// Everything here stands still and nothing here is played with, so it is built to cost little: the small things made by hand (boxes,
// tubes and sheets of cloth) are gathered by place into a few meshes that all share one painted sheet (textures.js: decorSheet) and three
// materials, and the models (assets/props/d_*.glb, CREDITS.md) are placed like the rest of the furniture. A phone stops drawing a
// cluster of small things from across the house (gfx.js: farCull). Whatever stands on a floor has a footprint the bodies cannot enter.
// All numbers are finished world metres (the house after its stretch): buildDecor runs once the world is built.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as TX from './textures.js';
import { loadProp, scatter } from './props.js';
import { BASEMENT, PLACES, roomAt } from './world.js';

export function buildDecor({ house, yard, solid, M, PHONE }) {
  const sheet = TX.decorSheet(PHONE), UV = sheet.uv;
  const mats = {
    matte: new THREE.MeshStandardMaterial({ map: sheet.tex, vertexColors: true, roughness: 0.9 }),
    satin: new THREE.MeshStandardMaterial({ map: sheet.tex, vertexColors: true, roughness: 0.42 }),
    metal: new THREE.MeshStandardMaterial({ map: sheet.tex, vertexColors: true, roughness: 0.38, metalness: 0.75 }),
  };
  mats.satin.envMapIntensity = 0.5; mats.metal.envMapIntensity = 0.5;
  const items = [], clusters = [], pending = [];
  let cl = null, it = null;
  // a place's worth of small things: one mesh per material. far: a phone stops drawing it this far away (0: always drawn)
  const cluster = (name, x, y, z, { far = 9, parent = house } = {}) => { cl = { name, pos: new THREE.Vector3(x, y, z), far, parent, parts: new Map() }; clusters.push(cl); };
  // what the next pieces belong to, for the placement check (tests/placement.js): kind 'floor' (stands on a floor at y), 'on' (on a
  // surface whose top is y), 'wall' (hangs on one), 'flat' (a rug: lies on the floor and stops nobody)
  const item = (name, kind, y = 0) => { it = { name, kind, y, box: [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity] }; items.push(it); return it; };
  const col = new THREE.Color(), v3 = new THREE.Vector3();
  const tintC = new THREE.Color();
  const add = (geo, color, { mat = 'matte', cast = false, cell = 'white', sub = null, faces = null, m = null, tint = 0xffffff } = {}) => {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (m) g.applyMatrix4(m);
    const pos = g.attributes.position, n = pos.count, uv = g.attributes.uv || new THREE.BufferAttribute(new Float32Array(n * 2), 2), cols = new Float32Array(n * 3);
    col.set(color); tintC.set(tint);
    const rect = (c, s) => { const r = UV[c] || UV.white; return s ? [r[0] + (r[2] - r[0]) * s[0], r[1] + (r[3] - r[1]) * s[1], r[0] + (r[2] - r[0]) * s[2], r[1] + (r[3] - r[1]) * s[3]] : r; };
    const base = rect(cell, sub), flat = cell === 'white';
    for (let i = 0; i < n; i++) {
      let r = base, plain = flat, white = false;
      if (faces) { const f = faces[Math.floor(i / 6)]; if (f) { r = Array.isArray(f) ? rect(f[0], f[1]) : rect(f); plain = false; white = true; if (Array.isArray(f) && f[2]) uv.setXY(i, uv.getY(i), 1 - uv.getX(i)); } }   // (a box: six vertices a face, in the order +x -x +y -y +z -z)
      if (plain) uv.setXY(i, (r[0] + r[2]) / 2, (r[1] + r[3]) / 2); else uv.setXY(i, r[0] + uv.getX(i) * (r[2] - r[0]), r[1] + uv.getY(i) * (r[3] - r[1]));
      if (white) { cols[i * 3] = tintC.r; cols[i * 3 + 1] = tintC.g; cols[i * 3 + 2] = tintC.b; } else { cols[i * 3] = col.r; cols[i * 3 + 1] = col.g; cols[i * 3 + 2] = col.b; }
      if (it) { v3.fromBufferAttribute(pos, i); const b = it.box; b[0] = Math.min(b[0], v3.x); b[1] = Math.max(b[1], v3.x); b[2] = Math.min(b[2], v3.y); b[3] = Math.max(b[3], v3.y); b[4] = Math.min(b[4], v3.z); b[5] = Math.max(b[5], v3.z); }
    }
    g.setAttribute('uv', uv); g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    g.translate(-cl.pos.x, -cl.pos.y, -cl.pos.z);
    const key = mat + (cast ? '|c' : '|n'); (cl.parts.get(key) || cl.parts.set(key, []).get(key)).push(g);
  };
  const M4 = (x, y, z, ry = 0, rx = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(1, 1, 1));
  // a box by its centre on the floor plan and its base: w along x, h up, d along z, turned ry about its middle (rx, rz tip it about its base)
  const box = (x, y, z, w, h, d, color, o = {}) => { const g = o.round ? new RoundedBoxGeometry(w, h, d, 2, Math.min(o.round, w / 2.01, h / 2.01, d / 2.01)) : new THREE.BoxGeometry(w, h, d); g.translate(0, h / 2, 0); add(g, color, { ...o, m: M4(x, y, z, o.ry || 0, o.rx || 0, o.rz || 0) }); };
  const cyl = (x, y, z, r, h, color, o = {}) => { const g = new THREE.CylinderGeometry(o.r2 ?? r, r, h, o.seg || 14, 1, !!o.open); g.translate(0, h / 2, 0); add(g, color, { ...o, m: M4(x, y, z, o.ry || 0, o.rx || 0, o.rz || 0) }); };
  // a tube from a to b
  const rod = (a, b, r, color, o = {}) => { const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), L = d.length(), g = new THREE.CylinderGeometry(r, r, L, o.seg || 8); const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); add(g, color, { ...o, m: new THREE.Matrix4().compose(new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), q, new THREE.Vector3(1, 1, 1)) }); };
  const ball = (x, y, z, r, color, o = {}) => { const g = new THREE.SphereGeometry(r, o.seg || 12, o.seg ? Math.round(o.seg * 0.7) : 8); if (o.scale) g.scale(...o.scale); add(g, color, { ...o, m: M4(x, y, z, o.ry || 0) }); };
  // a sheet of cloth: a line of [across, y] points swept from a to b along the other axis ('x': the line runs in z and y, swept along x),
  // both faces drawn, a little unevenness so it does not hang like card
  const cloth = (axis, a, b, line, color, o = {}) => {
    const NA = o.n || 6, pos = [], uv = [], idx = [], NL = line.length - 1, wob = o.wobble ?? 0.006;
    let len = 0; const run = [0]; for (let j = 1; j <= NL; j++) { len += Math.hypot(line[j][0] - line[j - 1][0], line[j][1] - line[j - 1][1]); run.push(len); }
    for (let i = 0; i <= NA; i++) for (let j = 0; j <= NL; j++) {
      const s = a + (b - a) * i / NA, k = Math.sin(i * 2.1 + j * 1.3) * wob * (j === 0 ? 0.3 : 1), t = line[j][0] + k, y = line[j][1] + Math.sin(i * 1.7 + j * 0.9) * wob * 0.5;
      if (axis === 'x') pos.push(s, y, t); else pos.push(t, y, s);
      uv.push(i / NA * (o.rep ? o.rep[0] : 1), run[j] / len * (o.rep ? o.rep[1] : 1));
    }
    for (let i = 0; i < NA; i++) for (let j = 0; j < NL; j++) { const p = i * (NL + 1) + j, q = p + NL + 1; idx.push(p, q, p + 1, q, q + 1, p + 1, p, p + 1, q, q, p + 1, q + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    const ni = g.toNonIndexed(); ni.computeVertexNormals(); add(ni, color, { cell: 'nap', ...o });
  };
  // something soft dropped flat: a shirt on the carpet
  const rumple = (x, y, z, w, d, color, o = {}) => { const N = 9, g = new THREE.PlaneGeometry(w, d, N, N); g.rotateX(-Math.PI / 2); const p = g.attributes.position, sd = o.seed || 0;
    for (let i = 0; i < p.count; i++) { const a = p.getX(i) / w, b2 = p.getZ(i) / d, e = Math.min(1, (0.5 - Math.abs(a)) * 5, (0.5 - Math.abs(b2)) * 5), k = 0.5 + 0.5 * Math.sin(a * 11 + sd) * Math.cos(b2 * 9 + sd * 2) + 0.3 * Math.sin((a + b2) * 17 + sd);
      p.setXYZ(i, p.getX(i) * (1 + 0.08 * Math.sin(b2 * 7 + sd)), 0.004 + Math.max(0, e) * (o.h || 0.04) * Math.max(0.15, k), p.getZ(i) * (1 + 0.1 * Math.sin(a * 6 + sd))); }
    g.computeVertexNormals(); add(g, color, { cell: 'nap', ...o, m: M4(x, y, z, o.ry || 0) }); };
  // a picture flat on a wall. axis 'x': the wall runs along x at `at`, its face looking dir (+1: toward +z); c is where along it, y its
  // middle, `at` the face of what it hangs on. frame: a moulding round it (its colour), tape: stuck up with tape instead
  const picture = (axis, at, dir, c, y, w, h, cell, { frame = 0x3a2a1c, depth = 0.022, fw = 0.035, tape = false, tilt = 0, mat = 'matte', sub = null } = {}) => {
    const place = (g, off) => { g.rotateZ(tilt); if (axis === 'x') { if (dir < 0) g.rotateY(Math.PI); g.translate(c, y, at + dir * off); } else { g.rotateY(dir > 0 ? Math.PI / 2 : -Math.PI / 2); g.translate(at + dir * off, y, c); } return g; };
    if (!tape) { const f = new THREE.BoxGeometry(w + fw * 2, h + fw * 2, depth); add(place(f, depth / 2), frame, { mat: 'satin', cast: true }); }
    const off = tape ? 0.004 : depth + 0.002; add(place(new THREE.PlaneGeometry(w, h), off), 0xffffff, { cell, sub, mat });
    if (it) (it.probes || (it.probes = [])).push(axis === 'x' ? [c, y, at + dir * off, 0, dir] : [at + dir * off, y, c, dir, 0]);   // (the check looks at it from the room: the sheet must be what it sees)
    if (tape) for (const [sx, sy] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) { const t = new THREE.PlaneGeometry(0.05, 0.022); t.rotateZ(sx * sy * 0.7); t.translate(sx * (w / 2 - 0.008), sy * (h / 2 - 0.006), 0); add(place(t, 0.005), 0xd9d2b0, {}); }
  };
  // a book lying flat: its cover up
  const book = (x, y, z, w, h, d, cover, edge, ry = 0) => box(x, y, z, w, h, d, edge, { ry, faces: [null, null, cover, null, null, null], mat: 'satin' });
  // a row of books standing on a shelf, spines to the room. axis 'z': the row runs along z from a to b, spines looking dir along x
  const SP = 32, KSP = 16;
  let bookSeed = 7;
  const rnd = TX.rng(4242);
  const books = (axis, a, b, at, dir, y, { depth = 0.15, hMin = 0.18, hMax = 0.25, kid = false, lean = true } = {}) => {
    let s = a;
    while (s < b - 0.02) {
      const t = (kid ? 0.012 : 0.022) + rnd() * (kid ? 0.014 : 0.03), h = hMin + rnd() * (hMax - hMin), dd = depth * (0.82 + rnd() * 0.18), i = (bookSeed++ * 7) % (kid ? KSP : SP);
      if (s + t > b) break;
      const sp = [kid ? 'kidspines' : 'spines', [i / (kid ? KSP : SP), 0, (i + 1) / (kid ? KSP : SP), 1]];
      const cx = axis === 'z' ? at - dir * dd / 2 : s + t / 2, cz = axis === 'z' ? s + t / 2 : at - dir * dd / 2;
      const faces = axis === 'z' ? [dir > 0 ? sp : null, dir < 0 ? sp : null, null, null, null, null] : [null, null, null, null, dir > 0 ? sp : null, dir < 0 ? sp : null];
      const tip = lean && s + t > b - 0.06 && rnd() < 0.7 ? 0.16 : 0;   // the last one leans on its neighbours
      box(cx, y, cz, axis === 'z' ? dd : t, h, axis === 'z' ? t : dd, 0xd8d0b8, { faces, mat: 'satin', rx: axis === 'z' ? -tip : 0, rz: axis === 'x' ? tip : 0 });
      s += t + 0.001 + (rnd() < 0.08 ? 0.01 : 0);
    }
  };
  // a tape in its sleeve lying flat, its label to dir along x (k: which label)
  const tape = (x, y, z, k, dir = -1, ry = 0) => { const lab = ['vhs', [(k % 2) * 0.5, 1 - (((k / 2) | 0) % 4 + 1) * 0.25, (k % 2) * 0.5 + 0.5, 1 - (((k / 2) | 0) % 4) * 0.25]]; box(x, y, z, 0.103, 0.025, 0.187, 0x17171a, { ry, faces: [dir > 0 ? lab : null, dir < 0 ? lab : null, null, null, null, null], mat: 'satin' }); };
  const mug = (x, y, z, color = 0xe8e2d2, ry = 0) => { cyl(x, y, z, 0.038, 0.09, color, { mat: 'satin', r2: 0.041 }); cyl(x, y + 0.082, z, 0.034, 0.009, 0x2a1c12, { mat: 'satin' }); box(x + Math.cos(ry) * 0.05, y + 0.025, z - Math.sin(ry) * 0.05, 0.022, 0.045, 0.01, color, { mat: 'satin', ry }); };
  // a shoe on the floor, its toe toward a (0: along +z): a sole, a low front and a higher back with the dark of its mouth, the laces
  const shoe = (x, y, z, a, upper, { len = 0.2, sole = 0xe6e2d6, toe = null, lace = 0xf0eee6 } = {}) => {
    const at = (d) => [x + d * Math.sin(a), z + d * Math.cos(a)], w = len * 0.4; let q;
    box(x, y, z, w, 0.016, len, sole, { round: 0.007, ry: a });
    q = at(-len * 0.2); box(q[0], y + 0.014, q[1], w * 0.92, 0.05, len * 0.56, upper, { round: 0.02, ry: a, cell: 'nap' }); box(q[0], y + 0.064, q[1], w * 0.52, 0.004, len * 0.36, 0x1c1a18, { ry: a });
    q = at(len * 0.2); box(q[0], y + 0.014, q[1], w * 0.9, 0.032, len * 0.56, upper, { round: 0.015, ry: a, cell: 'nap' });
    if (toe) { q = at(len * 0.39); box(q[0], y + 0.014, q[1], w * 0.92, 0.024, len * 0.2, toe, { round: 0.011, ry: a }); }
    if (lace) { q = at(len * 0.13); box(q[0], y + 0.046, q[1], w * 0.42, 0.004, len * 0.26, lace, { ry: a }); }
  };
  // a moving box with its flaps up, things showing over the rim
  const openBox = (x, y, z, w, h, d, ry, fill) => {
    const c = 0xa98050, t = 0.006, m = M4(x, y, z, ry), sub = (g, mm) => { g.applyMatrix4(mm); add(g, c, { cast: true, m }); };
    const wall = (ww, hh, dd, px, py, pz, rx = 0, rz = 0) => { const g = new THREE.BoxGeometry(ww, hh, dd); g.translate(0, hh / 2, 0); sub(g, M4(px, py, pz, 0, rx, rz)); };
    wall(w, t, d, 0, 0, 0); wall(w, h, t, 0, 0, d / 2 - t / 2); wall(w, h, t, 0, 0, -d / 2 + t / 2); wall(t, h, d, w / 2 - t / 2, 0, 0); wall(t, h, d, -w / 2 + t / 2, 0, 0);
    wall(w, d * 0.48, t, 0, h, d / 2, 0.9); wall(w, d * 0.48, t, 0, h, -d / 2, -1.2); wall(t, w * 0.3, d, w / 2, h, 0, 0, -0.5); wall(t, w * 0.3, d, -w / 2, h, 0, 0, 2.2);
    const g = new THREE.BoxGeometry(w - 0.03, 0.02, d - 0.03); g.translate(0, h * 0.72, 0); add(g, 0x8a7a66, { m });
    fill((lx, ly, lz) => v3.set(lx, ly, lz).applyMatrix4(m).toArray(), h * 0.73);
  };

  // ---------- models ----------
  // one of assets/props, set down by its footprint's middle with its base on y (its real bounds, turned and tipped as asked). rot: about
  // the vertical; rx, rz: tipped (a bike leant on a wall); s, sy: its size. kind as for item(); wall things name the wall they hang on
  // in `back` ([axis, at]) so the check can see they touch it.
  const model = (name, { x, y = 0, z, rot = 0, s = 1, sy = null, rx = 0, rz = 0, kind = 'floor', parent = house, after = null, on = y, cast = null } = {}) => {
    const holder = new THREE.Group(); holder.userData.prop = name; holder.position.set(x, y, z); holder.rotation.y = rot; parent.add(holder);
    const rec = { name, kind, y: on, box: null, model: true, holder }; items.push(rec);
    pending.push(loadProp(name).then((g) => {
      const m = g.scene.clone(true); m.scale.set(s, sy ?? s, s); m.rotation.set(rx, 0, rz); m.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(m, true);
      m.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2); holder.add(m);
      holder.updateMatrixWorld(true); const wb = new THREE.Box3().setFromObject(holder, true); rec.box = [wb.min.x, wb.max.x, wb.min.y, wb.max.y, wb.min.z, wb.max.z];
      holder.traverse((o) => { if (o.isMesh && /glass/i.test(o.material.name)) o.visible = false; });   // (a pane with nothing to mirror reads as a black card)
      if (cast !== null) holder.traverse((o) => { if (o.isMesh) o.castShadow = cast; });
      if (PHONE) {   // a phone: the small ones go from across the house and hold their pictures at 128 px (the rest at 256), and only what stands out in the yard is in the sun's shadow pass
        const small = Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z) < 0.6, G = PLACES.garage, sunlit = parent === yard && !(x > G[0] && x < G[1] && z > G[2] && z < G[3]);
        if (small) holder.userData.farCull = 9;
        holder.traverse((o) => { if (!o.isMesh) return; if (small || !sunlit) o.castShadow = false; if (name.startsWith('d_')) for (const k of ['map', 'emissiveMap']) if (o.material[k]) shrink(o.material[k], small ? 128 : 256); });
      }
      if (parent === house) { const room = roomAt(x, z, y); holder.traverse((o) => { if (o.isMesh) o.userData.decorRoom = room; }); }   // (cull.js: drawn only where its room shows)
      if (after) after(holder, m);
    }).catch((e) => console.warn('prop failed:', name, e)));
    return holder;
  };
  // a picture held to px on a side (the models' own maps, on a phone)
  const shrink = (tex, px) => { const im = tex.image; if (!im || !im.width || Math.max(im.width, im.height) <= px) return; const c = document.createElement('canvas'); c.width = c.height = px; c.getContext('2d').drawImage(im, 0, 0, px, px); tex.image = c; tex.needsUpdate = true; };
  // the footprint of something standing on a floor: bodies walk round it. Down in the laundry it only stops who is down there
  const foot = (name, x0, x1, z0, z1, maxY, extra = {}) => { const c = solid(x0, x1, z0, z1, { maxY, id: 'decor:' + name, decor: true, ...extra }); return c; };
  const B = BASEMENT, cellar = { minY: B - 0.2, maxY: -0.1 };
  const PI = Math.PI;
  const photoLoader = new THREE.TextureLoader();
  const photoIn = (holder, file) => photoLoader.load(`assets/photos/${file}.webp`, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; holder.traverse((o) => { if (o.isMesh && /artwork/.test(o.material.name)) { o.material = o.material.clone(); o.material.map = t; o.material.color.set(0xffffff); } }); });

  // ---------- the living room ----------
  {
    cluster('living floor', -0.6, 0, -2.8, { far: 0 });
    item('living rug', 'flat'); box(-0.65, 0, -2.82, 2.14, 0.012, 2.6, 0x5a4034, { faces: [null, null, 'rug', null, null, null], tint: 0xb8a898 });
    // books and things on shelves by the couch, a lamp between the couch and the armchair
    model('d_shelves', { x: -2.475, z: -0.56, s: 0.8 }); foot('living shelves', -2.634, -2.31, -1.01, -0.11, 1.25);   // (under the photographs: it stops short of their frames)
    model('d_floorlamp', { x: -2.43, z: -3.445, s: 0.78 }); foot('floor lamp', -2.6, -2.28, -3.6, -3.29, 1.56);
    model('d_cushion', { x: -2.3, y: 0.39, z: -2.92, s: 0.8, rot: PI / 2, kind: 'on' }); model('d_cushion2', { x: -2.3, y: 0.39, z: -1.5, s: 0.8, rot: -PI / 2, kind: 'on' });
    cluster('couch throw', -2.4, 0.6, -2.15);
    item('throw', 'on', 0.39); cloth('z', -2.52, -1.78, [[-2.615, 0.74], [-2.585, 0.8], [-2.5, 0.845], [-2.43, 0.82], [-2.395, 0.62], [-2.385, 0.49], [-2.33, 0.415], [-2.14, 0.412], [-2.02, 0.41]], 0xffffff, { cell: 'throw', n: 10, cast: true });
    cluster('coffee table', -0.37, 0.549, -2.8);
    const ty = 0.549;
    item('magazines', 'on', ty); box(-0.42, ty, -2.52, 0.21, 0.004, 0.275, 0xe6dcc0, { ry: 0.25, faces: [null, null, 'mag_home', null, null, null], mat: 'satin' }); box(-0.4, ty + 0.004, -2.5, 0.21, 0.004, 0.275, 0xe6dcc0, { ry: -0.12, faces: [null, null, 'mag_out', null, null, null], mat: 'satin' }); box(-0.37, ty + 0.008, -2.53, 0.2, 0.004, 0.27, 0xe6dcc0, { ry: 0.5, faces: [null, null, 'mag_tv', null, null, null], mat: 'satin' });
    item('newspaper', 'on', ty); box(-0.33, ty, -3.28, 0.3, 0.012, 0.205, 0xd9d5c6, { ry: 1.4, faces: [null, null, 'paper', null, null, null] });
    item('remote', 'on', ty); box(-0.17, ty, -2.14, 0.05, 0.018, 0.17, 0x242426, { ry: 0.5, faces: [null, null, 'remote', null, null, null], mat: 'satin' });
    item('coffee mug', 'on', ty); mug(-0.56, ty, -2.95, 0x6e7f8a, 0.6);
    // by the television: the tape player, the family's tapes
    cluster('tv things', 4.25, 0.549, -3.0);
    item('vcr', 'on', ty); box(4.26, ty, -2.44, 0.28, 0.085, 0.38, 0x1b1b1d, { faces: [null, 'vcr', null, null, null, null], mat: 'satin', cast: true });
    tape(4.27, ty + 0.085, -2.44, 3, -1, 0.08);
    item('tapes', 'on', ty); for (let i = 0; i < 4; i++) tape(4.2 + (i % 2) * 0.012, ty + i * 0.0252, -3.66 + (i % 3) * 0.01, [0, 2, 5, 6][i], -1, (i - 1.5) * 0.05);
    box(4.2, ty, -3.87, 0.027, 0.19, 0.105, 0x1c2230, { faces: [null, 'vhs_movie', null, null, null, null], mat: 'satin' }); box(4.232, ty, -3.868, 0.027, 0.19, 0.105, 0xe0b23c, { faces: [null, 'vhs_toon', null, null, null, null], mat: 'satin' });
    // what is on the shelves
    cluster('living shelves', -2.4, 0.8, -0.54);
    const sx = -2.345, R1 = 0.932, R2 = 0.632, R3 = 0.33;
    item('shelf books', 'on', R1); books('z', -0.965, -0.72, sx, 1, R1, { hMax: 0.245 }); books('z', -0.685, -0.52, sx, 1, R1, { hMax: 0.24 });
    item('shelf books 2', 'on', R2); books('z', -0.403, -0.22, sx, 1, R2, { hMin: 0.19, hMax: 0.25 }); books('z', -0.965, -0.79, sx, 1, R2, { hMax: 0.24 });
    item('shelf books 3', 'on', R3); books('z', -0.685, -0.44, sx, 1, R3, { hMax: 0.25 });
    item('shelf stack', 'on', R2); for (let i = 0; i < 4; i++) book(-2.44, R2 + i * 0.026, -0.56, 0.2, 0.025, 0.15, i % 2 ? 'cv_novel' : 'cv_note', [0x27324a, 0x8a7a52, 0x5a2326, 0x2f4634][i], PI / 2 + (i - 1.5) * 0.06);
    item('shelf magazines', 'on', R3); for (let i = 0; i < 5; i++) box(-2.44, R3 + i * 0.005, -0.84, 0.25, 0.005, 0.2, 0xe6dcc0, { ry: PI / 2 + (i - 2) * 0.03, faces: [null, null, ['mag_farm', 'mag_out', 'mag_home', 'mag_tv', 'mag_farm'][i], null, null, null], mat: 'satin' });
    model('d_vase2', { x: -2.44, y: R1, z: -0.27, kind: 'on' }); model('d_frame', { x: -2.42, y: R2, z: -0.64, s: 0.6, rot: 0.15, kind: 'on', after: (h) => photoIn(h, 'knitting') });
    cluster('living walls', 1.92, 1.55, 0.2);
    item('sampler', 'wall'); picture('x', 0.204, -1, 1.93, 1.56, 0.25, 0.32, 'pr_sampler', { frame: 0x4a3524 });
  }

  // ---------- the kitchen and the dining end ----------
  {
    const cy = 0.95;
    cluster('kitchen counter', 1.2, cy, 4.3);
    item('canisters', 'on', cy);
    const dw = 0.9;   // (the top between the two runs of counter is 5 cm lower)
    for (const [x, z, r, h] of [[0.64, 4.4, 0.075, 0.2], [0.815, 4.41, 0.065, 0.17], [0.97, 4.42, 0.055, 0.14]]) { cyl(x, cy, z, r, h, 0xd8d0bc, { mat: 'satin', seg: 18, cast: true }); cyl(x, cy + h * 0.45, z, r + 0.001, h * 0.16, 0x6d7f8c, { mat: 'satin', seg: 18 }); cyl(x, cy + h, z, r * 0.96, 0.018, 0x8a6a48, { seg: 18 }); cyl(x, cy + h + 0.018, z, 0.014, 0.016, 0x8a6a48); }
    item('cereal', 'on', cy); box(1.22, cy, 4.445, 0.19, 0.27, 0.06, 0xd9a426, { ry: 0.12, faces: [null, null, null, null, null, 'cer_corn'], cast: true }); box(1.41, cy, 4.44, 0.19, 0.27, 0.06, 0x31507a, { ry: -0.16, faces: [null, null, null, null, null, 'cer_wheat'], cast: true });
    item('paper towels', 'on', dw); cyl(1.66, dw, 4.42, 0.075, 0.014, 0x8a6a48, { seg: 16 }); cyl(1.66, dw + 0.014, 4.42, 0.062, 0.275, 0xf0eee6, { seg: 16, cell: 'nap', cast: true }); cyl(1.66, dw + 0.289, 4.42, 0.009, 0.03, 0x8a6a48);
    model('d_bowl', { x: 0.93, y: cy, z: 4.1, s: 0.9, kind: 'on' });
    for (const [dx, dz, r] of [[-0.05, 0.02, 0.4], [0.05, -0.03, 2.1], [0.0, 0.07, 4.0]]) model('d_lemon', { x: 0.93 + dx, y: cy + 0.03, z: 4.1 + dz, rot: r, rx: 1.4, kind: 'in' });
    item('apples', 'in', cy); ball(0.88, cy + 0.075, 4.06, 0.036, 0x8e2a22, { mat: 'satin', scale: [1, 0.9, 1] }); ball(0.99, cy + 0.072, 4.13, 0.034, 0x9aa23c, { mat: 'satin', scale: [1, 0.9, 1] });
    item('cookbook', 'on', cy); book(1.37, cy, 4.07, 0.2, 0.024, 0.26, 'cv_cook', 0xe6dcc0, 0.28);
    item('mail', 'on', dw); box(1.76, dw, 4.03, 0.23, 0.003, 0.11, 0xece8dc, { ry: 0.3, faces: [null, null, 'env', null, null, null] }); box(1.79, dw + 0.003, 4.05, 0.23, 0.003, 0.11, 0xc9ab72, { ry: -0.1, faces: [null, null, 'env2', null, null, null] }); box(1.74, dw + 0.006, 4.0, 0.1, 0.002, 0.135, 0xc2452f, { ry: 0.9, faces: [null, null, 'flyer', null, null, null] });
    item('keys', 'on', dw); { const g = new THREE.TorusGeometry(0.014, 0.0025, 5, 12); g.rotateX(PI / 2); add(g, 0xb9b6ae, { mat: 'metal', m: M4(1.95, dw + 0.003, 4.12) }); box(1.975, dw, 4.13, 0.05, 0.003, 0.012, 0xb9a36a, { mat: 'metal', ry: 0.5 }); box(1.97, dw + 0.003, 4.105, 0.05, 0.003, 0.012, 0xb9b6ae, { mat: 'metal', ry: -0.3 }); box(1.925, dw, 4.14, 0.03, 0.008, 0.02, 0x7a2a26, { mat: 'satin', ry: 0.8 }); }
    item('dish soap', 'on', cy); cyl(3.16, cy, 4.45, 0.03, 0.14, 0x4f9a58, { mat: 'satin', r2: 0.026 }); cyl(3.16, cy + 0.14, 4.45, 0.012, 0.03, 0xe8e6de, { mat: 'satin' }); box(3.17, cy, 4.33, 0.11, 0.03, 0.07, 0xd6b23c, { round: 0.008, cell: 'nap', ry: 0.2 }); box(3.17, cy + 0.03, 4.33, 0.11, 0.008, 0.07, 0x3f6a40, { cell: 'nap', ry: 0.2 });
    cluster('kitchen floor', 2.6, 0, 3.55, { far: 0 });
    item('sink mat', 'flat'); box(2.57, 0, 3.56, 0.9, 0.01, 0.5, 0x6b7478, { faces: [null, null, 'ragrug', null, null, null], tint: 0xc0b8a8 });
    // the towel over the oven door's handle
    cluster('stove towel', 3.82, 0.6, 2.13);
    item('dish towel', 'wall'); cloth('z', 2.02, 2.24, [[3.84, 0.52], [3.838, 0.69], [3.826, 0.722], [3.812, 0.69], [3.809, 0.42]], 0xe6dfcc, { wobble: 0.002 });
    for (const y of [0.45, 0.475]) box(3.8075, y, 2.13, 0.002, 0.012, 0.22, 0x9a3a32, { cell: 'nap' });
    // on the refrigerator's door
    cluster('fridge door', 3.8, 1.4, 1.15);
    const FR = 3.7985;   // (the door's face is at 3.797: the sheets lie 2.5 mm proud of it)
    item('fridge papers', 'wall'); picture('z', FR, -1, 1.02, 1.615, 0.2, 0.15, 'draw_dog', { tape: true, tilt: 0.05 }); picture('z', FR, -1, 1.03, 1.06, 0.085, 0.136, 'list', { tape: true, tilt: -0.04 }); picture('z', FR, -1, 1.33, 1.15, 0.1, 0.133, 'flyer', { tape: true, tilt: 0.03 });   // (clear of the notes already on the doors)
    // the wall by the table: the calendar, the clock
    cluster('kitchen wall', 1.2, 1.7, 0.4);
    item('calendar', 'wall'); picture('x', 0.39, 1, 1.5, 1.6, 0.3, 0.45, 'calendar', { tape: false, frame: 0xf1ede2, depth: 0.004, fw: 0.001 }); cyl(1.5, 1.815, 0.396, 0.004, 0.012, 0x3a3a3a, { rx: PI / 2 });
    model('clock_wall', { x: 0.55, y: 1.86, z: 0.39 + 0.0235, kind: 'wall' });
    // the cork board by the phone
    cluster('cork board', -0.7, 1.5, 0.95);
    item('cork board', 'wall'); picture('z', -0.686, -1, 0.95, 1.52, 0.56, 0.42, 'cork', { frame: 0x8a6a48, depth: 0.02, fw: 0.03 });
    // the sideboard's top, a small view over the plant
    cluster('sideboard', -2.38, 0.705, 2.9);
    const sy = 0.705;
    model('d_frame', { x: -2.39, y: sy, z: 2.52, s: 0.9, rot: 0.25, kind: 'on', after: (h) => photoIn(h, 'boy') });
    model('d_jug', { x: -2.37, y: sy, z: 3.3, rot: PI / 2 + 0.3, s: 0.8, kind: 'on' });
    item('sideboard mail', 'on', sy); box(-2.37, sy, 2.92, 0.11, 0.003, 0.23, 0xece8dc, { ry: 0.15, faces: [null, null, ['env', null], null, null, null] }); box(-2.365, sy + 0.003, 2.9, 0.11, 0.003, 0.23, 0xe6dcc0, { ry: -0.2 });
    cluster('dining wall', -0.88, 1.75, 4.57);
    item('dining print', 'wall'); picture('x', 4.578, -1, -0.88, 1.76, 0.32, 0.25, 'pr_field', { frame: 0x4a3524 });
    // tulips over the far end of the sideboard, past where the barn door slides; a mat inside the back door, shoes kicked off by the wall
    cluster('dining west wall', -2.6, 1.6, 3.74);
    item('tulips', 'wall'); picture('z', -2.634, 1, 3.74, 1.6, 0.25, 0.32, 'pr_flowers', { frame: 0x6b4a2c });
    cluster('back door floor', -1.9, 0, 4.1, { far: 0 });
    item('back door mat', 'flat'); box(-1.6, 0, 4.27, 0.82, 0.007, 0.5, 0x6d4f48, { faces: [null, null, 'ragrug', null, null, null], tint: 0xb0a48e });
    item('shoes by the door', 'flat'); shoe(-2.5, 0, 3.72, -PI / 2 + 0.08, 0x5a3d26, { len: 0.27, sole: 0x2a2420, lace: 0x3a2a1c }); shoe(-2.49, 0, 3.84, -PI / 2 - 0.06, 0x5a3d26, { len: 0.27, sole: 0x2a2420, lace: 0x3a2a1c });
    shoe(-2.5, 0, 4.02, -PI / 2 - 0.1, 0xd8d4c8, { len: 0.24, toe: 0xe6e2d6 }); shoe(-2.46, 0, 4.15, -PI / 2 + 0.25, 0xd8d4c8, { len: 0.24, toe: 0xe6e2d6 });
  }

  // ---------- the hall ----------
  {
    cluster('hall thermostat', 5.08, 1.5, 0.2);
    item('thermostat', 'wall'); box(5.08, 1.46, 0.193, 0.11, 0.075, 0.022, 0xe6e0cf, { round: 0.006, mat: 'satin' }); box(5.08, 1.505, 0.181, 0.07, 0.014, 0.002, 0x3a3a38, {}); box(5.062, 1.473, 0.1805, 0.012, 0.016, 0.003, 0x8a8a84, { mat: 'metal' });
    cluster('hall runner', 8.1, 0, -0.42, { far: 0 });
    item('hall runner', 'flat'); for (let i = 0; i < 4; i++) box(5.92 + i * 1.44, 0, -0.42, 1.44, 0.004, 0.7, 0x4a2422, { faces: [null, null, ['runner', null, 1], null, null, null], tint: 0xb0a090 });
  }

  // ---------- your room ----------
  {
    model('d_kidtable', { x: 10.99, z: 1.72, s: 1.1, rot: -PI / 2 }); foot('desk', 10.74, 11.243, 1.2, 2.24, 0.6);
    model('d_stool', { x: 10.45, z: 1.75, s: 0.62, rot: 0.3 }); foot('stool', 10.32, 10.58, 1.62, 1.88, 0.37);
    model('d_kidshelf', { x: 9.95, z: 4.385, rot: PI }); foot('shelf', 9.69, 10.21, 4.19, 4.578, 1.13);
    model('d_crate', { x: 7.25, z: 2.9, rot: PI / 2 }); foot('toy crate', 7.03, 7.47, 2.63, 3.17, 0.26);
    const dy = 0.579;
    cluster('your desk', 10.99, dy, 1.72);
    model('d_notepads', { x: 10.98, y: dy, z: 1.6, s: 0.5, rot: -PI / 2 + 0.1, kind: 'on' });
    item('pencil cup', 'on', dy); cyl(11.1, dy, 2.08, 0.036, 0.095, 0x3c6a8a, { mat: 'satin', r2: 0.04, cast: true }); cyl(11.1, dy + 0.089, 2.08, 0.035, 0.004, 0x1e1c1c);
    [[0xd9a426, 0.02, 0.012, 0.3], [0xc2452f, -0.016, 0.018, 1.9], [0x3c76a8, 0.004, -0.022, 4.0], [0x4f9a58, -0.014, -0.012, 3.1], [0xd9a426, 0.022, -0.008, 5.4]].forEach(([c, dx, dz, a], i) => { const top = [11.1 + dx + Math.cos(a) * 0.016, dy + 0.15 + i * 0.008, 2.08 + dz + Math.sin(a) * 0.016]; rod([11.1 + dx * 0.5, dy + 0.012, 2.08 + dz * 0.5], top, 0.0038, c, { mat: 'satin', seg: 6 }); rod(top, [top[0] + Math.cos(a) * 0.0012, top[1] + 0.012, top[2] + Math.sin(a) * 0.0012], 0.004, i % 2 ? 0xd9a0a0 : 0xd8c49a, { seg: 6 }); });
    item('crayons', 'on', dy); box(10.9, dy, 2.0, 0.075, 0.022, 0.115, 0xe0b23c, { ry: 0.4, faces: [null, null, 'crayons', null, null, null] });
    [[0xc2452f, 10.86, 1.82, 0.3], [0x3c76a8, 10.9, 1.86, 1.2], [0x4f9a58, 10.83, 1.9, 2.0], [0xe0b23c, 10.94, 1.8, 0.8], [0x7a4f9a, 10.88, 1.76, 2.6]].forEach(([c, x, z, a]) => rod([x - Math.cos(a) * 0.04, dy + 0.005, z - Math.sin(a) * 0.04], [x + Math.cos(a) * 0.04, dy + 0.005, z + Math.sin(a) * 0.04], 0.005, c, { seg: 6 }));
    item('drawing', 'on', dy); box(10.95, dy, 1.88, 0.2, 0.002, 0.15, 0xefe9d6, { ry: PI / 2 + 0.15, faces: [null, null, 'draw_house', null, null, null] });
    cluster('your walls', 11.2, 1.5, 1.7);
    item('posters', 'wall'); picture('z', 11.243, -1, 1.42, 1.52, 0.42, 0.588, 'p_dino', { tape: true, tilt: 0.012 }); picture('z', 11.243, -1, 1.98, 1.56, 0.42, 0.588, 'p_rocket', { tape: true, tilt: -0.02 });
    cluster('your west wall', 6.92, 1.55, 2.85);
    item('car poster', 'wall'); picture('z', 6.905, 1, 2.85, 1.58, 0.62, 0.443, 'p_car', { tape: true, tilt: 0.015 });
    cluster('your north wall', 9.95, 1.7, 4.57);
    item('pennant', 'wall'); { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0.3, 0.11, 0, 0.3, -0.11, 0, -0.3, 0, 0], 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0.5], 2)); g.computeVertexNormals(); add(g, 0xffffff, { cell: 'pennant', m: M4(9.98, 1.72, 4.578 - 0.004, 0, 0, 0.06) }); }
    // tapes by your television, clothes where they fell
    cluster('your tapes', 7.3, 0.55, 2.13);
    item('your tapes', 'on', 0.55); for (let i = 0; i < 3; i++) tape(7.3 + (i % 2) * 0.01, 0.55 + i * 0.0252, 2.135, [1, 7, 4][i], 1, (i - 1) * 0.07);
    cluster('your floor', 10.7, 0, 2.85);
    item('clothes', 'flat'); rumple(10.72, 0, 2.8, 0.5, 0.42, 0x8a3a32, { ry: 0.5, seed: 1, h: 0.05 }); rumple(10.84, 0.003, 3.05, 0.6, 0.34, 0x3d4a5e, { ry: -0.6, seed: 4, h: 0.045 }); rumple(10.58, 0, 3.08, 0.2, 0.12, 0xd8d2c2, { seed: 7, h: 0.03, ry: 1.0 });
    shoe(10.5, 0, 2.56, 0.3, 0xa8322a, { toe: 0xe6e2d6 }); shoe(10.63, 0, 2.5, -0.5, 0xa8322a, { toe: 0xe6e2d6 });
    // your school bag against the wall by the desk, the bat in the corner
    cluster('school bag', 11.1, 0.2, 1.02);
    item('school bag', 'floor');   // slumped back on the wall: the round-topped body, the pocket on its front with its zip and a name tag, the zip over the top, the loop to hang it by, a strap fallen to one side
    box(11.125, 0, 1.03, 0.16, 0.4, 0.3, 0x2c3f66, { round: 0.07, cell: 'nap', cast: true, rz: -0.1 }); box(11.04, 0.025, 1.03, 0.06, 0.2, 0.23, 0x9a2f2a, { round: 0.024, cell: 'nap', rz: -0.1 });
    box(11.026, 0.19, 1.03, 0.005, 0.007, 0.2, 0xc8c4b8, { mat: 'satin' }); box(11.006, 0.09, 1.07, 0.004, 0.035, 0.06, 0xe8e2d0, {}); box(11.064, 0.315, 1.03, 0.006, 0.007, 0.25, 0xc8c4b8, { mat: 'satin' });
    { const g = new THREE.TorusGeometry(0.028, 0.006, 5, 12, PI); add(g, 0x1e2a44, { m: M4(11.165, 0.392, 1.03, PI / 2) }); }
    cloth('z', 0.875, 0.915, [[11.2, 0.3], [11.1, 0.16], [11.06, 0.012], [10.99, 0.008]], 0x1e2a44, { n: 1, wobble: 0.001 });
    foot('school bag', 10.98, 11.243, 0.86, 1.2, 0.4);
    model('d_bat', { x: 10.34, z: 4.49, rz: 0.13, rot: 0.4 }); foot('bat', 10.21, 10.46, 4.36, 4.578, 0.9);
    // on your shelves: games, books, a ball, blocks
    cluster('your shelves', 9.95, 0.5, 4.4);
    item('games', 'on', 0.005); for (let i = 0; i < 3; i++) box(9.93 + (i - 1) * 0.012, 0.005 + i * 0.046, 4.41, 0.38, 0.045, 0.26, [0xa8322a, 0x2f6f7a, 0xe0b23c][i], { ry: (i - 1) * 0.05, faces: [null, null, null, null, null, ['games', [0, 1 - (i + 1) / 3, 1, 1 - i / 3]]] });
    box(9.942, 0.143, 4.36, 0.34, 0.0015, 0.085, 0xe0b23c, { ry: PI + 0.05, faces: [null, null, ['games', [0, 0, 1, 1 / 3]], null, null, null] });   // (the lid of the one on top, where the shelf's lip does not hide it)
    item('your books', 'on', 0.462); books('x', 9.74, 10.02, 4.36, -1, 0.462, { depth: 0.13, hMin: 0.15, hMax: 0.21, kid: true });
    model('d_ball', { x: 10.11, y: 0.462, z: 4.43, rot: 1, kind: 'on' });
    item('blocks', 'on', 0.738); [[9.8, 4.47, 0.2, 0], [9.86, 4.475, -0.3, 1], [9.83, 4.47, 0.5, 2]].forEach(([x, z, a, k], i) => box(x, 0.738 + (i === 2 ? 0.045 : 0), z, 0.045, 0.045, 0.045, 0xd9c08a, { ry: a, faces: [null, null, ['blocks', [((k + 1) % 4) / 4, 0, ((k + 1) % 4 + 1) / 4, 1]], null, null, ['blocks', [k / 4, 0, (k + 1) / 4, 1]]] }));
    book(10.05, 0.738, 4.47, 0.13, 0.014, 0.1, 'cv_kid', 0xe8e2d0, 0.2);
    // the toy crate
    model('d_football', { x: 7.25, y: 0.012, z: 2.86, s: 0.8, rot: 1.9, kind: 'in' });
    cluster('toy crate', 7.25, 0.1, 2.9);
    item('crate blocks', 'in', 0.008); box(7.2, 0.01, 3.05, 0.045, 0.045, 0.045, 0xd9c08a, { ry: 0.4, faces: [null, null, ['blocks', [0.75, 0, 1, 1]], null, null, null] }); box(7.3, 0.01, 3.07, 0.045, 0.045, 0.045, 0xd9c08a, { ry: 1.0, faces: [null, null, ['blocks', [0.5, 0, 0.75, 1]], null, null, null] });
  }

  // ---------- the bathroom ----------
  {
    cluster('bath towels', 4.84, 1.2, 1.5);
    item('towel bar', 'wall'); rod([4.84, 1.36, 1.14], [4.84, 1.36, 1.82], 0.009, 0xdfe2e4, { mat: 'metal' }); for (const z of [1.16, 1.8]) { rod([4.768, 1.36, z], [4.84, 1.36, z], 0.009, 0xdfe2e4, { mat: 'metal' }); cyl(4.769, 1.36, z, 0.022, 0.006, 0xdfe2e4, { mat: 'metal', rz: -PI / 2 }); }
    cloth('z', 1.2, 1.47, [[4.826, 0.98], [4.828, 1.345], [4.84, 1.374], [4.853, 1.345], [4.856, 0.84]], 0x4f7f86, { cast: true, n: 5 }); cloth('z', 1.5, 1.77, [[4.826, 0.92], [4.828, 1.345], [4.84, 1.374], [4.853, 1.345], [4.856, 0.9]], 0xe2dccb, { cast: true, n: 5 });
    cluster('bath sink', 6.5, 0.95, 1.64);
    item('hand towel', 'wall'); { const g = new THREE.TorusGeometry(0.06, 0.006, 6, 16); g.rotateY(PI / 2); add(g, 0xdfe2e4, { mat: 'metal', m: M4(6.648, 1.33, 2.4) }); rod([6.693, 1.39, 2.4], [6.648, 1.39, 2.4], 0.008, 0xdfe2e4, { mat: 'metal' }); }
    cloth('z', 2.32, 2.48, [[6.652, 0.95], [6.651, 1.262], [6.647, 1.276], [6.642, 1.262], [6.639, 0.9]], 0xd9cfae, { n: 4, wobble: 0.003 });
    item('tooth brushes', 'on', 0.902); cyl(6.5, 0.902, 1.4, 0.032, 0.095, 0xe9e7df, { mat: 'satin', r2: 0.036 }); rod([6.49, 0.91, 1.4], [6.47, 1.07, 1.385], 0.005, 0x3c76a8, { mat: 'satin', seg: 5 }); rod([6.505, 0.91, 1.405], [6.525, 1.075, 1.42], 0.005, 0xc2452f, { mat: 'satin', seg: 5 }); rod([6.5, 0.91, 1.39], [6.5, 1.05, 1.37], 0.0045, 0x4f9a58, { mat: 'satin', seg: 5 });
    item('soap', 'on', 0.902); box(6.5, 0.902, 1.89, 0.05, 0.022, 0.08, 0xc9d6b4, { round: 0.009, mat: 'satin' });
    cluster('bath toilet', 4.9, 1.0, 2.7);
    item('toilet paper', 'wall'); rod([4.799, 0.7, 2.33], [4.87, 0.7, 2.33], 0.006, 0xdfe2e4, { mat: 'metal' }); rod([4.87, 0.7, 2.33], [4.87, 0.7, 2.2], 0.006, 0xdfe2e4, { mat: 'metal' }); cyl(4.87, 0.7, 2.2, 0.052, 0.1, 0xf0eee6, { rx: PI / 2, cell: 'nap' });
    item('spare roll', 'on', 0.703); cyl(4.985, 0.703, 2.64, 0.052, 0.1, 0xf0eee6, { cell: 'nap' }); cyl(4.985, 0.803, 2.64, 0.02, 0.001, 0x9a8a70);   // (on the tank's lid)
    item('bath shelf', 'wall'); box(4.848, 1.5, 2.76, 0.16, 0.02, 0.54, 0x9c6b3c, { mat: 'satin', cast: true }); for (const z of [2.56, 2.96]) box(4.83, 1.41, z, 0.12, 0.09, 0.016, 0x9c6b3c, { mat: 'satin' });
    for (let i = 0; i < 3; i++) box(4.85, 1.52 + i * 0.05, 2.66, 0.14, 0.05, 0.24, [0x4f7f86, 0xe2dccb, 0x8e4a5c][i], { round: 0.02, cell: 'nap' });
    cyl(4.85, 1.52, 2.9, 0.052, 0.1, 0xf0eee6, { cell: 'nap' }); cyl(4.85, 1.52, 2.99, 0.03, 0.12, 0x9fc0b4, { mat: 'satin', r2: 0.02 });
    model('d_plunger', { x: 4.94, z: 3.44 }); foot('plunger', 4.84, 5.04, 3.34, 3.54, 0.42);
    cluster('tub things', 6.3, 0.585, 4.2);
    model('d_duck', { x: 6.25, y: 0.585, z: 3.83, s: 0.4, rot: 2.2, kind: 'on' });
    item('shampoo', 'on', 0.585); cyl(6.4, 0.585, 4.46, 0.03, 0.17, 0xd9c9a0, { mat: 'satin', r2: 0.024 }); cyl(6.4, 0.755, 4.46, 0.015, 0.025, 0x3a3a3a, { mat: 'satin' }); cyl(6.3, 0.585, 4.47, 0.027, 0.2, 0x4f6a8a, { mat: 'satin' }); cyl(6.3, 0.785, 4.47, 0.012, 0.02, 0xe8e6de, { mat: 'satin' });
  }

  // ---------- Mom and Dad's room ----------
  {
    cluster('night stand', -7.76, 0.6, -0.23);
    model('d_alarm', { x: -7.8, y: 0.6, z: -0.37, rot: PI / 2 - 0.25, kind: 'on' });
    item('bedside book', 'on', 0.6); book(-7.72, 0.6, -0.12, 0.13, 0.03, 0.195, 'cv_novel', 0xd8d0b8, 0.25); mug(-7.9, 0.6, -0.1, 0xe8e2d2, 2.4);
    cluster('dresser top', -5.4, 0.655, -3.52);
    const ty = 0.655;
    model('d_frame', { x: -5.72, y: ty, z: -3.55, rot: -PI / 2 + 0.25, kind: 'on', after: (h) => photoIn(h, 'grandma') }); model('d_frame', { x: -5.46, y: ty, z: -3.58, rot: -PI / 2 - 0.2, s: 0.8, kind: 'on', after: (h) => photoIn(h, 'porch') });
    item('jewellery box', 'on', ty); box(-5.08, ty, -3.53, 0.2, 0.075, 0.13, 0x4a2c1c, { round: 0.008, mat: 'satin', ry: 0.1, cast: true }); box(-5.08, ty + 0.035, -3.462, 0.03, 0.012, 0.006, 0xb9a36a, { mat: 'metal', ry: 0.1 });
    cyl(-4.94, ty, -3.6, 0.022, 0.07, 0x9a6a3a, { mat: 'satin', r2: 0.016 }); cyl(-4.94, ty + 0.07, -3.6, 0.009, 0.02, 0xb9a36a, { mat: 'metal' }); cyl(-5.26, ty, -3.45, 0.03, 0.045, 0xd9b8c4, { mat: 'satin' });
    model('d_vase', { x: -5.9, y: ty, z: -3.6, s: 0.75, kind: 'on' });
    // the mirror over the dresser
    cluster('parents walls', -5.4, 1.4, -3.73, { far: 0 });
    item('mirror', 'wall'); box(-5.4, 0.98, -3.726, 0.78, 0.86, 0.024, 0x6b4a2c, { mat: 'satin', cast: true });
    { const glass = M.mirror.clone(); glass.color.set(0x4e5458); glass.envMapIntensity = 0.3;   // (dimmer than the bathroom's: a mirror with only the sky to show reads as a window by day)
      const g = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 0.76), glass); g.position.set(-5.4, 1.41, -3.712); g.userData.decorRoom = 'parents'; house.add(g); }
    cluster('parents art', -8.0, 1.7, 0.75);
    item('lake print', 'wall'); picture('z', -8.01, 1, 0.75, 1.74, 0.72, 0.463, 'pr_lake', { frame: 0x6b4a2c, fw: 0.045 });
    cluster('parents east wall', -2.82, 1.6, 3.3);
    item('barn print', 'wall'); picture('z', -2.814, -1, 3.3, 1.62, 0.48, 0.36, 'pr_barn', { frame: 0x3a2a1c });
    // the chair in the corner with the day's clothes on it, the hamper, slippers by the bed
    model('chair', { x: -7.52, z: 4.12, rot: 2.5 }); foot('bedroom chair', -7.86, -7.2, 3.82, 4.44, 0.96);
    cluster('chair clothes', -7.52, 0.47, 4.12);
    item('folded clothes', 'on', 0.447); box(-7.52, 0.447, 4.1, 0.3, 0.035, 0.24, 0x3d4f6a, { round: 0.014, cell: 'nap', ry: 2.5 }); box(-7.52, 0.482, 4.1, 0.28, 0.03, 0.23, 0xc9bfa8, { round: 0.012, cell: 'nap', ry: 2.62 }); rumple(-7.5, 0.51, 4.08, 0.3, 0.24, 0x7a3a2a, { ry: 2.4, seed: 3, h: 0.04 });
    model('d_laundry', { x: -6.72, z: 4.2, s: 0.0025, rot: 0.6 }); foot('hamper', -7.03, -6.41, 3.89, 4.51, 0.62);
    // books on shelves under the barn, a blanket chest with the spare quilt on it, a boat over that
    model('d_shelves', { x: -2.974, z: 3.3, s: 0.8, rot: PI }); foot('bedroom shelves', -3.14, -2.814, 2.85, 3.75, 1.33);
    cluster('bedroom shelves', -3.0, 0.8, 3.3);
    { const bx = -3.104, R1 = 0.932, R2 = 0.632, R3 = 0.33;
      item('bedroom books', 'on', R1); books('z', 3.0, 3.32, bx, -1, R1, { hMax: 0.24 });
      item('bedroom books 2', 'on', R2); books('z', 2.98, 3.2, bx, -1, R2, { hMin: 0.19, hMax: 0.25 }); books('z', 3.4, 3.62, bx, -1, R2, { hMax: 0.23 });
      item('bedroom books 3', 'on', R3); books('z', 3.3, 3.62, bx, -1, R3, { hMax: 0.25 });
      item('bedroom stack', 'on', R3); for (let i = 0; i < 3; i++) book(-3.0, R3 + i * 0.03, 3.1, 0.2, 0.029, 0.15, i % 2 ? 'cv_note' : 'cv_novel', [0x5a2326, 0x27324a, 0x8a7a52][i], PI / 2 + (i - 1) * 0.07);
      item('sewing box', 'on', R1); box(-3.0, R1, 3.5, 0.15, 0.1, 0.2, 0x8e4a5c, { round: 0.01, cell: 'nap', cast: true }); box(-3.0, R1 + 0.1, 3.5, 0.156, 0.02, 0.206, 0x6d3a48, { round: 0.008, cell: 'nap' }); }
    cluster('blanket chest', -3.02, 0.3, -0.655, { far: 0 });
    item('blanket chest', 'floor'); box(-3.02, 0, -0.655, 0.38, 0.03, 0.67, 0x3a2618, { mat: 'satin' }); box(-3.02, 0.03, -0.655, 0.4, 0.35, 0.69, 0x6b4a2c, { round: 0.012, mat: 'satin', cast: true }); box(-3.02, 0.38, -0.655, 0.42, 0.035, 0.71, 0x5a3d24, { round: 0.01, mat: 'satin', cast: true });
    box(-3.224, 0.33, -0.655, 0.006, 0.055, 0.04, 0xb9a36a, { mat: 'metal' }); for (const z of [-0.9, -0.41]) box(-3.2215, 0.2, z, 0.004, 0.012, 0.09, 0xb9a36a, { mat: 'metal' });
    box(-3.0, 0.415, -0.6, 0.33, 0.05, 0.46, 0xffffff, { round: 0.02, cell: 'quilt' }); box(-3.0, 0.465, -0.6, 0.32, 0.045, 0.45, 0xffffff, { round: 0.02, cell: 'quilt', ry: 0.04 });
    foot('blanket chest', -3.24, -2.814, -1.01, -0.3, 0.52);
    item('boat print', 'wall'); picture('z', -2.814, -1, -0.655, 1.62, 0.52, 0.404, 'pr_boat', { frame: 0x3a2a1c, fw: 0.04 });
    cluster('slippers', -7.14, 0, 1.5);
    item('slippers', 'flat'); for (const [x, z, a] of [[-7.2, 1.5, 1.5], [-7.19, 1.6, 1.62]]) { box(x, 0, z, 0.095, 0.022, 0.25, 0x5a2a2e, { round: 0.01, ry: a, cell: 'nap' }); box(x - 0.055 * Math.sin(a), 0.02, z - 0.055 * Math.cos(a), 0.1, 0.045, 0.13, 0x6a3236, { round: 0.02, ry: a, cell: 'nap' }); }
  }

  // ---------- the office and the room nobody unpacked ----------
  {
    cluster('office walls', 4.78, 1.55, -3.0);
    item('map', 'wall'); picture('z', 4.768, 1, -2.66, 1.56, 0.56, 0.42, 'pr_map', { frame: 0x2a2018 });
    item('certificate', 'wall'); picture('z', 4.768, 1, -3.36, 1.62, 0.34, 0.265, 'pr_cert', { frame: 0x8a7340, fw: 0.025 });
    cluster('office desk', 5.4, 1.0, -4.0);
    item('desk mug', 'on', 0.775); mug(5.66, 0.775, -3.9, 0x7a2a26, 1.0);
    model('d_clipboard', { x: 5.07, y: 1.404, z: -4.025, rot: 0.15, kind: 'on' });   // (at the cabinet's front edge, clear of the curtain)
    // a box of files he has started on
    cluster('office box', 7.42, 0, -4.0, { far: 0 });
    item('office box', 'floor'); openBox(7.42, 0, -4.0, 0.46, 0.36, 0.4, 0.06, (L, top) => {
      for (let i = 0; i < 7; i++) { const [x, y, z] = L(-0.15 + i * 0.04, top, 0.0); box(x, y, z, 0.03, 0.24 + (i % 3) * 0.02, 0.28, [0x27324a, 0x7a2a26, 0x2f4634, 0x1e1c1c][i % 4], { ry: 0.12, rz: (i % 2 ? 0.05 : -0.04), mat: 'satin' }); }
      for (let i = 0; i < 3; i++) { const [x, y, z] = L(0.16, top, -0.1 + i * 0.1); box(x, y, z, 0.08, 0.2, 0.012, 0xc9ab72, { ry: 0.06 + 0.2 * i }); } });
    foot('office box', 7.04, 7.79, -4.41, -3.63, 0.62);
    // the spare room: a suitcase, two more taped boxes on the stacks, pictures not hung yet
    model('d_suitcase', { x: 11.116, z: -3.2, rot: -PI / 2 }); foot('suitcase', 10.98, 11.243, -3.57, -2.83, 0.57);
    model('d_cardbox', { x: 9.2, y: 0.42, z: -1.5, rot: PI / 2 + 0.06, kind: 'on' }); model('d_cardbox', { x: 9.32, y: 0.45, z: -4.165, rot: PI / 2 - 0.1, kind: 'on' });
    cluster('spare frames', 11.18, 0.25, -1.95, { far: 0 });
    item('leaning frames', 'floor');
    { const lean = (z, w, h, cell, tip, off) => { const m = new THREE.Matrix4().compose(new THREE.Vector3(11.243 - off, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -PI / 2, 0)).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-tip, 0, 0))), new THREE.Vector3(1, 1, 1));
        const f = new THREE.BoxGeometry(w + 0.07, h + 0.07, 0.022); f.translate(0, (h + 0.07) / 2, 0.011); add(f, 0x3a2a1c, { mat: 'satin', cast: true, m });
        const p = new THREE.PlaneGeometry(w, h); p.translate(0, (h + 0.07) / 2, 0.0235); if (cell) add(p, 0xffffff, { cell, m }); else { add(p, 0x8a7458, { m }); const wr = new THREE.BoxGeometry(w * 0.7, 0.003, 0.002); wr.translate(0, (h + 0.07) * 0.7, 0.025); add(wr, 0x9a9a94, { mat: 'metal', m }); } };
      // the one behind rests its top edge on the wall (its foot out by its height times the sine of its lean), the one in front leans
      // on the first one's face, its back to the room
      lean(-1.98, 0.4, 0.4, 'pr_bird', 0.2, 0.47 * Math.sin(0.2) + 0.001); lean(-1.9, 0.3, 0.38, null, 0.27, 0.15); }
    foot('leaning frames', 11.05, 11.243, -2.26, -1.66, 0.45);
  }

  // ---------- the laundry ----------
  {
    cluster('laundry shelf', -4.35, B + 1.6, 0.5);
    model('d_gallon', { x: -4.55, y: B + 1.525, z: 0.49, rot: 0.3, kind: 'on' }); model('d_bleach', { x: -4.33, y: B + 1.525, z: 0.5, rot: -0.2, kind: 'on' });
    item('soap powder', 'on', B + 1.525); box(-4.1, B + 1.525, 0.5, 0.16, 0.22, 0.07, 0x2f5a9a, { ry: 0.1, faces: [null, null, null, null, 'suds', null], cast: true });
    model('d_cleaner', { x: -7.55, y: B + 0.9, z: 1.45, rot: 1.2, kind: 'on' });
    model('d_laundry', { x: -7.62, y: B, z: 3.45, s: 0.0025, rot: 2.0 }); foot('laundry basket', -7.92, -7.32, 3.15, 3.75, 0, cellar);
    // a folding rack with the things that do not go in the dryer
    cluster('drying rack', -7.5, B + 0.5, 0.66, { far: 0 });
    item('drying rack', 'floor', B);
    { const x0 = -7.8, x1 = -7.22, zc = 0.66, st = 0xd8d8d2, top = B + 0.98;
      for (const x of [x0, x1]) { rod([x, B, zc - 0.26], [x, top, zc + 0.2], 0.009, st, { mat: 'satin', cast: true }); rod([x, B, zc + 0.26], [x, top, zc - 0.2], 0.009, st, { mat: 'satin', cast: true }); }
      const rails = [[zc - 0.2, top], [zc - 0.07, top], [zc + 0.07, top], [zc + 0.2, top], [zc - 0.13, B + 0.6], [zc + 0.13, B + 0.6]]; for (const [z, y] of rails) rod([x0, y, z], [x1, y, z], 0.006, st, { mat: 'satin' });
      cloth('x', -7.72, -7.5, [[zc - 0.212, B + 0.62], [zc - 0.208, top - 0.01], [zc - 0.2, top + 0.008], [zc - 0.192, top - 0.01], [zc - 0.188, B + 0.55]], 0x4f7f86, { cast: true, n: 5 });
      cloth('x', -7.46, -7.28, [[zc + 0.058, B + 0.7], [zc + 0.062, top - 0.01], [zc + 0.07, top + 0.008], [zc + 0.078, top - 0.01], [zc + 0.082, B + 0.66]], 0xe2dccb, { cast: true, n: 5 });
      cloth('x', -7.7, -7.52, [[zc + 0.188, B + 0.74], [zc + 0.192, top - 0.01], [zc + 0.2, top + 0.008], [zc + 0.208, top - 0.01], [zc + 0.212, B + 0.7]], 0x8e4a5c, { n: 4 }); }
    foot('drying rack', -7.85, -7.17, 0.37, 0.95, 0, cellar);
    // the ironing board folded against the wall by the rack, towels folded on the washer
    cluster('ironing board', -6.5, B + 0.6, 0.5, { far: 0 });
    item('ironing board', 'floor', B);
    { const t = 0.12, x = -6.5, z0 = 0.56, P = (u, sAlong, out) => [x + u, B + sAlong * Math.cos(t) + out * Math.sin(t), z0 - sAlong * Math.sin(t) + out * Math.cos(t)];
      const sh = new THREE.Shape(); sh.moveTo(-0.18, 0); sh.lineTo(0.18, 0); sh.lineTo(0.18, 0.92); sh.quadraticCurveTo(0.17, 1.27, 0, 1.3); sh.quadraticCurveTo(-0.17, 1.27, -0.18, 0.92); sh.closePath();   // (its nose up)
      const bd = new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: false, curveSegments: 6 }); bd.translate(0, 0, -0.015); add(bd, 0x8fa3ad, { cast: true, m: M4(x, B, z0, 0, -t) });
      box(x, B + 0.002, z0 + 0.001, 0.366, 0.05, 0.034, 0x5f6f7a, { rx: -t });
      for (const s of [-1, 1]) { rod(P(s * 0.12, 0.02, 0.028), P(-s * 0.1, 1.0, 0.028), 0.011, 0x6f7376, { mat: 'metal' }); rod(P(s * 0.1, 0.02, 0.028), P(s * 0.17, 0.02, 0.028), 0.012, 0x2a2a2a, {}); }
      rod(P(-0.1, 0.62, 0.036), P(0.1, 0.62, 0.036), 0.008, 0x6f7376, { mat: 'metal' }); }
    foot('ironing board', -6.72, -6.28, 0.37, 0.64, 0, cellar);
    cluster('washer top', -7.62, B + 0.9, 2.5);
    item('folded towels', 'on', -1.51); for (let i = 0; i < 3; i++) box(-7.62, -1.51 + i * 0.055, 2.52, 0.3, 0.055, 0.4, [0xe2dccb, 0x4f7f86, 0xe2dccb][i], { round: 0.022, cell: 'nap', ry: (i - 1) * 0.05, cast: i === 2 });
  }

  // ---------- the garage ----------
  {
    const by = 0.88;
    cluster('bench', -12.0, by, -13.1, { parent: yard });
    model('d_boombox', { x: -11.25, y: by, z: -13.1, s: 0.8, rot: 0.15, kind: 'on', parent: yard });
    model('d_toolbox', { x: -12.75, y: by, z: -13.08, rot: -0.2, kind: 'on', parent: yard });
    model('d_spraycans', { x: -12.05, y: by, z: -13.22, rot: 0.4, kind: 'on', parent: yard });
    model('d_tin', { x: -13.2, y: by, z: -13.15, s: 1.6, kind: 'on', parent: yard });
    item('rag', 'on', by); rumple(-11.8, by, -12.98, 0.26, 0.2, 0x8a3a30, { seed: 2, ry: 0.5, h: 0.025 });
    // tools on the board over the bench
    item('peg board', 'wall'); box(-12.05, 1.26, -13.366, 1.74, 0.52, 0.008, 0x8a6a48, { faces: [null, null, null, null, 'pegboard', null] });
    // what he made himself hangs with the bought tools: a level under the saw, a square, a brush
    box(-12.55, 1.31, -13.351, 0.5, 0.05, 0.022, 0xd9a426, { mat: 'satin', cast: true }); box(-12.55, 1.322, -13.3505, 0.05, 0.026, 0.023, 0x9fc86a, { mat: 'satin' }); for (const x of [-12.74, -12.36]) box(x, 1.322, -13.3505, 0.03, 0.026, 0.023, 0x9fc86a, { mat: 'satin' });
    box(-12.2, 1.32, -13.359, 0.035, 0.3, 0.003, 0xb9b6ae, { mat: 'metal' }); box(-12.14, 1.3, -13.354, 0.17, 0.035, 0.014, 0x7a5232, { mat: 'satin' });
    box(-11.78, 1.5, -13.355, 0.022, 0.15, 0.012, 0x9c6b3c, { mat: 'satin' }); box(-11.78, 1.465, -13.354, 0.055, 0.035, 0.015, 0xb9b6ae, { mat: 'metal' }); box(-11.78, 1.385, -13.3545, 0.055, 0.08, 0.013, 0x2a2622, { cell: 'nap' });
    model('d_saw', { x: -12.55, y: 1.44, z: -13.34, rot: PI / 2, kind: 'wall', parent: yard });
    model('d_hammer', { x: -11.95, y: 1.36, z: -13.348, kind: 'wall', parent: yard });
    model('d_wrench', { x: -11.6, y: 1.34, z: -13.35, rx: PI / 2, kind: 'wall', parent: yard });
    model('d_screwdriver', { x: -11.3, y: 1.4, z: -13.345, kind: 'wall', parent: yard });
    for (const [x, y] of [[-12.4, 1.6], [-12.7, 1.6], [-11.95, 1.66], [-11.6, 1.69], [-11.3, 1.67], [-12.2, 1.625], [-11.78, 1.655], [-12.72, 1.365], [-12.38, 1.365]]) rod([x, y, -13.362], [x, y + 0.012, -13.33], 0.004, 0x9a9a9a, { mat: 'metal', seg: 5 });
    // shelves, the ladder, the mower, a bike, things on the walls
    model('d_gshelves', { x: -13.657, z: -11.8, s: 0.085, rot: PI / 2, parent: yard }); foot('garage shelves', -13.88, -13.43, -12.3, -11.3, 1.82);
    for (const [n, x, y, z, r, sc] of [['d_cleaner', -13.66, 0.114, -12.08, 1.3, 1], ['d_gallon', -13.68, 0.114, -11.8, 1.9, 1], ['d_oiltin', -13.66, 0.114, -11.52, 1.5, 1], ['d_tin', -13.66, 0.544, -12.1, 0, 1.7], ['d_tin', -13.68, 0.544, -11.9, 2, 1.7], ['d_spray', -13.67, 0.544, -11.55, 1.7, 1], ['d_spraycans', -13.68, 0.974, -11.5, 1.4, 1], ['d_cardbox', -13.66, 1.404, -11.85, 0.08, 0.9]])
      model(n, { x, y, z, rot: r, s: sc, kind: 'on', parent: yard });
    cluster('garage shelf', -13.66, 1.0, -11.8, { parent: yard });
    item('shelf jars', 'on', 0.974); for (const [z, c] of [[-12.12, 0x8a6a48], [-12.0, 0x5a6a4a], [-11.88, 0x6a4a3a]]) { cyl(-13.68, 0.974, z, 0.045, 0.11, c, { mat: 'satin' }); cyl(-13.68, 1.084, z, 0.046, 0.012, 0x9a9a94, { mat: 'metal' }); }
    [-12.12, -12.0, -11.88].forEach((z, i) => box(-13.6355, 1.008, z, 0.002, 0.03, 0.04, 0xd9cfa6, { faces: [['lbl', [i / 3, 0, (i + 1) / 3, 1]], null, null, null, null, null] }));   // (what is in each, on a strip of tape)
    model('d_cement', { x: -10.2, z: -13.06, parent: yard }); foot('cement', -10.44, -9.96, -13.43, -12.69, 0.18);
    model('d_ladder', { x: -13.36, z: -10.66, parent: yard }); foot('ladder', -13.88, -12.85, -10.99, -10.33, 1.72);
    model('d_mower', { x: -9.7, z: -12.65, s: 0.0032, parent: yard }); foot('mower', -9.95, -9.45, -13.43, -11.87, 1.0);
    model('d_bike', { x: -11.8, z: -7.47, s: 0.286, rot: PI / 2, rz: 0.12, parent: yard }); foot('bike', -12.74, -10.86, -7.83, -7.14, 1.15);   // (leant on the wall)
    model('d_jerrycan', { x: -13.7, z: -12.5, rot: 0.3, parent: yard }); foot('gas can', -13.88, -13.5, -12.7, -12.3, 0.32);
    cluster('garage walls', -13.87, 2.0, -11.2, { parent: yard, far: 0 });
    item('tin sign', 'wall'); picture('z', -13.88, 1, -11.8, 2.2, 0.5, 0.31, 'tinsign', { frame: 0x5a4a30, depth: 0.004, fw: 0.004, mat: 'satin' });
    item('old plate', 'wall'); picture('z', -13.88, 1, -10.66, 2.0, 0.3, 0.15, 'plate', { frame: 0x9a9a94, depth: 0.003, fw: 0.002, mat: 'satin', tilt: 0.05 });
  }

  // ---------- outside ----------
  {
    // the hose in a loose coil on the grass under its tap, between the office window and the spare room's
    { const G = -0.015, hc = 0x3f6a40; cluster('hose', 7.4, 0, -4.95, { parent: yard });
      item('hose', 'flat', G);
      [[7.4, -4.97, 0.2], [7.412, -4.978, 0.188], [7.394, -4.962, 0.204]].forEach(([x, z, r], i) => { const g = new THREE.TorusGeometry(r, 0.013, 6, 22); g.rotateX(PI / 2); add(g, hc, { mat: 'satin', cast: true, m: M4(x, G + 0.013 + i * 0.0215, z, i * 0.9) }); });
      rod([7.21, G + 0.013, -4.9], [7.25, G + 0.013, -4.64], 0.013, hc, { mat: 'satin' }); rod([7.59, G + 0.035, -5.02], [7.8, G + 0.014, -5.13], 0.013, hc, { mat: 'satin' }); rod([7.8, G + 0.014, -5.13], [7.9, G + 0.014, -5.18], 0.011, 0xb9a36a, { mat: 'metal' });
      item('tap', 'wall'); rod([7.25, G + 0.013, -4.64], [7.25, 0.4, -4.635], 0.013, hc, { mat: 'satin' }); rod([7.25, 0.44, -4.58], [7.25, 0.44, -4.64], 0.012, 0xb9a36a, { mat: 'metal' }); rod([7.25, 0.445, -4.635], [7.25, 0.385, -4.635], 0.011, 0xb9a36a, { mat: 'metal' });
      box(7.25, 0.452, -4.625, 0.05, 0.006, 0.012, 0x7a2a26, { mat: 'metal' }); }
    model('d_wateringcan', { x: 4.44, z: -4.96, rot: 0.8, parent: yard }); foot('watering can', 4.2, 4.68, -5.18, -4.74, 0.2);
    model('d_porchchair', { x: 5.75, z: -5.15, rot: PI, parent: yard }); foot('porch chair', 5.42, 6.08, -5.48, -4.82, 0.88);
    model('d_bmx', { x: 8.9, z: -4.95, s: 0.145, rx: 0.14, parent: yard }); foot('your bike', 8.22, 9.58, -5.3, -4.62, 0.92);
    for (const x of [2.27, 3.93]) { model('d_claypot', { x, y: 0.14, z: -4.82, rot: x, parent: yard }); foot('flower pot', x - 0.14, x + 0.14, -4.96, -4.68, 0.55); }
    scatter(yard, 'shrub', [2.27, 3.93].map((x, i) => new THREE.Matrix4().compose(new THREE.Vector3(x, 0.14 + 0.19, -4.82), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * 2), new THREE.Vector3(0.62, 0.7, 0.62))), { cast: false });
    cluster('front step', 3.1, 0.14, -5.0, { parent: yard, far: 0 });
    item('door mat', 'flat', 0.14); box(3.1, 0.14, -5.06, 0.76, 0.012, 0.46, 0x6b5234, { ry: PI, faces: [null, null, 'doormat', null, null, null] });   // (read from the path up to the door)
    item('pot soil', 'in', 0.14); for (const x of [2.27, 3.93]) cyl(x, 0.14 + 0.17, -4.82, 0.1, 0.03, 0x3a2c20, {});
    model('d_handtruck', { x: 6.1, y: -0.015, z: -15.4, rot: -2.2, parent: yard }); foot('hand truck', 5.7, 6.5, -15.8, -15.0, 1.4);   // (on the grass by the drive, clear of the way down it past the truck)
    model('d_bin', { x: -0.76, z: 5.55, rot: 1.0, parent: yard }); foot('dustbin', -1.08, -0.44, 5.23, 5.87, 0.92);
    model('d_boots', { x: -0.97, z: 4.95, rot: PI + 0.3, parent: yard }); foot('boots', -1.14, -0.8, 4.79, 5.11, 0.38);
  }

  // ---------- one mesh per material for each place ----------
  for (const c of clusters) {
    if (!c.parts.size) continue;
    const g = new THREE.Group(); g.name = 'decor:' + c.name; g.position.copy(c.pos); if (PHONE && c.far) g.userData.farCull = c.far; c.parent.add(g);
    for (const [key, list] of c.parts) { const [mat, cast] = key.split('|'); const mesh = new THREE.Mesh(mergeGeometries(list, false), mats[mat]); mesh.castShadow = cast === 'c' && !PHONE; mesh.receiveShadow = true; if (c.parent === house) mesh.userData.decorRoom = roomAt(c.pos.x, c.pos.z, c.pos.y); g.add(mesh); list.forEach((x) => x.dispose()); }
  }
  return { items, ready: Promise.all(pending), mats };
}
