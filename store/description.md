# Top Bunk: Steam store copy

Paste-ready Steamworks copy. The "About this game" block is in Steam's BBCode subset (`[h2]`, `[b]`, `[list]`/`[*]`), so it pastes
as-is.

## Short description

Steam limit: 300 characters.

> Your family just moved into a cheap old farmhouse. Something tall lives at the end of the hall, and it only comes out at night. You've got a top bunk, a flashlight and ten nights to make your parents believe you. A short first-person horror game for keyboard and mouse or controller.

## About this game (long description, BBCode)

```
[b]The rent on the old farmhouse was cheap. Now we know why.[/b]

You're the kid. Your family just moved into a rented farmhouse at the end of a gravel drive, and the landlord let slip that the last family left in a hurry. You get the top bunk in the back corner room, next to the bathroom. Someone left a crayon drawing taped to the hallway wall: a tall black shape with huge white eyes and a big smile. Under it, in red, it says HE WATCHES.

At 2:47 that first night, the house wakes up.

[h2]Ten nights[/h2]
Top Bunk is a short first-person horror game set over ten nights in one house. On night one, doors shut by themselves, the photo in the hall comes off the wall, every cabinet in the kitchen bangs at once, and something walks around your bunk while you hold your breath under the covers. From night two the whole house is open, a clock runs toward dawn, and the thing in the hallway hunts you.

Each run has a seed, and the seed picks what each night is about. The phone rings in the dining room in the middle of the night. The TV switches itself on with Dad standing in front of it. Mom calls you to the kitchen while she's asleep down the hall. The power cuts out and the breaker's in the utility room. Your bear turns up where you didn't leave it. There's a night you can't move, a drive in the family car you have to wake up from, and a long night sitting up with grandpa by candlelight. Make it to dawn and you get breakfast. Get caught and you play the night again.

[h2]Hide. Hold your breath.[/h2]
It's bigger and faster than you, and you can't fight it. Break its line of sight and hide: under the covers on the top bunk, in the louvered closet, in your parents' closet, behind the shower curtain. When it's close enough to hear you, hold your breath. The meter drains while it stands there with its head tilted, waiting. Let go too early and it has you. Hold on too long and you gasp, and it has you anyway.

You've got a flashlight and doors you can shut behind you. Sprinting wears you out fast, so learn the house.

[h2]The house[/h2]
A single-storey farmhouse from the early 2000s, with brown carpet, a white kitchen, a narrow hall of family photos, a box TV and a phone on the dining-room wall. The breaker panel is out in the utility room, and the moving truck is still parked on the gravel.

[h2]Nobody believes you[/h2]
You tell them at breakfast and they explain it away. The tap was left running. The breaker tripped. You must have dropped the bear in the hall. Most nights the house leaves something behind, and if you find it, you've got something to show them. Show them enough and they start to listen.

There are three endings. Which one you get depends on how much proof you've found by the tenth night, when it finally comes down the hall.

[h2]Features[/h2]
[list]
[*] A short horror story over ten nights in one house
[*] Seeded runs: the same seed replays the same ten nights, and a new seed shuffles them
[*] Hiding spots, a breath meter, a flashlight, stamina and doors that shut
[*] Proof to find: what you turn up changes breakfast and decides which of three endings you get
[*] The house gets worse each night: night lights die, the drawing in the hall changes, the clock lies
[*] Every line is subtitled. Mom and Dad are voiced on moving day and for most of the first two mornings; after that their lines are subtitles over a murmur
[*] Keyboard and mouse, or a game controller with rumble
[*] Graphics presets from Low to Ultra, plus an Auto mode that lowers the resolution, then the preset, when the frame rate drops
[*] Steam Achievements
[/list]

[b]Headphones recommended. Contains jump scares, loud sudden sounds and flashing lights.[/b]
```

## System requirements

These are estimates. The game hasn't been timed on any of the hardware named below, so don't quote a frame rate anywhere on the page.

The desktop build is the web game inside Electron 45 (Chromium), so it needs what Chromium needs to run WebGL 2. The OS lines are
Electron 45's floor: Windows 10, macOS 13 Ventura (the app's Info.plist asks for 13.0), and Linux distributions that are still
maintained. The macOS app is one universal bundle with Intel and Apple silicon code side by side, so Apple silicon Macs run it
without Rosetta. CI checks that both slices are in the bundle and starts the bundled Electron on its Apple silicon runner (natively,
and under Rosetta when the runner has it), but nobody has played the game on a Mac of either kind yet. The CPU and GPU lines are
guesses from the presets: Low turns off ambient occlusion, bloom, colour grading and anti-aliasing and uses smaller shadow maps,
and High and Ultra turn them all on. The storage lines are the unpacked build plus room to spare (the Linux build is about 320 MB, the
universal macOS app about 530 MB). Steamworks has one block per OS; the lines are the same except where noted.

