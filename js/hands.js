// the kid's hands at the bottom of the view. The arms are a rigged model (assets/props/fp_arms.glb, finger bones and all) set at a nine-year-old's
// size and posed in code every frame. Every grip is built around the thing held: the hand is placed against the object (palm on its surface,
// turned the way a real hand takes it), the wrist goes there by two-bone ik from the shoulder with the elbow kept low and tucked, the forearm
// rolls to carry most of the turn, the wrist bend is limited to what a wrist does, and each finger closes only until it touches the object's
// surface. Until the model is in, a capsule stand-in does the same poses.
// they live in their own little scene, drawn over the frame after the world with the depth cleared, so they never sink into a wall, and they
// are lit by the room's own lights (the nearest lamps the eye can see, the sky light, the sun when you are outside) and the flashlight's bounce.
//
// What he holds is a tool, one at a time in the right hand: Grandpa's flashlight or the disposable camera.
//   switchItem()   swaps them over 0.35 s; the torch goes to the left hand keeping its light (dark, it is let down out of sight while
//                  the camera is up, so the left hand can steady the camera), or pinned under the right forearm with settings.torchPin
//                  while lit. Refused until the camera is his (st.hasCamera).
//   aim(on)        held: the torch comes up to shoulder height and its beam narrows; the camera comes up to the eye, the finder shows and
//                  the view narrows to LENS_FOV. Refused in hiding, in a cutscene and once caught; a sprint, the covers, a cutscene and
//                  hiding put it down. Never down on its own: it stays up for as long as you hold it.
//   use()          what the use button does now: 'light' (the torch, on or off), 'shot' (the camera at the eye), 'hip' (the camera low:
//                  a shot from the chest), 'wind' (still winding on: refused) or null
//   state          the item's raise: 'down' | 'raising' | 'up' | 'lowering', and the camera's 'shutter' / 'winding' while it is up
//   active, aimed, zoom (0..1, the finder's share of the view), beam (0..1, the torch's), walkK, lens(out), beamDir(out), hipPose(...)
// The camera's raise: down -> raising (0.35 s, eased out with a 3 cm overshoot) -> up -> shutter -> winding (1.0 s, shots refused, the
// wheel turns under the thumb) -> up -> lowering (0.3 s).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { loadProp } from './props.js';
import { plaid } from './textures.js';

const SKIN = 0xd9a98a, SLEEVE = 0x4f6584, CUFF = 0x3f5170;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const PALM = 0.011, FINGER = 0.0072;   // bone centre to palm skin, and a finger's radius, at the kid's size
const NIGHT_K = 0.55, NIGHT_TINT = new THREE.Color(0.62, 0.82, 1.15);   // the night grade's darkening and cool cast on dim light
const MAX_WRIST = 1.0, MAX_ROLL = 1.6, MAX_CURL = 1.35;   // wrist bend, forearm roll and finger close (rad), within a child's range

export const FILM = 24;          // the exposures in a fresh disposable
export const LENS_FOV = 58;      // the view through the finder (degrees, vertical): what the print is taken at
const RAISE_S = 0.35, LOWER_S = 0.3, WIND_S = 1.0, SHUTTER_S = 0.1, SWITCH_S = 0.35, TORCH_UP_S = 0.3;
// the print, and so the finder: the centre 80 % of the largest 4:3 that fits the frame (60 % wide x 80 % tall on a 16:9 screen)
export const PRINT_W = 288, PRINT_H = 216;
export function printCrop(sw, sh) { const k = Math.min(sw / PRINT_W, sh / PRINT_H) * 0.8, w = PRINT_W * k, h = PRINT_H * k; return { x: (sw - w) / 2, y: (sh - h) / 2, w, h }; }

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
// a drum along z: centre (cx, cy), from z0 to z1, radius r
const sdDrumZ = (p, cx, cy, z0, z1, r) => { const a = Math.hypot(p.x - cx, p.y - cy) - r, b = Math.max(z0 - p.z, p.z - z1); return Math.hypot(Math.max(a, 0), Math.max(b, 0)) + Math.min(Math.max(a, b), 0); };

// Grandpa's torch (assets/props/flashlight.glb, Poly Haven's vintage_flashlight): a red battery box with a black carrying handle along its
// top, from a post at the back to the lamp head at the front. Its frame here is centred where the hand takes the handle: +x right, +y up,
// the lens toward -z. Measured from the model, in metres: the handle a bar of radius 13.5 mm at y 0 from z -0.10 (the head) to +0.12 (the
// back cap); the box below it, 96 mm wide, y -0.097..-0.022, z -0.15..+0.08; the head a drum of radius 39 mm round y 0.0095, z -0.11..-0.192,
// its lens at z -0.192. The model itself is turned to face -z and moved so the handle's middle is the origin.
const LANTERN = {
  bar: [V(0, 0, -0.1), V(0, 0, 0.12)], barR: 0.0135,
  box: { c: V(0, -0.0595, -0.035), h: V(0.048, 0.0375, 0.115) },
  head: { y: 0.0095, z0: -0.192, z1: -0.108, r: 0.039 },
  post: [V(0, -0.03, 0.08), V(0, -0.006, 0.08)], postR: 0.011,
  lens: V(0, 0.0085, -0.193), lensR: 0.035,
  model: { at: V(0, -0.0975, -0.04), ry: Math.PI },
};

