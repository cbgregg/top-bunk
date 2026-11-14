// Placement audit: loads the game headless and checks every placed model against the others, the walls and the floor.
//   node tests/placement.js [--port N] [--json out.json] [--tol 0.03]
// Reports models that cut into each other, into a wall or the floor, that float, or whose front faces a wall; exit 1 when it finds any.
// A model set down below the floor on purpose has its allowance in tests/sunk/<package>.json ({ modelName: metres }).
// The things about the house (js/decor.js) are checked too: what each stands on (by what it says and by a ray to what is drawn under it),
// that a sheet on a wall or a door shows in front of its face, walls, switches, outlets, windows, the doors' swings, and each
// footprint's distance from the ways through the house and the yard and from the places to hide.
const http = require('http'), fs = require('fs'), path = require('path');
const { Readable } = require('stream');
const ROOT = path.resolve(__dirname, '..');
const serve = require(path.join(ROOT, 'desktop', 'static'));
const ARGV = process.argv.slice(2);
const opt = (k, d) => { const i = ARGV.indexOf(k); return i >= 0 && ARGV[i + 1] ? ARGV[i + 1] : d; };
const PORT = +opt('--port', 9391), TOL = +opt('--tol', 0.03), JSON_OUT = opt('--json', '');

// which way each model's front faces in its own frame, after the loader: most are built facing +z (props.js); the rest were checked by eye
const FRONT = {
  default: [0, 0, 1],
  washer: [-1, 0, 0], dryer: [1, 0, 0], grandfather: [1, 0, 0], bookcase: [0, 0, 1], filing: [0, 0, 1], dresser: [0, 0, 1], dresser_old: [0, 0, 1],
  cabinet: [0, 0, 1], fridge: [1, 0, 0], stove: [0, 0, 1], tv: [0, 0, 1], sofa: [0, 0, 1], sofa_plaid: [1, 0, 0], armchair: [0, 0, 1], chair: [0, 0, 1], office_chair: [0, 0, 1],
  desk: [0, 0, 1], toilet: [0, 0, 1], crt_pc: [1, 0, 0], mirror: [0, 0, 1], bunk: null, table: null, table_round: null, plant1: null, plant2: null,
  kettle: null, pot: null, table_lamp: null, desk_lamp: null, teddy: null, outlet: null, switch: null, clock_wall: [0, 0, 1],
};
// models that sit inside a wall by design
const IN_WALL = new Set(['outlet', 'switch']);
// the things about the house (js/decor.js) say themselves what they stand on: W.decor.items, checked in part e below. Pairs of them that
// share a box by design: a cushion on the couch, fruit in the bowl, what stands on a set of shelves
const DECOR_TUCKED = [['d_cushion', 'sofa_plaid'], ['d_cushion2', 'sofa_plaid'], ['d_lemon', 'd_bowl'], ['d_lemon', 'd_lemon'], ['d_vase2', 'd_shelves'], ['d_frame', 'd_shelves'], ['d_jug', 'd_shelves'], ['d_ball', 'd_kidshelf'], ['d_football', 'd_crate'],
  ['d_cleaner', 'd_gshelves'], ['d_gallon', 'd_gshelves'], ['d_oiltin', 'd_gshelves'], ['d_tin', 'd_gshelves'], ['d_spray', 'd_gshelves'], ['d_spraycans', 'd_gshelves'], ['d_cardbox', 'd_gshelves'], ['d_frame', 'd_frame'], ['d_floorlamp', 'armchair'], ['d_floorlamp', 'sofa_plaid']];
// pairs that are meant to overlap in their boxes (a chair pushed under a table, a lamp on a desk, a pc on a desk)
const TUCKED = [...DECOR_TUCKED, ['chair', 'table_round'], ['office_chair', 'desk'], ['crt_pc', 'desk'], ['desk_lamp', 'desk'], ['table_lamp', 'dresser'], ['kettle', 'stove'], ['pot', 'stove'], ['tv', 'table'], ['teddy', 'bunk']];
// buildings: models whose box holds other things and their own walls (the barn since it became a place, js/barn.js); only the floor is checked
const SHELL = new Set(['barn']);
// models set down below the floor on purpose (the truck on its tyres, the barn on its sill): tests/sunk/*.json, each { modelName: metres its
// lowest point may lie under the floor }, merged in file-name order so a later file overrides an earlier one (keys starting with _ are notes)
const SUNK = {};
{
  const dir = path.join(__dirname, 'sunk');
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
    const rows = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const k in rows) if (!k.startsWith('_')) SUNK[k] = +rows[k] || 0;
  }
}

