#!/usr/bin/env node
// Sings a song file the way an early computer did: a buzzing glottal pulse pushed through vowel formant filters, consonants as
// short noise bursts, every note slightly flat and wobbly, over a plain organ and bass. No dependencies.
//
//   node tools/sing.js song.json --out out.wav [--slow 0.97] [--pitch -1] [--wobble 0.5] [--voice 1] [--band 0.8]
//
// song.json: { bpm, key, voice: [{ note: 'C4' | 60 | null, beats, syl: 'dai' }], chords: [{ beats, notes: ['C3','E3','G3'] }] }
//   syl is spelled ('win', 'dow') or, with spaces, given as sounds ('d o u'): consonants s z sh ch j f v th dh h t d k g p b m n ng l r w y,
//   vowels a ah ae e eh i ih o oh u oo uh er aw. Spelling guesses the vowel; sounds are exact.
//   --slow F     tape speed; below 1 slows and drops the pitch together (0.97 = the dying-computer feel)
//   --pitch N    transpose everything N semitones before singing
//   --wobble W   0..1, how unsteady the pitch is (default 0.5)
//   --voice V    voice level, --band V organ and bass level (both default 1; the band sits a few dB under the voice)
'use strict';
const fs = require('fs');

const SR = 44100;
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 && i + 1 < args.length ? args[i + 1] : d; };
const songFile = args.find((a) => !a.startsWith('--') && (args.indexOf(a) === 0 || !args[args.indexOf(a) - 1].startsWith('--')));
if (!songFile) { console.error('usage: node tools/sing.js song.json --out out.wav'); process.exit(1); }
const song = JSON.parse(fs.readFileSync(songFile, 'utf8'));
const OUT = opt('--out', 'song.wav'), SLOW = +opt('--slow', 1), PITCH = +opt('--pitch', 0), WOBBLE = +opt('--wobble', 0.5);
const VOICE = +opt('--voice', 1), BAND = +opt('--band', 1);
const beat = 60 / (song.bpm || 96);

