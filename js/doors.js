// The doors out of the house at night, the pocket behind it, and the routes a disobedient kid can take.
//
// rule(name, phase, plan, night) -> 'open' | 'locked' | 'chain': what the door does for a hand on the house side of it.
//   front     on its chain every night: it opens 8 cm (d.max 0.04) and stops with a clink; let go and the knob turns back from outside,
//             once a night; on night one Mom hears it through the wall and Dad says nobody's there
//   back      locked, unless the night has sent you out: the blackout (the breaker is in the garage), the basement nightmare (the laundry is
//             down the outside stairs), night six's trap (trap(): it swings open at the click and stays open till dawn), night nine's barn
//             (n9(true) at 2:30) and every night that follows a catch in the trees. When a blackout or the basement is over, it locks again
//             behind you as you come back in (one click)
//   basement  only while the basement nightmare or the blackout is on; garage only while the blackout is
//   nights one and ten: everything locked (the front on its chain)
// A locked door always opens from the far side, the way home: the back door from the stoop, the cellar door from the laundry, the
// garage's side door from inside the garage. Nobody is ever shut out of the house or into a dead end.
// fences(night) -> 'closed' | 'open': the pocket behind the house (the stoop, the cellar stairs, the strip along the west wall and the
//   garage's side door) is closed off by four night strips only on blackout and basement nights, where the way out is a few metres
//   from the door and the night wants you back in. At the strip the kid will not go on: "Not out there.", once a night, his breath up and
//   the flashlight down to half for a few seconds. They are down on night six from the trap, on night nine from 2:30, and all night after
//   a catch in the trees. On night nine the track to the barn is the way, and its edges are soft: a step off it into the trees gets the
//   same line and nothing else stops you.
// The leash: outside where nothing has sent you, the thing is at the door you came out of, 0.6 m out, facing you; it shows itself and
//   comes (sight, then hunt). The trees are the forest's own (js/forest.js) and the leash leaves them to it.
// install(game) registers the strips (W.plugin) and the dawn hook; tick(dt) (hooks.doors.tick, every frame) runs the beats' locks, the
// chain, the refusal, the leash, the catch in the trees and which of the thing's outside paths are joined.
import * as nav from './nav.js';
import { roomAt } from './world.js';

export const EXITS = ['front', 'back', 'basement', 'garage'];
export const CHAIN = 0.04;                 // the front door's open clamp on its chain (8 cm at the latch)
const REFUSE = '<i>Not out there.</i>';
// the four night strips round the pocket (x0, x1, z0, z1): beyond the yard behind the house, its east end, the west side down to the
// garage, and from the garage's front corner to the west wing's front wall
export const STRIPS = [
  [-10.1, 0.0, 7.4, 7.7],
  [-0.3, 0.0, 4.6, 7.7],
  [-10.1, -9.8, -7.3, 7.7],
  [-7.6, -7.3, -7.12, -3.74],
];
// the pocket the strips close (with the garage, the stoop, the cellar stairs and the laundry)
const POCKET = [[-9.85, -0.25, 4.55, 7.45], [-9.85, -7.95, -3.95, 4.7], [-9.85, -7.55, -7.15, -3.7]];
// night nine's way to the barn: the track's corridor, the yard inside the fence, the barn and its pad
const TRACK = [-56, -5, -22, -8], YARD = [-27.3, 27.3, -26.6, 28.3], BARN = [-70, -56, -20.5, -4];
// the trees (js/forest.js has the rules; this is only where a catch counts as one in the trees)
export function inForest(x, z) {
  if (z < -40 && x > -95 && x < 60 && z > -80) return true;
  return x > -95 && x < -27.3 && z > -80 && z < 30 && !(z > -22 && z < -8 && x > -56) && !inside(BARN, x, z);
}
const inside = (r, x, z) => x > r[0] && x < r[1] && z > r[2] && z < r[3];
const OUTDOOR = new Set(['out', 'stoop', 'garage']);
// the side of each door its rule is for (the house side); the far side always opens. out: the outward normal (x, z); y: its floor
const SIDE = {
  front: { out: [0, -1] }, back: { out: [0, 1] }, basement: { out: [0, 1], y: -2.4 }, garage: { out: [0, 1] },
};
// where the thing stands for the leash, by the door you came out of (nav.js: 0.6 m out from each door's middle)
const LEASH = { front: 'frontOut', back: 'backOut', basement: 'cellarOut' };

