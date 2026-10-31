// The robot singer, as pure functions: a song (or a MIDI file and its words) in, sample buffers out. No node, no DOM, so it runs
// the same in the command line (sing.js), in the page (robot-voice.html) and in a worker.
//
// A song: { bpm, key, voice: [{ note: 'C4' | 60 | null, beats, syl: 'dai' }], chords: [{ beats, notes: ['C3','E3','G3'] }] }
//   syl is spelled ('win', 'dow') or, with spaces, given as sounds ('d o u'): consonants s z sh ch j f v th dh h t d k g p b m n ng l r w y,
//   vowels a ah ae e eh i ih o oh u oo uh er aw. Spelling guesses the vowel; sounds are exact.

export const SR = 44100;

// ---------- notes ----------
const NAMES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function midi(n, pitch = 0) {
  if (n == null) return null;
  if (typeof n === 'number') return n + pitch;
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(n.trim());
  if (!m) throw new Error('bad note ' + n);
  return 12 * (+m[3] + 1) + NAMES[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + pitch;
}
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const nameOf = (m) => NOTE_NAMES[m % 12] + (Math.floor(m / 12) - 1);

// ---------- the mouth: formant targets ----------
// f1..f3 in Hz, with bandwidths; the fourth formant is fixed. Values are a male-ish vocal tract, which the pulse pitch can sit well above.
export const VOWELS = {
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
export function parse(syl) {
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
const latin1 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return s; };
const text = (bytes) => latin1(bytes).replace(/[^\x20-\x7e]/g, '').trim();

// the file as tracks of events: { tick, meta, data } or { tick, kind, ch, d1, d2 }. bytes: a Uint8Array
export function readMidi(bytes, name = 'the file') {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let p = 0;
  const u32 = () => { const v = dv.getUint32(p); p += 4; return v; };
  const u16 = () => { const v = dv.getUint16(p); p += 2; return v; };
  const tag = () => { const s = latin1(b.subarray(p, p + 4)); p += 4; return s; };
  if (b.length < 14 || tag() !== 'MThd') throw new Error(name + ' is not a MIDI file');
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
    const name = nameEv ? text(nameEv.data) : '';
    const open = new Map(), byCh = new Map(), lyrics = [], program = new Map();
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
      if (e.meta === 0x05 || e.meta === 0x01) { const t = text(e.data); if (t && !/^[@%]/.test(t)) lyrics.push({ tick: e.tick, text: t }); continue; }   // lyric and text events (karaoke files use text)
      if (e.kind == null || e.ch === 9) continue;   // channel 10 is drums
      if (e.kind === 0xc0) { if (!program.has(e.ch)) program.set(e.ch, e.d1); continue; }
      const key = e.ch * 128 + e.d1;
      if (e.kind === 0x90 && e.d2 > 0) { close(key, e.tick); open.set(key, e.tick); }
      else if (e.kind === 0x80 || e.kind === 0x90) close(key, e.tick);
    }
    for (const key of [...open.keys()]) close(key, last);
    for (const [ch, notes] of byCh) {
      notes.sort((a, b) => a.s - b.s || b.m - a.m);
      let overlaps = 0, sum = 0, withLyric = 0;
      for (let i = 1; i < notes.length; i++) if (notes[i].s < notes[i - 1].e - 1e-3) overlaps++;
      for (const n of notes) sum += n.m;
      for (const l of lyrics) {   // a lyric belongs to the note that starts nearest it, within an eighth of a beat
        let best = null; for (const n of notes) if (Math.abs(n.tick - l.tick) <= mid.ppq / 8 && (!best || Math.abs(n.tick - l.tick) < Math.abs(best.tick - l.tick))) best = n;
        if (best && l.text && !best.lyric) { best.lyric = l.text; withLyric++; }
      }
      parts.push({ track: ti + 1, ch: ch + 1, name, program: program.has(ch) ? program.get(ch) : null, notes, overlaps, lyrics: withLyric, mean: sum / notes.length });
    }
  });
  return parts;
}

// which part sings: a score per part from everything a file gives away, highest wins. Returns the parts with score and reasons
// filled in, best first. bl: the beat length in seconds.
const LEADY = /vocal|voice|\bvoc|vox|sing|lead|melod|\bmel\b|tune|words|lyric|chorus|verse/i, BANDY = /bass|drum|perc|\bpad|string|chord|accomp|rhythm|piano|guitar|\blh\b|left|harmony|backing|organ|synth\s*pad|arp/i;
export function scoreParts(parts, bl) {
  const songEnd = Math.max(...parts.flatMap((pt) => pt.notes.map((n) => n.e)));
  for (const pt of parts) {
    const ns = pt.notes, why = [];
    let score = 0;
    const add = (v, w) => { if (v) { score += v; why.push(`${w} ${v > 0 ? '+' : ''}${+v.toFixed(1)}`); } };
    if (pt.name) { if (LEADY.test(pt.name)) add(3, 'name'); if (BANDY.test(pt.name)) add(-3, 'name'); }
    if (pt.lyrics) add(pt.lyrics >= 0.3 * ns.length ? 5 : 2, 'lyrics');
    const p = pt.program;
    if (p != null) {
      if (p >= 52 && p <= 54) add(2.5, 'voice program'); else if (p >= 80 && p <= 87) add(2, 'lead program'); else if (p >= 64 && p <= 79) add(1, 'wind program');
      else if (p >= 32 && p <= 39) add(-3, 'bass program'); else if (p >= 88 && p <= 95) add(-2, 'pad program'); else if (p <= 7 || (p >= 24 && p <= 31) || (p >= 48 && p <= 51)) add(-1, 'program');
    }
    // monophony: time with two notes sounding, past an eighth of a beat of legato, against the time the part sounds at all
    let sounding = 0, poly = 0, end = 0;
    for (const n of ns) { if (n.s > end) { sounding += n.e - n.s; } else { if (end - n.s > bl / 8) poly += Math.min(end, n.e) - n.s; sounding += Math.max(0, n.e - end); } end = Math.max(end, n.e); }
    pt.mono = sounding ? Math.max(0, 1 - poly / sounding) : 1;
    add(Math.max(-3, Math.min(2, 2 * (pt.mono - 0.6) / 0.4)), 'mono');
    // a human range: most notes between G2 and C6, the middle of the line around C4-A4
    const ms = ns.map((n) => n.m).sort((a, b) => a - b), med = ms[ms.length >> 1];
    pt.median = med;
    const outside = ms.filter((m) => m < 43 || m > 84).length / ms.length;
    add(-3 * outside, 'out of range');
    add(med >= 57 && med <= 72 ? 2 : Math.max(-2, 2 - 0.75 * Math.ceil((med < 57 ? 57 - med : med - 72) / 3)), 'centre');
    const span = ms[Math.floor(ms.length * 0.95)] - ms[Math.floor(ms.length * 0.05)];
    if (span > 30) add(-1, 'span');
    // a tune, not a run of sixteenths and not one long pad
    const perSec = ns.length / Math.max(1e-6, sounding), avgLen = sounding / ns.length / bl;
    if (perSec > 8) add(-2, 'runs'); else if (perSec < 0.3) add(-1, 'sparse'); else add(1, 'pace');
    if (avgLen > 4) add(-2, 'held');
    // sings across most of the song
    const cover = sounding / songEnd;
    if (cover >= 0.5) add(1, 'coverage'); else if (cover < 0.2) add(-2, 'coverage');
    pt.coverage = cover;
    pt.score = score; pt.why = why;
  }
  return [...parts].sort((a, b) => b.score - a.score || b.notes.length - a.notes.length);
}

// a lyrics text as a list of syllables: separated by spaces and hyphens, "_" holds the last syllable over the next note, "-" on its
// own is ignored, "[dh uh]" is one syllable given as sounds, "#" starts a comment
export function parseLyrics(src) {
  const out = [];
  for (let line of src.split(/\r?\n/)) {
    line = line.replace(/#.*$/, '');
    const re = /\[([^\]]*)\]|([^\s-]+)/g; let m;
    while ((m = re.exec(line))) {
      const tok = m[1] != null ? m[1].trim() : m[2].replace(/^[^A-Za-z_']+|[^A-Za-z_']+$/g, '');
      if (tok) out.push(tok);
    }
  }
  return out;
}

// put the words on a voice line, in place: one syllable per sung note in order (see parseLyrics for the format). Notes left
// without a syllable sing "la"; with lyrics null, syllables already on the notes stay. Returns the counts.
export function applyLyrics(voice, lyrics, log = () => {}) {
  const sung = voice.filter((v) => v.note != null);
  const words = { syllables: 0, notes: sung.length };
  if (lyrics != null) {
    const toks = Array.isArray(lyrics) ? lyrics : parseLyrics(lyrics);
    words.syllables = toks.length;
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
    words.syllables = withWords;
    if (withWords) log(`  lyrics: ${withWords} of ${sung.length} notes have words in the file${withWords < sung.length ? '; the rest sing "la"' : ''}`);
    else log('  lyrics: none (no words and no lyric events); every note sings "la"');
  }
  for (const v of voice) if (v.note != null && !v.syl) v.syl = 'l ah';
  return words;
}

// the parts of a MIDI file, for choosing tracks: [{ track, ch, name, program, notes, overlaps, lyrics, mean }]
export function midiInfo(bytes, name) {
  const mid = readMidi(bytes, name);
  const { toSec, bpm, changes } = tempoMap(mid);
  return { mid, bpm, changes, parts: midiParts(mid, toSec).filter((pt) => pt.notes.length) };
}

