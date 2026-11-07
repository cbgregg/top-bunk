#!/usr/bin/env node
// The dialogue lint: assets/audio/lines.json and the recordings under assets/audio/vo/ against tests/voice_ids.json (every id the
// rewrite records, by wave), and the register over every spoken line. Exit 1 on any failure, 0 when the three waves are recorded.
//
//   node tools/voice_lint.js            every check
//   node tools/voice_lint.js --wave 1   only the ids of that wave need a recording (while the later waves are still being made)
//
// What it checks:
//   - every id in voice_ids.json is in lines.json with a voice, a `say` text and an `html` subtitle, and has an mp3 under vo/ that
//     the manifest lists; an id with no `say` fails (the text is what the voice reads, so a line with none has not been written)
//   - every recording of those ids was made from the line's current text (assets/audio/vo/takes.json, written by gen_voice.py),
//     so the replaced ids were re-recorded and not left as their old takes
//   - the six orphaned recordings are kept, the two shouted finale lines are gone, the kid's you/ ids are subtitle-only
//   - the register: no "ghost", "monster", "haunted", "JESUS", "OH MY GOD", "mister" (the bear's name, Mister Buttons, is a name and
//     not the sitcom address), "raising the rent" or "back room" in any spoken line, over the subtitle text and over `say` with the
//     bracketed acting directions stripped; the kid's lines are exempt, and his one "monster" is you/m2_b
//   - the cartoon's two reworded lines no longer name the breath meter or the button; the real Mom's search calls are flat and
//     worried and the night-one calls keep their sweet take; dad/leftovers says "front room"
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const VO = path.join(ROOT, 'assets', 'audio', 'vo');
const ARGV = process.argv.slice(2);
const opt = (name) => { const i = ARGV.indexOf(name); return i >= 0 ? ARGV[i + 1] : null; };
const WAVE = opt('--wave') ? +opt('--wave') : 0;

const read = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const lines = read('assets/audio/lines.json');
const spec = read('tests/voice_ids.json');
const manifest = fs.existsSync(path.join(ROOT, 'assets/audio/manifest.json')) ? new Set(read('assets/audio/manifest.json').files) : null;
const takes = fs.existsSync(path.join(VO, 'takes.json')) ? read('assets/audio/vo/takes.json') : {};
const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');

const fails = [];
const fail = (s) => fails.push(s);
const mp3 = (id) => { const p = path.join(VO, id + '.mp3'); return fs.existsSync(p) && fs.statSync(p).size > 400; };
const strip = (l) => ((l.html || '').replace(/<[^>]+>/g, ' ') + ' ' + (l.say || '').replace(/\[[^\]]*\]/g, ' ')).replace(/\s+/g, ' ').trim();

// ---- the ids, wave by wave ----
const all = [];
for (const w of spec.waves) {
  const need = !WAVE || w.wave <= WAVE;
  for (const id of w.ids) {
    all.push(id);
    const l = lines[id];
    if (!l) { fail(`wave ${w.wave}: ${id} is not in lines.json`); continue; }
    if (!l.voice) fail(`wave ${w.wave}: ${id} has no voice`);
    if (!(l.say || '').trim()) fail(`wave ${w.wave}: ${id} has no say text (the line is not written)`);
    if (!(l.html || '').trim()) fail(`wave ${w.wave}: ${id} has no html subtitle`);
    if (!need) continue;
    if (!mp3(id)) fail(`wave ${w.wave}: ${id} has no recording under assets/audio/vo/`);
    else if (manifest && !manifest.has('vo/' + id)) fail(`wave ${w.wave}: vo/${id} is not in manifest.json (the game loads only what the manifest lists)`);
    const t = takes[id];
    if (!t) fail(`wave ${w.wave}: ${id} has no take in vo/takes.json (recorded by hand, or before the line was written?)`);
    else if (t.sha1 !== sha1(l.say)) fail(`wave ${w.wave}: ${id} was recorded from an older text; re-record it`);
  }
}
if (new Set(all).size !== all.length) fail('voice_ids.json repeats an id');
if (all.length !== spec.total) fail(`voice_ids.json lists ${all.length} ids but says total ${spec.total}`);
for (const id of spec.replacements) if (!all.includes(id)) fail(`replacement ${id} is not in any wave`);
for (const id of spec.placedOrphans) {
  if (!lines[id]) fail(`orphaned recording ${id} lost its line`);
  if (!mp3(id)) fail(`orphaned recording ${id} lost its mp3`);
}
for (const id of ['dad/f_a', 'mom/f_a']) {
  if (lines[id]) fail(`${id} is still in lines.json (the shouted finale lines are cut)`);
  if (fs.existsSync(path.join(VO, id + '.mp3'))) fail(`${id}.mp3 is still under vo/`);
}
if (lines['you/m9_a']) fail('you/m9_a ("Just one more night") is still in lines.json; dad/m9_b carries it');