### Minimum

| | |
| --- | --- |
| OS | Windows 10 64-bit · macOS 13 (Ventura), Intel or Apple silicon · Ubuntu 22.04 or SteamOS 3 |
| Processor | Dual-core 2.0 GHz (Intel Core i3 / AMD equivalent); on macOS, any Mac that runs macOS 13 |
| Memory | 4 GB RAM |
| Graphics | A GPU with WebGL 2 support (DirectX 11 / OpenGL ES 3.0 class), such as Intel HD Graphics 620 or newer |
| Storage | 400 MB available space (macOS: 600 MB) |
| Sound | Stereo output; headphones recommended |
| Additional | 64-bit only. Estimated, not measured. The Low and Medium presets are meant for integrated graphics. |

### Recommended

| | |
| --- | --- |
| OS | Windows 10 or 11 64-bit · macOS 13 or later · Ubuntu 22.04 or SteamOS 3 |
| Processor | Quad-core 3.0 GHz (Intel Core i5 / AMD Ryzen 5); on macOS, Apple M1 or newer |
| Memory | 8 GB RAM |
| Graphics | NVIDIA GTX 1060 / AMD RX 580 class, or Apple M1 or newer |
| Storage | 400 MB available space (macOS: 600 MB) |
| Sound | Headphones |
| Additional | Estimated, not measured. |

## Content warnings (for the description and the Mature Content survey)

- Horror themes throughout: a child alone at night, something hunting them through the house.
- **Jump scares**, with loud sudden sounds (screams, stingers, slams). Headphones are recommended, which makes the loud parts louder.
- **Flashing lights / photosensitivity**: lights flicker and strobe (night lights, the bathroom light, TV static, white screen flashes
  on scares, a distorted colour "nightmare" effect on one night). Put the photosensitivity line on the store page and keep it on the
  title screen. Options → Reduce flashing softens them.
- Implied violence against the player character (it catches you: it lunges, a scream, a white flash and a cut to black; no injury is
  shown).
- One ending has it take the parents, on screen but abstract: it takes hold of each of them and pulls them down out of sight, with
  cracking and chewing sounds, then a red flash. No blood, wounds or bodies are shown. Nothing else in the game shows blood or injury.
- Mild language in the finale dialogue ("Jesus Christ"). No sexual content, no drugs, no gambling, no in-game purchases, no online
  interaction.

Mature Content survey (Steamworks → Store Page → Mature Content): tick *Frequent Violence or Gore*? No. Tick *General Mature
Content*: yes, describe as "Horror themes, jump scares, frightening imagery, flashing lights, implied violence; no gore." Steam then
shows the description above the store page for users with the horror filter on.

## AI-generated content disclosure

Steamworks asks about AI-generated content in the app's content survey (App Admin → Edit Store Page → Basic Info, the "AI Generated
Content" questions; the answer is shown on the store page). Answer truthfully from `CREDITS.md`:

- **Pre-generated content: yes.** The voice lines for Mom and Dad, the music tracks and the sound effects in `assets/sfx/` (the
  jump-scare stingers, the violins, the whispers and drones, the slams, thumps and scratches, the car going by, the waterphone and
  the music box; all but the brown-noise bed, which ffmpeg makes) were generated with ElevenLabs (`tools/gen_voice.py`,
  `tools/gen_music.py`, `tools/gen_sfx.py`) and are shipped as fixed audio files; the subtitles were written by hand. The trailers
  use the same files.
- **Live-generated content: no.** Nothing is generated while the game runs; there is no network use at all.
- Everything else (the 3D models, textures, sky, photographs, fonts, code) is listed in `CREDITS.md` with its licence and is not AI-generated.

Suggested disclosure text for the survey: "The parents' voice lines, the music and most of the sound effects were generated with
ElevenLabs and are shipped as fixed audio files. No content is generated at runtime."

## Supported input

