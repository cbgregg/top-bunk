// The barn as a place, and the field gate on the way to it.
//
// world.js sets the American Old Barn model (barn.glb: walls, six posts, two trusses and a roof, as one shell) out in the field at
// (-64, -12) with one solid block over the whole of it. This module registers a builder with W.plugin at install and makes it a place:
//   - the shell is moved 1.65 m north, so its doorway (2.88 m wide, in the east wall) is centred on the track's end at z -12, and 0.14 m
//     down, so its posts and walls stand on the plank floor built here (FLOOR); the shell's own broken floor boards, the loose boards and
//     the heap in its corner are taken out of its mesh when it loads (stripFloor)
//   - the block goes (removeSolid('barnBlock')) and four wall colliders follow the shell's walls, the doorway left open, with a collider
//     for each of its posts
//   - the doorway gets a sliding leaf on an iron track outside the east wall (W.doors.barn): it rolls at 1.0 m/s whoever moves it, with
//     the long iron roll and a bang at either end, and it is swept against whoever stands in its way like every other leaf
//   - inside: a plank floor, two stalls on the north side, a hay loft over the west end with a ladder (its underside in headClear), hay,
//     the Hollis car under its dust sheet (Poly Haven's covered_car) and their furniture under sheets, a crib (under a sheet until
//     W.barn.crib.cover(false)), a child's bike on its side, a dog chain bolted to a post with the collar lying open at the end of it, a
//     bare mattress with the same dent as the bottom bunk, drawings of the tall one and a wallet photo of a boy pinned to a post (and
//     more of them under a brick), the measuring post (8, 9, 10, 11 in a child's hand, then lines with no name up to 2.6 m: W.barn.post
//     .add() draws another, in wet pencil), a feed sack with BEN on it in marker, two sawhorses and a work lamp on a cord (dark until
//     W.barn.lamp.set(true))
//   - the field gate in the yard's west fence (the existing leaf, swung open into the yard) becomes W.doors.gate: setState('open' |
//     'shut'); shut, it is a door collider like any other and a chain holds it
//   - the rain does not fall inside it (a box on W.rainDiscard) and it is a room of its own to the ear (W.barn.inside, which main.js's
//     hearRoom reads)
// Everything here is built in metres in world coordinates (the barn is out in the yard, where plan and world coordinates are the same).
import * as THREE from 'three';
import * as collide from './collide.js';
import { applyPBR } from './pbr.js';
import { loadProp } from './props.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const V3 = THREE.Vector3;
// ---------- where things are ----------
// the shell: world.js places it at (-64, -0.03, -12); it moves by this much (north, and down onto the floor)
export const MODEL = { dy: -0.14, dz: -1.65 };
export const FLOOR = 0.02;                                              // the top of the plank floor
// the shell's walls as rays from inside find them (their innermost faces, 0..3.4 m up, every 5 cm), and the colliders' inner and outer
// faces: 6 cm inside the walls, and out past the outer boards (x -68.77 and -59.06, z -20.18 and -7.24)
export const WALL = { x0: -68.55, x1: -59.33, z0: -20.0, z1: -7.41 };
export const IN = { x0: -68.49, x1: -59.4, z0: -19.94, z1: -7.47 };
export const OUT = { x0: -69.0, x1: -58.95, z0: -20.25, z1: -7.15 };
export const DOOR = { z0: -13.44, z1: -10.56, top: 2.37 };             // the doorway in the east wall: 2.88 m wide, its head 2.37 up
// the shell's six posts, two rows of three under the trusses (footprints 0.18 x 0.22)
export const POSTS = [[-65.77, -17.76], [-62.25, -17.76], [-59.93, -17.76], [-65.77, -9.63], [-62.25, -9.63], [-59.93, -9.63]];
const TIE = 4.68;                                                       // the trusses' tie beams over the post lines
// the loft over the west end: its edge (the girder) at x -66.1..-65.9, its joists' underside 2.97, the girder's 2.75, the floor's top 3.21
export const LOFT = { x0: WALL.x0 + 0.01, x1: -65.9, under: 2.97, girder: 2.75, top: 3.21 };
const LEAF = { travel: 3.02, half: 1.54, x: -59.035, height: 2.45 };    // the sliding leaf: hung outside the east wall, slides south
const RATE = 1.0 / LEAF.travel;                                         // 1.0 m/s, as a share of its travel per second
// the thing's way in and up (js/nav.js's barnDoor / barnMid / barnLoft are appended by the door rules' package; these are where they are)
export const NODES = { barnDoor: [-58.0, -12], barnMid: [-64, -12], barnLoft: [-67.2, -12, LOFT.top] };
// what weather.js leaves dry (the shell's box, eaves and all)
export const RAIN_BOX = { minX: -69.35, maxX: -58.65, minZ: -20.75, maxZ: -6.55, maxY: 7.9, id: 'barn' };
// the shell's broken floor and what lay on it, as the strip finds it once the shell has moved: anything whose middle is inside this box
// and whose top is under 0.76 m
const STRIP = { x0: -68.62, x1: -59.42, z0: -19.95, z1: -7.6, y: 0.76 };
// the measuring post, under the loft's edge on the barn's long axis, facing the door; heights are above the floor
export const POST = { x: -66.0, z: -12.0, w: 0.18 };
const AGES = [[8, 1.27], [9, 1.33], [10, 1.39], [11, 1.44]];             // in a hand learning to write like a seven-year-old's
const NAMELESS = [1.58, 1.74, 1.9, 2.04, 2.17, 2.29, 2.4, 2.49, 2.56, 2.6];
// the gate in the yard's west fence: hinged at (-27, -17.4), 2.75 m long; shut it closes the gap to the post at -14.6
const GATE = { hx: -27, hz: -17.4, w: 2.75, open: 0.9 };

export const inside = (x, z) => x > -68.75 && x < -59.1 && z > -20.15 && z < -7.3;

let G = null;                       // the game, from install
const S = { door: null, gate: null, rolling: false, gateMoving: false, wetT: 0, lampLevel: 0, swayT: 0, built: false };

// ---------- small builders ----------
function worldUV(geo) {   // uvs in world metres, chosen by face normal (as world.js does for its boxes)
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i)), x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (nx >= ny && nx >= nz) uv.setXY(i, z, y); else if (ny >= nx && ny >= nz) uv.setXY(i, x, z); else uv.setXY(i, x, y);
  }
  uv.needsUpdate = true;
}
// a box by its bounds (either order on each axis)
function box(parent, x0, x1, y0, y1, z0, z1, mat, { cast = true, uv = true } = {}) {
  const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  if (uv) worldUV(g);
  const m = new THREE.Mesh(g, mat); m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m;
}
// a beam of section w x h from a to b (its h side toward `up`)
function beam(parent, a, b, w, h, mat, { cast = true, up = null } = {}) {
  const len = a.distanceTo(b), g = new THREE.BoxGeometry(w, h, len); worldUV(g);
  const m = new THREE.Mesh(g, mat); m.position.copy(a).add(b).multiplyScalar(0.5); if (up) m.up.copy(up); m.lookAt(b);
  m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m;
}
// a round bar of radius r from a to b
function rod(parent, a, b, r, mat, { seg = 8, cast = true } = {}) {
  const len = a.distanceTo(b), g = new THREE.CylinderGeometry(r, r, len, seg, 1); g.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(g, mat); m.position.copy(a).add(b).multiplyScalar(0.5); m.lookAt(b);
  m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m;
}
const v = (x, y, z) => new V3(x, y, z);
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, { repeat = null, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
// draw now with whatever face is ready, again once the named web fonts have loaded
function whenFonts(fonts, paint) {
  if (!document.fonts || !document.fonts.load) return;
  if (fonts.every((f) => document.fonts.check(f))) return;
  Promise.all(fonts.map((f) => document.fonts.load(f).catch(() => null))).then(paint).catch(() => {});
}
// the static meshes of a group merged into one mesh per material (and shadow flag): the barn is a few dozen draws, not a few hundred
function bake(group) {
  group.updateMatrixWorld(true);
  const buckets = new Map(), old = [];
  group.traverse((m) => {
    if (!m.isMesh || m.isInstancedMesh || m.userData.keep) return;
    const mats = [].concat(m.material); if (mats.length !== 1) return;
    let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().copy(group.matrixWorld).invert().multiply(m.matrixWorld));
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const key = mats[0].uuid + (m.castShadow ? '|c' : '|n');
    (buckets.get(key) || buckets.set(key, { mat: mats[0], cast: m.castShadow, list: [] }).get(key)).list.push(g);
    old.push(m);
  });
  for (const m of old) { m.parent.remove(m); m.geometry.dispose(); }
  for (const { mat, cast, list } of buckets.values()) { const mesh = new THREE.Mesh(mergeGeometries(list, false), mat); mesh.castShadow = cast; mesh.receiveShadow = true; group.add(mesh); list.forEach((g) => g.dispose()); }
}

