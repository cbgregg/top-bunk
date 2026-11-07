// The night engine: one event shape, one scheduler, a resource table and a cleanup list for every night thing.
//
// An event is registered once, at install, and looks like this (nights.js's D is the context every function gets):
//   { id, tier: 'whisper'|'wrong'|'presence'|'loud', minN, maxN, w, once,
//     anchor,            node id | {x,z} | 'behindPlayer' | 'door:<name>' | 'window:nearest' | 'parentsBed' | 'table' | 'bunk' | (D, h) => point
//     uses: [...],       the resources it needs free while it is up: 'E', 'stage', 'watch', 'door:kid', 'tv', 'phone', 'parents', 'bunk', ...
//     noise: 0..1,       what the ledger hears when the payoff lands (a loud event must say)
//     pre(D),            may it ARM now (room, distance, states): the engine adds the quiet curve, the tier caps, the resources and law 2
//     arm(D) -> h,       the silent change, out of view; returns a handle (or nothing to decline); h.ready === false holds the reveal off,
//                        h.done = true ends the beat
//     reveal: { by: 'look'|'approach'|'open'|'flip'|'leaveRoom'|'enterRoom'|'lean'|'photo'|'hold'|'watch', at, minDot, hold, within, when(D, h) },
//     payoff(D, h, how), what the player gets for the reveal: placed sound at the anchor, a sting only for presence/loud
//     after: { keep, proof, log, morning, journal, witness, blamed },
//     max: seconds,      armed and unseen this long: undo() quietly, never a payoff (0: no expiry)
//     linger: seconds,   after the payoff: a kept beat (after.keep) leaves the table at once (0) and its change stays; any other beat
//                        lives until its handle says done (h.done), `linger` at most (thirty by default), and is undone then
//     undo(h),           put the house back; registered on NIGHT.cleanup at the arm, so a catch, a restart and the dawn all run it
//     while(D, h)?,      optional: false while armed and unseen means the moment has passed (undo quietly, like max)
//     tick(D, h, dt)?,   optional: per frame while the beat is up
//     end(D, h, seen)?,  optional: told when the beat leaves the table, seen or not
//     chain?,            true: may arm right after another beat (no quiet gap), e.g. the breath under the bunk following the dent
//     rooms?             the rooms it fits (data for the night-one test) }
// A timer only ever makes a beat ready: `reveal.by` is never a clock, and `max` only un-arms.
//
// The scheduler (update, every frame from main.js): expire what is stale, test every armed beat's reveal, then arm the next ready one when
// the house is settled (gaze.settled(gap): the quiet curve, 70 - 5n +- 12 s on nights two to four, 45 - 3(n - 4) +- 10 from five, floor 22),
// under the tier caps (whisper 4 + n/2, wrong 2 + n/2, presence 1 + n/3 with a floor of one arm from night two, loud 1 with two quiet reveals
// between loud ones; presence and loud fifteen seconds after any reveal), with every resource it uses free, and never with its anchor on
// screen or seen in the last two seconds (law 2). The director's seeded plan is a budget: an id it lists is not ready before its minute.
// Law 8: an encounter needs a seen entry in the last ninety seconds of the ledger, or a player who has lain still in the bunk a minute with
// the hall light off (chainSeen).
import { NODES } from './nav.js';
import * as log from './log.js';

const TIERS = ['whisper', 'wrong', 'presence', 'loud'];
const DEFS = new Map(), ANCHORS = new Map(), ACTIVE = [], LAST = new Map();   // LAST: each id's latest arm, for the tests' undo after it has finished
let G = null, D = null, gaze = null, T = 0;

