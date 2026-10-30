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

// Room rectangles [minX, maxX, minZ, maxZ], measured to the middle of the walls. The FRONT is the long wall facing the road
// (z = -4.5; seen from the road the viewer's left is +x). Along the front: two bedrooms, the front door and picture window into the
// living room, then the lower utility wing. Behind them a back row: YOUR room (back-left corner), the bathroom, kitchen, dining.
// A narrow hall runs along the bedroom end between the two rows.
export const ROOMS = {
  bed: [5.0, 8.1, -0.3, 3.6],        // yours: back-left corner
  bath: [3.3, 5.0, -0.3, 3.6],       // long and narrow, next to your room
  hall: [3.3, 8.1, -1.5, -0.3],
  parents: [5.8, 8.1, -4.5, -1.5],   // front bedroom at the end
  room2: [3.3, 5.8, -4.5, -1.5],     // front bedroom
  living: [-3.3, 3.3, -4.5, -0.3],   // front door, picture window
  kitchen: [-1.4, 3.3, -0.3, 3.6],
  dining: [-3.3, -1.4, -0.3, 3.6],
  utility: [-8.1, -3.3, -3.9, 3.6],  // the lower wing
};

export function roomAt(x, z) {
  for (const k in ROOMS) { const r = ROOMS[k]; if (x > r[0] && x < r[1] && z > r[2] && z < r[3]) return k; }
  return 'out';
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
    truck: std({ color: 0xe8e6e0, roughness: 0.5 }),
    truckCab: std({ color: 0xa1342a, roughness: 0.45 }), garageDoor: std({ color: 0xcfc9b8, roughness: 0.6 }),
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
  applyPBR(M.silo, 'metal', { tint: 0xb8bcc0, anti: true });
  M.gable = std({ map: T.siding, side: THREE.DoubleSide, roughness: 0.86 }); applyPBR(M.gable, 'siding', { tint: 0xe0a468, normal: 1.1 });

  const house = new THREE.Group(); scene.add(house);
  const yard = new THREE.Group(); scene.add(yard);

  const wallMatAt = (px, pz) => (roomAt(px, pz) === 'out' ? M.siding : M.drywall);

  // stand-in furniture is tagged so it can be hidden when its model arrives
  let curTag = null; const tagged = {};
  const tagStart = (k) => { curTag = tagged[k] = tagged[k] || []; }, tagEnd = () => { curTag = null; };

  // Axis-aligned box from bounds. mat: material | array | 'room' (sample rooms per face)
  let defParent = null;   // while set, box() and rbox() add to this group (the mirrored bunk)
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
    (o.parent || defParent || house).add(mesh);
    if (curTag) curTag.push(mesh);
    return mesh;
  }

  // Box with rounded edges, for fixtures (the bevel picks up a highlight along each edge). Same bounds as box().
  function rbox(x0, x1, y0, y1, z0, z1, mat, r = 0.02, o = {}) {
    const geo = new RoundedBoxGeometry(x1 - x0, y1 - y0, z1 - z0, 3, Math.min(r, (x1 - x0) / 2.01, (y1 - y0) / 2.01, (z1 - z0) / 2.01));
    geo.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    if (mat && mat.userData && mat.userData.worldUV) worldUV(geo);
    const m = new THREE.Mesh(geo, mat); m.castShadow = o.cast !== false; m.receiveShadow = true; (o.parent || defParent || house).add(m); return m;
  }
  // ---------- walls ----------
  const cutsX = [...new Set(Object.values(ROOMS).flatMap((r) => [r[0], r[1]]))], cutsZ = [...new Set(Object.values(ROOMS).flatMap((r) => [r[2], r[3]]))];
  function trims(b, alongX) {
    for (const s of [1, -1]) {
      const cx = (b[0] + b[1]) / 2, cz = (b[4] + b[5]) / 2;
      const room = alongX ? roomAt(cx, cz + s * 0.3) : roomAt(cx + s * 0.3, cz);
      if (room === 'out') continue;
      const strip = (y0, y1, th, mat = M.trim) => {
        if (alongX) { const f = s > 0 ? b[5] : b[4]; box(b[0], b[1], y0, y1, Math.min(f, f + s * th), Math.max(f, f + s * th), mat, { uv: mat !== M.trim }); }
        else { const f = s > 0 ? b[1] : b[0]; box(Math.min(f, f + s * th), Math.max(f, f + s * th), y0, y1, b[4], b[5], mat, { uv: mat !== M.trim }); }
      };
      strip(0, 0.11, 0.022);
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
    for (const side of [-1, 1]) {
      const g = new THREE.ExtrudeGeometry(spandrel, { depth: WT / 2, bevelEnabled: false, curveSegments: 20 });
      place(g, side < 0 ? -WT / 2 : 0, M.drywall);
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
      if (y0 === 0) { solid(b[0], b[1], b[4], b[5], { wall: true }); trims(b, alongX); }
    }
    for (const gp of gaps) {
      if (gp.arch) { archFill(alongX, fixed, gp); casing(alongX, fixed, gp); }
      else if (gp.sill === undefined) casing(alongX, fixed, gp);
      else {   // nothing may walk out through a window
        const a = gp.c - gp.w / 2, b = gp.c + gp.w / 2;
        if (alongX) solid(a, b, fixed - WT / 2, fixed + WT / 2, { wall: true }); else solid(fixed - WT / 2, fixed + WT / 2, a, b, { wall: true });
      }
    }
  }

  // exterior shell
  wall(-3.3, -4.5, 8.1, -4.5, [{ c: 6.9, w: 1.1, sill: 0.85, h: 1.25 }, { c: 4.4, w: 1.3, sill: 0.85, h: 1.25 }, { c: 1.9, w: 1.0 }, { c: -0.6, w: 2.4, sill: 0.55, h: 1.35 }]);
  wall(-8.1, -3.9, -3.3, -3.9);
  wall(8.1, -4.5, 8.1, 3.6, [{ c: -3.5, w: 1.2, sill: 0.85, h: 1.25 }, { c: 2.85, w: 0.8, sill: 0.85, h: 1.25 }]);
  wall(-8.1, -3.9, -8.1, 3.6, [{ c: -1.6, w: 1.4, sill: 0.85, h: 1.25 }, { c: 1.8, w: 1.4, sill: 0.85, h: 1.25 }]);
  wall(-8.1, 3.6, 8.1, 3.6, [{ c: 4.2, w: 0.6, sill: 1.45, h: 0.6 }, { c: 1.4, w: 1.8, sill: 1.0, h: 0.9 }, { c: -2.3, w: 1.1, sill: 0.85, h: 1.25 }]);
  wall(-3.3, -4.5, -3.3, 3.6, [{ c: 0.45, w: 1.1, top: 2.05 }]);              // living room and dining | utility, with the barn door
  wall(3.3, -4.5, 3.3, -1.5); wall(3.3, -0.3, 3.3, 3.6);                       // (the hall opens into the living room between them)
  wall(3.3, -1.5, 8.1, -1.5, [{ c: 3.9, w: 0.9, top: 2.05 }, { c: 7.5, w: 0.9, top: 2.05 }]);    // hall | the two front bedrooms
  wall(3.3, -0.3, 8.1, -0.3, [{ c: 4.15, w: 0.9, top: 2.05 }, { c: 7.05, w: 0.9, top: 2.05 }]);   // hall | bathroom, YOUR room
  wall(5.8, -4.5, 5.8, -1.5); wall(5.0, -0.3, 5.0, 3.6);
  wall(-1.4, -0.3, -1.4, 1.6);   // the short wall between kitchen and dining
  wall(-1.4, -0.3, 3.3, -0.3, [{ c: 1.7, w: 1.4, top: 1.85, arch: true }]);   // the middle wall between the living room and the kitchen, with the arch (the dining end is open to the living room)

  // floors & ceiling: dark brown carpet through the whole house except the wet rooms
  const FLOORMAT = { bath: M.bathFloor, kitchen: M.lino, dining: M.lino, utility: M.slate };
  for (const k in ROOMS) { const r = ROOMS[k]; box(r[0], r[1], -0.1, 0, r[2], r[3], FLOORMAT[k] || M.carpet, { cast: false }); }
  box(-8.2, 8.2, H, H + 0.1, -4.6, 3.7, M.plaster);

  // foundation strip outside
  box(-3.4, 8.2, -0.05, 0.28, -4.62, -4.5, M.concrete, { uv: false });
  box(-8.2, -3.2, -0.05, 0.28, -4.02, -3.9, M.concrete, { uv: false });
  box(-8.2, 8.2, -0.05, 0.28, 3.6, 3.72, M.concrete, { uv: false });
  box(8.1, 8.22, -0.05, 0.28, -4.62, 3.72, M.concrete, { uv: false });
  box(-8.22, -8.1, -0.05, 0.28, -4.02, 3.72, M.concrete, { uv: false });

  // roof (low gable, ridge along x), with a brick chimney where the hall meets the living room
  {
    const half = 4.9, rise = 1.5, L = Math.hypot(half, rise), a = Math.atan2(rise, half);
    for (const s of [-1, 1]) {
      const geo = new THREE.BoxGeometry(17.0, 0.14, L); worldUV(geo);
      const m = new THREE.Mesh(geo, M.roof); m.castShadow = m.receiveShadow = true;
      m.position.set(0, H + 0.1 + rise / 2, -0.45 + s * half / 2); m.rotation.x = s * a;
      house.add(m);
    }
    const peak = H + 0.1 + rise * (4.1 / half);
    const shape = new THREE.Shape([new THREE.Vector2(4.6, H + 0.1), new THREE.Vector2(-3.7, H + 0.1), new THREE.Vector2(0.45, peak)]);
    for (const x of [-8.18, 8.18]) {
      const g = new THREE.ShapeGeometry(shape); g.rotateY(Math.PI / 2);
      const m = new THREE.Mesh(g, M.gable); m.position.x = x; m.castShadow = true; house.add(m);
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
      pane.userData.noAO = true; pane.renderOrder = 2; house.add(pane);
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
  windowAt(true, -4.5, 6.9, 1, { w: 1.1, curtains: true });                                   // front: bedroom at the end
  windowAt(true, -4.5, 4.4, 1, { w: 1.3, curtains: true });                                   // front: bedroom
  windowAt(true, -4.5, -0.6, 1, { sill: 0.55, w: 2.4, h: 1.35, curtains: true });             // front: the picture window
  windowAt(false, 8.1, -3.5, -1, { w: 1.2, curtains: true });                                 // end wall: bedroom
  windowAt(false, 8.1, 2.85, -1, { w: 0.8, curtains: true });                                 // end wall: YOUR room's only window
  windowAt(false, -8.1, -1.6, 1, { w: 1.4 });                                                 // utility: two windows on the west end
  windowAt(false, -8.1, 1.8, 1, { w: 1.4 });
  windowAt(true, 3.6, 4.2, -1, { sill: 1.45, w: 0.6, h: 0.6 });                               // back: bathroom
  windowAt(true, 3.6, 1.4, -1, { sill: 1.0, w: 1.8, h: 0.9, curtains: true });                // back: kitchen, over the sink
  windowAt(true, 3.6, -2.3, -1, { w: 1.1, curtains: true });                                  // back: dining

  // ---------- doors (white six-panel) ----------
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
  // The four interior doors open and close (E), and the thing opens them too. closed/open = the leaf's direction from its hinge.
  const doors = {};
  const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
  function mkDoor(name, hx, hz, closed, open, col, mid, startOpen) {
    const g = door(hx, hz, closed[0], closed[1]);
    const rotC = Math.atan2(-closed[1], closed[0]), rotO = Math.atan2(-open[1], open[0]), c = solid(col[0], col[1], col[2], col[3], { door: name, on: !startOpen });
    const d = { name, g, a: startOpen ? 1 : 0, target: startOpen ? 1 : 0, rotC, rotO, col: c, mid: new THREE.Vector3(mid[0], 1.0, mid[1]) };
    const apply = () => { g.rotation.y = rotC + angDiff(rotC, rotO) * d.a; c.on = d.a < 0.35; };
    d.apply = apply; apply(); doors[name] = d;
  }
  mkDoor('room2', 3.45, -1.5, [1, 0], [0, -1], [3.45, 4.35, -1.54, -1.46], [3.9, -1.5], false);
  mkDoor('parents', 7.05, -1.5, [1, 0], [0, -1], [7.05, 7.95, -1.54, -1.46], [7.5, -1.5], false);
  mkDoor('bath', 3.7, -0.3, [1, 0], [0, 1], [3.7, 4.6, -0.34, -0.26], [4.15, -0.3], true);
  mkDoor('kid', 6.6, -0.3, [1, 0], [0, 1], [6.6, 7.5, -0.34, -0.26], [7.05, -0.3], true);
  let doorHook = null;
  const setDoor = (name, open, silent = false) => { const d = doors[name]; if (!d || d.target === (open ? 1 : 0)) return; d.target = open ? 1 : 0; if (doorHook && !silent) doorHook(name, open); };
  const updateDoors = (dt) => { for (const k in doors) { const d = doors[k]; if (d.a === d.target) continue; d.a += Math.sign(d.target - d.a) * Math.min(Math.abs(d.target - d.a), dt * 1.5); d.apply(); } };
  // the barn door into the utility room (at the dining end): a whitewashed Z-brace leaf on a black rail, slid open along the dining-room wall
  {
    const x = -3.3 + WT / 2 + 0.04;
    box(x, x + 0.04, 0.05, 2.1, 1.05, 2.25, M.barnDoor, { uv: false });
    box(x - 0.01, x + 0.06, 2.12, 2.17, -0.3, 2.6, M.black, { uv: false });
    for (const z of [1.35, 1.95]) box(x - 0.01, x + 0.06, 2.05, 2.15, z - 0.03, z + 0.03, M.black, { uv: false });
    box(x + 0.04, x + 0.07, 0.9, 1.3, 1.1, 1.14, M.black, { uv: false });
    const br = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 1.5), M.barnDoor); br.position.set(x + 0.055, 1.1, 1.65); br.rotation.x = -0.95; house.add(br);
  }

  // front door (open in the day, shut at night): hinged on the left jamb, swings into the living room
  const frontPivot = new THREE.Group(); frontPivot.position.set(1.4, 0, -4.5 + WT / 2); house.add(frontPivot);
  {
    const d = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.08, 0.05), M.doorW); d.position.set(0.5, 1.04, 0.0); d.castShadow = true; frontPivot.add(d);
    const lite = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.06), M.glassOut); lite.position.set(0.5, 1.45, 0); frontPivot.add(lite);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), M.brass); knob.position.set(0.9, 1.0, 0.05); frontPivot.add(knob);
  }
  const frontCollider = solid(1.35, 2.45, -4.6, -4.4, { on: false });
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
    solid(5.0, 7.22, 2.55, 3.55);
  }
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
    const bear = new THREE.Group(); const fur = std({ color: 0x7a5232, roughness: 1 });
    const s = (r, x, y, z) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), fur); m.position.set(x, y, z); m.castShadow = true; bear.add(m); };
    s(0.11, 0, 0.11, 0); s(0.08, 0, 0.27, 0.01); s(0.03, -0.06, 0.34, 0); s(0.03, 0.06, 0.34, 0); s(0.035, -0.1, 0.06, 0.06); s(0.035, 0.1, 0.06, 0.06);
    const eye = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.2 });
    for (const x of [-0.025, 0.025]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), eye); e.position.set(x, 0.29, 0.08); bear.add(e); }
    bear.position.set(6.83, 0.55, 3.0); bear.rotation.y = 2.7; house.add(bear); teddy = bear;
  }
  {
    // box TV on an oak stand against the bathroom wall, a braided rug, a heater
    rbox(5.1, 5.6, 0, 0.55, 0.5, 1.4, M.oak, 0.015);
    rbox(5.1, 5.55, 0.55, 1.2, 0.55, 1.35, M.crt, 0.03);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.52), M.crtScreen); scr.rotation.y = Math.PI / 2; scr.position.set(5.605, 0.9, 0.95); house.add(scr);
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
      const fr = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, h + 0.1, 0.03), M.darkWood); fr.position.set(0, -h / 2 - 0.05, -0.0); g.add(fr);
      const p = picture(w, h, 'family2'); p.position.set(0, -h / 2 - 0.05, 0.017); g.add(p); house.add(g);
      hallFrame = { g, y0: g.position.y, tilt(r) { g.rotation.z = r; }, fallen: false,
        // k: 0 hanging on the wall, 1 face-down on the floor. It speeds up as it goes (gravity)
        pose(k) { const e = k * k; g.position.set(xc + 0.25 * e, hallFrame.y0 + (0.06 - hallFrame.y0) * e, zf + 0.03 + 0.32 * e); g.rotation.set((-Math.PI / 2 + 0.1) * e, 0.4 * e, 0.2 * e); },
        fall() { hallFrame.fallen = true; hallFrame.pose(1); },
        reset() { hallFrame.fallen = false; g.position.set(xc, hallFrame.y0, zf + 0.03); g.rotation.set(0, 0, 0); } };
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
  const bathSink = new THREE.Vector3(4.5, 0.95, 0.9);
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
      const t = new THREE.Group(); t.position.set(3.83, 0, 1.9); t.rotation.y = Math.PI; house.add(t);
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
    rbox(2.45, 3.22, 0.04, 1.78, 0.0, 0.92, M.appW, 0.03);                                   // fridge body
    rbox(2.425, 2.45, 0.08, 1.74, 0.01, 0.9, M.appW, 0.012);                                  // the doors, a little proud
    box(2.42, 2.43, 0.08, 1.74, 0.45, 0.46, M.black, { uv: false });                            // seam between the freezer and fridge doors
    rbox(2.405, 2.425, 0.55, 1.35, 0.4, 0.43, M.steelSink, 0.008); rbox(2.405, 2.425, 0.55, 1.35, 0.485, 0.515, M.steelSink, 0.008);   // the two handles
    rbox(2.415, 2.428, 1.0, 1.4, 0.1, 0.36, M.black, 0.01);                                     // water and ice dispenser
    { const note = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.3), std({ color: 0xf2f0e8, roughness: 0.9 })); note.rotation.y = -Math.PI / 2; note.position.set(2.419, 1.42, 0.66); house.add(note); }
    rbox(2.6, 3.22, 0, 0.92, 1.0, 1.66, M.appW, 0.015); rbox(2.58, 3.22, 0.92, 0.945, 0.99, 1.67, M.black, 0.01);   // range
    for (const [bx, bz] of [[2.82, 1.17], [3.02, 1.17], [2.82, 1.49], [3.02, 1.49]]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.012, 20), std({ color: 0x151513, roughness: 0.5 })); b.position.set(bx, 0.95, bz); house.add(b); }
    rbox(2.575, 2.6, 0.3, 0.75, 1.07, 1.59, M.black, 0.01); rbox(2.55, 2.575, 0.7, 0.74, 1.07, 1.59, M.steelSink, 0.005);   // oven door and its handle
    rbox(2.58, 2.6, 0.78, 0.9, 1.05, 1.61, M.black, 0.008);                                       // control panel
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
  box(-3.0, -1.8, 0.7, 0.75, 1.7, 2.9, M.oak, { uv: false });
  tagEnd();
  const cDining = solid(-2.95, -1.85, 1.75, 2.85);

  // ---------- utility room (the lower wing): carpet tiles, the brick pillar with steps up to the living room, washer and dryer, black shelves ----------
  {
    box(-4.1, -3.65, 0, 1.0, -0.85, -0.4, M.brick, { uv: true }); box(-4.15, -3.6, 1.0, 1.06, -0.9, -0.35, M.concrete, { uv: false });
    solid(-4.15, -3.6, -0.9, -0.35);
    box(-4.4, -3.38, 0, 0.15, -0.1, 1.0, M.oak, { uv: false }); box(-3.9, -3.38, 0.15, 0.3, -0.1, 1.0, M.oak, { uv: false });
    rbox(-8.0, -7.35, 0, 0.9, -0.4, 0.25, M.appW, 0.02); rbox(-8.0, -7.35, 0, 0.9, 0.3, 0.95, M.appW, 0.02);
    for (const z of [-0.075, 0.625]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.03, 24), M.glassOut); w.rotation.z = Math.PI / 2; w.position.set(-7.34, 0.5, z); house.add(w); }
    rbox(-8.0, -7.35, 0.9, 0.93, -0.4, 0.95, M.appW, 0.01);
    solid(-8.05, -7.3, -0.45, 1.0);
    for (const y of [1.0, 1.45, 1.9]) box(-8.0, -7.6, y, y + 0.04, -3.7, -2.9, M.black, { uv: false }); for (const y of [1.2, 1.6]) box(-6.4, -5.2, y, y + 0.04, 3.45, 3.52, M.black, { uv: false });   // black floating shelves
    heater(-8.0, -7.92, 0.1, -0.5, 0.5);
    const mat = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.015, 0.6), std({ color: 0x3f5675, roughness: 1 })); mat.position.set(-4.9, 0.008, 0.45); house.add(mat);
  }

  // ---------- the two front bedrooms (doors stay closed): each has a closet on the hall wall and a low bed ----------
  {
    // the end bedroom: brown wood sliding closet doors
    rbox(6.1, 6.85, 0, 2.1, -2.15, -1.58, M.oak, 0.01); box(6.46, 6.49, 0.05, 2.05, -2.17, -2.15, M.black, { uv: false });
    rbox(6.1, 6.85, 2.1, 2.4, -2.15, -1.58, M.white, 0.01);
    solid(6.05, 6.9, -2.2, -1.5);
    // the parents' double bed: head on the west wall, a nightstand with a lamp, a floral quilt (the passage in front of the door and the closet stays clear)
    rbox(5.9, 7.9, 0.12, 0.4, -4.38, -2.98, M.oak, 0.02); rbox(5.93, 7.87, 0.4, 0.58, -4.35, -3.01, M.mattress, 0.05);
    rbox(5.9, 5.98, 0.4, 1.15, -4.38, -2.98, M.oak, 0.02); rbox(7.86, 7.9, 0.4, 0.62, -4.38, -2.98, M.oak, 0.02);
    for (const z of [-3.9, -3.4]) rbox(6.0, 6.5, 0.58, 0.68, z - 0.22, z + 0.22, M.pillow, 0.05);
    for (const [z0, z1] of [[-4.36, -4.34], [-3.02, -3.0]]) rbox(6.55, 7.88, 0.46, 0.66, z0, z1, M.floralB, 0.005);   // the quilt hangs over the sides
    rbox(7.86, 7.88, 0.46, 0.66, -4.36, -3.0, M.floralB, 0.005);
    // the quilt over the sleepers: a draped sheet that rises over each body (Mom and Dad's rigs lie under it, see sleepers() in main.js)
    // and breathes. set(false) flattens it: the bed looks slept in. one('dad', false) empties his side.
    bedSleepers = (() => {
      const cl = (v, a, b) => Math.max(a, Math.min(b, v));
      const g = new THREE.Group(); house.add(g);
      const X0 = 6.55, X1 = 7.88, Z0 = -4.34, Z1 = -3.02, TOP = 0.6;
      const geo = new THREE.PlaneGeometry(X1 - X0, Z1 - Z0, 34, 34); geo.rotateX(-Math.PI / 2); geo.translate((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
      const pos = geo.attributes.position, uv = geo.attributes.uv, n = pos.count, bm = new Float32Array(n), bd = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const x = pos.getX(i), z = pos.getZ(i); uv.setXY(i, x, z);
        // along the bed the rise peaks just past the shoulders, a hand's breadth over the chest, and tapers to the feet; at the pillow
        // end it dips so the heads show over it (Mom's chest tops out at 0.86, Dad's at 0.95, their feet at about 0.77)
        const along = cl((x - X0) / (X1 - X0), 0, 1), h = Math.min(0.31 - along * 0.08, 0.25 + along * 0.6);
        // across it, a flat-topped rise the width of a body, so a leg off the centre line is still under it; Dad is broader, and his
        // plateau stays high out to the wall edge so his far elbow is covered
        const dm = (z + 3.4) / 0.34, dd = (z + 3.95) / 0.45, dd6 = dd * dd * dd * dd * dd * dd;
        bm[i] = h * 1.10 * Math.exp(-dm * dm * dm * dm * 2); bd[i] = h * 1.22 * Math.exp(-dd6 * 2);
      }
      const quilt = new THREE.Mesh(geo, M.floralB); quilt.castShadow = quilt.receiveShadow = true; g.add(quilt);
      const fx = { group: g, quilt, amount: 1, target: 1, t: 0, side: { mom: 1, dad: 1 },
        set(on) { fx.target = on ? 1 : 0; fx.side.mom = fx.side.dad = 1; },
        one(name, on) { fx.side[name] = on ? 1 : 0; },
        update(dt) {
          fx.t += dt; fx.amount += (fx.target - fx.amount) * Math.min(1, dt * 2.5);
          // breathing only ever lifts the quilt above its resting shape (the resting shape is what clears the bodies)
          const fm = fx.amount * fx.side.mom * (1 + (0.5 - 0.5 * Math.cos(fx.t * 1.05)) * 0.06), fd = fx.amount * fx.side.dad * (1 + (0.5 - 0.5 * Math.cos(fx.t * 0.86)) * 0.07), flat = 0.05 * (1 - fx.amount);
          for (let i = 0; i < n; i++) pos.setY(i, TOP + 0.04 + bm[i] * fm + bd[i] * fd + flat * Math.sin(pos.getX(i) * 7) * Math.sin(pos.getZ(i) * 9));   // (rumpled when empty)
          pos.needsUpdate = true; geo.computeVertexNormals();
        } };
      fx.update(0);
      return fx;
    })();
    solid(5.85, 7.95, -4.42, -2.94);
    rbox(5.9, 6.3, 0, 0.55, -2.92, -2.55, M.oak, 0.015);
    { const lampM = new THREE.MeshStandardMaterial({ color: 0xf2e6c8, emissive: 0xffd9a0, emissiveIntensity: 0.0, roughness: 0.7 });
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.2, 14), M.brass); base.position.set(6.1, 0.65, -2.74); house.add(base);
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 0.2, 18, 1, true), lampM); shade.material.side = THREE.DoubleSide; shade.position.set(6.1, 0.87, -2.74); house.add(shade); }
    solid(5.85, 6.35, -2.96, -2.5);
    parentsBed = { mom: { x: 7.65, y: 0.74, z: -3.4 }, dad: { x: 7.8, y: 0.74, z: -3.95 } };
    // the other bedroom: vertical-plank wood closet doors
    rbox(4.45, 5.5, 0, 2.1, -2.15, -1.58, M.oak, 0.01); for (let i = 1; i < 6; i++) box(4.45 + i * 0.175 - 0.006, 4.45 + i * 0.175 + 0.006, 0.05, 2.05, -2.165, -2.15, M.black, { uv: false });
    rbox(4.45, 5.5, 2.1, 2.4, -2.15, -1.58, M.white, 0.01);
    solid(4.4, 5.55, -2.2, -1.5);
    rbox(3.4, 5.35, 0, 0.5, -4.4, -3.45, M.oak, 0.02); rbox(3.43, 5.32, 0.4, 0.6, -4.37, -3.48, M.mattress, 0.04); rbox(3.95, 5.32, 0.55, 0.64, -4.35, -3.5, M.floralB, 0.02); rbox(3.46, 3.95, 0.58, 0.7, -4.25, -3.62, M.pillow, 0.05); solid(3.35, 5.4, -4.45, -3.4);   // the spare room's bed runs along the front wall so the door and closet stay reachable
  }

  // moving boxes around the house
  const boxTex = [TX.cardboard('KITCHEN', 3), TX.cardboard('BOOKS', 4), TX.cardboard('MISC', 5), TX.cardboard('KIDS ROOM', 6)];
  const boxMats = boxTex.map((t) => std({ map: t, roughness: 0.9 }));
  const cardboardBox = (x, y, z, w = 0.5, h = 0.44, d = 0.5, mi = 0, rot = 0, parent = house) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), boxMats[mi]); m.position.set(x, y + h / 2, z); m.rotation.y = rot; m.castShadow = m.receiveShadow = true; parent.add(m); return m;
  };
  cardboardBox(-4.4, 0, -3.2, 0.55, 0.45, 0.5, 3, 0.2); cardboardBox(-4.4, 0.45, -3.2, 0.5, 0.4, 0.45, 1, -0.15); cardboardBox(-5.1, 0, -3.3, 0.5, 0.44, 0.5, 2, 0.1); solid(-5.45, -4.05, -3.65, -2.9);   // more boxes in the utility room
  cardboardBox(-5.0, 0, 2.8, 0.6, 0.5, 0.5, 2, 0.2); cardboardBox(-4.95, 0.5, 2.8, 0.5, 0.4, 0.45, 1, -0.1); solid(-5.35, -4.65, 2.45, 3.15);   // in the utility room

  // the breaker box on the utility room's front wall
  { const steel = std({ color: 0x8f969c, roughness: 0.5, metalness: 0.4 });
    rbox(-5.75, -5.25, 1.15, 1.75, -3.84, -3.73, steel, 0.01);
    for (let i = 0; i < 6; i++) rbox(-5.68 + (i % 2) * 0.25, -5.6 + (i % 2) * 0.25, 1.28 + Math.floor(i / 2) * 0.15, 1.34 + Math.floor(i / 2) * 0.15, -3.73, -3.715, M.black, 0.004);
    solid(-5.85, -5.15, -3.95, -3.55); }

  // ---------- furniture: each model replaces its stand-in (and collider) as it loads ----------
  const PI = Math.PI;
  const prop = (name, o, { tag, old = [], box: sb, after } = {}) => place(house, name, {
    ...o, hide: tag ? tagged[tag] || [] : [],
    onLoad: () => { old.forEach((c) => { c.on = false; }); if (sb) solid(...sb); if (after) after(); },
  });
  // living room
  prop('table', { x: 2.9, z: -3.2, rot: -PI / 2 }, { tag: 'tv', old: [cTv], box: [2.45, 3.25, -3.95, -2.45] });
  const tvSet = prop('tv', { x: 2.95, y: 0.55, z: -3.2, rot: -PI / 2 }, { after: () => plainTv(tvSet) });
  prop('sofa', { x: -2.6, z: -2.4, rot: PI / 2 }, { tag: 'couch', old: [cCouch], box: [-3.05, -2.15, -3.3, -1.5] });
  prop('table', { x: -1.2, z: -3.0, rot: PI / 2 }, { tag: 'coffee', old: [cCoffee], box: [-1.6, -0.8, -3.9, -2.1] });   // (pushed toward the front wall so there is a lane behind it through the living room)
  prop('armchair', { x: -2.55, z: -4.05, rot: 0 }, { box: [-2.98, -2.12, -4.42, -3.66] });   // front-left corner, clear of the picture window and of the lane through the living room
  prop('cabinet', { x: -0.2, z: -0.7, rot: PI, s: 0.9 }, { box: [-1.14, 0.74, -1.02, -0.38] });   // the china hutch: against the arch wall, to the right of the archway as you face it from the living room
  prop('plant2', { x: 2.85, z: -1.85 }, { box: [2.55, 3.15, -2.15, -1.55] });
  prop('clock_wall', { x: 3.21, y: 1.74, z: -3.05, rot: -PI / 2 });
  // kitchen and dining: the round table, chairs, a kettle and a pot on the stove
  {
    const cx = -2.1, cz = 2.3;
    prop('table_round', { x: cx, z: cz, s: 0.77 }, { tag: 'dining', old: [cDining], box: [cx - 0.55, cx + 0.55, cz - 0.55, cz + 0.55] });
    for (const [dx, dz, r] of [[-0.83, 0, PI / 2], [0.83, 0, -PI / 2], [0, -0.9, 0], [0, 0.9, PI]]) chairs.push({ holder: prop('chair', { x: cx + dx, z: cz + dz, rot: r }, { tag: 'dining' }), x: cx + dx, z: cz + dz, rot: r });
    prop('kettle', { x: 2.82, y: 0.96, z: 1.17, rot: 0 });
    prop('pot', { x: 3.02, y: 0.96, z: 1.49, rot: 0 });
    prop('plant1', { x: -2.9, z: 3.2 }, { box: [-3.15, -2.65, 2.9, 3.45] });
  }

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
    plane.rotation.y = -Math.PI / 2; plane.position.set(2.711, 0.815, -3.266); plane.visible = false; house.add(plane);
    const light = new THREE.PointLight(0x9db6ff, 0, 7, 1.6); light.position.set(2.2, 1.0, -3.2); scene.add(light);
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
      setRinging(on) { ph.ringing = on; led.emissiveIntensity = on ? 1.5 : 0; },
      pickUp() { ph.off = true; hand.position.set(-0.02, -0.28, 0.14); hand.rotation.set(0.5, 0, 0.3); },
      hangUp() { ph.off = false; hand.position.set(0, 0.04, 0.075); hand.rotation.set(0, 0, 0); },
      tick(t) { if (ph.ringing) { const on = (t % 1.6) < 0.8; led.emissiveIntensity = on ? 2 : 0; hand.rotation.z = on ? Math.sin(t * 90) * 0.04 : 0; } } };
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
    // a handprint on the breaker box door
    kit('HANDPRINT', (g) => { const d = decal(2, 0.3, 0.3, decalMat(0.8)); d.position.set(-5.47, 1.47, -3.708); d.rotation.z = 0.12; g.add(d); });
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
    const spot = new THREE.SpotLight(0xffd29a, 0, 11, 1.3, 1.0, 2); spot.position.set(x, H - 0.3, z); spot.target.position.set(x, 0, z);
    scene.add(spot, spot.target);
    // (visibility only changes with the story phase: a changing number of lights recompiles every shader)
    const L = { get intensity() { return spot.intensity / 1.7; }, set intensity(v) { spot.intensity = v * 1.7; }, set visible(v) { spot.visible = v; } };
    bulbs[name] = { light: L, dome, base: intensity };
  };
  fixture('bed', 6.5, 1.4); fixture('hall1', 4.8, -0.9); fixture('hall2', 7.0, -0.9); fixture('bath', 4.15, 1.0, 7);
  fixture('living', 0, -2.4, 10); fixture('kitchen', 0.3, 1.5, 10); fixture('parents', 7.0, -3.1, 8); fixture('room2', 4.55, -3.1, 8);

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
  // inner faces: hall walls at z = -0.38 (north side) and -1.42 (south side), end wall x = 8.02
  outlet(6.5, 0.35, -0.38, 0, -1, true);       // hall, under the photos
  outlet(5.4, 0.33, -1.42, 0, 1, true);        // hall, by the bedroom doors
  outlet(8.02, 0.33, -0.9, -1, 0, true);       // hall, at the dead end by your door
  outlet(7.85, 0.32, -0.22, 0, 1, true);       // your room, beside the door
  outlet(3.38, 0.34, 1.0, 1, 0, true);         // bathroom
  outlet(0.85, 0.34, -0.38, 0, -1, true);      // living room, on the arch wall
  for (const [x, y, z, nx, nz] of [[0.4, 0.33, -0.38, 0, -1], [5.08, 0.4, 2.6, 1, 0], [3.5, 0.3, -1.42, 0, 1], [1.5, 1.05, 3.5, 0, -1]]) outlet(x, y, z, nx, nz, false);

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
  fills.forEach((f) => scene.add(f));

  // the hall spot: from the living-room end it lights the thing from behind and throws its long shadow down the hall
  const bathSpot = new THREE.SpotLight(0xffcf7a, 0, 32, 0.3, 0.35, 1.5);
  bathSpot.position.set(-1.5, 2.4, -0.9); bathSpot.target.position.set(7, 0.2, -0.9);
  bathSpot.castShadow = true; bathSpot.shadow.mapSize.set(1024, 1024); bathSpot.shadow.camera.near = 0.3; bathSpot.shadow.camera.far = 32; bathSpot.shadow.bias = -0.0005;
  scene.add(bathSpot, bathSpot.target);

  // brick-edged planter along the front wall under the picture window, with shrubs; the stoop at the front door
  box(-1.9, 0.9, 0, 0.3, -5.3, -4.7, M.brick, { uv: true }); box(-1.8, 0.8, 0.28, 0.32, -5.2, -4.8, M.dirt, { cast: false });
  for (const x of [-1.4, -0.6, 0.1, 0.6]) { const sh = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), M.leaves); sh.position.set(x, 0.35, -5.0); sh.scale.y = 0.6; sh.castShadow = true; house.add(sh); }
  box(1.0, 2.8, -0.05, 0.14, -5.5, -4.5, M.concrete, { uv: false }); box(1.3, 2.5, -0.05, 0.07, -6.0, -5.5, M.concrete, { uv: false });
  const porchLight = new THREE.PointLight(0xffc880, 0, 6, 2); porchLight.position.set(0.9, 2.1, -4.9); scene.add(porchLight);
  const porchBulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), M.lamp.clone()); porchBulb.position.set(0.9, 2.15, -4.6); house.add(porchBulb);

  // ---------- yard ----------
  M.asphalt = std({ color: 0x2b2b2d, roughness: 0.92 }); M.asphalt.userData.worldUV = true; applyPBR(M.asphalt, 'concrete', { tint: 0x3a3a3c });
  box(-260, 260, -0.4, -0.02, -260, 260, M.grass, { cast: false, parent: yard });
  box(-6, 8.5, -0.02, -0.008, -29, -6.2, M.dirt, { cast: false, parent: yard });   // the gravel drive up from the road
  box(-260, 260, -0.4, -0.005, -33.5, -27.5, M.asphalt, { cast: false, parent: yard });   // the road along the front of the property
  for (let x = -120; x < 120; x += 6) box(x, x + 3, -0.006, -0.004, -30.6, -30.4, std({ color: 0xc9b24a, roughness: 0.8 }), { uv: false, cast: false, parent: yard });
  // moving truck (parked on the gravel, backed toward the house)
  const TG = new THREE.Group(); TG.position.set(-10.7, 0, 2.5); yard.add(TG);
  // the cargo box is hollow with the back open, so the family can walk up the ramp and carry things out
  box(11.8, 14.2, 0.55, 0.66, -24, -17, M.truck, { uv: false, parent: TG });                // floor
  box(11.8, 11.88, 0.55, 3.15, -24, -17, M.truck, { uv: false, parent: TG }); box(14.12, 14.2, 0.55, 3.15, -24, -17, M.truck, { uv: false, parent: TG });   // sides
  box(11.8, 14.2, 3.07, 3.15, -24, -17, M.truck, { uv: false, parent: TG }); box(11.8, 14.2, 0.55, 3.15, -24, -23.92, M.truck, { uv: false, parent: TG });   // roof and front wall
  for (const x of [11.795, 14.2]) box(x, x + 0.005, 1.25, 1.55, -23.95, -17.05, std({ color: 0x2e6e8e, roughness: 0.5 }), { uv: false, parent: TG });   // stripe
  {   // what is still in the back: a stack of boxes, a rolled mattress and a lamp, all of it where the family reaches in
    const stack = [[12.4, 0.66, -18.3, 0.62, 0.5, 0.5, 0, 0.1], [13.1, 0.66, -18.3, 0.6, 0.46, 0.5, 1, -0.05], [13.8, 0.66, -18.2, 0.55, 0.5, 0.5, 2, 0.12], [12.7, 1.16, -18.3, 0.55, 0.46, 0.5, 3, 0.2], [13.4, 1.12, -18.3, 0.58, 0.5, 0.5, 0, -0.1],
      [12.5, 0.66, -19.4, 0.6, 0.5, 0.55, 2, 0], [13.2, 0.66, -19.4, 0.6, 0.5, 0.55, 1, 0.1], [13.0, 1.16, -19.4, 0.6, 0.5, 0.55, 0, 0.05]];
    for (const [x, y, z, w, h, d, mi, r] of stack) cardboardBox(x, y, z, w, h, d, mi, r, TG);
    const mat = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.7, 16), std({ color: 0xc9c2a8, roughness: 1 })); mat.rotation.z = Math.PI / 2; mat.position.set(13.2, 1.0, -21.6); TG.add(mat);
  }
  box(11.9, 14.1, 0.4, 2.3, -26.4, -24, M.truckCab, { uv: false, parent: TG });
  { const ws = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.7), M.glassOut); ws.position.set(13, 1.85, -26.41); ws.rotation.y = Math.PI; TG.add(ws); }
  for (const [x, z] of [[11.75, -25.4], [14.25, -25.4], [11.75, -22.6], [14.25, -22.6], [11.75, -18.2], [14.25, -18.2]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 20), M.tire); w.rotation.z = Math.PI / 2; w.position.set(x, 0.42, z); w.castShadow = true; TG.add(w);
  }
  {
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.05, 3.05), M.metal); ramp.position.set(13, 0.28, -15.5); ramp.rotation.x = 0.18; ramp.castShadow = ramp.receiveShadow = true; TG.add(ramp);
  }
  solid(1.05, 3.65, -24, -14.4);
  // pickup boxes
  const pickups = [
    cardboardBox(1.3, 0, -12.3, 0.5, 0.44, 0.5, 3, 0.15, yard),
    cardboardBox(3.45, 0, -12.7, 0.5, 0.44, 0.5, 3, -0.3, yard),
    cardboardBox(3.3, 0, -11.7, 0.5, 0.44, 0.5, 3, 0.4, yard),
  ];
  const dropSpots = [new THREE.Vector3(5.45, 0.55, 3.0), new THREE.Vector3(6.05, 0.55, 3.0), new THREE.Vector3(6.65, 0.55, 3.0)];   // on the bottom bunk

  // the detached two-car garage (brown siding, gray shingles) behind the house on the left: its doors face the house, a side door faces
  // the concrete apron. An arborvitae hedge runs along the east side. The garage is built in its own frame and GAR moves it into place.
  const GAR = { x: -4, z: 20 };
  {
    const GG = new THREE.Group(); GG.position.set(GAR.x, 0, GAR.z); yard.add(GG);
    box(-15.6, -9, 0, 3.0, -10, -3.6, M.siding, { parent: GG });
    const half = 3.5, rise = 1.3, L = Math.hypot(half, rise), a = Math.atan2(rise, half);
    for (const s2 of [-1, 1]) {
      const geo = new THREE.BoxGeometry(7.4, 0.14, L); worldUV(geo);
      const m = new THREE.Mesh(geo, M.roof); m.castShadow = m.receiveShadow = true; m.position.set(-12.3, 3.0 + rise / 2, -6.8 + s2 * half / 2); m.rotation.x = s2 * a; GG.add(m);
    }
    const gshape = new THREE.Shape([new THREE.Vector2(10, 3.0), new THREE.Vector2(-3.6, 3.0), new THREE.Vector2(6.8, 3.0 + rise * 0.93)]);
    for (const x of [-8.99, -15.61]) { const g = new THREE.ShapeGeometry(gshape); g.rotateY(Math.PI / 2); const m = new THREE.Mesh(g, M.gable); m.position.x = x; GG.add(m); }
    box(-15.0, -9.6, 0.1, 2.5, -10.03, -10.0, M.garageDoor, { uv: false, parent: GG });
    for (let y = 0.7; y < 2.5; y += 0.6) box(-15.0, -9.6, y, y + 0.03, -10.06, -10.03, M.black, { uv: false, parent: GG });
    { const d = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.04, 0.05), M.doorW); d.rotation.y = Math.PI / 2; d.position.set(-8.97, 1.02, -9.0); GG.add(d); }
    solid(-15.7 + GAR.x, -8.9 + GAR.x, -10.1 + GAR.z, -3.5 + GAR.z);
    // the concrete apron between the house and the garage
    box(-13 + GAR.x + 6.6, -6.4, -0.02, 0.012, 3.4, 12, M.concrete, { parent: yard, cast: false });
    const hedge = new THREE.InstancedMesh(new THREE.ConeGeometry(0.55, 3.6, 10), M.leaves, 12), m4 = new THREE.Matrix4();
    for (let i = 0; i < 12; i++) { m4.makeTranslation(9.8, 1.8, -5.5 + i * 1.0); hedge.setMatrixAt(i, m4); }
    hedge.castShadow = true; yard.add(hedge); solid(9.2, 10.4, -6, 5.6);
  }
  // utility poles along the road (they also give the road something to rush past when you are in a car)
  {
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.18, 8, 8), M.darkWood, 28), arms = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.12, 2.4), M.darkWood, 28), mm = new THREE.Matrix4(); let n = 0;
    for (let x = -240; x <= 240 && n < 28; x += 40) { mm.makeTranslation(x, 4, -26.2); poles.setMatrixAt(n, mm); mm.makeTranslation(x, 7.6, -26.2); arms.setMatrixAt(n, mm); n++; }
    poles.count = arms.count = n; poles.castShadow = true; yard.add(poles, arms);
    const wire = new THREE.Mesh(new THREE.BoxGeometry(480, 0.02, 0.02), M.black); wire.position.set(0, 7.5, -26.2); yard.add(wire);
  }
  // the property lines: a weathered wood fence along the west, back and east edges (the front is the road). Past it the fog takes over.
  {
    const FX0 = -27, FX1 = 27, FZ0 = -26, FZ1 = 28, mat = M.fence;
    box(FX0, FX0 + 0.06, 0, 1.8, FZ0, FZ1, mat, { parent: yard, uv: true }); box(FX1 - 0.06, FX1, 0, 1.8, FZ0, FZ1, mat, { parent: yard, uv: true });
    box(FX0, FX1, 0, 1.8, FZ1 - 0.06, FZ1, mat, { parent: yard, uv: true });
    solid(FX0 - 0.3, FX0 + 0.3, FZ0, FZ1); solid(FX1 - 0.3, FX1 + 0.3, FZ0, FZ1); solid(FX0, FX1, FZ1 - 0.3, FZ1 + 0.3);
    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 2.0, 0.14), M.darkWood, 60), mm = new THREE.Matrix4(); let n = 0;
    for (let z = FZ0; z <= FZ1 && n < 60; z += 3) { mm.makeTranslation(FX0 + 0.03, 1.0, z); posts.setMatrixAt(n++, mm); mm.makeTranslation(FX1 - 0.03, 1.0, z); posts.setMatrixAt(n++, mm); }
    posts.count = n; posts.castShadow = true; yard.add(posts);
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
  // trees (a deciduous model) around the house, ground-cover tufts, and rocks (instanced)
  {
    const r = TX.rng(4242), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const ok = (x, z, pad = 0) => !(x > -9.5 - pad && x < 10.5 + pad && z > -6.5 - pad && z < 5 + pad) && !(x > -1 - pad && x < 5.5 + pad && z < -6 && z > -34) && !(x > -21 - pad && x < -12 + pad && z > 8 - pad && z < 18 + pad);   // not on the house, porch path or truck
    const trees = [[-14, 7], [-19, -4], [-13, -16], [29, 9], [33, -6], [27, -24], [-12, -22], [31, -32], [8, 14], [20, 15], [-24, 13], [38, 2], [6, -8]];   // the last is the cherry tree by the front
    const tm = trees.map(([x, z]) => { const k = 1.5 + r() * 1.1; q.setFromAxisAngle(up, r() * 6.28); return m4.clone().compose(new THREE.Vector3(x, -0.02, z), q, sc.set(k, k, k)); });
    const near = tm.filter((m) => Math.hypot(m.elements[12], m.elements[14]) < 32);   // only the trees by the house cast shadows (the rest are too far to matter)
    scatter(yard, 'tree_small', near); scatter(yard, 'tree_small', tm.filter((m) => !near.includes(m)), { cast: false });
    trees.forEach(([x, z]) => solid(x - 0.5, x + 0.5, z - 0.5, z + 0.5));
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
  sun.position.set(40, 45, -30); sun.target.position.set(0, 0, 0);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 140 });
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.025; sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  scene.userData.shadowLights = [{ light: sun, sun: true }, { light: bathSpot, sun: false }];

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
    doors, setDoor, updateDoors, setDoorHook: (f) => { doorHook = f; }, parentsBed, bedSleepers, tvFx, phone, mirrorFx,
    get hallFrame() { return hallFrame; }, chairs, moveChair: (i, x, z, rot) => { const c = chairs[i]; if (c) { c.holder.position.x = x; c.holder.position.z = z; if (rot !== undefined) c.holder.rotation.y = rot; } },
    get teddy() { return teddy; }, moveTeddy: (x, y, z) => { if (teddy) teddy.position.set(x, y, z); },
    curtainSee: (on) => { M.showerCurtain.opacity = on ? 0.38 : 1; M.showerCurtain.depthWrite = !on; },
    proof,
  };
}