| Input | Support | Notes |
| --- | --- | --- |
| Keyboard and mouse | Full | WASD / arrows, mouse look, E, Shift, Space, F, Esc |
| Game controller | **Partial** (Xbox layout) | Left stick / d-pad move, right stick look, A or X interact (A also confirms on menus), RT / RB / L3 / B sprint, LT / LB / A hold your breath, Y flashlight, Start pause; rumble on scares. Read through the browser Gamepad API, so no Steam Input action set is needed; PlayStation pads should work when Steam presents them as XInput, but none has been tried. The menus take the d-pad or left stick, A to confirm and B to go back, but not every screen has been played through on a pad yet. |
| Touch | Web build only | Not relevant to the Steam build |
| Steam Cloud | Once Auto-Cloud is configured | One saved run plus settings and achievements. The desktop build keeps them as small JSON files in a `saves` folder; `STEAM.md` has the folder for each OS and the Auto-Cloud root paths to enter under Steamworks → Application → Steam Cloud. |
| Steam Deck | Untested | Expect *Playable* at best until the Linux build has been tried on a Deck |

Store Page → Basic Info → Supported Features: tick *Single-player* and *Partial Controller Support*. Switch to *Full Controller
Support* only after every screen has been used on a pad from start to finish: title, new game (the seed entry), options, controls,
credits, achievements, pause, death and the three endings. Tick *Steam Cloud* once Auto-Cloud is set up and a run has carried over
from one machine to another. The achievements are in the build (`steam/achievements.json`); tick *Steam Achievements* once their
icons exist.

## Languages

| Language | Interface | Full audio | Subtitles |
| --- | --- | --- | --- |
| English | yes | no | yes |

English only. Every line is subtitled, but only some are voiced. The game has 83 scripted lines (78 in `assets/audio/lines.json` and
five in the proof scene at breakfast, written into `js/main.js`), and 16 of them have a recording: everything Mom and Dad say on
moving day and on the first morning, and most of the second morning. The other 67 aren't recorded. Mom's, Dad's and grandpa's lines
from `lines.json` play as a wordless murmur under the subtitle; the kid's lines and the proof scene are text only. (The four other
recordings in `assets/audio/vo/`, Mom and Dad through the wall, are only used by the trailer.)

Leave *Full audio* unticked. It would take a recording of every line Mom, Dad and grandpa have, the proof scene included.

## Tags

Steam shows the first tags you apply most prominently; order them like this.

1. Horror
2. First-Person
3. Psychological Horror
4. Survival Horror
5. Singleplayer
6. Atmospheric
7. Indie
8. Short

Optional, if there is room and they are true at launch: Stealth, Dark, 3D, Story Rich, Controller, Linear (do not add *Procedural
Generation*: the nights are seeded and shuffled, not generated).

Genre (Basic Info): Indie, Adventure. Steam does not have a Horror genre; the Horror tag carries it.

## Age-rating notes

The game has no rating yet, so neither the store page nor the press kit names one, not even as a guess. Steamworks makes you fill in
its content survey before the store page and build go to review; an official board rating, once you have one, goes in the game's
Ratings section. Germany needs one: since November 2024 Steam hides games there that have no German age rating, so read the Germany
page of Valve's content survey docs before launch (Valve won't take a USK rating that came through IARC on another store). Answer
the survey from the content list above:

- Violence: horror and fear themes; the player character is caught by a monster (implied, cut to black); in one ending the monster
  takes the parents, pulled down out of sight with cracking and chewing sounds and a red flash, without blood, wounds or bodies.
- Scary content: frequent and intense for the genre (jump scares, a creature with glowing eyes that hunts a child).
- Language: mild, infrequent (one or two exclamations).
- Sex and nudity, drugs, alcohol, gambling, user-generated content, in-game purchases, user interaction, location sharing: none.

Mark at least four screenshots as suitable for all ages: 02 (your room) and 06 (breakfast) have no creature in frame, and 03 (the
hall) shows it only as the kid's crayon drawing. The fourth is 07: Dad, seen side-on, standing at the TV, with a tall dark shape in
the static on the screen. 01, 04 and 05 show the thing and can stay mature-only if the review asks.

## Before the page goes live

- Make the 64×64 achieved and unachieved achievement icons, then tick *Steam Achievements* in Supported Features.
- Try the system requirements on real hardware, and raise the minimum GPU if the Low preset can't hold 30 fps on it. Try the macOS
  build on both an Intel Mac and an Apple silicon one.
- Play every screen on a controller before switching to *Full Controller Support*.
- Set up Auto-Cloud and check a run carries over between two machines before ticking *Steam Cloud*.
