// the kid's hands at the bottom of the view. The arms are a rigged model (assets/props/fp_arms.glb, finger bones and all) set at a nine-year-old's
// size and posed in code every frame. Every grip is built around the thing held: the hand is placed against the object (palm on its surface,
// turned the way a real hand takes it), the wrist goes there by two-bone ik from the shoulder with the elbow kept low and tucked, the forearm
// rolls to carry most of the turn, the wrist bend is limited to what a wrist does, and each finger closes only until it touches the object's
// surface. Until the model is in, a capsule stand-in does the same poses.
// they live in their own little scene, drawn over the frame after the world with the depth cleared, so they never sink into a wall, and they
// are lit by the room's own lights (the nearest lamps the eye can see, the sky light, the sun when you are outside) and the flashlight's bounce.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { loadProp } from './props.js';
import { plaid } from './textures.js';

const SKIN = 0xd9a98a, SLEEVE = 0x4f6584, CUFF = 0x3f5170;
const lerp = (a, b, t) => a + (b - a) * t;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const PALM = 0.011, FINGER = 0.0072;   // bone centre to palm skin, and a finger's radius, at the kid's size
const NIGHT_K = 0.55, NIGHT_TINT = new THREE.Color(0.62, 0.82, 1.15);   // the night grade's darkening and cool cast on dim light
const MAX_WRIST = 1.0, MAX_ROLL = 1.6, MAX_CURL = 1.35;   // wrist bend, forearm roll and finger close (rad), within a child's range

function capsule(r, len, mat) { return new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), mat); }

// the stand-in: one hand in its own frame, +y up the fingers when the palm faces -z
function makeHand(side, mats) {
  const s = side === 'R' ? 1 : -1, hand = new THREE.Group(), fingers = [];
  const arm = new THREE.Group(); hand.add(arm);
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.026, 0.13, 14), mats.sleeve); sleeve.rotation.x = Math.PI / 2; sleeve.position.set(0, -0.01, 0.09); arm.add(sleeve);
  const wrist = capsule(0.016, 0.02, mats.skin); wrist.rotation.x = Math.PI / 2; wrist.position.set(0, -0.008, 0.015); arm.add(wrist);
  const palm = new THREE.Mesh(new THREE.SphereGeometry(0.025, 16, 12), mats.skin); palm.scale.set(0.95, 1.05, 0.48); palm.position.set(0, 0.02, 0); hand.add(palm);
  const spec = [[-0.016, 0.025, 0.016], [-0.006, 0.028, 0.019], [0.005, 0.027, 0.018], [0.015, 0.024, 0.014]];
  for (let i = 0; i < 4; i++) {
    const [x, y, len] = spec[i], base = new THREE.Group(); base.position.set(x * s, y + 0.013, 0); hand.add(base);
    const p1 = capsule(0.005, len * 0.5, mats.skin); p1.position.y = len * 0.32; base.add(p1);
    const mid = new THREE.Group(); mid.position.y = len * 0.62; base.add(mid);
    const p2 = capsule(0.0045, len * 0.42, mats.skin); p2.position.y = len * 0.26; mid.add(p2);
    fingers.push({ base, mid });
  }
  return { hand, fingers };
}
function curlHand(h, curl) { h.fingers.forEach((f, i) => { const c = curl * (0.92 + i * 0.05); f.base.rotation.x = -c * 1.25; f.mid.rotation.x = -c * 1.45; }); }

// a hand's frame in the camera's space from where its fingers point (F, wrist to the middle knuckle) and where its palm faces (pn). The model's
// hand frame is +y up the fingers and +x from the index toward the pinky on the right hand (the other way on the left).
const _m = new THREE.Matrix4();
function handQ(side, F, pn, out = new THREE.Quaternion()) {
  const f = F.clone().normalize(), n = pn.clone().addScaledVector(f, -pn.dot(f)).normalize();
  const sd = side === 'R' ? f.clone().cross(n) : n.clone().cross(f);   // pinky to index across the knuckles
  const x = side === 'R' ? sd.clone().negate() : sd, z = x.clone().cross(f);
  return out.setFromRotationMatrix(_m.makeBasis(x, f, z));
}
const sdOf = (side, q) => V(side === 'R' ? -1 : 1, 0, 0).applyQuaternion(q);
const fOf = (q) => V(0, 1, 0).applyQuaternion(q);
const pnOf = (side, q) => { const f = fOf(q), s = sdOf(side, q); return side === 'R' ? s.cross(f) : f.cross(s); };

// the held things, each with a signed distance to its surface in its own frame (for the fingers to close onto)
const sdCapsule = (p, a, b, r) => { const ab = b.clone().sub(a), t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1); return p.distanceTo(a.clone().addScaledVector(ab, t)) - r; };
const sdRoundBox = (p, h, r) => { const q = V(Math.abs(p.x) - h.x + r, Math.abs(p.y) - h.y + r, Math.abs(p.z) - h.z + r); return V(Math.max(q.x, 0), Math.max(q.y, 0), Math.max(q.z, 0)).length() + Math.min(Math.max(q.x, q.y, q.z), 0) - r; };

