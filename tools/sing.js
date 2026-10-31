#!/usr/bin/env node
// Sings a song file the way an early computer did: a buzzing glottal pulse pushed through vowel formant filters, consonants as
// short noise bursts, every note slightly flat and wobbly, over a plain organ and bass. No dependencies.
//
//   node tools/sing.js song.json --out out.wav [--slow 0.97] [--pitch -1] [--wobble 0.5] [--voice 1] [--band 0.8]
//   node tools/sing.js --midi song.mid --lyrics words.txt --out out.wav [--melody-track N] [--chord-track N,N] [--out-json song.json]
//
// song.json: { bpm, key, voice: [{ note: 'C4' | 60 | null, beats, syl: 'dai' }], chords: [{ beats, notes: ['C3','E3','G3'] }] }
//   syl is spelled ('win', 'dow') or, with spaces, given as sounds ('d o u'): consonants s z sh ch j f v th dh h t d k g p b m n ng l r w y,
//   vowels a ah ae e eh i ih o oh u oo uh er aw. Spelling guesses the vowel; sounds are exact.
// --midi song.mid: a standard MIDI file (type 0 or 1) instead of the song file. The melody is the track with the highest average
//   pitch that never plays two notes at once (or --melody-track N, numbered from 1 in file order); every other pitched track is the
//   band, grouped into a chord per beat (or --chord-track N,N); channel 10 drums are skipped. Tempo changes are kept.
// --lyrics words.txt: the words, one syllable per melody note in order, separated by spaces and hyphens ("lit-tle win-dow");
//   "_" holds the last syllable over the next note, "-" on its own is ignored, "[dh uh]" is one syllable given as sounds,
//   "#" starts a comment. Rests take no syllable. Notes left without a syllable sing "la". Without the file, lyric events in
//   the MIDI are used if it has them.
// --out-json song.json: also write the parsed song in the format above, to edit and sing again from the song file.
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
const MIDI = opt('--midi', null), LYRICS = opt('--lyrics', null), OUT_JSON = opt('--out-json', null);
if (!songFile && !MIDI) { console.error('usage: node tools/sing.js song.json --out out.wav\n       node tools/sing.js --midi song.mid --lyrics words.txt --out out.wav'); process.exit(1); }
const OUT = opt('--out', 'song.wav'), SLOW = +opt('--slow', 1), PITCH = +opt('--pitch', 0), WOBBLE = +opt('--wobble', 0.5);
const VOICE = +opt('--voice', 1), BAND = +opt('--band', 1);

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

// ---------- MIDI input ----------
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const nameOf = (m) => NOTE_NAMES[m % 12] + (Math.floor(m / 12) - 1);

// the file as tracks of events: { tick, meta, data } or { tick, kind, ch, d1, d2 }
function readMidi(file) {
  const b = fs.readFileSync(file);
  let p = 0;
  const u32 = () => { const v = b.readUInt32BE(p); p += 4; return v; };
  const u16 = () => { const v = b.readUInt16BE(p); p += 2; return v; };
  const tag = () => { const s = b.toString('latin1', p, p + 4); p += 4; return s; };
  if (tag() !== 'MThd') throw new Error(file + ' is not a MIDI file');
  const hlen = u32(), format = u16(), ntrk = u16(), div = u16(); p += hlen - 6;
  let tickSec = null, ppq = 480;
  if (div & 0x8000) { const fps = 256 - (div >> 8), tpf = div & 0xff; tickSec = 1 / (fps * tpf); }   // SMPTE time: ticks are a fixed length
  else ppq = div || 480;
  const tracks = [];
  while (tracks.length < ntrk && p + 8 <= b.length) {
    const t = tag(), len = u32(), end = Math.min(p + len, b.length);
    if (t !== 'MTrk') { p = end; continue; }
    const ev = []; let tick = 0, status = 0;
    const vlq = () => { let v = 0, c; do { c = b[p++]; v = (v << 7) | (c & 0x7f); } while ((c & 0x80) && p < end); return v >>> 0; };
    while (p < end) {
      tick += vlq();
      let s = b[p];
      if (s & 0x80) { p++; if (s < 0xf0) status = s; } else s = status;   // running status
      if (s === 0xff) { const type = b[p++], n = vlq(); ev.push({ tick, meta: type, data: b.subarray(p, p + n) }); p += n; }
      else if (s === 0xf0 || s === 0xf7) { p += vlq(); }
      else if (s >= 0x80) { const kind = s & 0xf0, d1 = b[p++], d2 = kind === 0xc0 || kind === 0xd0 ? 0 : b[p++]; ev.push({ tick, kind, ch: s & 0x0f, d1, d2 }); }
      else break;   // a data byte with no status: the track is damaged, keep what was read
    }
    p = end; tracks.push(ev);
  }
  return { format, ppq, tickSec, tracks };
}

