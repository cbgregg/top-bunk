#!/usr/bin/env node
// Measures a rendering of the robot singer against the song it sang, so a tuning loop (or a person) can see what a parameter
// did. No dependencies.
//
//   node tools/sing_measure.js out.wav --song song.json [--voice voice_only.wav] [--params p.json] [--ref stem.wav] [--png report.png] [--json metrics.json]
//
// out.wav       the mix to measure (loudness, peak, spectrum, width)
// --voice       the same render with the band off (tools/sing.js --band 0): the pitch, formant and gap figures come from it,
//               and the band/voice balance from the two together. Without it they come from the mix, muddied by the band.
// --params      the parameter set the render used, so the expected notes follow its tape speed and transpose
// --png         a spectrogram with the song's notes drawn over the tracked pitch, for a look
// --ref         a recording of the song (a vocal stem or the record) to hold the render against: durationRatio, where each
//               becomes active, the loudness envelopes' correlation (50 ms RMS frames every 25 ms, 0.3 s smoothing, each to its
//               own peak, time as 0-100%), peak / RMS / crest of both, and each sung phrase's onset against the recording's bursts
// --json        write the metrics there (they always go to stdout)
//
// The metrics:
//   durationSec, loudnessLufs (K-weighted), truePeakDb (4x interpolated), stereoWidth (side/mid, dB; -inf is mono)
//   notesTotal, notesTracked, within50CentsPct, meanAbsCents, medianCents (signed), meanOnsetMs, perNote[{note, cents, onsetMs}]
//   formantDevPct (LPC F1/F2 on vowel middles against the synth's own targets), nhr (noise to harmonic, 0 clean .. 1 noise)
//   centroidHz, tiltDbPerOct, legatoGapMs (mean unvoiced gap between tied notes), bandVoiceDb (band under the voice)
//   wobbleIndex (pitch deviation faster than 0.5 Hz, std in cents / 30: 1 is about the default), vibratoCents (over 3 Hz), driftCents (0.5-3 Hz)
import fs from 'node:fs';
import zlib from 'node:zlib';
import { SR, VOWELS, parse, midi, toTrackerRate, trackPitch, mergeParams, envelopeOf, burstsOf, songPhrases, alignToBursts, timeAt } from './sing_core.js';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 && i + 1 < args.length ? args[i + 1] : d; };
const file = args.find((a) => !a.startsWith('--') && (args.indexOf(a) === 0 || !args[args.indexOf(a) - 1].startsWith('--')));
if (!file) { console.error('usage: node tools/sing_measure.js out.wav --song song.json [--voice voice.wav] [--params p.json] [--png report.png]'); process.exit(1); }

// ---------- the WAV ----------
function readWav(path) {
  const b = fs.readFileSync(path), dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.toString('latin1', 0, 4) !== 'RIFF') throw new Error(path + ' is not a WAV');
  let p = 12, fmt = null, data = null;
  while (p + 8 <= b.length) { const id = b.toString('latin1', p, p + 4), len = dv.getUint32(p + 4, true); if (id === 'fmt ') fmt = { ch: dv.getUint16(p + 10, true), sr: dv.getUint32(p + 12, true), bits: dv.getUint16(p + 22, true) }; if (id === 'data') { data = [p + 8, Math.min(len, b.length - p - 8)]; break; } p += 8 + len + (len & 1); }
  if (!fmt || !data) throw new Error(path + ': no data');
  const n = Math.floor(data[1] / (fmt.bits / 8) / fmt.ch), chans = [];
  for (let c = 0; c < fmt.ch; c++) chans.push(new Float32Array(n));
  for (let i = 0, q = data[0]; i < n; i++) for (let c = 0; c < fmt.ch; c++) { chans[c][i] = fmt.bits === 16 ? dv.getInt16(q, true) / 32768 : fmt.bits === 32 ? dv.getFloat32(q, true) : dv.getInt32(q, true) / 2147483648; q += fmt.bits / 8; }
  return { sr: fmt.sr, chans };
}
const mono = (w) => { const n = w.chans[0].length, out = new Float32Array(n); for (const c of w.chans) for (let i = 0; i < n; i++) out[i] += c[i] / w.chans.length; return out; };

