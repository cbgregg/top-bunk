// The parents at night (design §5): the sleep simulation, the noise ledger, who gets up and what they find.
//
// In bed, every night: each of them turns over every 40-90 s (a 2.2 s roll onto a side and back, 6 cm across the bed, the quilt following
// the body), Dad's arm comes out onto the quilt once a night, Dad snores at the pillow until his room is lit, and on night eight Mom is
// not in the bed at all.
//
// The ledger, N (0..1 and past it, falling 0.02 a second): parents.noise(v, at) hears v from `at`, v x (1 with a line to their door, 0.45
// through the walls) / (1 + 0.12 d), d the distance to their sliding door. Every event's declared noise comes in through it (js/events.js),
// and the player's own: running near their door, a door, the TV, the phone ringing, a flashlight on their door, the hunt's steps.
//   0.35  a mutter through the door (the night-two and night-three pairs first), the light on behind it twenty seconds
//   0.6   Dad stirs (from night three): sits up and listens, lies back if it goes quiet
//   0.8   Dad gets up (from night three), takes his torch from the nightstand, slides the door and walks to where the loudest recent noise was
//   0.9   Mom gets up (from night five), with no light: to your door first, then through the house calling for you
// After a wake that parent's thresholds are x1.3 for the night, and before night seven nobody gets up twice. While a parent is up the
// parents and E resources are held and any beat with the thing in it has ended, so the parent always arrives after it has gone: the
// doors it opened and the chairs it moved stay, and you are found beside them. What they found goes in the night's record (woke[]), what
// they passed (proof, a house that has changed) in noticed[], the walk itself in the log ('dadWalk', 'momWalk').
//
// The tells, taught by seeing: the real Dad carries a torch and opens a door by its knob (his hand on it); the real Mom never carries a
// light and her search calls are her own (never the two lines the thing uses through her door on night one). The thing vanishes without
// a flicker when Dad's beam comes within four metres of it.
//
// The frame calls update(dt) through js/hooks.js (hooks.parents.update), main.js's sleepers() calls laid() whenever a night lays them
// down or the day gets them up, and install() puts Dad's torch on his nightstand through W.plugin.
import * as THREE from 'three';
import * as collide from './collide.js';
import * as log from './log.js';
import * as events from './events.js';
import * as story from './story.js';
import { roomAt } from './world.js';
import { NODES } from './nav.js';

const V3 = THREE.Vector3;
const OWNER = 'parents';
const TH = { mutter: 0.35, stir: 0.6, dad: 0.8, mom: 0.9 }, DECAY = 0.02, HARDER = 1.3;
const ROLL = 0.42, SHIFT = 0.03, ROLL_T = 2.2;     // a roll-over: how far onto a side, how far across the bed toward that side, how long it takes
const SPEED = { dad: 1.0, mom: 0.9 };               // a night walk, slower than the day's
const R_WALK = { dad: 0.3, mom: 0.28 };             // the body's circle while walking (the shoulders turn through a doorway)
const SEE = 9;                                      // how far a parent can see you in the dark house
const ESCORT_CAP = 44;                              // forty clock-minutes, in seconds of play
const MOM_HIDDEN = 40;                              // seconds of her search you stay hidden before she goes and sits on your bunk
// the mutters, in order: the two pairs from the walls of nights two and three, then the old ones at random
const MUTTERS = [['dad/n2_a', 'mom/n2_a'], ['mom/n3_a', 'dad/n3_a']];
const MUTTERS_OLD = [['dad/talk_a', 'mom/talk_a'], ['mom/talk_b', 'dad/talk_b'], ['dad/talk_c', 'mom/talk_c'], ['dad/mutter_a', 'mom/mutter_a'], ['mom/mutter_b', 'dad/mutter_b']];
// Mom's own search calls (never the two lines the thing calls through her door on night one, in her voice: that voice is its lure)
const MOM_CALLS = ['mom/n5_g', 'mom/n5_h'];
// the night types where the parents are part of the night's own scene (or nothing should wake them)
const QUIET_TYPES = new Set(['poltergeist', 'vigil', 'car', 'finale', 'parents']);

let G = null, LINES = {};
let T = 0, TOK = 0;
const WAIT = [];
// ---------- the ledger ----------
const LEDGER = { N: 0, entries: [], lastMutter: -99, mutterOff: 0, wasOver: false, polled: {} };
// ---------- the two of them ----------
const PAR = {};
const stats = { said: [], states: [], maxPen: 0, penAt: null, walks: 0, up: null, rolls: { mom: 0, dad: 0 }, armOuts: { mom: 0, dad: 0 }, eSeenWhileUp: false, firstGoal: null, enteredAt: null };
let DOOR = { x: -2.72, z: 1.14 };
let torch = null;   // { group, lens, light, home: { pos, quat }, on, held }

// ---------- a clock of its own, driven by the frame (a night that restarts drops whatever was waiting) ----------
function until(fn, maxSec = Infinity) { const tok = TOK, end = T + maxSec; return new Promise((res) => WAIT.push({ tok, fn, res, end })); }
const wait = (s) => until(() => false, s);
const sm = (k) => k * k * (3 - 2 * k);
function tween(dur, fn, e = sm) { const t0 = T; fn(0); return until(() => { const k = Math.min(1, (T - t0) / Math.max(1e-3, dur)); fn(e(k)); return k >= 1; }); }
function runWaiters() {
  for (let i = 0; i < WAIT.length; i++) {
    const w = WAIT[i]; let done = false, ok = true;
    if (w.tok !== TOK) { done = true; ok = false; }
    else { try { done = !!w.fn() || T >= w.end; } catch (e) { console.warn('parents: a wait failed', e); done = true; ok = false; } }
    if (done) { WAIT.splice(i--, 1); w.res(ok && w.tok === TOK); }
  }
}
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
const lerpAngle = (a, b, k) => a + angDiff(a, b) * k;
const cl = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- the game's pieces ----------
const F = () => G.F, P = () => G.P, W = () => G.W;
const night = () => (F().night || 0);
const playerPos = () => P().pos;
const inBunk = () => { const m = P().mode; return m === 'bunk' || m === 'lie' || (m === 'hide' && !P().pod); };
const inPod = () => P().mode === 'hide' && !!P().pod;
const outside = () => { const r = roomAt(P().pos.x, P().pos.z, P().pos.y); return r === 'out' || r === 'stoop' || r === 'garage' || r === 'laundry' || r === 'forest' || r === 'barn'; };
const los = (ax, az, bx, bz) => (G.hunter && G.hunter.los ? G.hunter.los(ax, az, bx, bz) : true);
const placed = (x, y, z) => ({ x, y, z });

// what a parent sees: you, in the open, with a line to you and within nine metres (never in your bunk or a closet)
function sees(par) {
  if (inBunk() || inPod() || P().mode === 'cine' || P().mode === 'car') return false;
  const g = par.p.group.position, p = playerPos(), d = Math.hypot(p.x - g.x, p.z - g.z);
  if (d > SEE || Math.abs((p.y || 0) - (g.y || 0)) > 1.2) return false;
  return los(g.x, g.z, p.x, p.z);
}

// ---------- voices ----------
// a line in a parent's voice, from where their head is: through the walls when there are walls between, with its words on screen
// (eyes: where the eyes rest after the line, when not on you)
function say(par, id, { muffle = null, to = 'you', gain = 1.25, eyes = null } = {}) {
  const sfx = G.sfx, head = par.p.head.getWorldPosition(new V3()), c = G.camera.position, d = Math.hypot(c.x - head.x, c.z - head.z);
  const seen = los(c.x, c.z, head.x, head.z), mf = muffle ?? !seen;
  let dur = 0;
  try { dur = sfx.play ? sfx.play('vo/' + id, { gain: gain / (1 + d * 0.1), pan: { at: placed(head.x, head.y, head.z) }, wet: mf ? 0.35 : 0.2, muffle: mf }) : 0; } catch (e) { dur = 0; }
  const l = LINES[id], text = l ? l.html.replace(/<[^>]+>/g, '') : id;
  if (!dur) dur = Math.max(1.4, 0.8 + text.length / 15);
  if (!mf && par.p.talk) { let env = null; try { env = sfx.envelope ? sfx.envelope('vo/' + id) : null; } catch (e) { env = null; } par.p.talk(env, { to, question: /\?\s*$/.test(text), eyesOn: eyes }); }
  if (l && G.UI && G.UI.subtitle) G.UI.subtitle(l.html, Math.max(2.4, dur + 0.6), 'speech');
  stats.said.push(id);
  return dur;
}
// a sound at a point of the house, through the library (every one of them placed)
function sound(key, at, o = {}) { try { return G.sfx.pick ? G.sfx.pick(key, { at, wet: 0.12, ...o }) : 0; } catch (e) { return 0; } }

// ---------- the ledger ----------
// v from `at` ({ x, z }; the player's position when none is given): what reaches the parents' door. Returns what it added.
export function noise(v, at = null, src = 'event') {
  if (!G || !(v > 0)) return 0;
  const p = at || playerPos(), x = p.x, z = p.z, y = p.y || 0;
  const d = Math.hypot(x - DOOR.x, z - DOOR.z), seen = y > -1 && los(x, z, DOOR.x + 0.45, DOOR.z);
  const add = v * (seen ? 1 : 0.45) / (1 + d * 0.12);
  LEDGER.N += add;
  LEDGER.entries.push({ v: add, raw: v, at: { x, z, y }, t: T, src });
  if (LEDGER.entries.length > 80) LEDGER.entries.shift();
  return add;
}
// where the loudest of the last minute's noises came from
function loudest(sec = 60) {
  let best = null; const acc = new Map();
  for (const e of LEDGER.entries) { if (T - e.t > sec) continue; const k = Math.round(e.at.x * 2) + ',' + Math.round(e.at.z * 2); const a = (acc.get(k) || { v: 0, at: e.at, src: e.src }); a.v += e.v; acc.set(k, a); }
  for (const a of acc.values()) if (!best || a.v > best.v) best = a;
  return best;
}
// the player's own noise, polled each frame
function pollNoise(dt) {
  const f = F(), W0 = W(), p = playerPos(), Q = LEDGER.polled;
  if (P().sprinting && Math.hypot(p.x - DOOR.x, p.z - DOOR.z) < 5) noise(0.05 * dt, p, 'run');
  // a door you opened or shut (you were beside it)
  for (const k in W0.doors) {
    const d = W0.doors[k], was = Q['door:' + k]; Q['door:' + k] = d.target;
    if (was !== undefined && was !== d.target && Math.hypot(p.x - d.mid.x, p.z - d.mid.z) < 2.2 && !anyUp()) noise(0.2, { x: d.mid.x, z: d.mid.z }, 'door:' + k);
  }
  // the TV on (and every ten seconds it stays on), the phone at each ring
  const tvOn = !!(W0.tvFx && W0.tvFx.on); Q.tvT = tvOn ? (Q.tvT ?? 0) - dt : undefined;
  if (tvOn && (Q.tvT === undefined || Q.tvT <= 0)) { noise(0.5, { x: 4.22, z: -3.04 }, 'tv'); Q.tvT = 10; }
  const ringing = !!(W0.phone && W0.phone.ringing); Q.ringT = ringing ? (Q.ringT ?? 0) - dt : undefined;
  if (ringing && (Q.ringT === undefined || Q.ringT <= 0)) { noise(0.5, W0.phone.pos || { x: -0.78, z: 1.64 }, 'phone'); Q.ringT = 4; }
  // a flashlight on their shut door
  Q.flashT = (Q.flashT || 0) - dt;
  if (f.flashOn && Q.flashT <= 0 && W0.doors.parents && W0.doors.parents.a < 0.1) {
    const c = G.camera.position, dd = Math.hypot(c.x - DOOR.x, c.z - DOOR.z);
    if (dd < 7 && G.gaze && G.gaze.facing && G.gaze.facing({ x: DOOR.x, z: DOOR.z }) > 0.92 && los(c.x, c.z, DOOR.x + 0.45, DOOR.z)) { noise(0.3, { x: DOOR.x + 0.3, z: DOOR.z }, 'flashlight'); Q.flashT = 6; }
  }
  // the hunt's heavy steps
  const H = G.hunter; if (H && H.state === 'hunt' && G.E.visible) noise(0.1 * dt, G.E.root.position, 'hunt');
}

