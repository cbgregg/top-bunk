// The director: which nights are what (from the run's seed), and what happens in a night. Events are small and independent; night "types" are the
// scripted centrepieces. Everything random comes from the seeded generator, so the same seed replays the same ten nights.
//
// The context D that events run against is built in nights.js:
//   D.r()  seeded random 0..1        D.P / D.F / D.W / D.E / D.sfx / D.UI / D.camera / D.hunter
//   D.wait(s) / D.waitFor(fn)        D.say(id, opts) (voice + subtitle)     D.sub(html, dur)
//   D.pan(x, z)                      D.node(id) -> {x,z}                    D.playerRoom()  D.onBunk()
//   D.calm() (nothing hunting you, no scene with an objective going)        D.seesKidWindow()               D.carPass() / D.faceAtWindow()
//   D.fired(id)                      told after each event has run (some events leave proof behind, see nights.js)
//   D.dropped(id)                    told when an event is given up on (its ok() never passed) or failed: its proof can no longer turn up
import { rng, hashSeed, shuffle, pick, between, weighted } from './rng.js';
import { NODES, nearestNode, dist as navDist } from './nav.js';

export const TYPES = ['thirst', 'ring', 'static', 'mimic', 'blackout', 'hunted', 'paralysis', 'teddy', 'parents', 'quiet', 'car', 'vigil'];
export const TYPE_NAMES = {
  thirst: 'The Thirst', ring: 'The Phone', static: 'Static', mimic: 'Mom', blackout: 'Blackout', hunted: 'Hunted', paralysis: 'Paralysis',
  teddy: 'The Bear', parents: 'The Parents', quiet: 'The Quiet', car: 'The Drive', vigil: 'The Vigil', finale: 'Ten', poltergeist: 'Night one',
};

// nights 2..9 get a type each; night 10 is the end. The order is different for every seed.
export function nightTypes(seed) {
  const r = rng('types:' + seed);
  for (let tries = 0; tries < 400; tries++) {
    const rest = shuffle(r, TYPES.filter((t) => t !== 'static' && t !== 'car' && t !== 'vigil'));
    const pool = shuffle(r, ['static', 'car', 'vigil', ...rest.slice(0, 5)]);   // eight of the twelve, and the TV, the drive and the vigil are always in
    const ok = pool.every((t, i) => {
      const n = i + 2;
      if (t === 'quiet' && n < 4) return false;
      if (t === 'blackout' && n < 3) return false;
      if (t === 'car' && (n < 5 || n > 8)) return false;
      if (t === 'vigil' && (n < 4 || n > 8)) return false;
      if (t === 'paralysis' && n < 3) return false;
      if (t === 'parents' && n < 3) return false;
      return true;
    });
    if (ok) { const out = { 1: 'poltergeist', 10: 'finale' }; pool.forEach((t, i) => { out[i + 2] = t; }); return out; }
  }
  const out = { 1: 'poltergeist', 10: 'finale' }; ['thirst', 'static', 'ring', 'blackout', 'car', 'mimic', 'vigil', 'hunted'].forEach((t, i) => { out[i + 2] = t; }); return out;
}

