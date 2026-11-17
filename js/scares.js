// The loud ones and the quiet ones, from night two on. Three kinds of thing live here:
//   the jumps      short and loud, each with a small sound or a small change a moment before that you half notice: the face in the gap of
//                  a door you open, a hand over the edge of the bunk, the thing in the room for the length of a camera flash, something
//                  running across the end of the hall, the bathroom mirror as the light comes on, the face at the glass in the lightning,
//                  the television showing the room you stand in, a door shut in your face, the telephone. Never the same one twice
//                  running (RUN.lastJump), never two inside seventy seconds, and each on the night engine's table (js/events.js) as a
//                  presence or a loud beat, so the quiet curve and the tier caps space them like everything else
//   the quiet ones breathing that is not yours while you hold yours, slow steps overhead, a child humming in the wall, whispering that
//                  stops when you stop, a knock that answers a door you shut, a music box in the room nobody unpacked, scratching in the
//                  wall by the pillow, breathing behind a shut door, a chair still rocking. Whisper and wrong beats on the same table
//   the dressing   what the house is like when the night starts, worse each night, there to be found and never pointed at: faces
//                  scratched out of the family photographs, more figures in the drawing, wet footprints from your door to the ladder
// Everything random comes from the night's seeded generator (D.r). Every mesh is built once, here, and only shown and hidden after.
import * as THREE from 'three';
import { NODES } from './nav.js';
import { sweepLeaf } from './collide.js';
import { rng } from './rng.js';

const V3 = THREE.Vector3;
const LAYER = 5;   // drawn only by a second eye (the dark glass in windowscares.js, the television's picture here)

