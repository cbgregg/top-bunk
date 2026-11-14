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
  let t = t0;
  list.forEach((s, i) => { s.t = +t.toFixed(3); const end = i === list.length - 1 ? t1 : t + (s.fix ? s.w : span * s.w / flex); s.dur = +(end - s.t).toFixed(3); t = end; });
  return list;
};
// The day is the night's set-up: each of these frames is shown once in the sun and once in the dark, from the same place with the same
// lens and the same slow move, so the two halves of a pair cannot drift apart.
const CAM = {
  road: { from: [14.4, 1.5, -19.7], to: [13.7, 1.55, -18.7], look: [2.9, 1.7, -5.0], fov: 55 },      // the house from the front lawn, the truck in the drive
  living: { from: [-1.75, 1.02, -2.3], to: [-1.5, 1.0, -2.4], look: [4.2, 1.0, -3.0], fov: 50 },   // from the couch, over the coffee table to the television
  kitchen: { from: [-0.45, 1.3, 0.6], to: [-0.2, 1.28, 0.8], look: [1.6, 0.8, 2.6], fov: 58 },       // the table and its four chairs
  bunk: { from: [10.95, 1.2, 0.7], to: [10.75, 1.22, 0.95], look: [9.0, 1.62, 3.9], fov: 60 },       // the bunk from inside your door
  window: { from: [8.5, 1.98, 3.68], to: [8.68, 1.96, 3.76], look: [11.36, 1.7, 3.83], fov: 50 },    // your window, from the top bunk
  hall: { from: [9.55, 1.2, -0.78], to: [9.25, 1.2, -0.74], look: [5.0, 1.1, -0.3], fov: 56 },       // down the hall of photographs, the drawing on the left
};
const frame = (c, p, k) => { c.cam.pos = mix3(p.from, p.to, ease.inOut(k)); c.cam.look = p.look; c.cam.fov = p.fov; };
const alone = (c) => { c.g.person('mom', { visible: false }); c.g.person('dad', { visible: false }); };
const day = (c) => { c.g.phase('day'); alone(c); c.g.drawing(0); };
const night = (c, o) => { c.g.night(o); alone(c); c.g.drawing(1); };
// Grandpa's flashlight in the right hand, lit (aim: brought up, the beam narrowed; i: how bright, for a shot close to a pale wall)
const torch = (c, { i = 26, ...o } = {}) => { c.g.flashlight(true, i); c.g.hands({ flashOn: true, ...o }); c.cam.sway = 0.5; };
// the moon through your window: the hall's spot, borrowed and put outside the glass
const moon = (c, i, at) => { c.g.sunPatch(i, at); c.W.bathSpot.color.set(0x9db6ff); };
const beats = (c) => c.st / (c.shot.dur / c.shot.w);   // how far into the shot, in beats

