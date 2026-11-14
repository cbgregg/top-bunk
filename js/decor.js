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
import { BASEMENT, roomAt } from './world.js';

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
  // middle. frame: a moulding round it (its colour), tape: stuck up with tape instead
  const picture = (axis, at, dir, c, y, w, h, cell, { frame = 0x3a2a1c, depth = 0.022, fw = 0.035, tape = false, tilt = 0, mat = 'matte', sub = null } = {}) => {
    const place = (g, off) => { g.rotateZ(tilt); if (axis === 'x') { if (dir < 0) g.rotateY(Math.PI); g.translate(c, y, at + dir * off); } else { g.rotateY(dir > 0 ? Math.PI / 2 : -Math.PI / 2); g.translate(at + dir * off, y, c); } return g; };
    if (!tape) { const f = new THREE.BoxGeometry(w + fw * 2, h + fw * 2, depth); add(place(f, depth / 2), frame, { mat: 'satin', cast: true }); }
    add(place(new THREE.PlaneGeometry(w, h), tape ? 0.004 : depth + 0.002), 0xffffff, { cell, sub, mat });
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
      if (PHONE && Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z) < 0.6) holder.userData.farCull = 9;
      if (parent === house) { const room = roomAt(x, z, y); holder.traverse((o) => { if (o.isMesh) o.userData.decorRoom = room; }); }   // (cull.js: drawn only where its room shows)
      if (after) after(holder, m);
    }).catch((e) => console.warn('prop failed:', name, e)));
    return holder;
  };
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
    model('d_floorlamp', { x: -2.44, z: -3.445, s: 0.78 }); foot('floor lamp', -2.6, -2.28, -3.6, -3.29, 1.56);
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
    for (const [x, z, r, h] of [[0.64, 4.4, 0.075, 0.2], [0.815, 4.41, 0.065, 0.17], [0.97, 4.42, 0.055, 0.14]]) { cyl(x, cy, z, r, h, 0xd8d0bc, { mat: 'satin', seg: 18, cast: true }); cyl(x, cy + h * 0.45, z, r + 0.001, h * 0.16, 0x6d7f8c, { mat: 'satin', seg: 18 }); cyl(x, cy + h, z, r * 0.96, 0.018, 0x8a6a48, { seg: 18 }); cyl(x, cy + h + 0.018, z, 0.014, 0.016, 0x8a6a48); }
    item('cereal', 'on', cy); box(1.22, cy, 4.445, 0.19, 0.27, 0.06, 0xd9a426, { ry: 0.12, faces: [null, null, null, null, null, 'cer_corn'], cast: true }); box(1.41, cy, 4.44, 0.19, 0.27, 0.06, 0x31507a, { ry: -0.16, faces: [null, null, null, null, null, 'cer_wheat'], cast: true });
    item('paper towels', 'on', cy); cyl(1.66, cy, 4.42, 0.075, 0.014, 0x8a6a48, { seg: 16 }); cyl(1.66, cy + 0.014, 4.42, 0.062, 0.275, 0xf0eee6, { seg: 16, cell: 'nap', cast: true }); cyl(1.66, cy + 0.289, 4.42, 0.009, 0.03, 0x8a6a48);
    model('d_bowl', { x: 0.93, y: cy, z: 4.1, s: 0.9, kind: 'on' });
    for (const [dx, dz, r] of [[-0.05, 0.02, 0.4], [0.05, -0.03, 2.1], [0.0, 0.07, 4.0]]) model('d_lemon', { x: 0.93 + dx, y: cy + 0.03, z: 4.1 + dz, rot: r, rx: 1.4, kind: 'in' });
    item('apples', 'in', cy); ball(0.88, cy + 0.075, 4.06, 0.036, 0x8e2a22, { mat: 'satin', scale: [1, 0.9, 1] }); ball(0.99, cy + 0.072, 4.13, 0.034, 0x9aa23c, { mat: 'satin', scale: [1, 0.9, 1] });
    item('cookbook', 'on', cy); book(1.37, cy, 4.07, 0.2, 0.024, 0.26, 'cv_cook', 0xe6dcc0, 0.28);
    item('mail', 'on', cy); box(1.76, cy, 4.03, 0.23, 0.003, 0.11, 0xece8dc, { ry: 0.3, faces: [null, null, 'env', null, null, null] }); box(1.79, cy + 0.003, 4.05, 0.23, 0.003, 0.11, 0xc9ab72, { ry: -0.1, faces: [null, null, 'env2', null, null, null] }); box(1.74, cy + 0.006, 4.0, 0.1, 0.002, 0.135, 0xc2452f, { ry: 0.9, faces: [null, null, 'flyer', null, null, null] });
    item('keys', 'on', cy); { const g = new THREE.TorusGeometry(0.014, 0.0025, 5, 12); g.rotateX(PI / 2); add(g, 0xb9b6ae, { mat: 'metal', m: M4(1.95, cy + 0.003, 4.12) }); box(1.975, cy, 4.13, 0.05, 0.003, 0.012, 0xb9a36a, { mat: 'metal', ry: 0.5 }); box(1.97, cy + 0.003, 4.105, 0.05, 0.003, 0.012, 0xb9b6ae, { mat: 'metal', ry: -0.3 }); box(1.925, cy, 4.14, 0.03, 0.008, 0.02, 0x7a2a26, { mat: 'satin', ry: 0.8 }); }
    item('dish soap', 'on', cy); cyl(3.16, cy, 4.45, 0.03, 0.14, 0x4f9a58, { mat: 'satin', r2: 0.026 }); cyl(3.16, cy + 0.14, 4.45, 0.012, 0.03, 0xe8e6de, { mat: 'satin' }); box(3.17, cy, 4.33, 0.11, 0.03, 0.07, 0xd6b23c, { round: 0.008, cell: 'nap', ry: 0.2 }); box(3.17, cy + 0.03, 4.33, 0.11, 0.008, 0.07, 0x3f6a40, { cell: 'nap', ry: 0.2 });
    cluster('kitchen floor', 2.6, 0, 3.55, { far: 0 });
    item('sink mat', 'flat'); box(2.57, 0, 3.56, 0.9, 0.01, 0.5, 0x6b7478, { faces: [null, null, 'ragrug', null, null, null], tint: 0xc0b8a8 });
    // the towel over the oven door's handle
    cluster('stove towel', 3.82, 0.6, 2.13);
    item('dish towel', 'wall'); cloth('z', 2.02, 2.24, [[3.84, 0.52], [3.838, 0.69], [3.826, 0.722], [3.812, 0.69], [3.809, 0.42]], 0xe6dfcc, { wobble: 0.002 });
    for (const y of [0.45, 0.475]) box(3.8075, y, 2.13, 0.002, 0.012, 0.22, 0x9a3a32, { cell: 'nap' });
    // on the refrigerator's door
    cluster('fridge door', 3.8, 1.4, 1.15);
    item('fridge papers', 'wall'); picture('z', 3.802, -1, 1.02, 1.5, 0.2, 0.15, 'draw_dog', { tape: true, tilt: 0.05 }); picture('z', 3.802, -1, 1.36, 1.42, 0.085, 0.136, 'list', { tape: true, tilt: -0.04 }); picture('z', 3.802, -1, 1.33, 1.16, 0.1, 0.133, 'flyer', { tape: true, tilt: 0.03 });
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
  }

  // ---------- the hall ----------
  {
    cluster('hall runner', 8.1, 0, -0.42, { far: 0 });
    item('hall runner', 'flat'); for (let i = 0; i < 4; i++) box(5.92 + i * 1.44, 0, -0.42, 1.44, 0.004, 0.7, 0x4a2422, { faces: [null, null, ['runner', null, 1], null, null, null], tint: 0xb0a090 });
  }

  // ---------- one mesh per material for each place ----------
  for (const c of clusters) {
    if (!c.parts.size) continue;
    const g = new THREE.Group(); g.name = 'decor:' + c.name; g.position.copy(c.pos); if (PHONE && c.far) g.userData.farCull = c.far; c.parent.add(g);
    for (const [key, list] of c.parts) { const [mat, cast] = key.split('|'); const mesh = new THREE.Mesh(mergeGeometries(list, false), mats[mat]); mesh.castShadow = cast === 'c' && !PHONE; mesh.receiveShadow = true; if (c.parent === house) mesh.userData.decorRoom = roomAt(c.pos.x, c.pos.z, c.pos.y); g.add(mesh); list.forEach((x) => x.dispose()); }
  }
  return { items, ready: Promise.all(pending), mats };
}
