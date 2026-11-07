// Moving day: the family at work (Dad carries the boxes in from the truck and unpacks them, Mom unpacks the kitchen), the day's script, its
// own wrongness, Mom's camera and Dad's goodnight at your door. main.js hands over what the day reads of it once, at boot, through
// bind(game); the day's rings are not written yet (the frame calls tick(dt) through js/hooks.js and it does nothing).
import { faceParent, KPOSE, GRIP } from './breakfast.js';

// what the day reads of main.js, set once by bind()
let THREE, V3, W, F, P, RUN, FN, mom, dad, scene, camera, sfx, UI, L, input, settings, hands, journal, lights, cartoon, keys, interacts, addI, LIE, BUNK_SEAT, tmp3;
let wait, waitFor, later, tween, ease, lerp, lerpAngle, say, speak, setPhase, sleepers, nlMult, walkTo, knobOf, atKnob, panFor, surfaceAt, roomAt, saveRun, lock, unlock;
// and main.js's own variables that change under it, read and set through the getters and setters bind() was given: main.gameTime (the
// game clock), main.waiters (the timer list, a new array every frame), main.uiMode, main.nlBase (the night lights' level) and main.lieYaw
// (which way you face, lying in the bunk)
let main = null;
// the places and things that need the world built, set by bind(): the truck, the rooms' spots, the fourth box
let TBED, TRUCK_PICK, TRUCK_BOX, RAMP_FOOT, PORCH, DOOR_IN, DOOR_OUT, LIVING_SPOTS, KITCHEN_BOX, ARCH, ARCH_IN, TRUCK_ROLL, TRUCK_ROOF, BOX4, box4Col;
export let DAD_HOME, EVE_MOM;

// main.js's boot() calls this once, before the modules install: the day's state, then the parts of the day that need the world (the
// fourth box's footprint and the two things in your room you can look at are added here, in the order they always were)
export function bind(game) {
  main = game;
  ({ THREE, V3, W, F, P, RUN, FN, mom, dad, scene, camera, sfx, UI, L, input, settings, hands, journal, lights, cartoon, keys, interacts, addI, LIE, BUNK_SEAT, tmp3,
    wait, waitFor, later, tween, ease, lerp, lerpAngle, say, speak, setPhase, sleepers, nlMult, walkTo, knobOf, atKnob, panFor, surfaceAt, roomAt, saveRun, lock, unlock } = game);
  // Dad stands on the truck bed (W.TRUCK.bed up); the next box sits on top of the stack in front of him
  TBED = W.TRUCK ? W.TRUCK.bed : 0.843;
  TRUCK_PICK = new V3(2.35, TBED, -15.25), TRUCK_BOX = new V3(2.35, TBED + 1.16, -15.8), RAMP_FOOT = new V3(2.3, 0, -10.1), PORCH = new V3(3.1, 0, -6.5), DOOR_IN = new V3(3.1, 0, -3.6), DOOR_OUT = new V3(3.1, 0, -5.4);
  LIVING_SPOTS = [new V3(1.92, 0, -3.66), new V3(0.75, 0, -3.77), new V3(1.36, 0, -2.48)];
  KITCHEN_BOX = new V3(2.32, 0, 2.78), DAD_HOME = new V3(2.35, 0, 1.15),   // clear of the table and its chairs
    EVE_MOM = new V3(3.57, 0, 3.16), ARCH = new V3(2.88, 0, -0.54), ARCH_IN = new V3(2.88, 0, 0.97);
  // the box truck's headroom (measured on the model): the rolled-up door hangs to 2.93 m just inside the sill, the roof inside is at 3.11.
  TRUCK_ROLL = 2.93 - (W.TRUCK ? W.TRUCK.drop : 0), TRUCK_ROOF = 3.11 - (W.TRUCK ? W.TRUCK.drop : 0);   // the rolled-up door and the roof inside, measured before the truck was set down on its tyres
  // the fourth box, and what you can look at in your room
  BOX4 = new V3(10.02, 0, 3.05), box4Col = { minX: BOX4.x - 0.27, maxX: BOX4.x + 0.27, minZ: BOX4.z - 0.27, maxZ: BOX4.z + 0.27, on: false, dressing: true };
  W.colliders.push(box4Col);
  addI({ obj: FN.box.mesh, r: 2.2, label: 'Look in the box', when: () => FN.box.mesh.visible && !F.box4Seen && (F.phase === 'day' || F.phase === 'morning') && P.mode === 'walk', act: async () => {
    F.box4Seen = true; sfx.pick('cloth', { gain: 0.3, wet: 0.05 }) || sfx.thump();
    UI.subtitle('<i>A drawing in crayon. A bunk bed, and something very tall standing beside it.</i>', 4.5);
    await wait(4.6); UI.subtitle('<i>Under the drawing is your school picture. The one Mom keeps in her wallet.</i>', 5);
    journal.note('n1', 'There was a box in my room with my name on it. Not one of ours. My school picture was in it.');
  } });
  addI({ obj: FN.marks.mesh, r: 1.9, label: 'Look at the pencil marks', when: () => FN.marks.mesh.visible && P.mode === 'walk' && F.phase !== 'title', act: async () => {
    if (F.marksSeen) { UI.subtitle('<i>BEN 5. BEN 6. BEN 7.</i>', 2.5); return; }
    F.marksSeen = true; UI.subtitle('<i>Pencil marks on the side of the closet, the way you measure a kid. BEN 5. BEN 6. BEN 7.</i>', 5);
    await wait(5.1); UI.subtitle('<i>Nothing after seven.</i>', 3); sfx.creak(0.1, 0.4, 0.6);
  } });
}
export function install(game) {}
export function tick(dt) {}

