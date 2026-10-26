const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const root = process.argv[2], outDir = process.argv[3]; const types = { '.html': 'text/html', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.glb': 'model/gltf-binary' };
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(d); } }); }).listen(8128);
(async () => { const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] }); const pg = await b.newPage();
  pg.on('pageerror', e => console.log('ERR', e.message)); pg.on('console', m => ['error', 'warning'].includes(m.type()) && console.log(m.type().toUpperCase(), m.text().slice(0, 200)));
  await pg.goto('http://localhost:8128/export.html'); await pg.waitForFunction(() => window.done, null, { timeout: 280000 });
  console.log(JSON.stringify(await pg.evaluate(() => window.info))); const out = await pg.evaluate(() => window.out);
  fs.mkdirSync(outDir, { recursive: true }); for (const [k, v] of Object.entries(out)) fs.writeFileSync(path.join(outDir, k + '.glb'), Buffer.from(v, 'base64'));
  await b.close(); srv.close(); })();
