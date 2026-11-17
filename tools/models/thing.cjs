#!/usr/bin/env node
'use strict';
// Builds assets/models/thing.glb: the thing's head and hands, modelled in Blender (thing.py) over the game's own skull and finger bones.
//   node tools/models/thing.cjs --blender <path to blender 4.2> [out] [--port N] [--keep <dir>]
// Run from the repo root; needs Playwright and Blender 4.2. thing.html is opened in headless Chromium and hands over the skull-and-neck
// mesh of js/creature.js (vertex for vertex) and the hand joints of assets/models/spirit.glb with the fingers lengthened; Blender works
// the head's surface, paints its skin (colour, relief and roughness pictures), builds the two hands on the joints and writes the GLB.
// --keep leaves the handed-over JSON and the three pictures in a folder to look at.
const { chromium } = require('playwright');
const { spawnSync } = require('child_process');
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path');
const ARGV = process.argv.slice(2);
const take = (k) => { const i = ARGV.indexOf(k); if (i < 0) return null; const v = ARGV[i + 1]; ARGV.splice(i, 2); return v; };
const PORT = +(take('--port') || 8131), BLENDER = take('--blender') || 'blender', KEEP = take('--keep');
const ROOT = path.resolve(__dirname, '..', '..'), outFile = path.resolve(ARGV[0] || path.join(ROOT, 'assets/models/thing.glb'));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.json': 'application/json' };
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]), f = u === '/thing.html' ? path.join(__dirname, 'thing.html') : path.join(ROOT, u);
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(d); });
}).listen(PORT);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await b.newPage();
  pg.on('pageerror', (e) => console.log('ERR', e.message));
  await pg.goto(`http://localhost:${PORT}/thing.html`);
  await pg.waitForFunction(() => window.done, null, { timeout: 280000 });
  const err = await pg.evaluate(() => window.err); if (err) { console.log(err); process.exit(1); }
  const data = await pg.evaluate(() => window.out);
  await b.close(); srv.close();
  const dir = KEEP ? path.resolve(KEEP) : fs.mkdtempSync(path.join(os.tmpdir(), 'thing-'));
  fs.mkdirSync(dir, { recursive: true });
  const json = path.join(dir, 'thing.json'); fs.writeFileSync(json, JSON.stringify(data));
  console.log(`head ${data.head.cols} x ${data.head.rows}, ${Object.keys(data.hands.joints).length} hand joints, wrists ${JSON.stringify(data.hands.wrist)}`);
  const r = spawnSync(BLENDER, ['-b', '--factory-startup', '--python', path.join(__dirname, 'thing.py'), '--', json, outFile, dir], { stdio: 'inherit' });
  if (!KEEP) fs.rmSync(dir, { recursive: true, force: true });
  if (r.status !== 0 || !fs.existsSync(outFile)) { console.log('blender failed'); process.exit(1); }
  console.log(outFile, (fs.statSync(outFile).size / 1024).toFixed(0) + ' KB');
})();