// ---------- in bed ----------
function bedOf() { return W().bedSleepers; }
// a body's resting state in bed: on its back, rolled, the arm out, sitting up
// (each lies 2.5 cm further out than the bed's spot, toward their own edge: Dad's left, Mom's right)
const OUTWARD = { dad: 0.03, mom: -0.03 };
function bedState(par) {
  return { roll: par.roll, shift: par.shift + OUTWARD[par.who], sit: par.sit, toFoot: par.who === 'dad' ? 0.16 : 0.1 };
}
// the limbs under the quilt as capsules in the bed's frame, for the quilt to rise over (world.js bedSleepers.hull)
const CAPS = [['Pelvis', 'Pelvis', 0.13, null, 'hips'], ['Pelvis', 'Spine1', 0.13], ['Spine1', 'Spine2', 0.12], ['Spine2', 'Neck', 0.11], ['L_UpperArm', 'R_UpperArm', 0.06],
  ['L_Thigh', 'L_Calf', 0.075], ['L_Calf', 'L_Foot', 0.052], ['L_Foot', 'L_Toe0', 0.04], ['R_Thigh', 'R_Calf', 0.075], ['R_Calf', 'R_Foot', 0.052], ['R_Foot', 'R_Toe0', 0.04],
  ['L_UpperArm', 'L_Forearm', 0.052, 'L'], ['L_Forearm', 'L_Hand', 0.042, 'L'], ['L_Hand', 'L_Finger2', 0.032, 'L'], ['R_UpperArm', 'R_Forearm', 0.052, 'R'], ['R_Forearm', 'R_Hand', 0.042, 'R'], ['R_Hand', 'R_Finger2', 0.032, 'R']];
const _a = new V3(), _b = new V3();
function hullOf(par) {
  const out = new Float32Array(CAPS.length * 7);   // (a hips entry is a ball at the pelvis: sitting up, the trunk rising off it takes no quilt with it)
  return () => {
    const r = par.p.rig, bed = bedOf(); if (!r || !bed || !par.inBed) return null;
    let n = 0;
    const torsoOn = par.sit < 0.25, armsOn = par.sit < 0.2;
    for (const [a, b, rad, arm, hips] of CAPS) {
      const A = r.bones[a], B = r.bones[b]; if (!A || !B) continue;
      if (arm && (!armsOn || par.armOut[arm] > 0.02 || par.armUp[arm] > 0.02)) continue;   // an arm out lies on the quilt, not under it
      if (!arm && !hips && !/Thigh|Calf|Foot/.test(a) && !torsoOn) continue;               // sitting up, the quilt falls from the chest into the lap (the hips stay under it)
      A.getWorldPosition(_a); B.getWorldPosition(_b); bed.toLocal(_a); bed.toLocal(_b);
      out[n++] = _a.x; out[n++] = _a.y; out[n++] = _a.z; out[n++] = _b.x; out[n++] = _b.y; out[n++] = _b.z; out[n++] = rad;
    }
    return n === out.length ? out : out.subarray(0, n);
  };
}
// sitting up: the elbows out to the side, back toward the pillows and a little up (never down into the bed)
// (back: the way behind the trunk, flat: toward the pillows sitting up in bed, toward the bed's middle sat on its edge)
function elbowsOut(p, S, back) {
  const q = p.group.getWorldQuaternion(new THREE.Quaternion()), side = new V3(S === 'L' ? 1 : -1, 0, 0).applyQuaternion(q);
  side.y = 0; if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
  return side.normalize().multiplyScalar(0.9).addScaledVector(back, 0.35).add(new V3(0, 0.25, 0));
}
// the rest x of each rise across the bed (world.js) and the body's own x there now
const REST_X = { mom: 0.23, dad: -0.21 };
function bodyAcross(par) {
  const r = par.p.rig, bed = bedOf(); if (!r || !bed) return REST_X[par.who];
  const s1 = r.bones.Spine1 || r.bones.Pelvis; s1.getWorldPosition(_a); bed.toLocal(_a); return _a.x;
}
// a body laid back in bed by this module (main.js's sleepers lays both down at the start of a night)
function layBack(par) {
  const p = par.p, spot = W().parentsBed[par.who];
  p.sleeping = true; p.busy = true; p.gaze = null; p.lookAt = null; p.walking = 0;
  p.pose = { sleep: par.who === 'mom' ? 1 : -1, bed: par.bed };
  par.roll = 0; par.shift = 0; par.sit = 0; par.inBed = true;
  p.group.visible = true; p.inBed(spot, bedState(par));
  if (p.rig) p.rig.play('idle', { fade: 0.4, speed: 0.05 });
  const b = bedOf(); if (b) { b.one(par.who, true); b.shift(par.who, 0); b.torso(par.who, 0); }
}
function makePar(who) {
  const p = G[who];
  const par = { who, p, body: collide.body(who), st: 'asleep', mult: 1, woke: 0, rollT: 40 + Math.random() * 50, rollTo: 0, roll: 0, shift: 0, sit: 0, rolling: null,
    armOut: { L: 0, R: 0 }, armUp: { L: 0, R: 0 }, armOutT: Infinity, armDone: false, inBed: true, snoreT: 2, stirCool: 0, walk: null, look: new V3(), seq: 0, rec: null,
    bed: { keep: true, rest: true, arms: { L: null, R: null }, knee: { L: 0, R: 0 }, sit: 0, turn: undefined, awake: false } };
  // while they lie in bed, the bed's own box is their body (a lying body's circle would stand round its feet)
  if (par.body) { const vis = par.body.active; par.body.active = () => p.group.visible && !(par.inBed && p.sleeping) && (!vis || vis()); par.body.r0 = par.body.r; }
  return par;
}

// every frame, for a parent lying in bed: the roll-overs, the arm out, the snore, the quilt
function bedTick(par, dt) {
  const p = par.p, spot = W().parentsBed[par.who]; if (!spot || !par.inBed || !p.sleeping) return;
  const quilt = bedOf();
  if (par.swing) { if (quilt) { quilt.shift(par.who, bodyAcross(par) - REST_X[par.who]); quilt.torso(par.who, par.sit); } return; }   // getting out or in: the swing has the body
  const b = par.bed, still = (par.st === 'asleep' || par.st === 'light') && !(PAR.mom && PAR.mom.st === 'handoff');
  if (par.armOutT <= 0 && !par.armDone && Math.abs(par.roll) > 0.1 && !par.rolling) par.rollT = Math.min(par.rollT, 1.5);   // his arm is due: onto his back first
  // the roll-over: from the back onto a side (Dad toward the wall, Mom toward the door: their backs to each other) and back
  if (still && !par.rolling && par.sit < 0.01 && !(par.armOut.L + par.armOut.R)) {
    par.rollT -= dt;
    if (par.rollT <= 0) {
      const onSide = Math.abs(par.roll) > 0.1, to = onSide ? 0 : par.who === 'dad' ? ROLL : -ROLL;
      par.rolling = { t: 0, from: par.roll, to, s0: par.shift, s1: onSide ? 0 : Math.sign(to) * SHIFT };
      par.rollT = 40 + Math.random() * 50; stats.rolls[par.who]++;
      const at = p.head.getWorldPosition(new V3()); sound('cloth', placed(at.x, 0.75, at.z), { gain: 0.35 }); if (Math.random() < 0.5) sound('bed_creak', placed(at.x, 0.6, at.z), { gain: 0.25, delay: 0.3 });
    }
  }
  if (par.rolling) {
    const R = par.rolling; R.t += dt; const k = sm(Math.min(1, R.t / ROLL_T));
    par.roll = R.from + (R.to - R.from) * k; par.shift = R.s0 + (R.s1 - R.s0) * k;
    if (R.t >= ROLL_T) par.rolling = null;
  }
  // Dad's arm out onto the quilt, once a night, while he lies on his back; Mom's from under it once the house has split them
  if (still && par.armOutT < Infinity && !par.armDone) par.armOutT -= dt;
  if (still && par.armOutT <= 0 && !par.armDone && !par.armOutRun && !par.rolling && Math.abs(par.roll) < 0.05) {
    par.armOutRun = { t: 0, hold: 25 + Math.random() * 20 }; stats.armOuts[par.who]++;
    const at = p.head.getWorldPosition(new V3()); sound('cloth', placed(at.x, 0.75, at.z), { gain: 0.25 });
  }
  const side = par.who === 'dad' ? 'L' : 'R';   // the outer arm: Dad's left is the wall side, Mom's right the door side
  if (par.armOutRun) {
    const A = par.armOutRun; A.t += dt;
    par.armOut[side] = A.t < 1.6 ? sm(A.t / 1.6) : A.t < 1.6 + A.hold ? 1 : Math.max(0, 1 - sm((A.t - 1.6 - A.hold) / 1.6));
    if (A.t > 3.2 + A.hold) { par.armOutRun = null; par.armDone = true; par.armOut[side] = 0; }
  }
  // the pose: the side's knee drawn up and the arms placed when rolled; the arm out laid on the quilt beside the hip
  const sideK = Math.min(1, Math.abs(par.roll) / ROLL), down = par.roll > 0 ? 'L' : 'R', up = down === 'L' ? 'R' : 'L';
  b.rest = !par.rolling && sideK < 0.01 && par.sit < 0.01 && !(par.armOut.L + par.armOut.R);
  b.knee.L = b.knee.R = 0; b.knee[up] = 0.6 * sideK;
  // (the head stays as it lay on the pillow while the body turns under it: the neck takes the roll, so the skull never rolls down into
  // the pillow; on the back they face each other)
  b.turn = (par.who === 'mom' ? 1 : -1) - par.roll / 0.55;
  b.sit = par.sit; b.awake = par.st !== 'asleep';
  for (const S of ['L', 'R']) b.arms[S] = null;
  p.group.updateMatrixWorld(true);
  const s = (p.group.userData.h || 1.75) / 1.75, inner = par.who === 'dad' ? 'R' : 'L', q = p.group.getWorldQuaternion(new THREE.Quaternion());
  // where each hand goes in the group's frame, and which way its elbow. The hand on the side toward the other one rests on the stomach,
  // its elbow down toward the mattress (whichever way the body has turned: they turn away from each other, so that is never toward the
  // other one); the two of them would lie arm in arm otherwise. Rolled onto the outer side, the lower arm lies in front of the stomach,
  // its elbow in front of the body (not off the edge of the bed); on the back the outer arm is the clip's
  const sgOf = (S) => (S === 'L' ? 1 : -1), feet = new V3(0, -1, 0).applyQuaternion(q);
  for (const S of ['L', 'R']) {
    if (S === inner && par.sit < 0.02) {
      b.arms[S] = { at: p.group.localToWorld(new V3(sgOf(S) * 0.09, 0.97 * s, 0.15 * s)), w: 1, grip: 0.3, pole: new V3(0, -1, 0).addScaledVector(feet, 0.35) };
    } else if (sideK > 0.01 && S === down) b.arms[S] = { at: p.group.localToWorld(new V3(sgOf(S) * 0.06, 1.12 * s, 0.2 * s)), w: sideK, grip: 0.3, pole: new V3(0, -0.4, 0.9).applyQuaternion(q) };
    else if (sideK > 0.01) b.arms[S] = { at: p.group.localToWorld(new V3(sgOf(S) * 0.12, 0.95 * s, 0.17 * s)), w: sideK * 0.9, grip: 0.3, pole: new V3(0, -1, 0).addScaledVector(feet, 0.35) };
  }
  // sitting up: the hands on the lap, laid on the quilt over the thighs
  if (par.sit > 0.02 && p.rig && p.rig.bones.L_Thigh && quilt) {
    for (const S of ['L', 'R']) {
      const th = p.rig.bones[S + '_Thigh'], ca = p.rig.bones[S + '_Calf']; th.getWorldPosition(_a); ca.getWorldPosition(_b);
      const at = _a.clone().lerp(_b, 0.4), loc = quilt.toLocal(at.clone()); loc.y = Math.max(loc.y + 0.12, quilt.heightAt(loc.x, loc.z) + 0.07);
      b.arms[S] = { at: quilt.group.localToWorld(loc), w: Math.min(1, par.sit * 1.5), grip: 0.25, palm: new V3(0, -1, 0), pole: elbowsOut(p, S, new V3(-Math.sin(spot.yaw ?? Math.PI / 2), 0, -Math.cos(spot.yaw ?? Math.PI / 2))) };
    }
  }
  if (par.armOut[side] > 0.001) {
    const bed = bedOf(), r = p.rig;
    if (bed && r && r.bones.Pelvis) {
      r.bones.Pelvis.getWorldPosition(_a); const loc = bed.toLocal(_a.clone());
      const hx = loc.x + (side === 'L' ? -1 : 1) * (par.who === 'dad' ? 0.26 : 0.24), hz = loc.z + 0.12, hy = bed.heightAt(hx, hz) + 0.035;
      const at = bed.group.localToWorld(new V3(hx, hy, hz));
      b.arms[side] = { at, w: par.armOut[side], grip: 0.25, palm: new V3(0, -1, 0) };
    }
  }
  p.pose = p.pose && p.pose.sleep ? p.pose : { sleep: par.who === 'mom' ? 1 : -1 };
  p.pose.bed = b;
  p.inBed(spot, bedState(par));
  // the snore, at his pillow, while his room is dark and he is asleep on his back
  if (par.who === 'dad') {
    par.snoreT -= dt;
    if (par.snoreT <= 0) {
      par.snoreT = 4.2 + Math.random() * 0.8;
      const lit = G.lights && G.lights.isOn && G.lights.isOn('parents'), c = G.camera.position, h = p.head.getWorldPosition(new V3());
      if (par.st === 'asleep' && !lit && sideK < 0.5 && Math.hypot(c.x - h.x, c.z - h.z) < 14) sound('bed_snore', placed(h.x, h.y, h.z), { gain: 0.5, dur: 2.6, ramp: 0.6, rate: 0.97 + Math.random() * 0.06, ref: 1, roll: 1.2 });
    }
  }
  // the quilt follows the body across the bed, and rises over any limb that comes up under it
  const bed = bedOf(); if (bed) { bed.shift(par.who, bodyAcross(par) - REST_X[par.who]); bed.torso(par.who, par.sit); }
}