// ---------- materials ----------
function materials(ctx) {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const wood = (color, pbr, tint, tile, rough = 0.9) => { const m = std({ color, roughness: rough }); m.userData.worldUV = true; applyPBR(m, pbr, { tint, tile }); return m; };
  const M = {
    floor: wood(0x6f5d4a, 'pine', 0x7a6650, 0.9), floor2: wood(0x655546, 'pine', 0x6c5a49, 0.9), floor3: wood(0x5a4b3d, 'darkwood', 0x9a8670, 1.2),
    beam: wood(0x5c4c3c, 'darkwood', 0xa09078, 1.0), board: wood(0x7a6c5c, 'darkwood', 0xb8a890, 1.1), weathered: ctx.M.fence,
    leaf: wood(0x9c9484, 'pine', 0xa69c8a, 0.8), loft: wood(0x6a5846, 'pine', 0x806a52, 1.0), pine: wood(0xb7a284, 'pine', 0xc4ae8e, 0.9),
    under: std({ color: 0x2a2219, roughness: 1 }),
    iron: std({ color: 0x2b2826, roughness: 0.55, metalness: 0.6 }), rust: std({ color: 0x5a3a26, roughness: 0.75, metalness: 0.35 }),
    paint: std({ color: 0xd2cbb8, roughness: 0.62 }), paintChip: std({ color: 0xb9ad94, roughness: 0.7 }),
    bikeRed: std({ color: 0x7c2620, roughness: 0.42, metalness: 0.25 }), chrome: std({ color: 0x9a9c9e, roughness: 0.32, metalness: 0.85 }),
    rubber: std({ color: 0x1a1918, roughness: 0.85 }), vinyl: std({ color: 0x2a1c18, roughness: 0.5 }), leather: std({ color: 0x4a2e1e, roughness: 0.72 }),
    cord: std({ color: 0x141414, roughness: 0.6 }), brick: ctx.M.brick || std({ color: 0xa0553f, roughness: 0.95 }),
    bulb: std({ color: 0xfff1d0, emissive: 0xffb860, emissiveIntensity: 0, roughness: 0.3 }), cap: std({ color: 0x1c1c1c, roughness: 0.6 }),
  };
  M.paint.userData.worldUV = true; applyPBR(M.paint, 'pine', { keepMap: true, tile: 0.6, normal: 0.6 });   // white paint over pine: the grain shows through
  M.paintChip.userData.worldUV = true; applyPBR(M.paintChip, 'pine', { keepMap: true, tile: 0.6 });
  // the dust sheets: an old canvas drop cloth, and a bedsheet gone the colour of the barn (the linen set gives the weave, not its colour)
  const cloth = (color, tile) => { const m = std({ color, roughness: 1, side: THREE.DoubleSide }); m.userData.worldUV = true; applyPBR(m, 'linen', { keepMap: true, tile, normal: 1.3 }); return m; };
  M.canvas = cloth(0x77705e, 0.45); M.sheet = cloth(0x9d9584, 0.3);
  M.hay = std({ map: hayTex(1), roughness: 1, color: 0xd8d0c0 }); M.hay.map.wrapS = M.hay.map.wrapT = THREE.RepeatWrapping;
  M.straw = std({ map: strawTex(), roughness: 1, alphaTest: 0.5, side: THREE.DoubleSide, color: 0xa89a80 });
  return M;
}
// straw: strands of dry yellow-grey grass, mostly one way, packed
function hayTex(seed) {
  const S = 256, [c, g] = canvas(S, S), r = rng(seed * 7 + 3);
  g.fillStyle = '#4e4330'; g.fillRect(0, 0, S, S);   // twelve-year-old hay: grey-gold gone to brown, dusty
  for (let i = 0; i < 3200; i++) {
    const x = r() * S, y = r() * S, a = (r() - 0.5) * 0.9 + (r() < 0.25 ? Math.PI / 2 : 0), L = 5 + r() * 22, t = r();
    g.strokeStyle = t < 0.4 ? `rgba(${140 + r() * 40},${122 + r() * 30},${86 + r() * 20},0.75)` : t < 0.8 ? `rgba(${100 + r() * 30},${86 + r() * 24},${60 + r() * 16},0.75)` : 'rgba(30,25,18,0.6)';
    g.lineWidth = 0.6 + r() * 1.1; g.beginPath();
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { g.moveTo(x + ox, y + oy); g.lineTo(x + ox + Math.cos(a) * L, y + oy + Math.sin(a) * L); }
    g.stroke();
  }
  return tex(c);
}
// loose straw on the floor: strands on nothing (alpha)
function strawTex() {
  const S = 256, [c, g] = canvas(S, S), r = rng(77);
  for (let i = 0; i < 700; i++) {
    const rr = 0.42 * S * Math.sqrt(r()) * (0.6 + 0.4 * r()), aa = r() * 6.28, cx = S / 2 + Math.cos(aa) * rr, cy = S / 2 + Math.sin(aa) * rr, a = r() * Math.PI, L = 5 + r() * 18;
    g.strokeStyle = `rgba(${120 + r() * 50},${104 + r() * 40},${70 + r() * 24},1)`; g.lineWidth = 0.7 + r() * 0.9;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * L, cy + Math.sin(a) * L); g.stroke();
  }
  return tex(c);
}

// ---------- cloth over things: a dust sheet ----------
// solids: boxes { x0, x1, z0, z1, top } under the sheet; [x0, x1] x [z0, z1] is the top's outline (just outside the solids). The top is a
// height field relaxed toward its neighbours (less a sag) but never below what is under it, so it lies on the tops and dips between
// them, with folds where nothing holds it up; from its whole edge a skirt hangs to the floor, rolled over the edge, folded along its
// length (deeper toward the hem) and its hem lying out on the boards.
function drape({ x0, x1, z0, z1, solids, mat, seed = 1, res = 0.04, sag = 0.003, iters = 90, lift = 0.012, hem = 0.07, skip = null }) {
  const NX = Math.max(2, Math.round((x1 - x0) / res)), NZ = Math.max(2, Math.round((z1 - z0) / res)), r = rng(seed), low = FLOOR + 0.01;
  const at = (i, j) => j * (NX + 1) + i, h0 = new Float32Array((NX + 1) * (NZ + 1)), h = new Float32Array(h0.length);
  for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
    const x = x0 + (x1 - x0) * i / NX, z = z0 + (z1 - z0) * j / NZ; let y = low;
    for (const s of solids) if (x >= s.x0 - 0.02 && x <= s.x1 + 0.02 && z >= s.z0 - 0.02 && z <= s.z1 + 0.02) y = Math.max(y, s.top + lift);
    h0[at(i, j)] = y; h[at(i, j)] = y;
  }
  for (let k = 0; k < iters; k++) for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
    let s = 0, n = 0; const q = at(i, j);
    if (i > 0) { s += h[q - 1]; n++; } if (i < NX) { s += h[q + 1]; n++; } if (j > 0) { s += h[q - NX - 1]; n++; } if (j < NZ) { s += h[q + NX + 1]; n++; }
    h[q] = Math.max(h0[q], s / n - sag);
  }
  const waves = Array.from({ length: 5 }, () => ({ a: r() * Math.PI, f: 9 + r() * 14, p: r() * 6.28, amp: 0.006 + r() * 0.01 }));
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
    const x = x0 + (x1 - x0) * i / NX, z = z0 + (z1 - z0) * j / NZ, q = at(i, j), free = Math.min(1, Math.max(0, (h[q] - h0[q]) / 0.05));
    let y = h[q]; for (const w of waves) y += free * w.amp * Math.sin((x * Math.cos(w.a) + z * Math.sin(w.a)) * w.f + w.p);
    pos.push(x, Math.max(h0[q], y), z); uv.push(x, z);
    if (i < NX && j < NZ) { const a = at(i, j), b = a + 1, c = a + NX + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  }
  // the edge, once round: [top vertex, outward x, outward z, distance along it]
  const ring = [], push = (i, j, ox, oz) => ring.push([at(i, j), ox, oz]);
  for (let i = 0; i < NX; i++) push(i, 0, i === 0 ? -0.707 : 0, i === 0 ? -0.707 : -1);
  for (let j = 0; j < NZ; j++) push(NX, j, j === 0 ? 0.707 : 1, j === 0 ? -0.707 : 0);
  for (let i = NX; i > 0; i--) push(i, NZ, i === NX ? 0.707 : 0, i === NX ? 0.707 : 1);
  for (let j = NZ; j > 0; j--) push(0, j, j === NZ ? -0.707 : -1, j === NZ ? 0.707 : 0);
  const folds = Array.from({ length: 4 }, () => ({ f: 14 + r() * 26, p: r() * 6.28, amp: 0.008 + r() * 0.014 }));
  const NT = 9, base = pos.length / 3; let s = 0;
  ring.forEach(([q, ox, oz], k) => {
    const px = pos[q * 3], py = pos[q * 3 + 1], pz = pos[q * 3 + 2], drop = py - FLOOR;
    if (k) { const [q0] = ring[k - 1]; s += Math.hypot(px - pos[q0 * 3], pz - pos[q0 * 3 + 2]); }
    const wall = skip && skip(px + ox * 0.05, pz + oz * 0.05);   // an edge against a wall: it stops there, tucked in
    let fold = 0; for (const f of folds) fold += f.amp * Math.sin(s * f.f + f.p);
    for (let t = 1; t <= NT; t++) {
      const tt = t / NT, last = t === NT, y = last ? FLOOR + 0.004 : py - drop * Math.pow(tt, 1.08);
      let o = 0.016 * Math.sin(Math.min(1, tt * 4) * Math.PI / 2) + Math.max(-0.01, fold) * Math.pow(tt, 0.8) + (last ? hem * (0.6 + 0.4 * Math.abs(Math.sin(s * 7.3))) : 0);
      if (wall || drop < 0.03) o = Math.min(o, 0.004);
      pos.push(px + ox * o, y, pz + oz * o); uv.push(s, py - (py - y));
    }
  });
  const R = ring.length;
  for (let k = 0; k < R; k++) {
    const k2 = (k + 1) % R;
    for (let t = 0; t < NT; t++) {
      const a = t === 0 ? ring[k][0] : base + k * NT + (t - 1), b = t === 0 ? ring[k2][0] : base + k2 * NT + (t - 1);
      const c = base + k * NT + t, d = base + k2 * NT + t;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; return m;
}

// ---------- the dent: the same body as in the bottom bunk (js/firstnight.js's dent), pressed into a bare mattress ----------
// distance along the body (0 the head .. 1 the heels) and across it, in metres; how deep it goes there
function dentAt(x, z, H, F) {
  const ax = F.x - H.x, az = F.z - H.z, L = Math.hypot(ax, az), ux = ax / L, uz = az / L;
  const dx = x - H.x, dz = z - H.z, t = (dx * ux + dz * uz) / L, d = dx * -uz + dz * ux;
  if (t < -0.08 || t > 1.08) return 0;
  const sm = (a, b, q) => { const u = Math.max(0, Math.min(1, (q - a) / (b - a))); return u * u * (3 - 2 * u); };
  const blob = (cx, w, deep) => { const q2 = (d - cx) / w; return q2 * q2 < 1 ? deep * (1 - q2 * q2) * (1 - q2 * q2) : 0; };
  let depth = 0;
  const torso = sm(0.12, 0.2, t) * (1 - sm(0.5, 0.6, t)); depth = Math.max(depth, torso * blob(0, 0.21 - 0.05 * sm(0.25, 0.45, t), 0.075));
  const hips = sm(0.45, 0.52, t) * (1 - sm(0.6, 0.66, t)); depth = Math.max(depth, hips * blob(0, 0.17, 0.085));
  const legs = sm(0.56, 0.64, t) * (1 - sm(0.97, 1.04, t)), spread = 0.05 + 0.03 * sm(0.6, 1, t);
  depth = Math.max(depth, legs * Math.max(blob(-spread, 0.065, 0.06), blob(spread, 0.065, 0.06)));
  const head = sm(-0.06, 0.0, t) * (1 - sm(0.1, 0.14, t)); depth = Math.max(depth, head * blob(0, 0.1, 0.03));
  const near = Math.abs(d) - 0.2 * torso - 0.15 * legs, rim = (torso + legs) * Math.exp(-((near - 0.04) * (near - 0.04)) / 0.0009) * 0.014;
  return depth - rim;
}

// ---------- the build ----------
function build(ctx) {
  if (S.built) return; S.built = true;
  const { yard, W } = ctx, M = materials(ctx), r = rng(1968);
  const stat = new THREE.Group(); stat.name = 'barnInside'; yard.add(stat);

  // the shell: moved onto the floor and onto the track, its own floor taken out once it loads
  const shell = yard.children.find((o) => o.userData && o.userData.prop === 'barn');
  if (shell) {
    shell.position.y += MODEL.dy; shell.position.z += MODEL.dz;
    loadProp('barn').then(() => { const m = shell.children[0]; if (m) stripFloor(m); }).catch(() => {});
  }
  S.shell = shell;

  // the walls instead of the block: west, north, south, and the east wall either side of the doorway; and the shell's posts
  ctx.removeSolid('barnBlock');
  const wall = (x0, x1, z0, z1) => ctx.solid(x0, x1, z0, z1, { wall: true, maxY: 8, id: 'barnWall' });
  wall(OUT.x0, IN.x0, OUT.z0, OUT.z1); wall(OUT.x0, OUT.x1, OUT.z0, IN.z0); wall(OUT.x0, OUT.x1, IN.z1, OUT.z1);
  wall(IN.x1, OUT.x1, OUT.z0, DOOR.z0); wall(IN.x1, OUT.x1, DOOR.z1, OUT.z1);
  for (const [x, z] of POSTS) ctx.solid(x - 0.09, x + 0.09, z - 0.11, z + 0.11, { maxY: TIE, id: 'barnPost' });
  const solid = (x0, x1, z0, z1, maxY, id) => ctx.solid(Math.min(x0, x1), Math.max(x0, x1), Math.min(z0, z1), Math.max(z0, z1), { maxY, id });

  floor(stat, M, r);
  door(ctx, M);
  stalls(stat, M, solid, r);
  loft(stat, M, solid, ctx, r);
  measuringPost(stat, M, solid);
  hay(stat, M, solid, r);
  // the Hollis car under its dust sheet, nose first into the barn the way it was driven in
  ctx.place(yard, 'covered_car', { x: -62.4, y: FLOOR, z: -15.3, rot: -Math.PI / 2 });
  solid(-64.6, -60.2, -16.2, -14.4, 1.42, 'barnCar');
  furniture(stat, M, solid);
  const crib = cribAt(stat, M, solid);
  bike(stat, M, solid);
  chain(stat, M);
  drawings(stat, M);
  mattress(stat, M, solid);
  const sack = feedSack(stat, M, solid);
  const horses = sawhorses(yard, M, W);
  const lamp = workLamp(yard, M, ctx);
  bake(stat);

  // overheads: the door's head, the loft's underside and its edge, the lamp, the tie beams
  ctx.headClear.add({ minX: IN.x1 - 0.05, maxX: OUT.x1 + 0.05, minZ: DOOR.z0, maxZ: DOOR.z1, y0: DOOR.top, y1: DOOR.top + 0.6, id: 'head:barn' });
  ctx.headClear.add({ minX: IN.x0, maxX: LOFT.x1, minZ: IN.z0, maxZ: IN.z1, y0: LOFT.under, y1: LOFT.top, id: 'barnLoft' });
  ctx.headClear.add({ minX: -66.1, maxX: LOFT.x1, minZ: IN.z0, maxZ: IN.z1, y0: LOFT.girder, y1: LOFT.under, id: 'barnLoftEdge' });
  ctx.headClear.sphere({ x: lamp.at.x, y: lamp.at.y + 0.05, z: lamp.at.z, r: 0.2, id: 'barnLamp' });
  for (const x of [-65.77, -62.25]) ctx.headClear.add({ minX: x - 0.1, maxX: x + 0.1, minZ: IN.z0, maxZ: IN.z1, y0: TIE, y1: TIE + 0.25, id: 'barnTie' });
  // the rain stays out
  ctx.rainDiscard.push({ ...RAIN_BOX });

  const gate = gateLeaf(ctx, M);
  W.barn = { inside, FLOOR, box: { ...IN }, nodes: NODES, door: S.door, gate, lamp, post: S.post, crib, sawhorses: horses, sack, shell };
  return W.barn;
}

// the shell's broken floor, the boards lying on it and the heap in its corner come out of its mesh (its walls, posts and roof stay)
function stripFloor(model) {
  model.updateWorldMatrix(true, true);
  const p = new V3();
  model.traverse((o) => {
    if (!o.isMesh || o.userData.floorStripped || !o.geometry.index) return;
    const g = o.geometry, pos = g.attributes.position, idx = g.index, wp = new Float32Array(pos.count * 3), keep = [];
    for (let i = 0; i < pos.count; i++) { p.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); wp[i * 3] = p.x; wp[i * 3 + 1] = p.y; wp[i * 3 + 2] = p.z; }
    for (let t = 0; t < idx.count; t += 3) {
      const a = idx.getX(t) * 3, b = idx.getX(t + 1) * 3, c = idx.getX(t + 2) * 3;
      const cx = (wp[a] + wp[b] + wp[c]) / 3, cz = (wp[a + 2] + wp[b + 2] + wp[c + 2]) / 3, top = Math.max(wp[a + 1], wp[b + 1], wp[c + 1]);
      if (cx > STRIP.x0 && cx < STRIP.x1 && cz > STRIP.z0 && cz < STRIP.z1 && top < STRIP.y) continue;
      keep.push(idx.getX(t), idx.getX(t + 1), idx.getX(t + 2));
    }
    g.setIndex(keep); o.userData.floorStripped = true; S.stripped = (S.stripped || 0) + idx.count / 3 - keep.length / 3;
  });
}

