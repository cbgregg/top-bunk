// The family: Rocketbox models (assets/models), with low-poly stand-ins until they load.
import * as THREE from 'three';
import { Rig, loadModel, loadAnims, loadBody } from './rig.js';

function makeLowPoly({ height = 1.75, shirt = '#6a7a8a', pants = '#2f3644', hair = '#3a2a1e', skin = '#d6a882', longHair = false, cap = null } = {}) {
  const g = new THREE.Group();
  const m = (c, r = 0.9) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
  const S = m(skin, 0.7), SH = m(shirt), P = m(pants), HR = m(hair, 1);
  const add = (geo, mat, x, y, z, parent = g) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o; };
  for (const s of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.075, 0.065, 0.86, 10), P, s * 0.1, 0.43, 0);
    add(new THREE.BoxGeometry(0.12, 0.08, 0.26), m('#2a2420'), s * 0.1, 0.04, 0.04);
  }
  const torso = add(new THREE.BoxGeometry(0.42, 0.6, 0.24), SH, 0, 1.16, 0);
  torso.geometry.translate(0, 0, 0);
  const arms = [-1, 1].map((s) => {
    const sh = new THREE.Group(); sh.position.set(s * 0.26, 1.42, 0); g.add(sh);
    add(new THREE.CylinderGeometry(0.055, 0.045, 0.6, 8), SH, 0, -0.3, 0, sh);
    add(new THREE.SphereGeometry(0.05, 8, 6), S, 0, -0.62, 0, sh);
    sh.rotation.z = s * 0.06; return sh;
  });
  add(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 8), S, 0, 1.5, 0);
  const head = new THREE.Group(); head.position.y = 1.64; g.add(head);
  add(new THREE.SphereGeometry(0.12, 18, 14), S, 0, 0, 0, head).scale.set(0.92, 1.08, 0.98);
  const hairCap = add(new THREE.SphereGeometry(0.126, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), HR, 0, 0.015, -0.008, head);
  hairCap.rotation.x = -0.25;
  if (longHair) add(new THREE.BoxGeometry(0.23, 0.32, 0.08), HR, 0, -0.1, -0.09, head);
  if (cap) { add(new THREE.CylinderGeometry(0.13, 0.13, 0.07, 16), m(cap), 0, 0.08, 0, head); add(new THREE.BoxGeometry(0.2, 0.015, 0.12), m(cap), 0, 0.05, 0.15, head); }
  const eyeM = m('#111', 0.3);
  for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.014, 8, 6), eyeM, s * 0.042, 0.02, 0.11, head);
  g.scale.setScalar(height / 1.75);
  const seed = Math.random() * 10;
  return {
    group: g, head, arms,
    update(t) {
      head.rotation.y = Math.sin(t * 0.4 + seed) * 0.25;
      head.rotation.x = Math.sin(t * 0.3 + seed) * 0.05;
      arms[0].rotation.x = Math.sin(t * 0.8 + seed) * 0.04;
      arms[1].rotation.x = -Math.sin(t * 0.8 + seed) * 0.04;
      torso.scale.y = 1 + Math.sin(t * 1.6 + seed) * 0.01;
    },
  };
}

const RQ = new THREE.Quaternion(), _qt = new THREE.Quaternion(), _qu = new THREE.Quaternion();
const GA = new THREE.Vector3(), GB = new THREE.Vector3(), GC = new THREE.Vector3(), GD = new THREE.Vector3(), GE = new THREE.Vector3(), GF = new THREE.Vector3();
const RA = new THREE.Vector3(), RB = new THREE.Vector3(), RS = new THREE.Vector3(), RE = new THREE.Vector3(), RH = new THREE.Vector3(), RD = new THREE.Vector3(), RP = new THREE.Vector3(), RT = new THREE.Vector3(), RL = new THREE.Vector3(), RF = new THREE.Vector3(), RC = new THREE.Vector3(), RPole = new THREE.Vector3(), RDown = new THREE.Vector3(0, -1, 0), RG = new THREE.Vector3();
const IA = new THREE.Vector3(), IB = new THREE.Vector3(), IC = new THREE.Vector3(), IW = new THREE.Vector3(), IL = new THREE.Vector3(), IX = new THREE.Vector3();

// finger curl, radians at the knuckle, middle and end joints, index to pinky then the thumb. The clips leave every finger
// straight and splayed (a blade), so a hand is never shown without at least the relaxed curl; more toward the pinky, the thumb
// turned in. grip blends relaxed -> grip by how far the fingers close; flat is a palm pressed on the side of a box.
const FINGERS = ['Finger1', 'Finger2', 'Finger3', 'Finger4', 'Finger0'];
const CURL = {
  relaxed: [[0.32, 0.42, 0.24], [0.38, 0.48, 0.28], [0.44, 0.54, 0.32], [0.5, 0.6, 0.36], [0.22, 0.18, 0.14]],
  grip:    [[0.95, 1.2, 0.6], [1.0, 1.25, 0.65], [1.05, 1.3, 0.7], [1.1, 1.3, 0.7], [0.5, 0.45, 0.35]],
  flat:    [[0.12, 0.18, 0.1], [0.14, 0.2, 0.12], [0.16, 0.22, 0.14], [0.18, 0.24, 0.14], [0.2, 0.15, 0.1]],
  soft:    [[0.18, 0.22, 0.12], [0.2, 0.24, 0.13], [0.21, 0.25, 0.13], [0.23, 0.27, 0.14], [0.22, 0.14, 0.1]],   // an open hand while talking: nearly straight, the fingers curled alike (a graded curl reads as a fan)
};
const WRIST_FLEX = 0.2;     // the relaxed wrist: this far off the forearm's line (the clips come in with the hands bent nearly 60 degrees at the wrist)
const WRIST_ROLL = 1.1;     // how far grip may turn the hand about the forearm
const HINGE = { L: new THREE.Vector3(0, -0.135, -0.991), R: new THREE.Vector3(0, 0.135, -0.991) };   // the elbow axis in upper-arm space when the clip's own bend is too small to read it
const legNames = (s) => [s + '_Thigh', s + '_Calf', s + '_Foot'];
// the uncanny rules (design 5.3: taught by seeing, never said). The real parents are the first body made of each model (main.js makes
// them before anything else); every later one is a double (the night's things wearing them): its neck turns 2.4 rad where a person's
// stops at 1.1, and slowly, the way nobody's does. The real Mom's eyes stay on you six seconds after she has said something to you.
const MADE = {};
export const UNCANNY = { neck: 2.4, neckSpeed: 1.6, eyesHold: 6 };
// sitting up in bed: how far the trunk curls up from the hips (the body lies flat by a group rotation, sleepers() in main.js)
const SIT_UP = 1.5;
// the parts that rest on the mattress, and the flesh round each bone (a body in bed is kept from sinking further than it lay at rest)
const BED_REST = [['Pelvis', 0.11], ['Spine', 0.11], ['Spine1', 0.11], ['Spine2', 0.11], ['L_UpperArm', 0.05], ['R_UpperArm', 0.05], ['L_Forearm', 0.04], ['R_Forearm', 0.04], ['L_Hand', 0.03], ['R_Hand', 0.03],
  ['L_Thigh', 0.075], ['R_Thigh', 0.075], ['L_Calf', 0.05], ['R_Calf', 0.05]];