// the disposable camera: a black plastic body in a printed cardboard wrap, the lens, the flash window and its slider, the viewfinder, the
// shutter button and the ridged winding wheel on top at the back, and the frame counter's little window beside the wheel. +x right, +y up,
// the lens toward -z (away from you)
const CAM_H = V(0.056, 0.029, 0.017);
const CAM_LENS = V(0.012, -0.004, -0.029);   // the front of the lens, in the camera's frame
function makeCamera() {
  const g = new THREE.Group();
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d');
  x.fillStyle = '#e8b82a'; x.fillRect(0, 0, 256, 128);
  x.fillStyle = '#b8261d'; x.fillRect(0, 84, 256, 18); x.fillStyle = '#1b1b1b'; x.fillRect(0, 104, 256, 8);
  x.fillStyle = '#1b1b1b'; x.font = 'bold 34px sans-serif'; x.fillText('FLASH', 18, 50); x.font = 'bold 20px sans-serif'; x.fillText(`${FILM} EXP`, 168, 46);
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
  // the frame counter: the number of exposures left, painted on a 32 x 16 canvas in a little window on the back beside the wheel
  const cc = document.createElement('canvas'); cc.width = 32; cc.height = 16; const cx = cc.getContext('2d');
  const countTex = new THREE.CanvasTexture(cc); countTex.colorSpace = THREE.SRGBColorSpace; countTex.generateMipmaps = false; countTex.minFilter = THREE.LinearFilter;
  const counter = new THREE.Mesh(new THREE.PlaneGeometry(0.011, 0.0055), new THREE.MeshStandardMaterial({ map: countTex, roughness: 0.2, emissive: 0xffffff, emissiveMap: countTex, emissiveIntensity: 0.12 }));
  counter.position.set(0.022, 0.0205, 0.0179); g.add(counter);
  let shown = -1;
  const setCount = (n) => {
    n = Math.max(0, n | 0); if (n === shown) return; shown = n;
    cx.fillStyle = '#16130f'; cx.fillRect(0, 0, 32, 16); cx.fillStyle = n > 0 ? '#efe6cf' : '#d2463a';
    cx.font = 'bold 13px monospace'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(String(n), 16, 9); countTex.needsUpdate = true;
  };
  setCount(FILM);
  g.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  g.userData.sdf = (p) => sdRoundBox(p, CAM_H, 0.006);
  return { group: g, wheel, button, flashWin, setCount };
}

