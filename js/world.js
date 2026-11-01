// Builds the farmhouse, the yard, the truck, the barn and all lights.
import * as THREE from 'three';
import * as TX from './textures.js';
import { applyPBR } from './pbr.js';
import { place, scatter } from './props.js';
import { flicker } from './settings.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const H = 2.7;      // ceiling height
export const WT = 0.16;    // wall thickness

// The house is drawn on its original plan (PLAN) and stretched as it is built: each span between wall lines is mapped to a wider
// one by SX and SZ, so the hall is longer, every room is roomier and nothing changes place. Build code writes plan coordinates;
// the finished house, the colliders and every number the game keeps are in the stretched ones, and so is everything exported here.
const stretch = (keys, f) => {
  const out = [keys[0]]; for (let i = 0; i < f.length; i++) out.push(out[i] + (keys[i + 1] - keys[i]) * f[i]);
  const fn = (v) => { if (v <= keys[0]) return v; for (let i = 0; i < f.length; i++) if (v <= keys[i + 1]) return out[i] + (v - keys[i]) * f[i]; return out[f.length] + (v - keys[f.length]); };
  fn.scale = (v) => { for (let i = 0; i < f.length; i++) if (v < keys[i + 1]) return v > keys[0] ? f[i] : 1; return 1; };
  fn.inv = (v) => { if (v <= out[0]) return v; for (let i = 0; i < f.length; i++) if (v <= out[i + 1]) return keys[i] + (v - out[i]) / f[i]; return keys[f.length] + (v - out[f.length]); };
  return fn;
};
export const SX = stretch([-8.1, -3.3, -1.4, 3.3, 5.0, 5.8, 8.1], [1.12, 1.12, 1.12, 1.25, 1.4, 1.5]);   // the west end stays; the bedroom end gains most
export const SZ = stretch([-4.5, -1.5, -0.3, 3.6], [1.12, 1.2, 1.12]);                                   // the front stays; the hall widens a little
const rect = (r) => [SX(r[0]), SX(r[1]), SZ(r[2]), SZ(r[3])];

// Room rectangles [minX, maxX, minZ, maxZ], measured to the middle of the walls, on the plan. The FRONT is the long wall facing the
// road (z = -4.5; seen from the road the viewer's left is +x). Along the front: the spare bedroom at the end, the office, the front
// door and picture window into the living room, then the lower wing, Mom and Dad's room. Behind them a back row: YOUR room
// (back-left corner), the bathroom, kitchen, dining. A hall runs along the bedroom end between the two rows.
const PLAN = {
  bed: [5.0, 8.1, -0.3, 3.6],        // yours: back-left corner
  bath: [3.3, 5.0, -0.3, 3.6],       // long and narrow, next to your room
  hall: [3.3, 8.1, -1.5, -0.3],
  spare: [5.8, 8.1, -4.5, -1.5],     // front bedroom at the end: the room nobody unpacked
  room2: [3.3, 5.8, -4.5, -1.5],     // front bedroom: the office
  living: [-3.3, 3.3, -4.5, -0.3],   // front door, picture window
  kitchen: [-1.4, 3.3, -0.3, 3.6],
  dining: [-3.3, -1.4, -0.3, 3.6],
  parents: [-8.1, -3.3, -3.9, 3.6],  // the lower wing, through the barn door off the dining room
};
export const ROOMS = {}; for (const k in PLAN) ROOMS[k] = rect(PLAN[k]);
// outside the shell: the back stoop with the cellar stairwell beside it, the detached garage in front of the wing, and the
// laundry under Mom and Dad's room (its floor is at BASEMENT; roomAt only finds it when y says you are down there).
export const BASEMENT = -2.4;
const PLAN_PLACES = {
  stoop: [-7.7, -1.2, 3.6, 5.1],
  laundry: [-8.1, -3.3, -0.4, 3.75],
};
export const PLACES = { garage: [-14.0, -7.6, -13.6, -7.0] }; for (const k in PLAN_PLACES) PLACES[k] = rect(PLAN_PLACES[k]);
// the outside stairs: from the stoop at x0 they drop BASEMENT over `run` metres going west, then a landing to xEnd
const PLAN_STAIR = { x0: -3.3, run: 3.12, xEnd: -7.4, z0: 3.7, z1: 4.75 };
export const STAIR = { x0: SX(PLAN_STAIR.x0), run: SX(PLAN_STAIR.x0) - SX(PLAN_STAIR.x0 - PLAN_STAIR.run), xEnd: SX(PLAN_STAIR.xEnd), z0: SZ(PLAN_STAIR.z0), z1: SZ(PLAN_STAIR.z1) };

const within = (rooms, places, x, z, y) => {
  const inside = (r) => x > r[0] && x < r[1] && z > r[2] && z < r[3];
  if (y < -1 && inside(places.laundry)) return 'laundry';
  for (const k in rooms) if (inside(rooms[k])) return k;
  for (const k in places) if (k !== 'laundry' && inside(places[k])) return k;
  return 'out';
};
export function roomAt(x, z, y = 0) { return within(ROOMS, PLACES, x, z, y); }
const planRoomAt = (x, z, y = 0) => within(PLAN, { ...PLAN_PLACES, garage: PLACES.garage }, x, z, y);
// the floor under (x, z): 0 on the yard, the stairwell and, for somebody already down there, the laundry; out in the field the ground rolls
let fieldHeight = () => 0;   // set by buildWorld once the field exists
export function groundAt(x, z, y = 0) {
  if (z > STAIR.z0 && z < STAIR.z1 && x < STAIR.x0 && x > STAIR.xEnd) return BASEMENT * Math.min(1, (STAIR.x0 - x) / STAIR.run);
  if (y < -1 && x > PLACES.laundry[0] && x < PLACES.laundry[1] && z > PLACES.laundry[2] && z < PLACES.laundry[3]) return BASEMENT;
  return fieldHeight(x, z);
}

// The TV model's texture (assets/props/tv.glb) carries an existing maker's badge, on the front panel and down the side. Each is painted over with
// the median colour of its own patch (the plate or plastic around the lettering), in the colour map and in the roughness/metalness map,
// where the lettering would otherwise still show in a highlight.
const TV_BADGES = [[381, 711, 95, 19], [511, 750, 26, 98]];   // x, y, w, h on the 1024 px texture
function plainTv(holder) {
  holder.traverse((o) => {
    const m = o.isMesh && o.material; if (!m) return;
    for (const t of new Set([m.map, m.roughnessMap, m.metalnessMap])) {
      const img = t && t.image; if (!img || !img.width || t.userData.plain) continue;
      const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
      const g = cv.getContext('2d', { willReadFrequently: true }), k = img.width / 1024; g.drawImage(img, 0, 0);
      for (const r of TV_BADGES) {
        const [x, y, w, h] = r.map((v) => Math.round(v * k)), d = g.getImageData(x, y, w, h).data, ch = [[], [], []];
        for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) ch[c].push(d[i + c]);
        g.fillStyle = `rgb(${ch.map((a) => a.sort((p, q) => p - q)[a.length >> 1]).join(',')})`; g.fillRect(x, y, w, h);
      }
      t.image = cv; t.needsUpdate = true; t.userData.plain = true;
    }
  });
}

