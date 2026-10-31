// The vigil: the power is out, one tea light burns in the hall, and grandpa sits in a chair at the far end of it in his tweed jacket, lit by
// a flashlight on the floor. Walk up to him and he turns over his shoulder with the thing's eyes and smile, screams, and you fall into a nightmare.
import * as THREE from 'three';
import { smile as smileTex } from './textures.js';
import { flicker as lightFlicker } from './settings.js';
import { Rig, loadModel } from './rig.js';
import { swimFrame } from './swim.js';

const SEAT = { x: 3.5, z: -0.65 };     // the chair: against the north side of the hall, facing west (its back to the bedroom end); any closer and his shoulder is in the wall
const CANDLE = { x: 5.2, z: -0.95 };   // the tea light, on the floor in the middle of the hall
const FLASH = { x: 3.86, z: -0.84 };   // the flashlight, on the floor beside the chair, pointed at him
const TRIGGER = 2.5;                   // how close you have to get

// the thing's face, painted over his head texture. Fractions of the texture, measured on the model; the image is stored upside down,
// so the forehead is toward the bottom of it.
const FACE = [0.5, 0.64, 0.185, 0.225];                         // the front of his face, chin to brow
const EYES = [[0.4404, 0.7041, 0.3], [0.5605, 0.7041, -0.3]];   // round each eye, tilted out at the top
const EYEBALL = [0.2632, 0.0681, 0.0566, 0.0571];               // both eyeballs use this patch
const GRIN = { tl: [0.3994, 0.6221], tr: [0.6012, 0.6221], bl: [0.3947, 0.5359] };   // the smile canvas's corners: under the nose to the chin