// ---------- loudness and peak ----------
class BQ { constructor(b0, b1, b2, a1, a2) { Object.assign(this, { b0, b1, b2, a1, a2, x1: 0, x2: 0, y1: 0, y2: 0 }); } run(x) { const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2; this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y; return y; } }
// the two K-weighting stages, designed for the file's rate
function kWeight(sr) {
  const shelf = (() => { const f0 = 1681.97, G = 3.9998, Q = 0.7072, K = Math.tan(Math.PI * f0 / sr), Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416), a0 = 1 + K / Q + K * K; return new BQ((Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0); })();
  const hp = (() => { const f0 = 38.135, Q = 0.5003, K = Math.tan(Math.PI * f0 / sr), a0 = 1 + K / Q + K * K; return new BQ(1 / a0, -2 / a0, 1 / a0, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0); })();
  return (x) => hp.run(shelf.run(x));
}
function loudness(w) {
  let sum = 0, n = 0;
  for (const c of w.chans) { const k = kWeight(w.sr); for (let i = 0; i < c.length; i++) { const y = k(c[i]); sum += y * y; } n = c.length; }
  return n ? -0.691 + 10 * Math.log10(sum / n) : -Infinity;
}
function truePeak(w) {
  let pk = 0;
  for (const c of w.chans) for (let i = 1; i < c.length; i++) { const a = c[i - 1], b = c[i]; for (let k = 0; k < 4; k++) { const v = Math.abs(a + (b - a) * k / 4); if (v > pk) pk = v; } }
  return pk > 0 ? 20 * Math.log10(pk) : -Infinity;
}
function width(w) {
  if (w.chans.length < 2) return -Infinity;
  let m = 0, s = 0; const [L, R] = w.chans;
  for (let i = 0; i < L.length; i++) { const mid = (L[i] + R[i]) / 2, side = (L[i] - R[i]) / 2; m += mid * mid; s += side * side; }
  return s > 0 && m > 0 ? 10 * Math.log10(s / m) : -Infinity;
}

// ---------- spectrum ----------
function fft(re, im) {   // in place, radix 2
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let j = 0; j < len / 2; j++) { const a = i + j, b = a + len / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr; re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } }
  }
}
function spectrum(x, sr, { win = 2048, hop = 1024 } = {}) {
  const frames = Math.max(1, Math.floor((x.length - win) / hop)), bins = win / 2, avg = new Float64Array(bins), gram = [];
  const re = new Float64Array(win), im = new Float64Array(win), hann = new Float64Array(win).map((_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / win));
  for (let f = 0; f < frames; f++) {
    for (let i = 0; i < win; i++) { re[i] = x[f * hop + i] * hann[i]; im[i] = 0; }
    fft(re, im);
    const row = new Float32Array(bins); let e = 0;
    for (let k = 0; k < bins; k++) { const p = re[k] * re[k] + im[k] * im[k]; row[k] = p; avg[k] += p; e += p; }
    gram.push(row);
  }
  let num = 0, den = 0; const xs = [], ys = [];
  for (let k = 1; k < bins; k++) { const hz = k * sr / win; num += hz * avg[k]; den += avg[k]; if (hz >= 200 && hz <= 8000 && avg[k] > 0) { xs.push(Math.log2(hz)); ys.push(10 * Math.log10(avg[k])); } }
  let tilt = 0; if (xs.length > 2) { const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length; let sxy = 0, sxx = 0; for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) * (xs[i] - mx); } tilt = sxx ? sxy / sxx : 0; }
  return { centroidHz: den ? num / den : 0, tiltDbPerOct: tilt, gram, hop, win };
}

