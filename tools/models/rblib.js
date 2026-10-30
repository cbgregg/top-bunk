import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const MAP = [   // [target bone (Rocketbox Biped), source bone (Mixamo), target child, source child]
  ['Bip01_Pelvis', 'mixamorigHips'],
  ['Bip01_Spine', 'mixamorigHips', 'Bip01_Spine1', 'mixamorigSpine1'],
  ['Bip01_Spine1', 'mixamorigSpine', 'Bip01_Spine2', 'mixamorigSpine2'],
  ['Bip01_Spine2', 'mixamorigSpine2', 'Bip01_Neck', 'mixamorigNeck'],
  ['Bip01_Neck', 'mixamorigNeck', 'Bip01_Head', 'mixamorigHead'],
  ['Bip01_Head', 'mixamorigHead'],
  ...['L', 'R'].flatMap((s) => { const S = s === 'L' ? 'Left' : 'Right'; return [
    [`Bip01_${s}_Clavicle`, `mixamorig${S}Shoulder`, `Bip01_${s}_UpperArm`, `mixamorig${S}Arm`],
    [`Bip01_${s}_UpperArm`, `mixamorig${S}Arm`, `Bip01_${s}_Forearm`, `mixamorig${S}ForeArm`],
    [`Bip01_${s}_Forearm`, `mixamorig${S}ForeArm`, `Bip01_${s}_Hand`, `mixamorig${S}Hand`],
    [`Bip01_${s}_Hand`, `mixamorig${S}Hand`],
    [`Bip01_${s}_Thigh`, `mixamorig${S}UpLeg`, `Bip01_${s}_Calf`, `mixamorig${S}Leg`],
    [`Bip01_${s}_Calf`, `mixamorig${S}Leg`, `Bip01_${s}_Foot`, `mixamorig${S}Foot`],
    [`Bip01_${s}_Foot`, `mixamorig${S}Foot`, `Bip01_${s}_Toe0`, `mixamorig${S}ToeBase`],
  ]; }),
];

const wq = (o) => o.getWorldQuaternion(new THREE.Quaternion());
const wp = (o) => o.getWorldPosition(new THREE.Vector3());

// Bake a Mixamo clip (played on srcRoot) onto the Rocketbox skeleton in tgtRoot as a quaternion-only clip.
export function retargetClip(tgtRoot, srcRoot, clip, name, fps = 30) {
  const byName = (root) => { const m = {}; root.traverse((o) => { m[o.name] = o; }); return m; };
  const T = byName(tgtRoot), S = byName(srcRoot);
  const mixer = new THREE.AnimationMixer(srcRoot);
  // rest data (before the mixer touches anything)
  srcRoot.updateMatrixWorld(true); tgtRoot.updateMatrixWorld(true);
  const rest = MAP.map(([tn, sn, tc, sc]) => {
    const t = T[tn], s = S[sn]; if (!t || !s) throw new Error('missing bone ' + tn + ' / ' + sn);
    let A = new THREE.Quaternion();
    if (tc && sc && T[tc] && S[sc]) {
      const dT = wp(T[tc]).sub(wp(t)).normalize(), dS = wp(S[sc]).sub(wp(s)).normalize();
      A.setFromUnitVectors(dT, dS);
    }
    return { t, s, A, restS: wq(s), restT: wq(t), restLocal: t.quaternion.clone() };
  });
  const times = [], vals = rest.map(() => []);
  const n = Math.max(2, Math.round(clip.duration * fps));
  const action = mixer.clipAction(clip); action.play();
  const q = new THREE.Quaternion(), qp = new THREE.Quaternion(), dW = new THREE.Quaternion();
  for (let i = 0; i < n; i++) {
    const tt = (i / n) * clip.duration; times.push(tt);
    mixer.setTime(tt); srcRoot.updateMatrixWorld(true);
    rest.forEach((r, k) => {
      dW.copy(wq(r.s)).multiply(r.restS.clone().invert());
      q.copy(dW).multiply(r.A).multiply(r.restT);                       // desired world rotation
      r.t.parent.updateWorldMatrix(true, false); qp.copy(wq(r.t.parent)).invert();
      r.t.quaternion.copy(qp.multiply(q)); r.t.updateMatrix(); r.t.updateMatrixWorld(true);
      vals[k].push(...r.t.quaternion.toArray());
    });
  }
  action.stop(); mixer.uncacheRoot(srcRoot);
  rest.forEach((r) => r.t.quaternion.copy(r.restLocal)); tgtRoot.updateMatrixWorld(true);
  return new THREE.AnimationClip(name, clip.duration, rest.map((r, k) => new THREE.QuaternionKeyframeTrack(r.t.name + '.quaternion', times, vals[k])));
}