// his texture with the face painted on, and a glow map with only the eyes and the grin; s scales the grin (the scream)
function paintFace(img, smile, s = 1) {
  const W = img.width, H = img.height, canvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
  const col = canvas(W, H), glow = canvas(W / 2, H / 2), a = col.getContext('2d'), b = glow.getContext('2d');
  a.drawImage(img, 0, 0);
  b.fillStyle = '#000'; b.fillRect(0, 0, W / 2, H / 2); b.scale(0.5, 0.5);
  const [fx, fy, frx, fry] = FACE;
  a.save(); a.translate(fx * W, fy * H); a.scale(frx * W, fry * H);
  const dark = a.createRadialGradient(0, 0, 0, 0, 0, 1); dark.addColorStop(0.68, '#0a0909'); dark.addColorStop(1, 'rgba(10,9,9,0)');
  a.fillStyle = dark; a.beginPath(); a.arc(0, 0, 1, 0, Math.PI * 2); a.fill(); a.restore();
  const [ex, ey, erx, ery] = EYEBALL, { tl, tr, bl } = GRIN, cx = (tr[0] + bl[0]) / 2 * W, cy = (tr[1] + bl[1]) / 2 * H;
  for (const g of [a, b]) {
    g.fillStyle = '#f3f0ea';
    for (const [u, v, tilt] of EYES) { g.beginPath(); g.ellipse(u * W, v * H, 0.026 * W, 0.034 * H, tilt, 0, Math.PI * 2); g.fill(); }
    g.beginPath(); g.ellipse(ex * W, ey * H, erx * W, ery * H, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#000'; g.beginPath(); g.arc(ex * W, ey * H, 0.025 * W, 0, Math.PI * 2); g.fill();
    g.save(); g.translate(cx, cy); g.scale(s, 1 + (s - 1) * 1.2); g.translate(-cx, -cy);
    g.transform((tr[0] - tl[0]) * W / smile.width, (tr[1] - tl[1]) * H / smile.width, (bl[0] - tl[0]) * W / smile.height, (bl[1] - tl[1]) * H / smile.height, tl[0] * W, tl[1] * H);
    g.drawImage(smile, 0, 0); g.restore();
  }
  return [col, glow];
}

const DREAM = [
  '<i>The candle is still lit. It is the only thing in the house that is.</i>',
  '<i>Your bunk is on the ceiling now. It has always been on the ceiling.</i>',
  "<i>Dad says don't look behind you. Something is smiling from every door.</i>",
  '<i>Mom is singing in the kitchen. The song is going backwards.</i>',
  '<i>You are not falling. The floor is coming up to meet you, very politely.</i>',
  '<i>Grandpa is at the end of the hall. He has your eyes now. He is smiling with all of them.</i>',
  '<i>Wake up. Wake up. Wake up.</i>',
];

export function createVigil(env) {
  const { scene, P, F, sfx, UI } = env;
  let rig = null, on = false, t = 0, flicker = false;
  let gp = null, gpState = 'none', setFace = () => {}, turnK = 0, turnT = 2.9;

  // the props: a wooden chair with grandpa in it, a flashlight on the floor, a tea light
  function setup() {
    if (rig) return rig;
    const g = new THREE.Group(); g.visible = false; scene.add(g);
    const mat = (c, r = 0.9) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
    const wood = mat('#6b4a2e', 0.8);
    const box = (parent, w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; parent.add(b); return b; };
    // chair and man share one frame that faces +z; the frame is turned to face west, so +z is toward the living room
    const set = new THREE.Group(); set.position.set(SEAT.x, 0, SEAT.z); set.rotation.y = -Math.PI / 2; g.add(set);
    box(set, 0.46, 0.05, 0.46, wood, 0, 0.46, 0);
    for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) box(set, 0.04, 0.46, 0.04, wood, x, 0.23, z);
    for (const x of [-0.2, 0.2]) box(set, 0.04, 0.5, 0.04, wood, x, 0.71, -0.2);
    box(set, 0.46, 0.14, 0.04, wood, 0, 0.86, -0.2);
    loadGrandpa(set);
    // the flashlight on the floor, and the beam it throws at the chair
    const fl = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.16, 10), mat('#1a1a1a', 0.4));
    fl.rotation.set(0, 0.6, Math.PI / 2); fl.position.set(FLASH.x, 0.025, FLASH.z); g.add(fl);
    const spot = new THREE.SpotLight(0xfff1d6, 26, 7, 0.36, 0.5, 1.4);
    spot.position.set(FLASH.x, 0.09, FLASH.z); spot.target.position.set(SEAT.x, 0.95, SEAT.z); scene.add(spot, spot.target); spot.intensity = 0;
    // the tea light: a white puck, a small flame, and the warm light it gives the hall
    const puck = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.03, 12), mat('#f2eee2', 0.6)); puck.position.set(CANDLE.x, 0.015, CANDLE.z); g.add(puck);
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffc070, toneMapped: false });
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), flameMat); flame.position.set(CANDLE.x, 0.042, CANDLE.z); g.add(flame);
    const candleLight = new THREE.PointLight(0xffa64d, 0, 3.4, 2); candleLight.position.set(CANDLE.x, 0.14, CANDLE.z); scene.add(candleLight);
    rig = { g, set, spot, flame, flameMat, candleLight };
    return rig;
  }

  // grandpa (assets/models/grandpa.glb) is loaded the first time the vigil runs, and goes into the chair only once he is posed.
  // The 'sit' clip seats him in this chair at exactly 1.70 m, from the set's origin.
  function loadGrandpa(set) {
    gpState = 'loading';
    loadModel('grandpa').then((gltf) => {
      const r = new Rig(gltf, gltf.animations).setHeight(1.70);
      let head = null;
      r.root.traverse((o) => { if (o.isSkinnedMesh) { o.castShadow = false; if (o.material.name === 'm004_head') head = o.material; } });
      if (head) setFace = faceKit(head);
      r.play('sit', { fade: 0 }); r.update(1 / 60); r.update(1 / 60);
      set.add(r.root); gp = r; gpState = 'ready';
    }).catch((e) => { console.warn('grandpa model failed:', e); gpState = 'failed'; });
  }
  // his own face ('man'), the thing's ('thing') and the thing's screaming ('scream'). The glow map stays on the material with the glow
  // off, so the reveal swaps textures and never rebuilds the shader.
  function faceKit(mat) {
    const plain = mat.map, smile = smileTex().image;
    const tex = (c) => { const t = new THREE.CanvasTexture(c); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = plain.anisotropy; return t; };
    const [calm, scream] = [1, 1.5].map((s) => paintFace(plain.image, smile, s).map(tex));
    if (env.initTexture) for (const t of [...calm, ...scream]) env.initTexture(t);
    mat.emissiveMap = calm[1]; mat.emissive.setScalar(0); mat.needsUpdate = true;
    return (kind) => {
      const [map, glow] = kind === 'man' ? [plain, calm[1]] : kind === 'scream' ? scream : calm;
      mat.map = map; mat.emissiveMap = glow; mat.emissive.setScalar(kind === 'man' ? 0 : 1); mat.emissiveIntensity = kind === 'scream' ? 2.6 : 1.2; mat.needsUpdate = true;
    };
  }
  // he looks back over his right shoulder, k of the way, until his eyes are on the angle T. Redone every frame after the clip (the rig
  // puts the bones back on each update). Never 'Spine': the thighs hang from it in this skeleton. The clavicles hang from the neck, so they
  // take back a share of its turn and the shoulders stay put.
  const _q = new THREE.Quaternion(), _v = new THREE.Vector3();
  function turn(k, T) {
    if (k <= 0) return;
    gp.bend(['Spine1', 'Spine2'], [0.5, 0.5], [0, 1, 0], -0.3 * k);
    gp.bend(['Neck', 'L_Clavicle', 'R_Clavicle', 'Head'], [0.5, -0.5, -0.5, 0.5], [0, 1, 0], -(T - 0.3) * k);
    const hq = gp.bones.Head.getWorldQuaternion(_q);
    gp.rotateWorld(gp.bones.Head, new THREE.Quaternion().setFromAxisAngle(_v.set(0, 0, 1).applyQuaternion(hq), -0.15 * k));   // chin up, to meet your eyes
  }

  // the night's sequence: called by the director as the night's type. until(fn) resolves when fn() is true, or the night is over.
  async function run(plan, until) {
    const r = setup();
    on = true; t = 0; r.g.visible = true; r.set.visible = true; r.spot.intensity = 0; turnK = 0; setFace('man');
    env.powerOut(true); F.noFlash = true; sfx.drone(0, 3); sfx.tension(0, 3);
    r.spot.intensity = 26;
    await env.wait(4); if (!on) return;
    await until(() => gpState !== 'loading' && P.pos.x < 4.6 && Math.hypot(P.pos.x - SEAT.x, P.pos.z - SEAT.z) < TRIGGER && P.mode === 'walk' && !F.cutscene);
    if (!on) return;

    // he is talking before he turns; the camera stops where you stand and turns to his eyes
    F.cutscene = true; F.script = true; P.mode = 'cine'; P.cam.copy(env.camera.position); P.vel.set(0, 0, 0);
    const eyes = gp ? gp.bones.LEye.getWorldPosition(new THREE.Vector3()).add(gp.bones.REye.getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5) : new THREE.Vector3(SEAT.x, env.EYE, SEAT.z), from = P.cam.clone();
    const aimYaw = Math.atan2(-(eyes.x - from.x), -(eyes.z - from.z)), aimPitch = Math.atan2(eyes.y - env.EYE, Math.hypot(eyes.x - from.x, eyes.z - from.z));
    const y0 = P.yaw, p0 = P.pitch;
    await env.tween(1.0, (k) => { P.yaw = y0 + env.angDiff(y0, aimYaw) * k; P.pitch = env.lerp(p0, aimPitch, k); }, env.ease.inOut);
    await env.say('gramps/v_a'); if (!on) return;
    await env.wait(0.5); if (!on) return;

    // he turns over his right shoulder, slowly, and looks back at you; the face is the thing's by the time it comes round
    if (gp) {
      const hl = r.set.worldToLocal(gp.bones.Head.getWorldPosition(new THREE.Vector3())), cl = r.set.worldToLocal(P.cam.clone());
      turnT = THREE.MathUtils.clamp(-Math.atan2(cl.x - hl.x, cl.z - hl.z), 2.6, 3.1);
    }
    flicker = true; let thing = false;
    await Promise.all([
      env.tween(2.4, (k) => { turnK = k; if (k > 0.82 && !thing) { thing = true; setFace('thing'); } }, env.ease.inOut),
      env.say('gramps/v_b'),
    ]);
    if (!on) return;
    await env.wait(0.9); if (!on) return;

    // the scream, and the piano coming down on the bottom of the keys
    flicker = false; r.spot.intensity = 90;
    sfx.scream(); sfx.pianoSlam(); sfx.tone({ type: 'sawtooth', f: 1400, f2: 90, dur: 2.2, gain: 0.45, wet: 0.5 }); env.addShake(1.8);
    UI.flash('rgba(255,255,255,0.85)', 0.5); setFace('scream');
    await env.wait(0.35); if (!on) return; r.spot.intensity = 26; setFace('thing');

    // you go down, all at once
    await env.tween(1.5, (k) => { P.cam.y = env.lerp(env.EYE, 0.12, k); P.roll = 0.9 * k; P.pitch = env.lerp(aimPitch, -1.15, k); }, env.ease.in);
    if (!on) return;

    // the nightmare: the room turns over and over, the colours go wrong, the voices come from everywhere
    document.body.classList.add('nightmare');
    sfx.heartbeat(0.7); sfx.whisper(-0.7, 0.22); sfx.whisper(0.8, 0.2);
    let shown = -1; const yaw0 = P.yaw;
    await env.tween(9, (k) => {
      swimFrame(P, env.setFovOff, k, -1.15, yaw0);
      const i = Math.min(DREAM.length - 1, Math.floor(k * DREAM.length));
      if (i !== shown) { shown = i; sfx.whisper(Math.sin(i * 2.1), 0.14 + i * 0.01); }
      if (i === 3) sfx.pianoSlam();
    }, env.ease.lin);
    if (!on) return;

    // then the bunk, and the candle is out
    document.body.classList.remove('nightmare'); env.setFovOff(0);
    UI.fade(1, 0.6); await env.wait(0.8); if (!on) return;
    env.toBunk(); P.roll = 0; P.pitch = -0.18; r.set.visible = false; r.candleLight.intensity = 0; r.flame.visible = false; r.spot.intensity = 0;
    UI.fade(0, 2.5); await env.wait(2.2);
    F.cutscene = false; F.script = false;
  }

  // the house holds the dark until morning, then all of it goes away
  function stop() {
    if (on) env.powerOut(false);
    on = false; flicker = false;
    if (rig) { rig.g.visible = false; rig.set.visible = false; rig.spot.intensity = 0; rig.candleLight.intensity = 0; rig.flame.visible = true; }
    F.noFlash = false; document.body.classList.remove('nightmare'); env.setFovOff(0);
  }

  // per frame: he breathes and turns, the candle breathes, the flashlight stutters while he is about to turn
  function update(dt) {
    if (!on || !rig) return;
    t += dt;
    if (gp && rig.set.visible) { gp.update(dt); turn(turnK, turnT); }
    const f = 1.3 + Math.sin(t * 17) * 0.1 + Math.sin(t * 41) * 0.05 + (Math.random() - 0.5) * 0.12;
    rig.candleLight.intensity = f; rig.flame.scale.setScalar(0.9 + Math.random() * 0.25);
    if (flicker) rig.spot.intensity = lightFlicker('vigil', Math.random() < 0.12 ? 2 : 26, 26);
  }

  return { run, stop, update };
}
