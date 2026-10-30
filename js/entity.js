// The thing: a stretched black body with the face from creature.js on its head bone (one skull running down into the neck, white
// ring eyes with black pupils that follow the player, the grin cut into the head).
import * as THREE from 'three';
import { createFace, headGeometry, skinMaterial, tuckIntoNeck } from './creature.js';
import { Rig, loadModel, loadAnims } from './rig.js';

const _v = new THREE.Vector3();
const ARM_STRETCH = 1.4;
const FACE_POS = [11, 4, 0];   // skull centre in head-bone space (cm): up, forward, left
// the graphics preset lives in gfx, which main.js does not hand to the thing; it is looked up as the thing is drawn
const preset = () => (typeof window !== 'undefined' && window.__game && window.__game.gfx && window.__game.gfx.quality) === 'low' ? 'low' : 'high';
const ss = THREE.MathUtils.smoothstep;
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

// Skin weights for the skull-and-neck mesh on the body's skeleton. The skull moves with the head bone alone. Down the neck the
// weights run from the body's own (copied from the nearest vertices of its shirt, so the neck's foot moves with the shoulders it
// sits in) through the neck bone to the head, so a turn of the head twists the neck instead of shearing it at a seam.
function skinWeights(geo, body, refVerts, bind, head, neck) {
  const P = body.geometry.attributes.position, SI = body.geometry.attributes.skinIndex, SW = body.geometry.attributes.skinWeight, bones = body.skeleton.bones;
  const under = (b) => { for (let o = bones[b].parent; o; o = o.parent) if (o === bones[head]) return true; return false; };
  const map = bones.map((_, b) => (under(b) ? head : b));
  const pos = geo.attributes.position, n = pos.count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  const v = new THREE.Vector3(), q = new THREE.Vector3(), CELL = 3, grid = new Map(), key = (x, y, z) => x + ',' + y + ',' + z;
  for (const i of refVerts) { q.fromBufferAttribute(P, i); const k = key(Math.floor(q.x / CELL), Math.floor(q.y / CELL), Math.floor(q.z / CELL)); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); }
  const near = (p) => {
    const cx = Math.floor(p.x / CELL), cy = Math.floor(p.y / CELL), cz = Math.floor(p.z / CELL), found = [];
    for (let r = 1; r <= 6 && found.length < 6; r++) {
      found.length = 0;
      for (let x = cx - r; x <= cx + r; x++) for (let y = cy - r; y <= cy + r; y++) for (let z = cz - r; z <= cz + r; z++) for (const i of grid.get(key(x, y, z)) || []) found.push([q.fromBufferAttribute(P, i).distanceToSquared(p), i]);
    }
    return found.sort((a, b) => a[0] - b[0]).slice(0, 6);
  };
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i);
    // t: 0 where the neck goes into the shoulders, 1 on the skull (and right under the jaw, which turns with it)
    const sk = (v.x / 0.209) ** 2 + (v.y / 0.264) ** 2 + (v.z / 0.198) ** 2;
    const t = Math.max(ss(v.y, -0.33, -0.17), ss(-sk, -1.32, -1.02));
    const w = new Map(), add = (b, x) => w.set(b, (w.get(b) || 0) + x);
    if (t < 1) {
      let tot = 0; const ref = new Map();
      for (const [d2, j] of near(v.clone().applyMatrix4(bind))) { const k = 1 / (Math.sqrt(d2) + 0.5) ** 2; tot += k; for (let c = 0; c < 4; c++) { const b = map[SI.getComponent(j, c)]; ref.set(b, (ref.get(b) || 0) + SW.getComponent(j, c) * k); } }
      for (const [b, x] of ref) add(b, (1 - t) * (1 - t) * x / tot);
      add(neck, 2 * t * (1 - t));
    }
    add(head, t * t);
    const top = [...w].sort((a, b) => b[1] - a[1]).slice(0, 4), sum = top.reduce((s, x) => s + x[1], 0);
    top.forEach(([b, x], c) => { si[i * 4 + c] = b; sw[i * 4 + c] = x / sum; });
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
}

