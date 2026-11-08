// the thing: a stretched black body with the face from creature.js on its head bone (one skull running down into the neck, white
// ring eyes with black pupils that follow the player, the grin cut into the head)
import * as THREE from 'three';
import { createFace, headGeometry, skinMaterial, tuckIntoNeck, RIM_COL, RX, RY, RZ } from './creature.js';
import { smoothstep as ss, lerp, hash } from './mathx.js';
import { Rig, loadModel, loadAnims } from './rig.js';
import { Shroud } from './shroud.js';
import { PHONE } from './gfx.js';
import { headClear, addBody, body as bodyOf } from './collide.js';

const V3 = THREE.Vector3;
const _v = new V3(), _w = new V3(), _x = new V3(), _y = new V3(), _z = new V3(), _k = new V3(), _ax = new V3(), _hq = new THREE.Quaternion();
const _lat = new V3(), _palm = new V3(), _p2 = new V3(), _cax = new V3(), _cr = new V3();
const _a = new V3(), _b = new V3(), _c = new V3(), _d = new V3(), _e = new V3(), _f = new V3(), _g = new V3(), _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const ARM_STRETCH = 1.4;
// the crawl (the Ring crawl): what touches the floor, in the root's frame (+z ahead, +x its left), metres over the floor. The rig is
// tipped past level so the hips ride over the shoulders; the hands and knees are put on the boards, the feet trail behind on their tops
const CRAWL = {
  pitch: 1.62, pelvis: 0.6,
  hand: [0.45, 0.062, 1.26], handPole: [0.95, 2.1, 0.1], handLift: 0.13,
  knee: [0.3, 0.17, -0.12], kneeLift: 0.06, foot: [0.34, 0.072],
  hold: 0.72,                      // of each step the pose is held, then it jumps to the next in what is left (two or three frames)
};
const LIMBS = ['RH', 'LK', 'LH', 'RK'];   // the diagonal gait: right hand, left knee, left hand, right knee
// the unfold from the crumple into the crawl: five held keys of 0.09 s, what each one has brought in (pitch: the roll to prone; legs:
// the knees out from under it; arms: the hands out to the floor; elbows: cranked up; head: up at you)
const UNFOLD = [
  { pitch: 0.15, legs: 0.3, arms: 0, elbows: 0, head: 0 },
  { pitch: 0.3, legs: 0.35, arms: 1, elbows: 0, head: 0 },
  { pitch: 1, legs: 1, arms: 1, elbows: 0.25, head: 0 },
  { pitch: 1, legs: 1, arms: 1, elbows: 1, head: 0 },
  { pitch: 1, legs: 1, arms: 1, elbows: 1, head: 1 },
];
export const UNFOLD_KEY = 0.09, UNFOLD_TIME = UNFOLD.length * UNFOLD_KEY;
const FULL = { pitch: 1, legs: 1, arms: 1, elbows: 1, head: 1 }, ZERO = { pitch: 0, legs: 0, arms: 0, elbows: 0, head: 0 }, ID_Q = new THREE.Quaternion();
const ramp = (u) => Math.min(1, Math.max(0, (u - CRAWL.hold) / (1 - CRAWL.hold)));
// the shroud: how many wisps per graphics preset
const WISPS = PHONE ? { ultra: 120, high: 120, medium: 120, low: 120, phone: 120 } : { ultra: 820, high: 640, medium: 340, low: 300 };
// the hands: the clips come in with the wrists bent and turned in, so every frame the hand is brought back near the forearm's line
// and the long fingers are set a little curled, more toward the little finger, the thumb out
const WRIST_FLEX = 0.12;
const FINGERS = ['Finger1', 'Finger2', 'Finger3', 'Finger4', 'Finger0'];
const CURL = [[0.22, 0.3, 0.2], [0.26, 0.34, 0.22], [0.3, 0.38, 0.24], [0.34, 0.42, 0.26], [0.12, 0.1, 0.08]];
const FACE_POS = [11, 4, 0];   // skull centre in head-bone space (cm): up, forward, left
const BODY_RIM = RIM_COL.clone().multiplyScalar(2.6);   // stronger on the body, so the arms come off the dark