// ---------- the floor: boards east to west over a dark sub-floor ----------
function floor(stat, M, r) {
  const x0 = -68.74, x1 = -59.12, z0 = -20.14, z1 = -7.3, mats = [M.floor, M.floor, M.floor2, M.floor3];   // run in under the walls
  box(stat, x0, x1, -0.012, 0.002, z0, z1, M.under, { cast: false, uv: false });
  for (let z = z0, row = 0; z < z1 - 0.02; z += 0.198, row++) {
    let x = x0 - r() * 2.4;
    const w = Math.min(0.192, z1 - z), mat = mats[(r() * mats.length) | 0];
    while (x < x1) {
      const L = 2.2 + r() * 2.2, a = Math.max(x, x0), b = Math.min(x + L, x1), dy = (r() - 0.5) * 0.004;
      if (b - a > 0.05) box(stat, a + 0.004, b - 0.004, FLOOR - 0.03, FLOOR + dy, z + 0.003, z + w - 0.003, r() < 0.15 ? M.floor3 : mat, { cast: false });
      x += L;
    }
  }
}

// ---------- the sliding door ----------
function door(ctx, M) {
  const leaf = new THREE.Group(), H = LEAF.height, half = LEAF.half;
  // vertical boards with hairline gaps, worn at the foot; three rails and two braces outside; the iron hangers over the track
  const n = 17, bw = (half * 2) / n;
  for (let i = 0; i < n; i++) { const z = -half + i * bw, foot = 0.03 + (i % 3 === 1 ? 0.012 : 0) + (i % 5 === 2 ? 0.02 : 0); box(leaf, 0, 0.03, foot, H - (i % 4 === 3 ? 0.008 : 0), z + 0.002, z + bw - 0.002, M.leaf); }
  for (const y of [0.22, H / 2 - 0.05, H - 0.2]) box(leaf, 0.03, 0.058, y, y + 0.11, -half + 0.05, half - 0.05, M.board);
  beam(leaf, v(0.044, 0.33, -half + 0.12), v(0.044, H / 2 - 0.05, half - 0.12), 0.028, 0.1, M.board, { up: v(1, 0, 0) });
  beam(leaf, v(0.044, H / 2 + 0.06, -half + 0.12), v(0.044, H - 0.2, half - 0.12), 0.028, 0.1, M.board, { up: v(1, 0, 0) });
  for (const z of [-1.2, 1.2]) {
    box(leaf, 0.058, 0.125, H - 0.06, H - 0.03, z - 0.03, z + 0.03, M.iron);   // the plate out from the leaf's top
    box(leaf, 0.115, 0.125, H - 0.32, H + 0.3, z - 0.03, z + 0.03, M.iron);    // the strap up the front of the track
    box(leaf, 0.058, 0.07, H - 0.32, H - 0.03, z - 0.03, z + 0.03, M.iron);    // and down the leaf, bolted
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.028, 18), M.iron); wheel.rotation.z = Math.PI / 2; wheel.position.set(0.094, H + 0.25, z); wheel.castShadow = true; leaf.add(wheel);
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.05, 8), M.rust); axle.rotation.z = Math.PI / 2; axle.position.set(0.1, H + 0.25, z); leaf.add(axle);
  }
  box(leaf, 0.058, 0.07, 0.95, 1.35, -half + 0.13, -half + 0.16, M.iron);      // the pull, at the north edge
  for (const y of [0.98, 1.32]) box(leaf, 0.058, 0.09, y - 0.015, y + 0.015, -half + 0.13, -half + 0.16, M.iron);
  leaf.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  const d = ctx.mkDoor('barn', LEAF.x, (DOOR.z0 + DOOR.z1) / 2, [0, 0], [0, 1], [IN.x1, OUT.x1, DOOR.z0, DOOR.z1], [-59.2, (DOOR.z0 + DOOR.z1) / 2], false, 0,
    { slide: leaf, travel: LEAF.travel, half, off: 0.05, t: 0.05, height: H });
  ctx.yard.add(leaf);   // mkDoor hangs a sliding leaf in the house's group; this one is out in the yard
  // the track on its brackets across the east wall, with its stops (static, outside the leaf's path)
  const track = new THREE.Group(); track.name = 'barnTrack'; ctx.yard.add(track);
  const tz0 = DOOR.z0 - 0.3, tz1 = -7.38, ty = H + 0.14;
  box(track, -58.955, -58.925, ty, ty + 0.06, tz0, tz1, M.iron);
  for (let z = tz0 + 0.1; z < tz1; z += 1.05) box(track, -59.056, -58.955, ty + 0.005, ty + 0.055, z - 0.025, z + 0.025, M.iron);
  for (const z of [tz0, tz1]) box(track, -58.96, -58.92, ty + 0.06, ty + 0.12, z - 0.02, z + 0.02, M.rust);
  bake(track);
  d.setState = (state, { silent = false } = {}) => { const open = state === 'open' || state === true; d.quiet = silent; ctx.W.setDoor('barn', open, true); return open; };
  d.state = () => (d.target ? 'open' : 'shut');
  S.door = d;
}