// a song from a MIDI file and its words. The melody is the track that carries lyric events, else the part scoreParts() ranks
// first (or melodyTrack, numbered from 1 in file order); every other pitched track is the band, grouped into a chord per beat
// (or chordTracks). Tempo changes are kept. Notes left without a syllable sing "la"; without lyrics, lyric events in the MIDI are used.
// log gets one line per thing found.
export function songFromMidi(bytes, { name = 'the file', lyrics = null, melodyTrack = 0, chordTracks = [], log = () => {} } = {}) {
  const { mid, bpm, changes, parts } = midiInfo(bytes, name);
  const bl = 60 / bpm;
  if (!parts.length) throw new Error(name + ' has no notes');
  log(`${name}: type ${mid.format}, ${mid.tracks.length} track${mid.tracks.length === 1 ? '' : 's'}, ${bpm.toFixed(1)} bpm${changes > 1 ? ` (${changes} tempo changes)` : ''}`);
  const ranked = scoreParts(parts, bl);
  const lyricParts = parts.filter((pt) => pt.lyrics >= Math.max(3, 0.3 * pt.notes.length));
  // the melody: a chosen track, else the track that carries the words, else the best score
  let melody;
  if (melodyTrack) {
    const onTrack = parts.filter((pt) => pt.track === melodyTrack);
    if (!onTrack.length) throw new Error(`melody track ${melodyTrack}: that track has no notes`);
    melody = onTrack.reduce((a, b) => (b.notes.length > a.notes.length ? b : a));
  } else if (lyricParts.length) melody = lyricParts.reduce((a, b) => (b.lyrics > a.lyrics ? b : a));
  else melody = ranked[0];
  const pad = (v, n) => String(v).padStart(n);
  log(`  ${'track'.padEnd(26)}${pad('prog', 5)}${pad('notes', 6)}${pad('mono', 6)}${pad('mid', 5)}${pad('words', 7)}${pad('score', 7)}`);
  for (const pt of ranked) log(`  ${(`${pt === melody ? '> ' : '  '}${pt.track}${pt.name ? ` "${pt.name.slice(0, 14)}"` : ''} ch ${pt.ch}`).padEnd(26)}${pad(pt.program ?? '-', 5)}${pad(pt.notes.length, 6)}${pad(Math.round(pt.mono * 100) + '%', 6)}${pad(nameOf(pt.median), 5)}${pad(pt.lyrics ? 'yes' : '-', 7)}${pad(pt.score.toFixed(1), 7)}   ${pt.why.join(', ')}`);
  const bandParts = parts.filter((pt) => pt !== melody && (chordTracks.length ? chordTracks.includes(pt.track) : true));
  log(`  melody: track ${melody.track}${melody.name ? ` "${melody.name}"` : ''} ch ${melody.ch}${melodyTrack ? ' (chosen)' : lyricParts.length ? ' (it carries the words)' : ' (best score)'}; band: ${bandParts.length ? bandParts.map((pt) => `track ${pt.track} ch ${pt.ch}`).join(', ') : 'none'}`);

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
  const words = applyLyrics(voice, lyrics, log);

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
  const song = { title: title ? text(title.data) : undefined, bpm: +bpm.toFixed(3), voice, chords };
  return { song, melody: melody.track, band: bandParts.map((pt) => pt.track), words, ranked: ranked.map((pt) => ({ track: pt.track, ch: pt.ch, name: pt.name, program: pt.program, notes: pt.notes.length, mono: pt.mono, median: pt.median, lyrics: pt.lyrics, score: pt.score, why: pt.why })) };
}

// the song as a song file (note names, one entry per line), to edit by hand and sing again
export function songText(song) {
  const dump = {
    title: song.title, bpm: song.bpm, key: song.key,
    voice: song.voice.map((v) => (v.note == null ? { note: null, beats: v.beats } : { note: typeof v.note === 'number' ? nameOf(v.note) : v.note, beats: v.beats, syl: v.syl })),
    chords: (song.chords || []).map((c) => ({ beats: c.beats, notes: c.notes.map((n) => (typeof n === 'number' ? nameOf(n) : n)) })),
  };
  const line = (o) => JSON.stringify(o);
  return `{\n  "title": ${line(dump.title || '')},\n  "bpm": ${line(dump.bpm || 96)},${dump.key ? `\n  "key": ${line(dump.key)},` : ''}\n  "voice": [\n    ${dump.voice.map(line).join(',\n    ')}\n  ],\n  "chords": [\n    ${dump.chords.map(line).join(',\n    ')}\n  ]\n}\n`;
}

// ---------- a melody out of a recording ----------
// For one voice on its own (a vocal stem, a cappella, humming): a pitch track, then notes. It will not pull a singer out of a band.
const TSR = 22050;   // the tracker's rate: plenty for a voice, a quarter of the work

// any rate to the tracker's, mono Float32Array
export function toTrackerRate(x, sr) {
  if (sr === TSR) return Float32Array.from(x);
  const n = Math.floor(x.length * TSR / sr), out = new Float32Array(n), r = sr / TSR;
  if (r > 1.5) {   // average the samples each output sample covers, so nothing above the new half-rate aliases down
    for (let i = 0; i < n; i++) { const a = Math.floor(i * r), b = Math.max(a + 1, Math.floor((i + 1) * r)); let s = 0; for (let j = a; j < b && j < x.length; j++) s += x[j]; out[i] = s / (b - a); }
  } else for (let i = 0; i < n; i++) { const p = i * r, j = Math.floor(p), k = p - j; out[i] = (x[j] || 0) * (1 - k) + (x[j + 1] || 0) * k; }
  return out;
}

// YIN, frame by frame: f0 in Hz (0 where there is no voice), a confidence, and the frame times. x at TSR.
//   win 1024 samples (46 ms), hop 10 ms, fmin..fmax the pitch range to look in, threshold the dip depth that counts as a period
export function trackPitch(x, { hop = Math.round(TSR * 0.01), win = 1024, fmin = 70, fmax = 1000, threshold = 0.15, progress = null } = {}) {
  const tmin = Math.max(2, Math.floor(TSR / fmax)), tmax = Math.min(win - 1, Math.ceil(TSR / fmin));
  const frames = Math.max(0, Math.floor((x.length - win - tmax) / hop) + 1);
  const f0 = new Float32Array(frames), conf = new Float32Array(frames), times = new Float32Array(frames), rms = new Float32Array(frames);
  const d = new Float64Array(tmax + 1), cm = new Float64Array(tmax + 1);
  let peak = 0;
  for (let f = 0; f < frames; f++) {
    const s = f * hop; let e = 0;
    for (let j = 0; j < win; j++) e += x[s + j] * x[s + j];
    rms[f] = Math.sqrt(e / win); if (rms[f] > peak) peak = rms[f];
    times[f] = (s + win / 2) / TSR;
  }
  for (let f = 0; f < frames; f++) {
    if (progress && (f & 63) === 0) progress(f / frames);
    if (rms[f] < peak * 0.03) continue;   // silence
    const s = f * hop;
    // the difference function, then its cumulative mean normalised form
    for (let t = tmin; t <= tmax; t++) { let acc = 0; for (let j = 0; j < win; j++) { const v = x[s + j] - x[s + j + t]; acc += v * v; } d[t] = acc; }
    let run = 0; cm[0] = 1;
    for (let t = 1; t <= tmax; t++) { run += t >= tmin ? d[t] : 0; cm[t] = t < tmin ? 1 : d[t] * t / (run || 1e-12); }
    // the first dip under the threshold, followed to its bottom
    let tau = -1;
    for (let t = tmin + 1; t < tmax; t++) if (cm[t] < threshold) { while (t + 1 < tmax && cm[t + 1] < cm[t]) t++; tau = t; break; }
    if (tau < 0) { let best = tmin + 1; for (let t = tmin + 1; t < tmax; t++) if (cm[t] < cm[best]) best = t; if (cm[best] < 0.5) tau = best; }
    if (tau < 0) continue;
    // parabolic interpolation round the dip
    const a = cm[tau - 1], b = cm[tau], c = cm[tau + 1], den = a - 2 * b + c, off = den ? 0.5 * (a - c) / den : 0;
    f0[f] = TSR / (tau + off); conf[f] = Math.max(0, 1 - b);
  }
  // a short median smooths out single-frame octave slips
  const out = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    if (!f0[f]) continue;
    const w = []; for (let k = -2; k <= 2; k++) { const v = f0[f + k]; if (v) w.push(v); }
    w.sort((p, q) => p - q); out[f] = w[w.length >> 1];
  }
  if (progress) progress(1);
  return { times, f0: out, conf, rms, peak, hop: hop / TSR };
}

const toMidiF = (hz) => 69 + 12 * Math.log2(hz / 440);
const median = (arr) => { const a = [...arr].sort((p, q) => p - q); return a.length ? a[a.length >> 1] : 0; };