let G = null, T = 0, LINES = {};
// timers on the game's clock (they stop with the pause and are dropped with the night)
const timers = [];
const after = (sec, fn) => { timers.push({ at: T + sec, fn }); };
const S = {
  plan: null, trap: null, n9: null, beat: null, relock: false, refused: null, knob: null, n1: null, chain: null,
  inside: true, leftBy: null, outT: 0, leashAt: -99, lastLeash: null, deadSeen: false, dim: null, strips: [], log: [],
};

// ---------- the rules ----------
const nightOf = (plan, night) => night || (plan && plan.n) || (G && G.F.night) || 1;
const allLocked = (plan, n) => n <= 1 || n >= 10 || (plan && plan.type === 'finale');
const trapped = (plan) => !!plan && S.trap === plan;
const n9Open = (plan) => !!plan && S.n9 === plan;
const afterForest = (n) => !!(G && G.RUN && G.RUN.forestCaught === n);
const beatOn = (plan, kind) => !!S.beat && S.beat.plan === plan && (!kind || S.beat.kind === kind);
export function rule(name, phase = G && G.F.phase, plan = G && G.F.plan, night) {
  if (!EXITS.includes(name)) return 'open';
  if (phase !== 'night') return 'open';
  if (name === 'front') return 'chain';
  const n = nightOf(plan, night);
  if (allLocked(plan, n)) return 'locked';
  if (name === 'back') return trapped(plan) || n9Open(plan) || afterForest(n) || beatOn(plan) ? 'open' : 'locked';
  if (name === 'basement') return beatOn(plan) ? 'open' : 'locked';
  if (name === 'garage') return beatOn(plan, 'blackout') ? 'open' : 'locked';
  return 'locked';
}
export const doorRule = (name) => rule(name);
// is night n's plan one that wants you back in (the blackout, or the basement nightmare on the table)?
const pocketNight = (plan) => {
  if (!plan) return false;
  if (S.pn && S.pn.plan === plan && S.pn.at === T) return S.pn.v;   // asked by every collision test: once a frame is enough
  const v = plan.type === 'blackout' || !!(plan.events && plan.events.some((e) => e.id === 'nmBasement' && !e.dropped));
  S.pn = { plan, at: T, v }; return v;
};
const fencesFor = (plan, n) => (trapped(plan) || n9Open(plan) || afterForest(n) ? 'open' : pocketNight(plan) ? 'closed' : 'open');
export function fences(night) {
  if (!G) return 'open';
  const F = G.F, n = night ?? F.night, plan = F.plan && F.plan.n === n ? F.plan : (G.nights && G.nights.plan ? safePlan(n) : null);
  return fencesFor(plan, n);
}
const safePlan = (n) => { try { return G.nights.plan(n); } catch (e) { return null; } };
const fencesClosed = () => { if (!G) return false; const F = G.F; return F.phase === 'night' && !!F.plan && F.plan.n === F.night && fencesFor(F.plan, F.night) === 'closed'; };
// what stops a hand on door `name` from `pos` right now: 'locked', 'chain', or null (it opens). The far side always opens.
export function lockFor(name, pos) {
  if (!G || !EXITS.includes(name)) return null;
  const r = rule(name); if (r === 'open') return null;
  if (r === 'chain') return 'chain';
  const d = G.W.doors[name], s = SIDE[name];
  if (d && pos && s && ((pos.x - d.mid.x) * s.out[0] + (pos.z - d.mid.z) * s.out[1]) > 0) return null;
  return r;
}

// ---------- the night's own doors (setPhase calls this for every phase) ----------
// at night the front door goes on its chain and the doors out are shut; after a catch in the trees the back door stands open
export function phase(p) {
  if (!G) return;
  const D = G.W.doors, night = p === 'night';
  if (D.front) D.front.max = night ? CHAIN : 1;
  if (!night) return;
  for (const name of ['back', 'basement', 'garage']) {
    const d = D[name]; if (!d) continue;
    const open = name === 'back' && afterForest(G.F.night);
    d.target = open ? 1 : 0; d.a = open ? Math.min(1, d.max ?? 1) : 0; d.apply();
  }
}

