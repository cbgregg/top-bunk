// The director: which nights are what (from the run's seed), and what happens in a night. Events are small and independent; night "types" are the
// scripted centrepieces. Everything random comes from the seeded generator, so the same seed replays the same ten nights.
//
// The context D that events run against is built in nights.js:
//   D.r()  seeded random 0..1        D.P / D.F / D.W / D.E / D.sfx / D.UI / D.camera / D.hunter
//   D.wait(s) / D.waitFor(fn)        D.say(id, opts) (voice + subtitle)     D.sub(html, dur)
//   D.pan(x, z)                      D.node(id) -> {x,z}                    D.playerNode()  D.playerRoom()
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
      if (i > 0 && t === pool[i - 1]) return false;
      return true;
    });
    if (ok) { const out = { 1: 'poltergeist', 10: 'finale' }; pool.forEach((t, i) => { out[i + 2] = t; }); return out; }
  }
  const out = { 1: 'poltergeist', 10: 'finale' }; ['thirst', 'static', 'ring', 'blackout', 'car', 'mimic', 'teddy', 'hunted'].forEach((t, i) => { out[i + 2] = t; }); return out;
}

// a night's plan: the type, the starting time, when things happen
export function makePlan(seed, n) {
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
  // small events fill the quiet: more of them each night
  const count = poltergeist ? 16 : 9 + n * 2, gap = (345 - clock0 - 8) / count; let t = clock0 + 8 - gap * 0.3;
  const pool = EVENT_LIST.filter((e) => (poltergeist ? e.safe : n >= (e.minN || 1)));
  const recent = [];
  for (let i = 0; i < count; i++) {
    t += gap * (0.55 + r() * 0.9);
    if (t > 350) break;
    const cand = pool.filter((e) => !recent.includes(e.id)), e = weighted(r, cand.map((c) => [c, c.w]));
    recent.push(e.id); if (recent.length > 4) recent.shift();
    plan.events.push({ t, id: e.id, done: false });
  }
  return plan;
}
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));

// -------------------------------------------------------------------------------------------------------------------------------------------
// events: [{ id, w: weight, minN, ok(D) -> may it happen now?, run(D) }]
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
  { id: 'doorDrifts', safe: true, w: 2, minN: 2, ok: (D) => D.W.doors.parents.target === 0 && room(D) !== 'parents' || D.W.doors.room2.target === 0, run: (D) => { D.W.setDoor(D.W.doors.room2.target === 0 && D.r() < 0.5 ? 'room2' : 'parents', true); } },
  { id: 'glimpse', w: 3, minN: 2, ok: (D) => !D.hunter.busy && D.hunter.cool <= 0 && !D.onBunk(), run: (D) => D.glimpse() },
  { id: 'breathBehind', safe: true, w: 2, minN: 2, run: (D) => { D.sfx.breath(true, 0.5); D.sfx.breath(false, 0.5); D.sfx.whisper(-0.9 + D.r() * 1.8, 0.12); D.F.fear = Math.max(D.F.fear, 0.6); } },
  { id: 'mirror', safe: true, w: 2, minN: 2, ok: (D) => room(D) === 'bath', run: (D) => D.mirror(D.F.night > 1 && D.r() < 0.5 ? 'figure' : 'writing') },
  { id: 'tvStatic', safe: true, w: 2, minN: 2, ok: (D) => room(D) !== 'living' && !D.W.tvFx.on, run: (D) => D.tvBlip() },
  { id: 'faucet', safe: true, w: 2, run: (D) => D.sfx.faucet(4, D.randPan()) },
  { id: 'clockGlitch', safe: true, w: 2, minN: 2, run: (D) => D.clockGlitch() },
  { id: 'drawing', safe: true, w: 1, minN: 3, run: (D) => D.drawingChange() },
  { id: 'parentsMutter', safe: true, w: 2, run: (D) => D.mutter() },
  { id: 'chairs', safe: true, w: 2, minN: 2, run: (D) => { D.sfx.scrape && D.sfx.scrape(D.pan(-2.1, 2.3)); D.F.fear = Math.max(D.F.fear, 0.25); } },
  { id: 'bunkShake', safe: true, w: 2, minN: 2, ok: (D) => D.onBunk(), run: (D) => { D.shake(0.5); D.sfx.creak(0.35, 0); D.F.fear = Math.max(D.F.fear, 0.5); } },
  { id: 'steps', safe: true, w: 2, minN: 2, ok: (D) => !D.onBunk() && !D.hunter.busy, run: (D) => { D.F.echo = true; D.later(9, () => { D.F.echo = false; }); } },
  { id: 'flush', safe: true, w: 1, run: (D) => D.sfx.flush && D.sfx.flush(D.pan(4.2, 1.5)) },
  // everything that happens before a hunt, and then nothing comes: the warning is never a promise
  { id: 'falseAlarm', w: 3, minN: 2, ok: (D) => !D.hunter.busy && D.hunter.cool <= 0, run: (D) => { D.flicker(1.5); D.sfx.violins(0.3, 0.6); D.sfx.heavyStep(0.5, D.randPan()); D.later(0.85, () => D.sfx.heavyStep(0.4, D.randPan())); D.later(2.6, () => D.sfx.violins(0, 2.5)); D.F.fear = Math.max(D.F.fear, 0.8); } },
];
export const EVENTS = Object.fromEntries(EVENT_LIST.map((e) => [e.id, e]));

// -------------------------------------------------------------------------------------------------------------------------------------------
// the director itself: fires events and encounters as the clock reaches them
export function createDirector(D) {
  let plan = null, running = false, lockUntil = 0;
  const dir = {
    start(p) { plan = p; running = true; lockUntil = 0; },
    stop() { running = false; },
    get plan() { return plan; },
    update() {
      if (!running || !plan || D.F.dead) return;
      const c = D.F.clock, busy = D.F.script || D.F.cutscene || D.F.dead || D.F.pause;
      // encounters first: they matter more
      for (const e of plan.encounters) {
        if (e.done || c < e.t) continue;
        if (busy || D.hunter.busy || D.hunter.cool > 0 || D.now() < lockUntil) continue;
        if (e.tries++ > 40 && c > e.t + 25) { e.done = true; continue; }
        if (D.encounter(e.kind, plan)) { e.done = true; lockUntil = D.now() + 14; }
      }
      for (const ev of plan.events) {
        if (ev.done || c < ev.t) continue;
        if (busy || D.hunter.state === 'hunt' || D.hunter.state === 'loom') continue;
        const def = EVENTS[ev.id];
        if (def.ok && !def.ok(D)) { if (c > ev.t + 40) { ev.done = ev.dropped = true; if (D.dropped) D.dropped(ev.id); } continue; }
        ev.done = true;
        try { def.run(D); if (D.fired) D.fired(ev.id); } catch (e) { console.warn('event failed', ev.id, e); ev.dropped = true; if (D.dropped) D.dropped(ev.id); }   // (no proof for an event that never happened)
      }
    },
  };
  return dir;
}