// notes from a pitch track: runs of frames that stay on one semitone for at least minDur seconds
//   [{ s, e, m, cents }] in seconds, m a MIDI number; cents how far off the semitone the run sat
export function notesFromPitch(track, { minDur = 0.06, maxGap = 0.03, tolerance = 0.6 } = {}) {
  const { times, f0, rms, peak, hop } = track;
  let notes = [], cur = null;
  const close = () => { if (cur && cur.n * hop >= minDur) { const m = median(cur.p); notes.push({ s: cur.s, e: cur.s + cur.n * hop, m: Math.round(m), cents: Math.round((m - Math.round(m)) * 100), fa: cur.f0, fb: cur.f0 + cur.n }); } cur = null; };
  let gap = 0;
  for (let f = 0; f < f0.length; f++) {
    if (!f0[f]) { if (cur && ++gap * hop > maxGap) close(); continue; }
    const m = toMidiF(f0[f]);
    if (cur && Math.abs(m - median(cur.p)) <= tolerance) { cur.p.push(m); cur.n = f - cur.f0 + 1; gap = 0; continue; }
    close(); cur = { s: times[f] - hop / 2, f0: f, n: 1, p: [m] }; gap = 0;
  }
  close();
  // a short note between two others, on a pitch between theirs with no air on either side, is the slur passing through
  notes = notes.filter((n, i) => {
    const a = notes[i - 1], b = notes[i + 1];
    return !(a && b && n.e - n.s < 0.1 && n.s - a.e <= maxGap && b.s - n.e <= maxGap && (n.m - a.m) * (n.m - b.m) < 0);
  });
  // the same pitch straight after itself with only a breath between is one note
  const merged = [];
  for (const n of notes) { const p = merged[merged.length - 1]; if (p && p.m === n.m && n.s - p.e <= maxGap) { p.e = n.e; p.fb = n.fb; } else merged.push({ ...n }); }
  // a repeated note with a voiced consonant between (na-na) keeps its pitch straight through; the dip in level is the only seam
  const split = [];
  const R = Math.round(0.3 / hop), edge = Math.round(0.12 / hop);
  for (const n of merged) {
    let a = n.fa;
    const parts = [];
    for (let f = n.fa + edge; f < n.fb - edge; f++) {
      let before = 0, after = 0;
      for (let k = Math.max(a, f - R); k < f; k++) before = Math.max(before, rms[k]);
      for (let k = f + 1; k < Math.min(n.fb, f + R); k++) after = Math.max(after, rms[k]);
      const isMin = rms[f] <= rms[f - 1] && rms[f] <= rms[f + 1];
      if (isMin && rms[f] < 0.55 * Math.min(before, after) && f - a >= edge) { parts.push([a, f]); a = f; f += edge; }
    }
    parts.push([a, n.fb]);
    for (const [fa, fb] of parts) split.push({ ...n, fa, fb, s: fa === n.fa ? n.s : times[fa] - hop / 2, e: fb === n.fb ? n.e : times[fb] - hop / 2 });
  }
  // a note starts at its consonant, not at its vowel. Between two notes the seam is the quietest point of the gap (the closure
  // between the last vowel's tail and the next consonant), looked for away from either vowel; after a rest, the start is pulled
  // back over the sound before the vowel, up to a breath's length
  for (let i = 0; i < split.length; i++) {
    const n = split[i], p = split[i - 1], prevEnd = p ? p.e : 0;
    if (p && n.s - prevEnd <= 0.25) {
      const fa = p.fb, fb = n.fa, len = fb - fa;
      if (len <= 1) { n.s = prevEnd; continue; }
      const lo = fa + Math.round(len * 0.2), hi = fb - Math.round(len * 0.2);
      let best = lo;
      for (let f = lo; f <= hi; f++) if (rms[f] < rms[best]) best = f;
      n.s = Math.max(prevEnd, times[best] - hop / 2); p.e = n.s;
      continue;
    }
    let f = n.fa; while (f > 0 && times[f - 1] - hop / 2 > prevEnd && n.s - (times[f - 1] - hop / 2) < 0.2 && rms[f - 1] > peak * 0.03) f--;
    n.s = Math.max(prevEnd, times[f] - hop / 2);
  }
  for (const n of split) { delete n.fa; delete n.fb; }
  return split;
}

// a tempo from how the onsets fall: the bpm whose half-beat grid the note starts land on best
export function estimateTempo(notes, { lo = 50, hi = 200 } = {}) {
  if (notes.length < 3) return 96;
  const ioi = []; for (let i = 1; i < notes.length; i++) ioi.push(notes[i].s - notes[i - 1].s);
  const fit = (bpm, tol) => { const g = 30 / bpm; let score = 0; for (const d of ioi) { const q = d / g, err = Math.abs(q - Math.round(q)); if (Math.round(q) > 0) score += Math.exp(-(err / tol) * (err / tol)); } return score; };
  let best = 96, bestScore = -1;
  for (let bpm = lo; bpm <= hi; bpm += 0.5) {
    const score = fit(bpm, 0.12) * (1 - Math.abs(bpm - 100) / 400);   // all else equal, a walking tempo over its double or half
    if (score > bestScore) { bestScore = score; best = bpm; }
  }
  // then the exact figure: the tempo whose half-beat grid the starts agree with from the first note to the last (a grid a
  // quarter of a beat per minute off drifts away over a song, and the agreement collapses)
  let fine = best; bestScore = -1;
  for (let bpm = best - 2; bpm <= best + 2; bpm += 0.01) {
    const g = 30 / bpm; let sx = 0, sy = 0;
    for (const n of notes) { const a = 2 * Math.PI * (n.s / g); sx += Math.cos(a); sy += Math.sin(a); }
    const r = Math.hypot(sx, sy); if (r > bestScore) { bestScore = r; fine = bpm; }
  }
  return +fine.toFixed(2);
}

// where the beat grid sits: the offset (0..one grid step) the note starts agree on best
export function gridOffset(notes, bpm, quantize = 2) {
  if (!quantize || !notes.length) return 0;
  const g = 60 / bpm / quantize; let sx = 0, sy = 0;
  for (const n of notes) { const a = 2 * Math.PI * (n.s / g % 1); sx += Math.cos(a); sy += Math.sin(a); }
  const ph = Math.atan2(sy, sx) / (2 * Math.PI);
  return ((ph % 1) + 1) % 1 * g;
}

// the key, from how long each pitch class is held (Krumhansl-Schmuckler): { tonic 0..11, minor, name }
const MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88], MIN = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
export function detectKey(notes) {
  const h = new Array(12).fill(0);
  for (const n of notes) h[((n.m % 12) + 12) % 12] += n.e - n.s;
  const corr = (prof, t) => { let sx = 0, sy = 0, sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < 12; i++) { const x = h[(i + t) % 12], y = prof[i]; sx += x; sy += y; sxy += x * y; sxx += x * x; syy += y * y; } const d = Math.sqrt((12 * sxx - sx * sx) * (12 * syy - sy * sy)); return d ? (12 * sxy - sx * sy) / d : 0; };
  let best = { tonic: 0, minor: false, r: -2 };
  for (let t = 0; t < 12; t++) { const a = corr(MAJ, t), b = corr(MIN, t); if (a > best.r) best = { tonic: t, minor: false, r: a }; if (b > best.r) best = { tonic: t, minor: true, r: b }; }
  return { tonic: best.tonic, minor: best.minor, name: NOTE_NAMES[best.tonic] + (best.minor ? ' minor' : ' major') };
}

// a chord per bar from the melody: whichever of the key's common triads holds the most of what is sung in the bar
export function chordsFromMelody(notes, key, bpm, barBeats, totalBeats) {
  const beat = 60 / bpm, bars = Math.max(1, Math.ceil(totalBeats / barBeats));
  const steps = key.minor ? [[0, 1], [5, 1], [7, 1], [8, 0], [3, 0], [10, 0]] : [[0, 0], [5, 0], [7, 0], [9, 1], [2, 1], [4, 1]];   // [degree offset, minor triad]
  const triads = steps.map(([d, mn]) => { const r = (key.tonic + d) % 12; return [r, (r + (mn ? 3 : 4)) % 12, (r + 7) % 12]; });
  const out = []; let last = triads[0];
  for (let b = 0; b < bars; b++) {
    const s = b * barBeats * beat, e = s + barBeats * beat, held = new Array(12).fill(0); let any = 0;
    for (const n of notes) { const o = Math.min(n.e, e) - Math.max(n.s, s); if (o > 0) { held[((n.m % 12) + 12) % 12] += o; any += o; } }
    let pick = last;
    if (any > 0) { let bestW = -1; for (const t of triads) { const w = t.reduce((a, pc) => a + held[pc], 0); if (w > bestW + 1e-9) { bestW = w; pick = t; } } }
    last = pick;
    out.push({ beats: barBeats, notes: pick.map((pc, i) => 48 + pc + (i && pc < pick[0] ? 12 : 0)) });
  }
  return out;
}

// the song from detected notes: starts and lengths snapped to a grid (quantize 0 off, 1 beats, 2 half beats, 4 quarter beats),
// rests where nothing is sung, "la" on every note until lyrics are given, and a chord per bar if chords is on
export function songFromNotes(notes, { bpm = 96, quantize = 2, chords = true, band = null, barBeats = 4, lyrics = null, exact = false, restBeats = 0.4, key = null, offset = null, log = () => {} } = {}) {
  const beat = 60 / bpm, g = quantize ? beat / quantize : 0;
  const off = g ? (offset == null ? gridOffset(notes, bpm, quantize) : offset) : 0;   // the grid can start a little after the recording
  const snap = (t) => (g ? Math.max(0, Math.round((t - off) / g) * g + off) : t);
  const ns = notes.map((n) => ({ ...n })).sort((a, b) => a.s - b.s);
  for (const n of ns) { n.s = snap(n.s); n.e = Math.max(n.s + (g || 0.05), snap(n.e)); }
  for (let i = 0; i + 1 < ns.length; i++) if (ns[i].e > ns[i + 1].s) ns[i].e = ns[i + 1].s;
  const kept = ns.filter((n) => n.e > n.s);
  const voice = []; let t = 0;
  for (const n of kept) {
    if (n.s - t > 1e-6) voice.push({ note: null, beats: +((n.s - t) / beat).toFixed(4) });
    voice.push({ note: n.m, beats: +((n.e - n.s) / beat).toFixed(4) });
    t = n.e;
  }
  const k = key || detectKey(kept);
  const totalBeats = voice.reduce((a, v) => a + v.beats, 0);
  const song = { bpm: +bpm.toFixed(3), key: k.name, voice, chords: chords ? chordsFromMelody(kept, k, bpm, barBeats, totalBeats) : band || [] };
  log(`melody: ${kept.length} notes, ${bpm} bpm, ${k.name}${g ? `, snapped to ${quantize === 1 ? 'beats' : quantize === 2 ? 'half beats' : 'quarter beats'}` : ''}${chords ? `, ${song.chords.length} bars of chords from the melody` : band ? `, ${band.length} chord blocks from the file` : ''}`);
  const words = exact || lyrics == null ? applyLyrics(voice, lyrics, log) : alignWords(voice, lyrics, { restBeats, log });
  return { song, key: k, words };
}

// a voice line as notes in seconds, for the roll and for editing: [{ s, e, m }]
export function notesFromVoice(voice, bpm) {
  const beat = 60 / bpm, out = []; let t = 0;
  for (const v of voice) { if (v.note != null) out.push({ s: t, e: t + v.beats * beat, m: midi(v.note) }); t += v.beats * beat; }
  return out;
}

// notes held longer than maxBeats are cut there; the rest of their time becomes a rest. Returns how many were cut.
export function trimLongNotes(notes, bpm, maxBeats = 4) {
  const max = maxBeats * 60 / bpm; let n = 0;
  for (const x of notes) if (x.e - x.s > max + 1e-6) { x.e = x.s + max; n++; }
  return n;
}