// ---------- what the night's scripts call ----------
// night six: Dad's voice on the phone, and the back door unlatches. It stands open and the yard is open till dawn
export function trap() {
  if (!G || G.F.phase !== 'night' || !G.F.plan) return false;
  S.trap = G.F.plan; unlatch('trap');
  gateOpen(); nav.outside(true);
  G.log.push({ id: 'backOpen', how: 'trap', seen: false, blamed: true, p: { x: G.W.doors.back.mid.x, z: G.W.doors.back.mid.z } });
  return true;
}
// night nine at 2:30: the barn's lamp is lit and the house lets you go to it (n9(false) takes the way back)
export function n9(open = true) {
  if (!G || !G.F.plan) return false;
  if (open) { if (S.n9 === G.F.plan) return true; S.n9 = G.F.plan; unlatch('n9'); gateOpen(); nav.outside(true); }
  else if (S.n9) { S.n9 = null; S.relock = true; }
  return open;
}
// a catch in the trees (js/forest.js calls it; the tick also notices one): the night starts over with the back door open and the yard open
export function caughtInForest(n = G && G.F.night) {
  if (!G || !n) return false;
  G.RUN.forestCaught = n;
  G.log.push({ id: 'forestCaught', seen: true, how: 'caught' });
  return true;
}
function unlatch(how) {
  const W = G.W, d = W.doors.back; if (!d) return;
  if (!d.target) W.setDoor('back', true);
  place('door_lock', d.mid, { gain: 0.7 });
  S.log.push({ t: T, what: 'unlatch', how });
}
function gateOpen() {
  const g = G.W.doors.gate; if (!g) return;
  if (typeof g.setState === 'function') g.setState('open'); else G.W.setDoor('gate', true, true);
}

// ---------- the hand on the door ----------
// a door out of the house that will not open: the chain, or the deadbolt. true when it was one of these (main.js's lockedDoor asks)
let rattleAt = -9;
export function tryDoor(d) {
  if (!G || !d) return false;
  const how = lockFor(d.name, G.P.pos); if (!how) return false;
  const { W, UI, F } = G;
  if (how === 'chain') {
    if (S.chain) return true;
    W.setDoor('front', true, true); place('doorknob', d.mid, { gain: 0.6 });
    after(0.14, () => { if (!place('chain', d.mid, { gain: 0.9 })) place('door_lock', d.mid, { gain: 0.8 }); });   // it stops on the chain
    S.chain = { t: 0, x: G.P.pos.x, z: G.P.pos.z, shut: -1 };
    noise(0.22, d.mid);
    if (!G.log.has || !G.log.has('frontChain')) G.log.push({ id: 'frontChain', seen: true, how: 'door', p: { x: d.mid.x, z: d.mid.z } });   // the rule the journal learns
    return true;
  }
  // the deadbolt: the knob turns a little and stops, the latch knocks in its keeper
  place('doorknob', d.mid, { gain: 0.8 }); after(0.16, () => place('door_lock', d.mid, { gain: 0.35, rate: 1.15 }));
  noise(0.12, d.mid);
  if (T - rattleAt > 6) UI.subtitle("<i>It's locked.</i>", 1.8);
  rattleAt = T;
  return true;
}
// the chain: let go (step back, or after a few seconds) and the door goes to; then, once a night, the knob turns back from outside
function chainTick(dt) {
  const c = S.chain; if (!c) return;
  const { W, P, F } = G;
  c.t += dt;
  if (c.shut < 0 && c.t > 0.7 && (Math.hypot(P.pos.x - c.x, P.pos.z - c.z) > 0.6 || c.t > 3 || P.mode !== 'walk')) { W.setDoor('front', false); c.shut = c.t; }
  if (c.shut >= 0 && c.t > c.shut + 0.9) {
    S.chain = null;
    if (S.knob === F.plan || F.phase !== 'night') return;
    S.knob = F.plan;
    const at = { x: 3.1, y: 1.2, z: -5.0 };
    if (!place('doorknob', at, { gain: 0.9, rate: 0.92 })) place('knock', at, { gain: 0.5, maxLen: 1 });
    S.log.push({ t: T, what: 'knob' });
    if ((F.night || 0) <= 1 && S.n1 !== F.plan) { S.n1 = F.plan; after(1.3, () => throughWall('mom/door_a', () => after(0.7, () => throughWall('dad/door_a')))); }
  }
}