// the disposable camera: a black plastic body in a printed cardboard wrap, the lens, the flash window and its slider, the viewfinder, the
// shutter button and the ridged winding wheel on top at the back. +x right, +y up, the lens toward -z (away from you)
const CAM_H = V(0.056, 0.029, 0.017);
function makeCamera() {
  const g = new THREE.Group();
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d');
  x.fillStyle = '#e8b82a'; x.fillRect(0, 0, 256, 128);
  x.fillStyle = '#b8261d'; x.fillRect(0, 84, 256, 18); x.fillStyle = '#1b1b1b'; x.fillRect(0, 104, 256, 8);
  x.fillStyle = '#1b1b1b'; x.font = 'bold 34px sans-serif'; x.fillText('FLASH', 18, 50); x.font = 'bold 20px sans-serif'; x.fillText('27 EXP', 168, 46);
  x.fillStyle = '#fff6d8'; x.font = 'bold 14px sans-serif'; x.fillText('ISO 400  SINGLE USE', 20, 98);
  const wrapTex = new THREE.CanvasTexture(c); wrapTex.colorSpace = THREE.SRGBColorSpace;
  const plastic = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.55, metalness: 0.05 });
  const wrap = new THREE.MeshStandardMaterial({ map: wrapTex, roughness: 0.85 });
  const body = new THREE.Mesh(new RoundedBoxGeometry(CAM_H.x * 2, CAM_H.y * 2, CAM_H.z * 2, 3, 0.006), plastic); g.add(body);
  for (const z of [-0.0175, 0.0175]) {   // the cardboard wrap, front and back, leaving the plastic ends bare; each face looks outward
    const w = new THREE.Mesh(new THREE.PlaneGeometry(0.084, 0.05), wrap); w.position.set(-0.004, -0.001, z); w.rotation.y = z < 0 ? Math.PI : 0; g.add(w);
  }
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.012, 20), plastic); barrel.rotation.x = Math.PI / 2; barrel.position.set(0.012, -0.004, -0.022); g.add(barrel);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.009, 20), new THREE.MeshStandardMaterial({ color: 0x0c0f14, roughness: 0.05, metalness: 0.6 })); glass.position.set(0.012, -0.004, -0.0285); glass.rotation.y = Math.PI; g.add(glass);
  const flashWin = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.014), new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.2, emissive: 0xffffff, emissiveIntensity: 0 })); flashWin.position.set(-0.034, 0.016, -0.0177); flashWin.rotation.y = Math.PI; g.add(flashWin);
  const slider = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.006, 0.003), new THREE.MeshStandardMaterial({ color: 0xc8c8c8, roughness: 0.4 })); slider.position.set(-0.034, 0.004, -0.0185); g.add(slider);
  const vf = new THREE.Mesh(new THREE.PlaneGeometry(0.012, 0.009), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.1 })); vf.position.set(0.04, 0.017, 0.0177); g.add(vf);
  const vfF = vf.clone(); vfF.position.z = -0.0177; vfF.rotation.y = Math.PI; g.add(vfF);
  const button = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.004, 12), new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.6 })); button.position.set(0.036, 0.031, -0.004); g.add(button);
  const wheelGeo = new THREE.CylinderGeometry(0.009, 0.009, 0.006, 18); const wheel = new THREE.Mesh(wheelGeo, new THREE.MeshStandardMaterial({ color: 0x232323, roughness: 0.75 }));
  wheel.position.set(0.04, 0.03, 0.01); g.add(wheel);
  for (let i = 0; i < 12; i++) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.0016, 0.0062, 0.0022), wheel.material); const a = (i / 12) * Math.PI * 2; r.position.set(Math.cos(a) * 0.0092, 0, Math.sin(a) * 0.0092); r.rotation.y = -a; wheel.add(r); }
  g.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  g.userData.sdf = (p) => sdRoundBox(p, CAM_H, 0.006);
  return { group: g, wheel, button, flashWin };
}

// the viewfinder: what you see through the camera at the eye (soft dark edges, the frame lines and a little focus circle) over the scene above
// the camera body, which fills the bottom of the view
function makeViewfinder() {
  if (typeof document === 'undefined') return null;
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:6;opacity:0;transition:none;'
    + 'background:radial-gradient(ellipse 70% 60% at 50% 36%, rgba(0,0,0,0) 62%, rgba(0,0,0,0.55) 100%);';
  const frame = document.createElement('div');
  frame.style.cssText = 'position:absolute;left:21%;right:21%;top:8%;bottom:40%;border:2px solid rgba(255,250,235,0.6);border-radius:6px;';
  const cross = document.createElement('div');
  cross.style.cssText = 'position:absolute;left:50%;top:34%;width:22px;height:22px;margin:-11px 0 0 -11px;border:1px solid rgba(255,250,235,0.6);border-radius:50%;';
  el.append(frame, cross); document.body.appendChild(el);
  return el;
}

// ---- the grips, each as a real nine-year-old holds the thing (frames in the held object's own space unless said) ----
// the flashlight, a power grip: the forearm comes forward from the right hip, thumb side up; the barrel lies across the closed fingers on a
// slant (the lens out of the thumb side), the four fingers wrap under and round it, the thumb lies along the top by the switch, the wrist
// near straight with a little ulnar tilt. it is held low and forward at hip-to-chest height and points where you look, a beat behind the turn.
const TORCH = { at: V(0.115, -0.218, -0.28), grip: V(0, 0, 0.022), r: 0.0145, F: V(-0.05, -0.47, -0.88), pn: V(-1, 0.1, 0), pole: V(0.75, -1, 0.55) };
// the camera raised to the eye to take a picture, held by both ends the way a child holds a little camera up to look through it: each palm
// flat on an end, the fingers pointing up and curled over the top front edge (so the right index rests on the shutter button), the thumbs
// on the back by the corners (the right one by the winding wheel), forearms near upright and the elbows tucked in. From the eye you see
// the camera's back and top edge at the bottom of the view, the thumbs on it and the hands at its ends; the viewfinder frames the scene
// above it.
const CAM_UP = { at: V(0, -0.092, -0.165), rx: 0.05 };
const CAMGRIP = {
  R: { grip: V(CAM_H.x, -0.012, 0.002), r: 0, F: V(0, 1, -0.35), pn: V(-1, 0, 0), pole: V(0.55, -1, 0.25) },
  L: { grip: V(-CAM_H.x, -0.012, 0.002), r: 0, F: V(0, 1, -0.35), pn: V(1, 0, 0), pole: V(-0.55, -1, 0.25) },
};
// the camera at rest: carried loosely in the left hand against the tummy, the palm under it and the fingers beneath, the thumb up its
// outer end; low on the left, so only its corner shows
const CAM_LOW = { at: V(-0.2, -0.212, -0.27), rx: 0.5, ry: 0.5, rz: 0.15 };
const CAMLOWGRIP = { grip: V(-0.028, -CAM_H.y, 0.002), r: 0, F: V(0.35, 0.1, -1), pn: V(0, 1, 0), pole: V(-0.55, -1, 0.25) };
// the blanket's edge under the covers: both fists hold a fold of it at the bottom of the view, knuckles up, palms down over the roll
const FOLD = { at: V(0, -0.25, -0.29), r: 0.022, R: { grip: V(0.075, 0, 0), r: 0.022, F: V(-0.15, -0.25, -1), pn: V(0, -1, 0.15), pole: V(0.55, -1, 0.35) }, L: { grip: V(-0.075, 0, 0), r: 0.022, F: V(0.15, -0.25, -1), pn: V(0, -1, 0.15), pole: V(-0.55, -1, 0.35) } };
// free poses, in the camera's space: wrist, fingers' direction, palm direction, finger close, thumb, elbow pole
const FREE = {
  // out of sight below the view
  hidR: { at: V(0.19, -0.52, -0.24), F: V(0, 0.3, -1), pn: V(-1, 0, 0), curl: 0.35, thumb: 0.2, pole: V(0.6, -1, 0.3) },
  hidL: { at: V(-0.19, -0.52, -0.24), F: V(0, 0.3, -1), pn: V(1, 0, 0), curl: 0.35, thumb: 0.2, pole: V(-0.6, -1, 0.3) },
  // one hand pressed flat over the mouth: palm to the lips, fingers up and slanted across, the wrist under the chin; only the finger tips and
  // the edge of the palm come into the bottom of the view
  breath: { at: V(0.025, -0.175, -0.13), F: V(-0.42, 1, -0.05), pn: V(0.05, 0.12, 1), curl: 0.06, thumb: 0.05, pole: V(0.55, -1, 0.2) },
  // hiding in the closet or the shower: hands low and still at the edge of the view, half closed
  stillR: { at: V(0.12, -0.25, -0.25), F: V(-0.25, 0.45, -1), pn: V(-0.6, -0.4, 0), curl: 0.42, thumb: 0.3, pole: V(0.6, -1, 0.35) },
  stillL: { at: V(-0.12, -0.25, -0.25), F: V(0.25, 0.45, -1), pn: V(0.6, -0.4, 0), curl: 0.42, thumb: 0.3, pole: V(-0.6, -1, 0.35) },
};