// ---------- the family at work: Dad carries boxes in from the truck and unpacks them, Mom unpacks the kitchen ----------
export const chore = { run: 0, stop: false, dadHome: false };
const dressing = [];                                    // everything they set down (cleared when the day restarts)
// where Mom puts things (the east counter, then the back counter by the corner) and where she stands for each, COUNTER_OFF back from it
const COUNTER_OFF = 0.48, COUNTER_Y = 0.95;
const COUNTER = [
  ...[2.65, 2.99, 3.32, 3.66].map((z) => ({ at: [4.11, COUNTER_Y, z], stand: [4.11 - COUNTER_OFF, z] })),
  ...[3.38, 3.77].map((x) => ({ at: [x, COUNTER_Y, 4.13], stand: [x, 4.13 - COUNTER_OFF] })),
];
export const stillOn = (run) => run === chore.run;
// how far a person's head has to come down at their spot, checking a stride either side since the head leads the feet when bent
export function truckDuck(who) {
  const T = W.TRUCK, g = who.group.position; if (!T || Math.abs(g.x - T.x) > 1.2 || g.z > T.z + 0.5 || g.z < T.z - 4) return 0;
  const ceil = (z) => (z > T.z + 0.02 ? Infinity : z > T.z - 0.48 ? TRUCK_ROLL : TRUCK_ROOF), top = g.y + bodyH(who) * 1.02;
  let need = 0; for (const dz of [-0.35, 0, 0.35]) need = Math.max(need, top - (ceil(g.z + dz) - 0.08));
  return need;
}
export function stepSound(g) {   // somebody else's footstep, quieter with distance and panned to where they are
  const d = Math.hypot(P.pos.x - g.x, P.pos.z - g.z); if (d > 14) return;
  const room = roomAt(g.x, g.z, g.y || 0);
  sfx.footstep(0.3 / (1 + d * 0.3), panFor(tmp3.set(g.x, (g.y || 0) + 0.05, g.z)), 0.25, surfaceAt(g.x, g.z, g.y || 0, room));
}
export const idle = (who) => { if (who.rig) who.rig.play('idle', { fade: 0.3, speed: 1 }); };
// a chore tween: like tween, but it stands still while who.held (you are talking to them), and carries on after
export function htween(who, dur, fn, e = ease.inOut) {
  return new Promise((res) => {
    let k = 0, last = main.gameTime, held = false; fn(0);
    main.waiters.push({ res, check: () => {
      const now = main.gameTime, dt = now - last; last = now;
      if (who.held) { if (!held) { held = true; idle(who); } return false; }
      if (held) { held = false; if (who.walking && who.rig) who.rig.play('walk', { fade: 0.25, speed: who.walking }); }
      k = Math.min(1, k + dt / dur); fn(e(k)); return k >= 1;
    } });
  });
}

