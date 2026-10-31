# The TOP BUNK trailer

Two cuts, both rendered from the game itself. The renderer drives the live three.js scene through `window.__game` frame by frame, on
a frozen clock, so every run comes out the same.

| Cut | Length | Presets | For |
|---|---|---|---|
| Landscape, 16:9 | 2:19 | `preview` (640x360 @ 12 fps), `steam` (1920x1080 @ 30 fps) | The Steam store page |
| Portrait, 9:16 | 0:22 | `social-preview` (360x640 @ 12 fps), `social` (1080x1920 @ 30 fps) | Shorts, Reels, TikTok |

| File | What it is |
|---|---|
| `trailer.js` | The landscape shot list and the player |
| `shots_portrait.js` | The portrait cut |
| `lib.js` | Camera, overlays, game-state helpers |
| `boot.js` | The live preview in a browser |
| `render.js` | The headless renderer and the ffmpeg mix |
| `cues.json`, `cues_portrait.json` | Sound effects and voice lines, `[{t, file, src, gain, pan, lp, hp, room, drive, dur, fadeIn, fadeOut}]`: `src` starts part way into the file, `room` puts it in a small room, `drive` saturates it |
| `music_plan.json` | How the song is laid under each cut and warped. In the landscape cut `duck` lowers it under every voice line; `mute` windows silence the whole mix, and `muteFloor` leaves tape hiss under them at that level. Landscape times can be written in the cut's marks (below) |
| `gen_music.js` | The placeholder music, and the small effects the cue sheets use |

The game's own files are not changed: the server adds `boot.js` to `index.html` as it serves it, and without `?trailer=1` the script
does nothing.

## Rendering

On a Windows PC with a graphics card, `trailer\render-windows.cmd` does the whole thing: it installs Playwright and its Chromium into
the project folder the first time, then renders both full-size cuts on the GPU in a visible browser window (a few minutes each).
It needs Node.js and ffmpeg on PATH. Pass a licensed recording as the first argument to use it instead of the placeholder.

```
node trailer/gen_music.js                                   # the placeholder soundtrack (render.js runs this itself if the WAV is missing)
node trailer/render.js --preset preview                     # trailer/out/topbunk-trailer-preview-360p12.mp4 (+ a 10 s teaser)
node trailer/render.js --preset social-preview              # trailer/out/topbunk-social-preview-360x640-12.mp4
node trailer/render.js --preset steam                       # trailer/out/topbunk-trailer-1080p30.mp4 (slow, see below)
node trailer/render.js --preset social --bio                # the portrait upload, end card says "link in bio"
node trailer/render.js --preset social --cta web            # end card: "play it free in your browser" (only while the web build is public)
node trailer/render.js --preset preview --contact           # one frame per shot into trailer/out/<name>-contact/, to check the cut quickly
node trailer/render.js --preset steam --music path/to/licensed.wav   # a licensed recording in place of the placeholder
node trailer/render.js --serve                              # serve the repo; open http://127.0.0.1:8700/index.html?trailer=1 for a live play-through
```

Other flags: `--quality ultra|high|medium|low`, `--res 0.5..1` (render scale), `--ss N` (pixels drawn per output pixel each way; 2 by
default for the full-size presets on a GPU, so the 1080p cut is drawn at 4K and scaled down), `--shadow 1024`, `--every N` / `--range A-B` (partial renders,
frames kept in the `--scratch` folder), `--resume` (skip frames already on disk), `--no-warp`, `--no-audio`, `--letterbox` (2.39:1 bars,
landscape only), `--keep-frames`, `--frames jpg` (smaller frame files), `--scratch DIR`, `--out DIR`, `--port N`, and `--shutter N`
(motion blur: N exposures per frame over a thirtieth of a second, averaged under the overlays; by default each shot sets its own, and
`--shutter 1` turns it off). Needs ffmpeg, and Playwright's Chromium (`npm install`, then `npx playwright install chromium`).

The live preview (`?trailer=1`; add `&aspect=portrait` in a tall window, `&music=...`, `&lb=1`, `&bio=1`, `&cta=web`) plays the same
shot list in real time with the same cue sheet through WebAudio. It needs a click to start, because of the browser's audio policy.

### GPU or CPU

