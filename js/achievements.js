// Achievements. Each one unlocks once and is kept in localStorage ('topbunk.achievements', id -> when), with the counters some of them need
// in 'topbunk.stats'. An unlock shows a card in the bottom-left corner and reaches Steam through the desktop shell (window.desktop.achieve)
// when there is one. The ids are the Steamworks API names; steam/achievements.json is the same list for the Steamworks admin pages.
//   achievements.unlock(id)    achievements.has(id)    achievements.list()    achievements.tick() (every frame, from main.js)
const KEY = 'topbunk.achievements', STATS = 'topbunk.stats';
const NUM = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

export const ACHIEVEMENTS = [
  { id: 'MOVING_DAY', name: 'Moving day', desc: 'Carry all three of your boxes to your room.', hidden: false },
  ...NUM.map((w, i) => ({ id: `NIGHT_${i + 1}`, name: `Night ${w}`, desc: `Survive night ${w}.`, hidden: false })),
  { id: 'NIGHT_10', name: 'Ten', desc: 'See night ten through to the end.', hidden: false },
  { id: 'ENDING_TAKEN', name: 'They saw it', desc: 'Reach night ten with three to six pieces of proof.', hidden: true },
  { id: 'ENDING_ALONE', name: 'They never believed you', desc: 'Reach night ten with fewer than three pieces of proof.', hidden: true },
  { id: 'ENDING_BELIEVED', name: 'They believed you', desc: 'Leave the house with Mom and Dad in the morning.', hidden: true },
  { id: 'THE_DRAWING', name: 'He watches', desc: 'Look at the drawing the last kid left in the hall.', hidden: false },
  { id: 'UNDER_THE_COVERS', name: 'Top bunk', desc: 'Pull the covers over your head.', hidden: false },
  { id: 'HIDING_PLACE', name: 'Somewhere to hide', desc: 'Hide in a closet or behind the shower curtain.', hidden: false },
  { id: 'HOLD_BREATH', name: 'Not a sound', desc: 'Hold your breath until the meter runs red.', hidden: false },
  { id: 'STARE_DOWN', name: "Don't blink", desc: 'Keep your eyes on it while it creeps toward you, until it gives up.', hidden: false },
  { id: 'PHOTO_FELL', name: 'Off the wall', desc: 'Be there when the photo in the hall comes down.', hidden: false },
  { id: 'NOT_DAD', name: "That isn't Dad", desc: 'Walk up to Dad in front of the TV.', hidden: true },
  { id: 'GRANDPA', name: 'Grandpa', desc: "Go to grandpa's chair at the end of the hall.", hidden: true },
  { id: 'GLOVE_BOX', name: 'Eyes on the road', desc: 'Wake up from the drive without opening the glove box.', hidden: true },
  { id: 'FIRST_TRY', name: 'Not a scratch', desc: 'Survive a night without getting caught.', hidden: false },
  { id: 'TRY_AGAIN', name: 'Try again', desc: 'Get caught 13 times.', hidden: false, stat: 'deaths', max: 13 },
  { id: 'FLAWLESS', name: 'Not once', desc: 'Reach the end of night ten without getting caught on any night.', hidden: true },
];
const BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

const read = (k) => { try { const v = JSON.parse(localStorage.getItem(k)); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } };
const got = read(KEY), stats = read(STATS);
const G = {};   // from main.js (bind): F, P, W, RUN, sfx, menu, hunter(), test()
const off = () => !!(G.test && G.test());   // the test mode (window.__game.start(), used by the trailer and the store shots) and the debug jumps earn nothing
const steam = () => (typeof window !== 'undefined' && window.desktop && window.desktop.achieve ? window.desktop : null);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function unlock(id) {
  if (!BY_ID[id] || got[id] || off()) return false;
  got[id] = Date.now(); write(KEY, got);
  queue.push(BY_ID[id]); pump();
  return true;
}
export const has = (id) => !!got[id];
export const list = () => ACHIEVEMENTS.map((a) => ({ ...a, unlocked: !!got[a.id], at: got[a.id] || null }));
export const stat = (k) => +stats[k] || 0;
export function count(k, by = 1) { stats[k] = stat(k) + by; write(STATS, stats); return stats[k]; }

// the run in progress (by its seed): which nights were survived, and which you were caught on
function run() {
  const seed = G.RUN && G.RUN.seed;
  if (!stats.run || stats.run.seed !== seed) stats.run = { seed, died: [], survived: [] };
  return stats.run;
}
// dawn of night n (nights.js)
export function survived(n) {
  if (off()) return;
  const r = run(); if (!r.survived.includes(n)) r.survived.push(n);
  write(STATS, stats);
  unlock(`NIGHT_${n}`); if (!r.died.includes(n)) unlock('FIRST_TRY');
}
// one of the endings, once its end screen is up (main.js)
export function ending(id) {
  unlock(id); unlock('NIGHT_10');
  const r = run(); let clean = r.died.length === 0;
  for (let n = 1; n <= 9; n++) if (!r.survived.includes(n)) clean = false;
  if (clean) unlock('FLAWLESS');
}
function caught() {
  if (count('deaths') >= 13) unlock('TRY_AGAIN');
  const r = run(), n = G.F.night;
  if (n && !r.died.includes(n)) { r.died.push(n); write(STATS, stats); }
}

