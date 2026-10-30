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
| `music_plan.json` | How the song is laid under each cut and warped. In the landscape cut `duck` lowers it under every voice line; `mute` windows silence the whole mix, and `muteFloor` leaves tape hiss under them at that level |
| `gen_music.js` | The placeholder music, and the small effects the cue sheets use |

The game's own files are not changed: the server adds `boot.js` to `index.html` as it serves it, and without `?trailer=1` the script
does nothing.

## Rendering

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

Other flags: `--quality high|medium|low`, `--res 0.5..1` (render scale), `--shadow 1024`, `--every N` / `--range A-B` (partial renders,
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

## The music

The landscape cut is timed to a 2:19 song that is not in the repository: intro 0:00-0:08, verse 0:08-0:32, verse 0:32-0:56, bridge
0:56-1:20, verse 1:20-1:48, outro 1:48-2:19. The shots change on those phrase boundaries. The song warps across the bridge and the last
verse (low-pass, the record slowing and dropping in pitch, tape wow; `music_plan.json`), cuts to silence at 1:48 for the scare, and
comes back faint under the title cards. Pass a licensed track with `--music path/to/track.wav` (any format ffmpeg reads).

Without it the trailer uses `trailer/music/placeholder.wav`, an original lullaby of the same length and shape that `gen_music.js`
synthesizes. The same script writes the small effects the cue sheets use; the other effects and the voice lines come from the game's
own assets (`assets/sfx`, `assets/audio/vo`; see `CREDITS.md`).

## Steam trailer specs

From the Steamworks "Trailers" page.

- MP4, H.264 video, AAC audio (stereo, 44.1 or 48 kHz). The `steam` preset writes exactly that (crf 18, yuv420p, 256 kbps AAC, faststart).
- 1920x1080, 16:9, 30 fps (29.97 also accepted). Steam re-encodes, so give it a high-bitrate source.
- Under 5 GB per file. The first trailer in the list autoplays on the store page, so this cut opens quietly and hits at 1:50.
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