// ---------- words ----------
// English words into syllables, by rule: vowel groups are the nuclei (y between consonants counts, a vowel run is one nucleus except
// the pairs that are two: ia io eo ua uo and y before a vowel), a final e is silent, -es and -ed are syllables only after the
// consonants that need them, then the consonants between two nuclei go to the second one (a cluster is split after its first
// consonant, a digraph or a stop+l/r blend stays together) and a final consonant+le is its own syllable. A few words the rules
// get wrong are listed.
const EXC = { people: ['peo', 'ple'], every: ['ev', 'ery'], everything: ['ev', 'ery', 'thing'], everyone: ['ev', 'ery', 'one'], sacred: ['sa', 'cred'], naked: ['na', 'ked'], wicked: ['wick', 'ed'],
  rugged: ['rug', 'ged'], crooked: ['crook', 'ed'], beloved: ['be', 'lov', 'ed'], wretched: ['wretch', 'ed'], jagged: ['jag', 'ged'], ragged: ['rag', 'ged'], blessed: ['bles', 'sed'],
  evening: ['eve', 'ning'], heaven: ['hea', 'ven'], fire: ['fire'], hour: ['hour'], our: ['our'], power: ['pow', 'er'], flower: ['flow', 'er'], prayer: ['prayer'], being: ['be', 'ing'],
  going: ['go', 'ing'], doing: ['do', 'ing'], seeing: ['see', 'ing'], idea: ['i', 'de', 'a'], quiet: ['qui', 'et'], science: ['sci', 'ence'], poem: ['po', 'em'], ocean: ['o', 'cean'],
  again: ['a', 'gain'], against: ['a', 'gainst'], lonely: ['lone', 'ly'], lovely: ['love', 'ly'], something: ['some', 'thing'], nothing: ['noth', 'ing'], anything: ['an', 'y', 'thing'],
  maybe: ['may', 'be'], always: ['al', 'ways'], together: ['to', 'geth', 'er'], another: ['an', 'oth', 'er'], mother: ['moth', 'er'], father: ['fa', 'ther'], brother: ['broth', 'er'],
  water: ['wa', 'ter'], over: ['o', 'ver'], under: ['un', 'der'], never: ['nev', 'er'], ever: ['ev', 'er'], river: ['riv', 'er'], little: ['lit', 'tle'], window: ['win', 'dow'] };
const DIG = ['th', 'sh', 'ch', 'ph', 'wh', 'ck', 'qu', 'gh'], STOPS = 'bcdfgkpt';
export function syllabify(word) {
  const w = word.toLowerCase().replace(/[^a-z']/g, '');
  if (!w) return [];
  if (EXC[w]) return EXC[w].slice();
  const letters = w.replace(/'/g, '');
  if (letters.length <= 3) return [w];
  const isVowel = (i) => 'aeiou'.includes(letters[i]) || (letters[i] === 'y' && i > 0 && !'aeiou'.includes(letters[i - 1]));
  // the nuclei as [start, end) over the letters
  const nuclei = [];
  for (let i = 0; i < letters.length; i++) {
    if (!isVowel(i)) continue;
    const last = nuclei[nuclei.length - 1];
    if (last && last[1] === i) {
      const pair = letters[i - 1] + letters[i], before = letters.slice(Math.max(0, i - 3), i - 1);
      const two = (['ia', 'io', 'eo', 'ua', 'uo'].includes(pair) && !(pair === 'io' && /[tsc]$/.test(before)) && !(pair === 'ua' && /[qg]$/.test(before))) || letters[i - 1] === 'y';
      if (!two) { last[1] = i + 1; continue; }
    }
    nuclei.push([i, i + 1]);
  }
  if (nuclei.length <= 1) return [w];
  // endings: a silent e, and -es / -ed that add nothing after most consonants
  const lastN = nuclei[nuclei.length - 1], tail = letters.slice(lastN[0]);
  if (tail === 'e' && !/[^aeiou]le$/.test(letters) && nuclei.length > 1) nuclei.pop();
  else if (tail === 'es' && !/(s|x|z|c|g|ch|sh)es$/.test(letters)) nuclei.pop();
  else if (tail === 'ed' && !/[dt]ed$/.test(letters)) nuclei.pop();
  if (nuclei.length <= 1) return [w];
  // the split points
  const cuts = [];
  for (let k = 0; k + 1 < nuclei.length; k++) {
    const a = nuclei[k][1], b = nuclei[k + 1][0], cons = letters.slice(a, b), n = cons.length;
    let cut;
    if (n === 0) cut = a;
    else if (n === 1) cut = a;
    else if (n === 2) cut = DIG.includes(cons) || (STOPS.includes(cons[0]) && 'lr'.includes(cons[1])) ? a : a + 1;
    else { const lastTwo = cons.slice(-2); cut = DIG.includes(lastTwo) || (STOPS.includes(lastTwo[0]) && 'lr'.includes(lastTwo[1])) ? b - 2 : a + 1; }
    if (letters.slice(a, b) === 'ng' && letters.endsWith('ing') && b === letters.length - 3) cut = a + 2;   // sing-ing, not si-nging
    cuts.push(cut);
  }
  if (/[^aeiou]le$/.test(letters) && nuclei[nuclei.length - 1][0] === letters.length - 1) cuts[cuts.length - 1] = letters.length - 3;   // lit-tle
  // back onto the word with its apostrophes
  const out = []; let p = 0, li = 0, wi = 0;
  const map = []; for (let i = 0; i < w.length; i++) if (w[i] !== "'") map[li++] = i;
  for (const c of cuts) { const at = map[c]; out.push(w.slice(wi, at)); wi = at; }
  out.push(w.slice(wi));
  return out.filter(Boolean);
}

// the words box as lines of syllables. A plain word is syllabified; "lit-tle" is split where the hyphen is; "_" holds the last
// syllable over a note; "[dh uh]" is a syllable given as sounds; "#" starts a comment
export function wordsToLines(text) {
  const lines = [];
  for (let line of text.split(/\r?\n/)) {
    line = line.replace(/#.*$/, '').trim();
    if (!line) continue;
    const syls = [], re = /\[([^\]]*)\]|(_+)|([^\s\[\]_]+)/g; let m;
    while ((m = re.exec(line))) {
      if (m[1] != null) { const t = m[1].trim(); if (t) syls.push({ syl: t, sounds: true }); }
      else if (m[2]) for (let i = 0; i < m[2].length; i++) syls.push({ hold: true });
      else for (const piece of m[3].split('-')) {
        const word = piece.replace(/^[^A-Za-z']+|[^A-Za-z']+$/g, '');
        if (!word) continue;
        if (m[3].includes('-')) syls.push({ syl: word }); else for (const sy of syllabify(word)) syls.push({ syl: sy });
      }
    }
    if (syls.length) lines.push(syls);
  }
  return lines;
}

// the words onto the notes, phrase by phrase: a line of words is a phrase; the melody's phrases are what its rests cut it into
// (a rest of restBeats or more). With more notes than syllables in a phrase, the longest extra notes are held on the vowel of the
// syllable before them; with more syllables than notes, the shortest syllables double up on a note. Returns the per-line report.
export function alignWords(voice, text, { restBeats = 0.4, log = () => {} } = {}) {
  const lines = typeof text === 'string' ? wordsToLines(text) : text;
  // the phrases: runs of sung notes between rests
  const sungIdx = [];
  for (let i = 0; i < voice.length; i++) if (voice[i].note != null) sungIdx.push(i);
  let phrases = [], cur = [], restBefore = [], lastRest = 0;
  for (let i = 0; i < voice.length; i++) {
    const v = voice[i];
    if (v.note == null) { lastRest += v.beats; continue; }
    if (cur.length && lastRest >= restBeats) { phrases.push(cur); restBefore.push(lastRest); cur = []; }
    cur.push(i); lastRest = 0;
  }
  if (cur.length) phrases.push(cur);
  // as many phrases as lines: join the phrases parted by the shortest rests first...
  while (phrases.length > lines.length && phrases.length > 1) {
    let k = 0; for (let i = 1; i < restBefore.length; i++) if (restBefore[i] < restBefore[k]) k = i;
    phrases[k] = phrases[k].concat(phrases[k + 1]); phrases.splice(k + 1, 1); restBefore.splice(k, 1);
  }
  // ...or cut the long ones: each phrase takes lines in proportion to its notes, and is cut between them in proportion to the
  // lines' syllables, at the end of the longest note near that point
  if (phrases.length < lines.length && phrases.length) {
    const total = phrases.reduce((a, ph) => a + ph.length, 0), L = lines.length;
    const share = phrases.map((ph) => ph.length / total * L), take = share.map((v) => Math.max(1, Math.floor(v)));
    let left = L - take.reduce((a, b) => a + b, 0);
    const order = share.map((v, i) => i).sort((a, b) => (share[b] - take[b]) - (share[a] - take[a]));
    for (let i = 0; left > 0; i = (i + 1) % order.length) { if (phrases[order[i]].length > take[order[i]]) { take[order[i]]++; left--; } else if (order.every((o) => phrases[o].length <= take[o])) break; }
    const cut = []; let li = 0;
    for (let pi = 0; pi < phrases.length; pi++) {
      const ph = phrases[pi], k = Math.min(take[pi], ph.length), mine = lines.slice(li, li + k); li += k;
      if (k <= 1) { cut.push(ph); continue; }
      const syl = mine.map((l) => l.length), sum = syl.reduce((a, b) => a + b, 0) || 1;
      const lens = ph.map((i) => voice[i].beats), med = [...lens].sort((a, b) => a - b)[lens.length >> 1];
      let at = 0, acc = 0;
      for (let j = 0; j < k; j++) {
        if (j === k - 1) { cut.push(ph.slice(at)); break; }
        acc += syl[j];
        let want = Math.round(ph.length * acc / sum); want = Math.max(at + 1, Math.min(ph.length - (k - 1 - j), want));
        let best = want;   // a long note just before the cut reads as a phrase end; the nearest one to the share wins
        for (const d of [0, 1, -1, 2, -2]) { const c = want + d; if (c > at && c <= ph.length - (k - 1 - j) && lens[c - 1] >= 1.5 * med) { best = c; break; } }
        cut.push(ph.slice(at, best)); at = best;
      }
    }
    phrases = cut;
  }
  const report = { lines: [], syllables: 0, notes: sungIdx.length, held: 0, merged: 0 };
  const vowelOf = (syl) => { const last = syl.split('+').pop(); return /\s/.test(last) ? parse(last).vowel.join(' ') : parse(last).vowel.join(' '); };
  const toRemove = [];
  for (let li = 0; li < lines.length; li++) {
    const syls = lines[li].slice();
    const ph = phrases[li];
    if (!ph) { report.lines.push({ line: li + 1, syllables: syls.length, notes: 0, held: 0, merged: 0, extra: true }); continue; }
    const notes = ph.map((i) => voice[i]);
    const slots = syls.map((sy) => (sy.hold ? { hold: true } : { syl: sy.syl }));
    let held = 0, merged = 0;
    if (slots.length > notes.length) {
      // the shortest syllables double up with a neighbour
      while (slots.length > notes.length && slots.length > 1) {
        let k = -1; for (let i = 0; i < slots.length; i++) if (!slots[i].hold && (k < 0 || slots[i].syl.length < slots[k].syl.length)) k = i;
        if (k < 0) break;
        const j = k + 1 < slots.length && !slots[k + 1].hold ? k + 1 : k - 1;
        if (j < 0 || slots[j].hold) { slots.splice(k, 1); continue; }
        const a = Math.min(k, j), b = Math.max(k, j);
        slots[a] = { syl: slots[a].syl + '+' + slots[b].syl }; slots.splice(b, 1); merged++;
      }
    } else if (slots.length < notes.length) {
      // the longest notes, never the first, are held over
      const extra = notes.length - slots.length;
      const order = notes.map((n, i) => i).filter((i) => i > 0).sort((a, b) => notes[b].beats - notes[a].beats);
      const heldAt = new Set(order.slice(0, extra));
      const filled = []; let si = 0;
      for (let i = 0; i < notes.length; i++) { if (heldAt.has(i) || si >= slots.length) filled.push({ hold: true }); else filled.push(slots[si++]); }
      slots.length = 0; slots.push(...filled);
    }
    // onto the notes
    let prev = null;
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i], sl = slots[i];
      if (!sl || sl.hold) {
        held++;
        const p = i ? notes[i - 1] : null;
        if (p && p.note === n.note && p.syl != null && !p.gone) { p.beats = +(p.beats + n.beats).toFixed(4); n.gone = true; toRemove.push(ph[i]); notes[i] = p; continue; }   // same pitch: one longer note
        n.syl = prev ? vowelOf(prev) : 'ah';
      } else { n.syl = sl.syl; prev = sl.syl; }
    }
    report.lines.push({ line: li + 1, syllables: syls.length, notes: notes.length, held, merged });
    report.syllables += syls.length; report.held += held; report.merged += merged;
  }
  // phrases past the last line sing la; lines past the last phrase are reported as extra
  for (let k = lines.length; k < phrases.length; k++) for (const i of phrases[k]) if (!voice[i].syl) voice[i].syl = 'l ah';
  for (const i of toRemove.sort((a, b) => b - a)) voice.splice(i, 1);
  for (const v of voice) { delete v.gone; if (v.note != null && !v.syl) v.syl = 'l ah'; }
  for (const l of report.lines) log(`  line ${l.line}: ${l.syllables} syllable${l.syllables === 1 ? '' : 's'}, ${l.notes} note${l.notes === 1 ? '' : 's'}${l.held ? ` (${l.held} held)` : ''}${l.merged ? ` (${l.merged} doubled up)` : ''}${l.extra ? ' - no phrase left for it' : ''}`);
  return report;
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
  // a high shelf: gain in dB above f
  hs(f, db) { const A = Math.pow(10, db / 40), w = 2 * Math.PI * f / SR, c = Math.cos(w), s = Math.sin(w), b = Math.sqrt(A) * s * Math.SQRT2 / 2 * 2, a0 = (A + 1) - (A - 1) * c + b; this.b0 = A * ((A + 1) + (A - 1) * c + b) / a0; this.b1 = -2 * A * ((A - 1) + (A + 1) * c) / a0; this.b2 = A * ((A + 1) + (A - 1) * c - b) / a0; this.a1 = 2 * ((A - 1) - (A + 1) * c) / a0; this.a2 = ((A + 1) - (A - 1) * c - b) / a0; return this; }
  run(x) { const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2; this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y; return y; }
}
let seed = 1234;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 - 0.5; };

