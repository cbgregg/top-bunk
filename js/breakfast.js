// The mornings: you wake up, walk to the table and sit down, and they talk to you while you look wherever you like; the kitchen's life
// before the talk, the chairs and the table, last night's photos, and the day talks (they stop what they are doing and turn to you).
// main.js hands over what the mornings read of it once, at boot, through bind(game).
import { bscale, makeThing, placeBox4 } from './day.js';
import * as story from './story.js';

// what the mornings read of main.js, set once by bind()
let THREE, V3, W, F, P, E, mom, dad, scene, camera, sfx, UI, nights, talkNow, addI, EYE, HIDE_YAW, tmp;
let wait, waitFor, later, tween, ease, lerp, lerpAngle, angDiff, clamp, say, setPhase, sleepers, resetNight, toBunk, panFor;
// and main.js's game clock, which changes under them, read through the getter bind() was given (main.gameTime)
let main = null;
let seatRay;   // set by bind(): it needs three and the camera

// main.js's boot() calls this once, before the modules install: the mornings' state, then your chair's Sit and the ray that finds a seat
export function bind(game) {
  main = game;
  ({ THREE, V3, W, F, P, E, mom, dad, scene, camera, sfx, UI, nights, talkNow, addI, EYE, HIDE_YAW, tmp,
    wait, waitFor, later, tween, ease, lerp, lerpAngle, angDiff, clamp, say, setPhase, sleepers, resetNight, toBunk, panFor } = game);
  // your chair's prompt (sitInChair)
  addI({ p: new V3(1.99, 0.75, 2.08), r: 2.3, label: 'Sit', when: () => F.breakfastWait && F.phase === 'morning', act: sitInChair });
  seatRay = new THREE.Raycaster(); seatRay.camera = camera;   // (sprites in the scene need a camera to be tested)
}
export function install(game) {}

export function faceParent(who) {
  who.head.getWorldPosition(tmp);
  const y0 = P.yaw, want = Math.atan2(-(tmp.x - P.pos.x), -(tmp.z - P.pos.z));
  tween(0.8, (k) => { P.yaw = lerpAngle(y0, want, k); P.pitch = lerp(P.pitch, 0.18, k); });
}

