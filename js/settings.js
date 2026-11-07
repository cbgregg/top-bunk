// Player settings, saved under 'topbunk.settings' (store.js) and applied live: each module subscribes to the keys it cares
// about with settings.on(key, fn). A setting another module owns (graphics quality lives in gfx) is reached through a delegate.
import { store } from './store.js';

const KEY = 'topbunk.settings';
// The bindings table: one entry per action, a primary and an optional alternate for the keyboard (KeyboardEvent.code; Mouse0 / Mouse2 the
// mouse buttons) and the controller (Standard-mapping button numbers: 0 A · 1 B · 2 X · 3 Y · 4 LB · 5 RB · 6 LT · 7 RT · 8 View ·
// 9 Start · 10 L3 · 11 R3 · 12-15 the d-pad; LS / RS the sticks). js/input.js reads it live, so a remap shows up in every prompt,
// the Controls table and the bedtime cartoon at once. The action names are the contract every module reads by.
export const DEFAULT_BINDINGS = {
  move: { kb: ['WASD', 'Arrows'], pad: ['LS'] },
  look: { kb: ['Mouse'], pad: ['RS'] },
  sprint: { kb: ['ShiftLeft', 'ShiftRight'], pad: [7, 10] },
  interact: { kb: ['KeyE', 'Mouse0'], pad: [0, 2] },
  camera: { kb: ['KeyC', 'Mouse2'], pad: [3, 13] },
  light: { kb: ['KeyF'], pad: [5, 12] },
  breath: { kb: ['Space'], pad: [6, 4] },
  cancel: { kb: ['KeyC', 'Mouse2'], pad: [1] },
  journal: { kb: ['KeyJ', 'Tab'], pad: [8] },
  pause: { kb: ['Escape'], pad: [9] },
  menuUp: { kb: ['ArrowUp', 'KeyW'], pad: [12] },
  menuDown: { kb: ['ArrowDown', 'KeyS'], pad: [13] },
  menuLeft: { kb: ['ArrowLeft', 'KeyA'], pad: [14] },
  menuRight: { kb: ['ArrowRight', 'KeyD'], pad: [15] },
  menuConfirm: { kb: ['Enter', 'Space'], pad: [0] },
  menuBack: { kb: ['Escape', 'Backspace'], pad: [1] },
  tabPrev: { kb: ['KeyQ'], pad: [4] },
  tabNext: { kb: ['KeyE'], pad: [5] },
};
export const ACTIONS = Object.keys(DEFAULT_BINDINGS);
// brightness is in stops: the scene's exposure is multiplied by 2 ** brightness (0 leaves it as designed)
// the controller rows (Options → Controls): padLookAccel is the look acceleration past the deadzone (0 none, 1 full), padSensitivity the
// right stick's own sensitivity next to the mouse's, deadzone the stick's dead centre, sprintToggle / cameraHold the hold-or-toggle
// choices, promptStyle which pad's names the prompts show (auto reads the pad), touchSize / leftHanded the on-screen controls, and
// torchPin keeps the flashlight pinned under the right forearm while the camera is up instead of handing it to the left hand
export const DEFAULTS = {
  master: 0.85, music: 1, sfx: 1, voice: 1, sensitivity: 1, invertY: false, fov: 75, brightness: 0, headBob: 1, subtitles: true, reduceFlashing: false, bedtimeCartoon: true,
  padLookAccel: 0.35, padSensitivity: 1, deadzone: 0.2, invertX: false, sprintToggle: false, cameraHold: false, vibration: true, promptStyle: 'auto', touchSize: 'normal', leftHanded: false, torchPin: false,
  bindings: DEFAULT_BINDINGS,
};
export const RANGES = { master: [0, 1], music: [0, 1], sfx: [0, 1], voice: [0, 1], sensitivity: [0.3, 3], fov: [60, 100], brightness: [-1, 1], padLookAccel: [0, 1], padSensitivity: [0.3, 3], deadzone: [0.05, 0.35] };
export const OPTIONS = { promptStyle: ['auto', 'xbox', 'ps', 'switch'], touchSize: ['normal', 'large'] };
const data = { ...DEFAULTS }, subs = {}, delegates = {};

