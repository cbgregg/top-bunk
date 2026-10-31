#!/usr/bin/env node
// Placeholder trailer music: an original slow lullaby (72 bpm, D major) for a music box and a Rhodes-style electric piano, over a vinyl-crackle bed.
// Pure Node, no dependencies: every sound is an oscillator and an envelope written straight into a 16-bit stereo WAV.
// It is 2:19 long and its sections follow the shape of the recording the cut was timed to (intro 0:00-0:08, verse 0:08-0:32, verse 0:32-0:56,
// bridge 0:56-1:20, verse 1:20-1:48, outro 1:48-2:19), so a licensed track drops into the same cue sheet unchanged.
// The melody and the chord sequence are written here.
// Also writes the small original sound effects the cue sheets use: footsteps, breathing, TV snow, a heartbeat, creaks, a door latch, a relay,
// the camcorder's zoom motor, rewind and handling, a gasp, the set switching off, the camera hitting the floor, one music-box note (the list at the end).
//   node trailer/gen_music.js            -> trailer/music/placeholder.wav (+ the sfx)
//   node trailer/gen_music.js --out DIR  -> somewhere else
'use strict';
const fs = require('fs'), path = require('path');

const SR = 44100, LEN = 139.0, BPM = 72, BEAT = 60 / BPM;
const args = process.argv.slice(2), argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const OUT = path.resolve(argOf('--out', path.join(__dirname, 'music')));
fs.mkdirSync(OUT, { recursive: true });

// ---------- a tiny seeded random, so every run writes the same file ----------
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const R = rng(2002);