// ---------- notes ----------
const NAMES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function midi(n) {
  if (n == null) return null;
  if (typeof n === 'number') return n + PITCH;
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(n.trim());
  if (!m) throw new Error('bad note ' + n);
  return 12 * (+m[3] + 1) + NAMES[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + PITCH;
}
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

// ---------- the mouth: formant targets ----------
// f1..f3 in Hz, with bandwidths; the fourth formant is fixed. Values are a male-ish vocal tract, which the pulse pitch can sit well above.
const VOWELS = {
  a: [700, 1220, 2600], ah: [600, 1040, 2250], ae: [660, 1720, 2410], e: [530, 1840, 2480], eh: [530, 1840, 2480],
  i: [270, 2290, 3010], ih: [390, 1990, 2550], o: [450, 800, 2830], oh: [450, 800, 2830], u: [300, 870, 2240], oo: [300, 870, 2240],
  uh: [640, 1190, 2390], er: [490, 1350, 1690], aw: [570, 840, 2410],
};
// diphthongs: start vowel -> end vowel
const DIPH = { ai: ['ah', 'i'], ay: ['e', 'i'], ei: ['e', 'i'], ey: ['e', 'i'], ou: ['ah', 'u'], ow: ['ah', 'u'], oi: ['o', 'i'], oy: ['o', 'i'], ie: ['ah', 'i'], ea: ['i', 'i'], ee: ['i', 'i'], oa: ['o', 'u'], oo: ['u', 'u'], ue: ['u', 'u'] };
const BW = [90, 120, 170, 220];
// consonants: kind decides the sound; dur in seconds
const CONS = {
  s: { k: 'noise', hp: 4500, dur: 0.11 }, z: { k: 'noise', hp: 4000, dur: 0.09, voiced: true }, sh: { k: 'noise', bp: 2800, q: 1.2, dur: 0.12 },
  ch: { k: 'noise', bp: 2800, q: 1.2, dur: 0.08, burst: true }, j: { k: 'noise', bp: 2400, q: 1.2, dur: 0.07, burst: true, voiced: true },
  f: { k: 'noise', hp: 2500, dur: 0.09, soft: true }, v: { k: 'noise', hp: 2500, dur: 0.07, soft: true, voiced: true },
  th: { k: 'noise', hp: 3500, dur: 0.08, soft: true }, dh: { k: 'noise', hp: 3000, dur: 0.05, soft: true, voiced: true },
  h: { k: 'noise', bp: 1200, q: 0.4, dur: 0.07, soft: true },
  t: { k: 'burst', hp: 3000, dur: 0.03 }, d: { k: 'burst', hp: 2500, dur: 0.025, voiced: true }, k: { k: 'burst', bp: 1800, q: 1.5, dur: 0.04 },
  g: { k: 'burst', bp: 1500, q: 1.5, dur: 0.03, voiced: true }, p: { k: 'burst', bp: 700, q: 1, dur: 0.03 }, b: { k: 'burst', bp: 600, q: 1, dur: 0.025, voiced: true },
  m: { k: 'nasal', f: [250, 1000, 2200], dur: 0.08 }, n: { k: 'nasal', f: [250, 1450, 2500], dur: 0.07 }, ng: { k: 'nasal', f: [250, 1200, 2300], dur: 0.09 },
  l: { k: 'glide', f: [350, 1100, 2600], dur: 0.07 }, r: { k: 'glide', f: [400, 1200, 1600], dur: 0.08 }, w: { k: 'glide', f: [300, 700, 2200], dur: 0.07 },
  y: { k: 'glide', f: [270, 2200, 3000], dur: 0.06 },
};
const DIGRAPHS = ['sh', 'ch', 'th', 'ng', 'ph', 'wh', 'ck', 'qu'];
const SPELL = { ph: 'f', wh: 'w', ck: 'k', qu: 'kw', c: 'k', x: 'ks', q: 'k' };

// split a syllable into [onset consonants], vowel path, [coda consonants]
function parse(syl) {
  if (/\s/.test(syl.trim())) {   // given as sounds
    const u = syl.trim().toLowerCase().split(/\s+/);
    const v0 = u.findIndex((x) => VOWELS[x]);
    if (v0 < 0) return { onset: u.filter((x) => CONS[x]), vowel: ['uh'], coda: [] };
    let v1 = v0; while (v1 + 1 < u.length && VOWELS[u[v1 + 1]]) v1++;
    return { onset: u.slice(0, v0).filter((x) => CONS[x]), vowel: u.slice(v0, v1 + 1), coda: u.slice(v1 + 1).filter((x) => CONS[x]) };
  }
  const s = syl.toLowerCase().replace(/[^a-z']/g, '').replace(/'/g, '');
  let i = 0; const units = [];
  while (i < s.length) {
    const two = s.slice(i, i + 2);
    if (DIGRAPHS.includes(two)) { units.push(SPELL[two] || two); i += 2; } else { units.push(SPELL[s[i]] || s[i]); i += 1; }
  }
  const flat = units.flatMap((u) => (u.length > 1 && !CONS[u] ? u.split('') : [u]));
  const isV = (u) => /^[aeiou]$/.test(u);
  let v0 = flat.findIndex(isV); if (v0 < 0) { v0 = flat.findIndex((u) => u === 'y'); }
  if (v0 < 0) return { onset: flat, vowel: ['uh'], coda: [] };
  let v1 = v0; while (v1 + 1 < flat.length && isV(flat[v1 + 1])) v1++;
  const vs = flat.slice(v0, v1 + 1).join('');
  let path;
  if (DIPH[vs]) path = DIPH[vs];
  else if (vs.length >= 2 && DIPH[vs.slice(0, 2)]) path = DIPH[vs.slice(0, 2)];
  else {
    const c = vs[0];
    const coda = flat.slice(v1 + 1);
    const openEnd = coda.length === 0;   // 'go', 'me', 'my' style long vowels at the end of a syllable
    path = c === 'a' ? [openEnd ? 'e' : 'ae'] : c === 'e' ? [openEnd ? 'i' : 'eh'] : c === 'i' ? [openEnd ? 'ah' : 'ih'] : c === 'o' ? [openEnd ? 'o' : 'aw'] : c === 'u' ? [openEnd ? 'u' : 'uh'] : ['ah'];
    if (c === 'a' && openEnd) path = ['e', 'i'];
    if (c === 'i' && openEnd) path = ['ah', 'i'];
    if (c === 'o' && openEnd) path = ['o', 'u'];
  }
  const vowelIsY = flat[v0] === 'y';
  if (vowelIsY) path = ['ah', 'i'];
  return { onset: flat.slice(0, v0).filter((u) => CONS[u]), vowel: path, coda: flat.slice(v1 + 1).filter((u) => CONS[u]) };
}

// ---------- filters ----------
class Reson {   // two-pole resonator, constant peak gain
  constructor() { this.y1 = 0; this.y2 = 0; this.set(500, 100); }
  set(f, bw) { const r = Math.exp(-Math.PI * bw / SR); this.a1 = -2 * r * Math.cos(2 * Math.PI * f / SR); this.a2 = r * r; this.g = (1 - r) * Math.sqrt(1 - 2 * r * Math.cos(4 * Math.PI * f / SR) + r * r) * 2; }
  run(x) { const y = this.g * x - this.a1 * this.y1 - this.a2 * this.y2; this.y2 = this.y1; this.y1 = y; return y; }
}
class Biquad {
  constructor() { this.x1 = this.x2 = this.y1 = this.y2 = 0; this.b0 = 1; this.b1 = this.b2 = this.a1 = this.a2 = 0; }
  hp(f, q = 0.7) { const w = 2 * Math.PI * f / SR, a = Math.sin(w) / (2 * q), c = Math.cos(w), a0 = 1 + a; this.b0 = (1 + c) / 2 / a0; this.b1 = -(1 + c) / a0; this.b2 = this.b0; this.a1 = -2 * c / a0; this.a2 = (1 - a) / a0; return this; }
  lp(f, q = 0.7) { const w = 2 * Math.PI * f / SR, a = Math.sin(w) / (2 * q), c = Math.cos(w), a0 = 1 + a; this.b0 = (1 - c) / 2 / a0; this.b1 = (1 - c) / a0; this.b2 = this.b0; this.a1 = -2 * c / a0; this.a2 = (1 - a) / a0; return this; }
  bp(f, q = 1) { const w = 2 * Math.PI * f / SR, a = Math.sin(w) / (2 * q), c = Math.cos(w), a0 = 1 + a; this.b0 = a / a0; this.b1 = 0; this.b2 = -a / a0; this.a1 = -2 * c / a0; this.a2 = (1 - a) / a0; return this; }
  run(x) { const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2; this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y; return y; }
}
let seed = 1234;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 - 0.5; };

// the glottal source: the slope of a Rosenberg pulse, a slow opening and a sharp closure, which is what makes it buzz
function glottal(phase) {
  const tp = 0.4, tn = 0.16;
  if (phase < tp) return Math.sin(Math.PI * phase / tp) * (tn / tp);   // scaled so the pulse has no dc
  if (phase < tp + tn) return -Math.sin(Math.PI * (phase - tp) / (2 * tn));
  return 0;
}

// ---------- the voice ----------
// plan the timeline first: each sung note becomes [consonant bursts][vowel glide][consonant bursts], legato into the next note
const notes = song.voice.map((n) => ({ m: midi(n.note), dur: n.beats * beat, syl: n.syl || 'ah' }));
const totalV = notes.reduce((a, n) => a + n.dur, 0);
const totalC = (song.chords || []).reduce((a, c) => a + c.beats * beat, 0);
const total = Math.max(totalV, totalC) + 1.5;
const N = Math.ceil(total * SR);
const voice = new Float64Array(N);

function renderVoice() {
  const res = [new Reson(), new Reson(), new Reson(), new Reson()];
  const asp = new Biquad().bp(2000, 0.5);
  let t0 = 0, phase = 0, lastF = [500, 1500, 2500], vib = 0, drift = 0, lastF0 = 0;
  const seg = (a, b, k) => a + (b - a) * k;
  for (let ni = 0; ni < notes.length; ni++) {
    const n = notes[ni], p = parse(n.syl), next = notes[ni + 1];
    const start = Math.floor(t0 * SR), end = Math.floor((t0 + n.dur) * SR);
    t0 += n.dur;
    if (n.m == null) { lastF = [500, 1500, 2500]; lastF0 = 0; continue; }
    // the vowel owns the middle of the note; onset consonants take the front, coda consonants the tail
    const onsetDur = Math.min(n.dur * 0.3, p.onset.reduce((a, c) => a + CONS[c].dur, 0));
    const codaDur = Math.min(n.dur * 0.25, p.coda.reduce((a, c) => a + CONS[c].dur, 0));
    const vStart = start + Math.floor(onsetDur * SR), vEnd = end - Math.floor(codaDur * SR);
    const f0 = hz(n.m) * Math.pow(2, -14 / 1200);   // a touch flat, the way the old vocoders sang
    const vowelF = p.vowel.map((v) => VOWELS[v] || VOWELS.ah);
    const legato = !!next && next.m != null && p.coda.length === 0;
    // onset consonants
    let c0 = start;
    for (const c of p.onset) { const d = Math.floor(CONS[c].dur * SR); consonant(c, c0, Math.min(c0 + d, vStart), f0, lastF); c0 += d; }
    // the vowel
    for (let i = vStart; i < vEnd; i++) {
      const k = (i - vStart) / Math.max(1, vEnd - vStart);
      const at = k * (vowelF.length - 1), j = Math.min(vowelF.length - 2, Math.floor(at)), kk = vowelF.length > 1 ? at - j : 0;
      const target = vowelF.length > 1 ? vowelF[j].map((f, x) => seg(f, vowelF[j + 1][x], kk)) : vowelF[0];
      // glide in from the last mouth shape over the first 40 ms
      const gi = Math.min(1, (i - vStart) / (0.04 * SR));
      const F = target.map((f, x) => seg(lastF[x], f, gi));
      if (i === vEnd - 1) lastF = target.slice();
      // pitch: slow vibrato plus a random walk, scaled by --wobble
      vib += 2 * Math.PI * 5.4 / SR; drift += rnd() * 0.002; drift *= 0.9995;
      // slur in from the previous note over 70 ms, or scoop up from below after a breath
      const gl = Math.min(1, (i - vStart) / (0.07 * SR));
      const from = lastF0 || f0 * Math.pow(2, -40 / 1200);
      const cents = WOBBLE * (18 * Math.sin(vib) + 60 * drift);
      const f = seg(from, f0, gl) * Math.pow(2, cents / 1200);
      phase += f / SR; if (phase >= 1) phase -= 1;
      const dsrc = glottal(phase);   // the formants carve the buzz into a vowel
      const breath = asp.run(rnd()) * 0.08;
      let y = 0;
      for (let x = 0; x < 3; x++) { res[x].set(F[x], BW[x]); y += res[x].run(dsrc) * (x === 0 ? 1 : x === 1 ? 0.85 : 0.5); }
      res[3].set(3300, BW[3]); y += res[3].run(dsrc) * 0.2;
      y += breath;
      // envelope: fast in, held, and a short release unless the next note is tied straight on
      const a = Math.min(1, (i - vStart) / (0.02 * SR)), r = legato ? 1 : Math.min(1, (vEnd - i) / (0.05 * SR));
      voice[i] += y * a * r * 0.9;
    }
    lastF0 = legato ? f0 : 0;
    // coda consonants
    let c1 = vEnd;
    for (const c of p.coda) { const d = Math.floor(CONS[c].dur * SR); consonant(c, c1, Math.min(c1 + d, end), f0, lastF); c1 += d; }
  }
}

function consonant(c, s, e, f0, mouth) {
  const spec = CONS[c]; if (!spec || e <= s) return;
  const filt = spec.hp ? new Biquad().hp(spec.hp, 0.7) : new Biquad().bp(spec.bp, spec.q || 1);
  const len = e - s;
  if (spec.k === 'noise' || spec.k === 'burst') {
    const amp = spec.k === 'burst' ? 1.2 : spec.soft ? 0.4 : 0.75;
    let phase = 0;
    for (let i = s; i < e; i++) {
      const k = (i - s) / len;
      const env = spec.k === 'burst' ? Math.exp(-k * 9) : Math.sin(Math.PI * k);
      let x = filt.run(rnd() * 2) * amp * env;
      if (spec.voiced) { phase += f0 / SR; if (phase >= 1) phase -= 1; x += (phase < 0.3 ? 0.25 : -0.05) * env * 0.35; }
      voice[i] += x;
    }
  } else {   // nasal or glide: the voice keeps humming through a different mouth shape
    const res = [new Reson(), new Reson(), new Reson()];
    let phase = 0;
    for (let i = s; i < e; i++) {
      const k = (i - s) / len, F = spec.f.map((f, x) => mouth[x] + (f - mouth[x]) * Math.sin(Math.PI * k));
      phase += f0 / SR; if (phase >= 1) phase -= 1;
      const src = glottal(phase);
      let y = 0;
      for (let x = 0; x < 3; x++) { res[x].set(F[x], BW[x] * (spec.k === 'nasal' ? 1.6 : 1)); y += res[x].run(src) * (x === 0 ? 1 : 0.4); }
      voice[i] += y * (spec.k === 'nasal' ? 0.45 : 0.7);
    }
  }
}

// ---------- the band: a small organ and a soft bass ----------
const band = new Float64Array(N);
function renderBand() {
  let t0 = 0;
  const lp = new Biquad().lp(1800, 0.6), blp = new Biquad().lp(300, 0.7);
  for (const ch of song.chords || []) {
    const dur = ch.beats * beat, s = Math.floor(t0 * SR), e = Math.floor((t0 + dur) * SR); t0 += dur;
    const ms = ch.notes.map(midi).filter((m) => m != null); if (!ms.length) continue;
    const ph = ms.map(() => 0), ph2 = ms.map(() => 0);
    const bass = hz(Math.min(...ms) - 12); let bp = 0;
    for (let i = s; i < e; i++) {
      const k = (i - s) / (e - s), env = Math.min(1, (i - s) / (0.03 * SR)) * Math.min(1, (e - i) / (0.08 * SR));
      let y = 0;
      for (let j = 0; j < ms.length; j++) {
        const f = hz(ms[j]);
        ph[j] += f / SR; if (ph[j] >= 1) ph[j] -= 1;
        ph2[j] += f * 1.003 / SR; if (ph2[j] >= 1) ph2[j] -= 1;
        y += (ph[j] < 0.5 ? 1 : -1) * 0.5 + (1 - 4 * Math.abs(ph2[j] - 0.5)) * 0.7;   // square and a slightly detuned triangle
      }
      y = lp.run(y / ms.length) * 0.22 * env;
      bp += bass / SR; if (bp >= 1) bp -= 1;
      y += blp.run(1 - 4 * Math.abs(bp - 0.5)) * 0.35 * env * (0.6 + 0.4 * Math.max(0, 1 - k * 2));
      band[i] += y;
    }
  }
}

renderVoice(); renderBand();

// ---------- mix, tape speed, write ----------
// the voice is normalised to its peak; the band is set by loudness, about 5 dB under it
let mix = new Float64Array(N);
let pk = 0, sv = 0, sb = 0;
for (let i = 0; i < N; i++) { pk = Math.max(pk, Math.abs(voice[i])); sv += voice[i] * voice[i]; sb += band[i] * band[i]; }
const vg = pk > 0 ? 0.6 / pk : 1;
const bg = sb > 0 && sv > 0 ? Math.sqrt(sv / sb) * vg * 0.55 : 1;
for (let i = 0; i < N; i++) mix[i] = voice[i] * vg * VOICE + band[i] * bg * BAND;
if (SLOW !== 1) {   // resample: slower playback drops the pitch with it
  const M = Math.floor(N / SLOW), out = new Float64Array(M);
  for (let i = 0; i < M; i++) { const p = i * SLOW, j = Math.floor(p), k = p - j; out[i] = (mix[j] || 0) * (1 - k) + (mix[j + 1] || 0) * k; }
  mix = out;
}
// a little room: a short slapback and a soft limiter
const d = Math.floor(0.09 * SR);
for (let i = d; i < mix.length; i++) mix[i] += mix[i - d] * 0.18;
const pcm = Buffer.alloc(mix.length * 4);
for (let i = 0; i < mix.length; i++) {
  const v = Math.tanh(mix[i] * 1.3) * 0.95, s = Math.max(-1, Math.min(1, v)) * 32767;
  pcm.writeInt16LE(s | 0, i * 4); pcm.writeInt16LE((s * 0.96) | 0, i * 4 + 2);
}
const hdr = Buffer.alloc(44);
hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + pcm.length, 4); hdr.write('WAVE', 8); hdr.write('fmt ', 12); hdr.writeUInt32LE(16, 16);
hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(2, 22); hdr.writeUInt32LE(SR, 24); hdr.writeUInt32LE(SR * 4, 28); hdr.writeUInt16LE(4, 32); hdr.writeUInt16LE(16, 34);
hdr.write('data', 36); hdr.writeUInt32LE(pcm.length, 40);
fs.writeFileSync(OUT, Buffer.concat([hdr, pcm]));
console.log(`${OUT}: ${(mix.length / SR).toFixed(1)} s, ${notes.length} notes`);
