// TOP BUNK trailer: the shot list and the player that drives the game through window.__game.
// Loaded by trailer/render.js (headless, frame by frame with a frozen clock) and by trailer/boot.js (live, in a browser at index.html?trailer=1).
// A shot is { id, t, dur, setup(c), update(c, k) } where c is the context below. The camera is set every frame by the shot (c.cam), then the game's
// own handheld tremor goes on top, so nothing is ever perfectly still. Text cards, captions and fades are DOM injected at runtime.
import * as THREE from 'three';
import { V3, EYE_KID, BATH_I, clamp, lerp, ease, mix3, xyz, aim, lerpAngle, wobble, rng, path, makeOverlays, gameHelpers, plainTv } from './lib.js';
import { PORTRAIT_SHOTS, PORTRAIT_DURATION } from './shots_portrait.js';

export const LANDSCAPE_DURATION = 139;   // 2:19, the length of the recording the cut is timed to
// The three marks the landscape cut hangs on, in seconds of the recording. Everything else is a fraction of the act between two marks,
// so moving a mark re-times the whole cut and nothing overlaps.
//   TURN  the first beat of "the colors of the rainbow": the day ends on it. In the recording this cut is made for, the song goes from the
//         first "what a wonderful world" straight into that bridge, so it lands near 0:34. The common single has a "skies of blue" verse
//         first and its bridge nearer 56.5. Nudge it to the recording.
//   DROP  "yes I think to myself": the hard cut to black and silence, then the face.
export const TURN = 34.5;
export const DROP = 107;
// lays a list of shots over [t0, t1]: each shot's `w` is its share of the span (written as the seconds it gets at the marks above);
// a shot with `fix: true` keeps exactly w seconds, and the rest share what is left
const act = (t0, t1, list) => {
  const fixed = list.reduce((s, x) => s + (x.fix ? x.w : 0), 0), flex = list.reduce((s, x) => s + (x.fix ? 0 : x.w), 0), span = t1 - t0 - fixed;
  let t = t0;
  list.forEach((s, i) => { s.t = +t.toFixed(3); const end = i === list.length - 1 ? t1 : t + (s.fix ? s.w : span * s.w / flex); s.dur = +(end - s.t).toFixed(3); t = end; });
  return list;
};
// the shadow from the nightmare (nightmares.js makeShadow): a figure with no face, black on a dark wall
function shadowFigure(house) {
  const g = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ color: 0x010102, transparent: true, opacity: 0, depthWrite: false, fog: true });
  const part = (geo, x, y, z, rx = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); g.add(m); };
  part(new THREE.CapsuleGeometry(0.2, 0.95, 6, 12), 0, 1.0, 0, 0.18); part(new THREE.SphereGeometry(0.15, 14, 10), 0, 1.74, 0.1);
  part(new THREE.CapsuleGeometry(0.045, 0.95, 4, 8), -0.3, 0.95, 0.04, 0, 0.07); part(new THREE.CapsuleGeometry(0.045, 0.95, 4, 8), 0.3, 0.95, 0.04, 0, -0.07);
  part(new THREE.CapsuleGeometry(0.07, 0.8, 4, 8), -0.1, 0.4, 0); part(new THREE.CapsuleGeometry(0.07, 0.8, 4, 8), 0.1, 0.4, 0);
  g.userData.mat = mat; house.add(g); return g;
}
const ROAD = { from: [9.7, 1.5, -25.5], to: [9.0, 1.45, -24.0], look: [2.2, 1.7, -5.5] };   // the house from the road, the truck on the left: act 1 opens on it, act 2 cuts back to it at night