// ---------- two stalls on the north side ----------
function stalls(stat, M, solid, r) {
  const zf = -17.76, top = 1.38, wall = WALL.z0 + 0.004;
  // the partitions: boards laid flat between the north wall and the posts, a cap rail on top
  for (const x of [-65.77, -62.25]) {
    for (let y = FLOOR; y < top - 0.05; y += 0.205) box(stat, x - 0.022, x + 0.022, y + 0.004, Math.min(top - 0.05, y + 0.2), wall, zf - 0.13, r() < 0.3 ? M.board : M.weathered);
    box(stat, x - 0.05, x + 0.05, top - 0.05, top, wall, zf - 0.13, M.beam);
    box(stat, x - 0.045, x + 0.045, FLOOR, top + 0.08, wall, wall + 0.09, M.beam);   // the batten against the wall
    solid(x - 0.06, x + 0.06, IN.z0, zf - 0.11, top + 0.1, 'barnStall');
  }
  // the fronts: waist-high boards from post to post, each with its way in
  const front = (a, b) => {
    for (let y = FLOOR; y < 1.05; y += 0.205) box(stat, a, b, y + 0.004, Math.min(1.08, y + 0.2), zf - 0.025, zf + 0.025, r() < 0.4 ? M.board : M.weathered);
    box(stat, a, b, 1.08, 1.13, zf - 0.04, zf + 0.04, M.beam);
    solid(a, b, zf - 0.05, zf + 0.05, 1.15, 'barnStall');
  };
  front(-65.67, -64.95); front(-63.85, -62.34); front(-62.16, -61.55); front(-60.45, -60.02); front(-59.84, WALL.x1 - 0.004);
  for (const x of [-64.95, -63.85, -61.55, -60.45]) box(stat, x - 0.045, x + 0.045, FLOOR, 1.2, zf - 0.045, zf + 0.045, M.beam);   // the gateposts
  // a manger in the west stall: a trough of boards against the wall on two legs, old hay in it
  const zw = WALL.z0 + 0.004, zm = zw + 0.37;
  box(stat, -65.55, -64.45, 0.55, 0.58, zw, zm, M.board); box(stat, -65.55, -64.45, 0.58, 0.92, zm - 0.03, zm, M.board);
  for (const x of [-65.55, -64.48]) box(stat, x, x + 0.03, 0.58, 0.92, zw, zm, M.board);
  for (const x of [-65.5, -64.55]) box(stat, x - 0.03, x + 0.03, FLOOR, 0.55, zm - 0.06, zm, M.beam);
  box(stat, -65.52, -64.48, 0.58, 0.72, zw + 0.02, zm - 0.03, M.hay);
  solid(-65.6, -64.4, IN.z0, zm + 0.06, 0.95, 'barnStall');
}

// ---------- the hay loft over the west end, and its ladder ----------
function loft(stat, M, solid, ctx, r) {
  const { x0, x1, under, girder, top } = LOFT, z0 = WALL.z0 + 0.004, z1 = WALL.z1 - 0.004;
  box(stat, -66.1, x1, girder, under, z0, z1, M.beam);                       // the girder along the edge, wall to wall
  box(stat, x0, x0 + 0.1, girder, under, z0, z1, M.beam);                    // the ledger on the west wall
  for (let z = z0 + 0.1; z < z1 - 0.05; z += 0.6) box(stat, x0 + 0.1, x1, under, top - 0.03, z, z + 0.05, M.beam);   // joists
  for (let x = x0, i = 0; x < x1 - 0.02; x += 0.205, i++) {                  // the floor boards across them, in two lengths each
    const split = z0 + 3 + r() * 5;
    for (const [a, b] of [[z0, split], [split + 0.006, z1]]) box(stat, x + 0.003, Math.min(x + 0.2, x1) - 0.003, top - 0.03, top + (r() - 0.5) * 0.004, a, b, i % 3 ? M.loft : M.floor2);
  }
  // hay up there: a row of bales along the back and some loose over the edge
  for (let z = -19.6; z < -8.3; z += 0.95) { const ox = (r() - 0.5) * 0.05; bale(stat, M, x0 + 0.01 + Math.abs(ox), x0 + 0.46 + Math.abs(ox), top, z, z + 0.9, r); if (r() < 0.6) bale(stat, M, x0 + 0.04, x0 + 0.49, top + 0.345, z + 0.05, z + 0.93, r); }
  for (let k = 0; k < 12; k++) { const z = z0 + 0.4 + r() * 11.6, w = 0.25 + r() * 0.4; const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.6), M.straw); m.rotation.set(-Math.PI / 2, 0, r() * 6.28); m.position.set(-66.6 - r() * 1.4, top + 0.004, z); m.receiveShadow = true; stat.add(m); }
  // the ladder: two rails leaning on the loft's edge, a rung every 30 cm
  const zA = -16.78, zB = -16.36, foot = -64.95, head = -65.93, yTop = top + 0.24;
  const at = (z, t) => v(foot + (head - foot) * t, FLOOR + (yTop - FLOOR) * t, z);
  for (const z of [zA, zB]) beam(stat, at(z, 0), at(z, 1), 0.04, 0.075, M.weathered, { up: v(1, 0.3, 0) });
  for (let y = 0.3; y < yTop - 0.15; y += 0.3) { const t = (y - FLOOR) / (yTop - FLOOR); rod(stat, at(zA + 0.02, t), at(zB - 0.02, t), 0.016, M.weathered, { seg: 7 }); }
  solid(head - 0.02, foot + 0.06, zA - 0.05, zB + 0.05, yTop, 'barnLadder');
}
// one bale of hay inside the box x0..x1 x z0..z1 from y up: packed straw, not quite square, a little turned, two strings round it
const lumpy = (x, y, z) => 0.008 * Math.sin(x * 23.1 + y * 7.3) * Math.sin(z * 19.7 - y * 5.1) + 0.005 * Math.sin(x * 51 + z * 43 + y * 37);
function bale(parent, M, x0, x1, y, z0, z1, r) {
  const W = Math.abs(x1 - x0) - r() * 0.03, D = Math.abs(z1 - z0) - r() * 0.03, H = 0.33 + r() * 0.015, alongZ = D > W;
  const geo = new RoundedBoxGeometry(W, H, D, 3, 0.045), p = geo.attributes.position, n = geo.attributes.normal;
  for (let i = 0; i < p.count; i++) { const k = p.getY(i) < -H / 2 + 0.012 ? 0 : lumpy(p.getX(i), p.getY(i), p.getZ(i)) + (p.getY(i) > H / 2 - 0.02 ? -0.006 : 0); p.setXYZ(i, p.getX(i) + n.getX(i) * k, p.getY(i) + n.getY(i) * k, p.getZ(i) + n.getZ(i) * k); }
  geo.computeVertexNormals(); worldUV(geo);
  const g = new THREE.Group(); g.position.set((x0 + x1) / 2, y + H / 2, (z0 + z1) / 2); g.rotation.y = (r() - 0.5) * 0.06; parent.add(g);
  const m = new THREE.Mesh(geo, M.hay); m.castShadow = true; m.receiveShadow = true; g.add(m);
  // the strings: thin, a little sunk into the straw at the edges
  const L = alongZ ? D : W, e = 0.003;
  for (const f of [-0.22, 0.22]) {
    const s = f * L, tw = 0.005;
    const seg = (a0, a1, b0, b1, c0, c1) => box(g, a0, a1, b0, b1, c0, c1, M.cord, { cast: false, uv: false });
    if (alongZ) { seg(-W / 2 + 0.02, W / 2 - 0.02, H / 2 - 0.004, H / 2 + e, s - tw, s + tw); for (const sx of [-1, 1]) seg(sx * (W / 2 + e) - (sx > 0 ? 0.004 : 0), sx * (W / 2 + e) + (sx > 0 ? 0 : 0.004), -H / 2 + 0.03, H / 2 - 0.03, s - tw, s + tw); }
    else { seg(s - tw, s + tw, H / 2 - 0.004, H / 2 + e, -D / 2 + 0.02, D / 2 - 0.02); for (const sz of [-1, 1]) seg(s - tw, s + tw, -H / 2 + 0.03, H / 2 - 0.03, sz * (D / 2 + e) - (sz > 0 ? 0.004 : 0), sz * (D / 2 + e) + (sz > 0 ? 0 : 0.004)); }
  }
  return g;
}

// ---------- hay below: bales stacked against the west wall under the loft, a heap in the corner, straw on the floor ----------
function hay(stat, M, solid, r) {
  // two rows of bales end on to the wall, three high at the back and two in front, one pulled out and broken open
  const wx = WALL.x0 + 0.01;
  for (let z = -16.4, i = 0; z < -12.9; z += 0.92, i++) {
    for (let t = 0; t < 3; t++) bale(stat, M, wx, wx + 0.45, FLOOR + t * 0.345, z + (r() - 0.5) * 0.04, z + 0.9, r);
    for (let t = 0; t < (i === 2 ? 1 : 2); t++) bale(stat, M, wx + 0.47, wx + 0.92, FLOOR + t * 0.345, z + 0.02 + (r() - 0.5) * 0.04, z + 0.88, r);
  }
  solid(IN.x0, wx + 0.96, -16.45, -12.65, 1.06, 'barnHay');
  // the heap in the north-west corner (what the hay looks like after twelve years): a mound of loose straw
  const heap = (() => {
    const cx = -68.2, cz = -19.65, NX = 40, NZ = 36, x0 = WALL.x0 + 0.004, x1 = -66.25, z0 = WALL.z0 + 0.004, z1 = -17.15, pos = [], uv = [], idx = [];
    for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
      const x = x0 + (x1 - x0) * i / NX, z = z0 + (z1 - z0) * j / NZ, d = Math.hypot((x - cx) / 1.75, (z - cz) / 2.0);
      const edge = i === 0 || j === 0 || i === NX || j === NZ, hh = Math.max(0, 0.72 * (1 - d * d)), y = edge ? FLOOR + 0.004 : FLOOR + 0.004 + hh * (1 + 0.12 * Math.sin(x * 11) * Math.sin(z * 9) + 0.06 * Math.sin(x * 29 + z * 17)) + (hh > 0.01 ? 0.03 * r() : 0.004 * r());
      pos.push(x, y, z); uv.push(x * 0.9, z * 0.9);
      if (i < NX && j < NZ) { const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, e = c + 1; idx.push(a, c, b, b, c, e); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, M.hay); m.castShadow = true; m.receiveShadow = true; return m;
  })();
  stat.add(heap);
  solid(IN.x0, -66.45, IN.z0, -17.35, 0.76, 'barnHay');
  // straw on the floor: in the stalls, under the loft, along the walls, thinning toward the door
  const spots = [[-64.2, -18.9, 1.3], [-61.0, -18.6, 1.1], [-67.1, -12.3, 0.9], [-66.6, -17.6, 0.9], [-63.4, -17.1, 0.5], [-66.3, -10.0, 0.6]];
  for (const [x, z, s] of spots) for (let k = 0; k < 2; k++) {
    const w = (0.5 + r() * 0.7) * s, m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * (0.6 + r() * 0.5)), M.straw);
    m.rotation.set(-Math.PI / 2, 0, r() * 6.28); m.position.set(x + (r() - 0.5) * s, FLOOR + 0.002 + k * 0.001, z + (r() - 0.5) * s * 0.8); m.receiveShadow = true; stat.add(m);
  }
}

