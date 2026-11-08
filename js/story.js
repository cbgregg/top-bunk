// The story state of a run: what Mom and Dad have come to make of it, and so how the mornings talk and how the last night ends.
//
//   RUN.story = { proof, witness, blamed, forest, dayStrikes }   saved with the run (it is part of RUN), restored on Continue
//     proof       the proof the run holds (copied from the run's evidence each time the stance is read)
//     witness     what the parents have seen for themselves at night: 0.5 for Mom looking past you into the hall, 1 for a whole sighting
//     blamed      how often one of them found you out of bed and made it your fault
//     forest      how often you went into the trees past the fence
//     dayStrikes  the day rules you broke (the barn, the fence, the road)
//   The night engine adds a beat's after.witness / after.blamed here when it pays off (js/events.js); a module can also call witness(k),
//   blame(), strike() and wentInForest() directly.
//
// The stance, read after night n (the morning of n talks in it, the night after plays under it, night ten ends by it):
//   dismiss   the default, and all there is through night three: nothing is wrong in this house
//   blame     blamed >= 2 and proof < 3: it is you, out of bed again (Dad says it to Mom in front of you)
//   split     witness >= 1: one of them has seen it, and says she has not
//   believe   proof >= 7 or witness >= 2: they believe you
// Each later one wins over the ones before it. The mornings' register (low / mid / high) and the ending come from the same stance through
// one table, so a breakfast that believes you can never be followed by an ending that does not.
//
// Night types: TYPE_ALLOWED is the nights each seeded type may fall on (js/director.js nightTypes keeps to it), so the spine's beats and
// the voices the house borrows come in an order the story can stand: the parents and the TV only on three to seven, the hunt never on
// eight or nine, the vigil on four to six, the drive on five or six, Mom's voice not before five (her voice is known before it is used).
// main.js binds the run here at load (bind); the morning's lines are composed elsewhere and handed in through composeWith().

export const STANCES = ['dismiss', 'blame', 'split', 'believe'];
// the register the mornings take a stance in, and the ending it comes to: one row each, so the two never disagree
const TABLE = {
  dismiss: { register: 'low', ending: 'ENDING_ALONE' },
  blame: { register: 'low', ending: 'ENDING_ALONE' },
  split: { register: 'mid', ending: 'ENDING_TAKEN' },
  believe: { register: 'high', ending: 'ENDING_BELIEVED' },
};
export const register = (s) => (TABLE[s] || TABLE.dismiss).register;
export const ending = (s) => (TABLE[s] || TABLE.dismiss).ending;

// [first night, last night] each night type may be (nights two to nine are seeded; one is night one's own, ten is the end)
export const TYPE_ALLOWED = {
  thirst: [2, 9], ring: [2, 9], teddy: [2, 9],
  static: [3, 7], parents: [3, 7],
  hunted: [2, 7],
  blackout: [3, 9], paralysis: [3, 9],
  quiet: [4, 9],
  vigil: [4, 6],
  car: [5, 6],
  mimic: [5, 9],
};
export const typeAllowed = (type, n) => { const a = TYPE_ALLOWED[type]; return !!a && n >= a[0] && n <= a[1]; };

const FIELDS = ['proof', 'witness', 'blamed', 'forest', 'dayStrikes'];
export const fresh = () => ({ proof: 0, witness: 0, blamed: 0, forest: 0, dayStrikes: 0 });

// what main.js hands over (bind): the run, the proof it holds, the night just played, and a stance a debug jump stands in with
let B = { RUN: null, proof: null, night: null, forced: null };
export function bind(game = {}) {
  B = { RUN: game.RUN || null, proof: game.proof || null, night: game.night || null, forced: game.forced || null };
  if (B.RUN) state();
  return B.RUN ? B.RUN.story : null;
}
// for the module list's sake (main.js binds the run; nothing installs this)
export function install(game) { if (game && game.RUN && !B.RUN) bind({ RUN: game.RUN }); }

// the run's story, made whole: a run saved before it existed starts at nothing, a field a later version added starts at nothing, and the
// proof is the run's own
export function state() {
  const R = B.RUN; if (!R) return fresh();
  const s = R.story && typeof R.story === 'object' ? R.story : (R.story = fresh());
  for (const k of FIELDS) if (typeof s[k] !== 'number' || !Number.isFinite(s[k])) s[k] = 0;
  if (B.proof) { const p = +B.proof(); if (Number.isFinite(p)) s.proof = p; }
  return s;
}
// the last night played: during night n that is n - 1, at the breakfast and in the afternoon after it, n
export const lastNight = () => { const n = B.night ? +B.night() : B.RUN ? (B.RUN.night || 1) - 1 : 0; return Number.isFinite(n) ? n : 0; };

// the stance a story s comes to after night n (no run, no clock: the tests feed it what they like)
export function stanceOf(s, n = 10) {
  if (!(n > 3)) return 'dismiss';
  const proof = +(s && s.proof) || 0, witness = +(s && s.witness) || 0, blamed = +(s && s.blamed) || 0;
  if (proof >= 7 || witness >= 2) return 'believe';
  if (witness >= 1) return 'split';
  if (blamed >= 2 && proof < 3) return 'blame';
  return 'dismiss';
}
// the run's stance after night n (by default the last night played); `over` changes a field for the asking ({ proof: 4 }: the stance
// this run would have with four pieces of proof). A debug jump's stand-in (#proof=N) wins over both.
export function stance(n = lastNight(), over = null) {
  const f = B.forced ? B.forced() : null;
  if (f && TABLE[f]) return f;
  return stanceOf(over ? { ...state(), ...over } : state(), n);
}
// a bare photo count standing in for a stance, as the endings were chosen before there was one (#proof=N, and smoke's ending checks):
// under three nobody comes, three to six they saw it, seven or more they believe you
export const countStance = (c) => (c < 3 ? 'dismiss' : c < 7 ? 'split' : 'believe');

// the ledger's writers
const add = (k, v) => { const s = state(); s[k] = Math.round((s[k] + v) * 100) / 100; return s[k]; };
export const witness = (k = 1) => add('witness', +k || 0);
export const blame = (k = 1) => add('blamed', +k || 0);
export const strike = (k = 1) => add('dayStrikes', +k || 0);
export const wentInForest = (k = 1) => add('forest', +k || 0);

// the morning after night n, as line ids: composed by the breakfast (it hands its composer in with composeWith); none until it does
let composer = null;
export function composeWith(fn) { composer = typeof fn === 'function' ? fn : null; }
export function morning(n) {
  if (!composer) return [];
  try { const ids = composer(n, { stance: stance(n), story: state() }); return Array.isArray(ids) ? ids : []; }
  catch (e) { console.warn('morning composer failed', e); return []; }
}

export const story = { STANCES, TYPE_ALLOWED, typeAllowed, fresh, bind, install, state, lastNight, stanceOf, stance, countStance, register, ending, witness, blame, strike, wentInForest, composeWith, morning };
export default story;
