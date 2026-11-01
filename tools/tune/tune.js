#!/usr/bin/env node
// The mechanical part of tuning the robot voice toward a goal: render an excerpt with a parameter set, measure it, write
// everything down, pick the next set, repeat. The next set comes from a language model when --llm names a command that reads a
// prompt on stdin and answers with JSON on stdout; without it, from a plain coordinate search on the numbers in the goal file.
//
//   node tools/tune/tune.js --song s.json --goal goal.txt --out dir/ [--params p.json | --preset NAME] [--iters 8]
//                           [--from 10 --to 30] [--ref stem.wav] [--llm "opencode run --agent voice-tuner"] [--keep-wav]
// --ref hands a recording to the measure, so goals can name envelopeCorrActive, durationRatio, meanPhraseOnsetMs...
//
// goal.txt is words for the model, and optionally lines of targets the search can use:  wobbleIndex: 0.6
// Output: dir/iter_N/{params.json, out.wav, voice.wav, metrics.json, report.png, notes.md} and dir/summary.md.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mergeParams, diffParams, setParam, specOf, PRESETS, sliceSong } from '../sing_core.js';

const here = path.dirname(fileURLToPath(import.meta.url)), tools = path.join(here, '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 && i + 1 < args.length ? args[i + 1] : d; };
const has = (k) => args.includes(k);
const SONG = opt('--song', null), GOAL = opt('--goal', null), OUT = opt('--out', null);
if (!SONG || !GOAL || !OUT) { console.error('usage: node tools/tune/tune.js --song s.json --goal goal.txt --out dir/ [--params p.json | --preset NAME] [--iters 8] [--from S --to S] [--llm cmd]'); process.exit(1); }
const ITERS = +opt('--iters', 8) || 8, FROM = opt('--from', null), TO = opt('--to', null), LLM = opt('--llm', null), REF = opt('--ref', null);
const goalText = fs.readFileSync(GOAL, 'utf8');
// targets in the goal file:  name: number
const targets = {};
for (const m of goalText.matchAll(/^\s*([A-Za-z0-9]+)\s*:\s*(-?\d+(?:\.\d+)?)\s*$/gm)) targets[m[1]] = +m[2];
let params = mergeParams(opt('--preset', null) ? PRESETS[opt('--preset', null)] : null, opt('--params', null) ? JSON.parse(fs.readFileSync(opt('--params', null), 'utf8')) : null);
fs.mkdirSync(OUT, { recursive: true });

// which parameter the search moves for a metric, and which way a bigger value pushes it
const LEVERS = {
  wobbleIndex: [['voice.wobble', 1], ['voice.vibratoDepth', 1]],
  vibratoCents: [['voice.vibratoDepth', 1], ['voice.wobble', 1]],
  driftCents: [['voice.driftDepth', 1], ['voice.wobble', 1]],
  meanAbsCents: [['voice.wobble', 1], ['voice.flatCents', -1]],
  medianCents: [['voice.flatCents', 1]],
  legatoGapMs: [['voice.consonantLength', -1], ['voice.attackMs', -1]],
  meanOnsetMs: [['voice.consonantLength', 1], ['voice.attackMs', 1]],
  nhr: [['voice.breath', 1], ['tape.hiss', 1]],
  centroidHz: [['voice.brightness', 1], ['tape.highCut', 1]],
  tiltDbPerOct: [['voice.brightness', 1]],
  formantDevPct: [['voice.bandwidthScale', 1], ['voice.formantShift', 1]],
  loudnessLufs: [['mix.master', 1]],
  truePeakDb: [['mix.master', 1]],
  bandVoiceDb: [['mix.band', 1], ['mix.bandBalance', 1]],
  stereoWidthDb: [['mix.width', 1], ['band.width', 1]],
  crestDb: [['tape.drive', -1], ['mix.limiterDrive', -1]],
};

function render(iter, P) {
  const dir = path.join(OUT, `iter_${iter}`); fs.mkdirSync(dir, { recursive: true });
  const pfile = path.join(dir, 'params.json'); fs.writeFileSync(pfile, JSON.stringify(P, null, 2));
  const range = [].concat(FROM != null ? ['--from', FROM] : [], TO != null ? ['--to', TO] : []);
  execFileSync(process.execPath, [path.join(tools, 'sing.js'), SONG, '--out', path.join(dir, 'out.wav'), '--params', pfile, ...range], { stdio: ['ignore', 'ignore', 'inherit'] });
  execFileSync(process.execPath, [path.join(tools, 'sing.js'), SONG, '--out', path.join(dir, 'voice.wav'), '--params', pfile, '--band', '0', ...range], { stdio: ['ignore', 'ignore', 'inherit'] });
  // the excerpt as a song file, so the measure lines the notes up with it
  let songFile = SONG;
  if (range.length) { songFile = path.join(dir, 'excerpt.json'); fs.writeFileSync(songFile, JSON.stringify(sliceSong(JSON.parse(fs.readFileSync(SONG, 'utf8')), +(FROM ?? 0) || 0, TO != null ? +TO : Infinity))); }
  const out = execFileSync(process.execPath, [path.join(tools, 'sing_measure.js'), path.join(dir, 'out.wav'), '--song', songFile, '--voice', path.join(dir, 'voice.wav'), '--params', pfile, '--png', path.join(dir, 'report.png'), '--json', path.join(dir, 'metrics.json'), ...(REF ? ['--ref', REF] : [])], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  const m = JSON.parse(out); delete m.perNote; delete m.perPhraseOnsetMs; if (m.ref) { m.refDurationSec = m.ref.durationSec; delete m.ref; } if (m.render) { m.activeStartSec = m.render.activeStartSec; m.crestDb = m.render.crestDb; delete m.render; }
  return { dir, metrics: m };
}
const score = (m) => { let s = 0, n = 0; for (const [k, t] of Object.entries(targets)) { if (m[k] == null) continue; const scale = Math.max(1e-6, Math.abs(t) || 1); s += Math.abs(m[k] - t) / scale; n++; } return n ? s / n : NaN; };
const brief = (m) => Object.entries(m).filter(([k]) => !['file', 'png', 'perNote'].includes(k)).map(([k, v]) => `${k} ${v}`).join(', ');

// the model: the prompt in, JSON out
function askModel(history, last) {
  const prompt = [
    'You are tuning a formant-synthesis robot singer. Propose the next parameter set as JSON only (no prose), partial sets allowed: only the keys you change, in the shape {"voice":{...},"tape":{...},"lofi":{...},"band":{...},"mix":{...}}.',
    `Read ${path.join(tools, 'voice-params.md')} for every key, its range and what it does. Metrics come from tools/sing_measure.js; the spectrogram of the last render is at ${last.png} (the song's notes in blue over the tracked pitch in yellow).`,
    '', 'GOAL', goalText.trim(), '',
    'CURRENT PARAMETERS (what differs from the defaults)', JSON.stringify(diffParams(params)), '',
    'HISTORY (oldest first)', ...history.map((h, i) => `iter ${i}: changed ${JSON.stringify(h.diff)} -> ${brief(h.metrics)}`), '',
    'Move a few parameters at a time, toward the goal, within the ranges. Answer with the JSON object only.',
  ].join('\n');
  const r = spawnSync(LLM, { input: prompt, shell: true, encoding: 'utf8', maxBuffer: 1 << 24 });
  if (r.status !== 0) throw new Error(`the model command failed (${r.status}): ${(r.stderr || '').slice(0, 400)}`);
  const text = r.stdout || '', m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('the model answered with no JSON: ' + text.slice(0, 300));
  const part = JSON.parse(m[0]);
  return { next: mergeParams(params, part), raw: part, prompt };
}

// the plain search: for each target metric, the lever that is off most, moved a step toward the target; the step halves when a move made things worse
function nextBySearch(history) {
  const last = history[history.length - 1], m = last.metrics, moves = [];
  const worse = history.length >= 2 && score(m) > score(history[history.length - 2].metrics);
  const used = new Set();
  for (const [k, t] of Object.entries(targets)) {
    if (m[k] == null || !LEVERS[k]) continue;
    const err = (t - m[k]) / (Math.abs(t) || 1); if (Math.abs(err) < 0.03) continue;
    const lever = LEVERS[k].find(([key]) => !used.has(key)); if (!lever) continue;   // one move per parameter per round
    const [key, dir] = worse && LEVERS[k][1] && !used.has(LEVERS[k][1][0]) ? LEVERS[k][1] : lever;
    used.add(key);
    const s = specOf(key), span = s.max - s.min, step = span * Math.min(0.25, Math.abs(err) * 0.3) * (worse ? 0.5 : 1) * Math.sign(err) * dir;
    const [g, kk] = key.split('.');
    moves.push({ key, from: params[g][kk], to: Math.max(s.min, Math.min(s.max, params[g][kk] + step)), because: `${k} ${m[k]} -> ${t}` });
  }
  const next = mergeParams(params);
  for (const mv of moves) setParam(next, mv.key, mv.to);
  return { next, moves };
}

const history = [];
let best = null;
for (let i = 0; i < ITERS; i++) {
  const { dir, metrics } = render(i, params);
  const sc = score(metrics);
  const entry = { iter: i, dir, metrics, diff: diffParams(params), score: sc };
  history.push(entry);
  if (!best || (Number.isFinite(sc) && sc < best.score)) best = entry;
  const notes = [`# iter ${i}`, '', `params: ${JSON.stringify(entry.diff)}`, '', `metrics: ${brief(metrics)}`, '', Number.isFinite(sc) ? `distance to the targets: ${sc.toFixed(3)}` : 'no numeric targets in the goal; the model judges'];
  console.log(`iter ${i}: ${Number.isFinite(sc) ? `distance ${sc.toFixed(3)}` : ''} ${brief(metrics).slice(0, 160)}`);
  if (i === ITERS - 1) { fs.writeFileSync(path.join(dir, 'notes.md'), notes.join('\n') + '\n'); break; }
  let step;
  try {
    if (LLM) { const r = askModel(history, { png: path.join(dir, 'report.png') }); step = { next: r.next, moves: [{ key: 'model', because: JSON.stringify(r.raw) }] }; fs.writeFileSync(path.join(dir, 'prompt.txt'), r.prompt); }
    else step = nextBySearch(history);
  } catch (e) { notes.push('', `next step failed: ${e.message}`); fs.writeFileSync(path.join(dir, 'notes.md'), notes.join('\n') + '\n'); console.error(e.message); break; }
  notes.push('', 'next: ' + (step.moves.length ? step.moves.map((mv) => `${mv.key}${mv.from != null ? ` ${mv.from} -> ${+mv.to.toFixed(4)}` : ''} (${mv.because})`).join('; ') : 'nothing to move'));
  fs.writeFileSync(path.join(dir, 'notes.md'), notes.join('\n') + '\n');
  if (!step.moves.length && !LLM) { console.log('every target within 3%; stopping'); break; }
  params = step.next;
}
const keys = [...new Set(history.flatMap((h) => Object.keys(h.metrics)))].filter((k) => !['file', 'png', 'perNote'].includes(k));
const cols = ['iter', 'distance', ...Object.keys(targets), ...keys.filter((k) => !(k in targets))];
let md = `# tuning: ${path.basename(GOAL)}\n\nsong ${SONG}${FROM != null || TO != null ? ` (${FROM ?? 0} to ${TO ?? 'end'} s)` : ''}, ${history.length} iteration${history.length === 1 ? '' : 's'}, ${LLM ? 'next steps by the model' : 'next steps by search'}.\n`;
if (Object.keys(targets).length) md += `targets: ${Object.entries(targets).map(([k, v]) => `${k} ${v}`).join(', ')}\n`;
md += `\n| ${cols.join(' | ')} |\n|${cols.map(() => '---').join('|')}|\n`;
for (const h of history) md += `| ${[h.iter, Number.isFinite(h.score) ? h.score.toFixed(3) : '-', ...cols.slice(2).map((k) => h.metrics[k] ?? '-')].join(' | ')} |\n`;
md += `\nchanged per iteration:\n${history.map((h) => `- iter ${h.iter}: ${JSON.stringify(h.diff)}`).join('\n')}\n`;
if (best) { md += `\nbest: iter ${best.iter} (${path.join(best.dir, 'params.json')})\n`; fs.writeFileSync(path.join(OUT, 'best_params.json'), JSON.stringify(best.diff, null, 2)); }
fs.writeFileSync(path.join(OUT, 'summary.md'), md);
if (!has('--keep-wav')) for (const h of history) if (h !== best && h.iter !== history.length - 1) for (const f of ['out.wav', 'voice.wav']) { try { fs.unlinkSync(path.join(h.dir, f)); } catch (e) { /* gone */ } }
console.log(`summary: ${path.join(OUT, 'summary.md')}${best ? `; best iter ${best.iter}` : ''}`);