// tempo map: tick -> seconds, and the first tempo as the song's bpm
function tempoMap(mid) {
  const changes = [];
  for (const t of mid.tracks) for (const e of t) if (e.meta === 0x51 && e.data.length >= 3) changes.push({ tick: e.tick, us: (e.data[0] << 16) | (e.data[1] << 8) | e.data[2] });
  changes.sort((a, b) => a.tick - b.tick);
  if (!changes.length || changes[0].tick > 0) changes.unshift({ tick: 0, us: 500000 });
  const segs = []; let sec = 0;
  for (let i = 0; i < changes.length; i++) {
    if (i) sec += (changes[i].tick - changes[i - 1].tick) / mid.ppq * changes[i - 1].us / 1e6;
    segs.push({ tick: changes[i].tick, sec, us: changes[i].us });
  }
  const toSec = (tick) => {
    if (mid.tickSec) return tick * mid.tickSec;
    let s = segs[0]; for (const g of segs) { if (g.tick <= tick) s = g; else break; }
    return s.sec + (tick - s.tick) / mid.ppq * s.us / 1e6;
  };
  return { toSec, bpm: 60e6 / segs[0].us, changes: segs.length };
}

// one part per track and channel: its notes in seconds, sorted, with the lyric events that start on them
function midiParts(mid, toSec) {
  const parts = [];
  mid.tracks.forEach((ev, ti) => {
    const nameEv = ev.find((e) => e.meta === 0x03);
    const name = nameEv ? nameEv.data.toString('latin1').replace(/[^\x20-\x7e]/g, '').trim() : '';
    const open = new Map(), byCh = new Map(), lyrics = [];
    let last = 0;
    const close = (key, tick) => {
      const s = open.get(key); if (s == null) return; open.delete(key);
      const ch = key >> 7, m = key & 127;
      if (tick <= s) return;
      if (!byCh.has(ch)) byCh.set(ch, []);
      byCh.get(ch).push({ s: toSec(s), e: toSec(tick), m, tick: s });
    };
    for (const e of ev) {
      last = Math.max(last, e.tick);
      if (e.meta === 0x05) { lyrics.push({ tick: e.tick, text: e.data.toString('latin1').replace(/[^\x20-\x7e]/g, '').trim() }); continue; }
      if (e.kind == null || e.ch === 9) continue;   // channel 10 is drums
      const key = e.ch * 128 + e.d1;
      if (e.kind === 0x90 && e.d2 > 0) { close(key, e.tick); open.set(key, e.tick); }
      else if (e.kind === 0x80 || e.kind === 0x90) close(key, e.tick);
    }
    for (const key of [...open.keys()]) close(key, last);
    for (const [ch, notes] of byCh) {
      notes.sort((a, b) => a.s - b.s || b.m - a.m);
      let overlaps = 0, sum = 0;
      for (let i = 1; i < notes.length; i++) if (notes[i].s < notes[i - 1].e - 1e-3) overlaps++;
      for (const n of notes) sum += n.m;
      for (const l of lyrics) {   // a lyric belongs to the note that starts nearest it, within an eighth of a beat
        let best = null; for (const n of notes) if (Math.abs(n.tick - l.tick) <= mid.ppq / 8 && (!best || Math.abs(n.tick - l.tick) < Math.abs(best.tick - l.tick))) best = n;
        if (best && l.text && !best.lyric) best.lyric = l.text;
      }
      parts.push({ track: ti + 1, ch: ch + 1, name, notes, overlaps, mean: sum / notes.length });
    }
  });
  return parts;
}

