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
// The cut is laid out in beats. Forty of them fill the day (BEAT = TURN / 40, 0.86 s, a slow ballad's pulse), and eighty-four of nearly
// the same length fill the night up to the drop, so a shot's `w` is the beats it holds and every cut before the drop lands on one.
export const BEAT = TURN / 40;
// lays a list of shots over [t0, t1]: each shot's `w` is its share of the span (beats in the two acts, seconds in the cards);
// a shot with `fix: true` keeps exactly w seconds, and the rest share what is left
const act = (t0, t1, list) => {
  const fixed = list.reduce((s, x) => s + (x.fix ? x.w : 0), 0), flex = list.reduce((s, x) => s + (x.fix ? 0 : x.w), 0), span = t1 - t0 - fixed;
  let t = t0, at = t0;   // (at: where the cut falls, unrounded; t: the same to the millisecond, so a shot ends exactly where the next begins)
  list.forEach((s, i) => { at += s.fix ? s.w : span * s.w / flex; const end = i === list.length - 1 ? t1 : +at.toFixed(3); s.t = t; s.dur = +(end - t).toFixed(3); t = end; });
  return list;
};
// The day is the night's set-up: each of these frames is shown once in the sun and once in the dark, from the same place with the same
// lens and the same slow move, so the two halves of a pair cannot drift apart.
const CAM = {
  road: { from: [14.4, 1.5, -19.7], to: [13.7, 1.55, -18.7], look: [2.9, 2.6, -5.0], fov: 55 },      // the house from the front lawn, the truck in the drive
  living: { from: [0.5, 1.25, -1.1], to: [1.0, 1.2, -1.42], look: [3.4, 1.0, -3.5], fov: 66 },       // the front window, the clock, the door and the television, from across the carpet
  kitchen: { from: [-0.45, 1.3, 0.6], to: [-0.2, 1.28, 0.8], look: [1.6, 0.8, 2.6], fov: 58 },       // the table and its four chairs
  phone: { from: [-2.3, 1.2, 1.0], to: [-1.8, 1.24, 1.32], look: [-0.78, 1.3, 1.64], fov: 46 },      // the telephone on the dining wall
  bunk: { from: [10.95, 1.2, 0.7], to: [10.75, 1.22, 0.95], look: [9.0, 1.62, 3.9], fov: 60 },       // the bunk from inside your door
  window: { from: [8.5, 1.98, 3.68], to: [8.72, 1.96, 3.78], look: [11.36, 1.7, 3.83], fov: 50 },    // your window, from the top bunk
  photos: { from: [8.4, 1.25, -0.05], to: [7.85, 1.25, -0.05], look: [6.3, 1.45, -1.1], fov: 58 },   // along the photographs on the hall wall, level
  hall: { from: [8.95, 1.2, -0.75], to: [8.7, 1.2, -0.75], look: [5.0, 1.1, -0.3], fov: 56 },        // down the hall, the drawing on the left
  drawing: { from: [7.56, 1.18, -0.9], to: [7.63, 1.1, -0.5], look: [7.63, 1.06, 0.2], fov: 42 },    // what the last kid left taped to the wall
};
const frame = (c, p, k) => { c.cam.pos = mix3(p.from, p.to, ease.inOut(k)); c.cam.look = p.look; c.cam.fov = p.fov; };
const alone = (c) => { c.g.person('mom', { visible: false }); c.g.person('dad', { visible: false }); };
const day = (c) => { c.g.phase('day'); alone(c); c.g.drawing(0); };
// (nl: the plug-in night lights. They are green, and a shot has one light and it is not that one: they are out unless a shot asks)
const night = (c, o = {}) => { c.g.night({ nl: 0, ...o }); alone(c); c.g.drawing(1); };
// Grandpa's flashlight in the right hand, lit (aim: brought up, the beam narrowed; i: how bright, for a shot close to a pale wall, or the
// bloom takes the picture; wide: the cone opened out)
const torch = (c, { i = 14, wide = 0, ...o } = {}) => { c.g.flashlight(true, i, wide); c.g.hands({ flashOn: true, ...o }); c.cam.sway = 0.5; };
// the moon through your window: the hall's spot, borrowed and put outside the glass
const moon = (c, i, at) => { c.g.sunPatch(i, at); c.W.bathSpot.color.set(0x9db6ff); };
const B2 = (DROP - TURN) / 84;                         // a beat of the night
const beats = (c) => c.st / (c.shot.dur / c.shot.w);   // how far into the shot, in beats
// the camera's flash: bright for a frame, then the eye's own afterimage of it, fading (f: seconds since the shutter)
const FLASH_S = 0.5, glow = (f) => (f < 0 || f >= FLASH_S ? 0 : f < 0.09 ? 1 : Math.exp(-(f - 0.09) / 0.16));
// aim at its head from wherever the camera is, a little soft so the frame is never locked to it
const onHead = (c, dy = 0, k = 1) => { c.E.headWorld(c.head); c.aim ||= c.head.clone(); c.aim.lerp(c.head, k); c.cam.look = [c.aim.x, c.aim.y + dy, c.aim.z]; };
// the middle of its face (between the eyes and the teeth) and the way the face points, wherever the head has turned: a shot that is
// nothing but the face stands the camera straight out along that line
const faceOf = (c) => {
  const at = new V3(), b = new V3(), parts = c.E.head.children.filter((m) => m.isMesh && m.geometry);
  for (const m of parts) { m.updateWorldMatrix(true, false); m.geometry.boundingBox || m.geometry.computeBoundingBox(); at.add(m.geometry.boundingBox.getCenter(b).applyMatrix4(m.matrixWorld)); }
  at.multiplyScalar(1 / Math.max(1, parts.length)); c.E.headWorld(c.head);
  return { at, n: at.clone().sub(c.head).normalize() };
};

