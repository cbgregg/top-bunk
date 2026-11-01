# Robot voice parameters

Every number that shapes the sound of `tools/sing.js` and `tools/robot-voice.html`, by group. A parameter set is a JSON file in
the same shape (`{ "voice": { "vibratoDepth": 12 }, "tape": { "speed": 0.95 } }`); whatever it leaves out stays at the default,
and values outside the range are clamped. The defaults are the sound the singer always had, and a stage whose default is off (0)
is skipped altogether, so a default render is the same samples as before these existed.

```
node tools/sing.js song.json --out out.wav --preset "drunk tape" --params mine.json --set voice.vibratoDepth=12
node tools/sing.js song.json --dump-params --preset telephone        # the whole set in use, as JSON
```

The old flags still work and sit on top: `--slow` is `tape.speed`, `--pitch` is `voice.transpose`, `--wobble` is `voice.wobble`,
`--voice` and `--band` are `mix.voice` and `mix.band`. In the page the same set lives under `advanced`, with import and export
of the JSON.

## Voice

The singer itself: the glottal pulse, the pitch and its unsteadiness, the mouth, the consonants, and copies of the voice.

| key | range | default | what it does |
|---|---|---|---|
| `voice.transpose` | -24 .. 24 st | 0 | everything moved by this many semitones before singing |
| `voice.flatCents` | -60 .. 30 cents | -14 | how flat every note is sung; old vocoders sat a touch under |
| `voice.vibratoRate` | 2 .. 9 Hz | 5.4 | vibrato speed |
| `voice.vibratoDepth` | 0 .. 80 cents | 18 | vibrato depth, before wobble scales it |
| `voice.vibratoOnsetMs` | 0 .. 800 ms | 0 | vibrato fades in over this long after a note starts (0: from the start) |
| `voice.wobble` | 0 .. 2 | 0.5 | scales vibrato and drift together: 0 steady, 1 unsteady, 2 falling apart |
| `voice.driftDepth` | 0 .. 200 cents | 60 | how far the slow random drift can pull the pitch |
| `voice.driftStep` | 0 .. 0.02 | 0.002 | the random walk step per sample; bigger drifts faster |
| `voice.driftDecay` | 0.99 .. 0.99999 | 0.9995 | how the drift forgets: closer to 1 wanders longer |
| `voice.glideMs` | 0 .. 400 ms | 70 | portamento into a note from the one before it |
| `voice.scoopCents` | -300 .. 100 cents | -40 | where a note after a breath starts, relative to its pitch |
| `voice.attackMs` | 1 .. 300 ms | 20 | the vowel comes in over this long |
| `voice.releaseMs` | 1 .. 500 ms | 50 | the vowel lets go over this long when the note is not tied on |
| `voice.detached` | 0 .. 1 | 0 | 1: every note releases, none slurs into the next |
| `voice.breath` | 0 .. 0.6 | 0.08 | aspiration noise under the vowel: breathiness |
| `voice.formantShift` | 0.6 .. 1.6 x | 1 | vocal tract length: under 1 is bigger (deeper), over 1 smaller (childlike) |
| `voice.bandwidthScale` | 0.4 .. 3 x | 1 | formant bandwidths: narrow rings, wide mumbles |
| `voice.brightness` | -12 .. 12 dB | 0 | a shelf on the voice above 2.5 kHz |
| `voice.consonantLevel` | 0 .. 3 x | 1 | how loud the consonants are |
| `voice.consonantLength` | 0.3 .. 3 x | 1 | how long the consonants last |
| `voice.nasal` | 0 .. 3 x | 1 | the level of m, n and ng |
| `voice.openQuotient` | 0.2 .. 0.7 | 0.4 | the glottal pulse: the opening part of the cycle |
| `voice.closingPhase` | 0.05 .. 0.3 | 0.16 | the glottal pulse: the sharp closing part; shorter buzzes harder |
| `voice.vowelGlideMs` | 0 .. 300 ms | 40 | the mouth moves from the last shape to the new vowel over this long |
| `voice.voices` | 1 .. 5 | 1 | copies of the voice sung together, each a little off (a choir of one) |
| `voice.chorusCents` | 0 .. 60 cents | 10 | how far apart the copies sit in pitch |
| `voice.chorusMs` | 0 .. 120 ms | 22 | how far apart the copies sit in time |

## Tape

What the tape does to it: speed, wow and flutter, hiss, saturation and the bandwidth.

| key | range | default | what it does |
|---|---|---|---|
| `tape.speed` | 0.5 .. 1.5 x | 1 | playback speed: below 1 slows and drops the pitch together |
| `tape.wowDepth` | 0 .. 100 cents | 0 | slow speed waver |
| `tape.wowRate` | 0.05 .. 3 Hz | 0.5 | how fast the wow goes |
| `tape.flutterDepth` | 0 .. 40 cents | 0 | fast speed waver |
| `tape.flutterRate` | 3 .. 30 Hz | 8 | how fast the flutter goes |
| `tape.hiss` | 0 .. 0.1 | 0 | tape hiss level |
| `tape.drive` | 0 .. 3 | 0 | saturation before the limiter |
| `tape.lowCut` | 0 .. 1000 Hz | 0 | nothing below this (0: off) |
| `tape.highCut` | 0 .. 16000 Hz | 0 | nothing above this (0: off) |

## Lo-fi

The 1961 flavour: sample-rate crush, bit depth, ring modulation.

