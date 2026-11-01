// the kid's hands at the bottom of the view: two small hands in flannel pajama cuffs, built from capsules and posed in code.
// they live in their own little scene, drawn over the frame after the world with the depth cleared, so they never sink into a wall.
// poses (blended, never snapped): low at the sides, the flashlight held out, the disposable camera raised to the eye (and the thumb
// winding it on), a reach toward what you use, both fists on the blanket edge under the covers, both hands over the mouth while you
// hold your breath. they shake with fear and sway with the walk.
import * as THREE from 'three';

const SKIN = 0xd9a98a, SLEEVE = 0x5a6f8c, CUFF = 0x4b5d77;
const lerp = (a, b, t) => a + (b - a) * t;

function capsule(r, len, mat) { const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), mat); return m; }

// one hand, in its own frame: +y up the fingers when the palm faces -z (the hand held out flat, as if about to push a door)
function makeHand(side, mats) {
  const s = side === 'R' ? 1 : -1, hand = new THREE.Group(), fingers = [];
  // the sleeve and cuff, running back toward the elbow (+z, -y in the hand's frame)
  const arm = new THREE.Group(); hand.add(arm);
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.033, 0.13, 14), mats.sleeve); sleeve.rotation.x = Math.PI / 2; sleeve.position.set(0, -0.012, 0.105); arm.add(sleeve);
  const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.029, 0.006, 8, 18), mats.cuff); cuff.position.set(0, -0.012, 0.042); arm.add(cuff);
  const wrist = capsule(0.022, 0.03, mats.skin); wrist.rotation.x = Math.PI / 2; wrist.position.set(0, -0.01, 0.02); arm.add(wrist);
  // the palm: a flattened rounded block, a child's size (about 6 cm across, 6.5 long)
  const palm = new THREE.Mesh(new THREE.SphereGeometry(0.034, 16, 12), mats.skin); palm.scale.set(0.95, 1.05, 0.48); palm.position.set(0, 0.028, 0); hand.add(palm);
  // four fingers, two joints each; the knuckle row is a gentle arc
  const spec = [[-0.022, 0.034, 0.022], [-0.008, 0.038, 0.026], [0.007, 0.037, 0.024], [0.021, 0.032, 0.019]];
  for (let i = 0; i < 4; i++) {
    const [x, y, len] = spec[i], base = new THREE.Group(); base.position.set(x * s, y + 0.018, 0); hand.add(base);
    const p1 = capsule(0.0068, len * 0.5, mats.skin); p1.position.y = len * 0.32; base.add(p1);
    const mid = new THREE.Group(); mid.position.y = len * 0.62; base.add(mid);
    const p2 = capsule(0.0062, len * 0.42, mats.skin); p2.position.y = len * 0.26; mid.add(p2);
    fingers.push({ base, mid });
  }
  // the thumb comes off the side of the palm, turned in
  const tb = new THREE.Group(); tb.position.set(-0.03 * s, 0.006, -0.006); tb.rotation.set(0, 0, 0.9 * s); hand.add(tb);
  const t1 = capsule(0.0078, 0.016, mats.skin); t1.position.y = 0.014; tb.add(t1);
  const tm = new THREE.Group(); tm.position.y = 0.03; tb.add(tm);
  const t2 = capsule(0.0072, 0.012, mats.skin); t2.position.y = 0.011; tm.add(t2);
  return { hand, fingers, thumb: { base: tb, mid: tm }, side: s };
}

// curl: 0 flat .. 1 a fist; thumbIn: 0 out .. 1 across the palm
function curlHand(h, curl, thumbIn) {
  h.fingers.forEach((f, i) => { const c = curl * (0.92 + i * 0.05); f.base.rotation.x = -c * 1.25; f.mid.rotation.x = -c * 1.45; });
  h.thumb.base.rotation.x = -thumbIn * 0.7; h.thumb.mid.rotation.x = -thumbIn * 0.9;
}

