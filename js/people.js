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

// model: 'dad' | 'mom' (assets/models/<model>.glb). The rest are the low-poly look.
export function makePerson({ model, height = 1.75, ...look } = {}) {
  const lp = makeLowPoly({ height, ...look });
  const g = new THREE.Group(); g.add(lp.group);
  const head = new THREE.Object3D(); head.position.y = 1.64 * height / 1.75; g.add(head);   // the interaction target, always there
  const person = {
    group: g, head, arms: lp.arms, rig: null, lookAt: null,
    update(t, dt = 0.016) {
      if (!this.rig) { lp.update(t); return; }
      const r = this.rig;
      r.update(dt);
      r.lookAt(this.lookAt, dt);
      r.updateJaw(dt);
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