| key | range | default | what it does |
|---|---|---|---|
| `lofi.crushHz` | 0 .. 22050 Hz | 0 | sample-rate crush: hold each sample for 44100 / this (0: off) |
| `lofi.bits` | 0 .. 16 bits | 0 | bit depth (0: off) |
| `lofi.ringMod` | 0 .. 1 | 0 | ring modulation amount, the 1961 vocoder flavour |
| `lofi.ringHz` | 20 .. 2000 Hz | 110 | the ring modulator carrier |

## Band

The organ, the bass and the brushes under the voice.

| key | range | default | what it does |
|---|---|---|---|
| `band.squareLevel` | 0 .. 1.5 | 0.5 | the organ square wave |
| `band.pulseWidth` | 0.05 .. 0.95 | 0.5 | the square wave duty: 0.5 is square, else a pulse |
| `band.triLevel` | 0 .. 1.5 | 0.7 | the detuned triangle under the square |
| `band.detune` | 1 .. 1.03 x | 1.003 | the triangle sits this much sharp of the square |
| `band.organLevel` | 0 .. 1 | 0.22 | organ level |
| `band.organLpHz` | 300 .. 8000 Hz | 1800 | the organ low-pass |
| `band.bassLevel` | 0 .. 1.5 | 0.35 | bass level |
| `band.bassOctave` | -2 .. 1 oct | -1 | the bass plays the chord root this many octaves from the lowest note |
| `band.voicing` | 0 .. 1 | 0 | 0 close, 1 open: the middle note of a triad goes up an octave |
| `band.attackMs` | 1 .. 500 ms | 30 | each chord comes in over this long |
| `band.releaseMs` | 1 .. 1000 ms | 80 | each chord lets go over this long |
| `band.width` | 0 .. 1 | 0 | the chord notes spread across the stereo field by this much |
| `band.drums` | 0 .. 1 | 0 | 1: brushes on each beat, a swish on the first of the bar |
| `band.drumLevel` | 0 .. 1 | 0.2 | the brushes level |
| `band.beatsPerBar` | 2 .. 7 | 4 | for the drums |

## Mix

Levels, the room, the stereo picture, the limiter and the output.

| key | range | default | what it does |
|---|---|---|---|
| `mix.voice` | 0 .. 3 x | 1 | voice level |
| `mix.band` | 0 .. 3 x | 1 | band level |
| `mix.bandBalance` | 0.05 .. 2 | 0.55 | the band against the voice by loudness, before the two levels |
| `mix.slapbackMs` | 0 .. 400 ms | 90 | the one early reflection the singer always had |
| `mix.slapbackLevel` | 0 .. 0.8 | 0.18 | its level |
| `mix.roomLevel` | 0 .. 1 | 0 | a room: level of the reverb (0: off) |
| `mix.roomSize` | 0.1 .. 1 | 0.5 | the room: 0.1 a closet, 1 a hall |
| `mix.roomPredelayMs` | 0 .. 200 ms | 20 | the room: time before the reverb starts |
| `mix.roomDamping` | 0 .. 1 | 0.5 | the room: how fast the highs die |
| `mix.width` | 0 .. 1 | 0 | stereo width of the whole thing (0: the old near-mono) |
| `mix.rightGain` | 0.5 .. 1 x | 0.96 | the right channel a shade under the left, as it always was |
| `mix.limiterDrive` | 0.5 .. 4 | 1.3 | how hard the output pushes the soft limiter |
| `mix.ceiling` | 0.3 .. 1 | 0.95 | the limiter ceiling |
| `mix.master` | 0 .. 3 x | 1 | master gain before the limiter |
| `mix.sampleRate` | 8000 .. 48000 Hz | 44100 | the WAV sample rate (resampled at the end when not 44100) |

## Presets

Named starting points (`--preset NAME`, or the buttons in the page). Each is a small set over the defaults:

- **1961**: `{"tape":{"speed":0.97},"voice":{"wobble":0.6}}`
- **clean**: `{"voice":{"wobble":0}}`
- **drunk tape**: `{"tape":{"speed":0.94,"wowDepth":30,"wowRate":0.35,"flutterDepth":6,"flutterRate":7,"hiss":0.012,"drive":0.5,"highCut":6500},"voice":{"wobble":0.9,"glideMs":140}}`
- **telephone**: `{"tape":{"lowCut":300,"highCut":3400,"drive":0.8,"hiss":0.006},"lofi":{"bits":10},"mix":{"band":0.5,"slapbackLevel":0.05}}`
- **choir of one**: `{"voice":{"voices":3,"chorusCents":12,"chorusMs":25,"wobble":0.4},"mix":{"width":0.6,"roomLevel":0.25,"roomSize":0.7}}`
- **vocoder**: `{"lofi":{"ringMod":0.7,"ringHz":110,"crushHz":11025,"bits":8},"voice":{"wobble":0.2,"breath":0.02,"bandwidthScale":0.7},"tape":{"highCut":5000}}`

## Measuring and tuning

`tools/sing_measure.js` measures a render against its song (loudness, pitch accuracy, formants, wobble, gaps, balance, and a
spectrogram PNG with the notes drawn over the tracked pitch), and `tools/tune/` is a loop that renders, measures and adjusts this
set toward a goal, by itself or with a language model choosing the next values; `tools/tune/README.md` has the commands. That
folder is the only place in the project where such a model is involved.