function turnToward(who, x, z, dur = 0.45) {
  const y0 = who.group.rotation.y, w = Math.atan2(x - who.group.position.x, z - who.group.position.z);
  return htween(who, dur, (k) => { who.group.rotation.y = lerpAngle(y0, w, k); });
}
// a box with flaps that open, and a few things to take out of it
function openable(b) {
  const h = b.geometry.parameters.height, w = b.geometry.parameters.width, d = b.geometry.parameters.depth, pivots = [];
  for (const s of [-1, 1]) {
    const pv = new THREE.Object3D(); pv.position.set(0, h / 2, s * d / 2); const f = new THREE.Mesh(new THREE.BoxGeometry(w, 0.008, d / 2), b.material);
    f.position.set(0, 0.004, -s * d / 4); f.castShadow = true; pv.add(f); b.add(pv); pivots.push([pv, s]);
  }
  const inner = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.04, d - 0.04), new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 1 }));
  inner.rotation.x = -Math.PI / 2; inner.position.y = h / 2 + 0.004; inner.visible = false; b.add(inner);
  return (k) => { inner.visible = k > 0.15; for (const [pv, s] of pivots) pv.rotation.x = s * 2.0 * k; };
}
const thingMats = {};
const mat = (c, r = 0.6) => (thingMats[c + '_' + r] ||= new THREE.MeshStandardMaterial({ color: c, roughness: r }));
export function makeThing(kind) {
  const g = new THREE.Group(), add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  if (kind === 'mug') { add(new THREE.CylinderGeometry(0.042, 0.04, 0.09, 14), mat(0xd8d2c2), 0, 0.045, 0); add(new THREE.TorusGeometry(0.03, 0.008, 6, 12), mat(0xd8d2c2), 0.05, 0.05, 0).rotation.y = 0; }
  else if (kind === 'plates') for (let i = 0; i < 3; i++) add(new THREE.CylinderGeometry(0.11, 0.1, 0.018, 18), mat(i % 2 ? 0xe6e1d2 : 0xc9d2d6), 0, 0.01 + i * 0.02, 0);
  else if (kind === 'books') [[0x8a3a32, 0.24, 0.04], [0x3a5a7a, 0.22, 0.035], [0x6a7a4a, 0.2, 0.03]].forEach(([c, w, hh], i) => add(new THREE.BoxGeometry(w, hh, 0.17), mat(c, 0.8), 0.01 * i, 0.02 + i * 0.037, 0).rotation.y = i * 0.2);
  else if (kind === 'lamp') { add(new THREE.CylinderGeometry(0.06, 0.07, 0.04, 14), mat(0x3a2e24), 0, 0.02, 0); add(new THREE.CylinderGeometry(0.014, 0.014, 0.3, 8), mat(0x3a2e24), 0, 0.19, 0); add(new THREE.CylinderGeometry(0.1, 0.16, 0.16, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0xe8dcb4, roughness: 0.9, side: THREE.DoubleSide }), 0, 0.4, 0); }
  else if (kind === 'pot') { add(new THREE.CylinderGeometry(0.1, 0.09, 0.12, 16), mat(0x56595c, 0.4), 0, 0.06, 0); add(new THREE.CylinderGeometry(0.105, 0.105, 0.012, 16), mat(0x56595c, 0.4), 0, 0.126, 0); }
  else if (kind === 'spoon') { add(new THREE.CylinderGeometry(0.008, 0.01, 0.22, 8), mat(0xb08a56, 0.7), 0, -0.07, 0); add(new THREE.SphereGeometry(0.03, 10, 8), mat(0xb08a56, 0.7), 0, -0.19, 0).scale.set(0.8, 0.35, 1.2); }
  else if (kind === 'camera') {   // a gas-station disposable: yellow card wrap, black lens, the flash window and the winder on top
    add(new THREE.BoxGeometry(0.115, 0.062, 0.036), mat(0xe2b52a, 0.55), 0, 0.031, 0);
    add(new THREE.BoxGeometry(0.117, 0.03, 0.038), mat(0x1c1c1e, 0.5), 0, 0.016, 0);
    add(new THREE.CylinderGeometry(0.015, 0.017, 0.012, 16), mat(0x101012, 0.25), 0.012, 0.034, 0.022).rotation.x = Math.PI / 2;
    add(new THREE.BoxGeometry(0.03, 0.016, 0.004), mat(0xf2efe6, 0.2), -0.035, 0.048, 0.019);
    add(new THREE.CylinderGeometry(0.009, 0.009, 0.008, 12), mat(0x2a2a2a, 0.6), 0.04, 0.066, -0.006);
  }
  else { add(new THREE.BoxGeometry(0.16, 0.12, 0.12), mat(0xb98a5a, 0.8), 0, 0.06, 0); }
  return g;
}
const bodyH = (who) => who.group.userData.h || 1.75;
export const bscale = (who) => bodyH(who) / 1.75;              // the distances below are written for a 1.75 m body
const palmAt = (who, side) => who.rig ? who.palm(side, new V3()) : who.group.localToWorld(new V3(side === 'L' ? 0.25 : -0.25, 0.9, 0.2));
const facing = (who) => { const y = who.group.rotation.y; return { fwd: new V3(Math.sin(y), 0, Math.cos(y)), left: new V3(Math.cos(y), 0, -Math.sin(y)) }; };
// how a thing sits in a hand that holds it from above: its origin `down` below the palm (its height), and how far the fingers close on it
export const HOLD = { mug: { down: 0.09, grip: 0.7 }, plates: { down: 0.065, grip: 0.45 }, books: { down: 0.13, grip: 0.5 }, pot: { down: 0.135, grip: 0.55 }, crate: { down: 0.12, grip: 0.5 } };
const kneeling = { kneel: 1, lean: 1.1 };               // down on one knee over a box on the floor
const bodyMix = (a, b, k) => ({ lean: lerp(a.lean || 0, b.lean || 0, k), kneel: lerp(a.kneel || 0, b.kneel || 0, k), squat: lerp(a.squat || 0, b.squat || 0, k) });
const boxTop = (box) => box.position.y + box.geometry.parameters.height / 2;
// a hand's place on the near rim of a box (s = 1 toward who's left corner, -1 the right); the box stands square to who
function rim(who, box, s) {
  const { fwd, left } = facing(who), p = box.geometry.parameters, r = box.position.clone(); r.y = boxTop(box) + 0.01;
  return r.addScaledVector(fwd, -(p.depth / 2 - 0.03)).addScaledVector(left, s * (p.width / 2 - 0.1));
}
const onRim = (who, box, s) => ({ reach: rim(who, box, s), palm: 'down', grip: 0.5 });
// a box against the chest: its back face just off the shirt (the chest and the vest come about 0.2 m forward at that height), the elbows bent
export const carryPos = (who, box) => new V3(0, 1.05 * bscale(who), 0.21 * bscale(who) + (box && box.geometry.parameters ? box.geometry.parameters.depth / 2 : 0.23) + 0.01);