// the lyrics file as a list of syllables
function readLyrics(file) {
  const out = [];
  for (let line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    line = line.replace(/#.*$/, '');
    const re = /\[([^\]]*)\]|([^\s-]+)/g; let m;
    while ((m = re.exec(line))) {
      const tok = m[1] != null ? m[1].trim() : m[2].replace(/^[^A-Za-z_']+|[^A-Za-z_']+$/g, '');
      if (tok) out.push(tok);
    }
  }
  return out;
}

function songFromMidi(file, lyricsFile) {
  const mid = readMidi(file);
  const { toSec, bpm, changes } = tempoMap(mid);
  const bl = 60 / bpm;
  const parts = midiParts(mid, toSec).filter((pt) => pt.notes.length);
  if (!parts.length) throw new Error(file + ' has no notes');
  const log = (s) => console.error(s);
  log(`${file}: type ${mid.format}, ${mid.tracks.length} track${mid.tracks.length === 1 ? '' : 's'}, ${bpm.toFixed(1)} bpm${changes > 1 ? ` (${changes} tempo changes)` : ''}`);
  for (const pt of parts) log(`  track ${pt.track}${pt.name ? ` "${pt.name}"` : ''} ch ${pt.ch}: ${pt.notes.length} notes, mean ${nameOf(Math.round(pt.mean))}${pt.overlaps ? `, ${pt.overlaps} overlapping` : ''}`);
  const trackArg = (k) => (opt(k, '') + '').split(',').map((x) => +x).filter((x) => x > 0);
  // the melody: a chosen track, or the highest monophonic part
  let melody;
  const want = trackArg('--melody-track')[0];
  if (want) {
    const onTrack = parts.filter((pt) => pt.track === want);
    if (!onTrack.length) throw new Error(`--melody-track ${want}: that track has no notes`);
    melody = onTrack.reduce((a, b) => (b.notes.length > a.notes.length ? b : a));
  } else {
    const mono = parts.filter((pt) => !pt.overlaps && pt.notes.length >= 4);
    const pool = mono.length ? mono : parts;
    melody = pool.reduce((a, b) => (b.overlaps / b.notes.length < a.overlaps / a.notes.length - 0.05 || (Math.abs(b.overlaps / b.notes.length - a.overlaps / a.notes.length) <= 0.05 && b.mean > a.mean) ? b : a));
  }
  const chordTracks = trackArg('--chord-track');
  const bandParts = parts.filter((pt) => pt !== melody && (chordTracks.length ? chordTracks.includes(pt.track) : true));
  log(`  melody: track ${melody.track} ch ${melody.ch}; band: ${bandParts.length ? bandParts.map((pt) => `track ${pt.track} ch ${pt.ch}`).join(', ') : 'none'}`);

  // the melody as one line: of notes starting together keep the highest, and cut each note at the next one's start
  const mel = [];
  for (const n of melody.notes) { const prev = mel[mel.length - 1]; if (prev && n.s - prev.s < 1e-3) continue; mel.push({ ...n }); }
  for (let i = 0; i + 1 < mel.length; i++) if (mel[i].e > mel[i + 1].s) mel[i].e = mel[i + 1].s;
  const voice = []; let t = 0;
  for (const n of mel) {
    const gap = n.s - t;
    if (gap > 0.2 * bl || (gap > 1e-6 && !voice.length)) voice.push({ note: null, beats: gap / bl });
    else if (gap > 1e-6) voice[voice.length - 1].beats += gap / bl;   // a short gap is slurred over
    voice.push({ note: n.m, beats: (n.e - n.s) / bl, syl: n.lyric ? n.lyric.replace(/^[-_/\\]+|[-_/\\]+$/g, '') : undefined });
    t = n.e;
  }
  // the words
  const sung = voice.filter((v) => v.note != null);
  if (lyricsFile) {
    const toks = readLyrics(lyricsFile);
    let si = 0, prev = null;
    for (let i = 0; i < voice.length; i++) {
      const v = voice[i]; if (v.note == null) { prev = null; continue; }
      const tok = toks[si++];
      if (tok === undefined) { v.syl = 'l ah'; continue; }
      if (tok === '_') {   // hold the last syllable: a tie on the same pitch, or its vowel on a new one
        const p = voice[i - 1];
        if (p && p.note === v.note && p.syl != null) { p.beats += v.beats; voice.splice(i, 1); i--; continue; }
        v.syl = prev ? parse(prev).vowel.join(' ') : 'ah';
        continue;
      }
      v.syl = tok; prev = tok;
    }
    if (toks.length > sung.length) log(`  lyrics: ${toks.length} syllables for ${sung.length} notes; the last ${toks.length - sung.length} syllables are not sung`);
    else if (toks.length < sung.length) log(`  lyrics: ${toks.length} syllables for ${sung.length} notes; the last ${sung.length - toks.length} notes sing "la"`);
    else log(`  lyrics: ${toks.length} syllables on ${sung.length} notes`);
  } else {
    const withWords = sung.filter((v) => v.syl).length;
    if (withWords) log(`  lyrics: ${withWords} of ${sung.length} notes have words in the file${withWords < sung.length ? '; the rest sing "la"' : ''}`);
    else log('  lyrics: none (no --lyrics and no lyric events); every note sings "la"');
  }
  for (const v of voice) if (v.note != null && !v.syl) v.syl = 'l ah';

  // the band: whatever the other parts play, as one chord per beat, a new block on every change or attack
  const all = bandParts.flatMap((pt) => pt.notes);
  const endSec = Math.max(t, ...all.map((n) => n.e));
  const nb = Math.ceil(endSec / bl - 1e-6);
  const chords = [];
  for (let i = 0; i < nb; i++) {
    const w0 = i * bl, w1 = w0 + bl, set = new Set(); let attack = false;
    for (const n of all) {
      const onset = n.s >= w0 - 1e-3 && n.s < w1 - 1e-3;
      if (onset || Math.min(n.e, w1) - Math.max(n.s, w0) >= 0.5 * bl) { set.add(n.m); if (onset) attack = true; }
    }
    const notes = [...set].sort((a, b) => a - b), key = notes.join(',');
    const last = chords[chords.length - 1];
    if (last && last.key === key && !(attack && notes.length)) last.beats += 1;
    else chords.push({ beats: 1, notes, key });
  }
  for (const c of chords) delete c.key;
  for (const v of voice) v.beats = +v.beats.toFixed(4);
  const title = (mid.tracks[0] || []).find((e) => e.meta === 0x03);
  return { title: title ? title.data.toString('latin1').replace(/[^\x20-\x7e]/g, '').trim() : undefined, bpm: +bpm.toFixed(3), voice, chords };
}