// ---------- buffers ----------
class Buf {
  constructor(sec) { this.n = Math.ceil(sec * SR); this.L = new Float64Array(this.n); this.R = new Float64Array(this.n); }
  // add a mono signal at t0 with a pan (-1..1) and gain
  add(sig, t0, gain = 1, pan = 0) {
    const i0 = Math.round(t0 * SR), gl = gain * Math.cos((pan + 1) * Math.PI / 4), gr = gain * Math.sin((pan + 1) * Math.PI / 4);
    for (let i = 0; i < sig.length; i++) { const j = i0 + i; if (j < 0 || j >= this.n) continue; this.L[j] += sig[i] * gl; this.R[j] += sig[i] * gr; }
  }
  addStereo(l, r, t0, gain = 1) {
    const i0 = Math.round(t0 * SR);
    for (let i = 0; i < l.length; i++) { const j = i0 + i; if (j < 0 || j >= this.n) continue; this.L[j] += l[i] * gain; this.R[j] += r[i] * gain; }
  }
}
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
const n2m = (s) => { const m = /^([A-G]#?)(-?\d)$/.exec(s); return NOTE[m[1]] + (parseInt(m[2], 10) + 1) * 12; };

// ---------- filters ----------
function onePoleLP(sig, fc) { const a = 1 - Math.exp(-2 * Math.PI * fc / SR); let y = 0; const out = new Float64Array(sig.length); for (let i = 0; i < sig.length; i++) { y += a * (sig[i] - y); out[i] = y; } return out; }
function onePoleHP(sig, fc) { const lp = onePoleLP(sig, fc), out = new Float64Array(sig.length); for (let i = 0; i < sig.length; i++) out[i] = sig[i] - lp[i]; return out; }
function biquadBP(sig, f0, q) {   // RBJ band-pass (constant 0 dB peak)
  const w = 2 * Math.PI * f0 / SR, al = Math.sin(w) / (2 * q), b0 = al, b2 = -al, a0 = 1 + al, a1 = -2 * Math.cos(w), a2 = 1 - al;
  const out = new Float64Array(sig.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < sig.length; i++) { const x = sig[i], y = (b0 * x + b2 * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = x; y2 = y1; y1 = y; out[i] = y; }
  return out;
}
// a small room: four short feedback delays mixed in at `wet`
function room(sig, wet = 0.18, size = 1) {
  const taps = [0.0297, 0.0371, 0.0411, 0.0437].map((t) => Math.round(t * size * SR)), fb = 0.62, out = new Float64Array(sig.length + Math.round(0.6 * SR));
  const lines = taps.map((t) => new Float64Array(t)), idx = taps.map(() => 0);
  for (let i = 0; i < out.length; i++) {
    const x = i < sig.length ? sig[i] : 0; let acc = 0;
    for (let k = 0; k < 4; k++) { const d = lines[k], j = idx[k], y = d[j]; d[j] = x + y * fb; idx[k] = (j + 1) % d.length; acc += y; }
    out[i] = x + onePoleLPsample(acc * 0.25) * wet;
  }
  return out;
}
const onePoleLPsample = (() => { let y = 0; const a = 1 - Math.exp(-2 * Math.PI * 3200 / SR); return (x) => { y += a * (x - y); return y; }; })();

// ---------- envelopes ----------
const env = (n, a, d, s, r, hold) => {   // ADSR in seconds; hold = note length in samples before the release starts
  const out = new Float64Array(n), A = Math.max(1, a * SR), D = Math.max(1, d * SR), Rr = Math.max(1, r * SR);
  for (let i = 0; i < n; i++) {
    let v = i < A ? i / A : i < A + D ? 1 - (1 - s) * ((i - A) / D) : s;
    if (i > hold) v *= Math.max(0, 1 - (i - hold) / Rr);
    out[i] = v;
  }
  return out;
};

// ---------- instruments ----------
// electric piano: a sine carrier with a 1:1 FM "tine" that decays quickly, a soft second harmonic, and the slow stereo tremolo of a suitcase amp
function rhodes(f, dur, vel = 0.5, detune = 0) {
  const n = Math.ceil((dur + 1.2) * SR), e = env(n, 0.004, 0.9, 0.42, 1.1, dur * SR), out = new Float64Array(n);
  const fr = f * Math.pow(2, detune / 1200), w = 2 * Math.PI * fr / SR;
  for (let i = 0; i < n; i++) {
    const t = i / SR, tine = Math.exp(-t * 6.5) * (1.6 + vel * 1.2), mod = Math.sin(w * i) * tine;
    out[i] = (Math.sin(w * i + mod) + 0.18 * Math.sin(2 * w * i + mod * 0.5) * Math.exp(-t * 2.5)) * e[i] * vel;
  }
  return onePoleLP(out, 5200);
}
// music box: a bright inharmonic bell with a tiny click, decaying over a second or so
function musicbox(f, vel = 0.5) {
  const n = Math.ceil(2.2 * SR), out = new Float64Array(n), parts = [[1, 1, 1.3], [2.76, 0.32, 0.55], [5.4, 0.13, 0.3], [8.93, 0.05, 0.18]];
  for (const [ratio, g, tau] of parts) { const w = 2 * Math.PI * f * ratio / SR; for (let i = 0; i < n; i++) out[i] += Math.sin(w * i) * g * Math.exp(-i / SR / tau); }
  for (let i = 0; i < 60; i++) out[i] += (R() - 0.5) * 0.3 * (1 - i / 60);   // the hammer
  for (let i = 0; i < 40; i++) out[i] *= i / 40;
  for (let i = 0; i < n; i++) out[i] *= vel * 0.5;
  return onePoleHP(out, 300);
}
// bass: a sine with a little triangle on top, slow in and out
function bass(f, dur, vel = 0.5) {
  const n = Math.ceil((dur + 0.5) * SR), e = env(n, 0.03, 0.4, 0.8, 0.45, dur * SR), out = new Float64Array(n), w = 2 * Math.PI * f / SR;
  for (let i = 0; i < n; i++) { const ph = (w * i / (2 * Math.PI)) % 1, tri = 4 * Math.abs(ph - 0.5) - 1; out[i] = (Math.sin(w * i) + 0.15 * tri) * e[i] * vel; }
  return onePoleLP(out, 400);
}
// a warm pad under the later verses: two detuned triangles through a lazy low-pass
function pad(f, dur, vel = 0.2) {
  const n = Math.ceil((dur + 1.5) * SR), e = env(n, 1.2, 0.5, 0.9, 1.4, dur * SR), out = new Float64Array(n);
  for (const dt of [-6, 5]) { const w = 2 * Math.PI * f * Math.pow(2, dt / 1200) / SR; for (let i = 0; i < n; i++) { const ph = (w * i / (2 * Math.PI)) % 1; out[i] += (4 * Math.abs(ph - 0.5) - 1) * 0.5; } }
  for (let i = 0; i < n; i++) out[i] *= e[i] * vel;
  return onePoleLP(onePoleLP(out, 900), 900);
}

// ---------- the bed: a record turning ----------
function vinyl(sec) {
  const n = Math.ceil(sec * SR), L = new Float64Array(n), Rr = new Float64Array(n);
  // hiss, swelling and sinking once per turn of the record (33 1/3 rpm)
  let hL = 0, hR = 0; const a = 1 - Math.exp(-2 * Math.PI * 2800 / SR);
  for (let i = 0; i < n; i++) { hL += a * ((R() - 0.5) - hL); hR += a * ((R() - 0.5) - hR); const wow = 1 + 0.22 * Math.sin(2 * Math.PI * 0.556 * i / SR); L[i] = hL * 0.012 * wow; Rr[i] = hR * 0.012 * wow; }
  // crackle: little clicks a few times a second, and now and then a real pop
  let i = 0;
  while (i < n) {
    i += Math.round(-Math.log(1 - R()) * SR / 14);
    const big = R() < 0.045, amp = (big ? 0.35 : 0.08) * Math.pow(R(), 1.6), len = big ? 40 + R() * 160 : 6 + R() * 30, pan = R() * 2 - 1, sgn = R() < 0.5 ? -1 : 1;
    for (let k = 0; k < len && i + k < n; k++) { const v = sgn * amp * Math.exp(-k / len * 4) * (k < 3 ? k / 3 : 1); L[i + k] += v * (1 - pan) * 0.5; Rr[i + k] += v * (1 + pan) * 0.5; }
  }
  // rumble from the motor
  for (let k = 0; k < n; k++) { const v = Math.sin(2 * Math.PI * 31 * k / SR) * 0.006; L[k] += v; Rr[k] += v; }
  return [onePoleLP(L, 6500), onePoleLP(Rr, 6500)];
}

// ---------- the piece ----------
// chord voicings (middle register, for the Rhodes) and roots (for the bass)
const CH = {
  Dmaj7: ['D3', 'A3', 'C#4', 'F#4'], Gmaj7: ['G2', 'D3', 'B3', 'F#4'], 'F#m7': ['F#2', 'C#3', 'A3', 'E4'], Bm7: ['B2', 'F#3', 'A3', 'D4'],
  Em7: ['E2', 'B2', 'D3', 'G3'], A7sus: ['A2', 'E3', 'G3', 'D4'], A7: ['A2', 'E3', 'G3', 'C#4'], G6: ['G2', 'D3', 'E3', 'B3'], 'D/F#': ['F#2', 'A3', 'D4', 'F#4'],
  Gm6: ['G2', 'D3', 'E3', 'A#3'],   // the one borrowed chord, for the bridge
};
const ROOT = { Dmaj7: 'D2', Gmaj7: 'G1', 'F#m7': 'F#1', Bm7: 'B1', Em7: 'E1', A7sus: 'A1', A7: 'A1', G6: 'G1', 'D/F#': 'F#1', Gm6: 'G1' };

// sections: start (s), chords [name, beats], melody [note, startBeat, beats, vel], and what plays
const SECTIONS = [
  { t: 0, name: 'intro', chords: [], bass: false, pad: false,
    melody: [['A5', 2.4, 1.5, 0.6], ['F#5', 3.9, 1, 0.5], ['D5', 4.9, 1.6, 0.55], ['E5', 6.6, 0.9, 0.45], ['F#5', 7.5, 1.2, 0.5]],
    swell: ['Dmaj7', 5.2, 4] },
  { t: 8, name: 'verse1', bass: false, pad: false,
    chords: [['Dmaj7', 4], ['Gmaj7', 4], ['F#m7', 4], ['Bm7', 4], ['Gmaj7', 4], ['Em7', 4], ['A7sus', 4]],
    melody: [['A5', 0, 2, 0.65], ['F#5', 2, 1, 0.5], ['G5', 3, 1, 0.5], ['A5', 4, 2.5, 0.6], ['B5', 6.5, 1.5, 0.5],
      ['C#6', 8, 2, 0.6], ['A5', 10, 1, 0.5], ['F#5', 11, 1, 0.45], ['D5', 12, 3, 0.55], ['E5', 15, 1, 0.45],
      ['F#5', 16, 2, 0.55], ['G5', 18, 1, 0.5], ['A5', 19, 1, 0.5], ['B5', 20, 2.5, 0.6], ['A5', 22.5, 1.5, 0.5],
      ['G5', 24, 2, 0.55], ['E5', 26, 2, 0.5]] },
  { t: 32, name: 'verse2', bass: true, pad: false,
    chords: [['Dmaj7', 4], ['Bm7', 4], ['Em7', 4], ['A7sus', 4], ['D/F#', 4], ['Gmaj7', 4], ['A7', 4]],
    melody: [['F#5', 0, 1.5, 0.6], ['A5', 1.5, 1.5, 0.55], ['D6', 3, 3, 0.65], ['C#6', 6, 2, 0.55],
      ['B5', 8, 2, 0.6], ['A5', 10, 1, 0.5], ['G5', 11, 1, 0.5], ['F#5', 12, 2.5, 0.55], ['E5', 14.5, 1.5, 0.45],
      ['D5', 16, 2, 0.55], ['F#5', 18, 1, 0.5], ['A5', 19, 1, 0.5], ['D6', 20, 3, 0.6], ['B5', 23, 1, 0.5],
      ['A5', 24, 2, 0.55], ['G5', 26, 1, 0.45], ['E5', 27, 1, 0.45]] },
  { t: 56, name: 'bridge', bass: true, pad: true,
    chords: [['Gmaj7', 4], ['Gm6', 4], ['Dmaj7', 4], ['Bm7', 4], ['Em7', 4], ['G6', 4], ['A7sus', 4]],
    melody: [['B5', 0, 2, 0.6], ['D6', 2, 2, 0.55], ['A#5', 4, 3, 0.6], ['G5', 7, 1, 0.45],
      ['F#5', 8, 2, 0.55], ['A5', 10, 2, 0.5], ['D6', 12, 2.5, 0.6], ['B5', 14.5, 1.5, 0.5],
      ['G5', 16, 2, 0.55], ['B5', 18, 2, 0.5], ['E5', 20, 2, 0.55], ['G5', 22, 1, 0.45], ['A5', 23, 1, 0.5],
      ['E5', 24, 3, 0.55], ['D5', 27, 1, 0.4]] },
  { t: 80, name: 'verse3', bass: true, pad: true,
    chords: [['Dmaj7', 4], ['Gmaj7', 4], ['F#m7', 4], ['Bm7', 4], ['Gmaj7', 4], ['Em7', 4], ['A7sus', 4], ['A7', 4]],
    melody: [['A5', 0, 2, 0.65], ['F#5', 2, 1, 0.5], ['G5', 3, 1, 0.5], ['A5', 4, 2.5, 0.6], ['B5', 6.5, 1.5, 0.5],
      ['C#6', 8, 2, 0.6], ['A5', 10, 1, 0.5], ['F#5', 11, 1, 0.45], ['D5', 12, 3, 0.55], ['E5', 15, 1, 0.45],
      ['F#5', 16, 2, 0.55], ['G5', 18, 1, 0.5], ['A5', 19, 1, 0.5], ['B5', 20, 2.5, 0.6], ['A5', 22.5, 1.5, 0.5],
      ['G5', 24, 2, 0.55], ['E5', 26, 1, 0.45], ['F#5', 27, 1, 0.45], ['G5', 28, 2, 0.5], ['C#6', 30, 3, 0.55]] },
  { t: 108, name: 'outro', bass: true, pad: false,
    chords: [['Dmaj7', 6], ['Gmaj7', 6], ['Dmaj7', 8], ['Gmaj7', 6], ['Dmaj7', 12]],
    melody: [['D6', 0, 2, 0.6], ['A5', 2, 1, 0.5], ['F#5', 3, 3, 0.5], ['E5', 6.5, 1.5, 0.45], ['D5', 8, 4, 0.5],
      ['F#5', 13, 1.5, 0.45], ['A5', 14.5, 1.5, 0.45], ['D6', 16, 4, 0.5],
      ['A5', 22, 2, 0.4], ['F#5', 24.5, 2, 0.35], ['D5', 27, 4, 0.35], ['D6', 31, 4, 0.3]] },
];

function render() {
  const mix = new Buf(LEN + 2);
  const [vl, vr] = vinyl(LEN + 2); mix.addStereo(vl, vr, 0, 1);
  const hum = () => (R() - 0.5) * 0.024;   // up to 12 ms of timing jitter per chord
  for (const S of SECTIONS) {
    let b = 0;
    for (const [name, beats] of S.chords) {
      const t = S.t + b * BEAT, dur = beats * BEAT;
      CH[name].forEach((nn, i) => mix.add(rhodes(midi(n2m(nn)), dur, 0.26 - i * 0.02, (R() - 0.5) * 6), t + hum() + i * 0.012, 1, -0.25 + i * 0.16));
      if (S.bass) mix.add(bass(midi(n2m(ROOT[name])), dur * 0.95, 0.5), t + hum(), 1, 0);
      if (S.pad) for (const nn of CH[name].slice(1, 3)) mix.add(pad(midi(n2m(nn)), dur, 0.11), t, 1, nn.includes('#') ? 0.3 : -0.3);
      b += beats;
    }
    if (S.swell) { const [name, at, beats] = S.swell; CH[name].forEach((nn, i) => mix.add(rhodes(midi(n2m(nn)), beats * BEAT, 0.22), S.t + at + i * 0.08, 1, -0.2 + i * 0.13)); }
    for (const [nn, at, beats, vel] of S.melody) {
      const t = S.t + at * BEAT + hum(), f = midi(n2m(nn));
      mix.add(musicbox(f, vel), t, 1, 0.35);
      if (S.name !== 'intro') mix.add(rhodes(f / 2, beats * BEAT * 0.9, vel * 0.3), t + 0.01, 1, -0.1);   // the Rhodes hums the tune an octave down
    }
  }
  // the stereo tremolo of the amp over the keyboard parts (and a touch over everything: it is all coming off one record)
  for (let i = 0; i < mix.n; i++) { const tr = 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.9 * i / SR); mix.L[i] *= 0.86 + 0.14 * tr; mix.R[i] *= 0.86 + 0.14 * (1 - tr); }
  // warmth: everything over 7 kHz rolls off, and a soft tape squash
  let L = onePoleLP(mix.L, 7000), Rr = onePoleLP(mix.R, 7000);
  for (let i = 0; i < L.length; i++) { L[i] = Math.tanh(L[i] * 1.6) / 1.6; Rr[i] = Math.tanh(Rr[i] * 1.6) / 1.6; }
  // fade the tail out so it ends at exactly 2:19 (the last chord is still ringing)
  const n = Math.round(LEN * SR), fadeN = Math.round(4 * SR);
  for (let i = n - fadeN; i < n; i++) { const g = (n - i) / fadeN; L[i] *= g; Rr[i] *= g; }
  for (let i = 0; i < Math.round(0.05 * SR); i++) { L[i] *= i / (0.05 * SR); Rr[i] *= i / (0.05 * SR); }
  return normalize(L.subarray(0, n), Rr.subarray(0, n), 0.89);
}
function normalize(L, Rr, peak) {
  let m = 1e-9; for (let i = 0; i < L.length; i++) m = Math.max(m, Math.abs(L[i]), Math.abs(Rr[i]));
  const g = peak / m; for (let i = 0; i < L.length; i++) { L[i] *= g; Rr[i] *= g; }
  return [L, Rr];
}
function writeWav(file, L, Rr) {
  const n = L.length, data = Buffer.alloc(n * 4), hdr = Buffer.alloc(44);
  for (let i = 0; i < n; i++) { data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i])) * 32767), i * 4); data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, Rr[i])) * 32767), i * 4 + 2); }
  hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + data.length, 4); hdr.write('WAVE', 8); hdr.write('fmt ', 12); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(2, 22);
  hdr.writeUInt32LE(SR, 24); hdr.writeUInt32LE(SR * 4, 28); hdr.writeUInt16LE(4, 32); hdr.writeUInt16LE(16, 34); hdr.write('data', 36); hdr.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([hdr, data]));
  console.log('wrote', path.relative(process.cwd(), file), (n / SR).toFixed(2) + ' s');
}