// ---------- the torch ----------
// Dad's own torch (a small plastic one: the kid's is Grandpa's): a short body, a wider head with a chrome bezel and a lens, a slide switch.
// It lies on his nightstand; on a night walk he carries it in his right hand and the house's one carried light (lights.js) comes out of it
function buildTorch(ctx) {
  const g = new THREE.Group(); g.name = 'dad torch';
  const plastic = new THREE.MeshStandardMaterial({ color: 0x1d2a44, roughness: 0.55, metalness: 0 });
  const grip = new THREE.MeshStandardMaterial({ color: 0x14161b, roughness: 0.85, metalness: 0 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xc9ccd2, roughness: 0.25, metalness: 1 });
  const lensM = new THREE.MeshStandardMaterial({ color: 0xe8e4d8, roughness: 0.1, metalness: 0, emissive: 0xfff0c8, emissiveIntensity: 0 });
  const add = (geo, m, z) => { const o = new THREE.Mesh(geo, m); o.rotation.x = Math.PI / 2; o.position.z = z; o.castShadow = true; g.add(o); return o; };
  // along +z: the tail cap, the body with a rubber grip, the head flaring to the bezel, the lens
  add(new THREE.CylinderGeometry(0.0165, 0.0165, 0.012, 16), plastic, -0.083);
  add(new THREE.CylinderGeometry(0.0158, 0.0158, 0.106, 16), plastic, -0.024);
  for (const z of [-0.05, -0.035, -0.02]) add(new THREE.CylinderGeometry(0.0168, 0.0168, 0.008, 16), grip, z);
  add(new THREE.CylinderGeometry(0.0235, 0.0165, 0.04, 18), plastic, 0.049);
  add(new THREE.CylinderGeometry(0.0245, 0.0245, 0.008, 20), chrome, 0.073);
  const lens = add(new THREE.CylinderGeometry(0.0205, 0.0205, 0.002, 20), lensM, 0.077);
  // the slide switch on top of the body
  const sw = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.005, 0.018), grip); sw.position.set(0, 0.0165, 0.01); g.add(sw);
  // on the nightstand: lying on its side beside the knick-knacks, the lens toward the bed (its rest; measured off the nightstand's box)
  const ns = ctx.colliders.find((c) => c.prop === 'nightstand' || c.id === 'nightstand') || ctx.colliders.find((c) => c.minX < -7.4 && c.maxX > -8.1 && c.minZ < 0.1 && c.maxZ > -0.6 && (c.maxY || 0) > 0.5 && (c.maxY || 0) < 0.7);
  const top = ns && ns.maxY ? ns.maxY : 0.6, x = ns ? ns.minX + (ns.maxX - ns.minX) * 0.66 : -7.66, z = ns ? ns.minZ + (ns.maxZ - ns.minZ) * 0.25 : -0.37;
  g.position.set(x, top + 0.0168, z); g.rotation.set(0, Math.PI / 2 + 0.35, 0);
  ctx.house.add(g); g.updateMatrixWorld(true);
  // carried, it is put in the hand again just before it is drawn: the hand is posed after this module's part of the frame
  let drawn = -1;
  g.traverse((o) => { if (o.isMesh) o.onBeforeRender = (renderer) => { const f = renderer.info.render.frame; if (f === drawn || !torch || !torch.held) return; drawn = f; torchFollow(PAR.dad, false); }; });
  return { group: g, lens, lensM, home: { parent: ctx.house, pos: g.position.clone(), quat: g.quaternion.clone() }, on: false, held: false };
}
function torchOn(on) {
  if (!torch) return;
  torch.on = on; torch.lensM.emissiveIntensity = on ? 2.2 : 0;
  const L = G.lights && G.lights.torch; if (L) { L.intensity = on ? 18 : 0; if (!on) { L.position.set(0, -50, 0); L.target.position.set(0, -60, 0); L.target.updateMatrixWorld(); } }
  if (torch.lens) sound('switch', torch.lens.getWorldPosition(new V3()), { gain: 0.3, maxLen: 0.4 });
}
// the torch in Dad's right hand: along the hand (wrist to knuckles), in the curl of the fingers a palm's flesh and its own radius out from
// the palm, and the light from its lens the way it points (the arm points it: aimTick)
const _q = new THREE.Quaternion(), _z = new V3(0, 0, 1);
function torchAxis() { return _z.clone().applyQuaternion(torch.group.quaternion); }
function torchFollow(par, light = true) {
  if (!torch || !torch.held) return;
  const p = par.p, r = p.rig; if (!r || !r.bones.R_Finger2) return;
  const nrm = new V3(), palm = p.palm('R', new V3(), nrm), H = r.bones.R_Hand.getWorldPosition(new V3()), K = r.bones.R_Finger2.getWorldPosition(new V3());
  const dir = K.sub(H).normalize();
  torch.group.position.copy(palm).addScaledVector(nrm, 0.027).addScaledVector(dir, 0.01);
  torch.group.quaternion.copy(_q.setFromUnitVectors(_z, dir)); torch.group.updateMatrixWorld(true);
  const L = G.lights && G.lights.torch;
  if (L && torch.on && light) {
    const lens = torch.lens.getWorldPosition(new V3());
    L.position.copy(lens).addScaledVector(dir, 0.02); L.target.position.copy(lens).addScaledVector(dir, 5); L.target.updateMatrixWorld();
  }
}
function torchHome() {
  if (!torch) return;
  torch.held = false; torch.home.parent.add(torch.group);
  torch.group.position.copy(torch.home.pos); torch.group.quaternion.copy(torch.home.quat); torch.group.updateMatrixWorld(true);
  if (torch.on) torchOn(false);
}
// the beam: a segment from the lens five metres along it
function beamNear(x, z) {
  if (!torch || !torch.on || !torch.held) return Infinity;
  const a = torch.lens.getWorldPosition(new V3()), dir = torchAxis(), b = a.clone().addScaledVector(dir, 5);
  const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz, t = l2 < 1e-6 ? 0 : cl(((x - a.x) * dx + (z - a.z) * dz) / l2, 0, 1);
  return Math.hypot(a.x + dx * t - x, a.z + dz * t - z);
}

// ---------- the route: a walkable grid of the ground floor, planned fresh for each leg ----------
const GRID = { x0: -8.3, z0: -4.7, x1: 11.6, z1: 6.6, s: 0.1 };
GRID.nx = Math.ceil((GRID.x1 - GRID.x0) / GRID.s); GRID.nz = Math.ceil((GRID.z1 - GRID.z0) / GRID.s);
const cellX = (i) => GRID.x0 + (i + 0.5) * GRID.s, cellZ = (j) => GRID.z0 + (j + 0.5) * GRID.s;
const toI = (x) => Math.floor((x - GRID.x0) / GRID.s), toJ = (z) => Math.floor((z - GRID.z0) / GRID.s);
// blocked cells for a circle of radius r: every box on the ground floor (the shut door strips left open: a parent opens a door),
// the leaves of open doors, the other parent standing
function occupancy(r, me) {
  const nx = GRID.nx, nz = GRID.nz, occ = new Uint8Array(nx * nz), s = GRID.s;
  const mark = (minX, maxX, minZ, maxZ, rr) => {
    const i0 = Math.max(0, toI(minX - rr)), i1 = Math.min(nx - 1, toI(maxX + rr)), j0 = Math.max(0, toJ(minZ - rr)), j1 = Math.min(nz - 1, toJ(maxZ + rr));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = cellX(i), z = cellZ(j), dx = Math.max(minX - x, 0, x - maxX), dz = Math.max(minZ - z, 0, z - maxZ);
      if (dx * dx + dz * dz < rr * rr) occ[j * nx + i] = 1;
    }
  };
  for (const c of W().colliders) {
    if (c.door || !collide.active(c) || !collide.onFloor(c, 0, 1.8)) continue;
    if (c.maxX < GRID.x0 || c.minX > GRID.x1 || c.maxZ < GRID.z0 || c.minZ > GRID.z1) continue;
    if (c.maxX - c.minX > 40 || c.maxZ - c.minZ > 40) continue;   // a boundary round the whole yard
    mark(c.minX, c.maxX, c.minZ, c.maxZ, r);
  }
  for (const k in W().doors) {
    const d = W().doors[k], seg = collide.leafOf(d); if (!seg || (d.y0 || 0) < -1) continue;
    if (d.a < 0.08 && !d.slide) continue;   // a shut hinged leaf lies in its strip, which a parent opens
    if (d.slide && d.a < 0.08) continue;
    const rr = r + seg.t, L = Math.hypot(seg.bx - seg.ax, seg.bz - seg.az), n = Math.max(2, Math.ceil(L / 0.05));
    for (let q = 0; q <= n; q++) { const x = seg.ax + (seg.bx - seg.ax) * q / n, z = seg.az + (seg.bz - seg.az) * q / n; mark(x, x, z, z, rr); }
  }
  for (const b of collide.bodies) {
    if (b === me || b.kind !== 'npc' || (b.active && !b.active())) continue;
    mark(b.pos.x, b.pos.x, b.pos.z, b.pos.z, r + b.r);
  }
  void s;
  return occ;
}
function freeNear(occ, x, z, maxR = 1.2) {
  const i0 = toI(x), j0 = toJ(z), nx = GRID.nx, nz = GRID.nz;
  if (i0 >= 0 && j0 >= 0 && i0 < nx && j0 < nz && !occ[j0 * nx + i0]) return [i0, j0];
  const R = Math.ceil(maxR / GRID.s); let best = null, bd = Infinity;
  for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) {
    const i = i0 + di, j = j0 + dj; if (i < 0 || j < 0 || i >= nx || j >= nz || occ[j * nx + i]) continue;
    const d = di * di + dj * dj; if (d < bd) { bd = d; best = [i, j]; }
  }
  return best;
}
function astar(occ, a, b) {
  const nx = GRID.nx, n = nx * GRID.nz, g = new Float32Array(n).fill(Infinity), from = new Int32Array(n).fill(-1), closed = new Uint8Array(n);
  const start = a[1] * nx + a[0], goal = b[1] * nx + b[0];
  const heap = [], push = (k, f) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top[1]; };
  const hx = b[0], hz = b[1], h = (k) => { const dx = Math.abs((k % nx) - hx), dz = Math.abs(Math.floor(k / nx) - hz); return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz); };
  g[start] = 0; push(start, h(start));
  const N8 = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  while (heap.length) {
    const k = pop(); if (closed[k]) continue; closed[k] = 1;
    if (k === goal) break;
    const i = k % nx, j = Math.floor(k / nx);
    for (const [di, dj, c] of N8) {
      const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= nx || jj >= GRID.nz) continue;
      const q = jj * nx + ii; if (occ[q] || closed[q]) continue;
      if (di && dj && (occ[j * nx + ii] || occ[jj * nx + i])) continue;   // no cutting a corner
      const ng = g[k] + c; if (ng < g[q]) { g[q] = ng; from[q] = k; push(q, ng + h(q)); }
    }
  }
  if (from[goal] < 0 && goal !== start) return null;
  const path = []; for (let k = goal; k >= 0; k = from[k]) { path.push(k); if (k === start) break; }
  return path.reverse().map((k) => ({ x: cellX(k % nx), z: cellZ(Math.floor(k / nx)) }));
}
function clearLine(occ, a, b) {
  const L = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(L / 0.04));
  for (let q = 0; q <= n; q++) { const x = a.x + (b.x - a.x) * q / n, z = a.z + (b.z - a.z) * q / n, i = toI(x), j = toJ(z); if (i < 0 || j < 0 || i >= GRID.nx || j >= GRID.nz || occ[j * GRID.nx + i]) return false; }
  return true;
}
// the straightest version of a grid path: each point is the furthest one the line from the last can reach
function pull(occ, path) {
  if (path.length <= 2) return path.slice(1);
  const out = []; let i = 0;
  while (i < path.length - 1) { let j = path.length - 1; while (j > i + 1 && !clearLine(occ, path[i], path[j])) j--; out.push(path[j]); i = j; }
  return out;
}
// the shut doors a line crosses (their strips), nearest first
function doorsOn(a, b) {
  const out = [];
  for (const k in W().doors) {
    const d = W().doors[k], c = d.col; if (!c || d.a > 0.3 || (d.y0 || 0) < -1) continue;
    let t0 = 0, t1 = 1; const dx = b.x - a.x, dz = b.z - a.z; let hit = true;
    for (const [o, dd, lo, hi] of [[a.x, dx, c.minX - 0.05, c.maxX + 0.05], [a.z, dz, c.minZ - 0.05, c.maxZ + 0.05]]) {
      if (Math.abs(dd) < 1e-9) { if (o < lo || o > hi) { hit = false; break; } continue; }
      let u = (lo - o) / dd, v = (hi - o) / dd; if (u > v) [u, v] = [v, u]; t0 = Math.max(t0, u); t1 = Math.min(t1, v); if (t0 > t1) { hit = false; break; }
    }
    if (hit) out.push({ d, t: t0 });
  }
  return out.sort((x, y) => x.t - y.t);
}
function plan(par, to) {
  const r = R_WALK[par.who] + 0.04, occ = occupancy(r, par.body), g = par.p.group.position;
  const a = freeNear(occ, g.x, g.z, 0.6), b = freeNear(occ, to.x, to.z, 1.5);
  if (!a || !b) return null;
  const path = astar(occ, a, b); if (!path) return null;
  const pts = pull(occ, [{ x: g.x, z: g.z }, ...path.slice(1)]);
  // the first shut door on the way: the route stops at it
  let prev = { x: g.x, z: g.z };
  for (let i = 0; i < pts.length; i++) { const on = doorsOn(prev, pts[i]); if (on.length) return { door: on[0].d, from: prev, occ }; prev = pts[i]; }   // (from: the side it is come to from)
  return { pts, occ };
}

