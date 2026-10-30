// The title, pause, options and end menus. Every menu is a list of entries (MENUS.title, MENUS.pause, MENUS.options ...) and every panel a
// small definition (PANELS.options, .credits, .controls, .newgame); the keyboard (arrows or WASD, Enter or Space, Esc), a game controller
// (d-pad or left stick, A, B: input.onMenu in js/input.js), the mouse and touch all drive them. The title, pause and end lists live in their
// screens (#title, #pause, #end) and open by themselves when those screens show; panels open over them in #menu. Other modules add to them, e.g.
//   menu.panel('achievements', { title: 'Achievements', render: (body) => { body.innerHTML = '...'; } });
//   menu.add('title', { id: 'achievements', label: 'Achievements', panel: 'achievements' }, { after: 'options' });
// Entry: { id, label, when?, hint?, panel? | action? | el? }   (el: the id of an existing element to use; it keeps its own click handler)
//        { type: 'slider', key, min, max, step, fmt? } | { type: 'toggle', key } | { type: 'choice', key, options: [[value, label], ...] }
//        { type: 'code', get, set, placeholder? }   (a typed code in the seed's form: Enter or A edits it, and on a controller left / right
//                                                    then pick a character and up / down change it)
//        { type: 'heading', label } | { type: 'figure', label, draw(el) }   (not selectable; a figure is redrawn whenever a setting changes)
//        (labels, hints and when may be functions)
import { settings } from './settings.js';
import { input } from './input.js';

const $ = (id) => document.getElementById(id);
const val = (v) => (typeof v === 'function' ? v() : v);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = (v) => `${Math.round(v * 100)}%`;
// from main.js (menu.init): startGame, newGame(seed), nextSeed, hasSave, night, resume, pause, canPause, stage, canRestart, restartNight,
// quitToTitle, playAgain, shade(v) (the colour a grey of scene value v shows at night, for the brightness calibration)
const H = {};
const saved = () => !!(H.hasSave && H.hasSave());
const desktop = () => !!(window.desktop && window.desktop.isDesktop);
const quitApp = () => { if (window.desktop && window.desktop.quit) window.desktop.quit(); };
// Restart and leaving depend on where you are: moving day is kept only once it is over, and a morning goes on to the next night
const part = () => { const s = (H.stage && H.stage()) || 'n'; return s === 'day' ? 'day' : s[0] === 'b' ? 'morning' : 'night'; };
const kept = () => ({ day: 'Moving day is not kept until it is over: it starts again from the beginning.', night: 'Your run is kept: you start this night again next time.', morning: `Your run is kept: you go on from night ${H.night ? H.night() : 2} next time.` }[part()]);
const KEYS = { kb: 'Up / down choose  ·  left / right change  ·  Enter select  ·  Esc back', pad: 'D-pad choose  ·  left / right change  ·  A select  ·  B back', touch: 'Tap to choose  ·  ‹ › change' };

// ---------- a new game and its seed: the field starts on a random seed, and left empty it means a random one too ----------
const SEED = { v: '' };
const SEED_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // what rng.js newSeed draws from, in the order the d-pad steps through them
// any typing into a seed's form: upper case letters and digits, at most eight, a dash after the fourth ("k7qx29md" -> "K7QX-29MD")
const seedCode = (s) => { const c = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8); return c.length > 4 ? `${c.slice(0, 4)}-${c.slice(4)}` : c; };
const editing = () => { const f = document.activeElement; return !!(f && f.classList && f.classList.contains('mcode')); };
function newGame() { SEED.v = seedCode(H.nextSeed ? H.nextSeed() : ''); open('newgame'); }
function beginNew() {
  const seed = seedCode(SEED.v) || seedCode(H.nextSeed ? H.nextSeed() : '');
  if (saved()) ask({ title: 'New game', text: `Start over from moving day? The run you are on (night ${H.night()}) will be lost.`, yes: 'Start over', action: () => H.newGame(seed) });
  else H.newGame(seed);
}
// the brightness calibration: three grey squares on black, coloured the way the night scene would show those greys (H.shade, from gfx.js)
const CAL = [0.012, 0.03, 0.1];   // scene values that read as barely visible, dim and plain at the default brightness
function calibrate(el) {
  if (!el.firstChild) el.innerHTML = '<i></i><i></i><i></i>';
  [...el.children].forEach((sq, i) => { const g = [11, 31, 86][i], c = H.shade ? H.shade(CAL[i]) : [g, g, g]; sq.style.background = `rgb(${c.join(',')})`; });
}

