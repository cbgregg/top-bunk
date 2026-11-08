// Placement audit: loads the game headless and checks every placed model against the others, the walls and the floor.
//   node tests/placement.js [--port N] [--json out.json] [--tol 0.03]
// Reports models that cut into each other, into a wall or the floor, that float, or whose front faces a wall; exit 1 when it finds any.
// A model set down below the floor on purpose has its allowance in tests/sunk/<package>.json ({ modelName: metres }).
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
const IN_WALL = new Set(['outlet', 'switch', 'clock_wall']);
// pairs that are meant to overlap in their boxes (a chair pushed under a table, a lamp on a desk, a pc on a desk)
const TUCKED = [['chair', 'table_round'], ['office_chair', 'desk'], ['crt_pc', 'desk'], ['desk_lamp', 'desk'], ['table_lamp', 'dresser'], ['kettle', 'stove'], ['pot', 'stove'], ['tv', 'table'], ['teddy', 'bunk']];
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
  // every model holder has its model in, or its load failed
  await page.waitForFunction(() => { let n = 0; window.__game.scene.traverse((o) => { if (o.userData && o.userData.prop && !o.children.length) n++; }); return n === 0; }, null, { timeout: 120e3, polling: 500 }).catch(() => {});

  const data = await page.evaluate(async ([FRONT, IN_WALL, TOL]) => {
    const THREE = await import('three'); const Wm = await import('/js/world.js');
    const g = window.__game, W = g.W; g.setPhase('day', true); g.scene.updateMatrixWorld(true);
    const items = [];
    g.scene.traverse((o) => {
      if (!o.userData || !o.userData.prop || !o.children.length) return;
      const b = new THREE.Box3().setFromObject(o); if (b.isEmpty()) return;
      const c = b.getCenter(new THREE.Vector3()), f = FRONT[o.userData.prop] === undefined ? FRONT.default : FRONT[o.userData.prop];
      const front = f ? new THREE.Vector3(...f).applyQuaternion(o.getWorldQuaternion(new THREE.Quaternion())) : null;
      items.push({ name: o.userData.prop, x: +c.x.toFixed(3), y: +c.y.toFixed(3), z: +c.z.toFixed(3), rot: +o.rotation.y.toFixed(3), min: b.min.toArray().map((v) => +v.toFixed(3)), max: b.max.toArray().map((v) => +v.toFixed(3)),
        front: front ? [+front.x.toFixed(2), +front.z.toFixed(2)] : null, room: Wm.roomAt(c.x, c.z, b.min.y), inWall: IN_WALL.includes(o.userData.prop) });
    });
    const walls = W.colliders.filter((c) => c.wall && c.on !== false), furn = W.colliders.filter((c) => !c.wall && c.on !== false);
    return { items, walls: walls.map((c) => [c.minX, c.maxX, c.minZ, c.maxZ, c.minY ?? -0.3, c.maxY ?? 3]), furn: furn.map((c) => [c.minX, c.maxX, c.minZ, c.maxZ]), ground: items.map((i) => Wm.groundAt(i.x, i.z, i.min[1])) };
  }, [FRONT, [...IN_WALL], TOL]);
  await browser.close(); server.close();

  const { items, walls, furn, ground } = data, findings = [];
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

  const order = { high: 0, low: 1 };
  findings.sort((p, q) => order[p.sev] - order[q.sev] || p.room.localeCompare(q.room));
  console.log(`${items.length} models, ${walls.length} wall pieces, ${furn.length} built footprints, ${Object.keys(SUNK).length} set down on purpose (${Object.entries(SUNK).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'})`);
  if (errs.length) console.log('page errors:', errs.join(' | '));
  for (const f of findings) console.log(`${f.sev.padEnd(4)} ${f.room.padEnd(8)} ${f.obj}: ${f.issue} (${f.nums})`);
  console.log(findings.length ? `${findings.length} findings` : 'clean');
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify({ items, findings }, null, 1));
  process.exit(findings.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