const copyBindings = (b) => { const o = {}; for (const a in b) o[a] = { kb: [...b[a].kb], pad: [...b[a].pad] }; return o; };
// a bindings table from anything stored or given: every action present, at most two slots each, a key a string and a button a number
// (or a stick's name); a slot that is not one of those falls back to the default
const cleanBindings = (v) => {
  const out = copyBindings(DEFAULT_BINDINGS); if (!v || typeof v !== 'object') return out;
  for (const a of ACTIONS) {
    const e = v[a]; if (!e || typeof e !== 'object') continue;
    if (Array.isArray(e.kb)) { const kb = e.kb.filter((c) => typeof c === 'string' && c).slice(0, 2); if (kb.length) out[a].kb = kb; }
    if (Array.isArray(e.pad)) { const pad = e.pad.filter((c) => (Number.isInteger(c) && c >= 0 && c < 32) || c === 'LS' || c === 'RS').slice(0, 2); if (pad.length) out[a].pad = pad; }
  }
  return out;
};
const clean = (k, v) => {
  if (k === 'bindings') return cleanBindings(v);
  if (typeof DEFAULTS[k] === 'boolean') return v === 'false' ? false : !!v;
  if (OPTIONS[k]) return OPTIONS[k].includes(v) ? v : DEFAULTS[k];
  v = +v; if (!Number.isFinite(v)) return DEFAULTS[k];
  const r = RANGES[k]; return r ? Math.max(r[0], Math.min(r[1], v)) : v;
};
const same = (a, b) => (typeof a === 'object' && a ? JSON.stringify(a) === JSON.stringify(b) : a === b);
function load() {
  const s = store.get(KEY);
  if (s && typeof s === 'object') for (const k in DEFAULTS) if (k in s) data[k] = clean(k, s[k]);
  if (!(s && typeof s === 'object' && 'bindings' in s)) data.bindings = copyBindings(DEFAULT_BINDINGS);
}
function save() { store.set(KEY, data); }
function notify(k, v) { for (const fn of subs[k] || []) fn(v, k); for (const fn of subs['*'] || []) fn(v, k); }
load();

export const settings = {
  defaults: DEFAULTS, ranges: RANGES, options: OPTIONS,
  get(k) { return delegates[k] ? delegates[k].get() : data[k]; },
  // persists and tells the subscribers; a value out of range is clamped, an unknown key ignored
  set(k, v) {
    if (delegates[k]) { delegates[k].set(v); notify(k, delegates[k].get()); return; }
    if (!(k in DEFAULTS)) return;
    v = clean(k, v); if (same(data[k], v)) return;
    data[k] = v; save(); notify(k, v);
  },
  // fn(value, key) on every change of that key ('*' for all of them); returns the unsubscribe
  on(k, fn) { (subs[k] ||= []).push(fn); return () => { subs[k] = (subs[k] || []).filter((f) => f !== fn); }; },
  all() { const o = { ...data }; for (const k in delegates) o[k] = delegates[k].get(); return o; },
  // hand a key to another module: { get, set, def } (def is what reset() puts back)
  delegate(k, d) { delegates[k] = d; },
  reset() { for (const k in DEFAULTS) this.set(k, DEFAULTS[k]); for (const k in delegates) if ('def' in delegates[k]) this.set(k, delegates[k].def); },
  // the live bindings table (js/input.js reads it every frame, so a slot written here takes effect at once); bind() also saves it
  get bindings() { return data.bindings; },
  // bind('light', 'pad', 0, 4): the flashlight's primary controller button becomes LB. A button already bound to another action in that
  // slot's scheme swaps places with it (and is returned), so no two actions share a button; code null clears an alternate (slot 1)
  bind(action, scheme, slot, code) {
    if (!DEFAULT_BINDINGS[action] || (scheme !== 'kb' && scheme !== 'pad')) return null;
    const b = copyBindings(data.bindings), mine = b[action][scheme]; let swapped = null;
    if (code === null || code === undefined) { if (slot > 0) mine.splice(slot, 1); }
    else {
      for (const a of ACTIONS) {   // the same scheme's other actions, except the menu ones (a play button may also be a menu button)
        if (a === action || /^(menu|tab)/.test(a) !== /^(menu|tab)/.test(action)) continue;
        const i = b[a][scheme].indexOf(code); if (i >= 0) { swapped = a; if (mine[slot] !== undefined) b[a][scheme][i] = mine[slot]; else b[a][scheme].splice(i, 1); if (!b[a][scheme].length) b[a][scheme] = [...DEFAULT_BINDINGS[a][scheme]]; }
      }
      mine[Math.min(slot, mine.length)] = code;
    }
    this.set('bindings', b); return swapped;
  },
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