export function createHands() {
  const scene = new THREE.Scene();
  const mats = {
    skin: new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.78, metalness: 0 }),
    sleeve: new THREE.MeshStandardMaterial({ color: SLEEVE, roughness: 0.95, metalness: 0, side: THREE.DoubleSide }),
    cuff: new THREE.MeshStandardMaterial({ color: CUFF, roughness: 0.95, metalness: 0 }),
  };
  // flannel for the sleeves: a soft plaid drawn once
  {
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    x.fillStyle = '#4b5f7e'; x.fillRect(0, 0, 64, 64); x.fillStyle = 'rgba(28,36,56,0.55)'; x.fillRect(0, 20, 64, 10); x.fillRect(20, 0, 10, 64);
    x.fillStyle = 'rgba(190,160,120,0.35)'; x.fillRect(0, 44, 64, 2); x.fillRect(44, 0, 2, 64);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 3); t.colorSpace = THREE.SRGBColorSpace;
    mats.sleeve.map = t; mats.sleeve.color.set(0xffffff); mats.sleeve.needsUpdate = true;
  }
  const rig = new THREE.Group(); rig.matrixAutoUpdate = false; scene.add(rig);   // follows the camera: its matrix is the camera's
  const R = makeHand('R', mats), L = makeHand('L', mats); rig.add(R.hand, L.hand);

  // the room's light, mirrored: the sky light, the sun (outside only) and the few nearest lamps you can see; the flashlight's bounce off what
  // it lights comes back as a soft light just ahead of the hands
  const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 0), sun = new THREE.DirectionalLight(0xffffff, 0);
  scene.add(hemi, sun, sun.target);
  const pool = []; for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xffffff, 0, 0, 2); scene.add(l); pool.push(l); }
  const spill = new THREE.PointLight(0xfff1d2, 0, 1.4, 2); rig.add(spill); spill.position.set(0.02, -0.12, -0.6);
  let worldLights = [], lightsAge = 99;
  const lp = new THREE.Vector3(), cp = new THREE.Vector3(), ld = new THREE.Vector3();
  function mirrorLights(world, camera, st) {
    if (!world) return;
    // the picture's night grade darkens and cools the dark tones; the hands are drawn after it, so their room light takes the same turn
    const nk = st.night ? NIGHT_K : 1;
    scene.environment = world.environment || null; scene.environmentIntensity = (world.environmentIntensity ?? 1) * nk;
    if ((lightsAge += 1) > 90) { lightsAge = 0; worldLights = []; world.traverse((o) => { if (o.isLight) worldLights.push(o); }); }
    camera.getWorldPosition(cp);
    let h = null, s = null; const near = [];
    for (const l of worldLights) {
      if (!l.visible || !(l.intensity > 0)) continue;
      let vis = true; for (let p = l.parent; p; p = p.parent) if (!p.visible) { vis = false; break; }
      if (!vis) continue;
      if (l.isHemisphereLight) { if (!h || l.intensity > h.intensity) h = l; continue; }
      if (l.isDirectionalLight) { if (!s || l.intensity > s.intensity) s = l; continue; }
      if (!l.isPointLight && !l.isSpotLight) continue;
      l.getWorldPosition(lp); const d = lp.distanceTo(cp);
      if (d < 0.6) continue;   // the flashlight itself, at the eye
      if (l.distance > 0 && d > l.distance) continue;
      if (st.blocked && st.blocked(cp.x, cp.z, lp.x, lp.z)) continue;   // another room's lamp, behind a wall
      if (l.isSpotLight) { l.target.getWorldPosition(ld); ld.sub(lp).normalize(); const c = cp.clone().sub(lp).normalize().dot(ld); if (c < Math.cos(l.angle)) continue; }
      near.push({ l, d, score: l.intensity / (d * d + 0.5) });
    }
    near.sort((a, b) => b.score - a.score);
    hemi.intensity = h ? h.intensity * nk : 0; if (h) { hemi.color.copy(h.color); hemi.groundColor.copy(h.groundColor); if (st.night) { hemi.color.multiply(NIGHT_TINT); hemi.groundColor.multiply(NIGHT_TINT); } }
    sun.intensity = s && st.outdoors ? s.intensity : 0;
    if (s) { s.getWorldPosition(lp); s.target.getWorldPosition(ld); sun.position.copy(cp).add(lp.sub(ld).normalize()); sun.target.position.copy(cp); sun.color.copy(s.color); sun.target.updateMatrixWorld(); }
    pool.forEach((p, i) => {
      const n = near[i]; if (!n) { p.intensity = 0; return; }
      n.l.getWorldPosition(p.position); p.color.copy(n.l.color); if (st.night) p.color.multiply(NIGHT_TINT); p.intensity = n.l.intensity * (st.night ? 0.8 : 1); p.distance = n.l.distance; p.decay = n.l.decay;
    });
  }

  // the flashlight: a black body, a silver head, the lens forward (-z); the grip is on the body behind the head
  const torch = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.0145, 0.0145, 0.13, 16), new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.5, metalness: 0.4 }));
  body.rotation.x = Math.PI / 2; torch.add(body);
  const sw = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.004, 0.012), new THREE.MeshStandardMaterial({ color: 0x5a5a5e, roughness: 0.5 })); sw.position.set(0, 0.015, -0.03); torch.add(sw);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.0155, 0.04, 18), new THREE.MeshStandardMaterial({ color: 0x9a9a9e, roughness: 0.3, metalness: 0.8 }));
  head.rotation.x = Math.PI / 2; head.position.z = -0.085; torch.add(head);
  const lensM = new THREE.Mesh(new THREE.CircleGeometry(0.018, 18), new THREE.MeshBasicMaterial({ color: 0xfff6dd, toneMapped: false })); lensM.position.z = -0.1055; lensM.rotation.y = Math.PI; torch.add(lensM);
  torch.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  torch.userData.sdf = (p) => Math.min(sdCapsule(p, V(0, 0, -0.06), V(0, 0, 0.065), 0.0145), sdCapsule(p, V(0, 0, -0.1), V(0, 0, -0.07), 0.02));
  rig.add(torch); torch.visible = false;
  const camera3 = makeCamera(), cam = camera3.group; rig.add(cam); cam.visible = false;
  // a fold of the comforter for the fists under the covers
  const fold = new THREE.Mesh(new THREE.CapsuleGeometry(FOLD.r, 0.5, 6, 14), new THREE.MeshStandardMaterial({ map: plaid(), roughness: 1 }));
  fold.rotation.z = Math.PI / 2; const foldG = new THREE.Group(); foldG.add(fold); rig.add(foldG); foldG.visible = false; fold.frustumCulled = false;
  foldG.userData.sdf = (p) => sdCapsule(p, V(-0.3, 0, 0), V(0.3, 0, 0), FOLD.r);
  const vfEl = makeViewfinder();

  // ---- the rigged arms ----
  const arms = { ready: false, root: null, side: {} };
  const FOREARM = 0.17, KS = FOREARM / 0.235;   // a nine-year-old's forearm, elbow to wrist
  loadProp('fp_arms').then((g) => {
    const root = new THREE.Group(); root.rotation.y = Math.PI;   // the model looks down +z; the camera looks down -z
    const model = g.scene; root.add(model); rig.add(root);
    const B = {}; model.traverse((o) => { if (o.isBone) B[o.name.replace(/_\d+$/, '')] = o; if (o.isMesh) { o.frustumCulled = false; o.castShadow = o.receiveShadow = false; } });
    if (!B.hand_r || !B.lowerarm_r || !B.upperarm_r) return;
    model.updateMatrixWorld(true);
    const w = (b) => b.getWorldPosition(new THREE.Vector3());
    const s = FOREARM / w(B.lowerarm_r).distanceTo(w(B.hand_r)); model.scale.setScalar(s);
    // the shoulders: low and a little behind the eye
    root.position.set(0, -0.25, 0.05); root.updateMatrixWorld(true);
    const rest = new Map(); model.traverse((o) => { if (o.isBone) rest.set(o, o.quaternion.clone()); });
    arms.rest = rest; arms.root = root; arms.model = model;
    for (const [side, k] of [['R', 'r'], ['L', 'l']]) {
      const f = (n) => [1, 2, 3].map((i) => B[`${n}_0${i}_${k}`]).filter(Boolean);
      const A = arms.side[side] = { up: B[`upperarm_${k}`], lo: B[`lowerarm_${k}`], hand: B[`hand_${k}`], index: f('index'), middle: f('middle'), ring: f('ring'), pinky: f('pinky'), thumb: f('thumb') };
      A.a = w(A.up).distanceTo(w(A.lo)); A.b = w(A.lo).distanceTo(w(A.hand));
      // the palm's centre from the wrist, in the hand's own frame (fingers, across, out of the back)
      const H = w(A.hand), Fh = w(A.middle[0]).sub(H).normalize(), Sd = w(A.index[0]).sub(w(A.pinky[0])); Sd.addScaledVector(Fh, -Sd.dot(Fh)).normalize();
      const N = Fh.clone().cross(Sd), pc = H.clone().lerp(w(A.index[0]).add(w(A.pinky[0])).multiplyScalar(0.5), 0.55).sub(H);
      A.palm = [pc.dot(Fh), pc.dot(Sd), pc.dot(N)];
      // pajama sleeves over the upper arm and the forearm, right down to the wrist, with a turned cuff
      const sleeve = (from, to, r0, r1, cut) => {
        const p0 = w(from), p1 = w(to), len = p0.distanceTo(p1) * cut, geo = new THREE.CylinderGeometry(r1, r0, len, 16, 1, true); geo.translate(0, len / 2, 0);
        const m = new THREE.Mesh(geo, mats.sleeve); m.frustumCulled = false; scene.add(m); m.position.copy(p0);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p1.clone().sub(p0).normalize()); from.attach(m);
        return m;
      };
      sleeve(A.up, A.lo, 0.06 * KS, 0.054 * KS, 1.04); sleeve(A.lo, A.hand, 0.052 * KS, 0.042 * KS, 0.97);
      const cuffM = new THREE.Mesh(new THREE.TorusGeometry(0.042 * KS, 0.007 * KS, 8, 18), mats.cuff); cuffM.frustumCulled = false; scene.add(cuffM);
      const p0 = w(A.lo), p1 = w(A.hand), at = p0.clone().lerp(p1, 0.96); cuffM.position.copy(at); cuffM.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), p1.clone().sub(p0).normalize()); A.lo.attach(cuffM);
    }
    // the model's skin, warmed to the kid's
    model.traverse((o) => { if (o.isMesh && o.material && o.material.color) { o.material.color.multiply(new THREE.Color(1.0, 0.93, 0.86)); o.material.roughness = 0.75; o.material.metalness = 0; } });
    arms.ready = true; R.hand.visible = L.hand.visible = false;
  }).catch(() => { /* the stand-in stays */ });

  // ---- posing, in world space (the rig's matrix is the camera's) ----
  const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3(), qA = new THREE.Quaternion(), qB = new THREE.Quaternion(), mA = new THREE.Matrix4(), mB = new THREE.Matrix4();
  const wpos = (o, out = new THREE.Vector3()) => o.getWorldPosition(out);
  function setWorldQ(bone, q) { bone.parent.getWorldQuaternion(qB).invert(); bone.quaternion.copy(qB.multiply(q)); bone.updateMatrixWorld(true); }
  function aim(bone, child, target) {
    bone.updateWorldMatrix(true, true); wpos(bone, vA); wpos(child, vB);
    const from = vB.sub(vA).normalize(), to = vC.copy(target).sub(vA).normalize();
    qA.setFromUnitVectors(from, to); bone.getWorldQuaternion(qB); setWorldQ(bone, qA.multiply(qB));
  }
  function rotWorld(bone, axis, ang) { bone.getWorldQuaternion(qB); qA.setFromAxisAngle(axis, ang); setWorldQ(bone, qA.multiply(qB)); }
  // the hand's frame as the bones have it now: fingers' direction and the palm's normal, in the world
  function handFrame(side, A) {
    const H = wpos(A.hand), F = wpos(A.middle[0]).sub(H).normalize(), Sd = wpos(A.index[0]).sub(wpos(A.pinky[0])); Sd.addScaledVector(F, -Sd.dot(F)).normalize();
    const pn = side === 'R' ? Sd.clone().cross(F) : F.clone().cross(Sd);
    return { H, F, Sd, pn };
  }
  // the wrist for a palm centred on G (world) with the hand turned to q (world)
  function wristFor(side, A, G, q, gap) {
    const F = fOf(q), Sd = sdOf(side, q), N = F.clone().cross(Sd), pn = pnOf(side, q);
    return G.clone().addScaledVector(pn, -(PALM + gap)).addScaledVector(F, -A.palm[0]).addScaledVector(Sd, -A.palm[1]).addScaledVector(N, -A.palm[2]);
  }
  // close one finger (three bones) by k, each joint turning toward the palm
  const PER = [1.05, 1.25, 0.95];
  function curlChain(bones, k, palmN, Fh, thumb) {
    bones.forEach((b, i) => {
      b.updateWorldMatrix(true, true); const nb = bones[i + 1];
      const bf = nb ? wpos(nb).sub(wpos(b, vA)).normalize() : (bones[i - 1] ? wpos(b).sub(wpos(bones[i - 1], vA)).normalize() : Fh);
      const ax = new THREE.Vector3().crossVectors(bf, palmN); if (ax.lengthSq() < 0.05) return; ax.normalize();
      rotWorld(b, ax, k * (thumb ? (i === 0 ? 0.45 : 0.62) : PER[i]));
    });
  }
  const tipOf = (bones) => { const a = wpos(bones[bones.length - 2]), b = wpos(bones[bones.length - 1]); return b.clone().add(b.clone().sub(a).multiplyScalar(0.85)); };
  // how far the finger is from the held thing's surface (its joints and its tip), less the finger's own thickness
  function gap(bones, obj) {
    const inv = obj.userData.inv, d = (p) => obj.userData.sdf(p.applyMatrix4(inv));
    let m = d(wpos(bones[1])) - FINGER + 0.003;
    if (bones[2]) m = Math.min(m, d(wpos(bones[2])) - FINGER);
    return Math.min(m, d(tipOf(bones)) - FINGER * 0.8);
  }
  // close a finger round the held thing: as far as it goes until it touches, never past MAX_CURL, never bent backwards
  function gripChain(bones, obj, palmN, Fh, thumb, want) {
    const restQ = bones.map((b) => arms.rest.get(b));
    const set = (k) => { bones.forEach((b, i) => b.quaternion.copy(restQ[i])); bones[0].updateMatrixWorld(true); curlChain(bones, k, palmN, Fh, thumb); };
    if (!obj) { bones.__obj = null; set(THREE.MathUtils.clamp(want, 0, MAX_CURL)); return null; }
    // a grip holds still against its object, so the touch is found again only every few frames
    if (bones.__obj === obj && bones.__age++ < 8) { set(bones.__k); return bones.__gap; }
    const top = thumb ? 1.1 : MAX_CURL, k0 = thumb ? -0.35 : 0; let lo = k0, hi = top, hit = false;
    for (let k = k0; k <= top + 1e-6; k += 0.1) { set(k); if (gap(bones, obj) < 0) { hi = k; hit = true; break; } lo = k; }
    let k = Math.min(want, top);
    if (hit) { for (let i = 0; i < 4; i++) { const m = (lo + hi) / 2; set(m); if (gap(bones, obj) < 0) hi = m; else lo = m; } k = lo; }
    set(k); bones.__obj = obj; bones.__age = 0; bones.__k = k; bones.__gap = debug ? gap(bones, obj) : 0;
    return bones.__gap;
  }

  // how each grip came out (finger gaps to the held thing's surface, wrist bend, reach): for checking the poses, off in play
  const report = {}; const debug = typeof window !== 'undefined' && !!window.__handsDebug;
  // one arm to its target: t = { p (wrist, camera space), q (hand, camera space), curl, thumb, idx, pole, obj }
  function poseArm(side, t, camQ) {
    const A = arms.side[side]; if (!A) return;
    const W = t.p.clone().applyMatrix4(rig.matrix), qT = camQ.clone().multiply(t.q);
    A.up.updateWorldMatrix(true, false); const S = wpos(A.up);
    const toW = W.clone().sub(S), dist = toW.length(), dir = toW.clone().normalize();
    const d = Math.min(Math.max(dist, Math.abs(A.a - A.b) + 1e-4), A.a + A.b - 1e-4);
    const x = (d * d + A.a * A.a - A.b * A.b) / (2 * d), y = Math.sqrt(Math.max(0, A.a * A.a - x * x));
    const pole = t.pole.clone().normalize().applyQuaternion(camQ); pole.addScaledVector(dir, -pole.dot(dir)).normalize();
    const E = S.clone().addScaledVector(dir, x).addScaledVector(pole, y), Wr = S.clone().addScaledVector(dir, d);
    aim(A.up, A.lo, E); aim(A.lo, A.hand, Wr);
    // the forearm rolls (pronation / supination) to carry most of the hand's turn, so the wrist itself only bends
    const ax = wpos(A.hand).sub(wpos(A.lo)).normalize();
    const now = handFrame(side, A).pn, want = pnOf(side, qT);
    const a = now.addScaledVector(ax, -now.dot(ax)).normalize(), b = want.addScaledVector(ax, -want.dot(ax)).normalize();
    const roll = THREE.MathUtils.clamp(Math.atan2(ax.dot(a.clone().cross(b)), a.dot(b)) * 0.85, -MAX_ROLL, MAX_ROLL);
    rotWorld(A.lo, ax, roll); A.hand.updateWorldMatrix(true, true);
    // the hand to the pose's frame, the wrist's bend limited
    const cur = handFrame(side, A), N = cur.F.clone().cross(cur.Sd);
    const Ft = fOf(qT), St = sdOf(side, qT), Nt = Ft.clone().cross(St);
    mA.makeBasis(cur.F, cur.Sd, N); mB.makeBasis(Ft, St, Nt); mB.multiply(mA.transpose());
    const rq = new THREE.Quaternion().setFromRotationMatrix(mB), ang = 2 * Math.acos(Math.min(1, Math.abs(rq.w)));
    if (ang > MAX_WRIST) rq.slerp(new THREE.Quaternion(), 1 - MAX_WRIST / ang);
    A.hand.getWorldQuaternion(qB); setWorldQ(A.hand, rq.multiply(qB));
    A.wristBend = Math.min(ang, MAX_WRIST); A.wristWant = ang;
    if (debug) { const ri = new THREE.Matrix4().copy(rig.matrix).invert(); A.S = S.clone().applyMatrix4(ri); A.E = E.clone().applyMatrix4(ri); A.reach = dist / (A.a + A.b); }
  }
  // the fingers, once the held things are in place
  function poseFingers(side, t) {
    const A = arms.side[side]; if (!A) return;
    A.hand.updateWorldMatrix(true, true);
    const fr = handFrame(side, A), obj = t.obj && t.obj.visible ? t.obj : null;
    if (obj) { obj.updateMatrixWorld(true); obj.userData.inv = new THREE.Matrix4().copy(obj.matrixWorld).invert(); }
    const r = {};
    for (const [name, k] of [['index', t.idx ?? t.curl], ['middle', t.curl], ['ring', t.curl * 1.05], ['pinky', t.curl * 1.1]]) r[name] = gripChain(A[name], obj, fr.pn, fr.F, false, k);
    r.thumb = gripChain(A.thumb, obj, fr.pn, fr.F, true, t.thumb);
    if (!debug) return;
    if (obj) { r.palm = obj.userData.sdf(wpos(A.hand).lerp(wpos(A.index[0]).add(wpos(A.pinky[0])).multiplyScalar(0.5), 0.55).addScaledVector(fr.pn, PALM).applyMatrix4(obj.userData.inv)); }
    if (A.S) r.S = A.S.toArray().map((v) => +v.toFixed(3)); r.E = A.E.toArray().map((v) => +v.toFixed(3)); r.reach = +A.reach.toFixed(2); r.ab = [+A.a.toFixed(3), +A.b.toFixed(3)];
    { const ic = new THREE.Quaternion().setFromRotationMatrix(rig.matrix).invert(), f3 = (v) => v.clone().applyQuaternion(ic).toArray().map((x) => +x.toFixed(2)); r.F = f3(fr.F); r.pn = f3(fr.pn); r.Ft = fOf(t.q).toArray().map((x) => +x.toFixed(2)); r.pnt = pnOf(side, t.q).toArray().map((x) => +x.toFixed(2)); }
    r.wrist = +(A.wristBend || 0).toFixed(2); r.wristWant = +(A.wristWant || 0).toFixed(2);
    report[side] = r;
  }
  // a held thing placed by the hand that carries it: the grip point on the palm, turned with the hand
  function placeBy(side, obj, g, objQcam, camQ, invCamQ) {
    const A = arms.side[side]; const fr = handFrame(side, A), qNow = handQ(side, fr.F, fr.pn);
    const qWant = camQ.clone().multiply(g.qHand), rel = qWant.clone().invert().multiply(camQ.clone().multiply(objQcam));
    const qObj = qNow.clone().multiply(rel);
    const Nn = fr.F.clone().cross(fr.Sd), pc = fr.H.clone().addScaledVector(fr.F, A.palm[0]).addScaledVector(fr.Sd, A.palm[1]).addScaledVector(Nn, A.palm[2]);
    const G = pc.addScaledVector(fr.pn, PALM + g.r);
    const pos = G.sub(g.grip.clone().applyQuaternion(qObj));
    obj.position.copy(pos.applyMatrix4(new THREE.Matrix4().copy(rig.matrix).invert())); obj.quaternion.copy(invCamQ.clone().multiply(qObj)); obj.updateMatrixWorld(true);
  }

  // targets for the grips, in camera space
  const eq = (rx, ry = 0, rz = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz));
  function gripTarget(side, objAt, objQ, g, extra) {
    const F = g.F.clone().applyQuaternion(objQ), pn = g.pn.clone().applyQuaternion(objQ), q = handQ(side, F, pn);
    const G = g.grip.clone().applyQuaternion(objQ).add(objAt);
    const A = arms.side[side];
    const p = A ? wristFor(side, A, G, q, g.r) : G.clone().addScaledVector(pn, -0.03);
    return Object.assign({ p, q, pole: g.pole, qHand: q, grip: g.grip, r: g.r }, extra);
  }
  const freeL = (f) => ({ p: f.at.clone(), q: handQ('L', f.F, f.pn), curl: f.curl, thumb: f.thumb, pole: f.pole });
  const freeR = (f) => ({ p: f.at.clone(), q: handQ('R', f.F, f.pn), curl: f.curl, thumb: f.thumb, pole: f.pole });

  const cur = { R: null, L: null };
  const shake = new THREE.Vector3(), reachP = new THREE.Vector3(), inv = new THREE.Matrix4(), tmp = new THREE.Vector3();
  let t = 0, reachT = 0, camT = 0, wind = 0, shown = false, raise = 0, raiseWant = 0, camOut = 0, toggled = false;
  const lagQ = new THREE.Quaternion(); let lagInit = false;

  const api = {
    scene, visible: () => shown,
    get busy() { return camT > 0 || raise > 0.05; },
    get raised() { return raise > 0.8; },
    get cameraOut() { return camOut > 0.5; },
    grip: () => report,
    // a quick reach toward a point in the world (a door, a switch, the TV)
    reach(world, camera) { if (!world || !camera) return; inv.copy(camera.matrixWorld).invert(); reachP.copy(world).applyMatrix4(inv); reachP.clampLength(0, 0.4); if (reachP.z > -0.22) reachP.z = -0.22; reachP.y = Math.max(reachP.y, -0.2); reachT = 0.55; },
    // the camera up to the eye / back down; toggle: the camera key
    raiseCamera() { raiseWant = 1; },
    lowerCamera() { raiseWant = 0; },
    toggleCamera() { if (raiseWant) { raiseWant = 0; toggled = false; } else { raiseWant = 1; toggled = true; } },
    // the shot: the flash window lights, then the right thumb winds it on (two rolls of the wheel)
    snap(hold = 1.4) { camT = hold; wind = 0; camera3.flashWin.material.emissiveIntensity = 3; setTimeout(() => { camera3.flashWin.material.emissiveIntensity = 0; }, 110); },
    // state: { mode, pod, flashOn, holding, fear, walk, bob, hidden, cameraNear, keepCamera, hasCamera, world, blocked, outdoors }
    update(dt, camera, st) {
      if (typeof window !== 'undefined' && window.__handsTune) window.__handsTune({ TORCH, CAMGRIP, CAMLOWGRIP, CAM_UP, CAM_LOW, FOLD, FREE, V });
      t += dt; rig.matrix.copy(camera.matrixWorld); rig.matrixWorld.copy(camera.matrixWorld);
      const camQ = new THREE.Quaternion(); camera.getWorldQuaternion(camQ); const invCamQ = camQ.clone().invert();
      if (!lagInit) { lagQ.copy(camQ); lagInit = true; }
      lagQ.slerp(camQ, 1 - Math.exp(-dt * 9));   // the flashlight follows the look a beat behind
      if (st.hasCamera === false) { raiseWant = 0; toggled = false; }   // not his yet: no camera in the hands
      const wantOut = st.hasCamera !== false && !st.hidden && st.mode === 'walk' && (st.cameraNear || toggled || raiseWant > 0);
      camOut += ((wantOut ? 1 : 0) - camOut) * Math.min(1, dt * 6);
      if ((st.hidden || st.mode !== 'walk') && camT <= 0 && !st.keepCamera) { raiseWant = 0; toggled = false; }
      raise += ((raiseWant || camT > 0 ? 1 : 0) - raise) * Math.min(1, dt * 7);
      let pose;
      if (st.hidden && raise < 0.05) pose = 'hidden';
      else if (raise > 0.05) pose = 'camera';
      else if (st.mode === 'hide') pose = st.holding ? 'breath' : st.pod ? 'still' : 'covers';
      else if (camOut > 0.05) pose = 'camLow';
      else if (st.flashOn) pose = 'flash';
      else pose = 'hidden';
      camT = Math.max(0, camT - dt); reachT = Math.max(0, reachT - dt);
      mirrorLights(st.world, camera, st);

      // where the held things want to be (camera space)
      const lag = invCamQ.clone().multiply(lagQ);
      const torchQ = lag.clone(), torchAt = TORCH.at.clone().applyQuaternion(lag);
      const camQt = eq(CAM_LOW.rx, CAM_LOW.ry, CAM_LOW.rz).slerp(eq(CAM_UP.rx), raise), camAt = CAM_LOW.at.clone().lerp(CAM_UP.at, raise);
      const foldQ = new THREE.Quaternion();
      // each hand's target
      const tg = {};
      const flashOn = st.flashOn && !st.hidden && st.mode !== 'hide';
      const torchR = () => gripTarget('R', torchAt, torchQ, TORCH, { curl: 0.9, thumb: 0.5, obj: torch });
      const camL = () => gripTarget('L', camAt, camQt, raise > 0.5 ? CAMGRIP.L : CAMLOWGRIP, { curl: 0.85, thumb: 0.4, obj: cam });
      if (pose === 'camera') { tg.R = gripTarget('R', camAt, camQt, CAMGRIP.R, { curl: 0.8, thumb: 0.5, idx: 0.5, obj: cam }); tg.L = camL(); if (raise < 0.6 && !flashOn) tg.R = Object.assign(freeR(FREE.hidR), {}); }
      else if (pose === 'camLow') { tg.L = camL(); tg.R = flashOn ? torchR() : freeR(FREE.hidR); }
      else if (pose === 'flash') { tg.R = torchR(); tg.L = freeL(FREE.hidL); }
      else if (pose === 'covers') { tg.R = gripTarget('R', FOLD.at, foldQ, FOLD.R, { curl: 1, thumb: 0.6, obj: foldG, r: FOLD.r }); tg.L = gripTarget('L', FOLD.at, foldQ, FOLD.L, { curl: 1, thumb: 0.6, obj: foldG, r: FOLD.r }); }
      else if (pose === 'breath') { tg.R = freeR(FREE.breath); tg.L = st.pod ? freeL(FREE.stillL) : gripTarget('L', FOLD.at, foldQ, FOLD.L, { curl: 1, thumb: 0.6, obj: foldG, r: FOLD.r }); }
      else if (pose === 'still') { tg.R = freeR(FREE.stillR); tg.L = freeL(FREE.stillL); }
      else { tg.R = freeR(FREE.hidR); tg.L = freeL(FREE.hidL); }
      // a reach: the right hand goes out open, fingertips first, palm down and a little forward, toward what you use
      if (reachT > 0 && pose !== 'camera') {
        const r = Math.sin(Math.min(1, (0.55 - reachT) / 0.55) * Math.PI), F = reachP.clone().sub(V(0.16, -0.26, 0)).normalize();
        const pn = V(0, -1, -0.45).addScaledVector(F, -V(0, -1, -0.45).dot(F)).normalize();
        const rt = { p: reachP.clone().addScaledVector(F, -0.11), q: handQ('R', F, pn), curl: 0.16, thumb: 0.12, idx: 0.1, pole: V(0.7, -1, 0.15) };
        tg.R = { ...rt, p: tg.R.p.clone().lerp(rt.p, r), q: tg.R.q.clone().slerp(rt.q, r), curl: lerp(tg.R.curl ?? 0.4, rt.curl, r), thumb: lerp(tg.R.thumb ?? 0.3, rt.thumb, r), idx: lerp(tg.R.idx ?? tg.R.curl ?? 0.4, rt.idx, r), obj: r > 0.3 ? null : tg.R.obj, qHand: r > 0.3 ? null : tg.R.qHand, grip: tg.R.grip, r: tg.R.r, pole: rt.pole };
      }
      // the wind-on: the right thumb rolls the wheel with a small turn of the wrist
      if (pose === 'camera' && camT > 0 && camT < 1.0) { wind += dt; camera3.wheel.rotation.y = -wind * 9; tg.R.q = tg.R.q.clone().multiply(eq(0, 0, Math.sin(wind * 14) * 0.06)); tg.R.thumb = 0.5 + Math.sin(wind * 14) * 0.25; }

      // blend toward the targets (never snapped), with the fear tremble and the walk's sway
      const k = 1 - Math.exp(-dt * (pose === 'breath' ? 14 : 9));
      const f = st.fear || 0, w = st.walk || 0;
      for (const side of ['R', 'L']) {
        const T = tg[side];
        if (!cur[side]) cur[side] = { p: T.p.clone(), q: T.q.clone(), curl: T.curl ?? 0.4, thumb: T.thumb ?? 0.3, idx: T.idx ?? T.curl ?? 0.4, pole: T.pole.clone() };
        const c = cur[side];
        tmp.copy(T.p);
        shake.set(Math.sin(t * 31 + (side === 'R' ? 0 : 2)) * 0.002 + Math.sin(t * 13.7) * 0.0012, Math.sin(t * 27.3 + 1) * 0.002, 0).multiplyScalar(f * 1.4);
        tmp.add(shake); tmp.y += Math.sin((st.bob || 0) + (side === 'R' ? 0 : Math.PI)) * 0.008 * w + Math.sin(t * 1.3) * 0.002; tmp.x += Math.cos((st.bob || 0) * 0.5) * 0.004 * w;
        c.p.lerp(tmp, k); c.q.slerp(T.q, k); c.pole.lerp(T.pole, k);
        c.curl = lerp(c.curl, T.curl ?? 0.4, k); c.thumb = lerp(c.thumb, T.thumb ?? 0.3, k); c.idx = lerp(c.idx, T.idx ?? T.curl ?? 0.4, k);
        c.obj = T.obj || null; c.g = T.qHand ? T : null;
        const h = side === 'R' ? R : L; h.hand.position.copy(c.p); h.hand.quaternion.copy(c.q); curlHand(h, c.curl);
      }

      // the held things
      torch.visible = flashOn && (pose === 'flash' || pose === 'camLow' || (pose === 'camera' && cur.R.obj === torch)) && cur.R.p.y > -0.4;
      const camVis = (camOut > 0.05 || raise > 0.05) && pose !== 'hidden'; cam.visible = camVis;
      foldG.visible = pose === 'covers' || (pose === 'breath' && !st.pod);
      foldG.position.copy(FOLD.at); foldG.quaternion.identity();

      const inView = pose !== 'hidden' || cur.R.p.y > -0.45 || cur.L.p.y > -0.45 || raise > 0.05;
      if (arms.ready && inView) {
        for (const [b, q] of arms.rest) b.quaternion.copy(q);
        arms.root.updateMatrixWorld(true);
        poseArm('R', cur.R, camQ); poseArm('L', cur.L, camQ);
        // a thing carried in one hand goes where that hand actually is; the raised camera is held up by both
        if (torch.visible && cur.R.obj === torch && cur.R.g) placeBy('R', torch, cur.R.g, torchQ, camQ, invCamQ);
        if (cam.visible) {
          if (raise < 0.5 && cur.L.obj === cam && cur.L.g) placeBy('L', cam, cur.L.g, camQt, camQ, invCamQ);
          else { cam.position.copy(camAt); cam.quaternion.copy(camQt); }
        }
        poseFingers('R', cur.R); poseFingers('L', cur.L);
      } else {
        if (torch.visible) { torch.position.copy(cur.R.p).add(tmp.set(-0.012, 0.018, -0.045)); torch.quaternion.copy(torchQ); }
        if (cam.visible) { cam.position.copy(camAt); cam.quaternion.copy(camQt); }
      }
      if (debug) report.pose = pose; report.torch = torch.visible; report.cam = cam.visible; report.Rp = cur.R.p.toArray().map((v) => +v.toFixed(3)); report.Lp = cur.L.p.toArray().map((v) => +v.toFixed(3));
      if (vfEl) { const o = Math.max(0, (raise - 0.6) / 0.4); vfEl.style.opacity = o.toFixed(3); }
      spill.intensity = st.flashOn && !st.hidden ? 0.28 : 0;
      shown = pose !== 'hidden' || cur.R.p.y > -0.45 || cur.L.p.y > -0.45 || raise > 0.05;
      if (arms.root) arms.root.visible = shown;
      R.hand.visible = L.hand.visible = !arms.ready && shown;
      rig.updateMatrixWorld(true);
    },
    // where the flashlight's beam starts, in the camera's frame (the lens of the torch in the right hand)
    lens(out) { return out.set(0, 0, -0.11).applyMatrix4(torch.matrix); },
  };
  return api;
}