// a pose for one hand: where it sits in the camera's frame, how it is turned, how closed it is
const P = (x, y, z, rx, ry, rz, curl, thumb) => ({ p: new THREE.Vector3(x, y, z), r: new THREE.Euler(rx, ry, rz), curl, thumb });
const POSES = {
  // hands at the sides, just in view at the bottom corners, relaxed
  idle: { R: P(0.2, -0.3, -0.36, -0.9, 0.15, -0.25, 0.45, 0.3), L: P(-0.2, -0.3, -0.36, -0.9, -0.15, 0.25, 0.45, 0.3) },
  // the right hand holds the flashlight out in front, gripped from the side; the left stays down out of sight
  flash: { R: P(0.13, -0.17, -0.3, -0.2, Math.PI / 2, 0.1, 0.9, 0.8), L: P(-0.2, -0.75, -0.36, -0.9, -0.15, 0.25, 0.45, 0.3) },
  // both hands hold the camera by its ends, up in front of the face
  camera: { R: P(0.072, -0.118, -0.262, 0.15, Math.PI / 2, 0, 0.55, 0.4), L: P(-0.072, -0.118, -0.262, 0.15, -Math.PI / 2, 0, 0.55, 0.4) },
  // both fists on the blanket's edge, pulled up under the chin
  covers: { R: P(0.08, -0.17, -0.24, -0.4, 0.3, -0.6, 0.95, 0.85), L: P(-0.08, -0.17, -0.24, -0.4, -0.3, 0.6, 0.95, 0.85) },
  // both hands pressed over the mouth, palms in, one over the other
  breath: { R: P(0.05, -0.135, -0.165, 0.35, Math.PI, Math.PI / 2 - 0.25, 0.3, 0.3), L: P(-0.035, -0.115, -0.15, 0.35, Math.PI, -Math.PI / 2 + 0.3, 0.3, 0.3) },
  // out of view, below the frame (cutscenes, the car, the title)
  hidden: { R: P(0.2, -0.75, -0.36, -0.9, 0.15, -0.25, 0.45, 0.3), L: P(-0.2, -0.75, -0.36, -0.9, -0.15, 0.25, 0.45, 0.3) },
};