// ---------- the small effects ----------
function noise(n) { const o = new Float64Array(n); for (let i = 0; i < n; i++) o[i] = R() * 2 - 1; return o; }
function thump(f0, f1, dur, gain) {   // a heavy footfall: a pitch-dropping sine and a dull burst of noise
  const n = Math.ceil(dur * SR), out = new Float64Array(n); let ph = 0;
  for (let i = 0; i < n; i++) { const k = i / n, f = f0 * Math.pow(f1 / f0, k); ph += 2 * Math.PI * f / SR; out[i] = Math.sin(ph) * Math.exp(-k * 6) * gain; }
  const nz = onePoleLP(noise(n), 420); for (let i = 0; i < n; i++) out[i] += nz[i] * Math.exp(-i / n * 14) * gain * 0.9;
  return out;
}
function steps(count, gap, heavy) {
  const b = new Buf(count * gap + 2);
  for (let i = 0; i < count; i++) {
    const t = i * gap + (R() - 0.5) * 0.04, g = heavy ? 0.9 : 0.55;
    b.add(room(thump(heavy ? 72 : 95, heavy ? 28 : 45, heavy ? 0.32 : 0.16, g), 0.22, heavy ? 1.3 : 0.8), t, 1, Math.sin(i * 1.3) * 0.5);
    if (!heavy) b.add(onePoleHP(thump(2600, 1200, 0.025, 0.3), 1500), t + 0.055, 1, 0);   // the toe after the heel
  }
  return normalize(b.L, b.R, 0.8);
}
function breathing(sec) {
  const b = new Buf(sec + 1), cyc = 3.1;
  for (let t = 0; t < sec; t += cyc) {
    for (const [off, len, f, g] of [[0, 1.2, 950, 0.5], [1.45, 1.5, 620, 0.55]]) {
      const n = Math.ceil(len * SR), sig = biquadBP(noise(n), f, 0.9);
      for (let i = 0; i < n; i++) sig[i] *= Math.sin(Math.PI * i / n) ** 1.6 * g;
      b.add(sig, t + off, 1, 0);
    }
  }
  return normalize(b.L, b.R, 0.6);
}
function tvSnow(sec) {
  const n = Math.ceil(sec * SR), L = onePoleHP(noise(n), 1800), Rr = onePoleHP(noise(n), 1800);
  for (let i = 0; i < n; i++) { const t = i / SR, bar = 0.75 + 0.25 * Math.sin(2 * Math.PI * 0.37 * t), buzz = Math.sin(2 * Math.PI * 60 * t) * 0.08 * (1 + 0.5 * Math.sin(2 * Math.PI * 120 * t)); L[i] = L[i] * 0.5 * bar + buzz; Rr[i] = Rr[i] * 0.5 * bar + buzz; }
  const fade = Math.round(0.3 * SR); for (let i = 0; i < fade; i++) { L[i] *= i / fade; Rr[i] *= i / fade; L[n - 1 - i] *= i / fade; Rr[n - 1 - i] *= i / fade; }
  return normalize(L, Rr, 0.7);
}