// take the box that sits at `at` (its centre, in the scene) in both hands and bring it to the chest; the hands land on its sides first, then it moves with them
async function liftBox(who, box, at, lean = 0.25) {
  const run = chore.run, hw = box.geometry.parameters.width;
  if (box.parent !== scene) scene.attach(box);
  box.position.copy(at); box.rotation.set(0, who.group.rotation.y, 0); box.visible = true;
  who.pose = { hold: box, holdW: hw, lean };
  await htween(who, 0.5, () => {});
  if (!stillOn(run)) return false;
  who.group.attach(box); const p0 = box.position.clone(), p1 = carryPos(who, box); box.rotation.set(0, 0, 0);
  await htween(who, 0.8, (k) => { if (!stillOn(run)) return; box.position.lerpVectors(p0, p1, k); who.pose = { hold: box, holdW: hw, lean: lean * (1 - k) }; });
  if (!stillOn(run)) return false;
  who.pose = { hold: box, holdW: hw }; sfx.thump(0.4);
  return true;
}
// kneel and set the carried box on the floor at spot (straight ahead), the hands sliding up to its top edges as it goes down; who stays kneeling over it
async function setDown(who, box, spot) {
  const run = chore.run, hw = box.geometry.parameters.width, p0 = box.position.clone(), end = who.group.worldToLocal(spot.clone()); end.y = box.geometry.parameters.height / 2;
  await htween(who, 1.3, (k) => { if (!stillOn(run)) return; who.pose = { hold: box, holdW: hw, holdY: lerp(-0.03, 0.12, k), kneel: k, lean: kneeling.lean * k }; box.position.lerpVectors(p0, end, k); });
  if (!stillOn(run)) return false;
  scene.attach(box); box.position.set(spot.x, end.y, spot.z); box.rotation.set(0, who.group.rotation.y, 0); sfx.thump();
  W.colliders.push({ minX: spot.x - 0.3, maxX: spot.x + 0.3, minZ: spot.z - 0.3, maxZ: spot.z + 0.3, on: true, dressing: true });
  who.pose = { ...kneeling, hold: box, holdW: hw, holdY: 0.12 };
  return true;
}
// up from a kneel or a squat, the hands coming off whatever they were on
async function rise(who, from = kneeling) {
  const run = chore.run;
  await htween(who, 0.8, (k) => { if (stillOn(run)) who.pose = bodyMix(from, {}, k); });
  if (stillOn(run)) who.pose = null;
}
// one hand goes into the open box and comes out holding a new thing of this kind, lifted clear of the rim; `other` is the free hand's spec, `body` the lean/kneel
async function takeOut(who, box, kind, side, other, body) {
  const run = chore.run, hs = HOLD[kind] || HOLD.crate, { fwd } = facing(who), top = boxTop(box);
  const inside = box.position.clone().addScaledVector(fwd, -0.04); inside.y = top - 0.06;
  const over = box.position.clone().addScaledVector(fwd, -0.12); over.y = top + 0.2;
  const hand = (p, grip) => ({ ...body, ...other, [side]: { reach: p, palm: 'down', grip } });
  const from = palmAt(who, side);
  await htween(who, 0.55, (k) => { if (stillOn(run)) who.pose = hand(from.clone().lerp(inside, k), 0.3); });
  if (!stillOn(run)) return null;
  const th = makeThing(kind); scene.add(th); dressing.push(th); who.grab(th, side, { down: hs.down });   // it was in the box; now it is in the hand
  await htween(who, 0.45, (k) => { if (stillOn(run)) who.pose = hand(inside.clone().lerp(over, k), hs.grip); });
  return stillOn(run) ? th : null;
}
// the thing in this hand goes down onto `dest` (a point on a floor or a counter) and is let go there, with a short settle; the body eases from body0 to body1 on the way
async function putDown(who, th, kind, dest, side, other, body0, body1 = body0) {
  const run = chore.run, hs = HOLD[kind] || HOLD.crate, from = palmAt(who, side), landing = dest.clone(); landing.y += hs.down + 0.01;
  const hand = (p, body, grip) => ({ ...body, ...other, [side]: { reach: p, palm: 'down', grip } });
  await htween(who, 0.7, (k) => { if (!stillOn(run)) return; const p = from.clone().lerp(landing, k); p.y += Math.sin(k * Math.PI) * 0.06; who.pose = hand(p, bodyMix(body0, body1, k), hs.grip); });
  if (!stillOn(run)) return false;
  scene.attach(th); const p0 = th.position.clone(), q0 = th.quaternion.clone(), q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, who.group.rotation.y + (Math.random() - 0.5) * 0.6, 0));
  await htween(who, 0.15, (k) => { if (!stillOn(run)) return; th.position.lerpVectors(p0, dest, k); th.quaternion.slerpQuaternions(q0, q1, k); who.pose = hand(landing, body1, hs.grip * (1 - 0.6 * k)); });
  if (!stillOn(run)) return false;
  th.position.copy(dest); th.quaternion.copy(q1); sfx.thump(0.3);
  return true;
}
// kneeling over a box on the floor with both hands on its top edges: open it and take the things out one by one, each set down on the floor beside it
async function unpackFloor(who, box, kinds) {
  const run = chore.run, open = box.userData.open || (box.userData.open = openable(box)), bs = bscale(who);
  await htween(who, 0.7, (k) => { if (stillOn(run)) { open(k); who.pose = { ...kneeling, L: onRim(who, box, 1), R: onRim(who, box, -1) }; } });
  for (let i = 0; i < kinds.length; i++) {
    if (!stillOn(run)) return false;
    const side = i % 2 ? 'L' : 'R', sg = side === 'L' ? 1 : -1, other = { [side === 'L' ? 'R' : 'L']: onRim(who, box, -sg) };
    const dest = who.group.localToWorld(new V3(sg * 0.46 * bs, 0, 0.42 * bs)); dest.y = who.group.position.y;
    const th = await takeOut(who, box, kinds[i], side, other, kneeling);
    if (!th) return false;
    if (!(await putDown(who, th, kinds[i], dest, side, other, kneeling, { kneel: 1, lean: 1.3 }))) return false;
  }
  await rise(who);
  return stillOn(run);
}