// ---------- the measuring post: lines climbing a post that holds the loft up, facing the door ----------
function measuringPost(stat, M, solid) {
  const { x, z, w } = POST, h = LOFT.girder;
  box(stat, x - w / 2, x + w / 2, FLOOR - 0.01, h, z - w / 2, z + w / 2, M.pine);   // a newer post than the barn's, bare pine: the pencil shows on it
  solid(x - w / 2, x + w / 2, z - w / 2, z + w / 2, h, 'barnPost');
  // the marks: a canvas on the post's east face (2.7 m of it, 560 px a metre)
  const PX = 560, CW = 100, CH = Math.round((h - FLOOR) * PX), [c, g] = canvas(CW, CH), lines = [];
  const t = tex(c); t.anisotropy = 8;
  const mat = new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, depthWrite: false });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.004, h - FLOOR), mat); plane.rotation.y = Math.PI / 2; plane.position.set(x + w / 2 + 0.0015, FLOOR + (h - FLOOR) / 2, z); plane.receiveShadow = true; plane.userData.keep = true; plane.name = 'measuringPost';
  stat.add(plane);
  const yOf = (m) => CH - m * PX;   // metres above the floor -> canvas row
  const r = rng(808);
  function paint() {
    g.clearRect(0, 0, CW, CH);
    for (const L of lines) {
      const y = yOf(L.h), x0 = 6 + r() * 6, x1 = CW - 8 - r() * 8, tilt = (r() - 0.5) * 3;
      g.strokeStyle = L.wet ? 'rgba(10,10,14,0.97)' : `rgba(34,33,36,${L.age ? 0.85 : 0.75})`; g.lineWidth = L.wet ? 4.5 : 3.4;
      g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y + tilt); g.stroke();
      if (L.wet) { g.strokeStyle = 'rgba(30,30,36,0.35)'; g.lineWidth = 9; g.beginPath(); g.moveTo(x0 + 10, y + 1); g.lineTo(x1 - 14, y + tilt + 1); g.stroke(); }
      if (L.age) {   // the number under the line, careful and a little too even
        g.save(); g.translate(CW * 0.5, y + 34); g.rotate((r() - 0.5) * 0.12); g.fillStyle = 'rgba(30,29,33,0.9)';
        g.font = '34px "Gloria Hallelujah", "Comic Sans MS", cursive'; g.textAlign = 'center'; g.fillText(String(L.age), 0, 0); g.restore();
      }
    }
    t.needsUpdate = true;
  }
  for (const [age, m] of AGES) lines.push({ h: m, age });
  for (const m of NAMELESS) lines.push({ h: m });
  paint(); whenFonts(['34px "Gloria Hallelujah"'], paint);
  S.post = {
    lines, mesh: plane,
    // a new line: at h metres above the floor (the next one up by default), drawn in wet pencil
    add(hm, { wet = true, sound = true } = {}) {
      const top = Math.max(...lines.map((L) => L.h)), at = Math.min(h - 0.05, hm ?? top + 0.035);
      for (const L of lines) L.wet = false;
      const L = { h: at, wet }; lines.push(L); paint();
      if (sound && G && G.sfx && G.sfx.pick) G.sfx.pick('pencil', { at: { x: x + w / 2, y: FLOOR + at, z }, gain: 0.8 });
      S.wetT = wet ? 600 : 0;
      return L;
    },
    // the post as it was: the ages and the nameless lines, no new ones
    reset() { lines.length = 0; for (const [age, m] of AGES) lines.push({ h: m, age }); for (const m of NAMELESS) lines.push({ h: m }); S.wetT = 0; paint(); },
    // the wet line dries to look like the rest (ten minutes after it was drawn, or now)
    dry() { if (lines.some((L) => L.wet)) { for (const L of lines) L.wet = false; paint(); } S.wetT = 0; },
    get wet() { return lines.some((L) => L.wet); },
    height: (L) => FLOOR + L.h,
  };
}

// ---------- the Hollis furniture under sheets: a dresser and chairs in the south-east corner ----------
function furniture(stat, M, solid) {
  // a dresser against the wall, two chairs stacked seat to seat beside it, a footstool in front
  const back = WALL.z1 - 0.03;
  const solids = [{ x0: -61.7, x1: -60.78, z0: back - 0.52, z1: back, top: 1.12 }, { x0: -60.68, x1: -60.2, z0: back - 0.62, z1: back - 0.06, top: 1.32 }, { x0: -61.55, x1: -60.95, z0: back - 0.95, z1: back - 0.55, top: 0.4 }];
  const sheet = drape({ x0: -61.76, x1: -60.14, z0: back - 1.0, z1: back, solids, mat: M.sheet, seed: 11, skip: (x, z) => z > WALL.z1 - 0.06 });
  stat.add(sheet);
  solid(-61.85, -60.05, back - 1.1, IN.z1, 1.38, 'barnFurniture');
}

// ---------- the crib: slats like the phone table's legs, painted, chipped; under a sheet until somebody lifts it ----------
function cribAt(stat, M, solid) {
  const x0 = -64.82, x1 = -63.62, z1 = WALL.z1 - 0.04, z0 = z1 - 0.6, H = 0.9, g = new THREE.Group(); g.name = 'crib';
  for (const x of [x0, x1 - 0.05]) for (const z of [z0, z1 - 0.05]) { box(g, x, x + 0.05, FLOOR, FLOOR + H, z, z + 0.05, M.paint); const k = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), M.paint); k.position.set(x + 0.025, FLOOR + H + 0.02, z + 0.025); k.castShadow = true; g.add(k); }
  for (const z of [z0, z1 - 0.045]) { box(g, x0 + 0.05, x1 - 0.05, FLOOR + 0.84, FLOOR + 0.87, z + 0.005, z + 0.04, M.paint); box(g, x0 + 0.05, x1 - 0.05, FLOOR + 0.2, FLOOR + 0.24, z + 0.005, z + 0.04, M.paint); }
  for (const x of [x0, x1 - 0.05]) { box(g, x + 0.012, x + 0.038, FLOOR + 0.2, FLOOR + 0.84, z0 + 0.05, z1 - 0.05, M.paint); box(g, x + 0.005, x + 0.045, FLOOR + 0.84, FLOOR + 0.88, z0 + 0.05, z1 - 0.05, M.paint); }
  for (const z of [z0 + 0.0225, z1 - 0.0225]) for (let x = x0 + 0.1; x < x1 - 0.07; x += 0.065) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.6, 8), Math.random() < 0.15 ? M.paintChip : M.paint); s.position.set(x, FLOOR + 0.54, z); s.castShadow = true; g.add(s); }
  box(g, x0 + 0.05, x1 - 0.05, FLOOR + 0.24, FLOOR + 0.26, z0 + 0.05, z1 - 0.05, M.board);   // the spring board
  const pad = new THREE.Mesh(new RoundedBoxGeometry(x1 - x0 - 0.12, 0.08, z1 - z0 - 0.12, 2, 0.02), new THREE.MeshStandardMaterial({ color: 0x9c907a, roughness: 1 })); pad.position.set((x0 + x1) / 2, FLOOR + 0.3, (z0 + z1) / 2); pad.castShadow = true; g.add(pad);
  stat.add(g);
  solid(x0 - 0.02, x1 + 0.02, z0 - 0.02, IN.z1, H + 0.05, 'barnCrib');
  // the sheet over it (D2 lifts it on day four: crib.cover(false))
  const top = FLOOR + H + 0.05, rails = [{ x0, x1, z0, z1: z0 + 0.05, top }, { x0, x1, z0: z1 - 0.05, z1, top }, { x0, x1: x0 + 0.05, z0, z1, top }, { x0: x1 - 0.05, x1, z0, z1, top }, { x0, x1, z0, z1, top: FLOOR + 0.34 }];
  const sheet = drape({ x0: x0 - 0.04, x1: x1 + 0.04, z0: z0 - 0.04, z1: z1 + 0.02, solids: rails, mat: M.canvas, seed: 21, skip: (x, z) => z > WALL.z1 - 0.06 });
  sheet.name = 'cribSheet'; stat.parent.add(sheet);
  return {
    sheet, group: g, box: { x0, x1, z0, z1 },
    get covered() { return sheet.visible; },
    cover(on = true, { sound = false } = {}) { sheet.visible = !!on; if (sound && G && G.sfx && G.sfx.pick) G.sfx.pick('tarp', { at: { x: (x0 + x1) / 2, y: 0.8, z: (z0 + z1) / 2 } }); return sheet.visible; },
  };
}

// ---------- a child's bike, on its side ----------
function bike(stat, M, solid) {
  const b = new THREE.Group(), R = 0.2, rear = v(0, R, 0), front = v(0.68, R, 0), bb = v(0.25, 0.17, 0), seat = v(0.13, 0.55, 0), head0 = v(0.6, 0.43, 0), head1 = v(0.575, 0.57, 0);
  const tube = (a, c, rr = 0.013, m = M.bikeRed) => rod(b, a, c, rr, m, { seg: 8 });
  tube(bb, seat); tube(seat, head1, 0.012); tube(bb, head0, 0.014); tube(head0, head1, 0.017);
  for (const s of [-1, 1]) { tube(bb, v(0, R, s * 0.045), 0.008); tube(seat, v(0, R, s * 0.045), 0.008); }
  // wheels: tyre, rim, hub, spokes
  const wheel = (c) => {
    const w = new THREE.Group(); w.position.copy(c); b.add(w);
    const tyre = new THREE.Mesh(new THREE.TorusGeometry(R - 0.022, 0.022, 10, 36), M.rubber); tyre.castShadow = true; w.add(tyre);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R - 0.042, 0.007, 6, 36), M.chrome); w.add(rim);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.09, 10), M.chrome); hub.rotation.x = Math.PI / 2; w.add(hub);
    for (let k = 0; k < 20; k++) { const a = k / 20 * Math.PI * 2, s = k % 2 ? 1 : -1; rod(w, v(0, 0, s * 0.035), v(Math.cos(a) * (R - 0.048), Math.sin(a) * (R - 0.048), s * 0.006), 0.0018, M.chrome, { seg: 4, cast: false }); }
    return w;
  };
  wheel(rear);
  // the front end: fork, stem, bars, turned the way a dropped bike's bars swing
  const fr = new THREE.Group(); fr.position.copy(head0); b.add(fr);
  const steer = head1.clone().sub(head0).normalize(); fr.quaternion.setFromAxisAngle(steer, 0.9);
  const f = (p) => p.clone().sub(head0);
  for (const s of [-1, 1]) rod(fr, f(v(0.6, 0.43, s * 0.04)), f(v(0.68, R, s * 0.045)), 0.009, M.chrome, { seg: 6 });
  const fw = wheel(front); fr.add(fw); fw.position.copy(f(front));
  rod(fr, f(head1), f(v(0.565, 0.66, 0)), 0.012, M.chrome); rod(fr, f(v(0.56, 0.66, -0.25)), f(v(0.56, 0.66, 0.25)), 0.011, M.chrome);
  for (const s of [-1, 1]) { rod(fr, f(v(0.56, 0.66, s * 0.25)), f(v(0.49, 0.72, s * 0.26)), 0.011, M.chrome); rod(fr, f(v(0.49, 0.72, s * 0.26)), f(v(0.42, 0.75, s * 0.26)), 0.016, M.rubber); }
  // seat, cranks, pedals, the chain guard
  rod(b, seat, v(0.115, 0.62, 0), 0.011, M.chrome);
  const saddle = new THREE.Mesh(new RoundedBoxGeometry(0.24, 0.05, 0.12, 2, 0.02), M.vinyl); saddle.position.set(0.08, 0.645, 0); saddle.rotation.z = 0.06; saddle.castShadow = true; b.add(saddle);
  for (const s of [-1, 1]) { const p = v(0.25 + 0.12 * s, 0.17 - 0.05 * s, s * 0.07); rod(b, v(0.25, 0.17, s * 0.06), p, 0.008, M.chrome); box(b, p.x - 0.045, p.x + 0.045, p.y - 0.012, p.y + 0.012, p.z + s * 0.01, p.z + s * 0.07, M.rubber); }
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.006), M.bikeRed); guard.position.set(0.13, 0.2, 0.055); guard.rotation.z = -0.05; b.add(guard);
  // lay it down on its left side, a little propped on its pedal and the end of its bars, then onto the floor
  b.rotation.set(-Math.PI / 2 + 0.12, 0, 0, 'XYZ');
  const g = new THREE.Group(); g.add(b); g.rotation.y = 0.35; stat.add(g); g.updateMatrixWorld(true);
  const bb3 = new THREE.Box3().setFromObject(g); g.position.set(-64.65 - (bb3.min.x + bb3.max.x) / 2, FLOOR - bb3.min.y, -10.55 - (bb3.min.z + bb3.max.z) / 2); g.updateMatrixWorld(true);
  const bx = new THREE.Box3().setFromObject(g); S.bikeBox = bx;
  solid(bx.min.x, bx.max.x, bx.min.z, bx.max.z, bx.max.y, 'barnBike');
}

