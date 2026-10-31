// The family: Rocketbox models (assets/models), with low-poly stand-ins until they load.
import * as THREE from 'three';
import { Rig, loadModel, loadAnims } from './rig.js';

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
const HINGE = { L: new THREE.Vector3(0, -0.135, -0.991), R: new THREE.Vector3(0, 0.135, -0.991) };   // the elbow axis in upper-arm space when the clip's own bend is too small to read it
const legNames = (s) => [s + '_Thigh', s + '_Calf', s + '_Foot'];
// model: 'dad' | 'mom' (assets/models/<model>.glb). The rest are the low-poly look.
export function makePerson({ model, height = 1.75, ...look } = {}) {
  const lp = makeLowPoly({ height, ...look });
  const g = new THREE.Group(); g.add(lp.group); g.userData.h = height;
  const head = new THREE.Object3D(); head.position.y = 1.64 * height / 1.75; g.add(head);   // the interaction target, always there
  const person = {
    group: g, head, arms: lp.arms, rig: null, lookAt: null,
    // what the body is doing on top of the clip:
    //   lean 0..1.4 (bend at the waist), squat 0..1 (both knees), kneel 0..1 (right knee on the floor)
    //   hold: an object both hands press on the sides of (holdW: its width when it has no box geometry, holdY: hand height above its origin)
    //   reach / reachLocal: a world or body-space point for the palm; hand: 'L' | 'R' | 'both'; palm: 'in' | 'down' | 'up'; grip: how far the fingers close
    //   L / R: { reach | reachLocal, palm, grip } for one hand on its own (the other follows hold / reach, or the clip)
    pose: null,
    ikW: 0, leanNow: 0, squatNow: 0, kneelNow: 0, snap: new Map(),   // the hands and the body ease in and out of a pose instead of snapping: letting go blends the last solved arm rotations back to the clip
    update(t, dt = 0.016) {
      if (!this.rig) { lp.update(t); return; }
      const r = this.rig;
      r.update(dt);
      const p = this.pose;
      if (p && p.sleep) this.applyPose(r, p, 1, 0);
      else {
        const k = Math.min(1, dt * 7), want = p && (p.hold || p.reach || p.reachLocal || p.L || p.R) ? 1 : 0;
        this.leanNow += ((p && p.lean || 0) - this.leanNow) * k; this.squatNow += ((p && p.squat || 0) - this.squatNow) * k; this.kneelNow += ((p && p.kneel || 0) - this.kneelNow) * k;
        if (want) {
          // solve the arms fully, then move only part of the way from last frame's solution: the hands settle onto a thing in a few frames and never flail
          const prevW = this.ikW; this.ikW = 1; this.applyPose(r, p, 1, this.leanNow, this.squatNow, this.kneelNow); this.smoothSnap(r, Math.min(1, dt * 12), prevW);
        } else {
          this.ikW += (0 - this.ikW) * k;
          if (Math.abs(this.leanNow) + this.squatNow + this.kneelNow > 1e-3 || r.root.position.y !== (r.rootY0 || 0)) this.applyPose(r, {}, 0, this.leanNow, this.squatNow, this.kneelNow);
          if (this.ikW > 0.005) this.blendSnap(r, this.ikW); else this.snap.clear();
        }
      }
      r.lookAt(this.lookAt, dt);
      r.updateJaw(dt);
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
    grab(obj, side = 'R', { down = 0.1, out = 0 } = {}) {
      const r = this.rig; if (!r) { this.group.attach(obj); return; }
      this.palm(side, GE, GF);
      GE.addScaledVector(GF, out); GE.y -= down;
      obj.position.copy(GE); obj.rotation.set(0, this.group.rotation.y, 0); obj.updateMatrixWorld(true);
      r.bones[side + '_Hand'].attach(obj);
    },
    // letting go: remember what the arm bones were doing with the thing, and ease from that back to the clip (no solver against a target that is walking away)
    // the bones keep their Bip01_ prefix; only the rig's lookup keys drop it
    // after a solve: each arm bone goes a fraction of the way from last frame's solved rotation to this frame's, and that becomes the new memory
    smoothSnap(r, a, prevW = 1) {
      for (const [b, clipQ] of r.saved) {
        if (!/^(Bip01_?)?[LR]_(UpperArm|Forearm|Hand|Finger)/.test(b.name)) continue;
        let s = this.snap.get(b);
        if (!s) { s = clipQ.clone(); this.snap.set(b, s); }                       // the first frame of a reach starts from the clip's pose
        else if (prevW < 0.999) s.copy(_qt.copy(clipQ).slerp(s, prevW));       // ...or, mid-way through letting go, from the pose that is actually on screen
        s.slerp(b.quaternion, a); b.quaternion.copy(s); b.updateMatrix();
      }
      r.root.updateMatrixWorld(true);
    },
    blendSnap(r, w) {
      for (const [b, q] of this.snap) { if (!r.saved.has(b)) r.saved.set(b, b.quaternion.clone()); b.quaternion.slerp(q, w); b.updateMatrix(); }
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
        r.thighLen = t.distanceTo(c); r.calfLen = c.distanceTo(f); r.legLen = r.thighLen + r.calfLen; r.rootY0 = r.root.position.y; r.hinge = {};
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
    // Wrist roll and finger curl: turn the hand about the forearm so the palm faces `c` (the way the fingers should close), then curl every finger toward it.
    grip(r, side, c, amount, w = 1) {
      const B = r.bones, hand = B[side + '_Hand'], fo = B[side + '_Forearm'], i1 = B[side + '_Finger1'], i2 = B[side + '_Finger2'], i4 = B[side + '_Finger4'];
      if (!hand || !fo || !i1 || !i2 || !i4) return;
      for (const b of [fo, hand, i1, i2, i4]) b.updateWorldMatrix(true, false);
      fo.getWorldPosition(RE); hand.getWorldPosition(RH);
      const fa = GA.copy(RH).sub(RE).normalize();
      const cp = GB.copy(c).addScaledVector(fa, -c.dot(fa)).normalize();
      i1.getWorldPosition(RS); i4.getWorldPosition(RT); const lat = GC.copy(RT).sub(RS).normalize();
      const latT = GD.crossVectors(fa, cp); if (latT.dot(lat) < 0) latT.negate();
      const lp = GE.copy(lat).addScaledVector(fa, -lat.dot(fa)).normalize(), tp = latT.addScaledVector(fa, -latT.dot(fa)).normalize();
      const roll = Math.atan2(GF.crossVectors(lp, tp).dot(fa), lp.dot(tp));
      if (Math.abs(c.dot(fa)) < 0.95) r.rotateWorld(hand, new THREE.Quaternion().setFromAxisAngle(fa, roll * w));   // no roll to speak of when the palm should face along the forearm
      for (const b of [hand, i1, i2, i4]) b.updateWorldMatrix(true, false);
      i1.getWorldPosition(RS); i4.getWorldPosition(RT); i2.getWorldPosition(RA); hand.getWorldPosition(RH);
      const d = GA.copy(RA).sub(RH).normalize(), ax = GC.copy(RT).sub(RS).normalize();
      if (GF.crossVectors(ax, d).dot(cp) < 0) ax.negate();
      const total = amount * 1.7;
      for (const [chain, k] of [[['Finger1', 'Finger11', 'Finger12'], 1], [['Finger2', 'Finger21', 'Finger22'], 1], [['Finger3', 'Finger31', 'Finger32'], 1], [['Finger4', 'Finger41', 'Finger42'], 1], [['Finger0', 'Finger01', 'Finger02'], 0.45]]) {
        chain.forEach((n, i) => { const b = B[side + '_' + n]; if (b) r.rotateWorld(b, new THREE.Quaternion().setFromAxisAngle(ax, total * k * [0.35, 0.4, 0.25][i])); });
      }
    },
    applyPose(r, p, w = 1, lean = p.lean || 0, squat = p.squat || 0, kneel = p.kneel || 0) {
      if (p.sleep) {   // asleep on the back: the head turned toward the room, the feet flat, a slow breath in the chest
        r.bend(['Neck', 'Head'], [0.4, 0.6], [0, 1, 0], 0.55 * p.sleep);
        r.bend(['L_Foot', 'R_Foot'], [1, 1], [1, 0, 0], p.feet ?? 1.25);   // toes pointed along the bed, so they stay under the quilt
        r.bend(['Spine1', 'Spine2'], [0.5, 0.5], [1, 0, 0], 0.03 + Math.sin(performance.now() * 0.0011) * 0.025);
        return;
      }
      this.legs(r, squat, kneel);
      if (lean) r.bend(['Spine', 'Spine1', 'Spine2'], [0.3, 0.4, 0.3], [1, 0, 0], lean);
      // world facing: the people can sit in a car that is turned
      this.group.getWorldQuaternion(RQ); RF.set(0, 0, 1).applyQuaternion(RQ); const y = Math.atan2(RF.x, RF.z), left = RL.set(Math.cos(y), 0, -Math.sin(y)), fwd = RF.set(Math.sin(y), 0, Math.cos(y));
      const hands = p.hand || 'both';
      const facing = (q, def) => q === 'down' ? RG.set(0, -1, 0) : q === 'up' ? RG.set(0, 1, 0) : q === 'fwd' ? RG.copy(fwd) : def;
      for (const [s, sg] of [['L', 1], ['R', -1]]) {
        const own = p[s];
        if (!own && hands !== 'both' && hands !== s) continue;
        let T = null, palm = null, close = 0.75;
        if (own) {
          T = own.reach ? own.reach.clone() : own.reachLocal ? this.group.localToWorld(own.reachLocal.clone()) : null;
          palm = facing(own.palm, RG.copy(left).multiplyScalar(-sg)); close = own.grip ?? 0.75;
        } else if (p.hold) {   // both hands flat on the sides of what is carried
          p.hold.updateWorldMatrix(true, false); p.hold.getWorldPosition(RC);
          const hw = p.holdW !== undefined ? p.holdW / 2 : p.hold.geometry.parameters.width / 2 * p.hold.getWorldScale(RS).x;
          T = RC.clone().addScaledVector(left, sg * (hw + 0.03)); T.y += p.holdY ?? -0.03; T.addScaledVector(fwd, -0.04);
          palm = RG.copy(left).multiplyScalar(-sg); close = 0.3;
        } else if (p.reach || p.reachLocal) {
          T = p.reach ? p.reach.clone() : this.group.localToWorld(p.reachLocal.clone());
          if (hands === 'both') T.addScaledVector(left, sg * 0.08);
          palm = facing(p.palm, RG.copy(left).multiplyScalar(-sg)); close = p.grip ?? 0.75;
        }
        if (!T || w <= 0.005) continue;
        this.ik(r, s, T, RPole.copy(left).multiplyScalar(sg * 0.7).addScaledVector(fwd, -0.3).add(RDown), w);
        this.grip(r, s, palm, close * w, w);
      }
    },
    talk(env) { if (this.rig) this.rig.talk(env); },
  };
  if (model) {
    Promise.all([loadModel(model), loadAnims()]).then(([gltf, clips]) => {
      const rig = new Rig(gltf, clips).setHeight(height);
      rig.hideMaterials(/NONE/);
      g.add(rig.root); lp.group.visible = false;
      rig.play('idle', { fade: 0, offset: Math.random() });
      rig.jawSign = person.jawSign || 1;
      person.rig = rig;
    }).catch((e) => console.warn('person model failed, keeping the low-poly one:', e));
  }
  return person;
}
