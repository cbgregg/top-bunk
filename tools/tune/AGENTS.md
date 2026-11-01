# Tuning the robot voice with an agent

This folder holds the loop that tunes `tools/sing.js` toward a described sound. The agent's job is only the choice of the next
parameter set; rendering and measuring are done by the scripts.

Files: `tools/voice-params.md` (every parameter, range, default, meaning), `tools/sing.js` (render), `tools/sing_measure.js`
(measure), `tools/tune/tune.js` (the loop), `goal.txt` (the goal, with optional numeric targets one per line, `wobbleIndex: 0.6`).

Commands:

```
# one render of a 20 s excerpt with a parameter set, then its measurements and a spectrogram
node tools/sing.js trailer/music/robot_song.json --out /tmp/t/out.wav --params /tmp/t/params.json --from 10 --to 30
node tools/sing.js trailer/music/robot_song.json --out /tmp/t/voice.wav --params /tmp/t/params.json --from 10 --to 30 --band 0
node tools/sing_measure.js /tmp/t/out.wav --song /tmp/t/excerpt.json --voice /tmp/t/voice.wav --params /tmp/t/params.json --png /tmp/t/report.png

# the whole loop, the agent choosing each next set
node tools/tune/tune.js --song trailer/music/robot_song.json --goal tools/tune/goal.txt --out /tmp/tune --preset 1961 --iters 8 --from 10 --to 30 --llm "opencode run --agent voice-tuner"

# the effective parameter set for a preset, to start from
node tools/sing.js trailer/music/robot_song.json --dump-params --preset "drunk tape" > /tmp/t/params.json
```

When asked for the next set: read the goal, the current set and the history; move a few parameters at a time within their
ranges; keep what helped; answer with one JSON object of the changes only, in the shape
`{"voice":{...},"tape":{...},"lofi":{...},"band":{...},"mix":{...}}`. The loop clamps values to their ranges and ignores unknown
keys. `report.png` shows the song's notes in blue over the tracked pitch in yellow on a spectrogram; a wavy yellow line is wobble,
a yellow line under the blue is flat singing, gaps in the yellow between tied notes are legato gaps.

Keep every file of a copyrighted song (MIDI, words, song JSON, renders) out of the repository.
