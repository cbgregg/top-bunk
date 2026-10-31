// The nightmares: four things that can happen on a night, at most one a night. Each pulls the kid under, and each ends the same way: awake in
// the bunk, with something left behind in the house to find (nights.js proof). They run from the director as events (director.js, nm: true).
//   shadow    a figure in the darkest corner of the living room that only shows at the edge of your eye
//   hall      the hall that does not end: it turns you round three times and the fourth time something is standing at the far end
//   basement  the washer drums with the power out; go down and the door shuts behind you
//   mirror    the bathroom mirror, and a reflection that stays where it was
// ctx is the nights.js environment (P, F, W, E, sfx, UI, camera, tween, wait, ...) plus alive(), hunter and D.
import * as THREE from 'three';
import { smile as smileTex } from './textures.js';

const V3 = THREE.Vector3;

export function createNightmares(ctx) {
  const { P, F, W, E, sfx, UI, camera, wait, tween, lerp, hunter, D } = ctx;
  let photoMats = null;

  // the framed photographs in the house: any material whose map was loaded from assets/photos
  function photos() {
    if (photoMats) return photoMats;
    photoMats = new Set();
    W.house.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of [].concat(o.material)) if (m && m.map && m.map.image && /assets\/photos\//.test(m.map.image.src || '')) photoMats.add(m);
    });
    return photoMats;
  }
  const blackenPhotos = (on) => { for (const m of photos()) { m.userData.keep ||= m.color.clone(); if (on) m.color.set(0x000000); else m.color.copy(m.userData.keep); } };

  // out of the dream: the lenses back, the colours back, the bunk, a few seconds before anything else happens
  async function wake(token) {
    document.body.classList.remove('nightmare'); ctx.setFovOff(0); blackenPhotos(false);
    UI.fade(1, 0.5); await wait(0.7);
    for (const n of W.nightLights) n.dead = false;
    F.blackout = false; ctx.nlMult(1, false); F.flicker = false;
    ctx.toBunk(); P.roll = 0; P.pitch = -0.18; F.fear = 0.5;
    UI.fade(0, 2.4); await wait(1.6);
    F.cutscene = false; F.script = false; void token;
  }
  async function pullUnder() {
    F.script = true; F.cutscene = true; P.mode = 'cine'; P.cam.copy(camera.position); P.vel.set(0, 0, 0);
    document.body.classList.add('nightmare');
  }
  // the room turns over and over, the lens swings, the colours go wrong
  async function swim(secs, pitch0, yaw0, fn) {
    await tween(secs, (k) => {
      P.roll = Math.sin(k * 15) * 0.5 * (1 - k * 0.5); P.pitch = pitch0 + Math.sin(k * 11) * 0.3; P.yaw = yaw0 + Math.sin(k * 9) * 0.12;
      ctx.setFovOff(-34 + Math.sin(k * 13) * 34);
      if (fn) fn(k);
    }, ctx.ease.lin);
  }

  // ---------------- the shadow ----------------
  // a figure with no face: black on a dark wall, there at the edge of sight and gone when you look straight at it
  function makeShadow() {
    const g = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ color: 0x010102, transparent: true, opacity: 0, depthWrite: false, fog: true });
    const part = (geo, x, y, z, rx = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); g.add(m); return m; };
    part(new THREE.CapsuleGeometry(0.2, 0.95, 6, 12), 0, 1.0, 0, 0.18);          // a stooped body
    part(new THREE.SphereGeometry(0.15, 14, 10), 0, 1.74, 0.1);                   // a head, nothing on it
    part(new THREE.CapsuleGeometry(0.045, 0.95, 4, 8), -0.3, 0.95, 0.04, 0, 0.07); part(new THREE.CapsuleGeometry(0.045, 0.95, 4, 8), 0.3, 0.95, 0.04, 0, -0.07);   // long arms
    part(new THREE.CapsuleGeometry(0.07, 0.8, 4, 8), -0.1, 0.4, 0); part(new THREE.CapsuleGeometry(0.07, 0.8, 4, 8), 0.1, 0.4, 0);
    g.visible = false; g.userData.mat = mat; W.house.add(g);
    return g;
  }
  function corner() {
    const cands = [[-2.95, -0.8], [2.95, -0.8], [-2.95, -3.95], [2.95, -3.95]];
    const free = (x, z) => !W.colliders.some((c) => c.on && x > c.minX - 0.35 && x < c.maxX + 0.35 && z > c.minZ - 0.35 && z < c.maxZ + 0.35 && !(c.door));
    return cands.find(([x, z]) => free(x, z)) || cands[0];
  }
  async function shadow(t) {
    const sh = makeShadow(), [x, z] = corner(), mat = sh.userData.mat;
    sh.position.set(x, 0, z); sh.lookAt(0, 0, -2.4); sh.rotation.x = 0; sh.visible = true;
    const dir = new V3(), to = new V3();
    let lookT = 0, gone = false;
    const until = Date.now() + 150000;   // (real time: a night is about six minutes)
    // it is there while you are in the living room or can see into it; it shows at the edge of sight only
    while (ctx.alive(t) && !gone && Date.now() < until) {
      await wait(0.05);
      if (F.script || F.cutscene) { mat.opacity = 0; continue; }
      camera.getWorldDirection(dir); to.set(x - camera.position.x, 1.2 - camera.position.y, z - camera.position.z); const d = to.length(); to.divideScalar(d || 1);
      const cos = dir.dot(to), inLos = hunter.los(P.pos.x, P.pos.z, x, z) && d < 14;
      const edge = cos > 0.1 && cos < 0.88;                     // off to the side, not straight ahead
      const want = inLos && edge ? 1 : 0;
      if (inLos && cos >= 0.88) lookT += 0.05; else lookT = Math.max(0, lookT - 0.03);
      mat.opacity += (want - mat.opacity) * 0.12;
      if (inLos && cos >= 0.88) mat.opacity *= 0.82;           // straight on, it thins to nothing
      if (lookT > 1.0) { gone = true; break; }                  // you looked: it was never there
      if (P.mode === 'walk' && !hunter.busy && d < 1.2) { await pulled(sh, t); sh.visible = false; return; }
    }
    sh.visible = false; W.house.remove(sh);
  }
  async function pulled(sh, t) {
    await pullUnder(); sh.visible = false;
    const yaw0 = P.yaw, pitch0 = P.pitch;
    sfx.heartbeat(0.8); sfx.drone(0.12, 1); sfx.whisper(-0.7, 0.2);
    // the lights go out one by one, and the faces on the walls go black
    const lights = W.nightLights.filter((n) => !n.dead);
    let i = 0;
    await swim(8.5, pitch0, yaw0, (k) => {
      const want = Math.floor(k * (lights.length + 1) * 1.1);
      while (i < want && i < lights.length) { lights[i].dead = true; i++; sfx.click(); }
      if (k > 0.35) blackenPhotos(true);
      if (k > 0.5 && Math.random() < 0.02) sfx.whisper(Math.sin(k * 20), 0.16);
    });
    if (!ctx.alive(t)) { await wake(); return; }
    // it is suddenly at the lens
    F.blackout = true; ctx.nlMult(0, false);
    sh.position.set(camera.position.x + Math.sin(P.yaw) * -0.55, 0, camera.position.z + Math.cos(P.yaw) * -0.55); sh.rotation.y = P.yaw; sh.visible = true; sh.userData.mat.opacity = 1;
    sfx.appear(1.3); ctx.addShake(1.5); UI.flash('rgba(255,255,255,0.8)', 0.4);
    await wait(0.45);
    UI.fade(1, 0.15); await wait(0.5); sh.visible = false; W.house.remove(sh);
    await wake(); if (ctx.alive(t)) ctx.proofFire('nmShadow');
  }

  // ---------------- the hall that does not end ----------------
  async function hall(t) {
    let passes = 0, busy = false;
    const until = Date.now() + 200000;
    while (ctx.alive(t) && Date.now() < until) {
      await wait(0.1);
      if (F.script || F.cutscene || hunter.busy || P.mode !== 'walk' || ctx.roomAt(P.pos.x, P.pos.z) !== 'hall' || busy) continue;
      const west = P.pos.x < 3.95, east = P.pos.x > 7.75;
      if (!west && !east) continue;
      if (passes < 3) {
        // the far end of the hall is the end you started from; the pictures on the wall are not the same ones
        busy = true; passes++;
        UI.fade(1, 0.12); await wait(0.15);
        P.pos.x = west ? 7.3 : 4.4; P.vel.set(0, 0, 0); F.drawingLevel = (F.drawingLevel || 0) + 1; D.flicker(0.5); sfx.stab(); sfx.heavyStep(0.4, 0);
        UI.fade(0, 0.2); busy = false; F.fear = Math.max(F.fear, 0.5 + passes * 0.12);
      } else {
        // the fourth time the hall ends, and something is standing there
        busy = true; F.script = true; D.flicker(1.2); sfx.violins(0.5, 0.5);
        hunter.sight(west ? 'hallW' : 'hallE', { dur: 4, vanishOnLook: false }); ctx.addShake(1.2);
        await wait(2.6);
        await pullUnder(); ctx.nlMult(0, false); sfx.jolt(1); UI.flash('rgba(255,255,255,0.85)', 0.4);
        await wait(0.5); hunter.vanish(false);
        await wake(); if (ctx.alive(t)) ctx.proofFire('nmHall');
        return;
      }
    }
  }

  // ---------------- the basement ----------------
  async function basement(t) {
    const L = W.laundry; if (!L) return;
    L.bulb.set(true); L.drum.spin(true);
    let beat = 0; const until = Date.now() + 200000;
    while (ctx.alive(t) && Date.now() < until) {
      await wait(0.1);
      beat += 0.1; if (beat > 2.4) { beat = 0; sfx.thump(); sfx.noiseHit({ dur: 0.4, type: 'lowpass', f: 300, gain: 0.35, pan: ctx.pan(-7.6, 1.6), wet: 0.3 }); }
      if (F.script || F.cutscene || P.mode !== 'walk') continue;
      if (ctx.roomAt(P.pos.x, P.pos.z, P.pos.y) === 'laundry') { await down(L, t); L.drum.spin(false); return; }
    }
    L.drum.spin(false); L.bulb.set(false);
  }
  async function down(L, t) {
    F.script = true; ctx.nlMult(0, false);
    W.setDoor('basement', false); sfx.slamFar(0.3); sfx.thump(); ctx.addShake(0.9);   // the door shuts behind you
    await wait(0.8);
    L.sink.set(true); if (L.sink.stream && L.sink.stream.material) L.sink.stream.material.color.set(0x000000);   // the water runs black
    L.bulb.set(false); sfx.faucet(6, ctx.pan(-5.65, 0.1));
    await wait(1.6);
    sfx.lurk(ctx.pan(-7.67, 1.62), 1, 3.2); await wait(3.4);                                 // a voice, inside the washer
    sfx.lurk(ctx.pan(-7.67, 1.62), 1, 2.4); L.washer.open(1); sfx.slamFar(-0.4); ctx.addShake(1.6); sfx.appear(1.2);   // the lid bangs open
    await wait(0.5);
    F.script = false; await pullUnder();
    await swim(4, P.pitch, P.yaw);
    L.sink.set(false); if (L.sink.stream && L.sink.stream.material) L.sink.stream.material.color.set(0xb9c6cc); L.washer.open(0);
    W.setDoor('basement', false);
    await wake(); if (ctx.alive(t)) ctx.proofFire('nmBasement');
  }

  // ---------------- the mirror ----------------
  async function mirror(t) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.74, 0.66), new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false, fog: false, opacity: 0 }));
    const cv = document.createElement('canvas'); cv.width = 148; cv.height = 132; const g = cv.getContext('2d'), tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; m.material.map = tex;
    m.rotation.y = -Math.PI / 2; m.position.set(4.838, 1.6, 0.9); W.house.add(m);
    const paint = (face) => {   // the room behind you, empty, and you in front of it, standing exactly where you were
      const gr = g.createLinearGradient(0, 0, 148, 132); gr.addColorStop(0, '#20262c'); gr.addColorStop(1, '#0d1013'); g.fillStyle = gr; g.fillRect(0, 0, 148, 132);
      g.fillStyle = '#050607'; g.beginPath(); g.ellipse(74, 118, 40, 34, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(74, 56, 22, 27, 0, 0, 7); g.fill();
      if (face) { g.drawImage(smileTex().image, 0, 0, 148, 74, 36, 52, 76, 38); g.fillStyle = '#fff'; g.beginPath(); g.ellipse(64, 48, 5, 7, 0.3, 0, 7); g.ellipse(84, 48, 5, 7, -0.3, 0, 7); g.fill(); }
      tex.needsUpdate = true;
    };
    const until = Date.now() + 200000; let shown = false;
    while (ctx.alive(t) && Date.now() < until) {
      await wait(0.1);
      if (F.script || F.cutscene || P.mode !== 'walk' || hunter.busy) continue;
      const d = Math.hypot(P.pos.x - 4.84, P.pos.z - 0.9);
      if (ctx.roomAt(P.pos.x, P.pos.z) !== 'bath' || d > 1.7) continue;
      shown = true; break;
    }
    if (!shown) { W.house.remove(m); return; }
    F.script = true; paint(false);
    sfx.breath(true, 0.5); await wait(1.4); sfx.breath(false, 0.5);
    for (let k = 0; k <= 1 && ctx.alive(t); k += 0.1) { m.material.opacity = k; await wait(0.08); }
    await wait(2.4);
    // you move and it does not
    sfx.breath(true, 0.6); sfx.lurk(ctx.pan(3.9, 0.9), 0.9, 2.4);
    let moved = 0; const x0 = P.pos.x, z0 = P.pos.z;
    F.script = false;
    const t0 = Date.now();
    while (ctx.alive(t) && moved < 0.45 && Date.now() - t0 < 14000) { await wait(0.1); moved = Math.hypot(P.pos.x - x0, P.pos.z - z0); }
    F.script = true; paint(true); sfx.appear(1.2); ctx.addShake(1.1); D.flicker(1.4);
    await wait(1.3);
    await pullUnder(); ctx.nlMult(0, false); UI.flash('rgba(255,255,255,0.85)', 0.4);
    await wait(0.5); m.visible = false; W.house.remove(m);
    await wake(); if (ctx.alive(t)) ctx.proofFire('nmMirror');
  }

  return { shadow, hall, basement, mirror, blackenPhotos };
}
