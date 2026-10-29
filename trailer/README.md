# The TOP BUNK trailer

Two cuts, both rendered from the real game (nothing is pre-rendered or faked: the renderer drives the live three.js scene through
`window.__game`, frame by frame, with a frozen clock so every run is identical):

| cut | length | presets | for |
|---|---|---|---|
| landscape, 16:9 | 2:19 | `preview` (640x360 @ 12 fps), `steam` (1920x1080 @ 30 fps) | the Steam store page |
| portrait, 9:16 | 0:44 | `social-preview` (360x640 @ 12 fps), `social` (1080x1920 @ 30 fps) | Shorts / Reels / TikTok |

Everything lives in `trailer/`: `trailer.js` (the landscape shot list and the player), `shots_portrait.js` (the portrait cut), `lib.js`
(camera, overlays, game-state helpers), `boot.js` (live preview in a browser), `render.js` (the headless renderer and the ffmpeg mix),
`cues.json` / `cues_portrait.json` (sound effects and voice lines, `[{t, file, gain, pan, lp, hp, dur, fadeIn, fadeOut}]`), `music_plan.json`
(how the song is laid under each cut and warped) and `gen_music.js` (the placeholder music). `js/`, `index.html` and `css/` are untouched.

## Rendering

```
node trailer/gen_music.js                                   # the placeholder soundtrack (render.js runs this itself if the WAV is missing)
node trailer/render.js --preset preview                     # trailer/out/topbunk-trailer-preview-360p12.mp4 (+ a 10 s teaser)
node trailer/render.js --preset social-preview              # trailer/out/topbunk-social-preview-360x640-12.mp4
node trailer/render.js --preset steam                       # trailer/out/topbunk-trailer-1080p30.mp4 (see "how long it takes")
node trailer/render.js --preset social --bio                # the portrait upload, end card says "link in bio"
node trailer/render.js --preset preview --contact           # one frame per shot into trailer/out/<name>-contact/ (a two-minute check of the cut)
node trailer/render.js --preset steam --music path/to/licensed.wav   # a licensed recording in place of the placeholder
node trailer/render.js --serve                              # serve the repo; open http://127.0.0.1:8700/index.html?trailer=1 for a live play-through
```

Useful flags: `--quality high|medium|low`, `--res 0.5..1` (render scale), `--shadow 1024`, `--every N` / `--range A-B` (partial renders, frames
kept in the scratch dir), `--resume` (skip frames already on disk), `--no-warp`, `--no-audio`, `--letterbox` (2.39:1 bars, landscape only),
`--keep-frames`, `--scratch DIR`, `--out DIR`, `--port N`. Playwright and ffmpeg must be installed (`require('playwright')` must resolve).

The live preview (`?trailer=1`, add `&aspect=portrait` in a tall window, `&music=...`, `&lb=1`, `&bio=1`) plays the same shot list in real
time with the same cue sheet through WebAudio. It needs a click to start (browser audio policy).

### How long it takes