// ---------- walking ----------
function walkAnim(par, on, speed = 1) {
  const p = par.p; if (!p.rig) return;
  if (on) { if (!par.walkingAnim) { p.rig.play('walk', { fade: 0.3, speed }); par.walkingAnim = true; } p.walking = speed; }
  else { if (par.walkingAnim) { p.rig.play('idle', { fade: 0.35, speed: 1 }); par.walkingAnim = false; } p.walking = 0; }
}
function stepWalk(par, dt) {
  const w = par.walk; if (!w || w.done !== null) return;
  const p = par.p, g = p.group.position, body = par.body;
  if (!body) { w.done = false; return; }
  body.r = R_WALK[par.who];
  const tgt = w.pts[w.i]; if (!tgt) { w.done = true; walkAnim(par, false); return; }
  const dx = tgt.x - g.x, dz = tgt.z - g.z, d = Math.hypot(dx, dz);
  if (d < 0.03) { w.i++; if (w.i >= w.pts.length) { w.done = true; walkAnim(par, false); } return; }
  // turn toward the next point; a big turn is made standing
  const want = Math.atan2(dx, dz), dy = angDiff(p.group.rotation.y, want);
  p.group.rotation.y += cl(dy, -3.2 * dt, 3.2 * dt);
  if (Math.abs(dy) > 1.1) { walkAnim(par, false); return; }
  const stepLen = Math.min(d, w.speed * dt * (1 - Math.min(0.6, Math.abs(dy) * 0.5)));
  const s = collide.sweepCircle(body, dx / d * stepLen, dz / d * stepLen);
  if (s.hit && s.t < 0.5) {
    walkAnim(par, false);
    if (s.hit.kind === 'player' || s.hit.kind === 'npc' || s.hit.kind === 'thing') { w.held += dt; par.gazeOn = 'you'; return; }   // you, in the way: he waits for you to move
    w.blocked += dt; if (w.blocked > 0.8) w.done = false;                                                                           // something new in the way: plan again
    return;
  }
  w.blocked = 0; walkAnim(par, true, w.speed / 1.25);
  w.stride += stepLen; if (w.stride > 0.72) { w.stride = 0; footstep(g); }
  // the route never enters anything: checked every step (the tests read the worst)
  const pr = collide.probe(g.x, g.z, body.r - 0.005, 0, body.h, body);
  if (pr.pen > stats.maxPen) { stats.maxPen = pr.pen; stats.penAt = { x: g.x, z: g.z, what: collide.describe(pr.hit) }; }
}
function footstep(g) {
  const c = G.camera.position, d = Math.hypot(c.x - g.x, c.z - g.z); if (d > 14) return;
  const room = roomAt(g.x, g.z, g.y || 0), tile = ['bath', 'kitchen', 'dining', 'laundry'].includes(room);
  sound(tile ? 'step_tile' : 'step_carpet', placed(g.x, 0.05, g.z), { gain: 0.5, ref: 1.2, roll: 1.1 });
}
// walk to a point: planned on the grid, a shut door on the way opened by its knob (the slide door by its pull), held while you stand in
// the way; false when the way could not be found or the night moved on
// (doors: false for the walk to a door's own knob, which never goes through another door first)
async function goTo(par, to, { speed = SPEED[par.who], near = 0.12, doors = true } = {}) {
  const tok = TOK;
  for (let tries = 0; tries < 6; tries++) {
    if (par.halt) return false;
    const g = par.p.group.position; if (Math.hypot(to.x - g.x, to.z - g.z) <= near) return true;
    const pl = plan(par, to); if (!pl) return false;
    if (pl.door) { if (!doors || !(await openDoor(par, pl.door, pl.from)) || tok !== TOK) return false; continue; }
    par.walk = { pts: pl.pts, i: 0, speed, done: null, held: 0, blocked: 0, stride: 0 };
    stats.walks++;
    const ok = await until(() => par.walk.done !== null || par.halt);
    if (!ok || tok !== TOK) return false;
    if (par.halt) { par.walk = null; walkAnim(par, false); return false; }
    if (par.walk.done) { par.walk = null; return true; }
    par.walk = null;
  }
  return false;
}
// a walk started while something else is watched for: done tells whether it has finished, stop() ends it where it is
function walking(par, to, o) {
  const w = { done: false, ok: false };
  w.p = goTo(par, to, o).then((v) => { w.done = true; w.ok = v; return v; });
  w.stop = async () => { if (w.done) return; par.halt = true; await w.p; par.halt = false; walkAnim(par, false); };
  return w;
}
async function turnTo(par, x, z, dur = 0.5) {
  const g = par.p.group, y0 = g.rotation.y, want = Math.atan2(x - g.position.x, z - g.position.z);
  if (Math.abs(angDiff(y0, want)) < 0.05) return true;
  return tween(dur, (k) => { g.rotation.y = lerpAngle(y0, want, k); });
}

// ---------- doors ----------
// the knob of a hinged door wherever the leaf has swung, and where someone stands to take it in the left hand (main.js knobOf/atKnob)
function knobOf(d, along = 0.72, off = 0.15) { const a = d.g.rotation.y; return new V3(d.hx + Math.cos(a) * along - Math.sin(a) * off, 0.98, d.hz - Math.sin(a) * along - Math.cos(a) * off); }
function atKnob(d, reach = 0.4) {
  const a = d.g.rotation.y, n = new V3(-Math.sin(a), 0, -Math.cos(a)), k = knobOf(d), right = new V3(n.z, 0, -n.x);
  const p = new V3(k.x + n.x * reach + right.x * 0.17, 0, k.z + n.z * reach + right.z * 0.17);
  if (p.z < d.mid.z + 0.25) p.x = Math.min(p.x, d.mid.x);
  return { knob: k, stand: p, yaw: Math.atan2(-n.x, -n.z) };
}
// the side of a door's wall line a point is on (the knob's own side for a hinged door is its hall face)
function sideOf(d, x, z) { const c = d.col, alongX = c.maxX - c.minX > c.maxZ - c.minZ; return alongX ? Math.sign(z - d.mid.z) : Math.sign(x - d.mid.x); }
// (from: a point on the side it is come to from, on the way: the door's wall line runs on past other rooms on both sides)
async function openDoor(par, d, from = null) {
  const tok = TOK, g = from || par.p.group.position, p = par.p;
  if (d.slide) {
    // the barn door: from inside their room the flush pull (near the leaf's shut edge), from the dining room the handle
    const inside = sideOf(d, g.x, g.z) < 0, c = d.col, pullZ = (c.minZ + 0.16), st = inside ? new V3(c.minX - 0.42, 0, pullZ + 0.17) : new V3(c.maxX + 0.45, 0, pullZ + 0.15);
    if (!(await goTo(par, st, { near: 0.08, doors: false })) || tok !== TOK) return false;
    await turnTo(par, inside ? st.x + 1 : st.x - 1, st.z, 0.4); if (tok !== TOK) return false;
    const pull = () => new V3(inside ? c.minX - 0.03 : c.maxX + 0.07, 1.08, d.hz - (d.slide.half - 0.16) + d.slide.open[1] * d.slide.travel * d.a);
    const pose = p.pose = { ...(p.pose || {}), L: { reach: pull(), palm: 'fwd', grip: 0.75 } };
    if (!(await wait(0.45))) return false;
    sound('doorknob', placed(pull().x, 1.08, pull().z), { gain: 0.35 });
    d.max = Math.min(d.max ?? 1, 0.85);   // opened only as far as the pull stays in reach of the opening (shut again from inside the same way)
    W().setDoor(d.name, true);
    if (!(await until(() => { pose.L.reach.copy(pull()); return d.a > 0.3; }, 1.2))) return false;
    p.pose = { ...p.pose, L: null }; delete p.pose.L;
    return until(() => d.a >= Math.min(d.max ?? 1, 1) - 0.02 || d.blocked, 2.5);
  }
  const k = atKnob(d);
  // on the side the leaf swings away from: stand at the knob (main.js's atKnob). On the side it swings toward: past the latch, beyond
  // the leaf's reach, the arm out to the knob, so the opening leaf comes round in front of him and never into him
  const here = sideOf(d, g.x, g.z), hall = sideOf(d, k.stand.x, k.stand.z);
  let st = k.stand, knob = k.knob;
  if (here !== hall) {
    const c = d.col, alongX = c.maxX - c.minX > c.maxZ - c.minZ, along = new V3(Math.cos(d.rotC), 0, -Math.sin(d.rotC)), n = alongX ? new V3(0, 0, here) : new V3(here, 0, 0);
    st = new V3(d.hx, 0, d.hz).addScaledVector(along, (d.w || 0.81) + 0.36).addScaledVector(n, 0.3);
    knob = new V3(d.hx, 0.98, d.hz).addScaledVector(along, 0.72).addScaledVector(n, 0.06);
  }
  if (!(await goTo(par, st, { near: 0.1, doors: false })) || tok !== TOK) return false;
  await turnTo(par, knob.x, knob.z, 0.4); if (tok !== TOK) return false;
  const pose = p.pose = { ...(p.pose || {}), L: { reach: knob.clone(), palm: 'fwd', grip: 0.85 } };
  if (!(await wait(0.4))) return false;
  sound('doorknob', placed(knob.x, 0.98, knob.z), { gain: 0.4 });   // the knob turning: a person's hand, never the house's
  W().setDoor(d.name, true);
  if (!(await until(() => { if (here === hall) pose.L.reach.copy(knobOf(d)); return d.a > 0.25; }, 0.8))) return false;
  delete p.pose.L;
  return until(() => d.a > 0.9 || d.blocked, 2.0);
}
async function shutSlide(par, d) {
  const tok = TOK, p = par.p, c = d.col;
  // from inside, the leaf's leading edge in the opening, taken in the left hand and pulled
  const st = new V3(c.minX - 0.45, 0, d.hz + d.slide.open[1] * d.slide.travel * d.a - d.slide.half + 0.12);
  if (!(await goTo(par, st, { near: 0.08 })) || tok !== TOK) return false;
  await turnTo(par, st.x + 1, st.z - 0.35, 0.4); if (tok !== TOK) return false;
  const edge = () => new V3(c.minX - 0.02, 1.08, d.hz - d.slide.half + d.slide.open[1] * d.slide.travel * d.a + 0.02);
  const pose = p.pose = { ...(p.pose || {}), L: { reach: edge(), palm: 'fwd', grip: 0.7 } };
  if (!(await wait(0.45))) return false;
  W().setDoor(d.name, false);
  await until(() => { pose.L.reach.copy(edge()); return d.a < 0.62; }, 1.2);
  delete p.pose.L;
  const ok = await until(() => d.a < 0.02, 2.0); d.max = 1; return ok;
}

