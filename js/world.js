// Builds the farmhouse, the yard, the truck, the barn and all lights.
import * as THREE from 'three';
import * as TX from './textures.js';
import { applyPBR } from './pbr.js';
import { place, scatter } from './props.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const H = 2.7;      // ceiling height
export const WT = 0.16;    // wall thickness

// Room rectangles [minX, maxX, minZ, maxZ], measured to the middle of the walls. The house is a 1,500 sq ft rambler: seen from the
// front (the road, z = -6.5) the viewer's left is +x, so YOUR room (back-right, as on the sketch) is the -x, +z corner. A narrow hall runs down the middle.
export const ROOMS = {
  bed: [-4.8, -0.6, 1.7, 5.5],      // YOURS: back-right, right above the bathroom (bunk, white closet, box TV)
  room2: [0.6, 4.8, -1.8, 1.7],     // second bedroom, middle-left
  hall: [-0.6, 0.6, -1.8, 5.5],
  bath: [-3.0, -0.6, -1.8, 1.7],    // right side, across the hall from the second bedroom
  storage: [-4.8, -3.0, -1.8, 1.7],
  parents: [0.6, 4.8, 1.7, 5.5],    // back-left: your parents' room
  kitchen: [-4.8, -0.6, -4.6, -1.8],
  entry: [-4.8, -0.6, -6.5, -4.6],  // utility entry with the front door
  living: [-0.6, 4.8, -6.5, -1.8],  // front-left, big picture window
};
const FP = [-4.8, 4.8, -6.5, 5.5]; // house footprint