const _qBed = new THREE.Quaternion(), _qRoll = new THREE.Quaternion(), _eBed = new THREE.Euler(), _yAx = new THREE.Vector3(0, 1, 0);
// model: 'dad' | 'mom' (assets/models/<model>.glb). The rest are the low-poly look. uncanny: true for a double (by default, any body after
// the first of its model)
export function makePerson({ model, height = 1.75, uncanny, ...look } = {}) {
  const made = model ? (MADE[model] = (MADE[model] || 0) + 1) : 1;
  const lp = makeLowPoly({ height, ...look });
  const g = new THREE.Group(); g.add(lp.group); g.userData.h = height;
  const head = new THREE.Object3D(); head.position.y = 1.64 * height / 1.75; g.add(head);   // the interaction target, always there
  const person = {
    group: g, head, arms: lp.arms, rig: null, lookAt: null, uncanny: uncanny ?? made > 1, eyeHold: null, youAt: null,
    // what the body is doing on top of the clip:
    //   lean 0..1.4 (bend at the waist), squat 0..1 (both knees), kneel 0..1 (right knee on the floor)
    //   hold: an object both hands press on the sides of (holdW: its width when it has no box geometry, holdY: hand height above its origin)
    //   reach / reachLocal: a world or body-space point for the palm; hand: 'L' | 'R' | 'both'; palm: 'in' | 'down' | 'up'; grip: how far the fingers close
    //   L / R: { reach | reachLocal, palm, grip } for one hand on its own (the other follows hold / reach, or the clip)
    pose: null,
    leanNow: 0, squatNow: 0, kneelNow: 0, sitNow: 0, sitDrop: 0, duck: 0, shown: new Map(), gest: { w: 0, t: 0, kind: null, side: 'R', cool: 0, fold: 0 },   // the arms ease from what was drawn last frame (easeArms)
    update(t, dt = 0.016) {
      if (!this.rig) { lp.update(t); return; }
      const r = this.rig;
      this.bodyLang(r, dt);
      r.update(dt);
      // a body-only pose (sitting, a lean) leaves the arms to the listening poses
      let p = this.pose; if (!p || (!p.sleep && !(p.hold || p.reach || p.reachLocal || p.L || p.R))) { const ip = this.idlePose(dt); if (ip) p = p ? { ...p, ...ip } : ip; }
      // seated with nothing in them, the hands rest on the table or the thighs (and still lift to talk)
      if (p && p.sit && this.sitNow > 0.5 && !this.folding && !this.armsFree && !(p.hold || p.reach || p.reachLocal || p.L || p.R)) { const at = p.rest || this.lap; if (at) { const h = this.handsFromClip(r, at, !!p.rest, dt), mv = (S) => (h.move ? h.move[S] : 0);
          // talking: an open hand, fingers together and nearly straight, closing a little as it moves (never the cupped claw a relaxed
          // curl makes once the wrist rolls the palm up); quiet: a loose hand resting on the table
          const hand = (S) => (r.env ? { reachLocal: h[S], palm: 'in', grip: 0.15 + mv(S) * 0.25, soft: true } : { reachLocal: h[S], palm: 'down', grip: 0.15 });   // (talking: the palms toward each other, the way hands explain across a table)
          p = { ...p, restHands: true, L: hand('L'), R: hand('R') }; } }   // (p.rest: on the table)
      const idleA = r.actions[(r.alias && r.alias.idle) || 'idle'];
      this.sitNow += ((p && p.sit || 0) - this.sitNow) * Math.min(1, dt * 3.5);
      // (the standing clip has a body's own sway and shifts: the procedural ones only add a little under it)
      r.life(dt, { still: idleA ? idleA.getEffectiveWeight() * (r.alias ? 0.35 : 1) : 1, talking: !!r.env, asleep: !!(p && p.sleep && !(p.bed && p.bed.awake)) });
      this.relaxHands(r);
      if (!r.legLen && !(p && p.sleep)) this.legs(r, 0, 0);   // measure the legs (and set the root's height) once, standing
      if (p && p.sleep) { this.applyPose(r, p, 1, 0); if (p.bed) this.restOnBed(r, p.bed); }
      else {
        const k = Math.min(1, dt * 7), want = p && (p.hold || p.reach || p.reachLocal || p.L || p.R) ? 1 : 0;
        // ducking under something low: this.duck is how many metres the head must come down; a little from the waist, the rest from the knees
        let dl = 0, ds = 0;
        if (this.duck > 0.005) {
          dl = Math.min(0.55, this.duck * 2.2); const rest = Math.max(0, this.duck - 0.72 * (1 - Math.cos(dl)));
          ds = Math.min(0.9, Math.acos(Math.max(-1, 1 - rest / (r.legLen || 0.9))) / 1.1);
        }
        this.leanNow += (Math.max(p && p.lean && !this.folding ? p.lean : 0, dl) - this.leanNow) * k;   // (arms folded, they sit back from the table) this.squatNow += (Math.max(p && p.squat || 0, ds) - this.squatNow) * k; this.kneelNow += ((p && p.kneel || 0) - this.kneelNow) * k;
        const sit = this.sitNow > 1e-3 ? this.sitNow : 0;
        if (want) this.applyPose(r, sit || p.sit ? { ...p, sit } : p, 1, this.leanNow, this.squatNow, this.kneelNow);
        else if (Math.abs(this.leanNow) + this.squatNow + this.kneelNow + sit > 1e-3 || r.root.position.y !== (r.rootY0 || 0)) this.applyPose(r, sit ? { sit, seat: p && p.seat, tuck: p && p.tuck } : {}, 0, this.leanNow, this.squatNow, this.kneelNow);
        // gestures while talking, when the hands are free
        if (!want || p.restHands || !(p.L || p.R || p.hold || p.reach || p.reachLocal)) this.gesture(r, dt);
        else this.gest.w = 0;
        // the table guard: on the targets (so the easing heads for arms clear of the table), then once more on the arms as they will be
        // drawn, since the easing lags its targets by a few frames: that last fix goes on at most 6 degrees a bone a frame (no snap)
        const guard = p && p.sit && this.sitNow > 0.5 && !p.hold && !this.folding;
        if (guard) this.tableGuard(r, p);
        this.easeArms(r, dt, this.poseKey(p) + (this.armsFree ? 'free' : ''));
        if (guard && this.tableGuard(r, p)) {
          const cap = 0.105;
          for (const b of this.armBones) { const sh = this.shown.get(b); if (!sh) continue; if (sh.angleTo(b.quaternion) > cap) sh.rotateTowards(b.quaternion, cap); else sh.copy(b.quaternion); b.quaternion.copy(sh); b.updateMatrix(); }
          r.root.updateMatrixWorld(true);
        }
      }
      // the eyes held on you after a line (the real Mom), and the double's neck, which turns further and slower than a person's
      if (this.eyeHold) { this.eyeHold.t -= dt; const at = this.eyeHold.at || this.youAt; if (this.eyeHold.t > 0 && at) this.lookAt = at; else this.eyeHold = null; }
      r.lookAt(this.lookAt, dt, this.uncanny ? { yaw: UNCANNY.neck, pitch: 0.7, speed: UNCANNY.neckSpeed } : undefined);
      r.updateJaw(dt); r.face(dt);
      // the head marker (what the camera frames and what you talk to) rides with the head bone, so it comes down when they sit
      const hb = r.bones.Head;
      if (hb) { hb.updateWorldMatrix(true, false); this.group.updateWorldMatrix(true, false); const at = this.group.worldToLocal(hb.getWorldPosition(GA));
        if (!this.headOff && !this.sleeping && !this.inCar && !this.pose && this.sitNow + this.kneelNow + this.squatNow < 0.01) this.headOff = this.head.position.clone().sub(at);   // measured once, standing
        if (this.headOff) this.head.position.copy(at).add(this.headOff); }
    },
    // the palm: its centre and the direction it faces (index-to-pinky across wrist-to-knuckle, mirrored for the right hand)
    palm(side, pos, normal) {
      const B = this.rig.bones, hand = B[side + '_Hand'], k = B[side + '_Finger2'], i1 = B[side + '_Finger1'], i4 = B[side + '_Finger4'];
      for (const b of [hand, k, i1, i4]) b.updateWorldMatrix(true, false);
      hand.getWorldPosition(GA); k.getWorldPosition(GB); if (pos) pos.copy(GA).lerp(GB, 0.5);
      if (normal) { GB.sub(GA).normalize(); i1.getWorldPosition(GC); i4.getWorldPosition(GD); GD.sub(GC).normalize(); normal.crossVectors(GD, GB).multiplyScalar(side === 'L' ? 1 : -1).normalize(); }
      return pos;
    },
    // put obj in this hand: its origin sits `down` below the palm centre and `out` in front of the palm, upright, and from then on it rides with the hand bone
    // quat: its world orientation as it is taken (a torch pointed the way he faces), instead of upright
    grab(obj, side = 'R', { down = 0.1, out = 0, quat = null } = {}) {
      const r = this.rig; if (!r) { this.group.attach(obj); return; }
      this.palm(side, GE, GF);
      GE.addScaledVector(GF, out); GE.y -= down;
      if (obj.parent) obj.parent.updateWorldMatrix(true, false);
      obj.position.copy(GE); if (obj.parent) obj.parent.worldToLocal(obj.position);
      if (quat) { obj.quaternion.copy(quat); if (obj.parent) obj.quaternion.premultiply(obj.parent.getWorldQuaternion(_qu).invert()); } else obj.rotation.set(0, this.group.rotation.y, 0);
      obj.updateMatrixWorld(true);
      r.bones[side + '_Hand'].attach(obj);
    },
    // let go of something held: it stays where it is in the world, in `to` (put down on a nightstand)
    release(obj, to) { if (obj && to) to.attach(obj); },
    // with nothing in the hands and someone else talking: Mom folds her arms when she is uneasy, Dad rubs the back of his neck now and then
    idlePose(dt) {
      if (!this.listening || this.sleeping || this.inCar || !this.rig) { this.fidget = 0; return null; }
      const s = (this.group.userData.h || 1.75) / 1.75, dy = this.sitDrop || 0;   // seated, the chest is lower by the drop onto the seat
      if (this.mood === 'uneasy' || this.mood === 'scared') { if (this.rig.actions.fold) return null; return { L: { reachLocal: new THREE.Vector3(-0.12 * s, 1.17 * s - dy, 0.17 * s), palm: 'in', grip: 0.55 }, R: { reachLocal: new THREE.Vector3(0.12 * s, 1.13 * s - dy, 0.2 * s), palm: 'in', grip: 0.55 } }; }   // (the fold clip, when it is there: bodyLang)
      if (this.rubsNeck) {
        this.fidgetT = (this.fidgetT ?? 3 + Math.random() * 4) - dt;
        if (this.fidgetT <= 0) { this.fidget = 2.4; this.fidgetT = 9 + Math.random() * 8; }
        // (seated, the back of the neck would swing the elbow back into the chair's back: he rubs his jaw instead)
        if (this.fidget > 0) { this.fidget -= dt; return this.sitNow > 0.5 ? { R: { reachLocal: new THREE.Vector3(-0.03 * s, 1.47 * s - dy, 0.13 * s), palm: 'in', grip: 0.45 } } : { R: { reachLocal: new THREE.Vector3(-0.06 * s, 1.5 * s - dy, -0.05 * s), palm: 'fwd', grip: 0.4 } }; }
      }
      return null;
    },
    // what kind of pose this is: a change of kind (a hand going from a box's side to its rim, letting go, picking up) blends slowly;
    // the same kind with a moving target (stirring, a box being lifted) follows closely
    poseKey(p) {
      if (!p || p.sleep) return 'free';
      const h = (o) => (o ? (o.palm || '-') + (o.reach ? 'w' : 'l') : '');
      return (p.hold ? 'h' + (p.hold.id ?? '') : '') + (p.reach || p.reachLocal ? 'r' + (p.palm || '') + (p.hand || '') : '') + 'L' + h(p.L) + 'R' + h(p.R);
    },
    // the arms as drawn: every arm and finger bone moves from what was on screen last frame toward this frame's pose, by a share of the gap and
    // never faster than a hand can move. Nothing snaps: not a reach starting, not a grip changing, not letting go back to the clip
    easeArms(r, dt, key) {
      if (!this.armBones) this.armBones = Object.keys(r.bones).filter((n) => /^[LR]_(Clavicle|UpperArm|Forearm|Hand|Finger)/.test(n)).map((n) => r.bones[n]);
      if (key !== this.lastKey) { this.blendT = this.lastKey === undefined ? 0 : Math.max(0.34, this.longBlend || 0); this.lastKey = key; }
      this.blendT = Math.max(0, (this.blendT || 0) - dt); this.longBlend = Math.max(0, (this.longBlend || 0) - dt);
      // once settled on something carried, the arms follow it (still capped, so nothing snaps): any lag lets the walk's sway push the hands into the box.
      // the slow blend lasts until the arms have arrived (any bone still more than 12 degrees off what it is going to), not just for its time
      const slow = this.blendT > 0 || (this.farGap || 0) > 0.21, close = !slow && this.pose && this.pose.hold;
      // (carrying while walking, the follow is never held under 10 degrees a frame, or the stride's sway pushes a lagging forearm into the box)
      const share = close ? 1 : 1 - Math.exp(-dt * (slow ? (this.longBlend > 0 ? 5 : 9) : 30)), carry = !!(this.pose && this.pose.hold && this.walking);
      const cap = Math.max((slow ? (this.longBlend > 0 ? 120 : 200) : close ? 900 : 600) * Math.PI / 180 * dt, carry ? 10 * Math.PI / 180 : 0);
      let gap = 0;
      for (const b of this.armBones) {
        let s = this.shown.get(b);
        if (!s) { this.shown.set(b, b.quaternion.clone()); continue; }
        if (!r.saved.has(b)) r.saved.set(b, b.quaternion.clone());
        gap = Math.max(gap, s.angleTo(b.quaternion));
        _qt.copy(s).slerp(b.quaternion, share);
        if (s.angleTo(_qt) > cap) s.rotateTowards(b.quaternion, cap); else s.copy(_qt);
        b.quaternion.copy(s); b.updateMatrix();
      }
      this.farGap = this.blendT > 0 || this.farGap > 0.21 ? gap : 0;   // (only after a change of pose: a carried box swinging is followed closely)
      r.root.updateMatrixWorld(true);
    },
    // two-bone arm IK: the hand lands on the target and the elbow bends toward the pole, so hands rest ON things instead of passing through them.
    // T is where the palm goes; the wrist stops `pull` short of it along the arm
    ik(r, side, T, pole, w = 1, pull = 0.06) {
      const up = r.bones[side + '_UpperArm'], fo = r.bones[side + '_Forearm'], hand = r.bones[side + '_Hand'];
      for (const b of [up, fo, hand]) b.updateWorldMatrix(true, false);
      up.getWorldPosition(RS); fo.getWorldPosition(RE); hand.getWorldPosition(RH);
      const l1 = RS.distanceTo(RE), l2 = RE.distanceTo(RH);
      // the clip's own bend says which way this elbow hinges (read it whenever the bend is big enough to tell)
      const hinge = r.hinge[side] || (r.hinge[side] = HINGE[side].clone());
      IA.copy(RE).sub(RS).normalize(); IB.copy(RH).sub(RE).normalize(); IC.crossVectors(IA, IB);
      if (IC.length() > 0.08) { up.getWorldQuaternion(_qu).invert(); hinge.copy(IC.normalize().applyQuaternion(_qu)); }
      RD.copy(T).sub(RS); const d = Math.min(Math.max(RD.length() - pull, 0.05), (l1 + l2) * 0.995); RD.normalize();
      const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
      RP.copy(pole).addScaledVector(RD, -pole.dot(RD)).normalize();
      RT.copy(RS).addScaledVector(RD, a).addScaledVector(RP, h);              // the elbow
      IW.copy(RS).addScaledVector(RD, d);                                      // the wrist
      IA.copy(RT).sub(RS).normalize();
      r.aim(up, fo, IA, w);
      // twist the upper arm until the hinge lies across the plane of shoulder, elbow and wrist: the forearm then folds the way an elbow does
      IB.copy(IW).sub(RT).normalize(); IC.crossVectors(IA, IB);
      if (IC.length() > 0.05) {
        IC.normalize(); up.getWorldQuaternion(_qu); IL.copy(hinge).applyQuaternion(_qu).addScaledVector(IA, -IL.dot(IA)).normalize();
        const tw = Math.atan2(IX.crossVectors(IL, IC).dot(IA), IL.dot(IC));
        r.rotateWorld(up, _qt.setFromAxisAngle(IA, tw * w));
      }
      fo.updateWorldMatrix(true, false); fo.getWorldPosition(RE);
      r.aim(fo, hand, IB.copy(IW).sub(RE).normalize(), w);
    },
    // knees: a squat bends both, a kneel puts the right knee down and the left foot forward; the hips drop to match so the feet stay on the floor
    legs(r, squat, kneel) {
      if (!r.legLen) {
        const [t, c, f] = legNames('L').map((n) => r.bones[n].getWorldPosition(new THREE.Vector3()));
        r.thighLen = t.distanceTo(c); r.calfLen = c.distanceTo(f); r.legLen = r.thighLen + r.calfLen; r.hinge = {};
        r.rootY0 = r.root.position.y + 0.012 / (r.root.parent ? r.root.parent.matrixWorld.getMaxScaleOnAxis() : 1);   // the clips stand the soles about 1.5 cm into the floor
      }
      let drop = 0;
      if (squat > 1e-3) {
        const f = squat * 1.1;
        r.bend(['L_Thigh', 'R_Thigh'], [1, 1], [1, 0, 0], -f); r.bend(['L_Calf', 'R_Calf'], [1, 1], [1, 0, 0], 2 * f); r.bend(['L_Foot', 'R_Foot'], [1, 1], [1, 0, 0], -f);
        drop += r.legLen * (1 - Math.cos(f));
      }
      if (kneel > 1e-3) {
        r.bend(legNames('R'), [0.1, 1.45, 0.6], [1, 0, 0], kneel); r.bend(['L_Thigh', 'L_Calf'], [-1.62, 1.62], [1, 0, 0], kneel);
        drop += (r.calfLen + 0.04) * kneel;
      }
      const y = r.rootY0 - (drop > 1e-4 ? drop : 0);
      if (r.root.position.y !== y) { r.root.position.y = y; r.root.updateMatrixWorld(true); }
    },
    // the axis the fingers of one hand close about (across the knuckles, signed so a positive turn goes toward the palm `cp`)
    curlAxis(r, side, cp, out) {
      const B = r.bones, hand = B[side + '_Hand'], i1 = B[side + '_Finger1'], i2 = B[side + '_Finger2'], i4 = B[side + '_Finger4'];
      for (const b of [hand, i1, i2, i4]) b.updateWorldMatrix(true, false);
      i1.getWorldPosition(RS); i4.getWorldPosition(RT); i2.getWorldPosition(RA); hand.getWorldPosition(RH);
      const d = GA.copy(RA).sub(RH).normalize(); out.copy(RT).sub(RS).normalize();
      if (GF.crossVectors(out, d).dot(cp) < 0) out.negate();
      return out;
    },
    // curl every finger by a table of joint angles (minus `from`, when that table is already on the hand), about `ax`
    curl(r, side, ax, table, from = null, w = 1) {
      for (let f = 0; f < 5; f++) {
        const n = FINGERS[f], chain = [n, n + '1', n + '2'];
        for (let i = 0; i < 3; i++) {
          const b = r.bones[side + '_' + chain[i]]; if (!b) continue;
          const a = (table[f][i] - (from ? from[f][i] : 0)) * w;
          if (Math.abs(a) > 1e-4) r.rotateWorld(b, new THREE.Quaternion().setFromAxisAngle(ax, a));
        }
      }
    },
    // the resting hand, every frame on both sides: the clip's bent blade becomes a loose hand, the wrist brought back near the
    // forearm's line, the fingers curled
    relaxHands(r) {
      for (const side of ['L', 'R']) {
        const hand = r.bones[side + '_Hand'], fo = r.bones[side + '_Forearm'], th = r.bones[side + '_Finger0'], i1 = r.bones[side + '_Finger1'], i4 = r.bones[side + '_Finger4'];
        if (!hand || !fo || !th || !i1 || !i4) continue;
        const knuckles = () => { for (const b of [fo, hand, th, i1, i4]) b.updateWorldMatrix(true, false); fo.getWorldPosition(RE); hand.getWorldPosition(RH); i1.getWorldPosition(RS); i4.getWorldPosition(RT); th.getWorldPosition(RA); return GE.copy(RS).add(RT).multiplyScalar(0.5).sub(RH).normalize(); };
        let along = knuckles();
        const fa = GA.copy(RH).sub(RE).normalize(), flex = fa.angleTo(along);
        if (flex > WRIST_FLEX + 0.02) { const axis = GF.crossVectors(along, fa); if (axis.lengthSq() > 1e-8) { r.rotateWorld(hand, new THREE.Quaternion().setFromAxisAngle(axis.normalize(), flex - WRIST_FLEX)); along = knuckles(); } }
        this.curl(r, side, this.curlAxis(r, side, this.palmSide(r, side, new THREE.Vector3()), GC), CURL.relaxed);
        this.fingerSpread(r, side);
      }
    },
    // which way this hand's palm really faces: the side the thumb's root sits on (its offset from the knuckle line, with the across- and
    // along-hand parts taken out). Every finger curl is measured about this, so a curl and its undoing never go opposite ways
    palmSide(r, side, out) {
      const B = r.bones, hand = B[side + '_Hand'], th = B[side + '_Finger0'], i1 = B[side + '_Finger1'], i4 = B[side + '_Finger4'];
      for (const b of [hand, th, i1, i4]) b.updateWorldMatrix(true, false);
      const h = hand.getWorldPosition(new THREE.Vector3()), a = i1.getWorldPosition(new THREE.Vector3()), b4 = i4.getWorldPosition(new THREE.Vector3()), t = th.getWorldPosition(new THREE.Vector3());
      const along = a.clone().add(b4).multiplyScalar(0.5).sub(h).normalize(), lat = b4.clone().sub(a).normalize();
      out.copy(t).sub(a).lerp(t.clone().sub(b4), 0.5); out.addScaledVector(lat, -out.dot(lat)).addScaledVector(along, -out.dot(along));
      return out.normalize();
    },
    // the clips and the rest pose fan the fingers wide (a claw round an invisible ball): each finger is brought in toward the middle one,
    // across the palm, to no more than a few degrees off it (the pinky a little more), and the thumb rests a little across toward the
    // index finger's first joint, as a loose hand's does
    fingerSpread(r, side) {
      const B = r.bones, mid = B[side + '_Finger2'], mid1 = B[side + '_Finger21'], th = B[side + '_Finger0'], th1 = B[side + '_Finger01'], ix1 = B[side + '_Finger11'];
      if (!mid || !mid1) return;
      const n = new THREE.Vector3(); this.palm(side, null, n); const P = (b) => { b.updateWorldMatrix(true, false); return b.getWorldPosition(new THREE.Vector3()); };
      const flat = (v) => v.addScaledVector(n, -v.dot(n)).normalize();
      const dm = flat(P(mid1).sub(P(mid))), across = new THREE.Vector3().crossVectors(n, dm), m0 = P(mid);
      // each finger turned (across the palm) to lean in toward the middle one by a few degrees: the knuckles sit apart on this model, so
      // fingers merely parallel still show gaps; leaning in, they touch the way a loose hand's do. Never fanned out past that.
      for (const [f, lean] of [['1', 0.05], ['3', 0.05], ['4', 0.09]]) {
        const a = B[side + '_Finger' + f], a1 = B[side + '_Finger' + f + '1']; if (!a || !a1) continue;
        const sOut = Math.sign(across.dot(P(a).sub(m0))) || 1;   // which side of the middle finger this one is on
        const d = flat(P(a1).sub(P(a))), out = Math.atan2(n.dot(new THREE.Vector3().crossVectors(dm, d)), dm.dot(d)) * sOut;   // fanned out: positive
        if (out > -lean) r.rotateWorld(a, new THREE.Quaternion().setFromAxisAngle(n, (-lean - out) * sOut));
      }
      if (th && th1 && ix1) { const T = P(ix1).addScaledVector(n, 0.012), b = P(th); r.aim(th, th1, T.sub(b).normalize(), 0.3); }
    },
    // Wrist roll and finger curl: turn the hand about the forearm so the palm faces `c` (the way the fingers should close), within the
    // wrist's range, then close the fingers toward it: `amount` 0..1 blends the relaxed hand to a full grip; `flat` presses the palm open
    grip(r, side, c, amount, w = 1, flat = false) {
      const B = r.bones, hand = B[side + '_Hand'], fo = B[side + '_Forearm'], i1 = B[side + '_Finger1'], i4 = B[side + '_Finger4'];
      if (!hand || !fo || !i1 || !i4) return;
      for (const b of [fo, hand, i1, i4]) b.updateWorldMatrix(true, false);
      fo.getWorldPosition(RE); hand.getWorldPosition(RH);
      const fa = GA.copy(RH).sub(RE).normalize();
      const cp = GB.copy(c).addScaledVector(fa, -c.dot(fa)).normalize();
      i1.getWorldPosition(RS); i4.getWorldPosition(RT); const lat = GC.copy(RT).sub(RS).normalize();
      const latT = GD.crossVectors(fa, cp); if (latT.dot(lat) < 0) latT.negate();
      const lp = GE.copy(lat).addScaledVector(fa, -lat.dot(fa)).normalize(), tp = latT.addScaledVector(fa, -latT.dot(fa)).normalize();
      const roll = THREE.MathUtils.clamp(Math.atan2(GF.crossVectors(lp, tp).dot(fa), lp.dot(tp)), -WRIST_ROLL, WRIST_ROLL);
      if (Math.abs(c.dot(fa)) < 0.95) r.rotateWorld(hand, new THREE.Quaternion().setFromAxisAngle(fa, roll * w));   // no roll to speak of when the palm should face along the forearm
      const ax = this.curlAxis(r, side, this.palmSide(r, side, new THREE.Vector3()), GC);   // (the real palm side, as relaxHands curled about: not the wished-for one)
      const k = THREE.MathUtils.clamp(amount, 0, 1), to = flat === 'soft' ? CURL.soft.map((f, i) => f.map((a, j) => a + (CURL.relaxed[i][j] - a) * k)) : flat ? CURL.flat : CURL.relaxed.map((f, i) => f.map((a, j) => a + (CURL.grip[i][j] - a) * k));   // (soft: open, toward relaxed by amount)
      this.curl(r, side, ax, to, CURL.relaxed, w);
    },
    // in bed: the body never sinks further into the mattress than it lay at rest. While it lies still (bed.rest) its lowest point (each
    // resting bone less the flesh round it) is measured; rolled or sitting up, the group is lifted by however far below that it has gone
    restOnBed(r, bed) {
      if (!bed.keep) return;
      let low = Infinity;
      for (const [n, rad] of BED_REST) { const bn = r.bones[n]; if (!bn) continue; bn.updateWorldMatrix(true, false); low = Math.min(low, bn.getWorldPosition(GA).y - rad); }
      if (!isFinite(low)) return;
      if (bed.rest || this.bedLow === undefined) { this.bedLow = low; return; }
      const dy = this.bedLow - low;
      if (dy > 1e-4) { this.group.position.y += dy; this.group.updateMatrixWorld(true); }
      this.bedLift = Math.max(0, dy);
    },
    // lay this body in bed at spot ({ x, y, z, yaw }, world.js parentsBed): on its back by a group rotation, its head on the pillow; roll
    // (radians, + onto its left side) turns it about its own length, shift moves it across the bed (metres toward its left), toFoot down
    // the bed from the spot. The group's order stays YXZ, which is how the rest of the game knows a body is lying down
    inBed(spot, { roll = 0, shift = 0, toFoot = 0.1, lift = 0.02 } = {}) {
      const g2 = this.group;
      g2.rotation.order = 'YXZ'; _qBed.setFromEuler(_eBed.set(-Math.PI / 2, spot.yaw ?? Math.PI / 2, 0, 'YXZ'));
      if (roll) _qBed.multiply(_qRoll.setFromAxisAngle(_yAx, roll));
      g2.quaternion.copy(_qBed);
      const yaw = spot.yaw ?? Math.PI / 2, fx = Math.sin(yaw), fz = Math.cos(yaw);   // (the foot of the bed, from the spot: the way the body's feet point)
      const lx = Math.cos(yaw), lz = -Math.sin(yaw);                                 // its left, lying on its back
      g2.position.set(spot.x + fx * toFoot + lx * shift, spot.y + lift, spot.z + fz * toFoot + lz * shift);
      g2.updateMatrixWorld(true);
    },
    applyPose(r, p, w = 1, lean = p.lean || 0, squat = p.squat || 0, kneel = p.kneel || 0) {
      if (p.sleep) {   // asleep on the back: the head turned toward the room, the feet flat, a slow breath in the chest
        // p.bed (js/parents.js): { sit 0..1 sitting up, turn the head's turn (-1..1, else p.sleep), knee { L, R } a knee drawn up (lying on
        // a side), legs { thigh, shin, foot, w } world directions (swung over the edge of the bed), arms { L, R: { at, pole, palm, grip, w } }
        // hands on targets (on the lap, laid on the quilt, in front of the chest), awake (the eyes open) }
        const b = p.bed || {}, sit = b.sit || 0, flat = 1 - sit;
        r.bend(['Neck', 'Head'], [0.4, 0.6], [0, 1, 0], 0.55 * (b.turn ?? p.sleep) * (1 - 0.7 * sit));
        if (!b.legs) r.bend(['L_Foot', 'R_Foot'], [1, 1], [1, 0, 0], (p.feet ?? 1.0) * (1 - 0.5 * sit));   // toes pointed along the bed, so they stay under the quilt (the breath is the life layer's)
        r.bend(['Spine1', 'Spine2', 'Neck'], [0.35, 0.4, 0.25], [1, 0, 0], 0.12 * flat);   // the shoulders and head propped on the pillow, not sunk through it into the mattress
        // sitting up: the trunk curls up from the hips with the legs left lying along the bed (the thighs hang from the spine bone in this
        // skeleton, so they are given its share back), the head tipped forward off the pillow's angle so the eyes look ahead
        if (sit > 1e-3) {
          const lean = SIT_UP * sit;
          r.bend(['Spine', 'Spine1', 'Spine2'], [0.3, 0.4, 0.3], [1, 0, 0], lean);
          if (r.bones.L_Thigh && r.bones.L_Thigh.parent === r.bones.Spine) r.bend(['L_Thigh', 'R_Thigh'], [1, 1], [1, 0, 0], -0.3 * lean);
          r.bend(['Neck', 'Head'], [0.5, 0.5], [1, 0, 0], 0.18 * sit);
        }
        // lying on a side, the upper knee drawn up a little
        for (const S of ['L', 'R']) { const k = (b.knee && b.knee[S]) || 0; if (k > 1e-3) { r.bend([S + '_Thigh'], [1], [1, 0, 0], -0.55 * k); r.bend([S + '_Calf'], [1], [1, 0, 0], 1.0 * k); r.bend([S + '_Foot'], [1], [1, 0, 0], -0.3 * k); } }
        // the legs aimed in the world: swung out over the edge of the bed to sit on it
        if (b.legs) for (const S of ['L', 'R']) {
          const B = r.bones, w = b.legs.w ?? 1, th = b.legs.thigh[S] || b.legs.thigh;
          r.aim(B[S + '_Thigh'], B[S + '_Calf'], th, w); r.aim(B[S + '_Calf'], B[S + '_Foot'], b.legs.shin, w); if (B[S + '_Toe0']) r.aim(B[S + '_Foot'], B[S + '_Toe0'], b.legs.foot, w);
        }
        // the hands on their targets; the elbows out to the side and toward the feet unless the target says otherwise
        if (b.arms) {
          r.hinge ||= {};   // (a body laid down before it ever stood has not had its elbows read yet)
          this.group.getWorldQuaternion(RQ);
          for (const [S, sg] of [['L', 1], ['R', -1]]) {
            const a = b.arms[S]; if (!a || !a.at || (a.w ?? 1) <= 0.005) continue;
            const pole = a.pole ? RPole.copy(a.pole) : RPole.set(sg * 0.8, -0.35, -0.45).applyQuaternion(RQ);
            this.ik(r, S, a.at, pole.clone(), a.w ?? 1);
            this.grip(r, S, a.palm || RG.set(0, -1, 0), a.grip ?? 0.3, a.w ?? 1);
          }
        }
        return;
      }
      this.legs(r, squat, kneel);
      if (p.sit) { const drop = this.sit(r, p.sit, p.seat, p.tuck || 0); r.root.position.y = (r.rootY0 || 0) - drop; r.root.updateMatrixWorld(true); this.sitDrop = drop * (r.root.parent ? r.root.parent.matrixWorld.getMaxScaleOnAxis() / this.group.matrixWorld.getMaxScaleOnAxis() : 1); }
      else this.sitDrop = 0;
      if (lean) r.bend(['Spine', 'Spine1', 'Spine2'], [0.3, 0.4, 0.3], [1, 0, 0], lean);
      // standing, the thighs hang from the spine bone in this skeleton: give them back its share so a lean does not push a foot into the floor
      if (lean && !squat && !kneel && r.bones.L_Thigh && r.bones.L_Thigh.parent === r.bones.Spine) r.bend(['L_Thigh', 'R_Thigh'], [1, 1], [1, 0, 0], -0.3 * lean);
      // world facing: the people can sit in a car that is turned
      this.group.getWorldQuaternion(RQ); RF.set(0, 0, 1).applyQuaternion(RQ); const y = Math.atan2(RF.x, RF.z), left = RL.set(Math.cos(y), 0, -Math.sin(y)), fwd = RF.set(Math.sin(y), 0, Math.cos(y));
      const hands = p.hand || 'both';
      const facing = (q, def) => q === 'down' ? RG.set(0, -1, 0) : q === 'up' ? RG.set(0, 1, 0) : q === 'fwd' ? RG.copy(fwd) : def;
      for (const [s, sg] of [['L', 1], ['R', -1]]) {
        const own = p[s];
        if (!own && hands !== 'both' && hands !== s) continue;
        let T = null, palm = null, close = 0.75, flat = false;
        if (own) {
          T = own.reach ? own.reach.clone() : own.reachLocal ? this.group.localToWorld(own.reachLocal.clone()) : null;
          palm = facing(own.palm, RG.copy(left).multiplyScalar(-sg)); close = own.grip ?? 0.75;
        } else if (p.hold) {   // both hands flat on the sides of what is carried
          { const cl = r.bones[s + '_Clavicle'], rest = r.restLocal && r.restLocal[s + '_Clavicle']; if (cl && rest) { if (!r.saved.has(cl)) r.saved.set(cl, cl.quaternion.clone()); cl.quaternion.copy(rest); cl.updateMatrixWorld(true); } }   // the shoulders held still (no walking swing): the elbows stay out round the box
          p.hold.updateWorldMatrix(true, false); p.hold.getWorldPosition(RC);
          const hw = p.holdW !== undefined ? p.holdW / 2 : p.hold.geometry.parameters.width / 2 * p.hold.getWorldScale(RS).x;
          T = RC.clone().addScaledVector(left, sg * (hw + 0.04)); T.y += p.holdY ?? -0.03; T.addScaledVector(fwd, -0.08);   // (T is the wrist: the palm then lies over the middle of the side)
          palm = RG.copy(left).multiplyScalar(-sg); close = 0; flat = true;
        } else if (p.reach || p.reachLocal) {
          T = p.reach ? p.reach.clone() : this.group.localToWorld(p.reachLocal.clone());
          if (hands === 'both') T.addScaledVector(left, sg * 0.08);
          palm = facing(p.palm, RG.copy(left).multiplyScalar(-sg)); close = p.grip ?? 0.75;
        }
        if (!T || w <= 0.005) continue;
        const pole = RPole.copy(left).multiplyScalar(sg * (p.hold ? 1.2 : 0.7)).addScaledVector(fwd, -0.3).add(RDown).clone(), pc = palm.clone();   // (round a box the elbows go wide, so the forearms clear its sides)
        this.ik(r, s, T, pole, w);
        this.grip(r, s, pc, close, w, own && own.soft ? 'soft' : flat);
        if (!own && p.hold) this.onFace(r, s, p.hold, left.clone().multiplyScalar(sg), T, pole, pc, w);
      }
    },
    // a palm pressed on the face of a box: the fingers lie along the face, not into it, and the whole hand sits just outside it.
    // out: the face's outward normal for this hand; the box's half width along it comes from its geometry
    onFace(r, side, box, out, T, pole, palmDir, w) {
      const B = r.bones, hand = B[side + '_Hand'], tips = ['Finger12', 'Finger22', 'Finger32', 'Finger42'].map((n) => B[side + '_' + n]).filter(Boolean);   // (the thumb wraps the front edge)
      box.updateWorldMatrix(true, false); const mid = box.getWorldPosition(new THREE.Vector3());   // its own vector: ik() and grip() reuse the shared ones
      const hw = box.geometry && box.geometry.parameters ? box.geometry.parameters.width / 2 * box.getWorldScale(GD).x : 0.2;
      const depth = (v) => v.clone().sub(mid).dot(out) - hw;                 // above the face: positive
      let pushed = 0;
      for (let it = 0; it < 3; it++) {
        // lay the fingers along the face: turn the hand so its knuckle line has no part along the normal
        hand.updateWorldMatrix(true, true); hand.getWorldPosition(RH); B[side + '_Finger2'].getWorldPosition(RA);
        const along = RA.clone().sub(RH).normalize(), flatDir = along.clone().addScaledVector(out, -along.dot(out)).normalize();
        const ang = along.angleTo(flatDir);
        if (ang > 0.02 && ang < 1.3) { const ax = GF.crossVectors(along, flatDir); if (ax.lengthSq() > 1e-8) r.rotateWorld(hand, _qu.setFromAxisAngle(ax.normalize(), ang * w)); }
        // and the fingers straight along it, the thumb up along the side toward the top edge (so no fingertip curls into the face)
        const up = GE.set(0, 1, 0), thumbDir = flatDir.clone().add(up).normalize();
        for (const f of ['1', '2', '3', '4']) { const a = B[side + '_Finger' + f], b = B[side + '_Finger' + f + '1'], c = B[side + '_Finger' + f + '2']; if (a && b) r.aim(a, b, flatDir, w); if (b && c) r.aim(b, c, flatDir, w); }
        { const a = B[side + '_Finger0'], b = B[side + '_Finger01'], c = B[side + '_Finger02']; if (a && b) r.aim(a, b, thumbDir, w); if (b && c) r.aim(b, c, thumbDir, w); }
        hand.updateWorldMatrix(true, true);
        let worst = Infinity; for (const b of [hand, ...tips]) { b.getWorldPosition(RB); worst = Math.min(worst, depth(RB)); }
        // the skin runs on past the last finger joint: a point beyond each tip, along its last bone
        for (const b of tips) { b.getWorldPosition(RB); b.parent.getWorldPosition(RD); worst = Math.min(worst, depth(RB.clone().addScaledVector(RB.clone().sub(RD), 0.4))); }
        if (worst >= 0.016) break;   // the joints sit about 1.5 cm inside the skin
        // still in: move the target out by the overlap and solve again
        const push = Math.min(0.035 - pushed, 0.02 - worst); if (push <= 0.001) break; T.addScaledVector(out, push); pushed += push;   // (never more than 3.5 cm in all)
        this.ik(r, side, T, pole, w); this.grip(r, side, palmDir, 0, w, true);
      }
    },
    // sitting on a chair whose seat is `seat` m off the floor: the hip joints a buttock's thickness above it, the thighs along it to the
    // front edge, the shins straight down and the feet flat as they stand (each limb aimed in world space, so the clip's hip sway cannot
    // turn the knees off to one side). Returns how far the root came down; this.lap keeps where the hands can rest on the thighs.
    sit(r, k, seat = 0.46, tuck = 0) {
      if (k < 1e-3) return 0;
      const B = r.bones, s = (this.group.userData.h || 1.75) / 1.75;
      this.group.updateWorldMatrix(true, false); r.root.updateMatrixWorld(true);
      const q = this.group.getWorldQuaternion(RQ), fwd = RF.set(0, 0, 1).applyQuaternion(q).setY(0).normalize(), side = RL.set(1, 0, 0).applyQuaternion(q).setY(0).normalize();
      const floor = this.group.getWorldPosition(GA).y, sc = r.root.parent ? r.root.parent.matrixWorld.getMaxScaleOnAxis() : 1;
      // standing, before anything moves: the ankles' height and the way each foot points
      const foot = {};
      for (const S of ['L', 'R']) { const f = B[S + '_Foot'], t = B[S + '_Toe0']; f.getWorldPosition(GB); t.getWorldPosition(GC); foot[S] = { h: GB.y - floor, dir: GC.clone().sub(GB).normalize() }; }
      B.L_Thigh.getWorldPosition(GB); B.R_Thigh.getWorldPosition(GC);
      const hipY = (GB.y + GC.y) / 2, wantY = floor + seat + 0.09 * s, drop = Math.max(0, hipY - wantY) * k / sc;
      r.root.position.y = (r.rootY0 || 0) - drop; r.root.updateMatrixWorld(true);
      this.lap = this.lap || { L: new THREE.Vector3(), R: new THREE.Vector3() };
      for (const S of ['L', 'R']) {
        const th = B[S + '_Thigh'], ca = B[S + '_Calf'], fo = B[S + '_Foot'], toe = B[S + '_Toe0'], sg = S === 'L' ? 1 : -1;
        th.getWorldPosition(GB);
        const kneeY = floor + r.calfLen + foot[S].h, dy = Math.min(r.thighLen * 0.95, Math.max(-r.thighLen * 0.95, GB.y - kneeY)), dx = Math.sqrt(r.thighLen * r.thighLen - dy * dy);
        const knee = GC.copy(GB).addScaledVector(fwd, dx).addScaledVector(side, sg * 0.03 * s); knee.y = GB.y - dy;
        r.aim(th, ca, GD.copy(knee).sub(GB).normalize(), k);
        r.aim(ca, fo, GD.set(0, -1, 0).addScaledVector(fwd, -0.02 - 0.12 * tuck).normalize(), k);   // shins plumb, the feet a touch back under the knees (tucked well back, close in to a table)
        r.aim(fo, toe, foot[S].dir, k);
        // the top of the thigh, a little past halfway to the knee: where a hand rests
        th.getWorldPosition(GB); ca.getWorldPosition(GC);
        this.lap[S].copy(GB).lerp(GC, 0.6); this.lap[S].y += 0.085 * s; this.group.worldToLocal(this.lap[S]);
      }
      return drop;
    },
    // what the free arms and the face do in a conversation. Talking: beat gestures on the stresses of the voice (a forearm lifts and
    // opens, the other answers now and then), a shrug on a question, a point toward the listener at the start of a line to someone.
    // Listening: nods, a tilt, a glance away and back.
    gesture(r, dt) {
      const G = this.gest, t = r.t, env = r.env;
      G.cool -= dt;
      let amp = 0;
      if (env) { const i = Math.max(0, Math.min(env.length - 1, Math.floor((t - r.envT0) * 30))); amp = env[i] || 0; G.prevAmp = G.prevAmp ?? 0;
        const rising = amp > 0.55 && G.prevAmp <= 0.55;
        if (rising && G.cool <= 0 && G.w < 0.2) {
          const q = this.talkOpts && this.talkOpts.question && G.shrugDone !== r.envT0;
          G.kind = q && (t - r.envT0) > 0.4 ? 'shrug' : r.actions.talk ? null : (this.talkOpts && this.talkOpts.to && this.talkOpts.to !== 'you' && G.pointDone !== r.envT0) ? 'point' : Math.random() < 0.6 ? 'beat' : 'open';   // (with the talking clips, the arms are theirs)
          if (G.kind === 'shrug') G.shrugDone = r.envT0; if (G.kind === 'point') G.pointDone = r.envT0;
          G.side = Math.random() < (this.handedL ? 0.65 : 0.35) ? 'L' : 'R'; G.t = 0; G.len = G.kind === 'beat' ? 0.55 : 0.9; G.cool = 0.5 + Math.random() * 0.9; G.w = G.kind ? 1e-3 : 0;
        }
        G.prevAmp = amp;
      }
      if (G.w > 0) {
        G.t += dt; const u = G.t / G.len;
        G.w = u < 0.3 ? u / 0.3 : u < 0.65 ? 1 : Math.max(0, 1 - (u - 0.65) / 0.35); G.w = G.w * G.w * (3 - 2 * G.w);
        if (u >= 1) G.w = 0;
        const w = G.w, sg = G.side === 'L' ? 1 : -1, S = G.side;
        if (G.kind === 'beat') { r.bend([S + '_UpperArm'], [1], [1, 0, 0], -0.32 * w); r.bend([S + '_Forearm'], [1], [1, 0, 0], -0.85 * w); r.bend([S + '_Forearm'], [1], [0, 0, 1], 0.25 * sg * w); }
        else if (G.kind === 'open') { for (const [s2, g2] of [['L', 1], ['R', -1]]) { r.bend([s2 + '_UpperArm'], [1], [1, 0, 0], -0.22 * w); r.bend([s2 + '_Forearm'], [1], [1, 0, 0], -0.7 * w); r.bend([s2 + '_Forearm'], [1], [0, 0, 1], 0.35 * g2 * w); } }
        else if (G.kind === 'shrug') { r.bend(['L_Clavicle', 'R_Clavicle'], [1, -1], [0, 0, 1], 0.12 * w); if (!r.actions.talk) for (const [s2, g2] of [['L', 1], ['R', -1]]) { r.bend([s2 + '_Forearm'], [1], [1, 0, 0], -0.75 * w); r.bend([s2 + '_UpperArm'], [1], [0, 0, 1], 0.25 * g2 * w); } r.bend(['Head'], [1], [0, 0, 1], 0.12 * w); }
        else if (G.kind === 'point') { r.bend([S + '_UpperArm'], [1], [1, 0, 0], -0.75 * w); r.bend([S + '_Forearm'], [1], [1, 0, 0], -0.3 * w); }
      }
      // listening: someone else is talking to or near this one
      if (!env && this.listening) {
        G.nodT = (G.nodT ?? 1 + Math.random() * 2) - dt;
        if (G.nodT <= 0) { G.nod = 0.6; G.nodT = 1.8 + Math.random() * 2.6; G.tilt = (Math.random() - 0.5) * 0.18; }
        if (G.nod > 0) { G.nod -= dt; const k = Math.sin(Math.PI * Math.max(0, Math.min(1, 1 - G.nod / 0.6))); r.bend(['Head'], [1], [1, 0, 0], 0.1 * k); }
        r.bend(['Head'], [1], [0, 0, 1], (G.tilt || 0));
      }
    },
    // ---- body language: the clips (assets/models/body.bin) laid over the standing one by what this person is doing ----
    // Talking: the talking clip, its share of the body and its speed following the voice (the loud stretches move more and faster);
    // every line starts on the other mirror of the clip at a fresh point in it, so no two lines move the same. Seated: the seated
    // clips (the legs stay where sit() puts them; the hands go through handsFromClip). Listening while uneasy: arms folded.
    bodyLang(r, dt) {
      const B = this.bl || (this.bl = { line: null, v: Math.random() < 0.5 ? 1 : 0, amp: 0 });
      this.folding = false; this.armsFree = false;
      const p = this.pose, cur = r.cur, standing = cur === 'stand' || cur === 'idle';
      if (!r.actions.talk) return;
      if (!standing) { if (r.ov) for (const [, o] of r.ov) o.rate = 8; return; }   // walking (or anything else): the standing layers go at once
      // asleep, in the car, or at work with the hands (stirring, a mug, a box, the camera held out): the old idle under it all, which
      // those poses were fitted to
      const working = !!(p && (p.hold || p.reach || p.reachLocal || ((p.L || p.R) && !p.sit)));
      if (this.sleeping || this.inCar || (p && p.sleep) || working) { if (cur === 'stand') r.overlay('idle', 0.97, { rate: this.sleeping || (p && p.sleep) ? 50 : 8 }); return; }
      let amp = 0; if (r.env) { const i = Math.floor((r.t - r.envT0) * 30); amp = i >= 0 && i < r.env.length ? r.env[i] || 0 : 0; }
      B.amp += (amp - B.amp) * Math.min(1, dt * 3);
      if (r.env && r.envT0 !== B.line) { B.line = r.envT0; B.v = 1 - B.v; B.off = Math.random(); }
      const m = B.v ? '_m' : '', seated = !!(p && p.sit) && this.sitNow > 0.3, held = !!(p && (p.hold || p.reach || p.reachLocal || p.L || p.R));
      const uneasy = this.mood === 'uneasy' || this.mood === 'scared';
      if (r.env) {
        if (seated && !held) {   // the seated body sways with the talk; the arms gesture over the table (see tableGuard)
          r.overlay('sit_talk' + m, 0.55 + 0.4 * B.amp, { rate: 2.5, speed: 0.8 + 0.35 * B.amp, offset: B.off });
          r.overlay('sit_talk_arms' + m, 0.9, { rate: 2.2, speed: 0.8 + 0.35 * B.amp, offset: B.off });
          this.armsFree = !(p && p.rest) && r.ovShare('sit_talk_arms' + m) > 0.15;   // (at a table the hands go where handsFromClip says, over the top)
        } else if (seated) r.overlay('sit_talk' + m, 0.55 + 0.4 * B.amp, { rate: 2.5, speed: 0.8 + 0.35 * B.amp, offset: B.off });
        else r.overlay('talk' + m, 0.5 + 0.48 * B.amp, { rate: 3, speed: 0.85 + 0.35 * B.amp, offset: B.off });
      } else if (this.listening && uneasy && !held) { r.overlay('fold' + m, 0.92, { rate: 1.4, offset: B.off ?? 0 }); this.folding = r.ovShare('fold' + m) > 0.3; if (seated) r.overlay('sit_idle' + m, 0.8, { rate: 2, speed: 0.8 }); }
      else if (seated) r.overlay('sit_idle' + m, 0.8, { rate: 2, speed: 0.8 });
      if (this.folding !== B.wasFolding) { B.wasFolding = this.folding; this.longBlend = 0.9; }   // (into or out of folded arms: the arms go the long way, slowly)
    },
    // seated hands: where they rest (on the table, or the thighs) moved by what the clip's own hands are doing, measured from the chest,
    // around their recent average: a gesture lifts and opens a hand off the table and puts it back down. The arms are then solved onto
    // these points, so they reach forward to them: the elbows stay in front of the chair's back, the hands never go into the table.
    handsFromClip(r, at, onTable, dt) {
      const H = this.hc || (this.hc = { mean: { L: null, R: null }, L: new THREE.Vector3(), R: new THREE.Vector3(), lift: { L: 0, R: 0 } });
      const chest = r.bones.Spine2; chest.updateWorldMatrix(true, false); const c = this.group.worldToLocal(chest.getWorldPosition(GA));
      const s = (this.group.userData.h || 1.75) / 1.75, k = Math.min(1, dt * 0.6), talking = !!r.env;
      for (const S of ['L', 'R']) {
        const hb = r.bones[S + '_Hand']; hb.updateWorldMatrix(true, false);
        const h = this.group.worldToLocal(hb.getWorldPosition(GB)).sub(c);
        if (!H.mean[S]) H.mean[S] = h.clone(); else H.mean[S].lerp(h, k);
        // (soft limits: tanh keeps the hand moving the way the clip's does, ever more slowly toward the edge of its room)
        const d = GC.copy(h).sub(H.mean[S]).multiplyScalar(talking ? 1.25 : 0.5), soft = (v, lo, hi) => (v >= 0 ? hi * Math.tanh(v / hi) : -lo * Math.tanh(-v / lo));
        d.x = soft(d.x, 0.09 * s, 0.09 * s); d.z = soft(d.z, 0.06 * s, 0.06 * s);   // (a moderate reach: the hands stay near where they rest)
        d.y = soft(d.y, onTable ? 0.0001 : 0.02, 0.09 * s);   // up off the table (a few centimetres, not up to the face), never down into it
        const prev = H.prev && H.prev[S] ? H.prev[S] : null; H.prev = H.prev || {};
        const v = prev && dt > 0 ? prev.distanceTo(d) / dt : 0; H.prev[S] = d.clone();
        H.move = H.move || { L: 0, R: 0 }; H.move[S] += (Math.min(1, v / 0.35) - H.move[S]) * Math.min(1, dt * 6);   // how fast the hand is going (0..1), smoothed
        H[S].copy(at[S]).add(d); H.lift[S] = Math.max(0, d.y) / (0.09 * s);
      }
      return H;
    },
    // seated at the table, whatever the arms are doing (resting on it, or the clip's gestures): the table top is a floor for the hand and
    // the forearm. Points along each arm (the forearm from the elbow to the wrist, the hand, a little past each fingertip) that are over the
    // table must clear its top by the flesh around the bone; a hand that does not is lifted onto it (and a forearm low across the edge is
    // drawn back toward the body), the arm solved again, three times at most. The elbows are aimed out and down, in front of the chair back.
    tableGuard(r, p) {
      const rest = p.rest; if (!rest) return false;
      const top = this.group.localToWorld(GD.copy(rest.L)).y - 0.06, edge = (rest.edge ?? rest.L.z - 0.1) - 0.05;   // (rest: 6 cm above the top; a hand within 5 cm of the rim counts as over it)
      this.group.getWorldQuaternion(RQ); const left = RL.set(1, 0, 0).applyQuaternion(RQ).clone(), fwd = RF.set(0, 0, 1).applyQuaternion(RQ).clone();
      const B = r.bones, L = new THREE.Vector3(), W = new THREE.Vector3(), E = new THREE.Vector3(), H = new THREE.Vector3(); let moved = false;
      for (const [S, sg] of [['L', 1], ['R', -1]]) {
        const fo = B[S + '_Forearm'], hand = B[S + '_Hand'], tips = ['Finger02', 'Finger12', 'Finger22', 'Finger32', 'Finger42'].map((n) => B[S + '_' + n]).filter(Boolean);
        let T = null;
        for (let it = 0; it < 3; it++) {
          hand.updateWorldMatrix(true, true); fo.getWorldPosition(E); hand.getWorldPosition(H);
          let need = 0, back = 0;
          const test = (w, clear, nearElbow) => { L.copy(w); this.group.worldToLocal(L); if (L.z < edge) return; const d = top + clear - w.y; if (d > need) { need = d; back = nearElbow ? 1 : back; } };
          for (let k = 0; k <= 4; k++) test(W.copy(E).lerp(H, k / 4), 0.042, k < 2);   // the forearm: the bone runs about 4 cm inside
          test(H, 0.04, false);
          for (const b of tips) { b.getWorldPosition(W); b.parent.getWorldPosition(L); test(W.clone().addScaledVector(W.clone().sub(L), 0.5), 0.024, false); test(L.clone(), 0.026, false); b.parent.parent.getWorldPosition(L); test(L.clone(), 0.028, false); }
          if (need <= 0.002) break;
          moved = true;
          if (!T) { T = this.palm(S, new THREE.Vector3()); }
          T.y += need + 0.004; if (back) T.addScaledVector(fwd, -0.035);
          const pole = RPole.copy(left).multiplyScalar(sg * 0.8).addScaledVector(fwd, -0.15).add(RDown).clone();
          this.ik(r, S, T, pole, 1);   // (the arm only: the wrist keeps the turn it had, so a hand talking palm-in is not rolled over)
        }
      }
      return moved;
    },
    // opts: { question, to: 'you' | 'mom' | 'dad', mood: 'warm' | 'joke' | 'uneasy' | 'scared' } shape the gestures and the face
    talk(env, opts = {}) {
      this.talkOpts = opts; if (this.rig) { this.rig.talk(env); this.rig.mood = opts.mood || this.mood || null; this.rig.question = !!opts.question; }
      if (env && model === 'mom' && !this.uncanny && (opts.to || 'you') === 'you') this.eyeHold = { at: opts.eyesOn || null, t: env.length / 30 + UNCANNY.eyesHold };   // (eyes on you through the line and six seconds after it)
    },
  };
  // night clothes: the body material's map is swapped for the pajama repaint (made once, the first time it is asked for)
  person.night = false; person.nightOf = null;
  person.setNight = (on) => {
    person.night = on; const b = person.body; if (!b || !b.map) return;
    if (on && !person.nightMap) person.nightMap = pajamas(b.map, model);
    b.map = on ? person.nightMap : person.dayMap; b.needsUpdate = true;
  };
  if (model) {
    Promise.all([loadModel(model), loadAnims(), loadBody().catch((e) => { console.warn('no body language clips:', e); return []; })]).then(([gltf, clips, body]) => {
      // the standing clip's legs: the idle clip's stance, held (its legs move under a degree), so the parents stand as they always have
      const idle = clips.find((c) => c.name === 'idle'), stand = body.find((c) => c.name === 'stand');
      if (idle && stand) for (const t of idle.tracks) if (/(Thigh|Calf|Foot|Toe0)\.quaternion$/.test(t.name)) stand.tracks.push(new THREE.QuaternionKeyframeTrack(t.name, [0, stand.duration], [...t.values.slice(0, 4), ...t.values.slice(0, 4)]));
      const rig = new Rig(gltf, [...clips, ...body]).setHeight(height);
      if (rig.actions.stand) rig.alias = { idle: 'stand' };   // the parents stand with the body-language clips' own idle
      rig.hideMaterials(/NONE/);
      g.add(rig.root); lp.group.visible = false;
      rig.play('idle', { fade: 0, offset: Math.random() });
      rig.jawSign = person.jawSign || 1;
      person.rig = rig;
      // skin and cloth: a physical material with a soft sheen (light grazing skin and flannel reads as a body, not plastic), the body atlas
      // rougher than the face; the eyelash and hair cards resolve with alpha-to-coverage instead of a hard cut
      rig.root.traverse((o) => {
        if (!o.isSkinnedMesh) return;
        o.material = [].concat(o.material).map((m) => {
          if (/_opacity$/.test(m.name)) { m.alphaToCoverage = true; m.alphaTest = 0.35; m.transparent = false; m.depthWrite = true; m.side = THREE.DoubleSide; m.needsUpdate = true; return m; }
          if (!/_(body|head)$/.test(m.name) || !m.isMeshStandardMaterial) return m;
          const face = /_head$/.test(m.name);
          const pm = new THREE.MeshPhysicalMaterial({ name: m.name, map: m.map, normalMap: m.normalMap || null, color: m.color, roughness: face ? 0.52 : 0.78, metalness: 0,
            sheen: face ? 0.35 : 0.5, sheenRoughness: face ? 0.55 : 0.8, sheenColor: new THREE.Color(face ? 0xffd9c4 : 0xd8d0c8), specularIntensity: face ? 0.55 : 0.3, envMapIntensity: 0.7 });
          if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
          return pm;
        });
        if (o.material.length === 1) o.material = o.material[0];
      });
      rig.root.traverse((o) => { if (o.isSkinnedMesh) for (const m of [].concat(o.material)) if (/_body$/.test(m.name) && m.map) { person.body = m; person.dayMap = m.map; } });
      if (person.night) person.setNight(true);
    }).catch((e) => console.warn('person model failed, keeping the low-poly one:', e));
  }
  return person;
}