// ---- the resource table: a beat cannot arm while a resource it uses is held by anything else ----
export const RES = {
  held: Object.create(null),
  hold(name, owner = 'game') { if (RES.held[name] && RES.held[name] !== owner) return false; RES.held[name] = owner; return true; },
  free(name, owner) { if (!RES.held[name]) return; if (owner && RES.held[name] !== owner) return; delete RES.held[name]; },
  isHeld(name, me) { const o = RES.held[name]; return !!o && o !== me; },
  who(name) { return RES.held[name] || null; },
  clear() { for (const k in RES.held) delete RES.held[k]; },
};
// ---- the night's book-keeping, the cleanup list (run by killAll, resetNight, freeNight and dawn) and the dawn hooks ----
export const NIGHT = {
  on: false, n: 0, plan: null, cleanup: [], onDawn: [], counts: {}, played: new Set(), arms: [], reveals: [], drops: [],
  lastReveal: -99, lastLoud: -99, lastArm: -99, lastEnd: -99, lastTry: -99, lastLegacy: false, quietSince: 0, gap: 30, gapScale: 1, suspended: false, photoAt: -99,
};

// ---- registration ----
export function register(def) {
  if (!def || !def.id) { console.warn('events.register: an event needs an id'); return null; }
  if (!TIERS.includes(def.tier)) console.warn(`events.register: ${def.id} has no tier (${def.tier})`);
  if (DEFS.has(def.id)) console.warn(`events.register: ${def.id} registered twice; the later one wins`);
  DEFS.set(def.id, def);
  return def;
}
export const get = (id) => DEFS.get(id);
export const defs = () => [...DEFS.values()];
export function anchor(name, fn) { ANCHORS.set(name, fn); }

export function install(game) {
  G = game; D = game.nights && game.nights.D; gaze = game.gaze || (game.nights && game.nights.stage && game.nights.stage.gaze);
  log.install(game);
  if (game.UI && game.UI.bindFlags) game.UI.bindFlags(game.F);
  // the perception gate `heard` listens to every placed sound: sfx.pick with an `at` tells the gaze where it played
  const sfx = game.sfx;
  if (sfx && typeof sfx.pick === 'function' && !sfx.__gazeHook) {
    const pick0 = sfx.pick.bind(sfx);
    sfx.pick = (key, o) => { if (o && o.at && gaze) gaze.notePlaced(o.at, key); return pick0(key, o); };
    sfx.__gazeHook = true;
  }
}

// ---- helpers ----
const F = () => G.F, P = () => G.P, W = () => G.W;
const cap = (tier, n) => (n <= 1 ? Infinity : tier === 'whisper' ? 4 + Math.floor(n / 2) : tier === 'wrong' ? 2 + Math.floor(n / 2) : tier === 'presence' ? 1 + Math.floor(n / 3) : 1);
function drawGap(n) {
  const r = D && D.r ? D.r() : Math.random();
  const g = n <= 1 ? 14 : n <= 4 ? 70 - 5 * n + (r * 24 - 12) : 45 - 3 * (n - 4) + (r * 20 - 10);
  return Math.max(n <= 1 ? 0 : 22, g) * NIGHT.gapScale;
}
const hallLit = () => !!(G.lights && G.lights.isOn && G.lights.isOn('hall'));
// law 8: the thing is the end of a chain
export const chainSeen = () => log.recent(90).some((e) => e.seen) || (gaze && gaze.inBunkFor() >= 60 && !hallLit());
// the presence floor: from night two, until something of the presence tier has armed, past the first third of the night
function presenceFloor() {
  if (NIGHT.n < 2 || (NIGHT.counts.presence || 0) > 0 || !NIGHT.plan) return false;
  const c0 = NIGHT.plan.clock0 || 0; return (F().clock - c0) / Math.max(1, 360 - c0) >= 0.35;
}
function point(an, h) {
  if (!an) return null;
  if (typeof an === 'function') return an(D, h);
  if (typeof an === 'object') return { x: an.x, z: an.z, y: an.y || 0 };
  if (ANCHORS.has(an)) return ANCHORS.get(an)(D, h);
  if (an === 'behindPlayer') return h && h.p ? { x: h.p.x, z: h.p.z, y: h.p.y || 0 } : null;
  if (an.startsWith('door:')) { const d = W().doors[an.slice(5)]; return d ? { x: d.mid.x, z: d.mid.z, y: 0 } : null; }
  if (an === 'parentsBed') { const pb = W().parentsBed; return pb ? { x: (pb.mom.x + pb.dad.x) / 2, z: (pb.mom.z + pb.dad.z) / 2, y: 0.75 } : { x: -6.9, z: 0.1, y: 0.75 }; }
  if (an === 'bunk') return { x: 8.42, z: 3.72, y: 0.62 };
  if (an === 'table') { const C = W().chairs || []; if (!C.length) return { x: 1.18, z: 1.4, y: 0.75 }; let x = 0, z = 0; for (const c of C) { x += c.holder.position.x; z += c.holder.position.z; } return { x: x / C.length, z: z / C.length, y: 0.75 }; }
  if (an === 'window:nearest') return D && D.nearestWindow ? D.nearestWindow() : null;
  if (NODES[an]) return { x: NODES[an][0], z: NODES[an][1], y: NODES[an][2] || 0 };
  return null;
}
const anchorOf = (def, h) => point(def.anchor, h);
const revealAt = (a) => { const r = a.def.reveal; const p = r && r.at !== undefined ? point(r.at, a.h) : null; return p || anchorOf(a.def, a.h) || a.at; };
const dist = (p) => (p ? Math.hypot(P().pos.x - p.x, P().pos.z - p.z) : Infinity);
const floorPt = (p) => ({ x: p.x, z: p.z, y: p.floor || 0 });
const lookingAt = (p, minDot) => !!p && gaze.inView(floorPt(p), 0.8) && gaze.facing(p) > minDot;

