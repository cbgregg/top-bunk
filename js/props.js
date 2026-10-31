// Furniture and plants: Poly Haven models (CC0, tools/assets/fetch_models.py) and Sketchfab models (CC0 and CC-BY, listed in CREDITS.md,
// tools/assets/fetch_sketchfab.py), compressed to assets/props/*.glb.
// Model front is +Z, units are metres, and each one is placed by its footprint centre with its base on y.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map();

// props that keep their metal and gloss; everything else is made matte
const SHINY = new Set(['mirror', 'kettle', 'desk_lamp', 'washer', 'dryer', 'stove', 'fridge', 'tv', 'crt_pc', 'clock_wall', 'filing', 'office_chair', 'outlet', 'switch']);
const METAL = new Set(['mirror', 'kettle', 'desk_lamp', 'washer', 'dryer', 'stove', 'filing', 'office_chair']);

function matte(m, name) {
  if (!m.isMeshStandardMaterial) return;
  if (!METAL.has(name)) m.metalness = m.metalnessMap ? Math.min(m.metalness, 0.15) : 0;
  if (!SHINY.has(name)) m.roughness = m.roughnessMap ? m.roughness : Math.max(m.roughness, 0.7);
  else if (!m.roughnessMap) m.roughness = Math.max(m.roughness, name === 'mirror' ? 0 : 0.3);
}

function prepare(g, name) {
  g.scene.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = true;
    for (const m of [].concat(o.material)) matte(m, name);
    for (const m of [].concat(o.material)) if (m.map && (m.transparent || m.alphaTest > 0)) { m.transparent = false; m.alphaTest = 0.5; m.side = THREE.DoubleSide; m.depthWrite = true; }   // leaf cards
  });
  g.scene.updateMatrixWorld(true);
  g.box = new THREE.Box3().setFromObject(g.scene);
  return g;
}
export const loadProp = (name) => {
  if (!cache.has(name)) cache.set(name, new Promise((res, rej) => loader.load(`assets/props/${name}.glb`, res, undefined, rej)).then((g) => prepare(g, name)));
  return cache.get(name);
};

// One model: footprint centre (x, z), base on y, facing rot (radians, front = +Z), uniform scale s.
// wall: a plate on a wall instead: (x, y, z) is on the wall face, the model is centred there and its front face sits `proud` metres off the
// wall, the rest of it inside the wall. The front is the model's -Z face (its +Z face with flip), rot still says where the room is.
// hide: the stand-in meshes, hidden once the model is in. onLoad(holder, box, model) runs then too (for colliders).
export function place(parent, name, { x, y = 0, z, rot = 0, s = 1, wall = false, flip = false, proud = 0.012, hide = [], onLoad } = {}) {
  const holder = new THREE.Group(); holder.userData.prop = name; holder.position.set(x, y, z); holder.rotation.y = rot + (wall && !flip ? Math.PI : 0); parent.add(holder);
  loadProp(name).then((g) => {
    const m = g.scene.clone(true), b = g.box;
    m.scale.setScalar(s);
    if (wall) m.position.set(-(b.min.x + b.max.x) / 2 * s, -(b.min.y + b.max.y) / 2 * s, flip ? -b.max.z * s + proud : -b.min.z * s - proud);
    else m.position.set(-(b.min.x + b.max.x) / 2 * s, -b.min.y * s, -(b.min.z + b.max.z) / 2 * s);
    holder.add(m);
    for (const h of hide) h.visible = false;
    if (onLoad) onLoad(holder, b, m);
  }).catch((e) => console.warn('prop failed, keeping the stand-in:', name, e));
  return holder;
}

// Many copies of one model as instanced meshes. mats: Matrix4[] of where each copy goes (feet at the local origin).
export function scatter(parent, name, mats, { cast = true } = {}) {
  loadProp(name).then((g) => {
    const b = g.box, norm = new THREE.Matrix4().makeTranslation(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2), out = new THREE.Group(), t = new THREE.Matrix4();
    g.scene.traverse((o) => {
      if (!o.isMesh) return;
      const im = new THREE.InstancedMesh(o.geometry, o.material, mats.length), local = new THREE.Matrix4().multiplyMatrices(norm, o.matrixWorld);
      mats.forEach((m, i) => im.setMatrixAt(i, t.multiplyMatrices(m, local)));
      im.castShadow = cast; im.receiveShadow = true; im.computeBoundingSphere(); out.add(im);   // culled as a group, by the sphere around every copy
    });
    parent.add(out);
  }).catch((e) => console.warn('scatter failed:', name, e));
}