// ---------- getting up and back into bed ----------
const _e = new THREE.Euler();
// sitting on the edge of the bed: on the rolled edge of the quilt (its top is 0.675), the hips over the mattress's own edge
const SEAT = 0.69, EDGE_X = 0.54, STEP_OUT = 0.14;
// where each of them sits on their own side of the bed and where they stand up from it (Dad's side is the bed's -x, the wall side; Mom's +x)
function bedside(par) {
  const bed = bedOf(), sgn = par.who === 'dad' ? -1 : 1, s = (par.p.group.userData.h || 1.75) / 1.75;
  const pel = par.pelvisBed || new V3(REST_X[par.who], 0.68, -0.25);
  const edge = bed.group.localToWorld(new V3(sgn * EDGE_X, SEAT + 0.12 * s, pel.z));   // the pelvis, sat on the edge
  const out = bed.group.localToWorld(new V3(sgn * 2, 0, pel.z)).sub(bed.group.localToWorld(new V3(0, 0, pel.z))).setY(0).normalize();
  const L = legsOf(par), feet = edge.clone().setY(0).addScaledVector(out, L.dx(SEAT + 0.09 * s));   // where the feet are, sat there
  return { edge, out, yaw: Math.atan2(out.x, out.z), feet, stand: feet.clone().addScaledVector(out, STEP_OUT), s };
}
// the legs' measures (the rig reads them standing): where a knee comes from the hips at a given height, the feet flat under it
function legsOf(par) {
  const r = par.p.rig, s = (par.p.group.userData.h || 1.75) / 1.75, th = (r && r.thighLen) || 0.42 * s, ca = (r && r.calfLen) || 0.42 * s, knee = ca + 0.08 * s;
  return { stand: th + knee, dx: (hip) => { const dy = Math.min(th * 0.999, Math.max(-th, hip - knee)); return Math.sqrt(th * th - dy * dy); } };
}
// the pelvis in the group's own frame (the clip holds it still), for laying the body where its hips should be
function pelvisLocal(par) {
  if (par.pl) return par.pl; const r = par.p.rig; if (!r || !r.bones.Pelvis) return new V3(0, 0.95, 0);
  par.p.group.updateMatrixWorld(true); return (par.pl = par.p.group.worldToLocal(r.bones.Pelvis.getWorldPosition(new V3())));
}
// sit up in bed (the trunk curls up off the pillow), eyes open, looking toward their door
async function sitUp(par, dur = 1.6) {
  const tok = TOK, s0 = par.sit;
  if (Math.abs(par.roll) > 0.02) { const r0 = par.roll, h0 = par.shift; par.rolling = null; await tween(0.9, (k) => { par.roll = r0 * (1 - k); par.shift = h0 * (1 - k); }); if (tok !== TOK) return false; }
  const at = par.p.head.getWorldPosition(new V3()); sound('bed_creak', placed(at.x, 0.6, at.z), { gain: 0.35 });
  par.p.lookAt = new V3(DOOR.x, 1.1, DOOR.z);
  return tween(dur * (1 - s0), (k) => { par.sit = s0 + (1 - s0) * k; });
}
async function lieDown(par, dur = 1.8) {
  const s0 = par.sit; par.p.lookAt = null;
  const ok = await tween(dur * s0, (k) => { par.sit = s0 * (1 - k); });
  par.st = 'asleep'; return ok;
}
// from sitting up, the legs swung out over the edge (u: 0 sat up in bed .. 1 sat on the edge, the shins down to the floor)
function swingPose(par, u) {
  const p = par.p, spot = W().parentsBed[par.who], bs = bedside(par), sgn = par.who === 'dad' ? 1 : -1;
  const yaw = (spot.yaw ?? Math.PI / 2) + sgn * (Math.PI / 2) * u, pitch = -Math.PI / 2 * (1 - u);
  p.group.rotation.order = 'YXZ'; p.group.quaternion.setFromEuler(_e.set(pitch, yaw, 0, 'YXZ'));
  // the hips slide from where they lay to the edge of the mattress, a little up over the middle of the swing
  const pl = pelvisLocal(par), from = par.pelvis0 || bs.edge, to = bs.edge, k = sm(u);
  const hip = new V3().lerpVectors(from, to, k); hip.y += 0.03 * Math.sin(Math.PI * u);
  const off = pl.clone().applyQuaternion(p.group.quaternion);
  p.group.position.copy(hip).sub(off); p.group.updateMatrixWorld(true);
  // the legs: from along the bed (toward its foot) round to over the edge, then the shins down to the floor
  const foot = new V3(Math.sin(spot.yaw ?? Math.PI / 2), 0, Math.cos(spot.yaw ?? Math.PI / 2)), sideDir = bs.out;
  // (lifted a little as they come round, clear of the quilt's rolled edge)
  const th = foot.clone().multiplyScalar(Math.cos(u * Math.PI / 2)).addScaledVector(sideDir, Math.sin(u * Math.PI / 2)).add(new V3(0, 0.2 * Math.sin(Math.PI * Math.min(1, u / 0.75)), 0)).normalize();
  const kn = sm(cl((u - 0.45) / 0.55, 0, 1)), shin = th.clone().multiplyScalar(1 - kn).add(new V3(0, -1, 0).multiplyScalar(kn)).normalize();
  const ft = th.clone().multiplyScalar(1 - kn).addScaledVector(sideDir, kn).normalize();
  par.bed.legs = { thigh: th, shin, foot: ft, w: 1 };
  // the hands on the thighs
  const s = bs.s, lap = hip.clone().addScaledVector(th, 0.3 * s); lap.y += 0.12;
  const back = foot.clone().multiplyScalar(-Math.cos(u * Math.PI / 2)).addScaledVector(sideDir, -Math.sin(u * Math.PI / 2));   // behind the trunk: the pillows, turning to the bed's middle
  par.bed.arms = { L: { at: lap.clone().addScaledVector(new V3(-th.z, 0, th.x), 0.1), w: 1, grip: 0.3, pole: elbowsOut(p, 'L', back) }, R: { at: lap.clone().addScaledVector(new V3(-th.z, 0, th.x), -0.1), w: 1, grip: 0.3, pole: elbowsOut(p, 'R', back) } };
  par.sit = 1 - u; par.bed.sit = par.sit; par.bed.rest = false; par.bed.awake = true;
  p.pose = { sleep: par.who === 'mom' ? 1 : -1, bed: par.bed };
}
// sat on the edge and standing up from it (h: 0 sat, 1 stood), the feet where they are: the standing pose's own sit(), the seat rising
// under the hips until the legs are straight, the body over the feet and leaning into it halfway
function seated(par, h = 0) {
  const p = par.p, bs = bedside(par), pl = pelvisLocal(par), L = legsOf(par);
  p.sleeping = false; par.inBed = false; p.busy = true; p.group.rotation.order = 'XYZ'; p.group.rotation.set(0, bs.yaw, 0);
  const hip0 = SEAT + 0.09 * bs.s, hip = hip0 + (L.stand - hip0) * sm(h);
  const off = new V3(pl.x, 0, pl.z).applyAxisAngle(new V3(0, 1, 0), bs.yaw);
  p.group.position.copy(bs.feet).addScaledVector(bs.out, -L.dx(hip)).sub(off).setY(0);
  if (h >= 0.999) { p.pose = null; p.sitNow = 0; }
  else { p.pose = { sit: 1, seat: hip - 0.09 * bs.s, lean: 0.4 * Math.sin(Math.PI * h) }; p.sitNow = 1; }
  p.group.updateMatrixWorld(true);
}
// a step straight out from the bed, or back to it (the walks start and end clear of its box)
function stepAt(par, k) {
  const bs = bedside(par), pl = pelvisLocal(par), off = new V3(pl.x, 0, pl.z).applyAxisAngle(new V3(0, 1, 0), bs.yaw);
  par.p.group.position.copy(bs.feet).addScaledVector(bs.out, STEP_OUT * k).sub(off).setY(0);
}
async function getOut(par) {
  const tok = TOK, p = par.p, bed = bedOf();
  if (par.sit < 0.99) { if (!(await sitUp(par, 1.0))) return false; }
  // where the hips start
  if (p.rig && p.rig.bones.Pelvis) { par.pelvis0 = p.rig.bones.Pelvis.getWorldPosition(new V3()); par.pelvisBed = bed.toLocal(par.pelvis0.clone()); }
  if (bed) bed.one(par.who, false);   // the quilt thrown back on that side (it lies on over the legs until they are out from under it)
  sound('cloth', placed(par.pelvis0 ? par.pelvis0.x : -6.8, 0.75, par.pelvis0 ? par.pelvis0.z : 0.6), { gain: 0.4 });
  par.inBed = true; par.swing = true;
  const ok = await tween(1.6, (k) => swingPose(par, k), (k) => k); par.swing = false; if (!ok) return false;
  par.bed.legs = null; par.bed.arms = { L: null, R: null };
  seated(par, 0);
  sound('bed_creak', placed(par.pelvis0 ? par.pelvis0.x : -6.8, 0.6, par.pelvis0 ? par.pelvis0.z : 0.4), { gain: 0.35 });
  if (!(await tween(1.1, (k) => seated(par, k)))) return false;
  if (p.rig) { p.rig.play('walk', { fade: 0.2, speed: 0.6 }); }
  if (!(await tween(0.45, (k) => stepAt(par, k)))) return false;
  if (p.rig) p.rig.play('idle', { fade: 0.4, speed: 1 });
  return tok === TOK;
}
async function getIn(par) {
  const tok = TOK, p = par.p, bs = bedside(par);
  if (!(await goTo(par, bs.stand, { near: 0.06 }))) return false;
  await turnTo(par, bs.stand.x + bs.out.x, bs.stand.z + bs.out.z, 0.6); if (tok !== TOK) return false;   // his back to the bed
  if (p.rig) p.rig.play('walk', { fade: 0.2, speed: -0.6 });
  if (!(await tween(0.45, (k) => stepAt(par, 1 - k)))) return false;
  if (p.rig) p.rig.play('idle', { fade: 0.3, speed: 1 });
  if (!(await tween(1.0, (k) => seated(par, 1 - k)))) return false;
  par.inBed = true; p.sleeping = true;
  sound('bed_creak', placed(bs.edge.x, 0.6, bs.edge.z), { gain: 0.35 });
  par.swing = true;
  const ok = await tween(1.6, (k) => swingPose(par, 1 - k), (k) => k); par.swing = false; if (!ok) return false;
  par.bed.legs = null; par.bed.arms = { L: null, R: null };
  const bed = bedOf(); if (bed) bed.one(par.who, true);
  layBackSitting(par);
  return lieDown(par, 1.6);
}
// back in bed sitting up, as the swing in leaves them
function layBackSitting(par) {
  const p = par.p; p.sleeping = true; p.busy = true; p.gaze = null; p.walking = 0; par.inBed = true; par.roll = 0; par.shift = 0; par.sit = 1;
  p.pose = { sleep: par.who === 'mom' ? 1 : -1, bed: par.bed }; if (p.rig) p.rig.play('idle', { fade: 0.4, speed: 0.05 });
}