// a night's plan: the type, the starting time, when things happen. Nights are rebuilt from the seed whenever they are played, so a run keeps
// the planner version it was started with: version 1 is the planner from before proofTopUp(), kept for runs saved back then.
export const PLAN_VERSION = 3;
export function makePlan(seed, n, version = PLAN_VERSION) {
  const plan = draftPlan(seed, n);
  if (version >= 2) for (const f of proofTopUp(seed)[n] || []) applyFill(plan, f);
  return plan;
}
const eventsFor = (n) => 9 + n * 2;   // at most this many small events on night n (night one has its own count)
function draftPlan(seed, n) {
  const r = rng(`night:${seed}:${n}`), type = nightTypes(seed)[n];
  const poltergeist = type === 'poltergeist';
  const clock0 = poltergeist ? 167 : Math.round(between(r, 6, 55));    // minutes after midnight (night one starts at 2:47)
  const plan = { n, type, clock0, r, rate: poltergeist ? 1.95 : 1.1, encounters: [], events: [] };
  // encounters with the thing: it shows itself, creeps, and finally hunts. More of them, and more serious, each night.
  const hunts = poltergeist ? 0 : Math.min(1 + Math.floor((n - 1) / 2), 4), stalks = n >= 3 ? 1 + (n >= 7 ? 1 : 0) : 0, sights = poltergeist ? 0 : 2 + Math.floor(n / 3);
  const t0 = Math.max(type === 'quiet' ? 150 : type === 'hunted' ? 28 : 55, clock0 + 20);
  const span = 345 - t0 - 15, kinds = [];
  for (let i = 0; i < sights; i++) kinds.push('sight');
  for (let i = 0; i < stalks; i++) kinds.push('stalk');
  for (let i = 0; i < hunts + (type === 'hunted' ? 2 : 0); i++) kinds.push('hunt');
  // hunts come later in the night than the sightings
  const rank = { sight: 0.25, stalk: 0.55, hunt: 0.8 };
  const slots = kinds.map((k) => ({ k, t: t0 + span * clampN(rank[k] + (r() - 0.5) * 0.35, 0.02, 0.98) })).sort((a, b) => a.t - b.t);
  let last = -99; for (const s of slots) { s.t = Math.max(s.t, last + 22); last = s.t; plan.encounters.push({ t: Math.min(s.t, 350), kind: s.k, done: false, tries: 0 }); }
  // small events fill the quiet: more of them each night. One that wants the house to itself (alone: minutes) is planned only between the
  // night's opening scene and the middle of the night, with that many minutes clear of the event before it and the one after it.
  const count = poltergeist ? 16 : eventsFor(n), gap = (345 - clock0 - 8) / count; let t = clock0 + 8 - gap * 0.3;
  const pool = EVENT_LIST.filter((e) => !e.spare && (poltergeist ? e.safe : n >= (e.minN || 1)));
  const recent = [], early = [clock0 + 35, clock0 + (345 - clock0) * 0.55];
  let prev = -99, hold = 0;
  const fits = (e) => !recent.includes(e.id) && !(e.nm && plan.events.some((p) => EVENTS[p.id].nm)) && !(e.once && plan.events.some((p) => p.id === e.id)) && (!e.alone || (t >= early[0] && Math.max(t, prev + e.alone) <= early[1]));
  for (let i = 0; i < count; i++) {
    t = Math.max(t + gap * (0.55 + r() * 0.9), hold);
    if (t > 350) break;
    const e = weighted(r, pool.filter(fits).map((c) => [c, c.w]));
    if (e.alone) { t = Math.max(t, prev + e.alone); hold = t + e.alone; }
    recent.push(e.id); if (recent.length > 4) recent.shift();
    plan.events.push({ t, id: e.id, done: false });
    prev = t;
  }
  return plan;
}
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));