// ---------- the dog chain: an eye bolt in the post, the chain down it and across the floor, the collar lying open at the end ----------
function chain(stat, M) {
  const [px, pz] = POSTS[4], face = pz - 0.11, y0 = 0.46, pts = [];
  // the bolt and its plate
  box(stat, px - 0.035, px + 0.035, y0 - 0.05, y0 + 0.05, face - 0.008, face, M.rust);
  const eye = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 6, 14), M.rust); eye.position.set(px, y0, face - 0.03); eye.rotation.x = Math.PI / 2; stat.add(eye);
  // its path: down the post, out across the floor in a loose curve
  const path = new THREE.CatmullRomCurve3([v(px, y0 - 0.02, face - 0.045), v(px, 0.2, face - 0.06), v(px - 0.05, FLOOR + 0.01, face - 0.22), v(px - 0.35, FLOOR + 0.01, face - 0.55), v(px - 0.3, FLOOR + 0.01, face - 0.95), v(px - 0.62, FLOOR + 0.01, face - 1.22), v(px - 0.98, FLOOR + 0.01, face - 1.12)]);
  const L = path.getLength(), step = 0.032, n = Math.floor(L / step);
  const link = new THREE.TorusGeometry(0.016, 0.0042, 6, 12); link.scale(1, 1.45, 1);
  const im = new THREE.InstancedMesh(link, M.rust, n), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), up = v(0, 1, 0), tan = new V3();
  for (let i = 0; i < n; i++) {
    const p = path.getPointAt((i + 0.5) / n); path.getTangentAt((i + 0.5) / n, tan); q.setFromUnitVectors(up, tan); q2.setFromAxisAngle(tan, i % 2 ? Math.PI / 2 : 0); q.premultiply(q2);
    if (p.y < FLOOR + 0.03) p.y = FLOOR + (i % 2 ? 0.0045 : 0.016);   // lying links: one flat, the next on its edge
    im.setMatrixAt(i, m4.compose(p, q, new V3(1, 1, 1))); pts.push(p);
  }
  im.castShadow = true; im.receiveShadow = true; stat.parent.add(im); im.name = 'dogChain';
  // the collar: a strap lying open in a C, the buckle, the ring the chain was on
  const end = path.getPointAt(1), cx = end.x - 0.1, cz = end.z + 0.03;
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.011, 6, 28, Math.PI * 1.6), M.leather); collar.scale.set(1, 1, 0.35); collar.rotation.set(-Math.PI / 2, 0, 0.8); collar.position.set(cx, FLOOR + 0.004, cz); collar.castShadow = true; stat.add(collar);
  box(stat, cx + 0.06, cx + 0.095, FLOOR, FLOOR + 0.008, cz - 0.03, cz + 0.005, M.chrome);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.004, 6, 14), M.chrome); ring.rotation.x = Math.PI / 2; ring.position.set(end.x, FLOOR + 0.004, end.z); stat.add(ring);
}

// ---------- the drawings of the tall one and a wallet photo of a boy, pinned to the post by the door; more of them under a brick ----------
function crayonDrawing(kind, seed) {
  const W = 384, H = 512, [c, g] = canvas(W, H);
  const paint = () => {
    const r = rng(seed);
    g.globalAlpha = 1; g.fillStyle = '#e9e1cb'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 4; i++) { const x = r() * W, y = r() * H, rad = 40 + r() * 70, gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(150,120,60,0.18)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
    const crayon = (pts, color, width = 6, passes = 3) => {
      g.strokeStyle = color; g.lineCap = 'round'; g.lineJoin = 'round';
      for (let p = 0; p < passes; p++) { g.lineWidth = width * (0.6 + r() * 0.6); g.globalAlpha = 0.55 + r() * 0.35; g.beginPath(); pts.forEach(([x, y], i) => { const jx = x + (r() - 0.5) * 4, jy = y + (r() - 0.5) * 4; if (i) g.lineTo(jx, jy); else g.moveTo(jx, jy); }); g.stroke(); }
      g.globalAlpha = 1;
    };
    const fill = (x0, x1, y, color) => crayon([[x0, y], [x1, y + (r() - 0.5) * 5]], color, 6, 1);
    // the tall one: black, too long in the arms, white eyes, the grin
    const tall = (fx, top, hgt, arms = 'down') => {
      const body = top + hgt * 0.22, legs = top + hgt * 0.68, foot = top + hgt;
      for (let y = body; y < legs; y += 4) { const w = 16 + Math.sin((y - top) / 50) * 4; fill(fx - w, fx + w, y, '#111'); }
      for (let y = legs; y < foot; y += 4) { fill(fx - 15, fx - 7, y, '#111'); fill(fx + 7, fx + 15, y, '#111'); }
      if (arms === 'down') { crayon([[fx - 18, body + 8], [fx - 28, legs], [fx - 30, foot - 10]], '#111', 6); crayon([[fx + 18, body + 8], [fx + 28, legs], [fx + 30, foot - 10]], '#111', 6); }
      else { crayon([[fx - 18, body + 8], [fx - 60, body + 50], [fx - 90, body + 70]], '#111', 6); crayon([[fx + 18, body + 8], [fx + 50, body - 10], [fx + 60, body - 40]], '#111', 6); }
      const hr = hgt * 0.11, hy = top + hr;
      for (let y = top; y < top + hr * 2; y += 3) { const dy = y - hy, w = Math.sqrt(Math.max(0, hr * hr - dy * dy)); fill(fx - w, fx + w, y, '#111'); }
      g.fillStyle = '#fff'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(fx + s * hr * 0.38, hy - hr * 0.15, hr * 0.28, hr * 0.33, 0, 0, 7); g.fill(); }
      g.fillStyle = '#000'; for (const s of [-1, 1]) { g.beginPath(); g.arc(fx + s * hr * 0.38, hy - hr * 0.1, hr * 0.17, 0, 7); g.fill(); }
      g.fillStyle = '#fff'; g.beginPath(); g.moveTo(fx - hr * 0.8, hy + hr * 0.3); g.quadraticCurveTo(fx, hy + hr * 1.05, fx + hr * 0.8, hy + hr * 0.3); g.quadraticCurveTo(fx, hy + hr * 0.6, fx - hr * 0.8, hy + hr * 0.3); g.fill();
    };
    const kid = (x, y, s = 1, color = '#c33') => { g.fillStyle = '#e8b890'; g.beginPath(); g.arc(x, y, 10 * s, 0, 7); g.fill(); crayon([[x, y + 10 * s], [x, y + 45 * s]], color, 6 * s); crayon([[x, y + 22 * s], [x - 14 * s, y + 34 * s]], color, 4 * s); crayon([[x, y + 22 * s], [x + 14 * s, y + 34 * s]], color, 4 * s); crayon([[x, y + 45 * s], [x - 10 * s, y + 68 * s]], color, 4 * s); crayon([[x, y + 45 * s], [x + 10 * s, y + 68 * s]], color, 4 * s); };
    let words = '';
    if (kind === 'door') {   // it in a doorway at the end of the hall, the hall light on
      crayon([[60, 420], [330, 420]], '#7a4a22', 8); crayon([[110, 420], [110, 130], [280, 130], [280, 420]], '#7a4a22', 9);
      for (let y = 140; y < 410; y += 6) fill(118, 272, y, 'rgba(240,210,90,0.9)');
      tall(195, 150, 260); g.fillStyle = '#e8b890'; kid(330, 330, 0.9); words = 'HE WAITS';
    } else if (kind === 'bunk') {   // the bunk: a kid on top, it lying in the bottom one with its eyes open
      crayon([[50, 430], [340, 430]], '#3f8a3a', 8);
      crayon([[70, 430], [70, 150]], '#7a4a22', 8); crayon([[320, 430], [320, 150]], '#7a4a22', 8); crayon([[70, 250], [320, 250]], '#7a4a22', 10); crayon([[70, 370], [320, 370]], '#7a4a22', 10);
      crayon([[80, 240], [310, 240]], '#3a5aa0', 12); g.fillStyle = '#e8b890'; g.beginPath(); g.arc(105, 222, 13, 0, 7); g.fill(); crayon([[118, 226], [290, 226]], '#c33', 8);
      for (let y = 330; y < 362; y += 4) fill(90, 300, y, '#111');
      g.fillStyle = '#fff'; for (const x of [112, 132]) { g.beginPath(); g.ellipse(x, 336, 7, 8, 0, 0, 7); g.fill(); } g.fillStyle = '#000'; for (const x of [112, 132]) { g.beginPath(); g.arc(x, 337, 4, 0, 7); g.fill(); }
      words = 'UNDER ME';
    } else {   // the barn, its door open, it inside reaching for a little one who stands at the post
      crayon([[30, 440], [360, 440]], '#3f8a3a', 9);
      crayon([[50, 440], [50, 210], [190, 110], [330, 210], [330, 440]], '#9a2a1e', 9); for (let y = 215; y < 438; y += 7) fill(56, 324, y, 'rgba(150,40,30,0.55)');
      crayon([[130, 440], [130, 280], [250, 280], [250, 440]], '#111', 8); for (let y = 284; y < 436; y += 5) fill(134, 246, y, 'rgba(20,20,20,0.85)');
      tall(190, 290, 150, 'reach'); crayon([[290, 440], [290, 300]], '#7a4a22', 10);
      for (let y = 320; y < 440; y += 22) crayon([[284, y], [298, y]], '#555', 3, 1);
      kid(268, 372, 0.8); words = 'HE MEASURES';
    }
    g.font = 'bold 34px "Gloria Hallelujah", "Comic Sans MS", cursive'; g.fillStyle = '#b3201c';
    let x = 24; for (const ch of words) { g.save(); g.translate(x, 492); g.rotate((r() - 0.5) * 0.35); g.globalAlpha = 0.85; g.fillText(ch, 0, -(r() * 6)); g.restore(); x += ch === ' ' ? 12 : 24; }
    g.globalAlpha = 1; t.needsUpdate = true;
  };
  const t = tex(c); paint(); whenFonts(['bold 34px "Gloria Hallelujah"'], paint);
  return t;
}
function walletPhoto() {
  const W = 180, H = 252, [c, g] = canvas(W, H), t = tex(c);
  g.fillStyle = '#e7e0cf'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#2a241c'; g.fillRect(12, 12, W - 24, H - 46);
  const img = new Image();
  img.onload = () => {   // the boy from the living room's wall, cropped to him: head and shoulders
    g.drawImage(img, 92, 0, 250, 300, 12, 12, W - 24, H - 46);
    const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, 'rgba(120,90,40,0.12)'); gr.addColorStop(1, 'rgba(60,40,20,0.2)'); g.fillStyle = gr; g.fillRect(12, 12, W - 24, H - 46);
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(14, H * 0.55); g.lineTo(W - 14, H * 0.52); g.stroke();   // the crease from the wallet
    t.needsUpdate = true;
  };
  img.src = 'assets/photos/boy.webp';
  return t;
}
function drawings(stat, M) {
  const [px, pz] = POSTS[5], face = pz - 0.11 - 0.0025;
  const paper = (map, w, h, x, y, rz, z = face) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map, roughness: 0.9, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    m.position.set(x, y, z); m.rotation.set(0, Math.PI, rz); m.castShadow = false; m.receiveShadow = true; m.userData.keep = true; stat.add(m);
    const pin = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 5), M.rust); pin.position.set(x + Math.sin(rz) * h * 0.42, y + Math.cos(rz) * h * 0.42, z - 0.004); stat.add(pin);
    return m;
  };
  paper(crayonDrawing('barn', 31), 0.15, 0.2, px + 0.005, 1.5, 0.05, face);
  paper(crayonDrawing('door', 17), 0.15, 0.2, px - 0.01, 1.27, -0.04, face - 0.0006);
  paper(crayonDrawing('bunk', 23), 0.15, 0.2, px + 0.008, 1.04, 0.07, face - 0.0012);
  paper(walletPhoto(), 0.064, 0.09, px - 0.035, 1.36, -0.12, face - 0.0018);
  // the rest of them on the floor at the post's foot, a brick on the pile
  const pile = [crayonDrawing('door', 41), crayonDrawing('bunk', 43), crayonDrawing('barn', 47)];
  pile.forEach((map, i) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.2), new THREE.MeshStandardMaterial({ map, roughness: 0.9, side: THREE.DoubleSide })); m.rotation.set(-Math.PI / 2, 0, 0.3 + i * 0.35); m.position.set(px - 0.2 + i * 0.02, FLOOR + 0.002 + i * 0.0012, pz - 0.42 + i * 0.015); m.receiveShadow = true; m.userData.keep = true; stat.add(m); });
  const brick = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.06, 0.095, 2, 0.008), M.brick); brick.position.set(px - 0.18, FLOOR + 0.006 + 0.03, pz - 0.41); brick.rotation.y = 0.5; brick.castShadow = true; stat.add(brick);
}

