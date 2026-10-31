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
export function songFromNotes(notes, { bpm = 96, quantize = 2, chords = true, barBeats = 4, lyrics = null, key = null, offset = null, log = () => {} } = {}) {
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
  const song = { bpm: +bpm.toFixed(3), key: k.name, voice, chords: chords ? chordsFromMelody(kept, k, bpm, barBeats, totalBeats) : [] };
  log(`melody: ${kept.length} notes, ${bpm} bpm, ${k.name}${g ? `, snapped to ${quantize === 1 ? 'beats' : quantize === 2 ? 'half beats' : 'quarter beats'}` : ''}${chords ? `, ${song.chords.length} bars of chords` : ''}`);
  const words = applyLyrics(voice, lyrics, log);
  return { song, key: k, words };
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
// the timeline first: each sung note becomes [consonant bursts][vowel glide][consonant bursts], legato into the next note
function renderVoice(voice, notes, wobble, progress) {
  const res = [new Reson(), new Reson(), new Reson(), new Reson()];
  const asp = new Biquad().bp(2000, 0.5);
  let t0 = 0, phase = 0, lastF = [500, 1500, 2500], vib = 0, drift = 0, lastF0 = 0;
  const seg = (a, b, k) => a + (b - a) * k;
  for (let ni = 0; ni < notes.length; ni++) {
    const n = notes[ni], p = parse(n.syl), next = notes[ni + 1];
    const start = Math.floor(t0 * SR), end = Math.floor((t0 + n.dur) * SR);
    t0 += n.dur;
    if (progress && (ni & 3) === 0) progress(ni / notes.length);
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
    for (const c of p.onset) { const d = Math.floor(CONS[c].dur * SR); consonant(voice, c, c0, Math.min(c0 + d, vStart), f0, lastF); c0 += d; }
    // the vowel
    for (let i = vStart; i < vEnd; i++) {
      const k = (i - vStart) / Math.max(1, vEnd - vStart);
      const at = k * (vowelF.length - 1), j = Math.min(vowelF.length - 2, Math.floor(at)), kk = vowelF.length > 1 ? at - j : 0;
      const target = vowelF.length > 1 ? vowelF[j].map((f, x) => seg(f, vowelF[j + 1][x], kk)) : vowelF[0];
      // glide in from the last mouth shape over the first 40 ms
      const gi = Math.min(1, (i - vStart) / (0.04 * SR));
      const F = target.map((f, x) => seg(lastF[x], f, gi));
      if (i === vEnd - 1) lastF = target.slice();
      // pitch: slow vibrato plus a random walk, scaled by wobble
      vib += 2 * Math.PI * 5.4 / SR; drift += rnd() * 0.002; drift *= 0.9995;
      // slur in from the previous note over 70 ms, or scoop up from below after a breath
      const gl = Math.min(1, (i - vStart) / (0.07 * SR));
      const from = lastF0 || f0 * Math.pow(2, -40 / 1200);
      const cents = wobble * (18 * Math.sin(vib) + 60 * drift);
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
    for (const c of p.coda) { const d = Math.floor(CONS[c].dur * SR); consonant(voice, c, c1, Math.min(c1 + d, end), f0, lastF); c1 += d; }
  }
}

function consonant(voice, c, s, e, f0, mouth) {
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
function renderBand(band, song, beat, pitch, progress) {
  let t0 = 0;
  const lp = new Biquad().lp(1800, 0.6), blp = new Biquad().lp(300, 0.7);
  const chords = song.chords || [];
  chords.forEach((ch, ci) => {
    const dur = ch.beats * beat, s = Math.floor(t0 * SR), e = Math.floor((t0 + dur) * SR); t0 += dur;
    if (progress && (ci & 7) === 0) progress(ci / chords.length);
    const ms = ch.notes.map((n) => midi(n, pitch)).filter((m) => m != null); if (!ms.length) return;
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
  });
}

// ---------- the whole thing ----------
// render(song, options) -> a mono Float64Array at SR, after the tape speed and the room, before the limiter (see toStereo / encodeWav).
//   slow    tape speed; below 1 slows and drops the pitch together (0.97 = the dying-computer feel)
//   pitch   transpose everything N semitones before singing
//   wobble  0..1, how unsteady the pitch is
//   voice / band   the two levels (the band sits a few dB under the voice at 1)
//   progress(k, stage)   0..1 as it goes, stage 'voice' or 'band'
// The same song and options always give the same samples.
export function render(song, { slow = 1, pitch = 0, wobble = 0.5, voice: voiceLevel = 1, band: bandLevel = 1, progress = null } = {}) {
  seed = 1234;
  const beat = 60 / (song.bpm || 96);
  const notes = song.voice.map((n) => ({ m: midi(n.note, pitch), dur: n.beats * beat, syl: n.syl || 'ah' }));
  const totalV = notes.reduce((a, n) => a + n.dur, 0);
  const totalC = (song.chords || []).reduce((a, c) => a + c.beats * beat, 0);
  const total = Math.max(totalV, totalC) + 1.5;
  const N = Math.ceil(total * SR);
  const voice = new Float64Array(N), band = new Float64Array(N);
  renderVoice(voice, notes, wobble, progress && ((k) => progress(k * 0.8, 'voice')));
  renderBand(band, song, beat, pitch, progress && ((k) => progress(0.8 + k * 0.2, 'band')));
  // the voice is normalised to its peak; the band is set by loudness, about 5 dB under it
  let mix = new Float64Array(N);
  let pk = 0, sv = 0, sb = 0;
  for (let i = 0; i < N; i++) { pk = Math.max(pk, Math.abs(voice[i])); sv += voice[i] * voice[i]; sb += band[i] * band[i]; }
  const vg = pk > 0 ? 0.6 / pk : 1;
  const bg = sb > 0 && sv > 0 ? Math.sqrt(sv / sb) * vg * 0.55 : 1;
  for (let i = 0; i < N; i++) mix[i] = voice[i] * vg * voiceLevel + band[i] * bg * bandLevel;
  if (slow !== 1) {   // resample: slower playback drops the pitch with it
    const M = Math.floor(N / slow), out = new Float64Array(M);
    for (let i = 0; i < M; i++) { const p = i * slow, j = Math.floor(p), k = p - j; out[i] = (mix[j] || 0) * (1 - k) + (mix[j + 1] || 0) * k; }
    mix = out;
  }
  // a little room: a short slapback
  const d = Math.floor(0.09 * SR);
  for (let i = d; i < mix.length; i++) mix[i] += mix[i - d] * 0.18;
  if (progress) progress(1, 'done');
  return mix;
}

// the soft limiter, and the right channel a shade under the left
const limit = (v) => Math.max(-1, Math.min(1, Math.tanh(v * 1.3) * 0.95));
export function toStereo(mix) {
  const L = new Float32Array(mix.length), R = new Float32Array(mix.length);
  for (let i = 0; i < mix.length; i++) { const v = limit(mix[i]); L[i] = v; R[i] = v * 0.96; }
  return [L, R];
}

// 16-bit stereo WAV
export function encodeWav(mix) {
  const out = new Uint8Array(44 + mix.length * 4), dv = new DataView(out.buffer);
  const tag = (p, s) => { for (let i = 0; i < 4; i++) out[p + i] = s.charCodeAt(i); };
  tag(0, 'RIFF'); dv.setUint32(4, 36 + mix.length * 4, true); tag(8, 'WAVE'); tag(12, 'fmt '); dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); dv.setUint16(22, 2, true); dv.setUint32(24, SR, true); dv.setUint32(28, SR * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true);
  tag(36, 'data'); dv.setUint32(40, mix.length * 4, true);
  for (let i = 0, p = 44; i < mix.length; i++, p += 4) {
    const s = limit(mix[i]) * 32767;
    dv.setInt16(p, s | 0, true); dv.setInt16(p + 2, (s * 0.96) | 0, true);
  }
  return out;
}