async function dadChores() {
  const run = chore.run, g = dad.group.position;
  dad.busy = true;
  for (let i = 0; stillOn(run) && !chore.stop && i < LIVING_SPOTS.length; i++) {
    const spot = LIVING_SPOTS[i], box = W.cardboardBox(0, 0, 0, 0.46, 0.4, 0.46, i % 4, 0, scene); box.visible = false; dressing.push(box);
    if (!(await walkTo(dad, i === 0 ? [RAMP_FOOT, TRUCK_PICK] : [DOOR_IN, DOOR_OUT, PORCH, RAMP_FOOT, TRUCK_PICK]))) return;   // back out through the front door, never through the wall
    await turnToward(dad, g.x, g.z - 1);
    if (!(await liftBox(dad, box, TRUCK_BOX))) return;   // the next box, off the top of the stack
    if (!(await walkTo(dad, [new V3(2.3, 0, -13.3), RAMP_FOOT, PORCH, DOOR_OUT, DOOR_IN, new V3(spot.x, 0, spot.z + 0.8 * bscale(dad))], 1.15))) return;
    await turnToward(dad, spot.x, spot.z);
    if (!(await setDown(dad, box, spot))) return;
    if (chore.stop) { await rise(dad); break; }   // this one stays packed: he is wanted in the kitchen
    const kinds = [['books', 'mug'], ['plates', 'books'], ['crate', 'books']][i % 3];   // nothing taller than the box is 0.4 m deep
    if (!(await unpackFloor(dad, box, kinds))) return;
    if (chore.stop) break;
  }
  if (!stillOn(run)) return;
  if (!(await walkTo(dad, [new V3(g.x, 0, Math.max(g.z, -3.6)), ARCH, ARCH_IN, DAD_HOME]))) return;
  await turnToward(dad, 0.6, 1.6, 0.6);
  chore.dadHome = true;
}
async function momChores() {
  const run = chore.run;
  mom.busy = true;
  const bs = bscale(mom), box = W.cardboardBox(KITCHEN_BOX.x, 0, KITCHEN_BOX.z, 0.55, 0.42, 0.5, 0, Math.PI / 2, scene); dressing.push(box);   // square to her: she comes at it from the west
  W.colliders.push({ minX: KITCHEN_BOX.x - 0.3, maxX: KITCHEN_BOX.x + 0.3, minZ: KITCHEN_BOX.z - 0.3, maxZ: KITCHEN_BOX.z + 0.3, on: true, dressing: true });
  const open = openable(box); box.userData.open = open;
  const things = ['plates', 'mug', 'pot', 'mug', 'plates', 'mug'];
  const stand = new V3(KITCHEN_BOX.x - 0.66 * bs, 0, KITCHEN_BOX.z), carry = new V3(-0.2 * bs, 0.95 * bs, 0.3 * bs);   // where she kneels at the box; where a thing rides in her right hand
  // down on one knee at the box, both hands to its rim
  const kneelAt = async (dur) => {
    await turnToward(mom, box.position.x, box.position.z, 0.4);
    await htween(mom, dur, (k) => { if (stillOn(run)) mom.pose = { ...bodyMix({}, kneeling, k), L: onRim(mom, box, 1), R: onRim(mom, box, -1) }; });
  };
  if (!(await walkTo(mom, [stand]))) return;
  await kneelAt(1.0);
  await htween(mom, 0.6, (k) => { if (stillOn(run)) open(k); });
  for (let i = 0; i < things.length && stillOn(run); i++) {
    const { at: [cx, cy, cz], stand: [sx, sz] } = COUNTER[i], kind = things[i], hs = HOLD[kind];
    const th = await takeOut(mom, box, kind, 'R', { L: onRim(mom, box, 1) }, kneeling);
    if (!th) return;
    // up on her feet with it, then to the counter
    const from = palmAt(mom, 'R');
    await htween(mom, 0.8, (k) => { if (stillOn(run)) mom.pose = { ...bodyMix(kneeling, {}, k), R: { reach: from.clone().lerp(mom.group.localToWorld(carry.clone()), k), palm: 'down', grip: hs.grip } }; });
    if (!stillOn(run)) return;
    mom.pose = { R: { reachLocal: carry, palm: 'down', grip: hs.grip } };
    if (!(await walkTo(mom, [new V3(sx, 0, sz)], 1.1))) return;
    await turnToward(mom, cx, cz, 0.4);
    if (!(await putDown(mom, th, kind, new V3(cx, cy, cz), 'R', {}, {}, { lean: 0.3 }))) return;
    mom.pose = null;
    if (i < things.length - 1) { if (!(await walkTo(mom, [stand]))) return; await kneelAt(0.8); }
  }
  while (stillOn(run)) {   // wipe the counter until the chores are cancelled
    const t0 = main.gameTime;
    if (!(await walkTo(mom, [EVE_MOM]))) return;
    await turnToward(mom, 2.8, 2.25, 0.4);
    while (stillOn(run)) { const t = main.gameTime - t0; mom.pose = { lean: 0.3, R: { reach: new V3(4.04, 0.96, 3.16 + Math.sin(t * 2.2) * 0.3), palm: 'down', grip: 0.4 } }; await wait(0.03); if (t > 30) break; }
  }
}
function startChores() {
  chore.run++; chore.stop = false; chore.dadHome = false;
  for (const o of dressing) { if (o.parent) o.parent.remove(o); } dressing.length = 0;
  for (let i = W.colliders.length - 1; i >= 0; i--) if (W.colliders[i].dressing) W.colliders.splice(i, 1);
  for (const p of [mom, dad]) { p.busy = false; p.pose = null; }
  dadChores(); momChores();
}
export function endChores() {
  chore.run++;
  for (const p of [mom, dad]) { p.busy = false; p.pose = null; }
}

