// The real people: Microsoft Rocketbox characters (assets/models/*.glb, MIT) share one Biped skeleton and one baked
// animation set (assets/models/anims.glb: Mixamo idle/walk/run/etc. retargeted onto that skeleton).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const load = (url) => new Promise((res, rej) => loader.load(url, res, undefined, rej));
let animsP = null;
export const loadAnims = () => (animsP ||= load('assets/models/anims.glb').then((g) => g.animations));
export const loadModel = (name) => load(`assets/models/${name}.glb`);

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const ID = new THREE.Quaternion();

export class Rig {
  constructor(gltf, clips) {
    this.root = gltf.scene;                       // centimetres, T-pose, faces +Z, feet on y = 0
    this.root.updateMatrixWorld(true);
    this.bones = {}; this.restQ = {}; this.restLocal = {};
    this.root.traverse((o) => {
      if (o.isSkinnedMesh) { o.frustumCulled = false; o.castShadow = true; o.receiveShadow = true; }
      if (o.isBone) { const k = o.name.replace(/^Bip01_?/, '') || 'Root'; this.bones[k] = o; this.restQ[k] = o.getWorldQuaternion(new THREE.Quaternion()); this.restLocal[k] = o.quaternion.clone(); }
    });
    const box = new THREE.Box3().setFromObject(this.root); this.cmHeight = box.max.y - box.min.y;
    this.mixer = new THREE.AnimationMixer(this.root);
    this.actions = {}; for (const c of clips) this.actions[c.name] = this.mixer.clipAction(c);
    this.cur = null; this.t = 0;
    this.look = new THREE.Vector3(); this.lookW = 0; this.hasLook = false;
    this.env = null; this.envT0 = 0; this.jawOpen = 0;
    this.saved = new Map();   // bones the procedural layer moved this frame -> their clip rotation
  }
  setHeight(m) { this.scale = m / this.cmHeight; this.root.scale.setScalar(this.scale); return this; }
  hideMaterials(re) { this.root.traverse((o) => { if (o.isSkinnedMesh) [].concat(o.material).forEach((m) => { if (re.test(m.name)) m.visible = false; }); }); }

  play(name, { fade = 0.3, speed = 1, offset = null } = {}) {
    const a = this.actions[name]; if (!a) return;
    a.timeScale = speed;
    if (this.cur === name) return;
    const prev = this.cur && this.actions[this.cur];
    a.reset(); if (offset !== null) a.time = offset * a.getClip().duration; a.enabled = true; a.setEffectiveWeight(1); a.fadeIn(fade).play();
    if (prev) prev.fadeOut(fade);
    this.cur = name;
  }
  setSpeed(s) { const a = this.cur && this.actions[this.cur]; if (a) a.timeScale = s; }

  // ---- procedural layer on top of the clips: call after mixer.update ----
  worldQ(bone, out) { bone.updateWorldMatrix(true, false); return bone.getWorldQuaternion(out); }
  rotateWorld(bone, qd) {   // premultiply the bone's world rotation by qd
    if (!this.saved.has(bone)) this.saved.set(bone, bone.quaternion.clone());
    this.worldQ(bone, _q); bone.parent.updateWorldMatrix(true, false); bone.parent.getWorldQuaternion(_q2).invert();
    bone.quaternion.copy(_q2.multiply(_q3.copy(qd).multiply(_q)));
    bone.updateMatrix(); bone.updateWorldMatrix(false, true);
  }
  aim(bone, child, dirWorld, w) {   // swing a limb toward a world direction
    if (w <= 0.001) return;
    bone.updateWorldMatrix(true, false); child.updateWorldMatrix(true, false);
    bone.getWorldPosition(_a); child.getWorldPosition(_b); _b.sub(_a).normalize();
    const qd = new THREE.Quaternion().setFromUnitVectors(_b, dirWorld); qd.slerp(ID, 1 - w);
    this.rotateWorld(bone, qd);
  }
  axisWorld(x, y, z) { return _c.set(x, y, z).applyQuaternion(this.root.parent ? this.root.parent.getWorldQuaternion(_q3) : ID).clone(); }
  // rotate several bones by shares of one rotation about a model-space axis
  bend(names, shares, axis, angle) {
    if (Math.abs(angle) < 1e-4) return;
    const ax = this.axisWorld(axis[0], axis[1], axis[2]);
    names.forEach((n, i) => { if (this.bones[n]) this.rotateWorld(this.bones[n], new THREE.Quaternion().setFromAxisAngle(ax, angle * shares[i])); });
  }
  // turn the neck and head toward a world point, within limits
  lookAt(target, dt, { yaw = 1.1, pitch = 0.5, speed = 5 } = {}) {
    const on = !!target; this.lookW += ((on ? 1 : 0) - this.lookW) * Math.min(1, dt * 3);
    if (on) { if (!this.hasLook) { this.look.copy(target); this.hasLook = true; } else this.look.lerp(target, Math.min(1, dt * speed)); }
    if (this.lookW < 0.01 || !this.hasLook) return;
    const head = this.bones.Head, neck = this.bones.Neck; if (!head || !neck) return;
    const rootQ = this.root.parent ? this.root.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
    const rootInv = rootQ.clone().invert();
    const restFwd = new THREE.Vector3(0, 0, 1).applyQuaternion(rootQ);
    const fwdNow = () => { const wq = this.worldQ(head, new THREE.Quaternion()); const dq = wq.multiply(rootQ.clone().multiply(this.restQ.Head).invert()); return restFwd.clone().applyQuaternion(dq); };
    head.getWorldPosition(_a);
    const d = this.look.clone().sub(_a).applyQuaternion(rootInv).normalize();
    const yw = THREE.MathUtils.clamp(Math.atan2(d.x, d.z), -yaw, yaw), pt = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(d.y, -1, 1)), -pitch, pitch);
    const want = new THREE.Vector3(Math.sin(yw) * Math.cos(pt), Math.sin(pt), Math.cos(yw) * Math.cos(pt)).applyQuaternion(rootQ);
    const w = this.lookW;
    let qd = new THREE.Quaternion().setFromUnitVectors(fwdNow(), want).slerp(ID, 1 - w);
    this.rotateWorld(neck, new THREE.Quaternion().copy(qd).slerp(ID, 0.6));
    qd = new THREE.Quaternion().setFromUnitVectors(fwdNow(), want).slerp(ID, 1 - w);
    this.rotateWorld(head, qd);
  }

  // mouth: lip-sync from a voice line's loudness envelope (30 values a second)
  talk(env) { this.env = env; this.envT0 = this.t; }
  updateJaw(dt) {
    let open = 0;
    if (this.env) { const i = Math.floor((this.t - this.envT0) * 30); if (i >= this.env.length) this.env = null; else open = this.env[Math.max(0, i)]; }
    this.jawOpen += (open - this.jawOpen) * Math.min(1, dt * 18);
    const jaw = this.bones.MJaw; if (!jaw) return;
    jaw.quaternion.copy(this.restLocal.MJaw).multiply(_q.setFromAxisAngle(_a.set(0, 0, 1), this.jawOpen * 0.32 * (this.jawSign || 1)));
    jaw.updateMatrix(); jaw.updateWorldMatrix(false, true);
  }

  // The mixer only rewrites a bone when its clip value changes, so put the adjusted bones back first or the lean/look would pile up.
  update(dt) {
    for (const [b, q] of this.saved) b.quaternion.copy(q);
    this.saved.clear();
    this.t += dt; this.mixer.update(dt); this.root.updateMatrixWorld(true);
  }
}
