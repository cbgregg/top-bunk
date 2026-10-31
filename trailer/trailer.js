// TOP BUNK trailer: the shot list and the player that drives the game through window.__game.
// Loaded by trailer/render.js (headless, frame by frame with a frozen clock) and by trailer/boot.js (live, in a browser at index.html?trailer=1).
// A shot is { id, t, dur, setup(c), update(c, k) } where c is the context below. The camera is set every frame by the shot (c.cam), then the game's
// own handheld tremor goes on top, so nothing is ever perfectly still. Text cards, captions and fades are DOM injected at runtime.
import * as THREE from 'three';
import { V3, EYE_KID, BATH_I, clamp, lerp, ease, mix3, xyz, aim, lerpAngle, wobble, rng, path, makeOverlays, gameHelpers, plainTv } from './lib.js';
import { PORTRAIT_SHOTS, PORTRAIT_DURATION } from './shots_portrait.js';

export const LANDSCAPE_DURATION = 139;   // 2:19, the length of the recording the cut is timed to
const T = (list) => { let t = 0; for (const s of list) { s.t = +t.toFixed(3); t += s.dur; } return list; };   // sequential shots: fill in t

// ---------- the landscape cut: 2:19, cut on the phrases of the song (intro 0:00-0:08, verses 0:08-0:32 and 0:32-0:56, bridge 0:56-1:20, verse 1:20-1:48, outro 1:48-2:19) ----------
export const SHOTS = T([
  // INTRO: the house at dusk, one porch light on, the moving truck still in the drive
  { id: 'porch', dur: 8, fadeIn: 1.6,
    setup(c) { c.g.dusk(); c.g.person('mom', { visible: false }); c.g.person('dad', { visible: false }); },
    update(c, k) { c.cam.pos = mix3([-3.2, 1.45, -14.5], [-1.2, 1.35, -10.8], ease.inOut(k)); c.cam.look = [1.7, 1.75, -4.6]; c.cam.fov = 48; } },
  // VERSE 1: moving day. boxes, the drawing, the bunk, breakfast. The song is clean.
  { id: 'boxes', dur: 6,
    setup(c) { c.g.phase('day'); c.g.person('mom', { x: 0.6, z: 1.6, yaw: -Math.PI / 2 }); c.g.person('dad', { x: 1.35, z: -13.6, yaw: Math.PI }); },   // (Mom is in the kitchen: the family only animates while she is on screen)
    update(c, k) { c.cam.pos = mix3([4.0, 0.85, -9.3], [3.5, 0.8, -9.9], ease.inOut(k)); c.cam.look = [2.35, 0.45, -12.6]; c.cam.fov = 46; } },
  { id: 'drawing', dur: 6,
    setup(c) { c.g.phase('day'); c.g.person('mom', { visible: false }); c.g.person('dad', { visible: false }); c.W.drawingMat.map = c.W.T.drawing0; c.W.drawingMat.needsUpdate = true; },
    update(c, k) { c.cam.pos = mix3([5.55, 1.18, -1.3], [5.6, 1.1, -0.9], ease.inOut(k)); c.cam.look = [5.6, 1.06, -0.38]; c.cam.fov = lerp(44, 36, ease.inOut(k)); } },
  { id: 'bunk', dur: 6,
    setup(c) { c.g.phase('day'); c.g.person('mom', { visible: false }); c.g.person('dad', { visible: false }); },
    update(c, k) { c.cam.pos = mix3([7.6, 0.72, 0.95], [7.45, 0.86, 1.35], ease.inOut(k)); c.cam.look = [6.25, 1.6, 3.05]; c.cam.fov = 56; } },
  { id: 'breakfast', dur: 6,
    setup(c) {
      c.g.phase('morning'); c.P.pos.set(0.9, 0, 0.55);
      c.g.person('mom', { x: 2.0, z: 1.33, yaw: Math.PI / 2, busy: true }); c.g.person('dad', { x: 0.9, z: 2.3, yaw: 0, busy: true });
    },
    update(c, k) {
      // she is at the stove; a third of the way in she stops and turns to look at you, and keeps looking (the game turns them to you once you are near)
      c.P.pos.set(k > 0.3 ? 0.9 : -8, 0, 0.55); if (k > 0.3) c.mom.busy = false;
      c.cam.pos = mix3([0.9, EYE_KID, 0.55], [1.0, EYE_KID - 0.02, 0.7], ease.inOut(k)); c.cam.look = [2.0, 1.52, 1.33]; c.cam.fov = lerp(52, 46, ease.inOut(k));
    } },
  // VERSE 2: night. Things are wrong, the song keeps playing.
  { id: 'covers', dur: 6,
    setup(c) { c.g.night({ lights: 1 }); c.UI.blanket(true); c.P.pos.set(6.03, 0, 3.02); },
    update(c, k) {
      const t = c.st; c.cam.pos = [6.13, 1.9 + Math.sin(t * 2.2) * 0.008, 3.02]; c.cam.yaw = -0.27 + wobble(t * 0.4, 1) * 0.03; c.cam.pitch = -0.06 + Math.sin(t * 2.2) * 0.004; c.cam.fov = 60;
    } },
  { id: 'hall_long', dur: 6,
    setup(c) { c.g.night({ lights: 1 }); c.g.flashlight(true); c.P.pos.set(7.9, 0, -0.9); },
    update(c, k) { c.cam.pos = mix3([7.95, 1.22, -0.9], [7.55, 1.2, -0.9], ease.inOut(k)); c.cam.look = [-2, 0.95, -0.95]; c.cam.fov = 30; } },
  { id: 'tv', dur: 6,
    setup(c) { c.g.night({ lights: 1 }); c.W.tvFx.set(true); c.P.pos.set(0.5, 0, -3.0); },
    update(c, k) { if (k > 0.62) c.W.tvFx.figure = 1; c.cam.pos = mix3([0.3, 0.95, -2.95], [0.8, 0.92, -3.1], ease.inOut(k)); c.cam.look = [2.71, 0.82, -3.27]; c.cam.fov = lerp(44, 38, k); } },
  { id: 'door', dur: 6,
    setup(c) { c.g.night({ lights: 1, spot: 32 }); c.g.door('kid', true); c.P.pos.set(7.35, 0, 1.75); c.closed = false; },
    update(c, k) {
      if (k > 0.18 && !c.closed) { c.closed = true; c.g.door('kid', false); }
      if (k > 0.62) c.W.bathSpot.intensity = 0;
      c.cam.pos = mix3([7.35, 1.08, 1.8], [7.3, 1.05, 1.6], ease.inOut(k)); c.cam.look = [6.95, 1.0, -0.28]; c.cam.fov = 54;
    } },
  // BRIDGE: the song starts to warp. The photo on the floor, the face at the window, the closet, the thing at the end of the hall.
  { id: 'frame_floor', dur: 6,
    setup(c) { c.g.night({ lights: 0.6 }); c.W.hallFrame.fall(); c.g.flashlight(true); c.P.pos.set(5.9, 0, -0.6); },
    update(c, k) { c.cam.pos = mix3([5.95, 0.78, -0.55], [5.65, 0.62, -0.7], ease.inOut(k)); c.cam.look = [4.98, 0.08, -1.08]; c.cam.fov = 50; c.g.fear(0.25); } },
  { id: 'window_face', dur: 6,
    setup(c) { c.g.night({ lights: 1 }); c.g.windowFace(0.23); c.P.pos.set(6.03, 0, 3.02); },
    update(c, k) { c.WF.t = 0.23 + 0.08 * k; c.cam.pos = [6.3, 2.14, 2.95]; c.cam.look = [8.1, 1.78, 2.85]; c.cam.fov = 50; c.g.fear(0.4); } },   // (the face is driven by hand: it slides into the window and hangs there)
  // the game's hiding camera sits inside the closet body (the leaves are solid, the slats are the overlay), so this one stands a hand's width
  // outside the leaves, as store screenshot 07 does, and keeps the thing's head between the slats while it comes in
  { id: 'closet', dur: 6,
    setup(c) { c.g.night({ lights: 1 }); c.UI.pod('louvers'); c.g.flashlight(true); c.P.pos.set(5.95, 0, 0.52); c.g.thing({ x: 7.45, z: 2.2, face: [6.1, 1.45], mode: 'walk', speed: 0.2, tilt: 0.25, look: false }); c.walkFrom = [7.45, 0, 2.2]; c.walkTo = [6.1, 0, 1.45]; c.head = new V3(); },   // (your torch is on in there: it is what lights its face through the slats)
    update(c, k) {
      const w = clamp((k - 0.08) / 0.6, 0, 1), p = mix3(c.walkFrom, c.walkTo, w); c.E.root.position.copy(p);
      if (w < 1) { c.E.mode = 'walk'; c.E.faceTowards(c.walkTo[0], c.walkTo[2], 1); c.E.lookTarget = null; }
      else { c.E.mode = 'idle'; c.E.faceTowards(5.95, 0.52, 0.12); c.E.lookTarget = c.camera.position; c.E.tilt = 0.5; c.E.smileScale = 1.1; }
      c.E.headWorld(c.head);
      c.cam.pos = [5.95, 1.6 + wobble(c.st * 0.5, 2) * 0.01, 0.52]; c.cam.look = [c.head.x, c.head.y - 0.12, c.head.z]; c.cam.fov = 58; c.g.fear(0.6);
    } },
  { id: 'hall_stand', dur: 6,
    setup(c) { c.g.night({ lights: 0.25, spot: BATH_I, flicker: true }); c.g.thing({ x: 1.6, z: -0.9, yaw: Math.PI / 2, tilt: 0 }); c.P.pos.set(6.9, 0, -0.9); },
    update(c, k) { c.E.tilt = 0.55 * ease.inOut(clamp(k * 1.6, 0, 1)); c.cam.pos = mix3([6.95, 1.22, -0.9], [6.35, 1.2, -0.92], ease.inOut(k)); c.cam.look = [1.6, 1.35, -0.9]; c.cam.fov = 44; c.g.fear(0.8); } },
  // VERSE 3: the song is badly warped. The vigil, the parents, the grin, the chase.
  { id: 'vigil', dur: 7,
    setup(c) { c.g.night({ lights: 1 }); c.g.vigil(true); c.P.pos.set(7.6, 0, -0.9); },
    update(c, k) { c.cam.pos = mix3([7.7, 0.62, -0.95], [6.5, 0.72, -0.9], ease.inOut(k)); c.cam.look = [3.5, 0.85, -0.6]; c.cam.fov = 40; c.g.fear(0.3); },
    end(c) { c.g.vigil(false); } },
  { id: 'parents_bed', dur: 6,
    setup(c) { c.g.night({ lights: 1 }); c.g.door('parents', true); c.g.flashlight(true); c.P.pos.set(7.55, 0, -1.2); },
    update(c, k) { c.cam.pos = mix3([7.6, 1.12, -1.15], [7.5, 1.05, -1.7], ease.inOut(k)); c.cam.look = [7.0, 0.72, -3.6]; c.cam.fov = 54; c.g.fear(0.3); } },
  { id: 'grin', dur: 7,
    setup(c) { c.g.night({ lights: 0.15, spot: BATH_I * 0.6, flicker: true }); c.g.thing({ x: 5.4, z: -0.9, yaw: Math.PI / 2, tilt: 0.2 }); c.P.pos.set(6.2, 0, -0.9); c.head = new V3(); },
    update(c, k) {
      c.E.smileScale = lerp(1, 1.35, ease.inOut(k)); c.E.tilt = 0.2 + Math.sin(c.st * 0.9) * 0.3; c.E.lean = 0.2 * k;
      c.E.headWorld(c.head);
      c.cam.pos = [c.head.x + lerp(0.95, 0.7, ease.inOut(k)), c.head.y - 0.08, c.head.z + 0.05]; c.cam.look = [c.head.x, c.head.y + 0.02, c.head.z]; c.cam.fov = 36; c.g.fear(1);
    } },
  { id: 'chase', dur: 8, teaser: 2.5,   // (the ten-second teaser: the run, the cut, the scare and the first of the title)
    setup(c) {
      c.g.night({ lights: 0.4, spot: BATH_I * 0.5, flicker: true }); c.g.door('kid', true);
      // the route: from the living room into the hall, down it, through your door and up to the foot of the bunk. The thing runs the same route behind you.
      c.route = path([[-1.6, EYE_KID, -1.15], [0.2, EYE_KID, -1.1], [2.2, EYE_KID, -1.0], [3.6, EYE_KID, -0.9], [6.4, EYE_KID, -0.9], [7.05, EYE_KID, -0.1], [7.3, EYE_KID, 1.2], [7.45, EYE_KID, 2.3]]);
      c.K0 = 0.12;   // where you start on it (the thing starts at 0, a couple of metres behind)
      c.g.thing({ x: -1.6, z: -1.15, mode: 'run', speed: 1.1, tilt: 0.2, smile: 1.1 });
      c.ep = new V3(); c.head = new V3();
    },
    update(c, k) {
      // 0-0.5 s: a whip round to face the hall; 0.5-5.0 s: the run; 5.0-5.6 s: the look back; then it is on you
      const st = c.st, run = clamp((st - 0.5) / 4.5, 0, 1), rk = lerp(c.K0, 1, ease.inOut(run) * 0.5 + run * 0.5);
      const p = c.route.at(rk), tg = c.route.tangent(Math.min(1, rk + 0.02)), aheadYaw = Math.atan2(-tg.x, -tg.z);
      const running = run > 0 && run < 1, bob = running ? Math.sin(st * 13) * 0.04 : 0;
      c.cam.pos = [p.x, p.y + bob, p.z];
      const back = clamp((st - 5.0) / 0.6, 0, 1), lunge = ease.in(clamp((st - 5.6) / 2.2, 0, 1));
      if (back <= 0) {   // behind you on the route, gaining
        const ek = Math.max(0, rk - lerp(c.K0, 0.07, run)); c.route.at(ek, c.ep); c.E.root.position.set(c.ep.x, 0, c.ep.z); c.E.faceTowards(p.x, p.z, 1); c.E.mode = running ? 'run' : 'idle';
      } else {           // you turn: it is right there, and it comes the last metre with its arms out
        const d = lerp(1.7, 0.55, lunge);
        c.E.root.position.set(p.x + Math.sin(aheadYaw) * d, 0, p.z + Math.cos(aheadYaw) * d); c.E.faceTowards(p.x, p.z, 1);
        c.E.mode = 'idle'; c.E.reach = back; c.E.smileScale = 1.1 + lunge * 0.4; c.E.lean = 0.3 * lunge; c.E.tilt = 0.4;
      }
      const fwdPitch = -0.05 + (running ? Math.sin(st * 13) * 0.012 : 0);
      if (st < 0.5) { c.cam.yaw = lerpAngle(aheadYaw + Math.PI * 0.85, aheadYaw, ease.out(st / 0.5)); c.cam.pitch = fwdPitch; }
      else if (back <= 0) { c.cam.yaw = aheadYaw; c.cam.pitch = fwdPitch; }
      else { c.E.headWorld(c.head); const a = aim(c.cam.pos, [c.head.x, c.head.y - 0.25, c.head.z]); c.cam.yaw = lerpAngle(aheadYaw, a.yaw, ease.inOut(back)); c.cam.pitch = lerp(fwdPitch, a.pitch, ease.inOut(back)); }
      c.cam.roll = running ? Math.sin(st * 6.5) * 0.02 : 0;
      c.cam.fov = lerp(74, 82, run); c.g.fear(1); if (st > 5.6 && st < 5.75) c.g.shake(0.7);
    } },
  // OUTRO: the hard cut. Silence. Then it has you. Then the title.
  { id: 'black1', dur: 2.0, black: true, noRender: true, setup() {}, update() {} },
  { id: 'scare', dur: 1.3,
    setup(c) { c.g.night({ lights: 0, spot: BATH_I, flicker: true }); c.g.thing({ x: 6.45, z: -0.9, yaw: -Math.PI / 2, tilt: 0.35, lean: 0.4, reach: 1, smile: 1.5 }); c.P.pos.set(5.9, 0, -0.9); c.head = new V3(); },
    update(c, k) { c.E.headWorld(c.head); c.cam.pos = [5.95, 1.35, -0.9]; c.cam.look = [c.head.x, c.head.y - 0.1, c.head.z]; c.cam.fov = 68; c.ui.flash(k < 0.12 ? 1 - k / 0.12 : 0); c.g.shake(1); c.g.fear(1); } },
  { id: 'title', dur: 8.7, black: true, noRender: true, setup() {}, update(c, k) { c.ui.card({ big: 'TOP BUNK', alpha: c.fadeInOut(0.6, 1.4, 0.8) }); } },
  { id: 'tagline', dur: 6, black: true, noRender: true, setup() {},
    update(c) { const st = c.st; c.ui.card(st < 2.8 ? { line: 'Ten nights.', alpha: c.ramp(st, 0.2, 0.6, 2.4, 2.8) } : { line: 'Nobody believed you.', alpha: c.ramp(st, 3.0, 3.5, 5.6, 6.0) }); } },
  { id: 'wishlist', dur: 7, black: true, noRender: true, setup() {}, update(c) { c.ui.card({ line: 'Wishlist on Steam', small: 'a first-person horror game for PC', alpha: c.fadeInOut(0.4, 0.8, 1.0) }); } },
  { id: 'warning', dur: 6, black: true, noRender: true, setup() {}, update(c) { c.ui.card({ small: 'Contains jump scares and flashing lights', alpha: c.fadeInOut(0.3, 0.6, 1.4) }); } },
]);

