// The family: real Rocketbox models (assets/models), with the old low-poly people as a fallback until they load.
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

const RA = new THREE.Vector3(), RB = new THREE.Vector3(), RS = new THREE.Vector3(), RE = new THREE.Vector3(), RH = new THREE.Vector3(), RD = new THREE.Vector3(), RP = new THREE.Vector3(), RT = new THREE.Vector3(), RL = new THREE.Vector3(), RF = new THREE.Vector3(), RC = new THREE.Vector3(), RPole = new THREE.Vector3(), RDown = new THREE.Vector3(0, -1, 0);
// model: 'dad' | 'mom' (assets/models/<model>.glb). The rest are the low-poly look.
export function makePerson({ model, height = 1.75, ...look } = {}) {
  const lp = makeLowPoly({ height, ...look });
  const g = new THREE.Group(); g.add(lp.group); g.userData.h = height;
  const head = new THREE.Object3D(); head.position.y = 1.64 * height / 1.75; g.add(head);   // the interaction target, always there
  const person = {
    group: g, head, arms: lp.arms, rig: null, lookAt: null,
    pose: null,   // what the body is doing on top of the clip: { lean: 0..1 (bend at the waist), hold: a box mesh (both hands on its sides), reach: Vector3 (both hands to a world point) }
    update(t, dt = 0.016) {
      if (!this.rig) { lp.update(t); return; }
      const r = this.rig;
      r.update(dt);
      if (this.pose) this.applyPose(r, this.pose);
      r.lookAt(this.lookAt, dt);
      r.updateJaw(dt);
    },
    // Two-bone arm IK: the hand lands on the target and the elbow bends toward the pole, so hands rest ON things instead of passing through them.
    ik(r, side, T, pole) {
      const up = r.bones[side + '_UpperArm'], fo = r.bones[side + '_Forearm'], hand = r.bones[side + '_Hand'];
      for (const b of [up, fo, hand]) b.updateWorldMatrix(true, false);
      up.getWorldPosition(RS); fo.getWorldPosition(RE); hand.getWorldPosition(RH);
      const l1 = RS.distanceTo(RE), l2 = RE.distanceTo(RH);
      RD.copy(T).sub(RS); const d = Math.min(Math.max(RD.length(), 0.05), (l1 + l2) * 0.995); RD.normalize();
      const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
      RP.copy(pole).addScaledVector(RD, -pole.dot(RD)).normalize();
      RT.copy(RS).addScaledVector(RD, a).addScaledVector(RP, h);              // the elbow
      r.aim(up, fo, RB.copy(RT).sub(RS).normalize(), 1);
      fo.updateWorldMatrix(true, false); fo.getWorldPosition(RE);
      RT.copy(RS).addScaledVector(RD, d);                                      // the reachable hand position
      r.aim(fo, hand, RB.copy(RT).sub(RE).normalize(), 1);
    },
    applyPose(r, p) {
      if (p.lean) r.bend(['Spine', 'Spine1', 'Spine2'], [0.3, 0.4, 0.3], [1, 0, 0], p.lean);
      const y = this.group.rotation.y, left = RL.set(Math.cos(y), 0, -Math.sin(y)), fwd = RF.set(Math.sin(y), 0, Math.cos(y));
      for (const [s, sg] of [['L', 1], ['R', -1]]) {
        let T = null;
        if (p.hold) {   // both hands flat on the sides of the box
          p.hold.updateWorldMatrix(true, false); p.hold.getWorldPosition(RC);
          const hw = p.hold.geometry.parameters.width / 2 * p.hold.getWorldScale(RS).x;
          T = RC.clone().addScaledVector(left, sg * (hw + 0.035)); T.y -= 0.03; T.addScaledVector(fwd, -0.04);
        } else if (p.reach) T = p.reach.clone().addScaledVector(left, sg * 0.08);
        if (!T) continue;
        this.ik(r, s, T, RPole.copy(left).multiplyScalar(sg * 0.7).addScaledVector(fwd, -0.3).add(RDown));
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