// ---------- the mornings: you wake up, walk to the table and sit down, and they talk to you; you look wherever you like ----------
// (lookAtPerson turns the view for the finale, which still frames its own shots)
export function lookAtPerson(who, dur = 0.75) {
  who.head.getWorldPosition(tmp);
  const cx = P.pos.x, cz = P.pos.z, y0 = P.yaw, p0 = P.pitch;
  const want = Math.atan2(-(tmp.x - cx), -(tmp.z - cz)), up = Math.atan2(tmp.y - EYE, Math.hypot(tmp.x - cx, tmp.z - cz));
  const over = angDiff(y0, want) * 0.12;   // overshoots a touch and settles
  return tween(dur, (k) => { P.yaw = y0 + angDiff(y0, want) * k + over * Math.sin(k * Math.PI) * 0.6; P.pitch = lerp(p0, clamp(up, -0.3, 0.45), k); }, ease.inOut);
}
// the morning talk: you are in your chair and look wherever you like; they look at whoever is talking (talkGaze) and at you. Stand up in
// the middle of it and they stop, and Mom asks you to sit back down
async function conversation(lines) {
  for (const step of lines) {
    await seated();
    if (typeof step === 'function') { await step(); continue; }
    const [who, key] = step, id = `${who}/${key}`;
    await say(id); await wait(who === 'you' ? 0.25 : 0.35);
  }
}
let askedToSit = 0;
async function seated() {
  if (P.mode === 'seat') return;
  await wait(1.2);
  if (P.mode !== 'seat' && main.gameTime - askedToSit > 12) { askedToSit = main.gameTime; await say('mom/sit'); }
  await waitFor(() => P.mode === 'seat' && seat && !seat.tween);
  await wait(0.6);
}
// a day talk: they stop whatever they are doing and turn to you; the camera stays where you stand and settles on their face
export async function talkTo(p, id) {
  if (p.talking) return;
  F.cutscene = true; P.vel.set(0, 0, 0); p.held = true; p.talking = true;
  const y0 = P.yaw, p0 = P.pitch;
  await tween(0.5, (k) => {
    p.head.getWorldPosition(tmp);
    const want = Math.atan2(-(tmp.x - P.pos.x), -(tmp.z - P.pos.z)), up = Math.atan2(tmp.y - EYE, Math.hypot(tmp.x - P.pos.x, tmp.z - P.pos.z));
    P.yaw = lerpAngle(y0, want, k); P.pitch = lerp(p0, clamp(up, -0.35, 0.4), k);
  }, ease.out);
  await say(id);
  p.held = false; p.talking = false; F.cutscene = false;
}
const MORN = {
  1: [['you', 'm1_a'], ['mom', 'm1_a'], ['you', 'm1_b'], ['dad', 'm1_a'], ['mom', 'm1_b']],
  2: [['you', 'm2_a'], ['mom', 'm2_a'], ['dad', 'm2_a'], ['mom', 'm2_b']],
  3: [['you', 'm3_a'], ['mom', 'm3_a'], ['dad', 'm3_a']],
  4: [['mom', 'm4_a'], ['dad', 'm4_a'], ['you', 'm4_a'], ['mom', 'm4_b']],
  5: [['dad', 'm5_a'], ['mom', 'm5_a'], ['dad', 'm5_b'], ['mom', 'm5_b']],
  6: [['mom', 'm6_a'], ['dad', 'm6_a'], ['mom', 'm6_b']],
  7: [['dad', 'm7_a'], ['you', 'm7_a'], ['mom', 'm7_a'], ['dad', 'm7_b']],
  8: [['mom', 'm8_a'], ['dad', 'm8_a'], ['mom', 'm8_b']],
  9: [['mom', 'm9_a'], ['dad', 'm9_a'], ['dad', 'm9_b'], ['mom', 'm9_b']],   // the kid's "one more night" is cut; Dad's reason to stay carries it
};
const TYPE_LINE = { thirst: ['mom', 't_thirst'], ring: ['dad', 't_ring'], static: ['dad', 't_static'], mimic: ['mom', 't_mimic'], blackout: ['dad', 't_blackout'], hunted: ['mom', 't_hunted'], paralysis: ['mom', 't_paralysis'], teddy: ['mom', 't_teddy'], parents: ['mom', 't_parents'], quiet: ['dad', 't_quiet'], car: ['mom', 't_car'] };
// the kitchen in the morning: Mom stirs a pan on the stove with a wooden spoon, her other hand on the counter; Dad stands at the
// sink with his coffee and takes a sip now and then. Both stop and turn when the talk starts; the mug stays in Dad's hand.
export const kitchen = { run: 0, things: [] };
// where they stand and what their hands do (the contact audit in tests/contacts.js runs these same poses)
export const KSPOT = { mom: [3.62, 2.16, Math.PI / 2], dad: [1.98, 3.62, Math.PI] };   // Mom a hand's width from the stove front, the pot on the burner by her right hand
// how each thing sits in a hand (grab's offsets): the spoon's handle against the palm, the mug's side in the hand (not the hand in the
// mug), the camera held out by its end, the fingers round it
export const GRIP = { spoon: { down: 0.03, out: 0.02 }, mug: { down: 0.045, out: 0.085 }, camera: { down: 0.03, out: 0.075 } };
export const KPOSE = {
  // the spoon goes round the pan, a slow oval at burner height, with a pause and a tap on the rim every few rounds
  // (the spoon's bowl in the brass pot on the right back burner; the other arm down at her side)
  stir: (t) => { const ph = t * 2.4, round = Math.floor(ph / (Math.PI * 2)) % 4 === 3, k = round ? 0.2 : 1;
    return { lean: 0.25, R: { reachLocal: new V3(-0.15 + Math.cos(ph) * 0.045 * k, 1.3 + (round ? 0.04 : 0), 0.67 + Math.sin(ph) * 0.035 * k), palm: 'down', grip: 0.75 } }; },
  sip: (lift, bd) => ({ R: { reachLocal: new V3(lerp(-0.1, -0.05, lift) * bd, lerp(1.08, 1.4, lift) * bd, lerp(0.34, 0.25, lift) * bd), palm: 'in', grip: 0.7 } }),
  mugLow: (bd) => ({ R: { reachLocal: new V3(-0.07 * bd, 1.0 * bd, 0.3 * bd), palm: 'in', grip: 0.7 }, L: { reachLocal: new V3(0.125 * bd, 0.98 * bd, 0.3 * bd), palm: 'in', grip: 0.5 } }),
  gift: (bm) => ({ R: { reachLocal: new V3(0.08 * bm, 1.08 * bm, 0.48 * bm), palm: 'in', grip: 0.5 } }),
};
export function kitchenLife() {
  const run = ++kitchen.run, t0 = main.gameTime, on = () => kitchen.run === run && F.stage.startsWith('b');
  for (const o of kitchen.things) if (o.parent) o.parent.remove(o); kitchen.things.length = 0;
  const spoon = makeThing('spoon'), mug = makeThing('mug'); scene.add(spoon, mug); kitchen.things.push(spoon, mug);
  mom.grab(spoon, 'R', GRIP.spoon); dad.grab(mug, 'R', GRIP.mug);
  mom.busy = dad.busy = true; kitchen.talking = false;
  let sipAt = 3 + Math.random() * 4, sip = 0;
  const loop = async () => {
    while (on()) {
      const t = main.gameTime - t0, bm = bscale(mom), bd = bscale(dad);
      if (!kitchen.talking) {
        // the spoon goes round the pan, a slow oval at burner height, with a pause and a tap on the rim every few rounds
        mom.pose = KPOSE.stir(t);
        // the mug rests at his chest; a sip lifts it to his mouth for a second
        if (t > sipAt && sip === 0) { sip = 1e-3; sipAt = t + 7 + Math.random() * 6; }
        let lift = 0;
        if (sip > 0) { sip += 0.016; const d = 2.2; lift = sip < 0.5 ? sip / 0.5 : sip < 1.5 ? 1 : Math.max(0, 1 - (sip - 1.5) / 0.6); if (sip > d) sip = 0; lift = lift * lift * (3 - 2 * lift); }
        dad.pose = KPOSE.sip(lift, bd);
      } else {
        // turned to you: the spoon is down on the counter, the mug held low in both hands
        if (spoon.parent !== scene) { scene.attach(spoon); spoon.position.copy(mom.group.localToWorld(new V3(0.1 * bm, 0.95 * bm, 0.5 * bm))); spoon.rotation.set(0, mom.group.rotation.y + 0.4, 0); }
        if (kitchen.seated) {   // at the table: the mug is down past his right hand (clear of where his hands rest and talk) and both have their hands free
          if (mug.parent !== scene) { scene.attach(mug); mug.position.copy(dad.group.localToWorld(new V3(-0.32, 0, 0.56))); mug.position.y = kitchen.tableY; mug.rotation.set(0, dad.group.rotation.y, 0); spoon.visible = false; }
          for (const p of [mom, dad]) if (!p.pose || !p.pose.sit) p.pose = { sit: 1, seat: p.seatAt || 0.46 };   // (seatOn set it, with where the hands rest)
        } else {
          mom.pose = null;
          dad.pose = KPOSE.mugLow(bd);
        }
      }
      await wait(0.03);
    }
    if (kitchen.run === run) { mom.pose = dad.pose = null; for (const o of kitchen.things) if (o.parent) o.parent.remove(o); kitchen.things.length = 0; }
  };
  loop();
}
export async function breakfast(n) {
  F.stage = 'b' + n; setPhase('morning'); resetNight();
  E.visible = false; F.chase = false;
  toBunk(); P.yaw = HIDE_YAW + 0.15; P.pitch = -0.12;
  sleepers(false); mom.group.visible = dad.group.visible = true; mom.busy = dad.busy = false;
  W.chairs.forEach((c, i) => W.moveChair(i, c.x, c.z, c.rot));   // the table as it should be, whatever the night did to it
  kitchenLife(); seatThem();   // they are already at the table when you come down
  if (n === 1) placeBox4();   // Dad put it out by the road last night. It is back by your bed
  F.birds = true;
  UI.card('6:58 AM', n === 1 ? 'Morning' : `Morning ${n}`, 3.5);
  await wait(2.2); UI.fade(0, 3); await wait(2.4);
  UI.subtitle(n === 1 ? '<i>You hardly slept.</i>' : n < 6 ? '<i>You did not sleep at all.</i>' : '<i>You are so tired it feels like a fever.</i>', 3.5);
  UI.objective('Breakfast');
  F.morningReady = true; F.breakfastWait = true;
  // Mom's face and arms follow how the run has gone: brushed off, then uneasy, then scared
  { const reg = REG(nights ? nights.proof.count() : 0); mom.mood = reg === 'high' || n >= 6 ? 'scared' : reg === 'mid' || n >= 3 ? 'uneasy' : null; }
  const murmur = kitchenMurmur();
  await waitFor(() => P.mode === 'seat' && seat && !seat.tween);
  murmur.stop(); UI.objective(null);
  await wait(0.9);
  const lines = [...(MORN[n] || MORN[3])];
  const tl = n >= 2 && nights && TYPE_LINE[nights.plan(n).type]; if (tl) lines.push(tl);
  const fresh = nights ? nights.proof.on(n) : []; if (fresh.length) lines.unshift(() => photoBeat(fresh));   // the photos first, then the usual talk
  await conversation(lines);
  await wait(1.2);
  UI.fade(1, 2.5); await wait(3);
  F.birds = false; F.cutscene = false; F.morningReady = false; F.breakfastWait = false;
  if (P.mode === 'seat') { P.mode = 'walk'; seat = null; }
  kitchen.run++; kitchen.seated = false; mom.pose = dad.pose = null; mom.mood = null; mom.sitNow = dad.sitNow = 0; for (const o of kitchen.things) if (o.parent) o.parent.remove(o); kitchen.things.length = 0;
  mom.group.visible = dad.group.visible = false;
}
// your chair: the east one, nearest the hall. Mom sits on your left and Dad on your right
const MY_CHAIR = 1;
export let seat = null;   // while you are in your chair: { yaw (facing the table), tween (sitting down) }
function tableMid() { const C = W.chairs || []; return C.reduce((a, c) => a.add(c.holder.getWorldPosition(new V3())), new V3()).multiplyScalar(1 / Math.max(1, C.length)); }
export function seatThem() {
  const C = (W.chairs || []).map((c, i) => ({ i, p: c.holder.getWorldPosition(new V3()) }));
  if (C.length < 3) return;
  const mid = tableMid(), mine = C[MY_CHAIR] || C[0];
  const dir = (c) => Math.atan2(c.p.x - mid.x, c.p.z - mid.z), side = (c) => Math.abs(Math.abs(angDiff(dir(mine), dir(c))) - Math.PI / 2);
  const [a, b] = C.filter((c) => c !== mine).sort((x, y) => side(x) - side(y));
  const toward = new V3(mid.x - mine.p.x, 0, mid.z - mine.p.z).normalize(), leftOf = (c) => new V3(c.p.x - mine.p.x, 0, c.p.z - mine.p.z).cross(toward).y > 0;
  const [mc, dc] = leftOf(a) ? [a, b] : [b, a];
  kitchen.talking = true; kitchen.seated = true; kitchen.tableY = topAt(mid.x, mid.z) ?? 0.78; mom.busy = dad.busy = false;
  seatOn(mom, mc.i, mid); seatOn(dad, dc.i, mid);
}
// sitting down: the view lowers into the chair at a kid's seated eye height, facing the table; nothing else moves
export function sitSpot() {
  const c = W.chairs[MY_CHAIR], p = c.holder.getWorldPosition(new V3()), mid = tableMid(), t = new V3(mid.x - p.x, 0, mid.z - p.z).normalize();
  return { eye: new V3(p.x + t.x * 0.04, seatHeight(c) + 0.62, p.z + t.z * 0.04), yaw: Math.atan2(-t.x, -t.z), back: new V3(p.x - t.x * 0.55, 0, p.z - t.z * 0.55) };
}
export async function sitInChair() {
  if (P.mode !== 'walk') return;
  const s0 = sitSpot(), from = camera.position.clone(), y0 = P.yaw, p0 = P.pitch;
  seat = { yaw: s0.yaw, tween: true, back: s0.back }; P.vel.set(0, 0, 0); P.cam.copy(from); P.mode = 'seat';
  sfx.scrape(panFor(tmp.set(s0.eye.x, 0.4, s0.eye.z))); later(0.6, () => sfx.creak(0.12, 0, 0));
  await tween(0.9, (k) => { P.cam.lerpVectors(from, s0.eye, k); P.cam.y = lerp(from.y, s0.eye.y, k) - Math.sin(k * Math.PI) * 0.04; P.yaw = lerpAngle(y0, s0.yaw, k * 0.85); P.pitch = lerp(p0, -0.12, k); }, ease.inOut);
  P.pos.set(s0.eye.x, 0, s0.eye.z); seat.tween = false;
}
export function standUp() {
  if (P.mode !== 'seat' || !seat) return;
  P.pos.copy(seat.back); P.mode = 'walk'; seat = null; sfx.scrape(panFor(tmp.set(P.pos.x, 0.4, P.pos.z)));
}
// before you sit down, the two of them talk under their breath at the table, heads together; it stops when you come in
function kitchenMurmur() {
  let on = true;
  (async () => {
    let turn = 0;
    while (on && F.breakfastWait) {
      await wait(2.5 + Math.random() * 3);
      if (!on || !F.breakfastWait) break;
      const near = Math.hypot(P.pos.x - 1.18, P.pos.z - 2.08) < 2.6; if (near) continue;
      const who = turn++ % 2 ? dad : mom, other = who === mom ? dad : mom, d = 1.6 + Math.random() * 1.6;
      const env = sfx.mumble(who === mom ? 'mom' : 'dad', d, { gain: 0.3, pan: panFor(who.head.getWorldPosition(tmp)) });
      who.talk(env, { to: other === mom ? 'mom' : 'dad', mood: 'uneasy' });
      talkNow.who = who === mom ? 'mom' : 'dad'; talkNow.to = other === mom ? 'mom' : 'dad'; talkNow.until = main.gameTime + d;
    }
  })();
  return { stop() { on = false; talkNow.until = 0; } };
}
// sit who on chair i, facing `toward` (the table's middle): the hips over the back half of the seat, at the seat's own height (found by
// dropping a ray onto the chair), so the thighs lie along it and the knees clear its front edge
const shown = (o) => { for (let n = o; n; n = n.parent) if (!n.visible) return false; return true; };
export function seatHeight(c) {
  const p = c.holder.getWorldPosition(new V3());
  seatRay.set(new V3(p.x, 0.8, p.z), new V3(0, -1, 0)); seatRay.far = 0.8;
  const hit = seatRay.intersectObject(c.holder, true).find((h) => h.point.y > 0.3 && h.point.y < 0.7);
  return hit ? hit.point.y : 0.46;
}
// the height of a table (or any top a hand can rest on, 0.55..0.9 m) straight down at x, z, or null: solid, visible meshes only (not the
// dust in the air, not a person or what they hold, not the hidden collision boxes)
function topAt(x, z) {
  scene.updateMatrixWorld();   // (things moved this frame, a chair put back, are not where the ray would look yet)
  seatRay.set(new V3(x, 1.2, z), new V3(0, -1, 0)); seatRay.far = 0.7;
  const people = (o) => { for (let n = o; n; n = n.parent) if (n === mom.group || n === dad.group) return true; return false; };
  const hit = seatRay.intersectObjects(scene.children, true).find((h) => h.object.isMesh && !h.object.isSkinnedMesh && !h.object.isInstancedMesh && shown(h.object) && !people(h.object) && h.point.y > 0.55 && h.point.y < 0.9);
  return hit ? hit.point.y : null;
}
export function seatOn(who, i, toward) {
  const c = W.chairs[i];
  const p = c.holder.getWorldPosition(new V3()), r = Math.atan2(toward.x - p.x, toward.z - p.z);
  who.group.position.set(p.x - Math.sin(r) * 0.07, 0, p.z - Math.cos(r) * 0.07); who.group.rotation.set(0, r, 0);
  who.seatAt = seatHeight(c);
  // the hands on the table when it is in reach: the first top found straight down in front of them, the hands just past its edge
  let rest = null;
  for (let d = 0.14; d <= 0.62 && !rest; d += 0.03) {
    const y0 = topAt(who.group.position.x + Math.sin(r) * d, who.group.position.z + Math.cos(r) * d);
    if (y0 !== null) { const s = bscale(who), y = y0 + 0.06, f = d + 0.01; rest = { L: new V3(0.12 * s, y, f), R: new V3(-0.12 * s, y, f), edge: d - 0.03 }; }   // (edge: how far in front of them the top begins)
  }
  // leaning in to the table (the more, the further its edge), so the hands reach the top with the elbows bent, not the arms out straight
  who.pose = { sit: 1, seat: who.seatAt, rest, lean: rest ? Math.min(0.26, 0.12 + Math.max(0, rest.L.z - 0.3) * 1.2) : 0 }; who.sitNow = 1;
}
// last night's photos go on the table one at a time; you say what each one is, and one of them answers. How they take it is the run's
// stance (js/story.js), the one the ending comes to: brushed off or blamed ('low'), one of them has seen it ('mid'), believed ('high').
// REG(stance) is a stance's register; REG(count) is the run's own stance had it that much proof (each photo on the table, in turn)
export const REG = (x) => story.register(typeof x === 'string' ? x : story.stance(undefined, { proof: +x || 0 }));
async function photoBeat(ids) {
  ids = ids.slice(-4); const total = nights.proof.count();
  UI.subtitle('<i>You put the photos on the table.</i>', 2.6); await wait(1.4);
  for (const [i, id] of ids.entries()) {
    UI.tablePhoto(nights.proof.photo(id), nights.proof.cap(id), i); sfx.click(); await wait(0.7);
    await say(`<b>You:</b> ${nights.proof.tell(id)}`); await wait(0.25);
    const reg = REG(total - (ids.length - 1 - i)), who = (i + kitchen.run) % 2 ? 'dad' : 'mom', ab = Math.floor(i / 2) % 2 ? 'b' : 'a';
    await say(`${who}/ph_${reg}_${ab}`); await wait(0.35);
    if (i < ids.length - 1) await seated();
  }
  await wait(0.4); UI.tablePhoto(null);
}
