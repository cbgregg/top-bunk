#!/usr/bin/env node
// Sings a song file the way an early computer did: a buzzing glottal pulse pushed through vowel formant filters, consonants as
// short noise bursts, every note slightly flat and wobbly, over a plain organ and bass. No dependencies. The synthesis is in
// sing_core.js, which robot-voice.html uses too.
//
//   node tools/sing.js song.json --out out.wav [--slow 0.97] [--pitch -1] [--wobble 0.5] [--voice 1] [--band 0.8]
//   node tools/sing.js --midi song.mid --lyrics words.txt --out out.wav [--melody-track N] [--chord-track N,N] [--out-json song.json]
//   node tools/sing.js --midi song.mid --words words.txt --out out.wav [--phrase-rest 0.4] [--trim 4] [--guess-chords]
//   node tools/sing.js song.json --out out.wav --preset "drunk tape" --params mine.json --set voice.vibratoDepth=12 --from 10 --to 25
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
// --words words.txt: plain lyrics instead, a line per phrase; words are split into syllables and each line is laid on the phrase
//   the melody's rests cut (--phrase-rest B: a rest of B beats or more, default 0.4). Extra notes hold the vowel before them,
//   extra syllables double up on a note. Hyphens, "_" and "[sounds]" still work inside it.
// --trim N: a note held longer than N beats is cut there and the rest of it becomes a rest (transcriptions leave phrase ends droning).
// --guess-chords: a chord per bar from the melody and its key, for a file with no band (or instead of the file's band).
// --out-json song.json: also write the parsed song in the format above, to edit and sing again from the song file.
//   --slow F     tape speed; below 1 slows and drops the pitch together (0.97 = the dying-computer feel)
//   --pitch N    transpose everything N semitones before singing
//   --wobble W   0..1, how unsteady the pitch is (default 0.5)
//   --voice V    voice level, --band V organ and bass level (both default 1; the band sits a few dB under the voice)
//   --preset NAME        a named starting point (1961, clean, drunk tape, telephone, choir of one, vocoder)
//   --params file.json   a parameter set (partial; it goes over the defaults and the preset), see tools/voice-params.md
//   --set key=value      one parameter, repeatable (voice.vibratoDepth=12); --dump-params prints the set in use as JSON and stops
//   --from S --to S      sing only this stretch of the song, in seconds of the song's own time (before the tape speed)
import fs from 'node:fs';
import { SR, songFromMidi, songFromNotes, notesFromVoice, trimLongNotes, songText, render, encodeWav, sliceSong, mergeParams, setParam, resolveParams, PRESETS } from './sing_core.js';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 && i + 1 < args.length ? args[i + 1] : d; };
const songFile = args.find((a) => !a.startsWith('--') && (args.indexOf(a) === 0 || !args[args.indexOf(a) - 1].startsWith('--')));
const MIDI = opt('--midi', null), LYRICS = opt('--lyrics', null), WORDS = opt('--words', null), OUT_JSON = opt('--out-json', null);
const TRIM = +opt('--trim', 0) || 0, GUESS = args.includes('--guess-chords'), REST = +opt('--phrase-rest', 0.4) || 0.4;
if (!songFile && !MIDI) { console.error('usage: node tools/sing.js song.json --out out.wav\n       node tools/sing.js --midi song.mid --lyrics words.txt --out out.wav'); process.exit(1); }
const OUT = opt('--out', 'song.wav');
// the parameter set: defaults, then the preset, then the file, then every --set, then the old flags on top
let params = mergeParams(opt('--preset', null) ? PRESETS[opt('--preset', null)] || (() => { console.error(`no preset "${opt('--preset', null)}"; have: ${Object.keys(PRESETS).join(', ')}`); process.exit(2); })() : null, opt('--params', null) ? JSON.parse(fs.readFileSync(opt('--params', null), 'utf8')) : null);
for (let i = 0; i < args.length; i++) if (args[i] === '--set' && args[i + 1]) { const [k, v] = args[++i].split('='); setParam(params, k, v); }
const flags = { slow: +opt('--slow', 1), pitch: +opt('--pitch', 0), wobble: +opt('--wobble', 0.5), voice: +opt('--voice', 1), band: +opt('--band', 1) };
if (args.includes('--dump-params')) { console.log(JSON.stringify(resolveParams({ ...flags, params }), null, 2)); process.exit(0); }
const tracks = (k) => (opt(k, '') + '').split(',').map((x) => +x).filter((x) => x > 0);

let song = MIDI
  ? songFromMidi(fs.readFileSync(MIDI), { name: MIDI, lyrics: LYRICS ? fs.readFileSync(LYRICS, 'utf8') : null, melodyTrack: tracks('--melody-track')[0] || 0, chordTracks: tracks('--chord-track'), log: (s) => console.error(s) }).song
  : JSON.parse(fs.readFileSync(songFile, 'utf8'));
if (MIDI) console.error('  (another track sings with --melody-track N; --chord-track N,N picks the band)');
if (WORDS || TRIM || GUESS) {   // through the notes: the same path the page takes
  const notes = notesFromVoice(song.voice, song.bpm || 96);
  if (TRIM) console.error(`  ${trimLongNotes(notes, song.bpm || 96, TRIM)} notes trimmed to ${TRIM} beats`);
  song = songFromNotes(notes, { bpm: song.bpm || 96, quantize: 0, chords: GUESS, band: song.chords, lyrics: WORDS ? fs.readFileSync(WORDS, 'utf8') : null, restBeats: REST, log: (s) => console.error(s) }).song;
}
if (OUT_JSON) {
  fs.writeFileSync(OUT_JSON, songText(song));
  console.error(`${OUT_JSON}: ${song.voice.length} voice entries, ${(song.chords || []).length} chord blocks`);
}
if (opt('--from', null) != null || opt('--to', null) != null) song = sliceSong(song, +opt('--from', 0) || 0, opt('--to', null) != null ? +opt('--to', 0) : Infinity);
const mix = render(song, { ...flags, params });
fs.writeFileSync(OUT, encodeWav(mix));
console.log(`${OUT}: ${(mix.length / SR).toFixed(1)} s, ${song.voice.length} notes`);