Pass `--gpu --headed` (it needs a display, or `xvfb-run`) to render on the graphics card; use them for the full-size presets. Without them,
Chromium falls back to SwiftShader on the CPU, which is fine for the 12 fps previews and slow for the full-size presets; there,
`--res 0.5` renders at half size and upscales, and `--quality medium` drops ambient occlusion and MSAA. The renderer prints an ETA
every ten frames, and `--resume` continues an interrupted render (every frame is still simulated; only the frames already on disk
are skipped).

## The landscape cut

Three marks in `trailer.js` hold the cut to the recording, and everything else is a fraction of the act between two of them, so moving a
mark re-times the whole cut and nothing overlaps:

- `TURN` (34.5 s) is the first beat of "the colors of the rainbow". In the recording this cut is made for, the song goes from the first
  "what a wonderful world" straight into that bridge; the common single has a "skies of blue" verse first and its bridge nearer 56.5 s.
- `DROP` (107 s) is "yes I think to myself": the hard cut to black.
- `LANDSCAPE_DURATION` (139 s) is the end.

Act 1, up to the turn, is a sunny moving day with the song clean: the house from the road with the truck in the drive, the boxes on the
walk, Dad carrying one in, Mom at the stove, the bunk, the drawing (the one wrong note), the sun through the curtains with the cut's one
caption. On the turn it hard-cuts to the same angle at night with the porch light on, then one continuous move in at the front door,
across the living room past the TV and down the hall toward your door, while the song stays sweet for a bar and then starts to warp. The
second act is shorter and shorter shots as the song degrades: the TV, the door drifting shut, the thing at the end of the hall taking one
step, the face at the window, the closet, grandpa turning in his chair, the shadow in the corner of the living room, the washer's lid
banging open, the thing at the foot of the bunk, under the covers with the breath meter, the sprint down the hall. At the drop: black and
silence for 0.7 s, the face at the lens with the piano slam, then the cards with the song back faint under them.

The cue sheet and the music plan follow the marks: a time can be a number, a string in the marks (`"TURN+2.5"`, `"TURN+0.4*ACT2"`,
where `ACT2` is `DROP-TURN`), or for a cue a shot and a point in it (`{"shot": "door", "k": 0.3}` a fraction of it, `{"shot": "closet",
"at": 0.4}` seconds in). `render.js` and `boot.js` resolve them the same way.

## The music

The landscape cut is timed to a 2:19 song that is not in the repository (see the marks above). The song is clean to the turn and a bar past
it, then warps harder with every band of the second act (low-pass, the record slowing and dropping in pitch, tape wow; `music_plan.json`),
cuts to silence at the drop, and comes back faint under the title cards. Pass a licensed track with `--music path/to/track.wav` (any
format ffmpeg reads), and set `TURN` and `DROP` to where those words fall in it.

Without it the trailer uses `trailer/music/placeholder.wav`, an original lullaby of the same length that `gen_music.js` synthesizes. The
same script writes the small effects the cue sheets use; the other effects and the voice lines come from the game's own assets
(`assets/sfx`, `assets/audio/vo`; see `CREDITS.md`).

## Robot voice

`tools/sing.js` sings a song file the way a 1961 mainframe did: a buzzing glottal pulse through three vowel formant filters, consonants
as short bursts of noise, every note a little flat with a slow wobble, slurring into the next, over a square-wave organ and a soft bass.
It has no dependencies and writes a stereo WAV.

```
node tools/sing.js trailer/music/robot_song.json --out trailer/music/robot_demo.wav --slow 0.97 --wobble 0.6
node trailer/render.js --preset preview --music trailer/music/robot_demo.wav
```

`--slow` is tape speed (below 1 slows and drops the pitch together), `--pitch` transposes in semitones, `--wobble` 0..1 sets how unsteady
the pitch is, `--voice` and `--band` set the two levels. The song file is `{ bpm, voice: [{ note, beats, syl }], chords: [{ beats,
notes }] }`: `note` is `"C4"` or a MIDI number, or `null` for a rest; `syl` is one syllable, spelled (`"win"`, `"dow"`) or, with spaces,
written as sounds (`"d o u"`) when the spelling would be guessed wrong. The sounds are the consonants `s z sh ch j f v th dh h t d k g p
b m n ng l r w y` and the vowels `a ah ae e eh i ih o oh u oo uh er aw`; a vowel run is a glide (`ah i` is the vowel of "night").

