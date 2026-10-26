# TOP BUNK

A short first-person horror game built with [Three.js](https://threejs.org), runs straight from GitHub Pages — no build step. Every texture is drawn on canvas at load. Sound is synthesized with WebAudio and layered with recorded voices, music and jump scares (see Audio); if those files are missing, the synth covers everything. Mom, Dad and the spirit are real rigged character models (see Characters).

> The rent on the old farmhouse was cheap. Now we know why.

## Story

| Beat | What happens |
|---|---|
| **Moving day** | Your family pulls up to the rented farmhouse. Carry your boxes from the truck to your room, the back-left bedroom off the hall. Top bunk is yours. Someone left a crayon drawing taped in the hallway. |
| **2:47 AM** | You wake up and need the bathroom. A car's headlights slide across the bedroom, and then something huge and pale drifts past the windows, moaning. The narrow hallway is dark, lit only by a few green plug-in night lights. |
| **The hallway** | Those aren't your footsteps. The lights snap on behind you and something tall, black, with huge white eyes and a huge white smile is standing at the end of the hall, where it opens into the living room. Run. |
| **Hide** | Get up the ladder and under the blanket. It comes to the side of the bed. Hold your breath. |
| **Morning** | Sunlight, birds, Mom calling you for breakfast. It was just a dream. Get up. |

## Controls

| Key | Action |
|---|---|
| WASD / arrows | Move |
| Mouse | Look |
| Shift | Sprint (limited stamina) |
| E | Interact |
| Space | Hold your breath (while hiding) |
| Esc | Pause |

Desktop with keyboard and mouse. Headphones recommended.

## Run locally

ES modules need a web server (opening `index.html` from disk won't work):

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy to GitHub Pages

Settings → Pages → **Deploy from a branch** → `main` / `(root)`. The site will be at `https://<user>.github.io/<repo>/`.

## Project layout

| File | Purpose |
|---|---|
| `index.html` | HUD, title/pause/death/end screens, import map for Three.js (CDN) |
| `css/style.css` | HUD and screen styling, film grain, vignette, blanket overlay |
| `js/main.js` | Game loop, player controller, collisions, story script, chase/hide logic |
| `js/world.js` | The 2002 ranch house (carpet, floral wallpaper, white kitchen, hall, your back-left room), furniture, yard, garage, truck, barn, lights |
| `js/entity.js` | The tall one — model, animation, head/pupil tracking |
| `js/textures.js` | Procedural canvas textures (wallpaper, floors, the crayon drawing, the grin) |
| `js/audio.js` | Procedural sound: footsteps, creaks, drone, heartbeat, stinger, scream |
| `js/people.js` | Mom and Dad |

## Dev shortcuts

Append a hash to the URL to jump ahead: `#night`, `#chase`, `#morning`.

## Audio

The files in `assets/` are generated with ElevenLabs and committed; the game plays them with the synth as a fallback.

| What | Where | Made by |
|---|---|---|
| Mom and Dad's lines (match the subtitles in `js/main.js`) | `assets/audio/vo/` + `manifest.json` | `tools/gen_voice.py` |
| Music: moving day, night, chase, morning | `assets/music/` + `tracks.json` | `tools/gen_music.py` |
| Night brown-noise bed, jump scares (synth blast, violin screech, slam), the shove, waterphone and music box | `assets/sfx/` + `sfx.json` | `tools/gen_sfx.py` |

To change anything: edit the table in the script, then `ELEVENLABS_API_KEY=... python3 tools/gen_voice.py --only vo/mom --force` (needs Python 3 and ffmpeg). The key is read from the environment only — never put it in a file. The brown noise is made locally with ffmpeg and needs no key.

## Characters

| Who | Model | Animation |
|---|---|---|
| Mom, Dad | [Microsoft Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox) adults (`Female_Adult_01`, `Male_Adult_05`), MIT | Idle clip, head follows you when you're near, mouth moves with their voice |
| The spirit | A Rocketbox body (`Male_Adult_06`) in solid black, stretched to about 2.6 m with long arms, with the skull, eyes and smile on its head bone | Run, walk and idle clips, plus code for the lean, head tilt, reaching arms and gaze |

The walk/run/idle clips are Mixamo animations (from the three.js example `Xbot.glb`) retargeted onto the Rocketbox skeleton. How the models are built: `tools/models/`. The game works without the model files: the old low-poly people and spirit take over. Credits and licenses: [CREDITS.md](CREDITS.md).

## Graphics

Rendered with three.js and a post-processing pipeline: an HDR sky and image-based lighting, ambient occlusion, bloom, and a film grade (grain, vignette, a dark-adapted look at night). There is a **Graphics** setting on the title screen (Auto, Ultra, High, Medium, Low). Auto starts on High and steps down if the frame rate stays low.

| Part | Source |
|---|---|
| Surfaces: floors, walls, siding, roof, grass, tile, counters | PBR materials from Poly Haven and ambientCG (CC0), packed by `tools/assets/fetch_pbr.py` into `assets/pbr/` |
| Sky and ambient light | Poly Haven HDRIs (CC0), `tools/assets/fetch_sky.py` into `assets/sky/` |
| Furniture, plants, a tree, rocks, grass | Poly Haven models (CC0), compressed by `tools/assets/fetch_models.py` into `assets/props/` |
| Kitchen, bathroom, windows, house | built in code (`js/world.js`) |

Everything has a fallback: if an asset file is missing, the older procedural look takes over for that item.