function heartbeat(sec, period) {   // lub-dub, fast: a scared kid's, felt more than heard
  const b = new Buf(sec + 1);
  for (let t = 0; t < sec; t += period) { b.add(onePoleLP(thump(58, 34, 0.14, 0.9), 180), t, 1, 0); b.add(onePoleLP(thump(52, 30, 0.12, 0.6), 160), t + 0.17, 1, 0); }
  return normalize(b.L, b.R, 0.8);
}
function latch() {   // a door pulled shut close by: the leaf hitting the stop, the bolt clicking into the strike
  const b = new Buf(1.5);
  b.add(room(thump(110, 55, 0.22, 0.9), 0.2, 0.9), 0, 1, 0);
  b.add(onePoleHP(thump(3200, 1800, 0.018, 0.5), 1400), 0.012, 1, 0); b.add(onePoleHP(thump(2600, 1500, 0.02, 0.35), 1200), 0.06, 1, 0);
  return normalize(b.L, b.R, 0.85);
}

// ---------- the portrait cut's room sounds: wood, hinges, the camcorder's own motor, a kid's breath ----------
// wood and hinges creak by stick-slip: the surfaces catch and let go in a train of little clicks, and the frame rings at its own resonances.
// rate(k) is the click rate in Hz and amp(k) the loudness over the sound (k from 0 to 1)
function stickSlip(dur, rate, amp, formants, q, jitter = 0.15) {
  const n = Math.ceil(dur * SR), exc = new Float64Array(n);
  let t = 0;
  while (t < dur) { const k = t / dur, i = Math.round(t * SR); if (i < n) exc[i] += amp(k) * (0.7 + R() * 0.6); t += (1 / rate(k)) * (1 + (R() - 0.5) * 2 * jitter); }
  const out = new Float64Array(n);
  for (const [f, g] of formants) { const b = biquadBP(exc, f, q); for (let i = 0; i < n; i++) out[i] += b[i] * g; }
  const nz = biquadBP(noise(n), formants[0][0] * 1.5, 1.5); for (let i = 0; i < n; i++) out[i] += nz[i] * amp(i / n) * 0.04;
  return out;
}
const hump = (a, b) => (k) => (k < a ? k / a : k > b ? Math.max(0, (1 - k) / (1 - b)) : 1);
function bedCreak() {   // the bunk's frame taking weight: low and woody, close
  const s = stickSlip(0.6, (k) => 70 + 80 * Math.sin(Math.PI * k) + 20 * Math.sin(k * 19), hump(0.15, 0.6), [[380, 1], [910, 0.7], [1750, 0.45], [2900, 0.2]], 7, 0.2);
  return monoNorm(room(s, 0.12, 0.7), 0.8);
}
function monoNorm(s, peak) { const [l, r] = normalize(Float64Array.from(s), Float64Array.from(s), peak); return [l, r]; }
function hingeCreak() {   // a door swinging slowly on a dry hinge: a rising, wavering squeal that tracks the swing
  const s = stickSlip(0.95, (k) => 170 + 230 * Math.pow(k, 0.7) + 40 * Math.sin(k * 23) + 25 * Math.sin(k * 61), hump(0.08, 0.75), [[720, 1], [1480, 0.8], [2600, 0.5], [3900, 0.25]], 11, 0.08);
  return monoNorm(room(s, 0.22, 1.1), 0.75);
}
function floorCreak() {   // a floorboard giving under something heavy
  const s = stickSlip(0.5, (k) => 48 + 40 * k + 10 * Math.sin(k * 13), hump(0.2, 0.55), [[240, 1], [610, 0.6], [1250, 0.3]], 6, 0.25);
  return monoNorm(room(s, 0.2, 1.2), 0.75);
}
function relay() {   // a night light's relay dropping out: a hard double click with a metal ring
  const b = new Buf(0.4);
  for (const [t0, g] of [[0, 1], [0.011, 0.6]]) {
    const n = Math.round(0.03 * SR), s = new Float64Array(n);
    for (let i = 0; i < n; i++) { const t = i / SR; s[i] = (Math.sin(2 * Math.PI * 3300 * t) * 0.6 + Math.sin(2 * Math.PI * 5200 * t) * 0.3) * Math.exp(-t * 260) + (i < 90 ? (R() - 0.5) * (1 - i / 90) : 0); }
    b.add(onePoleHP(s, 900), t0, g, 0);
  }
  b.add(onePoleLP(thump(140, 70, 0.04, 0.5), 600), 0, 1, 0);
  return normalize(b.L, b.R, 0.85);
}
function zoomMotor(sec) {   // the camcorder's zoom motor, picked up by its own mic: a thin whine and the gears under it
  const n = Math.ceil(sec * SR), out = new Float64Array(n), gears = biquadBP(noise(n), 2900, 3);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, f = 1150 + 30 * Math.sin(2 * Math.PI * 7 * t); ph += 2 * Math.PI * f / SR;
    const e = Math.min(1, t / 0.03, (sec - t) / 0.03);
    out[i] = (Math.sin(ph) * 0.35 + Math.sin(2 * ph) * 0.2 + Math.sin(3 * ph) * 0.08 + gears[i] * 0.9 * (0.6 + 0.4 * Math.sin(2 * Math.PI * 58 * t))) * e;
  }
  return monoNorm(out, 0.6);
}
function rewind(sec) {   // the tape winding back: a clunk, a rising whine with hiss on it, a clunk as it stops
  const n = Math.ceil(sec * SR), out = new Float64Array(n), hiss = onePoleHP(noise(n), 2500);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const k = i / n, f = 500 * Math.pow(5, Math.min(1, k * 1.3)); ph += 2 * Math.PI * f / SR;
    const saw = (ph / (2 * Math.PI)) % 1 * 2 - 1, e = Math.min(1, k / 0.06, (1 - k) / 0.05);
    out[i] = (saw * 0.22 + Math.sin(ph * 0.5) * 0.15 + hiss[i] * 0.25) * e;
  }
  const lp = onePoleLP(out, 6000), b = new Buf(sec + 0.3); b.add(lp, 0, 1, 0);
  b.add(onePoleLP(thump(160, 60, 0.07, 0.8), 1500), 0, 1, 0); b.add(onePoleLP(thump(180, 70, 0.06, 0.6), 1500), sec - 0.05, 1, 0);
  return normalize(b.L, b.R, 0.7);
}
function gasp() {   // a kid's sharp intake of breath, close to the mic
  const n = Math.ceil(0.42 * SR), a = biquadBP(noise(n), 1500, 1.1), c = biquadBP(noise(n), 3100, 1.6), out = new Float64Array(n);
  for (let i = 0; i < n; i++) { const t = i / SR, e = Math.min(1, t / 0.025) * Math.exp(-Math.max(0, t - 0.06) * 9); out[i] = (a[i] + c[i] * 0.6 + Math.sin(2 * Math.PI * (310 + 60 * t) * t) * 0.08 * Math.exp(-t * 12)) * e; }
  return monoNorm(out, 0.8);
}
function pianoSlam() {   // a piano hammered at the bottom of the keys: a dissonant cluster let ring, a dead thump under it (mirrors Sound.pianoSlam in js/audio.js: keep the notes in step)
  const sec = 2.4, n = Math.ceil(sec * SR), out = new Float64Array(n);
  for (const f of [41.2, 43.7, 55, 58.3, 82.4, 87.3, 110, 116.5, 164.8, 174.6]) {
    for (let i = 0; i < n; i++) { const t = i / SR, tri = 2 / Math.PI * Math.asin(Math.sin(2 * Math.PI * f * t)); out[i] += tri * 0.16 * Math.min(1, t / 0.002) * Math.exp(-t * 1.6); }
  }
  for (let i = 0; i < n; i++) { const t = i / SR; out[i] += Math.sin(2 * Math.PI * 36.7 * t * (1 - 0.1 * t)) * 0.5 * Math.exp(-t * 2.2); }
  const nz = onePoleLP(noise(n), 900); for (let i = 0; i < n; i++) { const t = i / SR; out[i] += nz[i] * 1.1 * Math.exp(-t * 12); }
  return monoNorm(room(out, 0.3, 1.2), 0.9);
}
function panicBreath(sec) {   // running, scared: quick ragged breaths with a voice in the out-breath
  const b = new Buf(sec + 1); let t = 0, k = 0;
  while (t < sec) {
    const cyc = 0.36 + R() * 0.12, inn = Math.ceil(0.15 * SR), out = Math.ceil(0.19 * SR);
    const si = biquadBP(noise(inn), 1700 + R() * 300, 1.2), so = biquadBP(noise(out), 950, 1.1);
    for (let i = 0; i < inn; i++) si[i] *= Math.sin(Math.PI * i / inn) ** 1.2 * 0.8;
    for (let i = 0; i < out; i++) { const x = i / SR; so[i] = (so[i] + Math.sin(2 * Math.PI * (285 + 30 * R()) * x) * 0.07) * Math.sin(Math.PI * i / out) ** 0.8; }
    b.add(si, t, 0.8 + 0.2 * Math.min(1, k / 4), (R() - 0.5) * 0.1); b.add(so, t + 0.16, 1, (R() - 0.5) * 0.1);
    t += cyc; k++;
  }
  return normalize(b.L, b.R, 0.75);
}
// the run's footfalls land on the camera's own bob: the same uneven pace as the shot's handheld (shots_portrait.js stepAt, the chase's seed)
const shash = (x) => { const y = Math.sin(x * 127.1 + 311.7) * 43758.5453; return y - Math.floor(y); };
function syncedSteps(sec, period, seed) {
  const b = new Buf(sec + 1); let t = 0, k = 0;
  while (t < sec) {
    b.add(room(thump(100, 48, 0.15, 0.6), 0.18, 0.8), t, 1, k % 2 ? 0.15 : -0.15);
    b.add(onePoleHP(thump(2400, 1100, 0.03, 0.35), 1300), t + 0.012, 1, 0);   // the sole slapping the boards: what a phone speaker plays
    const n = Math.round(0.05 * SR), sl = biquadBP(noise(n), 1900, 1.4); for (let i = 0; i < n; i++) sl[i] *= Math.exp(-i / n * 6) * 0.35; b.add(sl, t, 1, 0);
    t += period * (0.85 + shash(k * 3.7 + seed) * 0.3); k++;
  }
  return normalize(b.L, b.R, 0.8);
}
function closingSteps(sec) {   // something much heavier behind you, faster than you, getting closer
  const b = new Buf(sec + 1); let t = 0.05;
  while (t < sec) {
    const g = 0.35 + 0.65 * (t / sec);
    b.add(room(thump(70, 30, 0.26, 0.9), 0.25, 1.2), t, g, 0.1);
    b.add(onePoleHP(thump(700, 300, 0.05, 0.4), 350), t + 0.008, g, 0.1);   // the knock in the boards
    t += 0.3 - 0.1 * (t / sec) + (R() - 0.5) * 0.03;
  }
  return normalize(b.L, b.R, 0.8);
}
function heartTicks(sec, period) {   // under the covers with the heartbeat: the blanket rustling and the bed frame ticking on each beat
  const b = new Buf(sec + 1);
  for (let t = 0; t < sec; t += period) {
    const n = Math.round(0.07 * SR), r = biquadBP(noise(n), 2600, 1.3); for (let i = 0; i < n; i++) r[i] *= Math.sin(Math.PI * i / n) * 0.5;
    b.add(r, t, 1, 0);
    const m = Math.round(0.04 * SR), p = new Float64Array(m); for (let i = 0; i < m; i++) p[i] = Math.sin(2 * Math.PI * 1350 * i / SR) * Math.exp(-i / SR * 90);
    b.add(p, t + 0.004, 0.45, 0.2);
  }
  return normalize(b.L, b.R, 0.6);
}
function crtOff() {   // the set switching off: the relay thunk, the picture collapsing with a falling whine, the glass ticking as it cools
  const b = new Buf(1.0);
  b.add(onePoleLP(thump(90, 40, 0.12, 0.9), 900), 0, 1, 0);
  const n = Math.round(0.2 * SR), w = new Float64Array(n); let ph = 0;
  for (let i = 0; i < n; i++) { const k = i / n; ph += 2 * Math.PI * (3200 * Math.pow(0.06, k)) / SR; w[i] = Math.sin(ph) * (1 - k) * 0.4; }
  b.add(w, 0.01, 1, 0);
  for (let i = 0; i < 4; i++) b.add(onePoleHP(thump(4000, 2000, 0.006, 0.25), 2000), 0.25 + i * 0.13 + R() * 0.05, 1, (R() - 0.5) * 0.6);
  return normalize(b.L, b.R, 0.8);
}
function camImpact() {   // a camcorder hitting the floor: the body's thud, the plastic clatter, a rattle settling
  const b = new Buf(1.0);
  b.add(onePoleLP(thump(120, 45, 0.2, 1), 1200), 0, 1, 0);
  for (const [t0, f, g] of [[0, 1850, 0.5], [0.012, 2700, 0.4], [0.05, 3500, 0.3], [0.11, 2300, 0.25], [0.19, 3000, 0.15]]) {
    const m = Math.round(0.05 * SR), p = new Float64Array(m); for (let i = 0; i < m; i++) p[i] = (Math.sin(2 * Math.PI * f * i / SR) + (R() - 0.5) * 0.6) * Math.exp(-i / SR * 70);
    b.add(p, t0, g, (R() - 0.5) * 0.4);
  }
  return normalize(b.L, b.R, 0.9);
}
function handling() {   // a hand clenching on the camcorder: a dull bump on its mic and a creak of plastic
  const b = new Buf(0.6);
  b.add(onePoleLP(thump(85, 40, 0.09, 1), 400), 0, 1, 0);
  b.add(stickSlip(0.12, () => 260, hump(0.2, 0.5), [[1300, 1], [2600, 0.5]], 9, 0.3), 0.02, 0.25, 0);
  return normalize(b.L, b.R, 0.8);
}
function boxNote() {   // the last sound: one music-box note left ringing
  const b = new Buf(3); b.add(room(musicbox(midi(81), 0.7), 0.25, 1.4), 0, 1, 0.1); b.add(room(musicbox(midi(81) * 1.003, 0.25), 0.25, 1.4), 0.004, 1, -0.1);
  return normalize(b.L, b.R, 0.7);
}