export const MENUS = {
  title: [
    { id: 'continue', el: 'start', label: () => `Continue · Night ${H.night ? H.night() : 1}`, when: saved },
    { id: 'new', label: 'New game', action: newGame },
    { id: 'options', label: 'Options', panel: 'options' },
    { id: 'credits', label: 'Credits', panel: 'credits' },
    { id: 'controls', label: 'Controls', panel: 'controls' },
    { id: 'quit', label: 'Quit', when: desktop, action: () => ask({ title: 'Quit', text: 'Close the game?', yes: 'Quit', action: quitApp }) },
  ],
  pause: [
    { id: 'resume', label: 'Resume', action: () => H.resume() },
    { id: 'options', label: 'Options', panel: 'options' },
    { id: 'controls', label: 'Controls', panel: 'controls' },
    { id: 'restart', label: () => `Restart ${part()}`, when: () => !H.canRestart || H.canRestart(),
      action: () => ask({ title: `Restart ${part()}`, text: `Start ${part() === 'day' ? 'moving day' : `this ${part()}`} again from the beginning?`, yes: 'Restart', action: () => H.restartNight() }) },
    { id: 'title', label: 'Quit to title', action: () => ask({ title: 'Quit to title', text: `Leave for the title screen? ${kept()}`, yes: 'Quit to title', action: () => H.quitToTitle() }) },
    { id: 'quit', label: 'Quit game', when: desktop, action: () => ask({ title: 'Quit game', text: `Close the game? ${kept()}`, yes: 'Quit', action: quitApp }) },
  ],
  options: [
    { type: 'heading', label: 'Sound' },
    { id: 'master', type: 'slider', key: 'master', label: 'Master volume', min: 0, max: 1, step: 0.05 },
    { id: 'music', type: 'slider', key: 'music', label: 'Music', min: 0, max: 1, step: 0.05 },
    { id: 'sfx', type: 'slider', key: 'sfx', label: 'Effects', min: 0, max: 1, step: 0.05 },
    { id: 'voice', type: 'slider', key: 'voice', label: 'Voices', min: 0, max: 1, step: 0.05 },
    { type: 'heading', label: 'Controls' },
    { id: 'sensitivity', type: 'slider', key: 'sensitivity', label: 'Look sensitivity', min: 0.3, max: 3, step: 0.1, fmt: (v) => `${v.toFixed(1)}×`, hint: 'Mouse, right stick and the touch look pad.' },
    { id: 'invertY', type: 'toggle', key: 'invertY', label: 'Invert look up/down' },
    { type: 'heading', label: 'Picture' },
    { id: 'brightness', type: 'slider', key: 'brightness', label: 'Brightness', min: -1, max: 1, step: 0.1, fmt: (v) => (v ? `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}` : '0'), hint: 'Adjust until the left square is barely visible.' },
    { id: 'calibration', type: 'figure', label: 'Three grey squares on black, for setting the brightness', draw: calibrate },
    { id: 'fov', type: 'slider', key: 'fov', label: 'Field of view', min: 60, max: 100, step: 1, fmt: (v) => `${Math.round(v)}°` },
    { id: 'headBob', type: 'toggle', key: 'headBob', label: 'Head bob', hint: 'The sway of your steps while you walk.' },
    { id: 'quality', type: 'choice', key: 'quality', label: 'Graphics', options: [['auto', 'Auto'], ['ultra', 'Ultra'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']], hint: 'Auto picks a preset for this device and steps down if it runs slowly.' },
    { type: 'heading', label: 'Accessibility' },
    { id: 'subtitles', type: 'toggle', key: 'subtitles', label: 'Subtitles', hint: 'The words of spoken lines. Captions and your own thoughts always show.' },
    { id: 'reduceFlashing', type: 'toggle', key: 'reduceFlashing', label: 'Reduce flashing', hint: 'Softer, slower light flicker and screen flashes. The scares stay.' },
    { id: 'defaults', label: 'Restore defaults', action: () => ask({ title: 'Restore defaults', text: 'Put every option back the way it started?', yes: 'Restore', action: () => settings.reset() }) },
  ],
  newgame: [
    { id: 'seed', type: 'code', label: 'Seed', placeholder: 'Random', get: () => SEED.v, set: (v) => { SEED.v = seedCode(v); },
      hint: () => (!editing() ? 'The same seed plays the same ten nights. Keep this one, or put in one you were given.'
        : input.scheme === 'pad' ? 'Left / right pick a character  ·  up / down change it  ·  A done' : 'Type the seed, then Enter.') },
    { id: 'start', label: 'Start', action: beginNew },
  ],
  end: [
    { id: 'again', label: 'Play again', action: () => H.playAgain() },
    { id: 'title', label: 'Main menu', action: () => H.quitToTitle() },
    { id: 'quit', label: 'Quit', when: desktop, action: quitApp },
  ],
};

// condensed from CREDITS.md (kept in the page: nothing is fetched at runtime)
const CREDITS = `<dl class="credits">
<dt>Characters</dt><dd>Microsoft Rocketbox Avatar Library, MIT License, © 2020 Microsoft (Female_Adult_01, Male_Adult_05, Male_Adult_06).</dd>
<dt>Animation</dt><dd>Idle, walk, run and gesture clips from Mixamo (Adobe), as shipped in the three.js example Xbot.glb, retargeted onto the Rocketbox skeleton.</dd>
<dt>3D engine</dt><dd>three.js r170, MIT License, © 2010–2024 three.js authors.</dd>
<dt>Fonts</dt><dd>Special Elite (Astigmatic) and Permanent Marker (Font Diner), Apache License 2.0. Courier Prime (Alan Dague-Greene) and Gloria Hallelujah (Kimberly Geswein), SIL Open Font License 1.1.</dd>
<dt>Voices, music and sound effects</dt><dd>Generated with ElevenLabs (the night's brown noise is made with ffmpeg).</dd>
<dt>Surfaces, models and sky</dt><dd>Poly Haven and ambientCG, CC0.</dd>
<dt>Photographs in the frames</dt><dd>Public domain, via Wikimedia Commons: Arthur Rothstein (Family in a wagon, Lee County, Mississippi, 1935), Russell Lee (the England family reunion, NARA 540764), US National Park Service (Mount Rainier and lake reflection), Gorgo (Moraine Lake), NYPL (Sailing at Sunset, New Dorp Beach), Mount Rainier National Park (wildflowers).</dd>
</dl><p class="note">The full license texts ship with the game: vendor/three/LICENSE, assets/models/LICENSE-Rocketbox.md, assets/fonts/LICENSE-fonts.md.</p>`;

export const PANELS = {
  options: { title: 'Options', list: 'options' },
  credits: { title: 'Credits', html: CREDITS, list: 'credits' },
  controls: { title: 'Controls', list: 'controls', render: (body) => { const t = $('controls'); if (t) { t.dataset.adopted = '1'; body.appendChild(t); } } },
  newgame: { title: 'New game', list: 'newgame', focus: 1 },
};
const ROOTS = ['title', 'pause', 'end'];

// ---------- state ----------
const S = { stack: [], keep: null, overlay: null };
const top = () => S.stack[S.stack.length - 1];
const active = () => S.stack.length > 0;
function keep() {   // where borrowed elements wait while their menu is closed (main.js still writes into them)
  if (!S.keep) { S.keep = $('menu-keep') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'menu-keep', hidden: true })); }
  return S.keep;
}
const rescue = (el) => { for (const n of [...el.querySelectorAll('[data-adopted]'), ...[...el.children].filter((c) => c.id)]) keep().appendChild(n); };
const stop = (el) => { for (const t of ['click', 'pointerdown']) el.addEventListener(t, (e) => e.stopPropagation()); };   // (a click on a menu is not a click on its screen)
function overlay() {
  if (!S.overlay) {
    S.overlay = $('menu') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'menu', className: 'screen hidden' }));
    S.overlay.setAttribute('role', 'dialog'); S.overlay.setAttribute('aria-modal', 'true'); stop(S.overlay);
  }
  return S.overlay;
}
function rootNav(id) {
  let n = $(id + '-menu');
  if (!n) { n = document.createElement('nav'); n.id = id + '-menu'; n.className = 'menu'; const p = $(id).querySelector('.panel') || $(id); p.insertBefore(n, p.querySelector('.begin')); }
  return n;
}