// ---- the resources other systems hold without saying so: polled every frame ----
function pollResources() {
  const poll = (name, owner, on) => { if (on) { if (!RES.held[name]) RES.held[name] = owner; } else if (RES.held[name] === owner) delete RES.held[name]; };
  const H = G.hunter; poll('E', 'hunter', !!(H && H.busy));
  poll('tv', 'tv', !!(W().tvFx && W().tvFx.on));
  poll('phone', 'phone', !!(W().phone && W().phone.ringing));
  const ST = G.nights && G.nights.stage && G.nights.stage.ST; poll('stage', 'stage', !!(ST && ST.on));
}

// ---- arming ----
function eligible(def, quiet) {
  const n = NIGHT.n;
  if (def.minN && n < def.minN) return false;
  if (def.maxN && n > def.maxN) return false;
  if (ACTIVE.some((a) => a.def === def && !a.done)) return false;
  if (def.once && NIGHT.played.has(def.id)) return false;
  if (def.chain ? !gaze.settled(0) && !(def.chain === 'free' && freeNow()) : !quiet) return false;
  if ((NIGHT.counts[def.tier] || 0) >= cap(def.tier, n)) return false;
  if (def.tier === 'loud' && NIGHT.quietSince < 2) return false;
  if ((def.tier === 'presence' || def.tier === 'loud') && T - NIGHT.lastReveal < 15) return false;
  if (!ready(def.id)) return false;
  if ((def.uses || []).some((r) => RES.isHeld(r, def.id))) return false;
  if (def.pre && !def.pre(D)) return false;
  return true;
}
const freeNow = () => { const f = F(); return !f.script && !f.cutscene && !f.dead && P().mode !== 'cine'; };
function tryArm(def, { force = false } = {}) {
  const at = anchorOf(def, null);
  // law 2: armed out of view. A beat that reacts while you watch it (the watch resource) is the one kind that arms in view
  if (!force && at && !(def.reveal && def.reveal.by === 'watch') && (gaze.onScreen(floorPt(at), 0.9) || gaze.sawRecently(floorPt(at), 2))) return false;
  const settledAtArm = gaze.settled(NIGHT.gap);
  let h;
  try { h = def.arm(D); } catch (e) { console.warn('event failed to arm', def.id, e); return false; }
  if (h === false || h === null || h === undefined) return false;
  if (typeof h !== 'object') h = { value: h };
  const a = { def, h, armedAt: T, at: anchorOf(def, h) || at, revealedAt: 0, how: null, done: false, undone: false, holdT: 0, watchT: 0, settledAtArm };
  for (const r of def.uses || []) RES.hold(r, def.id);
  ACTIVE.push(a); LAST.set(def.id, a);
  NIGHT.counts[def.tier] = (NIGHT.counts[def.tier] || 0) + 1;
  NIGHT.arms.push({ id: def.id, tier: def.tier, at: T, clock: Math.round(F().clock), settled: a.settledAtArm });
  NIGHT.played.add(def.id); NIGHT.lastArm = T; NIGHT.lastLegacy = false; NIGHT.gap = drawGap(NIGHT.n);
  NIGHT.cleanup.push(() => undoOnce(a));
  return true;
}
function tryArmNext() {
  const floorOn = presenceFloor(), need = floorOn ? NIGHT.gap * 0.5 : NIGHT.gap;
  const quiet = gaze.settled(need) && T - NIGHT.lastArm >= need;
  const cands = [];
  for (const def of DEFS.values()) {
    if (!eligible(def, quiet)) continue;
    let w = def.w || 1; if (planned(def.id)) w *= 3; if (floorOn && def.tier === 'presence') w *= 4;
    cands.push([def, w]);
  }
  // weighted order: the first drawn, then the rest by weight, so a beat that declines (its own arm said no) hands over to the next
  const order = [];
  while (cands.length) {
    let tot = 0; for (const [, w] of cands) tot += w;
    let x = (D && D.r ? D.r() : Math.random()) * tot, i = 0;
    for (; i < cands.length; i++) { if ((x -= cands[i][1]) <= 0) break; }
    order.push(cands.splice(Math.min(i, cands.length - 1), 1)[0][0]);
  }
  for (const def of order) if (tryArm(def)) return true;
  return false;
}

