// The walkable graph of the house: where the thing can stand and which doors it has to open to get there.
// Coordinates are world metres (x, z), with a third value for the floor height where it is not 0 (the stairwell and the basement).
// Every edge is a straight, clear line. The node just inside each hinged door stands outside the leaf's swing (1.22 m from the hinge: the
// leaf is 0.81, the thing's body 0.35, the leaf's thickness the rest), so a door it opens from inside swings clear of it and all the way;
// the nodes beside furniture stand off it by a body's width.
export const NODES = {
  hallW: [5.48, -0.42], hallM: [7.63, -0.42], hallE: [10.16, -0.42],
  bathIn: [5.89, 1.39], bathMid: [5.73, 1.92], bathMid2: [6.17, 2.76], bathTub: [6.0, 3.1],
  kidIn: [9.95, 1.39], kidMid: [8.96, 2.15], kidBunk: [8.26, 2.85], kidCloset: [8.14, 1.7],
  r2In: [5.42, -2.3], r2Alc: [5.67, -2.26], r2Mid: [6.42, -2.5], r2Closet: [6.76, -2.32],
  sIn: [10.6, -2.25], sMid: [10.01, -2.71], sClos: [10.46, -3.2],
  livMouth: [4.33, -0.42], livE: [3.44, -0.96], livC: [1.98, -0.9], livW: [0.41, -0.96], livMid: [-0.93, -1.02], livFar: [-1.72, -0.66], livDoor: [3.1, -3.38], livTV: [3.21, -2.37],
  archN: [2.88, -0.36], archS: [2.88, 1.03], kit2: [2.75, 1.9], kit3: [1.9, 3.45], kit4: [3.21, 2.76],
  dinN: [-2.05, 0.75], dinS: [-2.11, 1.25], dinW: [-1.55, 2.8], backIn: [-1.55, 3.45],
  // Mom and Dad's room, through the barn door: inside the door, the middle, the foot of the bed, by the dresser, the closet, the far end
  pIn: [-3.4, 1.14], pMid: [-4.63, 0.75], pFoot: [-5.19, -0.42], pDress: [-5.55, -2.45], pClos: [-4.07, -2.26], pFar: [-5.4, 2.95],
  // out the back door, down the outside stairs to the laundry, and round the west end of the house to the garage
  stoop: [-1.6, 5.37], stoopS: [-1.49, 6.67], stairTop: [-2.95, 5.32, -0.15], stairMid: [-4.52, 5.32, -1.23], stairBot: [-6.76, 5.32, -2.4],
  lauIn: [-6.5, 3.5, -2.4], lauMid: [-5.41, 2.54, -2.4], lauWash: [-6.6, 2.43, -2.4], lauSink: [-5.36, 1.64, -2.4], lauSump: [-4.29, 1.42, -2.4],
  yardB1: [-4.5, 7.0], yardB2: [-8.2, 7.0], yardW: [-9.3, 0.5], yardSW: [-9.3, -5.2], garDoor: [-8.3, -6.4],
  garIn: [-8.1, -8.2], garMid: [-10.6, -10.3], garPanel: [-9.7, -7.9],
};
// [a, b, door that has to be open to pass]
const EDGES = [
  ['hallW', 'hallM'], ['hallM', 'hallE'],
  ['hallW', 'bathIn', 'bath'], ['bathIn', 'bathMid'], ['bathMid', 'bathMid2'], ['bathMid2', 'bathTub'],
  ['hallE', 'kidIn', 'kid'], ['kidIn', 'kidMid'], ['kidMid', 'kidBunk'], ['kidMid', 'kidCloset'],
  ['hallW', 'r2In', 'room2'], ['r2In', 'r2Alc'], ['r2Alc', 'r2Mid'], ['r2Alc', 'r2Closet'], ['r2Mid', 'r2Closet'],
  ['hallE', 'sIn', 'spare'], ['sIn', 'sMid'], ['sMid', 'sClos'],
  ['hallW', 'livMouth'], ['livMouth', 'livE'], ['livE', 'livC'], ['livC', 'livW'], ['livW', 'livMid'], ['livMid', 'livFar'], ['livE', 'livDoor'], ['livE', 'livTV'], ['livDoor', 'livTV'],
  ['livE', 'archN'], ['archN', 'archS'], ['archS', 'kit2'], ['archS', 'kit4'], ['kit2', 'kit3'], ['kit3', 'kit4'],
  ['livFar', 'dinN'], ['dinN', 'dinS'], ['dinS', 'pIn', 'parents'], ['pIn', 'pMid'], ['pMid', 'pFoot'], ['pFoot', 'pDress'], ['pFoot', 'pClos'], ['pDress', 'pClos'], ['pMid', 'pFar'],
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

// the node nearest a point on the same floor (y: the floor height there; the laundry's nodes lie right under Mom and Dad's room)
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
