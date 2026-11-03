#!/usr/bin/env node
'use strict';
// Builds assets/models/body.bin: the parents' everyday body language, from Quaternius's Universal Animation Library 1 and 2
// (CC0, quaternius.com), baked onto the Rocketbox skeleton in headless Chromium (body.html) and stored as 16-bit quaternions.
//   node tools/models/body.cjs <dir with UAL1_Standard.glb and UAL2_Standard.glb> [out]
// Run from the repo root; needs Playwright.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..'), [srcDir, outFile = path.join(ROOT, 'assets/models/body.bin')] = process.argv.slice(2);
// [source file, source clip, name in the game]
const JOBS = [
  ['ual1', 'Idle_Loop', 'stand'], ['ual1', 'Idle_Talking_Loop', 'talk'], ['ual1', 'Sitting_Idle_Loop', 'sit_idle'], ['ual1', 'Sitting_Talking_Loop', 'sit_talk'],
  ['ual2', 'Idle_FoldArms_Loop', 'fold'],
];
const FILES = { ual1: 'UAL1_Standard.glb', ual2: 'UAL2_Standard.glb' };
const types = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.json': 'application/json' };
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  const f = u.startsWith('/src/') ? path.join(srcDir, u.slice(5)) : u === '/body.html' ? path.join(__dirname, 'body.html') : path.join(ROOT, u);
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(d); });
}).listen(8129);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await b.newPage();
  pg.on('pageerror', (e) => console.log('ERR', e.message));
  const jobs = JOBS.map(([f, c, n]) => ['/src/' + FILES[f], c, n]);
  await pg.goto('http://localhost:8129/body.html?jobs=' + encodeURIComponent(JSON.stringify(jobs)));
  await pg.waitForFunction(() => window.done, null, { timeout: 280000 });
  const err = await pg.evaluate(() => window.err); if (err) { console.log(err); process.exit(1); }
  console.log('facing', JSON.stringify(await pg.evaluate(() => window.info)));
  const clips = await pg.evaluate(() => window.out);
  // the file: a JSON header (each clip's name, length, frame count and bones), then every clip's values as int16 (x 32767), clip by clip, bone by bone
  const header = clips.map((c) => ({ name: c.name, duration: +c.duration.toFixed(4), fps: c.fps, frames: c.frames, bones: c.bones }));
  const n = clips.reduce((a, c) => a + c.vals.reduce((s, v) => s + v.length, 0), 0), data = new Int16Array(n); let o = 0;
  for (const c of clips) for (const v of c.vals) for (const x of v) data[o++] = Math.round(Math.max(-1, Math.min(1, x)) * 32767);
  const hj = Buffer.from(JSON.stringify(header)), pad = (4 - ((8 + hj.length) % 4)) % 4;
  const head = Buffer.alloc(8); head.write('BODY', 0); head.writeUInt32LE(hj.length + pad, 4);
  fs.writeFileSync(outFile, Buffer.concat([head, hj, Buffer.alloc(pad, 32), Buffer.from(data.buffer)]));
  console.log(outFile, (fs.statSync(outFile).size / 1024).toFixed(0) + ' KB', clips.map((c) => `${c.name} ${c.duration.toFixed(1)}s`).join(', '));
  await b.close(); srv.close();
})();
