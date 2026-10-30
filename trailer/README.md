# The TOP BUNK trailer

Two cuts, both rendered from the real game (nothing is pre-rendered or faked: the renderer drives the live three.js scene through
`window.__game`, frame by frame, with a frozen clock so every run is identical):

| cut | length | presets | for |
|---|---|---|---|
| landscape, 16:9 | 2:19 | `preview` (640x360 @ 12 fps), `steam` (1920x1080 @ 30 fps) | the Steam store page |
| portrait, 9:16 | 0:22 | `social-preview` (360x640 @ 12 fps), `social` (1080x1920 @ 30 fps) | Shorts / Reels / TikTok |

Everything lives in `trailer/`: `trailer.js` (the landscape shot list and the player), `shots_portrait.js` (the portrait cut), `lib.js`
(camera, overlays, game-state helpers), `boot.js` (live preview in a browser), `render.js` (the headless renderer and the ffmpeg mix),
`cues.json` / `cues_portrait.json` (sound effects and voice lines, `[{t, file, src, gain, pan, lp, hp, room, drive, dur, fadeIn, fadeOut}]`: `src` starts
part way into the file, `room` puts it in a small room, `drive` saturates it), `music_plan.json` (how the song is laid under each cut and warped; in the landscape cut `duck` lowers it under every voice line so the
lines read over it; `mute` windows silence the whole mix and `muteFloor` leaves tape hiss under them at that level) and `gen_music.js` (the placeholder music). `js/`, `index.html` and `css/` are untouched.

## Rendering

```
node trailer/gen_music.js                                   # the placeholder soundtrack (render.js runs this itself if the WAV is missing)
node trailer/render.js --preset preview                     # trailer/out/topbunk-trailer-preview-360p12.mp4 (+ a 10 s teaser)
node trailer/render.js --preset social-preview              # trailer/out/topbunk-social-preview-360x640-12.mp4
node trailer/render.js --preset steam                       # trailer/out/topbunk-trailer-1080p30.mp4 (see "how long it takes")
node trailer/render.js --preset social --bio                # the portrait upload, end card says "link in bio"
node trailer/render.js --preset social --cta web            # end card: "play it free in your browser" (only while the web build is public)
node trailer/render.js --preset preview --contact           # one frame per shot into trailer/out/<name>-contact/ (a two-minute check of the cut)
node trailer/render.js --preset steam --music path/to/licensed.wav   # a licensed recording in place of the placeholder
node trailer/render.js --serve                              # serve the repo (writes the placeholder music first if it is missing); open http://127.0.0.1:8700/index.html?trailer=1 for a live play-through
```

Useful flags: `--quality high|medium|low`, `--res 0.5..1` (render scale), `--shadow 1024`, `--every N` / `--range A-B` (partial renders, frames
kept in the scratch dir), `--resume` (skip frames already on disk), `--no-warp`, `--no-audio`, `--letterbox` (2.39:1 bars, landscape only),
`--keep-frames`, `--scratch DIR`, `--out DIR`, `--port N`, `--shutter N` (motion blur: N exposures per frame over a thirtieth of a second,
averaged under the overlays; without it each shot sets its own, so the portrait cut smears its flinches, the run and the fall and costs
about a fifth more render time; `--shutter 1` turns it off). Playwright and ffmpeg must be installed (`require('playwright')` must resolve).

The live preview (`?trailer=1`, add `&aspect=portrait` in a tall window, `&music=...`, `&lb=1`, `&bio=1`, `&cta=web`) plays the same shot list in real
time with the same cue sheet through WebAudio. It needs a click to start (browser audio policy).

### How long it takes