// UVs in world meters, chosen by face normal. Texture.repeat sets the tile size.
function worldUV(geo) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (nx >= ny && nx >= nz) uv.setXY(i, z, y);
    else if (ny >= nx && ny >= nz) uv.setXY(i, x, z);
    else uv.setXY(i, x, y);
  }
  uv.needsUpdate = true;
}
export function buildWorld(scene) {
  const colliders = [];
  const solid = (minX, maxX, minZ, maxZ, extra = {}) => { const c = { minX, maxX, minZ, maxZ, on: true, ...extra }; colliders.push(c); return c; };
  const fixups = [], lateArches = [];   // run once the house is stretched: numbers the game keeps are mapped, the arches built in place
  const relTo = (ox, oz) => (v) => { v.x = SX(ox) + (v.x - ox); v.z = SZ(oz) + (v.z - oz); };   // a spot on a model, which keeps its size: it moves with the model's origin

  const T = {
    plaster: TX.plaster(), tile: TX.tile(),
    siding: TX.siding(), grass: TX.grass(), dirt: TX.dirt(), shingles: TX.shingles(), barn: TX.barnBoards(),
    plaid: TX.plaid(), rug: TX.rug(), mattress: TX.mattress(),
    drawing0: TX.drawing(0), drawing1: TX.drawing(1), painting: TX.painting(),
    floralA: TX.floral('#cdaaa3', '#a4505f', '#6d8461', 41), floralB: TX.floral('#9fb7ab', '#d98c8c', '#496b5c', 52), floralC: TX.floral('#8d5a60', '#d6b0a0', '#4d6a50', 63),
  };
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const M = {
    plaster: std({ map: T.plaster, roughness: 0.96 }),
    tile: std({ map: T.tile, roughness: 0.32 }),
    siding: std({ map: T.siding, roughness: 0.86 }),
    grass: std({ map: T.grass, roughness: 1 }),
    dirt: std({ map: T.dirt, roughness: 1 }),
    roof: std({ map: T.shingles, roughness: 0.9 }),
    barn: std({ map: T.barn, roughness: 0.9 }),
    trim: std({ color: 0x3e2b1f, roughness: 0.6 }),
    white: std({ color: 0xd9d3c5, roughness: 0.55 }),
    furn: std({ color: 0x5a3e2c, roughness: 0.65 }),
    darkWood: std({ color: 0x33221a, roughness: 0.6 }),
    metal: std({ color: 0x9a9a9a, roughness: 0.3, metalness: 0.85 }),
    black: std({ color: 0x111111, roughness: 0.5 }),
    couch: std({ color: 0x5b4a3a, roughness: 1 }),
    curtain: std({ color: 0x7a3a32, roughness: 1, side: THREE.DoubleSide }),
    mattress: std({ map: T.mattress, roughness: 1 }),
    plaid: std({ map: T.plaid, roughness: 1 }),
    pillow: std({ color: 0xe8e2d6, roughness: 1 }),
    rug: std({ map: T.rug, roughness: 1 }),
    concrete: std({ color: 0x77736b, roughness: 1 }),
    garageDoor: std({ color: 0xcfc9b8, roughness: 0.6 }),
    tire: std({ color: 0x151515, roughness: 0.9 }),
    glassOut: std({ color: 0x1a222c, roughness: 0.08, metalness: 0.6 }),
    trunk: std({ color: 0x3b2c20, roughness: 1 }),
    leaves: std({ color: 0x1f3322, roughness: 1 }),
    silo: std({ color: 0x8c9294, roughness: 0.6, metalness: 0.4 }),
    fence: std({ color: 0x6b5d4c, roughness: 1 }),
    counter: std({ color: 0xb9b2a0, roughness: 0.4 }),
    crt: std({ color: 0x2a2a28, roughness: 0.6 }),
    crtScreen: std({ color: 0x1c2420, roughness: 0.1, metalness: 0.3 }),
    mirror: std({ color: 0x9aa0a4, roughness: 0.08, metalness: 1 }),
    lamp: std({ color: 0xf2e6c8, emissive: 0xffd9a0, emissiveIntensity: 0, roughness: 0.6 }),
    // 2002: dark brown carpet everywhere, white doors, plain white cabinets and appliances, oak and brass
    carpet: std({ color: 0x4a3526, roughness: 1 }), lino: std({ color: 0xd6cbae, roughness: 0.45 }), slate: std({ color: 0x5c5a56, roughness: 0.7 }), bathFloor: std({ color: 0xd8bfc2, roughness: 0.3 }),
    pinkTile: std({ map: T.tile, color: 0xe6b3bd, roughness: 0.25 }), brick: std({ color: 0xa0553f, roughness: 0.95 }), drywall: std({ color: 0xe6e4de, roughness: 0.95 }),
    floralB: std({ map: T.floralB, roughness: 0.92 }),
    doorW: std({ color: 0xece8de, roughness: 0.5 }), doorInsetW: std({ color: 0xdcd7ca, roughness: 0.6 }), barnDoor: std({ color: 0xd8d3c4, roughness: 0.8 }),
    cabW: std({ color: 0xe9e6dc, roughness: 0.42 }), cabLine: std({ color: 0xc9c5b8, roughness: 0.6 }), appW: std({ color: 0xf1efe9, roughness: 0.28 }),
    brass: std({ color: 0xc9a14a, roughness: 0.28, metalness: 0.9 }), oak: std({ color: 0x9c6b3c, roughness: 0.55 }), heater: std({ color: 0xe6e2d6, roughness: 0.5 }),
    steelSink: std({ color: 0xc9cccf, roughness: 0.25, metalness: 1 }),
    showerCurtain: std({ map: T.floralB, roughness: 0.85, side: THREE.DoubleSide, transparent: true, opacity: 1 }), valance: std({ map: T.floralA, roughness: 0.95, side: THREE.DoubleSide }),
  };
  M.curtain.map = T.floralC; M.curtain.color.set(0xffffff);
  for (const k of ['pinkTile', 'carpet', 'lino', 'slate', 'bathFloor', 'brick', 'oak', 'cabW']) M[k].userData.worldUV = true;
  for (const k of ['furn', 'darkWood', 'fence', 'concrete', 'plaid', 'mattress', 'pillow', 'roof', 'silo']) M[k].userData.worldUV = true;
  // PBR sets replace the canvas textures as they load
  applyPBR(M.floralB, 'wall', { normal: 1.1, keepMap: true });
  applyPBR(M.drywall, 'wall', { tint: 0xe4e2dc, normal: 0.7 });
  applyPBR(M.carpet, 'carpet', { normal: 1.4 });
  applyPBR(M.lino, 'tile', { tint: 0xd8ccb0, tile: 0.5 });
  applyPBR(M.bathFloor, 'tile', { tint: 0xd8b8bd, tile: 0.3 });
  applyPBR(M.slate, 'concrete', { tint: 0xe0dacc });
  applyPBR(M.brick, 'concrete', { tint: 0xb4604a, tile: 1.2 });
  applyPBR(M.oak, 'pine', { tint: 0xa8743f });
  applyPBR(M.plaster, 'ceiling', { tint: 0xdcd6c8, normal: 1.0 });
  applyPBR(M.tile, 'tile');
  applyPBR(M.siding, 'siding', { tint: 0xe0a468, normal: 1.1, tile: 1.19, rotate: Math.PI / 2 });   // vertical boards on the walls (the gable ends stay horizontal lap)
  applyPBR(M.grass, 'grass', { anti: true, tile: 2.4, flat: 0.95 });
  applyPBR(M.dirt, 'dirt', { anti: true, flat: 0.95 });
  applyPBR(M.roof, 'roof', { tint: 0xcfcfcf, anti: { scale: 0.08, strength: 0.18 } });
  applyPBR(M.barn, 'darkwood', { tint: 0xa44a3a });
  applyPBR(M.concrete, 'concrete');
  applyPBR(M.fence, 'darkwood', { tint: 0xc8bba8 });
  applyPBR(M.furn, 'pine', { tint: 0x9a7556 });
  applyPBR(M.darkWood, 'darkwood', { tint: 0xa89888 });
  applyPBR(M.plaid, 'plaid', { rough: 1 });
  applyPBR(M.mattress, 'linen', { tint: 0xe8e2d4 });
  applyPBR(M.pillow, 'linen', { tint: 0xf2eee4 });
  // bed linen (warm white, no sheen) and the bunk's comforter: the plaid at a comforter's scale
  M.bedLinen = std({ color: 0xf6f0e4, roughness: 0.95 }); M.bedLinen.userData.worldUV = true; applyPBR(M.bedLinen, 'linen', { keepMap: true, flat: 0.92 });   // the linen colour map is blue, so only its weave is used
  M.comforter = std({ map: T.plaid, roughness: 1 }); M.comforter.userData.worldUV = true; applyPBR(M.comforter, 'plaid', { rough: 1, tile: 0.65 });
  applyPBR(M.silo, 'metal', { tint: 0xb8bcc0, anti: true });
  M.gable = std({ map: T.siding, side: THREE.DoubleSide, roughness: 0.86 }); applyPBR(M.gable, 'siding', { tint: 0xe0a468, normal: 1.1 });
  // the garage inside (plywood over studs) and the basement (block walls, a stained slab); the basement finishes barely take the sky light
  M.ply = std({ color: 0xc9a87a, roughness: 0.8 }); M.ply.userData.worldUV = true; applyPBR(M.ply, 'pine', { tint: 0xd2b48c, tile: 1.2 });
  M.block = std({ color: 0x5c5a55, roughness: 1 }); M.block.userData.worldUV = true; applyPBR(M.block, 'concrete', { tint: 0x66645e, tile: 1.6, normal: 1.3 }); M.block.envMapIntensity = 0.1;
  M.cellarFloor = std({ color: 0x3a3835, roughness: 1 }); M.cellarFloor.userData.worldUV = true; applyPBR(M.cellarFloor, 'concrete', { tint: 0x45423e, tile: 2.2 }); M.cellarFloor.envMapIntensity = 0.08;
  M.cellarCeil = std({ color: 0x1f1c19, roughness: 1 }); M.cellarCeil.envMapIntensity = 0.05;
  M.steel = std({ color: 0x8f969c, roughness: 0.5, metalness: 0.4 });
  M.pipe = std({ color: 0x6c6a66, roughness: 0.6, metalness: 0.6 });
  M.tub = std({ color: 0xb9b6a8, roughness: 0.5 });
  M.water = std({ color: 0x1a1f22, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.85 });
  M.drip = std({ color: 0xcfe0ea, roughness: 0.1, transparent: true, opacity: 0.7 });

  const house = new THREE.Group(); scene.add(house);
  const yard = new THREE.Group(); scene.add(yard);

  const wallMatAt = (px, pz) => (PLAN[planRoomAt(px, pz)] ? M.drywall : M.siding);   // the stoop and the garage count as outside

  // stand-in furniture is tagged so it can be hidden when its model arrives
  let curTag = null; const tagged = {};
  const tagStart = (k) => { curTag = tagged[k] = tagged[k] || []; }, tagEnd = () => { curTag = null; };

  // Axis-aligned box from bounds. mat: material | array | 'room' (sample rooms per face)
  let defParent = null;   // while set, box() and rbox() add to this group (the mirrored bunk)
  function box(minX, maxX, minY, maxY, minZ, maxZ, mat, o = {}) {
    const geo = new THREE.BoxGeometry(maxX - minX, maxY - minY, maxZ - minZ);
    geo.translate((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
    if (o.uv !== false || (mat && mat.userData && mat.userData.worldUV)) { worldUV(geo); geo.userData.worldUV = true; }
    let m = mat;
    if (mat === 'room') {
      const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2, e = 0.12;
      m = [wallMatAt(maxX + e, cz), wallMatAt(minX - e, cz), M.plaster, M.plaster, wallMatAt(cx, maxZ + e), wallMatAt(cx, minZ - e)];
    }
    const mesh = new THREE.Mesh(geo, m);
    mesh.castShadow = o.cast !== false; mesh.receiveShadow = true;
    (o.parent || defParent || house).add(mesh);
    if (curTag) curTag.push(mesh);
    return mesh;
  }

  // Box with rounded edges, for fixtures (the bevel picks up a highlight along each edge). Same bounds as box().
  function rbox(x0, x1, y0, y1, z0, z1, mat, r = 0.02, o = {}) {
    const geo = new RoundedBoxGeometry(x1 - x0, y1 - y0, z1 - z0, 3, Math.min(r, (x1 - x0) / 2.01, (y1 - y0) / 2.01, (z1 - z0) / 2.01));
    geo.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    if (mat && mat.userData && mat.userData.worldUV) { worldUV(geo); geo.userData.worldUV = true; }
    const m = new THREE.Mesh(geo, mat); m.castShadow = o.cast !== false; m.receiveShadow = true; (o.parent || defParent || house).add(m);
    if (curTag) curTag.push(m);
    return m;
  }
  // A comforter lying on a mattress that runs along x, head at x0: a sheet of cloth with a rolled edge at the head, a turned-back band
  // behind it (double thickness, so the sheet under it shows), soft folds, a rolled edge at the foot, tucked at zWall, and on the zEdge
  // side hanging `hang` down the mattress with a slow wave. uv is world x and the distance along the cloth, like worldUV.
  function drape({ x0, x1, zWall, zEdge, top, mat, hang = 0, loft = 0.05, band = 0.25, seed = 0 }) {
    const NX = 56, NZ = 24, NH = hang > 0 ? 6 : 0, rows = NZ + 1 + NH, dir = Math.sign(zEdge - zWall);
    const pos = [], uvs = [], idx = [], sm = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
    const height = (x, z) => {
      const dz = Math.abs(z - zWall), w = Math.abs(zEdge - zWall), head = x - x0, foot = x1 - x;
      const edge = sm(head / 0.07) * sm(foot / 0.06) * (hang > 0 ? 1 : sm((w - dz) / 0.06));   // rolled edges at the head, the foot, and the side that does not hang
      let y = loft * edge;
      y += 0.045 * edge * sm((head - 0.07) / 0.05) * sm((0.07 + band - head) / 0.05);    // the turned-back band
      const inner = sm(head / 0.12) * sm(foot / 0.1) * sm((w - dz) / 0.1) * sm(dz / 0.06);   // folds stay off the edges
      y += inner * (0.022 * Math.sin(x * 8.5 + seed) * Math.sin(dz * 4.2 + 0.5 + seed) + 0.012 * Math.sin(x * 19 + dz * 11 + seed * 2) - 0.008 * Math.sin(dz / w * Math.PI));
      y += 0.004 * (1 - sm(dz / 0.05));                                                 // tucked in at the wall
      return top + 0.004 + y;
    };
    for (let i = 0; i <= NX; i++) {
      const x = x0 + (x1 - x0) * i / NX;
      for (let j = 0; j < rows; j++) {
        if (j <= NZ) { const z = zWall + (zEdge - zWall) * j / NZ; pos.push(x, height(x, z), z); uvs.push(x, z); }
        else {   // over the edge and down the side
          const k = j - NZ, d = hang * (k / NH), dd = sm(k / 1.5);
          const z = zEdge + dir * (0.006 + 0.012 * dd + 0.012 * Math.sin(x * 7 + seed) * sm(d / 0.08));
          pos.push(x, top + 0.004 + loft * (1 - dd) - d, z); uvs.push(x, zEdge + dir * (0.03 * dd + d));
        }
      }
    }
    for (let i = 0; i < NX; i++) for (let j = 0; j < rows - 1; j++) {
      const a = i * rows + j, b = a + rows;
      if (dir > 0) idx.push(a, a + 1, b, b, a + 1, b + 1); else idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; (defParent || house).add(m);
    if (curTag) curTag.push(m);
    return m;
  }
  // a pillow: a well-rounded box, turned a touch, in the pillowcase linen
  function pillow(x0, x1, y0, z0, z1, yaw = 0, h = 0.13, o = {}) {
    const p = rbox(x0, x1, y0, y0 + h, z0, z1, M.bedLinen, 0.06, o);
    p.geometry.translate(-(x0 + x1) / 2, 0, -(z0 + z1) / 2); p.geometry.rotateY(yaw); p.geometry.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
    return p;
  }
  // ---------- walls ----------
  const cutsX = [...new Set(Object.values(PLAN).flatMap((r) => [r[0], r[1]]))], cutsZ = [...new Set(Object.values(PLAN).flatMap((r) => [r[2], r[3]]))];
  function trims(b, alongX) {
    for (const s of [1, -1]) {
      const cx = (b[0] + b[1]) / 2, cz = (b[4] + b[5]) / 2;
      const room = alongX ? planRoomAt(cx, cz + s * 0.3) : planRoomAt(cx + s * 0.3, cz);
      if (!PLAN[room]) continue;
      const strip = (y0, y1, th, mat = M.trim) => {
        if (alongX) { const f = s > 0 ? b[5] : b[4]; box(b[0], b[1], y0, y1, Math.min(f, f + s * th), Math.max(f, f + s * th), mat, { uv: mat !== M.trim }); }
        else { const f = s > 0 ? b[1] : b[0]; box(Math.min(f, f + s * th), Math.max(f, f + s * th), y0, y1, b[4], b[5], mat, { uv: mat !== M.trim }); }
      };
      strip(0, 0.11, 0.022);
    }
  }
  function casing(alongX, fixed, gp) {
    // The trim sits 1.2 cm proud of the jamb and the lintel: flush faces would z-fight the wall and flicker as you move.
    const top = gp.top ?? 2.1, t = WT / 2 + 0.025, a = gp.c - gp.w / 2, b = gp.c + gp.w / 2, cw = 0.08, e = 0.012, y0 = gp.y0 ?? 0;
    if (alongX) {
      box(a - cw, a + e, y0, y0 + top - e, fixed - t, fixed + t, M.white, { uv: false });
      box(b - e, b + cw, y0, y0 + top - e, fixed - t, fixed + t, M.white, { uv: false });
      if (!gp.arch) box(a - cw, b + cw, y0 + top - e, y0 + top + 0.09, fixed - t, fixed + t, M.white, { uv: false });
    } else {
      box(fixed - t, fixed + t, y0, y0 + top - e, a - cw, a + e, M.white, { uv: false });
      box(fixed - t, fixed + t, y0, y0 + top - e, b - e, b + cw, M.white, { uv: false });
      if (!gp.arch) box(fixed - t, fixed + t, y0 + top - e, y0 + top + 0.09, a - cw, b + cw, M.white, { uv: false });
    }
  }
  // the arch between kitchen and living room: wall above a half-round opening, with a trim band around it. It is built once the
  // house is stretched, in the finished coordinates (lateArches): its faces take the drywall in world metres like the wall boxes
  // beside them, and the curved soffit's uv runs along the arc, so the texture keeps its scale round the bend instead of smearing
  function archFill(alongX, fixed, gp) {
    const along = alongX ? SX : SZ, across = alongX ? SZ : SX;
    const c = along(gp.c), r = gp.w / 2, sp = gp.top, vA = across(fixed - WT / 2), vB = across(fixed + WT / 2), vM = across(fixed);
    const g = new THREE.Group(); g.userData.noWarp = true; house.add(g);
    const put = (geo, mat, v, facing) => {   // a flat piece drawn in (u, y), set on the wall's face at v across it, its normal along `facing`
      if (!alongX) geo.rotateY(-Math.PI / 2);                                       // the shape's +z normal becomes -x
      if (facing !== (alongX ? 1 : -1)) { const i = geo.index.array; for (let k = 0; k < i.length; k += 3) { const t = i[k + 1]; i[k + 1] = i[k + 2]; i[k + 2] = t; } geo.computeVertexNormals(); }
      geo.translate(alongX ? 0 : v, 0, alongX ? v : 0);
      const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; g.add(m); return m;
    };
    // the spandrel on each face (the uv is the shape's own (u, y), which is world metres)
    const spandrel = new THREE.Shape(); spandrel.moveTo(c - r, sp); spandrel.absarc(c, sp, r, Math.PI, 0, true); spandrel.lineTo(c + r, H); spandrel.lineTo(c - r, H); spandrel.closePath();
    put(new THREE.ShapeGeometry(spandrel, 24), M.drywall, vB, 1); put(new THREE.ShapeGeometry(spandrel, 24), M.drywall, vA, -1);
    // the soffit: quads along the arc from one springing line to the other, uv = (distance along the arc, distance across)
    {
      const N = 32, pos = [], uv = [], idx = [];
      for (let i = 0; i <= N; i++) {
        const th = Math.PI - Math.PI * i / N, u = c + r * Math.cos(th), y = sp + r * Math.sin(th), sArc = c - r + r * (Math.PI - th);
        for (const v of [vA, vB]) { pos.push(alongX ? u : v, y, alongX ? v : u); uv.push(sArc, v); }
      }
      for (let i = 0; i < N; i++) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, M.drywall); m.castShadow = m.receiveShadow = true; g.add(m);
    }
    // the trim: a band round the curve, proud of both faces, and the casing down each side to the floor
    const band = new THREE.Shape(); band.absarc(0, 0, r + 0.08, 0, Math.PI, false); band.absarc(0, 0, r, Math.PI, 0, true);
    const bg = new THREE.ExtrudeGeometry(band, { depth: vB - vA + 0.05, bevelEnabled: false, curveSegments: 24 }); bg.translate(0, sp, 0);
    const bm = new THREE.Mesh(bg, M.white); bm.castShadow = bm.receiveShadow = true;
    if (alongX) bm.position.set(c, 0, vA - 0.025); else { bm.rotation.y = -Math.PI / 2; bm.position.set(vB + 0.025, 0, c); }
    g.add(bm);
    const cw = 0.08, e = 0.012;
    for (const side of [-1, 1]) {
      const u0 = side < 0 ? c - r - cw : c + r - e, u1 = side < 0 ? c - r + e : c + r + cw;
      if (alongX) lbox(g, u0, u1, 0, sp, vA - 0.025, vB + 0.025, M.white, false); else lbox(g, vA - 0.025, vB + 0.025, 0, sp, u0, u1, M.white, false);
    }
  }
  function wall(x1, z1, x2, z2, gaps = []) {
    const alongX = z1 === z2;
    const a0 = alongX ? Math.min(x1, x2) : Math.min(z1, z2), a1 = alongX ? Math.max(x1, x2) : Math.max(z1, z2);
    const fixed = alongX ? z1 : x1;
    const segs = []; let cur = a0;
    // a door or an arch keeps its width through the stretch: its gap is drawn narrower by the local factor. windows stretch with the wall
    const span = (gp) => (gp.sill === undefined ? gp.w / (alongX ? SX.scale(gp.c) : SZ.scale(gp.c)) : gp.w);
    for (const gp of [...gaps].sort((p, q) => p.c - q.c)) {
      const g0 = gp.c - span(gp) / 2, g1 = gp.c + span(gp) / 2;
      if (g0 > cur) segs.push([cur, g0, 0, H]);
      if (gp.arch) { /* filled by archFill */ }
      else if (gp.sill !== undefined) { segs.push([g0, g1, 0, gp.sill]); segs.push([g0, g1, gp.sill + gp.h, H]); }   // a window: wall below and above
      else segs.push([g0, g1, gp.top ?? 2.1, H]);                                                                    // a door: wall above
      cur = g1;
    }
    if (cur < a1) segs.push([cur, a1, 0, H]);
    // split full-height pieces at room boundaries so each face picks the right finish
    const cuts = alongX ? cutsX : cutsZ;
    const split = [];
    for (const sg of segs) {
      if (sg[2] !== 0) { split.push(sg); continue; }
      let a = sg[0];
      for (const c of [...cuts].sort((p, q) => p - q)) if (c > a + 0.01 && c < sg[1] - 0.01) { split.push([a, c, 0, sg[3]]); a = c; }
      split.push([a, sg[1], 0, sg[3]]);
    }
    for (const [s0, s1, y0, y1] of split) {
      const b = alongX ? [s0, s1, y0, y1, fixed - WT / 2, fixed + WT / 2] : [fixed - WT / 2, fixed + WT / 2, y0, y1, s0, s1];
      box(...b, 'room');
      if (y0 === 0) { solid(b[0], b[1], b[4], b[5], { wall: true, minY: -0.3, maxY: H }); trims(b, alongX); }   // the y range: these walls stop nothing in the basement
    }
    for (const gp of gaps) {
      if (gp.arch) lateArches.push([alongX, fixed, gp]);                                   // built after the stretch, in the finished coordinates
      else if (gp.sill === undefined) { if (!gp.door) casing(alongX, fixed, { ...gp, w: span(gp) }); }   // hinged doors bring their own jambs and casing
      else {   // nothing may walk out through a window
        const a = gp.c - gp.w / 2, b = gp.c + gp.w / 2;
        if (alongX) solid(a, b, fixed - WT / 2, fixed + WT / 2, { wall: true, minY: -0.3, maxY: H }); else solid(fixed - WT / 2, fixed + WT / 2, a, b, { wall: true, minY: -0.3, maxY: H });
      }
    }
  }

  // exterior shell
  wall(-3.3, -4.5, 8.1, -4.5, [{ c: 6.35, w: 1.0, sill: 0.85, h: 1.25 }, { c: 4.4, w: 1.3, sill: 0.85, h: 1.25 }, { c: 1.9, w: 0.94, door: true }, { c: -0.6, w: 2.4, sill: 0.55, h: 1.35 }]);
  wall(-8.1, -3.9, -3.3, -3.9);
  wall(8.1, -4.5, 8.1, 3.6, [{ c: -3.5, w: 1.2, sill: 0.85, h: 1.25 }, { c: 2.85, w: 0.8, sill: 0.85, h: 1.25 }]);
  wall(-8.1, -3.9, -8.1, 3.6, [{ c: -1.6, w: 1.4, sill: 0.85, h: 1.25 }, { c: 1.8, w: 1.4, sill: 0.85, h: 1.25 }]);
  wall(-8.1, 3.6, 8.1, 3.6, [{ c: 4.2, w: 0.6, sill: 1.45, h: 0.6 }, { c: 1.4, w: 1.8, sill: 1.0, h: 0.9 }, { c: -2.3, w: 0.89, door: true }]);   // the back door at the dining end
  wall(-3.3, -4.5, -3.3, 3.6, [{ c: 0.45, w: 1.1, top: 2.05 }]);              // living room and dining | Mom and Dad's room, with the barn door
  wall(3.3, -4.5, 3.3, -1.5); wall(3.3, -0.3, 3.3, 3.6);                       // the hall opens into the living room between them
  wall(3.3, -1.5, 8.1, -1.5, [{ c: 3.9, w: 0.89, top: 2.03, door: true }, { c: 7.5, w: 0.89, top: 2.03, door: true }]);    // hall | the office and the spare room
  wall(3.3, -0.3, 8.1, -0.3, [{ c: 4.15, w: 0.89, top: 2.03, door: true }, { c: 7.05, w: 0.89, top: 2.03, door: true }]);   // hall | bathroom, YOUR room
  wall(5.8, -4.5, 5.8, -1.5); wall(5.0, -0.3, 5.0, 3.6);
  wall(-1.4, -0.3, -1.4, 1.6);   // the short wall between kitchen and dining
  wall(-1.4, -0.3, 3.3, -0.3, [{ c: 1.7, w: 1.4, top: 1.85, arch: true }]);   // the middle wall between the living room and the kitchen, with the arch (the dining end is open to the living room)

  // floors & ceiling: dark brown carpet through the whole house except the wet rooms
  const FLOORMAT = { bath: M.bathFloor, kitchen: M.lino, dining: M.lino };
  for (const k in PLAN) { const r = PLAN[k]; box(r[0], r[1], -0.1, 0, r[2], r[3], FLOORMAT[k] || M.carpet, { cast: false }); }
  box(-8.2, 8.2, H, H + 0.1, -4.6, 3.7, M.plaster);

  // foundation strip outside
  box(-3.4, 8.2, -0.05, 0.28, -4.62, -4.5, M.concrete, { uv: false });
  box(-8.2, -3.2, -0.05, 0.28, -4.02, -3.9, M.concrete, { uv: false });
  box(-8.2, 8.2, -0.05, 0.28, 3.6, 3.72, M.concrete, { uv: false });
  box(8.1, 8.22, -0.05, 0.28, -4.62, 3.72, M.concrete, { uv: false });
  box(-8.22, -8.1, -0.05, 0.28, -4.02, 3.72, M.concrete, { uv: false });

  // roof (low gable, ridge along x), with a brick chimney where the hall meets the living room. Drawn straight in the finished
  // coordinates over the stretched footprint, so it is not stretched again
  {
    const X0 = SX(-8.1) - 0.08, X1 = SX(8.1) + 0.08, Z0 = -4.5 - 0.85, Z1 = SZ(3.6) + 0.85, half = (Z1 - Z0) / 2, zc = (Z0 + Z1) / 2;
    const rise = half * 1.5 / 4.9, L = Math.hypot(half, rise), a = Math.atan2(rise, half);
    for (const s of [-1, 1]) {
      const geo = new THREE.BoxGeometry(X1 - X0 + 0.6, 0.14, L); worldUV(geo);
      const m = new THREE.Mesh(geo, M.roof); m.castShadow = m.receiveShadow = true; m.userData.noWarp = true;
      m.position.set((X0 + X1) / 2, H + 0.1 + rise / 2, zc + s * half / 2); m.rotation.x = s * a;
      house.add(m);
    }
    const peak = H + 0.1 + rise * ((half - 0.8) / half);
    const shape = new THREE.Shape([new THREE.Vector2(4.6, H + 0.1), new THREE.Vector2(-(SZ(3.6) + 0.1), H + 0.1), new THREE.Vector2(-zc, peak)]);   // shape x is -z once turned
    for (const x of [X0, X1]) {
      const g = new THREE.ShapeGeometry(shape); g.rotateY(Math.PI / 2);
      const m = new THREE.Mesh(g, M.gable); m.position.x = x; m.castShadow = true; m.userData.noWarp = true; house.add(m);
    }
    box(2.8, 3.8, 2.5, 4.9, -1.6, -0.8, M.brick);
    box(2.7, 3.9, 4.9, 5.0, -1.7, -0.7, M.concrete, { uv: false });
  }

  // ---------- windows ----------
  const glass = std({ color: 0xffffff, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.14, side: THREE.DoubleSide, envMapIntensity: 1.5 });
  function windowAt(alongX, fixed, c, insideSign, { sill = 0.85, w = 1.0, h = 1.25, curtains = false } = {}) {
    const cy = sill + h / 2;
    {   // one clear pane in the opening, so the yard shows through and the sun comes in
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.02, h + 0.02), glass);
      if (alongX) pane.position.set(c, cy, fixed); else { pane.position.set(fixed, cy, c); pane.rotation.y = Math.PI / 2; }
      pane.userData.noAO = true; pane.userData.stretch = alongX ? 'x' : 'z'; pane.renderOrder = 2; house.add(pane);   // the glass stretches with its opening
    }
    for (const side of [insideSign, -insideSign]) {
      // frame
      const f = fixed + side * (WT / 2 + 0.02), fa = Math.min(fixed + side * WT / 2, f), fb = Math.max(fixed + side * WT / 2, f) + 0.001;
      const fr = (a0, a1, y0, y1) => alongX ? box(a0, a1, y0, y1, fa, fb, M.white, { uv: false }) : box(fa, fb, y0, y1, a0, a1, M.white, { uv: false });
      fr(c - w / 2 - 0.07, c - w / 2, sill - 0.07, sill + h + 0.07);
      fr(c + w / 2, c + w / 2 + 0.07, sill - 0.07, sill + h + 0.07);
      fr(c - w / 2, c + w / 2, sill + h, sill + h + 0.07);
      fr(c - w / 2 - 0.1, c + w / 2 + 0.1, sill - 0.08, sill);
      fr(c - 0.02, c + 0.02, sill, sill + h);
      fr(c - w / 2, c + w / 2, cy - 0.02, cy + 0.02);
    }
    if (curtains) {
      for (const s of [-1, 1]) {
        const cur = new THREE.Mesh(new THREE.PlaneGeometry(0.42, h + 0.55, 6, 1), M.curtain);
        const pos = cur.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 22) * 0.025);
        cur.geometry.computeVertexNormals();
        const off = fixed + insideSign * (WT / 2 + 0.06);
        if (alongX) { cur.position.set(c + s * (w / 2 + 0.12), cy + 0.1, off); cur.rotation.y = insideSign > 0 ? 0 : Math.PI; }
        else { cur.position.set(off, cy + 0.1, c + s * (w / 2 + 0.12)); cur.rotation.y = insideSign * Math.PI / 2; }
        cur.castShadow = true; house.add(cur);
      }
      // a floral valance across the top, and the rod
      {
        const vw = w + 0.8, vo = fixed + insideSign * (WT / 2 + 0.09);
        const v = new THREE.Mesh(new THREE.BoxGeometry(alongX ? vw : 0.14, 0.34, alongX ? 0.14 : vw), M.valance);
        v.position.set(alongX ? c : vo, sill + h + 0.2, alongX ? vo : c); v.castShadow = true; house.add(v);
      }
      // rod
      const off = fixed + insideSign * (WT / 2 + 0.07);
      if (alongX) box(c - w / 2 - 0.4, c + w / 2 + 0.4, sill + h + 0.3, sill + h + 0.33, off - 0.015, off + 0.015, M.darkWood, { uv: false });
      else box(off - 0.015, off + 0.015, sill + h + 0.3, sill + h + 0.33, c - w / 2 - 0.4, c + w / 2 + 0.4, M.darkWood, { uv: false });
    }
  }
  windowAt(true, -4.5, 6.35, 1, { w: 1.0 });                                                  // front: bedroom at the end (the dresser sits under it, the closet beside it: no room for curtains)
  windowAt(true, -4.5, 4.4, 1, { w: 1.3, curtains: true });                                   // front: bedroom
  windowAt(true, -4.5, -0.6, 1, { sill: 0.55, w: 2.4, h: 1.35, curtains: true });             // front: the picture window
  windowAt(false, 8.1, -3.5, -1, { w: 1.2, curtains: true });                                 // end wall: bedroom
  windowAt(false, 8.1, 2.85, -1, { w: 0.8, curtains: true });                                 // end wall: YOUR room's only window
  windowAt(false, -8.1, -1.6, 1, { w: 1.4, curtains: true });                                 // Mom and Dad's: two windows on the west end
  windowAt(false, -8.1, 1.8, 1, { w: 1.4, curtains: true });
  windowAt(true, 3.6, 4.2, -1, { sill: 1.45, w: 0.6, h: 0.6 });                               // back: bathroom
  windowAt(true, 3.6, 1.4, -1, { sill: 1.0, w: 1.8, h: 0.9, curtains: true });                // back: kitchen, over the sink (the dining end has the back door instead of a window)

  // ---------- doors ----------
  // A hung door: the frame (jambs, head, casing on both faces, a threshold, the hinges and the strike plate) stands still in `fr`; the
  // leaf swings in `g`, which sits at the hinge pin on the wall line and extends along (dx, dz) when closed. w is the leaf, 0.81 for the
  // rooms and 0.86 for the front door; the rough opening is w + 2 jambs. depth is the wall's thickness there. kind: 'six' (a six-panel
  // leaf), 'front' (six panels, a deadbolt, a peephole), 'back' (half glass over two panels). openSide: +1 or -1, the local z side
  // the leaf swings to, where the hinge knuckles show.
  const lbox = (parent, x0, x1, y0, y1, z0, z1, mat, cast = true) => {   // either order on each axis: a box drawn backwards would be inside out
    const m = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)), mat); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m;
  };
  function door(hx, hz, dx, dz, { y0 = 0, kind = 'six', w = 0.81, depth = WT, openSide = -1 } = {}) {
    const ry = Math.atan2(-dz, dx), J = 0.04, T = kind === 'front' ? 0.045 : 0.04, HT = 2.03, hd = depth / 2, C = 0.075, E = 0.012;
    const fr = new THREE.Group(); fr.position.set(hx, y0, hz); fr.rotation.y = ry; house.add(fr);
    const g = new THREE.Group(); g.position.set(hx, y0, hz); g.rotation.y = ry; house.add(g);
    // the frame: hinge jamb, latch jamb, head, and the casing a hair proud of the wall on both faces
    lbox(fr, -J, 0, 0, HT + J, -hd, hd, M.doorW); lbox(fr, w, w + J, 0, HT + J, -hd, hd, M.doorW); lbox(fr, -J, w + J, HT, HT + J, -hd, hd, M.doorW);
    for (const side of [-1, 1]) {
      const z0 = Math.min(side * hd, side * (hd + E)), z1 = Math.max(side * hd, side * (hd + E));
      lbox(fr, -J - C, -J + E, 0, HT + J + C - E, z0, z1, M.white, false); lbox(fr, w + J - E, w + J + C, 0, HT + J + C - E, z0, z1, M.white, false);
      lbox(fr, -J - C, w + J + C, HT + J - E, HT + J + C, z0, z1, M.white, false);
    }
    lbox(fr, -J, w + J, 0, 0.016, -hd - 0.02, hd + 0.02, M.oak, false);                                              // threshold
    for (const y of [0.28, 1.02, 1.76]) lbox(fr, -0.006, 0.006, y - 0.045, y + 0.045, openSide * (T / 2 + 0.002), openSide * (T / 2 + 0.014), M.brass);   // hinge knuckles
    lbox(fr, w - 0.001, w + 0.002, 0.94, 1.07, -0.014, 0.014, M.brass);                                               // strike plate
    // the leaf (a 3 mm reveal to the jambs and the head, 2 cm over the threshold) and its panels (two columns of three on each face,
    // sunk 2 mm into the leaf so no face shares its plane), the knob and rose on both faces
    const R = 0.003, leaf = lbox(g, R, w - R, 0.02, HT - R, -T / 2, T / 2, M.doorW);
    const panels = (rows) => { for (const side of [-1, 1]) for (const [px, pw] of [[w * 0.265, w * 0.345], [w * 0.735, w * 0.345]]) for (const [py, h] of rows) {
      lbox(g, px - pw / 2, px + pw / 2, py - h / 2, py + h / 2, side * (T / 2 - 0.002), side * (T / 2 + 0.008), M.doorW, false);
      lbox(g, px - pw / 2 + 0.035, px + pw / 2 - 0.035, py - h / 2 + 0.035, py + h / 2 - 0.035, side * (T / 2 + 0.008), side * (T / 2 + 0.012), M.doorInsetW, false);
    } };
    if (kind === 'back') {
      lbox(g, 0.1, w - 0.1, 1.15, 1.9, -T / 2 - 0.002, T / 2 + 0.002, M.glassOut);
      panels([[0.78, 0.4], [0.3, 0.42]]);
    } else panels([[1.72, 0.42], [1.22, 0.42], [0.5, 0.62]]);
    for (const side of [-1, 1]) {
      const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 16), M.brass); rose.rotation.x = Math.PI / 2; rose.position.set(w - 0.065, 1.0, side * (T / 2 + 0.006)); g.add(rose);
      const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.045, 10), M.brass); shank.rotation.x = Math.PI / 2; shank.position.set(w - 0.065, 1.0, side * (T / 2 + 0.03)); g.add(shank);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 14, 10), M.brass); knob.position.set(w - 0.065, 1.0, side * (T / 2 + 0.06)); g.add(knob);
      if (kind === 'front') {   // the deadbolt: a keyed cylinder outside, a thumb turn inside
        const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.016, 14), M.brass); bolt.rotation.x = Math.PI / 2; bolt.position.set(w - 0.065, 1.13, side * (T / 2 + 0.008)); g.add(bolt);
        if (side === openSide) { const turn = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.034, 0.012), M.brass); turn.position.set(w - 0.065, 1.13, side * (T / 2 + 0.022)); g.add(turn); }
      }
    }
    if (kind === 'front') { const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, T + 0.012, 10), M.black); eye.rotation.x = Math.PI / 2; eye.position.set(w / 2, 1.52, 0); g.add(eye); }
    g.userData.leaf = leaf;
    return { g, fr };
  }
  // The doors open and close (E), and the thing opens them too: the hall doors, the back door, the cellar door at the foot of the
  // outside stairs, the garage's side door, the front door, and Mom and Dad's barn door, which slides. closed/open = the leaf's
  // direction from its hinge, or for a sliding door the way it travels. col: the strip on the wall line it blocks when shut. y0: the
  // floor the door stands on.
  const doors = {};
  const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
  function mkDoor(name, hx, hz, closed, open, col, mid, startOpen, y0 = 0, opt = {}) {
    const yr = y0 < -1 ? { minY: y0 - 0.1, maxY: y0 + 2.3 } : {};
    const c = solid(col[0], col[1], col[2], col[3], { door: name, on: !startOpen, ...yr });
    const d = { name, a: startOpen ? 1 : 0, target: startOpen ? 1 : 0, col: c, mid: new THREE.Vector3(mid[0], y0 + 1.0, mid[1]), hx, hz };
    if (opt.slide) {   // a sliding leaf: it moves `travel` along `open` from where it hangs when shut
      const g = opt.slide; g.position.set(hx, y0, hz); house.add(g); d.g = g;
      d.apply = () => { g.position.x = d.hx + open[0] * opt.travel * d.a; g.position.z = d.hz + open[1] * opt.travel * d.a; c.on = d.a < 0.35; };
      fixups.push(() => { d.hx = SX(hx); d.hz = SZ(hz); });
    } else {
      const rotC = Math.atan2(-closed[1], closed[0]), rotO = Math.atan2(-open[1], open[0]), alongX = closed[1] === 0, w = opt.w ?? 0.81;
      // the wall is thicker after the stretch across it (its two faces map separately, since a wall line is where the factor changes),
      // and the opening keeps its true width about its moved centre, so the frame is hung there in finished coordinates: the hinge
      // pin a leaf's half-width from the opening's centre, on the warped wall's centre line
      const depth = alongX ? SZ(hz + WT / 2) - SZ(hz - WT / 2) : SX(hx + WT / 2) - SX(hx - WT / 2);
      const { g, fr } = door(hx, hz, closed[0], closed[1], { y0, depth, openSide: angDiff(rotC, rotO) > 0 ? -1 : 1, ...opt });
      g.userData.noWarp = fr.userData.noWarp = true;
      fixups.push(() => {
        if (alongX) { d.hx = SX(hx + w / 2 * closed[0]) - w / 2 * closed[0]; d.hz = (SZ(hz - WT / 2) + SZ(hz + WT / 2)) / 2; }
        else { d.hz = SZ(hz + w / 2 * closed[1]) - w / 2 * closed[1]; d.hx = (SX(hx - WT / 2) + SX(hx + WT / 2)) / 2; }
        g.position.set(d.hx, y0, d.hz); fr.position.set(d.hx, y0, d.hz);
      });
      Object.assign(d, { g, fr, rotC, rotO });
      d.apply = () => { g.rotation.y = rotC + angDiff(rotC, rotO) * d.a; c.on = d.a < 0.35; };
    }
    fixups.push(() => { d.mid.x = SX(d.mid.x); d.mid.z = SZ(d.mid.z); });
    d.apply(); doors[name] = d; return d;
  }
  // the hall doors swing into the rooms they serve (hinge at the gap's edge + the jamb); the bathroom's and yours stand open by day
  mkDoor('room2', 3.495, -1.5, [1, 0], [0, -1], [3.45, 4.35, -1.54, -1.46], [3.9, -1.5], false);
  mkDoor('spare', 7.095, -1.5, [1, 0], [0, -1], [7.05, 7.95, -1.54, -1.46], [7.5, -1.5], false);
  mkDoor('bath', 3.745, -0.3, [1, 0], [0, 1], [3.7, 4.6, -0.34, -0.26], [4.15, -0.3], true);
  mkDoor('kid', 6.645, -0.3, [1, 0], [0, 1], [6.6, 7.5, -0.34, -0.26], [7.05, -0.3], true);
  mkDoor('back', -2.705, 3.6, [1, 0], [0, -1], [-2.75, -1.85, 3.56, 3.64], [-2.3, 3.6], false, 0, { kind: 'back' });                 // dining room -> the stoop, swings in
  mkDoor('basement', -7.305, 3.6, [1, 0], [0, -1], [-7.35, -6.45, 3.56, 3.64], [-6.9, 3.6], false, BASEMENT);                      // foot of the outside stairs -> the laundry
  mkDoor('garage', -8.71, -7.06, [1, 0], [0, -1], [-8.75, -7.85, -7.1, -7.02], [-8.3, -7.06], false);                              // the garage's side door, facing the house
  // the front door: hinged on your right as you come in, swings into the living room; open in the day, shut at night (frontDoor.setOpen)
  const front = mkDoor('front', 1.47, -4.5, [1, 0], [0, 1], [1.35, 2.45, -4.6, -4.4], [1.9, -4.5], true, 0, { kind: 'front', w: 0.86 });
  const frontDoor = { setOpen(o) { front.target = front.a = o ? 1 : 0; front.apply(); } };
  // Mom and Dad's door, off the dining room: a whitewashed Z-brace barn leaf hung on a black rail, slid open along the dining-room
  // wall. It is the door that is locked at night (main.js). The rail and its stops stay with the wall; the leaf, its hangers and the
  // handles travel.
  {
    const x = -3.3 + WT / 2 + 0.045, c = 0.45, BW = 1.24, BH = 2.1;
    const rail = new THREE.Group(); rail.position.set(x, 0, c); house.add(rail);
    lbox(rail, -0.015, 0.035, 2.14, 2.19, -0.75, 1.95, M.black); for (const z of [-0.75, 1.95]) lbox(rail, -0.02, 0.04, 2.08, 2.26, z - 0.02, z + 0.02, M.black);
    for (const z of [-0.5, 0.1, 0.7, 1.3, 1.9]) lbox(rail, -0.03, 0.035, 2.11, 2.21, z - 0.015, z + 0.015, M.black);   // the rail's brackets
    const leaf = new THREE.Group();
    lbox(leaf, 0, 0.04, 0.03, BH, -BW / 2, BW / 2, M.barnDoor);
    for (const z of [-BW / 2 + 0.03, BW / 2 - 0.06]) lbox(leaf, 0.04, 0.065, 0.06, BH - 0.03, z, z + 0.03, M.barnDoor);                 // the Z: two uprights
    for (const y of [0.08, BH / 2 - 0.05, BH - 0.14]) lbox(leaf, 0.04, 0.065, y, y + 0.09, -BW / 2 + 0.03, BW / 2 - 0.03, M.barnDoor);   // three rails
    const br = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.09, Math.hypot(BW - 0.2, BH / 2 - 0.3)), M.barnDoor); br.position.set(0.052, BH * 0.72, 0); br.rotation.x = -Math.atan2(BH / 2 - 0.3, BW - 0.2); leaf.add(br);
    for (const z of [-BW / 2 + 0.12, BW / 2 - 0.12]) { lbox(leaf, -0.01, 0.045, BH - 0.02, BH + 0.14, z - 0.025, z + 0.025, M.black); const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 16), M.black); wheel.rotation.y = Math.PI / 2; wheel.position.set(0.0, BH + 0.165, z); leaf.add(wheel); }   // hangers and wheels on the rail
    lbox(leaf, 0.065, 0.095, 0.9, 1.3, -BW / 2 + 0.14, -BW / 2 + 0.17, M.black);                                                      // the handle on the dining side
    lbox(leaf, -0.012, 0.0, 0.92, 1.26, -BW / 2 + 0.13, -BW / 2 + 0.19, M.black);                                                     // a flush pull on the bedroom side
    leaf.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    mkDoor('parents', x, c, [0, 0], [0, 1], [-3.34, -3.26, c - 0.55, c + 0.55], [-3.3, c], false, 0, { slide: leaf, travel: 1.3 });
  }
  let doorHook = null, fxTick = () => {};
  const setDoor = (name, open, silent = false) => { const d = doors[name]; if (!d || d.target === (open ? 1 : 0)) return; d.target = open ? 1 : 0; if (doorHook && !silent) doorHook(name, open); };
  const stepDoors = (dt) => { for (const k in doors) { const d = doors[k]; if (d.a === d.target) continue; d.a += Math.sign(d.target - d.a) * Math.min(Math.abs(d.target - d.a), dt * (d.name === 'parents' ? 1.0 : 1.5)); d.apply(); } };
  // per frame: the doors swing, the bear falls, the laundry's bulb and drip run
  const tick = (dt) => { if (teddy && teddy.step) teddy.step(dt); stepDoors(dt); fxTick(dt); };

  // small decor builders: figurines, wall plates, shelves, a wreath
  const rnd = TX.rng(2002);
  const knickMats = [0xd9b8c4, 0x9fc0b4, 0xe8d8a0, 0xb7a0d0, 0xf0f0ea, 0xc47a6a, 0x7aa4c4].map((c) => std({ color: c, roughness: 0.3 }));
  function knick(x, y, z, n, spread, along = 'x') {
    for (let i = 0; i < n; i++) {
      const mat = knickMats[(rnd() * knickMats.length) | 0], k = rnd(), hh = 0.07 + rnd() * 0.08;
      const geo = k < 0.35 ? new THREE.SphereGeometry(0.04, 10, 8) : k < 0.7 ? new THREE.CylinderGeometry(0.022, 0.034, hh, 10) : new THREE.ConeGeometry(0.04, hh + 0.04, 10);
      const m = new THREE.Mesh(geo, mat), o = (n > 1 ? i / (n - 1) - 0.5 : 0) * spread, h = k < 0.35 ? 0.08 : k < 0.7 ? hh : hh + 0.04;
      m.position.set(x + (along === 'x' ? o : 0), y + h / 2, z + (along === 'z' ? o : 0)); m.castShadow = true; house.add(m);
    }
  }
  function shelf(x0, x1, y, z0, z1) { return rbox(x0, x1, y, y + 0.025, z0, z1, M.oak, 0.008); }
  function plate(x, y, z, ry, r, color) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; house.add(g);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.012, 28), std({ color: 0xece6d6, roughness: 0.2 })); rim.rotation.x = Math.PI / 2; g.add(rim);
    const mid = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.72, r * 0.72, 0.014, 28), std({ color, roughness: 0.25 })); mid.rotation.x = Math.PI / 2; g.add(mid);
  }
  function wreath(x, y, z, ry) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; house.add(g);
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.045, 8, 28), std({ color: 0x7a6a4a, roughness: 1 })); g.add(t);
    for (let i = 0; i < 7; i++) { const a = i / 7 * 6.28, f = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), knickMats[i % knickMats.length]); f.position.set(Math.cos(a) * 0.19, Math.sin(a) * 0.19, 0.03); g.add(f); }
    const bow = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.03), std({ color: 0x9a3b4a, roughness: 0.6 })); bow.position.set(0, -0.19, 0.04); g.add(bow);
  }
  function heater(x0, x1, y, z0, z1) { rbox(x0, x1, y, y + 0.17, z0, z1, M.heater, 0.012, { cast: false }); box(x0, x1, y + 0.1, y + 0.12, z0 - 0.002, z1 + 0.002, M.black, { uv: false, cast: false }); }
  // a framed picture: tex is a canvas texture, or the name of a photograph in assets/photos (a painting stands in until it loads)
  const photoLoader = new THREE.TextureLoader();
  function picture(w, h, tex) {
    const isPhoto = typeof tex === 'string', mat = std({ map: isPhoto ? T.painting : tex, roughness: 0.6 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    if (isPhoto) photoLoader.load(`assets/photos/${tex}.webp`, (t) => {
      t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; mat.map = t; mat.needsUpdate = true;
      const a = t.image.width / t.image.height; mesh.scale.set(Math.min(1, a * h / w), Math.min(1, w / (a * h)), 1);   // keep the photo's proportions inside the frame
    }, undefined, () => { /* no file: the painting stays */ });
    return mesh;
  }
  function frameZ(zc, y, x, w, h, tex, face) {   // picture on a wall that runs along z (face +1 looks toward +x)
    const xf = x + face * (WT / 2);
    box(Math.min(xf, xf + face * 0.03), Math.max(xf, xf + face * 0.03), y - h / 2 - 0.05, y + h / 2 + 0.05, zc - w / 2 - 0.05, zc + w / 2 + 0.05, M.darkWood, { uv: false });
    const p = picture(w, h, tex);
    p.position.set(xf + face * 0.032, y, zc); p.rotation.y = face > 0 ? Math.PI / 2 : -Math.PI / 2; house.add(p);
  }
  function frameX(xc, y, z, w, h, tex, face) {   // ...along x
    const zf = z + face * (WT / 2);
    box(xc - w / 2 - 0.05, xc + w / 2 + 0.05, y - h / 2 - 0.05, y + h / 2 + 0.05, Math.min(zf, zf + face * 0.03), Math.max(zf, zf + face * 0.03), M.darkWood, { uv: false });
    const p = picture(w, h, tex);
    p.position.set(xc, y, zf + face * 0.032); if (face < 0) p.rotation.y = Math.PI; house.add(p);
  }

  // ---------- your room (back-left corner): the bunk, the white built-in closet, a box TV ----------
  // The bunk is built in its own local frame and turned into place: its long side is flush with the end wall (the window wall), the head toward the hall, the ladder at the foot.
  const BUNK = { x0: -5.65, x1: -3.55, z0: 3.95, z1: 4.9 };
  let cBunk = null;
  tagStart('bunk');
  {
    const bunkG = new THREE.Group(); bunkG.position.set(10.68, 0, -1.38); house.add(bunkG); defParent = bunkG;   // along the back wall, head against the bathroom wall: world x = local x + 10.68, world z = local z - 1.38
    const { x0, x1, z0, z1 } = BUNK, zc = (z0 + z1) / 2;
    for (const px of [x0 + 0.035, x1 - 0.035]) for (const pz of [z0 + 0.035, z1 - 0.035]) box(px - 0.035, px + 0.035, 0, 2.0, pz - 0.035, pz + 0.035, M.furn, { uv: false });
    for (const y of [0.25, 1.42]) {
      box(x0, x1, y, y + 0.13, z0, z0 + 0.04, M.furn, { uv: false });
      box(x0, x1, y, y + 0.13, z1 - 0.04, z1, M.furn, { uv: false });
      box(x0 + 0.04, x1 - 0.04, y + 0.08, y + 0.11, z0 + 0.04, z1 - 0.04, M.darkWood, { uv: false });
    }
    box(x0, x0 + 0.04, 0.25, 0.95, z0, z1, M.furn, { uv: false });
    box(x1 - 0.04, x1, 0.25, 0.75, z0, z1, M.furn, { uv: false });
    box(x0, x0 + 0.04, 1.42, 2.0, z0, z1, M.furn, { uv: false });
    box(x1 - 0.04, x1, 1.42, 1.95, z0, z1, M.furn, { uv: false });
    box(x0 + 0.05, x1 - 0.05, 0.36, 0.55, z0 + 0.05, z1 - 0.05, M.mattress, { uv: false });
    box(x0 + 0.05, x1 - 0.05, 1.53, 1.72, z0 + 0.05, z1 - 0.05, M.mattress, { uv: false });
    box(x0 + 0.06, x1 - 0.25, 1.72, 1.79, z0 + 0.04, z1 - 0.04, M.plaid, { uv: false });
    box(x0 + 0.08, x0 + 0.5, 1.72, 1.86, z0 + 0.15, z1 - 0.15, M.pillow, { uv: false });
    // guard rails: wall side full, room side only at the head
    box(x0, x1, 1.82, 1.9, z1 - 0.04, z1, M.furn, { uv: false });
    box(x0, x0 + 0.65, 1.82, 1.9, z0, z0 + 0.04, M.furn, { uv: false });
    // ladder at the foot
    for (const zz of [zc - 0.245, zc + 0.245]) box(x1 + 0.01, x1 + 0.06, 0, 1.92, zz - 0.025, zz + 0.025, M.furn, { uv: false });
    for (let y = 0.3; y < 1.8; y += 0.3) box(x1 + 0.015, x1 + 0.055, y, y + 0.04, zc - 0.245, zc + 0.245, M.furn, { uv: false });
    defParent = null;
    cBunk = solid(5.0, 7.22, 2.55, 3.55);
  }
  tagEnd();
  // the white built-in closet and drawers on the hall wall beside the door: louvered bifold doors, drawers, a cubby above
  {
    const wh = M.cabW, x0 = 5.15, x1 = 6.55, z0 = -0.22, z1 = 0.42, zf = z1 + 0.025;
    rbox(x0, x1, 0, 2.4, z0, z1, wh, 0.01);
    box(x0, x1, 2.38, 2.43, z0, z1 + 0.03, M.white, { uv: false });
    for (let i = 0; i < 2; i++) {   // two bifold leaves with louvres
      const a = 5.75 + i * 0.4; rbox(a + 0.01, a + 0.39, 0.05, 2.15, z1, zf, wh, 0.004);
      for (let y = 0.2; y < 2.05; y += 0.065) box(a + 0.05, a + 0.35, y, y + 0.012, zf, zf + 0.005, M.cabLine, { uv: false, cast: false });
      const kn = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), M.brass); kn.position.set(a + (i % 2 ? 0.05 : 0.35), 1.05, zf + 0.015); house.add(kn);
    }
    for (let i = 0; i < 4; i++) {   // drawers, a cubby over them
      const y = 0.08 + i * 0.3; rbox(x0 + 0.04, 5.71, y, y + 0.27, z1, zf, wh, 0.006);
      const kn = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), M.brass); kn.position.set((x0 + 5.71) / 2, y + 0.135, zf + 0.02); house.add(kn);
    }
    rbox(x0 + 0.04, 5.71, 1.35, 2.15, z1, z1 + 0.02, M.cabLine, 0.006);
    solid(x0 - 0.05, x1 + 0.05, z0 - 0.1, z1 + 0.05);
  }
  let teddy = null, parentsBed = null, bedSleepers = null, hallFrame = null; const chairs = [];
  {
    // your bear sits on the bottom bunk. the group's origin is under its seat, so it can be set down anywhere (setDown) and tipped over;
    // a ball-and-sphere bear stands in until the model loads. teddy.rest is where it belongs.
    const bear = new THREE.Group(); const fur = std({ color: 0x7a5232, roughness: 1 });
    const s = (r, x, y, z) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), fur); m.position.set(x, y, z); m.castShadow = true; bear.add(m); };
    s(0.11, 0, 0.11, 0); s(0.08, 0, 0.27, 0.01); s(0.03, -0.06, 0.34, 0); s(0.03, 0.06, 0.34, 0); s(0.035, -0.1, 0.06, 0.06); s(0.035, 0.1, 0.06, 0.06);
    const eye = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.2 });
    for (const x of [-0.025, 0.025]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), eye); e.position.set(x, 0.29, 0.08); bear.add(e); }
    const rest = { pos: new THREE.Vector3(6.9, 0.575, 3.0), rot: 2.7 };
    teddy = place(house, 'teddy', { x: rest.pos.x, y: rest.pos.y, z: rest.pos.z, rot: rest.rot, s: 0.02, hide: [bear] });
    teddy.add(bear); teddy.rest = rest; teddy.size = { w: 0.31, h: 0.385, d: 0.245 };
    teddy.userData.noWarp = true; fixups.push(() => { relTo(6.08, 2.89)(rest.pos); teddy.position.copy(rest.pos); });   // on the bunk, which keeps its size
    teddy.reset = () => { teddy.sim = null; teddy.position.copy(rest.pos); teddy.rotation.set(0, rest.rot, 0); teddy.scale.setScalar(1); teddy.visible = true; };
    // knocked or dropped: gravity, a tumble that dies away, two soft bounces, then it lies where it landed. floor is the surface it falls to
    teddy.fling = (from, vel, floor = 0.02, spin = 5) => {
      teddy.visible = true; teddy.position.copy(from); teddy.rotation.set(0, teddy.rotation.y, 0);
      teddy.sim = { v: new THREE.Vector3(vel.x, vel.y, vel.z), w: new THREE.Vector3((Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin * 0.4, (Math.random() - 0.5) * spin), floor, hits: 0, t: 0 };
    };
    // set down on a surface: upright with a small settle
    teddy.setDown = (x, y, z, { facing = rest.rot, settle = true } = {}) => { teddy.sim = null; teddy.position.set(x, y, z); teddy.rotation.set(0, facing, 0); teddy.visible = true; teddy.settleT = settle ? 0.35 : 0; };
    teddy.step = (dt) => {
      if (teddy.settleT > 0) { teddy.settleT = Math.max(0, teddy.settleT - dt); const k = teddy.settleT / 0.35; teddy.scale.set(1 + 0.05 * k, 1 - 0.06 * k, 1 + 0.05 * k); if (!teddy.settleT) teddy.scale.setScalar(1); }
      const m = teddy.sim; if (!m) return;
      m.t += dt; m.v.y -= 9.8 * dt;
      teddy.position.addScaledVector(m.v, dt); teddy.rotation.x += m.w.x * dt; teddy.rotation.y += m.w.y * dt; teddy.rotation.z += m.w.z * dt;
      if (m.done) return;
      const lie = teddy.size.d / 2;
      if (teddy.position.y <= m.floor + (m.hits ? lie : 0.1) && m.v.y < 0) {
        teddy.position.y = m.floor + (m.hits ? lie : 0.1);
        m.hits++; m.v.y *= -0.32; m.v.x *= 0.55; m.v.z *= 0.55; m.w.multiplyScalar(0.45);
        if (m.hits >= 3 || Math.abs(m.v.y) < 0.5) {   // it comes to rest on its back or side, leaning the way it fell
          m.done = true; teddy.sim = null;
          teddy.rotation.set(-1.1 - Math.random() * 0.35, teddy.rotation.y, (Math.random() - 0.5) * 0.9);
          teddy.position.y = m.floor + lie;
        }
      }
    };
  }
  {
    // box TV on an oak stand against the bathroom wall, a braided rug, a heater
    rbox(5.1, 5.6, 0, 0.55, 0.5, 1.4, M.oak, 0.015);
    tagStart('kidtv');
    rbox(5.1, 5.55, 0.55, 1.2, 0.55, 1.35, M.crt, 0.03);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.52), M.crtScreen); scr.rotation.y = Math.PI / 2; scr.position.set(5.605, 0.9, 0.95); house.add(scr); tagged.kidtv.push(scr);
    tagEnd();
    solid(5.05, 5.65, 0.45, 1.45);
    const rugM = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.012, 48), M.rug); rugM.scale.set(1.2, 1, 1); rugM.position.set(6.2, 0.006, 1.5); rugM.receiveShadow = true; house.add(rugM);
    heater(5.08, 5.16, 0.1, 1.55, 2.4);
    frameZ(0.95, 1.55, 5.0, 0.44, 0.34, 'reflection', 1);
  }

  // ---------- hallway (narrow, along the bedroom end; a gallery of family photos) ----------
  {
    // photographs (assets/photos: public-domain family pictures and Pacific Northwest landscapes)
    {   // this one is a loose group (it is not merged into the walls) so it can tilt and fall
      const g = new THREE.Group(); const xc = 4.75, y = 1.55, w = 0.44, h = 0.34, zf = -1.5 + WT / 2;
      g.position.set(xc, y + h / 2 + 0.05, zf + 0.03);   // pivots at its top edge
      g.rotation.order = 'YXZ';   // tip it over first, then turn it about the floor's vertical, so a turned frame still lies flat
      const fr = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, h + 0.1, 0.03), M.darkWood); fr.position.set(0, -h / 2 - 0.05, -0.0); g.add(fr);
      const p = picture(w, h, 'family2'); p.position.set(0, -h / 2 - 0.05, 0.017); g.add(p); house.add(g);
      hallFrame = { g, y0: g.position.y, tilt(r) { g.rotation.z = r; }, fallen: false,
        // k: 0 hanging on the wall, 1 flat on the floor, picture up, turned a little. It speeds up as it goes (gravity); the pivot
        // ends at half the frame's thickness, so the frame rests on the carpet
        pose(k) { const e = k * k; g.position.set(SX(xc) + 0.25 * e, hallFrame.y0 + (0.016 - hallFrame.y0) * e, SZ(zf + 0.03) + 0.32 * e); g.rotation.set(-Math.PI / 2 * e, 0.4 * e, 0); },
        fall() { hallFrame.fallen = true; hallFrame.pose(1); },
        reset() { hallFrame.fallen = false; g.position.set(SX(xc), hallFrame.y0, SZ(zf + 0.03)); g.rotation.set(0, 0, 0); } };
    }
    frameX(5.4, 1.5, -1.5, 0.34, 0.26, 'rainier', 1); frameX(6.0, 1.55, -1.5, 0.3, 0.24, 'sunset', 1); frameX(6.6, 1.5, -1.5, 0.26, 0.22, 'family1', 1);
    frameX(4.95, 1.55, -0.3, 0.3, 0.24, 'family1', -1); frameX(6.25, 1.5, -0.3, 0.3, 0.24, 'moraine', -1); frameX(7.85, 1.55, -0.3, 0.2, 0.26, 'family2', -1);
    wreath(8.01, 1.55, -0.9, -Math.PI / 2);
    shelf(7.6, 8.0, 1.95, -1.3, -0.5); knick(7.8, 1.975, -0.9, 4, 0.7, 'z');
  }
  // crayon drawing taped to the hall wall at kid height
  const drawingMat = new THREE.MeshStandardMaterial({ map: T.drawing0, roughness: 0.9 });
  const drawingMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.345), drawingMat);
  drawingMesh.position.set(5.6, 1.08, -0.3 - WT / 2 - 0.004); drawingMesh.rotation.set(0, Math.PI, 0.04); house.add(drawingMesh);
  const tape = std({ color: 0xe8e0b8, roughness: 0.6, transparent: true, opacity: 0.8 });
  for (const [dx, dy] of [[-0.2, 0.16], [0.2, 0.16]]) { const t = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.03), tape); t.position.set(5.6 - dx, 1.08 + dy, -0.3 - WT / 2 - 0.006); t.rotation.y = Math.PI; house.add(t); }

  // ---------- bathroom (long and narrow: 60 in tub with a floral curtain at the far end, toilet, pedestal sink; pink tile wainscot, drywall above) ----------
  const bathSink = new THREE.Vector3(4.5, 0.95, 0.9); fixups.push(() => { bathSink.x = SX(bathSink.x); bathSink.z = SZ(bathSink.z); });
  {
    const porc = new THREE.MeshPhysicalMaterial({ color: 0xe9e7df, roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.06 });
    const chrome = std({ color: 0xdfe2e4, roughness: 0.12, metalness: 1 });
    const cyl = (r, h, mat, x, y, z, rx = 0, rz = 0, parent = house) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 16), mat); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); m.castShadow = true; parent.add(m); return m; };
    {
      const rr = (w, d, r) => { const sh = new THREE.Shape(); sh.moveTo(-w / 2 + r, -d / 2); sh.lineTo(w / 2 - r, -d / 2); sh.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r); sh.lineTo(w / 2, d / 2 - r); sh.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2); sh.lineTo(-w / 2 + r, d / 2); sh.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r); sh.lineTo(-w / 2, -d / 2 + r); sh.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2); return sh; };
      const shape = rr(1.52, 0.76, 0.12), hole = rr(1.26, 0.5, 0.17); shape.holes.push(hole);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 3, curveSegments: 8 });
      geo.rotateX(-Math.PI / 2); const tub = new THREE.Mesh(geo, porc); tub.position.set(4.16, 0.06, 3.13); tub.castShadow = tub.receiveShadow = true; house.add(tub);
      rbox(3.46, 4.86, 0.16, 0.22, 2.88, 3.38, porc, 0.02);
      cyl(0.018, 0.17, chrome, 3.6, 0.82, 3.42, Math.PI / 2); cyl(0.03, 0.03, chrome, 3.45, 0.8, 3.47, Math.PI / 2); cyl(0.03, 0.03, chrome, 3.75, 0.8, 3.47, Math.PI / 2);
      box(3.4, 4.92, 0.5, 1.4, 3.48, 3.52, M.tile, { uv: true });
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.55, 8), chrome); rod.rotation.z = Math.PI / 2; rod.position.set(4.16, 1.85, 2.7); house.add(rod);
      const cur = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.4, 14, 1), M.showerCurtain);
      const pos = cur.geometry.attributes.position; for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 18) * 0.03); cur.geometry.computeVertexNormals();
      cur.position.set(4.16, 1.12, 2.7); cur.castShadow = true; house.add(cur);
    }
    solid(3.38, 4.95, 2.7, 3.55);
    {   // toilet against the west wall: a lathed oval bowl, a seat and lid, a tank with a lid and a flush lever, and the cover caps at the base
      const t = new THREE.Group(); t.position.set(3.83, 0, 1.9); t.rotation.y = Math.PI; house.add(t); tagged.toilet = [t];
      const porcD = porc.clone(); porcD.side = THREE.DoubleSide;
      const seatM = std({ color: 0xf0eee6, roughness: 0.3 });
      const V2 = (a) => a.map(([r, y]) => new THREE.Vector2(r, y));
      const lathe = (pts, mat, x, y, sx = 1.45) => { const m = new THREE.Mesh(new THREE.LatheGeometry(V2(pts), 40), mat); m.scale.set(sx, 1, 1); m.position.set(x, y, 0); m.castShadow = m.receiveShadow = true; t.add(m); return m; };
      lathe([[0.001, 0], [0.095, 0], [0.11, 0.035], [0.105, 0.12], [0.125, 0.24], [0.165, 0.33], [0.2, 0.385], [0.212, 0.41], [0.205, 0.425], [0.19, 0.425]], porcD, -0.12, 0);      // outer bowl and rim
      lathe([[0.19, 0.425], [0.175, 0.405], [0.15, 0.34], [0.11, 0.29], [0.06, 0.265], [0.001, 0.26]], porcD, -0.12, 0);                                                   // inside of the bowl
      const water = new THREE.Mesh(new THREE.CircleGeometry(0.105, 24), new THREE.MeshStandardMaterial({ color: 0x9fc3cb, roughness: 0.05, transparent: true, opacity: 0.8 })); water.rotation.x = -Math.PI / 2; water.scale.set(1.35, 1, 1); water.position.set(-0.12, 0.3, 0); t.add(water);
      const seat = new THREE.Mesh(new THREE.TorusGeometry(0.168, 0.024, 10, 40), seatM); seat.rotation.x = Math.PI / 2; seat.scale.set(1.45, 1.12, 1); seat.position.set(-0.12, 0.438, 0); seat.castShadow = true; t.add(seat);
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.185, 0.016, 40), seatM); lid.scale.set(1.42, 1, 1.06); lid.position.set(-0.12, 0.468, 0); lid.castShadow = true; t.add(lid);
      for (const z of [-0.09, 0.09]) cyl(0.012, 0.03, chrome, 0.07, 0.462, z, Math.PI / 2, 0, t);                                       // seat hinges
      rbox(0.1, 0.4, 0.42, 0.82, -0.205, 0.205, porc, 0.035, { parent: t });                                                              // tank
      rbox(0.09, 0.4, 0.82, 0.842, -0.215, 0.215, porc, 0.01, { parent: t });                                                            // tank lid
      rbox(0.04, 0.16, 0.3, 0.43, -0.07, 0.07, porc, 0.02, { parent: t });                                                                // the neck between bowl and tank
      cyl(0.016, 0.014, chrome, 0.093, 0.77, -0.13, 0, Math.PI / 2, t); cyl(0.008, 0.085, chrome, 0.075, 0.77, -0.17, Math.PI / 2, 0, t);   // flush lever
      for (const z of [-0.085, 0.085]) { const cap = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), porc); cap.position.set(-0.12, 0.0, z * 1.55); t.add(cap); }   // floor bolt caps
    }
    solid(3.38, 4.0, 1.5, 2.3);
    {   // pedestal sink on the east wall: a rimmed oval basin on a tapering pedestal, a backsplash, a faucet with two cross handles, and a medicine cabinet mirror
      const sk = new THREE.Group(); sk.position.set(4.695, 0, 0.9); sk.rotation.y = Math.PI / 2; house.add(sk);   // local +z points at the wall
      const porcD = porc.clone(); porcD.side = THREE.DoubleSide;
      const rr = (w, d, r) => { const sh = new THREE.Shape(); sh.moveTo(-w / 2 + r, -d / 2); sh.lineTo(w / 2 - r, -d / 2); sh.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r); sh.lineTo(w / 2, d / 2 - r); sh.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2); sh.lineTo(-w / 2 + r, d / 2); sh.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r); sh.lineTo(-w / 2, -d / 2 + r); sh.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2); return sh; };
      const rim = rr(0.6, 0.46, 0.15); rim.holes.push(rr(0.46, 0.33, 0.12));
      const rg = new THREE.ExtrudeGeometry(rim, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 3, curveSegments: 10 });
      rg.rotateX(-Math.PI / 2); const rimM = new THREE.Mesh(rg, porc); rimM.position.set(0, 0.84, -0.04); rimM.castShadow = rimM.receiveShadow = true; sk.add(rimM);
      const bowl = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), porcD); bowl.scale.set(0.235, 0.13, 0.17); bowl.position.set(0, 0.885, -0.04); bowl.castShadow = bowl.receiveShadow = true; sk.add(bowl);
      rbox(-0.26, 0.26, 0.76, 0.86, -0.25, 0.17, porc, 0.07, { parent: sk });                                                 // the underside of the basin
      rbox(-0.3, 0.3, 0.88, 0.97, 0.17, 0.2, porc, 0.02, { parent: sk });                                                     // backsplash
      const ped = new THREE.Mesh(new THREE.LatheGeometry([[0.13, 0], [0.12, 0.02], [0.075, 0.12], [0.055, 0.4], [0.06, 0.6], [0.1, 0.78]].map(([r, y]) => new THREE.Vector2(r, y)), 28), porcD); ped.position.set(0, 0, -0.04); ped.scale.set(1.15, 1, 1); ped.castShadow = true; sk.add(ped);
      cyl(0.026, 0.01, chrome, 0, 0.855, -0.04, 0, 0, sk);                                                                     // drain
      cyl(0.02, 0.05, chrome, 0, 0.99, 0.13, 0, 0, sk); cyl(0.012, 0.13, chrome, 0, 1.03, 0.08, Math.PI / 2, 0, sk);           // faucet body and spout
      for (const sx of [-1, 1]) { cyl(0.014, 0.05, chrome, sx * 0.13, 0.99, 0.13, 0, 0, sk); cyl(0.008, 0.06, chrome, sx * 0.13, 1.03, 0.13, 0, Math.PI / 2, sk); cyl(0.008, 0.06, chrome, sx * 0.13, 1.03, 0.13, Math.PI / 2, 0, sk); }   // cross handles
      rbox(-0.44, 0.44, 1.2, 2.0, 0.16, 0.19, M.oak, 0.01, { parent: sk });
      box(-0.4, 0.4, 1.25, 1.95, 0.152, 0.162, M.mirror, { uv: false, parent: sk });
    }
    solid(4.55, 4.95, 0.45, 1.35);
    const mat = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.02, 0.5), std({ color: 0x8e4a5c, roughness: 1 })); mat.position.set(4.1, 0.01, 1.1); mat.receiveShadow = true; house.add(mat);
    // old-school pink tile: a wainscot around the room with a darker cap, and the tub wall tiled to the ceiling line
    const cap = std({ color: 0xb4707e, roughness: 0.3 });
    const wains = (x0, x1, z0, z1, y0 = 0.11) => { const tx = x1 - x0 < 0.1 ? 0.012 : 0, tz = z1 - z0 < 0.1 ? 0.012 : 0; box(x0, x1, y0, 1.2, z0, z1, M.pinkTile, { uv: true }); box(x0 - tx, x1 + tx, 1.2, 1.24, z0 - tz, z1 + tz, cap, { uv: false }); };
    wains(3.38, 3.405, -0.2, 2.7); wains(3.38, 3.405, 2.7, 3.5, 0.5); wains(4.895, 4.92, -0.2, 2.7); wains(4.895, 4.92, 2.7, 3.5, 0.5);   // west and east walls (above the tub rim by the tub)
    wains(3.38, 3.7, -0.22, -0.2); wains(4.6, 4.92, -0.22, -0.2);       // the door wall, either side of the door
    wains(3.4, 4.9, 3.49, 3.52, 0.5);                                    // the tub end
    box(3.4, 4.92, 1.4, 1.85, 3.49, 3.52, M.pinkTile, { uv: true });
  }

  // ---------- living room: the front door, the big picture window, a floral sofa, a box TV ----------
  tagStart('couch');
  box(-3.0, -2.2, 0, 0.45, -3.3, -1.5, M.couch, { uv: false });
  box(-3.0, -2.75, 0.45, 0.95, -3.3, -1.5, M.couch, { uv: false });
  tagEnd();
  const cCouch = solid(-3.05, -2.15, -3.35, -1.45);
  tagStart('coffee'); box(-1.5, -0.7, 0, 0.42, -3.6, -2.4, M.oak, { uv: false }); tagEnd();
  const cCoffee = solid(-1.55, -0.65, -3.65, -2.35);
  tagStart('tv');
  box(2.7, 3.22, 0, 0.55, -3.9, -2.5, M.oak, { uv: false });
  box(2.75, 3.2, 0.55, 1.2, -3.85, -2.55, M.crt, { uv: false });
  tagEnd();
  const cTv = solid(2.65, 3.25, -3.95, -2.45);
  // curio shelves and wall plates
  plate(3.21, 1.9, -1.9, -Math.PI / 2, 0.12, 0xa84a5a); plate(3.21, 1.9, -4.0, -Math.PI / 2, 0.12, 0x4a6fa8);
  frameZ(-2.9, 1.75, 3.3, 0.5, 0.4, 'rainier', -1); frameZ(-0.7, 1.6, -3.3, 0.46, 0.36, 'family2', 1);
  heater(-1.9, 0.7, 0.1, -4.42, -4.34);

  // ---------- kitchen and dining (the back row): plain white cabinets and appliances, laminate counters ----------
  {
    // 90s white cabinets and appliances. A white side-by-side fridge, then the stove under a microwave, run along the
    // bath wall (east); the farmhouse sink sits under the window on the back wall with a black dishwasher beside it, and tall pantry cabinets at the dining end.
    const pull = (x, y0, y1, z, o) => rbox(x - 0.01, x + 0.01, y0, y1, z - 0.01, z + 0.01, M.brass, 0.004);
    const runE = (z0, z1) => {   // base cabinets against the east wall (doors face -x), counter on top
      rbox(2.6, 3.22, 0, 0.9, z0, z1, M.cabW, 0.012);
      rbox(2.56, 3.24, 0.9, 0.95, z0 - 0.02, z1 + 0.02, M.counter, 0.01);
      const n = Math.max(1, Math.round((z1 - z0) / 0.58)), w = (z1 - z0) / n;
      for (let i = 0; i < n; i++) { const a = z0 + i * w; rbox(2.578, 2.6, 0.07, 0.86, a + 0.012, a + w - 0.012, M.cabW, 0.006); rbox(2.556, 2.576, 0.62, 0.84, a + 0.05, a + 0.065, M.brass, 0.004); }
    };
    const upperE = (z0, z1) => {
      rbox(2.9, 3.22, 1.5, 2.3, z0, z1, M.cabW, 0.012);
      const n = Math.max(1, Math.round((z1 - z0) / 0.5)), w = (z1 - z0) / n;
      for (let i = 0; i < n; i++) { const a = z0 + i * w; rbox(2.878, 2.9, 1.53, 2.27, a + 0.012, a + w - 0.012, M.cabW, 0.006); rbox(2.856, 2.876, 1.55, 1.8, a + w - 0.07, a + w - 0.055, M.brass, 0.004); }
    };
    const runN = (x0, x1) => {   // base cabinets against the back wall (doors face -z)
      rbox(x0, x1, 0, 0.9, 2.9, 3.52, M.cabW, 0.012);
      rbox(x0 - 0.02, x1 + 0.02, 0.9, 0.95, 2.88, 3.52, M.counter, 0.01);
      const n = Math.max(1, Math.round((x1 - x0) / 0.58)), w = (x1 - x0) / n;
      for (let i = 0; i < n; i++) { const a = x0 + i * w; rbox(a + 0.012, a + w - 0.012, 0.07, 0.86, 2.878, 2.9, M.cabW, 0.006); rbox(a + w - 0.1, a + w - 0.085, 0.62, 0.84, 2.858, 2.878, M.brass, 0.004); }
    };
    // east wall, front to back: fridge, stove, cabinets to the corner
    tagStart('fridge');
    rbox(2.45, 3.22, 0.04, 1.78, 0.0, 0.92, M.appW, 0.03);                                   // fridge body
    rbox(2.425, 2.45, 0.08, 1.74, 0.01, 0.9, M.appW, 0.012);                                  // the doors, a little proud
    box(2.42, 2.43, 0.08, 1.74, 0.45, 0.46, M.black, { uv: false });                            // seam between the freezer and fridge doors
    rbox(2.405, 2.425, 0.55, 1.35, 0.4, 0.43, M.steelSink, 0.008); rbox(2.405, 2.425, 0.55, 1.35, 0.485, 0.515, M.steelSink, 0.008);   // the two handles
    rbox(2.415, 2.428, 1.0, 1.4, 0.1, 0.36, M.black, 0.01);                                     // water and ice dispenser
    { const note = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.3), std({ color: 0xf2f0e8, roughness: 0.9 })); note.rotation.y = -Math.PI / 2; note.position.set(2.419, 1.42, 0.66); house.add(note); tagged.fridge.push(note); }
    tagEnd(); tagStart('stove');
    rbox(2.6, 3.22, 0, 0.92, 1.0, 1.66, M.appW, 0.015); rbox(2.58, 3.22, 0.92, 0.945, 0.99, 1.67, M.black, 0.01);   // range
    for (const [bx, bz] of [[2.82, 1.17], [3.02, 1.17], [2.82, 1.49], [3.02, 1.49]]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.012, 20), std({ color: 0x151513, roughness: 0.5 })); b.position.set(bx, 0.95, bz); house.add(b); tagged.stove.push(b); }
    rbox(2.575, 2.6, 0.3, 0.75, 1.07, 1.59, M.black, 0.01); rbox(2.55, 2.575, 0.7, 0.74, 1.07, 1.59, M.steelSink, 0.005);   // oven door and its handle
    rbox(2.58, 2.6, 0.78, 0.9, 1.05, 1.61, M.black, 0.008);                                       // control panel
    tagEnd();
    rbox(2.62, 3.22, 1.45, 1.8, 0.98, 1.68, M.appW, 0.02); rbox(2.6, 2.62, 1.5, 1.75, 1.03, 1.45, M.black, 0.008);                        // microwave over the range
    runE(1.66, 2.9); upperE(1.7, 2.9);
    rbox(2.9, 3.22, 1.95, 2.3, 0.0, 0.92, M.cabW, 0.012);                                         // the cabinet over the fridge
    // back wall, east to west: the corner, base cabinets, the sink under the window, the dishwasher, base cabinets, the pantry
    runN(1.9, 3.22);
    runN(0.95, 1.9);
    rbox(0.97, 1.88, 0.945, 0.965, 2.98, 3.44, M.steelSink, 0.03); rbox(1.01, 1.84, 0.95, 0.968, 3.03, 3.39, M.black, 0.03);   // sink under the window
    rbox(0.97, 1.88, 0.8, 0.9, 2.86, 2.9, M.steelSink, 0.01);                                       // the apron front
    rbox(0.3, 0.95, 0.0, 0.9, 2.9, 3.52, M.appW, 0.012); rbox(0.32, 0.93, 0.78, 0.82, 2.86, 2.9, M.steelSink, 0.005);   // dishwasher
    runN(-0.45, 0.3);
    for (const x0 of [-1.35, -0.9]) { rbox(x0, x0 + 0.45, 0, 2.3, 2.9, 3.52, M.cabW, 0.012); rbox(x0 + 0.012, x0 + 0.438, 0.07, 2.26, 2.878, 2.9, M.cabW, 0.006); rbox(x0 + 0.36, x0 + 0.375, 0.9, 1.4, 2.858, 2.878, M.brass, 0.004); }   // tall pantry cabinets
    { const tap = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.28, 12), M.steelSink); tap.position.set(1.42, 1.1, 3.46); house.add(tap); const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.18, 12), M.steelSink); sp.rotation.x = Math.PI / 2; sp.position.set(1.42, 1.23, 3.38); house.add(sp); }
    rbox(2.3, 3.22, 1.5, 2.3, 3.2, 3.52, M.cabW, 0.012);                                            // the upper cabinets in the corner (nothing hangs in front of the window)
    solid(-1.4, 3.25, 2.85, 3.55); solid(2.4, 3.25, -0.2, 2.9);
    box(-1.35, 0.3, 0.95, 1.5, 3.5, 3.51, M.lino, { uv: true });   // backsplash
    knick(0.6, 0.95, 3.3, 2, 0.2); knick(2.6, 0.95, 3.3, 2, 0.2);
    plate(-0.5, 1.5, -0.21, 0, 0.14, 0x4a6fa8); plate(0.0, 1.5, -0.21, 0, 0.14, 0xa84a5a); plate(2.8, 1.6, -0.21, 0, 0.14, 0x4a8a6a);
  }
  tagStart('dining');
  box(-3.0, -1.8, 0.7, 0.75, 1.2, 2.4, M.oak, { uv: false });
  tagEnd();
  const cDining = solid(-2.95, -1.85, 1.25, 2.35);

  // ---------- Mom and Dad's room (the lower wing, through the barn door off the dining room) ----------
  // the bed between the two west windows with its foot to the door, a nightstand each side, the dresser on the front wall, a sliding
  // closet on the dining-room wall beside the door, a heater under the front window, and the boxes they have not got to yet
  tagStart('pdresser');
  rbox(-6.2, -5.2, 0, 0.655, -3.82, -3.42, M.oak, 0.015); for (let i = 0; i < 3; i++) rbox(-6.15 + i * 0.32, -5.87 + i * 0.32, 0.1, 0.57, -3.42, -3.405, M.oak, 0.006);
  for (let i = 0; i < 3; i++) { const kn = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), M.brass); kn.position.set(-6.01 + i * 0.32, 0.34, -3.39); house.add(kn); tagged.pdresser.push(kn); }
  tagEnd();
  knick(-5.7, 0.655, -3.62, 3, 0.4); solid(-6.25, -5.15, -3.9, -3.37);
  for (const z0 of [-0.95, 0.75]) { rbox(-8.0, -7.58, 0, 0.6, z0, z0 + 0.42, M.oak, 0.012); rbox(-7.6, -7.585, 0.12, 0.5, z0 + 0.04, z0 + 0.38, M.oak, 0.006); solid(-8.05, -7.55, z0 - 0.03, z0 + 0.45); }   // nightstands
  tagStart('plamp');
  { const lampM = new THREE.MeshStandardMaterial({ color: 0xf2e6c8, emissive: 0xffd9a0, emissiveIntensity: 0.0, roughness: 0.7 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.2, 14), M.brass); base.position.set(-7.8, 0.7, 0.96); house.add(base); tagged.plamp.push(base);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 0.2, 18, 1, true), lampM); shade.material.side = THREE.DoubleSide; shade.position.set(-7.8, 0.92, 0.96); house.add(shade); tagged.plamp.push(shade); }
  tagEnd();
  knick(-7.8, 0.6, -0.74, 2, 0.2, 'z');
  // the closet: brown sliding doors on the dining-room wall, south of the barn door
  rbox(-3.95, -3.38, 0, 2.1, -3.5, -1.6, M.oak, 0.01); box(-3.4, -3.38, 0.05, 2.05, -2.565, -2.535, M.black, { uv: false });
  rbox(-3.95, -3.38, 2.1, 2.4, -3.5, -1.6, M.white, 0.01);
  solid(-4.0, -3.3, -3.55, -1.55);
  heater(-8.0, -7.92, 0.1, -2.1, -1.1);
  { const rugM = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.012, 48), M.rug); rugM.scale.set(1.0, 1, 1.4); rugM.position.set(-5.0, 0.006, 0.1); rugM.receiveShadow = true; house.add(rugM); }

  // ---------- the two front bedrooms (doors stay closed): a closet and a bed in each ----------
  {
    // the end bedroom, the room nobody unpacked: the brown sliding closet doors are on the front wall beside the window; the rest of it
    // (boxes, the sheeted mirror, the old dresser) is below
    rbox(7.02, 7.9, 0, 2.1, -4.42, -3.85, M.oak, 0.01); box(7.445, 7.475, 0.05, 2.05, -3.87, -3.85, M.black, { uv: false });
    rbox(7.02, 7.9, 2.1, 2.4, -4.42, -3.85, M.white, 0.01);
    solid(6.97, 7.95, -4.45, -3.8);
    // the double bed, built as one piece round its own origin (the middle of the frame, on the floor) and turned by yaw: the pillow
    // end is local +z. parentsBedAt(x, z, yaw) is the only line that places it. A tall headboard, the mattress, two full pillows, the
    // floral quilt with rolled edges, and the sleepers' quilt (bedSleepers) and sleep spots (parentsBed) come with it.
    const parentsBedAt = (ox, oz, yaw) => {
      const bed = new THREE.Group(); bed.position.set(ox, 0, oz); bed.rotation.y = yaw; house.add(bed);
      const o = { parent: bed }, world = (x, z) => [ox + x * Math.cos(yaw) + z * Math.sin(yaw), oz - x * Math.sin(yaw) + z * Math.cos(yaw)];
      rbox(-0.55, 0.55, 0.12, 0.4, -1.06, 1.06, M.oak, 0.02, o); rbox(-0.52, 0.52, 0.4, 0.58, -1.03, 1.03, M.mattress, 0.05, o);
      rbox(-0.55, 0.55, 0.4, 1.15, 1.0, 1.08, M.oak, 0.02, o); rbox(-0.55, 0.55, 0.4, 0.62, -1.06, -1.02, M.oak, 0.02, o);
      pillow(-0.47, 0.01, 0.58, 0.46, 1.02, 0.05, 0.12, o); pillow(0.01, 0.49, 0.58, 0.46, 1.02, -0.04, 0.12, o);
      for (const [x0, x1] of [[-0.53, -0.51], [0.51, 0.53]]) rbox(x0, x1, 0.46, 0.66, -1.04, 0.44, M.floralB, 0.005, o);   // the quilt hangs over the sides
      rbox(-0.53, 0.53, 0.46, 0.66, -1.04, -1.02, M.floralB, 0.005, o);
      for (const [x0, x1] of [[-0.55, -0.48], [0.48, 0.55]]) rbox(x0, x1, 0.6, 0.675, -1.06, 0.44, M.floralB, 0.035, o);   // and rolls over the edges
      rbox(-0.55, 0.55, 0.6, 0.675, -1.07, -1.0, M.floralB, 0.035, o);
      // the quilt over the sleepers: a draped sheet that rises over each body (Mom and Dad's rigs lie under it, see sleepers() in main.js)
      // and breathes, with soft folds and the top sheet turned back over it at the pillow end. set(false) flattens it: the bed looks
      // slept in. one('dad', false) empties his side.
      bedSleepers = (() => {
        const cl = (v, a, b) => Math.max(a, Math.min(b, v)), sm = (t) => { t = cl(t, 0, 1); return t * t * (3 - 2 * t); };
        const g = new THREE.Group(); bed.add(g);
        const X0 = -0.53, X1 = 0.53, Z0 = -1.04, Z1 = 0.44, TOP = 0.6;   // the bed runs along z: Z1 is the pillow end, Z0 the foot
        // the shape at a point: [Mom's rise, Dad's rise, the folds]
        const shape = (x, z) => {
          // along the bed the rise peaks just past the shoulders, a hand's breadth over the chest, and tapers to the feet; at the pillow
          // end it dips so the heads show over it (Mom's chest tops out at 0.86, Dad's at 0.95, their feet at about 0.77)
          // (the last span before the foot drops toward the mattress, so the quilt hangs over the feet instead of ending in the air)
          const along = cl((Z1 - z) / (Z1 - Z0), 0, 1), h = Math.min(0.29 - along * 0.07, 0.21 + along * 0.7) * (1 - 0.3 * sm((along - 0.9) / 0.1));
          // across it, a flat-topped rise the width of a body, so a leg off the centre line is still under it; Dad is broader, and his
          // plateau stays high out to the wall edge so his far elbow is covered (Mom has the door side, Dad the wall side)
          const dm = (x - 0.23) / 0.34, dd = (x + 0.21) / 0.45, dd6 = dd * dd * dd * dd * dd * dd;
          const edge = sm((x - X0) / 0.08) * sm((X1 - x) / 0.08) * sm((z - Z0) / 0.08) * sm((Z1 - z) / 0.08);   // the folds stay off the edges
          const f = edge * (0.02 * Math.sin(x * 9 + 0.7) * Math.sin(z * 5.3 + 1.1) + 0.011 * Math.sin(x * 21 + z * 8));
          return [h * 1.10 * Math.exp(-dm * dm * dm * dm * 2), h * 1.22 * Math.exp(-dd6 * 2), f];
        };
        const sheet = (x0, x1, z0, z1, nx, nz, mat, lift) => {
          const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0, nx, nz); geo.rotateX(-Math.PI / 2); geo.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
          const pos = geo.attributes.position, uv = geo.attributes.uv, n = pos.count, bm = new Float32Array(n), bd = new Float32Array(n), fo = new Float32Array(n);
          for (let i = 0; i < n; i++) { const x = pos.getX(i), z = pos.getZ(i); uv.setXY(i, x, z); [bm[i], bd[i], fo[i]] = shape(x, z); fo[i] += lift(x, z); }
          const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; g.add(m);
          return { mesh: m, geo, pos, n, bm, bd, fo };
        };
        const quilt = sheet(X0, X1, Z0, Z1, 34, 34, M.floralB, () => 0);
        // the turned-back sheet: a band over the quilt's pillow end, thicker along its fold
        const band = sheet(X0 + 0.02, X1 - 0.02, Z1 - 0.3, Z1 - 0.01, 30, 8, M.bedLinen, (x, z) => 0.012 + 0.014 * sm((z - (Z1 - 0.3)) / 0.08) * sm((Z1 - 0.1 - z) / 0.1));
        const fx = { group: g, quilt: quilt.mesh, amount: 1, target: 1, t: 0, side: { mom: 1, dad: 1 },
          set(on) { fx.target = on ? 1 : 0; fx.side.mom = fx.side.dad = 1; },
          one(name, on) { fx.side[name] = on ? 1 : 0; },
          update(dt) {
            fx.t += dt; fx.amount += (fx.target - fx.amount) * Math.min(1, dt * 2.5);
            // breathing only ever lifts the quilt above its resting shape (the resting shape is what clears the bodies)
            const fm = fx.amount * fx.side.mom * (1 + (0.5 - 0.5 * Math.cos(fx.t * 1.05)) * 0.06), fd = fx.amount * fx.side.dad * (1 + (0.5 - 0.5 * Math.cos(fx.t * 0.86)) * 0.07), flat = 0.05 * (1 - fx.amount);
            for (const s of [quilt, band]) {
              const { pos, n, bm, bd, fo, geo } = s;
              // one quilt over two people: the higher rise, and a bridge where both are under it, so it does not dip to the mattress between them
              for (let i = 0; i < n; i++) { const a = bm[i] * fm, b = bd[i] * fd; pos.setY(i, TOP + 0.04 + fo[i] + Math.max(a, b) + 0.45 * Math.min(a, b) + flat * Math.sin(pos.getX(i) * 7) * Math.sin(pos.getZ(i) * 9)); }   // rumpled when empty
              pos.needsUpdate = true; geo.computeVertexNormals();
            }
          } };
        fx.update(0);
        return fx;
      })();
      // where the rigs lie (the origin is 1.4 m down the bed from the pillows; yaw turns them to lie along the bed, head to the headboard)
      const spot = (x, z) => { const [wx, wz] = world(x, z); return { x: wx, y: 0.74, z: wz, yaw: Math.PI + yaw }; };
      parentsBed = { mom: spot(0.23, -0.56), dad: spot(-0.21, -0.71) };   // their feet stay inside the footboard
      const c = [world(-0.6, -1.11), world(0.6, -1.11), world(-0.6, 1.16), world(0.6, 1.16)];
      solid(Math.min(...c.map((v) => v[0])), Math.max(...c.map((v) => v[0])), Math.min(...c.map((v) => v[1])), Math.max(...c.map((v) => v[1])), { fixed: true });
      fixups.push(() => { ox = bed.position.x; oz = bed.position.z; parentsBed.mom = spot(0.23, -0.56); parentsBed.dad = spot(-0.21, -0.71); });
      return bed;
    };
    parentsBedAt(-6.9, 0.1, -Math.PI / 2);   // Mom and Dad's room: the head between the west windows, the foot toward the barn door
    // the other bedroom: vertical-plank wood closet doors
    rbox(4.45, 5.5, 0, 2.1, -2.15, -1.58, M.oak, 0.01); for (let i = 1; i < 6; i++) box(4.45 + i * 0.175 - 0.006, 4.45 + i * 0.175 + 0.006, 0.05, 2.05, -2.165, -2.15, M.black, { uv: false });
    rbox(4.45, 5.5, 2.1, 2.4, -2.15, -1.58, M.white, 0.01);
    solid(4.4, 5.55, -2.2, -1.5);
    // Dad's office: the desk under the front window with the computer on it, the chair pulled out, a filing cabinet in the west corner,
    // a bookcase on the wall it shares with the parents' room. All of it is models (placed below); only the colliders are here.
    solid(3.35, 5.15, -4.45, -3.7); solid(5.3, 5.8, -3.85, -2.75);
  }

  // moving boxes around the house
  const boxTex = [TX.cardboard('KITCHEN', 3), TX.cardboard('BOOKS', 4), TX.cardboard('MISC', 5), TX.cardboard('KIDS ROOM', 6)];
  const boxMats = boxTex.map((t) => std({ map: t, roughness: 0.9 }));
  const cardboardBox = (x, y, z, w = 0.5, h = 0.44, d = 0.5, mi = 0, rot = 0, parent = house) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), boxMats[mi]); m.position.set(x, y + h / 2, z); m.rotation.y = rot; m.castShadow = m.receiveShadow = true; parent.add(m); return m;
  };
  cardboardBox(-4.4, 0, -3.2, 0.55, 0.45, 0.5, 3, 0.2); cardboardBox(-4.4, 0.45, -3.2, 0.5, 0.4, 0.45, 1, -0.15); cardboardBox(-5.1, 0, -3.3, 0.5, 0.44, 0.5, 2, 0.1); solid(-5.45, -4.05, -3.65, -2.9);   // Mom and Dad's, still packed, in the corner by the closet
  cardboardBox(-5.0, 0, 2.8, 0.6, 0.5, 0.5, 2, 0.2); cardboardBox(-4.95, 0.5, 2.8, 0.5, 0.4, 0.45, 1, -0.1); solid(-5.35, -4.65, 2.45, 3.15);   // and at the far end of their room
  // the spare room nobody unpacked: boxes under the window and along the hall wall, a rolled rug, an old dresser with its drawers out on the
  // end wall, and a tall mirror under a sheet (spare.mirror; the sheet comes off with sheet.visible = false). The models are placed below.
  let spare = null;
  {
    cardboardBox(6.1, 0, -4.15, 0.6, 0.5, 0.55, 0, 0.1); cardboardBox(6.1, 0.5, -4.15, 0.5, 0.42, 0.5, 2, -0.2); cardboardBox(6.75, 0, -4.1, 0.55, 0.45, 0.5, 3, 0.3);
    cardboardBox(6.3, 0, -2.05, 0.5, 0.44, 0.5, 1, -0.1); cardboardBox(6.25, 0.44, -2.05, 0.45, 0.4, 0.45, 2, 0.25);
    const rug = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.5, 14), M.rug); rug.rotation.z = Math.PI / 2; rug.position.set(6.75, 0.12, -1.75); rug.castShadow = rug.receiveShadow = true; house.add(rug);
    M.sheet = std({ color: 0xe9e4d8, roughness: 1 }); M.sheet.envMapIntensity = 0.15;
    const sheet = rbox(6.06, 6.72, 0.3, 1.74, -3.28, -2.72, M.sheet, 0.08);   // the mirror model stands inside it, facing the room
    const hem = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.1, 0.66), M.sheet); hem.position.set(6.39, 0.33, -3.0); hem.rotation.y = 0.15; house.add(hem);
    solid(5.85, 6.4, -4.45, -3.85); solid(6.45, 7.05, -4.45, -3.85); solid(6.0, 6.75, -3.32, -2.68); solid(6.0, 6.55, -2.3, -1.8); solid(5.95, 7.55, -1.95, -1.55);
    spare = { mirror: { sheet, hem, pos: new THREE.Vector3(6.36, 0.9, -3.0) }, bounds: [5.8, 8.1, -4.5, -1.5] };
    fixups.push(() => { const m = spare.mirror.pos; m.x = SX(m.x); m.z = SZ(m.z); spare.bounds = rect(spare.bounds); });
  }

  // ---------- out the back door: the stoop, the outside cellar stairs beside it, and the laundry under Mom and Dad's room ----------
  const B = BASEMENT;
  let laundry = null;
  {
    const bsolid = (a, b, c, d, extra = {}) => solid(a, b, c, d, { minY: B - 0.2, maxY: -0.1, ...extra });   // only stops you down there
    const deep = { minY: B - 0.2, maxY: 3 };                                                                   // stops you at every height
    // the stoop: a slab outside the back door, a bare bulb over the door
    box(-3.3, -1.3, -0.06, 0.0, 3.72, 5.0, M.concrete, { uv: true });
    { const b = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), M.lamp.clone()); b.position.set(-2.3, 2.3, 3.78); house.add(b); }
    // the stairwell: concrete steps between block walls, a curb with a pipe railing at grass level, a landing at the bottom
    const { x0, run, xEnd, z0, z1 } = PLAN_STAIR, steps = 12, tread = run / steps, rise = -B / steps;
    for (let i = 0; i < steps; i++) box(x0 - tread * (i + 1), x0 - tread * i, B - 0.1, -rise * (i + 1), z0, z1, M.concrete, { uv: true });
    box(xEnd, x0 - run, B - 0.1, B, z0, z1, M.concrete, { uv: true });
    box(xEnd - 0.25, x0, B - 0.1, 0.3, z1, z1 + 0.25, M.block, { uv: true }); solid(xEnd - 0.25, x0, z1, z1 + 0.25, deep);
    box(xEnd - 0.25, xEnd, B - 0.1, 0.3, z0, z1, M.block, { uv: true }); solid(xEnd - 0.25, xEnd, z0 - 0.1, z1 + 0.25, deep);
    // the house side of the pit is the cellar's wall, carried up to the siding, with the door at the bottom
    const dw = 0.89 / SX.scale(-6.9) / 2;   // half the cellar door's opening, drawn on the plan
    box(-8.1, -6.9 - dw, B - 0.1, 0.0, 3.51, 3.70, M.block, { uv: true }); box(-6.9 + dw, -3.3, B - 0.1, 0.0, 3.51, 3.70, M.block, { uv: true });
    box(-6.9 - dw, -6.9 + dw, B + 2.07, 0.0, 3.51, 3.70, M.block, { uv: true });
    solid(-8.1, -7.35, 3.51, 3.72, { minY: B - 0.2, maxY: 0 }); solid(-6.45, -3.3, 3.51, 3.72, { minY: B - 0.2, maxY: 0 });
    const post = (x, z) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 8), M.steel); p.position.set(x, 0.75, z); house.add(p); };
    for (const x of [x0 - 0.1, x0 - 1.1, x0 - 2.1, xEnd + 0.1]) post(x, z1 + 0.125); post(xEnd - 0.125, z0 + 0.1);
    box(xEnd - 0.145, x0, 1.17, 1.21, z1 + 0.105, z1 + 0.145, M.steel, { uv: false }); box(xEnd - 0.145, xEnd - 0.105, 1.17, 1.21, z0, z1 + 0.145, M.steel, { uv: false });

    // the laundry: block walls, a stained slab with the sump cut into its far corner, joists overhead. no window: the darkest room in the house
    for (const [a, b, c, d] of [[-8.1, -4.25, -0.4, 3.6], [-4.25, -3.3, 0.5, 3.6], [-4.25, -3.3, -0.4, -0.24], [-3.5, -3.3, -0.24, 0.5]]) box(a, b, B - 0.1, B, c, d, M.cellarFloor, { cast: false });
    box(-8.1, -3.3, -0.16, -0.1, -0.4, 3.6, M.cellarCeil, { cast: false });
    for (let x = -7.6; x < -3.4; x += 0.5) box(x - 0.025, x + 0.025, -0.36, -0.16, -0.32, 3.51, M.darkWood, { uv: false });
    box(-8.1, -3.3, B - 0.1, -0.1, -0.4, -0.24, M.block, { uv: true }); bsolid(-8.1, -3.3, -0.45, -0.24);
    box(-8.1, -7.94, B - 0.1, -0.1, -0.24, 3.51, M.block, { uv: true }); bsolid(-8.15, -7.94, -0.4, 3.6);
    box(-3.46, -3.3, B - 0.1, -0.1, -0.24, 3.51, M.block, { uv: true }); bsolid(-3.46, -3.25, -0.4, 3.6);
    // washer and dryer against the west wall, the washer nearest the door. the lid lifts and the drum turns (laundry.washer, laundry.drum)
    const washer = (() => {   // built round its own origin so the stretch moves it without stretching it
      const X0 = -0.31, X1 = 0.31, Z0 = -0.325, Z1 = 0.325, wg = new THREE.Group(); wg.position.set(-7.67, 0, 1.625); house.add(wg); const o = { parent: wg };
      rbox(X0, X1, B, B + 0.86, Z0, Z1, M.appW, 0.02, o); rbox(X0, X0 + 0.08, B + 0.86, B + 1.08, Z0 + 0.02, Z1 - 0.02, M.appW, 0.01, o);
      for (let i = 0; i < 3; i++) { const k = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.02, 10), M.black); k.rotation.z = Math.PI / 2; k.position.set(X0 + 0.09, B + 1.0, Z0 + 0.14 + i * 0.18); wg.add(k); }
      box(X0 + 0.103, X1 - 0.043, B + 0.86, B + 0.868, Z0 + 0.043, Z1 - 0.043, M.black, { uv: false, cast: false, parent: wg });   // the dark seam under the lid: on the top, a hair inside the lid's outline, stopping short of its underside
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.22, 0.6, 20, 1, true), M.steelSink); drum.material = M.steelSink.clone(); drum.material.side = THREE.DoubleSide;
      drum.position.set(0.04, B + 0.54, 0); wg.add(drum);
      const pivot = new THREE.Group(); pivot.position.set(X0 + 0.1, B + 0.87, 0); wg.add(pivot);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(X1 - X0 - 0.14, 0.02, Z1 - Z0 - 0.04), M.appW); lid.position.set((X1 - X0 - 0.14) / 2, 0.01, 0); lid.castShadow = true; pivot.add(lid);
      const pos = new THREE.Vector3(wg.position.x, B + 0.9, wg.position.z); fixups.push(() => { pos.x = SX(pos.x); pos.z = SZ(pos.z); });
      return { pivot, lid, drum, pos, open(k) { pivot.rotation.z = k * 1.55; }, spinning: false, rate: 9 };
    })();
    rbox(-7.98, -7.36, B, B + 0.9, 0.5, 1.15, M.appW, 0.02); rbox(-7.98, -7.9, B + 0.9, B + 1.06, 0.52, 1.13, M.appW, 0.01);
    { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.03, 24), M.glassOut); w.rotation.z = Math.PI / 2; w.position.set(-7.35, B + 0.5, 0.825); house.add(w); }
    bsolid(-8.05, -7.3, 0.45, 2.0);
    // a plastic laundry tub on pipe legs under a tap out of the wall (laundry.sink.set runs the water)
    const sink = (() => {
      const X0 = -6.0, X1 = -5.3, Z0 = -0.22, Z1 = 0.38, Y0 = B + 0.56, Y1 = B + 0.92;
      box(X0, X1, Y0, Y0 + 0.03, Z0, Z1, M.tub, { uv: false }); box(X0, X0 + 0.03, Y0, Y1, Z0, Z1, M.tub, { uv: false }); box(X1 - 0.03, X1, Y0, Y1, Z0, Z1, M.tub, { uv: false });
      box(X0, X1, Y0, Y1, Z0, Z0 + 0.03, M.tub, { uv: false }); box(X0, X1, Y0, Y1, Z1 - 0.03, Z1, M.tub, { uv: false });
      for (const x of [X0 + 0.04, X1 - 0.04]) for (const z of [Z0 + 0.04, Z1 - 0.04]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.56, 8), M.pipe); l.position.set(x, B + 0.28, z); house.add(l); }
      const cx = (X0 + X1) / 2, cyl = (r, h, x, y, z, rx = 0) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 10), M.pipe); m.position.set(x, y, z); m.rotation.x = rx; house.add(m); return m; };
      cyl(0.016, 0.3, cx, B + 1.12, -0.09, Math.PI / 2); cyl(0.016, 0.1, cx, B + 1.08, 0.06); for (const dx of [-0.08, 0.08]) cyl(0.02, 0.02, cx + dx, B + 1.12, -0.2, Math.PI / 2);
      const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.009, 0.44, 8), M.drip); stream.position.set(cx, B + 0.81, 0.06); stream.visible = false; house.add(stream);
      const pos = new THREE.Vector3(cx, B + 1.0, 0.06); fixups.push(() => { pos.x = SX(pos.x); pos.z = SZ(pos.z); });
      return { stream, on: false, pos, set(on) { this.on = on; stream.visible = on; } };
    })();
    bsolid(-6.05, -5.25, -0.4, 0.43);
    shelf(-5.1, -4.4, B + 1.5, -0.24, -0.02); knick(-4.75, B + 1.525, -0.13, 3, 0.5);
    // the sump in the far corner: a square pit with black water in it, the discharge pipe up into the joists, and a drip that never stops
    for (const [a, b, c, d] of [[-4.25, -4.15, -0.24, 0.5], [-3.6, -3.5, -0.24, 0.5], [-4.15, -3.6, -0.24, -0.14], [-4.15, -3.6, 0.4, 0.5]]) box(a, b, B - 0.5, B + 0.08, c, d, M.block, { uv: true });
    box(-4.15, -3.6, B - 0.52, B - 0.5, -0.14, 0.4, M.black, { uv: false, cast: false });
    { const w = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.54), M.water); w.rotation.x = -Math.PI / 2; w.position.set(-3.875, B - 0.15, 0.13); w.renderOrder = 1; house.add(w); }
    { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, -0.3 - B + 0.4, 10), M.pipe); p.position.set(-3.72, (B - 0.4 - 0.3) / 2, 0.05); house.add(p); }
    box(-7.9, -3.92, -0.46, -0.4, 0.12, 0.18, M.pipe, { uv: false }); { const e = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 10), M.pipe); e.position.set(-3.95, -0.52, 0.15); house.add(e); }
    const drip = (() => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), M.drip); m.position.set(-3.95, -0.62, 0.15); m.scale.y = 1.6; house.add(m);
      return { mesh: m, on: true, t: 0, v: 0, y0: -0.62, y1: B - 0.15, pause: 1.9, wait: 0 };
    })();
    bsolid(-4.3, -3.38, -0.4, 0.55);
    // old boxes along the east wall
    cardboardBox(-3.75, B, 2.6, 0.55, 0.45, 0.5, 1, 0.1); cardboardBox(-3.78, B + 0.45, 2.62, 0.5, 0.4, 0.45, 2, -0.2); cardboardBox(-4.35, B, 2.95, 0.5, 0.44, 0.5, 0, 0.3); cardboardBox(-3.8, B, 1.75, 0.5, 0.44, 0.5, 3, -0.1);
    bsolid(-4.7, -3.38, 1.4, 3.3);
    // the bare bulb on its cord with a pull chain; it swings a little all the time (laundry.bulb.set lights it, .swing is how much it moves)
    const bulb = (() => {
      const g = new THREE.Group(); g.position.set(-5.7, -0.16, 1.6); house.add(g);
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.55, 6), M.black); cord.position.y = -0.275; g.add(cord);
      const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.07, 10), M.brass); socket.position.y = -0.585; g.add(socket);
      const lampM = M.lamp.clone(); const b = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10), lampM); b.position.y = -0.665; b.scale.y = 1.3; g.add(b);
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.4, 5), M.steel); chain.position.set(0.03, -0.8, 0); g.add(chain);
      const bead = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), M.steel); bead.position.set(0.03, -1.0, 0); g.add(bead);
      const light = new THREE.PointLight(0xffd6a0, 0, 7, 1.8); light.position.y = -0.7; g.add(light);
      const r = { group: g, mesh: b, light, on: false, swing: 0.08, t: 0, base: 5, pos: new THREE.Vector3(-5.7, -0.85, 1.6), chain: new THREE.Vector3(-5.67, -1.16, 1.6),
        set(on) { this.on = on; light.intensity = on ? this.base : 0; lampM.emissiveIntensity = on ? 1.4 : 0; } };
      fixups.push(() => { for (const v of [r.pos, r.chain]) { v.x = SX(v.x); v.z = SZ(v.z); } });
      return r;
    })();
    laundry = { bulb, washer, drum: { mesh: washer.drum, get spinning() { return washer.spinning; }, spin(on) { washer.spinning = on; } }, sink, drip, floor: B, door: doors.basement, bounds: PLACES.laundry,
      tick(dt) {
        bulb.t += dt; const a = bulb.swing * Math.sin(bulb.t * 2.1) * (0.7 + 0.3 * Math.sin(bulb.t * 0.37));
        bulb.group.rotation.z = a; bulb.group.rotation.x = a * 0.4 * Math.cos(bulb.t * 1.3);
        if (bulb.on) bulb.light.intensity = bulb.base * (0.94 + Math.random() * 0.06);
        if (washer.spinning) washer.drum.rotation.y += dt * washer.rate;
        if (drip.on) {   // it falls from the elbow, hits the water, and the next one gathers
          if (drip.wait > 0) { drip.wait -= dt; if (drip.wait <= 0) { drip.mesh.visible = true; drip.mesh.position.y = drip.y0; drip.v = 0; } }
          else { drip.v += 9.8 * dt; drip.mesh.position.y -= drip.v * dt; if (drip.mesh.position.y < drip.y1) { drip.mesh.visible = false; drip.wait = drip.pause; } }
        } else drip.mesh.visible = false;
      } };
    fxTick = (dt) => laundry.tick(dt);
  }

  // ---------- furniture: each model replaces its stand-in (and collider) as it loads ----------
  const PI = Math.PI;
  const prop = (name, o, { tag, old = [], box: sb, after } = {}) => place(house, name, {
    ...o, hide: tag ? tagged[tag] || [] : [],
    onLoad: () => { old.forEach((c) => { c.on = false; }); if (sb) { const w = sb[1] - sb[0], d = sb[3] - sb[2], cx = SX((sb[0] + sb[1]) / 2), cz = SZ((sb[2] + sb[3]) / 2); solid(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2); } if (after) after(); },
  });
  // living room
  prop('table', { x: 2.9, z: -3.2, rot: -PI / 2 }, { tag: 'tv', old: [cTv], box: [2.45, 3.25, -3.95, -2.45] });
  const tvSet = prop('tv', { x: 2.95, y: 0.55, z: -3.2, rot: -PI / 2 }, { after: () => plainTv(tvSet) });
  prop('sofa', { x: -2.6, z: -2.4, rot: PI / 2 }, { tag: 'couch', old: [cCouch], box: [-3.05, -2.15, -3.3, -1.5] });
  // pushed toward the front wall so there is a lane behind it through the living room
  prop('table', { x: -1.2, z: -3.0, rot: PI / 2 }, { tag: 'coffee', old: [cCoffee], box: [-1.6, -0.8, -3.9, -2.1] });
  prop('armchair', { x: -2.55, z: -4.05, rot: 0 }, { box: [-2.98, -2.12, -4.42, -3.66] });   // front-left corner, clear of the picture window and of the lane through the living room
  prop('cabinet', { x: -0.2, z: -0.7, rot: PI, s: 0.9 }, { box: [-1.14, 0.74, -1.02, -0.38] });   // the china hutch: against the arch wall, to the right of the archway as you face it from the living room
  prop('plant2', { x: 2.85, z: -1.85 }, { box: [2.55, 3.15, -2.15, -1.55] });
  // the grandfather clock, between the picture window and the front door with its face to the room. once the model is in, its
  // pendulum (the bob and the rod are islands of their own in the case mesh) is cut out and hung from a pivot so it can swing; it ticks
  // at each end of the swing, heard by distance from wherever you are. clock.silent stops it dead
  const clock = (() => {
    const pos = new THREE.Vector3(1.05, 0, -4.23), c = { pos, pivot: null, t: 0, silent: false, period: 2, amp: 0.075, half: 0 }, dir = new THREE.Vector3();
    const cut = () => {
      let mesh = null; c.holder.traverse((o) => { if (o.isMesh && o.material.name === 'ClockCase') mesh = o; });
      if (!mesh || !mesh.geometry.index) return;
      c.holder.updateMatrixWorld(true);
      const geo = mesh.geometry, idx = geo.index.array, pa = geo.attributes.position, n = pa.count;
      // islands: triangles joined through shared vertices (or the same position, where a seam split them)
      const par = new Int32Array(n); for (let i = 0; i < n; i++) par[i] = i;
      const find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
      const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) par[a] = b; };
      const seen = new Map();
      for (let i = 0; i < n; i++) { const k = pa.getX(i).toFixed(3) + ',' + pa.getY(i).toFixed(3) + ',' + pa.getZ(i).toFixed(3), j = seen.get(k); if (j === undefined) seen.set(k, i); else uni(i, j); }
      for (let t = 0; t < idx.length; t += 3) { uni(idx[t], idx[t + 1]); uni(idx[t], idx[t + 2]); }
      const v = new THREE.Vector3(), boxes = new Map();
      for (let t = 0; t < idx.length; t += 3) { const r = find(idx[t]); let b = boxes.get(r); if (!b) { b = new THREE.Box3(); boxes.set(r, b); } for (let k = 0; k < 3; k++) b.expandByPoint(mesh.localToWorld(v.fromBufferAttribute(pa, idx[t + k]))); }
      // the pendulum hangs on the centre line: a disc near the bottom of the case and a thin rod up from it
      const take = new Set(), size = new THREE.Vector3(), mid = new THREE.Vector3(); let top = 0, zc = 0;
      for (const [r, b] of boxes) {
        b.getSize(size); b.getCenter(mid); if (Math.abs(mid.x - pos.x) > 0.015) continue;
        const bob = size.x > 0.15 && size.x < 0.3 && size.y < 0.3 && mid.y > 0.35 && mid.y < 0.7, rod = size.x < 0.03 && size.y > 0.4 && size.y < 0.8;
        if (bob || rod) { take.add(r); if (rod) { top = b.max.y; zc = mid.z; } }
      }
      if (take.size < 2) return;
      const keep = [], out = [];
      for (let t = 0; t < idx.length; t += 3) (take.has(find(idx[t])) ? out : keep).push(idx[t], idx[t + 1], idx[t + 2]);
      const pg = new THREE.BufferGeometry(), nm = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld), na = geo.attributes.normal, ua = geo.attributes.uv;
      const P = new Float32Array(out.length * 3), N = new Float32Array(out.length * 3), U = ua ? new Float32Array(out.length * 2) : null;
      out.forEach((i, k) => {
        mesh.localToWorld(v.fromBufferAttribute(pa, i)); P[k * 3] = v.x - pos.x; P[k * 3 + 1] = v.y - top; P[k * 3 + 2] = v.z - zc;
        v.fromBufferAttribute(na, i).applyMatrix3(nm).normalize(); N[k * 3] = v.x; N[k * 3 + 1] = v.y; N[k * 3 + 2] = v.z;
        if (U) { U[k * 2] = ua.getX(i); U[k * 2 + 1] = ua.getY(i); }
      });
      pg.setAttribute('position', new THREE.BufferAttribute(P, 3)); pg.setAttribute('normal', new THREE.BufferAttribute(N, 3)); if (U) pg.setAttribute('uv', new THREE.BufferAttribute(U, 2));
      geo.setIndex(keep); geo.computeBoundingSphere();
      const pend = new THREE.Mesh(pg, mesh.material); pend.castShadow = true;
      c.pivot = new THREE.Group(); c.pivot.position.set(pos.x, top, zc); c.pivot.add(pend); house.add(c.pivot);
    };
    c.holder = prop('grandfather', { x: pos.x, z: pos.z, rot: -PI / 2, s: 0.008 }, { box: [0.8, 1.3, -4.42, -4.02], after: cut });
    fixups.push(() => { pos.x = SX(pos.x); pos.z = SZ(pos.z); });
    c.tick = (dt, cam, sfx) => {
      if (c.silent || !c.pivot) return;
      c.t += dt; const ph = (c.t / c.period) % 1;
      c.pivot.rotation.z = c.amp * Math.sin(ph * Math.PI * 2);
      const half = ph < 0.5 ? 0 : 1;
      if (half === c.half || !sfx || !cam) return;
      c.half = half;
      const d = cam.position.distanceTo(pos), g = 0.3 / (1 + d * d * 0.22); if (g < 0.004) return;
      // left or right of where you are looking
      dir.set(pos.x - cam.position.x, 0, pos.z - cam.position.z).normalize(); const e = cam.matrixWorld.elements;
      sfx.clockTick(g, Math.max(-0.8, Math.min(0.8, dir.x * e[0] + dir.z * e[2])), half === 1);
    };
    return c;
  })();
  // kitchen and dining: the round table, chairs, a kettle and a pot on the stove
  {
    const cx = -2.1, cz = 1.8;   // pulled toward the living room so the back door and its swing stay clear
    prop('table_round', { x: cx, z: cz, s: 0.77 }, { tag: 'dining', old: [cDining], box: [cx - 0.55, cx + 0.55, cz - 0.55, cz + 0.55] });
    for (const [dx, dz, r] of [[-0.83, 0, PI / 2], [0.83, 0, -PI / 2], [0, -0.9, 0], [0, 0.9, PI]]) chairs.push({ holder: prop('chair', { x: cx + dx, z: cz + dz, rot: r }, { tag: 'dining' }), x: SX(cx + dx), z: SZ(cz + dz), rot: r });
    prop('kettle', { x: 2.82, y: 0.96, z: 1.17, rot: 0 });
    prop('pot', { x: 3.02, y: 0.96, z: 1.49, rot: 0 });
    prop('plant1', { x: -1.65, z: 3.17 }, { box: [-1.9, -1.4, 2.92, 3.42] });   // in the corner by the pantry, clear of the back door
  }
  // your room: the pine bunk (2.0 long, flush with the back wall, ladder at the foot by the window) and the box TV on its stand
  // the model's own blankets and pillows are flat slabs: they come off as it loads, and the beds are made below
  const bunkModel = prop('bunk', { x: 6.08, z: 2.89, rot: 0, s: 0.115 }, { tag: 'bunk', old: [cBunk], box: [4.98, 7.22, 2.2, 3.55], after: () => bunkModel.traverse((o) => { if (o.isMesh && /Blanket|Pillows/.test(o.material.name)) o.visible = false; }) });
  // both bunks made the same way: a sheet over the mattress (tops at 0.527 and 1.555), the plaid comforter with its turned-back band
  // under the pillow at the head (the bathroom wall end), tucked at the back wall. The bottom one hangs over the room side; the top
  // one has the guard rail there, so it rolls under instead
  // (made in a group at the bunk's own spot, so the bedding keeps the bunk's size through the stretch)
  { const bg = new THREE.Group(); bg.position.set(6.08, 0, 2.89); house.add(bg); defParent = bg; const X = -6.08, Z = -2.89;
    for (const [top, hang, seed] of [[0.527, 0.2, 0], [1.555, 0, 2.1]]) {
      rbox(5.15 + X, 7.02 + X, top - 0.002, top + 0.008, 2.35 + Z, 3.435 + Z, M.bedLinen, 0.004);
      drape({ x0: 5.16 + X, x1: 7.02 + X, zWall: 3.44 + Z, zEdge: 2.345 + Z, top: top + 0.008, mat: M.comforter, hang, band: 0.55, seed });
      pillow(5.19 + X, 5.64 + X, top + 0.107, 2.5 + Z, 3.28 + Z, 0.06 - seed * 0.05);
    }
    defParent = null; }
  const kidTv = prop('tv', { x: 5.33, y: 0.55, z: 0.95, rot: PI / 2 }, { tag: 'kidtv', after: () => plainTv(kidTv) });
  // kitchen appliances (doors face -x), the toilet (tank on the west wall)
  prop('fridge', { x: 2.845, z: 0.46, rot: -PI / 2, s: 0.98 }, { tag: 'fridge' });
  prop('stove', { x: 2.865, z: 1.33, rot: -PI / 2, s: 0.0095 }, { tag: 'stove' });
  prop('toilet', { x: 3.72, z: 1.9, rot: PI / 2, s: 1.05 }, { tag: 'toilet' });
  // Mom and Dad's dresser on their front wall and the lamp on the nightstand
  prop('dresser', { x: -5.7, z: -3.62, rot: 0, s: 0.52 }, { tag: 'pdresser' });
  prop('table_lamp', { x: -7.8, y: 0.6, z: 0.96, rot: 0, s: 0.011 }, { tag: 'plamp' });
  // the office: desk and computer under the window, the chair, the filing cabinet, the bookcase, and a desk lamp that can be on (office.lamp)
  const office = (() => {
    const deskTop = 2.98 * 0.26;
    const desk = prop('desk', { x: 4.5, z: -4.08, rot: 0, s: 0.26 });
    const pc = prop('crt_pc', { x: 4.42, y: deskTop, z: -4.12, rot: PI, s: 1 });   // its screen is its -z side: turned to face the chair
    const chair = prop('office_chair', { x: 4.5, z: -3.35, rot: PI, s: 0.008 });
    prop('filing', { x: 3.62, z: -4.15, rot: 0, s: 1 });
    prop('bookcase', { x: 5.54, z: -3.3, rot: -PI / 2, s: 1 });
    const lampM = M.lamp.clone(); const light = new THREE.PointLight(0xffd9a0, 0, 5, 1.8); light.position.set(SX(4.95), deskTop + 0.42, SZ(-4.12)); scene.add(light);
    const lamp = prop('desk_lamp', { x: 4.95, y: deskTop, z: -4.15, rot: -0.6, s: 0.0085 }, { after: () => lamp.traverse((o) => { if (o.isMesh && o.material.emissiveMap) { o.material = lampM; } }) });
    return { desk, pc, chair, deskTop, pos: new THREE.Vector3(SX(4.5), 0, SZ(-3.6)),
      lamp: { holder: lamp, light, on: false, base: 2.2, pos: light.position.clone(), set(on) { this.on = on; light.intensity = on ? this.base : 0; lampM.emissiveIntensity = on ? 1.2 : 0; } } };
  })();
  // the spare room: the old dresser (drawers out, mirror on top) against the end wall, the stand mirror inside its sheet facing the room
  spare.dresser = prop('dresser_old', { x: 7.75, z: -2.55, rot: -PI / 2, s: 0.02 }, { box: [7.45, 8.05, -2.85, -2.25] });
  spare.mirror.holder = prop('mirror', { x: 6.36, z: -3.0, rot: PI / 2, s: 0.182 });

  // ---------- set pieces for the nights: the TV, the wall phone, the bathroom mirror ----------
  const tvFx = (() => {
    // the glass: a 4:3 canvas of snow with a rolling bar, scanlines, and a dark vignette at the edges (the CRT look)
    const W = 160, H = 120;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
    const vig = document.createElement('canvas'); vig.width = W; vig.height = H;
    { const vg = vig.getContext('2d'), r = vg.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.6); r.addColorStop(0, 'rgba(0,0,0,0)'); r.addColorStop(1, 'rgba(0,0,0,0.8)'); vg.fillStyle = r; vg.fillRect(0, 0, W, H); }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    // the glass of the set (assets/props/tv.glb at 2.95, 0.55, -3.2, facing -x) is the 4:3 window left of the control strip,
    // z -3.475..-3.057 and y 0.655..0.975 on the front face at x 2.715. The picture sits just inside that, a hair in front.
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.40, 0.30), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, fog: false }));
    plane.rotation.y = -Math.PI / 2; plane.position.set(2.711, 0.815, -3.266); plane.visible = false; plane.userData.noWarp = true; house.add(plane);
    fixups.push(() => relTo(2.95, -3.2)(plane.position));
    const light = new THREE.PointLight(0x9db6ff, 0, 7, 1.6); light.position.set(SX(2.2), 1.0, SZ(-3.2)); scene.add(light);
    const fx = { on: false, figure: 0, t: 0, base: 4, light, plane,
      set(on) { fx.on = on; plane.visible = on; if (!on) light.intensity = 0; },
      tick(dt) {
        if (!fx.on) return;
        fx.t += dt; light.intensity = flicker('tv', fx.base * (0.75 + Math.random() * 0.5) * (fx.figure > 0.5 && Math.random() < 0.2 ? 0.2 : 1), fx.base);
        if (fx.t < 1 / 20) return; fx.t = 0;
        const img = g.createImageData(W, H), d = img.data, bar = Math.random() * H;
        for (let y = 0; y < H; y++) {
          const scan = y % 2 ? 0.78 : 1, rolling = Math.abs(y - bar) < 5 ? 55 : 0;   // every other line is dimmer; the bar rolls up the screen
          for (let x = 0; x < W; x++) {
            const i = (y * W + x) * 4, v = (60 + Math.random() * 150) * scan + rolling;
            d[i] = v * 0.82; d[i + 1] = v * 0.88; d[i + 2] = v; d[i + 3] = 255;
          }
        }
        g.putImageData(img, 0, 0);
        if (fx.figure > 0) {   // something tall, standing in the snow: a soft dark shape, the head a little dimmer
          g.save(); g.filter = 'blur(2px)'; g.globalAlpha = 0.6 * Math.min(1, fx.figure); g.fillStyle = '#060608';
          g.beginPath(); g.ellipse(80, 30, 8, 10, 0, 0, Math.PI * 2); g.fill(); g.fillRect(70, 40, 20, 62); g.restore();
        }
        g.drawImage(vig, 0, 0);
        tex.needsUpdate = true;
      } };
    return fx;
  })();
  const phone = (() => {
    const g = new THREE.Group(); g.position.set(-1.48, 1.4, 0.9); g.rotation.y = -Math.PI / 2; house.add(g);   // local +z points out into the dining room
    const beige = std({ color: 0xd9d0b4, roughness: 0.45 }), dark = std({ color: 0x1b1a18, roughness: 0.6 });
    const add = (geo, m, x, y, z, parent = g) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
    add(new THREE.BoxGeometry(0.15, 0.24, 0.06), beige, 0, 0, 0.03); add(new THREE.BoxGeometry(0.1, 0.1, 0.012), dark, 0, -0.03, 0.066);
    const hand = new THREE.Group(); hand.position.set(0, 0.04, 0.075); g.add(hand);
    add(new THREE.BoxGeometry(0.045, 0.21, 0.04), beige, -0.04, 0, 0, hand); add(new THREE.BoxGeometry(0.06, 0.05, 0.04), beige, -0.04, 0.1, 0, hand); add(new THREE.BoxGeometry(0.06, 0.05, 0.04), beige, -0.04, -0.1, 0, hand);
    const led = new THREE.MeshStandardMaterial({ color: 0x300000, emissive: 0xff1a10, emissiveIntensity: 0 }); add(new THREE.BoxGeometry(0.02, 0.012, 0.01), led, 0.045, 0.1, 0.064);
    const cord = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-0.04, -0.07, 0.07), new THREE.Vector3(-0.07, -0.25, 0.1), new THREE.Vector3(0.0, -0.33, 0.1), new THREE.Vector3(0.02, -0.14, 0.06)]), 18, 0.004, 5), dark); g.add(cord);
    const ph = { pos: new THREE.Vector3(-1.56, 1.3, 0.9), ringing: false, off: false,
      // (pos is mapped with the house)
      setRinging(on) { ph.ringing = on; led.emissiveIntensity = on ? 1.5 : 0; },
      pickUp() { ph.off = true; hand.position.set(-0.02, -0.28, 0.14); hand.rotation.set(0.5, 0, 0.3); },
      hangUp() { ph.off = false; hand.position.set(0, 0.04, 0.075); hand.rotation.set(0, 0, 0); },
      tick(t) { if (ph.ringing) { const on = (t % 1.6) < 0.8; led.emissiveIntensity = on ? 2 : 0; hand.rotation.z = on ? Math.sin(t * 90) * 0.04 : 0; } } };
    fixups.push(() => { ph.pos.x = SX(ph.pos.x); ph.pos.z = SZ(ph.pos.z); });
    return ph;
  })();
  const mirrorFx = (() => {
    const cv = document.createElement('canvas'); cv.width = 156; cv.height = 136; const g = cv.getContext('2d');
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.68), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, fog: false }));
    plane.rotation.y = -Math.PI / 2; plane.position.set(4.844, 1.6, 0.9); plane.visible = false; house.add(plane);
    const base = () => { const gr = g.createLinearGradient(0, 0, 156, 136); gr.addColorStop(0, '#2b3036'); gr.addColorStop(1, '#14171b'); g.fillStyle = gr; g.fillRect(0, 0, 156, 136); g.fillStyle = 'rgba(190,120,135,0.18)'; for (let i = 0; i < 6; i++) g.fillRect(i * 28, 0, 14, 136); };
    return {
      plane,
      show(kind) {
        base();
        if (kind === 'figure') {   // behind your reflected shoulder
          g.fillStyle = '#040405'; g.fillRect(96, 40, 26, 100); g.beginPath(); g.ellipse(109, 38, 15, 20, 0, 0, 7); g.fill();
          g.fillStyle = '#fff'; g.beginPath(); g.ellipse(102, 34, 4, 7, 0.3, 0, 7); g.ellipse(116, 34, 4, 7, -0.3, 0, 7); g.fill();
          g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(109, 42, 11, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
        } else {   // writing in the steam
          g.fillStyle = 'rgba(230,235,240,0.5)'; g.fillRect(0, 0, 156, 136); g.fillStyle = 'rgba(20,24,28,0.75)'; g.font = 'bold 30px "Special Elite", monospace'; g.textAlign = 'center'; g.fillText(kind === 'behind' ? 'BEHIND' : 'GET OUT', 78, 74);
        }
        tex.needsUpdate = true; plane.visible = true;
      },
      hide() { plane.visible = false; },
    };
  })();

  // ---------- what the nights leave behind, hidden until nights.js shows it (the TV, the phone, a dining chair and the vigil's candle are already in the house) ----------
  const proof = {};
  {
    const sheet = TX.marks();
    const decalMat = (roughness) => std({ map: sheet, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness });
    // q: the quarter of the sheet (0 claws, 1 bare foot, 2 hand, 3 crayon)
    const decal = (q, w, h, m) => {
      const geo = new THREE.PlaneGeometry(w, h), uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (q % 2) * 0.5 + uv.getX(i) * 0.5, (q < 2 ? 0.5 : 0) + uv.getY(i) * 0.5);
      return new THREE.Mesh(geo, m);
    };
    const kit = (name, build) => { const g = new THREE.Group(); g.visible = false; house.add(g); build(g); proof[name] = { g, show(on) { g.visible = on; } }; return proof[name]; };
    // claw marks down the louvred doors of your closet
    kit('SCRATCHES', (g) => { const d = decal(0, 0.66, 1.2, decalMat(0.9)); d.position.set(6.15, 1.45, 0.453); g.add(d); });
    // wet bare feet from the bathroom door, along the hall, to your door
    kit('FOOTPRINTS', (g) => {
      const m = decalMat(0.16);
      [[4.12, -0.42, 0, -1], [4.3, -0.78, 0.6, -0.8], [4.68, -0.98, 1, 0], [5.1, -0.8, 1, 0], [5.52, -0.98, 1, 0], [5.94, -0.8, 1, 0], [6.36, -0.98, 1, 0], [6.74, -0.78, 0.6, 0.8], [6.98, -0.5, 0, 1]].forEach(([x, z, dx, dz], i) => {
        const d = decal(1, 0.36, 0.36, m); d.rotation.set(-Math.PI / 2, Math.atan2(-dx, -dz), 0, 'YXZ'); d.position.set(x, 0.006, z); if (i % 2) d.scale.x = -1; g.add(d);
      });
    });
    // a handprint on the breaker panel's door, out in the garage
    kit('HANDPRINT', (g) => { const d = decal(2, 0.3, 0.3, decalMat(0.8)); d.position.set(-9.65, 1.47, -7.238); d.rotation.set(0, Math.PI, 0.12); g.add(d); });
    // crayon on the hall wall under the drawing, and the crayon on the carpet
    kit('DRAWING', (g) => {
      const d = decal(3, 0.5, 0.5, decalMat(0.6)); d.position.set(5.22, 0.52, -0.3 - WT / 2 - 0.003); d.rotation.y = Math.PI; g.add(d);
      const cr = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.07, 8), std({ color: 0x0c0c0e, roughness: 0.5 })); cr.rotation.set(0, 0.7, Math.PI / 2); cr.position.set(5.42, 0.0065, -0.56); g.add(cr);
    });
    // a kitchen cabinet left open: the dark inside, a shelf, the door swung out
    kit('CABINETS', (g) => {
      const inside = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.72), std({ color: 0x17130f, roughness: 1 })); inside.rotation.y = -Math.PI / 2; inside.position.set(2.874, 1.9, 2.6); g.add(inside);
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.016, 0.56), M.cabW); shelf.position.set(2.872, 1.9, 2.6); g.add(shelf);
      const hinge = new THREE.Group(); hinge.position.set(2.889, 1.9, 2.888); hinge.rotation.y = 1.75; g.add(hinge);
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.74, 0.576), M.cabW); leaf.position.set(0, 0, -0.288); leaf.castShadow = true; hinge.add(leaf);
      const pull = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.25, 0.015), M.brass); pull.position.set(-0.02, -0.2, -0.52); hinge.add(pull);
    });
    // stuffing out of your bear, wherever it was left (nights.js moves the group there)
    const tuft = kit('TEDDY', (g) => {
      const fluff = std({ color: 0xdcd6c8, roughness: 1 });
      for (const [x, z, s, sx, sz] of [[0, 0, 0.05, 1.5, 0.9], [0.09, 0.05, 0.035, 0.8, 1.6], [-0.07, 0.08, 0.04, 1.7, 0.7], [0.04, -0.1, 0.03, 1.2, 1.4], [-0.12, -0.04, 0.026, 1.9, 0.8], [0.16, -0.06, 0.02, 1, 1], [-0.03, 0.15, 0.018, 1.4, 0.9]]) {
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), fluff); b.position.set(x, s * 0.35, z); b.scale.set(sx, 0.45, sz); b.rotation.set(0.2, x * 20, -0.15); g.add(b);
      }
    });
    tuft.at = (x, y, z) => tuft.g.position.set(x, y, z);
  }

  // ---------- light fixtures ----------
  const bulbs = {};
  const fixture = (name, x, z, intensity = 9) => {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.lamp.clone());
    dome.rotation.x = Math.PI; dome.position.set(x, H - 0.005, z); house.add(dome);
    // a downward cone from under the shade (so the ceiling right above it isn't blown out); no separate bounce light, every light costs every pixel
    const spot = new THREE.SpotLight(0xffd29a, 0, 11, 1.3, 1.0, 2); spot.position.set(SX(x), H - 0.3, SZ(z)); spot.target.position.set(SX(x), 0, SZ(z));
    scene.add(spot, spot.target);
    // visibility only changes with the story phase: a changing number of lights recompiles every shader
    const L = { get intensity() { return spot.intensity / 1.7; }, set intensity(v) { spot.intensity = v * 1.7; }, set visible(v) { spot.visible = v; } };
    bulbs[name] = { light: L, dome, base: intensity };
  };
  fixture('bed', 6.5, 1.4); fixture('hall1', 4.8, -0.9); fixture('hall2', 7.0, -0.9); fixture('bath', 4.15, 1.0, 7);
  fixture('living', 0, -2.4, 10); fixture('kitchen', 0.3, 1.5, 10); fixture('spare', 7.0, -3.1, 8); fixture('room2', 4.55, -3.1, 8); fixture('parents', -5.7, -0.3, 9);

  // ---------- outlets, and a few green plug-in night lights (the only light you get at night) ----------
  const outletMat = std({ color: 0xe4ded0, roughness: 0.5 }), holeMat = std({ color: 0x14140f, roughness: 0.9 }), nlBody = std({ color: 0xe9e4d4, roughness: 0.45 });
  const nightLights = [];
  // (px, pz) on the wall's inner face, (nx, nz) pointing into the room, y = height of the outlet; lit = a night light is plugged into it.
  // the plate is a model, seated on the wall face; a plain box stands in for it until it loads.
  function outlet(px, y, pz, nx, nz, lit) {
    const g = new THREE.Group(); g.position.set(px, y, pz); g.rotation.y = Math.atan2(nx, nz);   // local +Z points into the room
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.12, 0.01), outletMat); plate.position.z = 0.005; g.add(plate);
    const standIn = [plate];
    for (const dy of [0.028, -0.028]) for (const dx of [-0.011, 0.011]) { const h = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.016, 0.004), holeMat); h.position.set(dx, dy, 0.011); g.add(h); standIn.push(h); }
    house.add(g);
    place(house, 'outlet', { x: px, y, z: pz, rot: g.rotation.y, s: 0.01, wall: true, hide: standIn });
    if (!lit) return;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.064, 0.09, 0.034), nlBody); body.position.set(0, -0.026, 0.027); body.castShadow = true; g.add(body);
    const mat = new THREE.MeshStandardMaterial({ color: 0x163a20, emissive: 0x40ff72, emissiveIntensity: 0, roughness: 0.35 });
    const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.046, 0.052), mat); lens.position.set(0, -0.018, 0.0445); g.add(lens);
    const light = new THREE.PointLight(0x55ff88, 0, 5, 2); light.position.set(0, -0.02, 0.2); g.add(light);
    const pos = new THREE.Vector3(); g.updateMatrixWorld(true); light.getWorldPosition(pos);
    nightLights.push({ light, mat, base: 0.9, pos });
  }
  // inner faces: hall walls at z = -0.38 (north side) and -1.42 (south side), end wall x = 8.02, bathroom tile x = 3.405
  outlet(6.5, 0.35, -0.38, 0, -1, true);       // hall, under the photos
  outlet(5.4, 0.33, -1.42, 0, 1, true);        // hall, by the bedroom doors
  outlet(8.02, 0.33, -0.9, -1, 0, true);       // hall, at the dead end by your door
  outlet(7.85, 0.32, -0.22, 0, 1, true);       // your room, beside the door
  outlet(3.405, 0.34, 1.0, 1, 0, true);        // bathroom
  outlet(0.85, 0.34, -0.38, 0, -1, true);      // living room, on the arch wall
  for (const [x, y, z, nx, nz] of [[0.4, 0.33, -0.38, 0, -1], [8.02, 0.33, 1.6, -1, 0], [4.6, 0.3, -1.42, 0, 1], [2.6, 1.1, 3.52, 0, -1], [4.0, 0.33, -4.42, 0, 1], [5.72, 0.33, -2.4, -1, 0], [-8.02, 0.33, 2.2, 1, 0], [-3.38, 0.33, -0.7, -1, 0], [-8.02, 0.33, -2.6, 1, 0]]) outlet(x, y, z, nx, nz, false);
  // light switches inside each door, knob side, 1.2 m up
  function switchAt(px, pz, nx, nz, y = 1.2) {
    const g = new THREE.Group(); g.position.set(px, y, pz); g.rotation.y = Math.atan2(nx, nz); house.add(g);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.12, 0.01), outletMat); plate.position.z = 0.005; g.add(plate);
    place(house, 'switch', { x: px, y, z: pz, rot: g.rotation.y, s: 0.01, wall: true, hide: [plate] });
  }
  switchAt(7.7, -0.22, 0, 1); switchAt(4.75, -0.2, 0, 1); switchAt(8.02, -1.8, -1, 0); switchAt(4.5, -1.58, 0, -1);   // your room, bathroom, the spare room (on the end wall by the latch side of its door), the office
  switchAt(2.55, -4.42, 0, 1); switchAt(-3.38, 1.15, -1, 0); switchAt(-9.0, PLACES.garage[3] - 0.12, 0, -1);   // by the front door, inside Mom and Dad's door, the garage (inside, on the sheathing)

  // for the night event: the face's glow, and a passing car's headlights (a shadow-casting spot, so the light only comes in through the windows)
  const faceLight = new THREE.PointLight(0xdce6ff, 0, 20, 2); faceLight.visible = false; scene.add(faceLight);
  const carLight = new THREE.SpotLight(0xfff2d6, 0, 48, 0.3, 0.55, 1.5); carLight.visible = false;
  carLight.castShadow = true; carLight.shadow.mapSize.set(1024, 1024); carLight.shadow.camera.near = 1; carLight.shadow.camera.far = 48; carLight.shadow.bias = -0.0006; carLight.shadow.autoUpdate = false;
  carLight.position.set(34, 0.8, -30); scene.add(carLight, carLight.target);

  // window fill lights: cheap light through the glass, no shadows
  const fills = [
    new THREE.PointLight(0xffffff, 0, 6, 2), new THREE.PointLight(0xffffff, 0, 6, 2),
    new THREE.PointLight(0xffffff, 0, 7, 2), new THREE.PointLight(0xffffff, 0, 7, 2), new THREE.PointLight(0xffffff, 0, 4, 2),
  ];
  fills[0].position.set(7.0, 1.7, 1.6); fills[1].position.set(4.8, 1.7, -3.2);
  fills[2].position.set(0, 1.6, -3.8); fills[3].position.set(0.3, 1.6, 2.6); fills[4].position.set(-2.3, 1.7, 2.6);
  fills.forEach((f) => { f.position.x = SX(f.position.x); f.position.z = SZ(f.position.z); scene.add(f); });

  // the hall spot: from the living-room end it lights the thing from behind and throws its long shadow down the hall
  const bathSpot = new THREE.SpotLight(0xffcf7a, 0, 32, 0.3, 0.35, 1.5);
  bathSpot.position.set(SX(-1.5), 2.4, SZ(-0.9)); bathSpot.target.position.set(SX(7), 0.2, SZ(-0.9));
  bathSpot.castShadow = true; bathSpot.shadow.mapSize.set(1024, 1024); bathSpot.shadow.camera.near = 0.3; bathSpot.shadow.camera.far = 32; bathSpot.shadow.bias = -0.0005;
  scene.add(bathSpot, bathSpot.target);

  // brick-edged planter along the front wall under the picture window, with shrubs; the stoop at the front door
  box(-1.9, 0.9, 0, 0.3, -5.3, -4.7, M.brick, { uv: true }); box(-1.8, 0.8, 0.28, 0.32, -5.2, -4.8, M.dirt, { cast: false });
  for (const x of [-1.4, -0.6, 0.1, 0.6]) { const sh = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), M.leaves); sh.position.set(x, 0.35, -5.0); sh.scale.y = 0.6; sh.castShadow = true; house.add(sh); }
  box(1.0, 2.8, -0.05, 0.14, -5.5, -4.5, M.concrete, { uv: false }); box(1.3, 2.5, -0.05, 0.07, -6.0, -5.5, M.concrete, { uv: false });
  const porchLight = new THREE.PointLight(0xffc880, 0, 6, 2); porchLight.position.set(SX(0.9), 2.1, -4.9); scene.add(porchLight);
  const porchBulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), M.lamp.clone()); porchBulb.position.set(0.9, 2.15, -4.6); house.add(porchBulb);

  const houseColliders = colliders.length;   // the colliders so far are the house's and get the stretch; the yard's below do not
  // ---------- yard ----------
  // the road surface and its markings, the gravel of the shoulders and the drive, and the ground that goes dark when it rains (weather.js)
  M.asphalt = std({ color: 0x2b2b2d, roughness: 0.92 }); M.asphalt.userData.worldUV = true; applyPBR(M.asphalt, 'asphalt', { tint: 0xa6a6a4, anti: { scale: 0.025, strength: 0.2 } });
  M.gravel = std({ color: 0xc8c4ba, roughness: 1 }); M.gravel.userData.worldUV = true; applyPBR(M.gravel, 'gravel', { tint: 0xe6e2d8, anti: { scale: 0.05, strength: 0.22 }, flat: 0.9 });
  M.rut = std({ color: 0x6e604f, roughness: 1 }); M.rut.userData.worldUV = true; applyPBR(M.rut, 'dirt', { tint: 0x8a7862, anti: true, flat: 0.9 });
  M.grassDry = std({ color: 0xb8a870, roughness: 1 }); M.grassDry.userData.worldUV = true; applyPBR(M.grassDry, 'grass', { tint: 0xc2b07a, anti: true, tile: 2.4, flat: 0.95 });
  // the lawn inside the fence: the leafy grass set, with broad patches drifting over it in the shader (worn ground browner and darker, lush
  // spots greener, a slow shift in tone), so it reads as one lawn and never as tiles. It is laid on after the anti-tiling, which gives the
  // shader its noise and the world position
  M.lawn = std({ color: 0xc4c8ae, roughness: 1 }); M.lawn.userData.worldUV = true;
  applyPBR(M.lawn, 'lawn', { tint: 0xc4c8ae, anti: { scale: 0.09, strength: 0.16 }, tile: 1.6, flat: 0.93 }).then(() => {
    const prev = M.lawn.onBeforeCompile;
    M.lawn.onBeforeCompile = (sh) => {
      prev(sh);
      sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        { float p1 = vn(vWp.xz * 0.045 + 3.1), p2 = vn(vWp.xz * 0.11 + 7.7), p3 = vn(vWp.xz * 0.4 + 1.3);
          float worn = smoothstep(0.6, 0.8, p1 * 0.7 + p2 * 0.3), lush = smoothstep(0.55, 0.78, (1.0 - p1) * 0.6 + p3 * 0.4);
          vec3 c = diffuseColor.rgb;
          c = mix(c, c * vec3(1.0, 0.86, 0.66) * 0.82, worn * 0.75);
          c = mix(c, c * vec3(0.78, 1.0, 0.7) * 0.96, lush * 0.6);
          diffuseColor.rgb = c * (0.92 + 0.16 * p3); }`);
    };
    M.lawn.customProgramCacheKey = () => 'lawnground'; M.lawn.needsUpdate = true;
  });
  M.paintY = std({ color: 0xb59b3c, roughness: 0.75 }); M.paintW = std({ color: 0xc9c6bb, roughness: 0.75 }); M.tar = std({ color: 0x1c1c1d, roughness: 0.8 });
  const wetMats = [M.asphalt, M.gravel, M.dirt, M.rut, M.concrete, M.tar, M.paintY, M.paintW];
  const RZ0 = -33.8, RZ1 = -27.2;   // the road's edges: two 3.3 m lanes, the near one for the +x traffic (traffic.js)
  // where the ground stays flat: the fenced yard with a margin for the house, the road and its shoulders, the barn's pad; a soft corridor for the
  // track between the yard and the barn. Everything else is the rolling field below.
  const FLAT = [{ r: [-30, 30, -40, 31] }, { r: [-260, 260, -40, -24] }, { r: [-76, -52, -34, 0] }, { r: [-56, -27, -24, -6], w: 0.4 }];
  {   // the ground: a thin slab in pieces over the flat part, around the hole where the cellar stairs go down and the ditch across the road (thin, so its underside stays above the laundry's ceiling)
    const { x0, xEnd, z0, z1 } = STAIR, hx0 = xEnd - 0.25, hx1 = x0, hz0 = z0 + 0.02, hz1 = z1 + 0.25;
    for (const [a, b, c, d] of [[-260, 260, -40, -38], [-30, 30, -35.2, hz0], [-30, 30, hz1, 31], [-30, hx0, hz0, hz1], [hx1, 30, hz0, hz1]]) box(a, b, -0.05, -0.02, c, d, M.grass, { cast: false, parent: yard });
    // the lawn inside the fence lies a centimetre over the field, in pieces round the stairwell
    for (const [a, b, c, d] of [[-27, 27, -26, hz0], [-27, 27, hz1, 28], [-27, hx0, hz0, hz1], [hx1, 27, hz0, hz1]]) box(a, b, -0.045, -0.015, c, d, M.lawn, { cast: false, parent: yard });
  }
  // the field: past the flat ground it rolls, two octaves of value noise under two metres, blended in over fourteen metres from each flat edge
  const fieldH = (() => {
    const hash = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
    const noise = (x, z) => {
      const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
      return (hash(i, j) * (1 - u) + hash(i + 1, j) * u) * (1 - v) + (hash(i, j + 1) * (1 - u) + hash(i + 1, j + 1) * u) * v;
    };
    const ss = (v) => { const t = Math.max(0, Math.min(1, v / 14)); return t * t * (3 - 2 * t); };
    return (x, z) => {
      let mask = 1;
      for (const { r, w = 0 } of FLAT) {
        const dx = Math.max(r[0] - x, 0, x - r[1]), dz = Math.max(r[2] - z, 0, z - r[3]);
        mask = Math.min(mask, w + (1 - w) * ss(Math.hypot(dx, dz)));
      }
      if (mask <= 0) return 0;
      return mask * (0.25 + (noise(x / 38 + 11, z / 38 + 5) * 2 - 1) * 1.3 + (noise(x / 15 + 7, z / 15 + 3) * 2 - 1) * 0.4);
    };
  })();
  fieldHeight = fieldH;
  {   // the field itself: one big plane with its vertices lifted; under the flat ground it sits a centimetre below the slabs
    const N = 260, geo = new THREE.PlaneGeometry(520, 520, N, N); geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), z = pos.getZ(i); pos.setY(i, -0.03 + fieldH(x, z)); uv.setXY(i, x, z); }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, M.grass); m.receiveShadow = true; yard.add(m);
  }
  // the gravel drive: a single lane up from the road to the front walk, where the moving truck is backed up to the house, with a branch
  // across to the garage doors and a pad in front of them; two worn tyre tracks, the gravel fanning out onto the shoulder, and a concrete
  // walk from the end of the drive to the front step. Everything else inside the fence is lawn.
  const DRIVE = [[0.7, 3.9, -27.4, -8.2], [-4.4, 0.7, -13.4, -10.2], [-7.6, -4.4, -13.6, -7.0]];   // the lane, the branch, the garage pad
  const onDrive = (x, z, pad = 0) => DRIVE.some(([x0, x1, z0, z1]) => x > x0 - pad && x < x1 + pad && z > z0 - pad && z < z1 + pad);
  for (const [x0, x1, z0, z1] of DRIVE) box(x0, x1, -0.02, -0.008, z0, z1, M.gravel, { cast: false, parent: yard });
  for (const x of [1.3, 3.1]) box(x, x + 0.36, -0.0075, -0.007, -27.8, -9.6, M.rut, { cast: false, parent: yard });
  for (const z of [-12.7, -10.9]) box(-7.4, 0.9, -0.0075, -0.007, z, z + 0.36, M.rut, { cast: false, parent: yard });
  box(-0.4, 5.0, -0.015, -0.009, -29.2, -26.6, M.gravel, { cast: false, parent: yard });
  box(2.55, 3.65, -0.012, 0, -8.3, -5.2, M.concrete, { cast: false, uv: true, parent: yard });
  box(-260, 260, -0.4, -0.005, RZ0, RZ1, M.asphalt, { cast: false, parent: yard });   // the road along the front of the property
  box(-260, 260, -0.03, -0.006, RZ0 - 1.4, RZ0, M.gravel, { cast: false, parent: yard }); box(-260, 260, -0.03, -0.006, RZ1, RZ1 + 1.0, M.gravel, { cast: false, parent: yard });   // gravel shoulders
  for (let x = -258; x < 258; x += 9) box(x, x + 3, -0.0045, -0.004, -30.55, -30.45, M.paintY, { cast: false, parent: yard });   // the centre line, faded
  for (const z of [RZ0 + 0.25, RZ1 - 0.35]) box(-260, 260, -0.0045, -0.004, z, z + 0.1, M.paintW, { cast: false, parent: yard });   // the edge lines
  {   // tar patches over old potholes, and a ditch along the far side of the road (two slopes in the gap left in the ground)
    const r = TX.rng(909);
    for (let i = 0; i < 14; i++) { const x = -120 + r() * 240, z = RZ0 + 0.6 + r() * 5.4, w = 0.8 + r() * 2.2, d = 0.5 + r() * 1.2; box(x, x + w, -0.0048, -0.0042, z, z + d, M.tar, { cast: false, parent: yard }); }
    const L = Math.hypot(1.4, 0.55), a = Math.atan2(0.55, 1.4);
    for (const s of [-1, 1]) { const geo = new THREE.BoxGeometry(520, 0.06, L); worldUV(geo); const m = new THREE.Mesh(geo, M.grass); m.receiveShadow = true; m.position.set(0, -0.3, -36.6 + s * 0.7); m.rotation.x = -s * a; yard.add(m); }
    box(-260, 260, -0.62, -0.56, -36.9, -36.3, M.dirt, { cast: false, parent: yard });   // the mud at the bottom
  }
  // the moving truck (assets/props/truck.glb, a cab-over box truck): backed up the drive toward the house with its roll-up door open and
  // the ramp down, so the family can walk up into the box. TRUCK.z is the rear sill, TRUCK.bed the floor height (main.js walks Dad up the ramp)
  const TRUCK = { x: 2.3, z: -14.5, bed: 1.3, s: 0.95, ramp: 4.3 };
  {
    const s = TRUCK.s, zc = TRUCK.z - 3.02 * s, W2 = 1.1 * s;   // the model is 6.04 long along its x; turned so its back faces the house (+z)
    place(yard, 'truck', { x: TRUCK.x, z: zc, rot: Math.PI / 2, s, onLoad: (holder, b, m) => {
      // open the back: the roll-up door is the rear wall of the box, so its triangles go (the model is two-sided, so the inside of the box shows)
      holder.updateMatrixWorld(true);
      m.traverse((o) => {
        if (!o.isMesh || !/Body_lct|Bottom_UCB/.test(o.name)) return;
        const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(), p = g.attributes.position, v = new THREE.Vector3(), keep = [];
        for (let i = 0; i < p.count; i += 3) {
          let back = 0; for (let k = 0; k < 3; k++) { v.fromBufferAttribute(p, i + k).applyMatrix4(o.matrixWorld); if (v.z > TRUCK.z - 0.12 && v.y > TRUCK.bed - 0.12) back++; }
          if (back < 3) keep.push(i);
        }
        const out = new THREE.BufferGeometry();
        for (const name of Object.keys(g.attributes)) { const a = g.attributes[name], arr = new a.array.constructor(keep.length * 3 * a.itemSize); keep.forEach((i, n) => { for (let k = 0; k < 3 * a.itemSize; k++) arr[n * 3 * a.itemSize + k] = a.array[i * a.itemSize + k]; }); out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize, a.normalized)); }
        out.computeBoundingSphere(); o.geometry = out;
      });
    } });
    // the plywood floor of the box, the door rolled up under the roof, the ramp hooked on the sill
    box(TRUCK.x - W2 + 0.06, TRUCK.x + W2 - 0.06, TRUCK.bed - 0.02, TRUCK.bed + 0.012, TRUCK.z - 3.5, TRUCK.z - 0.02, M.ply, { uv: true, parent: yard });
    { const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 2 * W2 - 0.1, 14), M.steel); roll.rotation.z = Math.PI / 2; roll.position.set(TRUCK.x, 3.34 * s - 0.17, TRUCK.z - 0.22); roll.castShadow = true; yard.add(roll); }
    {
      const RL = TRUCK.ramp, L = Math.hypot(RL, TRUCK.bed), ramp = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.04, L), M.metal);
      ramp.position.set(TRUCK.x, TRUCK.bed / 2 - 0.01, TRUCK.z + RL / 2); ramp.rotation.x = Math.atan2(TRUCK.bed, RL); ramp.castShadow = ramp.receiveShadow = true; yard.add(ramp);
      for (const x of [-0.5, 0.5]) { const lip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, L), M.steel); lip.position.set(TRUCK.x + x, TRUCK.bed / 2 + 0.02, TRUCK.z + RL / 2); lip.rotation.x = ramp.rotation.x; yard.add(lip); }
    }
    {   // what is still in the back: a stack of boxes, a rolled mattress and a lamp, all of it where the family reaches in
      const y0 = TRUCK.bed + 0.012;
      const stack = [[1.7, y0, -15.8, 0.62, 0.5, 0.5, 0, 0.1], [2.4, y0, -15.8, 0.6, 0.46, 0.5, 1, -0.05], [3.1, y0, -15.7, 0.55, 0.5, 0.5, 2, 0.12], [2.0, y0 + 0.5, -15.8, 0.55, 0.46, 0.5, 3, 0.2], [2.7, y0 + 0.46, -15.8, 0.58, 0.5, 0.5, 0, -0.1],
        [1.8, y0, -16.9, 0.6, 0.5, 0.55, 2, 0], [2.5, y0, -16.9, 0.6, 0.5, 0.55, 1, 0.1], [2.3, y0 + 0.5, -16.9, 0.6, 0.5, 0.55, 0, 0.05]];
      for (const [x, y, z, w, h, d, mi, r] of stack) cardboardBox(x, y, z, w, h, d, mi, r, yard);
      const mat = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.7, 16), std({ color: 0xc9c2a8, roughness: 1 })); mat.rotation.z = Math.PI / 2; mat.position.set(2.5, y0 + 0.3, -18.0); yard.add(mat);
    }
    solid(TRUCK.x - 1.4, TRUCK.x + 1.4, zc - 3.3 * s, TRUCK.z + 0.1);
  }
  // pickup boxes
  const pickups = [
    cardboardBox(1.3, 0, -12.3, 0.5, 0.44, 0.5, 3, 0.15, yard),
    cardboardBox(3.45, 0, -12.7, 0.5, 0.44, 0.5, 3, -0.3, yard),
    cardboardBox(3.3, 0, -11.7, 0.5, 0.44, 0.5, 3, 0.4, yard),
  ];
  const dropSpots = [new THREE.Vector3(5.98, 0.575, 3.0), new THREE.Vector3(6.52, 0.575, 3.0), new THREE.Vector3(6.3, 0, 1.95)];
  fixups.push(() => { relTo(6.08, 2.89)(dropSpots[0]); relTo(6.08, 2.89)(dropSpots[1]); dropSpots[2].x = SX(dropSpots[2].x); dropSpots[2].z = SZ(dropSpots[2].z); });   // two on the bunk, one on the floor   // on the bottom bunk's comforter, past the pillow; the third on the floor in front of it

  // the detached two-car garage (brown siding, gray shingles) in front of Mom and Dad's wing, beside the drive: its two doors face the gravel,
  // the side door faces the house, and the breaker panel is inside on the stud wall by that door (W.garage, W.breaker).
  const [GX0, GX1, GZ0, GZ1] = PLACES.garage, GH = 2.7, GT = 0.12;
  let garage = null, breaker = null;
  {
    defParent = yard;
    const gw = (x0, x1, y0, y1, z0, z1, inside) => {   // a wall piece: siding outside, the plywood sheathing on the face that looks into the garage
      const m = [M.siding, M.siding, M.siding, M.siding, M.siding, M.siding]; m[inside] = M.ply;   // +x, -x, +y, -y, +z, -z
      box(x0, x1, y0, y1 === GH ? GH + 0.04 : y1, z0, z1, m);   // a wall that reaches the ceiling runs up into it rather than meeting it edge to edge
    };
    gw(GX0, GX1, 0, GH, GZ0, GZ0 + GT, 4);
    gw(GX0, GX0 + GT, 0, GH, GZ0 + GT, GZ1 - GT, 0);
    gw(GX0, -8.75, 0, GH, GZ1 - GT, GZ1, 5); gw(-7.85, GX1, 0, GH, GZ1 - GT, GZ1, 5); gw(-8.75, -7.85, 2.1, GH, GZ1 - GT, GZ1, 5); casing(true, GZ1 - GT / 2, { c: -8.3, w: 0.9 });
    gw(GX1 - GT, GX1, 0, GH, GZ0 + GT, -13.2, 1); gw(GX1 - GT, GX1, 0, GH, -10.5, -10.1, 1); gw(GX1 - GT, GX1, 0, GH, -7.4, GZ1 - GT, 1); gw(GX1 - GT, GX1, 2.3, GH, -13.2, -7.4, 1);
    for (const [z0, z1] of [[-13.2, -10.5], [-10.1, -7.4]]) {   // the two overhead doors, shut
      box(GX1 - 0.07, GX1 - 0.04, 0.04, 2.3, z0, z1, M.garageDoor, { uv: false });
      for (let y = 0.6; y < 2.3; y += 0.56) box(GX1 - 0.04, GX1 - 0.03, y, y + 0.03, z0 + 0.02, z1 - 0.02, M.black, { uv: false });
      for (let i = 0; i < 4; i++) { const zc = z0 + 0.35 + i * (z1 - z0 - 0.7) / 3; box(GX1 - 0.045, GX1 - 0.03, 1.85, 2.15, zc - 0.22, zc + 0.22, M.glassOut, { uv: false }); }
    }
    solid(GX0 - 0.05, GX0 + GT, GZ0, GZ1, { wall: true }); solid(GX1 - GT, GX1 + 0.05, GZ0, GZ1, { wall: true }); solid(GX0, GX1, GZ0 - 0.05, GZ0 + GT, { wall: true });
    solid(GX0, -8.75, GZ1 - GT, GZ1 + 0.05, { wall: true }); solid(-7.85, GX1, GZ1 - GT, GZ1 + 0.05, { wall: true });
    box(GX0, GX1, -0.1, 0, GZ0, GZ1, M.concrete, { cast: false });
    // laps the wall tops and casts shadow: no line of sun through the ridge
    box(GX0 - 0.02, GX1 + 0.02, GH, GH + 0.08, GZ0 - 0.02, GZ1 + 0.02, [M.siding, M.siding, M.siding, M.ply, M.siding, M.siding]);
    {   // the roof: ridge along x, gable ends toward the drive and the field
      const half = (GZ1 - GZ0) / 2 + 0.3, rise = 1.3, L = Math.hypot(half, rise), a = Math.atan2(rise, half), zc = (GZ0 + GZ1) / 2, xc = (GX0 + GX1) / 2;
      for (const s of [-1, 1]) { const geo = new THREE.BoxGeometry(GX1 - GX0 + 0.5, 0.14, L); worldUV(geo); const m = new THREE.Mesh(geo, M.roof); m.castShadow = m.receiveShadow = true; m.position.set(xc, GH + 0.05 + rise / 2, zc + s * half / 2); m.rotation.x = s * a; yard.add(m); }
      const peak = GH + 0.05 + rise * ((half - 0.3) / half);
      // the base overlaps the wall top: no slit of sun under the gable
      const shape = new THREE.Shape([new THREE.Vector2(-GZ0, GH - 0.06), new THREE.Vector2(-GZ1, GH - 0.06), new THREE.Vector2(-zc, peak)]);
      for (const x of [GX0 + 0.005, GX1 - 0.005]) { const g = new THREE.ShapeGeometry(shape); g.rotateY(Math.PI / 2); const m = new THREE.Mesh(g, M.gable); m.position.x = x; m.castShadow = true; yard.add(m); }
    }
    // inside: bare studs over the sheathing on the long walls
    for (let x = GX0 + GT + 0.3; x < GX1 - GT; x += 0.6) {
      if (x < -8.8 || x > -7.8) box(x - 0.02, x + 0.02, 0, GH, GZ1 - GT - 0.09, GZ1 - GT, M.furn, { uv: false });
      box(x - 0.02, x + 0.02, 0, GH, GZ0 + GT, GZ0 + GT + 0.09, M.furn, { uv: false });
    }
    // the breaker panel: a gray steel box between two studs by the side door, the breakers on its dead front, a door on a hinge (garage.panel.open)
    const PX = -9.68, PY = 1.45, PZ = GZ1 - GT - 0.1;
    rbox(PX - 0.25, PX + 0.25, PY - 0.3, PY + 0.3, PZ + 0.01, GZ1 - GT, M.steel, 0.01);
    for (let i = 0; i < 8; i++) rbox(PX - 0.14 + (i % 2) * 0.17, PX - 0.06 + (i % 2) * 0.17, PY - 0.17 + Math.floor(i / 2) * 0.1, PY - 0.11 + Math.floor(i / 2) * 0.1, PZ + 0.004, PZ + 0.012, M.black, 0.003);
    rbox(PX - 0.06, PX + 0.06, PY + 0.17, PY + 0.25, PZ + 0.002, PZ + 0.012, M.black, 0.003);
    const pDoor = new THREE.Group(); pDoor.position.set(PX - 0.25, PY, PZ); yard.add(pDoor);
    { const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.012), M.steel); leaf.position.set(0.25, 0, -0.006); leaf.castShadow = true; pDoor.add(leaf);
      const latch = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.01), M.black); latch.position.set(0.46, 0, -0.016); pDoor.add(latch); }
    breaker = { pos: new THREE.Vector3(PX, PY, PZ), face: new THREE.Vector3(0, 0, -1) };
    pDoor.updateMatrixWorld(true); pDoor.attach(proof.HANDPRINT.g);   // the handprint is on the door: it swings with it
    // one bare bulb in the middle of the ceiling (garage.light.set), and a dead one over the side door outside
    const light = (() => {
      const lampM = M.lamp.clone(); const b = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), lampM); b.position.set(-10.8, GH - 0.14, -10.3); b.scale.y = 1.3; yard.add(b);
      const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.08, 10), M.white); sock.position.set(-10.8, GH - 0.04, -10.3); yard.add(sock);
      const pl = new THREE.PointLight(0xffe0b0, 0, 9, 1.7); pl.position.set(-10.8, GH - 0.25, -10.3); scene.add(pl);
      return { light: pl, mesh: b, on: false, base: 6, pos: b.position.clone(), set(on) { this.on = on; pl.intensity = on ? this.base : 0; lampM.emissiveIntensity = on ? 1.4 : 0; } };
    })();
    { const b = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), M.lamp.clone()); b.position.set(-8.3, 2.3, GZ1 + 0.08); yard.add(b); }
    // a workbench with a pegboard, a stack of tires, boxes, an oil stain
    rbox(-13.5, -10.5, 0.82, 0.88, GZ0 + GT + 0.09, GZ0 + GT + 0.69, M.furn, 0.01);
    for (const x of [-13.45, -10.55]) for (const z of [GZ0 + GT + 0.14, GZ0 + GT + 0.64]) box(x - 0.03, x + 0.03, 0, 0.82, z - 0.03, z + 0.03, M.furn, { uv: false });
    box(-13.5, -10.5, 1.1, 1.9, GZ0 + GT + 0.09, GZ0 + GT + 0.11, M.ply, { uv: true }); knick(-12.0, 0.88, GZ0 + GT + 0.4, 5, 2.2);
    solid(-13.55, -10.45, GZ0, GZ0 + GT + 0.75);
    for (let i = 0; i < 3; i++) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.2, 20), M.tire); t.position.set(-13.3, 0.1 + i * 0.2, -8.0); t.castShadow = true; yard.add(t); }
    solid(-13.7, -12.9, -8.4, -7.6);
    cardboardBox(-13.3, 0, -9.2, 0.6, 0.5, 0.5, 2, 0.1, yard); cardboardBox(-13.3, 0.5, -9.2, 0.5, 0.4, 0.45, 0, -0.2, yard); cardboardBox(-13.3, 0, -9.9, 0.5, 0.44, 0.5, 1, 0.3, yard);
    solid(-13.7, -12.95, -10.2, -8.9);
    { const stain = new THREE.Mesh(new THREE.CircleGeometry(0.45, 20), std({ color: 0x14120f, roughness: 0.4, transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
      stain.rotation.x = -Math.PI / 2; stain.scale.set(1.4, 1, 1); stain.position.set(-11.0, 0.002, -8.9); stain.renderOrder = 1; yard.add(stain); }
    // the concrete apron out to the gravel, and a walk from the side door to the house
    box(GX1, -6.0, -0.03, 0.0, GZ0, GZ1, M.concrete, { cast: false, uv: true });
    box(-8.6, -8.0, -0.03, -0.01, GZ1, -3.95, M.concrete, { cast: false, uv: true });
    defParent = null;
    garage = { door: doors.garage, light, panel: { group: pDoor, pos: breaker.pos, isOpen: false, open(k) { pDoor.rotation.y = k * 1.9; this.isOpen = k > 0.5; } }, pos: new THREE.Vector3(-10.8, 0, -10.3), bounds: PLACES.garage };
  }
  {   // shrubs (assets/props/shrub.glb, 0.5 m at scale 1): a loose row along the east end of the house, and the planter under the picture window
    const r = TX.rng(31), hx = SX(8.1) + 1.8, mats = [], q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), m4 = new THREE.Matrix4(), sc = new THREE.Vector3();
    const put = (x, z, k) => { q.setFromAxisAngle(up, r() * 6.28); mats.push(m4.clone().compose(new THREE.Vector3(x, -0.06, z), q, sc.set(k, k * (0.85 + r() * 0.3), k))); };
    for (let i = 0; i < 10; i++) put(hx + (r() - 0.5) * 0.4, -4.6 + i * 1.25, 2.3 + r() * 0.9);
    for (const x of [-1.4, -0.6, 0.1, 0.6]) put(SX(x), -5.05, 1.5 + r() * 0.4);
    scatter(yard, 'shrub', mats); solid(hx - 0.8, hx + 0.8, -5.2, 7.2);
  }
  // utility poles along the road (they also give the road something to rush past when you are in a car)
  {
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.18, 8, 8), M.darkWood, 28), arms = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.12, 2.4), M.darkWood, 28), mm = new THREE.Matrix4(); let n = 0;
    for (let x = -240; x <= 240 && n < 28; x += 40) { mm.makeTranslation(x, 4, -26.2); poles.setMatrixAt(n, mm); mm.makeTranslation(x, 7.6, -26.2); arms.setMatrixAt(n, mm); n++; }
    poles.count = arms.count = n; poles.castShadow = true; yard.add(poles, arms);
    const wire = new THREE.Mesh(new THREE.BoxGeometry(480, 0.02, 0.02), M.black); wire.position.set(0, 7.5, -26.2); yard.add(wire);
  }
  // the property lines: a post-and-board fence along the west, back and east edges (the front is the road); 4x4 posts every 2.4 m, two rails,
  // boards with a gap between them, each a little off true. Past it the fog takes over.
  {
    const FX0 = -27, FX1 = 27, FZ0 = -26, FZ1 = 28, G0 = -17.4, G1 = -14.6, r = TX.rng(57);   // G0..G1: the gate out to the barn track
    const runs = [[FX0, FZ0, FX0, G0], [FX0, G1, FX0, FZ1], [FX1, FZ0, FX1, FZ1], [FX0, FZ1, FX1, FZ1]];
    const posts = [], rails = [], boards = [];
    for (const [ax, az, bx, bz] of runs) {
      const L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L, yaw = Math.atan2(ux, uz);
      for (let d = 0; d <= L + 0.01; d += 2.4) { const t = Math.min(d, L); posts.push([ax + ux * t, az + uz * t, yaw]); }
      for (let d = 0; d < L; d += 2.4) { const len = Math.min(2.4, L - d); for (const y of [0.5, 1.2]) rails.push([ax + ux * (d + len / 2), az + uz * (d + len / 2), yaw, len, y]); }
      for (let d = 0.12; d < L - 0.08; d += 0.17) boards.push([ax + ux * d, az + uz * d, yaw + (r() - 0.5) * 0.02, 1.5 + (r() - 0.5) * 0.09, (r() - 0.5) * 0.035]);
    }
    const q = new THREE.Quaternion(), e = new THREE.Euler(), m4 = new THREE.Matrix4(), sc = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
    const mesh = (geo, mat, n) => { const im = new THREE.InstancedMesh(geo, mat, n); im.castShadow = true; im.receiveShadow = true; yard.add(im); return im; };
    const pg = new THREE.BoxGeometry(0.1, 1.75, 0.1); pg.translate(0, 0.875, 0);
    const pm = mesh(pg, M.darkWood, posts.length); posts.forEach(([x, z, yaw], i) => { q.setFromAxisAngle(up, yaw); pm.setMatrixAt(i, m4.compose(new THREE.Vector3(x, 0, z), q, sc)); });
    const rg = new THREE.BoxGeometry(0.04, 0.09, 1); rg.translate(0.06, 0, 0);
    const rm = mesh(rg, M.fence, rails.length); rails.forEach(([x, z, yaw, len, y], i) => { q.setFromAxisAngle(up, yaw); rm.setMatrixAt(i, m4.compose(new THREE.Vector3(x, y, z), q, sc.set(1, 1, len))); });
    sc.set(1, 1, 1);
    const bg = new THREE.BoxGeometry(0.02, 1, 0.14); bg.translate(0.09, 0.5, 0);
    { const uv = bg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.08, uv.getY(i) * 0.75); }   // the grain runs up the board, at the wood's own scale
    const bm = mesh(bg, M.fence, boards.length); boards.forEach(([x, z, yaw, h, lean], i) => { q.setFromEuler(e.set(0, yaw, lean)); bm.setMatrixAt(i, m4.compose(new THREE.Vector3(x, 0.08, z), q, sc.set(1, h, 1))); });
    sc.set(1, 1, 1);
    solid(FX0 - 0.3, FX0 + 0.3, FZ0, G0); solid(FX0 - 0.3, FX0 + 0.3, G1, FZ1); solid(FX1 - 0.3, FX1 + 0.3, FZ0, FZ1); solid(FX0, FX1, FZ1 - 0.3, FZ1 + 0.3);
  }

  // ---------- the end of the drive: the street light, the mailbox, the cans, the sign down the road, the reflector posts ----------
  // the street light: a wooden pole on the shoulder east of the drive, a steel arm out over the road and a cobra head on the end of it, the old
  // high-pressure sodium kind that comes up amber and buzzes. It is on the grid, so the blackout takes it too (main.js: streetLight.set).
  const streetLight = (() => {
    const PX = 7.8, PZ = -26.3, PH = 8.0, HX = PX, HZ = -29.3, HY = 8.25;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, PH, 10), M.darkWood); pole.position.set(PX, PH / 2, PZ); pole.castShadow = true; yard.add(pole);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, Math.hypot(HZ - PZ, HY - (PH - 0.5)), 8), M.steel); arm.position.set(PX, (PH - 0.5 + HY) / 2, (PZ + HZ) / 2); arm.rotation.x = Math.atan2(HZ - PZ, HY - (PH - 0.5)); arm.castShadow = true; yard.add(arm);
    const brace = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.9, 6), M.steel); brace.position.set(PX, PH - 1.1, PZ - 0.8); brace.rotation.x = -0.95; yard.add(brace);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.2, 0.95), std({ color: 0x5c6066, roughness: 0.5, metalness: 0.5 })); head.position.set(HX, HY, HZ - 0.3); head.castShadow = true; yard.add(head);
    const lensMat = std({ color: 0xcfb37a, emissive: 0xffb050, emissiveIntensity: 0, roughness: 0.4 });
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), lensMat); lens.scale.set(1.1, 0.7, 1.9); lens.position.set(HX, HY - 0.1, HZ - 0.3); yard.add(lens);
    const light = new THREE.SpotLight(0xffb45c, 0, 30, 1.0, 0.55, 1.4); light.position.set(HX, HY - 0.12, HZ - 0.3); light.target.position.set(HX - 0.6, 0, HZ + 0.5); scene.add(light, light.target);
    // the light in the air under it: a soft cone, and a glow on the lens; moths around it
    const coneMat = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, vertexColors: true });
    const coneGeo = new THREE.ConeGeometry(7.5, HY - 0.2, 24, 6, true), cp = coneGeo.attributes.position, cc = new Float32Array(cp.count * 3);
    for (let i = 0; i < cp.count; i++) { const k = Math.min(1, Math.max(0, cp.getY(i) / (HY - 0.2) + 0.5)) ** 2.2; cc[i * 3] = cc[i * 3 + 1] = cc[i * 3 + 2] = k; }   // bright at the lamp, gone by the ground (clamped: a negative base would make NaN, and one NaN pixel blacks the whole frame through the bloom)
    coneGeo.setAttribute('color', new THREE.BufferAttribute(cc, 3));
    const cone = new THREE.Mesh(coneGeo, coneMat); cone.position.set(HX - 0.3, (HY - 0.2) / 2, HZ); cone.renderOrder = 3; yard.add(cone);
    const gc = document.createElement('canvas'); gc.width = gc.height = 64; const gg = gc.getContext('2d'), gr = gg.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,230,180,1)'); gr.addColorStop(0.2, 'rgba(255,200,120,0.6)'); gr.addColorStop(1, 'rgba(255,160,60,0)'); gg.fillStyle = gr; gg.fillRect(0, 0, 64, 64);
    const glowTex = new THREE.CanvasTexture(gc); glowTex.colorSpace = THREE.SRGBColorSpace;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, fog: false })); glow.scale.set(3.2, 3.2, 1); glow.position.set(HX, HY - 0.15, HZ - 0.3); glow.renderOrder = 4; yard.add(glow);
    const NM = 26, mp = new Float32Array(NM * 3), mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
    const moths = new THREE.Points(mg, new THREE.PointsMaterial({ color: 0xffe0b0, size: 0.035, transparent: true, opacity: 0, depthWrite: false })); moths.frustumCulled = false; yard.add(moths);
    const seeds = Array.from({ length: NM }, (_, i) => ({ a: i * 2.4, r: 0.25 + (i % 5) * 0.12, h: (i % 3) * 0.15, s: 0.8 + (i % 4) * 0.5 }));
    const ST = { on: false, goal: 0, I: 0, t: 0, stutter: 0, next: 6, base: 650 };
    return {
      light, pos: new THREE.Vector3(HX, HY, HZ), lens: lensMat, cone, glow, moths, haze: 0,   // haze: how much the beam shows in the air (the rain, weather.js)
      set(on) { ST.on = on; ST.goal = on ? 1 : 0; if (!on) { ST.I = 0; this.apply(0); } },
      apply(k) {
        light.intensity = ST.base * k; lensMat.emissiveIntensity = 3.2 * k; coneMat.opacity = (0.022 + 0.11 * this.haze) * k; glow.material.opacity = 0.85 * k; moths.material.opacity = 0.8 * k;
        cone.visible = glow.visible = moths.visible = k > 0.001;
      },
      tick(dt, eye, sfx) {
        ST.t += dt;
        ST.I += (ST.goal - ST.I) * Math.min(1, dt * 0.9);   // sodium comes up slowly
        // the arc wavers a little all the time, and now and then the ballast stutters
        let k = ST.I * (0.94 + 0.04 * Math.sin(ST.t * 31) * Math.sin(ST.t * 4.7) + 0.02 * Math.sin(ST.t * 120));
        if (ST.stutter > 0) { ST.stutter -= dt; k *= ST.stutter > 0.12 ? 0.35 : 1.25; }
        else { ST.next -= dt; if (ST.next <= 0) { ST.next = 7 + Math.random() * 22; ST.stutter = 0.16 + Math.random() * 0.1; } }
        this.apply(k);
        if (k > 0.01) {
          for (let i = 0; i < NM; i++) { const s = seeds[i], a = s.a + ST.t * s.s * 2.2, w = Math.sin(ST.t * 5.1 * s.s + i); mp[i * 3] = HX + Math.cos(a) * (s.r + w * 0.08); mp[i * 3 + 1] = HY - 0.35 - s.h + Math.sin(ST.t * 3.3 * s.s + i * 2) * 0.12; mp[i * 3 + 2] = HZ - 0.3 + Math.sin(a) * (s.r + w * 0.08); }
          mg.attributes.position.needsUpdate = true;
        }
        if (sfx) { const d = eye ? Math.hypot(eye.x - HX, eye.z - HZ) : 99; sfx.buzz(k * Math.max(0, 1 - d / 9) ** 2); }
      },
    };
  })();
  place(yard, 'mailbox', { x: 4.7, z: -26.9, rot: Math.PI, s: 0.33 }); solid(4.45, 4.95, -27.15, -26.65);
  place(yard, 'trash_can', { x: 5.9, z: -26.1, rot: 0.35 }); solid(5.1, 6.7, -26.6, -25.6);
  {   // the speed limit sign a way down the road, for the +x traffic; the reflector posts along the far shoulder
    const c = document.createElement('canvas'); c.width = 128; c.height = 160; const g = c.getContext('2d');
    g.fillStyle = '#e9e6dc'; g.fillRect(0, 0, 128, 160); g.strokeStyle = '#1a1a1a'; g.lineWidth = 5; g.strokeRect(6, 6, 116, 148);
    g.fillStyle = '#1a1a1a'; g.textAlign = 'center'; g.font = 'bold 22px sans-serif'; g.fillText('SPEED', 64, 38); g.fillText('LIMIT', 64, 64); g.font = 'bold 72px sans-serif'; g.fillText('35', 64, 138);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.75), new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, metalness: 0.2, side: THREE.DoubleSide })); sign.position.set(-46, 2.0, -26.0); sign.rotation.y = -Math.PI / 2; yard.add(sign);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.4, 0.06), M.steel); post.position.set(-46.04, 1.2, -26.0); yard.add(post);
    const n = 13, posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 1.1, 0.08), M.white, n), refl = new THREE.InstancedMesh(new THREE.BoxGeometry(0.09, 0.08, 0.05), new THREE.MeshStandardMaterial({ color: 0xff2a1e, emissive: 0x8a0c08, emissiveIntensity: 0.6, roughness: 0.3 }), n), mm = new THREE.Matrix4();
    for (let i = 0; i < n; i++) { const x = -240 + i * 40; mm.makeTranslation(x, 0.55, RZ0 - 0.9); posts.setMatrixAt(i, mm); mm.makeTranslation(x, 0.95, RZ0 - 0.88); refl.setMatrixAt(i, mm); }
    yard.add(posts, refl);
  }
  // puddles on the drive and the road, shown by weather.js once the ground is wet; dry patches in the grass where the summer burnt it
  const puddles = new THREE.Group(); puddles.visible = false; yard.add(puddles);
  {
    const r = TX.rng(313), spots = [[2.1, -17, 1.4, 0.8], [2.9, -23.5, 1.2, 0.7], [-2.4, -27.8, 2.2, 1.1], [-2.0, -11.8, 1.0, 0.8], [14, -29.0, 2.6, 1.0], [-22, -32.2, 3.0, 1.2], [31, -32.6, 2.2, 0.9], [-9.3, -5.2, 1.3, 0.8], [-0.5, -9.6, 1.1, 0.7], [-13.5, -27.6, 1.8, 1.0]];   // clear of the truck
    for (const [x, z, a, b] of spots) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(1, 28), std({ color: 0x0a0d12, roughness: 0.04, metalness: 0.05, transparent: true, opacity: 0, depthWrite: false, envMapIntensity: 1.4 }));
      m.rotation.x = -Math.PI / 2; m.rotation.z = r() * 3; m.scale.set(a, b, 1); m.position.set(x, -0.002, z); m.renderOrder = 2; m.receiveShadow = true; puddles.add(m);
    }
    for (let i = 0; i < 14; i++) {
      const x = -24 + r() * 50, z = -26 + r() * 48, k = 2 + r() * 3.5;
      if ((x > -11 && x < 12 && z > -8 && z < 7) || onDrive(x, z, 1) || (x > -15 && x < -5 && z > -15 && z < -6)) continue;
      const geo = new THREE.CircleGeometry(1, 20); geo.rotateX(-Math.PI / 2); geo.scale(k, 1, k * (0.5 + r() * 0.6)); geo.rotateY(r() * 3); geo.translate(x, -0.016, z); worldUV(geo);
      const m = new THREE.Mesh(geo, M.grassDry); m.receiveShadow = true; yard.add(m);
    }
  }
  // the neighbours' lights, far off across the fields: pinpricks that the fog cannot take, only at night (main.js: farLights.visible)
  const farLights = new THREE.Group(); farLights.visible = false; scene.add(farLights);
  {
    const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,225,170,1)'); gr.addColorStop(0.3, 'rgba(255,210,140,0.5)'); gr.addColorStop(1, 'rgba(255,190,100,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    // the last two are the farmhouse over the fields to the west: a kitchen window and the yard light on its pole
    for (const [x, y, z, s] of [[160, 3.2, -118, 2.2], [185, 2.6, -70, 1.6], [-175, 3.0, -100, 2.0], [-150, 9.5, -140, 1.4], [120, 2.4, -190, 1.2], [-128, 2.0, 44, 1.5], [-121, 6.5, 52, 1.9]]) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, color: s > 1.5 ? 0xffd9a0 : 0xffc880, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0.8 })); sp.scale.set(s, s, 1); sp.position.set(x, y + fieldH(x, z), z); farLights.add(sp);
    }
  }

  // the barn and the silo, out across the field west of the yard, its open front toward the house; the track out to it leaves the drive,
  // goes through the gate in the west fence and follows the ground
  const BARN = { x: -64, z: -12 };
  {
    place(yard, 'barn', { x: BARN.x, y: -0.03, z: BARN.z, rot: Math.PI / 2, s: 0.058 });
    solid(BARN.x - 5.4, BARN.x + 5.4, BARN.z - 7.2, BARN.z + 7.2);
    const SX = -72, SZ = -28;
    const silo = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 11, 24), M.silo); silo.position.set(SX, 5.47, SZ); silo.castShadow = true; yard.add(silo);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(2.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.silo); dome.position.set(SX, 10.97, SZ); yard.add(dome);
    solid(SX - 2.3, SX + 2.3, SZ - 2.3, SZ + 2.3);
    // the track: a strip of dirt with two ruts, draped over the field
    const line = [[-5.6, -13.2], [-9.5, -16.2], [-15, -17.6], [-21, -17.3], [-27, -16], [-36, -15], [-45, -14.1], [-52, -13.2], [-58.2, -12.4]];
    const ribbon = (w, mat, lift, off = 0) => {
      const pts = [];
      for (let i = 0; i < line.length - 1; i++) { const [ax, az] = line[i], [bx, bz] = line[i + 1], n = Math.ceil(Math.hypot(bx - ax, bz - az)); for (let k = 0; k < n; k++) pts.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]); }
      pts.push(line[line.length - 1]);
      const pos = [], uv = [], idx = [];
      pts.forEach(([x, z], i) => {
        const [px, pz] = pts[Math.max(0, i - 1)], [qx, qz] = pts[Math.min(pts.length - 1, i + 1)], L = Math.hypot(qx - px, qz - pz) || 1, nx = -(qz - pz) / L, nz = (qx - px) / L;
        for (const s of [-1, 1]) { const vx = x + nx * (off + s * w / 2), vz = z + nz * (off + s * w / 2); pos.push(vx, -0.03 + fieldH(vx, vz) + lift, vz); uv.push(vx, vz); }
        if (i) { const b = i * 2; idx.push(b - 2, b - 1, b, b - 1, b + 1, b); }
      });
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat); m.receiveShadow = true; yard.add(m);
    };
    ribbon(2.9, M.dirt, 0.012); ribbon(0.36, M.rut, 0.016, -0.78); ribbon(0.36, M.rut, 0.016, 0.78);
    // the gate in the west fence stands open into the field, and the posts that line the track lean the way the wind has pushed them
    const gate = new THREE.Group(); gate.position.set(-27, 0, -17.4); gate.rotation.y = 0.9; yard.add(gate);
    for (const y of [0.3, 0.75, 1.2]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 2.7), M.fence); r.position.set(0, y, 1.35); r.castShadow = true; gate.add(r); }
    { const d = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 2.85), M.fence); d.position.set(0.04, 0.75, 1.35); d.rotation.x = 0.32; gate.add(d); }
    for (const z of [0.05, 2.65]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.45, 0.1), M.fence); p.position.set(0, 0.72, z); gate.add(p); }
    const r = TX.rng(606), posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.13, 1.5, 0.13), M.darkWood, 16), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(); let n = 0;
    for (let i = 1; i < line.length - 1 && n < 16; i++) for (const s of [-1, 1]) {
      const [x, z] = line[i], px = x + 0.5 * (r() - 0.5), pz = z + s * (2.4 + r() * 0.6);
      e.set((r() - 0.5) * 0.3, r() * 6.28, (r() - 0.5) * 0.3); q.setFromEuler(e);
      m4.compose(new THREE.Vector3(px, 0.6 + fieldH(px, pz), pz), q, new THREE.Vector3(1, 1, 1)); posts.setMatrixAt(n++, m4);
    }
    posts.count = n; posts.castShadow = true; yard.add(posts);
  }
  // the fence across the road and down the east side of the next field (instanced posts + rails), on the ground where it rolls
  {
    const posts = []; for (let x = -60; x <= 60; x += 3) posts.push([x, -48]); for (let z = -48; z <= 20; z += 3) posts.push([40, z]);
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 1.3, 0.14), M.fence, posts.length);
    const m4 = new THREE.Matrix4(); posts.forEach(([x, z], i) => { m4.makeTranslation(x, 0.65 + fieldH(x, z), z); im.setMatrixAt(i, m4); }); im.castShadow = true; yard.add(im);
    const rail = (ax, az, bx, bz, y) => {   // a rail between two posts, following the ground
      const L = Math.hypot(bx - ax, bz - az), ya = fieldH(ax, az) + y, yb = fieldH(bx, bz) + y, m = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, Math.hypot(L, yb - ya)), M.fence);
      m.position.set((ax + bx) / 2, (ya + yb) / 2, (az + bz) / 2); m.rotation.y = Math.atan2(bx - ax, bz - az); m.rotation.x = -Math.atan2(yb - ya, L); yard.add(m);
    };
    for (const y of [0.55, 1.1]) { for (let i = 1; i < posts.length; i++) if (posts[i][0] === 40 && posts[i - 1][0] === 40 || posts[i][1] === -48 && posts[i - 1][1] === -48) rail(posts[i - 1][0], posts[i - 1][1], posts[i][0], posts[i][1], y); }
  }
  M.leaves.map = TX.needles(); M.leaves.side = THREE.DoubleSide; M.leaves.color.set(0xd8e8d8); M.leaves.roughness = 0.95;
  // the trees. Every trunk is checked before it goes in: nothing within 1.5 m of the house, the garage, the drive, the road, the truck, the
  // fence, the track or the barn, no canopy over the house, and trunks at least 4 m apart (fir1/fir2: 9.3 m at scale 1, canopy 2.6 m;
  // maple: 20.8 m at scale 1, canopy 9.3 m). All instanced; only the trees near the house cast shadows.
  const HX0 = -8.1, HX1 = SX(8.1), HZ0 = -4.5, HZ1 = SZ(5.1), FX0 = -27, FX1 = 27, FZ0 = -26, FZ1 = 28;
  const trunks = [];
  const treeOk = (x, z, canopy) => {
    const near = (x0, x1, z0, z1, pad) => x > x0 - pad && x < x1 + pad && z > z0 - pad && z < z1 + pad;
    if (near(HX0, HX1, HZ0, HZ1 + 1.6, 1.5 + canopy)) return false;                      // the house and the back stoop, with the canopy clear of the roof
    if (near(PLACES.garage[0], PLACES.garage[1], PLACES.garage[2], PLACES.garage[3], 1.5 + canopy * 0.6)) return false;
    if (onDrive(x, z, 1.5 + canopy * 0.5)) return false;                                  // the drive and the truck on it
    if (near(-8.6, -5.8, -14, -3.9, 1.5)) return false;                                  // the garage apron and the side walk
    if (z < RZ1 + 1.5 + 1.5 && z > RZ0 - 9) return false;                                // the road, its shoulders and the ditch
    if (Math.abs(x - FX0) < 1.5 || Math.abs(x - FX1) < 1.5 || Math.abs(z - FZ1) < 1.5 || Math.abs(z - FZ0) < 1.5) return false;   // the fence lines
    if (x < -27 && x > -70 && z > -22 && z < -8) return false;                             // the track out to the barn
    if (Math.hypot(x - BARN.x, z - BARN.z) < 14) return false;
    for (const [tx, tz] of trunks) if (Math.hypot(x - tx, z - tz) < 4) return false;
    return true;
  };
  let treesRejected = 0;
  {
    const r = TX.rng(777), up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion(), m4 = new THREE.Matrix4(), sc = new THREE.Vector3();
    const at = (x, z, k, rot, lift = 0) => { q.setFromAxisAngle(up, rot); trunks.push([x, z]); return m4.clone().compose(new THREE.Vector3(x, fieldH(x, z) - 0.05 + lift, z), q, sc.set(k, k, k)); };
    const fir = [[], []], bare = [], maple = [];
    const tryFir = (x, z, k) => { if (!treeOk(x, z, 2.6 * k)) { treesRejected++; return false; } fir[r() < 0.5 ? 0 : 1].push(at(x, z, k, r() * 6.28)); return true; };
    // the firs: clumps across the fields, a shelter belt just past the fence, and a treeline all round at the edge of the fog
    const clump = (cx, cz, n, spread, k0 = 1.3, k1 = 2.3) => { for (let i = 0; i < n * 4 && n > 0; i++) if (tryFir(cx + (r() - 0.5) * spread, cz + (r() - 0.5) * spread, k0 + r() * (k1 - k0))) n--; };
    for (const [x, z, n, s] of [[-48, 24, 7, 14], [-70, 38, 9, 18], [52, 30, 8, 16], [60, -8, 6, 14], [-96, -4, 10, 20], [-56, -40, 5, 12], [30, -60, 8, 16], [-20, -62, 7, 16], [72, -52, 6, 14], [-110, 30, 8, 18], [4, 58, 9, 18], [-30, 50, 6, 14]]) clump(x, z, n, s);
    for (const [x, z] of [[-40, 36], [44, 24], [-38, -8], [-44, 14], [50, -2], [-60, 16], [34, 10], [-33, 30]]) tryFir(x, z, 1.8 + r() * 0.5);
    for (let a = 0; a < Math.PI * 2; a += 0.04) {   // the treeline, two deep, broken here and there
      if (r() < 0.12) continue;
      const d = 62 + r() * 30; tryFir(Math.cos(a) * d, -8 + Math.sin(a) * d, 1.6 + r() * 0.9);
    }
    // a few firs inside the fence, in the corners of the yard, and the maples: by the house, along the drive and at the back
    for (const [x, z] of [[-23, 24], [22, 25], [-22, -22], [24, -21], [-24, 8]]) tryFir(x, z, 1.5 + r() * 0.4);
    for (const [x, z, k] of [[-17, 9, 0.62], [19, 12, 0.58], [-19, -5, 0.5], [21, -4, 0.55], [-14, -22, 0.45], [12, 22, 0.6], [-6, 22, 0.52], [8, -22, 0.4], [17, -23, 0.48], [-20, 20, 0.55]]) {
      if (!treeOk(x, z, 9.3 * k)) { treesRejected++; continue; }
      maple.push(at(x, z, k, r() * 6.28));
    }
    for (let i = 0; i < 40 && bare.length < 14; i++) { const a = r() * 6.28, d = 36 + r() * 70, x = 5 + Math.cos(a) * d, z = -10 + Math.sin(a) * d; if (treeOk(x, z, 2)) bare.push(at(x, z, 6 + r() * 3.5, r() * 6.28)); else treesRejected++; }
    // the trees past 32 m are the pack's far models (a quarter of the triangles), cast no shadow and are left out of the ambient occlusion pass
    const near = (m) => Math.hypot(m.elements[12], m.elements[14]) < 32, far = new THREE.Group(); far.userData.noAO = true; yard.add(far);
    for (const [i, name] of [[0, 'fir1'], [1, 'fir2']]) { scatter(yard, name, fir[i].filter(near)); scatter(far, name + '_far', fir[i].filter((m) => !near(m)), { cast: false }); }
    scatter(yard, 'maple', maple);
    scatter(yard, 'tree_bare', bare.filter(near)); scatter(far, 'tree_bare', bare.filter((m) => !near(m)), { cast: false });
    for (const m of [...fir[0], ...fir[1], ...maple, ...bare]) if (Math.hypot(m.elements[12] - 5, m.elements[14] + 15) < 70) solid(m.elements[12] - 0.4, m.elements[12] + 0.4, m.elements[14] - 0.4, m.elements[14] + 0.4);
    // leaves under the maples, lying flat, and a mole hill or two in the lawn
    {
      const lg = new THREE.PlaneGeometry(0.11, 0.09); lg.rotateX(-Math.PI / 2);
      const lm = new THREE.InstancedMesh(lg, std({ color: 0x8a6a3a, roughness: 1, side: THREE.DoubleSide }), maple.length * 60), c = new THREE.Color(); let n = 0;
      for (const m of maple) for (let i = 0; i < 60; i++) {
        const a = r() * 6.28, d = r() * 9.3 * m.elements[0] * 0.7, x = m.elements[12] + Math.cos(a) * d, z = m.elements[14] + Math.sin(a) * d;
        if ((x > HX0 - 0.5 && x < HX1 + 0.5 && z > HZ0 - 0.5 && z < HZ1 + 1.6) || onDrive(x, z, 0.3)) continue;   // not on the house or the drive
        q.setFromAxisAngle(up, r() * 6.28); lm.setMatrixAt(n, m4.compose(new THREE.Vector3(x, fieldH(x, z) + 0.006, z), q, sc.set(0.8 + r() * 0.6, 1, 0.8 + r() * 0.6)));
        lm.setColorAt(n, c.setHSL(0.07 + r() * 0.05, 0.5 + r() * 0.3, 0.3 + r() * 0.2)); n++;
      }
      lm.count = n; lm.receiveShadow = true; yard.add(lm);
      for (const [x, z] of [[-11, 12], [16, -11], [-16, -1]]) { const h = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.dirt); h.scale.y = 0.45; h.position.set(x, -0.01, z); h.castShadow = h.receiveShadow = true; yard.add(h); }
    }
  }
  // ground-cover tufts and rocks (instanced)
  {
    const r = TX.rng(4242), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const ok = (x, z, pad = 0) => !(x > -9.5 - pad && x < SX(8.1) + 1.6 + pad && z > -6.5 - pad && z < SZ(5.1) + 1.2 + pad) && !onDrive(x, z, pad) && !(x > -14.5 - pad && x < -5.5 + pad && z > -14 - pad && z < -6.5 + pad) && !(z < -25.6 - pad && z > -38.5 + pad);   // not on the house, porch path, truck, garage, or the road and its ditch
    const grass = (name, n, rmin, rmax, k0, k1) => {
      const ms = [];
      while (ms.length < n) {
        const a = r() * 6.283, d = rmin + r() * (rmax - rmin), x = 9 + Math.cos(a) * d * 1.6, z = -3 + Math.sin(a) * d;
        if (!ok(x, z, 1.5)) continue;
        const k = k0 + r() * (k1 - k0); q.setFromAxisAngle(up, r() * 6.28); ms.push(m4.clone().compose(new THREE.Vector3(x, -0.02, z), q, sc.set(k, k * (0.8 + r() * 0.5), k)));
      }
      const cells = new Map();   // chunks, so the camera only draws the tufts it can see
      for (const m of ms) { const key = Math.floor(m.elements[12] / 12) + ',' + Math.floor(m.elements[14] / 12); (cells.get(key) || cells.set(key, []).get(key)).push(m); }
      for (const list of cells.values()) scatter(yard, name, list, { cast: false });
    };
    grass('grass2', 1500, 5, 36, 1.0, 2.0); grass('grass1', 260, 6, 32, 0.8, 1.4);
    {   // tall grass out in the field, in drifts, on the rolling ground; chunked in bigger cells since it is only ever seen from a way off
      const ms = [], cells = new Map();
      for (let i = 0; i < 2600 && ms.length < 900; i++) {
        const a = r() * 6.283, d = 34 + r() * 60, x = 2 + Math.cos(a) * d, z = -6 + Math.sin(a) * d;
        if ((z > -42 && z < -22) || (x > -78 && x < -50 && z > -36 && z < 2) || r() > 0.35 + 0.65 * Math.abs(Math.sin(x * 0.07) * Math.cos(z * 0.05))) continue;   // not on the road or the barn's pad, and in drifts
        const k = 1.6 + r() * 1.3; q.setFromAxisAngle(up, r() * 6.28); ms.push(m4.clone().compose(new THREE.Vector3(x, fieldH(x, z) - 0.04, z), q, sc.set(k, k * (0.9 + r() * 0.5), k)));
      }
      for (const m of ms) { const key = Math.floor(m.elements[12] / 24) + ',' + Math.floor(m.elements[14] / 24); (cells.get(key) || cells.set(key, []).get(key)).push(m); }
      for (const list of cells.values()) scatter(yard, 'grass2', list, { cast: false });
    }
    const rocks = [[-25, 7, 1.2], [-17, -10, 1.8], [27, -14, 1.4], [33, 5, 1.0], [14, -23.5, 1.6], [-12.5, -22, 1.1], [22, -20, 0.9]].map(([x, z, k]) => { q.setFromAxisAngle(up, r() * 6.28); return m4.clone().compose(new THREE.Vector3(x, -0.05, z), q, sc.set(k, k * 0.8, k)); });
    scatter(yard, 'rock1', rocks);
    // field stones, none on the lawn round the house and none big enough to read as a boulder by the step
    const small = []; for (let i = 0; i < 40; i++) { const x = -20 + r() * 60, z = -35 + r() * 50; if (!ok(x, z, 2) || (Math.abs(x - 1.6) < 16 && Math.abs(z - 0.1) < 11)) continue; q.setFromAxisAngle(up, r() * 6.28); const k = 0.8 + r() * 1.0; small.push(m4.clone().compose(new THREE.Vector3(x, -0.03, z), q, sc.set(k, k, k))); }
    scatter(yard, 'rock2', small);
  }
  // the lawn: blades of grass in their tens of thousands, instanced in cells so only the ones in view are drawn, bending in the wind in the
  // vertex shader (slow gusts rolling across the yard, a flutter on top), lying down where feet and tyres go and shrinking into the ground
  // past twelve metres so the lawn texture takes over without a line. Thick near the house, thinning toward the fence, clumpy from a noise
  // field, none on the house, the drive, the garage, the walks or under the trees; longer, drier grass just outside the fence.
  const lawn = (() => {
    const r = TX.rng(8080), g = new THREE.Group(); g.userData.noAO = true; yard.add(g);   // blades get no ambient occlusion pass: it costs a draw of all of them and shows nothing
    const hash = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
    const noise = (x, z) => {
      const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
      return (hash(i, j) * (1 - u) + hash(i + 1, j) * u) * (1 - v) + (hash(i, j + 1) * (1 - u) + hash(i + 1, j + 1) * u) * v;
    };
    // one texture: a dozen blades painted on a canvas, overlapping, tapering to a point, dark at the root and paler toward the tip
    const c = document.createElement('canvas'); c.width = 256; c.height = 256; const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 256, 256);
    const blade = (x0, w, lean, h, hue, light) => {
      ctx.beginPath(); ctx.moveTo(x0 - w, 256);
      ctx.bezierCurveTo(x0 - w * 0.7 + lean * 0.2, 256 - h * 0.45, x0 + lean * 0.55 - w * 0.15, 256 - h * 0.85, x0 + lean, 256 - h);
      ctx.bezierCurveTo(x0 + lean * 0.55 + w * 0.15, 256 - h * 0.85, x0 + w * 0.7 + lean * 0.2, 256 - h * 0.45, x0 + w, 256); ctx.closePath();
      const gr = ctx.createLinearGradient(0, 256, 0, 256 - h);
      gr.addColorStop(0, `hsl(${hue + 6}, 38%, ${light - 14}%)`); gr.addColorStop(0.45, `hsl(${hue}, 44%, ${light}%)`); gr.addColorStop(1, `hsl(${hue - 12}, 50%, ${light + 14}%)`);
      ctx.fillStyle = gr; ctx.fill();
    };
    for (let i = 0; i < 22; i++) blade(8 + i * 11 + r() * 8, 2.6 + r() * 2.6, (r() - 0.5) * 60, 110 + r() * 140, 78 + r() * 14, 31 + r() * 9);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.35, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.95, metalness: 0 });
    const time = { value: 0 };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = time;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
        uniform float uTime;
        float lh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float ln(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(lh(i), lh(i + vec2(1, 0)), f.x), mix(lh(i + vec2(0, 1)), lh(i + vec2(1, 1)), f.x), f.y); }`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
        { vec3 root = instanceMatrix[3].xyz; float k = uv.y * uv.y;
          // the wind: a gust field drifting over the yard sets how far each blade leans, a small flutter sits on top; the lean is a fixed
          // direction in the world, so it is turned into the blade's own frame
          float gust = ln(root.xz * 0.045 + vec2(uTime * 0.32, uTime * 0.11)) * 0.7 + ln(root.xz * 0.16 - vec2(uTime * 0.5, 0.0)) * 0.3;
          float flutter = sin(uTime * 2.3 + root.x * 1.7 + root.z * 1.1) * 0.6 + sin(uTime * 3.9 + root.z * 2.3 - root.x) * 0.4;
          float lean = 0.04 + 0.22 * gust * gust + 0.03 * flutter * gust;
          vec3 w = normalize(vec3(0.75, 0.0, 0.55)) * mat3(instanceMatrix);
          transformed.xz += normalize(w.xz) * lean * k; transformed.y -= lean * lean * k * 1.2;
          float d = distance(root, cameraPosition); transformed.y *= 1.0 - smoothstep(12.0, 21.0, d); }`);
    };
    mat.customProgramCacheKey = () => 'lawn2';
    // three crossed cards per cluster, two segments tall so the wind bends the blade and not just its tip
    const card = new THREE.PlaneGeometry(0.42, 0.34, 1, 2); card.translate(0, 0.17, 0);
    const geo = mergeGeometries([card, card.clone().rotateY(Math.PI / 3), card.clone().rotateY(-Math.PI / 3)], false);
    const onLawn = (x, z) => x > FX0 + 0.2 && x < FX1 - 0.2 && z > FZ0 + 0.2 && z < FZ1 - 0.2
      && !(x > HX0 - 0.3 && x < HX1 + 0.3 && z > HZ0 - 0.55 && z < HZ1 + 0.25) && !onDrive(x, z, 0.1) && !(x > 2.5 && x < 3.7 && z > -8 && z < -5.0)
      && !(x > PLACES.garage[0] - 0.25 && x < PLACES.garage[1] + 0.25 && z > PLACES.garage[2] - 0.25 && z < PLACES.garage[3] + 0.25) && !(x > -8.7 && x < -5.9 && z > -14 && z < -3.9)
      && !(x > -7.8 && x < -1.1 && z > 3.5 && z < 6.3) && !(x > 12.0 && x < 14.1 && z > -5.3 && z < 7.3) && !(x > -1.3 && x < 1.3 && z > -5.9 && z < -4.4);   // the stoop and stairwell, the shrubs, the front step
    // where the grass lies flat: the bare patches, the ends of the walk, the gate, and a ring under each tree inside the fence
    const worn = [[3.1, -6.4, 1.6], [-7.3, -4.6, 1.3], [8.2, -12.9, 1.2], [-10.9, -3.4, 1.5], [7.4, -20.5, 1.4], [3.1, -4.9, 1.1], [-16, -16, 1.2]];
    const yardTrunks = trunks.filter(([x, z]) => x > FX0 && x < FX1 && z > FZ0 && z < FZ1);
    const cells = new Map(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), ax = new THREE.Vector3(), col = new THREE.Color();
    let n = 0;
    const put = (x, z, y, k, ky, hue, sat, light) => {
      q.setFromAxisAngle(up, r() * 6.28);
      let flat = 0, fx = 0, fz = 0;   // how far down it is pressed, and which way
      for (const [wx, wz, wr] of worn) { const d = Math.hypot(x - wx, z - wz); if (d < wr) { const f = 1 - d / wr; if (f > flat) { flat = f; fx = x - wx; fz = z - wz; } } }
      if (flat > 0) { ax.set(-fz, 0, fx).normalize(); q2.setFromAxisAngle(ax, -0.5 - 0.9 * flat); q.premultiply(q2); ky *= 1 - 0.45 * flat; }
      const key = Math.floor(x / 14) + ',' + Math.floor(z / 14);
      (cells.get(key) || cells.set(key, []).get(key)).push([m4.clone().compose(new THREE.Vector3(x, y, z), q, sc.set(k, ky, k)), col.clone().setHSL(hue, sat, light)]);
      n++;
    };
    for (let i = 0; i < 600000 && n < 130000; i++) {
      const x = FX0 + r() * (FX1 - FX0), z = FZ0 + r() * (FZ1 - FZ0);
      const cl = noise(x / 4.2 + 3, z / 4.2 + 9), keep = 0.82 + cl * 0.4;   // clumpy, never a grid
      if (r() > keep) continue;
      if (!onLawn(x, z) && !(((x > 1.75 && x < 2.65 && z > -26 && z < -9.6) || (z > -12.2 && z < -11.4 && x > -7.4 && x < 0.7)) && r() < 0.05)) continue;   // a little grass comes up through the gravel between the tracks
      if (yardTrunks.some(([tx, tz]) => Math.hypot(x - tx, z - tz) < 1.5)) continue;
      const k = 0.62 + r() * 0.52, tone = noise(x / 9 + 1, z / 9 + 4);
      put(x, z, -0.012, k, k * (0.4 + r() * 0.3 + tone * 0.14), 0.165 + tone * 0.04 + r() * 0.025, 0.26 + r() * 0.16, 0.6 + r() * 0.18);
    }
    const lawnCount = n;
    // the field grass just outside the fence: longer, drier, sparser, rooted on the rolling ground
    for (let i = 0; i < 160000 && n < lawnCount + 22000; i++) {
      const x = FX0 - 14 + r() * (FX1 - FX0 + 28), z = FZ0 - 2 + r() * (FZ1 - FZ0 + 16);
      if (x > FX0 - 0.6 && x < FX1 + 0.6 && z > FZ0 - 0.6 && z < FZ1 + 0.6) continue;
      if (z < RZ1 + 2.6) continue;
      const edge = Math.min(Math.abs(x - FX0), Math.abs(x - FX1), Math.abs(z - FZ0), Math.abs(z - FZ1)), cl = noise(x / 6 + 11, z / 6 + 2);
      if (r() > (0.3 + cl * 0.7) * (edge < 5 ? 1 : 0.5)) continue;   // thickest along the fence
      if (trunks.some(([tx, tz]) => Math.hypot(x - tx, z - tz) < 1.2)) continue;
      const k = 0.9 + r() * 0.5;
      put(x, z, fieldH(x, z) - 0.04, k, k * (0.95 + r() * 0.6), 0.14 + r() * 0.05, 0.28 + r() * 0.15, 0.62 + r() * 0.2);
    }
    const meshes = [];
    for (const list of cells.values()) {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach(([m, cc], i) => { im.setMatrixAt(i, m); im.setColorAt(i, cc); });
      im.receiveShadow = true; im.computeBoundingSphere(); g.add(im); meshes.push(im);
    }
    // the share of the blades drawn at each graphics preset (the instances in a cell are in random order, so a shorter count thins evenly)
    const SHARE = { ultra: 1, high: 1, medium: 0.55, low: 0.3 }; let quality = 'high';
    const setQuality = (q) => { if (q === quality || !(q in SHARE)) return; quality = q; for (const im of meshes) im.count = Math.round(im.instanceMatrix.count * SHARE[q]); };
    // the worn edges of the drive: gravel that fades into the grass; bare dirt where feet and tyres go; needles and bare ground under the trees
    {
      const ec = document.createElement('canvas'); ec.width = 16; ec.height = 128; const e = ec.getContext('2d'), gr = e.createLinearGradient(0, 0, 0, 128);
      gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.6)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); e.fillStyle = gr; e.fillRect(0, 0, 16, 128);
      const alpha = new THREE.CanvasTexture(ec);
      alpha.repeat.set(1 / 19.2, 1 / 2.2);   // the strips' uvs are in metres, like the drive's; the short ones just repeat a little
      const em = std({ roughness: 1, alphaMap: alpha, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }); applyPBR(em, 'gravel', { tint: 0xe6e2d8, anti: true, flat: 0.92 });
      for (const [cx, cz, len, yaw] of [[0.7 - 1.1, -17.4, 19.2, -Math.PI / 2], [3.9 + 1.1, -18.0, 18.4, Math.PI / 2], [-1.85, -13.4 - 1.1, 5.1, Math.PI], [-1.85, -10.2 + 1.1, 5.1, 0], [-6.0, -13.6 - 1.1, 3.2, Math.PI], [-6.0, -7.0 + 1.1, 3.2, 0]]) {   // the solid edge lies on the drive's edge and fades out into the lawn
        const sg = new THREE.PlaneGeometry(len, 2.2); { const uv = sg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len, uv.getY(i) * 2.2); }
        const strip = new THREE.Mesh(sg, em); strip.rotation.x = -Math.PI / 2; strip.rotation.z = yaw;
        strip.position.set(cx, 0.004, cz); strip.renderOrder = 1; strip.receiveShadow = true; g.add(strip);
      }
      const soft = (name, tint, opacity) => { const m = std({ roughness: 1, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }); applyPBR(m, name, { tint, anti: true, flat: 0.95 }); return m; };
      const pm = soft('dirt', 0xb8a48c, 0.85), nm = soft('dirt', 0x6e5a44, 0.8);
      const disc = (m, x, z, a, b, rot, y = 0.005) => { const p = new THREE.Mesh(new THREE.CircleGeometry(1, 26), m); p.rotation.x = -Math.PI / 2; p.rotation.z = rot; p.scale.set(a, b, 1); p.position.set(x, y, z); p.renderOrder = 1; p.receiveShadow = true; g.add(p); };
      for (const [x, z, a, b, rot] of [[3.1, -6.4, 1.3, 0.8, 0.3], [-7.3, -4.6, 1.0, 0.7, 0.8], [8.2, -12.9, 0.9, 0.7, 1.2], [-10.9, -3.4, 1.2, 0.8, 0.5], [7.4, -20.5, 1.1, 0.7, 0.9], [-16, -16, 0.9, 0.7, 0.2]]) disc(pm, x, z, a, b, rot);
      for (const [x, z] of yardTrunks) disc(nm, x, z, 1.3 + r() * 0.5, 1.1 + r() * 0.5, r() * 3, fieldH(x, z) + 0.006);
    }
    return { group: g, time, count: n, lawnCount, setQuality, get quality() { return quality; } };
  })();
  lawn.group.traverse((o) => { if (o.isInstancedMesh) o.onBeforeRender = () => { lawn.time.value = performance.now() / 1000; }; });
  // invisible yard boundary
  solid(-70, 60, -60, -58); solid(-70, 60, 30, 32); solid(-72, -70, -60, 32); solid(60, 62, -60, 32);

  // sky dressing
  const starGeo = new THREE.BufferGeometry(); const sp = [];
  { const r = TX.rng(5); for (let i = 0; i < 1200; i++) { const u = r(), v = r() * 0.9 + 0.08, th = u * Math.PI * 2, ph = Math.acos(1 - v); sp.push(Math.cos(th) * Math.sin(ph) * 300, Math.cos(ph) * 300, Math.sin(th) * Math.sin(ph) * 300); } }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xcfd8ff, size: 1.4, sizeAttenuation: false, fog: false }));
  scene.add(stars);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(8, 24, 16), new THREE.MeshBasicMaterial({ color: 0xdfe6ff, fog: false }));
  moon.position.set(-140, 120, 150); scene.add(moon);

  // global lights
  const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x5a4a35, 1.2); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dc, 3);
  sun.position.set(40, 45, -30); sun.target.position.set(0, 0, 0);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 140 });
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.025; sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  scene.userData.shadowLights = [{ light: sun, sun: true }, { light: bathSpot, sun: false }];

  // ---------- the stretch: the house drawn on the plan is mapped by SX/SZ ----------
  // Pieces drawn in place (meshes with no transform of their own) have their vertices mapped, so walls, floors, counters and
  // built-ins grow with their rooms and world-metre textures are laid again. Anything placed (a model, a group, a lamp, a knob) keeps
  // its size and moves with its spot. The garage and everything else outside the footprint are left alone.
  {
    const inWarp = (x, z) => z > -6 && x > -9 && x < 14;
    const warpGeo = (geo) => {
      const p = geo.attributes.position; if (!p) return;
      for (let i = 0; i < p.count; i++) p.setXYZ(i, SX(p.getX(i)), p.getY(i), SZ(p.getZ(i)));
      p.needsUpdate = true; if (geo.userData.worldUV) worldUV(geo); geo.computeBoundingBox(); geo.computeBoundingSphere();
    };
    const still = (o) => o.position.x === 0 && o.position.y === 0 && o.position.z === 0 && o.rotation.x === 0 && o.rotation.y === 0 && o.rotation.z === 0;
    const bb = new THREE.Box3(), mid = new THREE.Vector3();
    const warp = (o) => {
      if (o.userData.noWarp) return;
      if (still(o)) {
        if (o.isMesh && o.geometry) { o.geometry.computeBoundingBox(); o.geometry.boundingBox.getCenter(mid); if (inWarp(mid.x, mid.z)) warpGeo(o.geometry); }
        for (const c of o.children) warp(c);
        return;
      }
      if (!inWarp(o.position.x, o.position.z)) return;
      const st = o.userData.stretch; if (st === 'x') o.scale.x *= SX.scale(o.position.x); else if (st === 'z') o.scale.z *= SZ.scale(o.position.z);
      o.position.x = SX(o.position.x); o.position.z = SZ(o.position.z);
    };
    for (const o of house.children) warp(o);
    house.updateMatrixWorld(true);
    for (const c of colliders.slice(0, houseColliders)) {
      if (!inWarp((c.minX + c.maxX) / 2, (c.minZ + c.maxZ) / 2)) continue;
      if (c.fixed) { const w = c.maxX - c.minX, d = c.maxZ - c.minZ, cx = SX((c.minX + c.maxX) / 2), cz = SZ((c.minZ + c.maxZ) / 2); c.minX = cx - w / 2; c.maxX = cx + w / 2; c.minZ = cz - d / 2; c.maxZ = cz + d / 2; }
      else { c.minX = SX(c.minX); c.maxX = SX(c.maxX); c.minZ = SZ(c.minZ); c.maxZ = SZ(c.maxZ); }
    }
    for (const f of fixups) f();
    for (const [alongX, fixed, gp] of lateArches) archFill(alongX, fixed, gp);
    for (const n of nightLights) n.light.getWorldPosition(n.pos);
  }

  // ---------- merge the static geometry: hundreds of little boxes become a few dozen meshes (one per material and 6 m cell) ----------
  {
    const mergeable = new Set(Object.values(M).filter((m) => !m.transparent && m !== M.lamp));
    const skip = new Set([...Object.values(tagged).flat(), drawingMesh, ...pickups]);
    const mergeInto = (root) => {
      const buckets = new Map(), old = [], v = new THREE.Vector3();
      for (const m of [...root.children]) {
        if (!m.isMesh || m.isInstancedMesh || skip.has(m) || m.renderOrder !== 0 || m.userData.keep) continue;
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        if (!mats.every((x) => mergeable.has(x))) continue;
        m.updateMatrix();
        let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
        g.applyMatrix4(m.matrix);
        for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        g.computeBoundingBox(); g.boundingBox.getCenter(v);
        const cell = Math.floor(v.x / 6) + ',' + Math.floor(v.z / 6), flags = (m.castShadow ? 1 : 0) + (m.receiveShadow ? 2 : 0);
        const parts = Array.isArray(m.material) && g.groups.length ? g.groups : [{ start: 0, count: g.attributes.position.count, materialIndex: 0 }];
        for (const pt of parts) {
          let sub = g;
          if (parts.length > 1 || Array.isArray(m.material)) {   // one geometry per face group, each with its own material
            sub = new THREE.BufferGeometry();
            for (const name of ['position', 'normal', 'uv']) { const a = g.attributes[name]; sub.setAttribute(name, new THREE.BufferAttribute(a.array.slice(pt.start * a.itemSize, (pt.start + pt.count) * a.itemSize), a.itemSize)); }
          }
          const mat = mats[pt.materialIndex || 0], key = mat.uuid + '|' + flags + '|' + cell;
          (buckets.get(key) || buckets.set(key, { mat, flags, list: [] }).get(key)).list.push(sub);
        }
        old.push(m);
      }
      for (const m of old) { root.remove(m); m.geometry.dispose(); }
      for (const { mat, flags, list } of buckets.values()) {
        const mesh = new THREE.Mesh(mergeGeometries(list, false), mat); mesh.castShadow = !!(flags & 1); mesh.receiveShadow = !!(flags & 2); root.add(mesh);
        list.forEach((g) => g.dispose());
      }
    };
    mergeInto(house); mergeInto(yard);
  }

  return {
    colliders, T, M, house, yard, bulbs, nightLights, faceLight, carLight, fills, bathSpot, porchLight, porchBulb,
    hemi, sun, stars, moon, frontDoor, pickups, dropSpots, drawingMesh, drawingMat, BUNK, bathSink, cardboardBox,
    doors, setDoor, tick, setDoorHook: (f) => { doorHook = f; }, parentsBed, bedSleepers, tvFx, phone, mirrorFx,
    get hallFrame() { return hallFrame; }, chairs, moveChair: (i, x, z, rot) => { const c = chairs[i]; if (c) { c.holder.position.x = x; c.holder.position.z = z; if (rot !== undefined) c.holder.rotation.y = rot; } },
    get teddy() { return teddy; }, moveTeddy: (x, y, z) => { if (teddy) teddy.setDown(x, y, z, { facing: teddy.rotation.y, settle: false }); },
    curtainSee: (on) => { M.showerCurtain.opacity = on ? 0.38 : 1; M.showerCurtain.depthWrite = !on; },
    proof,
    groundAt, PLACES, STAIR, BASEMENT, garage, breaker, laundry, office, spare,
    streetLight, puddles, wetMats, farLights, clock, TRUCK, lawn, treesRejected,
  };
}