export const loadFBX = (u) => new Promise((res, rej) => new FBXLoader().load(u, res, undefined, rej));
export const loadGLB = (u) => new Promise((res, rej) => new GLTFLoader().load(u, res, undefined, rej));
export const loadTex = (u, srgb = true) => new Promise((res) => new THREE.TextureLoader().load(u, (t) => { if (srgb) t.colorSpace = THREE.SRGBColorSpace; res(t); }));

// cut the triangles of one material out of a mesh (FBXLoader meshes are non-indexed, one group per material run)
function dropMaterial(o, re) {
  const mats = [].concat(o.material), geo = o.geometry;
  if (geo.index || !Array.isArray(o.material)) throw new Error('dropMaterial: expected a non-indexed multi-material mesh');
  const keep = mats.map((m) => !re.test(m.name || '')), remap = []; let n = 0;
  keep.forEach((k, i) => { if (k) remap[i] = n++; });
  const runs = geo.groups.filter((gr) => keep[gr.materialIndex]), total = runs.reduce((a, gr) => a + gr.count, 0);
  for (const [key, attr] of Object.entries(geo.attributes)) {
    const s = attr.itemSize, arr = new attr.array.constructor(total * s); let p = 0;
    for (const gr of runs) { arr.set(attr.array.subarray(gr.start * s, (gr.start + gr.count) * s), p); p += gr.count * s; }
    geo.setAttribute(key, new THREE.BufferAttribute(arr, s, attr.normalized));
  }
  geo.clearGroups(); let start = 0;
  for (const gr of runs) { geo.addGroup(start, gr.count, remap[gr.materialIndex]); start += gr.count; }
  geo.computeBoundingBox(); geo.computeBoundingSphere();
  o.material = mats.filter((m, i) => keep[i]);
}

// FBX avatar -> textured group (cm units, T-pose); strips the stray FBX light.
// hair: false leaves out the hair cards (the *_opacity part) and their map: grandpa's cards show ragged dark tips
// against the light, and the grey hair painted on his head texture reads fine without them
export async function buildAvatar(name, { hair = true } = {}) {
  const g = await loadFBX('rb/' + name + '.fbx');
  g.children.filter((c) => c.isLight).forEach((l) => g.remove(l));
  const [body, head, op] = await Promise.all([loadTex('rb/' + name + '/body.jpg'), loadTex('rb/' + name + '/head.jpg'), hair ? loadTex('rb/' + name + '/opacity.png') : null]);
  body.userData.mimeType = 'image/jpeg'; head.userData.mimeType = 'image/jpeg';
  g.traverse((o) => { if (!o.isSkinnedMesh) return;
    if (!hair) dropMaterial(o, /opacity/);
    o.frustumCulled = false; o.castShadow = true; o.receiveShadow = true;
    const ms = [].concat(o.material).map((m) => { const nm = m.name || ''; const mm = new THREE.MeshStandardMaterial({ name: nm, roughness: 0.85, metalness: 0 });
      if (/body/.test(nm)) mm.map = body; else if (/head/.test(nm)) mm.map = head; else { mm.map = op; mm.transparent = false; mm.alphaTest = 0.45; mm.side = THREE.DoubleSide; }
      return mm; });
    o.material = Array.isArray(o.material) ? ms : ms[0]; });
  return g;
}