// ---------- the landscape cut ----------
// ACT 1, 0 to TURN: a flash in the dark, then a sunny moving day and the song, clean. The only wrong note is the drawing.
const COLD_FLASH = 0.95, COLD_HOLD = 0.3;   // the cold open's flash, and how long its picture stays, in seconds
const ACT1 = [
  // black, a breath, the disposable camera's click, and for six frames two eyes are over the rail of your bunk
  { id: 'cold', w: 2,
    setup(c) { night(c, { nl: 0, roof: 0 }); c.P.pos.set(8.28, 0, 4); c.head = new V3(); },
    update(c) {
      const f = c.st - COLD_FLASH, lit = f >= 0 && f < COLD_HOLD;
      c.g.thing({ x: 8.28, z: 2.62, face: [8.38, 4.0], lean: 0.45, tilt: -0.3 }); c.E.smile.visible = false;   // (every frame: nothing else may have it on the first frames)
      c.E.headWorld(c.head); c.cam.pos = [8.38, 1.92, 4.0]; c.cam.look = [c.head.x, c.head.y - 0.1, c.head.z]; c.cam.fov = 30; c.black = lit ? 0 : 1;
      if (lit) { c.g.bulb(0.5, [8.38, 2.0, 3.75], 2.2); c.ui.flash(f < 0.05 ? 0.8 : 0); }
    } },
  { id: 'road', w: 5, setup(c) { day(c); c.W.frontDoor.setOpen(true); }, update(c, k) { frame(c, CAM.road, k); } },
  // the boxes on the walk and the truck in the drive, nobody in sight
  { id: 'boxes', w: 4, setup(c) { day(c); },
    update(c, k) { c.cam.pos = mix3([5.6, 1.0, -9.6], [4.9, 0.95, -10.3], ease.inOut(k)); c.cam.look = [3.0, 0.75, -13.4]; c.cam.fov = 46; } },
  // the living room with the front door standing open and the sun across the carpet: the truck in the window, the clock, the television
  { id: 'living', w: 3,
    setup(c) { day(c); c.W.frontDoor.setOpen(true); c.g.spot({ from: [1.2, 2.6, -6.2], at: [1.6, 0, -2.6], color: 0xffd9a0, i: 60, angle: 0.45 }); c.P.pos.set(0.7, 0, -1.2); },
    update(c, k) { frame(c, CAM.living, k); } },
  { id: 'kitchen', w: 4, setup(c) { day(c); c.W.frontDoor.setOpen(false); c.P.pos.set(-0.45, 0, 0.6); }, update(c, k) { frame(c, CAM.kitchen, k); } },
  { id: 'phone_day', w: 3, setup(c) { day(c); c.P.pos.set(-2.3, 0, 1.0); }, update(c, k) { frame(c, CAM.phone, k); } },
  { id: 'bunk', w: 4, setup(c) { day(c); c.g.sunPatch(22, [9.4, 0.3, 3.0]); }, update(c, k) { frame(c, CAM.bunk, k); } },
  { id: 'window', w: 3, setup(c) { day(c); c.g.sunPatch(14, [8.75, 0.3, 3.28]); c.P.pos.set(8.28, 0, 4); }, update(c, k) { frame(c, CAM.window, k); } },
  // along the family's photographs, the hall's light on
  { id: 'photos', w: 4, setup(c) { day(c); c.g.light('hall', true, true); c.P.pos.set(8.2, 0, -0.1); }, update(c, k) { frame(c, CAM.photos, k); } },
  { id: 'hall', w: 4, setup(c) { day(c); c.P.pos.set(8.9, 0, -0.75); }, update(c, k) { frame(c, CAM.hall, k); } },
  { id: 'drawing', w: 4, setup(c) { day(c); c.P.pos.set(7.6, 0, -0.8); }, update(c, k) { frame(c, CAM.drawing, k); } },
];
const SWITCH = [11.24, 1.2, -0.08];   // the plate at your end of the hall
// ACT 2, TURN to DROP: the same frames in the dark, and what you do about it. The thing itself is in four of these shots and for under
// a second in each (two eyes in the cold open, two eyes past the end of the hall, the window, the slats): the rest is the house.
// The shots get shorter all the way: fours, threes, twos, a run of single beats, two beats of black and the sprint a beat to a look.
const CHAIRS_OUT = [[0.18, 2.14, -2.34], [0.53, 1.78, -2.34], [0.88, 1.42, -2.34], [1.23, 1.06, -2.34]];   // the four chairs, out from the table in a row and turned to the door
const SNAPS = [1, 2, 3], CHAIR_AT = [null, [5.2, -0.42], [7.6, -0.5]];   // the camera shot's three exposures (beats), and where the chair stands in each
// a room's light stuttering as it does when the thing is under its bulb: on or off by the frame (s: seconds, hz: how fast)
const stutter = (s, hz = 17) => Math.sin(s * hz) + Math.sin(s * hz * 2.7 + 1.3) > -0.35;
// the sprint down the hall, a beat to a look and a cut on each: ahead, ahead, back at the lights going out behind you, ahead, and back at
// the door you came through. The cut comes before there is anything in it. (u: beats since the first of them)
const SPRINT = 5;
const sprintSetup = (c) => {
  night(c, { nl: 0 }); c.g.doorNow('kid', true); torch(c, { i: 16, sprint: true });
  // the route: out of the living room, down the hall, through your door and up to the foot of the bunk
  c.route = path([[3.2, EYE_KID, -0.9], [4.4, EYE_KID, -0.8], [5.4, EYE_KID, -0.7], [6.6, EYE_KID, -0.6], [8.8, EYE_KID, -0.45], [9.55, EYE_KID, 0.15], [9.6, EYE_KID, 1.3], [9.5, EYE_KID, 2.4]]);
};
const sprintAt = (c, u) => {
  const st = u * B2, k = u / SPRINT, look = Math.floor(u), back = look === 2 || look >= 4, rk = lerp(0.06, 1, ease.out(k) * 0.3 + k * 0.7);
  const p = c.route.at(rk), tg = c.route.tangent(Math.min(1, rk + 0.02)), ahead = Math.atan2(-tg.x, -tg.z), bob = Math.sin(st * 13) * 0.04;
  c.cam.pos = [p.x, p.y + bob, p.z];
  c.g.light('living', u <= 2.25, true); c.g.light('hall', u <= 2.6, true);
  if (!back) { c.cam.yaw = ahead; c.cam.pitch = -0.05 + Math.sin(st * 13) * 0.012; }
  else { const a = aim(c.cam.pos, look === 2 ? [3.6, 1.15, -0.8] : [9.79, 1.1, 0.3]); c.cam.yaw = a.yaw; c.cam.pitch = a.pitch; }
  if (u > 4.2) c.g.door('kid', false);
  c.g.flashlight(true, back ? (look === 2 ? 0 : 5) : 16);
  c.cam.roll = Math.sin(st * 6.5) * 0.02; c.cam.fov = back ? 62 : lerp(74, 82, k); c.cam.sway = 0.6; c.g.fear(1); if (u > 4.72) c.black = 1;
};
const ACT2 = [
  // the hard cut: the same lawn at night. The lights of the house go out by themselves, one room and then another, and then the porch lamp
  { id: 'road_night', w: 4,
    setup(c) { night(c, { nl: 1 }); c.W.frontDoor.setOpen(false); c.g.light('living', true, true); c.g.light('room2', true, true); c.g.light('spare', true, true); },
    update(c, k) {
      const u = beats(c); c.g.air({ fog: 0.012, moon: 1.2, sky: 0.9 });
      c.g.porch(u < 3.2 ? 40 : u < 3.35 ? 6 : u < 3.6 ? 40 : u < 3.72 ? 3 : u < 3.85 ? 30 : 0);
      if (u > 1.0) c.g.light('spare', false, true); if (u > 1.7) c.g.light('room2', false, true); if (u > 2.4) c.g.light('living', false, true);
      frame(c, CAM.road, k);
    } },
  // the same room by the moon in its window, and the television comes on by itself
  { id: 'tv_night', w: 4,
    setup(c) { night(c, { nl: 0, roof: 0.45 }); c.W.frontDoor.setOpen(false); c.g.spot({ from: [1.2, 2.6, -6.2], at: [1.6, 0, -2.6], i: 9, angle: 0.45 }); c.W.tvFx.base = 16; c.P.pos.set(0.7, 0, -1.2); },
    update(c, k) {
      const u = beats(c), on = (u > 0.8 && u < 3.3) || u > 3.5; if (on !== c.W.tvFx.on) c.W.tvFx.set(on); c.g.air({ fog: 0.012, moon: 1.6, sky: 1.2 });
      frame(c, CAM.living, k); c.cam.sway = 0.4; c.g.fear(0.3);
    } },
  // the kitchen by flashlight: the chairs are out from the table in a row, turned to the door, and one of them comes on
  { id: 'kitchen_night', w: 4,
    setup(c) { night(c); torch(c, { i: 9, wide: 0.72 }); c.P.pos.set(-0.45, 0, 0.6); CHAIRS_OUT.forEach(([x, z, r], i) => c.g.chair(i, x, z, r)); },
    update(c, k) {
      frame(c, CAM.kitchen, k); c.cam.look = mix3([2.6, 1.3, 1.2], CAM.kitchen.look, ease.inOut(clamp(c.st / 0.8, 0, 1))); c.cam.sway = 0.5;
      const s = ease.inOut(clamp((beats(c) - 2.0) / 1.2, 0, 1)), [x, z, r] = CHAIRS_OUT[1]; c.g.chair(1, x - 0.3 * s, z - 0.29 * s, r);
      c.g.fear(0.3);
    } },
  // the same drawing, and it is not the same drawing
  { id: 'drawing_night', w: 3,
    setup(c) { night(c); torch(c, { i: 1.1, wide: 0.62 }); c.P.pos.set(7.6, 0, -0.8); },
    update(c, k) { frame(c, CAM.drawing, k); c.g.bulb(0.5, [7.6, 1.2, -0.7], 2.2); c.cam.sway = 0.6; c.g.fear(0.5); } },   // (the bulb: the spill of the flashlight off the hall, so the whole sheet reads and not only the spot)
  // the hall's light switch under your hand: off, on, off
  { id: 'switch', w: 2,
    setup(c) { night(c, { nl: 0 }); c.g.hands({}); c.g.doorNow('kid', false); c.g.light('hall', true, true); c.g.steady('hall'); c.P.pos.set(10.4, 0, -0.6); c.s.n = 0; },
    update(c, k) {
      const st = c.st, n = [0.1, 0.78, 1.2].filter((t) => st >= t).length; if (n > c.s.n) { c.s.n = n; c.g.reach(SWITCH); }   // (the hand is at the plate a quarter second after it sets out)
      c.g.light('hall', st < 0.56 || (st >= 1.08 && st < 1.5), true);
      c.cam.pos = mix3([10.56, 1.44, -0.5], [10.64, 1.44, -0.45], k); c.cam.look = [SWITCH[0], 1.08, SWITCH[2]]; c.cam.fov = 50; c.cam.sway = 0.5;
    } },
  // and down the hall: on, nothing. Off. On: two eyes past the far end. Off. On: nothing. And the bulb goes
  { id: 'hall_switch', w: 4,
    setup(c) { night(c, { nl: 0 }); c.g.hands({}); c.g.doorNow('kid', false); c.P.pos.set(8.9, 0, -0.75); c.g.steady('hall'); c.g.paper(0.5); c.s.on = false; },
    update(c, k) {
      const u = beats(c), there = u >= 1.55 && u < 2.3, on = (u >= 0.3 && u < 1.15) || (u >= 1.6 && u < 2.2) || (u >= 2.6 && u < 3.3) || (u >= 3.36 && u < 3.42);
      if (on !== c.s.on) { c.s.on = on; c.g.light('hall', on, true); }
      if (there) { c.g.thing({ x: 3.3, z: -0.75, face: [8.9, -0.75], tilt: 0.5, lean: 0.25 }); c.E.smile.visible = false; } else c.E.visible = false;   // (out in the dark of the living room: the eyes and nothing under them)
      frame(c, CAM.hall, k); c.cam.sway = 0.4; c.g.fear(u > 1.6 ? 0.6 : 0.2);
    } },
  // the disposable camera: up to the eye, and three exposures of the hall. Nothing; a chair; the chair, nearer
  { id: 'camera', w: 4, raise: true,
    setup(c) { night(c, { nl: 0 }); c.g.hands({ film: 17 }); c.g.camera(true); c.g.doorNow('kid', false); c.g.doorNow('bath', true); c.g.light('bath', true, true); c.g.steady('bath'); c.P.pos.set(9.6, 0, -0.45); c.s.n = 0; },
    update(c, k) {
      const u = beats(c), bt = c.shot.dur / c.shot.w, n = SNAPS.filter((s) => u >= s).length, f = n ? (u - SNAPS[n - 1]) * bt : -1, g = glow(f);
      if (n > c.s.n) { c.s.n = n; c.g.snap(); c.g.hands({ film: 17 - n }); const at = CHAIR_AT[n - 1]; if (at) c.g.chair(2, at[0], at[1], -Math.PI / 2); }
      c.cam.pos = [9.6, 1.2, -0.45]; c.cam.look = [5.0, 1.0, -0.45]; c.cam.fov = lerp(62, 58, c.g.finder); c.cam.sway = 0.6;
      if (g > 0) { c.g.bulb(60 * g, [9.5, 1.3, -0.45], 12); c.ui.flash(f < 0.05 ? 0.6 : 0); }
      c.g.fear(0.5);
    } },
  // a wet night, and a car on the road: its headlights come in at the windows and go round your room
  { id: 'car_lights', w: 3,
    setup(c) { night(c, { nl: 0, roof: 0.3 }); c.g.rain('rain'); c.W.frontDoor.setOpen(false); c.P.pos.set(2.6, 0, -3.5); },
    update(c, k) {
      // (the game's own beam comes in thin at this angle: the same spot the day borrows for the sun goes round the room with it)
      const x = lerp(3.4, -2.6, k), on = Math.min(1, k * 6, (1 - k) * 6); c.g.carSweep(lerp(0.36, 0.66, k));
      c.g.spot({ from: [1.2 - x * 2.2, 1.0, -9], at: [x, 1.25, -0.6], color: 0xdfe8ff, i: 70 * on, angle: 0.3, penumbra: 0.5 });
      c.cam.pos = mix3([2.7, 1.2, -3.75], [2.45, 1.2, -3.5], k); c.cam.look = [0.4, 1.1, -0.9]; c.cam.fov = 66; c.cam.sway = 0.4; c.g.fear(0.3);
    } },
  // the power goes: the lights die one after another down the hall, and all there is left is the flashlight
  { id: 'blackout', w: 3,
    setup(c) { night(c, { nl: 0 }); c.g.hands({}); c.g.doorNow('kid', false); c.g.light('living', true, true); c.g.light('hall', true, true); c.P.pos.set(10.6, 0, -0.42); },
    update(c, k) {
      const st = c.st;
      if (st > 0.3) c.g.light('living', false, true);
      if (st > 0.6) c.g.light('hall', false, true);
      if (st > 0.85) c.F.blackout = true;
      if (st > 1.2 && !c.F.flashOn) torch(c, { i: 18 });
      c.cam.pos = mix3([10.7, 1.2, -0.42], [10.4, 1.2, -0.45], k); c.cam.look = [4.7, 1.1, -0.42]; c.cam.fov = 52; c.cam.sway = 0.5; c.g.fear(0.5);
    } },
  // out across the yard to the garage, with the flashlight
  { id: 'yard_run', w: 3, shutter: 2,
    setup(c) { night(c, { nl: 0 }); c.F.blackout = true; torch(c, { i: 22, sprint: true }); c.g.doorNow('garage', false); c.P.pos.set(-1.0, 0, -6.3); c.route = path([[-0.5, 1.2, -6.4], [-3.5, 1.2, -6.0], [-6.2, 1.2, -5.7], [-7.7, 1.2, -6.1]]); },
    update(c, k) {
      const e = ease.out(k) * 0.5 + k * 0.5, p = c.route.at(e), st = c.st; c.g.air({ fog: 0.02, moon: 0.9, sky: 0.7 });
      c.cam.pos = [p.x, p.y + Math.sin(st * 13) * 0.04, p.z]; c.cam.look = mix3([-7.0, 1.0, -6.6], [-8.3, 1.05, -7.06], ease.inOut(k)); c.cam.fov = lerp(72, 62, k); c.cam.roll = Math.sin(st * 6.5) * 0.02; c.cam.sway = 0.5; c.g.fear(0.6);
      c.g.flashlight(true, lerp(22, 5, ease.in(k)));   // (the garage door is white, and at the end of the run it is an arm's length off)
    } },
  // the breaker box in the garage: its door, the main, and the light comes back
  { id: 'breaker', w: 3,
    setup(c) { night(c, { nl: 0 }); c.F.blackout = true; torch(c, { i: 6 }); c.P.pos.set(-9.3, 0, -9.3); c.s.r = 0; },
    update(c, k) {
      const st = c.st, B = [-9.68, 1.45, -7.1], ON = 1.4;
      for (const [i, at] of [[1, 0.05], [2, 1.05]]) if (st >= at && c.s.r < i) { c.s.r = i; c.g.reach(B); }
      c.W.garage.panel.open(ease.inOut(clamp((st - 0.15) / 0.45, 0, 1)));
      if (st > ON && c.F.blackout) { c.F.blackout = false; c.g.shake(0.25); }
      if (st > ON) { c.W.garage.light.set(true); c.W.garage.light.light.intensity = 34; c.g.flashlight(true, 2.5); }   // (the bulb is across the garage from the panel)
      c.cam.pos = mix3([-9.3, 1.32, -8.75], [-9.45, 1.36, -8.25], ease.inOut(k)); c.cam.look = [-9.72, 1.42, -7.1]; c.cam.fov = 54; c.cam.sway = 0.5; c.g.fear(0.4);
    } },
  // the telephone on the dining wall, ringing in the dark: the flashlight comes round onto it, and your hand goes up
  { id: 'phone', w: 2,
    setup(c) { night(c); torch(c, { i: 2.2 }); c.W.phone.setRinging(true); c.P.pos.set(-2.4, 0, 0.9); c.s.r = false; },
    update(c, k) {
      if (c.st > 1.0 && !c.s.r) { c.s.r = true; c.g.reach([c.W.phone.pos.x, 1.42, c.W.phone.pos.z]); }
      frame(c, CAM.phone, k); c.cam.look = mix3([-2.6, 1.05, 2.9], CAM.phone.look, ease.out(clamp(c.st / 0.33, 0, 1)));   // (from the dark of the dining end)
      c.cam.pos = mix3(c.cam.pos, [c.W.phone.pos.x, 1.3, c.W.phone.pos.z], 0.3 * ease.inOut(k)); c.cam.sway = 0.9; c.g.fear(0.4);
    } },
  // the flashlight down the hall, across the photographs to the far end, and you go after it
  { id: 'hall_sweep', w: 2,
    setup(c) { night(c); torch(c, { i: 18 }); c.g.doorNow('kid', false); c.P.pos.set(9.9, 0, -0.42); },
    update(c, k) {
      const sweep = ease.inOut(clamp(k / 0.45, 0, 1));
      c.cam.pos = mix3([10.0, 1.2, -0.42], [8.9, 1.2, -0.34], k); c.cam.look = mix3([8.2, 1.3, -1.1], [5.0, 1.1, -1.0], sweep); c.cam.fov = 54; c.cam.sway = 0.6; c.g.fear(0.5);
    } },
  // the photographs, in the frame the day showed them in: one of them lets go of the wall
  { id: 'frame_fall', w: 2,
    setup(c) { night(c); torch(c, { i: 4 }); c.P.pos.set(8.0, 0, -0.1); },
    update(c, k) {
      const fall = clamp((c.st - 0.3) / 0.5, 0, 1), W = c.W; if (W.hallFrame) W.hallFrame.pose(fall);
      const down = ease.inOut(clamp((c.st - 0.5) / 0.45, 0, 1));
      frame(c, CAM.photos, 0.6 + 0.4 * k); c.cam.look = mix3([6.48, 1.6, -1.1], [6.5, 0.2, -0.85], down); c.cam.sway = 0.5;
      if (fall > 0.85 && fall < 1) c.g.shake(0.4); c.g.fear(0.4);
    } },
  // your door, shutting by itself on the lit hall
  { id: 'door', w: 2,
    setup(c) { night(c, { nl: 0 }); c.g.hands({}); c.g.doorNow('kid', true); c.g.light('hall', true, true); c.P.pos.set(9.75, 0, 3.0); c.s.shut = false; },
    update(c, k) {
      if (c.st > 0.6) c.g.door('kid', false);
      const d = c.W.doors.kid; if (!c.s.shut && d.a <= 0.001 && c.st > 0.8) { c.s.shut = true; c.g.shake(0.6); }
      c.cam.pos = mix3([9.5, 1.2, 2.9], [9.6, 1.18, 2.3], ease.inOut(k)); c.cam.look = [9.79, 1.05, 0.3]; c.cam.fov = 52; c.cam.sway = 0.5; c.g.fear(0.4);
    } },
  // the same window and the same curtains by the moon, and for the last half second what comes up over the sill outside
  { id: 'window_face', w: 2,
    setup(c) { night(c, { nl: 0.2, roof: 0.5 }); moon(c, 12, [8.9, 1.2, 3.6]); c.P.pos.set(8.28, 0, 4); },
    update(c, k) {
      const u = beats(c), up = ease.out(clamp((u - 1.3) / 0.3, 0, 1)); c.g.air({ fog: 0.012, moon: 1.8, sky: 1.5 });
      if (u > 1.28) { c.g.thing({ x: 11.95, z: 3.78, face: [8.5, 3.7], tilt: 0.45, smile: 1.15 }); c.E.root.position.y = lerp(-1.75, -0.86, up); } else c.E.visible = false;
      frame(c, CAM.window, k); c.g.fear(0.5);
    } },
  // the laundry by flashlight from its door: the washer's lid is coming up, and it comes down
  { id: 'washer', w: 2,
    setup(c) { night(c, { nl: 0 }); torch(c, { i: 3.6, wide: 0.6 }); c.W.laundry.washer.open(0.2); c.P.pos.set(-5.6, c.W.laundry.floor, 1.0); },
    update(c, k) {
      const B = c.W.laundry.floor, st = c.st, T = c.shot.dur - 0.3, shut = clamp((st - T) / 0.07, 0, 1);
      c.W.laundry.washer.open(Math.max(0, lerp(0.2, 1.05, ease.out(clamp(st / 0.9, 0, 1))) - 1.05 * shut));
      if (shut > 0 && shut < 1) c.g.shake(0.5);
      c.cam.pos = mix3([-5.7, B + 1.14, 0.95], [-6.2, B + 1.1, 1.12], ease.inOut(k)); c.cam.look = [-7.7, B + 0.85, 1.62]; c.cam.fov = 50; c.cam.sway = 0.5; c.g.fear(0.6);
    } },
  // the bathroom's light is on, and its door comes open on nobody
  { id: 'bath_door', w: 2,
    setup(c) { night(c, { nl: 0 }); c.g.hands({}); c.g.doorNow('bath', false); c.g.light('bath', true, true); c.g.steady('bath'); c.P.pos.set(6.6, 0, -0.9); },
    update(c, k) {
      const u = beats(c); if (c.st > 0.1) c.g.door('bath', true);
      if (u > 1.4) c.g.light('bath', stutter(c.st) && u < 1.8, true);
      c.cam.pos = mix3([6.9, 1.2, -0.95], [6.35, 1.2, -0.85], ease.inOut(k)); c.cam.look = [5.72, 1.1, 0.9]; c.cam.fov = 56; c.cam.sway = 0.5; c.g.fear(0.6);
    } },
  // the storm at the front window: the yard for the length of a flash of lightning, and nobody in it
  { id: 'storm', w: 2,
    setup(c) { night(c, { nl: 0, roof: 0.3 }); c.g.rain('storm'); c.W.frontDoor.setOpen(false); c.P.pos.set(1.4, 0, -2.4); },
    update(c, k) {
      const st = c.st; c.g.lightning(st > 0.3 && st < 0.42 ? 4 : st > 0.58 && st < 0.82 ? 8 : st > 0.95 && st < 1.02 ? 3 : 0); c.g.air({ fog: 0.012, moon: 1.0, sky: 0.8 });
      c.cam.pos = mix3([1.75, 1.2, -1.9], [1.55, 1.2, -2.6], ease.inOut(k)); c.cam.look = [1.0, 1.25, -4.5]; c.cam.fov = 56; c.cam.sway = 0.5; c.g.fear(0.4);
    } },
  // run for the closet: the louvred doors, and your hand on them
  { id: 'closet_run', w: 3, shutter: 2,
    setup(c) { night(c); torch(c, { i: 6, sprint: true }); c.P.pos.set(9.9, 0, 1.0); c.route = path([[9.95, 1.2, 0.95], [9.75, 1.2, 1.8], [9.25, 1.2, 2.15], [8.75, 1.18, 1.85]]); c.s.r = false; },
    update(c, k) {
      const e = ease.out(k), p = c.route.at(e), st = c.st; c.cam.pos = [p.x, p.y + Math.sin(st * 13) * 0.035 * (1 - e), p.z];
      c.cam.look = mix3([8.6, 1.1, 1.9], [7.95, 1.1, 1.05], ease.inOut(clamp(k / 0.45, 0, 1))); c.cam.fov = lerp(68, 58, e); c.cam.roll = Math.sin(st * 6.5) * 0.02 * (1 - e); c.cam.sway = 0.4;
      c.g.flashlight(true, lerp(6, 0.9, ease.inOut(clamp(k / 0.7, 0, 1))));   // (the doors are white and an arm's length away at the end)
      if (k > 0.55 && !c.s.r) { c.s.r = true; c.g.hands({ flashOn: true }); c.g.reach([7.99, 1.05, 1.12]); }
      c.g.fear(0.8);
    } },
  // through the slats, holding your breath. One light: the hall's, in at your open door and across the carpet. It stutters and browns as
  // it does when the thing is under it, and goes; and then what is level with the slats, and nothing of it but the face. (The game's
  // hiding camera sits inside the closet's body, where the leaves are solid and the slats are the overlay, so this one stands a hand's
  // width outside them and keeps its head between the slats.)
  { id: 'closet_slats', w: 3,
    setup(c) {
      night(c, { nl: 0, roof: 0.25 }); c.g.light('hall', true, true); c.g.steady('hall'); c.UI.pod('louvers'); c.g.hands({ mode: 'hide', pod: 'closet_kid', holding: true }); c.g.hud(true); c.g.doorNow('kid', true); c.P.pos.set(8.05, 0, 1.2); c.head = new V3();
    },
    update(c, k) {
      const u = beats(c), br = 1 - 0.9 * k, FACE = 2.2, face = ease.out(clamp((u - FACE) / 0.2, 0, 1)); c.UI.breath(br, true, br < 0.35);
      const lit = u < 1.0 || (u < 1.9 && stutter(c.st)); c.g.light('hall', lit, true);
      c.g.spot({ from: [9.79, 2.25, -0.4], at: [9.7, 0, 1.9], color: 0xffc98a, i: lit ? 34 : 0, angle: 0.42, penumbra: 0.35 });   // (the hall's light, as far in at the door as it falls)
      c.cam.pos = [8.05, 1.3 + Math.sin(c.st * 2.2) * 0.005, 1.36]; c.cam.look = [9.7 + wobble(c.st * 0.6, 2) * 0.05, 0.85, 1.75]; c.cam.fov = 58;
      if (u > FACE) {   // it is tall: the face is down at the slats, and the dark has the rest of it
        c.g.thing({ x: 8.85, z: 1.8, face: [8.05, 1.36], tilt: 0.55, lean: 0.7, smile: 1.15 }); c.E.headWorld(c.head);
        c.cam.look = mix3(c.cam.look, [c.head.x, c.head.y - 0.12, c.head.z], face);
      } else c.E.visible = false;
      c.g.fear(0.5 + 0.4 * k);
    } },
  // up the ladder and into the top bunk
  { id: 'to_bunk', w: 2, shutter: 2,
    setup(c) { night(c, { nl: 0, roof: 0.4 }); moon(c, 16, [9.2, 0.6, 3.2]); torch(c, { i: 7, sprint: true }); c.P.pos.set(9.6, 0, 1.6); c.route = path([[9.85, 1.2, 1.2], [9.4, 1.22, 2.1], [9.12, 1.5, 2.72], [9.02, 2.0, 3.05], [8.75, 2.3, 3.4]]); },
    update(c, k) {
      const e = ease.inOut(k), p = c.route.at(e), st = c.st; c.cam.pos = [p.x, p.y + Math.sin(st * 13) * 0.03, p.z];
      c.cam.look = mix3([9.0, 1.5, 3.3], [8.3, 1.75, 4.1], ease.inOut(clamp((k - 0.35) / 0.6, 0, 1))); c.cam.fov = 66; c.cam.roll = Math.sin(st * 6.5) * 0.025; c.cam.sway = 0.4; c.g.fear(0.8);
    } },
  // under the covers, holding your breath: your open door and the hall's light through the gap you keep, over the quilt and the rail.
  // The light stutters, and goes, and you let the gap fall shut
  { id: 'covers', w: 2,
    setup(c) { night(c, { nl: 0, roof: 0.3 }); c.g.hud(true); c.g.hands({ mode: 'hide', holding: true }); c.g.doorNow('kid', true); c.g.light('hall', true, true); c.g.steady('hall'); c.P.pos.set(8.28, 0, 4); },
    update(c, k) {
      const t = c.st, u = beats(c), br = 0.55 - 0.5 * k, shut = ease.inOut(clamp((u - 1.5) / 0.4, 0, 1)); c.UI.breath(br, true, br < 0.35);
      c.g.light('hall', u < 0.7 || (u < 1.35 && stutter(t, 21)), true);
      c.ui.quilt({ lift: 0.012 * Math.sin(t * 2.2) - 0.16 * shut, glow: 0.9 - 0.5 * shut });
      c.cam.pos = [8.38, 1.9 + Math.sin(t * 2.2) * 0.006, 4.0]; c.cam.look = [9.6 + wobble(t * 0.4, 1) * 0.04, 1.2, 0.3]; c.cam.fov = 50; c.g.fear(0.9);
    } },
  // the bunk, from inside your door: the light comes on by itself, and the bear is not where it was
  { id: 'bunk_night', w: 2,
    setup(c) { night(c, { nl: 0, roof: 0.4 }); moon(c, 14, [9.4, 0.3, 3.0]); c.P.pos.set(10.9, 0, 0.7); c.W.moveTeddy(8.8, 1.72, 3.8); },
    update(c, k) { const u = beats(c); c.g.light('bed', u > 0.5 && u < 1.6, true); frame(c, CAM.bunk, k); c.g.fear(0.6); } },
  // a beat each, to the black
  { id: 'phone_off', w: 1,
    setup(c) { night(c); torch(c, { i: 2.2 }); c.W.phone.pickUp(); c.P.pos.set(-2.2, 0, 1.1); },
    update(c, k) { c.cam.pos = mix3([-1.75, 1.15, 1.2], [-1.6, 1.12, 1.3], k); c.cam.look = [c.W.phone.pos.x, 1.12, c.W.phone.pos.z]; c.cam.fov = 44; c.cam.sway = 0.7; c.g.fear(0.6); } },
  { id: 'tv_snow', w: 1,
    setup(c) { night(c, { nl: 0 }); c.W.frontDoor.setOpen(false); c.W.tvFx.base = 9; c.W.tvFx.set(true); c.P.pos.set(2.6, 0, -2.9); },
    update(c, k) { c.cam.pos = mix3([2.75, 0.86, -2.9], [3.2, 0.84, -3.0], k); c.cam.look = [4.04, 0.81, -3.11]; c.cam.fov = 38; c.g.fear(0.6); } },
  // the grandfather clock by flashlight, its pendulum going like a hand shaking
  { id: 'clock', w: 1,
    setup(c) { night(c); torch(c, { i: 5 }); c.W.frontDoor.setOpen(false); c.P.pos.set(1.7, 0, -2.6); c.s.amp = c.W.clock.amp; c.s.per = c.W.clock.period; c.W.clock.amp = c.s.amp * 3.2; c.W.clock.period = c.s.per * 0.3; },
    update(c, k) { c.cam.pos = mix3([1.5, 1.2, -2.5], [1.75, 1.2, -3.0], k); c.cam.look = [c.W.clock.pos.x, 1.1, c.W.clock.pos.z]; c.cam.fov = 48; c.cam.sway = 0.8; c.g.fear(0.6); },
    end(c) { c.W.clock.amp = c.s.amp; c.W.clock.period = c.s.per; } },
  { id: 'front_open', w: 1,
    setup(c) { night(c, { nl: 0 }); c.W.frontDoor.setOpen(false); c.P.pos.set(1.6, 0, -1.6); },
    update(c, k) { c.g.porch(30); c.W.doors.front.a = ease.out(clamp(c.st / 0.6, 0, 1)) * 0.9; c.W.doors.front.apply(); c.cam.pos = mix3([1.5, 1.2, -1.3], [1.65, 1.2, -1.6], k); c.cam.look = [3.0, 1.05, -4.5]; c.cam.fov = 50; c.cam.sway = 0.5; c.g.fear(0.7); },
    end(c) { c.W.frontDoor.setOpen(false); } },
  // the hatch to the attic, over the hall
  { id: 'attic', w: 1,
    setup(c) { night(c); torch(c, { i: 6 }); c.g.doorNow('kid', false); c.P.pos.set(8.0, 0, -0.45); },
    update(c, k) { c.cam.pos = mix3([9.1, 1.2, -0.45], [8.8, 1.2, -0.45], k); c.cam.look = mix3([6.0, 1.3, -0.5], [5.8, 2.25, -0.45], ease.out(clamp(c.st / 0.35, 0, 1))); c.cam.fov = 56; c.cam.sway = 0.8; c.g.fear(0.7); } },
  { id: 'chair_hall', w: 1,
    setup(c) { night(c); torch(c, { i: 9 }); c.g.doorNow('kid', false); c.g.chair(2, 8.75, -0.45, -Math.PI / 2); c.P.pos.set(10.2, 0, -0.42); },
    update(c, k) { c.cam.pos = mix3([10.3, 1.2, -0.42], [10.05, 1.2, -0.44], k); c.cam.look = [8.75, 0.75, -0.45]; c.cam.fov = 50; c.cam.sway = 0.7; c.g.fear(0.8); } },
  // the last frame on the roll: the camera at your eye, the flash, the hall
  { id: 'last_film', w: 1,
    setup(c) { night(c, { nl: 0 }); c.g.hands({ film: 1 }); c.g.camera(true); c.g.doorNow('kid', false); c.P.pos.set(5.2, 0, -0.45); c.s.n = 0; },
    update(c, k) {
      const f = c.st - 0.3, g = glow(f); if (f >= 0 && !c.s.n) { c.s.n = 1; c.g.snap(); c.g.hands({ film: 0 }); }
      c.cam.pos = [5.2, 1.2, -0.45]; c.cam.look = [9.6, 1.0, -0.45]; c.cam.fov = lerp(62, 58, c.g.finder); c.cam.sway = 0.7;
      if (g > 0) { c.g.bulb(60 * g, [5.3, 1.3, -0.45], 12); c.ui.flash(f < 0.05 ? 0.6 : 0); }
      c.g.fear(0.8);
    } },
  // the frame where it fell, face down on the hall carpet
  { id: 'frame_floor', w: 1,
    setup(c) { night(c); torch(c, { i: 3 }); c.W.hallFrame.pose(1); c.P.pos.set(7.3, 0, -0.4); },
    update(c, k) { c.W.hallFrame.pose(1); c.cam.pos = mix3([7.45, 1.2, -0.3], [7.25, 1.15, -0.4], k); c.cam.look = [6.5, 0.1, -0.85]; c.cam.fov = 50; c.cam.sway = 0.8; c.g.fear(0.8); } },
  // your door from the hall, and it goes shut in your face
  { id: 'door_slam', w: 1,
    setup(c) { night(c); torch(c, { i: 5 }); c.g.doorNow('kid', true); c.P.pos.set(9.3, 0, -0.7); c.s.shut = false; },
    update(c, k) {
      if (c.st > 0.12) c.g.door('kid', false);
      const d = c.W.doors.kid; if (!c.s.shut && d.a <= 0.001 && c.st > 0.3) { c.s.shut = true; c.g.shake(0.7); }
      c.cam.pos = mix3([9.2, 1.2, -0.85], [9.4, 1.2, -0.6], k); c.cam.look = [9.79, 1.05, 0.3]; c.cam.fov = 54; c.cam.sway = 0.8; c.g.fear(0.9);
    } },
  // the washer again, from over it: the lid comes down
  { id: 'washer_bang', w: 1,
    setup(c) { night(c, { nl: 0 }); torch(c, { i: 5, wide: 0.6 }); c.W.laundry.washer.open(1); c.P.pos.set(-6.6, c.W.laundry.floor, 1.2); },
    update(c, k) {
      const B = c.W.laundry.floor, shut = clamp((c.st - 0.35) / 0.07, 0, 1); c.W.laundry.washer.open(1 - shut); if (shut > 0 && shut < 1) c.g.shake(0.6);
      c.cam.pos = mix3([-6.7, B + 1.25, 1.2], [-6.85, B + 1.22, 1.28], k); c.cam.look = [-7.7, B + 0.9, 1.62]; c.cam.fov = 50; c.cam.sway = 0.7; c.g.fear(0.9);
    } },
  // the bear, off the bunk and across the room
  { id: 'bear', w: 1,
    setup(c) { night(c, { nl: 0, roof: 0.3 }); torch(c, { i: 7 }); c.P.pos.set(10.3, 0, 1.4); c.s.f = false; },
    update(c, k) {
      if (!c.s.f && c.st > 0.1) { c.s.f = true; c.W.teddy.fling(new V3(9.08, 0.6, 3.9), new V3(1.4, 2.6, -3.4)); }
      c.cam.pos = mix3([10.4, 1.2, 1.3], [10.3, 1.2, 1.5], k); c.cam.look = mix3([9.1, 0.7, 3.8], [9.6, 0.5, 2.6], ease.inOut(clamp(c.st / 0.6, 0, 1))); c.cam.fov = 58; c.cam.sway = 0.8; c.g.fear(0.9);
    },
    end(c) { c.W.teddy.reset(); } },
  { id: 'house_dark', w: 1,
    setup(c) { night(c, { nl: 1 }); c.W.frontDoor.setOpen(false); for (const n of ['living', 'room2', 'spare', 'kitchen']) c.g.light(n, true, true); },
    update(c, k) { c.g.air({ fog: 0.012, moon: 1.2, sky: 0.9 }); const on = c.st < 0.45; c.g.porch(on ? 40 : 0); if (!on) c.g.lightsOff(); frame(c, CAM.road, 0.8 + 0.2 * k); } },
  // two beats of nothing
  { id: 'black2', w: 2, black: true, noRender: true, setup(c) { night(c, { nl: 0 }); }, update() {} },
  ...Array.from({ length: SPRINT }, (_, i) => ({ id: i ? 'sprint_' + (i + 1) : 'sprint', w: 1, teaser: i ? undefined : 0, shutter: i === 2 || i === 4 ? 1 : 2, setup: sprintSetup, update(c) { sprintAt(c, i + beats(c)); } })),
];
// DROP to the end: black and nothing, the face, the title; and between the cards, what is left in the house. The last thing on the
// screen is where to find it, with the warning under it
const CARDS = [
  { id: 'black1', w: 0.7, fix: true, black: true, noRender: true, setup() {}, update() {} },
  // nothing but its face, as near as the lens, and no light on it but its own
  { id: 'scare', w: 0.6, fix: true,
    setup(c) { night(c, { nl: 0, roof: 0 }); c.g.thing({ x: 8.89, z: -0.42, yaw: -Math.PI / 2, tilt: 0.3, lean: 0.2, smile: 1.5 }); c.P.pos.set(7.6, 0, -0.42); c.head = new V3(); },
    update(c, k) {
      c.E.reach = 0; c.E.mode = 'idle'; c.E.headWorld(c.head); const d = lerp(1.2, 0.85, ease.out(clamp(c.st / 0.12, 0, 1))) - 0.08 * k;
      const f = faceOf(c); c.cam.pos = [f.at.x + f.n.x * d, f.at.y + f.n.y * d, f.at.z + f.n.z * d]; c.cam.look = [f.at.x, f.at.y, f.at.z]; c.cam.fov = 40; c.cam.roll = 0.05;
      c.ui.flash(c.st < 0.05 ? 1 : 0); c.g.shake(1); c.g.fear(1);
    } },
  { id: 'title', w: 4.2, fix: true, black: true, noRender: true, setup() {}, update(c) { c.ui.card({ big: 'TOP BUNK', alpha: c.fadeInOut(0.5, 0.9, 0.5) }); } },
  // the bunk at dawn, nobody in it
  { id: 'dawn', w: 3.4, fix: true, setup(c) { c.g.phase('morning'); alone(c); c.g.drawing(1); c.g.sunPatch(5, [9.4, 0.3, 3.0]); },
    update(c, k) { c.cam.pos = mix3(CAM.bunk.to, [10.2, 1.3, 1.7], ease.inOut(k)); c.cam.look = CAM.bunk.look; c.cam.fov = CAM.bunk.fov; } },
  { id: 'ten', w: 3.2, fix: true, black: true, noRender: true, setup() {}, update(c) { c.ui.card({ line: 'Ten nights.', alpha: c.fadeInOut(0.15, 0.4, 0.4) }); } },
  // the drawing, and there is one more of them in it
  { id: 'drawing_more', w: 2.2, fix: true,
    setup(c) { night(c); c.g.drawing(2); torch(c, { i: 1.1, wide: 0.62 }); c.P.pos.set(7.6, 0, -0.8); },
    update(c, k) { frame(c, CAM.drawing, 0.55 + 0.45 * k); c.g.bulb(0.5, [7.6, 1.2, -0.7], 2.2); c.cam.sway = 0.4; } },
  { id: 'nobody', w: 3.4, fix: true, black: true, noRender: true, setup() {}, update(c) { c.ui.card({ line: 'Nobody believed you.', alpha: c.fadeInOut(0.15, 0.4, 0.4) }); } },
  // the top bunk: something under the blanket, sitting up
  { id: 'blanket', w: 2.8, fix: true,
    setup(c) { night(c, { nl: 1, roof: 0.5 }); moon(c, 30, [8.6, 1.6, 3.9]); c.P.pos.set(10.3, 0, 3.0); },
    update(c, k) { c.g.lump({ x: lerp(0.5, 0.05, ease.inOut(k)), z: 0.05, h: lerp(0.06, 0.42, ease.inOut(clamp(k / 0.8, 0, 1))), rx: 0.28, rz: 0.24 }); c.cam.pos = mix3([10.4, 2.05, 3.02], [10.15, 2.03, 3.14], k); c.cam.look = [8.4, 1.72, 3.9]; c.cam.fov = 46; },
    end(c) { c.g.lump(null); } },
  // the television in the dark living room, on by itself, and off
  { id: 'tv_last', w: 1.8, fix: true,
    setup(c) { night(c, { roof: 0.3 }); c.W.frontDoor.setOpen(false); c.W.tvFx.base = 14; c.W.tvFx.set(true); c.P.pos.set(1.2, 0, -1.5); },
    update(c, k) { if (k > 0.72 && c.W.tvFx.on) c.W.tvFx.set(false); c.cam.pos = mix3(CAM.living.to, [1.7, 1.1, -1.9], ease.inOut(k)); c.cam.look = [3.9, 0.9, -3.2]; c.cam.fov = 56; c.cam.sway = 0.3; } },
  // the house from the lawn once more: one window lit, and then not
  { id: 'house_last', w: 3.2, fix: true,
    setup(c) { night(c, { nl: 1 }); c.W.frontDoor.setOpen(false); c.g.light('spare', true, true); },
    update(c, k) { c.g.air({ fog: 0.012, moon: 1.2, sky: 0.9 }); c.g.porch(k < 0.86 ? 40 : 0); if (k > 0.55) c.g.light('spare', false, true); frame(c, CAM.road, 0.4 + 0.6 * k); } },
  { id: 'wishlist', w: 6, black: true, noRender: true, setup() {},
    update(c) { c.ui.card({ line: '<span style="font-size:1.55em;color:#fff">Wishlist on Steam</span><span style="display:block;margin-top:1.6em;font-size:0.5em;letter-spacing:0.1em;color:#a59d8b">Contains jump scares and flashing lights</span>', small: 'a first-person horror game for PC', alpha: c.ramp(c.st, 0.2, 0.8, c.shot.dur - 0.9, c.shot.dur - 0.1) }); } },
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
    portrait, fps, opts, t: 0, st: 0, k: 0, shot: null, s: {},
    cam: { pos: [0.97, 1.3, 0.64], look: null, yaw: 0, pitch: 0, roll: 0, fov: 60, sway: portrait ? 1 : 0 },
    ramp: (st, a, b, cc, d) => (st < a ? 0 : st < b ? (st - a) / (b - a) : st < cc ? 1 : st < d ? 1 - (st - cc) / (d - cc) : 0),
    fadeInOut(delay, fin, fout) { const st = this.st, dur = this.shot.dur; return this.ramp(st, delay, delay + fin, dur - fout, dur); },
    rnd: rng(7),
  };
  let cur = null, began = false, pending = false, finished = false, lastT = null, fresh = false;
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
    g.handSync();   // the hands were posed on the camera before this frame moved it
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
    // a shot with the hands in it opens with them already where they are held: half a second of the game goes by unseen on its first frame
    // (the hands come up from nothing otherwise, and jump)
    if (fresh && g.staged && !portrait && !shot.raise) { apply(); window.__norender = true; for (let s = 0; s < 14; s++) window.__pump(33); }
    fresh = false;
    for (let s = 0; s < n; s++) { window.__norender = !draw || s < n - 1; window.__pump(subMs); }
    window.__norender = false;
    if (pending) { apply(); pending = false; }   // nothing was drawn: a black card, or a frame nobody will look at
    return { t, shot: shot.id, finished };
  }

  // step the trailer to time t (seconds): picks the shot, runs setup on a change, and marks the frame pending for the render hook
  function tick(t) {
    c.t = t; const shot = select(t);
    if (shot !== cur) { if (cur && cur.end) cur.end(c); c.shot = shot; c.s = {}; c.aim = null; g.reset(); ui.card(null); ui.caption(null); ui.flash(0); shot.setup(c); cur = shot; fresh = true; }
    c.st = t - shot.t; c.k = clamp(c.st / shot.dur, 0, 0.9999); pending = true;
    if (t >= duration) finished = true;
  }

  const api = {
    SHOTS: shots, duration, fps, portrait, ctx: c, marks: { TURN, DROP, DURATION: duration },
    // one-time: the test mode, the graphics knobs, the shaders for every lighting phase
    async begin({ quality, shadow, res, ss, letterbox, ca } = {}) {
      if (began) return; began = true;
      if (game.W.lawn && game.W.lawn.ready) await game.W.lawn.ready;   // the grass grows in after load
      // the game's own loading goes on behind its title for a moment yet, and ends by setting the title's scene (the thing out on the lawn):
      // it has to be done before the first shot is set
      for (let i = 0, ld = document.getElementById('loading'); ld && i < 600 && !ld.classList.contains('done'); i++) await new Promise((r) => setTimeout(r, 100));
      if (!portrait && game.cull) game.cull.enabled = false;   // nothing is left out of a frame of the cut for speed's sake
      game.start(); game.gfx.auto = false;
      game.gfx.native = true;   // no upscaling: every frame drawn at the scale asked for here, whatever the preset or the saved settings say
      if (quality) game.gfx.setQuality(quality, { save: false });
      game.gfx.build();
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
      const rt = game.gfx.target;
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
