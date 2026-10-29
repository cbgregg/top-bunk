// The portrait cut (9:16, ~44 s) for Shorts / Reels / TikTok: a separate edit, not a crop. It reads as something a kid filmed on a phone in the
// house: handheld micro-shake and drift (trailer.js adds it to every portrait shot), a camcorder frame (REC, a night stamp, scanlines, the
// game's own grain and lens fringing), and captions in the lower third that carry the whole story with the sound off. Hard cuts only.
import { V3, EYE_KID, BATH_I, clamp, lerp, ease, mix3, aim, lerpAngle, wobble, path } from './lib.js';

export const PORTRAIT_DURATION = 44;
const T = (list) => { let t = 0; for (const s of list) { s.t = +t.toFixed(3); t += s.dur; } return list; };
const B = 60 / 72;   // one beat of the song
// a caption that types on over the first beat and holds; `at` delays it (seconds into the shot)
const cap = (c, text, at = 0) => { const st = c.st - at; if (st < 0) return; c.ui.caption(text, clamp(st / 0.18, 0, 1)); };

export const PORTRAIT_SHOTS = T([
  // the hook: it is standing at the end of the hall. Two seconds, then black.
  { id: 'p_hook', dur: 3 * B,
    setup(c) { c.g.night({ lights: 0.2, spot: BATH_I, flicker: true }); c.g.thing({ x: 1.6, z: -0.9, yaw: Math.PI / 2, tilt: 0.5, smile: 1.1 }); c.P.pos.set(5.0, 0, -0.9); },
    update(c, k) { c.cam.pos = mix3([5.1, 1.0, -0.92], [4.9, 1.02, -0.9], k); c.cam.look = [1.6, 1.5, -0.9]; c.cam.fov = 80; c.cam.sway = 1.6; c.g.fear(1); cap(c, 'nobody believed me', 0.1); },
    stamp: 'NIGHT 3   3:33 AM' },
  { id: 'p_black1', dur: 0.5 * B, black: true, noRender: true, setup() {}, update() {} },
  // the story, one caption per shot
  { id: 'p_house', dur: 4 * B,
    setup(c) { c.g.dusk(); c.g.person('mom', { visible: false }); c.g.person('dad', { visible: false }); },
    update(c, k) { c.cam.pos = mix3([-0.9, 0.95, -12.0], [-0.6, 0.9, -11.2], k); c.cam.look = [1.6, 2.4, -4.6]; c.cam.fov = 86; cap(c, 'we rented a farmhouse because it was cheap'); } },
  { id: 'p_ladder', dur: 4 * B,
    setup(c) { c.g.phase('day'); c.g.person('mom', { x: 0.6, z: 1.6, yaw: -Math.PI / 2 }); c.g.person('dad', { x: 0.2, z: 0.6, yaw: Math.PI }); },
    update(c, k) { c.cam.pos = mix3([7.9, 0.5, 2.25], [7.8, 0.58, 2.4], k); c.cam.look = [7.12, 1.95, 3.0]; c.cam.fov = 88; cap(c, 'top bunk was mine'); } },
  { id: 'p_hall', dur: 4 * B, stamp: 'NIGHT 1   2:47 AM',
    setup(c) { c.g.night({ lights: 1 }); c.g.flashlight(true); c.P.pos.set(7.9, 0, -0.9); },
    update(c, k) { c.cam.pos = mix3([7.95, 1.02, -0.9], [7.6, 1.0, -0.9], k); c.cam.look = [-1, 0.9, -0.95]; c.cam.fov = 70; cap(c, 'night 1'); } },
  { id: 'p_tv', dur: 4 * B, stamp: 'NIGHT 1   3:05 AM',
    setup(c) { c.g.night({ lights: 1 }); c.W.tvFx.set(true); c.P.pos.set(1.0, 0, -3.0); },
    update(c, k) { if (k > 0.6) c.W.tvFx.figure = 1; c.cam.pos = mix3([1.0, 0.78, -3.0], [1.25, 0.76, -3.1], k); c.cam.look = [2.71, 0.82, -3.27]; c.cam.fov = 72; cap(c, 'the tv kept turning itself on'); } },
  { id: 'p_drawing', dur: 4 * B, stamp: 'NIGHT 2   3:12 AM',
    setup(c) { c.g.night({ lights: 1 }); c.g.flashlight(true); c.W.drawingMat.map = c.W.T.drawing1; c.W.drawingMat.needsUpdate = true; c.P.pos.set(5.6, 0, -1.0); },
    update(c, k) { c.cam.pos = mix3([5.55, 1.1, -1.05], [5.6, 1.08, -0.92], k); c.cam.look = [5.6, 1.08, -0.38]; c.cam.fov = 60; cap(c, 'the last kid drew this'); } },
  { id: 'p_breakfast', dur: 4 * B,
    setup(c) { c.g.phase('morning'); c.g.person('mom', { x: 2.0, z: 1.33, yaw: Math.PI / 2 }); c.g.person('dad', { x: 0.9, z: 2.3, yaw: 0 }); },
    update(c, k) { c.P.pos.set(k > 0.2 ? 0.9 : -8, 0, 0.55); if (k > 0.2) c.mom.busy = false; c.cam.pos = [0.9, EYE_KID, 0.55]; c.cam.look = [2.0, 1.52, 1.33]; c.cam.fov = 74; cap(c, 'my parents said i was making it up'); } },
  { id: 'p_door', dur: 4 * B, stamp: 'NIGHT 3   3:33 AM',
    setup(c) { c.g.night({ lights: 1, spot: 32 }); c.g.door('kid', true); c.P.pos.set(7.35, 0, 1.7); c.closed = false; },
    update(c, k) { if (k > 0.12 && !c.closed) { c.closed = true; c.g.door('kid', false); } if (k > 0.6) c.W.bathSpot.intensity = 0; c.cam.pos = [7.35, 1.0, 1.7]; c.cam.look = [6.95, 1.0, -0.28]; c.cam.fov = 76; cap(c, 'night 3'); } },
  { id: 'p_door_thing', dur: 4 * B, stamp: 'NIGHT 4   2:58 AM',
    setup(c) { c.g.night({ lights: 0.5, spot: 20 }); c.g.door('kid', true); c.g.thing({ x: 7.05, z: -0.3, face: [6.5, 1.9], tilt: 0.5, smile: 1.1 }); c.P.pos.set(6.55, 0, 1.95); c.head = new V3(); },
    update(c, k) { c.E.headWorld(c.head); c.cam.pos = [6.55, 0.92, 1.95]; c.cam.look = [c.head.x, c.head.y - 0.35, c.head.z]; c.cam.fov = 82; c.g.fear(0.9); cap(c, 'it stands in the door and waits'); } },
  { id: 'p_closet', dur: 4 * B, stamp: 'NIGHT 5   4:10 AM',
    setup(c) { c.g.night({ lights: 1 }); c.UI.pod('louvers'); c.g.flashlight(true); c.P.pos.set(5.85, 0, 0.04); c.g.thing({ x: 7.3, z: 0.55, face: [6.1, 1.8], mode: 'walk', speed: 0.3, tilt: 0.25, look: false }); c.from = [7.3, 0, 0.55]; c.to = [6.05, 0, 1.85]; },
    update(c, k) {
      const w = clamp((k - 0.05) / 0.62, 0, 1); c.E.root.position.copy(mix3(c.from, c.to, w));
      if (w < 1) { c.E.mode = 'walk'; c.E.faceTowards(c.to[0], c.to[2], 1); c.E.lookTarget = null; } else { c.E.mode = 'idle'; c.E.faceTowards(5.85, 0.3, 0.15); c.E.lookTarget = c.camera.position; c.E.tilt = 0.5; }
      c.cam.pos = [5.85, 1.05, 0.04]; c.cam.yaw = Math.PI + 0.08 - 0.22 * ease.inOut(w); c.cam.pitch = 0.02; c.cam.fov = 70; c.g.fear(0.7); cap(c, 'i hid in the closet. it knew.');
    } },
  { id: 'p_grin', dur: 3 * B, stamp: 'NIGHT 7   4:02 AM',
    setup(c) { c.g.night({ lights: 0.15, spot: BATH_I * 0.6, flicker: true }); c.g.thing({ x: 5.4, z: -0.9, yaw: Math.PI / 2, tilt: 0.2 }); c.P.pos.set(6.2, 0, -0.9); c.head = new V3(); },
    update(c, k) { c.E.smileScale = lerp(1.05, 1.35, k); c.E.tilt = 0.2 + Math.sin(c.st * 1.3) * 0.3; c.E.headWorld(c.head); c.cam.pos = [c.head.x + lerp(0.8, 0.6, k), c.head.y - 0.12, c.head.z + 0.04]; c.cam.look = [c.head.x, c.head.y, c.head.z]; c.cam.fov = 52; c.g.fear(1); cap(c, 'night 7'); } },
  { id: 'p_chase', dur: 4 * B,
    setup(c) {
      c.g.night({ lights: 0.4, spot: BATH_I * 0.5, flicker: true }); c.g.door('kid', true);
      c.route = path([[2.2, EYE_KID, -1.0], [3.6, EYE_KID, -0.9], [6.4, EYE_KID, -0.9], [7.05, EYE_KID, -0.1], [7.3, EYE_KID, 1.2], [7.45, EYE_KID, 2.3]]); c.K0 = 0.14;
      c.g.thing({ x: 2.2, z: -1.0, mode: 'run', speed: 1.1, tilt: 0.2, smile: 1.1 }); c.ep = new V3(); c.head = new V3();
    },
    update(c, k) {
      const st = c.st, run = clamp((st - 0.25) / 1.9, 0, 1), rk = lerp(c.K0, 1, ease.inOut(run) * 0.5 + run * 0.5);
      const p = c.route.at(rk), tg = c.route.tangent(Math.min(1, rk + 0.02)), aheadYaw = Math.atan2(-tg.x, -tg.z), running = run > 0 && run < 1;
      c.cam.pos = [p.x, p.y + (running ? Math.sin(st * 14) * 0.04 : 0), p.z];
      const back = clamp((st - 2.2) / 0.4, 0, 1), lunge = ease.in(clamp((st - 2.55) / 0.75, 0, 1));
      if (back <= 0) { c.route.at(Math.max(0, rk - lerp(c.K0, 0.08, run)), c.ep); c.E.root.position.set(c.ep.x, 0, c.ep.z); c.E.faceTowards(p.x, p.z, 1); c.E.mode = running ? 'run' : 'idle'; }
      else { const d = lerp(1.6, 0.55, lunge); c.E.root.position.set(p.x + Math.sin(aheadYaw) * d, 0, p.z + Math.cos(aheadYaw) * d); c.E.faceTowards(p.x, p.z, 1); c.E.mode = 'idle'; c.E.reach = back; c.E.smileScale = 1.1 + lunge * 0.4; c.E.lean = 0.3 * lunge; c.E.tilt = 0.4; }
      const fwdPitch = -0.04 + (running ? Math.sin(st * 14) * 0.012 : 0);
      if (st < 0.25) { c.cam.yaw = lerpAngle(aheadYaw + Math.PI * 0.8, aheadYaw, ease.out(st / 0.25)); c.cam.pitch = fwdPitch; }
      else if (back <= 0) { c.cam.yaw = aheadYaw; c.cam.pitch = fwdPitch; }
      else { c.E.headWorld(c.head); const a = aim(c.cam.pos, [c.head.x, c.head.y - 0.3, c.head.z]); c.cam.yaw = lerpAngle(aheadYaw, a.yaw, ease.inOut(back)); c.cam.pitch = lerp(fwdPitch, a.pitch, ease.inOut(back)); }
      c.cam.roll = running ? Math.sin(st * 7) * 0.025 : 0; c.cam.sway = 2.2; c.cam.fov = lerp(80, 88, run); c.g.fear(1); if (st > 2.55 && st < 2.7) c.g.shake(0.7);
      if (k < 0.66) cap(c, 'run', 0.2);
    } },
  { id: 'p_black2', dur: 0.5 * B, black: true, noRender: true, setup() {}, update() {} },
  { id: 'p_scare', dur: 1 * B,
    setup(c) { c.g.night({ lights: 0, spot: BATH_I, flicker: true }); c.g.thing({ x: 6.45, z: -0.9, yaw: -Math.PI / 2, tilt: 0.35, lean: 0.4, reach: 1, smile: 1.5 }); c.P.pos.set(5.9, 0, -0.9); c.head = new V3(); },
    update(c, k) { c.E.headWorld(c.head); c.cam.pos = [5.95, 1.3, -0.9]; c.cam.look = [c.head.x, c.head.y - 0.15, c.head.z]; c.cam.fov = 78; c.cam.sway = 3; c.ui.flash(k < 0.15 ? 1 - k / 0.15 : 0); c.g.shake(1); c.g.fear(1); } },
  // the end card: the title and where to go. c.opts.linkInBio switches the second line for platforms without links.
  { id: 'p_end', dur: 4.0, black: true, noRender: true, setup() {},
    update(c) { c.ui.card({ big: 'TOP BUNK', line: c.opts && c.opts.linkInBio ? 'wishlist on Steam<br>link in bio' : 'wishlist on Steam', alpha: c.fadeInOut(0.25, 0.5, 0.6) }); } },
]);