export async function dayScript() {
  F.stage = 'day'; setPhase('day');
  P.pos.set(3.1, 0, -9.0); P.yaw = Math.PI; P.pitch = 0.02; P.mode = 'walk';
  mom.group.position.set(1.77, 0, 2.43); mom.group.rotation.y = -Math.PI / 2;
  dad.group.position.set(4.3, 0, -13.4); dad.group.rotation.y = -0.5;
  await wait(0.3);
  UI.fade(0, 2.5); UI.card('Saturday', 'Moving day', 3.5);
  F.birds = true;
  await wait(2.6);
  speak('dad/welcome');
  startChores();
  UI.objective('Carry your boxes to your room <span>0 / 3</span>');
  UI.hint(`<b>${L('move')}</b> move &nbsp;·&nbsp; <b>${L('sprint')}</b> sprint &nbsp;·&nbsp; <b>${L('interact')}</b> interact`, 8);
  dayStrange();
  await waitFor(() => F.boxes >= 3);
  chore.stop = true;   // Dad finishes the box he is carrying, then walks to the kitchen on his own
  await wait(0.8);
  UI.subtitle(FN.box.mesh.visible ? "<i>That's three. ...There are four.</i>" : "<i>That's the last one.</i>", 3.5);
  UI.objective('Find Mom in the kitchen');
  F.momReady = true;
  await waitFor(() => F.talkedMom);
  if (!chore.dadHome) UI.hint('Dad is still carrying his box in', 4);
  await waitFor(() => chore.dadHome);
  endChores();
  F.cutscene = true; P.vel.set(0, 0, 0);
  faceParent(mom);
  UI.objective(null);
  F.talkCam = true;   // the view follows whoever is talking
  await say('mom/helper');
  if (FN.box.mesh.visible) { await say('you/box4'); await say('dad/box4'); }
  await cameraGift(); await say('mom/landlord'); await say('dad/cheap'); await say('dad/leftovers'); await say('mom/teeth');
  UI.fade(1, 2.5); await wait(3);
  F.talkCam = false; F.birds = false; F.cutscene = false; endChores();
  FN.box.hide(); box4Col.on = false;   // Dad carries it out to the road after dinner
  RUN.dayDone = true; saveRun();
  await bedtime();
}