const [L, Rr] = render(); writeWav(path.join(OUT, 'placeholder.wav'), L, Rr);
writeWav(path.join(OUT, 'heavy_steps.wav'), ...steps(7, 1.05, true));
writeWav(path.join(OUT, 'run_steps.wav'), ...steps(16, 0.42, false));
writeWav(path.join(OUT, 'breath_slow.wav'), ...breathing(9));
writeWav(path.join(OUT, 'tv_snow.wav'), ...tvSnow(8));
writeWav(path.join(OUT, 'heartbeat.wav'), ...heartbeat(4, 0.56));
writeWav(path.join(OUT, 'door_latch.wav'), ...latch());
// one seeded random runs through every file in this order: add new sounds at the end, or every file after them changes
writeWav(path.join(OUT, 'bed_creak.wav'), ...bedCreak());
writeWav(path.join(OUT, 'hinge_creak.wav'), ...hingeCreak());
writeWav(path.join(OUT, 'floor_creak.wav'), ...floorCreak());
writeWav(path.join(OUT, 'relay_click.wav'), ...relay());
writeWav(path.join(OUT, 'zoom_motor.wav'), ...zoomMotor(1.0));
writeWav(path.join(OUT, 'rewind.wav'), ...rewind(0.45));
writeWav(path.join(OUT, 'gasp.wav'), ...gasp());
writeWav(path.join(OUT, 'breath_panic.wav'), ...panicBreath(3.2));
writeWav(path.join(OUT, 'run_steps_chase.wav'), ...syncedSteps(1.2, 0.31, 37));
writeWav(path.join(OUT, 'steps_closing.wav'), ...closingSteps(1.4));
writeWav(path.join(OUT, 'heart_ticks.wav'), ...heartTicks(4, 0.56));
writeWav(path.join(OUT, 'crt_off.wav'), ...crtOff());
writeWav(path.join(OUT, 'cam_impact.wav'), ...camImpact());
writeWav(path.join(OUT, 'cam_handling.wav'), ...handling());
writeWav(path.join(OUT, 'piano_slam.wav'), ...pianoSlam());
writeWav(path.join(OUT, 'box_note.wav'), ...boxNote());