// ---- the kid: subtitles only ----
for (const [id, l] of Object.entries(lines)) {
  if (!id.startsWith('you/')) continue;
  if (l.voice) fail(`${id}: the kid is never voiced`);
  if (!(l.html || '').trim()) fail(`${id}: no subtitle`);
  if (fs.existsSync(path.join(VO, id + '.mp3'))) fail(`${id}: has a recording`);
}

// ---- every voiced line has a recording the manifest lists ----
for (const [id, l] of Object.entries(lines)) {
  if (!l.voice) continue;
  if (!mp3(id)) fail(`${id}: voiced but no mp3 under vo/`);
  else if (manifest && !manifest.has('vo/' + id)) fail(`${id}: mp3 is not in manifest.json`);
}
if (fs.existsSync(VO)) {
  const walk = (d) => fs.readdirSync(d).flatMap((f) => { const p = path.join(d, f); return fs.statSync(p).isDirectory() ? walk(p) : p.endsWith('.mp3') ? [path.relative(VO, p).replace(/\\/g, '/').slice(0, -4)] : []; });
  for (const id of walk(VO)) {
    if (!lines[id]) fail(`vo/${id}.mp3 has no line in lines.json`);
    if (manifest && !manifest.has('vo/' + id)) fail(`vo/${id}.mp3 is not in manifest.json`);
  }
}

// ---- the register ----
const BANNED = [
  [/\bghosts?\b/i, 'ghost'], [/\bmonsters?\b/i, 'monster'], [/\bhaunted\b/i, 'haunted'], [/\bjesus\b/i, 'JESUS'], [/\boh,? my god\b/i, 'OH MY GOD'],
  [/\bmister\b(?!\s+buttons)/i, 'mister'], [/raising the rent/i, 'raising the rent'], [/\bback room\b/i, 'back room'],
];
for (const [id, l] of Object.entries(lines)) {
  const text = strip(l);
  if (id.startsWith('you/')) {
    if (/\bmonsters?\b/i.test(text) && id !== 'you/m2_b') fail(`${id}: the kid says "monster" once, in you/m2_b`);
    continue;
  }
  for (const [re, word] of BANNED) if (re.test(text)) fail(`${id}: register ("${word}"): ${text}`);
}
if (!/\bmonster\b/i.test(strip(lines['you/m2_b'] || {}))) fail('you/m2_b should be the kid\'s one "monster"');
for (const id of ['dad/m5_a', 'mom/t_parents']) if (lines[id] && !/\[[^\]]*haunted[^\]]*\]/.test(lines[id].say || '')) fail(`${id}: expected "haunted" only as a direction tag`);
for (const id of ['cartoon/c_meter', 'cartoon/c_hold']) {
  const t = strip(lines[id] || {});
  if (/\bmeter\b/i.test(t)) fail(`${id} still names the breath meter: ${t}`);
  if (/\bbuttons?\b/i.test(t.replace(/mister buttons/ig, ''))) fail(`${id} still names the button: ${t}`);
}
if (lines['dad/leftovers'] && !/front room/i.test(lines['dad/leftovers'].say)) fail('dad/leftovers should say "front room"');
for (const id of ['mom/n5_g', 'mom/n5_h']) if (lines[id] && !/^\[flat, worried\]/.test(lines[id].say)) fail(`${id}: the real Mom\'s search is recorded flat and worried`);
for (const id of ['mom/n1_call_a', 'mom/n1_call_b']) if (!lines[id] || !/^\[sweet/.test(lines[id].say)) fail(`${id}: night one\'s call keeps its sweet take`);
for (const id of Object.keys(lines)) if (!/^[a-z]+\/[a-z0-9_]+$/.test(id)) fail(`${id}: id shape`);

// ---- report ----
const counts = spec.waves.map((w) => `wave ${w.wave}: ${w.ids.filter(mp3).length}/${w.ids.length} recorded`).join(', ');
if (fails.length) {
  console.log(fails.map((s) => 'FAIL ' + s).join('\n'));
  console.log(`\n${fails.length} failure(s); ${counts}`);
  process.exit(1);
}
console.log(`voice lint: ${Object.keys(lines).length} lines, ${spec.total} ids in the rewrite (${spec.replacements.length} re-recorded, ${spec.newCount} new), register clean; ${counts}`);