// ---------- the night walk ----------
const anyUp = () => Object.values(PAR).some((q) => q.st !== 'asleep' && q.st !== 'light' && q.st !== 'sitting');
function holdRes() {
  const R = events.RES; R.hold('parents', OWNER); R.held.E = OWNER;   // (taken from whatever had it: its beat is ended below)
}
function freeRes() { const R = events.RES; R.free('parents', OWNER); R.free('E', OWNER); }
// on stage up: every beat with the thing in it ends, the thing goes, the house it changed stays as it is
function endE() {
  const n = G.nights, E = G.E;
  try { if (n && n.stage && n.stage.ST && n.stage.ST.on) n.stage.endStage(); } catch (e) { /* no stage */ }
  try { for (const d of events.defs()) if ((d.uses || []).includes('E') && events.active(d.id)) events.finish(d.id, { undo: false }); } catch (e) { /* no table */ }
  try { if (G.hunter && G.hunter.busy) G.hunter.vanish(false); } catch (e) { /* no hunter */ }
  if (E && E.visible) { try { if (n && n.stage && n.stage.hideE) n.stage.hideE(); else E.visible = false; } catch (e) { E.visible = false; } }
}
// what a walking parent notices within two metres: proof that is showing, a house that has changed
function notice(par) {
  par.noticeT = (par.noticeT || 0) - 1; if (par.noticeT > 0) return; par.noticeT = 8;
  const rec = log.night(); if (!rec) return; const seen = par.noticed || (par.noticed = new Set()), g = par.p.group.position;
  const push = (kind, id, at) => { if (seen.has(kind + id)) return; seen.add(kind + id); rec.noticed.push({ by: par.who, kind, id, t: Math.round(F().clock || 0), p: { x: Math.round(at.x * 100) / 100, z: Math.round(at.z * 100) / 100 } }); };
  const pr = G.nights && G.nights.proof;
  if (pr && pr.shown) for (const k of pr.shown()) { const d = pr.defs && pr.defs[k]; const a = d && d.at; if (a && Math.hypot(a[0] - g.x, a[2] - g.z) < 2) push('proof', k, { x: a[0], z: a[2] }); }
  try { for (const a of events.test.active()) { const p = events.test.point(a.id); if (p && Math.hypot(p.x - g.x, p.z - g.z) < 2) push('event', a.id, p); } } catch (e) { /* no table */ }
}
function wokeRow(par, at) {
  const rec = log.night() || log.start(night()); const row = { who: par.who, n: night(), t: Math.round(F().clock || 0), at: at ? { x: Math.round(at.x * 100) / 100, z: Math.round(at.z * 100) / 100 } : null,
    found: false, hiddenInPod: false, inBunk: false, outside: false, blamed: false, escorted: false };
  if (rec) rec.woke.push(row);
  return row;
}
// the parent's eyes and the beam: on you when found, else down and ahead where they walk, sweeping a little from side to side
function aimTick(par, dt) {
  const p = par.p, g = p.group.position, yaw = p.group.rotation.y;
  par.sweepT = (par.sweepT || 0) + dt;
  let want;
  if (par.aimAt) { const h = new V3(g.x, 1.05, g.z); want = par.aimAt.clone().sub(h).normalize(); }
  else { const sw = (par.sweep ? 0.32 : 0.08) * Math.sin(par.sweepT * 0.9); want = new V3(Math.sin(yaw + sw), -0.42, Math.cos(yaw + sw)).normalize(); }
  par.aim = par.aim ? par.aim.lerp(want, Math.min(1, dt * 5)).normalize() : want;
  // the eyes where the beam goes (or on you), the hand holding the torch out in front of the chest, a little raised to point at a face
  const look = g.clone().add(new V3(par.aim.x * 3, 1.0 + par.aim.y * 3 + 0.6, par.aim.z * 3));
  p.gaze = par.gazeOn === 'you' ? G.camera.position : look;
  // the torch held out and pointed with the arm: the hand most of an arm's length from the shoulder along the beam, so the forearm (and
  // the torch along the hand) points where the beam should go
  if (par.who === 'dad' && torch && torch.held && !par.handBusy && p.rig && p.rig.bones.R_UpperArm) {
    const sh = p.rig.bones.R_UpperArm.getWorldPosition(new V3()), s = (p.group.userData.h || 1.75) / 1.75;
    p.pose = { ...(p.pose || {}), R: { reach: sh.addScaledVector(par.aim, 0.5 * s), palm: 'in', grip: 0.55 } };
  }
}
async function takeTorch(par) {
  const tok = TOK, p = par.p; if (!torch) return true;
  const h = torch.home.pos, stand = new V3(h.x + 0.62, 0, h.z + 0.05);
  if (!(await goTo(par, stand, { near: 0.08 })) || tok !== TOK) return false;
  await turnTo(par, h.x, h.z, 0.45); if (tok !== TOK) return false;
  par.handBusy = true;
  const pose = p.pose = { lean: 0.45, R: { reach: torch.group.getWorldPosition(new V3()).add(new V3(0, 0.03, 0)), palm: 'down', grip: 0.5 } };
  if (!(await wait(0.7))) return false;
  pose.R.grip = 0.9; torch.held = true; par.aim = new V3(Math.sin(p.group.rotation.y), -0.42, Math.cos(p.group.rotation.y));
  sound('cloth', placed(h.x, 0.65, h.z), { gain: 0.15 });
  p.pose = { R: pose.R }; par.handBusy = false;
  if (!(await wait(0.35))) return false;
  torchOn(true);
  return tok === TOK;
}
async function putTorch(par) {
  const tok = TOK, p = par.p; if (!torch || !torch.held) return true;
  const h = torch.home.pos, stand = new V3(h.x + 0.62, 0, h.z + 0.05);
  if (!(await goTo(par, stand, { near: 0.08 })) || tok !== TOK) return false;
  await turnTo(par, h.x, h.z, 0.45); if (tok !== TOK) return false;
  torchOn(false);
  par.handBusy = true; par.aimAt = h.clone(); p.pose = { lean: 0.45, R: { reach: h.clone().add(new V3(0, 0.05, 0)), palm: 'down', grip: 0.9 } };
  if (!(await wait(0.7))) return false;
  torchHome(); par.aimAt = null; p.pose = null; par.handBusy = false;
  return wait(0.3);
}
// stand and look a while: the beam swept slowly over the room
async function lookAround(par, sec, check) {
  par.sweep = true; const t0 = T;
  const ok = await until(() => (check && check()) || T - t0 >= sec); par.sweep = false; return ok;
}
function seeTick(par) {
  if (!par.rec || par.rec.found || par.blind) return false;
  if (sees(par)) return true;
  return false;
}
const kidDoor = () => W().doors.kid;
// the spot outside your door, looking in, and the spot just inside
const kidLook = () => { const d = kidDoor(); return { out: new V3(d.mid.x - 0.05, 0, d.mid.z - 0.55), in: new V3(d.mid.x + 0.1, 0, d.mid.z + 0.75), bunk: new V3(8.42, 0.9, 3.72) }; };
async function upDad(par, why) {
  const tok = TOK, p = par.p; par.st = 'up'; stats.up = { who: 'dad', at: T, n: night() };
  par.woke++; par.mult = HARDER; holdRes(); endE();
  const src = why || loudest() || { at: { x: kidLook().out.x, z: kidLook().out.z } };
  stats.firstGoal = { x: src.at.x, z: src.at.z };
  par.rec = wokeRow(par, src.at);
  if (G.lights && G.lights.set && !G.lights.isOn('parents')) G.lights.set('parents', true, { by: 'house' });
  if (!(await getOut(par))) return bail(par, tok);
  par.st = 'walking';
  if (!(await takeTorch(par))) return bail(par, tok);
  if (G.lights && G.lights.movers && !G.lights.movers.includes(p.group)) G.lights.movers.push(p.group);
  // out of the room
  if (!(await goTo(par, new V3(DOOR.x + 0.7, 0, DOOR.z)))) return endWalk(par);
  // the walk, logged once a night (the journal learns from it): the log row is filled in as it ends
  if (!par.walkRow) par.walkRow = log.push({ id: 'dadWalk', seen: false, how: 'walk', p: { x: Math.round(src.at.x * 100) / 100, z: Math.round(src.at.z * 100) / 100 }, noise: Math.round(LEDGER.N * 100) / 100 });
  // to where the noise came from (your door, when it came from your room: he looks in from the hall)
  let goal = new V3(src.at.x, 0, src.at.z);
  const r = roomAt(goal.x, goal.z); if (r === 'bed') goal = kidLook().out;
  const found = await search(par, [goal]); if (tok !== TOK) return;
  if (!found) {
    // not where the noise was: your room, and then wherever you are now
    if (inPod()) par.rec.hiddenInPod = true;
    await lookIn(par); if (tok !== TOK) return;
    if (!inBunk() && !par.rec.found) { const f2 = await search(par, [nearRoom(playerPos())], 2.5); if (tok !== TOK) return; if (f2) await blame(par); }
    if (inPod()) par.rec.hiddenInPod = true;
    if (inBunk()) par.rec.inBunk = true;
  } else await blame(par);
  if (tok !== TOK) return;
  await endWalk(par);
}
// walk a list of places, stopping to look at each; true once you are seen
async function search(par, places, lookSec = 3) {
  const tok = TOK;
  for (const at of places) {
    let seen = false;
    const w = walking(par, at);
    await until(() => { if (seeTick(par)) { seen = true; return true; } return w.done; }, 60);
    await w.stop(); if (tok !== TOK) return false;
    if (seen) return true;
    if (stats.arrivedAt === null || stats.arrivedAt === undefined) stats.arrivedAt = T - (stats.up ? stats.up.at : T);
    if (await lookAround(par, lookSec, () => seeTick(par)) && seeTick(par)) return true;
    if (tok !== TOK) return false;
  }
  return false;
}
// the middle of the room a point is in (the nearest walkable spot in it)
function nearRoom(p) { const r = roomAt(p.x, p.z, p.y || 0); const c = { x: p.x, z: p.z }; void r; return new V3(c.x, 0, c.z); }
async function lookIn(par) {
  const tok = TOK, k = kidLook(), d = kidDoor();
  if (!(await goTo(par, k.out, { near: 0.2 }))) return false;
  if (d.a < 0.5) { if (!(await openDoor(par, d))) return false; if (!(await goTo(par, k.out, { near: 0.2 }))) return false; }
  await turnTo(par, k.bunk.x, k.bunk.z, 0.5); if (tok !== TOK) return false;
  par.aimAt = new V3(k.bunk.x, 0.3, k.bunk.z - 0.9);   // the beam on the floor by the bunk, not in your face
  stats.lookedIn = (stats.lookedIn || 0) + 1;
  const ok = await lookAround(par, 3, () => seeTick(par)); par.aimAt = null;
  if (ok && seeTick(par)) { await blame(par); }
  return tok === TOK;
}
async function blame(par) {
  const tok = TOK, p = par.p, rec = par.rec; if (!rec || rec.found) return;
  rec.found = true; rec.blamed = true; stats.foundAt = T;
  G.RUN.story ||= {}; G.RUN.story.blamed = (G.RUN.story.blamed || 0) + 1;
  if (par.walkRow) { par.walkRow.seen = true; par.walkRow.how = 'found'; par.walkRow.blamed = 1; }
  if (par.walk) par.walk.done = true; walkAnim(par, false);
  const pp = playerPos();
  await turnTo(par, pp.x, pp.z, 0.5); if (tok !== TOK) return;
  par.gazeOn = 'you';
  if (par.who === 'dad') {
    par.aimAt = G.camera.position;   // the beam in your face
    F().dazzle = 0.6; if (G.UI && G.UI.flash) G.UI.flash('rgba(255,246,226,0.45)', 0.6);
    await wait(say(par, 'dad/n3_b') + 0.5); if (tok !== TOK) return;
    par.aimAt = new V3(pp.x, 0.1, pp.z);   // and down to your feet
    await wait(say(par, night() >= 7 ? 'dad/n7_d' : 'dad/n3_e') + 0.3); if (tok !== TOK) return;
  } else {
    await wait(say(par, 'mom/n5_b') + 0.6); if (tok !== TOK) return;
  }
  notice(par);
  if (par.who === 'mom' && night() === 5) { await handoff(par); return; }
  await escort(par);
}
// he walks behind you to your bunk and waits until you are in it (forty clock-minutes at most); out of the house, he waits at the back door
async function escort(par) {
  const tok = TOK, rec = par.rec; par.st = 'escort'; rec.escorted = true;
  const t0 = T; par.gazeOn = 'you';
  if (par.who === 'mom') say(par, 'mom/bed_call');
  while (tok === TOK && T - t0 < ESCORT_CAP) {
    if (inBunk()) break;
    if (outside()) { rec.outside = true; await atBackDoor(par, () => !outside() || T - t0 > ESCORT_CAP + 30); if (tok !== TOK) return; continue; }
    const pp = playerPos(), g = par.p.group.position, d = Math.hypot(pp.x - g.x, pp.z - g.z);
    if (d > 1.9) { const to = new V3(pp.x + (g.x - pp.x) / d * 1.5, 0, pp.z + (g.z - pp.z) / d * 1.5); const w = walking(par, to, { near: 0.35 }); await until(() => w.done || inBunk() || outside() || Math.hypot(playerPos().x - g.x, playerPos().z - g.z) < 1.3, 3); await w.stop(); }
    else { walkAnim(par, false); await turnTo(par, pp.x, pp.z, 0.3); await wait(0.3); }
  }
  if (tok !== TOK) return;
  par.gazeOn = null; par.aimAt = null;
  if (inBunk()) { rec.inBunk = true; await lookIn(par); }
}
async function atBackDoor(par, done) {
  const tok = TOK, back = W().doors.back, inside = new V3(back.mid.x, 0, back.mid.z - 0.75);
  if (!(await goTo(par, inside, { near: 0.25 }))) return false;
  if (back.a < 0.5) await openDoor(par, back);
  await turnTo(par, back.mid.x, back.mid.z + 2, 0.5); if (tok !== TOK) return false;
  par.aimAt = new V3(back.mid.x, 0, back.mid.z + 3.5);
  const ok = await until(done, 120); par.aimAt = null; return ok;
}
async function endWalk(par) {
  const tok = TOK, p = par.p; par.st = 'returning'; par.gazeOn = null; par.aimAt = null; par.sweep = false;
  if (par.walkRow && !par.rec.found) { par.walkRow.how = par.rec.hiddenInPod ? 'hidden' : par.rec.inBunk || inBunk() ? 'bunk' : 'away'; }
  if (par.rec) { if (inBunk()) par.rec.inBunk = true; if (inPod()) par.rec.hiddenInPod = true; }
  const d = W().doors.parents;
  if (!(await goTo(par, new V3(DOOR.x - 0.7, 0, DOOR.z)))) { if (tok === TOK) finishUp(par, true); return; }
  if (d && d.a > 0.1) await shutSlide(par, d);
  if (tok !== TOK) return;
  if (par.who === 'dad') await putTorch(par);
  if (tok !== TOK) return;
  if (G.lights && G.lights.set && G.lights.isOn('parents')) G.lights.set('parents', false, { by: 'house' });
  const ok = await getIn(par);
  if (tok !== TOK) return;
  finishUp(par, !ok);
}
// a walk that could not go on (no way found): back in bed as it stands, the house free again (unless the night itself moved on)
function bail(par, tok) { if (tok === TOK) finishUp(par, true); }
// the walk over: back in bed (laid there if the way back failed), the house free again
function finishUp(par, place = false) {
  const p = par.p, i = G.lights && G.lights.movers ? G.lights.movers.indexOf(p.group) : -1; if (i >= 0) G.lights.movers.splice(i, 1);
  if (place) { if (par.who === 'dad') torchHome(); const d = W().doors.parents; if (d) { W().setDoor('parents', false, true); d.max = 1; } layBack(par); }
  par.st = 'asleep'; par.walk = null; par.rec = null; par.stirCool = 30;
  if (par.body) par.body.r = par.body.r0 || par.body.r;
  freeRes();
}

