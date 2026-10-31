# Top Bunk: press kit

## Pitch

Top Bunk is a short first-person horror game about a kid in a house that's wrong. Your family just moved into a cheap rented
farmhouse, you've got the top bunk in the back corner room, and something tall with huge white eyes and a big smile lives at the end
of the hallway. It only comes out at night. Over ten nights the doors start shutting on their own, the phone rings, the TV switches
itself on, and Mom calls you from the kitchen while she's asleep in bed. The thing hunts you through the dark, and you run, shut
doors, hide under the covers or in a closet, and hold your breath until it leaves. At breakfast your parents explain it all away
unless you've found something they can't. How it ends on the last night depends on how much proof you've shown them.

## Fact sheet

| | |
| --- | --- |
| Title | Top Bunk |
| Developer | *[developer name]* |
| Website | https://github.com/cbgregg/top-bunk |
| Platforms | Windows, macOS (Intel and Apple silicon), Linux (Steam); also runs in a web browser from GitHub Pages |
| Release date | TBD |
| Price | TBD |
| Genre | First-person horror, single-player |
| Players | 1 |
| Length | Short: ten nights plus the mornings. A night's clock runs to dawn in about six real minutes, so a full run should take an hour to ninety minutes, more if it catches you |
| Input | Keyboard and mouse; game controller with rumble (partial support: not every screen has been checked on a pad); touch on the web build |
| Languages | English: interface and subtitles. Only some lines are voiced: Mom and Dad on moving day and for most of the first two mornings. The rest of their lines, and grandpa's, are subtitles over a murmur, and the kid's are text only |
| Engine | three.js (WebGL 2) in Electron for the desktop build; no engine licence, no middleware |
| Rating | Not yet rated; horror themes, jump scares, flashing lights, no gore |
| Press contact | *[email]* |

## Features

- Ten nights in one house. Night one is a haunting with nothing to see. From night two the house is open, a clock runs toward dawn,
  and the thing is hunting you. Night ten is the end.
- Seeded runs. The seed decides what each night is about and in what order: the phone, the TV, the mimic, the blackout, the missing
  bear, the paralysis, the drive, the vigil. The same seed replays the same ten nights.
- Hiding: under the covers on the top bunk, in the louvered closet, in your parents' closet, behind the shower curtain. A breath meter
  runs down while it stands there and waits.
- A flashlight, stamina that runs out, doors you can shut, and a house you have to learn in the dark.
- The house changes. Night lights die, the drawing in the hall looks different, the clock lies, and a photo comes off the wall while
  you are looking at it.
- Breakfast after each night you survive, all of it subtitled. Mom and Dad notice what the house leaves behind (the tap left running,
  the breaker flipped, the bear in the middle of the hall) and would still rather believe it was you.
- Proof. Most nights the house leaves something behind, and what you find changes breakfast. How much you have by the tenth night
  decides which of three endings you get.
- Graphics presets from Low to Ultra. Auto lowers the resolution, then the preset, when the frame rate drops.
- Keyboard and mouse or a controller, and the on-screen prompts follow whichever you used last. Controller support is partial for
  now: not every screen has been played through on a pad.
- Steam Achievements.

## Story in one paragraph (spoiler-light)

Moving day: carry your boxes from the truck to the back-corner room. The top bunk is yours, the bottom one is for boxes. The landlord
said the last family left in a hurry. On night one the house wakes up around you: doors shut by themselves, something scratches in
the closet, the photo in the hall comes off the wall, and you never see what's doing it. Nobody believes you at breakfast. After that
the thing in the hall starts hunting you, and your parents keep finding reasons not to listen. On the tenth night it comes down the
hall, and whether anyone believes you depends on what you found.

## Assets

Everything below is produced from the game itself by the scripts in this folder (`store/README.md` has the commands).

| File | What |
| --- | --- |
| `screenshots/01_porch_night.png` … `07_tv_static.png` | Seven 1920×1080 in-game captures, HUD hidden except where the prompt helps |
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
everything else. Special Elite is under the Apache License 2.0 and Courier Prime under the SIL Open Font License 1.1 (see
`assets/fonts/LICENSE-fonts.md`).

## Credits

Built with three.js. Character models from Microsoft Rocketbox (MIT) with Mixamo animation clips; surface textures, sky and props from
Poly Haven and ambientCG (CC0); the parents' voice lines, the music and most of the sound effects were generated with ElevenLabs and
ship as fixed audio files (disclosed on the Steam page as pre-generated AI content; nothing is generated at runtime). Full list and
licences: `CREDITS.md` in the repository.
