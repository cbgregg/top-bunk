// Every way of playing (keyboard and mouse, a game controller, a touch screen) read through one table of actions, settings.bindings
// (js/settings.js), so the game never names a key or a button:
//   input.down(action)   held this frame            input.edge(action)   went down this frame (one frame, after input.poll)
//   input.fx / input.fy  move (right / forward, -1..1: WASD, the left stick and the touch stick merged)
//   input.lookX / input.lookY / input.lookMag   the right stick past the deadzone, curved; lookMag its magnitude (the look acceleration)
//   input.scheme   the device used last: 'kb' | 'pad' | 'touch'      input.padType   'xbox' | 'ps' | 'switch' (what the pad says it is)
//   bindingLabel(action, scheme, slot)   the control's name on that device ("E", "RB", "△", "USE")
//   glyph(action, scheme, slot)   the same as an inline badge: a key cap for the keyboard, a coloured face button / PS shape / Switch
//                                 letter for a pad, the on-screen button's name for touch
// One-shot actions (interact, camera, light, journal, cancel, pause, the touch COVER UP) call the functions given to initInput; menus
// take the pad through input.onMenu(action) while input.menuActive() ('menuUp' 'menuDown' 'menuLeft' 'menuRight' 'menuConfirm'
// 'menuBack' 'tabPrev' 'tabNext', once per press, directions repeating while held), and then A no longer interacts or confirms.
import { settings, ACTIONS } from './settings.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const input = {
  fx: 0, fy: 0, lookX: 0, lookY: 0, lookMag: 0, padType: 'xbox', scheme: 'kb', touchDevice: false, onScheme: null,
  keys: {},            // the raw keyboard state by KeyboardEvent.code (the pause clears it)
  fired: {},           // how many times each one-shot action has fired, for the tests
  setUse() {}, setBreathVisible() {}, setCoverVisible() {}, rumble() {}, menuActive: null, onMenu: null,
  down: () => false, edge: () => false, poll() {},
  get run() { return input.down('sprint'); }, get breath() { return input.down('breath'); }, get start() { return input.down('pause'); },
};