// the viewfinder: what you see through the camera at the eye. Its frame is exactly the print's crop (printCrop, the same sums main.js's
// grabPrint makes), with the focus circle at its centre, the flash-ready dot and a faint count of what is left; outside it the view darkens
function makeViewfinder() {
  if (typeof document === 'undefined') return null;
  const el = document.createElement('div'); el.id = 'finder';
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:6;opacity:0;overflow:hidden;';
  const box = document.createElement('div');
  box.style.cssText = 'position:absolute;box-sizing:border-box;border:1px solid rgba(255,250,235,0.55);border-radius:5px;box-shadow:0 0 0 200vmax rgba(0,0,0,0.42), inset 0 0 60px rgba(0,0,0,0.35);';
  const ring = document.createElement('div');
  ring.style.cssText = 'position:absolute;left:50%;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px;border:1px solid rgba(255,250,235,0.6);border-radius:50%;';
  const dot = document.createElement('div');   // the flash-ready light: on when it will fire, dark while it winds on
  dot.style.cssText = 'position:absolute;right:12px;bottom:12px;width:7px;height:7px;border-radius:50%;background:#e7a23a;box-shadow:0 0 6px rgba(231,162,58,0.8);';
  const count = document.createElement('div');
  count.style.cssText = 'position:absolute;left:12px;bottom:9px;font:600 12px/1 monospace;letter-spacing:1px;color:rgba(255,250,235,0.55);';
  box.append(ring, dot, count); el.append(box); document.body.appendChild(el);
  const layout = () => { const r = printCrop(innerWidth, innerHeight); Object.assign(box.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` }); };
  layout(); addEventListener('resize', layout);
  let ready = null, left = null;
  return {
    el, box, layout,
    show(o, isReady, n) {
      el.style.opacity = o.toFixed(3);
      if (isReady !== ready) { ready = isReady; dot.style.opacity = isReady ? '1' : '0.15'; }
      if (n !== left) { left = n; count.textContent = String(n); count.style.color = n > 0 ? 'rgba(255,250,235,0.55)' : 'rgba(230,90,70,0.8)'; }
    },
  };
}

// ---- the grips, each as a real nine-year-old holds the thing (frames in the held object's own space unless said) ----
// Grandpa's torch, carried by its handle: the hand comes over the top, palm down on the bar, the fingers draped over its far side and
// round under it toward the box, the thumb under the near side; the forearm comes forward from low on the right, so the lamp head leads in
// front and the box hangs below the fist. At rest it is low on the right and turned a little in across the body; it points where you
// look, a beat behind the turn.
const TORCH = { at: V(0.13, -0.183, -0.262), ry: 0.32, grip: V(0, 0, 0), r: LANTERN.barR + 0.003, F: V(-0.55, 0.18, -0.85), pn: V(0, -1, 0.05), pole: V(0.8, -1, 0.3) };
// aimed: brought up to shoulder height in front of the middle of the body and straightened, the arm out, steadier
const TORCH_AIM = { at: V(0.07, -0.158, -0.3), ry: 0.04 };
// in the left hand while the camera is in the right: the same grip, mirrored
const TORCH_L = { at: V(-0.13, -0.19, -0.262), ry: -0.32, grip: V(0, 0, 0), r: LANTERN.barR + 0.003, F: V(0.55, 0.18, -0.85), pn: V(0, -1, 0.05), pole: V(-0.8, -1, 0.3) };
// settings.torchPin: clamped under the right forearm against the chest while the right hand works the camera, its beam 35 degrees down
const TORCH_PIN = { at: V(0.12, -0.26, -0.22), rx: -35 * Math.PI / 180 };
// the hand-off between the hands, low in the middle, the lamp tipped down (the beam dips to the floor as it passes)
const HANDOFF = { at: V(0.0, -0.215, -0.3), rx: -0.85 };
// the camera, one-handed in the right hand: the hand round its right end, the index on the shutter button, the thumb on the back by the
// wheel, the other three curled under. Up at the eye it is shifted right so the eye lines up with the finder, and held just low enough
// that its body stays under the finder's frame (what the frame holds is what the print holds); carried low it is held at the chest, lens
// forward, ready for a shot from the hip
const CAM_UP_R = { at: V(0.035, -0.104, -0.165), rx: 0.05, ry: 0, rz: 0 };
const CAM_LOW_R = { at: V(0.118, -0.186, -0.285), rx: 0.14, ry: -0.22, rz: 0.05 };
const CAMGRIP_R1 = { grip: V(CAM_H.x + 0.001, -0.004, 0.006), r: 0, F: V(0, 1, -0.25), pn: V(-1, 0, 0.1), pole: V(0.6, -1, 0.2) };
// the left hand steadying the raised camera's left end when it has no torch to hold (the palm on the end, the fingers loose over the top)
const CAMGRIP_L = { grip: V(-CAM_H.x, -0.012, 0.002), r: 0, F: V(0, 1, -0.35), pn: V(1, 0, 0), pole: V(-0.55, -1, 0.25) };
// where a thing goes when it is put away: straight down out of the view
const AWAY = V(0, -0.24, 0.05);
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
// a box carried in both hands at the chest (moving day): its constants and its pose function poseCarry() below belong to the day
const CARRY = { at: V(0, -0.32, -0.45) };
// the hands on the breakfast table: its constants and poseTable() below belong to the mornings
const TABLE = { at: V(0, -0.36, -0.4) };

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
      if (d < 0.6) continue;   // the flashlight itself, and the camera's flash, at the eye
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

  // Grandpa's torch: the model once it is in; until then a box, a handle and a drum of the same size, so the grip closes on the same shape
  const torch = new THREE.Group();
  const standIn = new THREE.Group(); torch.add(standIn);
  {
    const dark = new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.5, metalness: 0.3 }), red = new THREE.MeshStandardMaterial({ color: 0x7c1d16, roughness: 0.6 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x9a9a9e, roughness: 0.3, metalness: 0.8 });
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(LANTERN.barR, LANTERN.barR, 0.22, 14), dark); bar.rotation.x = Math.PI / 2; bar.position.z = 0.01; standIn.add(bar);
    const box = new THREE.Mesh(new RoundedBoxGeometry(LANTERN.box.h.x * 2, LANTERN.box.h.y * 2, LANTERN.box.h.z * 2, 2, 0.006), red); box.position.copy(LANTERN.box.c); standIn.add(box);
    const hd = LANTERN.head, head = new THREE.Mesh(new THREE.CylinderGeometry(hd.r, hd.r * 0.85, hd.z1 - hd.z0, 20), metal); head.rotation.x = Math.PI / 2; head.position.set(0, hd.y, (hd.z0 + hd.z1) / 2); standIn.add(head);
  }
  // the lamp behind the glass: lit while the light is on
  const lensM = new THREE.Mesh(new THREE.CircleGeometry(LANTERN.lensR, 24), new THREE.MeshBasicMaterial({ color: 0xfff6dd, toneMapped: false }));
  lensM.position.copy(LANTERN.lens).add(V(0, 0, 0.006)); lensM.rotation.y = Math.PI; torch.add(lensM);
  torch.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  torch.userData.sdf = (p) => Math.min(
    sdCapsule(p, LANTERN.bar[0], LANTERN.bar[1], LANTERN.barR),
    sdRoundBox(p.clone().sub(LANTERN.box.c), LANTERN.box.h, 0.006),
    sdDrumZ(p, 0, LANTERN.head.y, LANTERN.head.z0, LANTERN.head.z1, LANTERN.head.r),
    sdCapsule(p, LANTERN.post[0], LANTERN.post[1], LANTERN.postR));
  rig.add(torch); torch.visible = false;
  loadProp('flashlight').then((g) => {
    const m = g.scene.clone(true);
    m.traverse((o) => {
      if (!o.isMesh) return;
      o.frustumCulled = false; o.castShadow = o.receiveShadow = false;
      // its own copies of the materials, with the glass made glass again (the props loader cuts every textured transparency out like a leaf)
      o.material = [].concat(o.material).map((mt) => { const c = mt.clone(); if (/glass/i.test(mt.name)) { c.transparent = true; c.alphaTest = 0; c.opacity = 0.35; c.depthWrite = false; c.side = THREE.FrontSide; } return c; });
      if (o.material.length === 1) o.material = o.material[0];
    });
    m.rotation.y = LANTERN.model.ry; m.position.copy(LANTERN.model.at);
    torch.add(m); standIn.visible = false;
  }).catch(() => { /* the stand-in stays */ });
  const camera3 = makeCamera(), cam = camera3.group; rig.add(cam); cam.visible = false;
  // a fold of the comforter for the fists under the covers
  const fold = new THREE.Mesh(new THREE.CapsuleGeometry(FOLD.r, 0.5, 6, 14), new THREE.MeshStandardMaterial({ map: plaid(), roughness: 1 }));
  fold.rotation.z = Math.PI / 2; const foldG = new THREE.Group(); foldG.add(fold); rig.add(foldG); foldG.visible = false; fold.frustumCulled = false;
  foldG.userData.sdf = (p) => sdCapsule(p, V(-0.3, 0, 0), V(0.3, 0, 0), FOLD.r);
  const finder = makeViewfinder();

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
  function aimBone(bone, child, target) {
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
  function gripChain(bones, obj, palmN, Fh, thumb, want, fresh) {
    const restQ = bones.map((b) => arms.rest.get(b));
    const set = (k) => { bones.forEach((b, i) => b.quaternion.copy(restQ[i])); bones[0].updateMatrixWorld(true); curlChain(bones, k, palmN, Fh, thumb); };
    if (!obj) { bones.__obj = null; set(THREE.MathUtils.clamp(want, 0, MAX_CURL)); return null; }
    // a grip holds still against its object, so the touch is found again only every few frames
    if (!fresh && bones.__obj === obj && bones.__age++ < 8) { set(bones.__k); return bones.__gap; }
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
    aimBone(A.up, A.lo, E); aimBone(A.lo, A.hand, Wr);
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
    if (debug) { const ri = new THREE.Matrix4().copy(rig.matrix).invert(); A.S = S.clone().applyMatrix4(ri); A.E = E.clone().applyMatrix4(ri); A.reach = dist / (A.a + A.b); A.wristErr = wpos(A.hand).distanceTo(W); }
  }
  // the fingers, once the held things are in place
  function poseFingers(side, t) {
    const A = arms.side[side]; if (!A) return;
    A.hand.updateWorldMatrix(true, true);
    const fr = handFrame(side, A), obj = t.obj && t.obj.visible ? t.obj : null;
    if (obj) { obj.updateMatrixWorld(true); obj.userData.inv = new THREE.Matrix4().copy(obj.matrixWorld).invert(); }
    const r = {};
    const fresh = S.sw < 1;   // while the things change hands the grip moves every frame, so the touch is found every frame
    for (const [name, k] of [['index', t.idx ?? t.curl], ['middle', t.curl], ['ring', t.curl * 1.05], ['pinky', t.curl * 1.1]]) r[name] = gripChain(A[name], obj, fr.pn, fr.F, false, k, fresh);
    r.thumb = gripChain(A.thumb, obj, fr.pn, fr.F, true, t.thumb, fresh);
    if (!debug) return;
    if (obj) { r.palm = +obj.userData.sdf(wpos(A.hand).lerp(wpos(A.index[0]).add(wpos(A.pinky[0])).multiplyScalar(0.5), 0.55).addScaledVector(fr.pn, PALM).applyMatrix4(obj.userData.inv)).toFixed(4); r.obj = obj === torch ? 'torch' : obj === cam ? 'camera' : 'fold'; }
    for (const n of ['index', 'middle', 'ring', 'pinky', 'thumb']) if (typeof r[n] === 'number') r[n] = +r[n].toFixed(4);
    if (A.S) r.S = A.S.toArray().map((v) => +v.toFixed(3)); if (A.E) r.E = A.E.toArray().map((v) => +v.toFixed(3)); r.reach = +(A.reach || 0).toFixed(2); r.wristErr = +(A.wristErr || 0).toFixed(4); r.ab = [+A.a.toFixed(3), +A.b.toFixed(3)];
    { const ic = new THREE.Quaternion().setFromRotationMatrix(rig.matrix).invert(), f3 = (v) => v.clone().applyQuaternion(ic).toArray().map((x) => +x.toFixed(2)); r.F = f3(fr.F); r.pn = f3(fr.pn); r.Ft = fOf(t.q).toArray().map((x) => +x.toFixed(2)); r.pnt = pnOf(side, t.q).toArray().map((x) => +x.toFixed(2)); }
    r.wrist = +(A.wristBend || 0).toFixed(2); r.wristWant = +(A.wristWant || 0).toFixed(2);
    report[side] = r;
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

  // ---- the two poses other parts of the game fill in (each in its own function, so they never edit the same lines) ----
  // a box carried in both hands (moving day). Set tg.R / tg.L (and return true) to take the hands; false leaves them to the rest
  function poseCarry(tg, st) { return false; }   // eslint-disable-line no-unused-vars
  // the hands at the breakfast table (the mornings). Same contract as poseCarry
  function poseTable(tg, st) { return false; }   // eslint-disable-line no-unused-vars

  // ---- what is held, and how far up ----
  const S = {
    active: 'torch', aimCall: false, aimLatch: false, cancel: false, script: false, sprintWas: false,
    sw: 1, swFrom: 'torch', swTo: 'torch', swLit: false, swPin: false,     // the switch: 0..1 over SWITCH_S, what left the right hand and what came, the torch's light then
    cam: { k: 0, dir: -1, state: 'down', wind: 0, shut: 0 },             // k: how far up, 0..1, linear in time; wind / shut: seconds left
    tor: { k: 0, dir: -1, state: 'down' },
  };
  let lastSt = null, want = false, flashGlow = 0;
  const has = (item, st) => (item === 'camera' ? st.hasCamera !== false : st.hasTorch !== false);
  const playable = (st) => !!st && !st.hidden && !st.dead && !st.cutscene && (st.mode === 'walk' || st.mode === 'bunk');
  const easeUp = (o) => (o.dir > 0 ? 1 - Math.pow(1 - o.k, 3) : smooth(o.k));
  const overshoot = (o) => (o.dir > 0 && o.k > 0.5 && o.k < 1 ? Math.sin(Math.PI * (o.k - 0.5) / 0.5) : 0);   // 0..1..0 at the end of a raise

  // the smoothed poses of the two things held, in camera space
  const held = { torch: { p: TORCH.at.clone(), q: new THREE.Quaternion(), init: false }, cam: { p: CAM_LOW_R.at.clone(), q: new THREE.Quaternion(), init: false } };
  const cur = { R: null, L: null };
  const shake = new THREE.Vector3(), reachP = new THREE.Vector3(), inv = new THREE.Matrix4(), tmp = new THREE.Vector3(), sway = new THREE.Vector3();
  let t = 0, reachT = 0, wind = 0, shown = false, swayK = 1;
  const lagQ = new THREE.Quaternion(); let lagInit = false;
  const beamQ = new THREE.Quaternion(), beamFwd = V(0, 0, -1);

  const api = {
    scene, visible: () => shown,
    flashLight: null,   // the camera's flash in the world (main.js hands its PointLight over): lit for two frames a shot
    get active() { return S.active; },
    // the item up and held there (the torch's narrowed beam is what the thing flinches from)
    get aimed() { const o = S.active === 'camera' ? S.cam : S.tor; return want && o.k >= 1; },
    get state() {
      const o = S.active === 'camera' || S.script ? S.cam : S.tor;
      if ((S.active === 'camera' || S.script) && o.k >= 1) { if (S.cam.shut > 0) return 'shutter'; if (S.cam.wind > 0) return 'winding'; }
      return o.state;
    },
    // the finder's share of the view (the field of view goes from the player's to LENS_FOV with it) and the torch's aimed beam, 0..1
    get zoom() { return S.active === 'camera' || S.script ? smooth(S.cam.k) : 0; },
    get beam() { return S.active === 'torch' && !S.script ? smooth(S.tor.k) : 0; },
    get walkK() { return want ? 0.75 : 1; },
    get canShoot() { return S.cam.wind <= 0; },
    get torchShown() { return torch.visible; },
    get film() { return lastSt && Number.isFinite(lastSt.film) ? lastSt.film : FILM; },
    // older names, kept for the scripts that frame a shot themselves (the proof photo, Mom's gift) and the frame's checks
    get raised() { return (S.active === 'camera' || S.script) && S.cam.k > 0.8; },
    get cameraOut() { return S.active === 'camera' || S.script; },
    get busy() { return S.script || S.cam.k > 0.05 || S.cam.wind > 0; },
    grip: () => report,
    // a quick reach toward a point in the world (a door, a switch, the TV), with whichever hand is free
    reach(world, camera) { if (!world || !camera) return; inv.copy(camera.matrixWorld).invert(); reachP.copy(world).applyMatrix4(inv); reachP.clampLength(0, 0.4); if (reachP.z > -0.22) reachP.z = -0.22; reachP.y = Math.max(reachP.y, -0.2); reachT = 0.55; },
    // flashlight <-> camera; false when it cannot (no camera yet, hiding, a scene playing, mid-swap)
    switchItem() {
      const st = lastSt; if (!playable(st) || S.sw < 1 || S.script) return false;
      const to = S.active === 'camera' ? 'torch' : 'camera';
      if (!has(to, st)) return false;
      S.swFrom = S.active; S.swTo = to; S.swLit = !!st.flashOn; S.swPin = !!st.torchPin; S.sw = 0; S.active = to; S.aimLatch = false;
      return true;
    },
    aim(on) { S.aimCall = !!on; },
    // the cancel button: puts an aimed item down until the aim is let go
    cancel() { if (want) { S.cancel = true; S.aimLatch = false; return true; } return false; },
    // what the use button does now (the caller acts on it: main.js's useItem)
    use() {
      const st = lastSt; if (!playable(st) || S.sw < 1) return null;
      if (S.active === 'torch') return has('torch', st) ? 'light' : null;
      if (!has('camera', st)) return null;
      if (S.cam.wind > 0) return 'wind';
      return S.cam.k >= 0.8 && want ? 'shot' : 'hip';
    },
    // a shot was taken: the flash window lights, the shutter, then the right thumb winds it on (two rolls of the wheel); no shot until it has
    snap() { S.cam.shut = SHUTTER_S; S.cam.wind = SHUTTER_S + WIND_S; wind = 0; flashGlow = 0.11; camera3.flashWin.material.emissiveIntensity = 3; },
    // the scripts' own raise (the proof photo, Mom's gift): the camera to the eye in the right hand whatever is held, until lowered
    raiseCamera() { S.script = true; },
    lowerCamera() { S.script = false; },
    // the touch screen's long press on the proof line: the camera out and up, or back down
    toggleCamera() { if (S.active !== 'camera') { if (api.switchItem()) S.aimLatch = true; } else S.aimLatch = !S.aimLatch; },
    // state: { mode, pod, flashOn, holding, fear, walk, bob, hidden, cutscene, dead, frozen, aim, sprint, breath, hasCamera, hasTorch, film,
    //          torchPin, world, blocked, outdoors, night }
    update(dt, camera, st) {
      if (typeof window !== 'undefined' && window.__handsTune) window.__handsTune({ TORCH, TORCH_AIM, TORCH_L, TORCH_PIN, HANDOFF, CAM_UP_R, CAM_LOW_R, CAMGRIP_R1, CAMGRIP_L, LANTERN, FOLD, FREE, V });
      lastSt = st;
      if (st.frozen) dt = 0;   // paused: nothing moves on, nothing is put down
      t += dt; rig.matrix.copy(camera.matrixWorld); rig.matrixWorld.copy(camera.matrixWorld);
      const camQ = new THREE.Quaternion(); camera.getWorldQuaternion(camQ); const invCamQ = camQ.clone().invert();
      if (!lagInit) { lagQ.copy(camQ); lagInit = true; }
      lagQ.slerp(camQ, 1 - Math.exp(-dt * 9));   // the torch follows the look a beat behind
      // a camera that is not his (a new run) goes back for the torch
      if (S.active === 'camera' && !has('camera', st) && S.sw >= 1) S.active = 'torch';
      const can = playable(st);
      // ---- the aim: held, and only where it is allowed; a sprint, the covers on the bunk and the cancel button put it down
      const aimHeld = !!st.aim || S.aimCall || S.aimLatch;
      if (!aimHeld) S.cancel = false;
      const sprint = !!st.sprint && st.mode === 'walk';
      if (sprint && !S.sprintWas) S.aimLatch = false;
      S.sprintWas = sprint;
      const covers = st.mode === 'bunk' && !!st.breath;
      want = aimHeld && !S.cancel && can && !sprint && !covers && S.sw >= 1 && has(S.active, st);
      const step = (o, w, up, down) => {
        if (w) { o.k = Math.min(1, o.k + dt / up); o.dir = 1; o.state = o.k >= 1 ? 'up' : 'raising'; }
        else { o.k = Math.max(0, o.k - dt / down); o.dir = -1; o.state = o.k <= 0 ? 'down' : 'lowering'; }
      };
      step(S.cam, S.script || (want && S.active === 'camera'), RAISE_S, LOWER_S);
      step(S.tor, want && S.active === 'torch' && !S.script, TORCH_UP_S, LOWER_S);
      S.cam.shut = Math.max(0, S.cam.shut - dt); S.cam.wind = Math.max(0, S.cam.wind - dt);
      if (flashGlow > 0 && (flashGlow -= dt) <= 0) camera3.flashWin.material.emissiveIntensity = 0;
      S.sw = Math.min(1, S.sw + dt / SWITCH_S);
      camera3.setCount(api.film);

      // ---- the pose: hiding, put away, or the things held
      const lit = !!st.flashOn && !st.hidden && st.mode !== 'hide';
      const showItems = can || S.script;
      let pose;
      if (S.script) pose = 'camera';
      else if (st.hidden) pose = 'hidden';
      else if (st.mode === 'hide') pose = st.holding ? 'breath' : st.pod ? 'still' : 'covers';
      else if (st.carrying) pose = 'carry';
      else if (st.table) pose = 'table';
      else if (!showItems) pose = 'hidden';
      else pose = 'items';
      reachT = Math.max(0, reachT - dt);
      mirrorLights(st.world, camera, st);

      // where the two things want to be (camera space): the right hand's item, the torch's other place, the swap between them
      const lag = invCamQ.clone().multiply(lagQ);
      const lagged = (at, q, k = 1) => { const lq = new THREE.Quaternion().slerp(lag, k); return { at: at.clone().applyQuaternion(lq), q: lq.multiply(q) }; };
      const torchRight = () => { const e = easeUp(S.tor); const at = TORCH.at.clone().lerp(TORCH_AIM.at, e); at.y += overshoot(S.tor) * 0.012; return lagged(at, eq(0, lerp(TORCH.ry, TORCH_AIM.ry, e)), 1 - 0.6 * e); };
      // (in the left hand while the camera is at the eye it is held a little lower, its lamp under the finder's frame)
      const torchLeft = () => lagged(TORCH_L.at.clone().add(tmp.set(0, -0.035 * smooth(S.cam.k), 0)), eq(0, TORCH_L.ry), 0.8);
      const torchPin = () => ({ at: TORCH_PIN.at.clone(), q: eq(TORCH_PIN.rx) });
      const handoff = () => ({ at: HANDOFF.at.clone(), q: eq(HANDOFF.rx) });
      const camRight = () => {
        const e = easeUp(S.cam), o = overshoot(S.cam);
        const at = CAM_LOW_R.at.clone().lerp(CAM_UP_R.at, e), q = eq(CAM_LOW_R.rx, CAM_LOW_R.ry, CAM_LOW_R.rz).slerp(eq(CAM_UP_R.rx, CAM_UP_R.ry, CAM_UP_R.rz), e);
        if (o) at.add(tmp.copy(CAM_UP_R.at).sub(CAM_LOW_R.at).normalize().multiplyScalar(0.03 * o));
        return e > 0.98 ? { at, q } : lagged(at, q, 1 - e);
      };
      const away = (p) => ({ at: p.at.clone().add(AWAY), q: p.q.clone() });
      const mix = (a, b, k) => ({ at: a.at.clone().lerp(b.at, k), q: a.q.clone().slerp(b.q, k) });
      // the torch where the camera is held: in the left hand, pointing ahead while lit and carried a little lower while dark; dark, it is
      // let down out of sight while the camera is up, so the left hand can steady the camera. With the pin, lit, under the right forearm
      const torchStowed = () => away(torchLeft());
      const torchDark = () => { const p = torchLeft(); p.at.y -= 0.025; p.at.z += 0.015; return p; };
      const torchBeside = (litNow, pin) => (litNow && pin ? { ...torchPin(), holder: 'pin' } : litNow ? { ...torchLeft(), holder: 'L' }
        : S.cam.k > 0.5 ? { ...torchStowed(), holder: 'L', stowed: true } : { ...torchDark(), holder: 'L' });
      let T = null, C = null;   // { at, q, holder: 'R' | 'L' | 'pin' }
      const pin = !!st.torchPin;
      if (pose === 'items' || pose === 'camera') {
        if (S.script) { C = { ...camRight(), holder: 'R' }; T = has('torch', st) ? torchBeside(lit, pin) : null; }
        else if (S.sw < 1) {
          // the swap: the torch passes between the hands low in the middle (to the left one, lit or dark, keeping its light; with the pin
          // and lit, to under the right forearm) while the camera goes down out of sight or comes up into the right hand in the second
          // half. Halfway, one in each hand.
          const k = S.sw, a = smooth(Math.min(1, k / 0.5)), b = smooth(Math.max(0, (k - 0.5) / 0.3));
          const pinned = S.swLit && S.swPin, side = S.swLit ? torchLeft() : torchDark();
          if (S.swFrom === 'torch') {
            const rest = torchRight();
            if (pinned) T = k < 0.5 ? { ...mix(rest, torchPin(), a), holder: 'R' } : { ...torchPin(), holder: 'pin' };
            else T = k < 0.5 ? { ...mix(rest, handoff(), a), holder: 'R' } : { ...mix(handoff(), side, b), holder: 'L' };
            const low = camRight(); C = k >= 0.5 ? { ...mix(away(low), low, b), holder: 'R' } : null;
          } else {
            const low = camRight(); C = k < 0.5 ? { ...mix(low, away(low), a), holder: 'R' } : null;
            const rest = torchRight();
            if (pinned) T = k < 0.5 ? { ...torchPin(), holder: 'pin' } : { ...mix(torchPin(), rest, b), holder: 'R' };
            else T = k < 0.5 ? { ...mix(side, handoff(), a), holder: 'L' } : { ...mix(handoff(), rest, b), holder: 'R' };
          }
        } else if (S.active === 'torch') { T = has('torch', st) ? { ...torchRight(), holder: 'R' } : null; }
        else { C = { ...camRight(), holder: 'R' }; T = has('torch', st) ? torchBeside(lit, pin) : null; }
      }
      // the sway of the walk and the fear's tremble, on what is held (halved while aiming)
      swayK += ((want ? 0.5 : 1) - swayK) * Math.min(1, dt * 6);
      const f = st.fear || 0, w = st.walk || 0;
      const swayAt = (side) => {
        shake.set(Math.sin(t * 31 + (side === 'R' ? 0 : 2)) * 0.002 + Math.sin(t * 13.7) * 0.0012, Math.sin(t * 27.3 + 1) * 0.002, 0).multiplyScalar(f * 1.4);
        sway.copy(shake); sway.y += Math.sin((st.bob || 0) + (side === 'R' ? 0 : Math.PI)) * 0.008 * w + Math.sin(t * 1.3) * 0.002; sway.x += Math.cos((st.bob || 0) * 0.5) * 0.004 * w;
        return sway.multiplyScalar(swayK);
      };
      // the held things follow their places smoothly (a little quicker while aimed, so the finder settles)
      const kItem = 1 - Math.exp(-dt * (S.sw < 1 ? 30 : want ? 22 : 15));
      const follow = (h, P, side) => {
        if (!P) return;
        const goal = P.at.clone().add(swayAt(side === 'pin' ? 'R' : side));
        if (!h.init) { h.p.copy(goal); h.q.copy(P.q); h.init = true; }
        h.p.lerp(goal, kItem); h.q.slerp(P.q, kItem);
      };
      follow(held.torch, T, T && T.holder); follow(held.cam, C, 'R');
      if (!T) held.torch.init = false;
      if (!C) held.cam.init = false;

      // each hand's target
      const tg = {};
      const torchG = (side) => gripTarget(side, held.torch.p, held.torch.q, side === 'R' ? TORCH : TORCH_L, { curl: 0.95, thumb: 0.55, obj: torch, hold: true });
      const camR = () => gripTarget('R', held.cam.p, held.cam.q, CAMGRIP_R1, { curl: 0.85, thumb: 0.55, idx: 0.45, obj: cam, hold: true });
      if (pose === 'items' || pose === 'camera') {
        tg.R = C && C.holder === 'R' ? camR() : T && T.holder === 'R' ? torchG('R') : freeR(FREE.hidR);
        const steady = C && !(T && T.holder === 'L' && !T.stowed) && S.cam.k > 0.6 && S.sw >= 1;
        tg.L = steady ? gripTarget('L', held.cam.p, held.cam.q, CAMGRIP_L, { curl: 0.3, thumb: 0.2, obj: cam, hold: true }) : T && T.holder === 'L' ? torchG('L') : freeL(FREE.hidL);
      } else if (pose === 'covers') { const q0 = new THREE.Quaternion(); tg.R = gripTarget('R', FOLD.at, q0, FOLD.R, { curl: 1, thumb: 0.6, obj: foldG, r: FOLD.r }); tg.L = gripTarget('L', FOLD.at, q0, FOLD.L, { curl: 1, thumb: 0.6, obj: foldG, r: FOLD.r }); }
      else if (pose === 'breath') { tg.R = freeR(FREE.breath); tg.L = st.pod ? freeL(FREE.stillL) : gripTarget('L', FOLD.at, new THREE.Quaternion(), FOLD.L, { curl: 1, thumb: 0.6, obj: foldG, r: FOLD.r }); }
      else if (pose === 'still') { tg.R = freeR(FREE.stillR); tg.L = freeL(FREE.stillL); }
      // the torch passing to the left hand: the left comes up open to meet it before it lets the right one go
      if (S.sw < 0.5 && S.swFrom === 'torch' && !(S.swLit && S.swPin) && T && tg.L && !tg.L.hold) {
        const m = smooth(S.sw / 0.5), meet = torchG('L');
        tg.L = { ...meet, p: tg.L.p.clone().lerp(meet.p, m), q: tg.L.q.clone().slerp(meet.q, m), curl: 0.2, thumb: 0.15, obj: null, hold: false };
      }
      if (pose === 'carry' && !poseCarry(tg, st)) pose = 'hidden';
      if (pose === 'table' && !poseTable(tg, st)) pose = 'hidden';
      if (!tg.R) tg.R = freeR(FREE.hidR);
      if (!tg.L) tg.L = freeL(FREE.hidL);
      // a reach: the free hand goes out open, fingertips first, palm down and a little forward, toward what you use
      const reachSide = !tg.R.hold ? 'R' : !tg.L.hold ? 'L' : null;
      if (reachT > 0 && reachSide && !(pose === 'camera' && S.cam.k > 0.5)) {
        const s = reachSide === 'R' ? 1 : -1, T0 = tg[reachSide];
        const r = Math.sin(Math.min(1, (0.55 - reachT) / 0.55) * Math.PI), F = reachP.clone().sub(V(0.16 * s, -0.26, 0)).normalize();
        const pn = V(0, -1, -0.45).addScaledVector(F, -V(0, -1, -0.45).dot(F)).normalize();
        const rt = { p: reachP.clone().addScaledVector(F, -0.11), q: handQ(reachSide, F, pn), curl: 0.16, thumb: 0.12, idx: 0.1, pole: V(0.7 * s, -1, 0.15) };
        tg[reachSide] = { ...rt, p: T0.p.clone().lerp(rt.p, r), q: T0.q.clone().slerp(rt.q, r), curl: lerp(T0.curl ?? 0.4, rt.curl, r), thumb: lerp(T0.thumb ?? 0.3, rt.thumb, r), idx: lerp(T0.idx ?? T0.curl ?? 0.4, rt.idx, r), pole: rt.pole };
      }
      // the wind-on: the right thumb rolls the wheel with a small turn of the wrist
      if (C && C.holder === 'R' && S.cam.wind > 0 && S.cam.shut <= 0) {
        wind += dt; camera3.wheel.rotation.y = -wind * 9;
        tg.R.q = tg.R.q.clone().multiply(eq(0, 0, Math.sin(wind * 14) * 0.04)); tg.R.thumb = 0.55 + Math.sin(wind * 14) * 0.25;
      }

      // blend toward the targets (never snapped): a hand on a held thing stays on it, a free hand eases (with the walk's sway)
      for (const side of ['R', 'L']) {
        const T1 = tg[side];
        if (!cur[side]) cur[side] = { p: T1.p.clone(), q: T1.q.clone(), curl: T1.curl ?? 0.4, thumb: T1.thumb ?? 0.3, idx: T1.idx ?? T1.curl ?? 0.4, pole: T1.pole.clone() };
        const c = cur[side];
        const k = 1 - Math.exp(-dt * (T1.hold ? (c.p.distanceTo(T1.p) < 0.03 ? 40 : 16) : pose === 'breath' ? 14 : 9));   // on its thing it stays there; on the way to it, it travels
        tmp.copy(T1.p); if (!T1.hold) tmp.add(swayAt(side));
        c.p.lerp(tmp, k); c.q.slerp(T1.q, k); c.pole.lerp(T1.pole, k);
        const kf = 1 - Math.exp(-dt * 12);
        c.curl = lerp(c.curl, T1.curl ?? 0.4, kf); c.thumb = lerp(c.thumb, T1.thumb ?? 0.3, kf); c.idx = lerp(c.idx, T1.idx ?? T1.curl ?? 0.4, kf);
        c.obj = T1.obj || null;
        const h = side === 'R' ? R : L; h.hand.position.copy(c.p); h.hand.quaternion.copy(c.q); curlHand(h, c.curl);
      }

      // the held things, where they are
      torch.visible = !!T && held.torch.p.y > -0.4 && !(T.stowed && tg.L && tg.L.obj === cam) && (pose === 'items' || pose === 'camera');
      if (torch.visible) { torch.position.copy(held.torch.p); torch.quaternion.copy(held.torch.q); }
      lensM.visible = lit;
      cam.visible = !!C && held.cam.p.y > -0.4 && (pose === 'items' || pose === 'camera');
      if (cam.visible) { cam.position.copy(held.cam.p); cam.quaternion.copy(held.cam.q); }
      foldG.visible = pose === 'covers' || (pose === 'breath' && !st.pod);
      foldG.position.copy(FOLD.at); foldG.quaternion.identity();
      // the beam: straight down the look; pinned under the arm it lights the floor ahead; while the torch changes hands it dips with it
      beamQ.identity();
      if (T && T.holder === 'pin' && S.sw >= 1) beamQ.copy(held.torch.q);
      else if (T && S.sw < 1) beamQ.slerp(held.torch.q, Math.sin(Math.PI * S.sw));
      api._beamPin = !!(T && T.holder === 'pin');
      api._torchHand = T ? T.holder : null;

      const inView = pose !== 'hidden' || cur.R.p.y > -0.45 || cur.L.p.y > -0.45;
      if (arms.ready && inView) {
        for (const [b, q] of arms.rest) b.quaternion.copy(q);
        arms.root.updateMatrixWorld(true);
        poseArm('R', cur.R, camQ); poseArm('L', cur.L, camQ);
        poseFingers('R', cur.R); poseFingers('L', cur.L);
      }
      if (debug) Object.assign(report, { pose, active: S.active, state: api.state, aimed: api.aimed, torch: torch.visible, torchHand: api._torchHand, cam: cam.visible, Rp: cur.R.p.toArray().map((v) => +v.toFixed(3)), Lp: cur.L.p.toArray().map((v) => +v.toFixed(3)) });
      if (finder) { const up = (C && C.holder === 'R') ? Math.max(0, (S.cam.k - 0.6) / 0.4) : 0; finder.show(pose === 'items' || pose === 'camera' ? up : 0, S.cam.wind <= 0 && api.film > 0, api.film); }
      spill.intensity = lit ? 0.28 : 0;
      shown = pose !== 'hidden' || cur.R.p.y > -0.45 || cur.L.p.y > -0.45;
      if (arms.root) arms.root.visible = shown;
      R.hand.visible = L.hand.visible = !arms.ready && shown;
      rig.updateMatrixWorld(true);
    },
    // where the flashlight's beam starts, in the camera's frame (the lens of the torch in whichever hand holds it)
    lens(out) { torch.updateMatrix(); return out.copy(LANTERN.lens).applyMatrix4(torch.matrix); },
    // which way the beam points, in the camera's frame (straight ahead but for the pin and the hand-off)
    beamDir(out) { return out.copy(beamFwd).applyQuaternion(beamQ); },
    // a shot from the chest: the camera where the right hand carries it, looking where you look, the print tilted by roll (radians)
    hipPose(camera, outP, outQ, roll) {
      camera.updateMatrixWorld();
      outP.copy(CAM_LOW_R.at).add(CAM_LENS).applyMatrix4(camera.matrixWorld);
      camera.getWorldQuaternion(outQ); outQ.multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), roll));
      return outP;
    },
  };
  return api;
}