// ---------- what can be read straight off the game's state, every frame ----------
const last = { dead: false, state: 'away' };
export function tick() {
  const { F, P, W } = G; if (!F || off()) return;
  if (F.boxes >= 3) unlock('MOVING_DAY');
  if (P.mode === 'hide' && !F.dead) { unlock(P.pod ? 'HIDING_PLACE' : 'UNDER_THE_COVERS'); if (P.breath < 0.3) unlock('HOLD_BREATH'); }
  if (W.hallFrame && W.hallFrame.fallen) unlock('PHOTO_FELL');
  if (F.dead !== last.dead) { last.dead = F.dead; if (F.dead) caught(); }
  const h = G.hunter && G.hunter();
  if (h) {   // a stalk that ends because you watched it for long enough (hunter.js gives up after 7 s of being looked at)
    if (last.state === 'stalk' && h.state === 'away' && h.S.lookT > 7 && !F.dead) unlock('STARE_DOWN');
    last.state = h.state;
  }
}

// ---------- the card ----------
const queue = []; let showing = false, retry = 0;
// a card waits while something is after you, so it never lands on a scare; the menus and the death and end screens are always calm
function calm() {
  if (document.querySelector('.screen:not(.hidden)')) return true;
  const F = G.F, h = G.hunter && G.hunter();
  return !F || !(F.dead || F.chase || F.breathCheck || F.fear > 0.5 || (h && h.busy) || document.body.classList.contains('nightmare'));
}
function card() {
  let el = document.getElementById('achv');
  if (!el) { el = Object.assign(document.createElement('div'), { id: 'achv' }); el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); document.body.appendChild(el); }
  return el;
}
function chime() {
  const s = G.sfx; if (!s || !s.ctx || !s.tone) return;
  s.tone({ f: 659, dur: 0.9, gain: 0.045, wet: 0.5, attack: 0.01 }); s.tone({ f: 988, dur: 1.2, gain: 0.035, wet: 0.6, attack: 0.01, delay: 0.14 });
}
function pump() {
  clearTimeout(retry);
  if (showing || !queue.length || typeof document === 'undefined') return;
  if (!calm()) { retry = setTimeout(pump, 500); return; }
  const a = queue.shift(), el = card(), d = steam(); showing = true;
  if (d) { try { d.achieve(a.id); } catch (e) { /* ignore */ } }
  el.innerHTML = `<small>Achievement</small><b>${esc(a.name)}</b><span>${esc(a.desc)}</span>`;
  void el.offsetWidth; el.classList.add('show'); chime();
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => { showing = false; pump(); }, 600); }, 4000);
}

// ---------- the menu panel ----------
function render(body) {
  const all = list(), n = all.filter((a) => a.unlocked).length;
  const row = (a) => {
    const secret = a.hidden && !a.unlocked, prog = !a.unlocked && a.max ? `<em>${Math.min(stat(a.stat), a.max)} / ${a.max}</em>` : '';
    return `<li class="${a.unlocked ? 'got' : 'locked'}"><b>${secret ? '???' : esc(a.name)}</b><span>${secret ? 'Hidden until you find it.' : esc(a.desc)}${prog}</span></li>`;
  };
  const order = [...all.filter((a) => a.unlocked), ...all.filter((a) => !a.unlocked)];
  body.innerHTML = `<p class="achv-count">${n} of ${all.length} unlocked</p><ul class="achv-list">${order.map(row).join('')}</ul>`;
}

let bound = false;
export function bind(game) {
  Object.assign(G, game);
  if (bound) return; bound = true;
  if (game.menu) {
    game.menu.panel('achievements', { title: 'Achievements', render });
    for (const m of ['title', 'pause']) game.menu.add(m, { id: 'achievements', label: 'Achievements', panel: 'achievements' }, { after: 'options' });
  }
  // anything unlocked while Steam was not running, or before its card got to show, is handed over at the next start
  const d = steam();
  if (d) for (const id in got) if (BY_ID[id]) Promise.resolve(d.isAchieved ? d.isAchieved(id) : false).then((on) => { if (!on) d.achieve(id); }, () => {});
}
// forget every local unlock and counter (Steam keeps its own: window.desktop.clearAchievement)
export function reset() { for (const k in got) delete got[k]; for (const k in stats) delete stats[k]; write(KEY, got); write(STATS, stats); }

export const achievements = { ACHIEVEMENTS, unlock, has, list, stat, count, survived, ending, tick, bind, reset };
