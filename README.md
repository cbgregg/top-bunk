# TOP BUNK

A short first-person horror game made with [three.js](https://threejs.org). It runs in the browser straight from GitHub Pages, with no build step, and as a desktop build for Steam ([STEAM.md](STEAM.md)).

> The rent on the old farmhouse was cheap. Now we know why.

## Story

| Part | What happens |
|---|---|
| **Moving day** | Your family pulls up to the rented farmhouse. Carry your three boxes from the truck to your room, the back-left corner room at the end of the hall, next to the bathroom. The top bunk is yours. Someone left a crayon drawing taped up in the hall. |
| **Night one** | 2:47 AM. The house wakes up. Your bear falls off the bunk, your door shuts by itself, something scratches inside the closet, the photo in the hall comes off the wall. You never see what does it. At the end everything goes quiet, and you had better be under the covers holding your breath. |
| **Breakfast** | You tell them. Nobody believes you. |
| **Nights two to nine** | The whole house is open, a clock runs toward dawn, and the thing in the hall hunts you. Run, shut doors, hide, hold your breath. The run's seed decides what each night is about: the phone ringing, the TV, Mom calling from the kitchen while Mom is asleep, the blackout, the drive, the vigil, and more. Most nights leave something behind to show your parents in the morning. Get caught and you play the night again. |
| **Night ten** | It comes down the hall. How much proof you found decides which of the three endings you get. |

## Controls

| Action | Keyboard + mouse | Game controller | Touch |
|---|---|---|---|
| Move | WASD / arrows | Left stick or d-pad | Drag on the left half (floating stick) |
| Look | Mouse | Right stick | Drag on the right half |
| Sprint (limited stamina) | Shift | RT / RB / L3 / B | RUN |
| Interact | E | A or X | USE (lights up when something is in reach) |
| Flashlight | F | Y | LIGHT |
| Pull the covers over your head (in the bunk) | Space | LT / LB / A | COVER UP |
| Hold your breath while hiding (tap once to keep holding) | Space | LT / LB / A | HOLD BREATH |
| Pause | Esc | Start | II |

Prompts and the Controls panel follow whichever input you used last, and the menus work from the keyboard or a controller. Controllers rumble on the scares. On phones the game goes fullscreen in landscape and starts on the Medium graphics preset. Headphones recommended.

Options (title and pause menus) has volume, look sensitivity, invert Y, field of view, head bob, graphics, subtitles and a reduce-flashing switch.

## Run locally

ES modules need a web server (opening `index.html` from disk won't work):

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

`npm test` runs `tests/smoke.js`: the game in headless Chromium through the title, a day, a night and a phone-sized touch screen (needs Playwright and its Chromium).

## Deploy to GitHub Pages

Settings → Pages → Source: **GitHub Actions**. `.github/workflows/static.yml` then deploys every push to `main`. The site will be at `https://<user>.github.io/<repo>/`.

## Project layout

| Path | What it is |
|---|---|
| `index.html` | HUD, title/pause/death/end screens, import map for the vendored three.js r170 (`vendor/three`) |
| `css/` | HUD and screen styling, film grain, vignette, blanket overlay; `fonts.css` loads the fonts in `assets/fonts/` |
| `js/main.js` | Game loop, player, collisions, moving day, the mornings, night ten's endings |
| `js/nights.js` | The nights: clock, hiding places, proof, and what each kind of night does |
| `js/director.js` | Which night is which for a seed, and the small events that fill a night |
| `js/hunter.js`, `js/nav.js` | How the thing shows itself, stalks, hunts and searches, and the graph of the house it walks on |
| `js/entity.js` | The thing itself: model, animation, head and eye tracking |
| `js/world.js` | The early-2000s farmhouse (carpet, floral wallpaper, white kitchen, hall, your back-left room), furniture, yard, garage, truck, barn, lights |
| `js/people.js`, `js/rig.js` | Mom and Dad, and the skeleton and clips their models share |
| `js/vigil.js`, `js/cars.js`, `js/windowface.js` | The vigil night; the car for the dream drive and the drive away; headlights and the face at the window |
| `js/gfx.js`, `js/pbr.js`, `js/props.js`, `js/textures.js`, `js/dust.js` | Post-processing and quality presets, PBR materials, furniture models, canvas textures (wallpaper, the crayon drawing, the grin), dust in the air |
| `js/audio.js` | Synthesized sound, with the recorded files layered on top |
| `js/input.js`, `js/menu.js`, `js/settings.js`, `js/ui.js` | Controller and touch input, the menus, saved options, HUD helpers |
| `js/achievements.js`, `js/rng.js` | Achievements; seeded random numbers |
| `desktop/` | The Electron shell for the desktop build |
| `steam/`, `store/`, `trailer/` | SteamPipe upload config, store page art and copy, the trailer renderer (each has a README) |
| `tools/` | The scripts that made the files in `assets/` |

## Dev shortcuts

Add a hash to the URL to jump ahead:

| Hash | Goes to |
|---|---|
| `#night`, `#night5` | Night one, or any night from 1 to 10 |
| `#breakfast` | The first morning |
| `#morning` | The drive away after the best ending |
| `#seed=ABCD-1234&night=5` | That run's seed, from that night |
| `#type=vigil` | Forces the kind of night (the names are `TYPES` in `js/director.js`) |
| `#proof=7` | Counts as that much proof found, to reach each ending |

A jump earns no achievements. `#shot` keeps the WebGL drawing buffer so the trailer renderer can capture frames.

## Audio

The files in `assets/` were generated with ElevenLabs and are committed; the game plays them, and the synth covers anything missing.

| What | Where | Made by |
|---|---|---|
| Mom and Dad's lines (text and subtitles in `assets/audio/lines.json`) | `assets/audio/vo/` + `manifest.json` | `tools/gen_voice.py` |
| Music: moving day, night, chase, morning | `assets/music/` + `tracks.json` | `tools/gen_music.py` |
| Night brown-noise bed, jump scares (synth blast, violin screech, slam), the shove, waterphone and music box | `assets/sfx/` + `sfx.json` | `tools/gen_sfx.py` |

To change a line, edit `lines.json` and run `ELEVENLABS_API_KEY=... python3 tools/gen_voice.py --only vo/mom --force` (needs Python 3 and ffmpeg); music and effects work the same way, from the table in their script. The key is read from the environment only, so never put it in a file. The brown noise is made locally with ffmpeg and needs no key.

## Characters

| Who | Model | Animation |
|---|---|---|
| Mom, Dad | [Microsoft Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox) adults (`Female_Adult_01`, `Male_Adult_05`), MIT | Idle clip, head follows you when you're near, mouth moves with their voice |
| The thing | A Rocketbox body (`Male_Adult_06`) in solid black, stretched to about 2.6 m with long arms, with the skull, eyes and smile on its head bone | Run, walk and idle clips, plus code for the lean, head tilt, reaching arms and gaze |

The walk/run/idle clips are Mixamo animations (from the three.js example `Xbot.glb`) retargeted onto the Rocketbox skeleton; `tools/models/` rebuilds them. Without the model files the game falls back to low-poly people and a low-poly thing. Credits and licences: [CREDITS.md](CREDITS.md).

## Graphics

three.js with a post-processing chain: an HDR sky and image-based lighting, ambient occlusion, bloom, and a film grade (grain, vignette, a dark-adapted look at night). Options → Graphics picks Auto, Ultra, High, Medium or Low. Auto starts on High (Medium on phones), lowers the render resolution a little when frames get slow and raises it again when there is headroom, and steps down a preset only if that is not enough.

So it runs on ordinary laptops and phones: the house's static geometry is merged into a few dozen meshes, the props were simplified with `tools/assets/slim_models.mjs`, the grass is split into chunks so only what the camera sees is drawn, shadow maps are not redrawn every frame, ambient occlusion runs at reduced resolution, and every shader is compiled behind the black screen when you press play.

| Part | Source |
|---|---|
| Surfaces: floors, walls, siding, roof, grass, tile | PBR materials from Poly Haven and ambientCG (CC0), packed by `tools/assets/fetch_pbr.py` into `assets/pbr/` |
| Sky and ambient light | Poly Haven HDRIs (CC0), `tools/assets/fetch_sky.py` into `assets/sky/` |
| Furniture, plants, a tree, rocks, grass | Poly Haven models (CC0), compressed by `tools/assets/fetch_models.py` into `assets/props/` |
| Photographs in the frames | Public domain, from Wikimedia Commons, `tools/assets/fetch_photos.py` into `assets/photos/` |
| Kitchen, bathroom, windows, house | Built in code (`js/world.js`) |

If an asset file is missing, the procedural look takes over for that item.