export function createScares({ env, D, W, E, P, F, sfx, camera, gaze, hunter, events, log, later, stage, wins, quiet }) {
  const _v = new V3(), _a = new V3(), _b = new V3(), UP = new V3(0, 1, 0);
  const now = () => env.time(), night = () => F.night || 1, RUN = () => env.RUN || {};
  const free = () => !!F.plan && !quiet() && !F.script && !F.cutscene && !F.dead && F.live;
  const walking = () => free() && P.mode === 'walk';
  const inBunk = () => P.mode === 'bunk' || (P.mode === 'hide' && !P.pod);
  const room = () => env.roomAt(P.pos.x, P.pos.z, P.pos.y);
  const pd = (p) => Math.hypot(P.pos.x - p.x, P.pos.z - p.z);
  const at3 = (x, y, z) => ({ x, y, z });
  const nodePt = (id) => ({ x: NODES[id][0], z: NODES[id][1], y: 0 });
  // how squarely the eye points at a point in space (the gaze's own test is on the plan; the bunk's things are above and below it)
  const camDot = (p) => { camera.getWorldDirection(_v); const dx = p.x - camera.position.x, dy = p.y - camera.position.y, dz = p.z - camera.position.z, d = Math.hypot(dx, dy, dz) || 1; return (_v.x * dx + _v.y * dy + _v.z * dz) / d; };
  const behindEar = (d = 0.5) => { camera.getWorldDirection(_v); const l = Math.hypot(_v.x, _v.z) || 1; return at3(camera.position.x - _v.x / l * d, camera.position.y - 0.05, camera.position.z - _v.z / l * d); };
  const setLayer = (o, l) => o.traverse((c) => c.layers.set(l));
  const canE = () => stage.freeE() && !!E.rig;                       // free to be staged: asked before a beat holds it
  const idleE = () => !E.visible && !hunter.busy && !!E.rig;        // free at a payoff, by when the beat may hold the resource itself
  function showE(x, z, tx, tz, { y = 0, lean = 0, tilt = 0, mode = 'idle', duck = null } = {}) {
    E.root.scale.setScalar(1); E.root.position.set(x, y, z); E.faceTowards(tx, tz, 1); E.mode = mode; E.lean = lean; E.tilt = tilt; E.reach = 0; E.duckHold = duck;
    E.lookTarget = camera.position; E.visible = true;
  }
  const hideE = () => { setLayer(E.root, 0); E.duckHold = null; if (!hunter.busy) stage.hideE(); };
  const sting = (k, shake) => { sfx.pianoSlam(k); env.addShake(shake); F.fear = 1; };

  // ---- the jumps keep their distance from each other ----
  let jumpAt = -999;
  const mayJump = (id) => RUN().lastJump !== id && now() - jumpAt > 70;
  const jumped = (id) => { RUN().lastJump = id; jumpAt = now(); };

  // every beat here: nights two to nine, once a night, nothing on the scripted nights
  const reg = (def) => events.register({ minN: 2, maxN: 9, w: 1, once: true, uses: [], noise: 0, anchor: null, max: 60, undo: (h) => { h.alive = false; }, ...def, after: { keep: false, log: true, journal: def.id, ...(def.after || {}) } });

  // ---------------------------------------------------------------------------------------------------------------------------------------
  // the hall doors
  const ROOM_OF = { bath: 'bath', kid: 'bed', room2: 'room2', spare: 'spare' }, INTO = { bath: 1, kid: 1, room2: -1, spare: -1 };   // the room behind each, and which way (z) it lies
  const door = (k) => W.doors[k];
  const shut = (k) => door(k) && door(k).target === 0 && door(k).a < 0.05, open = (k) => door(k) && door(k).target === 1 && door(k).a > 0.9;
  const midOf = (k) => ({ x: door(k).mid.x, z: door(k).mid.z, y: 0 });
  const hallSide = (k) => (P.pos.z - door(k).mid.z) * INTO[k] < -0.12 && room() !== ROOM_OF[k];
  const inside = (k, d, y = 1.1) => at3(door(k).mid.x, y, door(k).mid.z + INTO[k] * d);
  // a door you shut yourself (the knock that answers reads it): its target went from open to shut with you at the handle
  const was = {}; let shutBy = null, slamming = null;
  function doorsTick() {
    for (const k in W.doors) {
      const d = W.doors[k];
      if (was[k] === 1 && d.target === 0 && k !== slamming && free() && P.mode === 'walk' && pd(d.mid) < 1.9) shutBy = { k, t: now() };
      was[k] = d.target;
    }
  }

  // the face already at the gap: it stands just inside a shut door off the hall, upright, its head above the top of the doorway, and
  // the door is yours to open. One dull knock from the other side when it gets there is all you are told. The leaf swings in past it
  // (it stands outside the swing), and only when the leaf is back against the wall does it bend down into the opening
  const BEHIND = { room2: 'r2Alc' };   // far enough in that the leaf's corner passes clear of its head as it swings (the office: the spare room has no such spot in line with its door)
  const faceDoors = () => Object.keys(BEHIND).filter((k) => shut(k) && room() !== ROOM_OF[k]).sort((a, b) => pd(door(a).mid) - pd(door(b).mid));
  reg({
    id: 'doorFace', tier: 'presence', minN: 5, w: 4, uses: ['E', 'stage', 'hallDoors'],
    anchor: (D, h) => nodePt(BEHIND[h ? h.door : faceDoors()[0] || 'room2']),
    pre: () => walking() && mayJump('doorFace') && canE() && faceDoors().some((k) => pd(door(k).mid) < 9),
    arm: () => {
      const k = faceDoors()[0]; if (!k || !canE() || P.mode !== 'walk') return null;
      const p = nodePt(BEHIND[k]), m = door(k).mid;
      showE(p.x, p.z, m.x, m.z, { tilt: 0.3 });
      sfx.pick('wall_knock', { at: inside(k, 0.25, 1.0), gain: 0.5, wet: 0.2, lp: 1400 });
      return { alive: true, door: k, g0: gaze.now };
    },
    reveal: { by: 'open', when: (D, h) => gaze.openedAt(h.door) > h.g0 || door(h.door).a > 0.3 },
    payoff: (D, h) => { h.opened = now(); jumped('doorFace'); },
    tick: (D, h) => {
      if (!h.opened) return;
      const d = door(h.door), a = d.a, clear = a > 0.97 || (d.target === 0 && a < 0.03);   // the leaf back against the wall, out of the way of its head (or shut and staying shut: a reveal made some other way)
      if (!h.hit && (clear || now() - h.opened > 2.5)) { h.hit = now(); h.bend = clear; sting(1.3, 0.7); }
      if (!h.hit) return;
      if (h.bend) { E.lean = Math.min(0.55, (now() - h.hit) * 5); E.tilt = 0.45; }
      if (now() - h.hit > 0.9) { D.flicker(0.5); hideE(); h.done = true; }
    },
    while: (D, h) => room() !== ROOM_OF[h.door] && !hunter.busy && !F.script, max: 70, linger: 3,   // (a scene or a hunt that takes the thing takes it from here too)
    undo: (h) => { h.alive = false; hideE(); },
  });

  // a door shut in your face: an open door off the hall, you a step and a half from it and walking at it
  const slamDoors = () => Object.keys(ROOM_OF).filter((k) => open(k) && room() !== ROOM_OF[k]).sort((a, b) => pd(door(a).mid) - pd(door(b).mid));
  reg({
    id: 'doorSlam', tier: 'loud', minN: 2, w: 3.5, noise: 0.8, uses: ['hallDoors'],
    anchor: (D, h) => { const k = h ? h.door : slamDoors()[0]; return k ? midOf(k) : null; },   // (the nearest open one: the engine will not arm it in view)
    pre: () => walking() && mayJump('doorSlam') && !hunter.busy && slamDoors().some((k) => pd(door(k).mid) > 2.2 && pd(door(k).mid) < 8),
    arm: () => {
      const k = slamDoors()[0]; if (!k || P.mode !== 'walk' || pd(door(k).mid) < 2) return null;
      sfx.pick('door_creak', { at: at3(door(k).mid.x, 1.2, door(k).mid.z), gain: 0.3, wet: 0.2, rate: 0.7 });
      return { alive: true, door: k };
    },
    reveal: { by: 'approach', within: 1.9, when: (D, h) => open(h.door) && hallSide(h.door) && pd(door(h.door).mid) < 1.9 && gaze.facing(midOf(h.door)) > 0.75 },
    payoff: (D, h) => { h.slam = true; slamming = h.door; jumped('doorSlam'); },
    tick: (D, h, dt) => {
      if (!h.slam || h.banged) return;
      const d = door(h.door), sw = sweepLeaf(d, -Math.min(d.a, dt * 9));
      // somebody is standing in its swing (never you: you are on the hall side of it): it does not shut on them, and swings back
      if (sw.hit) { h.banged = true; d.target = 1; if (slamming === h.door) slamming = null; h.done = true; return; }
      d.target = 0; d.a = sw.a; d.apply();
      if (d.a > 0.002) return;
      h.banged = true; const m = at3(d.mid.x, 1.2, d.mid.z);
      if (!sfx.pick('door_slam', { at: m, gain: 1.5, wet: 0.3, ref: 2 })) sfx.pick('door_close', { at: m, gain: 1.6, wet: 0.3, ref: 2 });
      sting(0.9, 0.9);
      later(2.6, () => { if (h.alive) sfx.pick('doorknob', { at: m, gain: 0.7, wet: 0.2 }); });
      later(4.2, () => { if (slamming === h.door) slamming = null; h.done = true; });
    },
    while: (D, h) => open(h.door) || h.slam, max: 30, linger: 8, after: { keep: true },
    undo: (h) => { h.alive = false; if (slamming === h.door) slamming = null; if (h.slam) { const d = door(h.door); d.a = d.target = 1; d.apply(); } },
  });

  // breathing behind a shut door while you stand near it; open it and there is nobody, and something whispers from the far corner
  const breathDoors = () => Object.keys(ROOM_OF).filter((k) => shut(k) && room() !== ROOM_OF[k]).sort((a, b) => pd(door(a).mid) - pd(door(b).mid));
  reg({
    id: 'doorBreath', tier: 'whisper', minN: 4, w: 0.8, uses: ['hallDoors'],
    anchor: (D, h) => { const k = h ? h.door : breathDoors()[0]; return k ? inside(k, 0.6, 0) : null; },
    pre: () => walking() && !hunter.busy && breathDoors().some((k) => pd(door(k).mid) < 4.5),
    arm: () => { const k = breathDoors()[0]; if (!k || P.mode !== 'walk' || pd(door(k).mid) > 9) return null; return { alive: true, door: k, g0: gaze.now, next: now() + 0.4, n: 0 }; },
    tick: (D, h) => {
      if (h.stopped || now() < h.next || pd(door(h.door).mid) > 6) return;
      h.next = now() + 2.5; h.n++; sfx.pick('breath', { at: inside(h.door, 0.45, 1.25), gain: 0.6, wet: 0.08, rate: 0.74 + (h.n % 2) * 0.05 });
    },
    reveal: { by: 'open', when: (D, h) => gaze.openedAt(h.door) > h.g0 || door(h.door).a > 0.25 },
    payoff: (D, h) => {
      h.stopped = true; F.fear = Math.max(F.fear, 0.5);
      later(1.4, () => { if (h.alive) sfx.pick('whisper', { at: inside(h.door, 2.6, 1.3), gain: 0.5, wet: 0.4, lp: 4500 }); h.done = true; });
    },
    while: (D, h) => room() !== ROOM_OF[h.door] || h.stopped, max: 45, linger: 4,
  });

  // you shut a door, and something knocks twice on the other side of it
  reg({
    id: 'knockBack', tier: 'whisper', minN: 2, w: 1, chain: true,   // it comes on the door you have just shut: no waiting for one
    pre: () => walking() && !!shutBy && now() - shutBy.t < 1.2,
    arm: () => (P.mode === 'walk' ? { alive: true, t0: shutBy && now() - shutBy.t < 1.2 ? shutBy.t - 0.01 : now() } : null),
    reveal: { by: 'hold', hold: 0.9, when: (D, h) => !!shutBy && shutBy.t > h.t0 && now() - shutBy.t < 6 && !!door(shutBy.k) },
    payoff: (D, h) => {
      const d = shutBy && door(shutBy.k) ? door(shutBy.k) : door('kid'), side = Math.sign(d.mid.z - P.pos.z) || 1, p = at3(d.mid.x, 1.15, d.mid.z + side * 0.3);
      for (const [t, g] of [[0, 0.9], [0.42, 0.8], [3.4, 0.45]]) later(t, () => { if (h.alive) sfx.pick('knock', { at: p, gain: g, wet: 0.25 }); });
      F.fear = Math.max(F.fear, 0.5); later(4.2, () => { h.done = true; });
    },
    while: () => free(), max: 20, linger: 6,
  });

  // ---------------------------------------------------------------------------------------------------------------------------------------
  // the hand over the rail of the bunk. On the room side the top bunk has a guard board from the head to the ladder's post (x 7.5 to
  // 8.85), 3 cm thick (z 3.286 to 3.316), its top edge at 1.743, a hand's width of air between it and the quilt. Four grey fingers come
  // up its outside face, over the top and down the inside, a little toward the foot from where you sit; the arm goes down outside the
  // side board (its face at 3.289) and back in under you
  const RAIL = { z0: 3.286, z1: 3.316, top: 1.743 };
  const hand = (() => {
    const g = new THREE.Group(); g.visible = false; env.scene.add(g);
    const mat = new THREE.MeshStandardMaterial({ color: 0x55535c, roughness: 0.6 });   // grey, so it shows on the wood by the night light
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 8), sph = new THREE.SphereGeometry(1, 10, 8);
    const bone = (r) => { const m = new THREE.Mesh(cyl, mat); m.userData.r = r; g.add(m); return m; };
    const ball = (r) => { const m = new THREE.Mesh(sph, mat); m.scale.setScalar(r); g.add(m); return m; };
    const lay = (m, a, b) => { m.position.copy(a).add(b).multiplyScalar(0.5); _v.copy(b).sub(a); const l = _v.length() || 1e-4; m.quaternion.setFromUnitVectors(UP, _v.divideScalar(l)); m.scale.set(m.userData.r, l, m.userData.r); };
    // each finger: where it sits along the rail, how far its tip reaches down the inside, how thick
    const fingers = [[-0.039, 0.85, 0.0095], [-0.013, 1.0, 0.0105], [0.013, 0.94, 0.0105], [0.038, 0.72, 0.009]].map(([x, len, r]) => ({ x, len, r, bones: [bone(r), bone(r * 0.95), bone(r * 0.85)], balls: [ball(r * 1.12), ball(r * 1.05), ball(r * 0.95), ball(r * 0.85)], p: [new V3(), new V3(), new V3(), new V3()] }));
    const palm = ball(1); palm.scale.set(0.052, 0.056, 0.012); palm.position.set(0, 1.652, RAIL.z0 - 0.026);
    const fore = bone(0.022), upper = bone(0.027), elbow = ball(0.028), wrist = ball(0.024);
    wrist.position.set(0, 1.6, 3.256); lay(fore, _a.set(0, 1.6, 3.256), _b.set(0.02, 1.12, 3.2)); elbow.position.set(0.02, 1.12, 3.2); lay(upper, _a.set(0.02, 1.12, 3.2), _b.set(0.1, 0.74, 3.553));
    // k: 0 the fingers laid over the rail, 1 closed on it
    function pose(k) {
      for (const f of fingers) {
        const [a, b, c, d] = f.p, fan = f.x * 0.2;
        a.set(f.x, 1.7, RAIL.z0 - 0.024); b.set(f.x + fan * 0.3, RAIL.top + 0.023 - 0.005 * k, RAIL.z0 - 0.014);
        c.set(f.x + fan * 0.7, RAIL.top + 0.025 - 0.006 * k, RAIL.z1 + 0.009); d.set(f.x + fan, RAIL.top - 0.004 - (0.03 + 0.02 * k) * f.len, RAIL.z1 + 0.021 - 0.006 * k);
        lay(f.bones[0], a, b); lay(f.bones[1], b, c); lay(f.bones[2], c, d);
        f.balls.forEach((s, i) => s.position.copy(f.p[i]));
      }
    }
    pose(0); g.traverse((o) => { o.castShadow = false; o.userData.noAO = true; });
    // letting go: up off the rail, back clear of it, and down (q 0..1)
    const off = (q) => { const up = Math.min(1, q / 0.2), back = Math.min(1, Math.max(0, (q - 0.15) / 0.25)), down = Math.max(0, (q - 0.4) / 0.6); g.position.y = 0.06 * up - 0.55 * down * down; g.position.z = -0.1 * back; };
    return { g, pose, off, at(x) { g.position.set(x, 0, 0); } };
  })();
  const BED = at3(8.42, 0.62, 3.72);
  // on the screen at all (a point in space, not on the floor: the gaze's own test stands things on the plan)
  const onView = (p, m = 1) => { _a.set(p.x, p.y, p.z).project(camera); return _a.z < 1 && Math.abs(_a.x) < m && Math.abs(_a.y) < m; };
  reg({
    id: 'bunkHand', tier: 'presence', minN: 4, w: 4, uses: ['bunk'], rooms: ['bed'],
    anchor: (D, h) => ({ x: h ? h.x : 8.56, z: RAIL.z0, y: 0.62 }),
    pre: () => free() && P.mode === 'bunk' && mayJump('bunkHand') && !hunter.busy && gaze.inBunkFor() > 8 && (F.leanK || 0) < 0.1,
    arm: () => {
      if (!inBunk() || (F.leanK || 0) > 0.1) return null;
      const x0 = 8.4 + D.r() * 0.26, x = [x0, 8.66, 8.4].find((c) => P.mode !== 'bunk' || !onView(at3(c, RAIL.top, RAIL.z1), 1.02)); if (x === undefined) return null;
      hand.at(x); hand.pose(0); hand.g.visible = true;
      sfx.pick('creak_heavy', { at: BED, gain: 0.8, wet: 0.12, rate: 0.9 });
      return { alive: true, x, p: at3(x, RAIL.top, RAIL.z1), k: 0 };
    },
    reveal: { by: 'look', when: (D, h) => !h.gone && P.mode === 'bunk' && (F.leanK || 0) < 0.2 && onView(h.p, 0.82) },
    payoff: (D, h) => { h.seen = now(); sting(1.2, 0.6); jumped('bunkHand'); sfx.pick('cloth', { at: h.p, gain: 0.7, wet: 0.08 }); },
    tick: (D, h, dt) => {
      // you lean out to look under: it lets go, and it is gone before your eye gets there
      // (or start down the ladder: your head a foot from where it sat)
      if (!h.gone && !h.seen && ((F.leanK || 0) > 0.12 || Math.hypot(camera.position.x - 8.33, camera.position.z - 4.0) > 0.4)) { hand.g.visible = false; h.gone = true; h.done = true; return; }
      if (!h.seen || h.gone) return;
      const t = now() - h.seen;
      if (t < 0.9) { h.k = Math.min(1, h.k + dt * 7); hand.pose(h.k); return; }
      const q = Math.min(1, (t - 0.9) / 0.3); hand.off(q);
      if (q >= 1) { hand.g.visible = false; h.gone = true; sfx.pick('bed_creak', { at: BED, gain: 0.6, wet: 0.1 }); h.done = true; }
    },
    while: () => P.mode !== 'walk', max: 30, linger: 4,   // (the covers pulled over pass through a cut, and that is still the bunk)
    undo: (h) => { h.alive = false; hand.g.visible = false; },
    test: { mode: 'bunk' },
  });

  // scratching inside the wall beside the pillow; it stops when you turn your head to it, and then it is under the mattress, once
  const PILLOW_WALL = at3(7.75, 1.95, 4.62);
  reg({
    id: 'wallScratch', tier: 'whisper', minN: 2, w: 0.8, rooms: ['bed'],
    anchor: () => ({ x: PILLOW_WALL.x, z: PILLOW_WALL.z, y: 0.62 }),
    pre: () => free() && inBunk() && gaze.still(3) && !hunter.busy,
    arm: () => (inBunk() ? { alive: true, next: now() + 0.5, n: 0 } : null),
    tick: (D, h) => {
      if (h.heard || now() < h.next) return;
      h.next = now() + 2.4 + D.r() * 1.8; h.n++; sfx.pick('wall_scratch', { at: PILLOW_WALL, gain: 0.5, wet: 0.2, lp: 2000, rate: 0.9 + D.r() * 0.2 });
    },
    reveal: { by: 'look', when: (D, h) => h.n >= 1 && P.mode === 'bunk' && camDot(PILLOW_WALL) > 0.8 },
    payoff: (D, h) => {
      h.heard = true; F.fear = Math.max(F.fear, 0.45);
      later(3.6, () => { if (h.alive && inBunk()) sfx.pick('wall_scratch', { at: at3(8.4, 1.5, 3.9), gain: 0.7, wet: 0.1, lp: 1500, rate: 0.6 }); h.done = true; });
    },
    while: () => P.mode !== 'walk', max: 45, linger: 6, test: { mode: 'bunk' },
  });

  // ---------------------------------------------------------------------------------------------------------------------------------------
  // the thing in the room for one frame of film: you take a photograph, and in the flash it is standing where the lens points
  const flashStamp = () => (env.hands && env.hands.flashAt) || 0;
  function frontNode() {
    const c = D.visibleNodes(2.2, 6.5, 'front'); let best = null, bd = -1;
    for (const k of c) { const p = nodePt(k), f = gaze.facing(p); if (f > bd) { bd = f; best = p; } }
    return bd > 0.8 ? best : null;
  }
  reg({
    id: 'flashFigure', tier: 'presence', minN: 3, w: 4, chain: true,   // it comes on the photograph you have just taken: no waiting for one
    pre: () => walking() && RUN().hasCamera !== false && mayJump('flashFigure') && canE() && flashStamp() > 0 && now() - flashStamp() < 0.35 && !!frontNode(),
    arm: () => (P.mode === 'walk' && E.rig ? { alive: true, f0: flashStamp() > 0 && now() - flashStamp() < 0.35 ? flashStamp() - 0.01 : flashStamp() } : null),
    reveal: { by: 'photo', when: (D, h) => {
      if (flashStamp() <= h.f0) return false;
      h.f0 = flashStamp(); h.spot = P.mode === 'walk' && canE() ? frontNode() : null;   // a photograph with no room in front of the lens is only a photograph
      return !!h.spot;
    } },
    payoff: (D, h) => {
      jumped('flashFigure');
      if (h.spot && idleE()) { h.shown = true; showE(h.spot.x, h.spot.z, P.pos.x, P.pos.z, { tilt: 0.4 }); }
      sting(1.25, 0.55);
      later(0.4, () => { if (h.shown) { hideE(); h.shown = false; } h.done = true; });
    },
    while: () => free(), max: 20, linger: 2,
    undo: (h) => { h.alive = false; if (h.shown) hideE(); },
  });

  // something runs across the end of the hall: out of the living room's front corner, past the mouth of the hall and through the arch
  // into the kitchen, in the time it takes to see that it was tall
  const RUN_PATH = ['livDoor', 'livE', 'archN', 'archS', 'kit2'].map(nodePt), CROSS = { x: 2.9, z: -0.42, y: 0 };
  reg({
    id: 'hallSprint', tier: 'presence', minN: 3, w: 4, uses: ['E', 'stage'], rooms: ['hall'],
    anchor: () => CROSS,
    pre: () => walking() && room() === 'hall' && P.pos.x > 6.6 && mayJump('hallSprint') && canE(),
    arm: () => {
      if (P.mode !== 'walk' || room() !== 'hall' || P.pos.x < 6.2 || !canE()) return null;
      showE(RUN_PATH[0].x, RUN_PATH[0].z, RUN_PATH[1].x, RUN_PATH[1].z);
      sfx.pick('creak', { at: at3(RUN_PATH[0].x, 0.1, RUN_PATH[0].z), gain: 0.5, wet: 0.3 });
      return { alive: true, i: 0, step: 0 };
    },
    reveal: { by: 'look', when: () => room() === 'hall' && P.pos.x > 6.2 && gaze.facing(CROSS) > 0.9 && gaze.inView(CROSS, 0.8) },
    payoff: (D, h) => { h.run = true; h.speed0 = E.speed; E.mode = 'run'; E.speed = 1.7; E.lookTarget = null; jumped('hallSprint'); later(0.16, () => { if (h.alive) sting(1.15, 0.45); }); },
    tick: (D, h, dt) => {
      if (!h.run || h.gone) return;
      let left = dt * 8.5; const e = E.root.position;
      while (left > 0 && h.i < RUN_PATH.length - 1) {
        const b = RUN_PATH[h.i + 1], dx = b.x - e.x, dz = b.z - e.z, d = Math.hypot(dx, dz);
        if (d <= left) { e.x = b.x; e.z = b.z; left -= d; h.i++; } else { e.x += dx / d * left; e.z += dz / d * left; left = 0; E.faceTowards(b.x, b.z, 1); }
      }
      h.step -= dt; if (h.step <= 0) { h.step = 0.17; sfx.heavyStep(0.7, D.pan(e.x, e.z, 0.1)); }
      if (h.i >= RUN_PATH.length - 1) { h.gone = true; E.speed = h.speed0; hideE(); h.done = true; }
    },
    while: (D, h) => h.run || (room() === 'hall' && !hunter.busy && !F.script), max: 40, linger: 3,
    undo: (h) => { h.alive = false; if (h.run && !h.gone) E.speed = h.speed0; hideE(); },
  });

  // the bathroom mirror: you put the light on, and it is in the glass behind your shoulder until you look straight at it
  const MIRROR = { x: 6.6, z: 1.64, y: 0 };
  // (what is shown in the glass is a picture hung a hair in front of it: the cabinet's glass stands 3.4 cm proud of where that picture
  // was hung, so it is brought out to the glass's face, 6.564, and nothing shown in it is behind the mirror any more)
  { const pl = W.mirrorFx.plane; pl.updateWorldMatrix(true, false); pl.position.x += 6.561 - pl.getWorldPosition(_v).x; }
  function mirrorFigure() {
    W.mirrorFx.show('figure');
    const tex = W.mirrorFx.plane.material.map, c = tex.image, g = c.getContext('2d'), w = c.width, h = c.height;
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#59616a'); gr.addColorStop(1, '#2a3036'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    // tall enough that the frame cuts it at the shoulders: a long head bent to one side, close behind where your own would be
    g.fillStyle = '#030304'; g.beginPath(); g.moveTo(w * 0.42, h); g.lineTo(w * 0.47, h * 0.62); g.quadraticCurveTo(w * 0.7, h * 0.5, w * 0.95, h * 0.66); g.lineTo(w, h); g.fill();
    g.save(); g.translate(w * 0.7, h * 0.36); g.rotate(0.22); g.beginPath(); g.ellipse(0, 0, w * 0.13, h * 0.27, 0, 0, 7); g.fill();
    g.fillStyle = '#f4f4f0'; g.beginPath(); g.ellipse(-w * 0.055, -h * 0.05, 5, 8, 0.2, 0, 7); g.ellipse(w * 0.055, -h * 0.05, 5, 8, -0.2, 0, 7); g.fill();
    g.fillStyle = '#000'; g.beginPath(); g.arc(-w * 0.05, -h * 0.04, 2.4, 0, 7); g.arc(w * 0.06, -h * 0.04, 2.4, 0, 7); g.fill();
    g.strokeStyle = '#f4f4f0'; g.lineWidth = 2.4; g.beginPath(); g.arc(0, h * 0.05, w * 0.085, 0.12 * Math.PI, 0.88 * Math.PI); g.stroke();
    g.lineWidth = 1; for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(i * 3.2, h * 0.095); g.lineTo(i * 3.2, h * 0.125); g.stroke(); }
    g.restore(); tex.needsUpdate = true;
  }
  reg({
    id: 'mirrorLight', tier: 'presence', minN: 3, w: 4, uses: ['mirror'], rooms: ['bath', 'hall'],
    anchor: () => MIRROR,
    chain: true,   // it comes on the switch you have just put on: no waiting for one
    pre: () => walking() && mayJump('mirrorLight') && !hunter.busy && env.lights && env.lights.isOn('bath') && gaze.flipped('bath', true, 8) && pd(MIRROR) < 4.5 && !W.mirrorFx.plane.visible,
    arm: () => (P.mode === 'walk' && env.lights && !W.mirrorFx.plane.visible ? { alive: true, g0: gaze.flipped('bath', true, 8) ? gaze.flippedAt('bath', true) - 0.01 : gaze.now } : null),
    tick: (D, h) => { if (!h.drawn && gaze.flippedAt('bath', true) > h.g0 && !gaze.onScreen(MIRROR, 0.75)) { h.drawn = true; mirrorFigure(); } },
    reveal: { by: 'look', when: (D, h) => h.drawn && pd(MIRROR) < 3.8 && gaze.inView(MIRROR, 0.8) && gaze.facing(MIRROR) > 0.82 },
    payoff: (D, h) => {
      if (!h.drawn) { h.drawn = true; mirrorFigure(); }
      jumped('mirrorLight'); sting(1.15, 0.5);
      later(0.5, () => { W.mirrorFx.hide(); if (h.alive) D.flicker(0.4); h.done = true; });
    },
    while: (D, h) => !h.drawn || env.lights.isOn('bath'), max: 25, linger: 2,
    undo: (h) => { h.alive = false; if (h.drawn) W.mirrorFx.hide(); },
  });

  // the face at the glass in the lightning: a wet night, a window you have your back to, and when you turn to it the sky goes white
  // and it is pressed to the pane for as long as the sky stays lit
  const winIn = (w) => (P.pos.x - w.c.x) * w.n.x + (P.pos.z - w.c.z) * w.n.z > 0.05 && Math.abs(P.pos.y) < 0.6;
  const glassWin = () => (wins() || []).filter((w) => w.h > 0.8 && winIn(w) && pd(w.c) < 6 && pd(w.c) > 1.2).sort((a, b) => pd(a.c) - pd(b.c));
  const winPt = (w) => ({ x: w.c.x + w.n.x * 0.3, z: w.c.z + w.n.z * 0.3, y: 0 });
  reg({
    id: 'lightningFace', tier: 'presence', minN: 4, w: 4, uses: ['E', 'stage'],
    anchor: (D, h) => { const w = h ? h.w : glassWin()[0]; return w ? winPt(w) : null; },
    pre: () => walking() && !!env.weather && env.weather.kind !== 'clear' && mayJump('lightningFace') && canE() && glassWin().length > 0,
    arm: () => { const w = glassWin()[0]; return w && P.mode === 'walk' && E.rig ? { alive: true, w } : null; },
    reveal: { by: 'look', when: (D, h) => winIn(h.w) && pd(h.w.c) < 6.5 && gaze.looking(h.w.c, 0.82) },
    payoff: (D, h) => {
      // bent double a metre out from the wall, so that its face comes to the middle of the pane and stops a hand's width short of the glass
      const w = h.w, x = w.c.x - w.n.x * 1.1, z = w.c.z - w.n.z * 1.1;
      jumped('lightningFace');
      // the sky lit by the weather's own flash, and this flash's thunder heard through this window, not from everywhere
      if (env.weather) { const th = sfx.thunder; sfx.thunder = () => {}; try { env.weather.flash(0.35, 1.2); } finally { sfx.thunder = th; } }
      const out = at3(w.c.x - w.n.x * 7, 4, w.c.z - w.n.z * 7);
      if (!sfx.pick('thunder', { at: out, gain: 1.2, wet: 0.2, delay: 0.35, lp: 5200, big: true, ref: 6 })) sfx.noiseHit({ dur: 2.4, type: 'lowpass', f: 520, f2: 60, q: 0.8, gain: 0.9, attack: 0.08, wet: 0.6, delay: 0.35, pan: D.pan(out.x, out.z, out.y) });
      if (idleE()) { h.shown = true; showE(x, z, w.c.x + w.n.x, w.c.z + w.n.z, { y: (W.groundAt ? W.groundAt(x, z, 0) : 0) || 0, lean: 0.2, duck: 1 }); }
      later(0.06, () => { if (h.alive) sting(1.2, 0.5); });
      later(0.62, () => { if (h.shown) { hideE(); h.shown = false; } h.done = true; });
    },
    while: (D, h) => winIn(h.w) && !hunter.busy, max: 40, linger: 2,
    undo: (h) => { h.alive = false; if (h.shown) hideE(); },
  });

  // the television comes on behind you, and when you look it is showing this room, from where it stands, with something in it that is
  // not in the room; then the same picture with it a step behind where you are
  const tv = (() => {
    const fx = W.tvFx, plane = fx.plane, live = plane.material;
    const RT = new THREE.WebGLRenderTarget(256, 192, { samples: 0 }), cam = new THREE.PerspectiveCamera(64, 4 / 3, 0.1, 30); cam.layers.enable(LAYER);
    const pic = new THREE.ShaderMaterial({
      uniforms: { tex: { value: RT.texture }, t: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform sampler2D tex; uniform float t; varying vec2 vUv;
        float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main() { vec2 uv = vUv; uv.x += (h(vec2(floor(uv.y * 96.0), t)) - 0.5) * 0.012;
          float l = dot(texture2D(tex, uv).rgb, vec3(0.299, 0.587, 0.114)); l = pow(clamp(l * 9.0, 0.0, 1.0), 0.6);
          l = l * (0.82 + 0.18 * step(0.5, fract(uv.y * 96.0))) + (h(uv * 311.0 + t) - 0.5) * 0.16;
          float v = smoothstep(0.85, 0.3, length(uv - 0.5)); gl_FragColor = vec4(vec3(0.84, 0.9, 1.0) * l * v, 1.0); }`,
      toneMapped: false, fog: false,
    });
    const pos = new V3(); let want = false;
    plane.onBeforeRender = (renderer, scene) => {
      pic.uniforms.t.value = now() % 97;
      if (!want) return; want = false;
      plane.getWorldPosition(pos); cam.position.set(pos.x - 0.14, pos.y + 0.1, pos.z); cam.lookAt(P.pos.x, P.pos.y + 1.15, P.pos.z); cam.updateMatrixWorld();
      // (the set's own glow is all that lights the picture: turned well up for this one draw, as a camera's gain would be)
      const prev = renderer.getRenderTarget(), sh = renderer.shadowMap.autoUpdate, i0 = fx.light.intensity, d0 = fx.light.distance;
      plane.visible = false; renderer.shadowMap.autoUpdate = false; fx.light.intensity = 160; fx.light.distance = 16;
      renderer.setRenderTarget(RT); renderer.state.buffers.depth.setMask(true); renderer.clear(); renderer.render(scene, cam);
      renderer.setRenderTarget(prev); renderer.shadowMap.autoUpdate = sh; fx.light.intensity = i0; fx.light.distance = d0; plane.visible = true;
    };
    return { pt: () => { plane.getWorldPosition(pos); return { x: pos.x, z: pos.z, y: 0 }; }, shoot() { want = true; plane.material = pic; }, live() { plane.material = live; want = false; }, cam, RT };
  })();
  // where it stands in the picture: a spot the thing can stand on, further from the set than you are and as near behind you as there is
  function behindForTv(minGap) {
    const t = tv.pt(), dp = pd(t); let best = null, bs = 1e9;
    for (const k of ['livE', 'livC', 'livW', 'livMid', 'livFar', 'archN', 'livMouth']) {
      const p = nodePt(k), dn = Math.hypot(p.x - t.x, p.z - t.z), gap = pd(p);
      if (dn < dp + 0.3 || gap < minGap) continue;
      const cos = ((p.x - t.x) * (P.pos.x - t.x) + (p.z - t.z) * (P.pos.z - t.z)) / (dn * dp || 1), s = gap + (1 - cos) * 6;
      if (cos > 0.75 && s < bs) { bs = s; best = p; }
    }
    return best;
  }
  reg({
    id: 'tvRoom', tier: 'presence', minN: 5, w: 4, uses: ['E', 'stage', 'tv'], rooms: ['living'],
    anchor: () => tv.pt(),
    pre: () => walking() && F.plan.type !== 'static' && room() === 'living' && !W.tvFx.on && mayJump('tvRoom') && canE() && pd(tv.pt()) > 2 && pd(tv.pt()) < 6.5,   // (the night the set is Dad's has its own use for it)
    arm: () => {
      if (P.mode !== 'walk' || room() !== 'living' || W.tvFx.on || !E.rig) return null;
      const t = tv.pt(); W.tvFx.set(true); D.holdTv(true); sfx.staticBurst(D.pan(t.x, t.z, 0.8), 1.4);
      return { alive: true };
    },
    reveal: { by: 'look', when: () => room() === 'living' && pd(tv.pt()) < 7 && gaze.facing(tv.pt()) > 0.86 && gaze.inView(tv.pt(), 0.8) },
    payoff: (D, h) => {
      const t = tv.pt(), ta = at3(t.x, 0.8, t.z);
      const stand = (gap, lean) => { const p = behindForTv(gap); if (!p || !(h.mine || idleE())) return false; h.mine = true; showE(p.x, p.z, t.x, t.z, { lean }); setLayer(E.root, LAYER); return true; };
      jumped('tvRoom'); sfx.pick('zap', { at: ta, gain: 0.5, wet: 0.1 }); stand(2.6, 0); tv.shoot();
      later(1.0, () => { if (!h.alive) return; stand(0.9, 0.3); tv.shoot(); sting(1.25, 0.6); });
      later(1.75, () => { if (!h.alive) return; sfx.pick('crt_off', { at: ta, gain: 0.8, wet: 0.1 }); off(h); h.done = true; });
    },
    while: () => room() === 'living' && !hunter.busy && !F.script, max: 40, linger: 3,
    undo: (h) => { h.alive = false; off(h); },
  });
  function off(h) { tv.live(); W.tvFx.set(false); D.holdTv(false); if (h.mine) { h.mine = false; hideE(); } }

  // the telephone rings in the dark, and what is on the line when you pick it up
  const PHONE = () => W.phone.pos;
  reg({
    id: 'phoneScream', tier: 'loud', minN: 4, w: 3, noise: 0.7, uses: ['phone'],
    anchor: () => ({ x: PHONE().x, z: PHONE().z, y: 0 }),
    pre: () => walking() && F.plan.type !== 'ring' && !W.phone.ringing && !W.phone.off && mayJump('phoneScream') && !hunter.busy && pd(PHONE()) < 14 && pd(PHONE()) > 2.5,
    arm: () => {
      if (P.mode !== 'walk' || W.phone.ringing || W.phone.off) return null;
      const h = { alive: true, rings: 0, next: now() }; W.phone.setRinging(true);
      h.it = env.addI({ p: PHONE().clone(), r: 1.8, label: 'Pick up the phone', when: () => h.alive && !h.answered && W.phone.ringing && P.mode === 'walk', act: () => { h.answered = true; } });
      return h;
    },
    tick: (D, h) => {
      if (h.answered || now() < h.next) return;
      if (h.rings >= 9) { h.done = true; return; }
      h.rings++; h.next = now() + 1.7; sfx.phoneRing(D.pan(PHONE().x, PHONE().z, 1.3)); F.fear = Math.max(F.fear, 0.25);
    },
    reveal: { by: 'hold', hold: 0.05, when: (D, h) => !!h.answered },
    payoff: (D, h) => {
      const p = at3(PHONE().x, PHONE().y, PHONE().z);
      h.answered = true; h.picked = true; W.phone.setRinging(false); W.phone.pickUp(); sfx.pick('switch', { at: p, gain: 0.4, wet: 0.05 }); jumped('phoneScream');
      later(0.6, () => { if (h.alive) sfx.pick('breath', { at: p, gain: 0.7, wet: 0.03, rate: 0.8 }); });
      later(2.1, () => { if (!h.alive) return; sfx.lineScream({ at: p, gain: 1 }); sting(1.4, 1.0); });
      later(3.4, () => { if (h.alive) { W.phone.hangUp(); h.picked = false; sfx.pick('phone_hangup', { at: p, gain: 0.7, wet: 0.1 }); } h.done = true; });
    },
    while: () => free(), max: 30, linger: 5,
    undo: (h) => { h.alive = false; if (W.phone.ringing) W.phone.setRinging(false); if (h.picked) W.phone.hangUp(); if (h.it) env.removeI(h.it); },
    end: (D, h) => { if (h.it) { env.removeI(h.it); h.it = null; } if (W.phone.ringing && !h.picked) W.phone.setRinging(false); },
  });

  // ---------------------------------------------------------------------------------------------------------------------------------------
  // the quiet ones
  // you hold your breath, and something an arm's length behind you goes on breathing
  reg({
    id: 'breathHeld', tier: 'whisper', minN: 3, w: 1, chain: true,   // it comes on a breath you are holding: no waiting for one
    pre: () => free() && (P.mode === 'walk' || (P.mode === 'hide' && !!P.pod)) && env.holding() && !hunter.busy,
    arm: () => (P.mode === 'walk' || P.mode === 'hide' ? { alive: true, n: 0, next: 0 } : null),
    reveal: { by: 'hold', hold: 1.3, when: () => env.holding() },
    payoff: (D, h) => { h.on = true; F.fear = Math.max(F.fear, 0.5); },
    tick: (D, h) => {
      if (!h.on) return;
      if (!env.holding() || h.n >= 4) { h.done = true; return; }   // it stops when you breathe again
      if (now() < h.next) return;
      h.next = now() + 1.5; h.n++; sfx.pick('breath', { at: behindEar(0.45), gain: 0.5 + night() * 0.02, wet: 0.04, rate: 0.82 + (h.n % 2) * 0.05 });
    },
    while: () => free(), max: 20, linger: 8,
  });

  // slow steps on the ceiling, coming across the room to stand over you; move, and after a moment they come over again
  reg({
    id: 'stepsAbove', tier: 'whisper', minN: 2, w: 0.8,
    pre: () => walking() && !!room() && P.pos.y > -1 && !hunter.busy,
    arm: () => {
      if (P.mode !== 'walk' || P.pos.y < -1) return null;
      const a = D.r() * Math.PI * 2;
      return { alive: true, x: P.pos.x + Math.sin(a) * 3.4, z: P.pos.z + Math.cos(a) * 3.4, i: 0, next: now() + 0.6 };
    },
    tick: (D, h) => {
      if (now() < h.next || h.over) return;
      const dx = P.pos.x - h.x, dz = P.pos.z - h.z, d = Math.hypot(dx, dz), s = Math.min(d, 0.55);
      if (d > 0.01) { h.x += dx / d * s; h.z += dz / d * s; }
      h.i++; h.next = now() + (d < 0.6 ? 2.6 : 1.15);
      sfx.pick('step_heavy', { at: at3(h.x, P.pos.y + 2.8, h.z), gain: 0.55 + Math.min(0.3, h.i * 0.04), wet: 0.3, muffle: true, rate: 0.8 });
      if (h.i % 3 === 0) sfx.pick('creak', { at: at3(h.x, P.pos.y + 2.7, h.z), gain: 0.4, wet: 0.3, lp: 1600 });
      if (h.i >= 9 + Math.min(6, night())) { h.over = true; later(2, () => { h.done = true; }); }
    },
    reveal: { by: 'hold', hold: 0.3, when: (D, h) => h.i >= 2 },
    payoff: () => { F.fear = Math.max(F.fear, 0.4); },
    while: () => free() && P.pos.y > -1, max: 40, linger: 40,
  });

  // a child humming, low in a wall of another room, the same few notes; it stops in the middle of one when you come close, and a
  // moment later the end of the tune comes from somewhere else
  const VENTS = [at3(4.85, 0.25, 2.7), at3(11.2, 0.25, -0.42), at3(6.98, 0.25, 2.1), at3(4.85, 0.25, -2.9), at3(-0.2, 0.25, 0.1)];
  const TUNE = [440, 523.25, 440, 392, 329.63, 0, 392, 440, 523.25, 587.33, 523.25, 440, 0, 0];
  const ventFor = () => VENTS.filter((v) => pd(v) > 1.8 && pd(v) < 11).sort((a, b) => pd(a) - pd(b));   // the nearest that is not at your feet
  reg({
    id: 'ventHum', tier: 'whisper', minN: 3, w: 0.7,
    anchor: (D, h) => { const v = h ? h.v : ventFor()[0]; return v ? { x: v.x, z: v.z, y: 0 } : null; },
    pre: () => walking() && !hunter.busy && ventFor().length > 0,
    arm: () => { const v = ventFor()[0]; return v && P.mode === 'walk' ? { alive: true, v, i: 0, next: now() + 0.3 } : null; },
    tick: (D, h) => {
      if (h.stopped || now() < h.next) return;
      const f = TUNE[h.i % TUNE.length]; h.i++; h.next = now() + 0.62;
      if (f && pd(h.v) < 13) sfx.hummed({ at: h.v, f, dur: 0.52, gain: 0.2 });
    },
    reveal: { by: 'approach', within: 1.6 },
    payoff: (D, h) => {
      h.stopped = true; F.fear = Math.max(F.fear, 0.45);
      const far = VENTS.filter((v) => v !== h.v).sort((a, b) => pd(b) - pd(a))[0];
      later(3.6, () => { if (h.alive) [523.25, 440, 392].forEach((f, i) => sfx.hummed({ at: far, f, dur: i === 2 ? 1.1 : 0.52, gain: 0.16, delay: i * 0.62 })); });
      later(6.4, () => { h.done = true; });
    },
    while: () => free(), max: 70, linger: 8,
  });

  // whispering a step behind you for as long as you walk; stand still and there is none; stand still long enough and there is one more
  reg({
    id: 'whisperWalk', tier: 'whisper', minN: 2, w: 0.6,
    pre: () => walking() && !gaze.still(0.5) && !P.sprinting && !hunter.busy,
    arm: () => (P.mode === 'walk' ? { alive: true, walked: 0, next: 0 } : null),
    tick: (D, h, dt) => {
      if (h.stop || P.mode !== 'walk' || gaze.still(0.35)) return;
      h.walked += dt; if (now() < h.next) return;
      h.next = now() + 1.0; sfx.pick('whisper', { at: behindEar(1.0), gain: 0.42, wet: 0.35, lp: 4500 });
    },
    reveal: { by: 'hold', hold: 0.8, when: (D, h) => h.walked > 2.5 && gaze.still(0.8) },
    payoff: (D, h) => {
      h.stop = true; F.fear = Math.max(F.fear, 0.45);
      later(2.6, () => { if (h.alive && gaze.still(2)) sfx.pick('whisper', { at: behindEar(0.3), gain: 0.7, wet: 0.2, lp: 5000 }); h.done = true; });
    },
    while: () => free() && P.mode === 'walk', max: 45, linger: 5,
  });

  // a music box in the room nobody unpacked; it winds down as you come to the door, and the lid shuts when you come in
  const BOX = at3(10.0, 0.4, -2.95);
  const BOX_TUNE = [659.25, 783.99, 880, 783.99, 659.25, 587.33, 659.25, 0, 587.33, 659.25, 783.99, 659.25, 587.33, 493.88, 587.33, 0];
  reg({
    id: 'musicBox', tier: 'wrong', minN: 4, w: 0.8, rooms: ['hall', 'bed', 'bath', 'room2'],
    anchor: () => ({ x: BOX.x, z: BOX.z, y: 0 }),
    pre: () => walking() && ['hall', 'bed', 'bath', 'room2'].includes(room()) && pd(BOX) < 11 && !hunter.busy,
    arm: () => (P.mode === 'walk' && room() !== 'spare' && pd(BOX) < 16 ? { alive: true, i: 0, next: now() + 0.4 } : null),
    tick: (D, h) => {
      if (h.shut || now() < h.next) return;
      const near = pd(BOX) < 3.6, f = BOX_TUNE[h.i % BOX_TUNE.length]; h.i++;
      h.next = now() + (h.last ? 0.9 : near ? 0.62 : 0.36);
      if (f) sfx.comb({ at: BOX, f, gain: 0.26 });
      if (h.last && --h.last <= 0) { h.shut = true; sfx.pick('cabinet', { at: BOX, gain: 0.6, wet: 0.2 }); later(1.5, () => { h.done = true; }); }
    },
    reveal: { by: 'enterRoom', room: 'spare' },
    payoff: (D, h) => { h.last = 2; F.fear = Math.max(F.fear, 0.5); },
    while: () => free(), max: 80, linger: 8,
  });

  // a kitchen chair pulled out from the table and still rocking on two legs when you get there; it comes to rest while you look at it
  const CHAIR = 1;
  reg({
    id: 'chairRock', tier: 'wrong', minN: 2, w: 0.8, uses: ['table'], rooms: ['living', 'hall', 'dining', 'kitchen'],
    anchor: 'table',
    pre: () => walking() && !!W.chairs[CHAIR] && !hunter.busy && pd(W.chairs[CHAIR].holder.position) > 2.6 && pd(W.chairs[CHAIR].holder.position) < 10,
    arm: () => {
      const c = W.chairs[CHAIR]; if (!c || P.mode !== 'walk' || pd(c.holder.position) < 2.2) return null;
      const hp = c.holder.position, C = W.chairs; let mx = 0, mz = 0; for (const o of C) { mx += o.holder.position.x; mz += o.holder.position.z; } mx /= C.length; mz /= C.length;
      const dx = hp.x - mx, dz = hp.z - mz, l = Math.hypot(dx, dz) || 1, h = { alive: true, t: 0, amp: 0.1, ph: 0, x0: hp.x, z0: hp.z, y0: hp.y, r0: c.holder.rotation.y, rz: c.holder.rotation.z };
      sfx.scrape(D.pan(hp.x, hp.z, 0.2)); W.moveChair(CHAIR, hp.x + dx / l * 0.3, hp.z + dz / l * 0.3, h.r0 + 0.2);
      return h;
    },
    tick: (D, h, dt) => {
      const hd = W.chairs[CHAIR].holder; if (h.rest) return;
      h.t += dt; if (h.seen) h.amp = Math.max(0, h.amp - dt * 0.022);
      const s = Math.sin(h.t * 4.1), a = h.amp * s; hd.rotation.z = h.rz + a; hd.position.y = h.y0 + Math.abs(Math.sin(a)) * 0.2;
      if (s * h.ph < 0 && h.amp > 0.015 && pd(hd.position) < 9) sfx.pick('wall_knock', { at: at3(hd.position.x, 0.1, hd.position.z), gain: 3.2 * h.amp, wet: 0.2, lp: 1800, maxLen: 0.5 });
      h.ph = s;
      if (h.amp <= 0) { hd.rotation.z = h.rz; hd.position.y = h.y0; h.rest = true; h.done = true; }
    },
    reveal: { by: 'look', minDot: 0.6, within: 7.5 },
    payoff: (D, h) => { h.seen = true; F.fear = Math.max(F.fear, 0.45); },
    max: 80, linger: 12, after: { keep: true },
    undo: (h) => { h.alive = false; h.rest = true; const hd = W.chairs[CHAIR].holder; hd.rotation.z = h.rz; hd.position.y = h.y0; W.moveChair(CHAIR, h.x0, h.z0, h.r0); },
  });

  // ---------------------------------------------------------------------------------------------------------------------------------------
  // the dressing: put out as the night starts, a little more of it every night, found or not
  const finds = [];   // { id, p, r, snd }: the first close look at each is written in the night's ledger, with one small sound
  // faces scratched out of the family photographs, one more picture or one more face each night: [photograph, u, v, size] with u, v
  // across and down the print and the size a share of its height. The pictures in the hall go first, since you pass them every night
  const FACES = [
    ['family1', 0.63, 0.3, 0.17], ['grandma', 0.5, 0.37, 0.44], ['family1', 0.28, 0.21, 0.16], ['sofa', 0.51, 0.24, 0.18], ['boy', 0.48, 0.21, 0.28], ['knitting', 0.29, 0.17, 0.16],
    ['family1', 0.72, 0.17, 0.15], ['fence', 0.3, 0.38, 0.15], ['ellis', 0.62, 0.17, 0.14], ['sofa', 0.37, 0.25, 0.16], ['knitting', 0.73, 0.2, 0.16], ['fence', 0.68, 0.26, 0.13],
    ['ellis', 0.77, 0.21, 0.14], ['sofa', 0.74, 0.33, 0.15], ['knitting', 0.51, 0.31, 0.15], ['knitting', 0.08, 0.23, 0.14],
  ];
  const FACES_BY_NIGHT = [0, 0, 1, 2, 4, 6, 8, 10, 13, 16];
  const scratchTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 96; const g = c.getContext('2d'), r = rng('scratched');
    g.lineCap = 'round';
    for (let i = 0; i < 46; i++) {
      const a = r() * Math.PI, rad = 14 + r() * 26, cx = 48 + (r() - 0.5) * 22, cy = 48 + (r() - 0.5) * 22;
      // down to the white of the paper, and the dark of the point dragged through it
      g.strokeStyle = i % 5 < 3 ? `rgba(${236 + r() * 16 | 0},${232 + r() * 16 | 0},${218 + r() * 20 | 0},${0.7 + r() * 0.3})` : `rgba(26,20,14,${0.6 + r() * 0.3})`; g.lineWidth = 1 + r() * 2.2;
      g.beginPath(); g.moveTo(cx - Math.cos(a) * rad, cy - Math.sin(a) * rad); g.quadraticCurveTo(cx + (r() - 0.5) * 16, cy + (r() - 0.5) * 16, cx + Math.cos(a) * rad, cy + Math.sin(a) * rad); g.stroke();
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const scratchMat = new THREE.MeshStandardMaterial({ map: scratchTex, transparent: true, depthWrite: false, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -4 });
  const scratches = [], scratchGrp = new THREE.Group();   // one per face per hanging print of it, in FACES order: { i, m, o }
  env.scene.add(scratchGrp);
  // (the prints themselves are drawn as part of the house's merged walls, so a scratch is set on the wall where its print hangs, not on it)
  function buildScratches() {
    if (scratches.length) return;
    const geo = new THREE.PlaneGeometry(1, 1), q = new THREE.Quaternion(), sc = new V3();
    W.house.updateMatrixWorld(true);
    W.house.traverse((o) => {
      if (!o.isMesh || !o.geometry.parameters || !o.geometry.parameters.width) return;
      const src = o.material && o.material.map && o.material.map.image && o.material.map.image.src, name = src && (/assets\/photos\/(\w+)\./.exec(src) || [])[1]; if (!name) return;
      const w = o.geometry.parameters.width, h = o.geometry.parameters.height;
      o.matrixWorld.decompose(_v, q, sc);
      FACES.forEach(([n, u, v, s], i) => {
        if (n !== name) return;
        const m = new THREE.Mesh(geo, scratchMat); m.position.set((u - 0.5) * w, (0.5 - v) * h, 0.003).applyMatrix4(o.matrixWorld); m.quaternion.copy(q); m.rotateZ(i * 1.3); m.scale.set(s * h, s * h, 1);
        m.visible = false; m.userData.noAO = true; m.renderOrder = 2; scratchGrp.add(m); scratches.push({ i, m, o });
      });
    });
  }
  // more figures in the drawing in the hall: the night's own drawing with one more thing in black wax for each night since the second
  const drawings = {};
  function drawingFor(n) {
    const extra = Math.max(0, Math.min(7, n - 2)); if (!extra || !W.T || !W.T.drawing1) return null;
    if (drawings[extra]) return drawings[extra];
    const src = W.T.drawing1.image, c = document.createElement('canvas'); c.width = src.width; c.height = src.height; const g = c.getContext('2d'), r = rng('drawing-more');
    g.drawImage(src, 0, 0); g.lineCap = 'round'; g.lineJoin = 'round';
    const wax = (pts, wd) => { g.strokeStyle = '#070707'; for (let p = 0; p < 3; p++) { g.lineWidth = wd * (0.7 + r() * 0.5); g.globalAlpha = 0.7 + r() * 0.3; g.beginPath(); pts.forEach(([x, y], i) => { const jx = x + (r() - 0.5) * 2.5, jy = y + (r() - 0.5) * 2.5; if (i) g.lineTo(jx, jy); else g.moveTo(jx, jy); }); g.stroke(); } g.globalAlpha = 1; };
    const eyes = (x, y, s) => { g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x - 5 * s, y, 3.6 * s, 4.4 * s, 0, 0, 7); g.ellipse(x + 5 * s, y, 3.6 * s, 4.4 * s, 0, 0, 7); g.fill(); g.fillStyle = '#000'; g.beginPath(); g.arc(x - 4.4 * s, y + 1, 1.8 * s, 0, 7); g.arc(x + 5.6 * s, y + 1, 1.8 * s, 0, 7); g.fill(); };
    // a standing one: feet on the green line at (x, 338), ht tall
    const figure = (x, ht) => {
      const s = ht / 300, top = 338 - ht, hr = 26 * s;
      for (let y = top; y < top + hr * 2; y += 3) { const dy = y - (top + hr), w2 = Math.sqrt(Math.max(0, hr * hr - dy * dy)); wax([[x - w2, y], [x + w2, y]], 3.4); }
      for (let y = top + hr * 2; y < 338 - ht * 0.36; y += 3) wax([[x - 20 * s, y], [x + 20 * s, y + (r() - 0.5) * 3]], 3.6);
      wax([[x - 10 * s, 338 - ht * 0.36], [x - 12 * s, 338]], 5 * s + 2); wax([[x + 10 * s, 338 - ht * 0.36], [x + 12 * s, 338]], 5 * s + 2);
      wax([[x - 22 * s, top + hr * 2.2], [x - 30 * s, 338 - ht * 0.2]], 2.6); wax([[x + 22 * s, top + hr * 2.2], [x + 30 * s, 338 - ht * 0.2]], 2.6);
      eyes(x, top + hr * 0.85, Math.max(0.5, s * 1.5));
    };
    const things = [
      () => figure(66, 118),                                                                                    // far off, at the left
      () => { for (let y = 158; y < 200; y += 3) { const dy = y - 180, w2 = Math.sqrt(Math.max(0, 22 * 22 - dy * dy)); wax([[452 - w2, y], [452 + w2, y]], 3.4); } eyes(452, 176, 0.9); },   // a head over the far end of the top bunk
      () => figure(128, 158),
      () => { for (let y = 304; y < 334; y += 3) wax([[370, y], [468, y]], 4); eyes(404, 318, 0.8); eyes(440, 319, 0.7); },   // the dark under the bottom bunk, and what is in it
      () => figure(24, 92),
      () => { wax([[392, 0], [396, 62], [388, 128]], 5); for (let k = -2; k <= 2; k++) wax([[388, 128], [388 + k * 6, 150 + Math.abs(k) * -3]], 2.4); },   // an arm down from the top of the paper
      () => figure(170, 206),
    ];
    for (let i = 0; i < extra; i++) things[i]();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return (drawings[extra] = t);
  }
  // wet footprints, bare, from your door toward the ladder of the bunk: half way on the first nights they come, all the way later
  const prints = (() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(30, 92, 15, 24, 0.05, 0, 7); g.fill(); g.beginPath(); g.ellipse(33, 48, 19, 26, -0.08, 0, 7); g.fill(); g.fillRect(18, 56, 26, 30);
    for (const [x, y, rr] of [[14, 20, 6.5], [26, 13, 6], [37, 12, 5.5], [46, 16, 5], [54, 23, 4.5]]) { g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill(); }
    const mat = new THREE.MeshStandardMaterial({ color: 0x06080a, alphaMap: new THREE.CanvasTexture(c), transparent: true, opacity: 0.62, roughness: 0.12, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    const grp = new THREE.Group(); grp.visible = false; env.scene.add(grp);
    const geo = new THREE.PlaneGeometry(0.105, 0.25), path = [[9.79, 0.62], [9.9, 1.3], [9.42, 1.95], [9.14, 2.72]], list = [];
    let seg = 0, t = 0.1, side = 1;
    for (let i = 0; i < 9 && seg < path.length - 1; i++) {
      const [ax, az] = path[seg], [bx, bz] = path[seg + 1], l = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / l, dz = (bz - az) / l;
      const m = new THREE.Mesh(geo, mat); m.rotation.order = 'YXZ'; m.rotation.set(-Math.PI / 2, Math.atan2(-dx, -dz) + side * 0.1, 0);   // flat on the floor, the toes the way it walked
      m.position.set(ax + dx * t + dz * side * 0.085, 0.006, az + dz * t - dx * side * 0.085); m.scale.x = side; m.userData.noAO = true; m.renderOrder = 1; grp.add(m); list.push(m);
      side = -side; t += 0.4; if (t > l) { t -= l; seg++; }
    }
    return { grp, list };
  })();

  // the night's dressing, from its number and its seed
  function start(n) {
    reset(); if (n < 2 || n > 9 || quiet()) return;
    const r = rng(`dressing:${RUN().seed}:${n}`);
    buildScratches();
    const faces = FACES_BY_NIGHT[n] || 0; let first = null;
    for (const s of scratches) { s.m.visible = s.i < faces; if (s.m.visible && !first) first = s; }
    if (first) { const p = first.m.position; finds.push({ id: 'found:photos', p: at3(p.x, p.y, p.z), r: 2.4, snd: 'paper_tear' }); }
    const tex = drawingFor(n);
    if (tex) { W.drawingMat.map = tex; W.drawingMat.needsUpdate = true; const p = W.drawingMesh.getWorldPosition(new V3()); finds.push({ id: 'found:drawing', p: at3(p.x, p.y, p.z), r: 2.2, snd: 'crayon' }); }
    const wet = n >= 4 && (n >= 8 || r() < 0.6), count = n >= 6 ? prints.list.length : Math.ceil(prints.list.length / 2);
    prints.grp.visible = wet; prints.list.forEach((m, i) => { m.visible = i < count; });
    if (wet) { const m = prints.list[count - 1]; finds.push({ id: 'found:footprints', p: at3(m.position.x, 0.1, m.position.z), r: 2.6, snd: 'drip', floor: true }); }
  }
  function reset() {
    finds.length = 0; prints.grp.visible = false; hand.g.visible = false; shutBy = null; slamming = null; tv.live();
    for (const s of scratches) s.m.visible = false;
    if (W.T && W.T.drawing1 && Object.values(drawings).includes(W.drawingMat.map)) { W.drawingMat.map = W.T.drawing1; W.drawingMat.needsUpdate = true; }
  }
  let findT = 0;
  function tick(dt) {
    doorsTick();
    findT -= dt; if (findT > 0 || !finds.length || !free() || P.mode !== 'walk') return;
    findT = 0.25;
    for (let i = finds.length - 1; i >= 0; i--) {
      const f = finds[i]; if (pd(f.p) > f.r || camDot(f.p) < 0.82 || !gaze.inView({ x: f.p.x, z: f.p.z, y: 0 }, 0.9)) continue;
      finds.splice(i, 1); F.fear = Math.max(F.fear, 0.35);
      sfx.pick(f.snd, { at: f.p, gain: 0.35, wet: 0.2 });
      log.push({ id: f.id, tier: 'wrong', seen: true, how: 'look', p: { x: Math.round(f.p.x * 100) / 100, z: Math.round(f.p.z * 100) / 100 } });
    }
  }
  return { start, reset, tick, hand, prints, scratches, tv, finds, drawingFor, mayJump, jumps: ['doorFace', 'doorSlam', 'bunkHand', 'flashFigure', 'hallSprint', 'mirrorLight', 'lightningFace', 'tvRoom', 'phoneScream'], get lastJump() { return RUN().lastJump || null; } };
}
