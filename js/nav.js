// The walkable graph of the house: where the thing can stand and which doors it has to open to get there.
// Coordinates are world metres (x, z), with a third value for the floor height where it is not 0 (the stairwell and the basement).
// Every edge is a straight, clear line.
export const NODES = {
  hallW: [3.95, -0.9], hallM: [5.6, -0.9], hallE: [7.3, -0.9],
  bathIn: [4.15, 0.4], bathMid: [4.15, 1.15], bathMid2: [4.5, 1.9], bathTub: [4.45, 2.4],
  kidIn: [7.05, 0.4], kidMid: [6.5, 1.35], kidBunk: [6.03, 2.1], kidCloset: [5.95, 0.95],
  r2In: [3.9, -1.95], r2Alc: [4.1, -2.5], r2Mid: [4.7, -2.95], r2Closet: [4.97, -2.55],
  pIn: [7.5, -2.0], pBed: [7.35, -2.75], pClos: [7.5, -3.4],
  livMouth: [3.0, -0.9], livE: [2.2, -1.35], livC: [0.9, -1.3], livW: [-0.5, -1.35], livMid: [-1.7, -1.4], livFar: [-2.4, -1.1], livDoor: [1.9, -3.5], livTV: [2.0, -2.6],
  archN: [1.7, -0.85], archS: [1.7, 0.35], kit2: [0.5, 0.9], kit3: [0.4, 2.1], kit4: [2.0, 1.9],
  dinN: [-2.7, 0.1], dinS: [-2.75, 0.55], dinW: [-2.95, 1.9], backIn: [-2.5, 3.1],
  utilIn: [-4.3, 0.45], util2: [-5.8, 1.4], util3: [-6.0, -1.8],
  // out the back door, down the outside stairs to the laundry, and round the west end of the house to the garage
  stoop: [-2.3, 4.3], stoopS: [-2.2, 5.6], stairTop: [-3.5, 4.25, -0.15], stairMid: [-4.9, 4.25, -1.23], stairBot: [-6.9, 4.25, -2.4],
  lauIn: [-6.9, 3.0, -2.4], lauMid: [-5.7, 1.7, -2.4], lauWash: [-7.0, 1.6, -2.4], lauSink: [-5.65, 0.9, -2.4], lauSump: [-4.7, 0.7, -2.4],
  yardB1: [-5.0, 5.9], yardB2: [-8.2, 5.9], yardW: [-9.3, 0.5], yardSW: [-9.3, -5.2], garDoor: [-8.3, -6.4],
  garIn: [-8.3, -7.8], garMid: [-10.6, -10.3], garPanel: [-9.7, -7.9],
};
// [a, b, door that has to be open to pass]
const EDGES = [
  ['hallW', 'hallM'], ['hallM', 'hallE'],
  ['hallW', 'bathIn', 'bath'], ['bathIn', 'bathMid'], ['bathMid', 'bathMid2'], ['bathMid2', 'bathTub'],
  ['hallE', 'kidIn', 'kid'], ['kidIn', 'kidMid'], ['kidMid', 'kidBunk'], ['kidMid', 'kidCloset'],
  ['hallW', 'r2In', 'room2'], ['r2In', 'r2Alc'], ['r2Alc', 'r2Mid'], ['r2Alc', 'r2Closet'], ['r2Mid', 'r2Closet'],
  ['hallE', 'pIn', 'parents'], ['pIn', 'pBed'], ['pBed', 'pClos'],
  ['hallW', 'livMouth'], ['livMouth', 'livE'], ['livE', 'livC'], ['livC', 'livW'], ['livW', 'livMid'], ['livMid', 'livFar'], ['livE', 'livDoor'], ['livE', 'livTV'], ['livDoor', 'livTV'],
  ['livE', 'archN'], ['archN', 'archS'], ['archS', 'kit2'], ['archS', 'kit4'], ['kit2', 'kit3'], ['kit3', 'kit4'],
  ['livFar', 'dinN'], ['dinN', 'dinS'], ['dinS', 'utilIn'], ['utilIn', 'util2'], ['utilIn', 'util3'],
  ['dinS', 'dinW'], ['dinW', 'backIn'], ['backIn', 'stoop', 'back'],
  ['stoop', 'stairTop'], ['stairTop', 'stairMid'], ['stairMid', 'stairBot'], ['stairBot', 'lauIn', 'basement'], ['lauIn', 'lauMid'], ['lauMid', 'lauWash'], ['lauMid', 'lauSink'], ['lauSink', 'lauSump'],
  ['stoop', 'stoopS'], ['stoopS', 'yardB1'], ['yardB1', 'yardB2'], ['yardB2', 'yardW'], ['yardW', 'yardSW'], ['yardSW', 'garDoor'],
  ['garDoor', 'garIn', 'garage'], ['garIn', 'garMid'], ['garIn', 'garPanel'], ['garMid', 'garPanel'],
];
export const ADJ = {};
for (const k in NODES) ADJ[k] = [];
for (const [a, b, door] of EDGES) {
  const d = Math.hypot(NODES[a][0] - NODES[b][0], NODES[a][1] - NODES[b][1]);
  ADJ[a].push({ to: b, d, door }); ADJ[b].push({ to: a, d, door });
}
export const pos = (id) => ({ x: NODES[id][0], z: NODES[id][1], y: NODES[id][2] || 0 });
export const dist = (a, b) => Math.hypot(NODES[a][0] - NODES[b][0], NODES[a][1] - NODES[b][1]);

// the node nearest a point on the same floor (y: the floor height there; the laundry's nodes lie right under the utility room's)
export function nearestNode(x, z, filter = null, y = 0) {
  let best = null, bd = 1e9;
  for (const k in NODES) {
    if (Math.abs((NODES[k][2] || 0) - y) > 1) continue;
    if (filter && !filter(k)) continue;
    const d = Math.hypot(NODES[k][0] - x, NODES[k][1] - z);
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}

// shortest path (Dijkstra); a closed door costs a little extra because it has to be opened. Returns node ids, from -> to, or null.
export function path(from, to, doorClosed = () => false) {
  if (from === to) return [from];
  const D = { [from]: 0 }, prev = {}, open = new Set([from]), done = new Set();
  while (open.size) {
    let u = null, ud = 1e9; for (const k of open) if (D[k] < ud) { ud = D[k]; u = k; }
    open.delete(u); done.add(u);
    if (u === to) break;
    for (const e of ADJ[u]) {
      if (done.has(e.to)) continue;
      const nd = D[u] + e.d + (e.door && doorClosed(e.door) ? 1.6 : 0);
      if (D[e.to] === undefined || nd < D[e.to]) { D[e.to] = nd; prev[e.to] = u; open.add(e.to); }
    }
  }
  if (D[to] === undefined) return null;
  const out = [to]; while (out[0] !== from) out.unshift(prev[out[0]]);
  return out;
}
export function pathLength(p) { let t = 0; for (let i = 1; i < p.length; i++) t += dist(p[i - 1], p[i]); return t; }
export function edgeDoor(a, b) { const e = ADJ[a].find((x) => x.to === b); return e && e.door; }