// -------------------------------------------------------------------------------------------------------------------------------------------
// enough proof on every seed: nights two to nine can leave at least MIN_PROOF of the ten kinds, so the believed ending (seven) never needs a
// perfect run. In the draw above, proof of the phone, the blackout and the bear comes only with their night types, so a seed with one or none
// of those falls short, as does one where no night draws some proof event. A missing kind's event goes on the night with the most room left
// under eventsFor(), or, with no room anywhere, in place of an event the run's proof does not depend on. Never on the vigil (it stops the
// events) or the drive (it ends the night).
const MIN_PROOF = 9, FILL_BY = 300;   // (5:00 AM: an event any later leaves little of the night to find its proof in)
let topUp = { seed: null, fills: null };
function proofTopUp(seed) {
  if (topUp.seed === seed) return topUp.fills;
  const plans = [], fills = {}, r = rng(`proof:${seed}`);
  for (let n = 2; n <= 9; n++) plans.push(draftPlan(seed, n));
  let have = kindsLeft(plans);
  // kinds whose events also come up at random go first, the spare events only when those are not enough
  const missing = shuffle(r, Object.keys(PROOF_FROM).filter((k) => !have.has(k))).sort((a, b) => spareFor(a) - spareFor(b));
  for (const k of missing) {
    if (have.size >= MIN_PROOF) break;
    const f = fillFor(plans, k, have, r); if (!f) continue;
    applyFill(plans[f.n - 2], f); (fills[f.n] ||= []).push(f);
    have = kindsLeft(plans);
  }
  topUp = { seed, fills };
  return fills;
}
const sourceEvents = (k) => PROOF_FROM[k].filter((id) => EVENTS[id]);
const spareFor = (k) => (sourceEvents(k).some((id) => !EVENTS[id].spare) ? 0 : 1);
const leavesProof = (id) => Object.values(PROOF_FROM).some((s) => s.includes(id));
const roomLeft = (p) => eventsFor(p.n) - p.events.length;
const kindsLeft = (plans) => {
  const src = new Set(); for (const p of plans) for (const s of proofSources(p)) src.add(s);
  return new Set(Object.keys(PROOF_FROM).filter((k) => PROOF_FROM[k].some((s) => src.has(s))));
};
// { n, id, t } adds event id at minute t of night n, { n, id, i } puts it in place of that night's event i
function fillFor(plans, k, have, r) {
  const ids = sourceEvents(k).sort((a, b) => (EVENTS[a].ok ? 1 : 0) - (EVENTS[b].ok ? 1 : 0));   // (one with no condition is sure to run)
  for (const id of ids) {
    const nights = shuffle(r, plans.filter((p) => p.type !== 'vigil' && p.type !== 'car' && p.n >= (EVENTS[id].minN || 1))).sort((a, b) => roomLeft(b) - roomLeft(a));
    for (const p of nights) {
      if (roomLeft(p) <= 0) break;
      const t = openTime(p, id); if (t !== null) return { n: p.n, id, t };
    }
    for (const p of nights) { const i = swapAt(plans, p, id, have, r); if (i >= 0) return { n: p.n, id, i }; }
  }
  return null;
}
// the middle of the widest gap id can go in (clear of an alone event's quiet, no nearer than five events to itself, as the planner has it),
// or null when no gap is six minutes wide
function openTime(p, id) {
  const ev = p.events, lo = p.clock0 + 20; let best = null, width = 6;
  for (let i = 0; i <= ev.length; i++) {
    const a = ev[i - 1], b = ev[i];
    const from = Math.max(lo, a ? a.t + (EVENTS[a.id].alone || 0) : lo), to = Math.min(FILL_BY, b ? b.t - (EVENTS[b.id].alone || 0) : FILL_BY);
    if (to - from < width || ev.slice(Math.max(0, i - 4), i + 4).some((e) => e.id === id)) continue;
    best = (from + to) / 2; width = to - from;
  }
  return best;
}
// an event of night p that id can replace with the run keeping every kind it has, one that leaves no proof itself if possible; -1 if none
function swapAt(plans, p, id, have, r) {
  const any = [], bare = [];
  p.events.forEach((e, i) => {
    const def = EVENTS[e.id];
    if (def.alone || def.once || def.spare || e.t < p.clock0 + 20 || e.t > FILL_BY) return;
    if (p.events.some((x, j) => j !== i && Math.abs(j - i) <= 4 && x.id === id)) return;
    const was = e.id; e.id = id; const left = kindsLeft(plans); e.id = was;
    if (![...have].every((k) => left.has(k))) return;
    any.push(i); if (!leavesProof(was)) bare.push(i);
  });
  const from = bare.length ? bare : any;
  return from.length ? pick(r, from) : -1;
}
function applyFill(plan, f) {
  if (f.i !== undefined) { plan.events[f.i].id = f.id; return; }
  const at = plan.events.findIndex((e) => e.t > f.t);
  plan.events.splice(at < 0 ? plan.events.length : at, 0, { t: f.t, id: f.id, done: false });
}

// which night types and events can leave each kind of proof (nights.js puts it in the house and lets you look closer)
export const PROOF_FROM = {
  SCRATCHES: ['knock', 'bunkShake'], FOOTPRINTS: ['thirst', 'faucet', 'flush', 'nmMirror'], CABINETS: ['slam', 'mimic'], STATIC: ['static', 'tvStatic'], DRAWING: ['drawing', 'nmHall'], PHOTO: ['nmShadow'], WASHER: ['nmBasement'],
  CHAIR: ['chairs'], PHONE: ['ring', 'phone'], HANDPRINT: ['blackout', 'breaker'], TEDDY: ['teddy'], CANDLE: ['vigil'],
};
// what in a night can leave proof: its type and its events (none on the vigil, which stops them, and on the drive only the ones before it
// starts, since the night ends soon after); an event the director gave up on leaves nothing
export function proofSources(plan) {
  const src = new Set([plan.type]);
  if (plan.type !== 'vigil') for (const e of plan.events) if (!e.dropped && (plan.type !== 'car' || e.t < plan.clock0 + 10)) src.add(e.id);
  return src;
}