// ---------- the mattress, bare, with the same dent ----------
function mattress(stat, M, solid) {
  const L = 1.9, Wd = 0.95, T = 0.17, cx = -67.32, cz = -8.95, rot = 0.05;
  const g = new THREE.BoxGeometry(L, T, Wd, 76, 1, 38), p = g.attributes.position;
  const H = { x: -L / 2 + 0.16, z: 0.04 }, F = { x: L / 2 + 0.16, z: 0.02 };
  for (let i = 0; i < p.count; i++) if (p.getY(i) > T / 2 - 1e-4) p.setY(i, T / 2 - Math.max(0, Math.min(T - 0.03, dentAt(p.getX(i), p.getZ(i), H, F))));
  g.computeVertexNormals(); g.translate(0, T / 2, 0);
  const [c, x2] = canvas(256, 256), r = rng(5);
  x2.fillStyle = '#8f8775'; x2.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 18) { x2.fillStyle = 'rgba(52,58,74,0.45)'; x2.fillRect(0, y, 256, 4); }
  for (let i = 0; i < 1500; i++) { x2.fillStyle = `rgba(${40 + r() * 40},${35 + r() * 30},${25 + r() * 20},0.12)`; x2.fillRect(r() * 256, r() * 256, 2, 2); }
  for (let i = 0; i < 7; i++) { const x = r() * 256, y = r() * 256, rad = 20 + r() * 60, gr = x2.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(${110 + r() * 30},${80 + r() * 20},${40},0.4)`); gr.addColorStop(1, 'rgba(0,0,0,0)'); x2.fillStyle = gr; x2.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
  const map = tex(c, { repeat: [2, 1] });
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map, roughness: 1 })); m.position.set(cx, FLOOR, cz); m.rotation.y = rot; m.castShadow = true; m.receiveShadow = true; m.name = 'barnMattress';
  stat.add(m);
  // the piping round its top edge
  const pipeM = new THREE.MeshStandardMaterial({ color: 0x6f6858, roughness: 1 });
  for (const [a, b] of [[[-L / 2, -Wd / 2], [L / 2, -Wd / 2]], [[L / 2, -Wd / 2], [L / 2, Wd / 2]], [[L / 2, Wd / 2], [-L / 2, Wd / 2]], [[-L / 2, Wd / 2], [-L / 2, -Wd / 2]]]) {
    const c = Math.cos(rot), sn = Math.sin(rot), w = (q) => v(cx + q[0] * c + q[1] * sn, FLOOR + T - 0.006, cz - q[0] * sn + q[1] * c);
    rod(stat, w(a), w(b), 0.008, pipeM, { seg: 6, cast: false });
  }
  const hx = L / 2 * Math.cos(rot) + Wd / 2 * Math.abs(Math.sin(rot)), hz = L / 2 * Math.abs(Math.sin(rot)) + Wd / 2 * Math.cos(rot);
  solid(cx - hx, cx + hx, cz - hz, cz + hz, FLOOR + T, 'barnMattress');
}

// ---------- the feed sack in the east stall, slumped against the wall, BEN on it in marker ----------
function feedSack(stat, M, solid) {
  const [c, g] = canvas(256, 384), t = tex(c);
  const paint = () => {
    const r = rng(9);
    g.fillStyle = '#b9a47c'; g.fillRect(0, 0, 256, 384);
    for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(${90 + r() * 60},${70 + r() * 50},${40 + r() * 30},0.18)`; g.fillRect(r() * 256, r() * 384, 1 + r() * 2, 1 + r() * 2); }
    g.fillStyle = '#3e5a36'; g.fillRect(18, 40, 220, 92);
    g.fillStyle = '#e9e1cb'; g.font = 'bold 30px "Courier Prime", "Courier New", monospace'; g.textAlign = 'center'; g.fillText('LARCH ROAD', 128, 80); g.font = 'bold 22px "Courier Prime", "Courier New", monospace'; g.fillText('FEED & SEED', 128, 114);
    g.fillStyle = '#7a2a20'; g.font = 'bold 26px "Courier Prime", "Courier New", monospace'; g.fillText('LAYER RATION', 128, 172); g.fillText('50 LB.', 128, 204);
    g.save(); g.translate(122, 300); g.rotate(-0.09); g.fillStyle = 'rgba(15,14,14,0.9)'; g.font = '86px "Permanent Marker", "Marker Felt", sans-serif'; g.fillText('BEN', 0, 0); g.restore();
    for (let i = 0; i < 5; i++) { const x = r() * 256, y = 220 + r() * 160, rad = 20 + r() * 40, gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(60,45,25,0.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
    t.needsUpdate = true;
  };
  paint(); whenFonts(['86px "Permanent Marker"', 'bold 30px "Courier Prime"'], paint);
  // a sack: a box with its top folded down, sides bulging and creased, sat on the floor leaning back on the wall
  const Wd = 0.46, H = 0.68, D = 0.24, geo = new THREE.BoxGeometry(Wd, H, D, 10, 14, 4), p = geo.attributes.position, r = rng(4);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), yy = (y + H / 2) / H;
    const bulge = Math.sin(Math.PI * Math.min(1, yy * 1.15)) * (1 - 0.3 * yy), sx = 1 + 0.05 * bulge - 0.12 * Math.max(0, yy - 0.82) / 0.18, sz = 0.75 + 0.45 * bulge * (1 - Math.max(0, yy - 0.78) / 0.22 * 0.8);
    p.setXYZ(i, x * sx + (r() - 0.5) * 0.006, y - 0.04 * Math.max(0, yy - 0.85) / 0.15 * (x / Wd + 0.5), z * sz + (r() - 0.5) * 0.006);
  }
  geo.computeVertexNormals(); geo.translate(0, H / 2, 0);
  // standing slumped by the north wall, its top fallen back against the boards
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: t, roughness: 0.95, color: 0xa69c88 })); m.position.set(-60.75, FLOOR, -19.7); m.rotation.set(-0.07, 0.1, 0.02, 'YXZ'); m.castShadow = true; m.receiveShadow = true; m.name = 'feedSack';
  stat.add(m); m.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(m); m.position.y += FLOOR - b.min.y; m.position.z += WALL.z0 + 0.012 - b.min.z; m.updateMatrixWorld(true); b.setFromObject(m);
  solid(b.min.x, b.max.x, IN.z0, b.max.z, b.max.y, 'barnSack');
  // and two old bales beside it
  const zw = WALL.z0 + 0.006;
  bale(stat, M, -62.16, -61.26, FLOOR, zw, zw + 0.45, rng(31)); bale(stat, M, -62.12, -61.3, FLOOR + 0.345, zw + 0.03, zw + 0.43, rng(32));
  solid(-62.18, -61.24, IN.z0, zw + 0.47, 0.72, 'barnHay');
  return m;
}

// ---------- the sawhorses (out in the open: D2's Dad asks for them), each with its footprint following it ----------
function sawhorses(yard, M, W) {
  const out = [];
  for (const [x, z, rot] of [[-67.35, -11.25, 0.02], [-67.3, -10.3, -0.05]]) {
    const g = new THREE.Group(); g.name = 'sawhorse'; g.position.set(x, FLOOR, z); g.rotation.y = rot; yard.add(g);
    box(g, -0.5, 0.5, 0.64, 0.73, -0.045, 0.045, M.weathered);
    for (const sx of [-0.4, 0.4]) for (const sz of [-1, 1]) beam(g, v(sx * 1.04, 0.0, sz * 0.27), v(sx, 0.66, sz * 0.03), 0.07, 0.035, M.board, { up: v(sx, 0, 0) });
    for (const sz of [-1, 1]) box(g, -0.36, 0.36, 0.3, 0.38, sz * 0.15 - 0.012, sz * 0.15 + 0.012, M.board);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    if (W.follow) W.follow(g, 0.52, 0.31, { maxY: 0.75, id: 'sawhorse' });
    out.push(g);
  }
  return out;
}

