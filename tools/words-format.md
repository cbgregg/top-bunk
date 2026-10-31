# The words file

What the robot singer reads for the lyrics: a plain text file (UTF-8, any line endings), pasted into the words box of
`tools/robot-voice.html` or given to the command line. There are two ways to write it. The first is the one to use.

## 1. Phrases (`--words words.txt`, the page's default)

One line per sung phrase, plain words, nothing else to mark. The singer splits the words into syllables itself and lays each
line over one phrase of the melody.

```
# any line starting with # is ignored
little window, keep the night out
little window, hold the light

I will sit up till the morning
nothing comes in while I'm here
```

How it is read:

- **A line is a phrase.** The melody is cut into phrases wherever it rests for 0.4 beat or more (the `phrase at a rest of` slider,
  or `--phrase-rest B`). Line 1 goes on phrase 1, line 2 on phrase 2, and so on. Blank lines are skipped and do not count.
- **Syllables are found by rule**: vowel groups, a silent final *e* (`ro-ses`, not `ro-se-s`), *-es* and *-ed* only where they are
  sounded (`wish-es`, `want-ed`, but `wished`, `trees`), consonant clusters split after the first consonant with *ch sh th ng ph*
  and *bl br cl cr dr fl fr gl gr pl pr tr* kept together, *-le* endings (`lit-tle`), and a short list of words the rules get
  wrong. The result shows greyed under the box, so you can see what it did before you press Preview.
- **Punctuation is stripped.** Commas, periods, quotes and apostrophes inside words are fine (`I'm`, `they're` are one syllable each).
  Capital letters do not matter.
- **More notes than syllables in a phrase**: the extra notes hold the vowel of the syllable before them (a real melisma: the same
  vowel, no new consonant). The longest notes are held first; the first note of a phrase is never a held one. Two held notes on the
  same pitch become one longer note.
- **More syllables than notes in a phrase**: the shortest syllables double up, two to a note, sung quickly in turn, and the line is
  marked amber in the counter. Fix it by breaking the line differently, or by splitting a note on the roll (shift-click).
- **More lines than phrases**: the long phrases are cut between lines in proportion to their syllable counts, at the end of a long
  note. **More phrases than lines**: the phrases parted by the shortest rests are joined. Either way the counter tells you; when
  it says "line 7: no phrase" the melody ran out of phrases before the words did, and it is usually a missing rest in the MIDI
  (trim a long note, or raise the rest slider).
- **The counter** under the box reads per line: `line 3: 7 syllables, 9 notes (2 held)`. Green is a clean fit, amber means doubled
  syllables, red means no phrase. Aim for every line green or with a few held notes; held notes are normal on the long notes at
  the ends of phrases.

Marks you may still type inside a phrase line, when the rules need help:

| mark | meaning | example |
|---|---|---|
| `-` between letters | split here, exactly as typed, no other splitting of that word | `blos-som`, `beau-ti-ful` |
| `_` as its own word | hold the previous syllable over one more note (one `_` per note) | `world _ _` |
| `[ ... ]` | one syllable written as sounds (see below) | `[dh uh]` for *the*, `[n ah i t]` for *night* |

(`__` is two holds; `___` three.)

Write the words as they are sung, not as they are spelled: `gonna`, `'cause`, `ev'ry` if that is how the line goes; the singer
has no idea what the lyric sheet says.

## 2. Exact (`--lyrics words.txt`, the page's `exact: one syllable per note`)

The older, strict form: one syllable per melody note, in order, across the whole song, with hyphens or spaces between syllables.
Line breaks mean nothing. Rests take no syllable. Every note must be accounted for: a held note needs a `_`, a two-syllable word
needs its hyphen. Use it when a MIDI came with its own lyric events (the page switches to it by itself then), or when you want
total control.

```
lit-tle win-dow keep [dh uh] night _ out
lit-tle win-dow hold [dh uh] light _ _
```

If the counts differ the singer says so ("66 syllables for 70 notes; the last 4 notes sing la") and the leftover notes sing "la".
`trailer/music/robot_lyrics_example.txt` is the demo lullaby in this form.

## Sounds

Inside `[ ]`, separated by spaces: consonants `s z sh ch j f v th dh h t d k g p b m n ng l r w y`, vowels `a ah ae e eh i ih o
oh u oo uh er aw`. Two vowels in a row glide (`ah i` is the vowel of *night*, `o u` of *go*). `th` is the sound in *thin*, `dh`
the one in *the*. A sound syllable always needs one vowel.

## Checklist before Preview

1. Melody track right (the dropdown above the track table; the log says why it chose).
2. Long notes trimmed (`TRIM THEM`; a transcription's phrase-end drones are 10-14 beats long and will swallow the next line).
3. Words one line per phrase; every line green or "held" in the counter.
4. `add chords from the melody` on if the MIDI has no band.
5. Tape speed, pitch, wobble to taste; the `1961` preset is the starting point.

Command line, same thing:

```
node tools\sing.js --midi song.mid --words words.txt --trim 4 --guess-chords --out song.wav --slow 0.97 --wobble 0.6
```
