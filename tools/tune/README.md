# Tuning the robot voice

A loop for getting the singer (`tools/sing.js`, `tools/robot-voice.html`) to a sound you can describe but not dial in by hand.
It works for a person at a terminal and for a coding agent such as OpenCode (`opencode.ai`); the agent files are in this folder.

The loop:

1. Put the goal in words in `goal.txt`. Add numeric targets on their own lines when you have them, one per line, named as in
   the metrics below: `wobbleIndex: 0.6`, `meanAbsCents: 25`, `legatoGapMs: 30`.
2. Start from a preset (`--preset "drunk tape"`) or a parameter set (`--params mine.json`; `tools/voice-params.md` lists every key).
3. Render a short excerpt rather than the whole song (`--from 10 --to 30`, seconds of the song's own time) so each round is fast.
4. Measure it: `tools/sing_measure.js` gives the numbers and a spectrogram with the song's notes drawn over the tracked pitch.
5. Change a few parameters toward the goal, within their ranges.
6. Repeat with a budget of rounds; keep the best.

`tune.js` does steps 3 to 6:

```
node tools/tune/tune.js --song trailer/music/robot_song.json --goal tools/tune/goal.txt --out /tmp/tune --preset 1961 --iters 8 --from 10 --to 30
```

Without `--llm` it does a plain coordinate search on the numeric targets in the goal: for each target it moves the parameter
most likely to affect it (the lever table at the top of `tune.js`), a step sized by how far off the number is, halving the step
when a move made things worse. With `--llm` it hands the choice to a model:

```
node tools/tune/tune.js ... --llm "opencode run --agent voice-tuner --format json"
node tools/tune/tune.js ... --llm "some-other-cli --model x"
```

The command gets the prompt on stdin (the goal, the current set, the metrics history, the path of the last spectrogram) and must
print a JSON object on stdout (the changes, partial sets allowed); anything around the JSON is ignored. Each round writes
`iter_N/params.json`, `out.wav`, `voice.wav` (the band off, what the pitch metrics are taken from), `metrics.json`, `report.png`,
`notes.md` and, with `--llm`, `prompt.txt`; the run ends with `summary.md` (a table of every metric per round and what changed)
and `best_params.json`, which `tools/sing.js --params` and the page's `import` take as they are. WAVs are kept for the first, the
best and the last round unless `--keep-wav`.

The metrics (`node tools/sing_measure.js out.wav --song song.json --voice voice.wav --params p.json --png report.png`):

| metric | what |
|---|---|
| `durationSec`, `loudnessLufs`, `truePeakDb`, `stereoWidthDb` | the mix as a whole; width is side over mid in dB, mono is -inf |
| `notesTotal`, `notesTracked`, `within50CentsPct`, `meanAbsCents`, `medianCents` | the tracked pitch against the song's notes, per note the median over its middle |
| `meanOnsetMs` | how late the voice lands on each note, on average |
| `legatoGapMs` | the unvoiced gap between two notes the song ties together |
| `formantDevPct` | LPC F1/F2 on the vowel middles against the synth's own vowel table |
| `nhr` | noise to harmonic, 0 clean to 1 noise |
| `centroidHz`, `tiltDbPerOct` | where the spectrum sits and how it falls |
| `bandVoiceDb` | the band under the voice (needs `--voice`) |
| `wobbleIndex`, `vibratoCents`, `driftCents` | pitch unsteadiness inside the notes: everything over 0.5 Hz in units of 30 cents, the part over 3 Hz, the 0.5-3 Hz part |

`perNote` in the JSON has the cents and onset error of every note.

For OpenCode: `opencode.json` here defines the `voice-tuner` agent and `AGENTS.md` has the exact commands; copy them to the
project root (or point OpenCode at this folder) and run the loop above with `--llm "opencode run --agent voice-tuner"`. A model
with vision can be pointed at `report.png` by the prompt; a text-only one works from the numbers.