// ---------- the work lamp: a caged bulb on its cord from the tie beam, off until somebody lights it ----------
function workLamp(yard, M, ctx) {
  const x = -62.25, z = -13.4, top = TIE, y = 2.5, g = new THREE.Group(); g.name = 'workLamp'; g.position.set(x, y, z); yard.add(g);
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, top - y - 0.22, 5), M.cord); cord.position.y = 0.22 + (top - y - 0.22) / 2; g.add(cord);
  box(g, -0.004, 0.004, 0.2, 0.235, -0.004, 0.004, M.cord, { uv: false });
  const capM = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 0.07, 14), M.cap); capM.position.y = 0.165; g.add(capM);
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.004, 5, 12, Math.PI * 1.4), M.iron); hook.position.set(0, 0.21, 0); hook.rotation.y = Math.PI / 2; g.add(hook);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.034, 14, 10), M.bulb); bulb.position.y = 0.08; bulb.scale.y = 1.3; g.add(bulb);
  for (const yy of [0.02, 0.13]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.003, 4, 18), M.iron); ring.rotation.x = Math.PI / 2; ring.position.y = yy; g.add(ring); }
  for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; rod(g, v(Math.cos(a) * 0.052, 0.13, Math.sin(a) * 0.052), v(Math.cos(a) * 0.03, -0.005, Math.sin(a) * 0.03), 0.0028, M.iron, { seg: 4, cast: false }); }
  g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  const light = new THREE.PointLight(0xffb868, 0, 13, 1.5); light.position.set(0, 0.06, 0); g.add(light);
  const glowT = (() => { const [c, q] = canvas(64, 64), gr = q.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,220,160,1)'); gr.addColorStop(0.25, 'rgba(255,190,110,0.45)'); gr.addColorStop(1, 'rgba(255,170,80,0)'); q.fillStyle = gr; q.fillRect(0, 0, 64, 64); return tex(c); })();
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowT, color: 0xffd9a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0 })); glow.scale.set(0.7, 0.7, 1); glow.position.y = 0.08; glow.visible = false; g.add(glow);
  const lamp = {
    group: g, light, at: new V3(x, y, z), get on() { return S.lampLevel > 0; }, get level() { return S.lampLevel; },
    // on (level 0..1: how bright), off; quiet unless asked for its switch
    set(on, level = 1, { sound = false } = {}) {
      S.lampLevel = on ? Math.max(0, Math.min(1, level)) : 0;
      light.intensity = 14 * S.lampLevel; M.bulb.emissiveIntensity = 2.6 * S.lampLevel; glow.visible = S.lampLevel > 0; glow.material.opacity = 0.85 * S.lampLevel;
      if (sound && G && G.sfx && G.sfx.pick) G.sfx.pick('switch', { at: { x, y, z } });
      return S.lampLevel > 0;
    },
  };
  lamp.set(false);
  return lamp;
}

// ---------- the field gate: the leaf that stands open into the yard becomes a door ----------
function gateLeaf(ctx, M) {
  const { yard, W } = ctx, leaf = yard.children.find((o) => o.isGroup && Math.abs(o.position.x - GATE.hx) < 0.01 && Math.abs(o.position.z - GATE.hz) < 0.01 && o.children.length >= 4);
  if (!leaf) return null;
  leaf.name = 'gateLeaf';
  // the chain round the latch post that holds it shut (shown only while it is shut)
  const chainG = new THREE.Group(); chainG.name = 'gateChain'; chainG.position.set(GATE.hx, 0, -14.6); yard.add(chainG);
  const link = new THREE.TorusGeometry(0.016, 0.0042, 6, 12); link.scale(1, 1.45, 1);
  for (let k = 0; k < 22; k++) { const a = k / 22 * Math.PI * 2, m = new THREE.Mesh(link, M.rust); m.position.set(Math.cos(a) * 0.1, 1.0 + Math.sin(a) * 0.04 - (k > 15 ? (k - 15) * 0.02 : 0), Math.sin(a) * 0.08 - 0.02); m.rotation.set(k % 2 ? Math.PI / 2 : 0, a, 0); chainG.add(m); }
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.02), M.chrome); lock.position.set(0.11, 0.88, 0.0); chainG.add(lock);
  const rotC = -Math.PI / 2, rotO = GATE.open - Math.PI / 2, angD = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
  const col = ctx.solid(GATE.hx - 0.3, GATE.hx + 0.3, GATE.hz, -14.6, { door: 'gate', on: false, maxY: 1.6 });
  const d = { name: 'gate', a: 1, target: 1, max: 1, col, mid: new V3(GATE.hx, 1.0, (GATE.hz - 14.6) / 2), hx: GATE.hx, hz: GATE.hz, y0: 0, w: GATE.w, blocked: null, g: leaf, rotC, rotO, gate: true };
  const strip = () => {
    const shut = d.a < 0.08;
    if (shut && !col.on && collide.bodies.some((b) => (!b.active || b.active()) && collide.onFloor(col, b.pos.y, b.h) && b.pos.x > col.minX - b.r && b.pos.x < col.maxX + b.r && b.pos.z > col.minZ - b.r && b.pos.z < col.maxZ + b.r)) { col.armWhenClear = true; return; }
    col.on = shut; col.armWhenClear = false;
  };
  d.apply = () => { leaf.rotation.y = rotC + angD(rotC, rotO) * d.a + Math.PI / 2; chainG.visible = d.a < 0.02; strip(); };
  // the schedule's hook: open (d0-d4 by day, from night six at night) or shut (by day from d5); the leaf swings there, swept like any other
  d.setState = (state, { now = false } = {}) => {
    const open = state === 'open' || state === true;
    W.setDoor('gate', open, true);
    if (now) { d.a = d.target; d.apply(); }
    return open;
  };
  d.state = () => (d.target ? 'open' : 'shut');
  ctx.doors.gate = d; d.apply();
  S.gate = d;
  return d;
}

// ---------- each frame (W.tick, wrapped): the leaf's pace, the iron's sounds, the gate's, the lamp's sway ----------
function tickBefore() { return { a: S.door ? S.door.a : 0, g: S.gate ? S.gate.a : 1 }; }
function tickAfter(dt, was) {
  const d = S.door, sfx = G && G.sfx;
  if (d) {
    if (d.a !== was.a) {   // the leaf rolls at 1.0 m/s, whatever moved it (world.js steps every leaf at its own pace; this one is heavy)
      const step = Math.max(0, dt) * RATE;
      if (Math.abs(d.a - was.a) > step + 1e-9) { d.a = was.a + Math.sign(d.a - was.a) * step; d.apply(); }
      if (!S.rolling) {
        S.rolling = true;
        if (sfx && sfx.pick && !d.quiet) sfx.pick('iron_roll', { at: leafMid(d), dur: Math.abs(d.target - d.a) / RATE + 0.3, ramp: 0.08 });
      }
    } else if (S.rolling) {
      S.rolling = false;
      if (sfx && sfx.pick && !d.quiet && (d.a === 0 || d.a === 1)) sfx.pick('door_slam', { at: leafMid(d), gain: 0.9 });
      d.quiet = false;
    }
  }
  const g = S.gate;
  if (g) {
    if (g.a !== was.g && !S.gateMoving) { S.gateMoving = true; if (sfx && sfx.pick) sfx.pick('door_creak', { at: { x: g.hx, y: 1.0, z: g.hz + 0.3 }, gain: 0.8, rate: 0.8 }); }
    else if (g.a === was.g && S.gateMoving) { S.gateMoving = false; if (sfx && sfx.pick && g.a === 0) sfx.pick('chain', { at: { x: g.hx, y: 1.0, z: -14.6 } }); }
  }
  if (S.wetT > 0) { S.wetT -= dt; if (S.wetT <= 0 && S.post) S.post.dry(); }
  const lamp = G && G.W && G.W.barn && G.W.barn.lamp;
  if (lamp && lamp.group) { S.swayT += dt; lamp.group.rotation.z = 0.012 * Math.sin(S.swayT * 0.7); lamp.group.rotation.x = 0.009 * Math.sin(S.swayT * 0.53 + 1); }
}
const leafMid = (d) => ({ x: d.hx + 0.05, y: 1.4, z: d.hz + LEAF.travel * d.a });

// the door by hand: the leaf is swept first, and a body against it stops it before it moves (exported for tests/checks/barn.js)
export function slideBarn() {
  const d = S.door; if (!d) return;
  const open = !d.target, sw = collide.sweepLeaf(d, (open ? 1 : -1) * 0.02);
  if (sw.hit && sw.a === d.a) { if (G.sfx && G.sfx.pick) G.sfx.pick('knock', { at: leafMid(d), gain: 0.4 }); return; }
  G.W.setDoor('barn', open, true);
}
let lockedAt = -99;
export function tryGate() {
  const g = S.gate; if (!g || g.target) return;
  if (G.sfx && G.sfx.pick) G.sfx.pick('chain', { at: { x: g.hx, y: 1.0, z: -14.7 }, gain: 1.1 });
  const now = performance.now() / 1000;
  if (now - lockedAt > 6 && G.UI && G.UI.subtitle) G.UI.subtitle("<i>There's a chain on it.</i>", 1.8);
  lockedAt = now;
}

export function install(game) {
  G = game;
  const W = game.W;
  if (!W || !W.plugin) return;
  W.plugin(build);
  // the frame: the leaf's pace and the iron's sounds ride on world.js's own door step (main.js calls W.tick every frame)
  const base = W.tick;
  if (typeof base === 'function') W.tick = (dt) => { const was = tickBefore(); base(dt); tickAfter(dt, was); };
  // the barn door and the gate never make the house's door sounds (this module plays theirs: the iron roll, the hinge, the chain)
  const set = W.setDoor;
  if (typeof set === 'function') W.setDoor = (name, open, silent = false) => set(name, open, silent || name === 'barn' || name === 'gate');
  // by hand: the barn door slides either way; the gate, shut, only rattles its chain
  if (typeof game.addI === 'function') {
    const P = game.P, F = game.F, free = () => F.phase !== 'title' && P.mode === 'walk' && !F.cutscene;
    game.addI({ p: new V3(-59.22, 1.15, (DOOR.z0 + DOOR.z1) / 2), r: 1.9, label: () => (S.door && S.door.target ? 'Slide the door shut' : 'Slide the door open'), when: free, act: slideBarn });
    game.addI({ p: new V3(GATE.hx, 1.0, -14.9), r: 1.7, label: 'Try the gate', when: () => free() && !!S.gate && !S.gate.target && S.gate.a < 0.05, act: tryGate });
  }
}
