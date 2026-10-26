// The tall one. Black, long-limbed, huge white eyes with big black pupils, and that smile.
import * as THREE from 'three';
import { smile as smileTex } from './textures.js';
import { Rig, loadModel, loadAnims } from './rig.js';

const _v = new THREE.Vector3();
const ARM_STRETCH = 1.4;
const FACE_POS = [11, 4, 0];   // skull centre in head-bone space (cm): up, forward, left

export class Entity {
  constructor(scene) {
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    scene.add(this.root);

    const black = new THREE.MeshLambertMaterial({ color: 0x060607 });
    const glow = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: false });
    glow.color.setRGB(2.4, 2.4, 2.4);   // brighter than white, so the bloom pass makes the eyes glow
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x000000, fog: false });
    const cyl = (rt, rb, h, seg = 10) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), black); m.castShadow = true; return m; };

    // legs
    this.legs = [-1, 1].map((s) => {
      const hip = new THREE.Group(); hip.position.set(s * 0.09, 1.05, 0);
      const leg = cyl(0.05, 0.03, 1.05); leg.position.y = -0.525; hip.add(leg);
      this.body.add(hip); return hip;
    });
    // torso (slight hunch)
    this.torso = new THREE.Group(); this.torso.position.y = 1.05; this.body.add(this.torso);
    const chest = cyl(0.17, 0.1, 0.92, 14); chest.scale.z = 0.6; chest.position.y = 0.46; this.torso.add(chest);
    this.torso.rotation.x = 0.1;
    // arms
    this.arms = [-1, 1].map((s) => {
      const sh = new THREE.Group(); sh.position.set(s * 0.25, 0.84, 0);
      const arm = cyl(0.036, 0.024, 1.18); arm.position.y = -0.59; sh.add(arm);
      const hand = new THREE.Group(); hand.position.y = -1.18; sh.add(hand);
      for (let i = 0; i < 4; i++) {
        const f = cyl(0.011, 0.004, 0.26, 5); f.position.y = -0.12;
        const fg = new THREE.Group(); fg.rotation.z = (i - 1.5) * 0.12; fg.rotation.x = (i - 1.5) * 0.05; fg.add(f); hand.add(fg);
      }
      sh.rotation.z = s * 0.1;
      this.torso.add(sh); return sh;
    });
    // neck + head
    const neck = cyl(0.04, 0.05, 0.24); neck.position.y = 1.0; this.torso.add(neck);
    this.head = new THREE.Group(); this.head.position.y = 1.2; this.head.rotation.order = 'YXZ'; this.torso.add(this.head);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 18), black); skull.scale.set(0.95, 1.2, 0.9); skull.castShadow = true; this.head.add(skull);

    this.eyeBase = [new THREE.Vector3(-0.092, 0.075, 0.2), new THREE.Vector3(0.092, 0.075, 0.2)];
    this.pupils = [];
    for (let i = 0; i < 2; i++) {
      const s = i ? 1 : -1;
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.074, 24, 16), glow);
      eye.scale.set(0.95, 1.38, 0.42); eye.position.set(this.eyeBase[i].x, this.eyeBase[i].y, 0.172);
      eye.rotation.z = s * -0.32; if (i) { eye.scale.multiplyScalar(1.08); eye.position.y -= 0.012; } this.head.add(eye);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.05, 18, 12), pupilMat);
      pupil.scale.set(1, 1.12, 0.35); pupil.position.copy(this.eyeBase[i]); this.head.add(pupil);
      this.pupils.push(pupil);
    }
    const sm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.218, 0.218, 0.16, 48, 1, true, -1.32, 2.64),
      new THREE.MeshBasicMaterial({ map: smileTex(), transparent: true, alphaTest: 0.4, toneMapped: false, fog: false })
    );
    sm.scale.z = 0.93; sm.position.y = -0.085; this.head.add(sm);
    this.smile = sm;

    // state
    this.t = 0; this.phase = 0; this.mode = 'idle'; this.speed = 0;
    this.lean = 0; this.reach = 0; this.tilt = 0; this.smileScale = 1;
    this.lookTarget = null;
    this.root.visible = false;

    // the real body: a black Rocketbox man stretched tall, animated with baked Mixamo clips (the cylinder body stays as the fallback)
    this.rig = null;
    Promise.all([loadModel('spirit'), loadAnims()]).then(([gltf, clips]) => this.useRig(new Rig(gltf, clips)))
      .catch((e) => console.warn('spirit model failed, keeping the simple body:', e));
  }

  useRig(rig) {
    const K = 1.43;                                   // a 1.82 m man -> about 2.6 m
    rig.setHeight(1.82 * K); rig.hideMaterials(/opacity/);
    const black = new THREE.MeshLambertMaterial({ color: 0x060607 });
    rig.root.traverse((o) => { if (o.isSkinnedMesh) o.material = Array.isArray(o.material) ? o.material.map((m) => (/opacity/.test(m.name) ? Object.assign(m, { visible: false }) : black)) : black; });
    // long arms: stretch each arm along its bone; the forearm keeps scale 1 so it inherits the same stretch
    for (const s of ['L', 'R']) rig.bones[s + '_UpperArm'].scale.x = ARM_STRETCH;
    this.root.add(rig.root);
    // the face (skull, glowing eyes, smile) rides on the head bone, upright in model space
    const hb = rig.bones.Head;
    this.torso.remove(this.head); hb.add(this.head);
    this.head.rotation.order = 'XYZ';
    this.head.position.set(...FACE_POS);
    this.head.quaternion.copy(rig.restQ.Head).invert();
    this.head.scale.setScalar(1 / rig.scale);
    this.body.visible = false;
    rig.play('idle', { fade: 0, speed: 0.3 });
    this.rig = rig;
  }

  get visible() { return this.root.visible; }
  set visible(v) { this.root.visible = v; }

  faceTowards(x, z, k = 1) {
    const p = this.root.position;
    let want = Math.atan2(x - p.x, z - p.z), cur = this.root.rotation.y;
    let d = want - cur; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    this.root.rotation.y = cur + d * Math.min(1, k);
  }

  updateRig(dt) {
    const r = this.rig, t = this.t, run = this.mode === 'run', walk = this.mode === 'walk';
    if (run) r.play('run', { fade: 0.2, speed: 1.1 });
    else if (walk) r.play('walk', { fade: 0.35, speed: 0.55 });
    else r.play('idle', { fade: 0.4, speed: 0.3 });
    r.update(dt);
    // posture on top of the clip: stooped when moving, plus the story's lean and head tilt
    r.bend(['Spine', 'Spine1', 'Spine2'], [0.2, 0.4, 0.4], [1, 0, 0], this.lean + (run ? 0.12 : walk ? 0.12 : 0));
    r.bend(['Neck', 'Head'], [0.4, 0.6], [0, 0, 1], this.tilt + Math.sin(t * 0.7) * 0.05);
    // arms out toward you
    if (this.reach > 0.01) {
      const dir = r.axisWorld(0, 0.1, 1).normalize();
      for (const s of ['L', 'R']) {
        r.aim(r.bones[s + '_UpperArm'], r.bones[s + '_Forearm'], dir, this.reach);
        r.aim(r.bones[s + '_Forearm'], r.bones[s + '_Hand'], dir, this.reach);
      }
    }
    r.lookAt(this.lookTarget, dt, { yaw: 1.2, pitch: 0.7, speed: 6 });
    this.smile.scale.set(this.smileScale, 1 + (this.smileScale - 1) * 1.6, 0.93);
    if (this.lookTarget) {
      this.head.updateMatrixWorld(true);
      _v.copy(this.lookTarget); this.head.worldToLocal(_v); _v.normalize();
      for (let i = 0; i < 2; i++) {
        const b = this.eyeBase[i];
        this.pupils[i].position.set(b.x + THREE.MathUtils.clamp(_v.x, -1, 1) * 0.022, b.y + THREE.MathUtils.clamp(_v.y, -1, 1) * 0.04, b.z + 0.012);
      }
    }
  }

  update(dt) {
    if (!this.root.visible) return;
    this.t += dt; const t = this.t;
    if (this.rig) { this.updateRig(dt); return; }
    const [hl, hr] = this.legs, [al, ar] = this.arms;
    let armSwing = 0, bob = 0, runLean = 0;
    if (this.mode === 'run' || this.mode === 'walk') {
      const amp = this.mode === 'run' ? 0.75 : 0.35;
      this.phase += dt * (this.mode === 'run' ? 2.6 : 2.0) * Math.max(1, this.speed);
      const s = Math.sin(this.phase);
      hl.rotation.x = s * amp; hr.rotation.x = -s * amp;
      armSwing = s * (this.mode === 'run' ? 0.9 : 0.25);
      bob = Math.abs(Math.cos(this.phase)) * (this.mode === 'run' ? 0.07 : 0.03);
      runLean = this.mode === 'run' ? 0.22 : 0.05;
    } else {
      hl.rotation.x *= 0.9; hr.rotation.x *= 0.9;
      armSwing = Math.sin(t * 0.9) * 0.05;
      bob = Math.sin(t * 1.3) * 0.008;
    }
    const reachX = -1.5 * this.reach;
    al.rotation.x = THREE.MathUtils.lerp(-armSwing - (this.mode === 'run' ? 0.35 : 0), reachX, this.reach);
    ar.rotation.x = THREE.MathUtils.lerp(armSwing - (this.mode === 'run' ? 0.35 : 0), reachX, this.reach);
    al.rotation.z = THREE.MathUtils.lerp(-0.1, 0.05, this.reach);
    ar.rotation.z = THREE.MathUtils.lerp(0.1, -0.05, this.reach);
    this.body.position.y = bob;
    this.body.rotation.x = this.lean + runLean;

    // head tracks target
    if (this.lookTarget) {
      this.root.updateMatrixWorld(true);
      _v.copy(this.lookTarget); this.torso.worldToLocal(_v); _v.sub(this.head.position);
      const yaw = THREE.MathUtils.clamp(Math.atan2(_v.x, _v.z), -1.0, 1.0);
      const pitch = THREE.MathUtils.clamp(-Math.atan2(_v.y, Math.hypot(_v.x, _v.z)), -0.9, 0.9);
      this.head.rotation.y += (yaw - this.head.rotation.y) * Math.min(1, dt * 6);
      this.head.rotation.x += (pitch - this.head.rotation.x) * Math.min(1, dt * 6);
    }
    this.head.rotation.z = this.tilt + Math.sin(t * 0.7) * 0.05;
    this.smile.scale.set(this.smileScale, 1 + (this.smileScale - 1) * 1.6, 0.93);

    // pupils
    if (this.lookTarget) {
      this.head.updateMatrixWorld(true);
      _v.copy(this.lookTarget); this.head.worldToLocal(_v); _v.normalize();
      for (let i = 0; i < 2; i++) {
        const b = this.eyeBase[i];
        this.pupils[i].position.set(b.x + THREE.MathUtils.clamp(_v.x, -1, 1) * 0.022, b.y + THREE.MathUtils.clamp(_v.y, -1, 1) * 0.04, b.z + 0.012);
      }
    }
  }

  headWorld(out = new THREE.Vector3()) { this.root.updateMatrixWorld(true); return this.head.getWorldPosition(out); }
}