// ---------- the beats that send you out, and the lock behind you ----------
const mainHouse = (room) => !OUTDOOR.has(room) && room !== 'laundry';
function beatsTick() {
  const { F, W, P } = G, plan = F.plan;
  const drum = !!(W.laundry && W.laundry.drum && W.laundry.drum.spinning);
  if (!S.beat && plan && F.live) {
    if (F.blackout) S.beat = { kind: 'blackout', plan, live: true };
    else if (drum) S.beat = { kind: 'basement', plan, live: true };
  }
  const b = S.beat;
  if (b && b.live && ((b.kind === 'blackout' && !F.blackout) || (b.kind === 'basement' && !drum))) { b.live = false; S.relock = true; }
  if (S.relock && !(b && b.live)) {
    const room = roomAt(P.pos.x, P.pos.z, P.pos.y), d = W.doors.back;
    if (mainHouse(room) && P.mode !== 'cine' && d && Math.hypot(P.pos.x - d.mid.x, P.pos.z - d.mid.z) > 1.3) relock();
  }
}
function relock() {
  const { W } = G, d = W.doors.back;
  S.relock = false; S.beat = null;
  if (rule('back') === 'open') return;   // the night still wants it open (the trap, the barn, after the trees)
  const wasOpen = !!(d && d.target);
  if (wasOpen) W.setDoor('back', false);
  for (const name of ['basement', 'garage']) if (W.doors[name] && W.doors[name].target) W.setDoor(name, false, true);
  if (d) after(wasOpen ? 0.9 : 0.15, () => place('door_lock', d.mid, { gain: 0.75 }));   // from the inside, behind you: one click
  S.log.push({ t: T, what: 'relock' });
}

// ---------- the kid will not go on ----------
const boxGap = (c, x, z) => Math.hypot(Math.max(c.minX - x, 0, x - c.maxX), Math.max(c.minZ - z, 0, z - c.maxZ));
function offTrack(x, z) { return x < -27.3 && x > -95 && z > -80 && z < 30 && !inside(TRACK, x, z) && !inside(BARN, x, z); }
function refusalTick() {
  const { F, P } = G;
  if (!F.plan || S.refused === F.plan || P.mode !== 'walk' || F.cutscene || F.dead) return;
  let how = null;
  if (fencesClosed()) for (const c of S.strips) if ((P.pos.y > -1) && boxGap(c, P.pos.x, P.pos.z) < 0.28 + 0.06) { how = 'fence'; break; }
  if (!how && n9Open(F.plan) && offTrack(P.pos.x, P.pos.z)) how = 'track';
  if (how) refuse(how);
}
export function refuse(how = 'fence') {
  const { F, UI, sfx } = G;
  S.refused = F.plan;
  UI.subtitle(REFUSE, 2.6);
  F.fear = Math.max(F.fear || 0, 0.65);
  if (sfx.breath) sfx.breath(true, 0.2);
  S.dim = { t: 0 };
  G.log.push({ id: 'refused', seen: true, how });
  S.log.push({ t: T, what: 'refuse', how });
}
// the flashlight sags to half for eight seconds and comes back over two (the beam in the hand: the spot light on the camera)
let torch = null;
export const torchK = () => (S.dim ? (S.dim.t < 8 ? 0.5 : Math.min(1, 0.5 + (S.dim.t - 8) / 2)) : 1);
function dimTick(dt) {
  const d = S.dim; if (!d) return;
  if (!torch) torch = G.camera.children.find((o) => o.isSpotLight) || null;
  d.t += dt;
  const k = torchK(), on = !!torch && G.F.flashOn && torch.intensity > 0;
  if (on && !d.base) d.base = torch.intensity;   // the lamp's own level, the first time it is seen lit
  if (on) torch.intensity = d.base * k;
  if (k >= 1) S.dim = null;
}