export function roomAt(x, z) {
  for (const k in ROOMS) { const r = ROOMS[k]; if (x > r[0] && x < r[1] && z > r[2] && z < r[3]) return k; }
  if (x > FP[0] && x < FP[1] && z > FP[2] && z < FP[3]) return 'void';
  return 'out';
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

  const T = {
    wood: TX.woodFloor(), wall: TX.wallpaper(), kid: TX.kidWallpaper(), plaster: TX.plaster(), tile: TX.tile(),
    siding: TX.siding(), grass: TX.grass(), dirt: TX.dirt(), shingles: TX.shingles(), barn: TX.barnBoards(),
    plaid: TX.plaid(), rug: TX.rug(), runner: TX.runner(), mattress: TX.mattress(),
    drawing0: TX.drawing(0), drawing1: TX.drawing(1), paint0: TX.painting(0), paint1: TX.painting(1), paint2: TX.painting(2), paint3: TX.painting(3), paint4: TX.painting(4),
    floralA: TX.floral('#cdaaa3', '#a4505f', '#6d8461', 41), floralB: TX.floral('#9fb7ab', '#d98c8c', '#496b5c', 52), floralC: TX.floral('#8d5a60', '#d6b0a0', '#4d6a50', 63),
    borderRose: TX.border('#a4505f', '#6d8461', '#eadfc8'), borderTeal: TX.border('#d98c8c', '#496b5c', '#e4efe8'), borderBlue: TX.border('#5b7fb0', '#c9a24a', '#ece6d4'),
    winDay: TX.windowTex('day'), winNight: TX.windowTex('night'), winMorning: TX.windowTex('morning'),
  };
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const M = {
    floor: std({ map: T.wood, roughness: 0.72 }),
    wall: std({ map: T.wall, roughness: 0.93 }),
    kid: std({ map: T.kid, roughness: 0.93 }),
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
    door: std({ color: 0x5f4d3e, roughness: 0.7 }),
    doorInset: std({ color: 0x4d3d30, roughness: 0.75 }),
    porcelain: std({ color: 0xe6e4dd, roughness: 0.2 }),
    metal: std({ color: 0x9a9a9a, roughness: 0.3, metalness: 0.85 }),
    black: std({ color: 0x111111, roughness: 0.5 }),
    couch: std({ color: 0x5b4a3a, roughness: 1 }),
    curtain: std({ color: 0x7a3a32, roughness: 1, side: THREE.DoubleSide }),
    mattress: std({ map: T.mattress, roughness: 1 }),
    plaid: std({ map: T.plaid, roughness: 1 }),
    pillow: std({ color: 0xe8e2d6, roughness: 1 }),
    rug: std({ map: T.rug, roughness: 1 }),
    runner: std({ map: T.runner, roughness: 1 }),
    concrete: std({ color: 0x77736b, roughness: 1 }),
    truck: std({ color: 0xe8e6e0, roughness: 0.5 }),
    truckCab: std({ color: 0xa1342a, roughness: 0.45 }), garageDoor: std({ color: 0xcfc9b8, roughness: 0.6 }),
    tire: std({ color: 0x151515, roughness: 0.9 }),
    glassOut: std({ color: 0x1a222c, roughness: 0.08, metalness: 0.6 }),
    trunk: std({ color: 0x3b2c20, roughness: 1 }),
    leaves: std({ color: 0x1f3322, roughness: 1 }),
    silo: std({ color: 0x8c9294, roughness: 0.6, metalness: 0.4 }),
    fence: std({ color: 0x6b5d4c, roughness: 1 }),
    counter: std({ color: 0xb9b2a0, roughness: 0.4 }),
    cabinet: std({ color: 0x7c8a78, roughness: 0.7 }),
    fridge: std({ color: 0xd8d3c2, roughness: 0.35 }),
    crt: std({ color: 0x2a2a28, roughness: 0.6 }),
    crtScreen: std({ color: 0x1c2420, roughness: 0.1, metalness: 0.3 }),
    mirror: std({ color: 0x9aa0a4, roughness: 0.08, metalness: 1 }),
    lamp: std({ color: 0xf2e6c8, emissive: 0xffd9a0, emissiveIntensity: 0, roughness: 0.6 }),
    // 2002: dark brown carpet everywhere, white doors, plain white cabinets and appliances, oak and brass
    carpet: std({ color: 0x4a3526, roughness: 1 }), lino: std({ color: 0xd6cbae, roughness: 0.45 }), slate: std({ color: 0x5c5a56, roughness: 0.7 }), bathFloor: std({ color: 0xd8bfc2, roughness: 0.3 }),
    brick: std({ color: 0xa0553f, roughness: 0.95 }), panel: std({ color: 0xc89a64, roughness: 0.7 }), butter: std({ color: 0xe6d28c, roughness: 0.92 }),
    floralA: std({ map: T.floralA, roughness: 0.92 }), floralB: std({ map: T.floralB, roughness: 0.92 }), floralC: std({ map: T.floralC, roughness: 0.92 }), hallpaper: std({ map: T.wall, roughness: 0.92 }),
    borderRose: std({ map: T.borderRose, roughness: 0.8 }), borderTeal: std({ map: T.borderTeal, roughness: 0.8 }), borderBlue: std({ map: T.borderBlue, roughness: 0.8 }),
    doorW: std({ color: 0xece8de, roughness: 0.5 }), doorInsetW: std({ color: 0xdcd7ca, roughness: 0.6 }), barnDoor: std({ color: 0x4a3828, roughness: 0.7 }),
    cabW: std({ color: 0xe9e6dc, roughness: 0.42 }), cabLine: std({ color: 0xc9c5b8, roughness: 0.6 }), appW: std({ color: 0xf1efe9, roughness: 0.28 }),
    brass: std({ color: 0xc9a14a, roughness: 0.28, metalness: 0.9 }), oak: std({ color: 0x9c6b3c, roughness: 0.55 }), heater: std({ color: 0xe6e2d6, roughness: 0.5 }),
    steelSink: std({ color: 0xc9cccf, roughness: 0.25, metalness: 1 }), carpetLid: std({ color: 0x8e4a5c, roughness: 1 }),
    showerCurtain: std({ map: T.floralB, roughness: 0.85, side: THREE.DoubleSide }), valance: std({ map: T.floralA, roughness: 0.95, side: THREE.DoubleSide }),
  };
  M.curtain.map = T.floralC; M.curtain.color.set(0xffffff);
  for (const k of ['carpet', 'lino', 'slate', 'bathFloor', 'brick', 'panel', 'butter', 'oak', 'cabW', 'borderRose', 'borderTeal', 'borderBlue']) M[k].userData.worldUV = true;
  for (const k of ['furn', 'darkWood', 'door', 'doorInset', 'fence', 'concrete', 'plaid', 'mattress', 'pillow', 'roof', 'silo']) M[k].userData.worldUV = true;
  // real PBR surfaces (they replace the canvas textures as they load)
  applyPBR(M.floor, 'floor');
  applyPBR(M.hallpaper, 'wall', { normal: 1.1, keepMap: true });
  applyPBR(M.kid, 'wall', { normal: 1.1, keepMap: true });
  for (const k of ['floralA', 'floralB', 'floralC']) applyPBR(M[k], 'wall', { normal: 1.1, keepMap: true });
  applyPBR(M.butter, 'wall', { tint: 0xe6d28c, normal: 1.0 });
  applyPBR(M.panel, 'panel', { normal: 1.0 });
  applyPBR(M.carpet, 'carpet', { normal: 1.4 });
  applyPBR(M.lino, 'tile', { tint: 0xd8ccb0, tile: 0.5 });
  applyPBR(M.bathFloor, 'tile', { tint: 0xd8b8bd, tile: 0.3 });
  applyPBR(M.slate, 'concrete', { tint: 0x66625c });
  applyPBR(M.brick, 'concrete', { tint: 0xb4604a, tile: 1.2 });
  applyPBR(M.oak, 'pine', { tint: 0xa8743f });
  applyPBR(M.plaster, 'ceiling', { tint: 0xdcd6c8, normal: 1.0 });
  applyPBR(M.tile, 'tile');
  applyPBR(M.siding, 'siding', { tint: 0x9a7552, normal: 1.1 });
  applyPBR(M.grass, 'grass', { anti: true, tile: 2.4, flat: 0.95 });
  applyPBR(M.dirt, 'dirt', { anti: true, flat: 0.95 });
  applyPBR(M.roof, 'roof', { tint: 0xcfcfcf, anti: { scale: 0.08, strength: 0.18 } });
  applyPBR(M.barn, 'darkwood', { tint: 0xa44a3a });
  applyPBR(M.concrete, 'concrete');
  applyPBR(M.fence, 'darkwood', { tint: 0xc8bba8 });
  applyPBR(M.furn, 'pine', { tint: 0x9a7556 });
  applyPBR(M.darkWood, 'darkwood', { tint: 0xa89888 });
  applyPBR(M.door, 'pine', { tint: 0x7a5e48 });
  applyPBR(M.doorInset, 'pine', { tint: 0x6a5240 });
  applyPBR(M.plaid, 'plaid', { rough: 1 });
  applyPBR(M.mattress, 'linen', { tint: 0xe8e2d4 });
  applyPBR(M.pillow, 'linen', { tint: 0xf2eee4 });
  applyPBR(M.silo, 'metal', { tint: 0xb8bcc0, anti: true });
  M.gable = std({ map: T.siding, side: THREE.DoubleSide, roughness: 0.86 }); applyPBR(M.gable, 'siding', { tint: 0x9a7552, normal: 1.1 });
  const winMat = new THREE.MeshBasicMaterial({ map: T.winDay });

  const house = new THREE.Group(); scene.add(house);
  const yard = new THREE.Group(); scene.add(yard);

  const WALLMAT = { bed: 'kid', hall: 'hallpaper', living: 'floralA', room2: 'floralB', parents: 'floralC', kitchen: 'butter', entry: 'plaster', bath: 'panel', storage: 'plaster' };
  function wallMatAt(px, pz) {
    const r = roomAt(px, pz);
    return r === 'out' ? M.siding : r === 'void' ? M.plaster : M[WALLMAT[r]] || M.wall;
  }


  // stand-in furniture is tagged so it can be hidden when its real model arrives
  let curTag = null; const tagged = {};
  const tagStart = (k) => { curTag = tagged[k] = tagged[k] || []; }, tagEnd = () => { curTag = null; };

  // Axis-aligned box from bounds. mat: material | array | 'room' (sample rooms per face)
  function box(minX, maxX, minY, maxY, minZ, maxZ, mat, o = {}) {
    const geo = new THREE.BoxGeometry(maxX - minX, maxY - minY, maxZ - minZ);
    geo.translate((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
    if (o.uv !== false || (mat && mat.userData && mat.userData.worldUV)) worldUV(geo);
    let m = mat;
    if (mat === 'room') {
      const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2, e = 0.12;
      m = [wallMatAt(maxX + e, cz), wallMatAt(minX - e, cz), M.plaster, M.plaster, wallMatAt(cx, maxZ + e), wallMatAt(cx, minZ - e)];
    }
    const mesh = new THREE.Mesh(geo, m);
    mesh.castShadow = o.cast !== false; mesh.receiveShadow = true;
    (o.parent || house).add(mesh);
    if (curTag) curTag.push(mesh);
    return mesh;
  }

  // Box with rounded edges (the fixtures: they catch the light like real ones). Same bounds as box().
  function rbox(x0, x1, y0, y1, z0, z1, mat, r = 0.02, o = {}) {
    const geo = new RoundedBoxGeometry(x1 - x0, y1 - y0, z1 - z0, 3, Math.min(r, (x1 - x0) / 2.01, (y1 - y0) / 2.01, (z1 - z0) / 2.01));
    geo.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    if (mat && mat.userData && mat.userData.worldUV) worldUV(geo);
    const m = new THREE.Mesh(geo, mat); m.castShadow = o.cast !== false; m.receiveShadow = true; (o.parent || house).add(m); return m;
  }
  // ---------- walls ----------
  const BORDER = { living: 'borderRose', room2: 'borderTeal', parents: 'borderRose', kitchen: 'borderBlue', bed: 'borderBlue' };
  const cutsX = [...new Set(Object.values(ROOMS).flatMap((r) => [r[0], r[1]]))], cutsZ = [...new Set(Object.values(ROOMS).flatMap((r) => [r[2], r[3]]))];
  function trims(b, alongX) {
    for (const s of [1, -1]) {
      const cx = (b[0] + b[1]) / 2, cz = (b[4] + b[5]) / 2;
      const room = alongX ? roomAt(cx, cz + s * 0.3) : roomAt(cx + s * 0.3, cz);
      if (room === 'out' || room === 'void') continue;
      const strip = (y0, y1, th, mat = M.trim) => {
        if (alongX) { const f = s > 0 ? b[5] : b[4]; box(b[0], b[1], y0, y1, Math.min(f, f + s * th), Math.max(f, f + s * th), mat, { uv: mat !== M.trim }); }
        else { const f = s > 0 ? b[1] : b[0]; box(Math.min(f, f + s * th), Math.max(f, f + s * th), y0, y1, b[4], b[5], mat, { uv: mat !== M.trim }); }
      };
      strip(0, 0.11, 0.022);
      if (room !== 'bath' && b[3] > 0.95) strip(0.9, 0.95, 0.018);   // chair rail (not on the short wall under a window)
      if (BORDER[room] && b[3] > 2.3) strip(2.0, 2.2, 0.008, M[BORDER[room]]);   // wallpaper border near the ceiling
    }
  }
  function casing(alongX, fixed, gp) {
    // The trim sits 1.2 cm proud of the jamb and the lintel: flush faces would z-fight the wall and flicker as you move.
    const top = gp.top ?? 2.1, t = WT / 2 + 0.025, a = gp.c - gp.w / 2, b = gp.c + gp.w / 2, cw = 0.08, e = 0.012;
    if (alongX) {
      box(a - cw, a + e, 0, top - e, fixed - t, fixed + t, M.white, { uv: false });
      box(b - e, b + cw, 0, top - e, fixed - t, fixed + t, M.white, { uv: false });
      if (!gp.arch) box(a - cw, b + cw, top - e, top + 0.09, fixed - t, fixed + t, M.white, { uv: false });
    } else {
      box(fixed - t, fixed + t, 0, top - e, a - cw, a + e, M.white, { uv: false });
      box(fixed - t, fixed + t, 0, top - e, b - e, b + cw, M.white, { uv: false });
      if (!gp.arch) box(fixed - t, fixed + t, top - e, top + 0.09, a - cw, b + cw, M.white, { uv: false });
    }
  }
  // the arch between kitchen and living room: wall above a half-round opening, with a trim band around it
  function archFill(alongX, fixed, gp) {
    const r = gp.w / 2, sp = gp.top;   // springing line
    const spandrel = new THREE.Shape(); spandrel.moveTo(-r, sp); spandrel.absarc(0, sp, r, Math.PI, 0, true); spandrel.lineTo(r, H); spandrel.lineTo(-r, H); spandrel.closePath();
    const band = new THREE.Shape(); band.absarc(0, 0, r + 0.08, 0, Math.PI, false); band.absarc(0, 0, r, Math.PI, 0, true);
    const place = (geo, off, mat) => {
      const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true;
      if (alongX) m.position.set(gp.c, 0, fixed + off); else { m.rotation.y = -Math.PI / 2; m.position.set(fixed - off, 0, gp.c); }
      house.add(m); return m;
    };
    for (const side of [-1, 1]) {   // each half takes its own room's finish
      const probe = alongX ? roomAt(gp.c, fixed + side * 0.3) : roomAt(fixed + side * 0.3, gp.c);
      const mat = M[WALLMAT[probe]] || M.wall;
      const g = new THREE.ExtrudeGeometry(spandrel, { depth: WT / 2, bevelEnabled: false, curveSegments: 20 });
      place(g, side < 0 ? -WT / 2 : 0, mat);
    }
    const bg = new THREE.ExtrudeGeometry(band, { depth: WT + 0.05, bevelEnabled: false, curveSegments: 20 }); bg.translate(0, sp, 0);
    place(bg, -WT / 2 - 0.025, M.white);
  }
  function wall(x1, z1, x2, z2, gaps = []) {
    const alongX = z1 === z2;
    const a0 = alongX ? Math.min(x1, x2) : Math.min(z1, z2), a1 = alongX ? Math.max(x1, x2) : Math.max(z1, z2);
    const fixed = alongX ? z1 : x1;
    const segs = []; let cur = a0;
    for (const gp of [...gaps].sort((p, q) => p.c - q.c)) {
      const g0 = gp.c - gp.w / 2, g1 = gp.c + gp.w / 2;
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
      if (y0 === 0) { solid(b[0], b[1], b[4], b[5]); trims(b, alongX); }
    }
    for (const gp of gaps) {
      if (gp.arch) { archFill(alongX, fixed, gp); casing(alongX, fixed, gp); }
      else if (gp.sill === undefined) casing(alongX, fixed, gp);
      else {   // nothing may walk out through a window
        const a = gp.c - gp.w / 2, b = gp.c + gp.w / 2;
        if (alongX) solid(a, b, fixed - WT / 2, fixed + WT / 2); else solid(fixed - WT / 2, fixed + WT / 2, a, b);
      }
    }
  }

  // exterior shell. Seen from the front (the road side, z = -6.5): the viewer's left is +x. Your room is the back-right corner.
  wall(-4.8, -6.5, 4.8, -6.5, [{ c: -2.7, w: 1.1 }, { c: 2.9, w: 2.4, sill: 0.55, h: 1.35 }]);                       // front: door, picture window
  wall(-4.8, 5.5, 4.8, 5.5, [{ c: -2.7, w: 1.2, sill: 0.85, h: 1.25 }, { c: 2.7, w: 1.1, sill: 0.85, h: 1.25 }]);    // back: your room (right), parents' room
  wall(4.8, -6.5, 4.8, 5.5, [{ c: -4.3, w: 1.2, sill: 0.85, h: 1.25 }, { c: 0.2, w: 1.1, sill: 0.85, h: 1.25 }, { c: 3.0, w: 1.0, sill: 0.85, h: 1.25 }]);   // left side
  wall(-4.8, -6.5, -4.8, 5.5, [{ c: -3.2, w: 1.1, sill: 1.0, h: 0.9 }, { c: 3.6, w: 1.2, sill: 0.85, h: 1.25 }]);    // right side: kitchen, your room
  // the hallway: a narrow strip down the middle, from the living room to the back wall
  wall(0.6, -1.8, 0.6, 5.5, [{ c: 0.4, w: 0.9, top: 2.05 }, { c: 3.3, w: 0.9, top: 2.05 }]);     // doors: second bedroom, yours
  wall(-0.6, -1.8, -0.6, 5.5, [{ c: -0.2, w: 0.9, top: 2.05 }, { c: 3.0, w: 0.9, top: 2.05 }]);  // doors: bathroom, yours
  wall(0.6, 1.7, 4.8, 1.7);
  wall(0.6, -1.8, 4.8, -1.8);
  wall(-4.8, -1.8, -0.6, -1.8);
  wall(-4.8, 1.7, -0.6, 1.7, [{ c: -3.9, w: 0.8, top: 2.05 }]);
  wall(-3.0, -1.8, -3.0, 1.7);
  wall(-0.6, -6.5, -0.6, -1.8, [{ c: -5.6, w: 1.0, top: 2.05 }, { c: -2.9, w: 1.4, top: 1.85, arch: true }]);   // entry doorway; the arch into the kitchen
  wall(-4.8, -4.6, -0.6, -4.6, [{ c: -2.7, w: 1.1, top: 2.05 }]);                                              // utility entry to kitchen (barn door)

  // floors & ceiling: dark brown carpet through the whole house except the wet rooms
  const FLOORMAT = { bath: M.bathFloor, kitchen: M.lino, entry: M.slate };
  for (const k in ROOMS) { const r = ROOMS[k]; box(r[0], r[1], -0.1, 0, r[2], r[3], FLOORMAT[k] || M.carpet, { cast: false }); }
  box(-4.9, 4.9, H, H + 0.1, -6.6, 5.6, M.plaster);

  // foundation strip outside
  box(-4.95, 4.95, -0.05, 0.28, -6.7, -6.58, M.concrete, { uv: false });
  box(-4.95, 4.95, -0.05, 0.28, 5.58, 5.7, M.concrete, { uv: false });
  box(-4.95, -4.83, -0.05, 0.28, -6.7, 5.7, M.concrete, { uv: false });
  box(4.83, 4.95, -0.05, 0.28, -6.7, 5.7, M.concrete, { uv: false });

  // roof (low gable, ridge along x at z = -0.5), with a brick chimney on the front slope
  {
    const half = 6.7, rise = 1.7, L = Math.hypot(half, rise), a = Math.atan2(rise, half);
    for (const s of [-1, 1]) {
      const geo = new THREE.BoxGeometry(11.6, 0.14, L); worldUV(geo);
      const m = new THREE.Mesh(geo, M.roof); m.castShadow = m.receiveShadow = true;
      m.position.set(0, H + 0.1 + rise / 2, -0.5 + s * half / 2); m.rotation.x = s * a;
      house.add(m);
    }
    const peak = H + 0.1 + rise * (6.1 / half);
    const shape = new THREE.Shape([new THREE.Vector2(6.6, H + 0.1), new THREE.Vector2(-5.6, H + 0.1), new THREE.Vector2(0.5, peak)]);
    for (const x of [-4.88, 4.88]) {
      const g = new THREE.ShapeGeometry(shape); g.rotateY(Math.PI / 2);
      const m = new THREE.Mesh(g, M.gable);
      m.position.x = x; m.castShadow = true; house.add(m);
    }
    box(1.5, 2.5, 2.5, 5.2, -3.7, -2.9, M.brick);
    box(1.4, 2.6, 5.2, 5.3, -3.8, -2.8, M.concrete, { uv: false });
  }


  // ---------- windows ----------
  const glass = std({ color: 0xffffff, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.14, side: THREE.DoubleSide, envMapIntensity: 1.5 });
  function windowAt(alongX, fixed, c, insideSign, { sill = 0.85, w = 1.0, h = 1.25, curtains = false, real = false } = {}) {
    const cy = sill + h / 2;
    if (real) {   // one pane in the opening: you see the actual yard, and the sun comes through
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.02, h + 0.02), glass);
      if (alongX) pane.position.set(c, cy, fixed); else { pane.position.set(fixed, cy, c); pane.rotation.y = Math.PI / 2; }
      pane.userData.noAO = true; pane.renderOrder = 2; house.add(pane);
    }
    for (const side of [insideSign, -insideSign]) {
      if (!real) {
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), side === insideSign ? winMat : M.glassOut);
        const off = fixed + side * (WT / 2 + 0.006);
        if (alongX) { plane.position.set(c, cy, off); if (side < 0) plane.rotation.y = Math.PI; }
        else { plane.position.set(off, cy, c); plane.rotation.y = side * Math.PI / 2; }
        house.add(plane);
      }
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
  windowAt(true, -6.5, 2.9, 1, { sill: 0.55, w: 2.4, h: 1.35, curtains: true, real: true });
  windowAt(true, 5.5, 2.7, -1, { w: 1.1, curtains: true, real: true });          // parents' room, back wall
  windowAt(true, 5.5, -2.7, -1, { w: 1.2, curtains: true, real: true });         // your room, back wall (behind the top bunk)
  windowAt(false, 4.8, -4.3, -1, { w: 1.2, curtains: true, real: true });        // living room
  windowAt(false, 4.8, 0.2, -1, { w: 1.1, curtains: true, real: true });         // second bedroom
  windowAt(false, 4.8, 3.0, -1, { w: 1.0, curtains: true, real: true });         // parents' room, side wall
  windowAt(false, -4.8, -3.2, 1, { sill: 1.0, w: 1.1, h: 0.9, curtains: true, real: true });   // kitchen, over the sink
  windowAt(false, -4.8, 3.6, 1, { w: 1.2, curtains: true, real: true });         // your room, side window

  // ---------- doors (white six-panel, like the photos) ----------
  // the leaf hangs from a hinge at (hx, hz) and extends along dir; closed doors fill the gap, open ones stand against it
  function door(hx, hz, dx, dz, { open = false } = {}) {
    const g = new THREE.Group(); g.position.set(hx, 0, hz); g.rotation.y = Math.atan2(-dz, dx);
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.04, 0.04), M.doorW); leaf.position.set(0.45, 1.02, 0); leaf.castShadow = leaf.receiveShadow = true; g.add(leaf);
    for (const s of [-1, 1]) for (const [px, w] of [[0.24, 0.3], [0.64, 0.3]]) for (const [py, h] of [[1.62, 0.42], [1.12, 0.42], [0.4, 0.62]]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.008), M.doorW); p.position.set(px, py + 0.1, s * 0.021); g.add(p);
      const ins = new THREE.Mesh(new THREE.BoxGeometry(w - 0.07, h - 0.07, 0.004), M.doorInsetW); ins.position.set(px, py + 0.1, s * 0.0235); g.add(ins);
    }
    for (const s of [-1, 1]) { const k = new THREE.Mesh(new THREE.SphereGeometry(0.032, 12, 8), M.brass); k.position.set(0.8, 1.0, s * 0.05); g.add(k); }
    house.add(g); return g;
  }
  // closed doors: second bedroom, parents' room, the storage closet
  door(0.6, 0.4 - 0.45, 0, 1); solid(0.56, 0.64, -0.05, 0.85);
  door(0.6, 2.85, 0, 1); solid(0.56, 0.64, 2.85, 3.75);   // parents' room
  door(-4.3, 1.7, 1, 0); solid(-4.3, -3.4, 1.66, 1.74);
  // yours (open, into your room, hinged on the far side) and the bathroom (open, into the bathroom)
  door(-0.6, 2.55, -1, 0); solid(-1.5, -0.6, 2.53, 2.57);
  door(-0.6, -0.65, -1, 0); solid(-1.5, -0.6, -0.67, -0.63);
  // the barn-style door between the utility entry and the kitchen, slid open
  {
    const bd = box(-2.2, -1.0, 0.05, 2.1, -4.46, -4.41, M.barnDoor, { uv: false });
    box(-3.5, -0.8, 2.12, 2.17, -4.47, -4.4, M.black, { uv: false });
    for (const x of [-1.9, -1.3]) box(x - 0.03, x + 0.03, 2.05, 2.15, -4.47, -4.4, M.black, { uv: false });
    box(-2.2, -1.0, 0.9, 0.95, -4.41, -4.39, M.black, { uv: false });
  }

  // front door (open in the day, shut at night)
  const frontPivot = new THREE.Group(); frontPivot.position.set(-3.25, 0, -6.5 + WT / 2); house.add(frontPivot);
  {
    const d = new THREE.Mesh(new THREE.BoxGeometry(1.08, 2.08, 0.05), M.door); d.position.set(0.54, 1.04, 0.0); d.castShadow = true; frontPivot.add(d);
    const lite = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.06), M.glassOut); lite.position.set(0.54, 1.45, 0); frontPivot.add(lite);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), M.brass); knob.position.set(0.98, 1.0, 0.05); frontPivot.add(knob);
  }
  const frontCollider = solid(-3.3, -2.1, -6.6, -6.4, { on: false });
  const frontDoor = {
    setOpen(o) { frontPivot.rotation.y = o ? -1.5 : 0; frontCollider.on = !o; },
  };

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
  function frameZ(zc, y, x, w, h, tex, face) {   // picture on a wall that runs along z (face +1 looks toward +x)
    const xf = x + face * (WT / 2);
    box(Math.min(xf, xf + face * 0.03), Math.max(xf, xf + face * 0.03), y - h / 2 - 0.05, y + h / 2 + 0.05, zc - w / 2 - 0.05, zc + w / 2 + 0.05, M.darkWood, { uv: false });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), std({ map: tex, roughness: 0.6 }));
    p.position.set(xf + face * 0.032, y, zc); p.rotation.y = face > 0 ? Math.PI / 2 : -Math.PI / 2; house.add(p);
  }
  function frameX(xc, y, z, w, h, tex, face) {   // ...along x
    const zf = z + face * (WT / 2);
    box(xc - w / 2 - 0.05, xc + w / 2 + 0.05, y - h / 2 - 0.05, y + h / 2 + 0.05, Math.min(zf, zf + face * 0.03), Math.max(zf, zf + face * 0.03), M.darkWood, { uv: false });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), std({ map: tex, roughness: 0.6 }));
    p.position.set(xc, y, zf + face * 0.032); if (face < 0) p.rotation.y = Math.PI; house.add(p);
  }

  // ---------- your room (back-right): the bunk, the white built-in closet ----------
  const BUNK = { x0: -4.6, x1: -2.5, z0: 3.95, z1: 4.9 };
  {
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
    solid(x0 - 0.05, x1 + 0.08, z0 - 0.05, z1 + 0.05);
  }
  // the white built-in closet and drawers on the hall wall, like the photo: louvered bifold doors, drawers, a shelf unit above
  {
    const wh = M.cabW, x0 = -1.32, x1 = -0.68, z0 = 3.5, z1 = 5.4, xf = x0 - 0.025;
    rbox(x0, x1, 0, 2.4, z0, z1, wh, 0.01);
    box(x0 - 0.03, x1, 2.38, 2.43, z0, z1, M.white, { uv: false });
    for (let i = 0; i < 3; i++) {   // three bifold leaves with louvres
      const a = 4.2 + i * 0.4; rbox(xf, x0, 0.05, 2.15, a + 0.01, a + 0.39, wh, 0.004);
      for (let y = 0.2; y < 2.05; y += 0.065) box(xf - 0.005, xf, y, y + 0.012, a + 0.05, a + 0.35, M.cabLine, { uv: false, cast: false });
      const kn = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), M.brass); kn.position.set(xf - 0.015, 1.05, a + (i % 2 ? 0.05 : 0.35)); house.add(kn);
    }
    for (let i = 0; i < 4; i++) {   // drawers, a cubby over them
      const y = 0.08 + i * 0.3; rbox(xf, x0, y, y + 0.27, z0 + 0.04, 4.16, wh, 0.006);
      const kn = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), M.brass); kn.position.set(xf - 0.02, y + 0.135, (z0 + 4.16) / 2); house.add(kn);
    }
    rbox(xf, x0, 1.35, 2.15, z0 + 0.04, 4.16, M.cabLine, 0.006);
    solid(x0 - 0.05, x1 + 0.1, z0 - 0.03, z1 + 0.03);
  }
  // your parents' room: a double bed under the back window, a dresser
  {
    rbox(1.9, 3.5, 0, 0.5, 3.4, 5.4, M.oak, 0.02); rbox(1.95, 3.45, 0.4, 0.66, 3.45, 5.35, M.mattress, 0.04);
    rbox(1.95, 3.45, 0.62, 0.7, 3.6, 5.35, M.floralB, 0.02); rbox(1.85, 3.55, 0.3, 1.25, 5.33, 5.42, M.oak, 0.02);
    rbox(2.0, 2.6, 0.66, 0.78, 5.0, 5.3, M.pillow, 0.04); rbox(2.8, 3.4, 0.66, 0.78, 5.0, 5.3, M.pillow, 0.04);
    solid(1.85, 3.55, 3.35, 5.45);
    rbox(3.4, 4.7, 0, 0.9, 1.78, 2.3, M.oak, 0.015); solid(3.35, 4.75, 1.7, 2.35); knick(4.05, 0.9, 2.05, 4, 0.9);
    heater(0.7, 0.78, 0.1, 1.95, 2.8);
  }
  let teddy = null;
  {
    const bear = new THREE.Group(); const fur = std({ color: 0x7a5232, roughness: 1 });
    const s = (r, x, y, z) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), fur); m.position.set(x, y, z); m.castShadow = true; bear.add(m); };
    s(0.11, 0, 0.11, 0); s(0.08, 0, 0.27, 0.01); s(0.03, -0.06, 0.34, 0); s(0.03, 0.06, 0.34, 0); s(0.035, -0.1, 0.06, 0.06); s(0.035, 0.1, 0.06, 0.06);
    const eye = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.2 });
    for (const x of [-0.025, 0.025]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), eye); e.position.set(x, 0.29, 0.08); bear.add(e); }
    bear.position.set(1.0, 0.0, 4.3); bear.rotation.y = 2.7; bear.position.set(-3.9, 0.55, 4.4); house.add(bear); teddy = bear;
  }
  {
    const rugM = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.012, 48), M.rug); rugM.scale.set(1.2, 1, 1); rugM.position.set(-2.9, 0.006, 3.0); rugM.receiveShadow = true; house.add(rugM);
    rbox(4.15, 4.68, 0, 0.55, 4.8, 5.35, M.oak, 0.01);   // bedside table in the parents' room
    knick(4.4, 0.55, 5.1, 3, 0.3, 'z');
  }

  // ---------- hallway (narrow; brown carpet, a gallery of family photos) ----------
  {
    const F = [T.paint2, T.paint4, T.paint3, T.paint1];
    frameZ(1.5, 1.55, 0.6, 0.34, 0.34, F[0], -1); frameZ(2.35, 1.5, 0.6, 0.3, 0.3, F[1], -1); frameZ(-1.1, 1.6, 0.6, 0.4, 0.4, F[2], -1); frameZ(4.55, 1.6, 0.6, 0.34, 0.34, F[1], -1);
    frameZ(1.95, 1.55, -0.6, 0.34, 0.34, F[2], 1); frameZ(2.3, 1.42, -0.6, 0.2, 0.2, F[0], 1); frameZ(4.6, 1.55, -0.6, 0.4, 0.4, F[3], 1); frameZ(-1.1, 1.6, -0.6, 0.4, 0.4, F[1], 1);
    wreath(0, 1.55, 5.41, Math.PI);
    shelf(-0.45, 0.45, 1.95, 5.2, 5.4); knick(0, 1.975, 5.31, 4, 0.7);
  }
  // crayon drawing taped to the hall wall at kid height
  const drawingMat = new THREE.MeshStandardMaterial({ map: T.drawing0, roughness: 0.9 });
  const drawingMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.345), drawingMat);
  drawingMesh.position.set(-0.6 + WT / 2 + 0.004, 1.08, 1.2); drawingMesh.rotation.set(0, Math.PI / 2, 0.04); house.add(drawingMesh);
  const tape = std({ color: 0xe8e0b8, roughness: 0.6, transparent: true, opacity: 0.8 });
  for (const [dx, dy] of [[-0.2, 0.16], [0.2, 0.16]]) { const t = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.03), tape); t.position.set(-0.6 + WT / 2 + 0.006, 1.08 + dy, 1.2 - dx); t.rotation.y = Math.PI / 2; house.add(t); }

  // ---------- bathroom (60 in tub, pink tile floor, wood-panel walls) ----------
  const bathSink = new THREE.Vector3(-2.72, 0.95, 0.35);
  {
    const porc = new THREE.MeshPhysicalMaterial({ color: 0xe9e7df, roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.06 });
    const chrome = std({ color: 0xdfe2e4, roughness: 0.12, metalness: 1 });
    const cyl = (r, h, mat, x, y, z, rx = 0, rz = 0, parent = house) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 16), mat); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); m.castShadow = true; parent.add(m); return m; };
    // tub along the front wall (north), 1.52 m long, with a floral shower curtain
    {
      const rr = (w, d, r) => { const sh = new THREE.Shape(); sh.moveTo(-w / 2 + r, -d / 2); sh.lineTo(w / 2 - r, -d / 2); sh.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r); sh.lineTo(w / 2, d / 2 - r); sh.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2); sh.lineTo(-w / 2 + r, d / 2); sh.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r); sh.lineTo(-w / 2, -d / 2 + r); sh.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2); return sh; };
      const shape = rr(1.52, 0.76, 0.12), hole = rr(1.26, 0.5, 0.17); shape.holes.push(hole);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 3, curveSegments: 8 });
      geo.rotateX(-Math.PI / 2); const tub = new THREE.Mesh(geo, porc); tub.position.set(-1.85, 0.06, -1.37); tub.castShadow = tub.receiveShadow = true; house.add(tub);
      rbox(-2.55, -1.15, 0.16, 0.22, -1.62, -1.12, porc, 0.02);
      cyl(0.018, 0.17, chrome, -2.4, 0.82, -1.72, Math.PI / 2); cyl(0.03, 0.03, chrome, -2.55, 0.8, -1.76, Math.PI / 2); cyl(0.03, 0.03, chrome, -2.25, 0.8, -1.76, Math.PI / 2);
      // tile surround and the curtain
      box(-2.61, -1.09, 0.5, 1.8, -1.88, -1.84, M.tile, { uv: true });
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.55, 8), chrome); rod.rotation.z = Math.PI / 2; rod.position.set(-1.85, 1.85, -0.99); house.add(rod);
      const cur = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.4, 14, 1), M.showerCurtain);
      const pos = cur.geometry.attributes.position; for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 18) * 0.03); cur.geometry.computeVertexNormals();
      cur.position.set(-1.85, 1.12, -0.99); cur.castShadow = true; house.add(cur);
    }
    solid(-2.65, -1.05, -1.88, -0.9);
    // toilet against the south wall
    {
      const t = new THREE.Group(); t.position.set(-1.7, 0, 1.2); t.rotation.y = -Math.PI / 2; house.add(t);
      cyl(0.1, 0.4, porc, -0.12, 0.2, 0, 0, 0, t);
      const bowl = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), porc); bowl.scale.set(0.27, 0.17, 0.2); bowl.position.set(-0.1, 0.43, 0); bowl.castShadow = true; t.add(bowl);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.03, 8, 28), M.carpetLid); ring.rotation.x = Math.PI / 2; ring.scale.set(1.4, 1, 1); ring.position.set(-0.1, 0.52, 0); t.add(ring);
      const lid = cyl(0.19, 0.022, M.carpetLid, -0.1, 0.545, 0, 0, 0, t); lid.scale.set(1.4, 1, 1);
      rbox(0.14, 0.42, 0.45, 0.88, -0.26, 0.26, porc, 0.03, { parent: t });
      cyl(0.022, 0.02, chrome, 0.28, 0.9, 0, 0, 0, t);
    }
    solid(-2.0, -1.4, 0.95, 1.7);
    // pedestal sink on the west wall, with a medicine cabinet mirror
    {
      const sk = new THREE.Group(); sk.position.set(-2.92, 0, 0.35); sk.rotation.y = -Math.PI / 2; house.add(sk);   // local +z points at the wall
      cyl(0.075, 0.74, porc, 0, 0.37, 0, 0, 0, sk);
      rbox(-0.28, 0.28, 0.74, 0.9, -0.28, 0.18, porc, 0.06, { parent: sk }); rbox(-0.2, 0.2, 0.885, 0.905, -0.2, 0.14, std({ color: 0xd8d6cd, roughness: 0.1 }), 0.05, { parent: sk });
      cyl(0.016, 0.1, chrome, 0, 0.95, 0.12, 0, 0, sk); cyl(0.014, 0.13, chrome, 0, 1.0, 0.06, Math.PI / 2, 0, sk); cyl(0.022, 0.02, chrome, -0.1, 0.915, 0.12, 0, 0, sk); cyl(0.022, 0.02, chrome, 0.1, 0.915, 0.12, 0, 0, sk);
      rbox(-0.44, 0.44, 1.2, 2.0, 0.16, 0.19, M.oak, 0.01, { parent: sk });
      box(-0.4, 0.4, 1.25, 1.95, 0.175, 0.2, M.mirror, { uv: false, parent: sk });
    }
    solid(-3.0, -2.6, -0.05, 0.75);
    // towel bar, tissue holder, a fuzzy mat
    cyl(0.01, 0.6, chrome, -1.3, 1.1, 1.55, 0, Math.PI / 2); knick(-2.6, 0.9, 0.35, 0, 0);
    const mat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.8), std({ color: 0x8e4a5c, roughness: 1 })); mat.position.set(-1.6, 0.01, -0.1); mat.receiveShadow = true; house.add(mat);
    const mat2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.3), std({ color: 0x8e4a5c, roughness: 1 })); mat2.position.set(-1.7, 0.01, 0.7); house.add(mat2);
  }

  // ---------- living room: big picture window, floral sofa, box TV ----------
  tagStart('couch');
  box(2.1, 3.9, 0, 0.45, -2.9, -2.1, M.couch, { uv: false });
  box(2.1, 3.9, 0.45, 0.95, -2.9, -2.65, M.couch, { uv: false });
  tagEnd();
  const cCouch = solid(2.05, 3.95, -2.95, -2.05);
  tagStart('coffee'); box(2.4, 3.6, 0, 0.42, -4.75, -4.15, M.oak, { uv: false }); tagEnd();
  const cCoffee = solid(2.35, 3.65, -4.8, -4.1);
  tagStart('tv');
  box(0.35, 1.55, 0, 0.55, -6.38, -5.82, M.oak, { uv: false });
  box(0.4, 1.5, 0.55, 1.2, -6.35, -5.85, M.crt, { uv: false });
  tagEnd();
  const cTv = solid(0.3, 1.6, -6.42, -5.8);
  // curio shelves and wall plates on the arch wall and the front wall
  shelf(-0.45, -0.1, 1.45, -5.0, -3.7); knick(-0.28, 1.475, -4.35, 5, 1.1, 'z');
  shelf(-0.45, -0.1, 1.05, -5.0, -3.7); knick(-0.28, 1.075, -4.35, 4, 1.1, 'z');
  plate(-0.508, 1.8, -4.0, Math.PI / 2, 0.12, 0x4a6fa8); plate(-0.508, 1.8, -4.7, Math.PI / 2, 0.12, 0xa84a5a);
  plate(0.2, 1.95, -6.41, 0, 0.13, 0x4a8a6a); plate(1.7, 1.95, -6.41, 0, 0.13, 0xa84a5a);
  wreath(4.71, 1.55, -2.2, -Math.PI / 2);
  heater(0.7, 3.2, 0.1, -1.95, -1.87); heater(4.62, 4.7, 0.1, -3.6, -2.4);
  // a little table with a doily by the sofa
  rbox(4.1, 4.65, 0, 0.55, -1.95, -1.45, M.oak, 0.01); solid(4.05, 4.7, -2.0, -1.4); knick(4.38, 0.55, -1.7, 3, 0.3, 'z');

  // ---------- kitchen: plain white cabinets and appliances, laminate counters, a round table by the arch ----------
  {
    const steel = M.brass;   // the handles are brass
    const run = (x0, x1, z0, z1, along) => {   // base cabinets with doors and counter; along: which axis it runs (doors face the room)
      rbox(x0, x1, 0, 0.9, z0, z1, M.cabW, 0.012);
      rbox(x0 - 0.02, x1 + 0.02, 0.9, 0.95, z0 - 0.02, z1 + 0.02, M.counter, 0.01);
    };
    // west run (under the window): sink cabinet
    run(-4.8, -4.18, -3.9, -2.45);
    for (let z = -3.9; z < -2.5; z += 0.7) { rbox(-4.183, -4.16, 0.07, 0.86, z + 0.012, z + 0.688, M.cabW, 0.006); rbox(-4.15, -4.12, 0.5, 0.65, z + 0.6, z + 0.62, steel, 0.004); }
    rbox(-4.7, -4.3, 0.945, 0.965, -3.55, -2.85, M.steelSink, 0.03); rbox(-4.66, -4.34, 0.95, 0.968, -3.5, -2.9, M.black, 0.03);
    { const tap = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.28, 12), M.steelSink); tap.position.set(-4.74, 1.1, -3.2); house.add(tap); const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.18, 12), M.steelSink); sp.rotation.z = Math.PI / 2; sp.position.set(-4.65, 1.23, -3.2); house.add(sp); }
    solid(-4.82, -4.15, -3.95, -2.4);
    // fridge in the corner (white, top freezer)
    rbox(-4.75, -4.1, 0.04, 1.75, -4.55, -3.9, M.appW, 0.04); rbox(-4.108, -4.095, 1.15, 1.17, -4.55, -3.9, M.black, 0.004);
    rbox(-4.1, -4.07, 1.25, 1.65, -4.5, -4.47, M.brass, 0.01); rbox(-4.1, -4.07, 0.5, 1.0, -4.5, -4.47, M.brass, 0.01);
    solid(-4.8, -4.05, -4.58, -3.88);
    // north run: corner cabinets, a white stove, dishwasher, cabinets; upper cabinets
    run(-4.18, -3.5, -2.48, -1.88); run(-3.0, -2.4, -2.48, -1.88); run(-2.4, -0.8, -2.48, -1.88);
    solid(-4.2, -0.75, -2.5, -1.85);
    for (const [a, b] of [[-4.18, -3.5], [-2.4, -0.8]]) { const n = Math.max(1, Math.round((b - a) / 0.58)), w = (b - a) / n; for (let i = 0; i < n; i++) { const x = a + i * w; rbox(x + 0.012, x + w - 0.012, 0.07, 0.86, -2.5, -2.48, M.cabW, 0.006); rbox(x + w - 0.1, x + w - 0.08, 0.5, 0.78, -2.52, -2.5, steel, 0.004); } }
    // stove
    rbox(-3.5, -3.0, 0, 0.92, -2.48, -1.88, M.appW, 0.015); rbox(-3.48, -3.02, 0.92, 0.935, -2.46, -1.9, M.black, 0.01);
    for (const [bx, bz] of [[-3.38, -2.34], [-3.12, -2.34], [-3.38, -2.04], [-3.12, -2.04]]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.012, 20), std({ color: 0x151513, roughness: 0.5 })); b.position.set(bx, 0.944, bz); house.add(b); }
    rbox(-3.47, -3.03, 0.15, 0.8, -2.5, -2.485, M.appW, 0.01); rbox(-3.45, -3.05, 0.35, 0.7, -2.52, -2.5, M.black, 0.01);
    rbox(-3.45, -3.05, 0.78, 0.8, -2.54, -2.5, M.brass, 0.005);
    solid(-3.52, -2.98, -2.5, -1.85);
    // dishwasher (white, next to the stove)
    rbox(-2.99, -2.41, 0.06, 0.86, -2.5, -2.48, M.appW, 0.01); rbox(-2.95, -2.45, 0.78, 0.82, -2.53, -2.5, M.brass, 0.005);
    // uppers
    for (const [a, b] of [[-4.18, -3.0], [-2.4, -0.9]]) { const n = Math.max(1, Math.round((b - a) / 0.58)), w = (b - a) / n; rbox(a, b, 1.5, 2.3, -2.2, -1.88, M.cabW, 0.012); for (let i = 0; i < n; i++) { const x = a + i * w; rbox(x + 0.012, x + w - 0.012, 1.53, 2.27, -2.222, -2.2, M.cabW, 0.006); rbox(x + w - 0.1, x + w - 0.08, 1.55, 1.78, -2.24, -2.222, steel, 0.004); } }
    box(-4.18, -0.9, 0.95, 1.5, -1.9, -1.89, M.lino, { uv: true });   // backsplash
    // microwave on the counter
    rbox(-1.75, -1.15, 0.95, 1.25, -2.4, -1.95, M.appW, 0.02); rbox(-1.7, -1.4, 1.0, 1.2, -2.402, -2.38, M.black, 0.008);
    // 90s touches: a tea kettle, a cookie jar, a rooster
    knick(-1.5, 0.95, -1.7, 0, 0); knick(-4.5, 0.95, -2.6, 3, 0.3, 'z');
    plate(-1.0, 1.4, -1.89, 0, 0.14, 0x4a6fa8); plate(-1.4, 1.4, -1.89, 0, 0.14, 0xa84a5a);
    heater(-4.78, -4.7, 0.1, -2.4, -2.05);
  }
  tagStart('dining');
  box(-2.6, -1.4, 0.7, 0.75, -4.1, -2.9, M.oak, { uv: false });
  tagEnd();
  const cDining = solid(-2.55, -1.45, -4.05, -2.95);

  // ---------- utility entry: slate floor, brick pillar, washer and dryer, a bench with coats ----------
  {
    box(-1.45, -0.95, 0, 1.0, -5.55, -5.05, M.brick, { uv: true }); box(-1.5, -0.9, 1.0, 1.06, -5.6, -5.0, M.concrete, { uv: false });
    solid(-1.5, -0.9, -5.6, -5.0);
    rbox(-4.75, -4.1, 0, 0.9, -6.3, -5.65, M.appW, 0.02); rbox(-4.75, -4.1, 0, 0.9, -5.6, -4.95, M.appW, 0.02);
    for (const z of [-5.975, -5.275]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.03, 24), M.glassOut); w.rotation.z = Math.PI / 2; w.position.set(-4.095, 0.5, z); house.add(w); }
    rbox(-4.75, -4.1, 0.9, 0.93, -6.3, -4.95, M.appW, 0.01);
    solid(-4.8, -4.05, -6.35, -4.9);
    // coat hooks on the right-hand wall and a row of shoes
    box(-4.72, -4.68, 1.6, 1.68, -6.1, -5.4, M.oak, { uv: false });
    for (const z of [-6.0, -5.75, -5.5]) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.3), std({ color: [0x3a4a6a, 0x6a3a3a, 0x4a5a3a][(rnd() * 3) | 0], roughness: 1 })); c.position.set(-4.58, 1.25, z); house.add(c); }
    // the step up/down at the doorway
    box(-3.35, -2.05, 0, 0.0, -6.5, -6.2, M.concrete, { uv: false });
  }

  // ---------- your room, the TV corner: a box TV on an oak stand, a VHS shelf ----------
  {
    rbox(-3.45, -1.95, 0, 0.55, 1.8, 2.35, M.oak, 0.015);
    rbox(-3.3, -2.1, 0.55, 1.2, 1.85, 2.3, M.crt, 0.03);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.52), M.crtScreen); scr.position.set(-2.7, 0.9, 2.305); house.add(scr);
    rbox(-1.8, -1.2, 0, 1.4, 1.8, 2.2, M.oak, 0.015);   // VHS and game shelf
    for (let y = 0.3; y < 1.4; y += 0.28) box(-1.78, -1.22, y, y + 0.02, 1.82, 2.18, M.darkWood, { uv: false });
    knick(-1.5, 1.4, 2.0, 3, 0.4);
    solid(-3.5, -1.15, 1.75, 2.4);
    heater(-4.78, -4.7, 0.1, 2.5, 3.3); knick(-4.5, 0.0, 4.5, 0, 0);
    plate(-4.71, 1.8, 2.3, Math.PI / 2, 0.13, 0xa84a5a); plate(-4.71, 1.8, 2.7, Math.PI / 2, 0.13, 0x4a6fa8);
  }
  // moving boxes around the house
  const boxTex = [TX.cardboard('KITCHEN', 3), TX.cardboard('BOOKS', 4), TX.cardboard('MISC', 5), TX.cardboard('KIDS ROOM', 6)];
  const boxMats = boxTex.map((t) => std({ map: t, roughness: 0.9 }));
  const cardboardBox = (x, y, z, w = 0.5, h = 0.44, d = 0.5, mi = 0, rot = 0, parent = house) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), boxMats[mi]); m.position.set(x, y + h / 2, z); m.rotation.y = rot; m.castShadow = m.receiveShadow = true; parent.add(m); return m;
  };
  cardboardBox(3.3, 0, 0.6, 0.55, 0.45, 0.55, 0, 0.5); solid(2.95, 3.65, 0.25, 0.95);   // second bedroom
  cardboardBox(-3.4, 0.55, 4.4, 0.55, 0.4, 0.5, 2, 0.1, house);   // on the bottom bunk
  cardboardBox(-2.85, 0.55, 4.45, 0.4, 0.34, 0.5, 1, -0.2, house);

  // ---------- real furniture: each model replaces its stand-in (and collider) as it loads ----------
  const PI = Math.PI;
  const prop = (name, o, { tag, old = [], box: sb, after } = {}) => place(house, name, {
    ...o, hide: tag ? tagged[tag] || [] : [],
    onLoad: () => { old.forEach((c) => { c.on = false; }); if (sb) solid(...sb); if (after) after(); },
  });
  // living room
  prop('table', { x: 0.95, z: -6.1, rot: 0 }, { tag: 'tv', old: [cTv], box: [0.3, 1.6, -6.42, -5.78] });
  prop('tv', { x: 0.95, y: 0.55, z: -6.1, rot: 0 });
  prop('sofa', { x: 3.0, z: -2.55, rot: PI }, { tag: 'couch', old: [cCouch], box: [2.1, 3.9, -2.9, -2.2] });
  prop('armchair', { x: 4.1, z: -5.0, rot: -2.0 }, { box: [3.65, 4.55, -5.4, -4.6] });
  prop('table', { x: 3.0, z: -4.45, rot: 0 }, { tag: 'coffee', old: [cCoffee], box: [2.1, 3.9, -4.8, -4.1] });
  prop('cabinet', { x: 4.4, z: -3.05, rot: -PI / 2 }, { box: [4.0, 4.78, -3.75, -2.35] });
  prop('plant1', { x: 4.35, z: -6.05 }, { box: [4.05, 4.65, -6.35, -5.75] });
  prop('plant2', { x: 0.18, z: -2.15 }, { box: [-0.1, 0.5, -2.45, -1.85] });
  prop('clock_wall', { x: -0.51, y: 1.74, z: -4.35, rot: PI / 2 });
  frameX(3.0, 1.55, -1.8, 0.7, 0.7, T.paint3, -1); frameX(1.1, 1.75, -6.5, 0.5, 0.5, T.paint2, 1);
  // kitchen: round table (the chairs are placed around it)
  {
    const cx = -2.0, cz = -3.5;
    prop('table_round', { x: cx, z: cz, s: 0.77 }, { tag: 'dining', old: [cDining], box: [cx - 0.55, cx + 0.55, cz - 0.55, cz + 0.55] });
    for (const [dx, dz, r] of [[-0.9, 0, PI / 2], [0.9, 0, -PI / 2], [0, -0.9, 0], [0, 0.9, PI]]) prop('chair', { x: cx + dx, z: cz + dz, rot: r }, { tag: 'dining' });
    prop('kettle', { x: -3.4, y: 0.95, z: -2.2, rot: 0 });
    prop('pot', { x: -3.1, y: 0.95, z: -2.2, rot: 0 });
  }
  // your room
  prop('plant1', { x: -4.45, z: 2.1 }, { box: [-4.75, -4.15, 1.8, 2.4] });
  frameX(1.1, 1.4, 5.5, 0.4, 0.4, T.paint4, -1);
  prop('lamp', { x: 4.4, y: 0.55, z: 5.1 });   // parents' bedside

  // ---------- light fixtures ----------
  const bulbs = {};
  const fixture = (name, x, z, intensity = 9) => {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.lamp.clone());
    dome.rotation.x = Math.PI; dome.position.set(x, H - 0.005, z); house.add(dome);
    // a downward cone from under the shade (so the ceiling right above it isn't blown out) plus a faint bounce for the ceiling and upper walls
    const spot = new THREE.SpotLight(0xffd29a, 0, 11, 1.3, 1.0, 2); spot.position.set(x, H - 0.3, z); spot.target.position.set(x, 0, z);
    const bounce = new THREE.PointLight(0xffd29a, 0, 7, 2); bounce.position.set(x, H - 0.9, z);
    scene.add(spot, spot.target, bounce);
    // (visibility only changes with the story phase: a changing number of lights recompiles every shader)
    const L = { get intensity() { return spot.intensity / 1.5; }, set intensity(v) { spot.intensity = v * 1.5; bounce.intensity = v * 0.22; }, set visible(v) { spot.visible = bounce.visible = v; } };
    bulbs[name] = { light: L, dome, base: intensity };
  };
  fixture('bed', -2.7, 3.4); fixture('hall1', 0, 0.0); fixture('hall2', 0, 3.7); fixture('bath', -1.8, 0.0, 7);
  fixture('living', 2.0, -4.2, 10); fixture('kitchen', -2.6, -3.4, 10);

  // ---------- outlets, and a few green plug-in night lights (the only light you get at night) ----------
  const outletMat = std({ color: 0xe4ded0, roughness: 0.5 }), holeMat = std({ color: 0x14140f, roughness: 0.9 }), nlBody = std({ color: 0xe9e4d4, roughness: 0.45 });
  const nightLights = [];
  // (px, pz) on the wall's inner face, (nx, nz) pointing into the room, y = height of the outlet; lit = a night light is plugged into it
  function outlet(px, y, pz, nx, nz, lit) {
    const g = new THREE.Group(); g.position.set(px, y, pz); g.rotation.y = Math.atan2(nx, nz);   // local +Z points into the room
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.12, 0.01), outletMat); plate.position.z = 0.005; g.add(plate);
    for (const dy of [0.028, -0.028]) for (const dx of [-0.011, 0.011]) { const h = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.016, 0.004), holeMat); h.position.set(dx, dy, 0.011); g.add(h); }
    house.add(g);
    if (!lit) return;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.064, 0.09, 0.034), nlBody); body.position.set(0, -0.026, 0.027); body.castShadow = true; g.add(body);
    const mat = new THREE.MeshStandardMaterial({ color: 0x163a20, emissive: 0x40ff72, emissiveIntensity: 0, roughness: 0.35 });
    const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.046, 0.052), mat); lens.position.set(0, -0.018, 0.0445); g.add(lens);
    const light = new THREE.PointLight(0x55ff88, 0, 5, 2); light.position.set(0, -0.02, 0.2); g.add(light);
    const pos = new THREE.Vector3(); g.updateMatrixWorld(true); light.getWorldPosition(pos);
    nightLights.push({ light, mat, base: 0.9, pos });
  }
  // inner faces: hall walls at x = +/-0.52, bedroom wall x = 0.68
  outlet(0.52, 0.33, 2.2, -1, 0, true);       // hall, by your door
  outlet(-0.52, 0.35, 0.95, 1, 0, true);      // hall, under the drawing
  outlet(-0.52, 0.33, 4.5, 1, 0, true);       // hall, toward the back wall
  outlet(-0.68, 0.32, 2.2, -1, 0, true);      // your room, by the door
  outlet(-1.0, 0.34, 1.62, 0, -1, true);      // bathroom
  outlet(-0.52, 0.34, -4.1, 1, 0, true);      // living room, on the arch wall
  for (const [x, y, z, nx, nz] of [[1.5, 0.33, -1.88, 0, -1], [4.72, 0.4, 3.9, -1, 0], [3.5, 0.3, 5.42, 0, -1], [-1.2, 1.05, -1.88, 0, -1]]) outlet(x, y, z, nx, nz, false);

  // for the night event: the face's glow, and a passing car's headlights (a shadow-casting spot, so the light only comes in through the windows)
  const faceLight = new THREE.PointLight(0xdce6ff, 0, 20, 2); faceLight.visible = false; scene.add(faceLight);
  const carLight = new THREE.SpotLight(0xfff2d6, 0, 48, 0.3, 0.55, 1.5); carLight.visible = false;
  carLight.castShadow = true; carLight.shadow.mapSize.set(1024, 1024); carLight.shadow.camera.near = 1; carLight.shadow.camera.far = 48; carLight.shadow.bias = -0.0006; carLight.shadow.autoUpdate = false;
  carLight.position.set(34, 0.8, -30); scene.add(carLight, carLight.target);

  // window fill lights (no shadows — cheap "light through glass")
  const fills = [
    new THREE.PointLight(0xffffff, 0, 6, 2), new THREE.PointLight(0xffffff, 0, 6, 2),
    new THREE.PointLight(0xffffff, 0, 7, 2), new THREE.PointLight(0xffffff, 0, 7, 2), new THREE.PointLight(0xffffff, 0, 4, 2),
  ];
  fills[0].position.set(-3.2, 1.7, 4.8); fills[1].position.set(2.8, 1.7, 0.2);
  fills[2].position.set(2.9, 1.6, -5.4); fills[3].position.set(-3.9, 1.6, -3.2); fills[4].position.set(3.5, 1.7, 4.3);
  fills.forEach((f) => scene.add(f));

  // bathroom reveal spotlight (casts the long shadow down the hall)
  const bathSpot = new THREE.SpotLight(0xffcf7a, 0, 32, 0.3, 0.35, 1.5);
  bathSpot.position.set(0, 2.4, -3.6); bathSpot.target.position.set(0, 0.2, 4);
  bathSpot.castShadow = true; bathSpot.shadow.mapSize.set(1024, 1024); bathSpot.shadow.camera.near = 0.3; bathSpot.shadow.camera.far = 32; bathSpot.shadow.bias = -0.0005;
  scene.add(bathSpot, bathSpot.target);

  // stoop and porch light by the front door
  box(-4.3, -1.3, -0.05, 0.14, -7.5, -6.5, M.concrete, { uv: false }); box(-3.9, -1.7, -0.05, 0.07, -8.0, -7.5, M.concrete, { uv: false });
  const porchLight = new THREE.PointLight(0xffc880, 0, 6, 2); porchLight.position.set(-1.7, 2.1, -6.9); scene.add(porchLight);
  const porchBulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), M.lamp.clone()); porchBulb.position.set(-1.7, 2.15, -6.6); house.add(porchBulb);

  // ---------- yard ----------
  M.asphalt = std({ color: 0x2b2b2d, roughness: 0.92 }); M.asphalt.userData.worldUV = true; applyPBR(M.asphalt, 'concrete', { tint: 0x3a3a3c });
  box(-260, 260, -0.4, -0.02, -260, 260, M.grass, { cast: false, parent: yard });
  box(-5.2, 0.6, -0.02, -0.008, -29, -7.9, M.dirt, { cast: false, parent: yard });   // the gravel drive up from the road
  box(-260, 260, -0.4, -0.005, -33.5, -27.5, M.asphalt, { cast: false, parent: yard });   // the road along the front of the property
  for (let x = -120; x < 120; x += 6) box(x, x + 3, -0.006, -0.004, -30.6, -30.4, std({ color: 0xc9b24a, roughness: 0.8 }), { uv: false, cast: false, parent: yard });
  // moving truck (parked on the gravel, backed toward the house)
  const TG = new THREE.Group(); TG.position.set(-15.7, 0, 2.5); yard.add(TG);
  box(11.8, 14.2, 0.55, 3.15, -24, -17, M.truck, { uv: false, parent: TG });
  box(11.85, 14.15, 1.25, 1.55, -23.95, -17.05, std({ color: 0x2e6e8e, roughness: 0.5 }), { uv: false, parent: TG }); // stripe
  { const back = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.4), std({ color: 0x0c0c0c, roughness: 1 })); back.position.set(13, 1.8, -16.995); TG.add(back); }
  box(11.9, 14.1, 0.4, 2.3, -26.4, -24, M.truckCab, { uv: false, parent: TG });
  { const ws = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.7), M.glassOut); ws.position.set(13, 1.85, -26.41); ws.rotation.y = Math.PI; TG.add(ws); }
  for (const [x, z] of [[11.75, -25.4], [14.25, -25.4], [11.75, -22.6], [14.25, -22.6], [11.75, -18.2], [14.25, -18.2]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 20), M.tire); w.rotation.z = Math.PI / 2; w.position.set(x, 0.42, z); w.castShadow = true; TG.add(w);
  }
  {
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 2.6), M.metal); ramp.position.set(13, 0.3, -15.75); ramp.rotation.x = -0.22; ramp.castShadow = ramp.receiveShadow = true; TG.add(ramp);
  }
  solid(-3.95, -1.35, -24, -14.4);
  // pickup boxes
  const pickups = [
    cardboardBox(-3.7, 0, -12.3, 0.5, 0.44, 0.5, 3, 0.15, yard),
    cardboardBox(-1.55, 0, -12.7, 0.5, 0.44, 0.5, 3, -0.3, yard),
    cardboardBox(-1.7, 0, -11.7, 0.5, 0.44, 0.5, 3, 0.4, yard),
  ];
  const dropSpots = [new THREE.Vector3(-4.25, 0, 2.75), new THREE.Vector3(-3.7, 0, 2.8), new THREE.Vector3(-4.2, 0, 3.3)];
  solid(-4.6, -3.4, 2.45, 3.55, { on: false, id: 'drops' });

  // the detached two-car garage (brown siding, gray shingles), and an arborvitae hedge along the left side
  {
    box(9, 15.6, 0, 3.0, -10, -3.6, M.siding, { parent: yard });
    const half = 3.5, rise = 1.3, L = Math.hypot(half, rise), a = Math.atan2(rise, half);
    for (const s2 of [-1, 1]) {
      const geo = new THREE.BoxGeometry(7.4, 0.14, L); worldUV(geo);
      const m = new THREE.Mesh(geo, M.roof); m.castShadow = m.receiveShadow = true; m.position.set(12.3, 3.0 + rise / 2, -6.8 + s2 * half / 2); m.rotation.x = s2 * a; yard.add(m);
    }
    const gshape = new THREE.Shape([new THREE.Vector2(10, 3.0), new THREE.Vector2(-3.6, 3.0), new THREE.Vector2(6.8, 3.0 + rise * 0.93)]);
    for (const x of [8.99, 15.61]) { const g = new THREE.ShapeGeometry(gshape); g.rotateY(Math.PI / 2); const m = new THREE.Mesh(g, M.gable); m.position.x = x; yard.add(m); }
    box(9.6, 15.0, 0.1, 2.5, -10.03, -10.0, M.garageDoor, { uv: false, parent: yard });
    for (let y = 0.7; y < 2.5; y += 0.6) box(9.6, 15.0, y, y + 0.03, -10.06, -10.03, M.black, { uv: false, parent: yard });
    solid(8.9, 15.7, -10.1, -3.5);
    const hedge = new THREE.InstancedMesh(new THREE.ConeGeometry(0.55, 3.6, 10), M.leaves, 12), m4 = new THREE.Matrix4();
    for (let i = 0; i < 12; i++) { m4.makeTranslation(7.2, 1.8, -5.5 + i * 1.0); hedge.setMatrixAt(i, m4); }
    hedge.castShadow = true; yard.add(hedge); solid(6.6, 7.8, -6, 5.6);
  }

  // barn + silo
  box(-30, -18, 0, 6, -38, -26, M.barn, { parent: yard });
  {
    const half = 6.4, rise = 3.2, L = Math.hypot(half, rise), a = Math.atan2(rise, half);
    for (const s of [-1, 1]) {
      const geo = new THREE.BoxGeometry(L, 0.2, 12.8); worldUV(geo);
      const m = new THREE.Mesh(geo, M.roof); m.castShadow = true; m.position.set(-24 + s * half / 2, 6 + rise / 2, -32); m.rotation.z = -s * a; yard.add(m);
    }
    const shape = new THREE.Shape([new THREE.Vector2(-6, 6), new THREE.Vector2(6, 6), new THREE.Vector2(0, 6 + rise * (6 / half))]);
    for (const z of [-25.99, -38.01]) { const g = new THREE.ShapeGeometry(shape); const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: T.barn, side: THREE.DoubleSide })); m.position.set(-24, 0, z); yard.add(m); }
    box(-26.2, -21.8, 0, 4, -25.99, -25.9, std({ color: 0x5a1f18 }), { uv: false, parent: yard });
    const wt = std({ color: 0xd9d3c5 });
    const d1 = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.14, 0.05), wt); d1.position.set(-24, 2, -25.86); d1.rotation.z = 0.74; yard.add(d1);
    const d2 = d1.clone(); d2.rotation.z = -0.74; yard.add(d2);
    solid(-30.1, -17.9, -38.1, -25.9);
    const silo = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 11, 24), M.silo); silo.position.set(-14.5, 5.5, -39); silo.castShadow = true; yard.add(silo);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(2.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.silo); dome.position.set(-14.5, 11, -39); yard.add(dome);
    solid(-16.8, -12.2, -41.3, -36.7);
  }
  // fence (instanced posts + rails)
  {
    const posts = []; for (let x = -60; x <= 60; x += 3) posts.push([x, -48]); for (let z = -48; z <= 20; z += 3) posts.push([40, z]);
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 1.3, 0.14), M.fence, posts.length);
    const m4 = new THREE.Matrix4(); posts.forEach(([x, z], i) => { m4.makeTranslation(x, 0.65, z); im.setMatrixAt(i, m4); }); im.castShadow = true; yard.add(im);
    for (const y of [0.5, 1.05]) { box(-60, 60, y, y + 0.1, -48.04, -47.96, M.fence, { uv: false, parent: yard }); box(39.96, 40.04, y, y + 0.1, -48, 20, M.fence, { uv: false, parent: yard }); }
  }
  // trees (instanced douglas firs): four drooping tiers with scalloped skirts, textured with needles
  const coniferGeo = () => {
    const pos = [], uv = [], idx = [], N = 18, r = TX.rng(31);
    const vtx = (x, y, z, u, v) => { pos.push(x, y, z); uv.push(u, v); return pos.length / 3 - 1; };
    for (let k = 0; k < 4; k++) {
      const y0 = 1.2 + k * 1.45, h = 2.7 - k * 0.32, R = 1.95 * (1 - k * 0.22);
      const apex = vtx(0, y0 + h, 0, 0.5, 1), mid = [], base = [];
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2, scal = i % 2 ? 1.0 : 0.62, jit = 0.9 + r() * 0.2;
        mid.push(vtx(Math.cos(a) * R * 0.6 * jit, y0 + h * 0.42, Math.sin(a) * R * 0.6 * jit, i / N * 3, 0.55));
        base.push(vtx(Math.cos(a) * R * scal * jit, y0 - 0.22 * (i % 2 ? 1 : 0.2), Math.sin(a) * R * scal * jit, i / N * 3, 0));
      }
      for (let i = 0; i < N; i++) { const j = (i + 1) % N; idx.push(apex, mid[i], mid[j], mid[i], base[i], base[j], mid[i], base[j], mid[j]); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
  };
  M.leaves.map = TX.needles(); M.leaves.side = THREE.DoubleSide; M.leaves.color.set(0xd8e8d8); M.leaves.roughness = 0.95;
  applyPBR(M.trunk, 'darkwood', { tint: 0x7a6248 });
  {
    const r = TX.rng(777), spots = [];
    while (spots.length < 110) {
      const a = r() * Math.PI * 2, d = 28 + r() * 110, x = 5 + Math.cos(a) * d, z = -15 + Math.sin(a) * d;
      if (x > -35 && x < 45 && z > -50 && z < 16) continue;
      spots.push([x, z, 0.8 + r() * 0.8, r() * 6]);
    }
    for (const [x, z] of [[-14, 8], [-19, 14], [-12, 18], [30, 10], [34, 0], [-36, -12]]) spots.push([x, z, 1.1, 1]);
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.3, 4, 7), M.trunk, spots.length);
    const cone = new THREE.InstancedMesh(coniferGeo(), M.leaves, spots.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    spots.forEach(([x, z, sc, rot], i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
      m4.compose(p.set(x, 2 * sc, z), q, s.set(sc, sc, sc)); trunk.setMatrixAt(i, m4);
      m4.compose(p.set(x, 0.9 * sc, z), q, s.set(sc * (0.85 + (rot % 1) * 0.3), sc, sc * (0.85 + ((rot * 7) % 1) * 0.3))); cone.setMatrixAt(i, m4);
      if (Math.hypot(x - 5, z + 15) < 50) solid(x - 0.35 * sc, x + 0.35 * sc, z - 0.35 * sc, z + 0.35 * sc);
    });
    trunk.castShadow = cone.castShadow = true; yard.add(trunk, cone);
  }
  // real trees (a deciduous model) around the house, ground-cover tufts, and rocks (instanced)
  {
    const r = TX.rng(4242), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const ok = (x, z, pad = 0) => !(x > -6.5 - pad && x < 8.5 + pad && z > -9 - pad && z < 7 + pad) && !(x > -7 - pad && x < 1.5 + pad && z < -8 && z > -34) && !(x > 8 - pad && x < 16.5 + pad && z > -11 - pad && z < -3);   // not on the house, porch path or truck
    const trees = [[-14, 7], [-19, -4], [-13, -16], [29, 9], [33, -6], [27, -24], [-12, -22], [31, -32], [8, 14], [20, 15], [-24, 13], [38, 2], [6.5, -10.5]];   // the last is the cherry tree by the front
    const tm = trees.map(([x, z]) => { const k = 1.5 + r() * 1.1; q.setFromAxisAngle(up, r() * 6.28); return m4.clone().compose(new THREE.Vector3(x, -0.02, z), q, sc.set(k, k, k)); });
    scatter(yard, 'tree_small', tm);
    trees.forEach(([x, z]) => solid(x - 0.5, x + 0.5, z - 0.5, z + 0.5));
    const grass = (name, n, rmin, rmax, k0, k1) => {
      const ms = [];
      while (ms.length < n) {
        const a = r() * 6.283, d = rmin + r() * (rmax - rmin), x = 9 + Math.cos(a) * d * 1.6, z = -3 + Math.sin(a) * d;
        if (!ok(x, z, 1.5)) continue;
        const k = k0 + r() * (k1 - k0); q.setFromAxisAngle(up, r() * 6.28); ms.push(m4.clone().compose(new THREE.Vector3(x, -0.02, z), q, sc.set(k, k * (0.8 + r() * 0.5), k)));
      }
      scatter(yard, name, ms, { cast: false });
    };
    grass('grass2', 1500, 5, 36, 1.0, 2.0); grass('grass1', 260, 6, 32, 0.8, 1.4);
    const rocks = [[-10, 3, 1.2], [-17, -10, 1.8], [27, -14, 1.4], [33, 5, 1.0], [6, -33, 1.6], [-6, -22, 1.1], [22, -20, 0.9]].map(([x, z, k]) => { q.setFromAxisAngle(up, r() * 6.28); return m4.clone().compose(new THREE.Vector3(x, -0.05, z), q, sc.set(k, k * 0.8, k)); });
    scatter(yard, 'rock1', rocks);
    const small = []; for (let i = 0; i < 40; i++) { const x = -20 + r() * 60, z = -35 + r() * 50; if (!ok(x, z, 2)) continue; q.setFromAxisAngle(up, r() * 6.28); const k = 1 + r() * 2.5; small.push(m4.clone().compose(new THREE.Vector3(x, -0.03, z), q, sc.set(k, k, k))); }
    scatter(yard, 'rock2', small);
  }
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
  sun.position.set(40, 45, -30); sun.target.position.set(0, 0, -2);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 140 });
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.025; sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  scene.userData.shadowLights = [{ light: sun, sun: true }, { light: bathSpot, sun: false }];

  return {
    colliders, T, M, house, yard, bulbs, nightLights, faceLight, carLight, fills, bathSpot, porchLight, porchBulb,
    hemi, sun, stars, moon, winMat, frontDoor, pickups, dropSpots, drawingMesh, drawingMat, BUNK, bathSink,
  };
}