// ---------- the player ----------
// opts: { fps, aspect: 'landscape' | 'portrait', shots, duration, shutter, linkInBio, cta }
export function attach(game, opts = {}) {
  const portrait = opts.aspect === 'portrait';
  const shots = opts.shots || (portrait ? PORTRAIT_SHOTS : SHOTS);
  const duration = opts.duration || (portrait ? PORTRAIT_DURATION : LANDSCAPE_DURATION);
  const fps = opts.fps || 30;
  const g = gameHelpers(game), ui = makeOverlays(portrait);
  const { camera } = game;
  const c = {   // the context a shot sees
    game, g, ui, THREE, V3, EYE_KID, P: game.P, F: game.F, W: game.W, E: game.E, UI: game.UI, camera, mom: game.mom, dad: game.dad, WF: game.WF,
    portrait, fps, opts, t: 0, st: 0, k: 0, shot: null,
    cam: { pos: [0, 1.3, 0], look: null, yaw: 0, pitch: 0, roll: 0, fov: 60, sway: portrait ? 1 : 0 },
    ramp: (st, a, b, cc, d) => (st < a ? 0 : st < b ? (st - a) / (b - a) : st < cc ? 1 : st < d ? 1 - (st - cc) / (d - cc) : 0),
    fadeInOut(delay, fin, fout) { const st = this.st, dur = this.shot.dur; return this.ramp(st, delay, delay + fin, dur - fout, dur); },
    rnd: rng(7),
  };
  let cur = null, began = false, pending = false, finished = false, lastT = null;
  const origRender = game.gfx.render.bind(game.gfx);

  // the shots are sequential, so the one that starts last before t is current (a start/end test would miss a frame where a rounded start
  // and a beat-based duration disagree by a few microseconds, and that frame would fall through to the end card)
  function select(t) {
    let s = shots[0];
    for (const x of shots) { if (t >= x.t) s = x; else break; }
    return s;
  }
  // what the current frame should show: the shot's update, then the camera, then the overlays
  function apply() {
    const shot = c.shot; if (!shot) return;
    c.cam.look = null; c.cam.roll = 0; c.cam.sway = portrait ? 1 : 0; c.black = 0;
    ui.card(null); ui.caption(null); ui.flash(0); ui.quilt(null);   // a shot that wants them asks every frame
    shot.update(c, c.k);
    const cam = c.cam, P = game.P, F = game.F, pos = xyz(cam.pos);
    P.mode = 'cine'; F.cutscene = true;
    if (cam.look) { const a = aim(pos, cam.look); cam.yaw = a.yaw; cam.pitch = a.pitch; }
    P.cam.set(pos[0], pos[1], pos[2]); P.yaw = cam.yaw; P.pitch = cam.pitch; P.roll = cam.roll || 0;
    game.cam();   // the game places the camera from P and adds its own tremor and shake, and the thing looks at it
    if (shot.post) shot.post(c);   // (after the game has posed the thing: a shot can still bend a limb for this frame)
    if (cam.sway) {   // handheld drift: layered noise on yaw, pitch and roll, plus a slow sine
      const t = c.t, s = cam.sway * 0.007;
      camera.rotation.y += wobble(t * 1.9, 3) * s + Math.sin(t * 0.31) * 0.012;
      camera.rotation.x += wobble(t * 2.3, 4) * s + Math.sin(t * 0.23 + 1) * 0.009;
      camera.rotation.z += wobble(t * 1.1, 5) * s * 0.6;
      camera.position.x += wobble(t * 1.5, 6) * 0.006; camera.position.y += wobble(t * 1.7, 7) * 0.006;
    }
    camera.fov = cam.fov; camera.updateProjectionMatrix();
    // overlays: black (cuts and fades), grain, the camcorder frame
    const st = c.st, dur = shot.dur; let blk = Math.max(shot.black ? 1 : 0, c.black || 0);
    if (shot.fadeIn && st < shot.fadeIn) blk = Math.max(blk, 1 - st / shot.fadeIn);
    if (shot.fadeOut && st > dur - shot.fadeOut) blk = Math.max(blk, (st - (dur - shot.fadeOut)) / shot.fadeOut);
    ui.black(blk); ui.hideFade();
    if (!c.subframe) ui.grain((c.rnd() * 14 - 7).toFixed(1), (c.rnd() * 14 - 7).toFixed(1), portrait ? 1 : 0.55);   // (grain is per frame, not per exposure; overlaid in portrait, so it needs the full strength)
    if (portrait) ui.camcorder(shot.camcorder === false ? null : shot.osd ? shot.osd(c) : shot.black ? null : { stamp: shot.stamp || '', blink: Math.floor(c.t * 2) % 2 === 0 });
  }
  game.gfx.render = (dt) => { if (pending) { apply(); pending = false; } origRender(dt); };
  // one exposure at frame position i (fractional for the extra exposures of a blurred frame); the clock advances by the real gap
  function step(i, capture, sub) {
    Math.random = rng(1000003 + i * 7919); c.subframe = sub;
    const t = i / fps, gap = lastT !== null && t > lastT && t - lastT <= 1 / fps + 1e-9 ? t - lastT : 1 / fps; lastT = t; tick(t);
    const shot = c.shot, stepMs = gap * 1000, n = Math.max(1, Math.ceil(stepMs / 45)), subMs = stepMs / n, draw = capture && !shot.noRender;
    for (let s = 0; s < n; s++) { window.__norender = !draw || s < n - 1; window.__pump(subMs); }
    window.__norender = false;
    if (pending) { apply(); pending = false; }   // (nothing was drawn: a black card, or a frame nobody will look at)
    return { t, shot: shot.id, finished };
  }

  // step the trailer to time t (seconds): picks the shot, runs setup on a change, and marks the frame pending for the render hook
  function tick(t) {
    c.t = t; const shot = select(t);
    if (shot !== cur) { if (cur && cur.end) cur.end(c); c.shot = shot; g.reset(); ui.card(null); ui.caption(null); ui.flash(0); shot.setup(c); cur = shot; }
    c.st = t - shot.t; c.k = clamp(c.st / shot.dur, 0, 0.9999); pending = true;
    if (t >= duration) finished = true;
  }

  const api = {
    SHOTS: shots, duration, fps, portrait, ctx: c,
    // one-time: the test mode, the graphics knobs, the shaders for every lighting phase
    async begin({ quality, shadow, res, letterbox, ca } = {}) {
      if (began) return; began = true;
      game.start(); game.gfx.auto = false;
      if (quality) game.gfx.setQuality(quality, { save: false });
      if (shadow) for (const l of game.scene.userData.shadowLights) { const sz = l.sun ? shadow : shadow / 2; l.light.shadow.mapSize.set(sz, sz); if (l.light.shadow.map) { l.light.shadow.map.dispose(); l.light.shadow.map = null; } l.light.shadow.needsUpdate = true; }
      if (res && res !== 1) game.gfx.setRes(res);
      if (game.gfx.pass && game.gfx.pass.grade) game.gfx.pass.grade.uniforms.ca.value = ca ?? (portrait ? 0.002 : 0.0011);
      ui.letterbox(!!letterbox && !portrait);
      // the bottom bunk is for boxes (the story's own dressing)
      for (const [i, s] of game.W.dropSpots.entries()) if (i < 2) game.W.cardboardBox(s.x, s.y, s.z, 0.5, 0.44, 0.5, 3, i ? -0.3 : 0.2);
      // a real company's badge on the haunted TV has no place in an ad
      if (!plainTv(game.scene)) console.warn('trailer: the TV model had no texture to clean');
      g.reset();
      try { await document.fonts.load('bold 40px "Gloria Hallelujah"'); await document.fonts.ready; } catch (e) { /* ignore */ }
      // compile every lighting variant now instead of in the middle of a shot
      const rt = game.gfx.composer && game.gfx.composer.renderTarget1;
      try { for (const p of ['title', 'day', 'morning', 'night']) { game.setPhase(p, true); if (rt) game.renderer.setRenderTarget(rt); await game.renderer.compileAsync(game.scene, camera); game.renderer.setRenderTarget(null); } } catch (e) { game.renderer.setRenderTarget(null); }
      game.setPhase('night', true);
    },
    // headless: step to frame i. Pumps the game's clock in sub-steps (dt never over the game's 50 ms cap) and, when the frame is going to be
    // captured, renders on the last one. A frame that is not captured still runs the game and the shot (so doors close and walks happen on time)
    // but never touches the GPU: SwiftShader executes every queued draw whether or not a screenshot follows, and that is what costs seconds.
    // motion blur: a captured frame can be several exposures spread over a thirtieth of a second (a camcorder's shutter at night), averaged
    // under the overlays; opts.shutter = N forces N everywhere, otherwise each shot's own `shutter` (a number, or a function of the shot time)
    frame(i, capture = true) {
      const t0 = i / fps, s0 = select(t0), want = typeof opts.shutter === 'number' ? opts.shutter : typeof s0.shutter === 'function' ? s0.shutter(t0 - s0.t) : s0.shutter || 1;
      const n = !capture || s0.noRender ? 1 : Math.max(1, Math.min(8, Math.round(want))), shut = Math.min(1 / fps, 1 / 30, s0.t + s0.dur - t0 - 1e-6);   // (never past the cut)
      ui.acc.clear();
      let r;
      for (let e = 0; e < n; e++) {
        r = step(i + e * shut * fps / n, capture, e > 0);
        if (n > 1) { const cv = document.querySelector('#game canvas'); if (cv) ui.acc.add(cv, cv.style.filter); }
      }
      if (n > 1) ui.acc.show();
      return { ...r, exposures: n };
    },
    // live (boot.js): called from the game's own rAF loop through the render hook
    play(t0 = performance.now()) { const hook = game.gfx.render; game.gfx.render = (dt) => { tick(Math.min(duration, (performance.now() - t0) / 1000)); hook(dt); }; },
    get finished() { return finished; },
    shotAt: (t) => select(t),
  };
  return api;
}

export { PORTRAIT_SHOTS, PORTRAIT_DURATION };