// ---- the reveal ----
function checkReveal(a, dt) {
  const r = a.def.reveal, h = a.h; if (!r) return;
  if (h && h.ready === false) return;
  const p = revealAt(a);
  if (r.within && r.by !== 'approach' && dist(p) > r.within) return;
  const when = r.when ? !!r.when(D, h) : null;
  switch (r.by) {
    case 'look': if (when === null ? lookingAt(p, r.minDot ?? 0.8) : when) reveal(a, 'look'); break;
    case 'approach': if (when === null ? dist(p) <= (r.within ?? 1.5) : when) reveal(a, 'approach'); break;
    case 'open': if (when === null ? gaze.openedAt(r.door || (typeof a.def.anchor === 'string' && a.def.anchor.startsWith('door:') ? a.def.anchor.slice(5) : '')) > a.armedAt : when) reveal(a, 'open'); break;
    case 'flip': if (when === null ? gaze.flippedAt(r.room, r.on) > a.armedAt : when) reveal(a, 'flip'); break;
    case 'leaveRoom': if (when === null ? gaze.leftRoom(r.room) <= T - a.armedAt : when) reveal(a, 'leaveRoom'); break;
    case 'enterRoom': if (when === null ? gaze.enteredRoom(r.room) <= T - a.armedAt : when) reveal(a, 'enterRoom'); break;
    case 'lean': if (when === null ? (F().leanK || 0) > (r.minDot ?? 0.65) : when) reveal(a, 'lean'); break;
    case 'photo': if (when === null ? NIGHT.photoAt > a.armedAt : when) reveal(a, 'photo'); break;
    case 'hold': { const ok = when === null ? (r.within ? dist(p) <= r.within : true) : when; a.holdT = ok ? a.holdT + dt : 0; if (a.holdT >= (r.hold ?? 1)) reveal(a, 'hold'); break; }
    case 'watch': { const ok = when === null ? lookingAt(p, r.minDot ?? 0.8) : when; a.watchT = ok ? a.watchT + dt : 0; if (a.watchT >= (r.hold ?? 1)) reveal(a, 'watch'); break; }
    default: if (when) reveal(a, r.by || 'look');
  }
}
export const payoffs = {};
function reveal(a, how) {
  const def = a.def, after = def.after || {};
  a.revealedAt = T; a.how = how; NIGHT.lastReveal = T; NIGHT.lastEnd = T; gaze.markEnd();
  NIGHT.reveals.push({ id: def.id, tier: def.tier, how, at: T, clock: Math.round(F().clock), settledAtArm: a.settledAtArm });
  if (def.tier === 'loud') { NIGHT.lastLoud = T; NIGHT.quietSince = 0; } else NIGHT.quietSince++;
  if (def.tier === 'presence' || def.tier === 'loud') gaze.markBusy();
  payoffs[def.id] = (payoffs[def.id] || 0) + 1;
  try { def.payoff(D, a.h, how); } catch (e) { console.warn('event payoff failed', def.id, e); }
  // the row is written now and brought up to date when the beat ends (a beat's own extras, logExtra, can still be counting)
  a.row = log.push({ id: def.id, tier: def.tier, seen: true, how, p: a.at ? { x: Math.round(a.at.x * 100) / 100, z: Math.round(a.at.z * 100) / 100 } : undefined, noise: def.noise || 0, witness: after.witness || 0, blamed: after.blamed || 0, journal: after.journal, morning: after.morning, ...extra(a) });
  if (after.proof && D && D.fired) { try { D.fired(def.id); } catch (e) { /* no proof tonight */ } }
  if (def.noise && G.hooks && G.hooks.parents && typeof G.hooks.parents.noise === 'function') { try { G.hooks.parents.noise(def.noise, a.at); } catch (e) { /* the parents are not written yet */ } }
  if (G.RUN && G.RUN.story) { if (after.witness) G.RUN.story.witness = (G.RUN.story.witness || 0) + after.witness; if (after.blamed) G.RUN.story.blamed = (G.RUN.story.blamed || 0) + after.blamed; }
  // after the payoff: a kept change leaves the table now (its undo waits for the night's cleanup); any other beat has until its handle
  // says done to finish what the payoff began (a door shutting while you watch, a breath keeping its rhythm), `linger` seconds at most,
  // thirty by default, and is undone then
  a.endAt = T + (after.keep ? (def.linger || 0) : (def.linger ?? 30));
}
const extra = (a) => { if (!a.def.logExtra) return {}; try { return a.def.logExtra(a.h) || {}; } catch (e) { return {}; } };
function undoOnce(a) {
  if (a.undone) return; a.undone = true;
  try { if (a.def.undo) a.def.undo(a.h); } catch (e) { console.warn('event undo failed', a.def.id, e); }
}
function release(a) {
  for (const r of a.def.uses || []) RES.free(r, a.def.id);
  const i = ACTIVE.indexOf(a); if (i >= 0) ACTIVE.splice(i, 1);
}
function finishActive(a, how, { undo = true } = {}) {
  if (a.done) return; a.done = true;
  if (!a.revealedAt) log.push({ id: a.def.id, tier: a.def.tier, seen: false, how: how || 'unseen', ...extra(a) });
  else if (a.row) Object.assign(a.row, extra(a));
  if (undo && !(a.def.after && a.def.after.keep)) undoOnce(a);
  release(a); NIGHT.lastEnd = T; gaze.markEnd();
  if (a.def.end) { try { a.def.end(D, a.h, !!a.revealedAt); } catch (e) { console.warn('event end failed', a.def.id, e); } }
}
function drop(a, failed = false) {
  if (a.done) return; a.done = true;
  undoOnce(a); release(a);
  log.push({ id: a.def.id, tier: a.def.tier, seen: false, how: failed ? 'failed' : 'drop', ...extra(a) });
  NIGHT.drops.push({ id: a.def.id, at: T, failed }); NIGHT.lastEnd = T; gaze.markEnd();
  if (a.def.end) { try { a.def.end(D, a.h, false); } catch (e) { /* reported above */ } }
}
export function finish(id, opts) { const a = ACTIVE.find((x) => x.def.id === id && !x.done); if (!a) return false; finishActive(a, 'done', opts); return true; }
export const active = (id) => ACTIVE.find((a) => a.def.id === id && !a.done) || null;