// ---------- the landscape cut ----------
// ACT 1, 0 to TURN: a sunny moving day and the song, clean. The only wrong note is the drawing.
const ACT1 = [
  { id: 'road', w: 6, fadeIn: 1.6,
    setup(c) { c.g.phase('day'); c.g.person('mom', { visible: false }); c.g.person('dad', { visible: false }); },
    update(c, k) { c.cam.pos = mix3(ROAD.from, ROAD.to, ease.inOut(k)); c.cam.look = ROAD.look; c.cam.fov = 58; } },
  // the boxes on the walk, Dad at the truck (the family only animates while one of them is on screen)
  { id: 'truck', w: 5,
    setup(c) { c.g.phase('day'); c.g.person('mom', { x: 0.6, z: 1.6, yaw: -Math.PI / 2 }); c.g.person('dad', { x: 1.35, z: -13.6, yaw: Math.PI }); },
    update(c, k) { c.cam.pos = mix3([4.0, 0.85, -9.3], [3.5, 0.8, -9.9], ease.inOut(k)); c.cam.look = [2.35, 0.45, -12.6]; c.cam.fov = 46; } },
  // Dad brings a box up the walk and in at the front door, past you on the stoop
  { id: 'dad_box', w: 4.5,
    setup(c) {
      c.g.phase('day'); c.g.person('mom', { visible: false }); c.g.person('dad', { x: 2.6, z: -10.5, yaw: 0 });
      c.box = c.W.cardboardBox(0, 0, 0, 0.5, 0.44, 0.5, 2, 0, c.dad.group); c.box.position.set(0, 1.05, 0.315); c.box.castShadow = false;
      if (c.dad.rig) c.dad.rig.play('walk', { fade: 0.2, speed: 0.85 });
      c.from = [2.6, -10.5]; c.to = [1.95, -5.2];
    },
    update(c, k) {
      const w = clamp(k * 1.12, 0, 1); c.dad.group.position.set(lerp(c.from[0], c.to[0], w), 0, lerp(c.from[1], c.to[1], w)); c.dad.pose = { hold: c.box, holdW: 0.5 };
      c.cam.pos = mix3([0.55, 1.22, -5.9], [0.75, 1.2, -5.95], ease.inOut(k)); c.cam.look = [c.dad.group.position.x, 1.35, c.dad.group.position.z + 0.2]; c.cam.fov = 50;
    },
    end(c) { if (c.box) { c.box.parent.remove(c.box); c.box = null; } c.dad.pose = null; } },
  // Mom at the stove; half way in she looks up at you (the game turns them to you once you are near)
  { id: 'kitchen', w: 5,
    setup(c) { c.g.phase('day'); c.P.pos.set(-8, 0, 0.55); c.g.person('mom', { x: 2.0, z: 1.33, yaw: Math.PI / 2, busy: true }); c.g.person('dad', { visible: false }); },
    update(c, k) {
      c.P.pos.set(k > 0.5 ? 0.9 : -8, 0, 0.55); if (k > 0.5) c.mom.busy = false;
      c.cam.pos = mix3([0.9, EYE_KID, 0.55], [1.0, EYE_KID - 0.02, 0.7], ease.inOut(k)); c.cam.look = [2.0, 1.52, 1.33]; c.cam.fov = lerp(52, 46, ease.inOut(k));
    } },
  { id: 'bunk', w: 5,
    setup(c) { c.g.phase('day'); c.g.person('mom', { visible: false }); c.g.person('dad', { visible: false }); },
    update(c, k) { c.cam.pos = mix3([7.6, 0.72, 0.95], [7.45, 0.86, 1.35], ease.inOut(k)); c.cam.look = [6.25, 1.6, 3.05]; c.cam.fov = 56; } },
  { id: 'drawing', w: 4.5,
    setup(c) { c.g.phase('day'); c.g.person('mom', { visible: false }); c.g.person('dad', { visible: false }); c.W.drawingMat.map = c.W.T.drawing0; c.W.drawingMat.needsUpdate = true; },
    update(c, k) { c.cam.pos = mix3([5.55, 1.18, -1.3], [5.6, 1.1, -0.9], ease.inOut(k)); c.cam.look = [5.6, 1.06, -0.38]; c.cam.fov = lerp(44, 36, ease.inOut(k)); } },
  // the sun through the curtains of your window, from the top bunk; the one caption of the cut
  { id: 'curtains', w: 4.5,
    setup(c) { c.g.phase('day'); c.g.person('mom', { visible: false }); c.g.person('dad', { visible: false }); c.g.sunPatch(14, [6.5, 0.3, 2.3]); c.P.pos.set(6.03, 0, 3.02); },
    update(c, k) {
      c.cam.pos = mix3([6.3, 1.98, 2.7], [6.45, 1.96, 2.8], ease.inOut(k)); c.cam.look = [8.1, 1.7, 2.85]; c.cam.fov = lerp(50, 46, ease.inOut(k));
      c.ui.caption('The rent was cheap.', c.ramp(c.st, 0.7, 1.3, c.shot.dur - 0.55, c.shot.dur - 0.15));
    } },
];
// ACT 2, TURN to DROP: the same road at night, one pan through the house while the song is still sweet, then shorter and shorter shots as it warps
const ACT2 = [
  // the hard cut: the same angle, night, the porch light on
  { id: 'road_night', w: 3.5,
    setup(c) { c.g.night({ lights: 1 }); c.g.person('mom', { visible: false }); c.g.person('dad', { visible: false }); c.W.frontDoor.setOpen(false); c.W.porchLight.distance = 16; },
    update(c, k) { c.W.porchLight.intensity = 40; c.W.porchBulb.material.emissiveIntensity = 6; c.cam.pos = mix3(ROAD.to, [8.8, 1.45, -23.7], k); c.cam.look = ROAD.look; c.cam.fov = 58; },
    end(c) { c.W.porchLight.distance = 6; c.W.porchLight.intensity = 0; c.W.porchBulb.material.emissiveIntensity = 0; } },
  // one continuous move: in at the front door, across the living room past the TV, into the hall and down it toward your door
  { id: 'pan', w: 9.5,
    setup(c) {
      c.g.night({ lights: 1 }); c.W.frontDoor.setOpen(true); c.W.tvFx.set(true); c.P.pos.set(1.9, 0, -3.0);
      c.route = path([[1.9, 1.32, -6.3], [1.9, 1.3, -4.3], [1.3, 1.26, -2.5], [2.5, 1.22, -1.25], [4.3, 1.2, -0.92], [6.0, 1.18, -0.9]]);
      c.looks = path([[1.9, 1.35, -4.5], [0.4, 1.2, -1.6], [2.71, 0.9, -3.27], [5.5, 1.0, -0.9], [8.0, 0.95, -0.9], [6.95, 1.0, -0.3]]);
    },
    update(c, k) {
      c.W.porchLight.intensity = 9; const e = k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k);   // a slow start, no stop
      const p = c.route.at(lerp(0, 1, 0.3 * e + 0.7 * k)), l = c.looks.at(clamp(k * 1.05, 0, 1)); c.cam.pos = [p.x, p.y, p.z]; c.cam.look = [l.x, l.y, l.z]; c.cam.fov = 54; c.g.fear(0.15);
    } },
  { id: 'tv', w: 5.5,
    setup(c) { c.g.night({ lights: 1 }); c.W.tvFx.set(true); c.P.pos.set(0.5, 0, -3.0); },
    update(c, k) { if (k > 0.62) c.W.tvFx.figure = 1; c.cam.pos = mix3([0.3, 0.95, -2.95], [0.8, 0.92, -3.1], ease.inOut(k)); c.cam.look = [2.71, 0.82, -3.27]; c.cam.fov = lerp(44, 38, k); } },
  { id: 'door', w: 5,
    setup(c) { c.g.night({ lights: 1, spot: 32 }); c.g.door('kid', true); c.P.pos.set(7.35, 0, 1.75); c.closed = false; },
    update(c, k) {
      if (k > 0.18 && !c.closed) { c.closed = true; c.g.door('kid', false); }
      if (k > 0.62) c.W.bathSpot.intensity = 0;
      c.cam.pos = mix3([7.35, 1.08, 1.8], [7.3, 1.05, 1.6], ease.inOut(k)); c.cam.look = [6.95, 1.0, -0.28]; c.cam.fov = 54;
    } },
  // the thing at the end of the hall: still, then one step
  { id: 'hall_thing', w: 6,
    setup(c) { c.g.night({ lights: 0.25, spot: BATH_I, flicker: true }); c.g.thing({ x: 1.6, z: -0.9, yaw: Math.PI / 2, tilt: 0 }); c.P.pos.set(6.9, 0, -0.9); },
    update(c, k) {
      const step = clamp((k - 0.58) / 0.1, 0, 1); c.E.root.position.x = 1.6 + 0.55 * ease.inOut(step); c.E.mode = step > 0 && step < 1 ? 'walk' : 'idle'; if (step > 0) c.E.faceTowards(6.9, -0.9, 1);
      c.E.tilt = 0.55 * ease.inOut(clamp(k * 1.6, 0, 1)); c.cam.pos = mix3([6.95, 1.22, -0.9], [6.45, 1.2, -0.92], ease.inOut(k)); c.cam.look = [1.6, 1.35, -0.9]; c.cam.fov = 44; c.g.fear(0.8);
    } },
  { id: 'window_face', w: 5,
    setup(c) { c.g.night({ lights: 1 }); c.g.windowFace(0.23); c.P.pos.set(6.03, 0, 3.02); },
    update(c, k) { c.WF.t = 0.23 + 0.08 * k; c.cam.pos = [6.3, 2.14, 2.95]; c.cam.look = [8.1, 1.78, 2.85]; c.cam.fov = 50; c.g.fear(0.4); } },
  // the game's hiding camera sits inside the closet body (the leaves are solid, the slats are the overlay), so this one stands a hand's width
  // outside the leaves, as store screenshot 07 does, and keeps the thing's head between the slats while it comes in. Your torch lights its face.
  { id: 'closet', w: 6,
    setup(c) { c.g.night({ lights: 1 }); c.UI.pod('louvers'); c.g.flashlight(true); c.P.pos.set(5.95, 0, 0.52); c.g.thing({ x: 7.45, z: 2.2, face: [6.1, 1.45], mode: 'walk', speed: 0.2, tilt: 0.25, look: false }); c.walkFrom = [7.45, 0, 2.2]; c.walkTo = [6.1, 0, 1.45]; c.head = new V3(); },
    update(c, k) {
      const w = clamp((k - 0.08) / 0.6, 0, 1), p = mix3(c.walkFrom, c.walkTo, w); c.E.root.position.copy(p);
      if (w < 1) { c.E.mode = 'walk'; c.E.faceTowards(c.walkTo[0], c.walkTo[2], 1); c.E.lookTarget = null; }
      else { c.E.mode = 'idle'; c.E.faceTowards(5.95, 0.52, 0.12); c.E.lookTarget = c.camera.position; c.E.tilt = 0.5; c.E.smileScale = 1.1; }
      c.E.headWorld(c.head);
      c.cam.pos = [5.95, 1.6 + wobble(c.st * 0.5, 2) * 0.01, 0.52]; c.cam.look = [c.head.x, c.head.y - 0.12, c.head.z]; c.cam.fov = 58; c.g.fear(0.6);
    } },
  // grandpa in his chair, turning
  { id: 'vigil', w: 6,
    setup(c) { c.g.night({ lights: 1 }); c.g.vigil(true); c.P.pos.set(7.6, 0, -0.9); },
    update(c, k) { c.cam.pos = mix3([7.7, 0.62, -0.95], [6.5, 0.72, -0.9], ease.inOut(k)); c.cam.look = [3.5, 0.85, -0.6]; c.cam.fov = 40; c.g.fear(0.3); },
    end(c) { c.g.vigil(false); } },
  // the shadow in the corner of the living room: there at the edge of the frame, gone when the camera turns to it
  { id: 'shadow', w: 5.5,
    setup(c) { c.g.night({ lights: 0.35 }); c.P.pos.set(-1.2, 0, -1.0); c.sh = shadowFigure(c.W.house); c.sh.position.set(2.95, 0, -3.95); c.sh.lookAt(0, 0, -2.4); c.sh.rotation.x = 0; c.sh.visible = true; },
    update(c, k) {
      const turn = ease.inOut(clamp((k - 0.68) / 0.22, 0, 1));
      c.sh.userData.mat.opacity = Math.min(ease.out(clamp(k / 0.35, 0, 1)), 1 - ease.in(clamp((turn - 0.45) / 0.45, 0, 1)));
      c.cam.pos = mix3([-1.2, 1.18, -1.0], [-1.0, 1.16, -1.1], ease.inOut(k)); c.cam.look = mix3([0.9, 1.0, -3.9], [2.95, 1.1, -3.95], turn); c.cam.fov = 48; c.g.fear(0.5);
    },
    end(c) { if (c.sh) { c.W.house.remove(c.sh); c.sh = null; } } },
  // the laundry under the house: the washer's lid bangs open on its own
  { id: 'washer', w: 5,
    setup(c) { c.g.night({ lights: 0.5 }); c.W.laundry.bulb.set(true); c.W.laundry.bulb.swing = 0.16; c.W.laundry.washer.open(0); c.P.pos.set(-5.6, c.W.laundry.floor, 1.0); },
    update(c, k) {
      const B = c.W.laundry.floor, bang = clamp((c.st - 2.7) / 0.1, 0, 1); c.W.laundry.washer.open(Math.min(1, bang * 1.15) - (bang >= 1 ? 0.06 * Math.abs(Math.sin((c.st - 2.8) * 18)) * Math.exp(-(c.st - 2.8) * 3) : 0));
      if (bang > 0 && bang < 1) c.g.shake(0.5);
      c.cam.pos = mix3([-5.7, B + 1.15, 0.95], [-6.1, B + 1.1, 1.1], ease.inOut(k)); c.cam.look = [-7.7, B + 0.85, 1.62]; c.cam.fov = 50; c.g.fear(0.6);
    },
    end(c) { c.W.laundry.bulb.set(false); c.W.laundry.bulb.swing = 0.08; c.W.laundry.washer.open(0); } },
  // from the top bunk: it is standing at the foot of the bed
  { id: 'bunk_foot', w: 4.5,
    setup(c) { c.g.night({ lights: 0.3 }); c.P.pos.set(6.03, 0, 3.02); c.g.thing({ x: 6.25, z: 1.25, face: [6.1, 3.0], tilt: 0.45, smile: 1.15 }); c.head = new V3(); },
    update(c, k) { c.E.tilt = 0.45 + Math.sin(c.st * 0.7) * 0.15; c.E.lean = 0.15 * k; c.E.headWorld(c.head); c.cam.pos = [6.1, 1.95 + Math.sin(c.st * 2.2) * 0.006, 3.05]; c.cam.look = [c.head.x, c.head.y - 0.15, c.head.z]; c.cam.fov = 56; c.g.fear(0.9); } },
  // under the covers, holding your breath
  { id: 'covers', w: 4.5,
    // the HUD is hidden for the trailer; this one shot brings the breath meter back (nothing else on the HUD is set)
    setup(c) { c.g.night({ lights: 0.6 }); c.UI.blanket(true); c.P.pos.set(6.03, 0, 3.02); const h = document.getElementById('hud'), b = document.getElementById('breath'); if (h) h.style.setProperty('display', 'block', 'important'); if (b) b.style.transition = 'none'; },
    update(c, k) {
      const t = c.st, br = 1 - 0.85 * ease.in(k); c.UI.breath(br, true, br < 0.3);
      c.cam.pos = [6.13, 1.9 + Math.sin(t * 2.2) * 0.008, 3.02]; c.cam.yaw = -0.27 + wobble(t * 0.4, 1) * 0.03; c.cam.pitch = -0.06 + Math.sin(t * 2.2) * 0.004; c.cam.fov = 60; c.g.fear(0.9);
    },
    end(c) { c.UI.breath(1, false); const h = document.getElementById('hud'); if (h) h.style.removeProperty('display'); } },
  // the sprint down the hall with it behind you; the look back, and it is on you: the cut
  { id: 'sprint', w: 7.5, teaser: 2.5,   // the ten-second teaser: the run, the cut, the scare and the first of the title
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
];
// DROP to the end: black and nothing, the face, the title
const CARDS = [
  { id: 'black1', w: 0.7, fix: true, black: true, noRender: true, setup() {}, update() {} },
  { id: 'scare', w: 1.3, fix: true,
    setup(c) { c.g.night({ lights: 0, spot: BATH_I, flicker: true }); c.g.thing({ x: 6.45, z: -0.9, yaw: -Math.PI / 2, tilt: 0.35, lean: 0.4, reach: 1, smile: 1.5 }); c.P.pos.set(5.9, 0, -0.9); c.head = new V3(); },
    update(c, k) { c.E.headWorld(c.head); c.cam.pos = [5.95, 1.35, -0.9]; c.cam.look = [c.head.x, c.head.y - 0.1, c.head.z]; c.cam.fov = 68; c.ui.flash(k < 0.12 ? 1 - k / 0.12 : 0); c.g.shake(1); c.g.fear(1); } },
  { id: 'title', w: 8.7, black: true, noRender: true, setup() {}, update(c, k) { c.ui.card({ big: 'TOP BUNK', alpha: c.fadeInOut(0.6, 1.4, 0.8) }); } },
  { id: 'tagline', w: 6, black: true, noRender: true, setup() {},
    update(c) { const st = c.st, d = c.shot.dur / 6; c.ui.card(st < 2.8 * d ? { line: 'Ten nights.', alpha: c.ramp(st, 0.2 * d, 0.6 * d, 2.4 * d, 2.8 * d) } : { line: 'Nobody believed you.', alpha: c.ramp(st, 3.0 * d, 3.5 * d, 5.6 * d, 6.0 * d) }); } },
  { id: 'wishlist', w: 7, black: true, noRender: true, setup() {}, update(c) { c.ui.card({ line: 'Wishlist on Steam', small: 'a first-person horror game for PC', alpha: c.fadeInOut(0.4, 0.8, 1.0) }); } },
  { id: 'warning', w: 8.3, black: true, noRender: true, setup() {}, update(c) { c.ui.card({ small: 'Contains jump scares and flashing lights', alpha: c.fadeInOut(0.3, 0.6, 1.4) }); } },
];
export const SHOTS = [...act(0, TURN, ACT1), ...act(TURN, DROP, ACT2), ...act(DROP, LANDSCAPE_DURATION, CARDS)];

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
    if (shot.post) shot.post(c);   // after the game has posed the thing: a shot can still bend a limb for this frame
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
    // grain is per frame, not per exposure; overlaid in portrait, so it needs the full strength
    if (!c.subframe) ui.grain((c.rnd() * 14 - 7).toFixed(1), (c.rnd() * 14 - 7).toFixed(1), portrait ? 1 : 0.55);
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
    if (pending) { apply(); pending = false; }   // nothing was drawn: a black card, or a frame nobody will look at
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
    SHOTS: shots, duration, fps, portrait, ctx: c, marks: { TURN, DROP, DURATION: duration },
    // one-time: the test mode, the graphics knobs, the shaders for every lighting phase
    async begin({ quality, shadow, res, ss, letterbox, ca } = {}) {
      if (began) return; began = true;
      game.start(); game.gfx.auto = false;
      if (quality) game.gfx.setQuality(quality, { save: false });
      if (shadow) for (const l of game.scene.userData.shadowLights) { const sz = l.sun ? shadow : shadow / 2; l.light.shadow.mapSize.set(sz, sz); if (l.light.shadow.map) { l.light.shadow.map.dispose(); l.light.shadow.map = null; } l.light.shadow.needsUpdate = true; }
      // ss: render at exactly that many pixels per output pixel (the frame grab scales it down); res alone is the preset's own scale times res
      if (ss) game.gfx.setRes((res || 1) * ss / game.gfx.baseDpr()); else if (res && res !== 1) game.gfx.setRes(res);
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
      const n = !capture || s0.noRender ? 1 : Math.max(1, Math.min(8, Math.round(want))), shut = Math.min(1 / fps, 1 / 30, s0.t + s0.dur - t0 - 1e-6);   // never past the cut
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