// ---------- the leash ----------
const OUTSIDE_IDS = new Set(Object.keys(nav.OUTSIDE));
// out where nothing has sent you: not the pocket while a beat has you out there, not night nine's way to the barn
function sanctioned(x, z, y) {
  const F = G.F, plan = F.plan, room = roomAt(x, z, y);
  if (!OUTDOOR.has(room)) return true;
  if (beatOn(plan) && (room === 'stoop' || room === 'garage' || POCKET.some((r) => inside(r, x, z)))) return true;
  if (n9Open(plan) && (inside(YARD, x, z) || inside(TRACK, x, z) || inside(BARN, x, z))) return true;
  return false;
}
// the door out nearest a point (on its floor): the one you came out of
function nearestExit(p) {
  let best = 'back', bd = 1e9;
  for (const name of ['front', 'back', 'basement']) {
    const d = G.W.doors[name]; if (!d) continue;
    const dy = (p.y < -1) !== ((SIDE[name].y || 0) < -1) ? 6 : 0, dd = Math.hypot(p.x - d.mid.x, p.z - d.mid.z) + dy;
    if (dd < bd) { bd = dd; best = name; }
  }
  return best;
}
export function leashSpot(name) { const id = LEASH[name] || 'backOut', [x, z, y = 0] = nav.NODES[id]; return { id, x, y, z }; }
const quietType = (plan) => !plan || ['poltergeist', 'vigil', 'car', 'finale'].includes(plan.type);
function leashTick(dt) {
  const { F, P, hunter, gaze, events } = G;
  const room = roomAt(P.pos.x, P.pos.z, P.pos.y);
  if (!OUTDOOR.has(room)) { S.inside = true; S.outT = 0; return; }
  if (S.inside) { S.inside = false; S.leftBy = nearestExit(P.pos); }
  if (!F.live || F.dead || F.cutscene || F.script || P.mode !== 'walk' || (F.night || 0) <= 1 || quietType(F.plan)) { S.outT = 0; return; }
  if (sanctioned(P.pos.x, P.pos.z, P.pos.y) || inForest(P.pos.x, P.pos.z)) { S.outT = 0; return; }
  S.outT += dt;
  if (!hunter || hunter.state === 'hunt' || T - S.leashAt < 20 || S.outT < 0.4) return;
  if (events && events.RES && (events.RES.isHeld('E') || events.RES.isHeld('stage'))) return;   // a beat of the night has it
  const door = S.leftBy || nearestExit(P.pos), spot = leashSpot(door);
  if (gaze && gaze.onScreen && S.outT < 1.4 && gaze.onScreen({ x: spot.x, y: spot.y + 1.6, z: spot.z })) return;   // out of view, if it can be
  leash(door);
}
export function leash(door = 'back') {
  const { hunter, E, P, F } = G, spot = leashSpot(door);
  nav.outside(true);
  if (hunter.state !== 'away') hunter.vanish(false);
  hunter.sight(spot.id, { dur: 3, lookTime: 0.6, then: 'hunt', chase: true, chaseDist: 2.4, tilt: 0.35 });
  E.root.position.set(spot.x, spot.y, spot.z); E.faceTowards(P.pos.x, P.pos.z, 1);
  S.leashAt = T; S.outT = 0;
  S.lastLeash = { door, at: { x: spot.x, y: spot.y, z: spot.z }, player: { x: P.pos.x, z: P.pos.z }, t: T, night: F.night };
  G.log.push({ id: 'leash', seen: false, how: door, p: { x: spot.x, z: spot.z } });
  return S.lastLeash;
}

// the thing's outside paths are joined while the night is out there: the player is out, it is out after them, or the night opened it
function navTick() {
  const { F, P, hunter } = G;
  const out = OUTDOOR.has(roomAt(P.pos.x, P.pos.z, P.pos.y)), plan = F.plan;
  const thingOut = !!hunter && hunter.state !== 'away' && OUTSIDE_IDS.has(hunter.S.node);
  nav.outside(F.phase === 'night' && (out || thingOut || trapped(plan) || n9Open(plan) || afterForest(F.night)));
}

// a catch out in the trees: the night starts over with the back door open
function forestCatchTick() {
  const { F, P } = G;
  if (!F.dead) { S.deadSeen = false; return; }
  if (S.deadSeen) return;
  S.deadSeen = true;
  if (F.phase === 'night' && inForest(P.pos.x, P.pos.z)) caughtInForest(F.night);
}