// ---------- the song ----------
const song = MIDI ? songFromMidi(MIDI, LYRICS) : JSON.parse(fs.readFileSync(songFile, 'utf8'));
if (OUT_JSON) {
  const dump = {
    title: song.title, bpm: song.bpm, key: song.key,
    voice: song.voice.map((v) => (v.note == null ? { note: null, beats: v.beats } : { note: typeof v.note === 'number' ? nameOf(v.note) : v.note, beats: v.beats, syl: v.syl })),
    chords: (song.chords || []).map((c) => ({ beats: c.beats, notes: c.notes.map((n) => (typeof n === 'number' ? nameOf(n) : n)) })),
  };
  const line = (o) => JSON.stringify(o);
  const text = `{\n  "title": ${line(dump.title || '')},\n  "bpm": ${line(dump.bpm || 96)},${dump.key ? `\n  "key": ${line(dump.key)},` : ''}\n  "voice": [\n    ${dump.voice.map(line).join(',\n    ')}\n  ],\n  "chords": [\n    ${dump.chords.map(line).join(',\n    ')}\n  ]\n}\n`;
  fs.writeFileSync(OUT_JSON, text);
  console.error(`${OUT_JSON}: ${dump.voice.length} voice entries, ${dump.chords.length} chord blocks`);
}
const beat = 60 / (song.bpm || 96);

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