// ---------- Mom (night five on) ----------
async function upMom(par) {
  const tok = TOK, p = par.p; par.st = 'up'; stats.up = { who: 'mom', at: T, n: night() };
  par.woke++; par.mult = HARDER; holdRes(); endE();
  par.rec = wokeRow(par, loudest() ? loudest().at : null);
  if (!(await getOut(par))) return bail(par, tok);
  par.st = 'walking'; stats.firstGoal = { x: kidLook().out.x, z: kidLook().out.z, door: 'kid' };
  if (G.lights && G.lights.movers && !G.lights.movers.includes(p.group)) G.lights.movers.push(p.group);
  if (!(await goTo(par, new V3(DOOR.x + 0.7, 0, DOOR.z)))) return endWalk(par);
  say(par, 'mom/n5_a');
  if (!par.walkRow) par.walkRow = log.push({ id: 'momWalk', seen: false, how: 'walk', noise: Math.round(LEDGER.N * 100) / 100 });
  // always to your door first
  const k = kidLook();
  if (!(await goTo(par, k.out, { near: 0.2 }))) return endWalk(par);
  if (kidDoor().a < 0.5) { await openDoor(par, kidDoor()); await goTo(par, k.out, { near: 0.2 }); }
  if (tok !== TOK) return;
  await turnTo(par, k.bunk.x, k.bunk.z, 0.5); if (tok !== TOK) return;
  stats.momAtDoor = T;
  if (inBunk()) { par.rec.inBunk = true; par.gazeOn = 'you'; await wait(6); if (tok !== TOK) return; return endWalk(par); }   // she watches you six seconds
  // you are not in bed: she searches the house, calling every four seconds
  par.st = 'searching';
  const spots = SEARCH.map((id) => new V3(NODES[id][0], 0, NODES[id][1]));
  let hidden = 0, calls = 0, nextCall = T, lastT = T;
  const tick = () => {
    if (inPod()) hidden += T - lastT; lastT = T; stats.momHidden = hidden;   // the seconds of her search you have spent hidden
    if (T >= nextCall) { say(par, MOM_CALLS[calls++ % 2]); nextCall = T + 4; }
    return false;
  };
  for (let i = 0; tok === TOK; i = (i + 1) % spots.length) {
    if (outside()) { par.rec.outside = true; await momOutside(par); return; }
    let seen = false;
    const w = walking(par, spots[i], { near: 0.3 }); stats.momSpot = SEARCH[i];
    await until(() => { tick(); if (sees(par)) { seen = true; return true; } return hidden >= MOM_HIDDEN || outside() || w.done; }, 40);
    await w.stop(); if (tok !== TOK) return;
    if (seen) { await blame(par); return; }
    if (hidden >= MOM_HIDDEN) { par.rec.hiddenInPod = true; await momOnBunk(par); return; }
    await until(() => { tick(); if (sees(par)) { seen = true; return true; } return hidden >= MOM_HIDDEN; }, 2);
    if (tok !== TOK) return;
    if (seen) { await blame(par); return; }
    if (hidden >= MOM_HIDDEN) { par.rec.hiddenInPod = true; await momOnBunk(par); return; }
  }
}
// the bottom bunk: she sits on its front edge (the top bunk's underside is 1.29 m up and comes out to z 3.32, so she sits hunched forward,
// her head out in front of it), facing your door. stand: where she stands before sitting down
function bunkSeat() {
  const c = W().colliders.find((q) => q.prop === 'bunk' && q.on !== false) || { minX: 7.243, maxX: 9.483, minZ: 3.181, maxZ: 4.531 };   // (the model's own footprint)
  const x = c.minX + (c.maxX - c.minX) * 0.45, lb = W().lowerBunk;
  // (the hips just behind the front of the mattress, on the comforter, which stands about 9 cm over the mattress's top)
  return { hip: new V3(x, (lb && lb.top) || 0.527, c.minZ + 0.18), stand: new V3(x, 0, c.minZ - 0.37), seat: ((lb && lb.top) || 0.527) + 0.1, yaw: Math.PI };
}
function sitOnBunk(par, k, from) {
  const p = par.p, B = bunkSeat(), pl = pelvisLocal(par);
  p.group.rotation.order = 'XYZ'; p.group.rotation.set(0, B.yaw, 0);
  const off = new V3(pl.x, 0, pl.z).applyAxisAngle(new V3(0, 1, 0), B.yaw), at = B.hip.clone().setY(0).sub(off);
  p.group.position.copy(from).setY(0).lerp(at, sm(k));
  p.pose = { sit: k, seat: B.seat, lean: 0.52 * k }; p.sitNow = k; p.group.updateMatrixWorld(true);
}
// her rounds: your room, the bathroom, the hall, the office, the spare room, the living room, the kitchen, the dining room
const SEARCH = ['kidMid', 'bathMid', 'hallM', 'r2Mid', 'sMid', 'hallW', 'livC', 'kit2', 'dinS', 'livMid'];
// hidden forty seconds of her search: she goes to your bunk and sits on the bottom one facing the door, and says your name once
async function momOnBunk(par) {
  const tok = TOK, p = par.p, B = bunkSeat();
  if (!(await goTo(par, B.stand, { near: 0.12 }))) return endWalk(par);
  await turnTo(par, B.stand.x, B.stand.z - 2, 0.5); if (tok !== TOK) return;   // her back to the bunk, facing the door
  const g0 = p.group.position.clone();
  await tween(1.1, (k) => { sitOnBunk(par, k, g0); }); if (tok !== TOK) return;
  par.st = 'onBunk'; stats.momSat = T;
  await wait(1.5); if (tok !== TOK) return;
  say(par, 'mom/n5_f');
  // she waits; when you come out she looks past you, and says the same as if she had found you
  await until(() => !inPod() && P().mode === 'walk', 600); if (tok !== TOK) return;
  par.gazeOn = null; const pp = playerPos(), past = new V3(pp.x + (pp.x - p.group.position.x) * 2, 1.4, pp.z + (pp.z - p.group.position.z) * 2);   // past you
  par.aimAt = past; par.blind = true;
  await wait(1.2); if (tok !== TOK) return;
  const g1 = bunkSeat().stand; await tween(0.9, (k) => { sitOnBunk(par, 1 - k, g1); }); p.pose = null;
  await wait(say(par, 'mom/n5_b', { eyes: past }) + 0.4); if (tok !== TOK) return;
  par.aimAt = null;
  if (night() === 5) await handoff(par); else await endWalk(par);
}
async function momOutside(par) {
  const tok = TOK;
  await atBackDoor(par, () => true); if (tok !== TOK) return;
  await wait(say(par, 'mom/n5_b') + 0.5); if (tok !== TOK) return;
  if (night() === 5) await handoff(par); else await endWalk(par);
}
// night five: she takes you to their bed (a fade); the rest of the night is spent there, between them
async function handoff(par) {
  const tok = TOK, P0 = P(), UI = G.UI;
  par.st = 'handoff'; P0.mode = 'cine'; F().cutscene = true;
  if (UI && UI.fade) UI.fade(1, 0.8);
  await wait(1.1); if (tok !== TOK) return;
  if (P0.pod && G.nights && G.nights.exitHide) { if (UI && UI.pod) UI.pod(null); P0.pod = null; }
  // Mom back in her place, Dad turned over toward the wall, the door shut, the light off
  const d = W().doors.parents; if (d) { W().setDoor('parents', false, true); d.a = 0; d.max = 1; d.apply && d.apply(); }
  if (G.lights && G.lights.isOn('parents')) G.lights.set('parents', false, { by: 'house', silent: true });
  const i = G.lights && G.lights.movers ? G.lights.movers.indexOf(par.p.group) : -1; if (i >= 0) G.lights.movers.splice(i, 1);
  layBack(par); par.st = 'handoff';
  const dad = PAR.dad; if (dad && dad.inBed) { dad.rolling = null; dad.roll = ROLL; dad.shift = SHIFT; }
  par.shift = -0.04;
  // you, on your back between them, your head on the pillows, looking down the bed at their door
  const eye = kidInBed();
  P0.cam.copy(eye.pos); P0.pos.set(eye.pos.x, 0, eye.pos.z); P0.vel && P0.vel.set(0, 0, 0); P0.yaw = eye.yaw; P0.pitch = eye.pitch; P0.roll = 0; P0.mode = 'lie';
  F().cutscene = false; F().sleepy = true; stats.handoff = T;
  if (par.rec) par.rec.handoff = true;
  if (UI && UI.fade) UI.fade(0, 1.6);
  await wait(1.4); if (tok !== TOK) return;
  say(par, 'mom/n5_e', { muffle: false });
  // the night runs out there: nothing else comes for you tonight, and when you close your eyes it is soon morning
  await until(() => !F().sleepy, 900); if (tok !== TOK) return;
  F().clockRateNow = (F().clockRateNow || 1) * 6;
}
// where the kid's eye is, lying between them (the bed's frame: the seam of the two pillows, a head's height over them)
function kidInBed() {
  // (lying, the view turns 1.25 rad either side of the way the body faces, main.js; toward the foot of the bed that leaves it looking a
  // little toward Dad's back)
  const bed = bedOf(), pos = bed.group.localToWorld(new V3(0.0, 0.875, 0.74)), foot = bed.group.localToWorld(new V3(0.0, 0.875, -0.4));
  const yawTo = Math.atan2(-(foot.x - pos.x), -(foot.z - pos.z));
  return { pos, yaw: Math.max(yawTo, -1.2), pitch: -0.12 };
}