export class Entity {
  constructor(scene) {
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    scene.add(this.root);

    this.quality = 'high';
    this.skins = { high: skinMaterial({}) };
    this.cyls = [];
    const cyl = (rt, rb, h, seg = 10) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), this.skins.high); m.castShadow = true; this.cyls.push(m); return m; };

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
    // neck + head: head is the face group (its origin the skull centre), smile its teeth; it gets its skull when first drawn
    // without the rigged body, so a normal start never builds one it throws away
    const neck = cyl(0.04, 0.05, 0.24); neck.position.y = 1.0; this.torso.add(neck);
    this.face = this.head = createFace({ skull: false });
    this.head.position.y = 1.2; this.head.rotation.order = 'YXZ'; this.torso.add(this.head);
    this.smile = this.face.smile;

    // state
    this.t = 0; this.phase = 0; this.mode = 'idle'; this.speed = 0;
    this.lean = 0; this.reach = 0; this.tilt = 0; this.smileScale = 1;
    this.lookTarget = null;
    this.root.visible = false;

    // the rigged body: a black Rocketbox man stretched tall, animated with baked Mixamo clips (the cylinder body stays as the fallback)
    this.rig = null;
    Promise.all([loadModel('spirit'), loadAnims()]).then(([gltf, clips]) => this.useRig(new Rig(gltf, clips)))
      .catch((e) => console.warn('spirit model failed, keeping the simple body:', e));
  }

  useRig(rig) {
    const K = 1.43;                                   // a 1.82 m man -> about 2.6 m
    rig.setHeight(1.82 * K);
    // the man's own head and his hair cards go (hidden as meshes: blacking out every material used to bring the cards back as
    // dark blobs inside the skull), the rest of him takes the skin
    let body = null; const refVerts = new Set();
    rig.root.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      const name = [].concat(o.material)[0].name;
      if (/head|opacity/.test(name)) { o.visible = false; return; }
      body ||= o;
      const ix = o.geometry.index; for (let i = 0; i < ix.count; i++) refVerts.add(ix.getX(i));
    });
    this.rigMeshes = []; rig.root.traverse((o) => { if (o.isSkinnedMesh && o.visible) this.rigMeshes.push(o); });
    this.skins.rig = { high: skinMaterial({ unit: rig.scale }) };
    for (const o of this.rigMeshes) o.material = this.skins.rig.high;
    // long arms: stretch each arm along its bone; the forearm keeps scale 1 so it inherits the same stretch
    for (const s of ['L', 'R']) rig.bones[s + '_UpperArm'].scale.x = ARM_STRETCH;
    this.root.add(rig.root);
    // the face rides on the head bone, upright in model space
    const hb = rig.bones.Head;
    this.torso.remove(this.head); hb.add(this.head);
    this.head.rotation.order = 'XYZ';
    this.head.position.set(...FACE_POS);
    this.head.quaternion.copy(rig.restQ.Head).invert();
    this.head.scale.setScalar(1 / rig.scale);
    this.head.updateMatrix();
    // its skull and neck are one mesh skinned to the body's skeleton, bound so its skull part sits exactly where the face group does
    const skel = body.skeleton, hi = skel.bones.indexOf(hb), bind = skel.boneInverses[hi].clone().invert().multiply(this.head.matrix);
    const geo = headGeometry({ neck: true });
    skinWeights(geo, body, refVerts, bind, hi, skel.bones.indexOf(rig.bones.Neck));
    const P = body.geometry.attributes.position, N = body.geometry.attributes.normal, toFace = bind.clone().invert(), p = new THREE.Vector3(), n = new THREE.Vector3();
    for (const i of refVerts) {
      p.fromBufferAttribute(P, i).applyMatrix4(toFace); n.fromBufferAttribute(N, i).transformDirection(toFace);
      if (tuckIntoNeck(p, n)) { P.setXYZ(i, ...p.applyMatrix4(bind).toArray()); N.setXYZ(i, ...n.transformDirection(bind).toArray()); }
    }
    P.needsUpdate = N.needsUpdate = true;
    const head = new THREE.SkinnedMesh(geo);
    head.name = 'creatureHead'; head.frustumCulled = false;
    body.parent.add(head); head.bind(skel, bind);
    this.face.setSkull(head);
    this.body.visible = false;
    rig.play('idle', { fade: 0, speed: 0.3 });
    this.rig = rig;
    this.setQuality(this.quality, true);
  }

  // 'low' swaps the skin for the cheaper material (the face's own skull follows)
  setQuality(q, force = false) {
    if (q === this.quality && !force) return;
    this.quality = q;
    const low = q === 'low', pick = (set, opts) => set[q] || (set[q] = skinMaterial({ ...opts, low }));
    const cylSkin = pick(this.skins, {});
    for (const o of this.cyls) o.material = cylSkin;
    if (this.rig) { const m = pick(this.skins.rig, { unit: this.rig.scale }); for (const o of this.rigMeshes) o.material = m; }
    this.face.setQuality(q);
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
    // the clip keeps pace with how fast it is actually moving (this.speed is metres per second over 3)
    if (run) r.play('run', { fade: 0.25, speed: 0.8 + this.speed * 0.3 });
    else if (walk) r.play('walk', { fade: 0.45, speed: 0.4 + this.speed * 0.45 });
    else r.play('idle', { fade: 0.5, speed: 0.3 });
    r.update(dt);
    // posture on top of the clip: stooped when moving, plus the story's lean and head tilt, and a slow sway so it is never quite still
    r.bend(['Spine', 'Spine1', 'Spine2'], [0.2, 0.4, 0.4], [1, 0, 0], this.lean + (run ? 0.12 : walk ? 0.12 : 0));
    r.bend(['Spine1'], [1], [0, 0, 1], Math.sin(t * 0.6) * 0.035 + Math.sin(t * 1.7) * 0.012);
    r.bend(['Neck', 'Head'], [0.4, 0.6], [0, 0, 1], this.tilt + Math.sin(t * 0.7) * 0.05);
    // slow breathing: the chest opens and the shoulders lift a few millimetres
    const br = 0.5 + 0.5 * Math.sin(t * 1.15);
    r.bend(['Spine2'], [1], [1, 0, 0], -0.012 * br);
    r.bend(['L_Clavicle', 'R_Clavicle'], [1, -1], [0, 0, 1], 0.02 * br);
    // arms out toward you
    if (this.reach > 0.01) {
      const dir = r.axisWorld(0, 0.1, 1).normalize();
      for (const s of ['L', 'R']) {
        r.aim(r.bones[s + '_UpperArm'], r.bones[s + '_Forearm'], dir, this.reach);
        r.aim(r.bones[s + '_Forearm'], r.bones[s + '_Hand'], dir, this.reach);
      }
    }
    r.lookAt(this.lookTarget, dt, { yaw: 1.2, pitch: 0.7, speed: 6 });
    // now and then, while it stands, it cocks its head: quick over, held a moment, eased back. At most once per 11 s, timed from the
    // clock alone so a replay matches (after the look, which would straighten it out)
    const n = Math.floor(t / 11), u = t - n * 11 - 3 - 6 * hash(n);
    if (n > 0 && u > 0 && u < 0.9 && this.mode === 'idle' && this.reach < 0.2) {
      const k = (u < 0.08 ? ss(u, 0, 0.08) : 1 - ss(u, 0.3, 0.9)) * (hash(n + 0.5) < 0.5 ? -1 : 1);
      r.bend(['Head'], [1], [0, 0, 1], 0.08 * k);
      r.bend(['Neck'], [1], [0, 1, 0], 0.03 * k);
    }
    this.face.update(dt, { target: this.lookTarget, smile: this.smileScale });
  }

  update(dt) {
    if (!this.root.visible) return;
    const q = preset(); if (q !== this.quality) this.setQuality(q);
    this.t += dt; const t = this.t;
    if (this.rig) { this.updateRig(dt); return; }
    if (!this.face.skull) this.face.addSkull();
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
    this.face.update(dt, { target: this.lookTarget, smile: this.smileScale });
  }

  headWorld(out = new THREE.Vector3()) { this.root.updateMatrixWorld(true); return this.head.getWorldPosition(out); }
}