// ---------- the landscape cut ----------
// ACT 1, 0 to TURN: a flash in the dark, then a sunny moving day and the song, clean. The only wrong note is the drawing.
const COLD_FLASH = 2.3, FLASH_S = 0.2;   // the cold open's flash: when, and for how long (six frames)
const ACT1 = [
  // black, a breath, the disposable camera's click, and for six frames it is leaning over your bunk
  { id: 'cold', w: 4,
    setup(c) { night(c, { lights: 0 }); c.P.pos.set(8.28, 0, 4); c.g.thing({ x: 8.28, z: 2.53, face: [8.28, 4.0], lean: 0.4, tilt: -0.35, smile: 1.18 }); },
    update(c) {
      const f = c.st - COLD_FLASH, lit = f >= 0 && f < FLASH_S;
      c.cam.pos = [8.38, 1.9, 4.0]; c.cam.yaw = 0.06; c.cam.pitch = 0.4; c.cam.fov = 58; c.black = lit ? 0 : 1;
      if (lit) { c.g.bulb(5, [8.38, 1.9, 4.25]); c.ui.flash(f < 0.04 ? 0.8 : 0); }
    } },
  { id: 'road', w: 5, setup(c) { day(c); c.W.frontDoor.setOpen(true); }, update(c, k) { frame(c, CAM.road, k); } },
  // the boxes on the walk and the truck in the drive, nobody in sight
  { id: 'boxes', w: 4, setup(c) { day(c); },
    update(c, k) { c.cam.pos = mix3([5.2, 0.85, -9.3], [4.7, 0.8, -9.9], ease.inOut(k)); c.cam.look = [3.55, 0.45, -12.6]; c.cam.fov = 46; } },
  { id: 'living', w: 4, setup(c) { day(c); c.W.frontDoor.setOpen(false); c.P.pos.set(-1.35, 0, -2.2); }, update(c, k) { frame(c, CAM.living, k); } },
  { id: 'kitchen', w: 4, setup(c) { day(c); c.P.pos.set(-0.45, 0, 0.6); }, update(c, k) { frame(c, CAM.kitchen, k); } },
  { id: 'bunk', w: 4, setup(c) { day(c); c.g.sunPatch(14, [9.4, 0.3, 3.0]); }, update(c, k) { frame(c, CAM.bunk, k); } },
  { id: 'window', w: 4, setup(c) { day(c); c.g.sunPatch(14, [8.75, 0.3, 3.28]); c.P.pos.set(8.28, 0, 4); }, update(c, k) { frame(c, CAM.window, k); } },
  { id: 'hall', w: 5, setup(c) { day(c); c.P.pos.set(9.5, 0, -0.75); }, update(c, k) { frame(c, CAM.hall, k); } },
  // what the last kid left taped to the wall
  { id: 'drawing', w: 6, setup(c) { day(c); },
    update(c, k) { c.cam.pos = mix3([7.56, 1.18, -0.9], [7.63, 1.1, -0.42], ease.inOut(k)); c.cam.look = [7.63, 1.06, 0.2]; c.cam.fov = lerp(44, 36, ease.inOut(k)); } },
];
// ACT 2, TURN to DROP: the same frames in the dark, and what you do about it. The shots get shorter all the way down.
const CHAIRS_OUT = [[0.0, 2.25, 1.95], [2.42, 1.85, -1.25], [1.0, 0.72, 0.35], [1.42, 3.3, 2.8]];   // the four chairs, pulled back from the table
const SNAPS = [2.5, 3.75, 5];   // the three exposures of the camera shot, in beats
const ACT2 = [
  // the hard cut: the same lawn at night, the porch light on, and the living room's light goes out by itself
  { id: 'road_night', w: 5,
    setup(c) { night(c, { lights: 1 }); c.W.frontDoor.setOpen(false); c.W.porchLight.distance = 16; c.g.light('living', true, true); c.g.light('bed', true, true); },
    update(c, k) { c.g.air({ fog: 0.012, moon: 1.2, sky: 0.9 }); c.W.porchLight.intensity = 40; c.W.porchBulb.material.emissiveIntensity = 6; if (k > 0.55) c.g.light('living', false); frame(c, CAM.road, k); },
    end(c) { c.W.porchLight.distance = 6; c.W.porchLight.intensity = 0; c.W.porchBulb.material.emissiveIntensity = 0; } },
  // the television comes on by itself, and somebody is standing in front of it
  { id: 'tv_night', w: 5,
    setup(c) { night(c, { lights: 0.5 }); c.W.frontDoor.setOpen(false); c.W.tvFx.base = 11; c.P.pos.set(-1.35, 0, -2.2); c.g.thing({ x: 3.3, z: -2.85, face: [4.28, -3.04], tilt: 0, look: false }); },
    update(c, k) {
      const on = c.st > 0.35; if (on !== c.W.tvFx.on) c.W.tvFx.set(on);
      const turn = ease.inOut(clamp((k - 0.5) / 0.3, 0, 1));
      if (turn > 0) { c.E.faceTowards(-1.2, -2.3, 0.06); c.E.lookTarget = c.camera.position; c.E.tilt = 0.5 * turn; }
      frame(c, CAM.living, k); c.g.fear(0.3);
    } },
  // the kitchen by flashlight: every chair is out from the table, and one of them is still moving
  { id: 'kitchen_night', w: 5,
    setup(c) { night(c, { lights: 0.5 }); torch(c, { i: 16 }); c.P.pos.set(-0.45, 0, 0.6); CHAIRS_OUT.forEach(([x, z, r], i) => c.g.chair(i, x, z, r)); },
    update(c, k) {
      frame(c, CAM.kitchen, k); const a = aim(c.cam.pos, CAM.kitchen.look); c.cam.look = null;
      c.cam.yaw = a.yaw + 0.6 * (1 - ease.inOut(clamp(k / 0.3, 0, 1))); c.cam.pitch = a.pitch; c.cam.sway = 0.5;
      const s = ease.out(clamp((c.st - 1.7) / 0.4, 0, 1)), [x, z, r] = CHAIRS_OUT[0]; c.g.chair(0, x - 0.45 * s, z + 0.12 * s, r + 0.35 * s);
      c.g.fear(0.3);
    } },
  // the telephone on the dining wall, ringing in the dark
  { id: 'phone', w: 4,
    setup(c) { night(c, { lights: 0.4 }); torch(c, { i: 5 }); c.W.phone.setRinging(true); c.P.pos.set(-2.4, 0, 0.9); },
    update(c, k) { c.cam.pos = mix3([-2.3, 1.2, 1.0], [-1.65, 1.24, 1.42], k); c.cam.look = [-0.78, 1.3, 1.64]; c.cam.fov = lerp(50, 42, k); c.cam.sway = 0.5; c.g.fear(0.4); } },
  // the flashlight down the hall of photographs: one of the frames lets go of the wall
  { id: 'hall_sweep', w: 4,
    setup(c) { night(c, { lights: 0.5 }); torch(c); c.g.doorNow('kid', false); c.P.pos.set(9.6, 0, -0.42); },
    update(c, k) {
      const fall = clamp((c.st - 1.25) / 0.45, 0, 1), W = c.W; if (W.hallFrame) W.hallFrame.pose(fall);
      const sweep = ease.inOut(clamp(k / 0.42, 0, 1)), down = ease.out(clamp((c.st - 1.5) / 0.5, 0, 1));
      c.cam.pos = mix3([9.7, 1.2, -0.42], [9.2, 1.2, -0.5], k); c.cam.look = mix3(mix3([7.4, 1.25, 0.3], [6.4, 1.6, -1.1], sweep), [6.75, 0.1, -0.75], down); c.cam.fov = 56; c.cam.sway = 0.5;
      if (fall > 0.9 && fall < 1) c.g.shake(0.3); c.g.fear(0.4);
    } },
  // the hall's light switch. On: nothing, and the drawing has changed. Off. On: it is at the far end. Off. On: it is nearer. Then the bulb goes
  { id: 'hall_switch', w: 6,
    setup(c) { night(c, { lights: 0.6 }); c.g.hands({}); c.g.doorNow('kid', false); c.P.pos.set(9.5, 0, -0.75); c.s.on = false; c.head = new V3(); },
    update(c, k) {
      const u = beats(c), on = (u >= 0.5 && u < 2) || (u >= 2.5 && u < 3.5) || (u >= 4 && u < 5), stage = u < 2.5 ? 0 : u < 4 ? 1 : u < 5 ? 2 : 3;
      if (on !== c.s.on) { c.s.on = on; c.g.light('hall', on); }
      c.E.visible = stage > 0;
      if (stage > 0 && c.s.stage !== stage) { c.s.stage = stage; c.g.thing({ x: [0, 5.0, 6.25, 8.05][stage], z: -0.42, face: [9.4, -0.75], tilt: [0, 0.2, 0.45, 0.6][stage], smile: stage === 3 ? 1.3 : 1.05, lean: stage === 3 ? 0.3 : 0 }); }
      frame(c, CAM.hall, k); c.cam.sway = 0.4;
      for (const at of [0.2, 1.75, 2.25, 3.25, 3.75]) if (u >= at && c.s.reach !== at && u < at + 0.2) { c.s.reach = at; c.g.reach([c.cam.pos.x - 0.25, 1.22, c.cam.pos.z + 0.45]); }
      if (stage === 3) { c.E.headWorld(c.head); c.cam.look = mix3(CAM.hall.look, [c.head.x, c.head.y - 0.1, c.head.z], ease.out(clamp((u - 5) / 0.35, 0, 1))); }
      c.g.fear(stage ? 0.5 + 0.15 * stage : 0.2);
    } },
  // your door, shutting by itself
  { id: 'door', w: 4,
    setup(c) { night(c, { lights: 0.5 }); torch(c, { i: 9 }); c.g.doorNow('kid', true); c.g.light('hall', true, true); c.P.pos.set(9.75, 0, 3.4); c.s.shut = false; },
    update(c, k) {
      if (c.st > 0.3) c.g.door('kid', false);
      const d = c.W.doors.kid; if (!c.s.shut && d.a <= 0.001 && c.st > 0.4) { c.s.shut = true; c.g.shake(0.6); }
      c.cam.pos = mix3([9.7, 1.2, 2.7], [9.72, 1.18, 2.45], ease.inOut(k)); c.cam.look = [9.79, 1.05, 0.3]; c.cam.fov = 56; c.cam.sway = 0.5; c.g.fear(0.4);
    } },
  // the same window and the same curtains
  { id: 'window_face', w: 3,
    setup(c) { night(c, { lights: 1, roof: 0.5 }); c.g.windowFace(0.23); c.P.pos.set(8.28, 0, 4); },
    update(c, k) { c.WF.t = 0.252 + 0.04 * k; frame(c, CAM.window, k); c.g.fear(0.5); } },
  // the disposable camera: up to the eye, and three exposures. It is nearer in each
  { id: 'camera', w: 6,
    setup(c) { night(c, { lights: 0.3 }); c.W.frontDoor.setOpen(false); c.g.hands({ film: 17 }); c.g.camera(true); c.P.pos.set(4.35, 0, -0.5); c.s.n = 0; c.head = new V3(); },
    update(c, k) {
      const u = beats(c), bt = c.shot.dur / c.shot.w, at = [[-1.3, -2.35], [0.95, -1.75], [2.25, -1.3]];
      let lit = -1; SNAPS.forEach((s, i) => { if (u >= s && (u - s) * bt < FLASH_S + 0.03) lit = i; });
      const n = SNAPS.filter((s) => u >= s).length; if (n > c.s.n) { c.s.n = n; c.g.snap(); c.g.hands({ film: 17 - n }); }
      c.cam.pos = [4.35, 1.2, -0.5]; c.cam.look = n > 2 ? [-1.3, 2.6, -2.35] : [-1.3, 1.35, -2.35]; c.cam.fov = lerp(62, 58, c.g.finder); c.cam.sway = 0.6;
      c.E.visible = lit >= 0;
      if (lit >= 0) {
        c.g.thing({ x: at[lit][0], z: at[lit][1], face: [4.35, -0.5], mode: 'walk', speed: 0.25, tilt: 0.25 + 0.15 * lit, reach: [0, 0.35, 1][lit], lean: lit === 2 ? 0.25 : 0, smile: 1.05 + 0.15 * lit });
        c.g.bulb([150, 70, 14][lit], [4.35, 1.25, -0.45], 16); c.ui.flash((u - SNAPS[lit]) * bt < 0.035 ? 0.75 : 0);
      }
      c.g.fear(0.6);
    },
    end(c) { c.g.camera(false); } },
  // the power goes: the lights die one after another down the hall, and all there is left is the flashlight
  { id: 'blackout', w: 3,
    setup(c) { night(c, { lights: 1 }); c.g.hands({}); c.g.doorNow('kid', false); c.g.light('living', true, true); c.g.light('hall', true, true); c.P.pos.set(10.6, 0, -0.42); },
    update(c, k) {
      const st = c.st;
      if (st > 0.25) c.g.light('living', false);
      if (st > 0.5) c.g.light('hall', false);
      if (st > 0.75 && !c.F.blackout) { c.F.blackout = true; c.game.nlMult(0, false); }
      if (st > 1.15 && !c.F.flashOn) torch(c);
      c.cam.pos = mix3([10.7, 1.2, -0.42], [10.5, 1.2, -0.45], k); c.cam.look = [4.7, 1.1, -0.42]; c.cam.fov = 52; c.cam.sway = 0.5; c.g.fear(0.5);
    } },
  // the breaker box in the garage: its door, the main, and the light comes back
  { id: 'breaker', w: 4,
    setup(c) { night(c, { lights: 0 }); c.F.blackout = true; torch(c, { i: 8 }); c.P.pos.set(-9.3, 0, -9.3); c.s.r = 0; },
    update(c, k) {
      const st = c.st, B = [-9.68, 1.45, -7.1];
      for (const [i, at] of [[1, 0.15], [2, 1.75]]) if (st >= at && c.s.r < i) { c.s.r = i; c.g.reach(B); }
      c.W.garage.panel.open(ease.inOut(clamp((st - 0.35) / 0.6, 0, 1)));
      if (st > 2.05 && c.F.blackout) { c.F.blackout = false; c.W.garage.light.set(true); c.g.shake(0.25); }
      c.cam.pos = mix3([-9.25, 1.32, -9.0], [-9.45, 1.36, -8.35], ease.inOut(k)); c.cam.look = [-9.72, 1.42, -7.1]; c.cam.fov = 54; c.cam.sway = 0.5; c.g.fear(0.4);
    } },
  // it comes down the hall on all fours, low and fast
  { id: 'crawl', w: 4, shutter: 2,
    setup(c) { night(c, { lights: 0.4, spot: BATH_I * 0.7 }); torch(c); c.g.doorNow('kid', false); c.P.pos.set(10.7, 0, -0.42); c.g.thing({ x: 4.9, z: -0.42, yaw: Math.PI / 2, mode: 'crawl' }); c.E.snap = 1; c.E.crawlSpeed = 1.6; },
    update(c, k) {
      const x = 4.9 + 3.9 * k; c.E.root.position.set(x, 0, -0.42); c.E.mode = 'crawl'; c.E.crawlSpeed = 1.6; c.E.faceTowards(11, -0.42, 1);
      c.cam.pos = mix3([10.55, 0.82, -0.4], [10.95, 0.78, -0.45], k); c.cam.look = [x + 0.5, 0.55, -0.42]; c.cam.fov = 50; c.cam.sway = 0.7; c.g.fear(0.9);
    } },
  // run for the closet
  { id: 'closet_run', w: 3, shutter: 2,
    setup(c) { night(c, { lights: 0.5 }); torch(c, { i: 10, sprint: true }); c.P.pos.set(9.9, 0, 1.0); c.route = path([[9.95, 1.2, 0.95], [9.35, 1.2, 1.7], [8.6, 1.2, 1.95], [8.08, 1.17, 1.72]]); c.s.r = false; },
    update(c, k) {
      const e = ease.out(k), p = c.route.at(e), st = c.st; c.cam.pos = [p.x, p.y + Math.sin(st * 13) * 0.035 * (1 - e), p.z];
      c.cam.look = mix3([8.4, 1.05, 2.0], [7.99, 1.1, 0.9], ease.inOut(clamp(k / 0.7, 0, 1))); c.cam.fov = lerp(70, 62, e); c.cam.roll = Math.sin(st * 6.5) * 0.02 * (1 - e); c.cam.sway = 0.4;
      if (k > 0.72 && !c.s.r) { c.s.r = true; c.g.reach([7.99, 1.05, 1.12]); }
      c.g.fear(0.8);
    } },
  // through the slats: it walks in after you. (The game's hiding camera sits inside the closet's body, where the leaves are solid and the
  // slats are the overlay, so this one stands a hand's width outside them and keeps its head between the slats.)
  { id: 'closet_in', w: 4,
    setup(c) {
      night(c, { lights: 0.5 }); c.UI.pod('louvers'); c.g.hands({ mode: 'hide', pod: 'closet_kid' }); c.g.doorNow('kid', true); c.g.light('bed', true, true); c.g.steady('bed'); c.P.pos.set(8.05, 0, 1.2);
      c.route = path([[9.9, 0, 0.75], [9.75, 0, 1.6], [9.2, 0, 2.6], [8.7, 0, 2.75]]); c.g.thing({ x: 9.9, z: 0.75, face: [9.75, 1.6], mode: 'walk', speed: 0.3, tilt: 0.2, look: false }); c.head = new V3();
    },
    update(c, k) {
      const w = clamp(k / 0.72, 0, 1), p = c.route.at(w); c.E.root.position.set(p.x, 0, p.z);
      if (w < 1) { const q = c.route.at(Math.min(1, w + 0.03)); c.E.mode = 'walk'; c.E.faceTowards(q.x, q.z, 1); c.E.lookTarget = null; }
      else { c.E.mode = 'idle'; c.E.faceTowards(8.05, 1.2, 0.1); c.E.lookTarget = c.camera.position; c.E.tilt = 0.5; }
      c.E.headWorld(c.head); c.cam.pos = [8.05, 1.3 + wobble(c.st * 0.5, 2) * 0.008, 1.36]; c.cam.look = [c.head.x, c.head.y - 0.35, c.head.z]; c.cam.fov = 60; c.g.fear(0.7);
    } },
  // it stands at the doors and listens. You hold your breath
  { id: 'closet_breath', w: 4,
    setup(c) {
      night(c, { lights: 1 }); c.UI.pod('louvers'); c.g.hands({ mode: 'hide', pod: 'closet_kid', holding: true }); c.g.hud(true); c.g.doorNow('kid', true); c.g.light('bed', true, true); c.g.steady('bed'); c.P.pos.set(8.05, 0, 1.2);
      c.g.thing({ x: 8.7, z: 2.75, face: [8.05, 1.2], tilt: 0.5, smile: 1.1 }); c.head = new V3();
    },
    update(c, k) {
      const br = 1 - 0.88 * k; c.UI.breath(br, true, br < 0.3);
      c.E.root.position.set(lerp(8.7, 8.4, ease.inOut(k)), 0, lerp(2.75, 2.3, ease.inOut(k))); c.E.mode = k < 0.9 ? 'walk' : 'idle'; c.E.speed = 0.15; c.E.lean = 0.35 * ease.inOut(k); c.E.tilt = 0.5 + 0.2 * Math.sin(c.st * 0.9);
      c.E.headWorld(c.head); c.cam.pos = [8.05, 1.3 + Math.sin(c.st * 2.2) * 0.005, 1.36]; c.cam.look = [c.head.x, c.head.y - 0.2, c.head.z]; c.cam.fov = 60; c.g.fear(0.9);
    },
    end(c) { c.g.hud(false); } },
  // the bunk, from inside your door: it is standing at the foot of the bed
  { id: 'bunk_foot', w: 3,
    setup(c) { night(c, { lights: 0.3, roof: 0.5 }); moon(c, 26, [9.9, 1.0, 3.3]); c.P.pos.set(10.9, 0, 0.7); c.g.thing({ x: 9.95, z: 3.6, face: [10.85, 0.8], tilt: 0.45, smile: 1.15 }); },
    update(c, k) { c.E.tilt = 0.45 + Math.sin(c.st * 1.1) * 0.2; c.E.lean = 0.15 * k; frame(c, CAM.bunk, k); c.g.fear(0.9); } },
  // under the covers, holding your breath, and it is leaning over the rail
  { id: 'covers', w: 4,
    setup(c) { night(c, { lights: 0.5, roof: 0.5 }); moon(c, 20, [8.3, 1.9, 3.2]); c.g.hud(true); c.g.hands({ mode: 'hide', holding: true }); c.P.pos.set(8.28, 0, 4); c.g.thing({ x: 8.28, z: 2.53, face: [8.28, 4.0], lean: 0.25, tilt: -0.35, smile: 1.18 }); },
    update(c, k) {
      const t = c.st, br = 1 - 0.9 * k; c.UI.breath(br, true, br < 0.3); c.E.lean = 0.25 + 0.2 * ease.inOut(k);
      c.ui.quilt({ lift: 0.012 * Math.sin(t * 2.2), glow: 0.85 });
      c.cam.pos = [8.38, 1.9 + Math.sin(t * 2.2) * 0.006, 4.0]; c.cam.yaw = 0.06 + wobble(t * 0.4, 1) * 0.02; c.cam.pitch = 0.36 + Math.sin(t * 2.2) * 0.004; c.cam.fov = 58; c.g.fear(0.9);
    },
    end(c) { c.g.hud(false); } },
  // a beat each: the washer's lid, the face in the snow, the bathroom mirror, the drawing, the end of the hall
  { id: 'washer', w: 1,
    setup(c) { night(c, { lights: 0.5 }); c.W.laundry.bulb.set(true); c.W.laundry.bulb.swing = 0.16; c.W.laundry.washer.open(0); c.P.pos.set(-5.6, c.W.laundry.floor, 1.0); },
    update(c, k) {
      const B = c.W.laundry.floor, st = c.st, bang = clamp((st - 0.22) / 0.09, 0, 1); c.W.laundry.washer.open(Math.min(1, bang * 1.15) - (bang >= 1 ? 0.06 * Math.abs(Math.sin((st - 0.31) * 18)) * Math.exp(-(st - 0.31) * 3) : 0));
      if (bang > 0 && bang < 1) c.g.shake(0.5);
      c.cam.pos = mix3([-5.9, B + 1.12, 1.0], [-6.1, B + 1.1, 1.1], k); c.cam.look = [-7.7, B + 0.85, 1.62]; c.cam.fov = 50; c.g.fear(0.6);
    },
    end(c) { c.W.laundry.bulb.set(false); c.W.laundry.bulb.swing = 0.08; c.W.laundry.washer.open(0); } },
  { id: 'laundry', w: 1, shutter: 2,
    setup(c) { const B = c.W.laundry.floor; night(c, { lights: 0.5 }); c.W.laundry.bulb.set(true); c.W.laundry.bulb.swing = 0.16; c.W.laundry.washer.open(1); c.P.pos.set(-4.9, B, 1.5); c.g.thing({ x: -6.9, y: B, z: 3.5, face: [-4.9, 1.5], mode: 'crawl' }); c.E.snap = 1; c.E.crawlSpeed = 1.6; },
    update(c, k) {
      const B = c.W.laundry.floor, x = lerp(-6.9, -6.15, k), z = lerp(3.5, 2.75, k); c.E.root.position.set(x, B, z); c.E.mode = 'crawl'; c.E.crawlSpeed = 1.6; c.E.faceTowards(-4.9, 1.5, 1);
      c.cam.pos = mix3([-4.95, B + 0.7, 1.55], [-4.8, B + 0.68, 1.4], k); c.cam.look = [x + 0.2, B + 0.5, z - 0.2]; c.cam.fov = 56; c.g.fear(0.9);
    },
    end(c) { c.W.laundry.bulb.set(false); c.W.laundry.bulb.swing = 0.08; c.W.laundry.washer.open(0); } },
  { id: 'tv_face', w: 1,
    setup(c) { night(c, { lights: 0.3 }); c.W.frontDoor.setOpen(false); c.W.tvFx.set(true); c.W.tvFx.figure = 1; c.P.pos.set(2.6, 0, -2.9); },
    update(c, k) { c.W.tvFx.figure = 1; c.cam.pos = mix3([2.75, 0.86, -2.9], [3.05, 0.85, -2.98], k); c.cam.look = [4.04, 0.81, -3.11]; c.cam.fov = 38; c.g.fear(0.6); } },
  { id: 'drawing_night', w: 1,
    setup(c) { night(c, { lights: 0.4 }); torch(c, { i: 6 }); c.P.pos.set(7.9, 0, -0.75); },
    update(c, k) { c.cam.pos = mix3([8.15, 1.16, -1.0], [7.92, 1.13, -0.8], ease.out(k)); c.cam.look = [7.63, 1.07, 0.2]; c.cam.fov = lerp(42, 34, ease.out(k)); c.cam.sway = 0.8; c.g.fear(0.8); } },
  { id: 'hall_end', w: 1,
    setup(c) { night(c, { lights: 0.25, spot: BATH_I * 0.8, flicker: true }); c.g.doorNow('kid', false); c.P.pos.set(10.3, 0, -0.42); c.g.thing({ x: 5.0, z: -0.42, yaw: Math.PI / 2, mode: 'walk', speed: 0.6, tilt: 0.5 }); },
    update(c, k) { c.E.root.position.x = 5.0 + 0.9 * k; c.E.mode = 'walk'; c.E.faceTowards(10.3, -0.42, 1); c.cam.pos = mix3([10.3, 1.22, -0.42], [10.0, 1.2, -0.44], k); c.cam.look = [5.4, 1.4, -0.42]; c.cam.fov = 44; c.g.fear(0.9); } },
  // one more exposure, and it is an arm's length away
  { id: 'flash_face', w: 1,
    setup(c) { night(c, { lights: 0.2 }); c.g.hands({ film: 14 }); c.g.camera(true); c.g.doorNow('kid', false); c.P.pos.set(9.7, 0, -0.42); c.E.visible = false; c.head = new V3(); c.s.n = 0; },
    update(c, k) {
      const f = c.st - 0.3, lit = f >= 0 && f < FLASH_S;
      if (f >= 0 && !c.s.n) { c.s.n = 1; c.g.snap(); c.g.hands({ film: 13 }); c.g.thing({ x: 8.15, z: -0.42, face: [9.7, -0.42], tilt: 0.5, lean: 0.35, reach: 1, smile: 1.35 }); }
      c.cam.pos = [9.7, 1.2, -0.42]; c.cam.look = [8.3, 1.75, -0.42]; c.cam.fov = lerp(62, 58, c.g.finder); c.cam.sway = 0.7;
      if (lit) { c.g.bulb(8, [9.75, 1.25, -0.42], 10); c.ui.flash(f < 0.035 ? 0.75 : 0); }
      c.g.fear(1);
    },
    end(c) { c.g.camera(false); } },
  // two beats of nothing
  { id: 'black2', w: 2, black: true, noRender: true, setup(c) { night(c, { lights: 0 }); }, update() {} },
  // the sprint down the hall with it behind you, a beat to a look: ahead, back, ahead, ahead, and back, where it is on you. The cut
  { id: 'sprint', w: 5, teaser: 0, shutter: 2,
    setup(c) {
      night(c, { lights: 0.4, spot: BATH_I * 0.5, flicker: true }); c.g.door('kid', true); c.g.doorNow('kid', true); torch(c, { sprint: true });
      // the route: out of the living room, down the hall, through your door and up to the foot of the bunk. The thing runs the same route behind you.
      c.route = path([[3.2, EYE_KID, -0.9], [4.4, EYE_KID, -0.8], [5.4, EYE_KID, -0.7], [6.6, EYE_KID, -0.6], [8.8, EYE_KID, -0.45], [9.55, EYE_KID, 0.15], [9.55, EYE_KID, 1.3], [9.5, EYE_KID, 2.4]]);
      c.g.thing({ x: 1.5, z: -0.9, mode: 'run', speed: 1.1, tilt: 0.2, smile: 1.1 }); c.ep = new V3(); c.head = new V3();
    },
    update(c, k) {
      const st = c.st, u = beats(c), look = Math.floor(u), back = look === 1 || look >= 4, rk = lerp(0.1, 1, ease.out(k) * 0.4 + k * 0.6);
      const p = c.route.at(rk), tg = c.route.tangent(Math.min(1, rk + 0.02)), ahead = Math.atan2(-tg.x, -tg.z), bob = Math.sin(st * 13) * 0.04;
      c.cam.pos = [p.x, p.y + bob, p.z];
      const lunge = look >= 4 ? ease.in(clamp(u - 4, 0, 1)) : 0, gap = look >= 4 ? lerp(1.9, 0.55, lunge) : lerp(4.2, 2.6, k);
      // it is behind you on the route (straight behind once you have turned into your room)
      if (look >= 4) c.E.root.position.set(p.x + Math.sin(ahead) * gap, 0, p.z + Math.cos(ahead) * gap);
      else { let ek = rk; for (let i = 0; i < 40 && c.route.at(ek, c.ep).distanceTo(p) < gap && ek > 0; i++) ek -= 0.01; c.E.root.position.set(c.ep.x, 0, c.ep.z); }
      c.E.faceTowards(p.x, p.z, 1); c.E.mode = look >= 4 ? 'idle' : 'run'; c.E.reach = look >= 4 ? 1 : look === 1 ? 0.5 : 0; c.E.smileScale = 1.1 + lunge * 0.4; c.E.lean = 0.3 * lunge; c.E.tilt = 0.4;
      if (!back) { c.cam.yaw = ahead; c.cam.pitch = -0.05 + Math.sin(st * 13) * 0.012; }
      else { c.E.headWorld(c.head); const a = aim(c.cam.pos, [c.head.x, c.head.y - 0.3, c.head.z]); c.cam.yaw = a.yaw; c.cam.pitch = a.pitch; }
      c.cam.roll = Math.sin(st * 6.5) * 0.02; c.cam.fov = back ? 70 : lerp(74, 82, k); c.cam.sway = 0.6; c.g.fear(1); if (look >= 4 && u - 4 < 0.15) c.g.shake(0.7);
    } },
];
// DROP to the end: black and nothing, the face, the title; and between the cards, a second each of what is left in the room
const CARDS = [
  { id: 'black1', w: 0.7, fix: true, black: true, noRender: true, setup() {}, update() {} },
  { id: 'scare', w: 1.3, fix: true,
    setup(c) { night(c, { lights: 0, spot: BATH_I, flicker: true }); c.g.thing({ x: 8.89, z: -0.42, yaw: -Math.PI / 2, tilt: 0.35, lean: 0.4, reach: 1, smile: 1.5 }); c.P.pos.set(8.06, 0, -0.42); c.head = new V3(); },
    update(c, k) { c.E.headWorld(c.head); c.cam.pos = [8.14, 1.35, -0.42]; c.cam.look = [c.head.x, c.head.y - 0.1, c.head.z]; c.cam.fov = 68; c.ui.flash(k < 0.12 ? 1 - k / 0.12 : 0); c.g.shake(1); c.g.fear(1); } },
  { id: 'title', w: 6, black: true, noRender: true, setup() {}, update(c) { c.ui.card({ big: 'TOP BUNK', alpha: c.fadeInOut(0.6, 1.2, 0.6) }); } },
  // the bunk at dawn, nobody in it
  { id: 'dawn', w: 1.2, fix: true, setup(c) { c.g.phase('morning'); alone(c); c.g.drawing(1); c.g.sunPatch(5, [9.4, 0.3, 3.0]); }, update(c, k) { frame(c, CAM.bunk, 0.5 + 0.3 * k); } },
  { id: 'ten', w: 3.2, black: true, noRender: true, setup() {}, update(c) { c.ui.card({ line: 'Ten nights.', alpha: c.fadeInOut(0.15, 0.4, 0.4) }); } },
  // the drawing, and there is one more of them in it
  { id: 'drawing_more', w: 1.2, fix: true,
    setup(c) { night(c, { lights: 0.4 }); c.g.drawing(2); torch(c, { i: 6 }); c.P.pos.set(7.6, 0, -0.8); },
    update(c, k) { c.cam.pos = mix3([7.86, 1.13, -0.95], [7.84, 1.12, -0.85], k); c.cam.look = [7.63, 1.07, 0.2]; c.cam.fov = 34; c.cam.sway = 0.4; } },
  { id: 'nobody', w: 3.6, black: true, noRender: true, setup() {}, update(c) { c.ui.card({ line: 'Nobody believed you.', alpha: c.fadeInOut(0.15, 0.4, 0.4) }); } },
  // the top bunk: something under the blanket, moving
  { id: 'blanket', w: 1.3, fix: true,
    setup(c) { night(c, { lights: 0.5, roof: 0.5 }); moon(c, 30, [8.6, 1.6, 3.9]); c.P.pos.set(10.3, 0, 3.0); },
    update(c, k) { c.g.lump({ x: lerp(0.45, -0.15, ease.inOut(k)), z: 0.05, h: 0.2 + 0.03 * Math.sin(c.st * 9), rx: 0.3, rz: 0.24 }); c.cam.pos = mix3([10.35, 2.05, 3.05], [10.25, 2.03, 3.1], k); c.cam.look = [8.4, 1.72, 3.9]; c.cam.fov = 46; },
    end(c) { c.g.lump(null); } },
  { id: 'wishlist', w: 6.5, black: true, noRender: true, setup() {}, update(c) { c.ui.card({ line: 'Wishlist on Steam', small: 'a first-person horror game for PC', alpha: c.fadeInOut(0.3, 0.7, 0.9) }); } },
  { id: 'warning', w: 7, black: true, noRender: true, setup() {}, update(c) { c.ui.card({ small: 'Contains jump scares and flashing lights', alpha: c.fadeInOut(0.3, 0.6, 1.4) }); } },
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
    for (let s = 0; s < n; s++) { window.__norender = !draw || s < n - 1; window.__pump(subMs); }
    window.__norender = false;
    if (pending) { apply(); pending = false; }   // nothing was drawn: a black card, or a frame nobody will look at
    return { t, shot: shot.id, finished };
  }

  // step the trailer to time t (seconds): picks the shot, runs setup on a change, and marks the frame pending for the render hook
  function tick(t) {
    c.t = t; const shot = select(t);
    if (shot !== cur) { if (cur && cur.end) cur.end(c); c.shot = shot; c.s = {}; g.reset(); ui.card(null); ui.caption(null); ui.flash(0); shot.setup(c); cur = shot; }
    c.st = t - shot.t; c.k = clamp(c.st / shot.dur, 0, 0.9999); pending = true;
    if (t >= duration) finished = true;
  }

  const api = {
    SHOTS: shots, duration, fps, portrait, ctx: c, marks: { TURN, DROP, DURATION: duration },
    // one-time: the test mode, the graphics knobs, the shaders for every lighting phase
    async begin({ quality, shadow, res, ss, letterbox, ca } = {}) {
      if (began) return; began = true;
      if (game.W.lawn && game.W.lawn.ready) await game.W.lawn.ready;   // the grass grows in after load
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
