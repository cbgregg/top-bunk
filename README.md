# TOP BUNK

A short first-person horror game built with [Three.js](https://threejs.org), runs straight from GitHub Pages — no build step. Every texture is drawn on canvas at load. Sound is synthesized with WebAudio and layered with recorded voices, music and jump scares (see Audio); if those files are missing, the synth covers everything.

> The rent on the old farmhouse was cheap. Now we know why.

## Story

| Beat | What happens |
|---|---|
| **Moving day** | Your family pulls up to the rented farmhouse. Carry your boxes from the truck to your room at the end of the hall. Top bunk is yours. Someone left a crayon drawing taped in the hallway. |
| **2:47 AM** | You wake up and need the bathroom. The hallway is long and dark. Bring the flashlight. |
| **The hallway** | Those aren't your footsteps. The bathroom light snaps on behind you and something tall, black, with huge white eyes and a huge white smile is standing in the doorway. Run. |
| **Hide** | Get up the ladder and under the blanket. It comes to the side of the bed. Hold your breath. |
| **Morning** | Sunlight, birds, Mom calling you for breakfast. It was just a dream. Get up. |

## Controls

| Key | Action |
|---|---|
| WASD / arrows | Move |
| Mouse | Look |
| Shift | Sprint (limited stamina) |
| E | Interact |
| F | Flashlight |
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
| `js/world.js` | Farmhouse layout, furniture, yard, truck, barn, lights |
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