// ---------- the pitch against the song ----------
function expectedNotes(song, P) {
  const speed = P.tape.speed, out = []; let b = 0;
  for (const v of song.voice) {
    const s = timeAt(song, b) / speed, e = timeAt(song, b + v.beats) / speed;
    if (v.note != null) out.push({ s, e, m: midi(v.note, P.voice.transpose) + 12 * Math.log2(speed) + P.voice.flatCents / 100, syl: v.syl || 'ah', note: v.note });
    b += v.beats;
  }
  return out;
}
const median = (a) => { const s = [...a].sort((p, q) => p - q); return s.length ? s[s.length >> 1] : NaN; };
function compare(track, notes) {
  const { times, f0, hop } = track, per = [];
  const midiAt = (i) => (f0[i] ? 69 + 12 * Math.log2(f0[i] / 440) : null);
  let gaps = [];
  for (let k = 0; k < notes.length; k++) {
    const n = notes[k], a = n.s + (n.e - n.s) * 0.3, b = n.s + (n.e - n.s) * 0.8, cents = [];
    for (let i = 0; i < times.length; i++) { if (times[i] < a) continue; if (times[i] > b) break; const m = midiAt(i); if (m != null) cents.push((m - n.m) * 100); }
    // the onset: the first voiced frame within 150 ms either side of the expected start, after the last note's vowel
    let onset = NaN;
    for (let i = 0; i < times.length; i++) { if (times[i] < n.s - 0.15) continue; if (times[i] > n.s + 0.25) break; const m = midiAt(i); if (m != null && Math.abs(m - n.m) < 1.5) { onset = (times[i] - n.s) * 1000; break; } }
    per.push({ note: n.note, cents: cents.length ? +median(cents).toFixed(1) : null, onsetMs: Number.isFinite(onset) ? +onset.toFixed(0) : null });
    // the gap into the next note when the song ties them (no rest between)
    const nx = notes[k + 1];
    if (nx && Math.abs(nx.s - n.e) < 1e-3) { let un = 0; for (let i = 0; i < times.length; i++) { if (times[i] < n.e - 0.08) continue; if (times[i] > nx.s + 0.08) break; if (!f0[i]) un++; } gaps.push(un * hop * 1000); }
  }
  const tracked = per.filter((p) => p.cents != null), abs = tracked.map((p) => Math.abs(p.cents));
  return {
    notesTotal: notes.length, notesTracked: tracked.length,
    within50CentsPct: tracked.length ? +(100 * abs.filter((c) => c <= 50).length / tracked.length).toFixed(1) : 0,
    meanAbsCents: abs.length ? +(abs.reduce((a, b) => a + b, 0) / abs.length).toFixed(1) : null,
    medianCents: tracked.length ? +median(tracked.map((p) => p.cents)).toFixed(1) : null,
    meanOnsetMs: (() => { const o = per.filter((p) => p.onsetMs != null).map((p) => Math.abs(p.onsetMs)); return o.length ? +(o.reduce((a, b) => a + b, 0) / o.length).toFixed(0) : null; })(),
    legatoGapMs: gaps.length ? +(gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(0) : null,
    perNote: per,
  };
}
// the pitch deviation from each note's own median: the std of everything faster than 0.5 Hz (a 2 s mean taken off) is the
// wobble index, in units of 30 cents (about the default vibrato); the part faster than 3 Hz is the vibrato and jitter, the
// 0.5-3 Hz part the slow waver
function wobble(track, notes) {
  const { times, f0, hop } = track, dev = new Float64Array(f0.length).fill(NaN);
  for (const n of notes) {
    // the inside of the note: the glide in and the release out are not wobble
    const idx = []; for (let i = 0; i < times.length; i++) { if (times[i] < n.s + 0.1) continue; if (times[i] > n.e - 0.05) break; if (f0[i]) idx.push(i); }
    if (idx.length < 5) continue;
    const ms = idx.map((i) => 69 + 12 * Math.log2(f0[i] / 440)), md = median(ms);
    idx.forEach((i, k) => { dev[i] = (ms[k] - md) * 100; });
  }
  const slow = Math.round(2 / hop), fast = Math.round(0.33 / hop), all = [], fastPart = [], slowPart = [];
  for (let i = 0; i < dev.length; i++) {
    if (Number.isNaN(dev[i])) continue;
    let s1 = 0, n1 = 0, s2 = 0, n2 = 0;
    for (let k = -slow; k <= slow; k++) { const v = dev[i + k]; if (v != null && !Number.isNaN(v)) { s1 += v; n1++; } }
    for (let k = -fast; k <= fast; k++) { const v = dev[i + k]; if (v != null && !Number.isNaN(v)) { s2 += v; n2++; } }
    if (n1 && n2) { all.push(dev[i] - s1 / n1); fastPart.push(dev[i] - s2 / n2); slowPart.push(s2 / n2 - s1 / n1); }
  }
  const sd = (a) => { if (!a.length) return 0; const mu = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - mu) * (y - mu), 0) / a.length); };
  return { wobbleIndex: +(sd(all) / 30).toFixed(3), vibratoCents: +sd(fastPart).toFixed(1), driftCents: +sd(slowPart).toFixed(1) };
}

