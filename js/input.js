// Game controller and touch input, merged into one analog state that the game reads next to the keyboard and mouse.
//   input.fx / input.fy   move (right / forward, -1..1)      input.lookX / input.lookY   look speed (right stick, -1..1)
//   input.run / input.breath   held buttons                  input.scheme   which device was used last: 'kb' | 'pad' | 'touch'
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
//   input.menuActive() / input.onMenu(action)   set by js/menu.js: while a menu is up the controller drives it ('menuUp' 'menuDown' 'menuLeft'
//   'menuRight' 'menuConfirm' 'menuBack', once per press, directions repeating while held) and A no longer interacts or confirms
export const input = {
  fx: 0, fy: 0, lookX: 0, lookY: 0, run: false, breath: false, scheme: 'kb', touchDevice: false, onScheme: null,
  setUse() {}, setBreathVisible() {}, rumble() {}, menuActive: null, onMenu: null,
};

const LABELS = {
  move: { kb: 'WASD', pad: 'Left stick', touch: 'the left side of the screen' },
  look: { kb: 'Mouse', pad: 'Right stick', touch: 'the right side of the screen' },
  interact: { kb: 'E', pad: 'A', touch: 'USE' },
  sprint: { kb: 'Shift', pad: 'RT', touch: 'RUN' },
  breath: { kb: 'SPACE', pad: 'LT', touch: 'HOLD' },
  light: { kb: 'F', pad: 'Y', touch: 'LIGHT' },
  pause: { kb: 'Esc', pad: 'Start', touch: 'II' },
};
export const label = (action) => LABELS[action][input.scheme];
export const controlsTable = () => ['move', 'look', 'sprint', 'interact', 'breath', 'light', 'pause'].map((a) => [a === 'move' && input.scheme === 'touch' ? 'Left thumb' : a === 'look' && input.scheme === 'touch' ? 'Right thumb' : LABELS[a][input.scheme],
  { move: 'Move', look: 'Look', sprint: 'Sprint', interact: 'Interact', breath: 'Hold your breath / hide', light: 'Flashlight', pause: 'Pause' }[a]]);

function setScheme(s) { if (input.scheme !== s) { input.scheme = s; document.body.dataset.scheme = s; if (input.onScheme) input.onScheme(s); } }