// ---------- the parameters ----------
// Every number that shapes the sound, with its range. The defaults are the sound the singer always had; the command line's old
// flags map onto them (--slow tape.speed, --pitch voice.transpose, --wobble voice.wobble, --voice mix.voice, --band mix.band).
// A stage whose default is off (0) is skipped entirely, so the default render is the same samples as before it existed.
export const PARAM_SPECS = [
  // voice
  { key: 'voice.transpose', def: 0, min: -24, max: 24, step: 1, unit: 'st', doc: 'everything moved by this many semitones before singing' },
  { key: 'voice.flatCents', def: -14, min: -60, max: 30, step: 1, unit: 'cents', doc: 'how flat every note is sung; old vocoders sat a touch under' },
  { key: 'voice.vibratoRate', def: 5.4, min: 2, max: 9, step: 0.1, unit: 'Hz', doc: 'vibrato speed' },
  { key: 'voice.vibratoDepth', def: 18, min: 0, max: 80, step: 1, unit: 'cents', doc: 'vibrato depth, before wobble scales it' },
  { key: 'voice.vibratoOnsetMs', def: 0, min: 0, max: 800, step: 10, unit: 'ms', doc: 'vibrato fades in over this long after a note starts (0: from the start)' },
  { key: 'voice.wobble', def: 0.5, min: 0, max: 2, step: 0.01, unit: '', doc: 'scales vibrato and drift together: 0 steady, 1 unsteady, 2 falling apart' },
  { key: 'voice.driftDepth', def: 60, min: 0, max: 200, step: 1, unit: 'cents', doc: 'how far the slow random drift can pull the pitch' },
  { key: 'voice.driftStep', def: 0.002, min: 0, max: 0.02, step: 0.0005, unit: '', doc: 'the random walk step per sample; bigger drifts faster' },
  { key: 'voice.driftDecay', def: 0.9995, min: 0.99, max: 0.99999, step: 0.00001, unit: '', doc: 'how the drift forgets: closer to 1 wanders longer' },
  { key: 'voice.glideMs', def: 70, min: 0, max: 400, step: 5, unit: 'ms', doc: 'portamento into a note from the one before it' },
  { key: 'voice.scoopCents', def: -40, min: -300, max: 100, step: 5, unit: 'cents', doc: 'where a note after a breath starts, relative to its pitch' },
  { key: 'voice.attackMs', def: 20, min: 1, max: 300, step: 1, unit: 'ms', doc: 'the vowel comes in over this long' },
  { key: 'voice.releaseMs', def: 50, min: 1, max: 500, step: 1, unit: 'ms', doc: 'the vowel lets go over this long when the note is not tied on' },
  { key: 'voice.detached', def: 0, min: 0, max: 1, step: 1, unit: '', doc: '1: every note releases, none slurs into the next' },
  { key: 'voice.breath', def: 0.08, min: 0, max: 0.6, step: 0.01, unit: '', doc: 'aspiration noise under the vowel: breathiness' },
  { key: 'voice.formantShift', def: 1, min: 0.6, max: 1.6, step: 0.01, unit: 'x', doc: 'vocal tract length: under 1 is bigger (deeper), over 1 smaller (childlike)' },
  { key: 'voice.bandwidthScale', def: 1, min: 0.4, max: 3, step: 0.05, unit: 'x', doc: 'formant bandwidths: narrow rings, wide mumbles' },
  { key: 'voice.brightness', def: 0, min: -12, max: 12, step: 0.5, unit: 'dB', doc: 'a shelf on the voice above 2.5 kHz' },
  { key: 'voice.consonantLevel', def: 1, min: 0, max: 3, step: 0.05, unit: 'x', doc: 'how loud the consonants are' },
  { key: 'voice.consonantLength', def: 1, min: 0.3, max: 3, step: 0.05, unit: 'x', doc: 'how long the consonants last' },
  { key: 'voice.nasal', def: 1, min: 0, max: 3, step: 0.05, unit: 'x', doc: 'the level of m, n and ng' },
  { key: 'voice.openQuotient', def: 0.4, min: 0.2, max: 0.7, step: 0.01, unit: '', doc: 'the glottal pulse: the opening part of the cycle' },
  { key: 'voice.closingPhase', def: 0.16, min: 0.05, max: 0.3, step: 0.01, unit: '', doc: 'the glottal pulse: the sharp closing part; shorter buzzes harder' },
  { key: 'voice.vowelGlideMs', def: 40, min: 0, max: 300, step: 5, unit: 'ms', doc: 'the mouth moves from the last shape to the new vowel over this long' },
  { key: 'voice.voices', def: 1, min: 1, max: 5, step: 1, unit: '', doc: 'copies of the voice sung together, each a little off (a choir of one)' },
  { key: 'voice.chorusCents', def: 10, min: 0, max: 60, step: 1, unit: 'cents', doc: 'how far apart the copies sit in pitch' },
  { key: 'voice.chorusMs', def: 22, min: 0, max: 120, step: 1, unit: 'ms', doc: 'how far apart the copies sit in time' },
  // tape
  { key: 'tape.speed', def: 1, min: 0.5, max: 1.5, step: 0.005, unit: 'x', doc: 'playback speed: below 1 slows and drops the pitch together' },
  { key: 'tape.wowDepth', def: 0, min: 0, max: 100, step: 1, unit: 'cents', doc: 'slow speed waver' },
  { key: 'tape.wowRate', def: 0.5, min: 0.05, max: 3, step: 0.05, unit: 'Hz', doc: 'how fast the wow goes' },
  { key: 'tape.flutterDepth', def: 0, min: 0, max: 40, step: 0.5, unit: 'cents', doc: 'fast speed waver' },
  { key: 'tape.flutterRate', def: 8, min: 3, max: 30, step: 0.5, unit: 'Hz', doc: 'how fast the flutter goes' },
  { key: 'tape.hiss', def: 0, min: 0, max: 0.1, step: 0.001, unit: '', doc: 'tape hiss level' },
  { key: 'tape.drive', def: 0, min: 0, max: 3, step: 0.05, unit: '', doc: 'saturation before the limiter' },
  { key: 'tape.lowCut', def: 0, min: 0, max: 1000, step: 10, unit: 'Hz', doc: 'nothing below this (0: off)' },
  { key: 'tape.highCut', def: 0, min: 0, max: 16000, step: 100, unit: 'Hz', doc: 'nothing above this (0: off)' },
  // lo-fi
  { key: 'lofi.crushHz', def: 0, min: 0, max: 22050, step: 50, unit: 'Hz', doc: 'sample-rate crush: hold each sample for 44100 / this (0: off)' },
  { key: 'lofi.bits', def: 0, min: 0, max: 16, step: 1, unit: 'bits', doc: 'bit depth (0: off)' },
  { key: 'lofi.ringMod', def: 0, min: 0, max: 1, step: 0.01, unit: '', doc: 'ring modulation amount, the 1961 vocoder flavour' },
  { key: 'lofi.ringHz', def: 110, min: 20, max: 2000, step: 1, unit: 'Hz', doc: 'the ring modulator carrier' },
  // band
  { key: 'band.squareLevel', def: 0.5, min: 0, max: 1.5, step: 0.05, unit: '', doc: 'the organ square wave' },
  { key: 'band.pulseWidth', def: 0.5, min: 0.05, max: 0.95, step: 0.01, unit: '', doc: 'the square wave duty: 0.5 is square, else a pulse' },
  { key: 'band.triLevel', def: 0.7, min: 0, max: 1.5, step: 0.05, unit: '', doc: 'the detuned triangle under the square' },
  { key: 'band.detune', def: 1.003, min: 1, max: 1.03, step: 0.001, unit: 'x', doc: 'the triangle sits this much sharp of the square' },
  { key: 'band.organLevel', def: 0.22, min: 0, max: 1, step: 0.01, unit: '', doc: 'organ level' },
  { key: 'band.organLpHz', def: 1800, min: 300, max: 8000, step: 50, unit: 'Hz', doc: 'the organ low-pass' },
  { key: 'band.bassLevel', def: 0.35, min: 0, max: 1.5, step: 0.01, unit: '', doc: 'bass level' },
  { key: 'band.bassOctave', def: -1, min: -2, max: 1, step: 1, unit: 'oct', doc: 'the bass plays the chord root this many octaves from the lowest note' },
  { key: 'band.voicing', def: 0, min: 0, max: 1, step: 1, unit: '', doc: '0 close, 1 open: the middle note of a triad goes up an octave' },
  { key: 'band.attackMs', def: 30, min: 1, max: 500, step: 1, unit: 'ms', doc: 'each chord comes in over this long' },
  { key: 'band.releaseMs', def: 80, min: 1, max: 1000, step: 1, unit: 'ms', doc: 'each chord lets go over this long' },
  { key: 'band.width', def: 0, min: 0, max: 1, step: 0.05, unit: '', doc: 'the chord notes spread across the stereo field by this much' },
  { key: 'band.drums', def: 0, min: 0, max: 1, step: 1, unit: '', doc: '1: brushes on each beat, a swish on the first of the bar' },
  { key: 'band.drumLevel', def: 0.2, min: 0, max: 1, step: 0.01, unit: '', doc: 'the brushes level' },
  { key: 'band.beatsPerBar', def: 4, min: 2, max: 7, step: 1, unit: '', doc: 'for the drums' },
  // mix
  { key: 'mix.voice', def: 1, min: 0, max: 3, step: 0.05, unit: 'x', doc: 'voice level' },
  { key: 'mix.band', def: 1, min: 0, max: 3, step: 0.05, unit: 'x', doc: 'band level' },
  { key: 'mix.bandBalance', def: 0.55, min: 0.05, max: 2, step: 0.01, unit: '', doc: 'the band against the voice by loudness, before the two levels' },
  { key: 'mix.slapbackMs', def: 90, min: 0, max: 400, step: 1, unit: 'ms', doc: 'the one early reflection the singer always had' },
  { key: 'mix.slapbackLevel', def: 0.18, min: 0, max: 0.8, step: 0.01, unit: '', doc: 'its level' },
  { key: 'mix.roomLevel', def: 0, min: 0, max: 1, step: 0.01, unit: '', doc: 'a room: level of the reverb (0: off)' },
  { key: 'mix.roomSize', def: 0.5, min: 0.1, max: 1, step: 0.01, unit: '', doc: 'the room: 0.1 a closet, 1 a hall' },
  { key: 'mix.roomPredelayMs', def: 20, min: 0, max: 200, step: 1, unit: 'ms', doc: 'the room: time before the reverb starts' },
  { key: 'mix.roomDamping', def: 0.5, min: 0, max: 1, step: 0.01, unit: '', doc: 'the room: how fast the highs die' },
  { key: 'mix.width', def: 0, min: 0, max: 1, step: 0.05, unit: '', doc: 'stereo width of the whole thing (0: the old near-mono)' },
  { key: 'mix.rightGain', def: 0.96, min: 0.5, max: 1, step: 0.01, unit: 'x', doc: 'the right channel a shade under the left, as it always was' },
  { key: 'mix.limiterDrive', def: 1.3, min: 0.5, max: 4, step: 0.05, unit: '', doc: 'how hard the output pushes the soft limiter' },
  { key: 'mix.ceiling', def: 0.95, min: 0.3, max: 1, step: 0.01, unit: '', doc: 'the limiter ceiling' },
  { key: 'mix.master', def: 1, min: 0, max: 3, step: 0.05, unit: 'x', doc: 'master gain before the limiter' },
  { key: 'mix.sampleRate', def: 44100, min: 8000, max: 48000, step: 100, unit: 'Hz', doc: 'the WAV sample rate (resampled at the end when not 44100)' },
];
export const DEFAULT_PARAMS = (() => { const P = {}; for (const s of PARAM_SPECS) { const [g, k] = s.key.split('.'); (P[g] ||= {})[k] = s.def; } return P; })();
export const PARAM_GROUPS = ['voice', 'tape', 'lofi', 'band', 'mix'];
export const specOf = (key) => PARAM_SPECS.find((s) => s.key === key);
// defaults under a partial set (one or two levels deep), with unknown keys dropped and values clamped to their range
export function mergeParams(...parts) {
  const P = JSON.parse(JSON.stringify(DEFAULT_PARAMS));
  for (const part of parts) {
    if (!part) continue;
    for (const g of Object.keys(part)) {
      if (!P[g] || typeof part[g] !== 'object') continue;
      for (const k of Object.keys(part[g])) { const s = specOf(`${g}.${k}`); if (!s) continue; const v = +part[g][k]; if (Number.isFinite(v)) P[g][k] = Math.max(s.min, Math.min(s.max, v)); }
    }
  }
  return P;
}
// "voice.vibratoDepth=12" onto a set, in place
export function setParam(P, key, value) { const [g, k] = key.split('.'); const s = specOf(key); if (!s) throw new Error('no such parameter: ' + key); P[g][k] = Math.max(s.min, Math.min(s.max, +value)); return P; }
// only what differs from the defaults
export function diffParams(P) { const out = {}; for (const s of PARAM_SPECS) { const [g, k] = s.key.split('.'); if (P[g] && P[g][k] !== s.def) (out[g] ||= {})[k] = P[g][k]; } return out; }
// a few named starting points
export const PRESETS = {
  '1961': { tape: { speed: 0.97 }, voice: { wobble: 0.6 } },
  clean: { voice: { wobble: 0 } },
  'drunk tape': { tape: { speed: 0.94, wowDepth: 30, wowRate: 0.35, flutterDepth: 6, flutterRate: 7, hiss: 0.012, drive: 0.5, highCut: 6500 }, voice: { wobble: 0.9, glideMs: 140 } },
  telephone: { tape: { lowCut: 300, highCut: 3400, drive: 0.8, hiss: 0.006 }, lofi: { bits: 10 }, mix: { band: 0.5, slapbackLevel: 0.05 } },
  'choir of one': { voice: { voices: 3, chorusCents: 12, chorusMs: 25, wobble: 0.4 }, mix: { width: 0.6, roomLevel: 0.25, roomSize: 0.7 } },
  vocoder: { lofi: { ringMod: 0.7, ringHz: 110, crushHz: 11025, bits: 8 }, voice: { wobble: 0.2, breath: 0.02, bandwidthScale: 0.7 }, tape: { highCut: 5000 } },
};

