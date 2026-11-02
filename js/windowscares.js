// the windows at night: the glass as a dark mirror with something in it that is not in the room, a figure out in the yard that is
// closer every time you come back to the same window, taps and a handprint on the glass, a face against it, a headlight sweep that
// shows a figure in the corner for an instant, the street light that goes out while you look at it, curtains that stir and close.
// Everything is put out of view and shown by the player's own look (gaze.js); each entry in `scares` joins the night's scheduler
// (nights.js SCARES), which keeps the gaps between them and the fifteen seconds between reveals.
import * as THREE from 'three';
import { ROOMS } from './world.js';
import { PHONE } from './gfx.js';

const V3 = THREE.Vector3;
const LAYER = 5;   // drawn only into the reflection

export function createWindowScares({ W, E, P, F, camera, sfx, env, gaze, D, hunter, rnd, later, stage, phone = PHONE }) {
  // ---------- the windows, in world space ----------
  const box = new THREE.Box3(), _v = new V3(), _w = new V3();
  const wins = (W.windows || []).filter((r) => r.pane).map((r, i) => ({ ...r, i, c: new V3(), n: new V3(), half: 0.5, h: 1, axis: new V3(), cur0: null }));
  function measure() {
    for (const w of wins) {
      w.pane.updateWorldMatrix(true, false); box.setFromObject(w.pane); box.getCenter(w.c);
      w.n.set(w.alongX ? 0 : w.inside, 0, w.alongX ? w.inside : 0);
      w.axis.set(w.alongX ? 1 : 0, 0, w.alongX ? 0 : 1);
      w.half = (w.alongX ? box.max.x - box.min.x : box.max.z - box.min.z) / 2; w.h = box.max.y - box.min.y;
      if (!w.cur0) w.cur0 = w.curtains.map((m) => ({ p: m.position.clone(), s: m.scale.clone(), pos: m.geometry.attributes.position.array.slice() }));
    }
  }
  measure();
  const night = () => !!F.plan && /^n\d/.test(F.stage || '');
  const inside = (w) => (P.pos.x - w.c.x) * w.n.x + (P.pos.z - w.c.z) * w.n.z > 0.05 && Math.abs(P.pos.y) < 0.6;
  const dist = (w) => Math.hypot(P.pos.x - w.c.x, P.pos.z - w.c.z);
  const near = (max) => wins.filter((w) => inside(w) && dist(w) < max).sort((a, b) => dist(a) - dist(b));
  const facingWin = (w, dot = 0.8) => gaze.looking(w.c, dot);
  const pan = (p) => D.pan(p.x, p.z);
  const inner = (w) => ({ x: w.c.x + w.n.x * 0.35, z: w.c.z + w.n.z * 0.35, y: P.pos.y });   // y is the floor, as los wants
  const ground = (x, z) => (W.groundAt ? W.groundAt(x, z, 0) : 0) || 0;

  // ---------- the glass as a dark mirror (only the window you face, close, at night) ----------
  const RT = phone ? null : new THREE.WebGLRenderTarget(320, 224, { samples: 0 });
  const vcam = new THREE.PerspectiveCamera(); vcam.layers.enable(LAYER);
  const texM = new THREE.Matrix4(), plane = new THREE.Plane(), clip = new THREE.Vector4(), q = new THREE.Vector4(), rot = new THREE.Matrix4();
  const rp = new V3(), cp = new V3(), nn = new V3(), view = new V3(), look = new V3(), tgt = new V3();
  const mirMat = new THREE.ShaderMaterial({
    uniforms: { tex: { value: RT ? RT.texture : null }, tm: { value: texM }, k: { value: 0 } },
    vertexShader: 'uniform mat4 tm; varying vec4 vUv; void main() { vUv = tm * vec4(position, 1.0); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tex; uniform float k; varying vec4 vUv;
      void main() { vec3 c = texture2DProj(tex, vUv).rgb * 1.7; float l = dot(c, vec3(0.299, 0.587, 0.114));
        gl_FragColor = vec4(c, clamp(0.08 + l * 1.4, 0.0, 0.62) * k); }`,
    transparent: true, depthWrite: false, fog: false,
  });
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mirMat); mirror.visible = false; mirror.renderOrder = 3; mirror.frustumCulled = false; mirror.userData.noAO = true;
  env.scene.add(mirror);
  let mirWin = null, mirWant = false;
  mirror.onBeforeRender = (renderer, scene, cam) => {
    if (!mirWant || !RT) return; mirWant = false;
    // the reflected eye (three's Reflector, cut down): the camera mirrored in the pane, its near plane clipped to the glass
    rp.setFromMatrixPosition(mirror.matrixWorld); cp.setFromMatrixPosition(cam.matrixWorld);
    rot.extractRotation(mirror.matrixWorld); nn.set(0, 0, 1).applyMatrix4(rot);
    view.subVectors(rp, cp); if (view.dot(nn) > 0) return;
    view.reflect(nn).negate().add(rp);
    rot.extractRotation(cam.matrixWorld); look.set(0, 0, -1).applyMatrix4(rot).add(cp);
    tgt.subVectors(rp, look).reflect(nn).negate().add(rp);
    vcam.position.copy(view); vcam.up.set(0, 1, 0).applyMatrix4(rot).reflect(nn); vcam.lookAt(tgt);
    vcam.far = cam.far; vcam.updateMatrixWorld(); vcam.projectionMatrix.copy(cam.projectionMatrix);
    texM.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(vcam.projectionMatrix).multiply(vcam.matrixWorldInverse).multiply(mirror.matrixWorld);
    plane.setFromNormalAndCoplanarPoint(nn, rp).applyMatrix4(vcam.matrixWorldInverse);
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const pm = vcam.projectionMatrix.elements;
    q.set((Math.sign(clip.x) + pm[8]) / pm[0], (Math.sign(clip.y) + pm[9]) / pm[5], -1, (1 + pm[10]) / pm[14]);
    clip.multiplyScalar(2 / clip.dot(q)); pm[2] = clip.x; pm[6] = clip.y; pm[10] = clip.z + 1; pm[14] = clip.w;
    const prev = renderer.getRenderTarget(), sh = renderer.shadowMap.autoUpdate;
    mirror.visible = false; renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(RT); renderer.state.buffers.depth.setMask(true); renderer.clear(); renderer.render(scene, vcam);
    renderer.setRenderTarget(prev); renderer.shadowMap.autoUpdate = sh; mirror.visible = true;
  };
  function placeMirror(w) {
    mirror.position.copy(w.c).addScaledVector(w.n, 0.012);
    mirror.rotation.set(0, Math.atan2(w.n.x, w.n.z), 0); mirror.scale.set(w.half * 2, w.h, 1); mirror.updateMatrixWorld();
  }
  function mirrorTick(dt) {
    let w = null;
    const out = stage.on(), busy = out && (out.kind === 'yard' || out.kind === 'glass') ? out.w : null;
    if (RT && night() && P.mode === 'walk') for (const c of near(3.2)) if (c !== busy && facingWin(c, 0.55)) { w = c; break; }
    if (w !== mirWin) { mirWin = w; if (w) placeMirror(w); }
    const goal = w ? 1 : 0; mirMat.uniforms.k.value += (goal - mirMat.uniforms.k.value) * Math.min(1, dt * 5);
    mirror.visible = mirMat.uniforms.k.value > 0.01 && !!mirWin; mirWant = mirror.visible;
  }
  const setLayer = (o, l) => o.traverse((c) => c.layers.set(l));

  // ---------- small helpers for a staged thing ----------
  function start(kind, p, extra = {}) { const st = { kind, p, t0: env.time(), ...extra }; stage.start(st); return st; }
  const hideE = () => { setLayer(E.root, 0); stage.hideE(); };

  // ---------- the yard figure: further out the first time, closer each time you come back to the same window ----------
  const YD = [16, 10, 5, 0.55];
  const yard = { win: null, step: 0, n: 0 };
  function yardSpot(w, step) {
    const d = YD[Math.min(step, YD.length - 1)];
    let dx = w.c.x - camera.position.x, dz = w.c.z - camera.position.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    // out along the line from the eye through the glass, then pushed square to the wall so it is never beside the house
    const out = -1, ox = w.n.x * out, oz = w.n.z * out, mx = dx * 0.5 + ox * 0.5, mz = dz * 0.5 + oz * 0.5, ml = Math.hypot(mx, mz) || 1;
    const x = w.c.x + (mx / ml) * d, z = w.c.z + (mz / ml) * d;
    return { x, z, y: ground(x, z) };
  }

  // ---------- fog and a handprint on the outside of the glass ----------
  const printTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    const fog = g.createRadialGradient(128, 140, 10, 128, 140, 120); fog.addColorStop(0, 'rgba(220,228,236,0.55)'); fog.addColorStop(0.7, 'rgba(210,220,230,0.28)'); fog.addColorStop(1, 'rgba(210,220,230,0)');
    g.fillStyle = fog; g.fillRect(0, 0, 256, 256);
    // the hand wiped through the fog: clear where it pressed, a ring of beads round it
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = 'rgba(0,0,0,0.92)';
    g.beginPath(); g.ellipse(128, 165, 30, 36, 0, 0, Math.PI * 2); g.fill();
    for (const [x, y, r, len, a] of [[96, 118, 8, 46, -0.35], [114, 98, 8.5, 58, -0.12], [134, 94, 8.5, 62, 0.04], [153, 104, 8, 54, 0.2], [72, 160, 8, 38, -1.05]]) {
      g.save(); g.translate(x, y + len / 2); g.rotate(a); g.beginPath(); g.ellipse(0, -len / 2 + 6, r, len / 2, 0, 0, Math.PI * 2); g.fill(); g.restore();
    }
    g.globalCompositeOperation = 'source-over'; g.fillStyle = 'rgba(235,240,245,0.5)';
    for (let i = 0; i < 70; i++) { const a = rnd() * 6.28, rr = 40 + rnd() * 50; g.beginPath(); g.arc(128 + Math.cos(a) * rr, 140 + Math.sin(a) * rr, 1 + rnd() * 1.6, 0, 6.28); g.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const print = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), new THREE.MeshBasicMaterial({ map: printTex, transparent: true, depthWrite: false, opacity: 0, side: THREE.DoubleSide, fog: false }));
  print.visible = false; print.userData.noAO = true; env.scene.add(print);
  print.renderOrder = 1;   // before the pane (2), which writes depth in front of it
  const pr = { t: 0, life: 0 };

  // ---------- curtains ----------
  const sway = [];   // { m, t, dur, amp, base }
  function stir(w, amp = 0.05, dur = 4) {
    w.curtains.forEach((m, j) => sway.push({ m, t: 0, dur, amp: amp * (0.8 + rnd() * 0.4), base: w.cur0[j].pos, ph: rnd() * 6 }));
    sfx.noiseHit({ dur: 1.4, type: 'bandpass', f: 500, q: 0.6, gain: 0.05, attack: 0.5, pan: pan(w.c), wet: 0.3 });
  }
  function closeCurtains(w, on) {
    w.curtains.forEach((m, j) => {
      const o = w.cur0[j]; if (!on) { m.position.copy(o.p); m.scale.copy(o.s); return; }
      const s = Math.sign((m.position.x - w.c.x) * w.axis.x + (m.position.z - w.c.z) * w.axis.z) || (j ? 1 : -1);
      const cover = (w.half + 0.08) / 0.42;   // each panel draws across half the glass
      m.scale.set(cover, 1, 1); m.position.copy(o.p).addScaledVector(w.axis, -s * (0.21 + w.half + 0.12 - (w.half + 0.08) / 2 - 0.21));
    });
    w.closed = on;
  }

  // ---------- the scares ----------
  const ok = () => night() && P.mode === 'walk' && !F.script && !F.cutscene;
  const freeE = () => stage.freeE() && E.rig;
  const scares = {
    // in the dark glass, standing behind you; there is nothing there when you turn round
    reflect: { minN: 3, get w() { return (F.night || 3) >= 6 ? 2.5 : 1.5; }, run() {
      if (!RT || !ok() || !freeE() || !mirWin) return false;
      const w = mirWin, p = gaze.behind(1.1, 2.4, { strict: false }); if (!p) return false;
      // behind you as the glass sees it: further from the window than you are
      if ((p.x - P.pos.x) * w.n.x + (p.z - P.pos.z) * w.n.z < 0.6) return false;
      E.root.scale.setScalar(1); E.root.position.set(p.x, P.pos.y, p.z); E.faceTowards(w.c.x, w.c.z, 1); E.mode = 'idle'; E.lookTarget = camera.position;
      setLayer(E.root, LAYER); E.visible = true; sfx.holdHush();
      const st = start('reflect', p, { w, max: 20, end: hideE });
      st.tick = () => {
        if (!st.seen && mirWin === w && mirMat.uniforms.k.value > 0.6) { st.seen = env.time(); stage.revealed(); sfx.unhush(); sfx.lurk(pan(p), 0.9, 1.2); F.fear = Math.max(F.fear, 0.9); }
        if (st.seen && mirWin !== w) {   // you turned round: there is nobody, and something breathes out right behind your ear
          sfx.breath(false, 0.16); F.fear = Math.max(F.fear, 0.8); return false;
        }
        return !(!st.seen && env.time() - st.t0 > 8);
      };
      return true;
    } },
    // out in the yard, at the treeline, under the light: every time you come back to that window it is closer, until it is at the glass
    yard: { minN: 2, get w() { return 2.5; }, run() {
      if (!ok() || !freeE()) return false;
      if (yard.n !== (F.night || 0)) { yard.n = F.night || 0; yard.win = null; yard.step = 0; }
      const cand = yard.win ? [yard.win] : near(7); let w = null;
      for (const c of cand) if (inside(c) && dist(c) < 7.5 && !gaze.onScreen(c.c, 1.2) && hunter.los(P.pos.x, P.pos.z, c.c.x + c.n.x * 0.3, c.c.z + c.n.z * 0.3)) { w = c; break; }
      if (!w) return false;
      yard.win = w; const p = yardSpot(w, yard.step);
      E.root.scale.setScalar(1); setLayer(E.root, 0); E.root.position.set(p.x, p.y, p.z); E.faceTowards(w.c.x, w.c.z, 1); E.mode = 'idle'; E.lookTarget = camera.position; E.visible = true;
      const st = start('yard', p, { w, max: 40, end: hideE });
      st.tick = (dt) => {
        E.faceTowards(camera.position.x, camera.position.z, dt * 2);
        const sees = facingWin(w, 0.75) && inside(w);
        if (!st.seen && sees) {
          st.seen = env.time(); stage.revealed(); F.fear = Math.max(F.fear, 0.5 + yard.step * 0.15);
          if (yard.step >= YD.length - 1) { sfx.quietSlam(1.3, 0.6); env.addShake(0.4); F.fear = 1; } else { sfx.tension(0.05 + yard.step * 0.03, 1.2); }
          if (env.photo && env.RUN && env.RUN.hasCamera !== false) st.it = env.addI({ p: new V3(w.c.x + w.n.x * 0.6, 1.2, w.c.z + w.n.z * 0.6), r: 3.5, label: 'Take a photo', when: () => stage.on() === st && facingWin(w, 0.7), act: () => yardPhoto(st) });
        }
        if (st.seen && !sees) { st.off = (st.off || 0) + dt; if (st.off > 0.4) { yard.step = yard.step >= YD.length - 1 ? 0 : yard.step + 1; if (!yard.step) yard.win = null; sfx.tension(0, 2); return false; } } else st.off = 0;
        return !(!st.seen && (env.time() - st.t0 > 25 || dist(w) > 10));
      };
      st.end = () => { if (st.it) env.removeI(st.it); hideE(); };
      return true;
    } },
    // three slow taps on a pane near you, from outside
    tap: { minN: 1, get w() { return (F.night || 1) <= 1 ? 1.5 : 1; }, run() {
      if (!ok()) return false; const w = near(4.5).find((c) => !facingWin(c, 0.7)); if (!w) return false;
      const g = 0.16 + rnd() * 0.08; for (let i = 0; i < 3; i++) later(i * (0.9 + rnd() * 0.5), () => sfx.noiseHit({ dur: 0.05, type: 'bandpass', f: 2600, q: 2.2, gain: g, pan: pan(w.c), wet: 0.25 }));
      F.fear = Math.max(F.fear, 0.35); const st = start('tap', w.c, { max: 4 }); st.tick = () => env.time() - st.t0 < 3.5; return true;
    } },
    // fog on the outside of the glass, and a hand pressed into it, there when you look back
    handprint: { minN: 2, w: 1.5, run() {
      if (!ok()) return false; const w = near(6).find((c) => !gaze.onScreen(c.c, 1.15) && gaze.sawRecently(inner(c), 6)); if (!w) return false;
      print.position.copy(w.c).addScaledVector(w.n, -0.035).addScaledVector(w.axis, (rnd() - 0.5) * w.half * 0.8); print.position.y = w.c.y + (rnd() - 0.3) * w.h * 0.3;
      print.rotation.set(0, Math.atan2(w.n.x, w.n.z), 0); print.material.opacity = 0.5; print.visible = true; pr.t = 0; pr.life = 0;
      const st = start('handprint', w.c, { max: 30 });
      st.tick = (dt) => {
        if (!st.seen && facingWin(w, 0.7)) { st.seen = env.time(); F.fear = Math.max(F.fear, 0.55); sfx.noiseHit({ dur: 0.35, type: 'bandpass', f: 3200, f2: 1800, q: 3, gain: 0.07, pan: pan(w.c), wet: 0.3 }); }
        if (st.seen) { pr.life += dt; print.material.opacity = 0.5 * Math.max(0, 1 - pr.life / 12); if (pr.life > 12) return false; }
        return !(!st.seen && env.time() - st.t0 > 25);
      };
      st.end = () => { print.visible = false; };
      return true;
    } },
    // a face pressed to the glass from outside, gone when you look back
    glass: { minN: 3, w: 1.5, run() {
      if (!ok() || !freeE()) return false;
      const w = near(5.5).find((c) => !gaze.onScreen(c.c, 1.15) && gaze.sawRecently(inner(c), 6) && c.h > 0.8); if (!w) return false;
      const x = w.c.x - w.n.x * 0.42, z = w.c.z - w.n.z * 0.42;
      E.root.scale.setScalar(1); setLayer(E.root, 0); E.root.position.set(x, ground(x, z), z); E.faceTowards(w.c.x + w.n.x, w.c.z + w.n.z, 1); E.mode = 'idle'; E.lean = 0.35; E.lookTarget = camera.position; E.visible = true;
      sfx.holdHush();
      const st = start('glass', w.c, { w, max: 20, end: hideE });
      st.tick = (dt) => {
        if (!st.seen && facingWin(w, 0.7)) { st.seen = env.time(); stage.revealed(); sfx.unhush(); sfx.pianoSlam(1.1); env.addShake(0.35); F.fear = 1; }
        if (st.seen && !facingWin(w, 0.4)) { st.off = (st.off || 0) + dt; if (st.off > 0.25) return false; }
        return !(!st.seen && env.time() - st.t0 > 20);
      };
      return true;
    } },
    // the street light out front goes out while you look at it from the window, and comes back up when you look away
    streetlight: { minN: 2, w: 1, run() {
      const sl = W.streetLight; if (!ok() || !sl || F.blackout) return false;
      const w = near(4).find((c) => c.n.z > 0.5); if (!w) return false;
      const lp = { x: sl.pos.x, z: sl.pos.z, y: sl.pos.y - 1.2 };
      const st = start('streetlight', lp, { max: 40 });
      st.tick = (dt) => {
        const sees = gaze.looking(lp, 0.9, 0.9) && inside(w);
        if (!st.out && sees) { st.out = true; st.seen = env.time(); sl.set(false); sfx.noiseHit({ dur: 0.12, type: 'lowpass', f: 400, gain: 0.12, pan: pan(lp) }); F.fear = Math.max(F.fear, 0.4); }
        if (st.out && !sees) { st.off = (st.off || 0) + dt; if (st.off > 0.6) return false; } else st.off = 0;
        return !(!st.out && env.time() - st.t0 > 12);
      };
      st.end = () => { if (st.out && !F.blackout) sl.set(true); };
      return true;
    } },
    // a curtain moves with every window shut
    curtains: { minN: 1, w: 1.2, run() {
      if (!ok()) return false; const w = near(5).find((c) => c.curtains.length && !c.closed); if (!w) return false;
      stir(w, 0.06 + rnd() * 0.04, 3.5 + rnd() * 2); F.fear = Math.max(F.fear, 0.3);
      const st = start('curtains', w.c, { max: 6 }); st.tick = () => env.time() - st.t0 < 5; return true;
    } },
    // you come back to a room and its curtains, that were open, are drawn shut
    drawn: { minN: 2, w: 1, run() {
      if (!ok()) return false; const room = env.roomAt(P.pos.x, P.pos.z);
      const w = wins.find((c) => c.curtains.length && !c.closed && env.roomAt(c.c.x + c.n.x * 0.8, c.c.z + c.n.z * 0.8) !== room && dist(c) < 9 && !gaze.onScreen(c.c, 1.2));
      if (!w) return false; closeCurtains(w, true);
      const st = start('drawn', w.c, { max: 90 });
      st.tick = () => { if (!st.seen && facingWin(w, 0.7) && inside(w) && hunter.los(P.pos.x, P.pos.z, w.c.x + w.n.x * 0.4, w.c.z + w.n.z * 0.4)) { st.seen = env.time(); F.fear = Math.max(F.fear, 0.45); sfx.whisper(pan(w.c), 0.06); return false; } return true; };
      return true;
    } },
  };
  // the photo of the yard figure: in the print it is a step closer than it was; then it is not there
  function yardPhoto(st) {
    if (st.shot) return; st.shot = true; if (st.it) { env.removeI(st.it); st.it = null; }
    const w = st.w, p = yardSpot(w, Math.min(yard.step + 1, YD.length - 1)); E.root.position.set(p.x, p.y, p.z); E.faceTowards(camera.position.x, camera.position.z, 1); E.update(0.016);
    const url = env.photo ? env.photo() : null;
    if (env.UI && env.UI.print) env.UI.print(url, 'the yard');
    stage.hideE(); yard.step = 0; yard.win = null; sfx.whisper(pan(w.c), 0.08); F.fear = Math.max(F.fear, 0.8);
    later(0.1, () => stage.end());
  }

  // headlights through a front room: as the sweep crosses the far wall, something stands in it for a moment, its shadow thrown up the wall
  function carFlash() {
    if (!night() || (F.night || 1) < 3 || !freeE() || D.revealCool()) return;
    const room = env.roomAt(P.pos.x, P.pos.z), R = ROOMS[room] || null;
    if (!R || !['living', 'room2', 'spare'].includes(room)) return;
    const back = R[3] - 0.55;   // the wall opposite the front windows
    let tries = 0;
    const look = () => {
      if (++tries > 30 || stage.on() || !freeE()) return;
      const t = W.carLight && W.carLight.intensity > 120 ? W.carLight.target.position : null;
      const x = t ? Math.min(R[1] - 0.45, Math.max(R[0] + 0.45, t.x)) : 0, p = { x, z: back, y: 0 };
      if (!t || !gaze.inView(p, 0.8) || Math.hypot(p.x - P.pos.x, p.z - P.pos.z) < 2) { later(0.1, look); return; }
      E.root.scale.setScalar(1); setLayer(E.root, 0); E.root.position.set(p.x, P.pos.y, p.z); E.faceTowards(P.pos.x, P.pos.z, 1); E.mode = 'idle'; E.lookTarget = camera.position; E.visible = true;
      stage.revealed(); F.fear = Math.max(F.fear, 0.8);
      later(0.3, () => { if (E.visible && !stage.on()) stage.hideE(); later(0.6, () => sfx.lurk(pan(p), 0.4, 1.2)); });
    };
    later(1.2, look);
  }

  // ---------- per frame, and between nights ----------
  function tick(dt) {
    mirrorTick(dt);
    for (let i = sway.length - 1; i >= 0; i--) {
      const s = sway[i]; s.t += dt; const k = Math.min(1, s.t / 0.8) * Math.max(0, 1 - Math.max(0, s.t - s.dur + 1.2) / 1.2);
      const pos = s.m.geometry.attributes.position, a = pos.array;
      for (let j = 0; j < pos.count; j++) { const y = s.base[j * 3 + 1], low = Math.max(0, -y + 0.6) * 0.6; a[j * 3 + 2] = s.base[j * 3 + 2] + Math.sin(s.t * 2.1 + s.ph + y * 1.3) * s.amp * low * k; }
      pos.needsUpdate = true;
      if (s.t >= s.dur) { a.set(s.base); pos.needsUpdate = true; sway.splice(i, 1); }
    }
  }
  function reset() {
    measure(); yard.win = null; yard.step = 0; print.visible = false; mirWin = null; mirror.visible = false; mirMat.uniforms.k.value = 0;
    for (const w of wins) if (w.closed) closeCurtains(w, false);
    for (const s of sway) { s.m.geometry.attributes.position.array.set(s.base); s.m.geometry.attributes.position.needsUpdate = true; } sway.length = 0;
    setLayer(E.root, 0);
  }
  return { scares, tick, reset, carFlash, wins, mirror, print, yard, closeCurtains, stir, LAYER };
}