// ---------- building ----------
function show(e, el) {   // a row's current value
  if (e.type === 'code') { const f = el.querySelector('input'); if (document.activeElement !== f) f.value = e.get(); return; }
  if (!e.key) return;
  const v = settings.get(e.key), out = el.querySelector('output');
  if (e.type === 'slider') { const r = el.querySelector('input'); r.value = v; out.textContent = (e.fmt || pct)(v); r.setAttribute('aria-valuetext', out.textContent); }
  else if (e.type === 'toggle') { out.textContent = v ? 'On' : 'Off'; el.classList.toggle('on', !!v); el.setAttribute('aria-checked', String(!!v)); }
  else if (e.type === 'choice') { const o = (e.options || []).find(([k]) => k === v); out.textContent = o ? o[1] : String(v); }
}
function adjust(e, d, wrap = false) {
  if (e.type === 'slider') { const v = settings.get(e.key), n = Math.round((v + d * e.step) / e.step) * e.step; settings.set(e.key, +Math.min(e.max, Math.max(e.min, n)).toFixed(4)); }
  else if (e.type === 'toggle') settings.set(e.key, !settings.get(e.key));
  else if (e.type === 'choice') {
    const ks = e.options.map(([k]) => k); let i = ks.indexOf(settings.get(e.key)) + d;
    i = wrap ? (i + ks.length) % ks.length : Math.max(0, Math.min(ks.length - 1, i)); settings.set(e.key, ks[i]);
  }
}
function run(e) { if (e.panel) open(e.panel); else if (e.action) e.action(); }
// a code field on a controller: one character at a time (slot 0-7, the dash skipped), selected so it shows which
const slotOf = (f) => (f.selectionStart > 4 ? f.selectionStart - 1 : f.selectionStart);
function pick(f, slot) { const p = slot + (slot >= 4 ? 1 : 0); f.setSelectionRange(p, Math.min(p + 1, f.value.length)); }
function codeNav(it, a) {
  const f = it.el.querySelector('input'), chars = f.value.replace('-', ''), at = Math.min(slotOf(f), chars.length);
  if (a === 'menuLeft' || a === 'menuRight') pick(f, Math.max(0, Math.min(chars.length, 7, at + (a === 'menuLeft' ? -1 : 1))));
  else if (a === 'menuUp' || a === 'menuDown') {
    const n = SEED_CHARS.length, i = SEED_CHARS.indexOf(chars[at]), d = a === 'menuUp' ? 1 : -1;
    const ch = SEED_CHARS[i < 0 ? (d > 0 ? 0 : n - 1) : (i + d + n) % n];
    it.e.set(chars.slice(0, at) + ch + chars.slice(at + 1)); f.value = it.e.get(); pick(f, at);
  } else if (a === 'menuConfirm') { f.blur(); focus(top().i + 1); }   // (done: on to Start)
  else if (a === 'menuBack') f.blur();
  else return false;
  return true;
}
function make(e) {
  if (e.type === 'heading') { const h = document.createElement('div'); h.className = 'mh'; h.textContent = val(e.label); return h; }
  if (e.type === 'figure') { const g = document.createElement('div'); g.className = 'mfig'; g.setAttribute('role', 'img'); g.setAttribute('aria-label', val(e.label) || ''); e.draw(g); return g; }
  const own = e.el && val(e.el) && $(val(e.el)), arrows = '<button type="button" class="ma" tabindex="-1" aria-label="Less">‹</button>%<button type="button" class="ma" tabindex="-1" aria-label="More">›</button>';
  let el;
  if (own) { el = own; el.dataset.adopted = '1'; }
  else if (e.type === 'slider' || e.type === 'choice' || e.type === 'code') { el = document.createElement('div'); el.tabIndex = -1; }
  else { el = document.createElement('button'); el.type = 'button'; }
  el.className = `mi mi-${e.type || 'action'}`; el.dataset.entry = e.id || '';
  if (e.type === 'slider') {
    el.setAttribute('role', 'group');
    el.innerHTML = '<span class="ml"></span><span class="mv">' + arrows.replace('%', '<input type="range" tabindex="-1"><output></output>') + '</span>';
    const r = el.querySelector('input'); r.min = e.min; r.max = e.max; r.step = e.step;
    r.addEventListener('input', () => settings.set(e.key, +r.value));
  } else if (e.type === 'choice') {
    el.innerHTML = '<span class="ml"></span><span class="mv">' + arrows.replace('%', '<output></output>') + '</span>';
    el.addEventListener('click', () => adjust(e, 1, true));
  } else if (e.type === 'toggle') {
    el.setAttribute('role', 'switch'); el.innerHTML = '<span class="ml"></span><span class="mv"><output></output></span>';
    el.addEventListener('click', () => adjust(e, 1));
  } else if (e.type === 'code') {
    el.innerHTML = '<span class="ml"></span><span class="mv"><input class="mcode" type="text" tabindex="-1" maxlength="9" spellcheck="false" autocomplete="off" autocapitalize="characters" enterkeyhint="done"></span>';
    const f = el.querySelector('input'); f.placeholder = val(e.placeholder) || ''; f.setAttribute('aria-label', val(e.label));
    f.addEventListener('input', () => {   // reformatted as it is typed, with the caret kept after the same character
      const n = seedCode(f.value.slice(0, f.selectionStart)).replace('-', '').length;
      e.set(f.value); f.value = e.get(); const p = n > 4 ? n + 1 : n; f.setSelectionRange(p, p);
    });
    f.addEventListener('focus', () => { if (input.scheme === 'pad') pick(f, 0); const v = top(); if (v && v.items) paint(v); });
    f.addEventListener('blur', () => { e.set(f.value); f.value = e.get(); const v = top(); if (v && v.items) paint(v); });
    el.addEventListener('click', () => { if (document.activeElement !== f) f.focus(); });
  } else {
    el.innerHTML = '<span class="ml"></span>';
    if (!own) el.addEventListener('click', () => run(e));
  }
  el.querySelectorAll('.ma').forEach((b, j) => b.addEventListener('click', (ev) => { ev.stopPropagation(); adjust(e, j ? 1 : -1); }));
  el.querySelector('.ml').textContent = val(e.label);
  show(e, el);
  return el;
}
function build(v) {
  rescue(v.nav); v.nav.textContent = ''; v.items = []; v.figs = [];
  const list = (MENUS[v.list] || []).filter((e) => e.when === undefined || val(e.when));
  if (v.back) list.push({ id: 'back', label: 'Back', action: () => back() });
  for (const e of list) {
    const el = make(e); v.nav.appendChild(el);
    if (e.type === 'figure') v.figs.push({ e, el });
    if (e.type === 'heading' || e.type === 'figure') continue;
    const k = v.items.length; v.items.push({ e, el });
    el.addEventListener('pointermove', () => { if (top() === v && v.i !== k) focus(k, false); });
  }
  v.i = Math.max(0, Math.min(v.items.length - 1, v.i || 0));
  paint(v);
}
function paint(v) {
  v.items.forEach((it, k) => { it.el.classList.toggle('focus', k === v.i); if (k === v.i) it.el.setAttribute('aria-current', 'true'); else it.el.removeAttribute('aria-current'); });
  if (v.hint) { const it = v.items[v.i]; v.hint.textContent = (it && val(it.e.hint)) || KEYS[input.scheme] || ''; }
}
function focus(k, scroll = true) {
  const v = top(); if (!v || !v.items[k]) return;
  v.i = k; paint(v);
  const el = v.items[k].el; try { el.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  if (scroll && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
}
function refresh() { for (const v of S.stack) { for (const it of v.items || []) show(it.e, it.el); for (const g of v.figs || []) g.e.draw(g.el); } }

// ---------- opening and closing ----------
function hideOverlay() {
  const o = overlay(); rescue(o); o.textContent = ''; o.classList.add('hidden');
  if (S.stack[0] && S.stack[0].screen) S.stack[0].screen.classList.remove('menu-sub');
}
function open(id) {
  if (ROOTS.includes(id)) {
    if (S.stack.length) hideOverlay();
    S.stack = [{ id, root: true, list: id, nav: rootNav(id), screen: $(id), i: 0 }];
    build(top()); focus(0, false);
    return;
  }
  const p = PANELS[id]; if (!p || !S.stack.length) return;   // (a panel opens over the title or the pause menu)
  S.stack.push({ id, list: p.list || id, back: !p.noBack, i: p.focus || 0, def: p });
  renderPanel(top());
}
function renderPanel(v) {
  const o = overlay(), p = v.def; rescue(o);
  o.innerHTML = '<div class="panel menu-panel"><h2></h2><div class="menu-body"></div><nav class="menu"></nav><p class="menu-hint"></p></div>';
  o.querySelector('h2').textContent = val(p.title);
  v.body = o.querySelector('.menu-body'); v.nav = o.querySelector('nav'); v.hint = o.querySelector('.menu-hint');
  v.nav.setAttribute('aria-label', val(p.title));
  if (p.html) v.body.innerHTML = val(p.html);
  if (p.render) p.render(v.body, menu);
  const hasBody = v.body.childNodes.length > 0; v.body.hidden = !hasBody; o.firstChild.classList.toggle('has-body', hasBody);
  o.classList.remove('hidden'); if (S.stack[0].screen) S.stack[0].screen.classList.add('menu-sub');
  build(v); focus(v.i, false);
}
function pop() {
  if (S.stack.length < 2) return;
  S.stack.pop(); const v = top();
  if (v.root) { hideOverlay(); build(v); focus(v.i, false); } else renderPanel(v);
}
function close() { if (S.stack.length) hideOverlay(); S.stack = []; }
function back() {
  const v = top(); if (!v) return;
  if (!v.root) { pop(); return; }
  // at the pause menu Back resumes, except from the keyboard: Esc cannot take the mouse back (the browser wants a click or Enter), so it points at Resume
  if (v.id === 'pause') { if (input.scheme === 'kb') focus(0); else if (H.resume) H.resume(); }
}
// a yes / no question as a panel (the answer defaults to no)
function ask({ title, text, yes = 'OK', no = 'Cancel', action }) {
  PANELS.confirm = { title, html: `<p class="menu-ask">${esc(text)}</p>`, list: 'confirm', noBack: true, focus: 1 };
  MENUS.confirm = [{ id: 'yes', label: yes, action: () => { pop(); action(); } }, { id: 'no', label: no, action: () => pop() }];
  open('confirm');
}

// ---------- input ----------
function move(v, d) {
  if (v.items.length <= 1 && v.body && !v.body.hidden && v.body.scrollHeight > v.body.clientHeight) { v.body.scrollBy({ top: d * 90 }); return; }   // (credits: up / down scroll the text)
  const n = v.items.length; if (n) focus((v.i + d + n) % n);
}
// one menu action, from the keyboard, the controller (input.onMenu) or a test: menuUp menuDown menuLeft menuRight menuConfirm menuBack
function nav(a) {
  const v = top(); if (!v) return false;
  const it = v.items[v.i];
  if (it && it.e.type === 'code' && editing()) return codeNav(it, a);
  if (a === 'menuUp' || a === 'menuDown') move(v, a === 'menuUp' ? -1 : 1);
  else if (a === 'menuLeft' || a === 'menuRight') { if (it && it.e.key) adjust(it.e, a === 'menuLeft' ? -1 : 1); }
  else if (a === 'menuConfirm') { if (it && it.e.type !== 'slider') it.el.click(); }
  else if (a === 'menuBack') back();
  else return false;
  return true;
}
const KEYMAP = { ArrowUp: 'menuUp', KeyW: 'menuUp', ArrowDown: 'menuDown', KeyS: 'menuDown', ArrowLeft: 'menuLeft', KeyA: 'menuLeft', ArrowRight: 'menuRight', KeyD: 'menuRight', Enter: 'menuConfirm', NumpadEnter: 'menuConfirm', Space: 'menuConfirm', Escape: 'menuBack', Backspace: 'menuBack' };
const fresh = new Set();   // keys pressed while a menu is up: only these may auto-repeat (W or Space held from the game must not scroll or click)
function onKey(e) {
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  if (!active()) { if (e.code === 'Escape' && !e.repeat && H.canPause && H.canPause()) H.pause(); return; }   // (Esc pauses even when the browser refused the mouse)
  if (editing()) {   // typing in a code field: every key types, except these; and none of them reaches the game (E, F, Space, the arrows)
    e.stopPropagation();
    const k = { Enter: 'menuConfirm', NumpadEnter: 'menuConfirm', Escape: 'menuBack' }[e.code];
    if (k) { e.preventDefault(); nav(k); } else if (e.code === 'ArrowUp' || e.code === 'ArrowDown') { e.preventDefault(); document.activeElement.blur(); nav(KEYMAP[e.code]); }
    return;
  }
  const a = KEYMAP[e.code]; if (!a || (e.target && e.target.tagName === 'SELECT')) return;
  e.preventDefault();
  if (!e.repeat) fresh.add(e.code); else if (!fresh.has(e.code) || a === 'menuConfirm' || a === 'menuBack') return;
  nav(a);
}

// ---------- setup ----------
let ready = false;
function watch(id) {   // the menu follows its screen: shown, it opens; hidden (the game starts, the pause ends), it closes
  const el = $(id); if (!el) return;
  const sync = () => {
    const shown = !el.classList.contains('hidden'), mine = S.stack.length > 0 && S.stack[0].id === id;
    if (shown && !mine) open(id); else if (!shown && mine) close();
  };
  new MutationObserver(sync).observe(el, { attributes: true, attributeFilter: ['class'] });
  sync();
}
function init(hooks = {}) {
  Object.assign(H, hooks);
  if (ready) return; ready = true;
  input.menuActive = active; input.onMenu = nav;
  settings.on('*', refresh);
  overlay();
  for (const id of ROOTS) if ($(id)) stop(rootNav(id));
  addEventListener('keydown', onKey, true);
  addEventListener('keyup', (e) => { fresh.delete(e.code); if (active() && (e.code === 'Space' || e.code === 'Enter')) e.preventDefault(); }, true);   // (no second click from a focused button)
  addEventListener('blur', () => fresh.clear());
  document.addEventListener('focusin', (e) => { const v = top(); if (!v || !v.items) return; const k = v.items.findIndex((it) => it.el === e.target || it.el.contains(e.target)); if (k >= 0 && k !== v.i) { v.i = k; paint(v); } });
  for (const id of ROOTS) watch(id);
}

export const menu = {
  MENUS, PANELS, init, open, close, back, nav, ask, refresh, active, newGame,
  // add (or replace, by id) an entry in a list: { after: id } | { before: id } | { index: n }, else at the end
  add(list, entry, pos = {}) {
    const L = (MENUS[list] ||= []), at = (id) => L.findIndex((e) => e.id === id);
    if (entry.id && at(entry.id) >= 0) L.splice(at(entry.id), 1);
    let i = L.length;
    if (pos.index !== undefined) i = pos.index; else if (pos.after && at(pos.after) >= 0) i = at(pos.after) + 1; else if (pos.before && at(pos.before) >= 0) i = at(pos.before);
    if (!(i >= 0 && i <= L.length)) i = L.length;
    L.splice(i, 0, entry);
    for (const v of S.stack) if (v.list === list && v.nav) build(v);
    if (top() && top().list === list) focus(top().i, false);
    return entry;
  },
  // define a panel: { title, html? | render?(body, menu), list? (entries below it; Back is added), noBack?, focus? }
  panel(id, def) { PANELS[id] = { list: id, ...def }; MENUS[PANELS[id].list] ||= []; return PANELS[id]; },
  set: (k, v) => settings.set(k, v),
  get state() { const v = top(); return { open: S.stack.map((x) => x.id), focus: v && v.items && v.items[v.i] ? v.items[v.i].e.id : null }; },
};