// the glottal source: the slope of a Rosenberg pulse, a slow opening and a sharp closure, which is what makes it buzz
function glottal(phase, tp, tn) {
  if (phase < tp) return Math.sin(Math.PI * phase / tp) * (tn / tp);   // scaled so the pulse has no dc
  if (phase < tp + tn) return -Math.sin(Math.PI * (phase - tp) / (2 * tn));
  return 0;
}

// ---------- the voice ----------
// the timeline first: each sung note becomes [consonant bursts][vowel glide][consonant bursts], legato into the next note
function renderVoice(voice, notes, V, progress, centsOffset = 0) {
  const res = [new Reson(), new Reson(), new Reson(), new Reson()];
  const asp = new Biquad().bp(2000, 0.5);
  const tp = V.openQuotient, tn = V.closingPhase;
  let t0 = 0, phase = 0, lastF = [500, 1500, 2500], vib = 0, drift = 0, lastF0 = 0;
  const seg = (a, b, k) => a + (b - a) * k;
  const glideN = V.glideMs / 1000 * SR, attackN = V.attackMs / 1000 * SR, releaseN = V.releaseMs / 1000 * SR, mouthN = V.vowelGlideMs / 1000 * SR, onsetN = V.vibratoOnsetMs / 1000 * SR;
  const flat = Math.pow(2, V.flatCents / 1200), scoop = Math.pow(2, V.scoopCents / 1200), off = centsOffset ? Math.pow(2, centsOffset / 1200) : 1;
  for (let ni = 0; ni < notes.length; ni++) {
    const n = notes[ni], p = parse(n.syl), next = notes[ni + 1];
    const start = Math.floor(t0 * SR), end = Math.floor((t0 + n.dur) * SR);
    t0 += n.dur;
    if (progress && (ni & 3) === 0) progress(ni / notes.length);
    if (n.m == null) { lastF = [500, 1500, 2500]; lastF0 = 0; continue; }
    // the vowel owns the middle of the note; onset consonants take the front, coda consonants the tail
    const onsetDur = Math.min(n.dur * 0.3, p.onset.reduce((a, c) => a + CONS[c].dur * V.consonantLength, 0));
    const codaDur = Math.min(n.dur * 0.25, p.coda.reduce((a, c) => a + CONS[c].dur * V.consonantLength, 0));
    const vStart = start + Math.floor(onsetDur * SR), vEnd = end - Math.floor(codaDur * SR);
    const f0 = hz(n.m) * flat * off;   // a touch flat, the way the old vocoders sang
    const vowelF = p.vowel.map((v) => VOWELS[v] || VOWELS.ah);
    const legato = !V.detached && !!next && next.m != null && p.coda.length === 0;
    // onset consonants
    let c0 = start;
    for (const c of p.onset) { const d = Math.floor(CONS[c].dur * V.consonantLength * SR); consonant(voice, c, c0, Math.min(c0 + d, vStart), f0, lastF, V); c0 += d; }
    // the vowel
    for (let i = vStart; i < vEnd; i++) {
      const k = (i - vStart) / Math.max(1, vEnd - vStart);
      const at = k * (vowelF.length - 1), j = Math.min(vowelF.length - 2, Math.floor(at)), kk = vowelF.length > 1 ? at - j : 0;
      const target = vowelF.length > 1 ? vowelF[j].map((f, x) => seg(f, vowelF[j + 1][x], kk)) : vowelF[0];
      // glide in from the last mouth shape over the first 40 ms
      const gi = mouthN > 0 ? Math.min(1, (i - vStart) / mouthN) : 1;
      const F = target.map((f, x) => seg(lastF[x], f, gi));
      if (i === vEnd - 1) lastF = target.slice();
      // pitch: slow vibrato plus a random walk, scaled by wobble
      vib += 2 * Math.PI * V.vibratoRate / SR; drift += rnd() * V.driftStep; drift *= V.driftDecay;
      // slur in from the previous note over 70 ms, or scoop up from below after a breath
      const gl = glideN > 0 ? Math.min(1, (i - vStart) / glideN) : 1;
      const from = lastF0 || f0 * scoop;
      const vibAmt = onsetN > 0 ? Math.min(1, (i - vStart) / onsetN) : 1;
      const cents = V.wobble * (V.vibratoDepth * Math.sin(vib) * vibAmt + V.driftDepth * drift);
      const f = seg(from, f0, gl) * Math.pow(2, cents / 1200);
      phase += f / SR; if (phase >= 1) phase -= 1;
      const dsrc = glottal(phase, tp, tn);   // the formants carve the buzz into a vowel
      const breath = asp.run(rnd()) * V.breath;
      let y = 0;
      for (let x = 0; x < 3; x++) { res[x].set(F[x] * V.formantShift, BW[x] * V.bandwidthScale); y += res[x].run(dsrc) * (x === 0 ? 1 : x === 1 ? 0.85 : 0.5); }
      res[3].set(3300 * V.formantShift, BW[3] * V.bandwidthScale); y += res[3].run(dsrc) * 0.2;
      y += breath;
      // envelope: fast in, held, and a short release unless the next note is tied straight on
      const a = Math.min(1, (i - vStart) / attackN), r = legato ? 1 : Math.min(1, (vEnd - i) / releaseN);
      voice[i] += y * a * r * 0.9;
    }
    lastF0 = legato ? f0 : 0;
    // coda consonants
    let c1 = vEnd;
    for (const c of p.coda) { const d = Math.floor(CONS[c].dur * V.consonantLength * SR); consonant(voice, c, c1, Math.min(c1 + d, end), f0, lastF, V); c1 += d; }
  }
}