// ---------- sound, the parents, the voices through the wall ----------
function place(key, at, o = {}) { try { return G.sfx.pick ? G.sfx.pick(key, { at: { x: at.x, y: at.y ?? 1.0, z: at.z }, wet: 0.15, ...o }) : 0; } catch (e) { return 0; } }
function noise(v, at) { try { const p = G.hooks && G.hooks.parents; if (p && typeof p.noise === 'function') p.noise(v, { x: at.x, z: at.z, y: 0 }, 'door'); } catch (e) { /* the parents are not listening */ } }
// a line from Mom and Dad's bed, muffled by the wall, with its words on screen
function throughWall(id, then) {
  const { sfx, UI, W, F } = G;
  if (F.phase !== 'night') return;
  const l = LINES[id] || { html: id, voice: id.split('/')[0] }, who = l.voice === 'dad' ? 'dad' : 'mom';
  const bed = (W.parentsBed && W.parentsBed[who]) || { x: -5.2, y: 0.6, z: 0.75 };
  let d = 0;
  try { d = sfx.play ? sfx.play('vo/' + id, { gain: 1.2, pan: { at: { x: bed.x, y: (bed.y || 0.5) + 0.3, z: bed.z } }, wet: 0.25, muffle: true }) : 0; } catch (e) { d = 0; }
  const text = l.html.replace(/<[^>]+>/g, '');
  if (!d && sfx.mumble) { d = Math.max(1.6, 0.8 + text.length / 15); try { sfx.mumble(who, d, { muffle: true }); } catch (e) { /* no murmur */ } }
  UI.subtitle(l.html, Math.max(2.4, (d || 2) + 0.6), d ? 'speech' : null);
  S.log.push({ t: T, what: 'line', id });
  if (then) after((d || 2) + 0.4, then);
}

// ---------- the frame ----------
export function tick(dt) {
  if (!G) return;
  T += dt;
  for (let i = timers.length - 1; i >= 0; i--) if (timers[i].at <= T) { const t = timers.splice(i, 1)[0]; try { t.fn(); } catch (e) { console.warn('doors: a timer failed', e); } }
  const F = G.F;
  if (F.plan !== S.plan) {   // a new night (freeNight hands every night, and every retry, a fresh plan)
    S.plan = F.plan; S.beat = null; S.relock = false; S.chain = null; S.leftBy = null; S.outT = 0; S.leashAt = -99; timers.length = 0;
    if (F.plan && (F.night || 0) >= 6) gateOpen();
  }
  if (F.phase === 'night') {
    const fr = G.W.doors.front; if (fr && fr.max !== CHAIN) fr.max = CHAIN;
    beatsTick(); chainTick(dt); refusalTick(); forestCatchTick(); leashTick(dt); navTick();
  } else if (nav.outsideJoined()) nav.outside(false);
  dimTick(dt);
}

export function install(game) {
  G = game;
  // the pocket's four strips, on only at night and only while the night wants you back in
  game.W.plugin((ctx) => {
    S.strips = STRIPS.map(([x0, x1, z0, z1], i) => ctx.solid(x0, x1, z0, z1, { night: true, when: fencesClosed, maxY: 2.0, id: 'pocketFence' + (i + 1), fence: true }));
  });
  if (game.events && game.events.NIGHT) game.events.NIGHT.onDawn.push((n) => {
    if (game.RUN.forestCaught === n) delete game.RUN.forestCaught;
    S.trap = S.n9 = null; S.beat = null; S.relock = false;
  });
  if (typeof fetch === 'function') fetch('assets/audio/lines.json').then((r) => r.json()).then((j) => { LINES = j; }).catch(() => {});
}

// for the tests: the state, read-only, and the log of what the doors did
export const test = {
  get state() { return { trap: !!S.trap && S.trap === (G && G.F.plan), n9: !!S.n9 && S.n9 === (G && G.F.plan), beat: S.beat && { kind: S.beat.kind, live: S.beat.live }, relock: S.relock, refused: !!S.refused && S.refused === (G && G.F.plan), leftBy: S.leftBy, lastLeash: S.lastLeash, outsideJoined: nav.outsideJoined(), torchK: torchK(), fences: G ? fences(G.F.night) : null }; },
  log: () => S.log.slice(),
  strips: () => S.strips.slice(),
  inForest, sanctioned: (x, z, y = 0) => sanctioned(x, z, y), nearestExit: (p) => nearestExit(p),
};