The render is CPU-only (Chromium's SwiftShader). Measured on a 4-core build box, per captured frame: a lit night interior costs about
2-7 s at 640x360 (the dusk exterior with the sky is the dearest shot, ~6.5 s), daylight interiors 1-2 s, black cards nothing; at 1920x1080
(quality high) the night hallway long lens, the dearest interior, costs 21 s per frame steady state and 37 s for the first frame while
shaders compile (measured with `--preset steam --range 1290-1291`), so full-size frames cost roughly 3x their 640x360 cost, not 9x.
Frames that are simulated but not captured cost about 20 ms. Measured end to end:

- `social-preview`: 333 frames in 5.5 minutes (1.0 s per frame, with the CPU to itself), before the motion blur; the cut is now 303 frames,
  about 70 of them blurred from 4-6 exposures.
- `preview`: 1668 frames in 77 minutes (2.8 s per frame overall; the ~310 black-card frames cost 0.03 s, the dusk porch ~6.6 s after a
  one-off ~60 s first frame while shaders compile, the lit night hallway shots 4.5-7.2 s, daylight interiors 1.2-3.1 s), while another
  render shared the CPU.
- `steam`: 4170 frames, ~3240 of them lit at roughly 2-21 s each (3x the 640x360 per-shot costs) and ~930 black-card frames at
  nothing: on the order of **10-15 hours** on SwiftShader, more while the CPU is shared. Run it on a machine with a GPU instead:
- `social`: 756 frames; the run down the hall measured 9 s per frame at 1080x1920 (17 s for the first frame; `--preset social
  --range 652-654`), so about **1.5-2 hours** on SwiftShader, and roughly 2.5 hours with the per-shot motion blur (`--shutter 1` skips it).
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
sequence are its own and quote no existing song; it is royalty-free and may ship in the trailer as is. The same script writes the small
original effects the cue sheets use (footsteps, breathing, TV snow, a heartbeat, a door latching, wood and hinge creaks, a relay, the
camcorder's zoom motor and rewind, a gasp, the set switching off, the camera hitting the floor, one music-box note). The remaining effects and the voice lines
come from the game's own assets (`assets/sfx`, `assets/audio/vo`; see `CREDITS.md`).

## Steam trailer specs (Steamworks "Trailers" page; check the current numbers before uploading)

- MP4, H.264 video, AAC audio (stereo, 44.1 or 48 kHz); the `steam` preset writes exactly that (crf 18, yuv420p, 256 kbps AAC, faststart).
- 1920x1080, 16:9, 30 fps (29.97 also accepted); Steam re-encodes, so give it a high-bitrate source rather than a small one.
- Under 5 GB per file; the first trailer in the list autoplays on the store page, so this cut opens quietly and hits at 1:50.
- The trailer must not contain content that would be a higher age rating than the game; the cards warn about jump scares and flashing lights.

## The portrait cut

A separate edit (`shots_portrait.js`), not a crop: 22 s, 14 shots, hard cuts only. It plays as a tape a kid shot on the family camcorder
over ten nights in the house, and it ends where the drawing on the wall said it would.

- **Hook, then rewind.** Frame 0 already has its eyes over the edge of the top bunk; it rises and tilts its head, then the tape winds back:
  the hook plays backwards at four times speed under rolling search bands while the counter spins down to the first day, to the
  afternoon they moved in.
- **One operator, one camera.** The shake comes from what the kid is doing: lying still under the covers, standing in the hall, shuffling
  up to the wall, running. The hands drift, and every second or two the kid re-frames with a quick correction that overshoots a little;
  subjects sit a little off centre. Each scare gets a flinch, and no two shots move alike. One lens (70° vertical) at a kid's eye height;
  a closer framing is the camcorder's digital zoom, at the zoom rocker's one speed, and its readout shows while the rocker is in use.
  Whip pans, flinches and the fall are rendered with several exposures per frame and a blur along the direction of motion, so they
  streak like tape.
- **The camcorder's own text,** drawn in a 5x7 dot font (no font file), with a slight colour smear either side as composite video has:
  on the story takes only the date and time, top right, which carry the ten nights; REC and the tape counter only in the first and last
  shots, and the rewind's counter. It sits under the film grain like the picture, inside the area Shorts, Reels and TikTok leave clear.
  A splice, or the camera hitting the floor, can tear a tracking band across a frame or two.
- **Captions** in a bold sans with a black outline (one in the kid's red crayon, under the drawing), placed shot by shot in the empty part
  of the frame and never below 62% of the height, where the platforms put their own text (`cap(c, text, y, from, to, o)`; `o` can set a
  caption beside the subject, or `kid: true` for the crayon). They tell the story with the sound off. There are no voices.
- **The grin is held back.** The hook has it, the bunk shows part of it through the blanket, and the scare has it; in the hall, at the
  door and in the run it is eyes and a shape. Its head tilt belongs to the hook and the last image only.
- **The game's own situation.** The longest take is the mechanic: under the covers, filming through a narrow slit in the blanket (the
  cloth out of focus and nearly black right against the lens, fibres lit along the edge, the slit rising with the breath and freezing when
  it stops) while it stands over the bunk; its head jerks down on the heartbeats, and on the fourth it darts at the slit.
- **The scare** is the hook paid off: back on the top bunk its face comes over the edge, stopping short of the lens so the black head frames
  the eyes and teeth, in the hardest, sharpest frames of the cut; its hands come up, it shoves, and the camera goes over the side; it lands
  on the floor tipped over, looking up at it lying where the kid was, arms hanging, its head tilting. Hard cut.
- **The end card** is the title in the kid's red crayon lettering from the drawing, written on over the dark room the tape began in;
  then two eyes switch on over the mattress, exactly where frame 0 finds them, and the hands carry over the cut, so it loops.
  `--bio` adds "link in bio"; `--cta web` swaps the Steam line for "play it free in your browser".
- **Sound.** The same music (placeholder or `--music`) with its own plan (`music_plan.json: portrait`), mono and in a small room as the
  camcorder would hear it: it comes in after the rewind, warps through the TV, dies with the set, and comes back slower from beyond the
  door until the latch shuts it out. Then a held breath of room tone, a hinge, breath, a heartbeat with the bed and blanket ticking on it
  (so it plays on a phone speaker), the run (footsteps laid on the camera's own bob, the strings climbing to the cut), then 0.6 s of tape
  hiss before the scare. The scare is a hard hit that drops 6 dB after a quarter second, a dry shove, the camera hitting the floor and a
  dropout, then muffled room tone. The mix is set to about -14 LUFS integrated under a -1 dBTP ceiling, the level the platforms play at,
  with the room sounds kept well under the scare. Effects are in `cues_portrait.json`; those not taken from the game's assets are written
  by `gen_music.js`.
- The TV model's texture carries a real maker's badge; the trailer paints it out when it starts (`plainTv` in `lib.js`).
- The 10 s teaser starts at the door and runs through the bunk, the chase and the scare to the card.