// ---------- formants: LPC on the vowel middles ----------
function lpcFormants(x, sr, order = 12) {
  // autocorrelation and Levinson-Durbin, then the roots of the polynomial by a simple Durand-Kerner
  const n = x.length, r = new Float64Array(order + 1);
  for (let k = 0; k <= order; k++) { let s = 0; for (let i = k; i < n; i++) s += x[i] * x[i - k]; r[k] = s; }
  if (r[0] <= 0) return [];
  let a = new Float64Array(order + 1); a[0] = 1; let e = r[0];
  for (let i = 1; i <= order; i++) {
    let acc = r[i]; for (let j = 1; j < i; j++) acc += a[j] * r[i - j];
    const k = -acc / e; const na = a.slice(); for (let j = 1; j < i; j++) na[j] = a[j] + k * a[i - j]; na[i] = k; a = na; e *= 1 - k * k; if (e <= 0) return [];
  }
  // roots of 1 + a1 z^-1 + ... : polynomial z^order + a1 z^(order-1) + ... + a_order
  const deg = order, roots = []; for (let i = 0; i < deg; i++) roots.push([Math.cos(2 * Math.PI * i / deg + 0.4) * 0.9, Math.sin(2 * Math.PI * i / deg + 0.4) * 0.9]);
  const evalP = ([x, y]) => { let re = 1, im = 0; for (let j = 1; j <= deg; j++) { const nr = re * x - im * y, ni = re * y + im * x; re = nr + a[j]; im = ni; } return [re, im]; };
  for (let it = 0; it < 60; it++) for (let i = 0; i < deg; i++) {
    const [pr, pi] = evalP(roots[i]); let dr = 1, di = 0;
    for (let j = 0; j < deg; j++) { if (j === i) continue; const ar = roots[i][0] - roots[j][0], ai = roots[i][1] - roots[j][1]; const nr = dr * ar - di * ai, ni = dr * ai + di * ar; dr = nr; di = ni; }
    const den = dr * dr + di * di || 1e-12, qr = (pr * dr + pi * di) / den, qi = (pi * dr - pr * di) / den;
    roots[i] = [roots[i][0] - qr, roots[i][1] - qi];
  }
  const fs_ = [];
  for (const [x_, y_] of roots) { if (y_ <= 0) continue; const f = Math.atan2(y_, x_) * sr / (2 * Math.PI), bw = -Math.log(Math.hypot(x_, y_)) * sr / Math.PI; if (f > 90 && f < sr / 2 - 100 && bw < 600) fs_.push(f); }
  return fs_.sort((p, q) => p - q);
}
function formants(x, sr, notes) {
  // the voice at 11025 Hz, 30 ms frames from the middle of each note
  const r = 4, ds = new Float32Array(Math.floor(x.length / r)); for (let i = 0; i < ds.length; i++) { let s = 0; for (let k = 0; k < r; k++) s += x[i * r + k] || 0; ds[i] = s / r; }
  const fsr = sr / r, devs = [], per = [];
  for (const n of notes) {
    const v = parse(n.syl).vowel, target = VOWELS[v[0]]; if (!target || n.e - n.s < 0.12) continue;
    const mid = (n.s + n.e) / 2, a = Math.floor((mid - 0.015) * fsr), len = Math.floor(0.03 * fsr); if (a < 0 || a + len > ds.length) continue;
    const frame = new Float64Array(len); for (let i = 0; i < len; i++) frame[i] = ds[a + i] * (0.54 - 0.46 * Math.cos(2 * Math.PI * i / len)) - (i ? 0.95 * ds[a + i - 1] : 0) * (0.54 - 0.46 * Math.cos(2 * Math.PI * i / len));
    const f = lpcFormants(frame, fsr); if (f.length < 2) continue;
    // the nearest estimate to each of the first two targets
    const near = (t) => f.reduce((best, v_) => (Math.abs(v_ - t) < Math.abs(best - t) ? v_ : best), f[0]);
    const d1 = Math.abs(near(target[0]) - target[0]) / target[0], d2 = Math.abs(near(target[1]) - target[1]) / target[1];
    devs.push((d1 + d2) / 2); per.push({ vowel: v[0], f1: Math.round(near(target[0])), f2: Math.round(near(target[1])) });
  }
  return { formantDevPct: devs.length ? +(100 * devs.reduce((a, b) => a + b, 0) / devs.length).toFixed(1) : null, vowels: per.length };
}