export function initInput({ interact, pause, confirm, lookBy, light, cover }) {
  input.touchDevice = matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches;
  addEventListener('keydown', () => setScheme('kb'));
  addEventListener('mousemove', () => { if (input.scheme !== 'kb' && !input.touchDevice) setScheme('kb'); });

  // ---------- touch ----------
  const root = document.createElement('div'); root.id = 'touch';
  root.innerHTML = '<div id="t-look"></div><div id="t-move"><i id="t-base"></i><i id="t-knob"></i></div>'
    + '<button id="t-breath" type="button">HOLD<br>BREATH</button><button id="t-run" type="button">RUN</button><button id="t-act" type="button">USE</button><button id="t-light" type="button">LIGHT</button><button id="t-cover" type="button">COVER<br>UP</button><button id="t-pause" type="button">II</button>';
  document.body.appendChild(root);
  const $ = (id) => document.getElementById(id), tch = { fx: 0, fy: 0, run: false, breath: false };
  const show = () => { root.classList.add('on'); setScheme('touch'); };
  if (input.touchDevice) show();
  addEventListener('touchstart', show, { passive: true, once: true });

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

  const hold = (id, key) => { const b = $(id); b.addEventListener('pointerdown', (e) => { tch[key] = true; b.classList.add('down'); cap(b, e); show(); e.preventDefault(); });
    const up = () => { tch[key] = false; b.classList.remove('down'); }; b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); };
  hold('t-run', 'run'); hold('t-breath', 'breath');
  $('t-act').addEventListener('pointerdown', (e) => { interact(); show(); e.preventDefault(); });
  $('t-pause').addEventListener('click', (e) => { pause(); e.preventDefault(); });   // (on click: on pointerdown the tap's click then landed on the pause screen and resumed)
  $('t-light').addEventListener('pointerdown', (e) => { if (light) light(); e.preventDefault(); });
  input.setUse = (on) => $('t-act').classList.toggle('ready', !!on);
  input.setBreathVisible = (on) => $('t-breath').classList.toggle('show', !!on);
  input.setCoverVisible = (on) => $('t-cover').classList.toggle('show', !!on);
  $('t-cover').addEventListener('pointerdown', (e) => { cover(); show(); e.preventDefault(); });
  document.addEventListener('contextmenu', (e) => { if (input.scheme === 'touch') e.preventDefault(); });

  // ---------- game controller ----------
  let prev = [], rumbleAt = 0, pad = { fx: 0, fy: 0, lookX: 0, lookY: 0, run: false, breath: false };
  // menu directions from the d-pad or the left stick: first press at once, then a repeat while held. A direction already held when the
  // menu opens (walking when you paused) waits for its release.
  const held = {}, fire = (a) => { try { input.onMenu && input.onMenu(a); } catch (e) { console.error(e); } };
  function menuNav(gp, btn, edge, on) {
    const now = performance.now(), ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    const dirs = { menuUp: btn(12) || ay < -0.55, menuDown: btn(13) || ay > 0.55, menuLeft: btn(14) || ax < -0.55, menuRight: btn(15) || ax > 0.55 };
    for (const a in dirs) {
      if (!dirs[a]) { delete held[a]; continue; }
      if (!on) { held[a] = Infinity; continue; }
      if (!(a in held)) { held[a] = now + 420; fire(a); } else if (now >= held[a]) { held[a] = now + 110; fire(a); }
    }
    if (on && edge(0)) fire('menuConfirm');
    if (on && edge(1)) fire('menuBack');
  }
  const dz = (x, y) => { const m = Math.hypot(x, y); if (m < 0.2) return [0, 0]; const k = (m - 0.2) / 0.8 / m; return [x * k, y * k]; };
  input.rumble = (strong, weak, ms) => {
    const gp = [...(navigator.getGamepads ? navigator.getGamepads() : [])].find((g) => g && g.connected), now = performance.now();
    if (!gp || !gp.vibrationActuator || now < rumbleAt) return; rumbleAt = now + ms * 0.8;
    try { gp.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: clamp(strong, 0, 1), weakMagnitude: clamp(weak, 0, 1) }); } catch (e) { /* no rumble */ }
  };
  input.poll = () => {
    const gp = [...(navigator.getGamepads ? navigator.getGamepads() : [])].find((g) => g && g.connected);
    pad.fx = pad.fy = pad.lookX = pad.lookY = 0; pad.run = pad.breath = false;
    if (gp) {
      const btn = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed), edge = (i) => btn(i) && !prev[i];
      const [lx, ly] = dz(gp.axes[0] || 0, gp.axes[1] || 0), [rx, ry] = dz(gp.axes[2] || 0, gp.axes[3] || 0);
      pad.fx = lx; pad.fy = -ly; pad.lookX = rx * Math.abs(rx) * 0.4 + rx * 0.6; pad.lookY = ry * Math.abs(ry) * 0.4 + ry * 0.6;
      pad.run = btn(7) || btn(5) || btn(10) || btn(1); pad.breath = btn(6) || btn(4) || btn(0);
      const dpad = [btn(12) ? 1 : 0, btn(13) ? 1 : 0, btn(14) ? 1 : 0, btn(15) ? 1 : 0];   // d-pad also moves
      pad.fy += dpad[0] - dpad[1]; pad.fx += dpad[3] - dpad[2];
      const active = Math.hypot(lx, ly, rx, ry) > 0 || gp.buttons.some((b, i) => b.pressed && !prev[i]);
      if (active) setScheme('pad');
      const menuOn = !!(input.menuActive && input.menuActive());
      menuNav(gp, btn, edge, menuOn);
      if (!menuOn && (edge(0) || edge(2))) { interact(); confirm(); }
      if (edge(9)) pause();
      if (edge(3) && light) light();
      prev = gp.buttons.map((b) => b.pressed);
    } else prev = [];
    input.fx = clamp(pad.fx + tch.fx, -1, 1); input.fy = clamp(pad.fy + tch.fy, -1, 1);
    input.lookX = pad.lookX; input.lookY = pad.lookY; input.run = pad.run || tch.run; input.breath = pad.breath || tch.breath;
  };
}
