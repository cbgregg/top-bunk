# Top Bunk — press kit

## Pitch

Top Bunk is a short first-person horror game about being a kid in a house that is wrong. Your family has just moved into a cheap
rented farmhouse, you have the top bunk in the back corner room, and something tall with huge white eyes and a big smile lives at the
end of the hallway. It only comes at night. Over ten nights the house does a little more each time (doors shut, the phone rings, the
TV turns itself on, Mom calls you from a kitchen she is not in) and the thing hunts you through the dark, while you run, shut doors,
hide under the covers or in the closet, and hold your breath until it goes. Every morning you tell your parents. Every morning they
explain it away. How it ends depends on where you are when it comes down the hall on the last night, and on whether anyone else is
awake to see it.

## Fact sheet

| | |
| --- | --- |
| Title | Top Bunk |
| Developer | *[developer name]* (the repository owner; replace before publishing) |
| Website | https://github.com/cbgregg/top-bunk |
| Platforms | Windows, macOS, Linux (Steam); also runs in a web browser from GitHub Pages |
| Release date | TBD |
| Price | TBD |
| Genre | First-person horror, single-player |
| Players | 1 |
| Length | Short: ten nights plus the mornings. Estimate, not a measurement: a night's clock runs to dawn in about six real minutes, so a full run is roughly an hour to ninety minutes, more if it catches you |
| Input | Keyboard and mouse, game controller (with rumble); touch on the web build |
| Languages | English (interface, voice, subtitles) |
| Engine | three.js (WebGL 2) in Electron for the desktop build; no engine licence, no middleware |
| Rating | Not yet rated; horror themes, jump scares, flashing lights, no gore |
| Press contact | *[email]* |

## Features

- **Ten nights in one house.** Night one is a haunting with nothing to see; from night two the house is open, a clock runs toward dawn,
  and the thing is hunting. Night ten is the end.
- **Seeded runs.** A seed decides what each night is about and shuffles the order: the phone, the TV, the mimic, the blackout, the
  missing bear, the paralysis, the drive, the vigil. The same seed replays the same ten nights.
- **Hide and hold your breath.** Under the covers on the top bunk, in the louvered closet, in your parents' closet, behind the shower
  curtain. A breath meter runs down while it stands there and waits.
- **A child's toolkit.** A flashlight, stamina that runs out, doors you can shut, and a house you have to learn in the dark.
- **A house that changes.** Night lights that die, a drawing that is different every time you look, a clock that lies, a photo that
  comes off the wall while you are looking at it.
- **Breakfast every morning.** Voiced, subtitled dialogue with Mom and Dad, who notice what the house leaves behind (the tap left
  running, the breaker flipped, the bear in the middle of the hall) and would still rather believe it was you.
- **More than one ending.** Where you are when it comes on the tenth night, and whether anyone else is awake to see it, decides how it
  goes.
- **Runs on ordinary hardware.** Graphics presets from Low to Ultra; the Auto preset keeps the frame rate up on integrated graphics.
- **Keyboard and mouse or controller**, with the prompts and the title screen following whichever you picked up last.

## Story in one paragraph (spoiler-light)

Moving day: carry your boxes from the truck to the back-corner room. Top bunk is yours, the bottom one is for boxes. The landlord said
the last family left in a hurry. Night one, you get up for the bathroom and something is just standing at the far end of the hall
while the violins scream. Breakfast: nobody believes you. From then on every night is different and worse, and every morning is the
same. On the tenth night it comes down the hall, and whether anyone else sees it depends on where you are.

## Assets

Everything below is produced from the game itself by the scripts in this folder (`store/README.md` has the commands).

| File | What |
| --- | --- |
| `screenshots/01_porch_night.png` … `08_tv_static.png` | Eight 1920×1080 in-game captures, HUD hidden except where the prompt helps |
| `out/header_capsule.png` (460×215, and `_2x` 920×430) | Store header |
| `out/small_capsule.png` (462×174) | Lists and search |
| `out/main_capsule.png` (616×353, and `_2x` 1232×706) | Front-page feature |
| `out/vertical_capsule.png` (748×896) | Front page and sales |
| `out/library_capsule.png` (600×900) | Steam library grid |
| `out/library_header.png` (920×430) | Library "recent games" |
| `out/library_hero.png` (3840×1240) | Library banner |
| `out/library_logo.png` (1280×720, transparent) | Logo over the banner |
| `out/page_background.png` (1438×810) | Blurred page background |
| `out/community_icon.jpg` (184×184) | Community hub |
| `out/client_icon.png` / `.ico` (32×32) | Steam client list |
| `capsules/src/*.png` | The wide and tall source renders the capsules are cut from |

Logo: the game's title is set in Special Elite (the typewriter face the game uses for its title and cards) with Courier Prime for
everything else; both are open fonts (SIL OFL, see `assets/fonts/LICENSE-fonts.md`).

## Credits

Built with three.js. Character models from Microsoft Rocketbox (MIT) with Mixamo animation clips; surface textures, sky and props from
Poly Haven and ambientCG (CC0); the parents' voice lines and the music were generated with ElevenLabs and shipped as fixed audio files
(disclosed on the Steam page as pre-generated AI content; nothing is generated at runtime). Full list and licences: `CREDITS.md` in
the repository.
