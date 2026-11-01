// the nightmares: shadow, hall, basement and mirror. at most one a night; each pulls the kid under and ends awake in the bunk.
// ctx is the nights.js environment plus alive(), hunter and D; the director runs them as events (nm: true).
import * as THREE from 'three';
import { smile as smileTex } from './textures.js';
import { swimFrame } from './swim.js';
import { Shroud } from './shroud.js';

const V3 = THREE.Vector3;
const TAU = Math.PI * 2;
const SHADOW_LIFE = 150000, SCENE_LIFE = 200000;   // real ms: a night is about six minutes
const MIRROR_W = 148, MIRROR_H = 132;              // the mirror's canvas
const MIRROR_MOVE = 0.45, MIRROR_PATIENCE = 14000; // metres you walk before the reflection stays put, and how long it waits

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
  async function wake() {
    document.body.classList.remove('nightmare'); ctx.setFovOff(0); blackenPhotos(false);
    UI.fade(1, 0.5); await wait(0.7);
    for (const n of W.nightLights) n.dead = false;
    F.blackout = false; ctx.nlMult(1, false); F.flicker = false;
    ctx.toBunk(); P.roll = 0; P.pitch = -0.18; F.fear = 0.5;
    UI.fade(0, 2.4); await wait(1.6);
    F.cutscene = false; F.script = false;
  }
  function pullUnder() {
    F.script = true; F.cutscene = true; P.mode = 'cine'; P.cam.copy(camera.position); P.vel.set(0, 0, 0);
    document.body.classList.add('nightmare');
  }
  // the room turns over and over, the lens swings, the colours go wrong
  async function swim(secs, pitch0, yaw0, fn) {
    await tween(secs, (k) => {
      swimFrame(P, ctx.setFovOff, k, pitch0, yaw0);
      if (fn) fn(k);
    }, ctx.ease.lin);
  }

  // ---------- the shadow ----------
  // a figure with no face: a hole in the room, a little too tall, black to the edge where it goes soft, wrapped in slow smoke, torn
  // to pieces when you look straight at it (uTear) and gone when you keep looking. opacity on the material drives all of it.
  const VOID_VERT = 'varying vec3 vN, vV, vW; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = -mv.xyz; vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * mv; }';
  const VOID_FRAG = `uniform float uOpacity, uTear, uTime; varying vec3 vN, vV, vW;
    float h(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    void main() {
      float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
      float a = uOpacity * (1.0 - 0.35 * f);
      // torn: cells of the body drop out at random, faster the harder you look; whole until then
      float cell = h(floor(vW * 26.0) + floor(uTime * 16.0)) * 0.6 + h(floor(vW * 9.0 + 3.0) + floor(uTime * 7.0)) * 0.4;
      a *= 1.0 - uTear * step(0.45 + 0.5 * (1.0 - uTear), cell);
      a *= 1.0 - 0.3 * uTear * h(floor(vW * 40.0) + floor(uTime * 9.0));
      if (a < 0.01) discard;
      // black through and through, with the faintest cold line where it turns away, so the shape still reads on a dark wall
      gl_FragColor = vec4(mix(vec3(0.004, 0.004, 0.008), vec3(0.05, 0.06, 0.09), f * f), a);
    }`;
  function makeShadow() {
    const g = new THREE.Group();
    const mat = new THREE.ShaderMaterial({ uniforms: { uOpacity: { value: 0 }, uTear: { value: 0 }, uTime: { value: 0 } }, vertexShader: VOID_VERT, fragmentShader: VOID_FRAG, transparent: true, depthWrite: false, fog: false });
    mat.opacity = 0; mat.tear = 0;
    // noAO: the occlusion pass would take the figure for a solid wall and light it (see gfx.js)
    const part = (geo, x, y, z, rx = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); m.renderOrder = 4; m.userData.noAO = true; g.add(m); return m; };
    part(new THREE.CapsuleGeometry(0.21, 1.05, 6, 14), 0, 1.12, 0, 0.16);   // a stooped body
    part(new THREE.SphereGeometry(0.14, 16, 12), 0, 1.98, 0.09);                          // a head, nothing on it
    part(new THREE.CapsuleGeometry(0.045, 1.1, 4, 8), -0.31, 1.02, 0.04, 0, 0.06); part(new THREE.CapsuleGeometry(0.045, 1.1, 4, 8), 0.31, 1.02, 0.04, 0, -0.06);   // arms past the knees
    part(new THREE.CapsuleGeometry(0.075, 0.9, 4, 8), -0.1, 0.45, 0); part(new THREE.CapsuleGeometry(0.075, 0.9, 4, 8), 0.1, 0.45, 0);
    // the smoke hangs on invisible limb lines: heavier and slower than the thing's own
    const pt = (x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); g.add(o); return o; };
    const seg = (a, b, r, w) => ({ a, b, r, w });
    const anchors = [seg(pt(0, 0.6, 0), pt(0, 1.9, 0.05), 0.26, 5), seg(pt(0, 1.85, 0.08), pt(0, 2.1, 0.1), 0.12, 0.6),
      seg(pt(-0.3, 1.55, 0.04), pt(-0.33, 0.45, 0.04), 0.1, 1.5), seg(pt(0.3, 1.55, 0.04), pt(0.33, 0.45, 0.04), 0.1, 1.5),
      seg(pt(-0.1, 0.9, 0), pt(-0.1, 0.0, 0), 0.12, 1.6), seg(pt(0.1, 0.9, 0), pt(0.1, 0.0, 0), 0.12, 1.6)];
    const shroud = new Shroud(g, anchors, { count: 200, rise: 0.14, life: 2.6, size: [0.12, 0.34], spread: 0.6, near: 0.4, opacity: 0 });
    let last = performance.now();
    // the uniforms follow mat.opacity / mat.tear on the smoke card, which is never culled, so a part out of view cannot freeze them
    for (const m of g.children) if (m.isMesh) m.frustumCulled = false;
    shroud.mesh.onBeforeRender = () => {
      const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
      mat.uniforms.uOpacity.value = mat.opacity; mat.uniforms.uTear.value = mat.tear; mat.uniforms.uTime.value += dt;
      shroud.opacity = mat.opacity * 0.55; shroud.update(dt);
    };
    g.visible = false; g.userData.mat = mat; g.userData.shroud = shroud; W.house.add(g);
    let top = W.house; while (top.parent) top = top.parent; top.userData.aoDirty = true;
    return g;
  }
  function corner() {
    const cands = [[-2.33, -0.3], [4.28, -0.3], [-2.33, -3.88], [4.28, -3.88]];
    const free = (x, z) => !W.colliders.some((c) => c.on && x > c.minX - 0.35 && x < c.maxX + 0.35 && z > c.minZ - 0.35 && z < c.maxZ + 0.35 && !(c.door));
    return cands.find(([x, z]) => free(x, z)) || cands[0];
  }
  async function shadow(t) {
    const sh = makeShadow(), [x, z] = corner(), mat = sh.userData.mat;
    sh.position.set(x, 0, z); sh.lookAt(0.97, 0, -2.15); sh.rotation.x = 0; sh.visible = true;
    const dir = new V3(), to = new V3();
    let lookT = 0, gone = false;
    const until = Date.now() + SHADOW_LIFE;
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
      mat.tear = Math.min(1, lookT * 1.4);                        // straight on, it tears apart...
      if (inLos && cos >= 0.88) mat.opacity *= 0.9;              // ...and thins to nothing
      if (lookT > 1.0) { gone = true; break; }                  // you looked: it was never there
      if (P.mode === 'walk' && !hunter.busy && d < 1.2) { await pulled(sh, t); sh.visible = false; return; }
    }
    sh.visible = false; W.house.remove(sh); sh.userData.shroud.dispose();
  }
  async function pulled(sh, t) {
    pullUnder(); sh.visible = false;
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
    sh.position.set(camera.position.x + Math.sin(P.yaw) * -0.55, 0, camera.position.z + Math.cos(P.yaw) * -0.55); sh.rotation.y = P.yaw; sh.visible = true; sh.userData.mat.opacity = 1; sh.userData.mat.tear = 0;
    sfx.appear(1.3); ctx.addShake(1.5); UI.flash('rgba(255,255,255,0.8)', 0.4);
    await wait(0.45);
    UI.fade(1, 0.15); await wait(0.5); sh.visible = false; W.house.remove(sh); sh.userData.shroud.dispose();
    await wake(); if (ctx.alive(t)) ctx.proofFire('nmShadow');
  }

  // ---------- the hall that does not end ----------
  async function hall(t) {
    let passes = 0, busy = false;
    const until = Date.now() + SCENE_LIFE;
    while (ctx.alive(t) && Date.now() < until) {
      await wait(0.1);
      if (F.script || F.cutscene || hunter.busy || P.mode !== 'walk' || ctx.roomAt(P.pos.x, P.pos.z) !== 'hall' || busy) continue;
      const west = P.pos.x < 5.48, east = P.pos.x > 10.84;
      if (!west && !east) continue;
      if (passes < 3) {
        // the far end of the hall is the end you started from; the pictures on the wall are not the same ones
        busy = true; passes++;
        UI.fade(1, 0.12); await wait(0.15);
        P.pos.x = west ? 10.16 : 6.04; P.vel.set(0, 0, 0); F.drawingLevel = (F.drawingLevel || 0) + 1; D.flicker(0.5); sfx.stab(); sfx.heavyStep(0.4, 0);
        UI.fade(0, 0.2); busy = false; F.fear = Math.max(F.fear, 0.5 + passes * 0.12);
      } else {
        // the fourth time the hall ends, and something is standing there
        busy = true; F.script = true; D.flicker(1.2); sfx.violins(0.5, 0.5);
        hunter.sight(west ? 'hallW' : 'hallE', { dur: 4, vanishOnLook: false }); ctx.addShake(1.2);
        await wait(2.6);
        pullUnder(); ctx.nlMult(0, false); sfx.jolt(1); UI.flash('rgba(255,255,255,0.85)', 0.4);
        await wait(0.5); hunter.vanish(false);
        await wake(); if (ctx.alive(t)) ctx.proofFire('nmHall');
        return;
      }
    }
  }

  // ---------- the basement ----------
  async function basement(t) {
    const L = W.laundry; if (!L) return;
    L.bulb.set(true); L.drum.spin(true);
    let beat = 0; const until = Date.now() + SCENE_LIFE;
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
    L.bulb.set(false); sfx.faucet(6, ctx.pan(-5.36, 0.7));
    await wait(1.6);
    sfx.lurk(ctx.pan(-7.62, 2.45), 1, 3.2); await wait(3.4);                                 // a voice, inside the washer
    sfx.lurk(ctx.pan(-7.62, 2.45), 1, 2.4); L.washer.open(1); sfx.slamFar(-0.4); ctx.addShake(1.6); sfx.appear(1.2);   // the lid bangs open
    await wait(0.5);
    F.script = false; pullUnder();
    await swim(4, P.pitch, P.yaw);
    L.sink.set(false); if (L.sink.stream && L.sink.stream.material) L.sink.stream.material.color.set(0xb9c6cc); L.washer.open(0);
    W.setDoor('basement', false);
    await wake(); if (ctx.alive(t)) ctx.proofFire('nmBasement');
  }

  // ---------- the mirror ----------
  async function mirror(t) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.74, 0.66), new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false, fog: false, opacity: 0 }));
    const cv = document.createElement('canvas'); cv.width = MIRROR_W; cv.height = MIRROR_H; const g = cv.getContext('2d'), tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; m.material.map = tex;
    m.rotation.y = -Math.PI / 2; m.position.set(6.584, 1.6, 1.64); W.house.add(m);
    const paint = (face) => {   // the room behind you, empty, and you in front of it, standing exactly where you were
      const gr = g.createLinearGradient(0, 0, MIRROR_W, MIRROR_H); gr.addColorStop(0, '#20262c'); gr.addColorStop(1, '#0d1013'); g.fillStyle = gr; g.fillRect(0, 0, MIRROR_W, MIRROR_H);
      g.fillStyle = '#050607'; g.beginPath(); g.ellipse(74, 118, 40, 34, 0, 0, TAU); g.fill(); g.beginPath(); g.ellipse(74, 56, 22, 27, 0, 0, TAU); g.fill();
      if (face) { g.drawImage(smileTex().image, 0, 0, 148, 74, 36, 52, 76, 38); g.fillStyle = '#fff'; g.beginPath(); g.ellipse(64, 48, 5, 7, 0.3, 0, TAU); g.ellipse(84, 48, 5, 7, -0.3, 0, TAU); g.fill(); }
      tex.needsUpdate = true;
    };
    const until = Date.now() + SCENE_LIFE; let shown = false;
    while (ctx.alive(t) && Date.now() < until) {
      await wait(0.1);
      if (F.script || F.cutscene || P.mode !== 'walk' || hunter.busy) continue;
      const d = Math.hypot(P.pos.x - 6.59, P.pos.z - 1.64);
      if (ctx.roomAt(P.pos.x, P.pos.z) !== 'bath' || d > 1.7) continue;
      shown = true; break;
    }
    if (!shown) { W.house.remove(m); return; }
    F.script = true; paint(false);
    sfx.breath(true, 0.5); await wait(1.4); sfx.breath(false, 0.5);
    for (let k = 0; k <= 1 && ctx.alive(t); k += 0.1) { m.material.opacity = k; await wait(0.08); }
    await wait(2.4);
    // you move and it does not
    sfx.breath(true, 0.6); sfx.lurk(ctx.pan(5.42, 1.64), 0.9, 2.4);
    let moved = 0; const x0 = P.pos.x, z0 = P.pos.z;
    F.script = false;
    const t0 = Date.now();
    while (ctx.alive(t) && moved < MIRROR_MOVE && Date.now() - t0 < MIRROR_PATIENCE) { await wait(0.1); moved = Math.hypot(P.pos.x - x0, P.pos.z - z0); }
    F.script = true; paint(true); sfx.appear(1.2); ctx.addShake(1.1); D.flicker(1.4);
    await wait(1.3);
    pullUnder(); ctx.nlMult(0, false); UI.flash('rgba(255,255,255,0.85)', 0.4);
    await wait(0.5); m.visible = false; W.house.remove(m);
    await wake(); if (ctx.alive(t)) ctx.proofFire('nmMirror');
  }

  return { shadow, hall, basement, mirror, blackenPhotos, makeShadow };
}