// ---- the frame ----
export function update(dt) {
  log.tick(dt); T += dt;
  if (!G || !NIGHT.on) return;
  const f = F(); if (!f.live || f.dead) return;
  pollResources();
  for (const a of ACTIVE.slice()) {
    if (a.done) continue;
    try {
      if (a.def.tick) a.def.tick(D, a.h, dt);
      if (a.h && a.h.done) { finishActive(a, a.revealedAt ? 'done' : 'unseen'); continue; }
      if (a.revealedAt) { if (a.endAt !== undefined && T >= a.endAt) finishActive(a, 'done'); continue; }
      const mx = typeof a.def.max === 'function' ? a.def.max() : a.def.max;
      if ((mx > 0 && T - a.armedAt > mx) || (a.def.while && !a.def.while(D, a.h))) { drop(a); continue; }
      checkReveal(a, dt);
    } catch (e) { console.warn('event failed', a.def.id, e); drop(a, true); }
  }
  if (NIGHT.suspended || T - NIGHT.lastTry < 0.25) return;
  NIGHT.lastTry = T;
  tryArmNext();
}

// ---- the night ----
export function start(plan, n) {
  cleanup();
  Object.assign(NIGHT, { on: true, n, plan, counts: {}, played: new Set(), arms: [], reveals: [], drops: [], lastReveal: -99, lastLoud: -99, quietSince: 0, suspended: false, gapScale: 1, lastLegacy: false, photoAt: -99 });
  NIGHT.lastArm = NIGHT.lastEnd = n <= 1 ? -99 : T;   // night one's first beat waits on its own terms; later nights open with a quiet gap
  NIGHT.gap = drawGap(n);
  log.start(n);
  if (gaze && n >= 2) gaze.markEnd();
}
export function stop() { NIGHT.on = false; cleanup(); NIGHT.plan = null; }
export function dawn(n) {
  for (const fn of NIGHT.onDawn) { try { fn(n); } catch (e) { console.warn('dawn hook failed', e); } }
  stop();
}
// the cleanup list: every armed beat's undo, and whatever else the night registered (a stranded mesh, a held TV, a double on its feet)
export function cleanup() {
  for (const a of ACTIVE.slice()) { a.done = true; undoOnce(a); release(a); }
  const list = NIGHT.cleanup.slice(); NIGHT.cleanup.length = 0;
  for (const fn of list) { try { fn(); } catch (e) { console.warn('cleanup failed', e); } }
  ACTIVE.length = 0; RES.clear();
}
export const suspend = (v) => { NIGHT.suspended = !!v; };
export const setGapScale = (k) => { NIGHT.gapScale = k || 1; NIGHT.gap = drawGap(NIGHT.n); };
export const sinceReveal = () => T - NIGHT.lastReveal;
export const now = () => T;
export const notePhoto = () => { NIGHT.photoAt = T; };
// a reveal made by something outside the table (a staged scare's own look test, the lights' corner trick): it counts for the pacing;
// when the id is a beat on the table that has not been revealed yet, that look is its reveal
export function noteReveal(id = null, tier = 'presence') {
  const a = id ? active(id) : null;
  if (a && !a.revealedAt) { reveal(a, 'look'); return; }
  NIGHT.lastReveal = T; NIGHT.lastEnd = T; if (gaze) { gaze.markEnd(); if (tier === 'presence' || tier === 'loud') gaze.markBusy(); }
  if (tier === 'loud') { NIGHT.lastLoud = T; NIGHT.quietSince = 0; } else NIGHT.quietSince++;
  if (id) NIGHT.reveals.push({ id, tier, how: 'outside', at: T, clock: G ? Math.round(F().clock) : 0 });
}
// the seeded plan as a budget: an id the plan lists is ready from its minute; one it does not list is ready whenever its own pre says so
export function ready(id) {
  const p = NIGHT.plan; if (!p || !p.events || NIGHT.n <= 1) return true;   // night one's beats keep their own order
  const ev = p.events.find((e) => e.id === id && !e.dropped); if (!ev) return true;
  return F().clock >= ev.t;
}
export const planned = (id) => !!(NIGHT.plan && NIGHT.plan.events && NIGHT.plan.events.some((e) => e.id === id));
// the director's old instant events, until they are ported: they fire through the same pacing (and wait a little longer than a beat on
// the table, so the table gets its turn)
export function mayFire(tier, { reveal: rv = false } = {}) {
  if (!G || !NIGHT.on || NIGHT.suspended || !gaze) return false;
  const n = NIGHT.n;
  if ((NIGHT.counts[tier] || 0) >= cap(tier, n)) return false;
  if (tier === 'loud' && NIGHT.quietSince < 2) return false;
  if ((tier === 'presence' || tier === 'loud' || rv) && T - NIGHT.lastReveal < 15) return false;
  const need = NIGHT.gap * (NIGHT.lastLegacy ? 1.5 : 1);
  return gaze.settled(need) && T - NIGHT.lastArm >= need;
}
export function noteLegacy(id, tier) {
  NIGHT.counts[tier] = (NIGHT.counts[tier] || 0) + 1; NIGHT.lastArm = NIGHT.lastEnd = T; NIGHT.lastLegacy = true; NIGHT.gap = drawGap(NIGHT.n);
  NIGHT.arms.push({ id, tier, at: T, clock: Math.round(F().clock), legacy: true }); if (gaze) gaze.markEnd();
  log.push({ id, tier, seen: false, how: 'legacy' });
}
// an encounter with the thing: law 8, the quiet curve, nothing of the presence tier in the last fifteen seconds, and nothing holding it
export function mayEncounter() {
  if (!G || !NIGHT.on || NIGHT.suspended || !gaze) return false;
  if (!chainSeen()) return false;
  if (T - NIGHT.lastReveal < 15 || RES.isHeld('E') || RES.isHeld('stage')) return false;
  return gaze.settled(NIGHT.gap) && T - NIGHT.lastArm >= NIGHT.gap;
}
export function noteEncounter(kind) { NIGHT.lastArm = T; NIGHT.gap = drawGap(NIGHT.n); NIGHT.arms.push({ id: 'encounter:' + kind, tier: 'presence', at: T, clock: Math.round(F().clock), encounter: true }); }