// ---------- the frame ----------
function allowed() {
  const f = F(); if (!f || f.phase !== 'night' || !f.live || f.dead || night() < 2) return false;
  if (f.plan && QUIET_TYPES.has(f.plan.type)) return false;
  if (events.RES.isHeld('parents', OWNER)) return false;   // a beat of the night has them
  return true;
}
function thresholds() {
  if (!allowed() || anyUp()) return;
  const n = night(), N = LEDGER.N, D = PAR.dad, M = PAR.mom, f = F();
  if (f.script || f.cutscene) return;
  const over = N >= TH.mutter * Math.min(D.mult, M.mult), crossed = over && !LEDGER.wasOver; LEDGER.wasOver = over;
  const canWake = (q) => q.inBed && q.p.group.visible && (q.woke === 0 || n >= 7);
  if (n >= 3) {
    // Mom, from night five, past 0.9 (before Dad: by then she is the one lying awake)
    if (n >= 5 && canWake(M) && N >= TH.mom * M.mult && M.st !== 'up') { if (D.st === 'sitting') { D.st = 'light'; lieDown(D, 1.2); } M.st = 'up'; upMom(M).catch((e) => console.warn('parents: Mom failed', e)); return; }
    // Dad: stirs past 0.6, up past 0.8
    if (canWake(D) && D.st === 'asleep' && D.stirCool <= 0 && N >= TH.stir * D.mult) { stir(D).catch((e) => console.warn('parents: Dad failed', e)); return; }
  }
  // a mutter through the door, the light on behind it for twenty seconds (when nobody is getting up over it)
  if (crossed && T - LEDGER.lastMutter > 45 && D.inBed && (M.inBed || !M.p.group.visible)) mutter();
}
async function stir(par) {
  const tok = TOK; par.st = 'sitting';
  const at = par.p.head.getWorldPosition(new V3());
  try { G.sfx.mumble && G.sfx.mumble('dad', 0.9, { muffle: true, gain: 0.3, pan: { at: placed(at.x, at.y, at.z) } }); } catch (e) { /* no voice */ }
  if (!(await sitUp(par))) return;
  par.bed.awake = true;
  const listen = 3 + Math.random() * 3, t0 = T;
  const up = () => LEDGER.N >= TH.dad * par.mult && allowed() && night() >= 3 && (par.woke === 0 || night() >= 7) && !anyUpBut(par);
  await until(() => up() || T - t0 >= listen || par.st !== 'sitting'); if (tok !== TOK) return;
  if (par.st !== 'sitting') return;
  if (up()) { par.st = 'up'; await upDad(par); return; }
  par.stirCool = 20; await lieDown(par);
}
const anyUpBut = (me) => Object.values(PAR).some((q) => q !== me && q.st !== 'asleep' && q.st !== 'light' && q.st !== 'sitting');
function mutter() {
  const R = G.RUN, i = (R.parentsMutters = (R.parentsMutters || 0) + 1) - 1, pair = i < MUTTERS.length ? MUTTERS[i] : MUTTERS_OLD[Math.floor(Math.random() * MUTTERS_OLD.length)];
  LEDGER.lastMutter = T; stats.mutters = (stats.mutters || 0) + 1;
  const first = PAR[pair[0].split('/')[0]], second = PAR[pair[1].split('/')[0]];
  if (G.lights && G.lights.set && !G.lights.isOn('parents')) { G.lights.set('parents', true, { by: 'house' }); LEDGER.mutterOff = T + 20; }
  const tok = TOK;
  (async () => { const d = say(first, pair[0], { muffle: true }); await wait(d + 0.9); if (tok !== TOK || !F().live) return; say(second, pair[1], { muffle: true }); })();
}
// the thing near Dad's beam, or anywhere once a parent is up and walking into your room: gone, without a flicker
function vanishTick() {
  const E = G.E; if (!E || !E.visible || !anyUp()) return;
  stats.eSeenWhileUp = true;
  const e = E.root.position, D = PAR.dad, near = beamNear(e.x, e.z) < 4 || Object.values(PAR).some((q) => q.st !== 'asleep' && q.p.group.visible && !q.inBed && (Math.hypot(e.x - q.p.group.position.x, e.z - q.p.group.position.z) < 4 || roomAt(e.x, e.z) === roomAt(q.p.group.position.x, q.p.group.position.z)));
  void D;
  if (!near) return;
  try { if (G.hunter && G.hunter.busy) G.hunter.vanish(false); } catch (e2) { /* no hunter */ }
  if (E.visible) { try { const n = G.nights; if (n && n.stage && n.stage.ST && n.stage.ST.on) n.stage.endStage(); if (n && n.stage && n.stage.hideE) n.stage.hideE(); else E.visible = false; } catch (e3) { E.visible = false; } }
}
export function update(dt) {
  if (!G || !PAR.dad) return;
  T += dt; runWaiters();
  const f = F();
  if (f.dazzle > 0) f.dazzle = Math.max(0, f.dazzle - dt);
  if (f.phase !== 'night') return;
  // the ledger
  if (f.live && !f.dead) pollNoise(dt);
  LEDGER.N = Math.max(0, LEDGER.N - DECAY * dt);
  if (LEDGER.mutterOff && T > LEDGER.mutterOff) { LEDGER.mutterOff = 0; if (!anyUp() && G.lights && G.lights.isOn('parents')) G.lights.set('parents', false, { by: 'house' }); }
  thresholds();
  for (const par of Object.values(PAR)) {
    par.stirCool = Math.max(0, par.stirCool - dt);
    if (par.inBed && par.p.sleeping) bedTick(par, dt);
    stepWalk(par, dt);
    if (!par.inBed) { aimTick(par, dt); if (par.st !== 'handoff') notice(par); }
    if (par.rec && !par.rec.found && par.st !== 'onBunk' && !par.inBed && sees(par) && par.walkRow) par.walkRow.seen = true;
    if (par.st !== 'asleep' && stats.states[stats.states.length - 1] !== par.who + ':' + par.st) stats.states.push(par.who + ':' + par.st);
  }
  // in the player's room: when a walking parent comes into the room you are in, the thing is not there
  for (const par of Object.values(PAR)) {
    if (par.inBed || !par.p.group.visible) continue;
    const g = par.p.group.position, pr = roomAt(playerPos().x, playerPos().z), here = roomAt(g.x, g.z);
    if (here === pr && par.inRoom !== pr) { par.inRoom = pr; if (stats.enteredAt === null) stats.enteredAt = { t: T, eVisible: !!(G.E && G.E.visible), room: pr, who: par.who }; }
    if (here !== pr) par.inRoom = null;
  }
  vanishTick();
  if (torch && torch.held) torchFollow(PAR.dad);
  // Mom away (night eight): nobody else updates Dad's body (main.js does both while Mom is in the house)
  if (!G.mom.group.visible && G.dad.group.visible) G.dad.update(T, dt);
}

// ---------- the night's start and the day ----------
// main.js sleepers(on, only): a night lays them both down (on, no only), the day gets them up (off)
export function laid(on, only = null) {
  if (!G || !PAR.dad) return;
  if (only) return;   // one of them laid or stood by a scene of the night (not this module's walk)
  TOK++;
  for (const w of WAIT.splice(0)) w.res(false);
  LEDGER.N = 0; LEDGER.entries.length = 0; LEDGER.wasOver = false; LEDGER.lastMutter = -99; LEDGER.mutterOff = 0; LEDGER.polled = {};
  torchHome();
  { const d = W().doors.parents; if (d) { d.max = 1; if (d.target && on) W().setDoor('parents', false, true); } }   // (a walk cut short leaves their door as it was)
  const n = night();
  for (const par of Object.values(PAR)) {
    par.st = on ? 'asleep' : 'day'; par.mult = 1; par.woke = 0; par.walk = null; par.rec = null; par.walkRow = null; par.noticed = null; par.blind = false; par.gazeOn = null; par.aimAt = null;
    par.roll = 0; par.shift = 0; par.sit = 0; par.rolling = null; par.armOutRun = null; par.armDone = false; par.armOut.L = par.armOut.R = 0; par.inBed = !!on; par.stirCool = 0; par.inRoom = null;
    par.rollT = 40 + Math.random() * 50; par.bed.legs = null; par.bed.arms = { L: null, R: null };
    if (par.body && par.body.r0) par.body.r = par.body.r0;
    walkAnim(par, false);
    if (on) { par.p.pose = { sleep: par.who === 'mom' ? 1 : -1, bed: par.bed }; par.p.gaze = null; }
  }
  // Dad's arm comes out once a night, a minute or two in; Mom's from under the quilt once the house has split them
  PAR.dad.armOutT = on ? 60 + Math.random() * 90 : Infinity;
  const stance = typeof story.stance === 'function' ? (() => { try { return story.stance(n); } catch (e) { return null; } })() : null;
  PAR.mom.armOutT = on && ['Split', 'Believe'].includes(stance) ? 90 + Math.random() * 120 : Infinity;
  // night eight: Mom is not in the bed at all
  if (on && n === 8) { G.mom.group.visible = false; PAR.mom.inBed = false; PAR.mom.st = 'away'; const b = bedOf(); if (b) b.one('mom', false); }
  Object.assign(stats, { said: [], states: [], maxPen: 0, penAt: null, walks: 0, up: null, rolls: { mom: 0, dad: 0 }, armOuts: { mom: 0, dad: 0 }, eSeenWhileUp: false, firstGoal: null, enteredAt: null, arrivedAt: null, foundAt: null, lookedIn: 0, momAtDoor: null, momSat: null, handoff: null, mutters: 0 });
  if (G.lights && G.lights.movers) for (const par of Object.values(PAR)) { const i = G.lights.movers.indexOf(par.p.group); if (i >= 0) G.lights.movers.splice(i, 1); }
}
// what each of them is doing
export function state(who) { const par = PAR[who]; return par ? par.st : null; }
export const ledger = () => LEDGER.N;

// ---------- install ----------
export function install(game) {
  G = game;
  PAR.mom = makePar('mom'); PAR.dad = makePar('dad');
  const d = game.W.doors.parents; if (d) DOOR = { x: d.mid.x, z: d.mid.z };
  // Dad's torch on his nightstand, through the world's plugin hook
  if (game.W.plugin) game.W.plugin((ctx) => { torch = buildTorch(ctx); });
  // the torch, as the rest of the game sees it: visible while its beam is on (Mom never carries one)
  game.W.dadTorch = { get visible() { return !!(torch && torch.on); }, get held() { return !!(torch && torch.held); }, get prop() { return torch && torch.group; }, get light() { return game.lights && game.lights.torch; } };
  // the quilt follows each of them (their limbs as capsules), and is worked out less often while nobody could see it
  const bed = game.W.bedSleepers;
  if (bed) {
    bed.hull('mom', hullOf(PAR.mom)); bed.hull('dad', hullOf(PAR.dad));
    bed.idle = () => { if (test.force) return false; const c = game.camera.position, b = bed.group.getWorldPosition(_b); return Math.hypot(c.x - b.x, c.z - b.z) > 11; };
  }
  // the real Mom's eyes rest on you (the camera) after a line
  game.mom.youAt = game.camera.position; game.dad.youAt = game.camera.position;
  if (typeof fetch === 'function') fetch('assets/audio/lines.json').then((r) => r.json()).then((j) => { LINES = j; }).catch(() => {});
  // the night's own cleanup: whatever happens to the night, they are back in bed and the torch on the nightstand
  if (game.F.phase === 'night') laid(true);
}

// ---------- for the tests ----------
export const test = {
  force: false,
  stats, PAR, LEDGER, get T() { return T; }, get torch() { return torch; }, DOOR: () => DOOR,
  set(v) { LEDGER.N = v; },
  // straight to a wake, as if the ledger had crossed its line
  wake(who = 'dad', at = null) { const par = PAR[who]; if (!par || anyUp()) return false; if (at) noise(0.001, at, 'test'); if (who === 'dad') { par.st = 'up'; upDad(par, at ? { at } : null); } else { par.st = 'up'; upMom(par); } return true; },
  plan: (who, x, z) => { const pl = plan(PAR[who], { x, z }); return pl ? (pl.door ? { door: pl.door.name } : { pts: pl.pts }) : null; },
  // poses for the contact scenes (the frame stopped): sit up by k, roll by k of the way onto the side, the swing out of bed at u
  bedPose(who, { sit = 0, roll = 0, arm = 0 } = {}) {
    const par = PAR[who]; par.inBed = true; par.p.sleeping = true; par.rolling = null; par.armOutRun = null; par.st = 'asleep';
    par.sit = sit; par.roll = roll; par.shift = Math.sign(roll) * SHIFT * Math.min(1, Math.abs(roll) / ROLL); par.armOut.L = par.armOut.R = 0; par.armOut[who === 'dad' ? 'L' : 'R'] = arm;
    bedTick(par, 0);
  },
  swing(who, u) { const par = PAR[who]; if (!par.pelvis0 && par.p.rig) { par.pelvis0 = par.p.rig.bones.Pelvis.getWorldPosition(new V3()); par.pelvisBed = bedOf().toLocal(par.pelvis0.clone()); bedOf().one(who, false); } par.inBed = true; par.swing = true; par.p.sleeping = true; swingPose(par, u); },
  seated(who, h) { const par = PAR[who]; par.swing = false; par.bed.legs = null; par.bed.arms = { L: null, R: null }; seated(par, h); },
  stepOut(who, k) { stepAt(PAR[who], k); },
  bunkSeat: () => bunkSeat(),
  onBunk(k = 1) { const par = PAR.mom; par.inBed = false; par.p.sleeping = false; par.p.busy = true; par.p.group.visible = true; sitOnBunk(par, k, bunkSeat().stand); },
  // a parent stood at (x, z) facing yaw, walking (or still), Dad's torch in his hand and lit
  standAt(who, x, z, yaw, { walk = false, torchLit = who === 'dad' } = {}) {
    const par = PAR[who], p = par.p; par.inBed = false; p.sleeping = false; p.busy = true; p.group.visible = true;
    p.group.rotation.order = 'XYZ'; p.group.rotation.set(0, yaw, 0); p.group.position.set(x, 0, z); p.pose = null; p.sitNow = 0;
    walkAnim(par, walk, 0.8);
    if (who === 'dad' && torch) { torch.held = torchLit; if (torchLit && !torch.on) torchOn(true); if (!torchLit) torchHome(); }
    par.aim = new V3(Math.sin(yaw), -0.42, Math.cos(yaw)); aimTick(par, 0.016);
  },
  follow(who) { const par = PAR[who]; aimTick(par, 0.016); if (who === 'dad') torchFollow(par); },
  aim(who, v) { PAR[who].aimAt = v ? new V3(v.x, v.y || 0, v.z) : null; },
  hand(who, side, at) { const p = PAR[who].p; p.pose = { ...(p.pose || {}) }; if (at) p.pose[side] = { reach: new V3(at.x, at.y, at.z), palm: 'fwd', grip: 0.75 }; else delete p.pose[side]; },
  kidInBed,
  hullOf: (who) => hullOf(PAR[who])(),
  bodyAcross: (who) => bodyAcross(PAR[who]),
};