// -------------------------------------------------------------------------------------------------------------------------------------------
// events: [{ id, w: weight, minN, ok(D) -> may it happen now?, run(D) }], and optionally once (at most one a night), alone (minutes of the
// clock with no other event or encounter before and after it) and spare (never drawn at random: proofTopUp() plans it where a seed is short
// of proof)
const room = (D) => D.playerRoom();
const EVENT_LIST = [
  { id: 'creak', safe: true, w: 5, run: (D) => D.sfx.creak(0.2 + D.r() * 0.15, D.randPan()) },
  { id: 'knock', safe: true, w: 3, run: (D) => D.sfx.knock(D.randPan() * 0.7, 0.2 + D.r() * 0.15) },
  { id: 'thump', safe: true, w: 3, minN: 2, run: (D) => D.sfx.ceilingThump() },
  { id: 'whisper', safe: true, w: 3, run: (D) => { D.sfx.whisper(D.randPan(), 0.14 + D.r() * 0.1); D.F.fear = Math.max(D.F.fear, 0.3); } },
  { id: 'slam', safe: true, w: 2, minN: 2, run: (D) => { D.sfx.slamFar(D.randPan()); D.shake(0.15); D.F.fear = Math.max(D.F.fear, 0.4); } },
  { id: 'flicker', safe: true, w: 3, run: (D) => D.flicker(0.9 + D.r()) },
  { id: 'lightDies', safe: true, w: 2, minN: 2, run: (D) => D.killNightLight(35 + D.r() * 40) },
  { id: 'kidDoorShuts', safe: true, w: 2, ok: (D) => D.W.doors.kid.target === 1 && room(D) === 'bed' && D.dist(D.W.doors.kid.mid) > 1.2, run: (D) => { D.W.setDoor('kid', false); D.F.fear = Math.max(D.F.fear, 0.45); } },
  { id: 'doorDrifts', safe: true, w: 2, minN: 2, ok: (D) => D.W.doors.room2.target === 0, run: (D) => { D.W.setDoor('room2', true); } },
  { id: 'glimpse', w: 3, minN: 2, ok: (D) => !D.hunter.busy && D.hunter.cool <= 0 && !D.onBunk() && room(D) !== 'bath', run: (D) => D.glimpse() },
  { id: 'breathBehind', safe: true, w: 2, minN: 2, run: (D) => { D.sfx.breath(true, 0.5); D.sfx.breath(false, 0.5); D.sfx.whisper(-0.9 + D.r() * 1.8, 0.12); D.F.fear = Math.max(D.F.fear, 0.6); } },
  { id: 'mirror', safe: true, w: 2, minN: 2, ok: (D) => room(D) === 'bath', run: (D) => D.mirror(D.F.night > 1 && D.r() < 0.5 ? 'figure' : 'writing') },
  { id: 'tvStatic', safe: true, w: 2, minN: 2, ok: (D) => room(D) !== 'living' && !D.W.tvFx.on, run: (D) => D.tvBlip() },
  { id: 'faucet', safe: true, w: 2, run: (D) => D.sfx.faucet(4, D.randPan()) },
  { id: 'clockGlitch', safe: true, w: 2, minN: 2, run: (D) => D.clockGlitch() },
  { id: 'drawing', safe: true, w: 1, minN: 3, run: (D) => D.drawingChange() },
  { id: 'parentsMutter', safe: true, w: 2, run: (D) => D.mutter() },
  // somebody close by that you cannot see, speaking low
  { id: 'lurk', safe: true, w: 3, minN: 2, ok: (D) => !D.hunter.busy, run: (D) => D.lurk() },
  // Dad, on the phone, in the dark, saying something he should not
  { id: 'phoneTalk', w: 1.5, minN: 4, once: true, ok: (D) => D.calm() && room(D) !== 'parents', run: (D) => D.phoneTalk() },
  // the nightmares (at most one a night): each pulls the kid under and leaves something behind (nightmares.js)
  { id: 'nmShadow', nm: true, w: 2, minN: 3, once: true, alone: 16, ok: (D) => D.calm() && !D.F.nmDone, run: (D) => D.nightmare('shadow') },
  { id: 'nmMirror', nm: true, w: 2, minN: 3, once: true, alone: 16, ok: (D) => D.calm() && !D.F.nmDone, run: (D) => D.nightmare('mirror') },
  { id: 'nmHall', nm: true, w: 2, minN: 4, once: true, alone: 16, ok: (D) => D.calm() && !D.F.nmDone, run: (D) => D.nightmare('hall') },
  { id: 'nmBasement', nm: true, w: 2, minN: 4, once: true, alone: 16, ok: (D) => D.calm() && !D.F.nmDone, run: (D) => D.nightmare('basement') },
  { id: 'chairs', safe: true, w: 2, minN: 2, run: (D) => { D.sfx.scrape(D.pan(-2.1, 1.8)); D.F.fear = Math.max(D.F.fear, 0.25); } },
  { id: 'bunkShake', safe: true, w: 2, minN: 2, ok: (D) => D.onBunk(), run: (D) => { D.shake(0.5); D.sfx.creak(0.35, 0); D.F.fear = Math.max(D.F.fear, 0.5); } },
  { id: 'steps', safe: true, w: 2, minN: 2, ok: (D) => !D.onBunk() && !D.hunter.busy, run: (D) => { D.F.echo = true; D.later(9, () => { D.F.echo = false; }); } },
  { id: 'flush', safe: true, w: 1, run: (D) => D.sfx.flush(D.pan(4.2, 1.5)) },
  // a car goes by out front and its headlights slide through the house (about four minutes of the clock)
  { id: 'carPass', w: 2, minN: 2, once: true, alone: 6, ok: (D) => D.calm(), run: (D) => D.carPass() },
  // the huge pale face drifts past the windows (about twelve minutes): once a night, while you are in your room or can see its window
  { id: 'windowFace', w: 2, minN: 2, once: true, alone: 20, ok: (D) => D.calm() && D.seesKidWindow(), run: (D) => D.faceAtWindow() },
  // the build-up to a hunt (flicker, violins, heavy steps) with no hunt after it
  { id: 'falseAlarm', w: 3, minN: 2, ok: (D) => !D.hunter.busy && D.hunter.cool <= 0, run: (D) => { D.flicker(1.5); D.sfx.violins(0.3, 0.6); D.sfx.heavyStep(0.5, D.randPan()); D.later(0.85, () => { D.sfx.heavyStep(0.4, D.randPan()); D.sfx.pianoSlam(0.7); }); D.later(2.6, () => D.sfx.violins(0, 2.5)); D.F.fear = Math.max(D.F.fear, 0.8); } },
  // the wall phone rings once and stops (later it is off the hook)
  { id: 'phone', spare: true, minN: 2, ok: (D) => !D.W.phone.ringing && !D.W.phone.off, run: (D) => D.sfx.phoneRing(D.pan(-1.5, 0.9)) },
  // the power cuts out for a second or two, night lights and all, and the breaker clunks back on by itself
  { id: 'breaker', spare: true, minN: 2, ok: (D) => !D.F.blackout, run: (D) => { D.sfx.pop(); D.blackout(true); D.later(1.4 + D.r(), () => { if (D.F.blackout) { D.sfx.thump(); D.blackout(false); } }); } },
];
export const EVENTS = Object.fromEntries(EVENT_LIST.map((e) => [e.id, e]));