(async () => {
  const { chromium } = require('playwright');
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const r = await serve.respond(ROOT, new Request(url.href, { method: req.method, headers: req.headers.range ? { range: req.headers.range } : {} }));
      res.writeHead(r.status, Object.fromEntries(r.headers));
      if (r.body) Readable.fromWeb(r.body).on('error', () => res.destroy()).pipe(res); else res.end();
    } catch (e) { if (!res.headersSent) res.writeHead(500); res.end(String(e)); }
  });
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 640, height: 360 } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.addInitScript(() => { window.__norender = true; });
  await page.goto(`http://127.0.0.1:${PORT}/index.html#shot`, { waitUntil: 'load', timeout: 180e3 });
  await page.waitForFunction(() => window.__game && document.getElementById('loading').classList.contains('done'), null, { timeout: 180e3, polling: 250 });
  await page.waitForLoadState('networkidle', { timeout: 120e3 }).catch(() => {});
  await page.evaluate(() => window.__game.W.decor && window.__game.W.decor.ready).catch(() => {});
  // every model holder has its model in, or its load failed
  await page.waitForFunction(() => { let n = 0; window.__game.scene.traverse((o) => { if (o.userData && o.userData.prop && !o.children.length) n++; }); return n === 0; }, null, { timeout: 120e3, polling: 500 }).catch(() => {});

  const data = await page.evaluate(async ([FRONT, IN_WALL, TOL]) => {
    const THREE = await import('three'); const Wm = await import('/js/world.js');
    const g = window.__game, W = g.W; g.setPhase('day', true); g.scene.updateMatrixWorld(true);
    const items = [];
    g.scene.traverse((o) => {
      if (!o.userData || !o.userData.prop || !o.children.length) return;
      const b = new THREE.Box3().setFromObject(o, o.userData.prop.startsWith('d_')); if (b.isEmpty()) return;   // (the decor's models by their real bounds: several are sets with turned parts)
      const c = b.getCenter(new THREE.Vector3()), f = FRONT[o.userData.prop] === undefined ? (o.userData.prop.startsWith('d_') ? null : FRONT.default) : FRONT[o.userData.prop];
      const front = f ? new THREE.Vector3(...f).applyQuaternion(o.getWorldQuaternion(new THREE.Quaternion())) : null;
      items.push({ name: o.userData.prop, x: +c.x.toFixed(3), y: +c.y.toFixed(3), z: +c.z.toFixed(3), rot: +o.rotation.y.toFixed(3), min: b.min.toArray().map((v) => +v.toFixed(3)), max: b.max.toArray().map((v) => +v.toFixed(3)),
        front: front ? [+front.x.toFixed(2), +front.z.toFixed(2)] : null, room: Wm.roomAt(c.x, c.z, b.min.y), inWall: IN_WALL.includes(o.userData.prop), decor: W.decor ? (W.decor.items.find((r) => r.holder === o) || {}).kind || null : null });
    });
    const walls = W.colliders.filter((c) => c.wall && c.on !== false), furn = W.colliders.filter((c) => !c.wall && c.on !== false);
    // the things about the house: each one's box and what it says it stands on; the doors' leaves, the plates on the walls, the panes, the
    // thing's and the parents' ways through the rooms and the places to hide, which none of them may be in the way of
    const nav = await import('/js/nav.js'), r3 = (v) => +v.toFixed(3);
    // what is really there: a ray down from under each thing that stands on something (the gap to whatever is drawn below it, itself
    // and the other small things apart), and a look at each picture from the room side (what the eye meets first must be the picture)
    const rc = new THREE.Raycaster(), shown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
    const isDecor = (o) => { for (let p = o; p; p = p.parent) if (p.name && p.name.startsWith('decor:')) return true; return false; }, within = (o, h) => { for (let p = o; p; p = p.parent) if (p === h) return true; return false; };
    const solidMeshes = []; g.scene.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh && !o.isInstancedMesh && shown(o)) solidMeshes.push(o); });
    const cast = (from, dir, far, skip) => { rc.set(new THREE.Vector3(...from), new THREE.Vector3(...dir)); rc.far = far; const h = rc.intersectObjects(solidMeshes, false).filter((x) => !skip(x.object)); return h.length ? h[0] : null; };
    const gapUnder = (r) => {
      if (r.kind !== 'on' || !r.box || !isFinite(r.box[0])) return null;
      const b = r.box, cx = (b[0] + b[1]) / 2, cz = (b[4] + b[5]) / 2, dx = (b[1] - b[0]) / 4, dz = (b[5] - b[4]) / 4; let best = null;
      for (const [x, z] of [[cx, cz], [cx - dx, cz - dz], [cx + dx, cz - dz], [cx - dx, cz + dz], [cx + dx, cz + dz]]) { const h = cast([x, b[2] + 0.004, z], [0, -1, 0], 0.3, (o) => (r.holder ? within(o, r.holder) : isDecor(o))); if (h && (best === null || h.distance - 0.004 < best)) best = h.distance - 0.004; }
      return best === null ? 9 : r3(best);
    };
    const seen = (r) => (r.probes || []).map(([x, y, z, nx, nz]) => { const h = cast([x + nx * 0.3, y, z + nz * 0.3], [-nx, 0, -nz], 0.34, () => false); return !!h && isDecor(h.object) && h.distance < 0.301; });
    const decor = W.decor ? {
      items: W.decor.items.map((r) => ({ name: r.name, kind: r.kind, y: r.y, box: r.box && r.box.map(r3), model: !!r.model, gap: gapUnder(r), seen: seen(r), ground: r.box ? Wm.groundAt((r.box[0] + r.box[1]) / 2, (r.box[4] + r.box[5]) / 2, r.box[2]) : 0 })),
      solids: W.colliders.filter((c) => c.decor).map((c) => ({ id: c.id, b: [c.minX, c.maxX, c.minZ, c.maxZ].map(r3), low: (c.minY ?? 0) < -1 })),
      doors: Object.entries(W.doors).map(([k, d]) => ({ k, hx: d.hx, hz: d.hz, w: d.w, y0: d.y0 || 0, rotC: d.rotC, rotO: d.rotO, slide: d.slide || null })),
      plates: [...W.switches.map((s) => s.g.getWorldPosition(new THREE.Vector3()).toArray()), ...W.nightLights.map((n) => n.pos.toArray()), ...items.filter((i) => i.name === 'outlet').map((i) => [i.x, i.y, i.z])],
      panes: W.windows.filter((w) => w.pane).map((w) => { const b = new THREE.Box3().setFromObject(w.pane); return [b.min.x, b.max.x, b.min.y, b.max.y, b.min.z, b.max.z]; }),
      nodes: nav.NODES, edges: [...Object.entries(nav.ADJ).flatMap(([a, l]) => l.filter((e) => a < e.to).map((e) => [a, e.to])), ...(nav.outsideJoined() ? [] : nav.OUTSIDE_EDGE_LIST.map((e) => [e[0], e[1]]))],   // (the ways about the yard too, joined or not)
      pods: g.nights && g.nights.PODS ? Object.values(g.nights.PODS).filter((p) => p.stand).map((p) => p.stand) : [],
    } : null;
    return { items, decor, walls: walls.map((c) => [c.minX, c.maxX, c.minZ, c.maxZ, c.minY ?? -0.3, c.maxY ?? 3]), furn: furn.map((c) => [c.minX, c.maxX, c.minZ, c.maxZ]), ground: items.map((i) => Wm.groundAt(i.x, i.z, i.min[1])) };
  }, [FRONT, [...IN_WALL], TOL]);
  await browser.close(); server.close();

  const { items, walls, furn, ground, decor } = data, findings = [];
  const add = (sev, room, obj, issue, nums) => findings.push({ sev, room, obj, issue, nums });
  const ov = (a, b, k) => Math.min(a.max[k], b.max[k]) - Math.max(a.min[k], b.min[k]);
  const tucked = (a, b) => TUCKED.some(([p, q]) => (a.name === p && b.name === q) || (a.name === q && b.name === p));
  // a: models against each other
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], b = items[j], ox = ov(a, b, 0), oy = ov(a, b, 1), oz = ov(a, b, 2);
    if (ox <= TOL || oy <= TOL || oz <= TOL) continue;
    const rests = Math.abs(a.min[1] - b.max[1]) < 0.02 || Math.abs(b.min[1] - a.max[1]) < 0.02;
    if (rests || tucked(a, b) || SHELL.has(a.name) || SHELL.has(b.name)) continue;
    const vol = ox * oy * oz;
    add(vol > 0.01 ? 'high' : 'low', a.room, `${a.name} (${a.x}, ${a.z}) x ${b.name} (${b.x}, ${b.z})`, 'models cut into each other', `overlap ${ox.toFixed(2)} x ${oy.toFixed(2)} x ${oz.toFixed(2)} m`);
  }
  // b: models into walls
  for (const a of items) {
    if (a.inWall || SHELL.has(a.name)) continue;
    for (const w of walls) {
      if (a.max[1] < w[4] || a.min[1] > w[5]) continue;
      const ox = Math.min(a.max[0], w[1]) - Math.max(a.min[0], w[0]), oz = Math.min(a.max[2], w[3]) - Math.max(a.min[2], w[2]);
      if (ox > TOL && oz > TOL) add(Math.min(ox, oz) > 0.08 ? 'high' : 'low', a.room, `${a.name} (${a.x}, ${a.z})`, 'model goes into a wall', `wall x ${w[0]}..${w[1]} z ${w[2]}..${w[3]}, into it ${Math.min(ox, oz).toFixed(2)} m`);
    }
  }
  // c: floor and support
  items.forEach((a, i) => {
    if (a.decor && a.decor !== 'floor') return;   // what stands on a shelf or hangs on a wall says so itself: part e
    const floor = ground[i], sunk = SUNK[a.name] || 0;
    if (a.min[1] < floor - 0.02 - sunk) add('high', a.room, `${a.name} (${a.x}, ${a.z})`, 'model below the floor', `bottom ${a.min[1]} vs floor ${floor}${sunk ? ` (set down ${sunk} m on purpose: tests/sunk)` : ''}`);
    if (a.min[1] > floor + 0.03) {
      // something under it: another model or a built collider's footprint
      const under = items.some((b) => b !== a && Math.abs(b.max[1] - a.min[1]) < 0.04 && ov(a, b, 0) > 0 && ov(a, b, 2) > 0)
        || furn.some((f) => a.x > f[0] && a.x < f[1] && a.z > f[2] && a.z < f[3]);
      if (!under && !a.inWall) add('low', a.room, `${a.name} (${a.x}, ${a.z})`, 'model floats with nothing found under it', `bottom ${a.min[1]} above floor ${floor} (check: built furniture has no height)`);
    }
  });
  // d: fronts toward the room
  for (const a of items) {
    if (!a.front || SHELL.has(a.name)) continue;
    // the wall its back is against: within 0.35 m and running along most of the model's width (a wall end beside it does not count); in a
    // corner the wall its front points away from is the one that counts
    let best = null;
    for (const w of walls) {
      if (a.max[1] < w[4] || a.min[1] > w[5]) continue;
      const dx = Math.max(w[0] - a.max[0], a.min[0] - w[1], 0), dz = Math.max(w[2] - a.max[2], a.min[2] - w[3], 0), d = Math.hypot(dx, dz);
      if (d >= 0.35) continue;
      const alongX = (w[1] - w[0]) > (w[3] - w[2]), k = alongX ? 0 : 2;
      const contact = Math.min(a.max[k], w[k + 1]) - Math.max(a.min[k], w[k]), width = a.max[k] - a.min[k];
      if (contact < 0.5 * width) continue;
      const cx = (w[0] + w[1]) / 2, cz = (w[2] + w[3]) / 2, away = alongX ? [0, Math.sign(a.z - cz) || 1] : [Math.sign(a.x - cx) || 1, 0];
      const dot = a.front[0] * away[0] + a.front[1] * away[1];
      if (!best || dot > best.dot) best = { d, contact, away, w, dot };
    }
    if (!best) continue;
    const dot = best.dot;
    if (dot < 0.5) add(dot < -0.5 ? 'high' : 'low', a.room, `${a.name} (${a.x}, ${a.z}) rot ${a.rot}`, dot < -0.5 ? 'front faces the wall' : 'front runs along the wall', `front (${a.front}), wall x ${best.w[0]}..${best.w[1]} z ${best.w[2]}..${best.w[3]} at ${best.d.toFixed(2)} m`);
  }

  // e: the things about the house
  if (decor) {
    const hit = (b, c, pad = 0) => b[0] < c[1] + pad && b[1] > c[0] - pad && b[4] < c[3] + pad && b[5] > c[2] - pad;   // a box against a floor-plan rectangle
    const segRect = (p, q, r) => {   // the least distance from the line p-q to the rectangle r [x0, x1, z0, z1]
      let best = Infinity;
      for (let i = 0; i <= 40; i++) { const x = p[0] + (q[0] - p[0]) * i / 40, z = p[1] + (q[1] - p[1]) * i / 40; best = Math.min(best, Math.hypot(Math.max(r[0] - x, 0, x - r[1]), Math.max(r[2] - z, 0, z - r[3]))); }
      return best;
    };
    for (const it of decor.items) {
      const b = it.box, at = b ? `(${((b[0] + b[1]) / 2).toFixed(2)}, ${((b[4] + b[5]) / 2).toFixed(2)})` : '';
      if (!b || !isFinite(b[0])) { add('high', 'decor', it.name, 'nothing was built for it', ''); continue; }
      const cx = (b[0] + b[1]) / 2, cz = (b[4] + b[5]) / 2, low = b[3] < -0.3, room = low ? 'laundry' : 'decor';
      // what it stands on
      if (it.kind === 'floor' && Math.abs(b[2] - it.ground) > 0.02) add('high', room, `${it.name} ${at}`, b[2] > it.ground ? 'floats over the floor' : 'sinks into the floor', `base ${b[2]} floor ${it.ground}`);
      if (it.kind === 'on' && Math.abs(b[2] - it.y) > 0.02) add('high', room, `${it.name} ${at}`, b[2] > it.y ? 'floats over what it stands on' : 'sinks into what it stands on', `base ${b[2]} top ${it.y}`);
      if (it.gap !== null && Math.abs(it.gap) > 0.02) add('high', room, `${it.name} ${at}`, it.gap > 0 ? 'nothing drawn under it' : 'sunk into what is under it', it.gap === 9 ? 'nothing within 0.3 m below' : `${it.gap} m to what is below`);
      if (it.seen.some((v) => !v)) add('high', room, `${it.name} ${at}`, 'a sheet on a wall or a door is behind its face', `${it.seen.filter((v) => !v).length} of ${it.seen.length}`);
      if (it.kind === 'flat' && (Math.abs(b[2] - it.y) > 0.006 || b[3] - b[2] > 0.08)) add('high', room, `${it.name} ${at}`, 'a flat thing off the floor or too tall to walk over', `${b[2]}..${b[3]}`);
      if (it.kind === 'floor' && !decor.solids.some((s) => cx > s.b[0] && cx < s.b[1] && cz > s.b[2] && cz < s.b[3]) && !furn.some((f) => cx > f[0] && cx < f[1] && cz > f[2] && cz < f[3])) add('high', room, `${it.name} ${at}`, 'stands on the floor with no footprint', '');
      if (it.kind === 'floor') { const s = decor.solids.find((q) => cx > q.b[0] && cx < q.b[1] && cz > q.b[2] && cz < q.b[3]); if (s && (b[0] < s.b[0] - 0.06 || b[1] > s.b[1] + 0.06 || b[4] < s.b[2] - 0.06 || b[5] > s.b[3] + 0.06)) add('low', room, `${it.name} ${at}`, 'reaches out past its footprint', `box x ${b[0]}..${b[1]} z ${b[4]}..${b[5]}, footprint ${s.b}`); }
      if (it.kind === 'wall' && !walls.some((w) => hit(b, w, 0.04)) && !furn.some((f) => hit(b, f, 0.04))) add('high', room, `${it.name} ${at}`, 'hangs on no wall', '');
      // walls
      for (const w of walls) { if (b[3] < w[4] || b[2] > w[5]) continue; const ox = Math.min(b[1], w[1]) - Math.max(b[0], w[0]), oz = Math.min(b[5], w[3]) - Math.max(b[4], w[2]); if (ox > 0.015 && oz > 0.015) add('high', room, `${it.name} ${at}`, 'goes into a wall', `by ${Math.min(ox, oz).toFixed(3)} m`); }
      // plates and panes
      for (const p of decor.plates) if (p[0] > b[0] - 0.07 && p[0] < b[1] + 0.07 && p[1] > b[2] - 0.09 && p[1] < b[3] + 0.09 && p[2] > b[4] - 0.07 && p[2] < b[5] + 0.07) add('high', room, `${it.name} ${at}`, 'covers a switch, an outlet or a night light', `at ${p.map((v) => v.toFixed(2))}`);
      for (const p of decor.panes) if (b[0] < p[1] + 0.05 && b[1] > p[0] - 0.05 && b[2] < p[3] && b[3] > p[2] && b[4] < p[5] + 0.05 && b[5] > p[4] - 0.05) add('high', room, `${it.name} ${at}`, 'stands in a window', '');
      // the doors' leaves: every place a leaf passes through
      for (const d of decor.doors) {
        if (b[3] < d.y0 + 0.008 || b[2] > d.y0 + 2.1) continue;
        if (d.slide) { const z0 = d.hz - d.slide.half, z1 = d.hz + d.slide.half + d.slide.travel * Math.abs(d.slide.open[1]), x0 = d.hx - 0.02, x1 = d.hx + 0.1; if (Math.abs(d.slide.open[1]) && b[0] < x1 && b[1] > x0 && b[4] < z1 && b[5] > z0) add('high', room, `${it.name} ${at}`, `in the way of the ${d.k} door`, ''); continue; }
        let inWay = false, dd = d.rotO - d.rotC; while (dd > Math.PI) dd -= Math.PI * 2; while (dd < -Math.PI) dd += Math.PI * 2;
        for (let i = 0; i <= 30 && !inWay; i++) { const a = d.rotC + dd * i / 30; for (let s = 0.05; s <= d.w + 0.001; s += 0.04) { const x = d.hx + Math.cos(a) * s, z = d.hz - Math.sin(a) * s; if (x > b[0] - 0.03 && x < b[1] + 0.03 && z > b[4] - 0.03 && z < b[5] + 0.03) { inWay = true; break; } } }
        if (inWay) add('high', room, `${it.name} ${at}`, `in the swing of the ${d.k} door`, '');
      }
    }
    // the footprints against the ways through the house and the places to hide
    for (const s of decor.solids) {
      for (const [a, c] of decor.edges) {
        const p = decor.nodes[a], q = decor.nodes[c]; if (((p[2] || 0) < -1) !== s.low && ((q[2] || 0) < -1) !== s.low) continue;
        const dist = segRect(p, q, s.b); if (dist < 0.36) add('high', 'decor', s.id, `too near the way ${a} - ${c}`, `${dist.toFixed(2)} m`);
      }
      for (const p of decor.pods) { const dist = Math.hypot(Math.max(s.b[0] - p[0], 0, p[0] - s.b[1]), Math.max(s.b[2] - p[1], 0, p[1] - s.b[3])); if (dist < 0.4) add('high', 'decor', s.id, 'too near a place to hide', `${dist.toFixed(2)} m`); }
    }
    console.log(`${decor.items.length} things about the house, ${decor.solids.length} footprints`);
  }

  const order = { high: 0, low: 1 };
  findings.sort((p, q) => order[p.sev] - order[q.sev] || p.room.localeCompare(q.room));
  console.log(`${items.length} models, ${walls.length} wall pieces, ${furn.length} built footprints, ${Object.keys(SUNK).length} set down on purpose (${Object.entries(SUNK).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'})`);
  if (errs.length) console.log('page errors:', errs.join(' | '));
  for (const f of findings) console.log(`${f.sev.padEnd(4)} ${f.room.padEnd(8)} ${f.obj}: ${f.issue} (${f.nums})`);
  console.log(findings.length ? `${findings.length} findings` : 'clean');
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify({ items, findings }, null, 1));
  process.exit(findings.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