// ---- for the tests: arm, reveal and undo by hand, and read the table ----
export const test = {
  arm(id, opts = {}) {
    const def = DEFS.get(id); if (!def) return 'unknown';
    if (ACTIVE.some((a) => a.def === def && !a.done)) return 'active';
    if (opts.pre && def.pre && !def.pre(D)) return 'pre';
    return tryArm(def, { force: !!opts.force }) ? 'armed' : 'refused';
  },
  reveal(id, how = 'test') { const a = active(id); if (!a || a.revealedAt) return false; reveal(a, how); return true; },
  // put the house back after the id's latest arm, on the table or already finished (a kept change is undone this way too)
  undo(id) { const a = ACTIVE.find((x) => x.def.id === id) || LAST.get(id); if (!a) return false; if (!a.done) { a.done = true; release(a); } undoOnce(a); return true; },
  state(id) { const a = ACTIVE.find((x) => x.def.id === id); return a ? (a.done ? 'done' : a.revealedAt ? 'revealed' : 'armed') : null; },
  active: () => ACTIVE.filter((a) => !a.done).map((a) => ({ id: a.def.id, tier: a.def.tier, armedAt: a.armedAt, revealedAt: a.revealedAt, how: a.how })),
  stats: () => ({ n: NIGHT.n, on: NIGHT.on, counts: { ...NIGHT.counts }, arms: NIGHT.arms.slice(), reveals: NIGHT.reveals.slice(), drops: NIGHT.drops.slice(), gap: NIGHT.gap, quietSince: NIGHT.quietSince, lastReveal: NIGHT.lastReveal, lastArm: NIGHT.lastArm, t: T, held: { ...RES.held }, chainSeen: chainSeen(), floor: presenceFloor() }),
  payoffs: () => ({ ...payoffs }),
  point: (id) => { const def = DEFS.get(id); const a = active(id); return def ? anchorOf(def, a && a.h) : null; },
};