// ---------- names ----------
// the Xbox names of the Standard-mapping buttons, and what the other pads call the same places. On a Switch the bottom button is B.
const XBOX = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Start', 'L3', 'R3', 'D-pad up', 'D-pad down', 'D-pad left', 'D-pad right', 'Guide'];
const PS = ['✕', '○', '□', '△', 'L1', 'R1', 'L2', 'R2', 'Create', 'Options', 'L3', 'R3', 'D-pad up', 'D-pad down', 'D-pad left', 'D-pad right', 'PS'];
const SWITCH = ['B', 'A', 'Y', 'X', 'L', 'R', 'ZL', 'ZR', '−', '+', 'L3', 'R3', 'D-pad up', 'D-pad down', 'D-pad left', 'D-pad right', 'Home'];
const PADNAMES = { xbox: XBOX, ps: PS, switch: SWITCH };
const KEYNAMES = { Space: 'SPACE', ShiftLeft: 'Shift', ShiftRight: 'Right Shift', ControlLeft: 'Ctrl', ControlRight: 'Right Ctrl', AltLeft: 'Alt', AltRight: 'Right Alt', Escape: 'Esc', Enter: 'Enter', NumpadEnter: 'Enter', Backspace: 'Backspace', Tab: 'Tab', CapsLock: 'Caps',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Mouse0: 'Left click', Mouse1: 'Middle click', Mouse2: 'Right click', WASD: 'WASD', Arrows: 'Arrows', Mouse: 'Mouse', LS: 'Left stick', RS: 'Right stick', Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=', Backquote: '`' };
const keyName = (code) => KEYNAMES[code] || (code && (code.match(/^(Key|Digit)(.)$/) || [])[2]) || (code && code.replace(/^Numpad/, 'Num ')) || '?';
// the on-screen buttons' own names
const TOUCH = { move: 'the left side of the screen', look: 'the right side of the screen', sprint: 'RUN', interact: 'USE', camera: 'CAM', light: 'LIGHT', breath: 'HOLD BREATH', cancel: 'CAM', journal: 'the notebook at the top', pause: 'II',
  menuUp: 'tap', menuDown: 'tap', menuLeft: '‹', menuRight: '›', menuConfirm: 'tap', menuBack: '✕', tabPrev: 'swipe', tabNext: 'swipe', photos: 'the notebook at the top' };
const CONTROLS = { move: 'Move', look: 'Look', sprint: 'Sprint', interact: 'Interact / take the photo', camera: 'Camera up / down', light: 'Flashlight', breath: 'Hold your breath / the covers', cancel: 'Put the camera away', journal: 'Your journal and photos', pause: 'Pause' };

// the keyboard's move keys, by the names the move action's slots carry
const MOVE_KEYS = { WASD: ['KeyW', 'KeyS', 'KeyA', 'KeyD'], Arrows: ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'] };
const bindings = () => settings.bindings;
const slots = (action, scheme) => { if (action === 'photos') return scheme === 'kb' ? ['Tab'] : (bindings().journal || {})[scheme] || []; const b = bindings()[action]; return (b && b[scheme]) || []; };
// which pad's names the prompts use: the Options choice, or the pad's own kind
export const padStyle = () => { const s = settings.get('promptStyle'); return s && s !== 'auto' ? s : input.padType; };
export function bindingLabel(action, scheme = input.scheme, slot = 0) {
  if (scheme === 'touch') return TOUCH[action] || '?';
  const s = slots(action, scheme), code = s[Math.min(slot, s.length - 1)];
  if (code === undefined) return '—';
  if (scheme === 'pad') return typeof code === 'number' ? (PADNAMES[padStyle()] || XBOX)[code] || `Button ${code}` : keyName(code);
  return keyName(code);
}
export const label = (action) => bindingLabel(action);
// the primary and the alternate, joined, for the Controls table
export const labels = (action, scheme = input.scheme) => { if (scheme === 'touch') return bindingLabel(action, scheme); const n = slots(action, scheme).length; return Array.from({ length: Math.max(1, n) }, (_, i) => bindingLabel(action, scheme, i)).filter((x, i, a) => a.indexOf(x) === i).join(' / '); };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// the badge: <b class="g g-kb">E</b> for a key, <i class="g g-pad g-xbox g-a">A</i> for a pad's face button (coloured), <i class="g g-pad g-pill">RB</i>
// for the rest, <b class="g g-touch">USE</b> for touch. Prompts put it where they used to write <b>${label}</b>.
export function glyph(action, scheme = input.scheme, slot = 0) {
  const name = bindingLabel(action, scheme, slot);
  if (scheme === 'touch') return `<b class="g g-touch">${esc(name)}</b>`;
  if (scheme === 'pad') {
    const s = slots(action, 'pad'), code = s[Math.min(slot, s.length - 1)], style = padStyle();
    if (typeof code === 'number' && code < 4) return `<i class="g g-pad g-${style} g-face g-${'abxy'[code]}">${esc(name)}</i>`;
    if (typeof code === 'number') return `<i class="g g-pad g-${style} g-pill">${esc(name)}</i>`;
    return `<i class="g g-pad g-${style} g-pill">${esc(name)}</i>`;
  }
  return `<b class="g g-kb">${esc(name)}</b>`;
}
export const controlsTable = () => Object.keys(CONTROLS).map((a) => [labels(a), CONTROLS[a]]);
// the badges' look, kept with the code that writes them
const GLYPH_CSS = `
.g { display: inline-block; vertical-align: baseline; font-weight: 700; line-height: 1.35; white-space: nowrap; }
b.g-kb, b.g-touch { padding: 0 6px; margin-right: 4px; border: 1px solid rgba(233,226,208,0.55); border-radius: 3px; }
i.g-pad { font-style: normal; text-align: center; margin-right: 4px; color: #f2eee4; text-shadow: none; border: 1px solid rgba(255,255,255,0.35); background: #2a2a2a; }
i.g-face { width: 1.45em; height: 1.45em; line-height: 1.45em; border-radius: 50%; padding: 0; font-size: 0.95em; }
i.g-pill { padding: 0 0.45em; border-radius: 0.7em; font-size: 0.9em; }
i.g-xbox.g-a { background: #3f8f3a; } i.g-xbox.g-b { background: #c43b32; } i.g-xbox.g-x { background: #2f6fc2; } i.g-xbox.g-y { background: #d9a92a; color: #1a1a1a; }
i.g-ps.g-face { background: #1f2430; } i.g-ps.g-a { color: #7fb2ff; } i.g-ps.g-b { color: #ff7d7d; } i.g-ps.g-x { color: #ffa3d8; } i.g-ps.g-y { color: #7fe0a8; }
i.g-switch.g-face { background: #2b2b2b; }`;

// ---------- the state ----------
const keys = input.keys, mouse = { Mouse0: false, Mouse1: false, Mouse2: false };
let kbEdges = new Set(), mouseEdges = new Set(), pad = { btn: [], edge: [], fx: 0, fy: 0, lookX: 0, lookY: 0, mag: 0, gp: null }, tch = { fx: 0, fy: 0, held: {}, edges: new Set() };
const latch = { sprint: false };   // sprint as a toggle (Options), flipped on each press
let downs = {}, edges = {};        // this frame's answers by action
input.down = (a) => !!downs[a];
input.edge = (a) => !!edges[a];

function setScheme(s) { if (input.scheme !== s) { input.scheme = s; document.body.dataset.scheme = s; if (input.onScheme) input.onScheme(s); } }
const fire = (name, fn, ...args) => { input.fired[name] = (input.fired[name] || 0) + 1; if (fn) { try { fn(...args); } catch (e) { console.error(e); } } };

export function initInput({ interact, pause, confirm, lookBy, light, cover, photos, journal, camera, cancel, cameraUp = () => false }) {
  input.touchDevice = matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches;
  if (!document.getElementById('glyph-css')) { const st = document.createElement('style'); st.id = 'glyph-css'; st.textContent = GLYPH_CSS; document.head.appendChild(st); }

  // ---------- keyboard and mouse: the raw state here, read by name in poll ----------
  addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (e.code === 'Tab') e.preventDefault();
    keys[e.code] = true; setScheme('kb');
    if (!e.repeat) kbEdges.add(e.code);
  });
  addEventListener('keyup', (e) => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; for (const k in mouse) mouse[k] = false; });
  // only a mouse that moved: the browser also sends a mousemove when the page changes under a still pointer (a prompt appearing)
  addEventListener('mousemove', (e) => { if ((e.movementX || e.movementY) && input.scheme !== 'kb' && !input.touchDevice) setScheme('kb'); });
  // the mouse buttons count only while the game holds the pointer (a click that takes the pointer back is not a use)
  addEventListener('mousedown', (e) => { const c = 'Mouse' + e.button; if (!(c in mouse)) return; mouse[c] = true; if (document.pointerLockElement) mouseEdges.add(c); });
  addEventListener('mouseup', (e) => { const c = 'Mouse' + e.button; if (c in mouse) mouse[c] = false; });

  // ---------- touch ----------
  const root = document.createElement('div'); root.id = 'touch';
  root.innerHTML = '<div id="t-look"></div><div id="t-move"><i id="t-base"></i><i id="t-knob"></i></div>'
    + '<button id="t-breath" type="button">HOLD<br>BREATH</button><button id="t-cover" type="button">COVER<br>UP</button>'
    + '<button id="t-run" type="button">RUN</button><button id="t-act" type="button"><span>USE</span><svg class="shutter" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4.2" fill="currentColor"/><rect x="15.5" y="4" width="4" height="2.4" rx="0.6" fill="currentColor"/></svg></button>'
    + '<button id="t-light" type="button">LIGHT</button><button id="t-cam" type="button">CAM</button><button id="t-pause" type="button">II</button>';
  document.body.appendChild(root);
  const $ = (id) => document.getElementById(id);
  const show = () => { root.classList.add('on'); setScheme('touch'); };
  if (input.touchDevice) show();
  addEventListener('touchstart', show, { passive: true, once: true });
  const sizeTouch = () => { root.classList.toggle('large', settings.get('touchSize') === 'large'); root.classList.toggle('left', !!settings.get('leftHanded')); };
  sizeTouch(); settings.on('touchSize', sizeTouch); settings.on('leftHanded', sizeTouch);
  // a remap or a prompt style change redraws every prompt that reads the labels
  const relabel = () => { if (input.onScheme) input.onScheme(input.scheme); };
  settings.on('bindings', relabel); settings.on('promptStyle', relabel);

  const cap = (el, e) => { try { el.setPointerCapture(e.pointerId); } catch {} };
  const stick = { id: null, ox: 0, oy: 0 }, R = 56, base = $('t-base'), knob = $('t-knob');
  const move = $('t-move');
  move.addEventListener('pointerdown', (e) => {
    if (stick.id !== null) return; stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY; cap(move, e); show();
    base.style.cssText = knob.style.cssText = `display:block;left:${e.clientX}px;top:${e.clientY}px`; e.preventDefault();
  });
  move.addEventListener('pointermove', (e) => {
    if (e.pointerId !== stick.id) return;
    let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy; const m = Math.hypot(dx, dy); if (m > R) { dx = dx / m * R; dy = dy / m * R; }
    tch.fx = dx / R; tch.fy = -dy / R; knob.style.left = stick.ox + dx + 'px'; knob.style.top = stick.oy + dy + 'px';
  });
  const endStick = (e) => { if (e.pointerId !== stick.id) return; stick.id = null; tch.fx = tch.fy = 0; base.style.display = knob.style.display = 'none'; };
  move.addEventListener('pointerup', endStick); move.addEventListener('pointercancel', endStick);

  const look = $('t-look'), lk = { id: null, x: 0, y: 0 };
  look.addEventListener('pointerdown', (e) => { if (lk.id !== null) return; lk.id = e.pointerId; lk.x = e.clientX; lk.y = e.clientY; cap(look, e); show(); e.preventDefault(); });
  look.addEventListener('pointermove', (e) => { if (e.pointerId !== lk.id) return; lookBy(-(e.clientX - lk.x) * 0.0052, -(e.clientY - lk.y) * 0.0052); lk.x = e.clientX; lk.y = e.clientY; });
  const endLook = (e) => { if (e.pointerId === lk.id) lk.id = null; };
  look.addEventListener('pointerup', endLook); look.addEventListener('pointercancel', endLook);

  // a held button (RUN, HOLD BREATH) and a tapped one (USE, LIGHT, CAM, COVER UP): each is an action by name
  const held = (id, action) => { const b = $(id); b.addEventListener('pointerdown', (e) => { tch.held[action] = true; tch.edges.add(action); b.classList.add('down'); cap(b, e); show(); e.preventDefault(); });
    const up = () => { tch.held[action] = false; b.classList.remove('down'); }; b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); };
  const tapped = (id, action) => { $(id).addEventListener('pointerdown', (e) => { tch.edges.add(action); show(); e.preventDefault(); }); };
  held('t-run', 'sprint'); held('t-breath', 'breath');
  tapped('t-act', 'interact'); tapped('t-light', 'light'); tapped('t-cam', 'camera'); tapped('t-cover', 'cover');
  $('t-pause').addEventListener('click', (e) => { fire('pause', pause); e.preventDefault(); });   // on click: on pointerdown the tap's click then landed on the pause screen and resumed
  input.setUse = (on) => $('t-act').classList.toggle('ready', !!on);
  input.setBreathVisible = (on) => $('t-breath').classList.toggle('show', !!on);
  input.setCoverVisible = (on) => $('t-cover').classList.toggle('show', !!on);
  document.addEventListener('contextmenu', (e) => { if (input.scheme === 'touch' || document.pointerLockElement) e.preventDefault(); });

  // ---------- game controller ----------
  let prev = [], rumbleAt = 0, camHeld = false;
  // menu directions from the d-pad or the left stick: first press at once, then a repeat while held. A direction already held when the
  // menu opens (walking when you paused) waits for its release.
  const heldDir = {}, menuFire = (a) => { try { input.onMenu && input.onMenu(a); } catch (e) { console.error(e); } };
  function menuNav(gp, on) {
    const now = performance.now(), ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    const dirs = { menuUp: padDown('menuUp') || ay < -0.55, menuDown: padDown('menuDown') || ay > 0.55, menuLeft: padDown('menuLeft') || ax < -0.55, menuRight: padDown('menuRight') || ax > 0.55 };
    for (const a in dirs) {
      if (!dirs[a]) { delete heldDir[a]; continue; }
      if (!on) { heldDir[a] = Infinity; continue; }
      if (!(a in heldDir)) { heldDir[a] = now + 420; menuFire(a); } else if (now >= heldDir[a]) { heldDir[a] = now + 110; menuFire(a); }
    }
    if (!on) return;
    for (const a of ['menuConfirm', 'menuBack', 'tabPrev', 'tabNext']) if (padEdge(a)) menuFire(a);
  }
  const padDown = (action) => slots(action, 'pad').some((i) => typeof i === 'number' && pad.btn[i]);
  const padEdge = (action) => slots(action, 'pad').some((i) => typeof i === 'number' && pad.edge[i]);
  const dz = (x, y) => { const d = settings.get('deadzone'), m = Math.hypot(x, y); if (m < d) return [0, 0, 0]; const k = Math.min(1, (m - d) / (1 - d)); return [x / m * k, y / m * k, k]; };
  input.rumble = (strong, weak, ms) => {
    if (!settings.get('vibration')) return;
    const gp = [...(navigator.getGamepads ? navigator.getGamepads() : [])].find((g) => g && g.connected), now = performance.now();
    if (!gp || !gp.vibrationActuator || now < rumbleAt) return; rumbleAt = now + ms * 0.8;
    try { gp.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: clamp(strong, 0, 1), weakMagnitude: clamp(weak, 0, 1) }); } catch (e) { /* no rumble */ }
  };

  // ---------- the frame: everything merged by action, then the one-shot actions fired ----------
  input.poll = () => {
    const gp = [...(navigator.getGamepads ? navigator.getGamepads() : [])].find((g) => g && g.connected);
    pad.fx = pad.fy = pad.lookX = pad.lookY = pad.mag = 0; pad.btn = []; pad.edge = []; pad.gp = gp || null;
    if (gp) {
      const id = gp.id || '';
      input.padType = /054c|playstation|dualshock|dualsense/i.test(id) ? 'ps' : /057e|nintendo|pro controller|joy-con/i.test(id) ? 'switch' : 'xbox';   // for the button names
      pad.btn = gp.buttons.map((b) => !!(b && b.pressed)); pad.edge = pad.btn.map((p, i) => p && !prev[i]);
      const [lx, ly] = dz(gp.axes[0] || 0, gp.axes[1] || 0), [rx, ry, rm] = dz(gp.axes[2] || 0, gp.axes[3] || 0);
      pad.fx = lx; pad.fy = -ly; pad.lookX = rx * Math.abs(rx) * 0.4 + rx * 0.6; pad.lookY = ry * Math.abs(ry) * 0.4 + ry * 0.6; pad.mag = rm;
      const active = Math.hypot(lx, ly, rx, ry) > 0 || pad.edge.some(Boolean);
      if (active) setScheme('pad');
      prev = pad.btn;
    } else prev = [];
    const menuOn = !!(input.menuActive && input.menuActive());
    // held and pressed, by action, from every device
    downs = {}; edges = {};
    for (const a of ACTIONS) {
      const kb = slots(a, 'kb');
      downs[a] = kb.some((c) => keys[c] || mouse[c]) || padDown(a) || !!tch.held[a];
      edges[a] = kb.some((c) => kbEdges.has(c) || mouseEdges.has(c)) || padEdge(a) || tch.edges.has(a);
    }
    edges.cover = tch.edges.has('cover');
    if (settings.get('sprintToggle')) { if (edges.sprint) latch.sprint = !latch.sprint; downs.sprint = latch.sprint; } else latch.sprint = false;
    let kx = 0, ky = 0;
    for (const m of slots('move', 'kb')) { const k = MOVE_KEYS[m]; if (k) { ky += (keys[k[0]] ? 1 : 0) - (keys[k[1]] ? 1 : 0); kx += (keys[k[3]] ? 1 : 0) - (keys[k[2]] ? 1 : 0); } }
    input.fx = clamp(pad.fx + tch.fx + kx, -1, 1); input.fy = clamp(pad.fy + tch.fy + ky, -1, 1);
    input.lookX = pad.lookX; input.lookY = pad.lookY; input.lookMag = pad.mag;
    // the one-shot actions: the pad's in play only (a menu takes A and B itself); Start always; the keys and the mouse as before
    if (gp) menuNav(gp, menuOn);
    const kbEdge = (a) => slots(a, 'kb').find((c) => kbEdges.has(c) || mouseEdges.has(c));
    const padOnly = (a) => !menuOn && padEdge(a), kbHit = (a) => kbEdge(a) !== undefined, tchHit = (a) => tch.edges.has(a);
    if (padOnly('interact') || kbHit('interact') || tchHit('interact')) { fire('interact', interact); if (padOnly('interact')) fire('confirm', confirm); }
    if (padEdge('pause')) fire('pause', pause);   // the keyboard's Esc is the menu's own (js/menu.js); the touch II button fires on its click
    if (padOnly('light') || kbHit('light') || tchHit('light')) fire('light', light);
    // the camera key toggles; with Options' "hold" the right mouse button keeps it up only while held
    const holdMouse = !!settings.get('cameraHold') && slots('camera', 'kb').includes('Mouse2');
    if (padOnly('camera') || kbHit('camera') || tchHit('camera')) fire('camera', camera, holdMouse && kbEdge('camera') === 'Mouse2' ? 'up' : 'toggle');
    if (camHeld && !mouse.Mouse2) fire('camera', camera, 'down');
    camHeld = holdMouse && mouse.Mouse2;
    if (padOnly('cancel')) fire('cancel', cancel);
    if (padEdge('journal') || kbHit('journal') || tchHit('journal')) { if (kbEdge('journal') === 'Tab' && photos) fire('photos', photos); else fire('journal', journal); }   // from inside the journal too: it toggles
    if (tchHit('cover')) fire('cover', cover);
    // the touch USE button shows the shutter while the camera is up
    $('t-act').classList.toggle('cam', !!cameraUp());
    kbEdges = new Set(); mouseEdges = new Set(); tch.edges = new Set();
  };
}
