// DOM overlay helpers.
import { settings, FLASH_CAP } from './settings.js';
const $ = (id) => document.getElementById(id);
let subTimer = 0, cardTimer = 0, hintTimer = 0, flashTimer = 0;
// css/style.css slows the strobing screen effects (the nightmare) under body.reduce-flashing
const calm = (v) => { if (typeof document !== 'undefined' && document.body) document.body.classList.toggle('reduce-flashing', !!v); };
calm(settings.get('reduceFlashing')); settings.on('reduceFlashing', calm);

export function objective(t) {
  const el = $('objective');
  if (!t) { el.classList.remove('show'); return; }
  el.innerHTML = t; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
}
// kind 'speech': the words of a recorded voice line, hidden when subtitles are off (narration, captions and the kid's unvoiced lines always show)
export function subtitle(t, dur = 4, kind = null) {
  const el = $('subtitle'); clearTimeout(subTimer);
  if (!t || (kind === 'speech' && !settings.get('subtitles'))) { el.classList.remove('show'); return; }
  el.innerHTML = t; el.classList.add('show');
  subTimer = setTimeout(() => el.classList.remove('show'), dur * 1000);
}
export function prompt(t) {
  const el = $('prompt'); if (el._t === t) return; el._t = t;
  if (t) { el.innerHTML = t; el.classList.add('show'); } else el.classList.remove('show');
}
export function hint(t, dur = 5) {
  const el = $('hint'); clearTimeout(hintTimer);
  if (!t) { el.classList.remove('show'); return; }
  el.innerHTML = t; el.classList.add('show'); hintTimer = setTimeout(() => el.classList.remove('show'), dur * 1000);
}
export function card(big, small = '', dur = 3) {
  const el = $('card'); clearTimeout(cardTimer);
  el.querySelector('.big').textContent = big; el.querySelector('.small').textContent = small;
  el.classList.add('show'); cardTimer = setTimeout(() => el.classList.remove('show'), dur * 1000);
}
export function fade(opacity, dur = 1) { const el = $('fade'); el.style.transition = `opacity ${dur}s ease`; el.style.opacity = opacity; }
export function flash(color = 'rgba(150,0,0,0.55)', dur = 0.9) {
  const el = $('flash'), calm = settings.get('reduceFlashing'); clearTimeout(flashTimer);
  el.style.transition = 'none'; el.style.background = color; el.style.opacity = calm ? 0 : 1; void el.offsetWidth;
  if (!calm) { el.style.transition = `opacity ${dur}s ease-out`; el.style.opacity = 0; return; }
  // reduced flashing: a soft swell instead of a hard flash, capped, eased in and let go more slowly
  el.style.transition = 'opacity 0.15s ease-in'; el.style.opacity = FLASH_CAP;
  flashTimer = setTimeout(() => { el.style.transition = `opacity ${dur * 1.5}s ease-out`; el.style.opacity = 0; }, 150);
}
export function blur(px, dur = 1) { const c = document.querySelector('#game canvas'); if (!c) return; c.style.transition = `filter ${dur}s ease`; c.style.filter = px ? `blur(${px}px)` : 'none'; }
export function show(id) { $(id).classList.remove('hidden'); }
export function hide(id) { $(id).classList.add('hidden'); }
export function stamina(v, visible) { const el = $('stamina'); el.classList.toggle('show', visible); el.firstElementChild.style.width = `${Math.max(0, v) * 100}%`; }
export function breath(v, visible, warn = false) {
  const el = $('breath'); el.classList.toggle('show', visible); el.classList.toggle('warn', warn);
  el.querySelector('i').style.width = `${Math.max(0, v) * 100}%`;
}
export function blanket(on) { $('blanket').classList.toggle('show', on); }
export function crosshair(on) { $('crosshair').style.opacity = on ? 1 : 0; }
export function vignette(strength) { $('vignette').style.opacity = strength; }

export function makeGrain() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), d = g.createImageData(256, 256);
  for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 22; }
  g.putImageData(d, 0, 0);
  $('grain').style.backgroundImage = `url(${c.toDataURL()})`;
}

export function clock(text, label = '') { const el = $('clock'); if (!text) { el.classList.remove('show'); return; } el.querySelector('b').textContent = text; el.querySelector('small').textContent = label; el.classList.add('show'); }
export function pod(kind) { const el = $('pod'); el.className = kind ? kind + ' show' : ''; }
