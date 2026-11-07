// The night ledger: what happened, when, where, and whether it was seen. Every payoff and every drop the night engine makes goes in here
// (RUN.nights[n].log), and so do the parents' wakings (woke[]) and what they noticed on the way (noticed[]), written by the parents module.
// The journal's night page, the morning at the table and the law that the thing is only ever the end of a chain (an encounter needs a
// recently seen entry) all read from it, so nothing said at breakfast did not happen.
//   push({ id, t: F.clock, room, seen, how, p, noise, blamed, witness })   one row; `at` (engine seconds) is added
//   recent(sec)   the rows of the current night from the last sec seconds of play
//   entries(n) / seen(id, n) / has(id, n)   the night's rows, and whether an id was seen / happened
//   start(n)   opens night n's ledger (the engine calls it as the night starts); night(n) the raw record
let G = null, cur = 0, T = 0;   // the game, the night the rows go to, the engine's clock (events.update advances it)
export function install(game) { G = game; }
export function tick(dt) { T += dt; }
export const now = () => T;
export function night(n = cur) {
  if (!G || !G.RUN) return null;
  const nights = (G.RUN.nights ||= {});
  return nights[n] || null;
}
export function start(n) {
  cur = n;
  if (!G || !G.RUN) return null;
  const nights = (G.RUN.nights ||= {});
  const rec = (nights[n] ||= { log: [], woke: [], noticed: [] });
  rec.log ||= []; rec.woke ||= []; rec.noticed ||= [];
  return rec;
}
export function push(entry) {
  const rec = night() || start(cur); if (!rec) return null;
  const row = { seen: false, ...entry, at: Math.round(T * 10) / 10 };
  if (row.t === undefined && G && G.F) row.t = Math.round(G.F.clock || 0);
  if (row.room === undefined && G && G.nights && G.nights.D) { try { row.room = G.nights.D.playerRoom(); } catch (e) { /* no room */ } }
  rec.log.push(row);
  return row;
}
export function entries(n = cur) { const rec = night(n); return rec ? rec.log.slice() : []; }
export function recent(sec, n = cur) { const rec = night(n); if (!rec) return []; return rec.log.filter((e) => T - (e.at || 0) <= sec); }
export const seen = (id, n = cur) => entries(n).some((e) => e.id === id && e.seen);
export const has = (id, n = cur) => entries(n).some((e) => e.id === id);
export const current = () => cur;
