// Characters: Microsoft Rocketbox models (assets/models/*.glb, MIT) share one Biped skeleton and one baked
// animation set (assets/models/anims.glb: Mixamo idle/walk/run/etc. retargeted onto that skeleton).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const load = (url) => new Promise((res, rej) => loader.load(url, res, undefined, rej));
let animsP = null;
export const loadAnims = () => (animsP ||= load('assets/models/anims.glb').then((g) => { for (const c of g.animations) if (/^(walk|run|idle)$/.test(c.name)) seamless(c); return g.animations; }));

// A looping clip whose last frame does not match its first pops the whole body once a cycle.
// Find the true cycle: the time near the end where the pose is closest to frame 0; trim to it, and ease the last 12% of the cycle into the first frame.
function seamless(clip) {
  const T = clip.duration, tracks = clip.tracks, q0 = new THREE.Quaternion(), q1 = new THREE.Quaternion();
  const qT = tracks.filter((t) => t.name.endsWith('.quaternion')), its = qT.map((t) => t.createInterpolant()), firsts = its.map((it) => new THREE.Quaternion().fromArray(it.evaluate(0)));
  let best = T, bestErr = Infinity;
  for (let t = T * 0.6; t <= T + 1e-6; t += 1 / 240) { let err = 0; for (let i = 0; i < qT.length; i++) { q1.fromArray(its[i].evaluate(t)); err += firsts[i].angleTo(q1); } if (err < bestErr) { bestErr = err; best = t; } }
  for (const tr of tracks) {
    const n = tr.getValueSize(), first = Array.from(tr.createInterpolant().evaluate(0)), times = [], values = [];
    for (let i = 0; i < tr.times.length; i++) { const t = tr.times[i]; if (t < best - 1e-6) { times.push(t); for (let k = 0; k < n; k++) values.push(tr.values[i * n + k]); } }
    times.push(best); values.push(...first);
    const t0 = best * 0.88, isQ = n === 4 && tr.name.endsWith('.quaternion');
    for (let i = 0; i < times.length; i++) {
      if (times[i] <= t0) continue; const k = Math.min(1, (times[i] - t0) / (best - t0)), e = k * k * (3 - 2 * k);
      if (isQ) { q1.fromArray(values, i * 4); q0.fromArray(first); q1.slerp(q0, e); q1.toArray(values, i * 4); }
      else for (let c = 0; c < n; c++) values[i * n + c] += (first[c] - values[i * n + c]) * e;
    }
    tr.times = Float32Array.from(times); tr.values = Float32Array.from(values);
  }
  clip.resetDuration();
}
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
    // a clip that is still fading out is picked up where it is (its weight and its time); a fresh one starts from the beginning.
    // The fades run from the actions' current weights: three's fadeIn/fadeOut start from 0 and 1 regardless, which snaps the pose when a clip is restarted mid-fade.
    const wa = a.isRunning() ? a.getEffectiveWeight() : 0;
    if (wa <= 0.001) { a.reset(); if (offset !== null) a.time = offset * a.getClip().duration; }
    a.enabled = true; a.setEffectiveWeight(1); a.play(); a._scheduleFading(fade, wa, 1);
    if (prev && prev !== a) prev._scheduleFading(fade, prev.getEffectiveWeight(), 0);
    this.cur = name;
  }

  // ---- procedural layer on top of the clips: call after mixer.update ----
  worldQ(bone, out) { bone.updateWorldMatrix(true, false); return bone.getWorldQuaternion(out); }
  rotateWorld(bone, qd) {   // premultiply the bone's world rotation by qd
    if (!this.saved.has(bone)) this.saved.set(bone, bone.quaternion.clone());
    this.worldQ(bone, _q); bone.parent.updateWorldMatrix(true, false); bone.parent.getWorldQuaternion(_q2).invert();
    bone.quaternion.copy(_q2.multiply(_q3.copy(qd).multiply(_q)));
    bone.updateMatrix(); bone.updateWorldMatrix(false, true);
  }
  aim(bone, child, dirWorld, w, maxStep = Infinity) {   // swing a limb toward a world direction (by w of the way; maxStep caps the swing when a caller wants that)
    if (w <= 0.001) return;
    bone.updateWorldMatrix(true, false); child.updateWorldMatrix(true, false);
    bone.getWorldPosition(_a); child.getWorldPosition(_b); _b.sub(_a).normalize();
    let ang = _b.angleTo(dirWorld) * w; if (ang < 1e-5) return; ang = Math.min(ang, maxStep);
    // the axis: the cross product, or any perpendicular when the two directions are opposite (setFromUnitVectors would pick one at random and the limb would flip)
    const axis = _c.crossVectors(_b, dirWorld);
    if (axis.lengthSq() < 1e-6) { axis.set(0, 1, 0).cross(_b); if (axis.lengthSq() < 1e-6) axis.set(1, 0, 0).cross(_b); }
    this.rotateWorld(bone, new THREE.Quaternion().setFromAxisAngle(axis.normalize(), ang));
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
    // the neck turns at a human rate, and gives up (faces forward) when the target is behind: atan2 flips sign as a target crosses behind,
    // and a clamp alone would snap the neck from +63 to -63 degrees in one frame (the clavicles hang from the neck in this rig, so the shoulders would snap too)
    const raw = Math.atan2(d.x, d.z), ywT = Math.abs(raw) > 2.4 ? 0 : THREE.MathUtils.clamp(raw, -yaw, yaw), ptT = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(d.y, -1, 1)), -pitch, pitch);
    if (this.yawNow === undefined) { this.yawNow = ywT; this.pitchNow = ptT; }
    this.yawNow += THREE.MathUtils.clamp(ywT - this.yawNow, -3.5 * dt, 3.5 * dt); this.pitchNow += THREE.MathUtils.clamp(ptT - this.pitchNow, -2.5 * dt, 2.5 * dt);
    const yw = this.yawNow, pt = this.pitchNow;
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