// skin weights for the skull-and-neck mesh on the body's skeleton. the skull moves with the head bone alone. down the neck the
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
    const sk = (v.x / RX) ** 2 + (v.y / RY) ** 2 + (v.z / RZ) ** 2;
    const t = Math.max(ss(-0.33, -0.17, v.y), ss(-1.32, -1.02, -sk));
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
    this.head = createFace({ skull: false });
    this.head.position.y = 1.2; this.head.rotation.order = 'YXZ'; this.torso.add(this.head);
    this.smile = this.head.smile;

    // state
    this.t = 0; this.phase = 0; this.mode = 'idle'; this.speed = 0;
    this.lean = 0; this.reach = 0; this.tilt = 0; this.smileScale = 1;
    this.lookTarget = null;
    this.root.visible = false;
    // mode: idle | walk | run (on its feet) | crumple | unfold | crawl (low) | lie | sit. duck 0..1 is worked out each frame from what hangs
    // overhead (duckHold pins it: the crouch); snap 0..1 brings its head up (the crumple's bent head straightened, the crawl's face off the
    // boards); flinch and stun 0..1 are the light in its face and the flash; catchPose { frame 1..3, cam } is the catch, held a frame at
    // a time; cling (a ceiling height) hangs the crumple upside down from it. crawlSpeed is metres a second the hunter wants of the crawl,
    // and lungeOut the metres the crawl has lunged since the hunter last took them (it moves the root by exactly that)
    this.duck = 0; this.duckHold = null; this.narrowK = 0; this.snap = 0; this.flinch = 0; this.stun = 0; this.catchPose = null; this.cling = null;
    this.level = 1; this.unfoldT = 0; this.onKey = null; this.onStep = null; this.sneak = false; this.crawlSpeed = 0; this.lungeOut = 0; this.gait = null; this.ground = null;
    this.blinkT = 18 + hash(7.3) * 22; this.blinkK = 0; this.eyeLagT = 0;
    // the room it takes up beyond its root while it is low: two more circles on the floor for the bodies (collide.js) to keep out of
    const extra = (id) => { const b = addBody({ id, kind: 'thing', pos: new V3(), r: 0.45, h: 1, active: () => this.root.visible && b.on }); b.on = false; return b; };
    this.extra = { fore: extra('thing:fore'), aft: extra('thing:aft') };

    // the rigged body: a black Rocketbox man stretched tall, animated with baked Mixamo clips (the cylinder body stays as the fallback)
    this.rig = null;
    Promise.all([loadModel('spirit'), loadAnims()]).then(([gltf, clips]) => this.useRig(new Rig(gltf, clips)))
      .catch((e) => console.warn('spirit model failed, keeping the simple body:', e));
  }

  useRig(rig) {
    const K = 1.43;                                   // a 1.82 m man -> about 2.6 m
    rig.setHeight(1.82 * K);
    // the man's own head and his hair cards are hidden as meshes, the rest of him takes the skin
    let body = null; const refVerts = new Set();
    rig.root.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      const name = [].concat(o.material)[0].name;
      if (/head|opacity/.test(name)) { o.visible = false; return; }
      body ||= o;
      const ix = o.geometry.index; for (let i = 0; i < ix.count; i++) refVerts.add(ix.getX(i));
    });
    this.rigMeshes = []; rig.root.traverse((o) => { if (o.isSkinnedMesh && o.visible) this.rigMeshes.push(o); });
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
    // the body's rim fades out going up into the collar (rest space is z up, in metres once scaled), as the face's does down the jaw
    const zAt = (y) => new THREE.Vector3(0, y, 0).applyMatrix4(bind).z * rig.scale;
    this.rigSkin = { unit: rig.scale, rim: BODY_RIM, rimFade: [new THREE.Vector3(0, 0, 1), zAt(-0.55), zAt(-0.4)], body: true };
    this.skins.rig = { high: skinMaterial(this.rigSkin) };
    for (const o of this.rigMeshes) o.material = this.skins.rig.high;
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
    this.head.setSkull(head);
    this.body.visible = false;
    rig.play('idle', { fade: 0, speed: 0.3 });
    this.rig = rig;
    this.measure(rig);
    // the shroud hangs on the bones, the whole figure from the skull to the toes; whatever drifts between the viewer and the face
    // fades out, so the eyes and the grin are always clear while the smoke still pours off the back of the head
    const B = rig.bones, seg = (a, b, r, w) => ({ a: B[a], b: B[b] || null, r, w });
    this.shroud = new Shroud(this.root, [
      // shares are per segment, so the long leg bones get the most: the legs are half the figure
      seg('Neck', 'Head', 0.12, 1.2), seg('Head', null, 0.17, 2.2),
      seg('Pelvis', 'Spine', 0.24, 2.4), seg('Spine', 'Spine1', 0.26, 2.6), seg('Spine1', 'Spine2', 0.27, 2.6), seg('Spine2', 'Neck', 0.24, 1.8),
      seg('L_Clavicle', 'L_UpperArm', 0.13, 0.8), seg('R_Clavicle', 'R_UpperArm', 0.13, 0.8),
      seg('L_UpperArm', 'L_Forearm', 0.11, 2.4), seg('R_UpperArm', 'R_Forearm', 0.11, 2.4), seg('L_Forearm', 'L_Hand', 0.09, 2.0), seg('R_Forearm', 'R_Hand', 0.09, 2.0),
      seg('L_Thigh', 'L_Calf', 0.16, 7.5), seg('R_Thigh', 'R_Calf', 0.16, 7.5), seg('L_Calf', 'L_Foot', 0.12, 6), seg('R_Calf', 'R_Foot', 0.12, 6),
      seg('L_Foot', 'L_Toe0', 0.11, 2.4), seg('R_Foot', 'R_Toe0', 0.11, 2.4),
    ], { count: WISPS.ultra, rise: 0.16, life: 1.4, size: [0.14, 0.52], spread: 1.25, near: 0.6, opacity: 1 });
    this.setQuality(this.quality, true);
  }

  // the hand correction, after the clip and the reach: wrist back toward the forearm's line, fingers long and a little curled
  relaxHands(r) {
    for (const side of ['L', 'R']) {
      const hand = r.bones[side + '_Hand'], fo = r.bones[side + '_Forearm'], th = r.bones[side + '_Finger0'], i1 = r.bones[side + '_Finger1'], i2 = r.bones[side + '_Finger2'], i4 = r.bones[side + '_Finger4'];
      if (!hand || !fo || !th || !i1 || !i2 || !i4) continue;
      const knuckles = () => { for (const b of [fo, hand, th, i1, i2, i4]) b.updateWorldMatrix(true, false); fo.getWorldPosition(_w); hand.getWorldPosition(_x); i1.getWorldPosition(_y); i4.getWorldPosition(_z); th.getWorldPosition(_k); return _v.copy(_y).add(_z).multiplyScalar(0.5).sub(_x).normalize(); };
      let along = knuckles();
      const fa = _ax.copy(_x).sub(_w).normalize(), flex = fa.angleTo(along);
      if (flex > WRIST_FLEX + 0.02) {
        _cr.crossVectors(along, fa);
        if (_cr.lengthSq() > 1e-8) { r.rotateWorld(hand, _hq.setFromAxisAngle(_cr.normalize(), flex - WRIST_FLEX)); along = knuckles(); }
      }
      // the palm side is where the thumb's root sits, with the across- and along-hand parts taken out; the fingers close about the knuckle line toward it
      _lat.copy(_z).sub(_y).normalize();
      _palm.copy(_k).sub(_y).lerp(_p2.copy(_k).sub(_z), 0.5); _palm.addScaledVector(_lat, -_palm.dot(_lat)).addScaledVector(along, -_palm.dot(along)).normalize();
      i2.getWorldPosition(_v); const mid = _v.sub(_x).normalize();
      _cax.copy(_lat); if (_cr.crossVectors(_cax, mid).dot(_palm) < 0) _cax.negate();
      for (let f = 0; f < 5; f++) {
        const n = FINGERS[f], chain = [n, n + '1', n + '2'];
        for (let i = 0; i < 3; i++) { const b = r.bones[side + '_' + chain[i]]; if (b) r.rotateWorld(b, _hq.setFromAxisAngle(_cax, CURL[f][i])); }
      }
    }
  }

  // 'low' swaps the skin for the cheaper material (the face's own skull follows)
  setQuality(q, force = false) {
    if (q === this.quality && !force) return;
    this.quality = q;
    const low = q === 'low', pick = (set, opts) => set[q] || (set[q] = skinMaterial({ ...opts, low }));
    const cylSkin = pick(this.skins, {});
    for (const o of this.cyls) o.material = cylSkin;
    if (this.rig) { const m = pick(this.skins.rig, this.rigSkin); for (const o of this.rigMeshes) o.material = m; }
    if (this.shroud) this.shroud.setCount(WISPS[this.gfxQuality] ?? WISPS.high);
    this.head.setQuality(q);
  }

  get visible() { return this.root.visible; }
  set visible(v) { this.root.visible = v; }

  faceTowards(x, z, k = 1) {
    const p = this.root.position;
    let want = Math.atan2(x - p.x, z - p.z), cur = this.root.rotation.y;
    let d = want - cur; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    this.root.rotation.y = cur + d * Math.min(1, k);
  }

  // what the low poses need to know of this body, measured once on the idle clip's first frame: where the pelvis sits over the rig's
  // root, how long the limbs are, and in each hand's and foot's own frame which way the fingers and the toes point, the palm faces and
  // the top of the foot faces
  measure(r) {
    const rr = r.root, B = r.bones;
    rr.position.set(0, 0, 0); rr.rotation.set(0, 0, 0); r.update(0); this.root.updateMatrixWorld(true);
    const loc = (b, out = new V3()) => this.root.worldToLocal(b.getWorldPosition(out));
    const dist = (a, b) => B[a].getWorldPosition(_a).distanceTo(B[b].getWorldPosition(_b));
    this.pelvisRest = loc(B.Pelvis).sub(rr.position);
    this.arm = [dist('L_UpperArm', 'L_Forearm'), dist('L_Forearm', 'L_Hand')];
    this.leg = [dist('L_Thigh', 'L_Calf'), dist('L_Calf', 'L_Foot')];
    const inHand = (b, p) => p.clone().sub(b.getWorldPosition(new V3())).applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion()).invert()).normalize();
    this.handAxes = {}; this.footAxes = {};
    for (const s of ['L', 'R']) {
      const h = B[s + '_Hand'], f2 = B[s + '_Finger2'].getWorldPosition(new V3()), f1 = B[s + '_Finger1'].getWorldPosition(new V3()), f4 = B[s + '_Finger4'].getWorldPosition(new V3()), th = B[s + '_Finger0'].getWorldPosition(new V3()), hw = h.getWorldPosition(new V3());
      const along = f2.clone().sub(hw).normalize(), lat = f4.clone().sub(f1).normalize(), palm = th.clone().sub(f1).lerp(th.clone().sub(f4), 0.5);
      palm.addScaledVector(lat, -palm.dot(lat)).addScaledVector(along, -palm.dot(along)).normalize();
      const q = h.getWorldQuaternion(new THREE.Quaternion()).invert();
      this.handAxes[s] = { along: inHand(h, f2), palm: palm.applyQuaternion(q).normalize(), reach: f2.distanceTo(hw) };
      const ft = B[s + '_Foot'], toe = B[s + '_Toe0'].getWorldPosition(new V3()), fq = ft.getWorldQuaternion(new THREE.Quaternion()).invert();
      const toeL = inHand(ft, toe), upL = new V3(0, 1, 0).applyQuaternion(fq); upL.addScaledVector(toeL, -upL.dot(toeL)).normalize();
      this.footAxes[s] = { toe: toeL, top: upL };
    }
  }

  // ---------- low to the floor ----------
  // the floor under a point (the hunter hands in W.groundAt; without it, the level the root stands on)
  floorAt(x, z) { const y0 = this.root.position.y; return this.ground ? this.ground(x, z, y0) : y0; }
  // a point of the root's frame (+z ahead, +x its left) in the world (the root's matrix must be current)
  T(x, y, z, out = _y) { return out.set(x, y, z).applyMatrix4(this.root.matrixWorld); }
  dirW(x, y, z, out = _z) { return out.set(x, y, z).applyQuaternion(this.root.quaternion).normalize(); }
  local(b, out = _x) { b.getWorldPosition(out); return this.root.worldToLocal(out); }

  // a contact where it belongs under the body now: lead metres further ahead (the crawl's stance narrows in a doorway)
  nominal(L, lead, out) {
    const left = L[0] === 'L' ? 1 : -1, hand = L[1] === 'H', c = hand ? CRAWL.hand : CRAWL.knee, n = this.narrowK;
    this.T(left * c[0] * (1 - (hand ? 0.45 : 0.35) * n), 0, c[2] + lead, out); out.y = this.floorAt(out.x, out.z) + c[1];
    return out;
  }
  gaitReset() {
    const g = this.gait || (this.gait = { plants: {}, lookFrom: new V3(), lookTo: new V3(), lookNow: new V3(), at: new V3() });
    g.t = 0; g.k = 0; g.swing = null; g.lunge = false; g.stride = 0;
    g.twistFrom = g.twistTo = g.twistNow = 0; g.sideFrom = g.sideTo = g.sideNow = 0; g.rollFrom = g.rollTo = g.rollNow = 0;
    this.root.updateMatrixWorld(true);
    for (const L of LIMBS) { const p = g.plants[L] || (g.plants[L] = { cur: new V3(), from: new V3(), to: new V3() }); this.nominal(L, 0, p.cur); p.from.copy(p.cur); p.to.copy(p.cur); }
    if (this.lookTarget) g.lookNow.copy(this.lookTarget); else this.T(0, 1.2, 4, g.lookNow);
    g.lookFrom.copy(g.lookNow); g.lookTo.copy(g.lookNow);
    g.at.copy(this.root.position);
    return g;
  }
  // the step clock: each step's pose is held for most of the step and jumped to in the rest; one limb swings a step, and every other step
  // the whole body lunges (lungeOut: the hunter moves the root by it). Standing still it only shifts a hand or a knee now and then
  gaitTick(dt) {
    let g = this.gait || this.gaitReset();
    this.root.updateMatrixWorld(true);
    if (g.at.distanceTo(this.root.position) > 1.2) g = this.gaitReset();   // put somewhere new: every contact straight under it
    else for (const L of LIMBS) if (this.nominal(L, 0, _a).distanceTo(g.plants[L].cur) > 1.5) { g = this.gaitReset(); break; }
    const v = this.crawlSpeed, held = this.flinch > 0.2 || this.stun > 0.2, moving = v > 0.05 && !held;
    const rate = moving ? THREE.MathUtils.clamp(v / 0.25, 8, 18) : held ? 0 : 2.4;
    const stride = moving ? 2 * v / rate : 0;
    let t0 = g.t; g.t += dt * rate;
    for (let guard = 0; guard < 8; guard++) {
      const u0 = t0 - g.k, u1 = Math.min(1, g.t - g.k);
      if (g.lunge) this.lungeOut += g.stride * (ramp(u1) - ramp(u0));
      this.swingTo(ramp(u1));
      if (Math.floor(g.t) <= g.k) break;
      t0 = g.k + 1; g.k++; this.beginStep(g.k, stride);
    }
    g.at.copy(this.root.position);
  }
  beginStep(k, stride) {
    const g = this.gait, L = LIMBS[k & 3];
    if (g.swing) { const p = g.plants[g.swing]; p.cur.copy(p.to); }
    g.stride = stride; g.lunge = stride > 0 && (k & 1) === 1;
    // one step in nine a limb is left where it was, so it never loops (unless it has fallen too far behind to be left)
    const lag = this.T(0, 0, 0, _b).sub(g.plants[L].cur).dot(this.dirW(0, 0, 1, _c)) + (L[1] === 'H' ? CRAWL.hand[2] : CRAWL.knee[2]);
    g.swing = hash(k * 0.618 + 3.1) < 1 / 9 && lag < stride * 0.5 ? null : L;
    if (g.swing) {
      const p = g.plants[g.swing]; p.from.copy(p.cur);
      // it goes down ahead of where it belongs by the stride (by two when the body lunges this same step), so it ends its cycle as far behind
      this.nominal(L, stride > 0 ? stride * (g.lunge ? 2 : 1) : 0, p.to);
      if (stride === 0) p.to.lerp(p.cur, 0.6);   // still: it only shifts its weight
      if (L[1] === 'H') {   // never further than the arm reaches from where its shoulder will be
        const sh = this.T(L[0] === 'L' ? 0.3 : -0.3, CRAWL.pelvis - 0.1, 0.78 + (g.lunge ? stride : 0), _b), max = this.arm ? (this.arm[0] + this.arm[1]) * 0.92 : 1;
        const d = p.to.distanceTo(sh); if (d > max) { const y = p.to.y; p.to.sub(sh).multiplyScalar(max / d).add(sh); p.to.y = y; }
      }
    }
    // the trunk: the shoulders turned against the hips the other way each step, a lean to one side on each lunge; the head's look
    // taken now and held, rolled to the other side every step
    g.twistFrom = g.twistNow; g.twistTo = (k & 1 ? 1 : -1) * 0.35 * (stride > 0 ? 1 : 0.35);
    g.sideFrom = g.sideNow; if (g.lunge) g.sideTo = ((k >> 1) & 1 ? 1 : -1) * 0.25; else if (stride === 0) g.sideTo = 0;
    g.rollFrom = g.rollNow; g.rollTo = (k & 1 ? 1 : -1) * 0.6;
    g.lookFrom.copy(g.lookNow); if (this.lookTarget) g.lookTo.copy(this.lookTarget);
    if (this.onStep) this.onStep(k, g.swing || L, g.swing ? g.plants[g.swing].to : null, g.lunge);   // the hunter's sounds for the body on the boards
  }
  swingTo(s) {
    const g = this.gait;
    if (g.swing) { const p = g.plants[g.swing]; p.cur.lerpVectors(p.from, p.to, s); p.cur.y += Math.sin(Math.PI * s) * (g.swing[1] === 'H' ? CRAWL.handLift : CRAWL.kneeLift); }
    g.twistNow = lerp(g.twistFrom, g.twistTo, s); g.sideNow = lerp(g.sideFrom, g.sideTo, s); g.rollNow = lerp(g.rollFrom, g.rollTo, s);
    g.lookNow.lerpVectors(g.lookFrom, g.lookTo, s);
  }

  // one low pose from five weights, 0 the crumple and 1 the crawl (the unfold runs them up one key at a time):
  //   pitch   the rig tipped past level, the pelvis lifted to its crawl height (0: upright, the spine bent over the knees, dropped till they touch)
  //   legs    the knees out from under it and down on the boards behind, the feet trailing (0: folded under it)
  //   arms    the hands out on the floor ahead (0: on the floor beside the knees);  elbows: cranked up and out (0: out to the sides)
  //   head    the crawl's head, down to the boards or up at you by `snap` (0: the crumple's, bent too far to the side)
  lowPose(dt, K) {
    const r = this.rig, rr = r.root, B = r.bones, g = this.gait || this.gaitReset(), snap = this.snap || 0;
    r.play('idle', { fade: 0, speed: 0.05 }); r.update(dt);
    this.root.updateMatrixWorld(true);
    const floor = this.floorAt(this.root.position.x, this.root.position.z) - this.root.position.y;   // the floor in the root's frame
    // the trunk. A stunned crawl rears back off its hands
    const pitch = K.pitch * (CRAWL.pitch - this.stun * 0.55 - this.flinch * 0.12), c = Math.cos(pitch), s = Math.sin(pitch), pr = this.pelvisRest;
    rr.rotation.set(pitch, 0, 0);
    rr.position.set(-pr.x * K.pitch, (floor + CRAWL.pelvis + this.stun * 0.12 - (pr.y * c - pr.z * s)) * K.pitch, -(pr.y * s + pr.z * c) * K.pitch);
    rr.updateMatrixWorld(true);
    const fold = 1 - K.legs, hunch = 1 - K.pitch;
    if (fold > 0.001) { r.bend(['L_Thigh', 'R_Thigh'], [1, 1], [1, 0, 0], -1.55 * fold); r.bend(['L_Calf', 'R_Calf'], [1, 1], [1, 0, 0], 2.9 * fold); }
    if (hunch > 0.001) r.bend(['Spine', 'Spine1', 'Spine2'], [0.35, 0.35, 0.3], [1, 0, 0], (1.2 + Math.sin(this.t * 0.9) * 0.03) * hunch);
    // the crawl's trunk: the shoulders turned against the hips along the spine, and the lean to one side on the lunge
    if (K.pitch > 0.001) {
      B.Pelvis.getWorldPosition(_a); B.Neck.getWorldPosition(_b); _c.copy(_b).sub(_a).normalize();
      for (const [n, w] of [['Spine1', 0.5], ['Spine2', 0.5]]) r.rotateWorld(B[n], _q1.setFromAxisAngle(_c, g.twistNow * w * K.pitch));
      r.bend(['Spine', 'Spine1'], [0.5, 0.5], [0, 1, 0], g.sideNow * K.pitch);
    }
    // down onto the floor: in the crumple the knees on the boards
    if (hunch > 0.001) {
      rr.updateMatrixWorld(true);
      const kl = this.local(B.L_Calf, _a).y, kr = this.local(B.R_Calf, _b).y;
      rr.position.y += (floor + 0.1 - Math.min(kl, kr)) * hunch; rr.updateMatrixWorld(true);
    }
    // the head before the arms: the clavicles hang from the neck in this rig, so the neck moves the shoulders
    const hk = 1 - K.head;
    if (hk > 0.001) {
      r.bend(['Neck', 'Head'], [0.5, 0.5], [1, 0, 0], (-0.95 - snap * 0.25) * hk);
      r.bend(['Neck', 'Head'], [0.4, 0.6], [0, 0, 1], ((1 - snap) * 1.15 * (this.side || 1) + Math.sin(this.t * 2.3) * 0.02) * hk);
    }
    if (K.head > 0.001) this.crawlHead(K.head, snap, g);
    // the arms: two-bone IK onto a point on the floor, the elbow bent toward its pole; the hand laid flat, fingers ahead and out
    this.root.updateMatrixWorld(true);
    for (const sd of ['L', 'R']) {
      const left = sd === 'L' ? 1 : -1;
      const cr = this.T(left * 0.4, 0, 0.6, _a); cr.y = this.floorAt(cr.x, cr.z) + 0.08;
      const target = _b.copy(cr).lerp(g.plants[sd + 'H'].cur, K.arms);
      if (this.flinch > 0.01 && K.pitch > 0.5 && sd === 'R') { this.head.getWorldPosition(_c); _c.addScaledVector(this.dirW(-0.3, -0.5, 0.4, _d), 0.32); target.lerp(_c, this.flinch); }   // a hand up over the face
      const pole = this.T(left * 1.2, 0.7, 0.1, _c).lerp(this.T(left * CRAWL.handPole[0] * (1 - 0.75 * this.narrowK), CRAWL.handPole[1], CRAWL.handPole[2], _d), K.elbows);
      r.ik2(B[sd + '_UpperArm'], B[sd + '_Forearm'], B[sd + '_Hand'], target, pole);
      if (!(sd === 'R' && this.flinch > 0.5 && K.pitch > 0.5)) this.layHand(sd, this.dirW(left * lerp(0.75, 0.42, K.arms), -0.06, lerp(0.65, 0.9, K.arms), _e));
    }
    // the legs: each knee on the floor where its thigh reaches toward its plant, the foot trailing on its top straight behind the knee
    if (K.legs > 0.001) {
      const [L1, L2] = this.leg;
      for (const sd of ['L', 'R']) {
        const left = sd === 'L' ? 1 : -1, th = B[sd + '_Thigh'], ca = B[sd + '_Calf'], ft = B[sd + '_Foot'], plant = g.plants[sd + 'K'].cur;
        th.getWorldPosition(_a);
        const dy = _a.y - plant.y, R = Math.sqrt(Math.max(0, L1 * L1 - dy * dy));
        _d.set(plant.x - _a.x, 0, plant.z - _a.z); if (_d.lengthSq() < 1e-6) this.dirW(left * 0.4, 0, -1, _d); _d.normalize();
        _b.set(_a.x + _d.x * R, plant.y, _a.z + _d.z * R);
        r.aim(th, ca, _c.copy(_b).sub(_a).normalize(), K.legs);
        ca.getWorldPosition(_b);
        const back = this.dirW(left * 0.12, 0, -1, _e), fx = _b.x + back.x * L2, fz = _b.z + back.z * L2, fy = this.floorAt(fx, fz) + CRAWL.foot[1];
        const R2 = Math.sqrt(Math.max(0, L2 * L2 - (_b.y - fy) ** 2));
        _c.set(_b.x + back.x * R2, fy, _b.z + back.z * R2);
        r.aim(ca, ft, _c.sub(_b).normalize(), K.legs);
        // on its top: the ball of the foot sits near the sole, so with the top down the line from the ankle to the ball rises
        const fa = this.footAxes && this.footAxes[sd];
        if (fa) r.orient(ft, fa.toe, this.dirW(left * 0.1, 0.3, -1, _e), fa.top, _f.set(0, -1, 0), K.legs);
      }
    }
  }
  // a hand flat on the floor: the fingers swung along dir, then the hand turned about them until the palm faces down. Measured off the
  // finger bones themselves, not the hand's axes: the stretched arm shears the hand's frame
  layHand(sd, dir, down = _f.set(0, -1, 0)) {
    const r = this.rig, B = r.bones, h = B[sd + '_Hand'], f1 = B[sd + '_Finger1'], f2 = B[sd + '_Finger2'], f4 = B[sd + '_Finger4'], th = B[sd + '_Finger0'];
    if (!h || !f1 || !f2 || !f4 || !th) return;
    for (let i = 0; i < 2; i++) {
      r.aim(h, f2, dir, 1);
      h.getWorldPosition(_a); f2.getWorldPosition(_b); f1.getWorldPosition(_c); f4.getWorldPosition(_d); th.getWorldPosition(_g);
      const along = _b.sub(_a).normalize(), lat = _d.sub(_c).normalize(), palm = _g.sub(_c);
      palm.addScaledVector(lat, -palm.dot(lat)).addScaledVector(along, -palm.dot(along));
      _k.copy(down).addScaledVector(along, -down.dot(along));
      if (palm.lengthSq() < 1e-8 || _k.lengthSq() < 1e-8) return;
      palm.normalize(); _k.normalize();
      const ang = Math.atan2(_cr.crossVectors(palm, _k).dot(along), palm.dot(_k));
      r.rotateWorld(h, _q1.setFromAxisAngle(along, ang + 0.2 * (sd === 'L' ? -1 : 1)));   // a little onto its outer edge, the thumb's side up
    }
    this.floorFingers(sd);
  }
  // the fingers and the thumb on the boards, not through them: each joint (and the tip past the last) that is under the floor lifts its
  // segment until it rests on it
  floorFingers(sd) {
    const r = this.rig, B = r.bones;
    for (const f of FINGERS) {
      const chain = [B[sd + '_' + f], B[sd + '_' + f + '1'], B[sd + '_' + f + '2']]; if (!chain[2]) continue;
      for (let i = 0; i < 3; i++) {
        const b = chain[i]; b.getWorldPosition(_a);
        if (i < 2) chain[i + 1].getWorldPosition(_b); else { chain[1].getWorldPosition(_c); _b.copy(_a).addScaledVector(_a.clone().sub(_c), 0.8); }
        const floor = this.floorAt(_b.x, _b.z) + 0.022, len = _a.distanceTo(_b);
        if (_b.y >= floor || len < 1e-4) continue;
        _c.copy(_b).sub(_a).normalize(); _d.crossVectors(_c, _e.set(0, 1, 0)); if (_d.lengthSq() < 1e-8) continue;
        const ang = Math.asin(THREE.MathUtils.clamp((floor - _b.y) / len, 0, 1)) * 1.05;
        r.rotateWorld(b, _q1.setFromAxisAngle(_d.normalize(), ang));
      }
    }
  }
  // the crawl's head: face down to the boards (the back of the skull toward you) until the snap, then cranked up at you, the look held
  // a step at a time and rolled over to one side and then the other
  crawlHead(w, snap, g) {
    const r = this.rig, B = r.bones;
    if (snap < 1) r.bend(['Neck', 'Head'], [0.3, 0.7], [1, 0, 0], 0.35 * w * (1 - snap));
    const up = w * snap * (1 - this.flinch * 0.9);
    if (up < 0.001) return;
    this.root.updateMatrixWorld(true);
    B.Head.getWorldPosition(_a);
    // where it looks, in the root's frame, held to what a neck could almost do (yaw 1.6, pitch 1.0)
    _b.copy(g.lookNow).sub(_a).applyQuaternion(_q2.copy(this.root.quaternion).invert());
    const yaw = THREE.MathUtils.clamp(Math.atan2(_b.x, _b.z), -1.6, 1.6), pit = THREE.MathUtils.clamp(Math.atan2(_b.y, Math.hypot(_b.x, _b.z)), -1.0, 1.0) + this.stun * 0.6;
    const want = _c.set(Math.sin(yaw) * Math.cos(pit), Math.sin(pit), Math.cos(yaw) * Math.cos(pit)).applyQuaternion(this.root.quaternion);
    for (const [n, share] of [['Neck', 0.25], ['Head', 1]]) {
      this.head.updateWorldMatrix(true, false); this.head.getWorldDirection(_d);
      r.rotateWorld(B[n], _q1.setFromUnitVectors(_d, want).slerp(ID_Q, 1 - share * up));
    }
    // chin up: the head tipped back past the look, the eyes still on you, so the grin sits under them and the crown goes back and down
    this.head.getWorldDirection(_d); _e.crossVectors(_d, _f.set(0, 1, 0)); if (_e.lengthSq() > 1e-6) r.rotateWorld(B.Head, _q1.setFromAxisAngle(_e.normalize(), 0.5 * up));
    // and never so high that the crown would not pass under a door's rail at a crawl (0.95): tipped further back until it does
    this.head.updateWorldMatrix(true, false); const crown = this.head.localToWorld(_g.set(0, 0.264, 0)).y - this.floorAt(_g.x, _g.z);
    if (crown > 0.9 && _e.lengthSq() > 1e-6) r.rotateWorld(B.Head, _q1.setFromAxisAngle(_e, Math.min(0.6, (crown - 0.9) / 0.35)));
    r.rotateWorld(B.Head, _q1.setFromAxisAngle(want, g.rollNow * up));
  }
  // the crawl's footprint and the crumple's, for the bodies: a circle ahead of the root and one behind it
  lowExtent(mode) {
    const f = this.extra.fore, a = this.extra.aft;
    this.root.updateMatrixWorld(true);
    if (mode === 'crawl' || mode === 'unfold') { this.T(0, 0, 0.95, f.pos); f.r = 0.5; f.h = 1.0; this.T(0, 0, -0.62, a.pos); a.r = 0.42; a.h = 0.75; f.on = a.on = true; }
    else if (mode === 'crumple') { this.T(0, 0, 0.42, f.pos); f.r = 0.55; f.h = 1.3; f.on = true; a.on = false; }
    else if (mode === 'lie') { this.T(0, 0, -0.75, f.pos); f.r = 0.42; f.h = 0.55; this.T(0, 0, 0.45, a.pos); a.r = 0.42; a.h = 0.75; f.on = a.on = true; }
    else f.on = a.on = false;
    f.pos.y = a.pos.y = this.root.position.y;
    // its own body (main.js) stays on the root; low, it is only as tall as the pose
    const tb = this.tb || (this.tb = bodyOf('thing'));
    if (tb) tb.h = mode === 'crawl' || mode === 'unfold' ? 1.0 : mode === 'crumple' ? 1.3 : mode === 'lie' ? 0.75 : 2.66;
  }

  updateLow(dt) {
    const crawl = this.mode === 'crawl', unfold = this.mode === 'unfold';
    let K;
    if (crawl) { this.gaitTick(dt); K = FULL; }
    else if (unfold) {
      // five held keys, each jumped to in the last part of its slot; a key's sound on the frame it lands
      const prevKey = Math.floor(this.unfoldT / UNFOLD_KEY);
      this.unfoldT += dt;
      const kf = this.unfoldT / UNFOLD_KEY, i = Math.min(UNFOLD.length - 1, Math.floor(kf)), u = ramp(kf - i);
      const a = i > 0 ? UNFOLD[i - 1] : ZERO, b = UNFOLD[i];
      K = {}; for (const k in b) K[k] = lerp(a[k], b[k], u);
      const key = Math.floor(this.unfoldT / UNFOLD_KEY);
      for (let n = prevKey + 1; n <= Math.min(key, UNFOLD.length); n++) if (this.onKey) this.onKey(n);
      if (this.unfoldT >= UNFOLD_TIME) { this.mode = 'crawl'; this.snap = 1; this.gaitReset(); }
      if (!this.gait) this.gaitReset();
    } else K = ZERO;
    if (this.shroud) this.shroud.mat.uniforms.uRise.value = crawl ? 0.1 : 0.05;
    this.lowPose(dt, K);
    if (this.cling !== null && this.cling !== undefined) this.hang();
    this.face(dt);
  }
  // the crumple turned over onto the ceiling: the whole low pose turned about the root's own axis and lifted so the knees are under the
  // ceiling as they were on the floor
  hang() {
    const rr = this.rig.root, y0 = this.root.position.y;
    rr.position.y = (this.cling - y0) - rr.position.y; rr.position.x = -rr.position.x;
    rr.rotation.z = Math.PI; rr.updateMatrixWorld(true);
  }
  // the face and the smoke, after any pose: the pupils (creature.js lags them and darts them), the slow blink of something on its feet,
  // and the wisps on the bones wherever the bones went
  face(dt) {
    const standing = this.mode === 'idle' || this.mode === 'walk' || this.mode === 'run';
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blinkK = 0.4; this.blinkT = 18 + Math.random() * 22; }
    let blink = 0; if (this.blinkK > 0) { this.blinkK -= dt; blink = standing && !this.catchPose ? Math.sin(Math.PI * Math.max(0, Math.min(1, 1 - this.blinkK / 0.4))) : 0; }
    // from level 4 one eye now and then falls behind the other for a beat
    this.eyeLagT -= dt; if (this.eyeLagT < -2.5) this.eyeLagT = this.level >= 4 && Math.random() < 0.3 ? 1.2 : -0.0001;
    this.head.update(dt, { target: this.lookTarget, smile: this.catchPose ? 1.6 : this.smileScale, blink, eyeLag: this.eyeLagT > 0 ? 0.1 + 0.1 * hash(this.level) : 0 });
    if (this.shroud) {
      const u = this.shroud.mat.uniforms; u.uSpread.value = 1.25 + this.stun * 1.6; if (this.stun > 0.01) u.uRise.value = 0.16 + this.stun * 0.7;
      this.root.updateMatrixWorld(true); this.shroud.update(dt, this.root.getWorldPosition(_v), { obj: this.head, r: 0.24 });
    }
  }
  // back on its feet (the low modes moved the whole skeleton)
  standUp() { if (!this.rig) return; const rr = this.rig.root; rr.position.set(0, 0, 0); rr.rotation.set(0, 0, 0); if (this.shroud) this.shroud.mat.uniforms.uRise.value = 0.16; this.snap = 0; this.gait = null; this.unfoldT = 0; }

  // how far down it has to come for what hangs over it: a door head (2.03), a fixture, the laundry's ceiling. Sampled along the way it
  // faces, all the way down within 0.7 m of the thing overhead and eased over the 0.5 m either side, so it is low before its crown gets there
  // (and, low, how much room it has to either side: a hall or a doorway brings the crawl's hands and elbows in)
  sideRoom(x, z, y0, nx, nz, lo = 0.1, hi = 1.0, from = 0.35) {
    const cs = this.colliders; if (!cs) return 9;
    for (let d = from; d <= 0.95; d += 0.1) {
      const px = x + nx * d, pz = z + nz * d;
      for (const c of cs) { if (c.on === false || (c.when && !c.when()) || (c.maxY ?? 3) < y0 + lo || (c.minY ?? -0.3) > y0 + hi || (c.dressing && !c.wall)) continue; if (px > c.minX && px < c.maxX && pz > c.minZ && pz < c.maxZ) return d; }
    }
    return 9;
  }
  // on its feet: how close the walls and the furniture are to either side, from the root and a stride ahead, at the height of its
  // hanging arms (they reach 0.75 m out); 1 when there is no room to let them hang
  armRoom() {
    const p = this.root.position, yaw = this.root.rotation.y, fx = Math.sin(yaw), fz = Math.cos(yaw);
    let room = 9;
    for (const s of [0, 0.45, 0.9]) { const x = p.x + fx * s, z = p.z + fz * s; room = Math.min(room, this.sideRoom(x, z, p.y, fz, -fx, 0.5, 2.3, 0.25), this.sideRoom(x, z, p.y, -fz, fx, 0.5, 2.3, 0.25)); }
    return THREE.MathUtils.clamp((0.95 - room) / 0.35, 0, 1);
  }
  autoDuck() {
    const p = this.root.position, yaw = this.root.rotation.y, fx = Math.sin(yaw), fz = Math.cos(yaw), y0 = p.y;
    let need = 0, narrow = 0;
    if (this.mode === 'crawl' || this.mode === 'unfold') for (const s of [1.1, 0.4]) {
      const x = p.x + fx * s, z = p.z + fz * s, room = Math.min(this.sideRoom(x, z, y0, fz, -fx), this.sideRoom(x, z, y0, -fz, fx));
      narrow = Math.max(narrow, THREE.MathUtils.clamp((0.95 - room) / 0.4, 0, 1));
    }
    for (let s = -1.2; s <= 1.21; s += 0.1) {
      const clear = headClear(p.x + fx * s, p.z + fz * s, y0 + 0.5, 0.25) - y0; if (clear > 2.95) continue;
      const w = 1 - ss(0.7, 1.2, Math.abs(s));
      need = Math.max(need, THREE.MathUtils.clamp((2.72 - clear) / 0.7, 0, 1) * w);
      if (clear < 2.3) narrow = Math.max(narrow, w);   // a doorway: the crawl's hands and knees come in, the elbows up instead of out
    }
    this.narrowK = narrow;
    return need;
  }

  updateRig(dt) {
    this.duck = this.duckHold ?? this.autoDuck();
    this.lowExtent(this.catchPose ? 'catch' : this.mode);
    if (this.mode === 'crumple' || this.mode === 'crawl' || this.mode === 'unfold') { this.updateLow(dt); return; }
    if (this.gait || this.rig.root.rotation.x || this.rig.root.rotation.z || this.rig.root.position.y) this.standUp();
    const r = this.rig, rr = r.root, t = this.t, run = this.mode === 'run', walk = this.mode === 'walk';
    if (this.mode === 'lie' || this.mode === 'sit') { this.restPose(dt); this.face(dt); return; }
    // the clip keeps pace with how fast it is actually moving (this.speed is metres per second over 3)
    if (run) r.play('run', { fade: 0.25, speed: 0.8 + this.speed * 0.3 });
    else if (walk && this.sneak && r.actions.sneak) r.play('sneak', { fade: 0.45, speed: 0.5 + this.speed * 0.5 });   // the stalk: its own creeping cycle
    else if (walk) r.play('walk', { fade: 0.45, speed: 0.4 + this.speed * 0.45 });
    else r.play('idle', { fade: 0.5, speed: 0.3 });
    r.update(dt);
    // under a door head: down on bent knees (the feet stay on the floor), bent over, the head lifted back so it still looks ahead
    const dk = this.catchPose ? 1 : this.duck, B = r.bones;
    rr.position.set(0, 0, 0); rr.updateMatrixWorld(true);
    if (dk > 0.001) {
      // where the clip put the feet: they stay there while the hips come down
      const feet = this._feet || (this._feet = { L: new V3(), R: new V3(), qL: new THREE.Quaternion(), qR: new THREE.Quaternion() });
      for (const sd of ['L', 'R']) { B[sd + '_Foot'].getWorldPosition(feet[sd]); B[sd + '_Foot'].getWorldQuaternion(feet['q' + sd]); }
      rr.position.y = -0.42 * dk; rr.updateMatrixWorld(true);
      this.root.updateMatrixWorld(true);
      for (const sd of ['L', 'R']) {
        const ft = B[sd + '_Foot'];
        r.ik2(B[sd + '_Thigh'], B[sd + '_Calf'], ft, feet[sd], this.T((sd === 'L' ? 0.25 : -0.25), 0.9, 1.8, _a));
        r.rotateWorld(ft, _q1.copy(feet['q' + sd]).multiply(ft.getWorldQuaternion(_q2).invert()));   // and turned as the clip had it
      }
      r.bend(['Spine', 'Spine1', 'Spine2'], [0.35, 0.35, 0.3], [1, 0, 0], 1.2 * dk);
      r.bend(['Neck', 'Head'], [0.5, 0.5], [1, 0, 0], -0.45 * dk);
      r.bend(['L_UpperArm', 'R_UpperArm'], [1, -1], [0, 0, 1], -0.12 * dk);
    }
    // posture on top of the clip: stooped when moving, plus the story's lean and head tilt, and a slow sway so it is never quite still
    r.bend(['Spine', 'Spine1', 'Spine2'], [0.2, 0.4, 0.4], [1, 0, 0], this.lean + (run ? 0.12 : walk ? 0.12 : 0) - this.stun * 0.4);
    r.bend(['Spine1'], [1], [0, 0, 1], Math.sin(t * 0.6) * 0.035 + Math.sin(t * 1.7) * 0.012);
    if (this.leanSide) r.bend(['Spine', 'Spine1', 'Spine2', 'Neck'], [0.2, 0.25, 0.35, 0.2], [0, 0, 1], this.leanSide);   // leaning out from behind something
    r.bend(['Neck', 'Head'], [0.4, 0.6], [0, 0, 1], this.tilt + Math.sin(t * 0.7) * 0.05);
    // slow breathing: the chest opens and the shoulders lift a few millimetres
    const br = 0.5 + 0.5 * Math.sin(t * 1.15);
    r.bend(['Spine2'], [1], [1, 0, 0], -0.012 * br);
    r.bend(['L_Clavicle', 'R_Clavicle'], [1, -1], [0, 0, 1], 0.02 * br);
    // arms out toward you
    if (this.reach > 0.01 && !this.catchPose) {
      const dir = r.axisWorld(0, 0.1, 1).normalize();
      for (const s of ['L', 'R']) {
        r.aim(r.bones[s + '_UpperArm'], r.bones[s + '_Forearm'], dir, this.reach);
        r.aim(r.bones[s + '_Forearm'], r.bones[s + '_Hand'], dir, this.reach);
      }
    }
    // room only for its body: the long arms drawn in, the hands held in front of its hips, the elbows back (a hall, a doorway, beside a
    // wardrobe), so nothing of it goes into a wall
    const tuck = this.catchPose || this.reach > 0.2 || this.flinch > 0.3 ? 0 : this.armRoom();
    this.tuckK = tuck;
    if (tuck > 0.01) {
      this.root.updateMatrixWorld(true);
      const B = r.bones, drop = 0.4 * dk;
      r.bend(['L_Clavicle', 'R_Clavicle'], [1, -1], [0, 1, 0], -0.3 * tuck);   // the shoulders drawn in and forward
      for (const sd of ['L', 'R']) { const left = sd === 'L' ? 1 : -1; r.ik2(B[sd + '_UpperArm'], B[sd + '_Forearm'], B[sd + '_Hand'], this.T(left * 0.17, 1.02 - drop, 0.3, _a), this.T(left * 0.4, 1.5 - drop, -0.8, _b), tuck); }
    }
    this.groundFeet(); this.plantToes();
    this.relaxHands(r);
    if (this.post) this.post(r, dt);   // a scene's own pose on top (night one's bedside: an arm reaching a point, the head put somewhere)
    if (this.catchPose) { this.catchFrame(r); this.face(dt); return; }
    r.lookAt(this.lookTarget, dt, { yaw: 1.2, pitch: 0.7, speed: 6 });
    // now and then, while it stands, it cocks its head: quick over, held, eased back. at most once per 11 s, timed from the clock alone so
    // a replay matches (after the look, which would straighten it out); the cock is held 0.4 s longer than a person would hold it
    const n = Math.floor(t / 11), u = t - n * 11 - 3 - 6 * hash(n);
    if (n > 0 && u > 0 && u < 1.3 && this.mode === 'idle' && this.reach < 0.2) {
      const k = (u < 0.08 ? ss(0, 0.08, u) : 1 - ss(0.7, 1.3, u)) * (hash(n + 0.5) < 0.5 ? -1 : 1);
      r.bend(['Head'], [1], [0, 0, 1], 0.08 * k);
      r.bend(['Neck'], [1], [0, 1, 0], 0.03 * k);
    }
    // the light in its face: both hands up over it, the head turned away and down. The flash: thrown back, arms out
    if (this.flinch > 0.01) this.cover(r, this.flinch);
    if (this.stun > 0.01) {
      r.bend(['Neck', 'Head'], [0.4, 0.6], [1, 0, 0], -0.55 * this.stun);
      r.bend(['L_UpperArm', 'R_UpperArm'], [1, -1], [0, 0, 1], 0.5 * this.stun);
    }
    this.face(dt);
  }
  // on the stairs (or anywhere the floor under a foot is higher than under the root) a foot the clip puts down is lifted onto its step,
  // the knee bending forward for it
  groundFeet() {
    const r = this.rig, B = r.bones, y0 = this.root.position.y;
    for (const sd of ['L', 'R']) {
      const ft = B[sd + '_Foot']; if (!ft) continue;
      ft.getWorldPosition(_a); const g = this.floorAt(_a.x, _a.z);
      const toe = B[sd + '_Toe0']; let lift = g + 0.165 - _a.y;
      if (toe) { toe.getWorldPosition(_c); _c.addScaledVector(_d.copy(_c).sub(_a), 0.35); lift = Math.max(lift, this.floorAt(_c.x, _c.z) + 0.035 - _c.y); }   // (the toes over the next step up)
      if (lift <= 0.003 || g - y0 > 0.6) continue;
      _a.y += lift; r.ik2(B[sd + '_Thigh'], B[sd + '_Calf'], ft, _a, this.T(sd === 'L' ? 0.25 : -0.25, 0.9, 1.8, _b));
    }
  }
  // the clip's toes now and then dip a little under the boards at the end of a stride: each foot turned up just enough that the ball
  // of the foot rests on the floor, and an ankle that would go under is lifted the same way
  plantToes() {
    const r = this.rig, B = r.bones;
    this.root.updateMatrixWorld(true);
    for (const sd of ['L', 'R']) {
      const ft = B[sd + '_Foot'], toe = B[sd + '_Toe0']; if (!ft || !toe) continue;
      ft.getWorldPosition(_a); toe.getWorldPosition(_b); _b.addScaledVector(_c.copy(_b).sub(_a), 0.35);   // the toes, past the ball
      const floor = this.floorAt(_b.x, _b.z) + 0.03; if (_b.y >= floor) continue;
      const len = _a.distanceTo(_b); _c.copy(_b).sub(_a).normalize(); _d.crossVectors(_c, _e.set(0, 1, 0)); if (_d.lengthSq() < 1e-8 || len < 1e-4) continue;
      r.rotateWorld(ft, _q1.setFromAxisAngle(_d.normalize(), Math.asin(THREE.MathUtils.clamp((floor - _b.y) / len, 0, 1))));
    }
  }
  cover(r, w) {
    const B = r.bones;
    r.bend(['Neck', 'Head'], [0.4, 0.6], [0, 1, 0], 0.55 * w); r.bend(['Neck', 'Head'], [0.4, 0.6], [1, 0, 0], 0.35 * w);
    this.root.updateMatrixWorld(true); this.head.updateWorldMatrix(true, false);
    for (const sd of ['L', 'R']) {
      const left = sd === 'L' ? 1 : -1;
      this.head.localToWorld(_a.set(left * 0.1, -0.06, 0.22));
      r.ik2(B[sd + '_UpperArm'], B[sd + '_Forearm'], B[sd + '_Hand'], _a, this.T(left * 0.9, 0.9, 0.2, _b), w);
    }
  }
  // the catch, one held frame at a time (main.js caught): 1 its face at the lens 0.6 m off, the mouth wide; 2 both hands at the edges of
  // the frame; 3 the face 0.2 m off, filling it. Its feet stay on the floor: the face comes down by the knees and the back
  catchFrame(r) {
    const c = this.catchPose, cam = c.cam, B = r.bones, dist = c.frame >= 3 ? 0.2 : c.frame === 2 ? 0.42 : 0.6;
    cam.updateMatrixWorld(true);
    const eye = cam.getWorldPosition(_g), fwd = cam.getWorldDirection(_f); fwd.y = 0; fwd.normalize();
    const want = _e.copy(eye).addScaledVector(fwd, dist);
    this.faceTowards(eye.x, eye.z, 1);
    // bend over (or come up straight) until the face is at the lens's height
    for (let i = 0; i < 4; i++) {
      this.root.updateMatrixWorld(true); this.head.getWorldPosition(_a);
      const err = _a.y - want.y; if (Math.abs(err) < 0.01) break;
      r.bend(['Spine', 'Spine1', 'Spine2'], [0.3, 0.35, 0.35], [1, 0, 0], THREE.MathUtils.clamp(err / 1.1, -0.6, 0.9));
    }
    // the face at the lens, cranked over to one side
    this.root.updateMatrixWorld(true); this.head.getWorldPosition(_a);
    for (const [n, share] of [['Neck', 0.4], ['Head', 1]]) {
      this.head.updateWorldMatrix(true, false); this.head.getWorldDirection(_d); this.head.getWorldPosition(_a);
      r.rotateWorld(B[n], _q1.setFromUnitVectors(_d, _b.copy(eye).sub(_a).normalize()).slerp(ID_Q, 1 - share));
    }
    this.head.getWorldDirection(_d); r.rotateWorld(B.Head, _q1.setFromAxisAngle(_d, 0.45));
    // the whole of it moved over the floor so the face is where it belongs
    this.root.updateMatrixWorld(true); this.head.getWorldPosition(_a);
    this.root.position.x += want.x - _a.x; this.root.position.z += want.z - _a.z; this.root.updateMatrixWorld(true);
    if (c.frame >= 2) for (const sd of ['L', 'R']) {
      const left = sd === 'L' ? 1 : -1;
      cam.localToWorld(_a.set(left * 0.25, -0.1, -0.35)); cam.localToWorld(_b.set(left * 0.9, -0.5, -0.1));
      r.ik2(B[sd + '_UpperArm'], B[sd + '_Forearm'], B[sd + '_Hand'], _a, _b);
    }
    this.lookTarget = cam.position;
  }
  // lying on its back (A18: the bottom bunk, knees up under the slats) and sitting (A10: knees under a table, hands flat on it): on top of
  // the idle clip, the rig turned and dropped so the back, or the seat, carries it at the root
  restPose(dt) {
    const r = this.rig, rr = r.root, B = r.bones, pr = this.pelvisRest;
    r.play('idle', { fade: 0, speed: 0.05 }); r.update(dt);
    if (this.mode === 'lie') {
      const a = -Math.PI / 2, c = Math.cos(a), s = Math.sin(a);
      rr.rotation.set(a, 0, 0); rr.position.set(0, 0.13 - (pr.y * c - pr.z * s), -(pr.y * s + pr.z * c)); rr.updateMatrixWorld(true);
      r.bend(['L_Thigh', 'R_Thigh'], [1, 1], [1, 0, 0], -1.3); r.bend(['L_Calf', 'R_Calf'], [1, 1], [1, 0, 0], 2.25);
      r.bend(['Neck', 'Head'], [0.5, 0.5], [1, 0, 0], 0.5);   // the chin down on its chest (the bunk is barely long enough)
      this.relaxHands(r);
    } else {
      // (its shins are longer than a chair is high: the hips sit where the feet are flat on the floor, the thighs over the seat)
      rr.rotation.set(0, 0, 0); rr.position.set(0, 0, 0); rr.updateMatrixWorld(true);
      r.bend(['L_Thigh', 'R_Thigh'], [1, 1], [1, 0, 0], -1.5); r.bend(['L_Calf', 'R_Calf'], [1, 1], [1, 0, 0], 1.5);
      rr.updateMatrixWorld(true); this.local(B.L_Foot, _a);
      rr.position.y = 0.13 - _a.y; rr.updateMatrixWorld(true);
      r.bend(['Spine', 'Spine1', 'Spine2'], [0.35, 0.35, 0.3], [1, 0, 0], 0.25);
      if (this.tableH) for (const sd of ['L', 'R']) {
        const left = sd === 'L' ? 1 : -1;
        r.ik2(B[sd + '_UpperArm'], B[sd + '_Forearm'], B[sd + '_Hand'], this.T(left * 0.3, this.tableH + 0.03, 0.62, _a), this.T(left * 1, 0.6, 0, _b));
        const ax = this.handAxes && this.handAxes[sd]; if (ax) r.orient(B[sd + '_Hand'], ax.along, this.dirW(left * 0.2, 0, 1, _e), ax.palm, _f.set(0, -1, 0));
      } else this.relaxHands(r);
      r.lookAt(this.lookTarget, dt, { yaw: 1.2, pitch: 0.7, speed: 6 });
    }
  }

  update(dt, quality = this.quality) {
    if (!this.root.visible) return;
    if (quality !== this.gfxQuality) { this.gfxQuality = quality; if (this.shroud) this.shroud.setCount(WISPS[quality] ?? WISPS.high); }
    this.setQuality(quality === 'low' ? 'low' : 'high');
    this.t += dt; const t = this.t;
    if (this.rig) { this.updateRig(dt); return; }
    if (!this.head.skull) this.head.addSkull();
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
    al.rotation.x = lerp(-armSwing - (this.mode === 'run' ? 0.35 : 0), reachX, this.reach);
    ar.rotation.x = lerp(armSwing - (this.mode === 'run' ? 0.35 : 0), reachX, this.reach);
    al.rotation.z = lerp(-0.1, 0.05, this.reach);
    ar.rotation.z = lerp(0.1, -0.05, this.reach);
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
    this.head.update(dt, { target: this.lookTarget, smile: this.smileScale });
  }

  headWorld(out = new THREE.Vector3()) { this.root.updateMatrixWorld(true); return this.head.getWorldPosition(out); }
}