export function createHands() {
  const scene = new THREE.Scene();
  const mats = {
    skin: new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.78, metalness: 0 }),
    sleeve: new THREE.MeshStandardMaterial({ color: SLEEVE, roughness: 0.95, metalness: 0, side: THREE.DoubleSide }),
    cuff: new THREE.MeshStandardMaterial({ color: CUFF, roughness: 0.95, metalness: 0 }),
  };
  const rig = new THREE.Group(); rig.matrixAutoUpdate = false; scene.add(rig);   // follows the camera: its matrix is the camera's
  const R = makeHand('R', mats), L = makeHand('L', mats); rig.add(R.hand, L.hand);
  // light of their own: an ambient that follows the house's, a soft key from above, and the flashlight's spill when it is on
  const hemi = new THREE.HemisphereLight(0xcfd8ff, 0x2a2018, 0.5), key = new THREE.DirectionalLight(0xfff0dc, 0.6), spill = new THREE.PointLight(0xfff1d2, 0, 1.2, 2);
  key.position.set(0.3, 1, 0.4); scene.add(hemi, key); rig.add(spill); spill.position.set(0.02, -0.05, -0.3);

  // the flashlight: a black body, a silver head, the lens forward (-z)
  const torch = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.13, 14), new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.5, metalness: 0.4 }));
  body.rotation.x = Math.PI / 2; torch.add(body);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.016, 0.04, 16), new THREE.MeshStandardMaterial({ color: 0x9a9a9e, roughness: 0.3, metalness: 0.8 }));
  head.rotation.x = Math.PI / 2; head.position.z = -0.08; torch.add(head);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.019, 16), new THREE.MeshBasicMaterial({ color: 0xfff6dd, toneMapped: false })); lens.position.z = -0.1005; lens.rotation.y = Math.PI; torch.add(lens);
  rig.add(torch); torch.visible = false;
  // the disposable camera: a yellow cardboard box with a black lens and a winding wheel on top
  const cam = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.062, 0.034), new THREE.MeshStandardMaterial({ color: 0xd8a51f, roughness: 0.85 })); cam.add(box);
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.121, 0.022, 0.035), new THREE.MeshStandardMaterial({ color: 0x1d1d1d, roughness: 0.6 })); band.position.y = -0.012; cam.add(band);
  const cl = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.012, 16), new THREE.MeshStandardMaterial({ color: 0x0b0b0b, roughness: 0.2, metalness: 0.3 })); cl.rotation.x = Math.PI / 2; cl.position.set(0.018, 0, -0.022); cam.add(cl);
  const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.006, 12), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.7 })); wheel.position.set(0.045, 0.034, 0.006); cam.add(wheel);
  cam.position.set(0, -0.055, -0.22); rig.add(cam); cam.visible = false;

  const cur = { R: { p: POSES.hidden.R.p.clone(), q: new THREE.Quaternion().setFromEuler(POSES.hidden.R.r), curl: 0.45, thumb: 0.3 }, L: { p: POSES.hidden.L.p.clone(), q: new THREE.Quaternion().setFromEuler(POSES.hidden.L.r), curl: 0.45, thumb: 0.3 } };
  const qT = new THREE.Quaternion(), shake = new THREE.Vector3(), reachP = new THREE.Vector3(), inv = new THREE.Matrix4(), tmp = new THREE.Vector3();
  let t = 0, reachT = 0, camT = 0, wind = 0, shown = false;

  const api = {
    scene, visible: () => shown,
    get busy() { return camT > 0; },   // the camera is up: shown even while the view is held for the shot
    // a quick reach toward a point in the world (a door, a switch, the TV)
    reach(world, camera) { if (!world || !camera) return; inv.copy(camera.matrixWorld).invert(); reachP.copy(world).applyMatrix4(inv); reachP.clampLength(0, 0.42); if (reachP.z > -0.18) reachP.z = -0.18; reachT = 0.45; },
    // the camera goes up to the eye for a moment, then the thumb winds it on
    snap(hold = 1.6) { camT = hold; wind = 0; },
    // state: { mode, flashOn, holding, fear, walk, bob, cine, hidden }
    update(dt, camera, st) {
      t += dt; rig.matrix.copy(camera.matrixWorld);
      let pose = 'idle';
      if (st.hidden) pose = 'hidden';
      else if (camT > 0) pose = 'camera';
      else if (st.mode === 'hide') pose = st.holding ? 'breath' : st.pod ? 'idle' : 'covers';
      else if (st.flashOn) pose = 'flash';
      else pose = reachT > 0 ? 'hidden' : 'hidden';   // walking with nothing in hand: no hands (a reach brings the right one up)
      camT = Math.max(0, camT - dt); reachT = Math.max(0, reachT - dt);
      const k = 1 - Math.exp(-dt * (pose === 'breath' ? 14 : 9));
      // shake with fear, sway with the walk
      const f = st.fear || 0, w = st.walk || 0;
      for (const side of ['R', 'L']) {
        const target = POSES[pose][side], c = cur[side], h = side === 'R' ? R : L;
        tmp.copy(target.p);
        if (side === 'R' && reachT > 0) { const r = Math.sin(Math.min(1, (0.45 - reachT) / 0.45) * Math.PI); tmp.lerp(reachP, r * 0.85); }
        shake.set(Math.sin(t * 31 + (side === 'R' ? 0 : 2)) * 0.002 + Math.sin(t * 13.7) * 0.0012, Math.sin(t * 27.3 + 1) * 0.002, 0).multiplyScalar(f * 1.6);
        tmp.add(shake); tmp.y += Math.sin((st.bob || 0) + (side === 'R' ? 0 : Math.PI)) * 0.012 * w + Math.sin(t * 1.3) * 0.003; tmp.x += Math.cos((st.bob || 0) * 0.5) * 0.006 * w;
        c.p.lerp(tmp, k); qT.setFromEuler(target.r); c.q.slerp(qT, k);
        c.curl = lerp(c.curl, target.curl, k); c.thumb = lerp(c.thumb, target.thumb, k);
        h.hand.position.copy(c.p); h.hand.quaternion.copy(c.q); curlHand(h, c.curl, c.thumb);
      }
      // the camera rides in the hands; after the flash the right thumb winds it on (two flicks)
      cam.visible = pose === 'camera' || camT > 0;
      if (cam.visible) { cam.position.lerpVectors(cam.position, tmp.set(0, -0.055, -0.22), k); if (camT < 1.0) { wind += dt; wheel.rotation.y = -wind * 9; R.thumb.base.rotation.z = 0.9 + Math.max(0, Math.sin(wind * 9)) * 0.5; } }
      torch.visible = pose === 'flash' && cur.R.p.y > -0.4;
      if (torch.visible) { torch.position.copy(cur.R.p).add(tmp.set(-0.012, 0.018, -0.045)); torch.rotation.set(0.04, 0, 0); }
      spill.intensity = st.flashOn && !st.hidden ? 0.35 : 0;
      // the house's own light level reaches the hands: dark at night, bluish
      hemi.intensity = st.ambient ?? 0.5; key.intensity = (st.ambient ?? 0.5) * 1.1;
      hemi.color.setHex(st.night ? 0x7f93c8 : 0xfff2e0);
      shown = !st.hidden && (R.hand.position.y > -0.6 || L.hand.position.y > -0.6);
      rig.updateMatrixWorld(true);
    },
    // where the flashlight's beam starts, in the camera's frame (the lens of the torch in the right hand)
    lens(out) { return out.set(0, 0, -0.1).applyMatrix4(torch.matrix); },
  };
  return api;
}