function consonant(voice, c, s, e, f0, mouth, V) {
  const spec = CONS[c]; if (!spec || e <= s) return;
  const filt = spec.hp ? new Biquad().hp(spec.hp, 0.7) : new Biquad().bp(spec.bp, spec.q || 1);
  const len = e - s;
  if (spec.k === 'noise' || spec.k === 'burst') {
    const amp = (spec.k === 'burst' ? 1.2 : spec.soft ? 0.4 : 0.75) * V.consonantLevel;
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
    const level = spec.k === 'nasal' ? 0.45 * V.nasal : 0.7 * V.consonantLevel;
    for (let i = s; i < e; i++) {
      const k = (i - s) / len, F = spec.f.map((f, x) => mouth[x] + (f - mouth[x]) * Math.sin(Math.PI * k));
      phase += f0 / SR; if (phase >= 1) phase -= 1;
      const src = glottal(phase, V.openQuotient, V.closingPhase);
      let y = 0;
      for (let x = 0; x < 3; x++) { res[x].set(F[x] * V.formantShift, BW[x] * V.bandwidthScale * (spec.k === 'nasal' ? 1.6 : 1)); y += res[x].run(src) * (x === 0 ? 1 : 0.4); }
      voice[i] += y * level;
    }
  }
}

// ---------- the band: a small organ and a soft bass ----------
function renderBand(band, bandR, song, beat, pitch, B, progress) {
  let t0 = 0;
  const lp = new Biquad().lp(B.organLpHz, 0.6), blp = new Biquad().lp(300, 0.7);
  const chords = song.chords || [];
  const attackN = B.attackMs / 1000 * SR, releaseN = B.releaseMs / 1000 * SR;
  chords.forEach((ch, ci) => {
    const dur = ch.beats * beat, s = Math.floor(t0 * SR), e = Math.floor((t0 + dur) * SR); t0 += dur;
    if (progress && (ci & 7) === 0) progress(ci / chords.length);
    let ms = ch.notes.map((n) => midi(n, pitch)).filter((m) => m != null); if (!ms.length) return;
    if (B.voicing && ms.length >= 3) { ms = ms.slice().sort((a, b) => a - b); ms[1] += 12; }
    const ph = ms.map(() => 0), ph2 = ms.map(() => 0);
    const pans = ms.map((m, j) => (ms.length > 1 ? (j / (ms.length - 1) - 0.5) * 2 * B.width : 0));
    const bass = hz(Math.min(...ms) + 12 * B.bassOctave); let bp = 0;
    for (let i = s; i < e; i++) {
      const k = (i - s) / (e - s), env = Math.min(1, (i - s) / attackN) * Math.min(1, (e - i) / releaseN);
      let y = 0, yr = 0;
      for (let j = 0; j < ms.length; j++) {
        const f = hz(ms[j]);
        ph[j] += f / SR; if (ph[j] >= 1) ph[j] -= 1;
        ph2[j] += f * B.detune / SR; if (ph2[j] >= 1) ph2[j] -= 1;
        const v = (ph[j] < B.pulseWidth ? 1 : -1) * B.squareLevel + (1 - 4 * Math.abs(ph2[j] - 0.5)) * B.triLevel;   // square and a slightly detuned triangle
        y += v;
        if (bandR) yr += v * pans[j];   // the side signal, when the chord is spread
      }
      y = lp.run(y / ms.length) * B.organLevel * env;
      bp += bass / SR; if (bp >= 1) bp -= 1;
      y += blp.run(1 - 4 * Math.abs(bp - 0.5)) * B.bassLevel * env * (0.6 + 0.4 * Math.max(0, 1 - k * 2));
      band[i] += y;
      if (bandR) bandR[i] += yr / ms.length * B.organLevel * env;
    }
  });
}

// brushes: a soft swish of noise on every beat, longer on the first of the bar
function renderDrums(drums, song, beat, B) {
  const total = (song.chords || []).reduce((a, c) => a + c.beats * beat, 0), hp = new Biquad().hp(1800, 0.7);
  const n = Math.floor(total / beat);
  for (let b = 0; b < n; b++) {
    const s = Math.floor(b * beat * SR), len = Math.floor((b % B.beatsPerBar === 0 ? 0.22 : 0.09) * SR);
    for (let i = 0; i < len && s + i < drums.length; i++) { const k = i / len; drums[s + i] += hp.run(rnd() * 2) * Math.sin(Math.PI * k) * Math.exp(-k * 2.5) * B.drumLevel; }
  }
}

// a cut of the song between two moments in seconds (by its own beats, before the tape speed), for a quick listen
export function sliceSong(song, from = 0, to = Infinity) {
  const beat = 60 / (song.bpm || 96), cut = (list) => {
    const out = []; let t = 0;
    for (const e of list) {
      const s = t, en = t + e.beats * beat; t = en;
      const a = Math.max(s, from), b = Math.min(en, to);
      if (b - a <= 1e-6) continue;
      out.push({ ...e, beats: +((b - a) / beat).toFixed(4) });
    }
    return out;
  };
  return { ...song, voice: cut(song.voice), chords: cut(song.chords || []) };
}