// ---------- the picture: spectrogram, the tracked pitch and the song's notes ----------
function png(path, gram, sr, win, hop, track, notes, maxHz = 3000, envs = null) {
  const W = Math.min(1600, gram.length), H0 = 400, EH = envs ? 110 : 0, H = H0 + EH, cols = gram.length, binMax = Math.floor(maxHz / (sr / win));
  const img = new Uint8Array(W * H * 3);
  let top = 0; for (const row of gram) for (let k = 1; k < binMax; k++) if (row[k] > top) top = row[k];
  const set = (x, y, r, g, b) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const p = (y * W + x) * 3; img[p] = r; img[p + 1] = g; img[p + 2] = b; };
  for (let x = 0; x < W; x++) { const row = gram[Math.floor(x * cols / W)]; for (let y = 0; y < H0; y++) { const k = Math.floor((1 - y / H0) * binMax); const v = row[k] ? Math.max(0, 1 + (10 * Math.log10(row[k] / top)) / 70) : 0; set(x, y, Math.round(10 + 190 * v * v), Math.round(10 + 120 * v), Math.round(20 + 60 * v)); } }
  const secs = cols * hop / sr, xOf = (t) => Math.floor(t / secs * W), yOf = (hz) => Math.floor((1 - hz / maxHz) * H0);
  if (envs) {   // the two loudness envelopes under the spectrogram, each over its own length (time as 0-100%): the render in yellow, the recording in blue
    for (let x = 0; x < W; x++) for (let y = H0; y < H; y++) set(x, y, 14, 14, 18);
    const draw = (env, r, g, b, dy) => { for (let x = 0; x < W; x++) { const v = env.env[Math.min(env.env.length - 1, Math.floor(x / W * env.env.length))]; const y = H - 4 - Math.floor(v * (EH - 10)); for (let d = -1; d <= 1; d++) set(x, y + d + dy, r, g, b); } };
    draw(envs.b, 70, 200, 255, 0); draw(envs.a, 255, 230, 80, 0);
  }
  for (const n of notes) { const f = 440 * Math.pow(2, (n.m - 69) / 12); for (let x = xOf(n.s); x < xOf(n.e); x++) for (let d = -2; d <= 2; d++) set(x, yOf(f) + d, 70, 200, 255); }
  for (let i = 0; i < track.f0.length; i++) if (track.f0[i]) { const x = xOf(track.times[i]), y = yOf(track.f0[i]); set(x, y, 255, 230, 80); set(x, y - 1, 255, 230, 80); }
  // encode
  const raw = Buffer.alloc((W * 3 + 1) * H); for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; Buffer.from(img.buffer, y * W * 3, W * 3).copy(raw, y * (W * 3 + 1) + 1); }
  const crcTable = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (buf) => { let c = -1; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  fs.writeFileSync(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

// ---------- go ----------
const w = readWav(file), song = JSON.parse(fs.readFileSync(opt('--song', ''), 'utf8'));
const P = mergeParams(opt('--params', null) ? JSON.parse(fs.readFileSync(opt('--params', null), 'utf8')) : null);
const vw = opt('--voice', null) ? readWav(opt('--voice', null)) : null;
const m = mono(w), v = vw ? mono(vw) : m;
const notes = expectedNotes(song, P);
const track = trackPitch(toTrackerRate(v, (vw || w).sr));
const out = { file, durationSec: +(m.length / w.sr).toFixed(2), loudnessLufs: +loudness(w).toFixed(1), truePeakDb: +truePeak(w).toFixed(1), stereoWidthDb: +width(w).toFixed(1) };
Object.assign(out, compare(track, notes));
Object.assign(out, formants(v, (vw || w).sr, notes));
const sp = spectrum(m, w.sr);
out.centroidHz = Math.round(sp.centroidHz); out.tiltDbPerOct = +sp.tiltDbPerOct.toFixed(2);
out.nhr = +(1 - (() => { let s = 0, n = 0; for (let i = 0; i < track.conf.length; i++) if (track.f0[i]) { s += track.conf[i]; n++; } return n ? s / n : 0; })()).toFixed(3);
Object.assign(out, wobble(track, notes));
if (vw && vw.chans[0].length === w.chans[0].length) { let sv = 0, sb = 0; for (let i = 0; i < m.length; i++) { const b = m[i] - v[i]; sv += v[i] * v[i]; sb += b * b; } out.bandVoiceDb = sv > 0 && sb > 0 ? +(10 * Math.log10(sb / sv)).toFixed(1) : null; } else out.bandVoiceDb = null;
// against a recording
let refPlot = null;
if (opt('--ref', null)) {
  const rw = readWav(opt('--ref', null)), rm = mono(rw);
  const stats = (x) => { let pk = 0, e = 0; for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > pk) pk = a; e += x[i] * x[i]; } const rms = Math.sqrt(e / x.length); return { peakDb: +(20 * Math.log10(pk || 1e-9)).toFixed(2), rmsDb: +(20 * Math.log10(rms || 1e-9)).toFixed(2), crestDb: +(20 * Math.log10((pk || 1e-9) / (rms || 1e-9))).toFixed(2) }; };
  const eA = envelopeOf(m, w.sr), eB = envelopeOf(rm, rw.sr), speed = P.tape.speed;
  const active = (env) => { const sorted = [...env.env].sort((a, b) => a - b), thr = Math.max(0.02, 0.2 * sorted[Math.floor(sorted.length * 0.9)]); let s = -1, e = -1; for (let f = 0; f < env.env.length; f++) if (env.env[f] >= thr) { if (s < 0) s = f; e = f; } return s < 0 ? [0, env.duration] : [s * env.hop, (e + 1) * env.hop]; };
  const aA = active(eA), aB = active(eB);
  const corr = (x, y) => { const n = Math.min(x.length, y.length); let mx = 0, my = 0; for (let i = 0; i < n; i++) { mx += x[i]; my += y[i]; } mx /= n; my /= n; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; } return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0; };
  const onGrid = (env, a, b, N = 2000) => { const out = new Float32Array(N); for (let i = 0; i < N; i++) { const t = a + (b - a) * i / (N - 1); out[i] = env.env[Math.min(env.env.length - 1, Math.max(0, Math.floor(t / env.hop)))]; } return out; };
  const full = corr(onGrid(eA, 0, eA.duration), onGrid(eB, 0, eB.duration)), act = corr(onGrid(eA, aA[0], aA[1]), onGrid(eB, aB[0], aB[1]));
  // each sung phrase (in the render's time) against the recording's bursts
  const bursts = burstsOf(eB), phr = songPhrases(song).map((p) => ({ s: p.s / speed, e: p.e / speed })), matched = alignToBursts(phr, bursts);
  const per = phr.map((p, k) => (matched[k] ? Math.round((p.s - matched[k].s) * 1000) : null));
  const offs = per.filter((v) => v != null).map(Math.abs);
  out.ref = { file: opt('--ref', null), durationSec: +eB.duration.toFixed(2), activeStartSec: +aB[0].toFixed(3), activeEndSec: +aB[1].toFixed(3), ...stats(rm), bursts: bursts.length };
  out.render = { activeStartSec: +aA[0].toFixed(3), activeEndSec: +aA[1].toFixed(3), ...stats(m) };
  out.durationRatio = +(eA.duration / eB.duration).toFixed(4);
  out.envelopeCorrFull = +full.toFixed(3); out.envelopeCorrActive = +act.toFixed(3);
  out.perPhraseOnsetMs = per; out.meanPhraseOnsetMs = offs.length ? Math.round(offs.reduce((a, b) => a + b, 0) / offs.length) : null; out.maxPhraseOnsetMs = offs.length ? Math.max(...offs) : null;
  refPlot = { a: eA, b: eB };
}
if (opt('--png', null)) { png(opt('--png', null), sp.gram, w.sr, sp.win, sp.hop, track, notes, 3000, refPlot); out.png = opt('--png', null); }
const text = JSON.stringify(out, null, 1);
if (opt('--json', null)) fs.writeFileSync(opt('--json', null), text);
console.log(text);
