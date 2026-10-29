// The vigil: the power is out, one tea light burns in the hall, and grandpa sits in a chair at the far end of it, lit by a flashlight on the floor.
// Walk up to him and he turns over his shoulder with the thing's eyes and smile, screams, and you fall into a nightmare.
import * as THREE from 'three';
import { smile as smileTex } from './textures.js';
import { flicker as lightFlicker } from './settings.js';

const SEAT = { x: 3.5, z: -0.6 };      // the chair: against the north side of the hall, facing west (its back to the bedroom end)
const CANDLE = { x: 5.2, z: -0.95 };   // the tea light, on the floor in the middle of the hall
const FLASH = { x: 3.86, z: -0.84 };   // the flashlight, on the floor beside the chair, pointed at him
const TRIGGER = 2.5;                   // how close you have to get

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

  // the props: a wooden chair, a man in a cardigan sitting in it, a flashlight on the floor, a tea light
  function setup() {
    if (rig) return rig;
    const g = new THREE.Group(); g.visible = false; scene.add(g);
    const mat = (c, r = 0.9) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
    const wood = mat('#6b4a2e', 0.8), cardigan = mat('#6d6a4f'), pants = mat('#4a4a48'), skin = mat('#c8a488', 0.7), hair = mat('#c8c8c0', 0.95);
    const box = (parent, w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; parent.add(b); return b; };
    // chair and man share one frame that faces +z; the frame is turned to face west, so +z is toward the living room
    const set = new THREE.Group(); set.position.set(SEAT.x, 0, SEAT.z); set.rotation.y = -Math.PI / 2; g.add(set);
    box(set, 0.46, 0.05, 0.46, wood, 0, 0.46, 0);
    for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) box(set, 0.04, 0.46, 0.04, wood, x, 0.23, z);
    for (const x of [-0.2, 0.2]) box(set, 0.04, 0.5, 0.04, wood, x, 0.71, -0.2);
    box(set, 0.46, 0.14, 0.04, wood, 0, 0.86, -0.2);
    // the man: thighs out over the seat, shins down, the cardigan, arms on his lap
    box(set, 0.2, 0.14, 0.42, pants, 0, 0.53, 0.1);
    box(set, 0.17, 0.53, 0.14, pants, 0, 0.265, 0.33);
    box(set, 0.2, 0.07, 0.26, mat('#2a2220'), 0, 0.035, 0.42);
    const torso = new THREE.Group(); torso.position.set(0, 0.56, 0); set.add(torso);
    box(torso, 0.42, 0.56, 0.26, cardigan, 0, 0.28, -0.04);
    for (const x of [-0.26, 0.26]) { box(torso, 0.1, 0.32, 0.1, cardigan, x, 0.26, 0); box(torso, 0.09, 0.09, 0.3, skin, x * 0.9, 0.09, 0.16); }
    const head = new THREE.Group(); head.position.set(0, 0.58, -0.02); torso.add(head);
    box(head, 0.1, 0.1, 0.1, skin, 0, -0.07, 0);   // neck
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.125, 18, 14), skin); skull.position.y = 0.14; skull.castShadow = true; head.add(skull);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.13, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), hair); cap.position.set(0, 0.155, -0.012); head.add(cap);
    // the face: the thing's eyes and smile, hidden until he turns
    const face = new THREE.Group(); face.position.y = 0.14; face.visible = false; head.add(face);
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), black = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false });
    for (const x of [-0.042, 0.042]) {
      const e = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.034), white); e.position.set(x, 0.02, 0.122); face.add(e);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.018, 0.018), black); p.position.set(x, 0.02, 0.124); face.add(p);
    }
    const smile = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.055), new THREE.MeshBasicMaterial({ map: smileTex(), transparent: true, alphaTest: 0.4, toneMapped: false }));
    smile.position.set(0, -0.045, 0.124); face.add(smile);
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
    rig = { g, set, torso, head, face, smile, spot, flame, flameMat, candleLight };
    return rig;
  }

  // the night's sequence: called by the director as the night's type. until(fn) resolves when fn() is true, or the night is over.
  async function run(plan, until) {
    const r = setup();
    on = true; t = 0; r.g.visible = true; r.set.visible = true; r.head.rotation.y = 0; r.torso.rotation.y = 0; r.face.visible = false; r.spot.intensity = 0;
    env.powerOut(true); F.noFlash = true; sfx.drone(0, 3); sfx.tension(0, 3);
    UI.subtitle('<i>The power went out. The fridge stopped in the middle of a hum. Nobody says a word.</i>', 4.5);
    r.spot.intensity = 26;
    await env.wait(4); if (!on) return;
    await until(() => P.pos.x < 4.6 && Math.hypot(P.pos.x - SEAT.x, P.pos.z - SEAT.z) < TRIGGER && P.mode === 'walk' && !F.cutscene);
    if (!on) return;

    // he is talking before he turns; the camera stops where you stand and turns to him
    F.cutscene = true; F.script = true; P.mode = 'cine'; P.cam.copy(env.camera.position); P.vel.set(0, 0, 0);
    const head = r.head.getWorldPosition(new THREE.Vector3()), from = P.cam.clone();
    const aimYaw = Math.atan2(-(head.x - from.x), -(head.z - from.z)), aimPitch = Math.atan2(head.y - env.EYE, Math.hypot(head.x - from.x, head.z - from.z));
    const y0 = P.yaw, p0 = P.pitch;
    await env.tween(1.0, (k) => { P.yaw = y0 + env.angDiff(y0, aimYaw) * k; P.pitch = env.lerp(p0, aimPitch, k); }, env.ease.inOut);
    await env.say('gramps/v_a'); if (!on) return;
    await env.wait(0.5); if (!on) return;

    // he turns over his right shoulder, slowly, and looks back at you
    flicker = true;
    await Promise.all([
      env.tween(2.4, (k) => { r.head.rotation.y = -0.93 * Math.PI * k; r.torso.rotation.y = -0.3 * k; r.face.visible = k > 0.82; }, env.ease.inOut),
      env.say('gramps/v_b'),
    ]);
    if (!on) return;
    await env.wait(0.9); if (!on) return;

    // the scream, and the piano coming down on the bottom of the keys
    flicker = false; r.spot.intensity = 90;
    sfx.scream(); sfx.pianoSlam(); sfx.tone({ type: 'sawtooth', f: 1400, f2: 90, dur: 2.2, gain: 0.45, wet: 0.5 }); env.addShake(1.8);
    UI.flash('rgba(255,255,255,0.85)', 0.5); r.smile.scale.set(1.5, 1.6, 1);
    await env.wait(0.35); if (!on) return; r.spot.intensity = 26; r.smile.scale.set(1, 1, 1);

    // you go down, all at once
    await env.tween(1.5, (k) => { P.cam.y = env.lerp(env.EYE, 0.12, k); P.roll = 0.9 * k; P.pitch = env.lerp(aimPitch, -1.15, k); }, env.ease.in);
    if (!on) return;

    // the nightmare: the room turns over and over, the colours go wrong, the voices come from everywhere
    document.body.classList.add('nightmare');
    sfx.heartbeat(0.7); sfx.whisper(-0.7, 0.22); sfx.whisper(0.8, 0.2);
    let shown = -1; const yaw0 = P.yaw;
    await env.tween(9, (k) => {
      P.roll = Math.sin(k * 15) * 0.5 * (1 - k * 0.5); P.pitch = -1.15 + Math.sin(k * 11) * 0.3; P.yaw = yaw0 + Math.sin(k * 9) * 0.12;
      env.setFovOff(-34 + Math.sin(k * 13) * 34);
      const i = Math.min(DREAM.length - 1, Math.floor(k * DREAM.length));
      if (i !== shown) { shown = i; UI.subtitle(DREAM[i], 1.8); sfx.whisper(Math.sin(i * 2.1), 0.14 + i * 0.01); }
      if (i === 3) sfx.pianoSlam();
    }, env.ease.lin);
    if (!on) return;

    // then the bunk, and the candle is out
    document.body.classList.remove('nightmare'); env.setFovOff(0);
    UI.fade(1, 0.6); await env.wait(0.8); if (!on) return;
    env.toBunk(); P.roll = 0; P.pitch = -0.18; r.set.visible = false; r.candleLight.intensity = 0; r.flame.visible = false; r.spot.intensity = 0;
    UI.fade(0, 2.5); await env.wait(2.2);
    UI.subtitle('<i>You wake up in your bunk. Your heart is going like a drum. The house is still dark.</i>', 5);
    F.cutscene = false; F.script = false;
  }

  // the house holds the dark until morning, then all of it goes away
  function stop() {
    if (on) env.powerOut(false);
    on = false; flicker = false;
    if (rig) { rig.g.visible = false; rig.set.visible = false; rig.spot.intensity = 0; rig.candleLight.intensity = 0; rig.flame.visible = true; }
    F.noFlash = false; document.body.classList.remove('nightmare'); env.setFovOff(0);
  }

  // per frame: the candle breathes, the flashlight stutters while he is about to turn
  function update(dt) {
    if (!on || !rig) return;
    t += dt;
    const f = 1.3 + Math.sin(t * 17) * 0.1 + Math.sin(t * 41) * 0.05 + (Math.random() - 0.5) * 0.12;
    rig.candleLight.intensity = f; rig.flame.scale.setScalar(0.9 + Math.random() * 0.25);
    if (flicker) rig.spot.intensity = lightFlicker('vigil', Math.random() < 0.12 ? 2 : 26, 26);
  }

  return { run, stop, update, isOn: () => on };
}