// ---------- the whole thing ----------
// render(song, options) -> a mono Float64Array at SR, after the tape and the room, before the limiter (see toStereo / encodeWav),
// or with .right set when the mix is stereo (band spread, chorus, width). Options: the old flags (slow, pitch, wobble, voice, band),
// params (a partial parameter set over the defaults, see PARAM_SPECS), progress(k, stage). Same song and options, same samples.
export function resolveParams({ slow, pitch, wobble, voice, band, params } = {}) {
  const P = mergeParams(params);
  if (slow != null && slow !== 1) P.tape.speed = slow;
  if (pitch != null && pitch !== 0) P.voice.transpose = pitch;
  if (wobble != null && wobble !== 0.5) P.voice.wobble = wobble;
  if (voice != null && voice !== 1) P.mix.voice = voice;
  if (band != null && band !== 1) P.mix.band = band;
  return P;
}
export function render(song, opts = {}) {
  const P = resolveParams(opts), V = P.voice, B = P.band, T = P.tape, L = P.lofi, M = P.mix, progress = opts.progress || null;
  seed = 1234;
  const beat = 60 / (song.bpm || 96), pitch = V.transpose;
  const notes = [];
  for (const n of song.voice) {
    const syl = n.syl || 'ah', m = midi(n.note, pitch), dur = n.beats * beat;
    if (m == null || !syl.includes('+')) { notes.push({ m, dur, syl }); continue; }
    const parts = syl.split('+').filter(Boolean), w = parts.map((p) => Math.max(1, p.replace(/\s/g, '').length)), tot = w.reduce((a, b) => a + b, 0);
    parts.forEach((p, i) => notes.push({ m, dur: dur * w[i] / tot, syl: p }));   // two syllables on one note: each gets its share
  }
  const totalV = notes.reduce((a, n) => a + n.dur, 0);
  const totalC = (song.chords || []).reduce((a, c) => a + c.beats * beat, 0);
  const total = Math.max(totalV, totalC) + 1.5;
  const N = Math.ceil(total * SR);
  const voice = new Float64Array(N), band = new Float64Array(N);
  const stereo = B.width > 0 || V.voices > 1 || M.width > 0;
  const voiceR = stereo ? new Float64Array(N) : null, bandR = B.width > 0 ? new Float64Array(N) : null;
  if (V.voices <= 1) renderVoice(voice, notes, V, progress && ((k) => progress(k * 0.8, 'voice')));
  else {   // a choir of one: each copy a little off in pitch and time, spread left to right
    const copies = V.voices;
    for (let c = 0; c < copies; c++) {
      const tmp = new Float64Array(N), spread = copies > 1 ? (c / (copies - 1) - 0.5) * 2 : 0;
      seed = 1234 + c * 7919;
      renderVoice(tmp, notes, V, progress && ((k) => progress((c + k) / copies * 0.8, 'voice')), spread * V.chorusCents);
      const shift = Math.round(spread * V.chorusMs / 1000 * SR), gl = 0.5 - spread * 0.4, gr = 0.5 + spread * 0.4;
      for (let i = 0; i < N; i++) { const v = tmp[i - shift] || 0; voice[i] += v * gl / copies * 1.6; voiceR[i] += v * gr / copies * 1.6; }
    }
  }
  renderBand(band, bandR, song, beat, pitch, B, progress && ((k) => progress(0.8 + k * 0.2, 'band')));
  if (B.drums) renderDrums(band, song, beat, B);
  if (V.brightness) { const sh = new Biquad().hs(2500, V.brightness); for (let i = 0; i < N; i++) voice[i] = sh.run(voice[i]); if (voiceR && V.voices > 1) { const sh2 = new Biquad().hs(2500, V.brightness); for (let i = 0; i < N; i++) voiceR[i] = sh2.run(voiceR[i]); } }
  // the voice is normalised to its peak; the band is set by loudness, about 5 dB under it
  let mix = new Float64Array(N), mixR = stereo ? new Float64Array(N) : null;
  let pk = 0, sv = 0, sb = 0;
  for (let i = 0; i < N; i++) { pk = Math.max(pk, Math.abs(voice[i])); sv += voice[i] * voice[i]; sb += band[i] * band[i]; }
  const vg = pk > 0 ? 0.6 / pk : 1;
  const bg = sb > 0 && sv > 0 ? Math.sqrt(sv / sb) * vg * M.bandBalance : 1;
  for (let i = 0; i < N; i++) mix[i] = voice[i] * vg * M.voice + band[i] * bg * M.band;
  if (mixR) for (let i = 0; i < N; i++) mixR[i] = (voiceR && V.voices > 1 ? voiceR[i] : voice[i]) * vg * M.voice + (band[i] + (bandR ? bandR[i] : 0)) * bg * M.band;
  const post = (x) => {
    if (T.speed !== 1) {   // resample: slower playback drops the pitch with it
      const Mn = Math.floor(x.length / T.speed), out = new Float64Array(Mn);
      for (let i = 0; i < Mn; i++) { const p = i * T.speed, j = Math.floor(p), k = p - j; out[i] = (x[j] || 0) * (1 - k) + (x[j + 1] || 0) * k; }
      x = out;
    }
    if (T.wowDepth > 0 || T.flutterDepth > 0) {   // the speed wavers: read the tape through a moving delay
      const out = new Float64Array(x.length), maxDev = 0.03 * SR; let ph1 = 0, ph2 = 0;
      for (let i = 0; i < x.length; i++) {
        ph1 += 2 * Math.PI * T.wowRate / SR; ph2 += 2 * Math.PI * T.flutterRate / SR;
        const cents = T.wowDepth * Math.sin(ph1) + T.flutterDepth * Math.sin(ph2);   // a speed change is a slowly moving delay
        const d = Math.max(-maxDev, Math.min(maxDev, -cents / 1200 * SR * 0.02)), p = i + d, j = Math.floor(p), k = p - j;
        out[i] = (x[j] || 0) * (1 - k) + (x[j + 1] || 0) * k;
      }
      x = out;
    }
    if (T.hiss > 0) { const f = new Biquad().hp(3000, 0.5); for (let i = 0; i < x.length; i++) x[i] += f.run(rnd() * 2) * T.hiss; }
    if (T.drive > 0) { const g = 1 + T.drive * 3; for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * g) / Math.tanh(g * 0.6) * 0.6; }
    if (T.lowCut > 0) { const f = new Biquad().hp(T.lowCut, 0.7); for (let i = 0; i < x.length; i++) x[i] = f.run(x[i]); }
    if (T.highCut > 0 && T.highCut < SR / 2) { const f = new Biquad().lp(T.highCut, 0.7); for (let i = 0; i < x.length; i++) x[i] = f.run(x[i]); }
    if (L.ringMod > 0) { let ph = 0; for (let i = 0; i < x.length; i++) { ph += 2 * Math.PI * L.ringHz / SR; x[i] = x[i] * (1 - L.ringMod) + x[i] * Math.sin(ph) * L.ringMod; } }
    if (L.crushHz > 0 && L.crushHz < SR) { const hold = SR / L.crushHz; let acc = 0, last = 0; for (let i = 0; i < x.length; i++) { acc += 1; if (acc >= hold) { acc -= hold; last = x[i]; } x[i] = last; } }
    if (L.bits > 0 && L.bits < 24) { const q = Math.pow(2, L.bits - 1); for (let i = 0; i < x.length; i++) x[i] = Math.round(x[i] * q) / q; }
    // a little room: a short slapback
    const d = Math.floor(M.slapbackMs / 1000 * SR);
    if (d > 0 && M.slapbackLevel > 0) for (let i = d; i < x.length; i++) x[i] += x[i - d] * M.slapbackLevel;
    if (M.roomLevel > 0) {   // four combs and a damped feedback, the plainest room there is
      const pre = Math.floor(M.roomPredelayMs / 1000 * SR), taps = [29.7, 37.1, 41.1, 43.7].map((ms) => Math.floor(ms * (0.5 + M.roomSize * 1.5) / 1000 * SR)), fb = 0.6 + M.roomSize * 0.3;
      const bufs = taps.map((t) => new Float64Array(t)), lows = taps.map(() => 0), damp = M.roomDamping * 0.5;
      const out = new Float64Array(x.length);
      for (let i = 0; i < x.length; i++) {
        const inp = i >= pre ? x[i - pre] : 0; let y = 0;
        for (let c = 0; c < 4; c++) { const b = bufs[c], p = i % taps[c], v = b[p]; lows[c] += (v - lows[c]) * (1 - damp); b[p] = inp + lows[c] * fb; y += v; }
        out[i] = x[i] + y * 0.25 * M.roomLevel;
      }
      x = out;
    }
    if (M.master !== 1) for (let i = 0; i < x.length; i++) x[i] *= M.master;
    return x;
  };
  mix = post(mix);
  if (mixR) { seed = 4321; mixR = post(mixR); }
  if (M.width > 0 && !mixR) { mixR = new Float64Array(mix.length); const d = Math.floor(0.012 * SR); for (let i = 0; i < mix.length; i++) mixR[i] = mix[i] * (1 - M.width * 0.5) + (mix[i - d] || 0) * M.width * 0.5; }
  if (M.sampleRate !== SR) { mix = resampleTo(mix, SR, M.sampleRate); if (mixR) mixR = resampleTo(mixR, SR, M.sampleRate); }
  mix.sampleRate = M.sampleRate; mix.right = mixR; mix.params = P;
  if (progress) progress(1, 'done');
  return mix;
}
function resampleTo(x, from, to) { const n = Math.floor(x.length * to / from), out = new Float64Array(n), r = from / to; for (let i = 0; i < n; i++) { const p = i * r, j = Math.floor(p), k = p - j; out[i] = (x[j] || 0) * (1 - k) + (x[j + 1] || 0) * k; } return out; }

// the soft limiter, and the right channel a shade under the left
const limit = (v, drive = 1.3, ceiling = 0.95) => Math.max(-1, Math.min(1, Math.tanh(v * drive) * ceiling));
export function toStereo(mix) {
  const M = (mix.params || DEFAULT_PARAMS).mix, L = new Float32Array(mix.length), R = new Float32Array(mix.length);
  for (let i = 0; i < mix.length; i++) { L[i] = limit(mix[i], M.limiterDrive, M.ceiling); R[i] = mix.right ? limit(mix.right[i], M.limiterDrive, M.ceiling) : L[i] * M.rightGain; }
  return [L, R];
}

// 16-bit stereo WAV
export function encodeWav(mix) {
  const M = (mix.params || DEFAULT_PARAMS).mix, sr = mix.sampleRate || SR;
  const out = new Uint8Array(44 + mix.length * 4), dv = new DataView(out.buffer);
  const tag = (p, s) => { for (let i = 0; i < 4; i++) out[p + i] = s.charCodeAt(i); };
  tag(0, 'RIFF'); dv.setUint32(4, 36 + mix.length * 4, true); tag(8, 'WAVE'); tag(12, 'fmt '); dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); dv.setUint16(22, 2, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true);
  tag(36, 'data'); dv.setUint32(40, mix.length * 4, true);
  for (let i = 0, p = 44; i < mix.length; i++, p += 4) {
    const s = limit(mix[i], M.limiterDrive, M.ceiling) * 32767;
    const r = mix.right ? limit(mix.right[i], M.limiterDrive, M.ceiling) * 32767 : s * M.rightGain;
    dv.setInt16(p, s | 0, true); dv.setInt16(p + 2, r | 0, true);
  }
  return out;
}
