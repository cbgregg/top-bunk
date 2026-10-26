// Builds the farmhouse, the yard, the truck, the barn and all lights.
import * as THREE from 'three';
import * as TX from './textures.js';
import { applyPBR } from './pbr.js';
import { place, scatter } from './props.js';

export const H = 2.7;      // ceiling height
export const WT = 0.16;    // wall thickness

// Room rectangles [minX, maxX, minZ, maxZ]
export const ROOMS = {
  bed: [-6, 0, -3, 3],
  hall: [0, 20, -1, 1],
  bath: [20, 24, -2.5, 3],
  living: [6, 20, -9, -1],
};
const FP = [-6, 24, -9, 3]; // house footprint

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
    drawing0: TX.drawing(0), drawing1: TX.drawing(1), paint0: TX.painting(0), paint1: TX.painting(1),
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
    truckCab: std({ color: 0xa1342a, roughness: 0.45 }),
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
  };
  for (const k of ['furn', 'darkWood', 'door', 'doorInset', 'fence', 'concrete', 'plaid', 'mattress', 'pillow', 'roof', 'silo']) M[k].userData.worldUV = true;
  // real PBR surfaces (they replace the canvas textures as they load)
  applyPBR(M.floor, 'floor');
  applyPBR(M.wall, 'wall', { tint: 0xc9c4a4, normal: 1.3 });
  applyPBR(M.kid, 'wall', { tint: 0x9fb6c8, normal: 1.3 });
  applyPBR(M.plaster, 'ceiling', { tint: 0xdcd6c8, normal: 1.0 });
  applyPBR(M.tile, 'tile');
  applyPBR(M.siding, 'siding', { tint: 0xf0ece0, normal: 1.1 });
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
  const winMat = new THREE.MeshBasicMaterial({ map: T.winDay });

  const house = new THREE.Group(); scene.add(house);
  const yard = new THREE.Group(); scene.add(yard);

  function wallMatAt(px, pz) {
    const r = roomAt(px, pz);
    return r === 'bath' ? M.tile : r === 'bed' ? M.kid : r === 'out' ? M.siding : r === 'void' ? M.plaster : M.wall;
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

  // ---------- walls ----------
  function trims(b, alongX) {
    for (const s of [1, -1]) {
      const cx = (b[0] + b[1]) / 2, cz = (b[4] + b[5]) / 2;
      const room = alongX ? roomAt(cx, cz + s * 0.3) : roomAt(cx + s * 0.3, cz);
      if (room === 'out' || room === 'void') continue;
      const strip = (y0, y1, th) => {
        if (alongX) { const f = s > 0 ? b[5] : b[4]; box(b[0], b[1], y0, y1, Math.min(f, f + s * th), Math.max(f, f + s * th), M.trim, { uv: false }); }
        else { const f = s > 0 ? b[1] : b[0]; box(Math.min(f, f + s * th), Math.max(f, f + s * th), y0, y1, b[4], b[5], M.trim, { uv: false }); }
      };
      strip(0, 0.13, 0.022);
      if (room !== 'bath' && b[3] > 0.95) strip(0.9, 0.95, 0.018);   // (not on the short wall under a window)
    }
  }
  function casing(alongX, fixed, gp) {
    // The trim sits 1.2 cm proud of the jamb and the lintel: flush faces would z-fight the wall and flicker as you move.
    const top = gp.top ?? 2.1, t = WT / 2 + 0.025, a = gp.c - gp.w / 2, b = gp.c + gp.w / 2, cw = 0.08, e = 0.012;
    if (alongX) {
      box(a - cw, a + e, 0, top - e, fixed - t, fixed + t, M.white, { uv: false });
      box(b - e, b + cw, 0, top - e, fixed - t, fixed + t, M.white, { uv: false });
      box(a - cw, b + cw, top - e, top + 0.09, fixed - t, fixed + t, M.white, { uv: false });
    } else {
      box(fixed - t, fixed + t, 0, top - e, a - cw, a + e, M.white, { uv: false });
      box(fixed - t, fixed + t, 0, top - e, b - e, b + cw, M.white, { uv: false });
      box(fixed - t, fixed + t, top - e, top + 0.09, a - cw, b + cw, M.white, { uv: false });
    }
  }
  function wall(x1, z1, x2, z2, gaps = []) {
    const alongX = z1 === z2;
    const a0 = alongX ? Math.min(x1, x2) : Math.min(z1, z2), a1 = alongX ? Math.max(x1, x2) : Math.max(z1, z2);
    const fixed = alongX ? z1 : x1;
    const segs = []; let cur = a0;
    for (const gp of [...gaps].sort((p, q) => p.c - q.c)) {
      const g0 = gp.c - gp.w / 2, g1 = gp.c + gp.w / 2;
      if (g0 > cur) segs.push([cur, g0, 0, H]);
      if (gp.sill !== undefined) { segs.push([g0, g1, 0, gp.sill]); segs.push([g0, g1, gp.sill + gp.h, H]); }   // a window: wall below and above
      else segs.push([g0, g1, gp.top ?? 2.1, H]);                                                              // a door: wall above
      cur = g1;
    }
    if (cur < a1) segs.push([cur, a1, 0, H]);
    // split full-height pieces at room boundaries so each face picks the right finish
    const cuts = alongX ? [0, 6, 20] : [-3, -2.5, -1, 1];
    const split = [];
    for (const sg of segs) {
      if (sg[2] !== 0) { split.push(sg); continue; }
      let a = sg[0];
      for (const c of cuts) if (c > a + 0.01 && c < sg[1] - 0.01) { split.push([a, c, 0, sg[3]]); a = c; }
      split.push([a, sg[1], 0, sg[3]]);
    }
    for (const [s0, s1, y0, y1] of split) {
      const b = alongX ? [s0, s1, y0, y1, fixed - WT / 2, fixed + WT / 2] : [fixed - WT / 2, fixed + WT / 2, y0, y1, s0, s1];
      box(...b, 'room');
      if (y0 === 0) { solid(b[0], b[1], b[4], b[5]); trims(b, alongX); }
    }
    for (const gp of gaps) {
      if (gp.sill === undefined) casing(alongX, fixed, gp);
      else {   // nothing may walk out through a window
        const a = gp.c - gp.w / 2, b = gp.c + gp.w / 2;
        if (alongX) solid(a, b, fixed - WT / 2, fixed + WT / 2); else solid(fixed - WT / 2, fixed + WT / 2, a, b);
      }
    }
  }

  // exterior shell
  wall(-6, 3, 24, 3, [{ c: -1.6, w: 1.0, sill: 0.85, h: 1.25 }]);
  wall(-6, -9, 24, -9, [{ c: 8.0, w: 1.0, sill: 0.85, h: 1.25 }, { c: 11.0, w: 1.0, sill: 0.85, h: 1.25 }, { c: 13, w: 1.1 }, { c: 17.2, w: 1.0, sill: 1.05, h: 1.0 }]);
  wall(-6, -9, -6, 3, [{ c: 0, w: 1.0, sill: 0.85, h: 1.25 }]);
  wall(24, -9, 24, 3, [{ c: 0.7, w: 0.7, sill: 1.45, h: 0.65 }]);
  // interior
  wall(-6, -3, 0, -3);
  wall(0, -3, 0, 3, [{ c: 0, w: 1.0 }]);
  wall(0, 1, 20, 1);
  wall(0, -1, 20, -1, [{ c: 9.5, w: 2.4, top: 2.3 }]);
  wall(6, -9, 6, -1);
  wall(20, -2.5, 20, 3, [{ c: 0, w: 1.0 }]);
  wall(20, -2.5, 24, -2.5);
  wall(20, -9, 20, -2.5);

  // floors & ceiling
  box(-6, 0, -0.1, 0, -3, 3, M.floor, { cast: false });
  box(0, 20, -0.1, 0, -1, 1, M.floor, { cast: false });
  box(6, 20, -0.1, 0, -9, -1, M.floor, { cast: false });
  box(20, 24, -0.1, 0, -2.5, 3, M.tile, { cast: false });
  box(-6.1, 24.1, H, H + 0.1, -9.1, 3.1, M.plaster);

  // foundation strip outside
  box(-6.2, 24.2, -0.05, 0.28, -9.2, -9.08, M.concrete, { uv: false });
  box(-6.2, 24.2, -0.05, 0.28, 3.08, 3.2, M.concrete, { uv: false });
  box(-6.2, -6.08, -0.05, 0.28, -9.2, 3.2, M.concrete, { uv: false });
  box(24.08, 24.2, -0.05, 0.28, -9.2, 3.2, M.concrete, { uv: false });

  // roof (gable, ridge along x at z = -3)
  {
    const half = 6.7, rise = 1.95, L = Math.hypot(half, rise), a = Math.atan2(rise, half);
    for (const s of [-1, 1]) {
      const geo = new THREE.BoxGeometry(31.4, 0.14, L); worldUV(geo);
      const m = new THREE.Mesh(geo, M.roof); m.castShadow = m.receiveShadow = true;
      m.position.set(9, H + 0.1 + rise / 2, -3 + s * half / 2); m.rotation.x = s * a;
      house.add(m);
    }
    const peak = H + 0.1 + rise * (6 / half);
    const shape = new THREE.Shape([new THREE.Vector2(9.1, H + 0.1), new THREE.Vector2(-3.1, H + 0.1), new THREE.Vector2(3, peak)]);
    for (const x of [-6.08, 24.08]) {
      const g = new THREE.ShapeGeometry(shape); g.rotateY(Math.PI / 2);
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: T.siding, side: THREE.DoubleSide, roughness: 0.86 }));
      m.position.x = x; m.castShadow = true; house.add(m);
    }
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
      // rod
      const off = fixed + insideSign * (WT / 2 + 0.07);
      if (alongX) box(c - w / 2 - 0.4, c + w / 2 + 0.4, sill + h + 0.3, sill + h + 0.33, off - 0.015, off + 0.015, M.darkWood, { uv: false });
      else box(off - 0.015, off + 0.015, sill + h + 0.3, sill + h + 0.33, c - w / 2 - 0.4, c + w / 2 + 0.4, M.darkWood, { uv: false });
    }
  }
  windowAt(false, -6, 0, 1, { curtains: true, real: true });
  windowAt(true, 3, -1.6, -1, { curtains: true, real: true });
  windowAt(true, -9, 8.0, 1, { curtains: true, real: true });
  windowAt(true, -9, 11.0, 1, { real: true });
  windowAt(true, -9, 17.2, 1, { sill: 1.05, h: 1.0, real: true });
  windowAt(false, 24, 0.7, -1, { sill: 1.45, w: 0.7, h: 0.65, real: true });
  for (const x of [4, 10, 16]) windowAt(true, 3, x, -1);   // exterior-only (void behind)
  windowAt(false, 24, -6, -1);
  windowAt(true, -9, -3, 1);

  // ---------- doors ----------
  function closedDoor(x, z, face) { // door on a wall along X, face = side it faces (+1/-1)
    const zf = z + face * (WT / 2), z0 = Math.min(zf, zf + face * 0.045), z1 = Math.max(zf, zf + face * 0.045);
    box(x - 0.45, x + 0.45, 0, 2.05, z0, z1, M.door, { uv: false });
    const zi0 = Math.min(zf + face * 0.045, zf + face * 0.055), zi1 = Math.max(zf + face * 0.045, zf + face * 0.055);
    box(x - 0.33, x + 0.33, 1.1, 1.85, zi0, zi1, M.doorInset, { uv: false });
    box(x - 0.33, x + 0.33, 0.2, 0.95, zi0, zi1, M.doorInset, { uv: false });
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), M.metal);
    knob.position.set(x + 0.35, 1.0, zf + face * 0.08); house.add(knob);
    casing(true, z, { c: x, w: 0.9, top: 2.05 });
  }
  closedDoor(4, 1, -1);    // linen closet
  closedDoor(10, 1, -1);   // parents
  closedDoor(16, 1, -1);   // spare room

  // front door (open in the day, shut at night)
  const frontPivot = new THREE.Group(); frontPivot.position.set(12.45, 0, -9 + WT / 2); house.add(frontPivot);
  {
    const d = new THREE.Mesh(new THREE.BoxGeometry(1.08, 2.08, 0.05), M.door); d.position.set(0.54, 1.04, 0.0); d.castShadow = true; frontPivot.add(d);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), M.metal); knob.position.set(0.98, 1.0, 0.05); frontPivot.add(knob);
  }
  const frontCollider = solid(12.4, 13.6, -9.1, -8.9, { on: false });
  const frontDoor = {
    setOpen(o) { frontPivot.rotation.y = o ? -1.5 : 0; frontCollider.on = !o; },
  };

  // ---------- bedroom ----------
  const BUNK = { x0: -5.65, x1: -3.55, z0: 1.55, z1: 2.5 };
  {
    const { x0, x1, z0, z1 } = BUNK;
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
    for (const zz of [1.78, 2.27]) box(x1 + 0.01, x1 + 0.06, 0, 1.92, zz - 0.025, zz + 0.025, M.furn, { uv: false });
    for (let y = 0.3; y < 1.8; y += 0.3) box(x1 + 0.015, x1 + 0.055, y, y + 0.04, 1.78, 2.27, M.furn, { uv: false });
    solid(x0 - 0.05, x1 + 0.08, z0 - 0.05, z1 + 0.05);
  }
  // dresser + teddy + lamp
  tagStart('dresser');
  box(-2.7, -1.3, 0, 1.0, -2.92, -2.4, M.furn, { uv: false });
  for (const y of [0.15, 0.45, 0.75]) box(-2.65, -1.35, y, y + 0.24, -2.41, -2.38, M.darkWood, { uv: false });
  tagEnd();
  const cDresser = solid(-2.75, -1.25, -2.95, -2.35);
  let teddy = null;
  {
    const bear = new THREE.Group(); const fur = std({ color: 0x7a5232, roughness: 1 });
    const s = (r, x, y, z) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), fur); m.position.set(x, y, z); m.castShadow = true; bear.add(m); };
    s(0.11, 0, 0.11, 0); s(0.08, 0, 0.27, 0.01); s(0.03, -0.06, 0.34, 0); s(0.03, 0.06, 0.34, 0); s(0.035, -0.1, 0.06, 0.06); s(0.035, 0.1, 0.06, 0.06);
    const eye = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.2 });
    for (const x of [-0.025, 0.025]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), eye); e.position.set(x, 0.29, 0.08); bear.add(e); }
    bear.position.set(-1.7, 1.0, -2.65); bear.rotation.y = 0.3; house.add(bear); teddy = bear;
  }
  {
    const rugM = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.012, 48), M.rug); rugM.position.set(-2.8, 0.006, -0.4); rugM.receiveShadow = true; house.add(rugM);
  }

  // ---------- hallway ----------
  {
    const run = box(1, 19, 0, 0.012, -0.42, 0.42, M.runner, { uv: false, cast: false });
    // remap runner UVs: top face along x
    const uv = run.geometry.attributes.uv, n = run.geometry.attributes.normal, p = run.geometry.attributes.position;
    for (let i = 0; i < uv.count; i++) if (n.getY(i) > 0.5) uv.setXY(i, (p.getZ(i) + 0.42) / 0.84, (p.getX(i) - 1) / 18);
    uv.needsUpdate = true;
  }
  function frame(x, y, z, w, h, tex, face) { // on wall along X
    const zf = z + face * (WT / 2);
    box(x - w / 2 - 0.05, x + w / 2 + 0.05, y - h / 2 - 0.05, y + h / 2 + 0.05, Math.min(zf, zf + face * 0.03), Math.max(zf, zf + face * 0.03), M.darkWood, { uv: false });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), std({ map: tex, roughness: 0.6 }));
    p.position.set(x, y, zf + face * 0.032); if (face < 0) p.rotation.y = Math.PI; house.add(p);
  }
  frame(3, 1.6, -1, 0.5, 0.62, T.paint0, 1);
  frame(13.5, 1.55, -1, 0.5, 0.62, T.paint1, 1);
  frame(18.2, 1.6, -1, 0.42, 0.52, T.paint0, 1);
  // crayon drawing taped to the wall at kid height
  const drawingMat = new THREE.MeshStandardMaterial({ map: T.drawing0, roughness: 0.9 });
  const drawingMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.345), drawingMat);
  drawingMesh.position.set(7, 1.08, 1 - WT / 2 - 0.004); drawingMesh.rotation.set(0, Math.PI, 0.04); house.add(drawingMesh);
  const tape = std({ color: 0xe8e0b8, roughness: 0.6, transparent: true, opacity: 0.8 });
  for (const [dx, dy] of [[-0.2, 0.16], [0.2, 0.16]]) { const t = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.03), tape); t.position.set(7 - dx, 1.08 + dy, 1 - WT / 2 - 0.006); t.rotation.y = Math.PI; house.add(t); }
  // side table
  box(16.6, 17.3, 0, 0.72, -0.92, -0.62, M.furn, { uv: false });
  solid(16.55, 17.35, -0.95, -0.58);

  // ---------- bathroom ----------
  box(21.2, 23.9, 0, 0.55, -2.42, -1.62, M.porcelain, { uv: false });
  box(21.3, 23.8, 0.42, 0.56, -2.32, -1.72, std({ color: 0x9a9a92, roughness: 0.2 }), { uv: false });
  solid(21.15, 23.95, -2.45, -1.58);
  box(23.35, 23.92, 0, 0.42, 1.95, 2.45, M.porcelain, { uv: false });
  box(23.7, 23.92, 0.42, 0.85, 1.85, 2.55, M.porcelain, { uv: false });
  solid(23.3, 24, 1.8, 2.6);
  box(22.05, 22.35, 0, 0.78, 2.62, 2.9, M.porcelain, { uv: false });
  box(21.85, 22.55, 0.78, 0.9, 2.42, 2.92, M.porcelain, { uv: false });
  box(22.15, 22.25, 0.9, 1.0, 2.82, 2.9, M.metal, { uv: false });
  solid(21.8, 22.6, 2.4, 3);
  box(21.8, 22.6, 1.25, 1.95, 2.9, 2.915, M.mirror, { uv: false });

  // ---------- living / kitchen ----------
  tagStart('couch');
  box(7.5, 10, 0, 0.45, -5.8, -4.9, M.couch, { uv: false });
  box(7.5, 10, 0.45, 0.95, -5.0, -4.75, M.couch, { uv: false });
  box(7.3, 7.55, 0, 0.65, -5.8, -4.75, M.couch, { uv: false });
  box(9.95, 10.2, 0, 0.65, -5.8, -4.75, M.couch, { uv: false });
  tagEnd();
  const cCouch = solid(7.25, 10.25, -5.85, -4.7);
  tagStart('coffee'); box(8, 9.5, 0, 0.42, -6.9, -6.3, M.furn, { uv: false }); tagEnd();
  const cCoffee = solid(7.95, 9.55, -6.95, -6.25);
  tagStart('tv');
  box(8.1, 9.4, 0, 0.55, -8.85, -8.35, M.darkWood, { uv: false });
  box(8.3, 9.2, 0.55, 1.2, -8.8, -8.25, M.crt, { uv: false });
  { const s = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.5), M.crtScreen); s.position.set(8.75, 0.88, -8.245); house.add(s); tagged.tv.push(s); }
  tagEnd();
  const cTv = solid(8.05, 9.45, -8.9, -8.2);
  // kitchen
  box(19.3, 19.92, 0, 0.9, -8.9, -3.2, M.cabinet, { uv: false });
  box(19.25, 19.92, 0.9, 0.95, -8.9, -3.2, M.counter, { uv: false });
  box(19.6, 19.92, 1.5, 2.3, -8.9, -3.2, M.cabinet, { uv: false });
  solid(19.2, 20, -8.95, -3.15);
  box(19.1, 19.9, 0, 1.8, -2.4, -1.4, M.fridge, { uv: false }); solid(19.05, 20, -2.45, -1.35);
  tagStart('dining');
  box(14.5, 16, 0.7, 0.75, -6, -4.8, M.furn, { uv: false });
  for (const [x, z] of [[14.6, -5.95], [15.9, -5.95], [14.6, -4.85], [15.9, -4.85]]) box(x - 0.03, x + 0.03, 0, 0.7, z - 0.03, z + 0.03, M.furn, { uv: false });
  for (const [x, z] of [[15.25, -6.5], [15.25, -4.3]]) {
    box(x - 0.22, x + 0.22, 0.42, 0.46, z - 0.2, z + 0.2, M.furn, { uv: false });
    for (const [dx, dz] of [[-0.18, -0.16], [0.18, -0.16], [-0.18, 0.16], [0.18, 0.16]]) box(x + dx - 0.02, x + dx + 0.02, 0, 0.42, z + dz - 0.02, z + dz + 0.02, M.furn, { uv: false });
  }
  tagEnd();
  const cDining = solid(14.45, 16.05, -6.05, -4.75);

  // ---------- real furniture: each model replaces its stand-in (and collider) as it loads ----------
  const PI = Math.PI;
  const prop = (name, o, { tag, old = [], box: sb, after } = {}) => place(house, name, {
    ...o, hide: tag ? tagged[tag] || [] : [],
    onLoad: () => { old.forEach((c) => { c.on = false; }); if (sb) solid(...sb); if (after) after(); },
  });
  // living room: TV bench, TV, sofa, armchair, coffee table, hutch, dining set
  prop('table', { x: 9.5, z: -8.58, rot: 0 }, { tag: 'tv', old: [cTv], box: [8.6, 10.4, -8.92, -8.24] });
  prop('tv', { x: 9.5, y: 0.55, z: -8.58, rot: 0 });
  prop('sofa', { x: 9.5, z: -5.3, rot: PI }, { tag: 'couch', old: [cCouch], box: [8.7, 10.3, -5.65, -4.95] });
  prop('armchair', { x: 11.7, z: -5.7, rot: -2.55 }, { tag: 'couch', box: [11.25, 12.15, -6.1, -5.3] });
  prop('table', { x: 9.5, z: -6.75, rot: 0 }, { tag: 'coffee', old: [cCoffee], box: [8.6, 10.4, -7.1, -6.4] });
  prop('cabinet', { x: 15.0, z: -8.58, rot: 0 }, { box: [14.0, 16.0, -8.92, -8.25] });
  prop('table_round', { x: 15.25, z: -5.4, s: 0.77 }, { tag: 'dining', old: [cDining], box: [14.7, 15.8, -5.95, -4.85] });
  for (const [x, z, r] of [[14.35, -5.4, PI / 2], [16.15, -5.4, -PI / 2], [15.25, -6.3, 0], [15.25, -4.5, PI]]) prop('chair', { x, z, rot: r }, { tag: 'dining' });
  // kitchen
  prop('stove', { x: 19.0, z: -6.0, rot: -PI / 2 }, { box: [18.65, 19.3, -6.3, -5.7] });
  prop('kettle', { x: 19.0, y: 0.86, z: -5.9, rot: -PI / 2 });
  prop('pot', { x: 19.6, y: 0.95, z: -4.4, rot: -PI / 2 });
  // plants, clock, pictures
  prop('plant2', { x: 6.8, z: -8.35 }, { box: [6.5, 7.1, -8.7, -8.05] });
  prop('plant1', { x: 6.8, z: -1.55 }, { box: [6.5, 7.1, -1.9, -1.25] });
  prop('clock_wall', { x: 6.1, y: 1.74, z: -5.0, rot: PI / 2 });
  prop('frame2', { x: 6.095, y: 1.25, z: -7.4, rot: PI / 2 });
  prop('frame1', { x: 6.095, y: 1.0, z: -2.7, rot: PI / 2 });
  // hallway
  prop('clock_grandfather', { x: 13.0, z: 0.7, rot: PI }, { box: [12.65, 13.35, 0.45, 0.95] });
  prop('clock_mantel', { x: 16.8, y: 0.72, z: -0.77, rot: 0 });
  prop('lamp', { x: 17.15, y: 0.72, z: -0.74 });
  // bedroom
  prop('drawers', { x: -2.0, z: -2.5, rot: 0, s: 0.81 }, { tag: 'dresser', old: [cDresser], box: [-2.75, -1.25, -2.95, -2.1], after: () => { if (teddy) teddy.position.y = 0.89; } });
  prop('lamp', { x: -2.5, y: 0.89, z: -2.62 });
  prop('rocker', { x: -0.85, z: 2.15, rot: -1.87 }, { box: [-1.3, -0.4, 1.7, 2.6] });
  prop('frame3', { x: -4.3, y: 1.3, z: -2.93, rot: 0 });
  // stacked moving boxes around the house
  const boxTex = [TX.cardboard('KITCHEN', 3), TX.cardboard('BOOKS', 4), TX.cardboard('MISC', 5), TX.cardboard('KIDS ROOM', 6)];
  const boxMats = boxTex.map((t) => std({ map: t, roughness: 0.9 }));
  const cardboardBox = (x, y, z, w = 0.5, h = 0.44, d = 0.5, mi = 0, rot = 0, parent = house) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), boxMats[mi]); m.position.set(x, y + h / 2, z); m.rotation.y = rot; m.castShadow = m.receiveShadow = true; parent.add(m); return m;
  };
  cardboardBox(11.5, 0, -2.0, 0.6, 0.5, 0.5, 0, 0.2); cardboardBox(11.55, 0.5, -2.0, 0.5, 0.4, 0.45, 2, -0.1); solid(11.15, 11.85, -2.3, -1.7);
  cardboardBox(17.5, 0, -7.8, 0.55, 0.45, 0.55, 0, 0.5); solid(17.15, 17.85, -8.15, -7.45);
  cardboardBox(-4.6, 0.55, 2.0, 0.6, 0.4, 0.55, 2, 0.1, house); // on bottom bunk
  cardboardBox(-5.2, 0.55, 2.05, 0.4, 0.34, 0.5, 1, -0.2, house);

  // ---------- light fixtures ----------
  const bulbs = {};
  const fixture = (name, x, z, intensity = 9) => {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.lamp.clone());
    dome.rotation.x = Math.PI; dome.position.set(x, H - 0.005, z); house.add(dome);
    const L = new THREE.PointLight(0xffd29a, 0, 9, 2); L.position.set(x, H - 0.25, z); scene.add(L);
    bulbs[name] = { light: L, dome, base: intensity };
  };
  fixture('bed', -3, 0); fixture('hall1', 5, 0); fixture('hall2', 15, 0); fixture('bath', 22, 0.4, 7);
  fixture('living', 9.5, -5.5, 10); fixture('kitchen', 16.5, -5, 10);

  // night light near the bedroom
  const nlMesh = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.03), std({ color: 0xffb070, emissive: 0xff8a3a, emissiveIntensity: 0 }));
  nlMesh.position.set(1.6, 0.35, -1 + WT / 2 + 0.015); house.add(nlMesh);
  const nightLight = new THREE.PointLight(0xff8a3a, 0, 5, 2); nightLight.position.set(1.6, 0.4, -0.75); scene.add(nightLight);

  // window fill lights (no shadows — cheap "light through glass")
  const fills = [
    new THREE.PointLight(0xffffff, 0, 6, 2), new THREE.PointLight(0xffffff, 0, 6, 2),
    new THREE.PointLight(0xffffff, 0, 7, 2), new THREE.PointLight(0xffffff, 0, 7, 2), new THREE.PointLight(0xffffff, 0, 4, 2),
  ];
  fills[0].position.set(-4.3, 1.7, 0); fills[1].position.set(-1.6, 1.7, 1.2);
  fills[2].position.set(9, 1.6, -8.2); fills[3].position.set(16.5, 1.6, -8.2); fills[4].position.set(23.3, 2.0, 0.7);
  fills.forEach((f) => scene.add(f));

  // bathroom reveal spotlight (casts the long shadow down the hall)
  const bathSpot = new THREE.SpotLight(0xffcf7a, 0, 32, 0.36, 0.35, 1.5);
  bathSpot.position.set(23.6, 2.35, 0.05); bathSpot.target.position.set(6, 0.2, 0);
  bathSpot.castShadow = true; bathSpot.shadow.mapSize.set(1024, 1024); bathSpot.shadow.camera.near = 0.3; bathSpot.shadow.camera.far = 32; bathSpot.shadow.bias = -0.0005;
  scene.add(bathSpot, bathSpot.target);

  // porch
  box(10.4, 15.6, -0.02, 0.08, -11.2, -9.08, M.darkWood, { uv: false });
  box(11.8, 14.2, -0.02, 0.04, -11.8, -11.2, M.darkWood, { uv: false });
  for (const x of [10.55, 15.45]) box(x - 0.07, x + 0.07, 0, 2.55, -11.1, -10.96, M.white, { uv: false });
  box(10.3, 15.7, 2.55, 2.67, -11.3, -9.08, M.roof, { uv: false });
  const porchLight = new THREE.PointLight(0xffc880, 0, 6, 2); porchLight.position.set(13.9, 2.15, -9.4); scene.add(porchLight);
  const porchBulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), M.lamp.clone()); porchBulb.position.set(13.9, 2.2, -9.15); house.add(porchBulb);

  // ---------- yard ----------
  box(-260, 260, -0.4, -0.02, -260, 260, M.grass, { cast: false, parent: yard });
  box(11, 15, -0.02, -0.008, -70, -11.2, M.dirt, { cast: false, parent: yard });
  // moving truck
  box(11.8, 14.2, 0.55, 3.15, -24, -17, M.truck, { uv: false, parent: yard });
  box(11.85, 14.15, 1.25, 1.55, -23.95, -17.05, std({ color: 0x2e6e8e, roughness: 0.5 }), { uv: false, parent: yard }); // stripe
  { const back = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.4), std({ color: 0x0c0c0c, roughness: 1 })); back.position.set(13, 1.8, -16.995); back.rotation.y = 0; yard.add(back); }
  box(11.9, 14.1, 0.4, 2.3, -26.4, -24, M.truckCab, { uv: false, parent: yard });
  { const ws = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.7), M.glassOut); ws.position.set(13, 1.85, -26.41); ws.rotation.y = Math.PI; yard.add(ws); }
  for (const [x, z] of [[11.75, -25.4], [14.25, -25.4], [11.75, -22.6], [14.25, -22.6], [11.75, -18.2], [14.25, -18.2]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 20), M.tire); w.rotation.z = Math.PI / 2; w.position.set(x, 0.42, z); w.castShadow = true; yard.add(w);
  }
  {
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 2.6), M.metal); ramp.position.set(13, 0.3, -15.75); ramp.rotation.x = -0.22; ramp.castShadow = ramp.receiveShadow = true; yard.add(ramp);
  }
  solid(11.65, 14.35, -26.5, -16.9);
  // pickup boxes
  const pickups = [
    cardboardBox(12.0, 0, -14.9, 0.5, 0.44, 0.5, 3, 0.15, yard),
    cardboardBox(14.15, 0, -15.3, 0.5, 0.44, 0.5, 3, -0.3, yard),
    cardboardBox(14.0, 0, -14.3, 0.5, 0.44, 0.5, 3, 0.4, yard),
  ];
  const dropSpots = [new THREE.Vector3(-5.25, 0, -2.4), new THREE.Vector3(-4.6, 0, -2.45), new THREE.Vector3(-5.25, 0, -1.8)];
  solid(-5.6, -4.25, -2.75, -1.5, { on: false, id: 'drops' });

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
  // trees (instanced douglas firs)
  {
    const r = TX.rng(777), spots = [];
    while (spots.length < 110) {
      const a = r() * Math.PI * 2, d = 28 + r() * 110, x = 5 + Math.cos(a) * d, z = -15 + Math.sin(a) * d;
      if (x > -35 && x < 45 && z > -50 && z < 16) continue;
      spots.push([x, z, 0.8 + r() * 0.8, r() * 6]);
    }
    for (const [x, z] of [[-14, 8], [-19, 14], [-12, 18], [30, 10], [34, 0], [-36, -12]]) spots.push([x, z, 1.1, 1]);
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.3, 4, 7), M.trunk, spots.length);
    const cone = new THREE.InstancedMesh(new THREE.ConeGeometry(1.9, 5.5, 8), M.leaves, spots.length * 3);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    spots.forEach(([x, z, sc, rot], i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
      m4.compose(p.set(x, 2 * sc, z), q, s.set(sc, sc, sc)); trunk.setMatrixAt(i, m4);
      for (let k = 0; k < 3; k++) { const ks = sc * (1 - k * 0.24); m4.compose(p.set(x, (3.4 + k * 2.6) * sc, z), q, s.set(ks, sc, ks)); cone.setMatrixAt(i * 3 + k, m4); }
      if (Math.hypot(x - 5, z + 15) < 50) solid(x - 0.35 * sc, x + 0.35 * sc, z - 0.35 * sc, z + 0.35 * sc);
    });
    trunk.castShadow = cone.castShadow = true; yard.add(trunk, cone);
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
  sun.position.set(40, 45, -30); sun.target.position.set(6, 0, -10);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 140 });
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.025; sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  scene.userData.shadowLights = [{ light: sun, sun: true }, { light: bathSpot, sun: false }];

  return {
    colliders, T, M, house, yard, bulbs, nightLight, nlMesh, fills, bathSpot, porchLight, porchBulb,
    hemi, sun, stars, moon, winMat, frontDoor, pickups, dropSpots, drawingMesh, drawingMat, BUNK,
  };
}
