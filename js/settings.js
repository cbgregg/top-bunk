// Player settings, saved under 'topbunk.settings' (store.js) and applied live: each module subscribes to the keys it cares
// about with settings.on(key, fn). A setting another module owns (graphics quality lives in gfx) is reached through a delegate.
import { store } from './store.js';

const KEY = 'topbunk.settings';
// brightness is in stops: the scene's exposure is multiplied by 2 ** brightness (0 leaves it as designed)
export const DEFAULTS = { master: 0.85, music: 1, sfx: 1, voice: 1, sensitivity: 1, invertY: false, fov: 75, brightness: 0, headBob: true, subtitles: true, reduceFlashing: false };
export const RANGES = { master: [0, 1], music: [0, 1], sfx: [0, 1], voice: [0, 1], sensitivity: [0.3, 3], fov: [60, 100], brightness: [-1, 1] };
const data = { ...DEFAULTS }, subs = {}, delegates = {};

const clean = (k, v) => {
  if (typeof DEFAULTS[k] === 'boolean') return v === 'false' ? false : !!v;
  v = +v; if (!Number.isFinite(v)) return DEFAULTS[k];
  const r = RANGES[k]; return r ? Math.max(r[0], Math.min(r[1], v)) : v;
};
function load() {
  const s = store.get(KEY);
  if (s && typeof s === 'object') for (const k in DEFAULTS) if (k in s) data[k] = clean(k, s[k]);
}
function save() { store.set(KEY, data); }
function notify(k, v) { for (const fn of subs[k] || []) fn(v, k); for (const fn of subs['*'] || []) fn(v, k); }
load();

export const settings = {
  defaults: DEFAULTS, ranges: RANGES,
  get(k) { return delegates[k] ? delegates[k].get() : data[k]; },
  // persists and tells the subscribers; a value out of range is clamped, an unknown key ignored
  set(k, v) {
    if (delegates[k]) { delegates[k].set(v); notify(k, delegates[k].get()); return; }
    if (!(k in DEFAULTS)) return;
    v = clean(k, v); if (data[k] === v) return;
    data[k] = v; save(); notify(k, v);
  },
  // fn(value, key) on every change of that key ('*' for all of them); returns the unsubscribe
  on(k, fn) { (subs[k] ||= []).push(fn); return () => { subs[k] = (subs[k] || []).filter((f) => f !== fn); }; },
  all() { const o = { ...data }; for (const k in delegates) o[k] = delegates[k].get(); return o; },
  // hand a key to another module: { get, set, def } (def is what reset() puts back)
  delegate(k, d) { delegates[k] = d; },
  reset() { for (const k in DEFAULTS) this.set(k, DEFAULTS[k]); for (const k in delegates) if ('def' in delegates[k]) this.set(k, delegates[k].def); },
};

// Every light that flickers or strobes takes its value from here (one key per light): v is the flickered value this frame, steady the value
// it flickers about. With reduceFlashing on, a flicker keeps a quarter of its swing and changes at most 2.5 times a second; scares still land.
const held = new Map();
export function flicker(key, v, steady) {
  if (!data.reduceFlashing) return v;
  const now = performance.now(); let h = held.get(key);
  if (!h || now - h.t >= 400) held.set(key, h = { t: now, v: steady + (v - steady) * 0.25 });
  return h.v;
}
export const FLASH_CAP = 0.3;   // with reduceFlashing on, the most a full-screen flash (UI.flash) may cover the picture