`trailer/music/robot_song.json` is "Little Window", an original lullaby in the same shape as the trailer song (3/4, about 90 s), so the
demo can be shared.

The intended way to sing the real song is a licensed MIDI of it plus a lyrics file, with nothing to type in by hand:

```
node tools/sing.js --midi song.mid --lyrics words.txt --out trailer/music/robot_song.wav --slow 0.97 --wobble 0.6
node trailer/render.js --preset steam --music trailer/music/robot_song.wav
```

The MIDI reader is built in (type 0 and 1, tempo changes kept). It takes the melody from the track with the highest average pitch that
never plays two notes at once, and the band from every other pitched track, one chord per beat; channel 10 drums are skipped. It prints
the tracks it found and its choice, which `--melody-track N` and `--chord-track N,N` (track numbers from 1, in file order) override. The
lyrics file is plain text, one syllable per melody note in order, separated by spaces and hyphens, with `_` to hold the last syllable
over the next note, `[dh uh]` for a syllable given as sounds and `#` for comments; `trailer/music/robot_lyrics_example.txt` is the
demo's words in that form. Rests take no syllable. If the syllable and note counts differ it says so, and notes left over sing "la".
Without a lyrics file, lyric events in the MIDI are used when it has them. `--out-json song.json` also writes what it read as a song
file, to fix a syllable or a chord by hand and sing again from that.

A synthesized cover does not need the recording's master licence, but the composition is still under copyright, so it still needs a
synchronisation licence from the song's publishers before it goes in the trailer. Keep the MIDI, the lyrics file and the song file of
any copyrighted song out of the repository.

## Steam trailer specs

From the Steamworks "Trailers" page.

- MP4, H.264 video, AAC audio (stereo, 44.1 or 48 kHz). The `steam` preset writes exactly that (crf 18, yuv420p, 256 kbps AAC, faststart).
- 1920x1080, 16:9, 30 fps (29.97 also accepted). Steam re-encodes, so give it a high-bitrate source.
- Under 5 GB per file. The first trailer in the list autoplays on the store page, so this cut opens quietly and hits at the drop (1:47).
- The trailer must not show anything that would earn a higher age rating than the game; the cards warn about jump scares and
  flashing lights.

## The portrait cut

A separate edit (`shots_portrait.js`), not a crop: 22 s, 14 shots, hard cuts only. It plays as a tape a kid shot on the family
camcorder over ten nights in the house. It opens on the thing rising over the top bunk, rewinds at four times speed to the afternoon
they moved in, and ends where the drawing on the wall said it would: it shoves the kid off the top bunk. The last frame is its eyes
over the mattress, where the first frame starts, so the cut loops.

- One handheld camera at a kid's eye height, with one lens (70° vertical); a closer framing is the camcorder's digital zoom. The shake
  follows what the kid is doing, with small re-framing corrections and a flinch on each scare. Whip pans, flinches and the fall are
  rendered with several exposures per frame.
- The camcorder's date and time are drawn in a 5x7 dot font, so no font file is needed. REC and the tape counter show only in the
  first and last shots.
- Captions tell the story with the sound off; there are no voices. Each sits in an empty part of its frame, with the bottom of the
  text above about 66% of the height, since the platforms lay their own text over the rest (`cap()` in `shots_portrait.js`).
- The full grin shows only in the hook, partly through the blanket on the bunk, and in the scare.
- The end card is the title in the red crayon lettering from the drawing, over the dark room the tape began in, with one line saying
  what it is above the call to action. `--bio` adds "link in bio"; `--cta web` swaps the Steam line for "play it free in your browser".
- The sound is the same music with its own plan (`music_plan.json`, `portrait`), mono and in a small room, as the camcorder would hear
  it. The mix is set to -14 LUFS integrated under a -1 dBTP ceiling, the level the platforms play at. Effects are in
  `cues_portrait.json`; the ones not taken from the game's assets are written by `gen_music.js`.
- The TV model's texture carries a real maker's badge; the trailer paints it out when it starts (`plainTv` in `lib.js`).
- The 10 s teaser starts at the door and runs through the bunk, the chase and the scare to the card.