// the body texture repainted as pajamas in a canvas. skin is found by its colour and left alone; each garment is told apart by its own
// colour and gets a new one scaled by the old luminance, so the folds and seams survive. black is unused atlas space.
const WEAR = {
  dad: {
    skin: [0, 0.22, 0, 0.2, 0.78, 1, 0, 0.2], hue: 28,   // the uv rectangles that hold skin (his hands), and the warmest hue that still counts as skin there
    boots: [0.22, 0.40, 0.0, 0.30, 0.60, 0.78, 0.0, 0.30],   // two rectangles: the boots and their soles (the collar between them is not a boot)
    pants: [0, 0.3, 0.58, 1, 0.7, 1, 0.58, 1],   // the trouser legs
    classes: [
      { is: (h, s, v, inBoots) => inBoots, col: (u, w, k) => {                                                                            // grey socks: the laces, eyelets and sole edge flattened out, a fine rib instead
        const f = 0.8 + 0.2 * k, rib = (w * 160) % 1 < 0.5 ? 1 : 0.9; return [0.44 * f * rib, 0.44 * f * rib, 0.47 * f * rib]; } },
      { is: (h, s, v, inBoots, inPants) => inPants, col: (u, w, k) => {                                                                   // flannel plaid
        const a = (u * 14) % 1 < 0.32, b = (w * 14) % 1 < 0.32, base = a && b ? [0.3, 0.42, 0.34] : a || b ? [0.22, 0.34, 0.3] : [0.15, 0.19, 0.3];
        return base.map((c) => c * k); } },
      { is: () => true, col: (u, w, k) => [0.52 * k, 0.52 * k, 0.55 * k] },                                                               // the sweater and vest: a worn grey t-shirt
    ],
  },
  mom: {
    skin: [0, 0.22, 0.45, 0.73, 0.78, 1, 0.45, 0.73, 0, 0.17, 0.72, 1, 0.83, 1, 0.72, 1, 0.44, 0.56, 0.45, 0.57], hue: 32,   // forearms, hands, the patch of neck
    boots: [0.17, 0.33, 0.72, 1.0, 0.67, 0.83, 0.72, 1.0],   // two rectangles: the shoes
    pants: [0, 0.3, 0, 0.42, 0.7, 1, 0, 0.42],   // the jeans
    classes: [
      { is: (h, s, v, inBoots) => inBoots, col: (u, w, k) => [0.82 * (0.55 + 0.45 * k), 0.62 * (0.55 + 0.45 * k), 0.5 * (0.55 + 0.45 * k)] },   // bare feet
      { is: (h, s, v, inBoots, inPants) => inPants, col: (u, w, k) => { const st = (w * 60) % 1 < 0.5; return [(st ? 0.74 : 0.66) * k, (st ? 0.78 : 0.7) * k, (st ? 0.86 : 0.8) * k]; } },   // the jeans: striped cotton bottoms
      { is: () => true, col: (u, w, k) => {                                                                                                // the blouse: cream with small rose sprigs
        const fx = (u * 22) % 1 - 0.5, fy = (w * 22) % 1 - 0.5, d = Math.hypot(fx, fy), dot = d < 0.11 ? 1 : d < 0.15 ? 0.5 : 0;
        return [(0.93 - 0.18 * dot) * k, (0.88 - 0.4 * dot) * k, (0.8 - 0.3 * dot) * k]; } },
    ],
  },
};
function pajamas(tex, model) {
  const spec = WEAR[model] || WEAR.dad, img = tex.image, W = img.width, H = img.height;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0);
  const id = ctx.getImageData(0, 0, W, H), d = id.data, n = W * H;
  const cls = new Int8Array(n), alt = new Int8Array(n), lum = new Float32Array(n), sk = new Uint8Array(n);   // cls: -1 unused, 0 skin, 1.. the garments; alt: the garment it would be if not skin
  const quads = (a) => { const r = []; for (let i = 0; i + 3 < a.length; i += 4) r.push(a.slice(i, i + 4)); return r; };
  const rects = quads(spec.boots), skinRects = quads(spec.skin), pantRects = quads(spec.pants || []), inside = (rs, u, w) => rs.some((q) => u >= q[0] && u < q[1] && w >= q[2] && w < q[3]);
  for (let i = 0; i < n; i++) {
    const r = d[i * 4] / 255, g = d[i * 4 + 1] / 255, b = d[i * 4 + 2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), v = mx, s = mx ? (mx - mn) / mx : 0;
    lum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    if (v < 0.06) { cls[i] = -1; continue; }
    let h = 0; if (mx > mn) { h = mx === r ? (g - b) / (mx - mn) : mx === g ? 2 + (b - r) / (mx - mn) : 4 + (r - g) / (mx - mn); h = (h * 60 + 360) % 360; }
    const u = (i % W) / W, w = Math.floor(i / W) / H, inBoots = inside(rects, u, w);
    sk[i] = !inBoots && inside(skinRects, u, w) && h >= 3 && h <= spec.hue && s > 0.2 && s < 0.7 && v > 0.4 ? 1 : 0;
    alt[i] = 1 + spec.classes.findIndex((k) => k.is(h, s, v, inBoots, inside(pantRects, u, w)));
  }
  // the skin mask cleaned up: a pixel goes with the majority of the 7x7 around it, so stray fold pixels do not swap sides
  const tmp = new Uint16Array(n), R = 3;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let a = 0; for (let k = -R; k <= R; k++) { const xx = Math.min(W - 1, Math.max(0, x + k)); a += sk[y * W + xx]; } tmp[y * W + x] = a; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let a = 0; for (let k = -R; k <= R; k++) { const yy = Math.min(H - 1, Math.max(0, y + k)); a += tmp[yy * W + x]; }
    const i = y * W + x; if (cls[i] < 0) continue;
    cls[i] = a > (2 * R + 1) * (2 * R + 1) / 2 ? 0 : alt[i];
  }
  // the garment's own brightness is taken out with a wide local average of the luminance (unused atlas space left out), so a dark
  // sweater and a light vest both come out as the same t-shirt and only the folds remain
  const mean = (() => {
    const B = 40, acc = new Float32Array(n), wgt = new Float32Array(n), acc2 = new Float32Array(n), wgt2 = new Float32Array(n);
    for (let y = 0; y < H; y++) {
      let a = 0, c = 0;
      for (let x = -B; x < W + B; x++) {
        const xi = x + B, xo = x - B - 1;
        if (xi < W && cls[y * W + xi] >= 0) { a += lum[y * W + xi]; c++; }
        if (xo >= 0 && cls[y * W + xo] >= 0) { a -= lum[y * W + xo]; c--; }
        if (x >= 0 && x < W) { acc[y * W + x] = a; wgt[y * W + x] = c; }
      }
    }
    for (let x = 0; x < W; x++) {
      let a = 0, c = 0;
      for (let y = -B; y < H + B; y++) {
        const yi = y + B, yo = y - B - 1;
        if (yi < H) { a += acc[yi * W + x]; c += wgt[yi * W + x]; }
        if (yo >= 0) { a -= acc[yo * W + x]; c -= wgt[yo * W + x]; }
        if (y >= 0 && y < H) { acc2[y * W + x] = a; wgt2[y * W + x] = c; }
      }
    }
    for (let i = 0; i < n; i++) acc2[i] = wgt2[i] ? acc2[i] / wgt2[i] : 0.5;
    return acc2;
  })();
  let skinPx = 0, used = 0;
  for (let i = 0; i < n; i++) {
    const k = cls[i]; if (k < 0) continue; used++;
    if (k === 0) { skinPx++; continue; }
    const f = Math.min(1.45, Math.max(0.35, lum[i] / Math.max(0.05, mean[i])));
    const [r, g, b] = spec.classes[k - 1].col((i % W) / W, Math.floor(i / W) / H, f);
    d[i * 4] = Math.min(255, r * 255); d[i * 4 + 1] = Math.min(255, g * 255); d[i * 4 + 2] = Math.min(255, b * 255);
  }
  ctx.putImageData(id, 0, 0);
  console.info(`${model}: night clothes drawn, skin ${(100 * skinPx / Math.max(1, used)).toFixed(1)}% of the atlas`);
  const t = new THREE.CanvasTexture(c);
  t.flipY = tex.flipY; t.colorSpace = tex.colorSpace; t.wrapS = tex.wrapS; t.wrapT = tex.wrapT; t.anisotropy = tex.anisotropy; t.channel = tex.channel;
  t.minFilter = tex.minFilter; t.magFilter = tex.magFilter;
  return t;
}
