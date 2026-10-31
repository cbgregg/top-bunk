#!/usr/bin/env node
// Sings a song file the way an early computer did: a buzzing glottal pulse pushed through vowel formant filters, consonants as
// short noise bursts, every note slightly flat and wobbly, over a plain organ and bass. No dependencies. The synthesis is in
// sing_core.js, which robot-voice.html uses too.
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
import fs from 'node:fs';
import { SR, songFromMidi, songText, render, encodeWav } from './sing_core.js';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 && i + 1 < args.length ? args[i + 1] : d; };
const songFile = args.find((a) => !a.startsWith('--') && (args.indexOf(a) === 0 || !args[args.indexOf(a) - 1].startsWith('--')));
const MIDI = opt('--midi', null), LYRICS = opt('--lyrics', null), OUT_JSON = opt('--out-json', null);
if (!songFile && !MIDI) { console.error('usage: node tools/sing.js song.json --out out.wav\n       node tools/sing.js --midi song.mid --lyrics words.txt --out out.wav'); process.exit(1); }
const OUT = opt('--out', 'song.wav');
const tracks = (k) => (opt(k, '') + '').split(',').map((x) => +x).filter((x) => x > 0);

const song = MIDI
  ? songFromMidi(fs.readFileSync(MIDI), { name: MIDI, lyrics: LYRICS ? fs.readFileSync(LYRICS, 'utf8') : null, melodyTrack: tracks('--melody-track')[0] || 0, chordTracks: tracks('--chord-track'), log: (s) => console.error(s) }).song
  : JSON.parse(fs.readFileSync(songFile, 'utf8'));
if (MIDI) console.error('  (another track sings with --melody-track N; --chord-track N,N picks the band)');
if (OUT_JSON) {
  fs.writeFileSync(OUT_JSON, songText(song));
  console.error(`${OUT_JSON}: ${song.voice.length} voice entries, ${(song.chords || []).length} chord blocks`);
}
const mix = render(song, { slow: +opt('--slow', 1), pitch: +opt('--pitch', 0), wobble: +opt('--wobble', 0.5), voice: +opt('--voice', 1), band: +opt('--band', 1) });
fs.writeFileSync(OUT, encodeWav(mix));
console.log(`${OUT}: ${(mix.length / SR).toFixed(1)} s, ${song.voice.length} notes`);
