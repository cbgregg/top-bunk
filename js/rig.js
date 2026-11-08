// Characters: Microsoft Rocketbox models (assets/models/*.glb, MIT) share one Biped skeleton and one baked
// animation set (assets/models/anims.glb: Mixamo idle/walk/run/etc. retargeted onto that skeleton).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { shrinkTextures } from './pbr.js';

const loader = new GLTFLoader();
const load = (url) => new Promise((res, rej) => loader.load(url, res, undefined, rej)).then((g) => { shrinkTextures(g.scene); return g; });
let animsP = null;
export const loadAnims = () => (animsP ||= load('assets/models/anims.glb').then((g) => { for (const c of g.animations) if (/^(walk|run|idle|sneak)$/.test(c.name)) seamless(c); return g.animations; }));

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

// The parents' body language (assets/models/body.bin, built by tools/models/body.cjs from Quaternius's Universal Animation Library, CC0):
// standing, talking, sitting, sitting and talking, arms folded, and what the days, the breakfast and the nights need (sitting down and
// getting up, a carrying walk, eating, a nod and a shake, the phone, a call from a rail, lying to standing, a torch, a reach, a pick-up,
// kneeling, pushing). A JSON header (each clip's name, length, frames and bones, and the hips' path where they travel) and then every
// value as an int16. Each talking clip also comes mirrored (left for right), so a line never repeats the last one's movements.
let bodyP = null;
export const loadBody = () => (bodyP ||= Promise.all([fetch('assets/models/body.bin').then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('body.bin ' + r.status)))), loadAnims().catch(() => [])]).then(([buf, anims]) => {
  const dv = new DataView(buf), hl = dv.getUint32(4, true), head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, hl)));
  const data = new Int16Array(buf, 8 + hl), clips = []; let o = 0;
  const legs = /(Thigh|Calf|Foot|Toe0)\.quaternion$/, arms = /(Clavicle|UpperArm|Forearm|Hand)\.quaternion$/;
  // the game's standing legs: the idle clip's first frame, which people.js stands the parents on under every standing clip
  const idle = anims.find((c) => c.name === 'idle'), idleLegs = {}; if (idle) for (const t of idle.tracks) if (legs.test(t.name)) idleLegs[t.name] = t.values.slice(0, 4);
  const q0 = new THREE.Quaternion(), q1 = new THREE.Quaternion();
  for (const c of head) {
    const times = Float32Array.from({ length: c.frames }, (_, i) => (i / (c.frames - 1)) * c.duration), tracks = [];
    for (const b of c.bones) { const v = new Float32Array(c.frames * 4); for (let i = 0; i < v.length; i++) v[i] = data[o++] / 32767; normQ(v); tracks.push(new THREE.QuaternionKeyframeTrack('Bip01_' + b + '.quaternion', times, v)); }
    // standing clips keep only the body above the hips' children: the legs are the steady idle stance's (people.js), so a clip's own
    // stride never moves a foot into the stove or the bed; the seated ones are put where sit() puts them anyway. Sitting down and
    // getting up (Sitting_*), lying to standing (LayToIdle), kneeling at a repair (Fixing_Kneeling), leaning on a rail (Idle_Rail_Call)
    // and pushing (Push_Loop) keep their legs: the legs are the movement, or the lean tips the pelvis so far that the idle's legs
    // would swing off the floor behind it, and the hips' path comes with them (below). Eating (Consume) is its arms alone, laid over
    // the seated clip.
    const keepLegs = /^(sit_|Sitting_|LayToIdle|Fixing_Kneeling|Idle_Rail_Call|Push_Loop)/.test(c.name), armsOnly = /^Consume$/.test(c.name);
    // A clip that keeps its legs starts or ends (or both) in the library's own standing stance, which is wider and more staggered than
    // the game's idle (its right foot a step back): over the last, or first, 0.35 s of such an end its legs ease into the idle's and its
    // hips' path to nothing, so the crossfade to `stand` joins two matching poses and no foot slides
    if (keepLegs && c.hips && c.stance && !/^sit_/.test(c.name)) {
      const near = (h) => Math.hypot(h[0] - c.stance[0], h[1] - c.stance[1], h[2] - c.stance[2]) < 40, E = 0.35;
      for (const end of [near(c.hips[0]) && 'start', near(c.hips[c.hips.length - 1]) && 'end']) {
        if (!end) continue;
        const w = (t) => { const k = Math.max(0, Math.min(1, end === 'start' ? 1 - t / E : 1 - (c.duration - t) / E)); return k * k * (3 - 2 * k); };
        for (const tr of tracks) { const iv = idleLegs[tr.name]; if (!iv) continue; for (let i = 0; i < tr.times.length; i++) { const e = w(tr.times[i]); if (e > 0) { q0.fromArray(tr.values, i * 4); q1.fromArray(iv); q0.slerp(q1, e).toArray(tr.values, i * 4); } } }
        c.hips = c.hips.map((h, i) => { const e = w(i / c.fps); return e > 0 ? h.map((x) => Math.round(x * (1 - e))) : h; });
      }
    }
    const clip = new THREE.AnimationClip(c.name, c.duration, keepLegs ? tracks : tracks.filter((t) => (armsOnly ? arms.test(t.name) : !legs.test(t.name)))); clips.push(clip);
    // where the hips travel, for the clips that keep their legs: userData.hips is [x, y, z] every 1/fps s from t = 0, in millimetres
    // from the rest pose, +z forward, for a rig whose pelvis rests `pelvis` metres over the floor. The bake keeps rotations only, so
    // whoever plays such a clip moves the group by this path (scaled by their pelvis height / `pelvis`, turned by their yaw) or the
    // knees fold in the air. (The seated clips are laid over sit(), which drops the hips itself; the file carries a path for a few
    // standing clips too, which lean or crouch, and with the idle's legs under them it is not used.)
    if (c.hips && keepLegs && !/^sit_/.test(c.name)) clip.userData = { hips: c.hips, pelvis: c.pelvis, fps: c.fps };
    if (/talk|stand|fold|sit_idle|_Loop$/.test(c.name)) seamless(clip);   // (the loops' ends meet)
    if (/^sit_/.test(c.name)) {
      clip.userData = { ...clip.userData, additive: true };   // seated: only the movement, laid on an upright body (the clips slouch far back in their chair)
      // ...and the arms on their own, played as they are: a seated person's hands talking over a table (people.js keeps them above it)
      const arms = new THREE.AnimationClip(c.name + '_arms', c.duration, tracks.filter((t) => /(Clavicle|UpperArm|Forearm|Hand)\.quaternion$/.test(t.name)));
      clips.push(arms, mirror(arms, c.name + '_arms_m'));
    }
    // left for right: the talking loops (so a line never repeats the last one's movements), the one-handed clips and the sit-up (so a
    // parent pushes up on the side away from the other sleeper). The library holds the torch in the left hand and the phone in the
    // right, so Dad's torch, in his right, is Idle_Torch_Loop_m; it eats with the left, so Consume_m eats with the right
    if (/talk|sit_idle|stand|fold|^(Consume|Yes|Idle_|Interact|PickUp_Table|LayToIdle)/.test(c.name)) { const m = mirror(clip, c.name + '_m'); if (m.userData.hips) m.userData.hips = m.userData.hips.map(([x, y, z]) => [-x, y, z]); clips.push(m); }
  }
  return clips;
}));
function normQ(v) { for (let i = 0; i < v.length; i += 4) { const l = Math.hypot(v[i], v[i + 1], v[i + 2], v[i + 3]) || 1; v[i] /= l; v[i + 1] /= l; v[i + 2] /= l; v[i + 3] /= l; } }
// left for right: each side's track goes to the other side's bone, and every rotation is reflected through the body's middle plane
// (x is across the body in the rest pose: the reflection keeps x and negates y and z of a local rotation measured from rest,
// which the rest quaternions undo and redo). The rest pose is needed, so the mirror is made against the skeleton when it is bound (Rig).
function mirror(clip, name) { const m = clip.clone(); m.name = name; m.userData = { ...clip.userData, mirrorOf: clip.name }; return m; }

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const ID = new THREE.Quaternion(), _d = new THREE.Vector3();
const _ikS = new THREE.Vector3(), _ikE = new THREE.Vector3(), _ikW = new THREE.Vector3(), _ikT = new THREE.Vector3(), _ikU = new THREE.Vector3(), _ikP = new THREE.Vector3();
const _ikQ = new THREE.Quaternion(), _ikG = new THREE.Vector3(), _ikM = new THREE.Vector3(), _ikD = new THREE.Vector3(), _ikA = new THREE.Vector3(), _ikB = new THREE.Vector3(), _ikC = new THREE.Vector3();

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
    this.clips = Object.fromEntries(clips.map((c) => [c.name, c]));
    this.actions = {};
    for (const c of clips) {
      let clip = c.userData && c.userData.mirrorOf ? this.mirrored(c) : c;
      const add = !!(c.userData && c.userData.additive);
      // an additive clip is its change from its first frame (made on a copy: the plain one is what its mirror is made from)
      if (add) { clip = THREE.AnimationUtils.makeClipAdditive(clip === c ? c.clone() : clip, 0); clip.name = c.name; }
      const a = this.mixer.clipAction(clip, null, add ? THREE.AdditiveAnimationBlendMode : THREE.NormalAnimationBlendMode); this.actions[c.name] = a;
    }
    this.cur = null; this.t = 0;
    this.look = new THREE.Vector3(); this.lookW = 0; this.hasLook = false;
    this.env = null; this.envT0 = 0; this.jawOpen = 0;
    this.saved = new Map();   // bones the procedural layer moved this frame -> their clip rotation
  }
  setHeight(m) { this.scale = m / this.cmHeight; this.root.scale.setScalar(this.scale); return this; }
  // a clip played left for right: each bone takes the other side's turn away from its rest pose, reflected through the body's middle
  // plane (x is across the body: a rotation (x, y, z, w) reflects to (x, -y, -z, w)), worked out down the skeleton frame by frame
  mirrored(clip) {
    const src = this.clips[clip.userData.mirrorOf] || clip;
    const key = (n) => n.replace(/^Bip01_?/, '') || 'Root', other = (k) => k.replace(/^L_/, '#').replace(/^R_/, 'L_').replace(/^#/, 'R_');
    const tracks = {}; for (const t of src.tracks) tracks[key(t.name.replace(/\.quaternion$/, ''))] = t;
    const order = []; this.root.traverse((o) => { if (o.isBone) order.push(o); });
    const n = src.tracks[0].times.length, times = src.tracks[0].times, out = {}; for (const k in tracks) out[k] = new Float32Array(n * 4);
    const W = new Map(), Wm = new Map(), q = new THREE.Quaternion(), d = new THREE.Quaternion(), loc = new THREE.Quaternion();
    // the top bone's parent (a plain node, never animated) turns it in model space: start from that, as restQ does
    const tops = new Map(), top = (b) => { if (!tops.has(b)) { this.root.updateMatrixWorld(true); tops.set(b, b.parent ? b.parent.getWorldQuaternion(new THREE.Quaternion()) : ID.clone()); } return tops.get(b); };
    for (let f = 0; f < n; f++) {
      for (const b of order) {   // the clip's pose in model space
        const k = key(b.name), t = tracks[k]; loc.copy(this.restLocal[k]); if (t) loc.fromArray(t.values, f * 4);
        const pw = W.get(b.parent) || top(b); W.set(b, (W.get(b) || new THREE.Quaternion()).copy(pw).multiply(loc));
      }
      for (const b of order) {   // the mirror, from the top down
        const k = key(b.name), pw = Wm.get(b.parent) || top(b), mine = Wm.get(b) || new THREE.Quaternion(); Wm.set(b, mine);
        if (!tracks[k]) { mine.copy(pw).multiply(this.restLocal[k]); continue; }
        const ok = other(k), ob = this.bones[ok] && tracks[ok] ? this.bones[ok] : b, okk = ob === b ? k : ok;
        d.copy(W.get(ob)).multiply(q.copy(this.restQ[okk]).invert());   // the other side's turn from its rest
        d.set(d.x, -d.y, -d.z, d.w);
        mine.copy(d).multiply(this.restQ[k]);
        loc.copy(pw).invert().multiply(mine);
        const o = out[k], i = f * 4; if (f && o[i - 4] * loc.x + o[i - 3] * loc.y + o[i - 2] * loc.z + o[i - 1] * loc.w < 0) loc.set(-loc.x, -loc.y, -loc.z, -loc.w);
        loc.toArray(o, i);
      }
    }
    return new THREE.AnimationClip(clip.name, src.duration, Object.entries(out).map(([k, v]) => new THREE.QuaternionKeyframeTrack('Bip01_' + k + '.quaternion', times, v)));
  }
  hideMaterials(re) { this.root.traverse((o) => { if (o.isSkinnedMesh) [].concat(o.material).forEach((m) => { if (re.test(m.name)) m.visible = false; }); }); }

  play(name, { fade = 0.3, speed = 1, offset = null } = {}) {
    if (this.alias && this.alias[name] && this.actions[this.alias[name]]) name = this.alias[name];   // (the parents stand with their own idle)
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
  // two bones onto a point: `end` (the wrist, the ankle) is carried onto `target` (world), the middle joint bending toward `pole` (world).
  // The upper bone is swung so the middle joint lands where the triangle of the two lengths puts it, then the lower bone is aimed at the
  // target (a target out of reach is met as far as the limb goes, straight at it; one too close, at the shortest the limb folds to).
  // w eases the whole move in (0 leaves the clip's limb, 1 puts the end on the point). Lifted from night one's bedside reach.
  // A stretched limb (the thing's arms are scaled along the upper bone) shears the lower one, so how far the end reaches changes with the
  // bend in a way no triangle predicts. After the triangle has put the elbow on the pole's side, the bend is found by measuring: the
  // lower bone is swung in the limb's plane, from straight to folded, and bisected until the shoulder-to-wrist distance is right; then
  // the whole limb is turned about the shoulder onto the target (a turn of the upper bone carries everything under it rigidly) and
  // about that line until the elbow faces the pole (which leaves the wrist where it is).
  ik2(upper, lower, end, target, pole, w = 1) {
    if (w <= 0.001 || !upper || !lower || !end) return;
    end.updateWorldMatrix(true, false); end.getWorldPosition(_ikW); const goal = _ikG.copy(_ikW).lerp(target, w);
    this.ik2once(upper, lower, end, goal, pole);
    const reach = () => { upper.getWorldPosition(_ikS); end.getWorldPosition(_ikW); return _ikS.distanceTo(_ikW); };
    for (let round = 0; round < 3; round++) {
    upper.getWorldPosition(_ikS); lower.getWorldPosition(_ikE);
    const d = _ikS.distanceTo(goal);
    _ikA.copy(_ikE).sub(_ikS).normalize();                                     // the upper bone's line
    _ikC.crossVectors(_ikA, _ikB.copy(goal).sub(_ikS));                         // the plane's normal (toward the target side)
    if (_ikC.lengthSq() < 1e-10) _ikC.crossVectors(_ikA, _ikB.copy(pole).sub(_ikS));
    if (_ikC.lengthSq() > 1e-10) {
      _ikC.normalize();
      const bend = (a) => { this.aim(lower, end, _ikD.copy(_ikA).applyAxisAngle(_ikC, a), 1); return reach(); };
      let lo = 0, hi = Math.PI - 0.12;
      if (bend(lo) > d) {
        for (let i = 0; i < 14; i++) { const mid = (lo + hi) / 2; if (bend(mid) > d) lo = mid; else hi = mid; }
        bend((lo + hi) / 2);
      }
    }
    // onto the target: the whole limb turned about the shoulder
    upper.getWorldPosition(_ikS); end.getWorldPosition(_ikW);
    _ikA.copy(_ikW).sub(_ikS).normalize(); _ikB.copy(goal).sub(_ikS).normalize();
    this.rotateWorld(upper, _ikQ.setFromUnitVectors(_ikA, _ikB));
    // the elbow toward the pole: a turn about the shoulder-target line
    lower.getWorldPosition(_ikE); _ikU.copy(_ikB);
    _ikA.copy(_ikE).sub(_ikS); _ikA.addScaledVector(_ikU, -_ikA.dot(_ikU));
    _ikP.copy(pole).sub(_ikS); _ikP.addScaledVector(_ikU, -_ikP.dot(_ikU));
    if (_ikA.lengthSq() > 1e-8 && _ikP.lengthSq() > 1e-8) {
      _ikA.normalize(); _ikP.normalize();
      this.rotateWorld(upper, _ikQ.setFromAxisAngle(_ikU, Math.atan2(_ikM.crossVectors(_ikA, _ikP).dot(_ikU), _ikA.dot(_ikP))));
    }
    end.getWorldPosition(_ikW); if (_ikW.distanceToSquared(goal) < 1e-4) break;   // (a sheared bend can need a second look)
    }
  }
  ik2once(upper, lower, end, target, pole, bLen) {
    upper.updateWorldMatrix(true, true);
    upper.getWorldPosition(_ikS); lower.getWorldPosition(_ikE); end.getWorldPosition(_ikW);
    const a = _ikS.distanceTo(_ikE), b = bLen ?? _ikE.distanceTo(_ikW);
    _ikT.copy(target);
    let d = _ikS.distanceTo(_ikT); if (d < 1e-5) return;
    _ikU.copy(_ikT).sub(_ikS).divideScalar(d);
    d = Math.max(Math.abs(a - b) + 0.002, Math.min(a + b - 0.0005, d));
    // the bend's side: the pole with its part along the limb taken out (any side at all when the pole lies on the line)
    _ikP.copy(pole).sub(_ikS); _ikP.addScaledVector(_ikU, -_ikP.dot(_ikU));
    if (_ikP.lengthSq() < 1e-8) { _ikP.set(0, 1, 0).addScaledVector(_ikU, -_ikU.y); if (_ikP.lengthSq() < 1e-8) _ikP.set(1, 0, 0); }
    _ikP.normalize();
    const ca = THREE.MathUtils.clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1), sa = Math.sqrt(Math.max(0, 1 - ca * ca));
    _ikM.copy(_ikS).addScaledVector(_ikU, a * ca).addScaledVector(_ikP, a * sa);
    this.aim(upper, lower, _ikD.copy(_ikM).sub(_ikS).normalize(), 1);
    lower.updateWorldMatrix(true, true); lower.getWorldPosition(_ikE);
    this.aim(lower, end, _ikD.copy(_ikT).sub(_ikE).normalize(), 1);
  }
  // a bone turned (about its own pivot) so its local axis `axis` points along the world direction `dir`, and its local `up` as near
  // the world `upDir` as that allows: a hand laid flat, a foot pointed back
  orient(bone, axis, dir, up, upDir, w = 1) {
    if (w <= 0.001 || !bone) return;
    bone.updateWorldMatrix(true, false); bone.getWorldQuaternion(_q);
    _ikA.copy(axis).applyQuaternion(_q);
    const q1 = new THREE.Quaternion().setFromUnitVectors(_ikA, _ikD.copy(dir).normalize());
    _ikB.copy(up).applyQuaternion(_q).applyQuaternion(q1);
    // the twist about the new axis that brings `up` to the wanted side
    _ikC.copy(upDir).addScaledVector(_ikD, -upDir.dot(_ikD)); _ikB.addScaledVector(_ikD, -_ikB.dot(_ikD));
    let q = q1;
    if (_ikC.lengthSq() > 1e-8 && _ikB.lengthSq() > 1e-8) { _ikC.normalize(); _ikB.normalize(); q = new THREE.Quaternion().setFromUnitVectors(_ikB, _ikC).multiply(q1); }
    if (w < 1) q.slerp(ID, 1 - w);
    this.rotateWorld(bone, q);
  }
  axisWorld(x, y, z) { return _c.set(x, y, z).applyQuaternion(this.root.parent ? this.root.parent.getWorldQuaternion(_q3) : ID).clone(); }
  // rotate several bones by shares of one rotation about a model-space axis
  bend(names, shares, axis, angle) {
    if (Math.abs(angle) < 1e-4) return;
    const ax = this.axisWorld(axis[0], axis[1], axis[2]);
    names.forEach((n, i) => { if (this.bones[n]) this.rotateWorld(this.bones[n], new THREE.Quaternion().setFromAxisAngle(ax, angle * shares[i])); });
  }
  // turn the neck and head toward a world point, within limits
  lookAt(target, dt, { yaw = 1.1, pitch = 0.5, speed = 5, rate = 3.5 } = {}) {   // rate: how fast the neck may turn (rad/s; pitch at 5/7 of it)
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
    this.yawNow += THREE.MathUtils.clamp(ywT - this.yawNow, -rate * dt, rate * dt); this.pitchNow += THREE.MathUtils.clamp(ptT - this.pitchNow, -rate * dt / 1.4, rate * dt / 1.4);
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
    jaw.quaternion.copy(this.restLocal.MJaw).multiply(_q.setFromAxisAngle(_a.set(0, 0, 1), this.jawOpen * 0.19 * (this.jawSign || 1)));
    jaw.updateMatrix(); jaw.updateWorldMatrix(false, true);
  }

  // the face: the brows, the mouth corners, the lips and the cheeks are small bones moved off their rest positions (in metres, along
  // the head's own up, left and forward), the eyes dart. mood: 'warm' | 'joke' | 'uneasy' | 'scared'; question lifts the brows;
  // the lips follow the voice: open with the jaw, wide on the loud syllables and rounder on the soft ones
  face(dt) {
    const B = this.bones; if (!B.MJaw || !B.LInnerEyebrow) return;
    const F = this.faceState || (this.faceState = { rest: new Map(), brow: 0, worry: 0, smile: 0, wide: 0, round: 0, sacT: 0.5, sacY: 0, sacX: 0, ph: 0 });
    const head = B.Head; head.updateWorldMatrix(true, false);
    const hq = head.getWorldQuaternion(new THREE.Quaternion()), rootQ = this.root.parent ? this.root.parent.getWorldQuaternion(new THREE.Quaternion()) : ID;
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(rootQ), left = new THREE.Vector3(1, 0, 0).applyQuaternion(rootQ), fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(rootQ);
    let amp = 0;
    if (this.env) { const i = Math.floor((this.t - this.envT0) * 30); amp = i >= 0 && i < this.env.length ? this.env[i] : 0; }
    const mood = this.mood, k = Math.min(1, dt * 6);
    F.brow += (((this.question && this.env) ? 1 : mood === 'scared' ? 0.7 : 0) + (amp > 0.7 ? 0.25 : 0) - F.brow) * k;
    F.worry += ((mood === 'uneasy' || mood === 'scared' ? 1 : 0) - F.worry) * k;
    F.smile += ((mood === 'joke' ? 1 : mood === 'warm' ? 0.55 : 0) - F.smile) * Math.min(1, dt * 3);
    F.ph += dt * (amp > 0.2 ? 7 : 2);
    F.wide += ((amp > 0.55 ? 0.8 + 0.2 * Math.sin(F.ph) : 0) - F.wide) * Math.min(1, dt * 14);
    F.round += ((amp > 0.15 && amp <= 0.55 ? 0.7 + 0.3 * Math.sin(F.ph * 1.3) : 0) - F.round) * Math.min(1, dt * 14);
    const mv = (name, u, l, f) => {
      const b = B[name]; if (!b) return;
      if (!F.rest.has(b)) F.rest.set(b, b.position.clone());
      const sc = b.parent.getWorldScale(_d).x || 1, inv = b.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
      const off = new THREE.Vector3().addScaledVector(up, u).addScaledVector(left, l).addScaledVector(fwd, f).applyQuaternion(inv).divideScalar(sc);
      b.position.copy(F.rest.get(b)).add(off); b.updateMatrix();
    };
    const br = F.brow * 0.004, wo = F.worry, sm = F.smile;
    mv('LInnerEyebrow', br + wo * 0.004, -wo * 0.0015, 0); mv('RInnerEyebrow', br + wo * 0.004, wo * 0.0015, 0);
    mv('MMiddleEyebrow', br * 0.8 + wo * 0.002, 0, 0);
    mv('LOuterEyebrow', br * 0.7 - wo * 0.0012, 0, 0); mv('ROuterEyebrow', br * 0.7 - wo * 0.0012, 0, 0);
    const wide = F.wide * 0.002, rnd = F.round * 0.003;
    mv('LMouthCorner', sm * 0.003 - wo * 0.0012, sm * 0.002 + wide - rnd, -rnd * 0.4); mv('RMouthCorner', sm * 0.003 - wo * 0.0012, -(sm * 0.002 + wide - rnd), -rnd * 0.4);
    mv('LCheek', sm * 0.0022, 0, 0); mv('RCheek', sm * 0.0022, 0, 0);
    mv('MUpperLip', amp * 0.001, 0, rnd * 0.6); mv('LUpperlip', amp * 0.0008, 0, rnd * 0.4); mv('RUpperlip', amp * 0.0008, 0, rnd * 0.4);
    mv('MBottomLip', -amp * 0.001, 0, rnd * 0.6);
    // the eyes: small quick moves every half second to two seconds, settling back toward where the head points
    F.sacT -= dt;
    if (F.sacT <= 0) { F.sacT = (this.env ? 0.35 : 0.6) + Math.random() * 1.4; F.sacY = (Math.random() - 0.5) * 0.12; F.sacX = (Math.random() - 0.5) * 0.06; }
    for (const n of ['LEye', 'REye']) {
      const b = B[n]; if (!b) continue;
      if (!this.saved.has(b)) this.saved.set(b, b.quaternion.clone());
      this.rotateWorld(b, new THREE.Quaternion().setFromEuler(new THREE.Euler(F.sacX, F.sacY, 0)).premultiply(hq).multiply(hq.clone().invert()));
    }
  }

  // ---- overlays: clips laid over the current one, each by its share of the pose (0..1), eased in and out ----
  // Call it every frame a clip is wanted; one not asked for in a frame eases out and stops. The mixer blends by weight and divides by
  // the sum, so each overlay's weight is worked out from the shares: share s of the pose takes weight s / (1 - all the shares).
  overlay(name, share, { rate = 3, speed = 1, offset = null } = {}) {
    const a = this.actions[name]; if (!a) return 0;
    const L = this.ov || (this.ov = new Map());
    let o = L.get(name); if (!o) { o = { w: 0, next: 0, rate }; L.set(name, o); }
    o.next = Math.max(o.next, share); o.rate = rate; a.timeScale = speed;
    if (!a.isRunning() || !a.enabled) { a.reset(); a.enabled = true; a.setEffectiveWeight(0); if (offset !== null) a.time = offset * a.getClip().duration; a.play(); }
    return o.w;
  }
  ovShare(name) { const o = this.ov && this.ov.get(name); return o ? o.w : 0; }
  applyOverlays(dt) {
    if (!this.ov) return;
    let S = 0;
    for (const [, o] of this.ov) { o.w += (o.next - o.w) * Math.min(1, dt * o.rate); if (o.next === 0 && o.w < 0.004) o.w = 0; S += o.w; }
    for (const [name, o] of this.ov) if (this.actions[name].blendMode === THREE.AdditiveAnimationBlendMode) S -= o.w;   // (an additive clip adds its movement on top: its weight is just its share)
    const k = S > 0.97 ? 0.97 / S : 1, rest = 1 - S * k;
    for (const [name, o] of this.ov) {
      const a = this.actions[name];
      if (o.w <= 0) { a.stop(); this.ov.delete(name); continue; }
      a.setEffectiveWeight(a.blendMode === THREE.AdditiveAnimationBlendMode ? o.w : (o.w * k) / rest); o.next = 0;
    }
  }

  // The mixer only rewrites a bone when its clip value changes, so put the adjusted bones back first or the lean/look would pile up.
  update(dt) {
    for (const [b, q] of this.saved) b.quaternion.copy(q);
    this.saved.clear();
    this.applyOverlays(dt);
    this.t += dt; this.mixer.update(dt); this.root.updateMatrixWorld(true);
  }

  // ---- life: what a standing body does on its own. The baked idle clip holds one pose (its bones move under a degree), so
  // breathing, the slow sway, shifts of weight, the head wandering, blinks and the nods of someone talking are laid on here,
  // after the mixer and before the hands and the look. `still` is how much of the body is on the idle clip (0 while walking:
  // the walk has its own motion, only the breath and the blinks stay); `talking` adds the nods; `asleep` keeps only a slow breath.
  life(dt, { still = 1, talking = false, asleep = false } = {}) {
    const L = this.lifeState || (this.lifeState = { seed: Math.random() * 100, breath: Math.random() * 7, shiftT: 2 + Math.random() * 4, shift: 0, shiftTo: 0, blinkT: 1 + Math.random() * 3, blink: 0, wander: 0, nod: 0, nodV: 0 });
    const B = this.bones, s = L.seed, t = this.t;
    const rate = asleep ? 0.19 : talking ? 0.3 : 0.24;   // breaths a second
    L.breath += dt * rate * Math.PI * 2;
    const br = 0.5 - 0.5 * Math.cos(L.breath), brAmp = asleep ? 0.04 : 0.045;
    // breath: the chest lifts and the shoulders rise a touch, the head nods back by a hair to keep the eyes level
    this.bend(['Spine1', 'Spine2'], [0.45, 0.55], [1, 0, 0], -brAmp * br);
    this.bend(['L_Clavicle', 'R_Clavicle'], [1, -1], [0, 0, 1], 0.02 * br);
    this.bend(['Neck'], [1], [1, 0, 0], brAmp * 0.5 * br);
    // blinks: the lids drop for 140 ms, every 2-6 s, in a pair now and then
    L.blinkT -= dt;
    if (L.blinkT <= 0) { L.blink = 0.14; L.blinkT = Math.random() < 0.25 ? 0.25 : 2 + Math.random() * 4; }
    if (L.blink > 0) { L.blink -= dt; const k = Math.sin(Math.PI * Math.max(0, Math.min(1, 1 - L.blink / 0.14))); this.lids(k); }
    if (asleep) { this.lids(1); return; }
    if (still < 0.02) return;
    // the slow sway of someone standing: the hips roll a little from side to side and the torso answers above them
    const sway = Math.sin(t * 0.55 + s) * 0.028 + Math.sin(t * 0.23 + s * 2) * 0.016;
    this.bend(['Pelvis'], [1], [0, 0, 1], sway * still);
    this.bend(['Spine', 'Spine1'], [0.5, 0.5], [0, 0, 1], -sway * 0.8 * still);
    // weight shifts: every few seconds the weight goes onto the other foot, which reads as a lean of the whole upper body
    L.shiftT -= dt;
    if (L.shiftT <= 0) { L.shiftTo = (Math.random() - 0.5) * 0.18; L.shiftT = 4 + Math.random() * 6; }
    L.shift += (L.shiftTo - L.shift) * Math.min(1, dt * 1.2);
    this.bend(['Spine', 'Spine1', 'Spine2'], [0.4, 0.35, 0.25], [0, 0, 1], L.shift * still);
    this.bend(['Neck', 'Head'], [0.4, 0.6], [0, 0, 1], -L.shift * 0.7 * still);
    // the arms drift with the breath and the sway, never quite still
    this.bend(['L_UpperArm'], [1], [1, 0, 0], (0.02 * br + 0.012 * Math.sin(t * 0.7 + s)) * still);
    this.bend(['R_UpperArm'], [1], [1, 0, 0], (0.02 * br + 0.012 * Math.sin(t * 0.7 + s + 2)) * still);
    // the head wanders when nothing holds its attention (the look layer takes over from this when there is a target)
    // ...and now and then turns to look at something for a second or two
    L.glanceT = (L.glanceT ?? 3 + Math.random() * 6) - dt;
    if (L.glanceT <= 0) { L.glance = 2.2; L.glanceTo = (Math.random() < 0.5 ? -1 : 1) * (0.3 + Math.random() * 0.3); L.glancePitch = (Math.random() - 0.6) * 0.15; L.glanceT = 7 + Math.random() * 9; }
    let gl = 0;
    if (L.glance > 0) { L.glance -= dt; const u = 1 - L.glance / 2.2; gl = u < 0.25 ? u / 0.25 : u < 0.7 ? 1 : (1 - u) / 0.3; gl = gl * gl * (3 - 2 * gl); }
    if (this.lookW < 0.05) {
      const yaw = Math.sin(t * 0.21 + s) * 0.16 + Math.sin(t * 0.47 + s * 3) * 0.07 + gl * (L.glanceTo || 0), pitch = Math.sin(t * 0.31 + s * 5) * 0.05 + gl * (L.glancePitch || 0);
      this.bend(['Neck', 'Head'], [0.35, 0.65], [0, 1, 0], yaw * still);
      this.bend(['Neck', 'Head'], [0.35, 0.65], [1, 0, 0], pitch * still);
      this.bend(['Spine2'], [1], [0, 1, 0], gl * (L.glanceTo || 0) * 0.25 * still);   // the shoulders follow a little
    }
    // talking: small nods on the stresses of the voice, from its loudness envelope
    const want = talking && this.env ? (this.env[Math.max(0, Math.min(this.env.length - 1, Math.floor((t - this.envT0) * 30)))] || 0) : 0;
    L.nodV += ((want * 0.13 - L.nod) * 40 - L.nodV * 9) * dt; L.nod += L.nodV * dt;
    if (Math.abs(L.nod) > 1e-4) { this.bend(['Head'], [1], [1, 0, 0], L.nod); this.bend(['Head'], [1], [0, 0, 1], L.nod * 0.3 * Math.sin(t * 1.7 + s)); }
  }
  // the eyelids, k 0 open .. 1 shut (the lid bones hinge about their local x)
  lids(k) {
    const B = this.bones; if (!B.LEyeBlinkTop) return;
    for (const [n, a] of [['LEyeBlinkTop', 1.15], ['REyeBlinkTop', 1.15], ['LEyeBlinkBottom', -0.35], ['REyeBlinkBottom', -0.35]]) {
      const b = B[n]; if (!b) continue;
      if (!this.saved.has(b)) this.saved.set(b, b.quaternion.clone());
      b.quaternion.copy(this.restLocal[n]).multiply(_q.setFromAxisAngle(_a.set(1, 0, 0), a * k)); b.updateMatrix();
    }
  }
}
