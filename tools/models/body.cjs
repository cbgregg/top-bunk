#!/usr/bin/env node
'use strict';
// Builds assets/models/body.bin: the parents' everyday body language, from Quaternius's Universal Animation Library 1 and 2
// (CC0, quaternius.com), baked onto the Rocketbox skeleton in headless Chromium (body.html) and stored as 16-bit quaternions.
//   node tools/models/body.cjs <dir with UAL1_Standard.glb and UAL2_Standard.glb> [out] [--port N]
// Run from the repo root; needs Playwright. Prints, per clip, where the hips go and which hand is raised (the torch, the phone), and
// for LayToIdle the lying pose at its first frame (see README.md: the parents' bed lies the standing rig down by a group rotation).
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ARGV = process.argv.slice(2), pi = ARGV.indexOf('--port'), PORT = pi >= 0 ? +ARGV[pi + 1] : 8129; if (pi >= 0) ARGV.splice(pi, 2);
const ROOT = path.resolve(__dirname, '..', '..'), [srcDir, outFile = path.join(ROOT, 'assets/models/body.bin')] = ARGV;
// [source file, source clip, name in the game]. The first five are the everyday idle, talking, sitting and folded arms; the rest are
// what the days, the breakfast and the parents' nights need, under their library names (js/rig.js decides per name which keep their legs)
const JOBS = [
  ['ual1', 'Idle_Loop', 'stand'], ['ual1', 'Idle_Talking_Loop', 'talk'], ['ual1', 'Sitting_Idle_Loop', 'sit_idle'], ['ual1', 'Sitting_Talking_Loop', 'sit_talk'],
  ['ual2', 'Idle_FoldArms_Loop', 'fold'],
  ['ual1', 'Sitting_Enter', 'Sitting_Enter'], ['ual1', 'Sitting_Exit', 'Sitting_Exit'],                 // sitting down on a chair, getting up from it
  ['ual2', 'Walk_Carry_Loop', 'Walk_Carry_Loop'],                                                       // a walk with a box against the chest
  ['ual2', 'Consume', 'Consume'], ['ual2', 'Yes', 'Yes'], ['ual2', 'Idle_No_Loop', 'Idle_No_Loop'],      // a bite or a sip; a nod; a slow head shake
  ['ual2', 'Idle_TalkingPhone_Loop', 'Idle_TalkingPhone_Loop'], ['ual2', 'Idle_Rail_Call', 'Idle_Rail_Call'],   // on the wall phone; leaning on a rail, calling out
  ['ual2', 'LayToIdle', 'LayToIdle'],                                                                   // lying on the back to standing
  ['ual1', 'Idle_Torch_Loop', 'Idle_Torch_Loop'], ['ual1', 'Interact', 'Interact'], ['ual1', 'PickUp_Table', 'PickUp_Table'],   // a torch held up; a hand to a switch or a knob; taking something off a table
  ['ual1', 'Fixing_Kneeling', 'Fixing_Kneeling'], ['ual1', 'Push_Loop', 'Push_Loop'],                   // kneeling at a repair; pushing something heavy
];
const FILES = { ual1: 'UAL1_Standard.glb', ual2: 'UAL2_Standard.glb' };
const types = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.json': 'application/json' };
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  const f = u.startsWith('/src/') ? path.join(srcDir, u.slice(5)) : u === '/body.html' ? path.join(__dirname, 'body.html') : path.join(ROOT, u);
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(d); });
}).listen(PORT);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await b.newPage();
  pg.on('pageerror', (e) => console.log('ERR', e.message));
  const jobs = JOBS.map(([f, c, n]) => ['/src/' + FILES[f], c, n]);
  await pg.goto(`http://localhost:${PORT}/body.html?jobs=` + encodeURIComponent(JSON.stringify(jobs)));
  await pg.waitForFunction(() => window.done, null, { timeout: 280000 });
  const err = await pg.evaluate(() => window.err); if (err) { console.log(err); process.exit(1); }
  console.log('facing', JSON.stringify(await pg.evaluate(() => window.info)));
  const clips = await pg.evaluate(() => window.out);
  // what each clip does with the body, so a reader of this log knows which hand holds the torch and how far the hips travel
  for (const c of clips) {
    const p = c.probe, f3 = (v) => v.map((x) => x.toFixed(2)).join(' ');
    console.log(`${c.name.padEnd(24)} ${c.duration.toFixed(2)}s hips first ${f3(p.hips0)} last ${f3(p.hips1)} (drop ${p.drop.toFixed(2)} m, ${p.travel.toFixed(2)} from the stance${c.hips ? ', kept' : ''}; ` +
      `lifted ${(p.lift * 100).toFixed(1)} cm at most, at ${p.liftAt} s) hands first L ${p.handL0.toFixed(2)} R ${p.handR0.toFixed(2)} (${p.raised} raised)`);
    // the body through the clip: where the head points from the pelvis, where the front faces, and the pelvis and head heights
    for (const u of p.ups) console.log(`    ${String(u.t).padStart(5)} s  head ${f3(u.up)}  front ${f3(u.front)}  pelvis ${u.pelvisY} m  head ${u.headY} m`);
  }
  // the file: a JSON header (each clip's name, length, frame count and bones; and, where the hips leave the standing stance by more
  // than 3 cm, their path: [x, y, z] per frame in millimetres from the rest pose, +z forward, for a rig whose pelvis rests `pelvis`
  // metres over the floor, with `stance`, where the hips rest in the standing idle, in the same units), then every clip's values as
  // int16 (x 32767), clip by clip, bone by bone
  const header = clips.map((c) => ({ name: c.name, duration: +c.duration.toFixed(4), fps: c.fps, frames: c.frames, bones: c.bones, ...(c.hips ? { pelvis: +c.pelvis.toFixed(3), hips: c.hips, stance: c.stance } : {}) }));
  const n = clips.reduce((a, c) => a + c.vals.reduce((s, v) => s + v.length, 0), 0), data = new Int16Array(n); let o = 0;
  for (const c of clips) for (const v of c.vals) for (const x of v) data[o++] = Math.round(Math.max(-1, Math.min(1, x)) * 32767);
  const hj = Buffer.from(JSON.stringify(header)), pad = (4 - ((8 + hj.length) % 4)) % 4;
  const head = Buffer.alloc(8); head.write('BODY', 0); head.writeUInt32LE(hj.length + pad, 4);
  fs.writeFileSync(outFile, Buffer.concat([head, hj, Buffer.alloc(pad, 32), Buffer.from(data.buffer)]));
  console.log(outFile, (fs.statSync(outFile).size / 1024).toFixed(0) + ' KB', clips.map((c) => `${c.name} ${c.duration.toFixed(1)}s`).join(', '));
  await b.close(); srv.close();
})();