// -------------------------------------------------------------------------------------------------------------------------------------------
// the director itself: fires events and encounters as the clock reaches them
export function createDirector(D) {
  let plan = null, running = false, lockUntil = 0, lastAt = -99, holdUntil = 0;
  const okNow = (ev) => { const def = EVENTS[ev.id]; return !def.ok || def.ok(D); };
  const dir = {
    start(p) { plan = p; running = true; lockUntil = 0; lastAt = -99; holdUntil = 0; },
    stop() { running = false; },
    get plan() { return plan; },
    update() {
      if (!running || !plan || D.F.dead) return;
      const c = D.F.clock, busy = D.F.script || D.F.cutscene || D.F.dead || D.F.pause;
      // an event that wants the house to itself, once it is due and able to run, holds everything else back until it has had its quiet
      const lone = busy ? null : plan.events.find((ev) => !ev.done && c >= ev.t && EVENTS[ev.id].alone && okNow(ev));
      // encounters first: they matter more
      for (const e of plan.encounters) {
        if (e.done || c < e.t) continue;
        if (busy || lone || c < holdUntil || D.hunter.busy || D.hunter.cool > 0 || D.now() < lockUntil) continue;
        if (e.tries++ > 40 && c > e.t + 25) { e.done = true; continue; }
        if (D.encounter(e.kind, plan)) { e.done = true; lockUntil = D.now() + 14; lastAt = c; }
      }
      for (const ev of plan.events) {
        if (ev.done || c < ev.t) continue;
        if (busy || D.hunter.state === 'hunt' || D.hunter.state === 'loom' || c < holdUntil || (lone && lone !== ev)) continue;
        const def = EVENTS[ev.id];
        if (!okNow(ev)) { if (c > ev.t + 40) { ev.done = ev.dropped = true; if (D.dropped) D.dropped(ev.id); } continue; }
        if (def.alone && c - lastAt < def.alone) continue;
        if (!def.alone && (c - lastAt < 2.5 || (D.hunter.busy && !def.safe))) continue;
        ev.done = true; lastAt = c; if (def.alone) holdUntil = c + def.alone;
        try { def.run(D); if (D.fired) D.fired(ev.id); } catch (e) { console.warn('event failed', ev.id, e); ev.dropped = true; if (D.dropped) D.dropped(ev.id); }   // (no proof for an event that never happened)
      }
    },
  };
  return dir;
}