The render is CPU-only (Chromium's SwiftShader). Measured on a 4-core build box, per captured frame: a lit night interior costs about
2-7 s at 640x360 (the dusk exterior with the sky is the dearest shot, ~6.5 s), daylight interiors 1-2 s, black cards nothing; at 1920x1080
(quality high) the night hallway long lens, the dearest interior, costs 21 s per frame steady state and 37 s for the first frame while
shaders compile (measured with `--preset steam --range 1290-1291`), so full-size frames cost roughly 3x their 640x360 cost, not 9x.
Frames that are simulated but not captured cost about 20 ms. Measured end to end:

- `social-preview`: 528 frames in 24 minutes (2.7 s per frame, while another render shared the CPU).
- `preview`: 1668 frames in 77 minutes (2.8 s per frame overall; the ~310 black-card frames cost 0.03 s, the dusk porch ~6.6 s after a
  one-off ~60 s first frame while shaders compile, the lit night hallway shots 4.5-7.2 s, daylight interiors 1.2-3.1 s), while another
  render shared the CPU.
- `steam`: 4170 frames, ~3240 of them lit at roughly 2-21 s each (3x the 640x360 per-shot costs) and ~930 black-card frames at
  nothing: on the order of **10-15 hours** on SwiftShader, more while the CPU is shared. Run it on a machine with a GPU instead:
- `social`: 1320 frames; the portrait hallway measured 8 s per frame at 1080x1920 (24 s for the first frame; `--preset social
  --range 330-331`), so about **2-3 hours** on SwiftShader.
  The same GPU and quality knobs below apply.
  `--gpu --headed` (needs a display, or `xvfb-run`) renders at interactive speed, so the whole thing takes minutes. Or trade quality for time:
  `--res 0.5` renders at 960x540 internally and upscales (about 4x faster), `--quality medium` drops ambient occlusion and MSAA (~25% faster).
  `--resume` lets an interrupted render continue (every frame is still simulated, only the screenshots are skipped).

The renderer logs a running average and an ETA every ten captured frames.

## The music, and the rights

The cut is timed to the structure of Louis Armstrong's 1967 recording of "What a Wonderful World" (2:19): intro 0:00-0:08, verse 0:08-0:32,
verse 0:32-0:56, bridge 0:56-1:20, verse 1:20-1:48, outro 1:48-2:19. The shots change on those phrase boundaries, the song warps across the
bridge and the last verse (low-pass, the record slowing and dropping in pitch, tape wow; `music_plan.json`), hard-cuts to silence at 1:48 for
the scare, and comes back faint and far away under the title cards.

**Nothing from that recording is in this repository and nothing may be added without a licence.** Using it needs two separate licences:

- a **synchronization licence** for the composition (Thiele/Weiss; the publisher), because the song is put to picture, and
- a **master use licence** for the recording (the label that owns the Armstrong master).

A cover recording replaces the master licence with the cover's own master (or your own recording) but still needs the sync licence for the
composition. Streaming platforms' music libraries do not cover a game trailer on Steam. Once licensed, drop the file in with
`--music path/to/recording.wav` (any format ffmpeg reads; it is resampled to 44.1 kHz stereo) and nothing else changes.

Until then the trailer uses `trailer/music/placeholder.wav`: an **original** 2:19 lullaby written for this trailer (72 bpm, D major, a music box
and a Rhodes-style electric piano over vinyl crackle), synthesized by `gen_music.js` from oscillators and envelopes. Its melody and chord
sequence are its own and quote no existing song; it is royalty-free and may ship in the trailer as is. The same script writes four small
original effects the cue sheet uses (slow heavy footsteps, running steps, slow breathing, TV snow). The remaining effects and the voice lines
come from the game's own assets (`assets/sfx`, `assets/audio/vo`; see `CREDITS.md`).

## Steam trailer specs (Steamworks "Trailers" page; check the current numbers before uploading)

- MP4, H.264 video, AAC audio (stereo, 44.1 or 48 kHz); the `steam` preset writes exactly that (crf 18, yuv420p, 256 kbps AAC, faststart).
- 1920x1080, 16:9, 30 fps (29.97 also accepted); Steam re-encodes, so give it a high-bitrate source rather than a small one.
- Under 5 GB per file; the first trailer in the list autoplays on the store page, so this cut opens quietly and hits at 1:50.
- The trailer must not contain content that would be a higher age rating than the game; the cards warn about jump scares and flashing lights.

## The portrait cut

A separate edit (`shots_portrait.js`), not a crop: composed for height (the hall's length, the ladder up to the bunk, the thing seen from a
kid's eye level, door frames, the TV in a dark room), a hook inside the first two seconds, captions in the lower third that carry the story
with the sound off, hard cuts on the beat, handheld micro-shake and drift on every shot, and a found-footage camcorder frame (REC, a night
stamp, scanlines, the game's own grain and lens fringing). The music is the same track with its own 40 s plan (`music_plan.json: portrait`)
and `cues_portrait.json`.