// ---------- bedtime: Dad says goodnight at your door and pulls it almost shut, you fall asleep, and you dream the cartoon ----------
export async function bedtime() {
  const kd = W.doors.kid, door = new V3(kd.mid.x, 0, kd.mid.z);
  setPhase('night', true); lights.set('hall', true, { silent: true });   // the hall light on, warm; your room dark
  main.nlBase = 0.12; nlMult(main.nlBase, false);   // the plug-in night lights barely show under the hall light (night one puts them back)
  kd.a = kd.target = 1; kd.apply();
  // you: on your back, the pillow under your head, turned toward the door
  main.lieYaw = Math.atan2(-(door.x - LIE.x), -(door.z - LIE.z));
  P.cam.copy(LIE); P.pos.set(BUNK_SEAT.x, 0, BUNK_SEAT.z); P.yaw = main.lieYaw; P.pitch = -0.14; P.roll = 0.1; P.pod = null; P.mode = 'lie';
  F.cutscene = false; UI.objective(null); UI.hint(null); sfx.ambience(0.8, 1);
  // Dad, in his night things, comes up the hall from the living-room end
  dad.sleeping = false; dad.busy = true; dad.pose = null; dad.lookAt = null; dad.group.rotation.order = 'XYZ'; dad.group.rotation.set(0, Math.PI / 2, 0);
  dad.group.position.set(5.4, 0, -0.42); dad.group.visible = true; dad.setNight(true); if (dad.rig) dad.rig.play('idle', { fade: 0, speed: 1 });
  UI.fade(0, 2.5); await wait(1.2);
  const spot = new V3(door.x + 0.06, 0, door.z + 0.45);   // a step into your room, beside the open door
  await walkTo(dad, [new V3(door.x - 0.4, 0, -0.42), new V3(door.x + 0.1, 0, -0.42), new V3(door.x + 0.08, 0, door.z - 0.1), spot], 1.05);
  await turnToward(dad, LIE.x, LIE.z, 0.55);
  dad.lookAt = camera.position;
  await wait(0.5);
  await say('dad/goodnight');
  await wait(0.4);
  // he turns to the door, takes the knob and draws it to, almost shut: a hand's width of hall light left. He keeps an arm's length from
  // the leaf the whole way, so he backs out of the room into the hall as it swings
  // (the left hand on the knob; the right rests by his hip)
  const hand = (p, k) => ({ lean: 0.1 * k, L: { reach: p, palm: 'in', grip: 0.7 * k }, ...(k > 0.05 ? { R: { reachLocal: new V3(-0.12, 0.93, 0.1), palm: 'in', grip: 0.35 } } : {}) });
  dad.lookAt = null;
  { const s0 = atKnob(kd), g0 = dad.group.position.clone(), y0 = dad.group.rotation.y, from = palmAt(dad, 'L');
    await htween(dad, 0.9, (k) => { dad.group.position.lerpVectors(g0, s0.stand, k); dad.group.rotation.y = lerpAngle(y0, s0.yaw, k); dad.pose = hand(from.clone().lerp(knobOf(kd), k), k); }); }
  const a0 = kd.a, a1 = 0.32;   // he lets go here, and it drifts the last bit on its own
  sfx.pick('door_creak', { at: { x: door.x, y: 1.2, z: door.z }, gain: 0.3, wet: 0.15, rate: 0.8 });
  await htween(dad, 2.6, (k) => {
    kd.a = kd.target = lerp(a0, a1, k); kd.apply();
    const s1 = atKnob(kd); dad.group.position.copy(s1.stand); dad.group.rotation.y = s1.yaw; dad.pose = hand(s1.knob, 1);
  }, ease.inOut);
  { const k0 = knobOf(kd), g0 = dad.group.position.clone(), back = new V3(door.x + 0.05, 0, door.z - 0.55);
    await htween(dad, 0.8, (k) => {
      kd.a = kd.target = lerp(0.32, 0.15, ease.out(k)); kd.apply();
      dad.group.position.lerpVectors(g0, back, k); dad.pose = hand(k0.clone().lerp(new V3(dad.group.position.x + 0.22, 0.85, dad.group.position.z + 0.05), k), 1 - k);
    }); }
  sfx.pick('creak', { at: { x: door.x, y: 1.0, z: door.z }, gain: 0.12, wet: 0.1 });   // it stops short of the latch
  dad.pose = null;
  // and he goes back down the hall to bed
  await walkTo(dad, [new V3(door.x - 0.4, 0, -0.42), new V3(5.2, 0, -0.42)], 1.1);
  dad.busy = false; sleepers(true);
  // falling asleep: close your eyes when you like (or the day takes you)
  F.sleepy = true;
  { const t0 = main.gameTime; await waitFor(() => !F.sleepy || main.gameTime - t0 > 40); }
  F.sleepy = false; F.cutscene = true; UI.prompt(null);
  const c0 = P.cam.clone(), y0 = P.yaw, p0 = P.pitch, r0 = P.roll;
  sfx.ambience(0.25, 7);
  // settling: the head sinks into the pillow and rolls toward the door, a slow breath out
  sfx.breath(false, 0.12);
  await tween(2.2, (k) => { P.cam.lerpVectors(c0, LIE.clone().add(new V3(0, -0.045, 0)), k); P.yaw = lerpAngle(y0, main.lieYaw, k); P.pitch = lerp(p0, -0.04, k); P.roll = lerp(r0, 0.32, k); }, ease.inOut);
  // heavy blinks, each longer and slower than the last
  for (const [shut, hold, open, gap] of [[0.35, 0.25, 0.7, 1.6], [0.5, 0.6, 1.0, 1.8], [0.7, 1.1, 1.4, 1.5]]) {
    UI.fade(1, shut); await wait(shut + hold); UI.fade(0, open); sfx.breath(true, 0.06); await wait(open + gap);
  }
  UI.fade(1, 2.2); sfx.ambience(0, 2.5); await wait(2.6);
  // the dream
  if (settings.get('bedtimeCartoon') && !window.__noCartoon) {
    const prev = main.uiMode; main.uiMode = 'cartoon'; unlock(); for (const k in keys) keys[k] = false;
    const how = await cartoon.play({ firstTime: !RUN.cartoonSeen, skipLabel: input.scheme === 'pad' ? 'Start' : input.scheme === 'touch' ? 'SKIP' : 'Esc' });
    RUN.cartoonSeen = true; RUN.cartoon = how; saveRun();
    main.uiMode = prev === 'cartoon' ? 'playing' : prev; if (input.scheme === 'kb' && main.uiMode === 'playing') lock();
  }
  F.cutscene = false; P.roll = 0;
  F.doorCrack = true;   // night one keeps the crack he left
}
// the day's own wrongness, alongside the chores: the dog under your window, a fourth box in your room that nobody carried in, and pencil
// marks on the side of your closet. Nothing here is announced; it is there if you look
export function placeBox4() { FN.box.place(BOX4.x, BOX4.z, Math.PI - 0.35); box4Col.on = true; }
async function dayStrange() {
  FN.marks.place();
  // the neighbour's dog, right under your window: it goes for the house, then stops dead in the middle of a bark and backs off
  (async () => {
    await waitFor(() => (F.boxes >= 1 && roomAt(P.pos.x, P.pos.z) === 'bed') || F.stage !== 'day');   // only with you in your room, where the window is
    if (F.stage !== 'day') return;
    const w = W.windows.filter((x) => x.pane).map((x) => ({ x, p: x.pane.getWorldPosition(new V3()) })).find((o) => roomAt(o.p.x, o.p.z) === 'bed' || roomAt(o.p.x - 0.3, o.p.z) === 'bed' || roomAt(o.p.x, o.p.z + 0.3) === 'bed');
    const at = w ? w.p.clone() : new V3(10.8, 0, 3.0), out = w ? (w.x.alongX ? new V3(0, 0, -w.x.inside) : new V3(-w.x.inside, 0, 0)) : new V3(1, 0, 0);
    at.addScaledVector(out, 2.6); at.y = 0.45;
    await wait(0.6);
    let d = sfx.pick('dog_far', { at, gain: 1.1, wet: 0.05, ref: 2.5 }) || 2;
    await wait(d * 0.95);
    d = sfx.pick('dog_far', { at, gain: 1.15, wet: 0.05, ref: 2.5, dur: 1.15 }) || 1;   // cut off
    await wait(d + 2.2);
    at.addScaledVector(out, 12); sfx.pick('dog_far', { at, gain: 0.22, wet: 0.2, dur: 0.5, rate: 1.15 });   // far off, going
  })();
  // the fourth box: put down while you are out of the room, after your second
  await waitFor(() => F.boxes >= 2 || F.stage !== 'day');
  await waitFor(() => F.stage !== 'day' || roomAt(P.pos.x, P.pos.z) !== 'bed');
  if (F.stage === 'day' && F.boxes < 3) placeBox4();
}
// Mom's move-in present: a disposable camera from the gas station. She holds it out until you take it (or after a while
// puts it in your hand anyway); from then on it is yours (RUN.hasCamera)
async function cameraGift() {
  const bm = bscale(mom), cam = makeThing('camera'); scene.add(cam); cam.visible = false;
  const said = say('mom/gift_a');
  await wait(1.3);
  mom.pose = KPOSE.gift(bm);
  await wait(0.7);
  mom.grab(cam, 'R', GRIP.camera); cam.visible = true; cam.scale.setScalar(0.01);
  await tween(0.25, (k) => cam.scale.setScalar(Math.max(0.01, k)), ease.out);
  await said;
  F.giftTaken = false; F.cutscene = false; P.vel.set(0, 0, 0);
  const it = { obj: cam, r: 2.4, label: 'Take the camera', when: () => F.phase === 'day' && !F.giftTaken, act: () => { F.giftTaken = true; } };
  interacts.push(it); UI.objective('Take the camera');
  const t0 = main.gameTime; await waitFor(() => F.giftTaken || main.gameTime - t0 > 14);
  interacts.splice(interacts.indexOf(it), 1); UI.objective(null);
  F.giftTaken = true; F.cutscene = true; P.vel.set(0, 0, 0);
  if (cam.parent) cam.parent.remove(cam); mom.pose = null; sfx.click();
  RUN.hasCamera = true; saveRun();
  journal.night(1, 'poltergeist'); journal.note('n1', 'Mom gave me a camera from the gas station. 24 pictures.');
  hands.raiseCamera();
  await say('you/gift');
  later(0.6, () => hands.lowerCamera());
  await say('dad/gift'); await say('mom/gift_b');
}
